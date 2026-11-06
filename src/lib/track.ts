/**
 * Scroll progress through a track element. A tall track (desktop) runs from 0 when its top reaches
 * the top of the viewport to 1 when its bottom reaches the bottom. A short one (on a phone the
 * steps sit in the page flow, not much taller than the screen) runs instead from its top rising
 * past three quarters of the way down the screen to its bottom passing 40% of the way down, so it
 * still plays while it is being read.
 *
 * `signedProgress` is the same, but not clamped: it is negative while the track is still coming up
 * the screen, so a camera move can start as a panel arrives (shots.ts).
 */
export function signedProgress(track: HTMLElement): number {
  const height = track.offsetHeight;
  const viewport = window.innerHeight;
  const travel = height - viewport;
  const top = track.getBoundingClientRect().top;
  return travel >= viewport * 0.5 ? -top / travel : (viewport * 0.75 - top) / (height + viewport * 0.35);
}

export function trackProgress(track: HTMLElement): number {
  return Math.min(Math.max(signedProgress(track), 0), 1);
}

/** `x` from `from` to `to` as 0 to 1, not eased: the world applies the ease (shots.ts). */
export function ramp(from: number, to: number, x: number): number {
  return Math.min(Math.max((x - from) / (to - from), 0), 1);
}

/** Hermite smoothstep of `x` between `edge0` and `edge1`. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}
