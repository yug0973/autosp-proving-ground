/**
 * The scanner sweep of the backlog beat: one thin line of light crosses the whole city, left to
 * right, once, when the beat arrives. Each crack ignites orange as the line passes it, and the
 * counter in the beat counts the cracks the line has passed, up to every finding in the scene.
 *
 * The line is a plane of world x that moves; the facade and street shaders (shaders/scan.glsl) draw
 * where it is and light the cracks behind it. Before the sweep the cracks are dark; after it, or for
 * a visitor who skips the beat or asks for reduced motion, they are all lit, with no sweep.
 */
import { Vector3 } from 'three';

export const SCAN = {
  /** Seconds for the line to cross the scene. */
  seconds: 3.4,
  /** The line starts this far (world units) before the first finding and ends this far past the last,
   * which is what the beat's camera sees of the city: the whole visible city, not the empty reaches
   * beyond the frame, so the findings light one after another through the middle of the sweep. */
  before: 70,
  after: 45,
  /** Half the width of the line, the length of its glow either side of it, and how far behind the
   * line a crack takes to reach full strength (all in world units). */
  shape: new Vector3(0.7, 5, 5),
} as const;

/** Where the line is for a progress of 0 to 1; past the end everything is lit (1e4 is beyond the city). */
export function scanX(progress: number, range: { readonly min: number; readonly max: number }): number {
  if (progress >= 1) return 1e4;
  return range.min + (range.max - range.min) * Math.max(progress, 0);
}

/** The line's run: from `before` ahead of the first finding to `after` past the last. */
export function scanRange(xs: readonly number[]): { min: number; max: number } {
  return { min: Math.min(...xs) - SCAN.before, max: Math.max(...xs) + SCAN.after };
}
