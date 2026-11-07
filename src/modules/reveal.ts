/**
 * The page's motion graphics: how each beat's words arrive. Restrained and editorial, so the
 * motion marks a beat arriving rather than decorating it.
 *
 * - The hero, on load: the headline rises line by line out of a mask, then the lede and the
 *   button settle in behind it.
 * - Every other beat, as it scrolls in: its title reveals line by line, its copy settles up, and
 *   its lists (the picker, the gates, the steps) stagger in.
 * - The results: the sixteen runs pop in pixel by pixel (numerals.ts counts the numbers up).
 *
 * All of it is skipped with reduced motion, and nothing is hidden before this script runs except
 * the hero, which a head script marks (data-reveal="pending") and a CSS failsafe reveals anyway.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(ScrollTrigger, SplitText);

const EASE = 'expo.out';
const root = document.documentElement;

/** Splits `el` into masked lines that rise into place; on `trigger` if given, else at once. */
function riseLines(el: HTMLElement, delay: number, trigger?: Element): SplitText {
  let tween: gsap.core.Tween | null = null;
  return SplitText.create(el, {
    type: 'lines',
    mask: 'lines',
    // a heading may carry an aria-label; a paragraph may not, so it keeps a hidden copy of its words
    aria: /^H[1-6]$/.test(el.tagName) ? 'auto' : 'hidden',
    // re-split when the font loads or the width changes; the old tween goes with the old lines
    autoSplit: true,
    onSplit: (self) => {
      tween?.revert();
      tween = gsap.from(self.lines, {
        yPercent: 108,
        duration: 1.05,
        ease: EASE,
        stagger: 0.085,
        delay,
        ...(trigger ? { scrollTrigger: { trigger, start: 'top 82%', once: true } } : {}),
      });
    },
  });
}

/** Elements settle up into place: a short rise and a fade, staggered. */
function settle(targets: Element[], trigger: Element | null, delay: number, stagger = 0.07): void {
  if (targets.length === 0) return;
  gsap.from(targets, {
    y: 18,
    autoAlpha: 0,
    duration: 0.9,
    ease: 'power3.out',
    stagger,
    delay,
    ...(trigger ? { scrollTrigger: { trigger, start: 'top 82%', once: true } } : {}),
  });
}

function hero(): void {
  const title = document.querySelector<HTMLElement>('.beat--sky .beat__title');
  const rest = Array.from(
    document.querySelectorAll<HTMLElement>('.beat--sky .beat__lede, .beat--sky .beat__actions'),
  );
  delete root.dataset.reveal; // the head script hid the hero until now
  if (title) riseLines(title, 0.1);
  settle(rest, null, 0.45, 0.12);
  const strip = document.querySelector('.strip');
  if (strip) gsap.from(strip, { autoAlpha: 0, y: -10, duration: 0.8, ease: 'power3.out', delay: 0.7 });
}

function beats(): void {
  const blocks = document.querySelectorAll<HTMLElement>(
    '.beat:not(.beat--sky) .beat__text, .track__text, .chapter__text, .closing__text',
  );
  for (const block of blocks) {
    const title = block.querySelector<HTMLElement>('.beat__heading, .beat__statement');
    if (title) riseLines(title, 0, block);
    const copy = Array.from(
      block.querySelectorAll<HTMLElement>(
        ':scope > .beat__lede, :scope > .beat__note, :scope > .beat__actions',
      ),
    );
    settle(copy, block, 0.25, 0.1);
    const items = Array.from(block.querySelectorAll<HTMLElement>('.picker__option, .hold'));
    settle(items, block, 0.45, 0.07);
  }
  // panels outside the sticky tracks (the record, the results, the form) unveil from the top
  for (const panel of document.querySelectorAll<HTMLElement>('.chapter__panel, .apply')) {
    gsap.from(panel, {
      clipPath: 'inset(0% 0% 100% 0%)',
      y: 24,
      duration: 1.1,
      ease: EASE,
      scrollTrigger: { trigger: panel, start: 'top 85%', once: true },
      clearProps: 'clipPath,transform',
    });
  }
}

function results(): void {
  const matrix = document.querySelector('.matrix');
  if (matrix) {
    gsap.from(matrix.children, {
      scale: 0,
      duration: 0.5,
      ease: 'back.out(2.2)',
      stagger: { each: 0.045, from: 'start' },
      scrollTrigger: { trigger: matrix, start: 'top 85%', once: true },
    });
  }
}

export function initReveal(): () => void {
  const media = gsap.matchMedia();
  media.add('(prefers-reduced-motion: no-preference)', () => {
    hero();
    beats();
    results();
  });
  media.add('(prefers-reduced-motion: reduce)', () => {
    delete root.dataset.reveal;
  });
  return () => {
    media.revert();
  };
}
