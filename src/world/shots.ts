/**
 * The camera, as data: one hand-authored shot per beat, in one place so they can be retimed.
 *
 * Every shot is driven by scroll, never by a clock, so scrolling back plays it in reverse and no
 * blend can pop: each beat's camera is the previous one blended towards its own over `enter`, and
 * then moves within the beat over `move`. Both are ranges of that beat's own scroll progress (0 at
 * the top of its section, 1 at the bottom), eased with a named curve. Framings are measured from
 * the chosen building (its height `h`, its wall that faces the overview), so every shot works for
 * whichever finding the visitor picks.
 *
 * A move's range is measured in its section's scroll progress, and a negative number means before
 * the section has reached the top of the screen, while it is still sliding up: a long move starts
 * as its panel arrives, so it has hundreds of pixels to travel instead of a few dozen. Each move is
 * eased once, here and nowhere else (an ease applied on top of an eased progress doubles the peak
 * speed, which is how a camera whips). `tests/camera.py` holds the speed limit.
 *
 * Each beat also names what is in focus: the depth of field keeps that subject sharp, softens what
 * is nearer or further, and on a wide shot adds a tilt-shift band (`tilt`, 0 for none).
 */

export type Ease = 'linear' | 'smooth' | 'sineInOut' | 'cubicInOut' | 'quartOut';

/** A range of a beat's scroll progress, and the curve that eases it. */
export interface Span {
  readonly from: number;
  readonly to: number;
  readonly ease: Ease;
}

/** Depth of field: how wide the sharp zone is around the subject (world units, scaled by its
 * distance), how strongly the rest blurs (0 to 1), and the tilt-shift band on wide shots. */
export interface Focus {
  readonly depth: number;
  readonly blur: number;
  readonly tilt: number;
}

type Vec3 = readonly [number, number, number];

/** The overview camera's resting place, over the findings at the end of the descent. The close view
 * of a chosen building faces the wall that looks towards it. */
const OVERVIEW: Vec3 = [26, 27, 50];

export const SHOTS = {
  /**
   * The descent and the backlog: from high above down into the night city, ending on a slow
   * crane down over the findings while the backlog text sits beside them. Keyframes are points on
   * the descent's scroll progress (`at`) with a position, a target and a time of day (0 day,
   * 1 night).
   */
  descent: {
    keyframes: [
      // High above the city, looking down at it through the tear in the clouds (tear.ts). It is already
      // night down there: the day is the deck between the visitor and the city.
      { at: 0, position: [24, 150, 112], target: [-52, 2, 14], phase: 1 },
      // Falling through the tear, the city rising to meet the camera
      { at: 0.16, position: [25, 122, 98], target: [-34, 4, 2], phase: 1 },
      { at: 0.34, position: [26, 88, 84], target: [-12, 7, -6], phase: 1 },
      // Below the clouds, the city all around
      { at: 0.52, position: [28, 58, 72], target: [-4, 9, -6], phase: 1 },
      // The backlog: high over the findings at night, the crane starts down
      { at: 0.72, position: [32, 40, 62], target: [0, 9, -8], phase: 1 },
      // ...and settles low over the rooftops as the text arrives
      { at: 1, position: OVERVIEW, target: [0, 8, -8], phase: 1 },
    ] as ReadonlyArray<{ at: number; position: Vec3; target: Vec3; phase: number }>,
    /** Over the city a wide screen looks this far left of the findings, so the text has quiet
     * ground; a tall one rises this high instead, findings above the text. */
    aside: 14,
    rise: 16,
    /** The resting overview, and where on the descent's progress the camera comes over the city
     * (the blur grows and the screen shifts to leave room for the text). */
    overview: OVERVIEW,
    overCity: { from: 0.55, to: 0.78, ease: 'smooth' } satisfies Span,
    focus: { depth: 60, blur: 0.55, tilt: 0.8 } satisfies Focus,
  },

  /** Choosing: a dolly in from the overview onto the crack of the chosen building. */
  pick: {
    enter: { from: 0, to: 0.55, ease: 'sineInOut' } satisfies Span,
    /** Distance from the crack: (h * perHeight + base), a little further on a tall screen. */
    distance: { perHeight: 1, base: 8, tall: 1.15 },
    /** Where the camera stands, as parts of that distance: out from the wall, up, and along it. */
    offset: { out: 0.82, up: 0.42, along: 0.3 },
    /** The crack sits this far up the building; on a tall screen the view looks this much lower. */
    aim: 0.55,
    tallDrop: 0.24,
    focus: { depth: 10, blur: 0.8, tilt: 0 } satisfies Focus,
  },

  /** The failing test: the dolly keeps creeping in on the crack while the test runs. */
  reproduce: {
    move: { from: 0, to: 1, ease: 'sineInOut' } satisfies Span,
    /** The camera ends this fraction of the way closer to the crack. */
    closer: 0.22,
    focus: { depth: 8, blur: 0.9, tilt: 0 } satisfies Focus,
  },

  /** The sandbox: back to see the whole volume, then a slow orbit around it with the scroll. */
  sandbox: {
    /** The pull back to the sandbox view, against the volume's drop (0 to 1, not eased). */
    enter: { from: 0, to: 0.8, ease: 'sineInOut' } satisfies Span,
    move: { from: 0.1, to: 1, ease: 'linear' } satisfies Span,
    /** Distance (h * perHeight + base), part of it out and part up, and the orbit over the beat
     * (radians, centred on the view down the street, so no neighbour swings across the building). */
    distance: { perHeight: 1.25, base: 18, out: 0.86, up: 0.5 },
    orbit: -0.4,
    /** While the sandbox is up, the view also sways to and fro by this much (radians) with this
     * period (seconds). It is the one thing that moves on the clock, so it is small and bounded. */
    sway: { amplitude: 0.05, period: 18 },
    tallDrop: 0.22,
    focus: { depth: 14, blur: 0.75, tilt: 0 } satisfies Focus,
  },

  /** The gates: riding behind the fix as it pushes through them, then out to the side. */
  gates: {
    /** The camera moves in behind the fix as the gates' panel arrives, and pulls out to the side as
     * the fix passes the last gate. Ranges are of the section's progress (lib/gates.ts). */
    chaseIn: { from: -0.35, to: 0.1, ease: 'sineInOut' } satisfies Span,
    sideOut: { from: 0.5, to: 0.95, ease: 'sineInOut' } satisfies Span,
    chase: { back: 15, up: 4.5, ahead: 16, down: 1.5 },
    side: {
      wide: { out: 30, back: 44, up: 11, lift: 4 },
      tall: { out: 34, back: 62, up: 16, lift: -2 },
      /** The side view looks at this point between the rise and the end of the path. */
      at: 0.52,
    },
    focus: { depth: 12, blur: 0.8, tilt: 0 } satisfies Focus,
  },

  /** The merge: back to the sealed building, and once merged, a pull back until it stands alone. */
  merge: {
    /** The return to the sealed building starts as the merge panel slides up the screen. */
    enter: { from: -0.85, to: 0.1, ease: 'sineInOut' } satisfies Span,
    /** The pull back after the merge: how long it takes (seconds, it answers the visitor's hold),
     * how far across the ground and how high, and on a tall screen how far lower it looks. */
    pull: { seconds: 1.6, distance: 1.45, lift: 2.1, tallDrop: 2.6 },
    focus: { depth: 14, blur: 0.75, tilt: 0 } satisfies Focus,
  },

  /** The record and the results: a rise back above the whole city. */
  outro: {
    /** The rise follows the record section coming up the screen (0 as it appears, 1 as it fills
     * the screen). */
    rise: { from: 0, to: 1, ease: 'sineInOut' } satisfies Span,
    wide: { position: [38, 60, 92], target: [-6, 4, -14] } as { position: Vec3; target: Vec3 },
    tall: { position: [30, 96, 112], target: [0, 0, -12] } as { position: Vec3; target: Vec3 },
    focus: { depth: 70, blur: 0.5, tilt: 0.9 } satisfies Focus,
  },

  /**
   * The results: a turn back over the shoulder, then a flight along the row of towers at the city's
   * south edge (skyline.ts), resting at each number. A position and a target per stop; the flight
   * moves along them by whole segments over each span, eased, so it rests between spans.
   */
  results: {
    /** The take over from the rise, as the section comes up the screen. */
    take: { from: -0.24, to: -0.2, ease: 'linear' } satisfies Span,
    enter: { from: -0.24, to: 0.1, ease: 'sineInOut', segments: 3 } satisfies Span & { segments: number },
    toInconclusive: { from: 0.36, to: 0.6, ease: 'sineInOut', segments: 2 } satisfies Span & {
      segments: number;
    },
    toMerged: { from: 0.7, to: 0.84, ease: 'sineInOut', segments: 2 } satisfies Span & { segments: number },
    /** Where each number's towers light (they stay lit), and where the panel moves on to its statement. */
    stages: { verified: 0, inconclusive: 0.52, merged: 0.76 },
    shown: { inconclusive: 0.48, merged: 0.72 },
    /** With reduced motion the camera stands still at these three points of the flight. */
    stills: [0.2, 0.64, 0.95],
    focus: { depth: 16, blur: 0.6, tilt: 0 } satisfies Focus,
    wide: [
      { position: [38, 60, 92], target: [-6, 4, -14] }, // where the rise left off
      { position: [62, 52, 112], target: [120, 30, 90] }, // turning east
      { position: [58, 32, 130], target: [70, 18, 190] }, // turning south, the row ahead
      { position: [21, 15, 144], target: [13, 15, 181.5] }, // 14/16
      { position: [-15, 18, 132], target: [-23, 17, 181.5] },
      { position: [-51, 15, 144], target: [-59, 15, 181.5] }, // 2/2
      { position: [-62, 17, 140], target: [-72, 15, 181.5] },
      { position: [-76, 13, 150], target: [-84, 10, 181.5] }, // 0, and the gap
    ] as ReadonlyArray<{ position: Vec3; target: Vec3 }>,
    tall: [
      { position: [30, 96, 112], target: [0, 0, -12] },
      { position: [58, 70, 118], target: [110, 30, 90] },
      { position: [50, 46, 124], target: [50, 10, 190] },
      { position: [1, 24, 124], target: [1, 4, 181.5] },
      { position: [-28, 26, 122], target: [-28, 4, 181.5] },
      { position: [-68, 24, 124], target: [-68, 4, 181.5] },
      { position: [-77, 26, 122], target: [-79, 4, 181.5] },
      { position: [-88, 22, 124], target: [-88, 2, 181.5] },
    ] as ReadonlyArray<{ position: Vec3; target: Vec3 }>,
  },

  /**
   * The dawn, as the visitor reaches the pilot form: the camera moves past the end of the row and
   * looks back along all of it, with the visitor's tower close by, while the sky lifts. Both follow
   * the form coming up the screen (0 as it appears, 1 as it arrives).
   */
  dawn: {
    move: { from: 0, to: 1, ease: 'sineInOut' } satisfies Span,
    sky: { from: 0.1, to: 1, ease: 'smooth' } satisfies Span,
    /** How far along the sign lights, and how far back it clears. */
    signOn: 0.45,
    signOff: 0.2,
    wide: { position: [-170, 22, 130], target: [-115, 19, 153.4] } as { position: Vec3; target: Vec3 },
    tall: { position: [-118, 20, 118], target: [-122, 8, 181.5] } as { position: Vec3; target: Vec3 },
    focus: { depth: 70, blur: 0.45, tilt: 0 } satisfies Focus,
  },

  /**
   * The tear in the clouds, the first thing on the page (tear.ts). Sizes are shares of the screen's
   * height; `home` is where the tear rests (0 to 1, from the bottom left), and it leans `follow` of the
   * way towards the pointer. Scrolling opens it (`fall`) until the deck has gone (`clear`): both are
   * ranges of the descent's progress.
   */
  tear: {
    home: [0.755, 0.3],
    follow: 0.28,
    chase: 3.2,
    radius: 0.38,
    /** How much further the torn edge can reach than the radius, for drawing the city only inside it. */
    edgeReach: 0.5,
    ripSeconds: 1.5,
    fallRadius: 2.6,
    fall: { from: 0, to: 0.12, ease: 'cubicInOut' } satisfies Span,
    /** The first screen's words fade early in the fall, while there is still deck under them. */
    wordsFade: { from: 0.005, to: 0.045, ease: 'smooth' } satisfies Span,
    clear: { from: 0.09, to: 0.13, ease: 'smooth' } satisfies Span,
    /** The findings burn in the first view, then go dark for the scanner's line to find them. */
    embers: { from: 0.16, to: 0.34, ease: 'smooth' } satisfies Span,
    /** A visitor from Nexarise sees the deck whole for this long before it rips (seconds). */
    arrivalHold: 1,
  },
} as const;

const EASES: Record<Ease, (t: number) => number> = {
  linear: (t) => t,
  smooth: (t) => t * t * (3 - 2 * t),
  sineInOut: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  cubicInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  quartOut: (t) => 1 - (1 - t) ** 4,
};

/** How far through `span` the beat's progress `p` is, eased: 0 before it, 1 after. */
export function along(span: Span, p: number): number {
  const t = Math.min(Math.max((p - span.from) / (span.to - span.from), 0), 1);
  return EASES[span.ease](t);
}

/** An ease by name, for blends the world drives from its own amounts. */
export function ease(name: Ease, t: number): number {
  return EASES[name](Math.min(Math.max(t, 0), 1));
}
