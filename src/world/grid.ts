/**
 * The street grid, Manhattan style: long blocks running east-west (x), wide one-way avenues
 * between them running north-south (z), narrow one-way cross streets between them running
 * east-west. One world unit is about three metres; a storey is FLOOR units tall.
 *
 * Everything laid out on the grid (lots, streetlights, traffic lanes, pedestrians) reads these
 * numbers, and the shaders get the same numbers as #defines through `gridDefines`, so the
 * painted roads and the moving cars can never drift apart.
 */
import type { Quality } from './sky';

export const GRID = {
  /** A block, kerb to kerb: long along x, short along z. */
  blockX: 30,
  blockZ: 10,
  /** Road widths: avenues (between blocks along x) and streets (between blocks along z). */
  avenue: 6,
  street: 4,
  /** Sidewalk width, inside the block. */
  sidewalk: 1,
  /** Streetlights stand this far apart along every sidewalk. */
  lightSpacing: 6,
  /** One storey. Window rows and crack pixels both use it. */
  floor: 1.1,
} as const;

export const PITCH_X = GRID.blockX + GRID.avenue; // 36
export const PITCH_Z = GRID.blockZ + GRID.street; // 14

/** Blocks from the centre to the edge of the city, per axis. */
export const REACH: Record<Quality, { x: number; z: number }> = {
  high: { x: 5, z: 12 },
  low: { x: 3, z: 8 },
};

/** The length of road a car drives before it wraps round, per axis. */
export function laneLength(quality: Quality): { x: number; z: number } {
  const reach = REACH[quality];
  return { x: (reach.x * 2 + 1) * PITCH_X, z: (reach.z * 2 + 1) * PITCH_Z };
}

/** The grid's numbers as GLSL #defines, for every shader that paints or moves along the grid. */
export function gridDefines(quality: Quality): Record<string, string> {
  const lanes = laneLength(quality);
  const f = (n: number): string => n.toFixed(4);
  return {
    BLOCK_X: f(GRID.blockX),
    BLOCK_Z: f(GRID.blockZ),
    PITCH_X: f(PITCH_X),
    PITCH_Z: f(PITCH_Z),
    SIDEWALK: f(GRID.sidewalk),
    LIGHT_SPACING: f(GRID.lightSpacing),
    FLOOR: f(GRID.floor),
    LANE_LEN_X: f(lanes.x),
    LANE_LEN_Z: f(lanes.z),
  };
}

/** Every block centre on the grid. */
export function blockCentres(quality: Quality): Array<{ x: number; z: number; i: number; j: number }> {
  const reach = REACH[quality];
  const out: Array<{ x: number; z: number; i: number; j: number }> = [];
  for (let i = -reach.x; i <= reach.x; i += 1) {
    for (let j = -reach.z; j <= reach.z; j += 1) out.push({ x: i * PITCH_X, z: j * PITCH_Z, i, j });
  }
  return out;
}

/** A traffic lane: which axis it runs along, where it sits across that axis, which way and how fast. */
export interface Lane {
  readonly axis: 'x' | 'z';
  readonly at: number;
  readonly direction: 1 | -1;
  readonly speed: number;
}

/**
 * The lanes. Avenues are one-way with four lanes, alternating direction avenue by avenue; cross
 * streets are one-way with two lanes, alternating street by street, as in Manhattan.
 */
export function lanes(quality: Quality): Lane[] {
  const reach = REACH[quality];
  const out: Lane[] = [];
  for (let i = -reach.x - 1; i <= reach.x; i += 1) {
    const centre = i * PITCH_X + PITCH_X / 2;
    const direction = i % 2 === 0 ? 1 : -1;
    for (const offset of [-2.1, -0.7, 0.7, 2.1]) {
      out.push({ axis: 'z', at: centre + offset, direction, speed: 7.5 + Math.abs(offset) * 0.9 });
    }
  }
  for (let j = -reach.z - 1; j <= reach.z; j += 1) {
    const centre = j * PITCH_Z + PITCH_Z / 2;
    const direction = j % 2 === 0 ? -1 : 1;
    for (const offset of [-0.75, 0.75]) {
      out.push({ axis: 'x', at: centre + offset, direction, speed: 5 + (offset > 0 ? 0.6 : 0) });
    }
  }
  return out;
}

/** Small seeded generator (mulberry32), so the city is identical on every visit. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
