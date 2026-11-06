/**
 * The hero stage (DESIGN.md §6.1): the page-load reveal of the vulnerable line and the exploit demo.
 *
 * Reveal: the only entrance motion on the page. The code types in over --dur-slow, then the red
 * underline draws over --dur-slow. It animates a visual copy of the code (aria-hidden); the
 * original stays in the DOM, visually hidden, so screen readers read the code as whole words.
 * With reduced motion the head script never sets data-reveal, and the code is simply there.
 *
 * Demo: the visitor's input goes through the same string concatenation the vulnerable line does
 * (lib/sql-sim.ts). The result strip is a polite live region; each state has a colour, a text
 * label and an icon shape. A leak glitches the code once (--dur-glitch) and, if sound is on,
 * plays the exploit sound. The visitor's input is only ever written with textContent.
 */
import { MAX_INPUT_LENGTH, SAMPLE_INVOICES, runLookup, type LookupResult } from '../lib/sql-sim';
import { durationMs } from '../lib/css-tokens';
import { prefersReducedMotion } from '../lib/reduced-motion';
import { playSound } from '../lib/sound';
import { isSoundOn } from './nav';

const SVG_NS = 'http://www.w3.org/2000/svg';
const FONT_WAIT_MS = 800;

/* ---------- icons: a distinct shape per state, so colour is never the only signal ---------- */

type Shape = 'check' | 'triangle' | 'diamond' | 'circle';

const SHAPES: Record<Shape, string[]> = {
  check: ['circle:10,10,8', 'path:M6.4 10.3l2.4 2.4 4.8-5.2'],
  triangle: ['path:M10 2.8l7.6 13.4H2.4z', 'path:M10 8v3.6', 'path:M10 13.9v.1'],
  diamond: ['path:M10 2.4l7.6 7.6-7.6 7.6-7.6-7.6z', 'path:M10 7v3.6', 'path:M10 12.9v.1'],
  circle: ['circle:10,10,8', 'path:M6.5 10h7'],
};

function icon(shape: Shape): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'result__icon');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('aria-hidden', 'true');
  for (const part of SHAPES[shape]) {
    const [kind, data = ''] = part.split(':');
    if (kind === 'circle') {
      const [cx = '0', cy = '0', r = '0'] = data.split(',');
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', cx);
      circle.setAttribute('cy', cy);
      circle.setAttribute('r', r);
      svg.append(circle);
    } else {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', data);
      svg.append(path);
    }
  }
  return svg;
}

/* ---------- the result strip ---------- */

function statusFor(result: LookupResult): { shape: Shape; text: string } {
  const n = result.rows.length;
  switch (result.state) {
    case 'found':
      return { shape: 'check', text: '1 row returned' };
    case 'leak':
      return {
        shape: 'triangle',
        text:
          n === SAMPLE_INVOICES.length
            ? `${String(n)} rows returned. Every invoice leaked.`
            : `${String(n)} ${n === 1 ? 'row' : 'rows'} returned through injected SQL.`,
      };
    case 'empty':
      return {
        shape: 'circle',
        text: result.injected ? '0 rows returned.' : '0 rows returned. No invoice has that ID.',
      };
    case 'error':
      return {
        shape: 'diamond',
        text: `The query failed: ${result.error ?? 'syntax error'}. The input still reached the SQL as code.`,
      };
    case 'no-input':
      return { shape: 'circle', text: 'Enter an invoice ID, then run the query.' };
  }
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderResult(result: LookupResult): HTMLElement {
  const wrap = element('div', 'result');
  wrap.dataset.state = result.state;

  const status = statusFor(result);
  const statusLine = element('p', 'result__status');
  statusLine.append(icon(status.shape), element('span', undefined, status.text));
  wrap.append(statusLine);

  if (result.rows.length > 0) {
    const table = element('table', 'result__rows');
    const head = element('thead');
    const headRow = element('tr');
    for (const label of ['id', 'customer', 'amount']) {
      const th = element('th', undefined, label);
      th.scope = 'col';
      headRow.append(th);
    }
    head.append(headRow);
    const body = element('tbody');
    for (const row of result.rows) {
      const tr = element('tr');
      tr.append(
        element('td', undefined, row.id),
        element('td', undefined, row.customer),
        element('td', undefined, row.amount),
      );
      body.append(tr);
    }
    table.append(head, body);
    wrap.append(table);
  }

  if (result.state !== 'no-input') {
    const query = element('p', 'result__query', 'Query sent ');
    query.append(element('code', undefined, result.query));
    wrap.append(query);
  }
  return wrap;
}

/* ---------- the page-load reveal ---------- */

function splitIntoChars(root: Node, chars: HTMLElement[]): void {
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? '';
      const fragment = document.createDocumentFragment();
      for (const ch of text) {
        if (/\s/.test(ch)) {
          fragment.append(ch);
          continue;
        }
        const span = element('span', 'code__char', ch);
        chars.push(span);
        fragment.append(span);
      }
      child.replaceWith(fragment);
    } else {
      splitIntoChars(child, chars);
    }
  }
}

function waitForFonts(): Promise<void> {
  const ready = document.fonts.ready.then(() => undefined);
  const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, FONT_WAIT_MS));
  return Promise.race([ready, timeout]);
}

/** Types the code in, then draws the underline. Returns a cleanup that finishes it at once. */
function revealCode(figure: HTMLElement): () => void {
  const root = document.documentElement;
  const source = figure.querySelector<HTMLElement>('[data-code-source]');
  if (root.dataset.reveal !== 'pending' || !source) return () => {};

  let frame = 0;
  let timer = 0;
  let cancelled = false;
  const finish = (): void => {
    root.dataset.reveal = 'done';
  };

  void waitForFonts().then(() => {
    if (cancelled) return;
    const visual = source.cloneNode(true) as HTMLElement;
    visual.removeAttribute('data-code-source');
    visual.setAttribute('aria-hidden', 'true');
    visual.classList.add('code--visual');
    const chars: HTMLElement[] = [];
    splitIntoChars(visual, chars);
    source.classList.add('visually-hidden');
    source.after(visual);
    root.dataset.reveal = 'typing';

    const typing = durationMs('--dur-slow', 640);
    const start = performance.now();
    const step = (now: number): void => {
      const typed = Math.min(chars.length, Math.ceil(((now - start) / typing) * chars.length));
      for (let i = 0; i < typed; i += 1) chars[i]?.classList.add('is-typed');
      if (typed < chars.length) {
        frame = requestAnimationFrame(step);
        return;
      }
      root.dataset.reveal = 'underline';
      timer = window.setTimeout(finish, durationMs('--dur-slow', 640));
    };
    frame = requestAnimationFrame(step);
  });

  return () => {
    cancelled = true;
    cancelAnimationFrame(frame);
    window.clearTimeout(timer);
    finish();
  };
}

/* ---------- the glitch ---------- */

function glitch(figure: HTMLElement): void {
  if (prefersReducedMotion()) return;
  const target =
    figure.querySelector<HTMLElement>('.code--visual') ?? figure.querySelector<HTMLElement>('.code');
  target?.animate(
    [
      { transform: 'translateX(0)', opacity: 1 },
      { transform: 'translateX(-0.06em)', opacity: 0.7 },
      { transform: 'translateX(0.08em) skewX(-4deg)', opacity: 0.85 },
      { transform: 'translateX(0)', opacity: 1 },
    ],
    { duration: durationMs('--dur-glitch', 120), easing: 'steps(3, end)', iterations: 1 },
  );
}

/* ---------- the demo ---------- */

function initDemo(form: HTMLFormElement, figure: HTMLElement): () => void {
  const input = form.querySelector<HTMLInputElement>('input[name="invoice_id"]');
  const output = form.querySelector<HTMLElement>('[data-exploit-result]');
  if (!input || !output) return () => {};
  input.maxLength = MAX_INPUT_LENGTH;
  let frame = 0;

  const onSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    const result = runLookup(input.value);
    cancelAnimationFrame(frame);
    // clear, then fill on the next frame, so a repeated identical result is announced again
    output.replaceChildren();
    frame = requestAnimationFrame(() => {
      output.replaceChildren(renderResult(result));
    });
    if (result.state === 'leak') {
      glitch(figure);
      if (isSoundOn()) playSound('exploit');
    }
  };
  form.addEventListener('submit', onSubmit);
  return () => {
    cancelAnimationFrame(frame);
    form.removeEventListener('submit', onSubmit);
  };
}

/** Starts the hero. Returns a function that removes its listeners and ends the reveal. */
export function initHero(hero: HTMLElement): () => void {
  const figure = hero.querySelector<HTMLElement>('[data-hero-code]');
  const form = hero.querySelector<HTMLFormElement>('[data-exploit]');
  const cleanups: Array<() => void> = [];
  if (figure) cleanups.push(revealCode(figure));
  if (figure && form) cleanups.push(initDemo(form, figure));
  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
