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
