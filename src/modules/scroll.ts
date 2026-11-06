/**
 * Smooth scroll and the scroll clock for every scroll-driven module (DESIGN.md §7).
 *
 * - Lenis smooths wheel input (`lerp: 0.1`, `smoothWheel: true`) and is driven by GSAP's ticker,
 *   so Lenis, ScrollTrigger and every timeline advance on the same frame.
 * - `ScrollTrigger.update` runs on every Lenis scroll event.
 * - With reduced motion there is no Lenis: scrolling is native and anchor jumps are instant. The
 *   preference is watched live, so switching it mid-visit swaps modes without a reload.
 * - In-page links scroll to their target below the fixed nav, then move keyboard focus there, so
 *   keyboard and screen-reader users land where the scroll lands.
 */
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { onReducedMotionChange, prefersReducedMotion } from '../lib/reduced-motion';

gsap.registerPlugin(ScrollTrigger);

export type ScrollMode = 'lenis' | 'native';

/** GSAP's default lag smoothing, restored when Lenis stops driving the ticker. */
const GSAP_LAG_THRESHOLD = 500;
const GSAP_LAG_ADJUSTED = 33;

const root = document.documentElement;
let lenis: Lenis | null = null;
let tick: ((time: number) => void) | null = null;

function setMode(mode: ScrollMode): void {
  root.dataset.scroll = mode;
}

function startLenis(): void {
  if (lenis) return;
  const instance = new Lenis({ lerp: 0.1, smoothWheel: true });
  instance.on('scroll', () => {
    ScrollTrigger.update();
  });
  tick = (time: number): void => {
    instance.raf(time * 1000);
  };
  gsap.ticker.add(tick);
  // Lenis already smooths the input; GSAP's lag smoothing would make scroll-linked timelines trail it
  gsap.ticker.lagSmoothing(0);
  lenis = instance;
  setMode('lenis');
  ScrollTrigger.refresh();
}

function stopLenis(): void {
  if (tick) gsap.ticker.remove(tick);
  tick = null;
  if (lenis) {
    lenis.destroy();
    lenis = null;
    gsap.ticker.lagSmoothing(GSAP_LAG_THRESHOLD, GSAP_LAG_ADJUSTED);
    ScrollTrigger.refresh();
  }
  setMode('native');
}

function focusTarget(target: HTMLElement): void {
  if (!target.matches('a[href], button, input, select, textarea, [tabindex]')) {
    target.setAttribute('tabindex', '-1');
  }
  target.focus({ preventScroll: true });
}

/** The current scroll mode: `lenis` when smoothing, `native` with reduced motion. */
export function getScrollMode(): ScrollMode {
  return lenis ? 'lenis' : 'native';
}

/** The running Lenis instance, or null with reduced motion. */
export function getLenis(): Lenis | null {
  return lenis;
}

/**
 * Scrolls `target` to just below the fixed nav, then moves focus to it.
 * Smooth with Lenis; instant with reduced motion. Both stop short by <html>'s scroll-padding-top
 * (the nav height plus breathing room): Lenis reads it itself, and so does scrollIntoView.
 */
export function scrollToTarget(target: HTMLElement): void {
  if (lenis) {
    lenis.scrollTo(target, {
      onComplete: () => {
        focusTarget(target);
      },
    });
    return;
  }
  // scroll-padding-top on <html> keeps the target clear of the nav
  target.scrollIntoView({ block: 'start', behavior: 'instant' });
  focusTarget(target);
}

function onDocumentClick(event: MouseEvent): void {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (!(event.target instanceof Element)) return;
  const link = event.target.closest<HTMLAnchorElement>('a[href^="#"]');
  if (!link) return;
  const id = decodeURIComponent(link.hash.slice(1));
  if (!id) return;
  const target = document.getElementById(id);
  if (!target) return;
  event.preventDefault();
  if (location.hash !== link.hash) history.pushState(null, '', link.hash);
  scrollToTarget(target);
}

/**
 * Starts the scroll system. Returns a function that tears everything down: Lenis, the ticker
 * callback, the link handler and the reduced-motion listener.
 */
export function initScroll(): () => void {
  if (prefersReducedMotion()) stopLenis();
  else startLenis();

  const stopWatching = onReducedMotionChange((reduced) => {
    if (reduced) stopLenis();
    else startLenis();
  });
  document.addEventListener('click', onDocumentClick);

  return () => {
    stopWatching();
    document.removeEventListener('click', onDocumentClick);
    stopLenis();
    delete root.dataset.scroll;
  };
}
