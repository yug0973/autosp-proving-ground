/**
 * Two small motions, adapted from React Bits (MIT + Commons Clause, github.com/DavidHDev/react-bits):
 *
 * - Counter: in the results' box, 14 and 2 roll up like an odometer when the flight along the row reaches
 *   their tower, so the box and the towers count together. The real numbers stay in the page as text.
 * - Decrypted Text: when an entry of the record is rewritten, each fingerprint that changes cycles through
 *   hex digits before it settles on its new value, as the hash is computed again.
 *
 * Neither runs with reduced motion: the numbers and fingerprints are simply there.
 */
import { prefersReducedMotion } from '../lib/reduced-motion';

const ROLL_MS = 1100;
const DECRYPT_MS = 620;
const HEX = '0123456789abcdef';

/**
 * An odometer for one number: a column of digits per place, rolled to the value by transform. It is drawn
 * beside the real number (`text`, which keeps its words for screen readers and is only hidden from sight),
 * in the number's own colour, with the rest of the figure (the /16) after it.
 */
function odometer(
  text: HTMLElement,
  holder: HTMLElement,
  final: number,
): { roll: () => void; stop: () => void } {
  const digits = String(final).split('');
  const view = document.createElement('span');
  view.className = 'odometer';
  view.setAttribute('aria-hidden', 'true');
  const number = document.createElement('span');
  number.className = `odometer__number ${holder.className}`;
  view.append(number);
  const columns = digits.map(() => {
    const column = document.createElement('span');
    column.className = 'odometer__column';
    const strip = document.createElement('span');
    strip.className = 'odometer__strip';
    strip.textContent = '0123456789'.split('').join('\n');
    column.append(strip);
    number.append(column);
    return strip;
  });
  const rest = holder.nextElementSibling;
  if (rest) view.append(rest.cloneNode(true));
  text.after(view);
  text.classList.add('odometer__text');
  let frame = 0;
  const set = (value: number): void => {
    const shown = String(Math.round(value)).padStart(digits.length, '0');
    columns.forEach((strip, i) => {
      strip.style.transform = `translateY(${String(-Number(shown[i] ?? 0))}em)`;
    });
  };
  set(prefersReducedMotion() ? final : 0);
  return {
    roll() {
      if (prefersReducedMotion()) return;
      cancelAnimationFrame(frame);
      const start = performance.now();
      const tick = (now: number): void => {
        const t = Math.min((now - start) / ROLL_MS, 1);
        set(final * (1 - (1 - t) ** 3));
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    },
    stop() {
      cancelAnimationFrame(frame);
      view.remove();
      text.classList.remove('odometer__text');
    },
  };
}

function initOdometers(): () => void {
  const results = document.querySelector<HTMLElement>('#results');
  const fixed = results?.querySelector<HTMLElement>('.stats__fixed');
  const held = results?.querySelector<HTMLElement>('.stats__held');
  const fixedText = fixed?.closest<HTMLElement>('.stats__text');
  const heldText = held?.closest<HTMLElement>('.stats__text');
  if (!results || !fixed || !held || !fixedText || !heldText) return () => {};
  const counters = [odometer(fixedText, fixed, 14), odometer(heldText, held, 2)];
  // both roll as the box first comes up, one after the other, so it never shows a number it does not
  // mean: the towers then count along the row as the flight reaches each one
  let rolled = false;
  let later = 0;
  const watch = new MutationObserver(() => {
    if (rolled || results.dataset.stat === undefined) return;
    rolled = true;
    counters[0]?.roll();
    later = window.setTimeout(() => counters[1]?.roll(), ROLL_MS * 0.45);
  });
  watch.observe(results, { attributes: true, attributeFilter: ['data-stat'] });
  return () => {
    watch.disconnect();
    window.clearTimeout(later);
    for (const counter of counters) counter.stop();
  };
}

/** Each fingerprint that changes is decrypted into its new value. */
function initDecrypt(): () => void {
  if (prefersReducedMotion()) return () => {};
  const shorts = Array.from(document.querySelectorAll<HTMLElement>('[data-record-short]'));
  const written = new WeakMap<HTMLElement, string>();
  // the value each fingerprint last settled on: the record rewrites the whole text, so the old value has
  // to be kept here to know what changed
  const settledOn = new WeakMap<HTMLElement, string>();
  const frames = new Map<HTMLElement, number>();
  const decrypt = (el: HTMLElement, target: string): void => {
    cancelAnimationFrame(frames.get(el) ?? 0);
    const start = performance.now();
    const tick = (now: number): void => {
      const t = Math.min((now - start) / DECRYPT_MS, 1);
      // the digits settle left to right; the rest keep cycling until their turn
      const settled = Math.floor(t * target.length);
      const text = target
        .split('')
        .map((ch, i) => (i < settled || ch === '-' ? ch : (HEX[Math.floor(Math.random() * 16)] ?? '0')))
        .join('');
      written.set(el, text);
      el.textContent = text;
      if (t < 1) frames.set(el, requestAnimationFrame(tick));
      else {
        written.set(el, target);
        settledOn.set(el, target);
        el.textContent = target;
      }
    };
    frames.set(el, requestAnimationFrame(tick));
  };
  const watch = new MutationObserver((records) => {
    for (const record of records) {
      const el = record.target instanceof HTMLElement ? record.target : record.target.parentElement;
      const short = el?.closest<HTMLElement>('[data-record-short]');
      if (!short) continue;
      const text = short.textContent;
      // what this module wrote itself is not a change to decrypt
      if (written.get(short) === text) continue;
      const before = settledOn.get(short) ?? '';
      if (before && before !== '----' && text !== '----' && text !== before) decrypt(short, text);
      else settledOn.set(short, text);
    }
  });
  for (const short of shorts) {
    written.set(short, short.textContent);
    settledOn.set(short, short.textContent);
    watch.observe(short, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
  return () => {
    watch.disconnect();
    for (const frame of frames.values()) cancelAnimationFrame(frame);
  };
}

export function initRolling(): () => void {
  const stops = [initOdometers(), initDecrypt()];
  return () => {
    for (const stop of stops) stop();
  };
}
