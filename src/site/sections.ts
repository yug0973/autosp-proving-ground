/**
 * The sections after the opening scene: each block fades up once as it enters the screen (not at all under
 * reduced motion), and the pilot form is the exhibition's own, already tested (src/exhibit/rsvp.ts).
 */
import './sections.css';
import { initRsvp } from '../exhibit/rsvp';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const items = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));

if (!reduced && 'IntersectionObserver' in window) {
  document.documentElement.classList.add('js-reveal');
  const seen = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-seen');
        seen.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  for (const el of items) seen.observe(el);
}

const form = document.querySelector<HTMLFormElement>('[data-rsvp]');
if (form) initRsvp(form);

/* the footer's aurora, loaded only when the footer is near, so it never delays the page */
const art = document.querySelector('[data-aurora]');
if (art) {
  const load = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    load.disconnect();
    void import('./aurora');
  }, { rootMargin: '800px 0px' });
  load.observe(art);
}

/* the circuit's pulses run only while it is on screen */
const circuit = document.querySelector('.circuit');
if (circuit) {
  new IntersectionObserver((entries) => {
    for (const e of entries) circuit.classList.toggle('is-live', e.isIntersecting);
  }).observe(circuit);
}
