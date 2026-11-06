/**
 * Facade displays: any tower's wall can show a bitmap (a word, a number) in its own windows.
 *
 * A display belongs to one tier and one face of a building, and covers a rectangle of it with
 * square pixels (its pitch, usually one storey). The facade shader (shaders/display.glsl) reads
 * the display's state from a few uniforms and its bitmap from one small atlas texture, and inside
 * the rectangle it replaces the windows: a lit pixel is a lit window in the display's colour, a
 * dark pixel a dark one. Windows turn on in a ripple that runs out from a point, and turn off the
 * same way in reverse. White is neutral, lime sealed, orange an open finding and amber needs a
 * person (colour carries meaning: never use one as decoration).
 *
 *     const display = displays.claim();
 *     display.place({ building, tier, face, u, y, pitch });   // or planText() to choose them
 *     display.setBitmap(renderText('BACKLOG', { layout: 'stack' }));
 *     display.setTone('neutral');
 *     display.to(1, 1.2);     // the windows ripple on over 1.2 seconds
 *     display.to(0, 0.8);     // and off again
 *     display.set(0.5);       // or drive the ripple from the scroll
 *
 * With reduced motion (`still`) every change is instant. Changing a bitmap re-uploads the atlas
 * (128 kB), so do it when the text changes, not every frame; the ripple costs nothing to move.
 */
import { DataTexture, NearestFilter, RedFormat, UnsignedByteType, Vector4 } from 'three';
import type { IUniform, Texture } from 'three';
import type { WorldPalette } from './palette';
import { GRID } from './grid';
import { renderText } from './display-font';
import type { DisplayBitmap, TextLayout, TextOptions } from './display-font';

/** How many displays can stand at once, and the largest bitmap one can hold (pixels each way). */
export const DISPLAY = { slots: 8, size: 128 } as const;

export type DisplayTone = 'neutral' | 'sealed' | 'open' | 'amber';
/** The four faces of a box: +x, -x, +z, -z. */
export type FaceId = 1 | 2 | 3 | 4;

/** Where a display stands. `u` is how far its left edge is from the face's left edge as seen from
 * outside, and `y` the world height of its bottom row. */
export interface DisplayPlacement {
  readonly building: number;
  readonly tier: number;
  readonly face: FaceId;
  readonly u: number;
  readonly y: number;
  readonly pitch: number;
}

/** A box of a building: centre in plan, size, and where it stands on the ground. */
export interface TierGeometry {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly y0: number;
  readonly h: number;
}

export interface DisplayUniforms {
  uDispA: IUniform<Vector4[]>;
  uDispB: IUniform<Vector4[]>;
  uDispC: IUniform<Vector4[]>;
  uDispD: IUniform<Vector4[]>;
  uDispTex: IUniform<Texture>;
}

export interface DisplayHandle {
  readonly slot: number;
  /** 0 (all windows as they were) to 1 (the whole bitmap shown), as of the last update. */
  readonly reveal: number;
  place(placement: DisplayPlacement): void;
  /** Replaces the bitmap; throws if it is larger than DISPLAY.size each way. */
  setBitmap(bitmap: DisplayBitmap): void;
  setTone(tone: DisplayTone): void;
  /** Where the ripple starts, in pixels from the bottom left. Defaults to the middle. */
  setOrigin(x: number, y: number): void;
  /** Ripples to `target` (1 on, 0 off) over `seconds`; at once with reduced motion or 0 seconds. */
  to(target: 0 | 1, seconds?: number): void;
  /** Sets the ripple's progress, 0 to 1, straight away: for a move driven by the scroll. */
  set(reveal: number): void;
  /** Gives the slot back; the windows return to normal. */
  release(): void;
}

export interface FacadeDisplays {
  readonly uniforms: DisplayUniforms;
  /** Takes a free slot, or returns null when all of them are in use. */
  claim(): DisplayHandle | null;
  /** Moves the ripples on by `dt` seconds. */
  update(dt: number): void;
  /** Called when something changed that needs a new frame (reduced motion draws on demand). */
  onChange(listener: () => void): void;
  /** Called when a slot's place changes: where it was (or null) and where it is now (or null). The
   * city uses it to mark which faces carry a display, so the shader looks only there. */
  onPlacement(
    listener: (slot: number, from: DisplayPlacement | null, to: DisplayPlacement | null) => void,
  ): void;
  /** For tests (?test): what each claimed slot holds. */
  inspect(): ReadonlyArray<Record<string, unknown>>;
  dispose(): void;
}

interface Slot {
  claimed: boolean;
  placement: DisplayPlacement | null;
  bitmap: DisplayBitmap | null;
  tone: DisplayTone;
  origin: { x: number; y: number } | null;
  reveal: number;
  target: number;
  /** Reveal a second, while it moves towards `target`. */
  rate: number;
}

export function createFacadeDisplays(palette: WorldPalette, still: boolean): FacadeDisplays {
  const side = DISPLAY.size;
  const atlas = new Uint8Array(side * side * DISPLAY.slots);
  const texture = new DataTexture(atlas, side, side * DISPLAY.slots, RedFormat, UnsignedByteType);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;

  const make = (): Vector4[] => Array.from({ length: DISPLAY.slots }, () => new Vector4());
  const uniforms: DisplayUniforms = {
    uDispA: { value: make() },
    uDispB: { value: make() },
    uDispC: { value: make() },
    uDispD: { value: make() },
    uDispTex: { value: texture },
  };
  const tones: Record<DisplayTone, { r: number; g: number; b: number }> = {
    neutral: palette.pixelLit,
    sealed: palette.sealed,
    open: palette.open,
    amber: palette.hold,
  };

  const slots: Slot[] = Array.from({ length: DISPLAY.slots }, () => ({
    claimed: false,
    placement: null,
    bitmap: null,
    tone: 'neutral',
    origin: null,
    reveal: 0,
    target: 0,
    rate: 0,
  }));
  const listeners: Array<() => void> = [];
  const placers: Array<(slot: number, from: DisplayPlacement | null, to: DisplayPlacement | null) => void> =
    [];
  const placed = (n: number, from: DisplayPlacement | null, to: DisplayPlacement | null): void => {
    for (const placer of placers) placer(n, from, to);
  };
  const changed = (): void => {
    for (const listener of listeners) listener();
  };

  /** Writes one slot's state into the uniforms. */
  function write(n: number): void {
    const slot = slots[n];
    const a = uniforms.uDispA.value[n];
    const b = uniforms.uDispB.value[n];
    const c = uniforms.uDispC.value[n];
    const d = uniforms.uDispD.value[n];
    if (!slot || !a || !b || !c || !d) return;
    const { placement, bitmap } = slot;
    if (!slot.claimed || !placement || !bitmap || bitmap.cols === 0) {
      a.set(-1, 0, 0, 1); // no building has index -1, so the shader never matches it
      b.set(0, 0, 1, 1);
      c.set(0, 0, 0, 0);
      return;
    }
    a.set(placement.building, placement.face, placement.tier, placement.pitch);
    b.set(placement.u, placement.y, bitmap.cols, bitmap.rows);
    c.set(slot.reveal, slot.origin?.x ?? bitmap.cols / 2, slot.origin?.y ?? bitmap.rows / 2, 0);
    const tone = tones[slot.tone];
    d.set(tone.r, tone.g, tone.b, 0);
  }

  function handle(n: number): DisplayHandle {
    const slot = slots[n] as Slot;
    return {
      slot: n,
      get reveal() {
        return slot.reveal;
      },
      place(placement) {
        placed(n, slot.placement, placement);
        slot.placement = placement;
        write(n);
        changed();
      },
      setBitmap(bitmap) {
        if (bitmap.cols > side || bitmap.rows > side) {
          throw new RangeError(
            `A display holds at most ${String(side)} by ${String(side)} pixels, not ${String(bitmap.cols)} by ${String(bitmap.rows)}.`,
          );
        }
        if (bitmap.data.length !== bitmap.cols * bitmap.rows) {
          throw new RangeError('The bitmap has the wrong number of pixels for its size.');
        }
        const base = n * side * side;
        atlas.fill(0, base, base + side * side);
        for (let row = 0; row < bitmap.rows; row += 1) {
          for (let col = 0; col < bitmap.cols; col += 1) {
            atlas[base + row * side + col] = bitmap.data[row * bitmap.cols + col] ? 255 : 0;
          }
        }
        texture.needsUpdate = true;
        slot.bitmap = bitmap;
        write(n);
        changed();
      },
      setTone(tone) {
        slot.tone = tone;
        write(n);
        changed();
      },
      setOrigin(x, y) {
        slot.origin = { x, y };
        write(n);
        changed();
      },
      to(target, seconds = 1) {
        slot.target = target;
        if (still || seconds <= 0) {
          slot.reveal = target;
          slot.rate = 0;
        } else {
          slot.rate = 1 / seconds;
        }
        write(n);
        changed();
      },
      set(reveal) {
        slot.reveal = Math.min(Math.max(reveal, 0), 1);
        slot.target = slot.reveal;
        slot.rate = 0;
        write(n);
        changed();
      },
      release() {
        placed(n, slot.placement, null);
        slot.claimed = false;
        slot.placement = null;
        slot.bitmap = null;
        slot.reveal = 0;
        slot.target = 0;
        slot.rate = 0;
        write(n);
        changed();
      },
    };
  }

  slots.forEach((_, n) => {
    write(n);
  });

  return {
    uniforms,
    claim() {
      const n = slots.findIndex((slot) => !slot.claimed);
      const slot = slots[n];
      if (!slot) return null;
      slot.claimed = true;
      slot.tone = 'neutral';
      slot.origin = null;
      slot.reveal = 0;
      slot.target = 0;
      slot.rate = 0;
      return handle(n);
    },
    update(dt) {
      slots.forEach((slot, n) => {
        if (!slot.claimed || slot.reveal === slot.target) return;
        const step = slot.rate * dt;
        slot.reveal =
          slot.reveal < slot.target
            ? Math.min(slot.reveal + step, slot.target)
            : Math.max(slot.reveal - step, slot.target);
        write(n);
      });
    },
    onChange(listener) {
      listeners.push(listener);
    },
    onPlacement(listener) {
      placers.push(listener);
    },
    inspect() {
      return slots.flatMap((slot, n) =>
        slot.claimed
          ? [
              {
                slot: n,
                placement: slot.placement,
                cols: slot.bitmap?.cols ?? 0,
                rows: slot.bitmap?.rows ?? 0,
                lit: slot.bitmap ? slot.bitmap.data.reduce((sum, bit) => sum + bit, 0) : 0,
                atlasLit: atlas
                  .slice(n * side * side, (n + 1) * side * side)
                  .reduce((sum, v) => sum + (v ? 1 : 0), 0),
                tone: slot.tone,
                reveal: slot.reveal,
              },
            ]
          : [],
      );
    },
    dispose() {
      texture.dispose();
    },
  };
}

// --- Placement -----------------------------------------------------------------------------

/** Width of a tier's face: the x faces are as wide as the tier is deep. */
export function faceWidth(tier: TierGeometry, face: FaceId): number {
  return face <= 2 ? tier.d : tier.w;
}

/** The face whose outward normal points most towards `from` (a point in plan). */
export function faceTowards(tier: TierGeometry, from: { readonly x: number; readonly z: number }): FaceId {
  const dx = from.x - tier.x;
  const dz = from.z - tier.z;
  if (Math.abs(dx) >= Math.abs(dz)) return dx >= 0 ? 1 : 2;
  return dz >= 0 ? 3 : 4;
}

/** The world position of a point on a face: `u` along it from the viewer's left, at height `y`. */
export function facePoint(tier: TierGeometry, face: FaceId, u: number, y: number): [number, number, number] {
  switch (face) {
    case 1:
      return [tier.x + tier.w / 2, y, tier.z + tier.d / 2 - u];
    case 2:
      return [tier.x - tier.w / 2, y, tier.z - tier.d / 2 + u];
    case 3:
      return [tier.x - tier.w / 2 + u, y, tier.z + tier.d / 2];
    default:
      return [tier.x + tier.w / 2 - u, y, tier.z - tier.d / 2];
  }
}

export interface FitOptions {
  /** Clear wall to keep at each side, in world units. */
  readonly margin?: number;
  /** The largest pixel; one storey by default, so a pixel is a window. */
  readonly maxPitch?: number;
  /** Below this a pixel is too small to read from the beats' distances; fitting fails instead. */
  readonly minPitch?: number;
  /** Where in the free height the bitmap stands: 0 at the bottom, 1 at the top. */
  readonly anchor?: number;
}

/** What is left clear at the foot of a tier (the shop fronts) and under its parapet. */
const FOOT = GRID.floor * 2.2;
const HEAD = GRID.floor;

/** Fits a bitmap on a face: the largest square pixel that fits, centred across and snapped to a
 * floor line when the pixel is a storey. Null when the pixel would be smaller than `minPitch`. */
export function fitOnFace(
  tier: TierGeometry,
  face: FaceId,
  bitmap: DisplayBitmap,
  options: FitOptions = {},
): { u: number; y: number; pitch: number } | null {
  const { margin = 0.5, maxPitch = GRID.floor, minPitch = 0.3, anchor = 0.5 } = options;
  if (bitmap.cols === 0 || bitmap.rows === 0) return null;
  const width = faceWidth(tier, face) - margin * 2;
  const bottom = Math.max(tier.y0 + FOOT, FOOT);
  const top = tier.y0 + tier.h - HEAD;
  const pitch = Math.min(maxPitch, width / bitmap.cols, (top - bottom) / bitmap.rows);
  if (!(pitch >= minPitch)) return null;
  const u = (faceWidth(tier, face) - bitmap.cols * pitch) / 2;
  const free = top - bottom - bitmap.rows * pitch;
  let y = bottom + free * Math.min(Math.max(anchor, 0), 1);
  if (Math.abs(pitch - GRID.floor) < 1e-6) {
    // rows of windows stand at whole storeys from the ground (facade.frag.glsl), so line up with them
    y = Math.min(Math.max(Math.round(y / GRID.floor) * GRID.floor, bottom), bottom + free);
  }
  return { u, y, pitch };
}

export interface TextPlan {
  readonly placement: DisplayPlacement;
  readonly bitmap: DisplayBitmap;
  readonly layout: TextLayout;
}

export interface PlanOptions extends FitOptions {
  /** The layouts to try; the one that gives the largest pixel wins. Both by default. */
  readonly layouts?: readonly TextLayout[];
  readonly text?: Omit<TextOptions, 'layout'>;
}

/**
 * Chooses where a word goes on a building, as seen from `from`: on each tier, on the face that
 * looks towards `from`, in a row and stacked, and keeps the arrangement with the largest pixel
 * (then the highest). Null when no arrangement leaves a pixel big enough to read.
 */
export function planText(
  text: string,
  building: number,
  tiers: ReadonlyArray<TierGeometry & { readonly tier: number }>,
  from: { readonly x: number; readonly z: number },
  options: PlanOptions = {},
): TextPlan | null {
  const { layouts = ['stack', 'row'], text: textOptions, ...fit } = options;
  let best: TextPlan | null = null;
  for (const layout of layouts) {
    const bitmap = renderText(text, { ...textOptions, layout });
    if (bitmap.cols > DISPLAY.size || bitmap.rows > DISPLAY.size) continue;
    for (const tier of tiers) {
      const face = faceTowards(tier, from);
      const fitted = fitOnFace(tier, face, bitmap, fit);
      if (!fitted) continue;
      if (
        !best ||
        fitted.pitch > best.placement.pitch + 1e-6 ||
        (Math.abs(fitted.pitch - best.placement.pitch) <= 1e-6 && fitted.y > best.placement.y)
      ) {
        best = { placement: { building, tier: tier.tier, face, ...fitted }, bitmap, layout };
      }
    }
  }
  return best;
}
