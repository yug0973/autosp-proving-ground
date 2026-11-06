/**
 * Sets `--progress` (0 to 1) on every `[data-track]` section as the page scrolls, so a track's
 * CSS can reveal its panel at the right moment without any per-track script.
 */
import { trackProgress } from '../lib/track';

export function initTracks(): () => void {
  const tracks = Array.from(document.querySelectorAll<HTMLElement>('[data-track]'));
  const update = (): void => {
    for (const track of tracks) track.style.setProperty('--progress', trackProgress(track).toFixed(3));
  };
  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  return () => {
    window.removeEventListener('scroll', update);
    window.removeEventListener('resize', update);
  };
}
