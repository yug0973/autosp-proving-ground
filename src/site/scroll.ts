/**
 * The opening scene, matched frame by frame to the Augment reference. The stage stays pinned while the
 * page scrolls through `.scene`; the scroll position p (0..1) drives:
 *   0.00-0.50  the headline, the label, the names and the big button scroll up together and slide
 *              behind the nav, exactly like a page scrolling under a fixed bar
 *   0.05-0.60  the sky grows from the top: the pale glow sinks into the bottom corners
 *   0.20-0.48  the statement rises from the bottom of the screen into the centre
 *   0.24-0.85  the statement shimmers in, letter by letter (and back, scrolling up)
 *   0.42-0.55  a small "Apply for the pilot" button slides into the nav, and "Contact" steps aside
 * The headline also shimmers in once on load. Reduced motion drops the blur and glints.
 */
import './opening.css';
import './sections';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const span = (p: number, a: number, b: number): number => clamp01((p - a) / (b - a));
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Wraps each letter in a span (words kept whole); screen readers get the plain text from a hidden copy. */
function split(el: HTMLElement): HTMLSpanElement[] {
  const label = el.textContent.replace(/\s+/g, ' ').trim();
  const visual = document.createElement('span');
  visual.setAttribute('aria-hidden', 'true');
  while (el.firstChild) visual.append(el.firstChild);
  const plain = document.createElement('span');
  plain.className = 'sr-only';
  plain.textContent = label;
  el.append(plain, visual);
  const chars: HTMLSpanElement[] = [];
  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const part of (child.textContent ?? '').split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) {
            frag.append(document.createTextNode(' '));
            continue;
          }
          const word = document.createElement('span');
          word.style.whiteSpace = 'nowrap';
          for (const ch of part) {
            const s = document.createElement('span');
            s.className = 'g-char';
            s.textContent = ch;
            word.append(s);
            chars.push(s);
          }
          frag.append(word);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE && (child as Element).tagName !== 'BR') {
        walk(child);
      }
    }
  };
  walk(visual);
  return chars;
}

function paint(chars: HTMLSpanElement[], upTo: number, glint = true): void {
  chars.forEach((c, i) => {
    const on = i < upTo;
    c.classList.toggle('is-on', on);
    c.classList.toggle('is-glint', glint && on && i >= upTo - 6);
  });
}

/* the headline shimmers in once, on load */
const headline = document.querySelector<HTMLElement>('[data-glitter="load"]');
if (headline) {
  const chars = split(headline);
  if (reduced) paint(chars, chars.length, false);
  else {
    const start = performance.now() + 250;
    const tick = (now: number): void => {
      const t = clamp01((now - start) / 1400);
      paint(chars, Math.round(t * chars.length));
      if (t < 1) requestAnimationFrame(tick);
      else window.setTimeout(() => { paint(chars, chars.length, false); }, 500);
    };
    requestAnimationFrame(tick);
  }
}

const scene = document.querySelector<HTMLElement>('[data-scene]');
const stage = scene?.querySelector<HTMLElement>('.stage');
const nav = stage?.querySelector<HTMLElement>('.nav');
const lower = stage?.querySelector<HTMLElement>('[data-lower]');
const statement = stage?.querySelector<HTMLElement>('[data-glitter="scene"]');

if (scene && stage && nav && lower && statement) {
  const chars = split(statement);
  let travel = 0;

  // how far the page content has to scroll for all of it to pass behind the nav
  const measure = (): void => {
    stage.style.setProperty('--rise', '0px');
    const s = stage.getBoundingClientRect();
    const n = nav.getBoundingClientRect();
    const l = lower.getBoundingClientRect();
    travel = l.bottom - s.top - (n.top - s.top + n.height / 2) + 24;
  };

  let frame = 0;
  const update = (): void => {
    frame = 0;
    const r = scene.getBoundingClientRect();
    const p = clamp01(-r.top / (r.height - window.innerHeight));
    // a page scrolling is linear, so the content moves linearly with the scroll
    stage.style.setProperty('--rise', `${String(-travel * span(p, 0, 0.5))}px`);
    stage.style.setProperty('--glow', String(1 - easeInOut(span(p, 0.05, 0.6))));
    stage.style.setProperty('--arrive', String(easeOut(span(p, 0.42, 0.55))));
    stage.style.setProperty('--stmt', String(span(p, 0.2, 0.28)));
    stage.style.setProperty('--stmt-y', `${String((1 - easeOut(span(p, 0.2, 0.48))) * window.innerHeight * 0.45)}px`);
    const reveal = span(p, 0.24, 0.85);
    paint(chars, Math.round(reveal * chars.length), !reduced && reveal < 1);
  };
  const request = (): void => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  const refresh = (): void => {
    measure();
    update();
  };

  refresh();
  void document.fonts.ready.then(refresh);
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', refresh);
}
