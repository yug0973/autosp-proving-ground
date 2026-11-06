/**
 * The results in the brand's dot matrix: each number is drawn as lit squares on a 5 by 7 grid,
 * with the unlit squares faintly visible, the way the Nexarise mark is drawn. A number counts up
 * from zero the first time it comes into view (the total after the slash is drawn smaller, and
 * stands from the start); with reduced motion it shows its value at once.
 *
 * The HTML carries each number as text (`data-numeral` on its <dt>, with `data-of` for a total).
 * That text stays for screen readers, and is what a reader without script sees; the squares are
 * drawn beside it and hidden from assistive technology.
 */
import { prefersReducedMotion } from '../lib/reduced-motion';

/** 5 by 7 glyphs, one string per row, `1` for a lit square. */
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};
const SQUARES = 35;
/** How long a count takes, and how far into view a number must be before it starts. */
const COUNT_MS = 1300;
const IN_VIEW = 0.6;

/** One glyph: 35 squares, lit or not. */
function createGlyph(): HTMLSpanElement {
  const glyph = document.createElement('span');
  glyph.className = 'numeral__glyph';
  for (let i = 0; i < SQUARES; i += 1) glyph.append(document.createElement('span'));
  return glyph;
}

function paint(glyph: HTMLElement, char: string): void {
  const rows = GLYPHS[char] ?? GLYPHS[' '] ?? [];
  const squares = glyph.children;
  for (let i = 0; i < SQUARES; i += 1) {
    squares[i]?.classList.toggle('is-lit', rows[Math.floor(i / 5)]?.[i % 5] === '1');
  }
}

interface Numeral {
  readonly value: number;
  readonly digits: HTMLSpanElement[];
}

/** Draws `value` into `digits`, right-aligned, blank squares on the left. */
function show(numeral: Numeral, value: number): void {
  const text = String(value).padStart(numeral.digits.length, ' ');
  numeral.digits.forEach((glyph, i) => {
    paint(glyph, text[i] ?? ' ');
  });
}

export function initNumerals(root: HTMLElement): () => void {
  const numerals: Numeral[] = [];
  for (const dt of root.querySelectorAll<HTMLElement>('[data-numeral]')) {
    const value = Number(dt.dataset.numeral);
    if (!Number.isInteger(value) || value < 0) continue;
    const drawn = document.createElement('span');
    drawn.className = 'numeral';
    drawn.setAttribute('aria-hidden', 'true');
    const digits = Array.from(String(value), () => createGlyph());
    drawn.append(...digits);
    if (dt.dataset.of) {
      const of = document.createElement('span');
      of.className = 'numeral__of';
      for (const char of `/${dt.dataset.of}`) {
        const glyph = createGlyph();
        paint(glyph, char);
        of.append(glyph);
      }
      drawn.append(of);
    }
    dt.append(drawn);
    dt.dataset.drawn = '';
    numerals.push({ value, digits });
  }
  if (numerals.length === 0) return () => {};

  let frame = 0;
  if (prefersReducedMotion()) {
    for (const numeral of numerals) show(numeral, numeral.value);
    return () => {};
  }

  // dark until they come into view, then all count together
  for (const numeral of numerals) show(numeral, 0);
  const count = (): void => {
    // with the world running these squares are hidden: the towers carry the numbers (world/skyline.ts)
    const { world } = document.documentElement.dataset;
    if (world === 'live' || world === 'still') {
      for (const numeral of numerals) show(numeral, numeral.value);
      return;
    }
    const start = performance.now();
    const step = (now: number): void => {
      const t = Math.min((now - start) / COUNT_MS, 1);
      const eased = 1 - (1 - t) ** 3;
      for (const numeral of numerals) show(numeral, Math.round(numeral.value * eased));
      frame = t < 1 ? requestAnimationFrame(step) : 0;
    };
    frame = requestAnimationFrame(step);
  };
  const observer = new IntersectionObserver(
    (records) => {
      if (!records.some((record) => record.isIntersecting)) return;
      observer.disconnect();
      count();
    },
    { threshold: IN_VIEW },
  );
  const first = root.querySelector('[data-numeral]');
  if (first) observer.observe(first);

  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
  };
}
