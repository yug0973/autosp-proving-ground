/**
 * A small, honest simulation of the vulnerable lookup in the hero (DESIGN.md §6.1). Everything
 * runs in the browser on five sample rows; nothing touches a network or a real database.
 *
 * It does what the vulnerable code does: it concatenates the visitor's input into
 *   SELECT * FROM invoices WHERE id = '<input>'
 * and then evaluates that WHERE clause the way SQLite would (the fix in §6.2 uses SQLite's `?`
 * placeholder). So any tautology leaks every row, not just the example payload; a stray quote
 * fails with SQLite's own kind of error; and a second statement is refused, as Python's sqlite3
 * module refuses it.
 *
 * Supported SQL in the clause: string and integer literals, the columns id, customer and amount,
 * TRUE and FALSE, = == != <> < > <= >=, AND, OR, NOT, parentheses, and `--` comments.
 */

export interface Invoice {
  readonly id: string;
  readonly customer: string;
  readonly amount: string;
}

/** Sample data. Fictional customers; the demo labels itself "Simulated query on sample data." */
export const SAMPLE_INVOICES: readonly Invoice[] = [
  { id: '1039', customer: 'Larkspur Dental', amount: '$1,240.00' },
  { id: '1040', customer: 'Ostrow Freight', amount: '$8,915.50' },
  { id: '1041', customer: 'Vale & Co', amount: '$312.75' },
  { id: '1042', customer: 'Tamsin Labs', amount: '$4,060.00' },
  { id: '1043', customer: 'Ridgeway Cafe', amount: '$96.20' },
];

const COLUMNS = ['id', 'customer', 'amount'] as const;
type Column = (typeof COLUMNS)[number];

export type LookupState =
  | 'found' /* the input was a plain ID and matched one row */
  | 'empty' /* the query ran and returned no rows */
  | 'leak' /* the input broke out of the string and the query returned rows */
  | 'error' /* the database rejected the query */
  | 'no-input';

export interface LookupResult {
  readonly query: string;
  readonly state: LookupState;
  readonly rows: readonly Invoice[];
  /** True when the input contained a quote, so it reached the SQL as code, not as data. */
  readonly injected: boolean;
  /** The database's error message, for the `error` state. */
  readonly error?: string;
}

export const MAX_INPUT_LENGTH = 120;

/** The exact string the vulnerable line builds. */
export function buildQuery(input: string): string {
  return `SELECT * FROM invoices WHERE id = '${input}'`;
}

/* ---------- tokenizer ---------- */

type Token =
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'word'; value: string }
  | { kind: 'op'; value: string }
  | { kind: 'paren'; value: '(' | ')' }
  | { kind: 'end' };

class SqlError extends Error {}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source.charAt(i);
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (source.startsWith('--', i)) break; // the rest of the line is a comment
    if (ch === ';') {
      if (
        source
          .slice(i + 1)
          .replace(/--.*$/s, '')
          .trim() !== ''
      ) {
        throw new SqlError('You can only execute one statement at a time.');
      }
      break;
    }
    if (ch === "'") {
      let value = '';
      let j = i + 1;
      for (;;) {
        if (j >= source.length) throw new SqlError(`unrecognized token: "${source.slice(i)}"`);
        if (source.charAt(j) === "'") {
          if (source.charAt(j + 1) === "'") {
            value += "'";
            j += 2;
            continue;
          }
          break;
        }
        value += source.charAt(j);
        j += 1;
      }
      tokens.push({ kind: 'string', value });
      i = j + 1;
      continue;
    }
    const number = /^\d+/.exec(source.slice(i));
    if (number) {
      tokens.push({ kind: 'number', value: Number(number[0]) });
      i += number[0].length;
      continue;
    }
    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i));
    if (word) {
      tokens.push({ kind: 'word', value: word[0] });
      i += word[0].length;
      continue;
    }
    const op = /^(<=|>=|<>|!=|==|=|<|>)/.exec(source.slice(i));
    if (op) {
      tokens.push({ kind: 'op', value: op[0] });
      i += op[0].length;
      continue;
    }
    if (ch === '(' || ch === ')') {
      tokens.push({ kind: 'paren', value: ch });
      i += 1;
      continue;
    }
    throw new SqlError(`unrecognized token: "${ch}"`);
  }
  tokens.push({ kind: 'end' });
  return tokens;
}

/* ---------- parser and evaluator ---------- */

type Value = string | number;
type Expr = (row: Invoice) => Value;

function describe(token: Token): string {
  if (token.kind === 'end') return 'end of input';
  if (token.kind === 'string') return `'${token.value}'`;
  return String(token.value);
}

/** SQLite's truthiness: numbers are true when non-zero; text is converted to a number first. */
function truthy(value: Value): boolean {
  if (typeof value === 'number') return value !== 0;
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) && numeric !== 0;
}

function compare(op: string, left: Value, right: Value): number {
  // a text column compared with a number takes text affinity, so compare as text then
  const bothNumbers = typeof left === 'number' && typeof right === 'number';
  const a = bothNumbers ? left : String(left);
  const b = bothNumbers ? right : String(right);
  switch (op) {
    case '=':
    case '==':
      return a === b ? 1 : 0;
    case '!=':
    case '<>':
      return a !== b ? 1 : 0;
    case '<':
      return a < b ? 1 : 0;
    case '>':
      return a > b ? 1 : 0;
    case '<=':
      return a <= b ? 1 : 0;
    case '>=':
      return a >= b ? 1 : 0;
    default:
      throw new SqlError(`near "${op}": syntax error`);
  }
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  private peek(): Token {
    return this.tokens[this.index] ?? { kind: 'end' };
  }

  private next(): Token {
    const token = this.peek();
    this.index += 1;
    return token;
  }

  private isWord(word: string): boolean {
    const token = this.peek();
    return token.kind === 'word' && token.value.toUpperCase() === word;
  }

  parse(): Expr {
    const expr = this.or();
    const rest = this.peek();
    if (rest.kind !== 'end') throw new SqlError(`near "${describe(rest)}": syntax error`);
    return expr;
  }

  private or(): Expr {
    let left = this.and();
    while (this.isWord('OR')) {
      this.next();
      const a = left;
      const b = this.and();
      left = (row) => (truthy(a(row)) || truthy(b(row)) ? 1 : 0);
    }
    return left;
  }

  private and(): Expr {
    let left = this.not();
    while (this.isWord('AND')) {
      this.next();
      const a = left;
      const b = this.not();
      left = (row) => (truthy(a(row)) && truthy(b(row)) ? 1 : 0);
    }
    return left;
  }

  private not(): Expr {
    if (this.isWord('NOT')) {
      this.next();
      const inner = this.not();
      return (row) => (truthy(inner(row)) ? 0 : 1);
    }
    return this.comparison();
  }

  private comparison(): Expr {
    const left = this.primary();
    const token = this.peek();
    if (token.kind !== 'op') return left;
    this.next();
    const right = this.primary();
    return (row) => compare(token.value, left(row), right(row));
  }

  private primary(): Expr {
    const token = this.next();
    switch (token.kind) {
      case 'string': {
        const value = token.value;
        return () => value;
      }
      case 'number': {
        const value = token.value;
        return () => value;
      }
      case 'paren': {
        if (token.value === ')') throw new SqlError('near ")": syntax error');
        const inner = this.or();
        const close = this.next();
        if (close.kind !== 'paren' || close.value !== ')') {
          throw new SqlError(`near "${describe(close)}": syntax error`);
        }
        return inner;
      }
      case 'word': {
        const upper = token.value.toUpperCase();
        if (upper === 'TRUE') return () => 1;
        if (upper === 'FALSE') return () => 0;
        const column = token.value.toLowerCase();
        if ((COLUMNS as readonly string[]).includes(column)) return (row) => row[column as Column];
        throw new SqlError(`no such column: ${token.value}`);
      }
      default:
        throw new SqlError(`near "${describe(token)}": syntax error`);
    }
  }
}

/* ---------- the lookup ---------- */

/** Runs the vulnerable lookup for `input` on the sample rows. */
export function runLookup(rawInput: string): LookupResult {
  const input = rawInput.slice(0, MAX_INPUT_LENGTH);
  const query = buildQuery(input);
  const injected = input.includes("'");
  if (input.trim() === '') return { query, state: 'no-input', rows: [], injected: false };
  try {
    const where = new Parser(tokenize(query.slice(query.indexOf(' WHERE ') + ' WHERE '.length))).parse();
    const rows = SAMPLE_INVOICES.filter((row) => truthy(where(row)));
    let state: LookupState;
    if (rows.length === 0) state = 'empty';
    else if (injected) state = 'leak';
    else state = 'found';
    return { query, state, rows, injected };
  } catch (error) {
    if (error instanceof SqlError) return { query, state: 'error', rows: [], injected, error: error.message };
    throw error;
  }
}
