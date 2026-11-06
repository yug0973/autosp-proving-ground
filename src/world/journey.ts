/**
 * The visitor's path through the world. Scroll progress (0 to 1) maps to a camera position, a
 * point to look at and a time of day (`phase`: 0 is day, 1 is night).
 *
 * The camera starts above the Nexarise-blue cloud deck, drops through it as the sky turns to dusk,
 * and settles above the city at night. Positions and targets are smooth curves through the
 * keyframes (shots.ts). Where a keyframe sits on the 0 to 1 range sets the pacing: keyframes close
 * together are crossed quickly, keyframes far apart slowly.
 */
import { CatmullRomCurve3, MathUtils, Vector3 } from 'three';
import { SHOTS } from './shots';

interface Keyframe {
  /** Scroll progress at which the camera is exactly here. */
  readonly at: number;
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  /** Time of day: 0 day, 0.5 dusk, 1 night. */
  readonly phase: number;
}

/** The keyframes live with the other shots (shots.ts), so the whole camera is timed in one place. */
const KEYFRAMES: readonly Keyframe[] = SHOTS.descent.keyframes;

/** The progress shown when the visitor prefers reduced motion: the night city, no camera travel. */
export const STATIC_PROGRESS = 0.8;

/** Where the camera is, what it looks at and the time of day. Reused every frame; never allocated. */
export interface JourneySample {
  readonly position: Vector3;
  readonly target: Vector3;
  phase: number;
}

export function createJourneySample(): JourneySample {
  return { position: new Vector3(), target: new Vector3(), phase: 0 };
}

export interface Journey {
  /** Writes the camera pose and time of day for `progress` (clamped to 0 to 1) into `out`. */
  sample(progress: number, out: JourneySample): void;
}

export function createJourney(): Journey {
  const stops = KEYFRAMES.length;
  const ats = KEYFRAMES.map((key) => key.at);
  const phases = KEYFRAMES.map((key) => key.phase);

  if (stops < 2 || ats[0] !== 0 || ats[stops - 1] !== 1) {
    throw new Error('Journey keyframes must start at 0 and end at 1.');
  }
  for (let i = 1; i < stops; i += 1) {
    if ((ats[i] ?? 0) <= (ats[i - 1] ?? 0)) {
      throw new Error(`Journey keyframe ${String(i)} must come after keyframe ${String(i - 1)}.`);
    }
  }

  const positionCurve = new CatmullRomCurve3(
    KEYFRAMES.map((key) => new Vector3(...key.position)),
    false,
    'centripetal',
  );
  const targetCurve = new CatmullRomCurve3(
    KEYFRAMES.map((key) => new Vector3(...key.target)),
    false,
    'centripetal',
  );

  return {
    sample(progress, out) {
      const p = MathUtils.clamp(progress, 0, 1);
      // The segment holding p: between keyframe i and keyframe i + 1
      let i = 0;
      while (i < stops - 2 && p > (ats[i + 1] ?? 1)) i += 1;
      const from = ats[i] ?? 0;
      const to = ats[i + 1] ?? 1;
      const along = (p - from) / (to - from);
      // The curves are parameterised by keyframe index, so (i + along) / (stops - 1) is the point
      // `along` of the way from keyframe i to keyframe i + 1
      const u = (i + along) / (stops - 1);
      positionCurve.getPoint(u, out.position);
      targetCurve.getPoint(u, out.target);
      out.phase = MathUtils.lerp(phases[i] ?? 0, phases[i + 1] ?? 1, along);
    },
  };
}
