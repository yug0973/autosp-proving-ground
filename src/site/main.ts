/**
 * AUTOSP product page: the exploit demo, the five steps, the three checks, hold to merge, the
 * SHA-256 evidence log and the pilot form. Plain DOM, no framework, no network except the form.
 */
import './site.css';
import { runLookup, SAMPLE_INVOICES, MAX_INPUT_LENGTH, type Invoice } from '../lib/sql-sim';
import { hashChain } from '../lib/sha256';
import { initRsvp } from '../exhibit/rsvp';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- callers pick the element type
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T | null =>
  root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T[] =>
  Array.from(root.querySelectorAll<T>(sel));
const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, reduced ? 0 : ms));

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/* ---------- nav ---------- */
function initNav(): void {
  const nav = $('[data-nav]');
  if (!nav) return;
  const update = (): void => {
    nav.toggleAttribute('data-scrolled', window.scrollY > 8);
  };
  update();
  window.addEventListener('scroll', update, { passive: true });
}

/* ---------- hero exploit demo ---------- */
const CODE = {
  vulnerable: `<span class="k">def</span> <span class="f">find_invoice</span>(cur, invoice_id):
    cur.execute(
        <span class="s">"SELECT * FROM invoices WHERE id = '"</span>
<mark class="hl-open">        + invoice_id + <span class="s">"'"</span></mark>
    )
    <span class="k">return</span> cur.fetchone()`,
  fixed: `<span class="k">def</span> <span class="f">find_invoice</span>(cur, invoice_id):
    cur.execute(
        <span class="s">"SELECT * FROM invoices WHERE id = %s"</span>,
<span class="add" style="display:inline">        (invoice_id,)</span>
    )
    <span class="k">return</span> cur.fetchone()`,
};

type Mode = 'vulnerable' | 'fixed';

function initDemo(): void {
  const root = $('[data-demo]');
  if (!root) return;
  const code = $('[data-demo-code]', root);
  const form = $<HTMLFormElement>('[data-probe]', root);
  const input = $<HTMLInputElement>('.probe__input', root);
  const result = $('[data-result]', root);
  const win = $('.window', root);
  if (!code || !form || !input || !result || !win) return;
  input.maxLength = MAX_INPUT_LENGTH;
  let mode: Mode = 'vulnerable';

  const table = (rows: readonly Invoice[]): HTMLTableElement => {
    const t = el('table');
    const head = t.createTHead().insertRow();
    for (const h of ['id', 'customer', 'amount']) head.append(el('th', '', h));
    const body = t.createTBody();
    for (const r of rows) {
      const tr = body.insertRow();
      for (const v of [r.id, r.customer, r.amount]) tr.insertCell().textContent = v;
    }
    return t;
  };

  const show = (pill: string, pillClass: string, message: string, query: string, rows: readonly Invoice[]): void => {
    result.replaceChildren();
    const head = el('div', 'result__head');
    head.append(el('span', `pill ${pillClass}`, pill), el('span', '', message));
    result.append(head, el('p', 'result__query', query));
    if (rows.length) result.append(table(rows));
  };

  const run = (shake: boolean): void => {
    const value = input.value;
    if (mode === 'vulnerable') {
      const r = runLookup(value);
      result.dataset.state = r.state;
      switch (r.state) {
        case 'leak':
          show(
            `Leaked ${String(r.rows.length)} rows`,
            'pill--open',
            'The input rewrote the query.',
            r.query,
            r.rows,
          );
          if (shake && !reduced) {
            win.removeAttribute('data-shake');
            win.getBoundingClientRect(); // a reflow restarts the animation
            win.setAttribute('data-shake', '');
          }
          break;
        case 'found':
          show('1 row', 'pill--pass', 'A normal lookup.', r.query, r.rows);
          break;
        case 'empty':
          show('0 rows', 'pill--hold', 'No invoice with that id.', r.query, []);
          break;
        case 'error':
          show('Database error', 'pill--hold', r.error ?? 'The query was rejected.', r.query, []);
          break;
        default:
          show('Waiting', 'pill--hold', 'Type an invoice id.', r.query, []);
      }
    } else {
      // parameterised: the input is bound as a value, never parsed as SQL
      const trimmed = value.trim();
      const rows = SAMPLE_INVOICES.filter((row) => row.id === value);
      const query = `SELECT * FROM invoices WHERE id = %s   -- bound value: ${JSON.stringify(value)}`;
      if (!trimmed) {
        result.dataset.state = 'no-input';
        show('Waiting', 'pill--hold', 'Type an invoice id.', query, []);
      } else if (rows.length) {
        result.dataset.state = 'found';
        show('1 row', 'pill--pass', 'A normal lookup still works.', query, rows);
      } else {
        result.dataset.state = 'safe';
        show(
          /['"]/.test(value) ? 'Blocked' : '0 rows',
          'pill--pass',
          /['"]/.test(value)
            ? 'The input was treated as data, not SQL. Nothing leaked.'
            : 'No invoice with that id.',
          query,
          [],
        );
      }
    }
  };

  const setMode = (next: Mode): void => {
    mode = next;
    code.innerHTML = CODE[next];
    for (const b of $$<HTMLButtonElement>('[data-mode]', root))
      b.setAttribute('aria-pressed', String(b.dataset.mode === next));
    run(false);
  };

  for (const b of $$<HTMLButtonElement>('[data-mode]', root))
    b.addEventListener('click', () => { setMode(b.dataset.mode as Mode); });
  for (const b of $$<HTMLButtonElement>('[data-preset]', root))
    b.addEventListener('click', () => {
      input.value = b.dataset.preset ?? '';
      run(true);
    });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    run(true);
  });
  setMode('vulnerable');
}

/* ---------- the five steps (tabs) ---------- */
function initSteps(): void {
  const root = $('[data-steps]');
  if (!root) return;
  const tabs = $$<HTMLButtonElement>('[role="tab"]', root);
  const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls') ?? ''));
  const prev = $<HTMLButtonElement>('[data-prev]', root);
  const next = $<HTMLButtonElement>('[data-next]', root);
  let current = 0;

  const playRun = (panel: HTMLElement): void => {
    const lines = $$('[data-run] > span', panel);
    lines.forEach((line, i) => {
      line.classList.remove('line-in');
      line.getBoundingClientRect(); // a reflow restarts the animation
      line.style.animationDelay = `${String(i * 280)}ms`;
      line.classList.add('line-in');
    });
  };

  const select = (i: number, focus: boolean): void => {
    current = (i + tabs.length) % tabs.length;
    tabs.forEach((tab, j) => {
      const on = j === current;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      const panel = panels[j];
      if (panel) panel.hidden = !on;
    });
    const tab = tabs[current];
    if (focus) tab?.focus();
    tab?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    if (prev) prev.disabled = current === 0;
    if (next) next.disabled = current === tabs.length - 1;
    const panel = panels[current];
    if (panel && current === 1) playRun(panel);
  };

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => { select(i, false); });
    tab.addEventListener('keydown', (e) => {
      const keys: Record<string, number> = {
        ArrowDown: current + 1,
        ArrowRight: current + 1,
        ArrowUp: current - 1,
        ArrowLeft: current - 1,
        Home: 0,
        End: tabs.length - 1,
      };
      const target = keys[e.key];
      if (target === undefined) return;
      e.preventDefault();
      select(target, true);
    });
  });
  prev?.addEventListener('click', () => { select(current - 1, false); });
  next?.addEventListener('click', () => { select(current + 1, false); });
  select(0, false);
}

/* ---------- the three checks, side by side ---------- */
function initVersus(): void {
  const root = $('[data-versus]');
  const button = $<HTMLButtonElement>('[data-run-checks]');
  const status = $('[data-checks-status]');
  if (!root || !button) return;
  const cases = $$('[data-case]', root);
  let running = false;

  const reset = (): void => {
    root.setAttribute('data-idle', '');
    for (const c of cases) {
      c.removeAttribute('data-verdict');
      const v = $('.verdict', c);
      if (v) v.hidden = true;
      for (const g of $$('.gates li', c)) g.removeAttribute('data-state');
    }
  };

  const runCase = async (c: HTMLElement): Promise<void> => {
    const gates = $$('.gates li', c);
    let failed = false;
    for (const gate of gates) {
      if (failed) {
        gate.dataset.state = 'skipped';
        continue;
      }
      gate.dataset.state = 'running';
      await wait(650);
      const ok = gate.dataset.result === 'pass';
      gate.dataset.state = ok ? 'pass' : 'fail';
      if (!ok) failed = true;
    }
    c.dataset.verdict = failed ? 'rejected' : 'accepted';
    const v = $('.verdict', c);
    if (v) v.hidden = false;
  };

  const run = async (): Promise<void> => {
    if (running) return;
    running = true;
    button.disabled = true;
    reset();
    root.removeAttribute('data-idle');
    await Promise.all(cases.map(runCase));
    if (status)
      status.textContent =
        'The careless fix passed two checks and was rejected by the fresh static scan. AUTOSP’s fix passed all three and was accepted.';
    button.textContent = 'Run the checks again';
    button.disabled = false;
    running = false;
  };

  reset();
  button.addEventListener('click', () => void run());
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        void run();
      }
    },
    { threshold: 0.45 },
  );
  io.observe(root);
}

/* ---------- the evidence log ---------- */
interface Ledger {
  append(text: string): void;
  removeLast(): void;
}

function initLedger(): Ledger | null {
  const root = $('[data-ledger]');
  const list = $('[data-ledger-list]');
  const tamper = $<HTMLButtonElement>('[data-tamper]');
  const restore = $<HTMLButtonElement>('[data-restore]');
  const status = $('[data-ledger-status]');
  if (!root || !list || !tamper || !restore || !status || !('subtle' in crypto)) return null;

  const inputs = (): HTMLInputElement[] => $$<HTMLInputElement>('.entry__text', list);
  const originals = inputs().map((i) => i.value);
  let sealed: string[] = [];
  let seq = 0;

  const recompute = async (): Promise<void> => {
    const mine = ++seq;
    const fields = inputs();
    const now = await hashChain(fields.map((f) => f.value));
    if (mine !== seq) return;
    let firstBroken = -1;
    let brokenCount = 0;
    fields.forEach((field, i) => {
      const entry = field.closest<HTMLElement>('.entry');
      if (!entry) return;
      const broken = now[i] !== sealed[i];
      entry.toggleAttribute('data-broken', broken);
      const fp = $('[data-fp]', entry);
      const state = $('[data-state]', entry);
      if (fp) fp.textContent = now[i] ?? '';
      if (state) state.textContent = broken ? 'No longer matches' : 'Sealed';
      if (broken) {
        brokenCount++;
        if (firstBroken < 0) firstBroken = i;
      }
    });
    const changed = fields.some((f, i) => f.value !== originals[i]);
    restore.disabled = !changed;
    tamper.disabled = fields[1]?.value !== originals[1];
    root.toggleAttribute('data-broken', brokenCount > 0);
    status.textContent =
      brokenCount > 0
        ? `Entry ${String(firstBroken + 1)} was changed. ${String(brokenCount)} fingerprint${brokenCount > 1 ? 's' : ''} no longer match, from entry ${String(firstBroken + 1)} on.`
        : 'All fingerprints match. Computed with SHA-256 in your browser.';
  };

  const reseal = async (): Promise<void> => {
    sealed = await hashChain(originals);
    await recompute();
  };

  list.addEventListener('input', () => void recompute());
  tamper.addEventListener('click', () => {
    const field = inputs()[1];
    if (!field) return;
    field.value = (originals[1] ?? '').replace(/ failed$/, ' passed');
    void recompute();
  });
  restore.addEventListener('click', () => {
    inputs().forEach((f, i) => (f.value = originals[i] ?? ''));
    void recompute().then(() => {
      status.textContent = 'The record is restored. Every fingerprint matches again.';
    });
    tamper.focus();
  });
  void reseal();

  return {
    append(text) {
      const n = originals.length + 1;
      const li = el('li', 'entry');
      li.dataset.new = '';
      const label = el('label', 'entry__label', `Entry ${String(n)}`);
      label.htmlFor = `entry-${String(n)}`;
      const input = el('input', 'entry__text');
      input.id = `entry-${String(n)}`;
      input.value = text;
      input.spellcheck = false;
      const meta = el('div', 'entry__meta');
      const fp = el('code', 'entry__fp');
      fp.dataset.fp = '';
      const state = el('span', 'entry__state', 'Sealed');
      state.dataset.state = '';
      meta.append(fp, state);
      li.append(label, input, meta);
      list.append(li);
      originals.push(text);
      void reseal();
    },
    removeLast() {
      if (originals.length <= 4) return;
      list.lastElementChild?.remove();
      originals.pop();
      void reseal();
    },
  };
}

/* ---------- hold to merge ---------- */
function initMerge(ledger: Ledger | null): void {
  const pr = $('[data-pr]');
  const hold = $<HTMLButtonElement>('[data-hold]');
  if (!pr || !hold) return;
  const label = $('[data-hold-label]', pr);
  const state = $('[data-pr-state]', pr);
  const review = $('[data-review]', pr);
  const reviewIcon = $('[data-review-icon]', pr);
  const yours = $('[data-yours]', pr);
  const undo = $<HTMLButtonElement>('[data-unmerge]', pr);
  const live = $('[data-hold-status]', pr);
  const DURATION = 1300;
  let start = 0;
  let frame = 0;
  let done = false;

  const setP = (p: number): void => { hold.style.setProperty('--p', String(p)); };

  const finish = (): void => {
    done = true;
    cancelAnimationFrame(frame);
    setP(1);
    hold.removeAttribute('data-holding');
    hold.setAttribute('data-done', '');
    hold.setAttribute('aria-disabled', 'true');
    pr.setAttribute('data-merged', '');
    if (label) label.textContent = 'Merged';
    if (state) state.textContent = 'Merged';
    if (review) review.textContent = 'Review: approved by you';
    reviewIcon?.classList.replace('check--hold', 'check--pass');
    if (yours) {
      yours.textContent = '1';
      yours.setAttribute('data-bump', '');
    }
    if (undo) undo.hidden = false;
    if (live) live.textContent = 'Merged. You made the call. Merges made by AUTOSP: 0. Merges made by you: 1.';
    if ('vibrate' in navigator) navigator.vibrate(12);
    ledger?.append('Approved and merged by a person');
  };

  const tick = (now: number): void => {
    const p = Math.min(1, (now - start) / DURATION);
    setP(p);
    if (p >= 1) finish();
    else frame = requestAnimationFrame(tick);
  };

  const begin = (): void => {
    if (done || start) return;
    start = performance.now();
    hold.setAttribute('data-holding', '');
    frame = requestAnimationFrame(tick);
  };
  const cancel = (): void => {
    if (done || !start) return;
    start = 0;
    cancelAnimationFrame(frame);
    hold.removeAttribute('data-holding');
    hold.style.transition = 'none';
    setP(0);
  };

  hold.addEventListener('pointerdown', (e) => {
    hold.setPointerCapture(e.pointerId);
    begin();
  });
  hold.addEventListener('pointerup', cancel);
  hold.addEventListener('pointercancel', cancel);
  hold.addEventListener('lostpointercapture', cancel);
  hold.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (!e.repeat) begin();
  });
  hold.addEventListener('keyup', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    cancel();
  });
  // a screen reader's activation (no pointer, no key held) merges at once
  hold.addEventListener('click', (e) => {
    if (e.detail === 0 && !start && !done) finish();
  });
  hold.addEventListener('contextmenu', (e) => { e.preventDefault(); });

  undo?.addEventListener('click', () => {
    done = false;
    start = 0;
    setP(0);
    hold.removeAttribute('data-done');
    hold.removeAttribute('aria-disabled');
    pr.removeAttribute('data-merged');
    if (label) label.textContent = 'Hold to approve and merge';
    if (state) state.textContent = 'Open';
    if (review) review.textContent = 'Review: 1 approving review required';
    reviewIcon?.classList.replace('check--pass', 'check--hold');
    if (yours) {
      yours.textContent = '0';
      yours.removeAttribute('data-bump');
    }
    undo.hidden = true;
    if (live) live.textContent = 'The demo merge was undone.';
    ledger?.removeLast();
    hold.focus();
  });
}

/* ---------- boot ---------- */
initNav();
initDemo();
initSteps();
initVersus();
initMerge(initLedger());
const form = $<HTMLFormElement>('[data-rsvp]');
if (form) initRsvp(form);
