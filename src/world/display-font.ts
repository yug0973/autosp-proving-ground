/**
 * The pixel font for facade displays: five rows tall, three pixels wide for most letters (M and W
 * five, N four), drawn one window to a pixel. `renderText` turns a short string into a bitmap, in a
 * row or stacked, one letter above the next, for a tall, narrow tower. Windows cannot carry a
 * sentence, so a display holds a word or a number, and `sanitiseLabel` keeps typed text to what the
 * font can draw.
 */

/** A bitmap for a facade display: `data` holds one byte a pixel, 1 lit and 0 dark, row by row from
 * the top. */
export interface DisplayBitmap {
  readonly cols: number;
  readonly rows: number;
  readonly data: Uint8Array;
}

export type TextLayout = 'row' | 'stack';

export interface TextOptions {
  /** A row reads left to right; a stack puts one letter above the next. */
  readonly layout?: TextLayout;
  /** Whole-number enlargement: 2 draws every font pixel as a 2 by 2 block. */
  readonly scale?: number;
  /** Dark pixels between letters, before scaling. */
  readonly gap?: number;
}

export const FONT_HEIGHT = 5;

/** `#` is a lit pixel and `.` a dark one. */
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '#.#', '.##'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '.##', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
  ' ': ['..', '..', '..', '..', '..'],
  '.': ['.', '.', '.', '.', '#'],
  ',': ['..', '..', '..', '.#', '#.'],
  '-': ['...', '...', '###', '...', '...'],
  "'": ['#', '#', '.', '.', '.'],
  '!': ['#', '#', '#', '.', '#'],
  '?': ['##.', '..#', '.#.', '...', '.#.'],
  '&': ['.#.', '#.#', '.#.', '#.#', '.##'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  ':': ['.', '#', '.', '#', '.'],
  '+': ['...', '.#.', '###', '.#.', '...'],
  '#': ['#.#', '###', '#.#', '###', '#.#'],
  '(': ['.#', '#.', '#.', '#.', '.#'],
  ')': ['#.', '.#', '.#', '.#', '#.'],
};

/** What the font can draw: letters, digits, a space and basic punctuation. */
const ALLOWED = new Set(Object.keys(GLYPHS));

/** A large numeral: `value` at twice the size, kept to the right of the room its `final` value takes
 * so the figures do not shift as it counts, with `/total` under it at full size. A one-pixel dark
 * margin all round keeps the digits clear of a lit wall. */
export function renderCount(value: number, final: number, total: number | null): DisplayBitmap {
  const big = renderText(String(value), { scale: 2 });
  const room = renderText(String(final), { scale: 2 }).cols;
  const small = total === null ? null : renderText(`/${String(total)}`);
  const margin = 1;
  const cols = Math.max(room, small?.cols ?? 0) + margin * 2;
  const rows = big.rows + (small ? small.rows + 1 : 0) + margin * 2;
  const data = new Uint8Array(cols * rows);
  const blit = (bitmap: DisplayBitmap, left: number, top: number): void => {
    for (let y = 0; y < bitmap.rows; y += 1) {
      for (let x = 0; x < bitmap.cols; x += 1) {
        if (bitmap.data[y * bitmap.cols + x]) data[(top + y) * cols + left + x] = 1;
      }
    }
  };
  blit(big, margin + room - big.cols, margin);
  if (small) blit(small, margin, margin + big.rows + 1);
  return { cols, rows, data };
}

/** Breaks `text` into at most `lines` lines: at spaces only, or also through words when `split`. */
function wrap(text: string, lines: number, split: boolean): string[] {
  const longest = Math.max(...text.split(' ').map((word) => word.length));
  for (let limit = Math.max(Math.ceil(text.length / lines), split ? 1 : longest); ; limit += 1) {
    const out: string[] = [];
    let line = '';
    for (const word of text.split(' ')) {
      let rest = word;
      if (line && line.length + 1 + rest.length <= limit) {
        line += ` ${rest}`;
        continue;
      }
      if (line) out.push(line);
      while (rest.length > limit) {
        out.push(rest.slice(0, limit));
        rest = rest.slice(limit);
      }
      line = rest;
    }
    if (line) out.push(line);
    if (out.length <= lines) return out;
  }
}

/** The largest pixel at which a sign must still be readable before a word is broken to make it bigger. */
const SIGN_READABLE = 0.45;

/**
 * A sign: `text` on one or more centred lines, in a space `width` by `height` (world units), with a
 * one-pixel dark margin. It breaks at spaces, wherever gives the biggest pixel; it breaks through a
 * word only when that would otherwise leave the pixel too small to read. Also returns that pixel's size.
 */
export function renderSign(
  text: string,
  width: number,
  height: number,
  maxLines = 4,
): { bitmap: DisplayBitmap; pitch: number } {
  const bestOf = (split: boolean): { bitmap: DisplayBitmap; pitch: number } => {
    let best: { bitmap: DisplayBitmap; pitch: number } | null = null;
    for (let lines = 1; lines <= maxLines; lines += 1) {
      const rows = wrap(text, lines, split).map((line) => renderText(line));
      const cols = Math.max(...rows.map((row) => row.cols)) + 2;
      const tall = rows.length * FONT_HEIGHT + (rows.length - 1) + 2;
      const data = new Uint8Array(cols * tall);
      rows.forEach((row, n) => {
        const left = Math.floor((cols - row.cols) / 2);
        const top = 1 + n * (FONT_HEIGHT + 1);
        for (let y = 0; y < row.rows; y += 1) {
          for (let x = 0; x < row.cols; x += 1) {
            if (row.data[y * row.cols + x]) data[(top + y) * cols + left + x] = 1;
          }
        }
      });
      const pitch = Math.min(width / cols, height / tall);
      if (!best || pitch > best.pitch + 1e-6) best = { bitmap: { cols, rows: tall, data }, pitch };
    }
    return best ?? { bitmap: renderText(text), pitch: 0 };
  };
  const whole = bestOf(false);
  return whole.pitch >= SIGN_READABLE ? whole : bestOf(true);
}

/**
 * Typed text, made fit for the font: accents dropped (é is E), upper case, anything the font cannot
 * draw removed, runs of spaces collapsed to one, no space at the start, and at most `max`
 * characters. Pure: nothing is stored or sent.
 */
export function sanitiseLabel(raw: string, max: number): string {
  const plain = raw.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
  const kept = Array.from(plain)
    .filter((char) => ALLOWED.has(char))
    .join('')
    .replace(/ {2,}/g, ' ')
    .replace(/^ /, '');
  return kept.slice(0, Math.max(max, 0));
}

function glyph(char: string): readonly string[] {
  return GLYPHS[char] ?? GLYPHS['?'] ?? [];
}

function widthOf(rows: readonly string[]): number {
  return rows[0]?.length ?? 0;
}

/** Draws `text` as a bitmap. An empty string gives an empty (0 by 0) bitmap. */
export function renderText(text: string, options: TextOptions = {}): DisplayBitmap {
  const { layout = 'row', gap = 1 } = options;
  const scale = Math.max(1, Math.floor(options.scale ?? 1));
  const glyphs = Array.from(text).map(glyph);
  if (glyphs.length === 0) return { cols: 0, rows: 0, data: new Uint8Array(0) };

  const widest = Math.max(...glyphs.map(widthOf));
  const cols =
    (layout === 'row' ? glyphs.reduce((sum, g) => sum + widthOf(g), 0) + gap * (glyphs.length - 1) : widest) *
    scale;
  const rows =
    (layout === 'row' ? FONT_HEIGHT : glyphs.length * FONT_HEIGHT + gap * (glyphs.length - 1)) * scale;
  const data = new Uint8Array(cols * rows);

  let cursor = 0;
  glyphs.forEach((g, n) => {
    const width = widthOf(g);
    // a stack centres each letter over the others; the extra pixel of an even difference goes right
    const left = layout === 'row' ? cursor : Math.floor((widest - width) / 2);
    const top = layout === 'row' ? 0 : n * (FONT_HEIGHT + gap);
    g.forEach((line, y) => {
      for (let x = 0; x < width; x += 1) {
        if (line[x] !== '#') continue;
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            data[((top + y) * scale + dy) * cols + (left + x) * scale + dx] = 1;
          }
        }
      }
    });
    cursor += width + gap;
  });
  return { cols, rows, data };
}
