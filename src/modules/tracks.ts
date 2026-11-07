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
  const update = (): void => {
    for (const track of tracks) track.style.setProperty('--progress', trackProgress(track).toFixed(3));
    for (const section of signed) section.style.setProperty('--signed', signedProgress(section).toFixed(4));
  };
  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  return () => {
    window.removeEventListener('scroll', update);
    window.removeEventListener('resize', update);
  };
}
