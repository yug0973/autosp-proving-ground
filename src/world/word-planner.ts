/**
 * Chooses the tower a word goes on, as seen from a camera: among the towers roughly in view, the
 * one where the word gets the biggest pixel for its distance, with most of its pixels on screen
 * and in plain sight (no other building in the way), at the crown of the tower where neighbours
 * hide it least. The same code serves the page and the tests.
 *
 * `planWord` is a generator that yields now and then, so the page can run it a few milliseconds a
 * frame instead of stalling for the ray tests; `finish` runs one to the end.
 */
import { Vector3 } from 'three';
import type { PerspectiveCamera } from 'three';
import type { BuildingInfo } from './city';
import { facePoint, planText } from './display';
import type { TextPlan } from './display';

export interface WordChoice {
  readonly building: BuildingInfo;
  readonly plan: TextPlan;
  /** From the camera to the middle of the tower. */
  readonly distance: number;
  /** The share of the word's pixels that are on screen and in plain sight. */
  readonly share: number;
  /** The renderer clears the buildings in the way of the focused building, so for a word on it
   * nothing is in the way, however the boxes lie. */
  readonly ignoresOcclusion?: boolean;
}

export interface PlannerOptions {
  /** Towers lower than this are not considered (world units). */
  readonly minTop?: number;
  readonly minDistance?: number;
  readonly maxDistance?: number;
  /** How many of the best-looking candidates to look at, and how many of those to check in full. */
  readonly candidates?: number;
  readonly examine?: number;
  /** The least share of the pixels that must be in plain sight. */
  readonly minShare?: number;
  /** Where the word may not go: false for a point of the screen (-1 to 1 each way) that belongs to
   * the page's text, a panel, or the beat's own subject. */
  readonly keepClear?: (x: number, y: number) => boolean;
  /** How far the camera focuses: a tower much further than that is blurred by the depth of field,
   * so a word there is a smear and ranks lower. */
  readonly focusDistance?: number;
  /** The smallest pixel, in world units, a word may be drawn with (display.ts `minPitch`). */
  readonly minPitch?: number;
  /** For a word on the focused building: see WordChoice. */
  readonly ignoreOcclusion?: boolean;
}

/** A box of the city that can stand in the way, stored flat so a ray test allocates nothing. */
export interface Occluders {
  readonly count: number;
  readonly bounds: Float32Array; // minX, minY, minZ, maxX, maxY, maxZ for each
  readonly building: Int32Array;
  readonly tier: Int32Array;
}

export function createOccluders(buildings: readonly BuildingInfo[]): Occluders {
  const boxes = buildings.flatMap((building) =>
    [...building.tiers, ...(building.roofBoxes ?? [])].map((tier) => ({ building: building.index, tier })),
  );
  const bounds = new Float32Array(boxes.length * 6);
  const building = new Int32Array(boxes.length);
  const tier = new Int32Array(boxes.length);
  boxes.forEach((box, i) => {
    const { tier: t } = box;
    bounds.set([t.x - t.w / 2, t.y0, t.z - t.d / 2, t.x + t.w / 2, t.y0 + t.h, t.z + t.d / 2], i * 6);
    building[i] = box.building;
    tier[i] = t.tier;
  });
  return { count: boxes.length, bounds, building, tier };
}

/** Whether the segment from `from` to `to` passes through a box other than `skip`'s own tier, ending
 * a little short of `to` so the surface it lands on does not count. */
export function blocked(
  occluders: Occluders,
  from: Vector3,
  to: Vector3,
  skipBuilding: number,
  skipTier: number,
): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dy, dz);
  const last = 1 - 0.2 / length;
  const b = occluders.bounds;
  for (let i = 0; i < occluders.count; i += 1) {
    if (occluders.building[i] === skipBuilding && occluders.tier[i] === skipTier) continue;
    const k = i * 6;
    let near = 0;
    let far = last;
    // each pair of faces cuts the segment to the part between them
    let t1 = (b[k] ?? 0) - from.x;
    let t2 = (b[k + 3] ?? 0) - from.x;
    if (Math.abs(dx) < 1e-9) {
      if (t1 > 0 || t2 < 0) continue;
    } else {
      t1 /= dx;
      t2 /= dx;
      near = Math.max(near, Math.min(t1, t2));
      far = Math.min(far, Math.max(t1, t2));
      if (near > far) continue;
    }
    t1 = (b[k + 1] ?? 0) - from.y;
    t2 = (b[k + 4] ?? 0) - from.y;
    if (Math.abs(dy) < 1e-9) {
      if (t1 > 0 || t2 < 0) continue;
    } else {
      t1 /= dy;
      t2 /= dy;
      near = Math.max(near, Math.min(t1, t2));
      far = Math.min(far, Math.max(t1, t2));
      if (near > far) continue;
    }
    t1 = (b[k + 2] ?? 0) - from.z;
    t2 = (b[k + 5] ?? 0) - from.z;
    if (Math.abs(dz) < 1e-9) {
      if (t1 > 0 || t2 < 0) continue;
    } else {
      t1 /= dz;
      t2 /= dz;
      near = Math.max(near, Math.min(t1, t2));
      far = Math.min(far, Math.max(t1, t2));
      if (near > far) continue;
    }
    return true;
  }
  return false;
}

/** Whether a world point lands on screen (inside `margin` of the edges, 1 being the edge) and, when
 * `allowed` is given, where the word may go. */
export function onScreen(
  camera: PerspectiveCamera,
  spot: Vector3,
  margin: number,
  allowed?: (x: number, y: number) => boolean,
): boolean {
  const ndc = spot.clone().project(camera);
  if (Math.abs(ndc.x) >= margin || Math.abs(ndc.y) >= margin || ndc.z >= 1) return false;
  return allowed ? allowed(ndc.x, ndc.y) : true;
}

/** The world position of the centre of every pixel of a planned word, row by row from the top. */
export function pixelCentres(choice: WordChoice): Vector3[] {
  const { placement, bitmap } = choice.plan;
  const tier = choice.building.tiers.find((t) => t.tier === placement.tier);
  if (!tier) return [];
  const spots: Vector3[] = [];
  for (let row = 0; row < bitmap.rows; row += 1) {
    for (let col = 0; col < bitmap.cols; col += 1) {
      const u = placement.u + (col + 0.5) * placement.pitch;
      const y = placement.y + (bitmap.rows - row - 0.5) * placement.pitch;
      spots.push(new Vector3(...facePoint(tier, placement.face, u, y)));
    }
  }
  return spots;
}

/** Which of a word's pixels are on screen and in plain sight from `camera`. */
export function visiblePixels(
  occluders: Occluders,
  camera: PerspectiveCamera,
  choice: Pick<WordChoice, 'building' | 'plan' | 'ignoresOcclusion'>,
  spots: readonly Vector3[],
  allowed?: (x: number, y: number) => boolean,
): boolean[] {
  const { placement } = choice.plan;
  return spots.map(
    (spot) =>
      onScreen(camera, spot, 0.97, allowed) &&
      (choice.ignoresOcclusion === true ||
        !blocked(occluders, camera.position, spot, choice.building.index, placement.tier)),
  );
}

/** Pixels checked between yields. */
const SLICE = 24;

/**
 * Plans `text` as seen from `camera` (which must stay as it is: pass a snapshot). Returns the best
 * tower, or null when none has room for the word, mostly in plain sight.
 */
export function* planWord(
  text: string,
  camera: PerspectiveCamera,
  buildings: readonly BuildingInfo[],
  occluders: Occluders,
  options: PlannerOptions = {},
): Generator<void, WordChoice | null, void> {
  const { keepClear, focusDistance, minPitch, ignoreOcclusion = false } = options;
  // a tower far beyond the focus is blurred, so its word is worth less
  const sharpness = (distance: number): number =>
    focusDistance ? 1 / (1 + Math.max(0, distance - focusDistance * 1.5) / focusDistance) : 1;
  const {
    minTop = 14,
    minDistance = 15,
    maxDistance = 140,
    candidates = 60,
    examine = 4,
    minShare = 0.6,
  } = options;
  camera.updateMatrixWorld();
  const point = new Vector3();

  const ranked: Array<{ building: BuildingInfo; distance: number; plan: TextPlan }> = [];
  for (const building of buildings) {
    const base = building.tiers[0];
    if (!base || building.reserved || building.top < minTop) continue;
    const distance = point.set(base.x, building.top * 0.6, base.z).distanceTo(camera.position);
    if (distance < minDistance || distance > maxDistance || !onScreen(camera, point, 1.2)) continue;
    // at the crown, where neighbours hide it least
    const plan = planText(text, building.index, building.tiers, camera.position, {
      anchor: 1,
      ...(minPitch === undefined ? {} : { minPitch }),
    });
    if (plan) ranked.push({ building, distance, plan });
  }
  const worth = (c: { distance: number; plan: TextPlan }): number =>
    (c.plan.placement.pitch / c.distance) * sharpness(c.distance);
  ranked.sort((a, b) => worth(b) - worth(a));
  yield;

  let best: WordChoice | null = null;
  let bestScore = 0;
  let examined = 0;
  for (const candidate of ranked.slice(0, candidates)) {
    const { placement, bitmap } = candidate.plan;
    const tier = candidate.building.tiers.find((t) => t.tier === placement.tier);
    if (!tier) continue;
    // a quick look first, nine points over the word, to drop the ones that cannot be seen
    let seen = 0;
    for (const fx of [0.05, 0.5, 0.95]) {
      for (const fy of [0.05, 0.5, 0.95]) {
        const spot = point.set(
          ...facePoint(
            tier,
            placement.face,
            placement.u + bitmap.cols * fx * placement.pitch,
            placement.y + bitmap.rows * fy * placement.pitch,
          ),
        );
        if (
          onScreen(camera, spot, 0.97, keepClear) &&
          (ignoreOcclusion || !blocked(occluders, camera.position, spot, candidate.building.index, tier.tier))
        )
          seen += 1;
      }
    }
    yield;
    if (seen < 5) continue;
    examined += 1;
    // then every pixel of those that can
    const choice = { building: candidate.building, plan: candidate.plan, ignoresOcclusion: ignoreOcclusion };
    const spots = pixelCentres({ ...choice, distance: candidate.distance, share: 0 });
    const visible: boolean[] = [];
    for (let i = 0; i < spots.length; i += SLICE) {
      visible.push(...visiblePixels(occluders, camera, choice, spots.slice(i, i + SLICE), keepClear));
      yield;
    }
    const share = visible.filter(Boolean).length / Math.max(visible.length, 1);
    const score = share * worth(candidate);
    if (share >= minShare && score > bestScore) {
      bestScore = score;
      best = { ...choice, distance: candidate.distance, share };
    }
    if (examined >= examine) break;
  }
  return best;
}

/** Runs a planner to the end at once (reduced motion, and the tests). */
export function finish<T>(generator: Generator<void, T, void>): T {
  for (;;) {
    const step = generator.next();
    if (step.done) return step.value;
  }
}
