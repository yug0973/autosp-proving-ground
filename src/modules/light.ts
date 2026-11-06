/**
 * The calm phone page: smooth scroll, the one sky brightening behind it, the words rising in, and the
 * pilot form. No world, no GSAP. With reduced motion there is no Lenis and nothing travels; the sky
 * still follows the scroll, since it is the ground the words are readable on.
 */
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { prefersReducedMotion } from '../lib/reduced-motion';
import { initApply } from './apply';

/** How far the plates travel against the scroll, as a share of the screen. */
const DRIFT = 0.1;

function smooth(from: number, to: number, x: number): number {
  const t = Math.min(Math.max((x - from) / (to - from), 0), 1);
  return t * t * (3 - 2 * t);
}

/** The sky follows the page: night, then before dawn as the proof goes on, and the sun comes up in the
 * empty stretch after the results, where no words are in the way. */
function followSky(root: HTMLElement): { update: (y: number) => void; stop: () => void } {
  const plates = root.querySelector<HTMLElement>('[data-calm-plates]');
  const predawn = root.querySelector<HTMLElement>('[data-sky-predawn]');
  const dawn = root.querySelector<HTMLElement>('[data-sky-dawn]');
  const results = root.querySelector<HTMLElement>('[data-calm-results]');
  const pilot = root.querySelector<HTMLElement>('[data-calm-pilot]');
  const sun = root.querySelector<HTMLElement>('[data-calm-sun]');
  const mist = root.querySelector<HTMLElement>('[data-calm-mist]');
  const mistDawn = Array.from(root.querySelectorAll<HTMLElement>('[data-mist-dawn]'));
  if (!plates || !predawn || !dawn || !results || !pilot || !sun || !mist) {
    return { update: () => {}, stop: () => {} };
  }

  const still = prefersReducedMotion();
  let screen = 1;
  let resultsEnd = 1;
  let pilotAt = 2;
  let furthest = 1;
  let last = 0;

  const update = (y: number): void => {
    last = y;
    predawn.style.opacity = smooth(screen * 0.4, resultsEnd - screen * 1.2, y).toFixed(3);
    const day = smooth(resultsEnd - screen * 0.04, pilotAt - screen, y);
    dawn.style.opacity = day.toFixed(3);
    for (const tone of mistDawn) tone.style.opacity = day.toFixed(3);
    // the sun starts low in the mist as the results leave, and stands behind the heading of the pilot
    const rise = smooth(resultsEnd - screen * 0.1, pilotAt - screen * 0.2, y);
    sun.style.opacity = smooth(0, 0.18, rise).toFixed(3);
    // and goes on up out of the sky as the form arrives, so nothing shows through the fields
    const away = smooth(pilotAt - screen * 0.05, pilotAt + screen * 0.55, y);
    sun.style.transform = `translate3d(0, ${(78 - rise * 68 - away * 110).toFixed(2)}lvh, 0)`;
    // the mist lies low on the first screen, comes up once the visitor moves, and clears for the form
    const up = smooth(0, screen * 0.3, y);
    const clear = smooth(pilotAt - screen * 0.75, pilotAt - screen * 0.1, y);
    mist.style.transform = `translate3d(0, ${(52 * (1 - up) + 100 * clear).toFixed(2)}%, 0)`;
    if (!still) plates.style.transform = `translate3d(0, ${(-(y / furthest) * DRIFT * 100).toFixed(2)}%, 0)`;
  };
  const measure = (): void => {
    screen = window.innerHeight;
    resultsEnd = results.getBoundingClientRect().bottom + window.scrollY;
    pilotAt = pilot.getBoundingClientRect().top + window.scrollY;
    furthest = Math.max(document.documentElement.scrollHeight - screen, 1);
    update(last);
  };
  const watcher = new ResizeObserver(measure);
  watcher.observe(document.body);
  measure();
  return {
    update,
    stop: () => {
      watcher.disconnect();
    },
  };
}

/** Sets each word of a heading in its own box, so it can rise from under its own edge. The words and the
 * spaces between them stay plain text, in order, for anyone reading or searching the heading. */
function splitWords(root: HTMLElement): void {
  for (const heading of root.querySelectorAll<HTMLElement>('[data-words]')) {
    const words = heading.textContent.trim().split(/\s+/);
    heading.replaceChildren();
    words.forEach((word, i) => {
      const box = document.createElement('span');
      box.className = 'word';
      box.style.setProperty('--i', String(i));
      const inner = document.createElement('span');
      inner.textContent = word;
      box.append(inner);
      heading.append(box, i < words.length - 1 ? ' ' : '');
    });
  }
}

/** Each part rises in once as it arrives. It is hidden only here, by the script, so a page whose script
 * never ran has nothing held back; and only what is still below the screen waits. */
function riseIn(root: HTMLElement): () => void {
  if (prefersReducedMotion() || !('IntersectionObserver' in window)) return () => {};
  splitWords(root);
  const parts = Array.from(root.querySelectorAll<HTMLElement>('[data-rise]')).filter(
    (part) => part.getBoundingClientRect().top > window.innerHeight * 0.92,
  );
  // the title rises as the page opens: its words are in place first, so it never waits on anything
  const title = root.querySelector<HTMLElement>('h1[data-words]');
  if (title) {
    title.setAttribute('data-waiting', '');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        title.setAttribute('data-risen', '');
      });
    });
  }
  const watcher = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.setAttribute('data-risen', '');
        watcher.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  for (const part of parts) {
    part.setAttribute('data-waiting', '');
    watcher.observe(part);
  }
  return () => {
    watcher.disconnect();
  };
}

export function initLight(): () => void {
  const root = document.querySelector<HTMLElement>('[data-calm]');
  if (!root) return () => {};
  root.setAttribute('data-calm-live', '');
  const sky = followSky(root);
  const stopRise = riseIn(root);
  const form = root.querySelector<HTMLFormElement>('[data-calm-apply]');
  const stopForm = form ? initApply(form) : () => {};

  let lenis: Lenis | null = null;
  let frame = 0;
  const onNativeScroll = (): void => {
    sky.update(window.scrollY);
  };
  if (prefersReducedMotion()) {
    window.addEventListener('scroll', onNativeScroll, { passive: true });
  } else {
    // syncTouch: a thumb's scroll glides like the wheel's, which is the point of this page
    lenis = new Lenis({ lerp: 0.085, smoothWheel: true, syncTouch: true, syncTouchLerp: 0.09 });
    lenis.on('scroll', onNativeScroll);
    const tick = (time: number): void => {
      lenis?.raf(time);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }
  onNativeScroll();

  const onLinkClick = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>('a[href^="#"]');
    const target = link ? document.getElementById(link.hash.slice(1)) : null;
    if (!link || !target) return;
    event.preventDefault();
    history.pushState(null, '', link.hash);
    if (lenis) lenis.scrollTo(target, { duration: 1.8 });
    else target.scrollIntoView({ block: 'start', behavior: 'instant' });
    target.focus({ preventScroll: true });
  };
  root.addEventListener('click', onLinkClick);

  return () => {
    cancelAnimationFrame(frame);
    lenis?.destroy();
    window.removeEventListener('scroll', onNativeScroll);
    root.removeEventListener('click', onLinkClick);
    sky.stop();
    stopRise();
    stopForm();
  };
}
