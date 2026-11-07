/**
 * Sets `--progress` (0 to 1) on every `[data-track]` section as the page scrolls, so a track's
 * CSS can reveal its panel at the right moment without any per-track script.
 */
import { signedProgress, trackProgress } from '../lib/track';

export function initTracks(): () => void {
  const tracks = Array.from(document.querySelectorAll<HTMLElement>('[data-track]'));
  // `--signed` is the same progress before it is clamped: below 0 while the section is still coming up
  // the screen, so CSS can hold something back until its section has arrived
  const signed = Array.from(document.querySelectorAll<HTMLElement>('[data-signed]'));
  // `--bottom`: where a panel's bottom edge is, as a share of the screen, so it can fade as it leaves
  // and be gone before the next box comes up
  const leaving = Array.from(document.querySelectorAll<HTMLElement>('[data-leaves]'));
  const update = (): void => {
    for (const track of tracks) track.style.setProperty('--progress', trackProgress(track).toFixed(3));
    for (const section of signed) section.style.setProperty('--signed', signedProgress(section).toFixed(4));
    for (const panel of leaving) {
      const box = panel.getBoundingClientRect();
      panel.style.setProperty('--bottom', (box.bottom / window.innerHeight).toFixed(4));
      panel.style.setProperty('--top', `${box.top.toFixed(1)}px`);
    }
  };
  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  return () => {
    window.removeEventListener('scroll', update);
    window.removeEventListener('resize', update);
  };
}
