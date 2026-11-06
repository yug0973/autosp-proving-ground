/**
 * The visitor's reduced-motion preference, read live. Modules ask once at start-up and subscribe
 * to changes so they can switch between their animated and static versions without a reload
 * (DESIGN.md §8: no pinning, no scrub, no cursor effects and no glitch with reduced motion).
 */

const QUERY = '(prefers-reduced-motion: reduce)';

function mediaQuery(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null;
}

/** True when the visitor has asked for reduced motion. */
export function prefersReducedMotion(): boolean {
  return mediaQuery()?.matches ?? false;
}

/**
 * Calls `listener` with the new value whenever the preference changes.
 * Returns a function that removes the listener.
 */
export function onReducedMotionChange(listener: (reduced: boolean) => void): () => void {
  const mq = mediaQuery();
  if (!mq) return () => {};
  const handle = (event: MediaQueryListEvent): void => {
    listener(event.matches);
  };
  mq.addEventListener('change', handle);
  return () => {
    mq.removeEventListener('change', handle);
  };
}
