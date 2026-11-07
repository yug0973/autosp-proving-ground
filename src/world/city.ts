/**
 * The city: New York, built lot by lot on the Manhattan grid (grid.ts). Each block splits into
 * lots; each lot gets a building of one of four kinds, chosen from how close it stands to the
 * Midtown core and how low the camera flies over it:
 *
 * - walk-ups: three to six storeys of brick, with a cornice and shop fronts;
 * - pre-war blocks: brick or limestone, a setback, cornices, and often a water tank on the roof;
 * - deco towers: limestone in stepped tiers, and sometimes a spire;
 * - glass towers: a curtain wall on a stone podium, with a plant room on the roof.
 *
 * A building is a stack of boxes (its tiers and cornices), all drawn by one instanced mesh and one
 * facade shader; tanks and spires are two more instanced meshes. Some pre-war buildings carry an
 * open finding, drawn as an orange-red crack up the street-level mass and labelled with its CWE.
 * The layout comes from a fixed seed, so the city is the same on every visit.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Points,
  Scene,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { IUniform } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WorldPalette } from './palette';
import { mergeUniforms, scanUniforms } from './uniforms';
import type { DisplayUniforms, FaceId } from './display';
import type { SharedUniforms } from './uniforms';
import type { Quality } from './sky';
import { GRID, blockCentres, gridDefines, seeded } from './grid';
import { RESULTS, ROW, WALL_STATE, gapX, towerFloors, towerState, towerX } from './skyline';
import commonGlsl from './shaders/common.glsl?raw';
import fogGlsl from './shaders/fog.glsl?raw';
import mergeGlsl from './shaders/merge.glsl?raw';
import focusGlsl from './shaders/focus.glsl?raw';
import pointerGlsl from './shaders/pointer.glsl?raw';
import focusClearGlsl from './shaders/focus-clear.glsl?raw';
import displayGlsl from './shaders/display.glsl?raw';
import scanGlsl from './shaders/scan.glsl?raw';
import facadeVert from './shaders/facade.vert.glsl?raw';
import facadeFrag from './shaders/facade.frag.glsl?raw';
import propsVert from './shaders/props.vert.glsl?raw';
import propsFrag from './shaders/props.frag.glsl?raw';
import glowVert from './shaders/glow.vert.glsl?raw';
import glowFrag from './shaders/glow.frag.glsl?raw';

/** Halo points per wall of a cracked building, and how far off the wall they float. */
const GLOW = { perWall: 9, offset: 0.45, size: 3.2 } as const;

/** A building's state, as the shader reads it. */
export const BUILDING_STATE = { quiet: 0, open: 1, sealed: 2 } as const;

/** A weakness the scanner reported, standing in the city as a cracked building. */
export interface Finding {
  readonly cwe: string;
  readonly name: string;
  /** Where its label hangs: just above the building's highest point. */
  readonly anchor: Vector3;
  /** Index of the building that carries the crack. */
  readonly building: number;
  /** The street-level mass that carries the crack: footprint centre, width (x), depth (z), height. */
  readonly box: {
    readonly x: number;
    readonly z: number;
    readonly w: number;
    readonly d: number;
    readonly h: number;
  };
  /** The building's highest point, roof tank included. */
  readonly top: number;
}

/** The findings, from the first label placed to the last. The first three are the benchmark
 * categories the visitor can pick later; the rest make the backlog look like a backlog. */
const FINDINGS: ReadonlyArray<Pick<Finding, 'cwe' | 'name'>> = [
  { cwe: 'CWE-89', name: 'SQL injection' },
  { cwe: 'CWE-79', name: 'Cross-site scripting' },
  { cwe: 'CWE-639', name: 'Insecure direct object reference' },
  { cwe: 'CWE-22', name: 'Path traversal' },
  { cwe: 'CWE-918', name: 'Server-side request forgery' },
  { cwe: 'CWE-502', name: 'Unsafe deserialisation' },
  { cwe: 'CWE-798', name: 'Hard-coded credential' },
];

/** The view the labels are placed for: findings stand within this ring around FOCUS. */
const FOCUS = new Vector3(0, 0, -8);
const FINDING_RING = { min: 6, max: 44 } as const;
/** The Midtown core: towers gather here, behind the findings as the overview camera sees them. */
const CORE = { x: -12, z: -74, spread: 58 } as const;
/**
 * Height caps under the camera's path (x, z, radius, most storeys): low brownstone streets where
 * it flies low, so it never passes through a tower.
 */
const CAPS: ReadonlyArray<readonly [number, number, number, number]> = [
  [10, 92, 26, 14],
  [22, 72, 24, 7],
  [30, 56, 22, 5],
  [26, 50, 20, 5],
  [38, 92, 22, 16],
  [30, 112, 22, 20],
];
const MAX_FLOORS = 60; // keeps every roof below the lowest cloud deck

type Kind = 'walkup' | 'prewar' | 'deco' | 'glass';
const STYLE = { brick: 0, stone: 1, glass: 2, deco: 3, trim: 4 } as const;

interface Tier {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly y0: number;
  readonly h: number;
  readonly style: number;
  readonly tier: number;
}

interface Building {
  readonly index: number;
  readonly kind: Kind;
  readonly seed: number;
  readonly tiers: Tier[];
  readonly trims: Tier[];
  top: number;
  tank: { x: number; z: number; y: number } | null;
  spire: { x: number; z: number; y: number; h: number; r: number } | null;
}

function floorsCap(x: number, z: number): number {
  let cap = MAX_FLOORS;
  for (const [cx, cz, radius, floors] of CAPS) {
    if (Math.hypot(x - cx, z - cz) < radius) cap = Math.min(cap, floors);
  }
  return cap;
}

function coreWeight(x: number, z: number): number {
  const d = Math.hypot(x - CORE.x, (z - CORE.z) * 0.85);
  return Math.exp(-(d * d) / (2 * CORE.spread * CORE.spread));
}

/** Plans one building on a lot (centre x, z; width w along the block; depth d). */
function plan(
  index: number,
  kind: Kind,
  x: number,
  z: number,
  w: number,
  d: number,
  random: () => number,
): Building {
  const F = GRID.floor;
  const cap = floorsCap(x, z);
  const building: Building = {
    index,
    kind,
    seed: random() * 100,
    tiers: [],
    trims: [],
    top: 0,
    tank: null,
    spire: null,
  };
  const add = (inset: number, y0: number, floors: number, style: number): Tier => {
    const tier: Tier = {
      x,
      z,
      w: Math.max(w - inset * 2, 1.6),
      d: Math.max(d - inset * 2, 1.6),
      y0,
      h: Math.max(floors, 1) * F,
      style,
      tier: building.tiers.length,
    };
    building.tiers.push(tier);
    building.top = Math.max(building.top, y0 + tier.h);
    return tier;
  };
  const cornice = (tier: Tier, depth = 0.16): void => {
    building.trims.push({
      x: tier.x,
      z: tier.z,
      w: tier.w + depth * 2,
      d: tier.d + depth * 2,
      y0: tier.y0 + tier.h - 0.12,
      h: 0.4,
      style: STYLE.trim,
      tier: 9,
    });
  };

  if (kind === 'walkup') {
    const floors = Math.min(3 + Math.floor(random() * 4), cap);
    cornice(add(0, 0, floors, random() < 0.75 ? STYLE.brick : STYLE.stone));
  } else if (kind === 'prewar') {
    const floors = Math.min(9 + Math.floor(random() * 12), cap);
    const style = random() < 0.55 ? STYLE.brick : STYLE.stone;
    if (floors >= 12 && random() < 0.7) {
      const base = Math.round(floors * (0.6 + random() * 0.15));
      const lower = add(0, 0, base, style);
      cornice(lower, 0.22);
      cornice(add(0.7 + random() * 0.7, lower.h, floors - base, style));
    } else {
      cornice(add(0, 0, floors, style), 0.22);
    }
    const roof = building.tiers[building.tiers.length - 1];
    if (roof && random() < 0.6 && roof.w > 2.6 && roof.d > 2.6) {
      building.tank = {
        x: x + (random() - 0.5) * (roof.w - 2),
        z: z + (random() - 0.5) * (roof.d - 2),
        y: building.top,
      };
    }
  } else if (kind === 'deco') {
    const floors = Math.min(24 + Math.floor(random() * 33), cap);
    const steps = [0.42, 0.28, 0.18, 0.12];
    let base = 0;
    let inset = 0;
    steps.forEach((share, i) => {
      const tier = add(inset, base, Math.max(2, Math.round(floors * share)), STYLE.deco);
      if (i < steps.length - 1) cornice(tier, 0.12);
      base += tier.h;
      inset += 0.8 + random() * 0.6 + i * 0.25;
    });
    const crown = building.tiers[building.tiers.length - 1];
    if (crown && random() < 0.5) {
      building.spire = { x, z, y: building.top, h: 5 + random() * 9, r: Math.min(crown.w, crown.d) * 0.28 };
    }
  } else {
    const floors = Math.min(24 + Math.floor(random() * 37), cap);
    const podium = 3 + Math.floor(random() * 3);
    add(0, 0, podium, STYLE.stone);
    const tower = add(0.9 + random() * 0.8, podium * F, floors - podium, STYLE.glass);
    // the plant room on the roof
    building.trims.push({
      x,
      z,
      w: tower.w * 0.5,
      d: tower.d * 0.5,
      y0: building.top,
      h: 2 * F,
      style: STYLE.trim,
      tier: 9,
    });
    building.top += 2 * F;
  }
  return building;
}

function layOut(quality: Quality): Building[] {
  const random = seeded(0x4e4558); // "NEX"
  const buildings: Building[] = [];
  const buildX = GRID.blockX / 2 - GRID.sidewalk; // the lot line, 14 from the block centre
  const buildZ = GRID.blockZ / 2 - GRID.sidewalk; // 4
  const gap = 0.05; // a hair between neighbours so their shared walls never flicker

  for (const block of blockCentres(quality)) {
    let cursor = -buildX;
    while (cursor < buildX - 0.5) {
      const core = coreWeight(block.x + cursor, block.z);
      const cap = floorsCap(block.x + cursor, block.z);
      const t = random();
      // towers keep out of the ring the findings stand in, so their labels are never lost
      // against a tower's lit face; they gather behind it, in Midtown
      const inRing = Math.hypot(block.x + cursor - FOCUS.x, block.z - FOCUS.z) < FINDING_RING.max + 6;
      const tower = cap > 20 && t < (0.1 + core * 0.55) * (inRing ? 0.12 : 1);
      const full = tower || (cap > 8 && t < 0.3 + core * 0.3);
      let width = tower ? 6 + random() * 5 : full ? 4.5 + random() * 3.5 : 3 + random() * 4;
      if (buildX - (cursor + width) < 2.6) width = buildX - cursor; // the last lot takes what is left
      if (full) {
        const kind: Kind = tower ? (random() < 0.45 ? 'deco' : 'glass') : 'prewar';
        buildings.push(
          plan(
            buildings.length,
            kind,
            block.x + cursor + width / 2,
            block.z,
            width - gap * 2,
            buildZ * 2 - gap * 2,
            random,
          ),
        );
      } else {
        // a facing pair of frontages, each one or two buildings wide
        for (const side of [-1, 1]) {
          const first = width > 5 && random() < 0.5 ? width * (0.4 + random() * 0.2) : width;
          const parts = first < width ? [first, width - first] : [width];
          let start = cursor;
          for (const part of parts) {
            const kind: Kind = cap > 8 && random() < 0.35 + core * 0.4 ? 'prewar' : 'walkup';
            const px = block.x + start + part / 2;
            const pz = block.z + side * (buildZ / 2);
            buildings.push(plan(buildings.length, kind, px, pz, part - gap * 2, buildZ - gap * 2, random));
            start += part;
          }
        }
      }
      cursor += width;
    }
  }
  return buildings;
}

/** Picks pre-war buildings for the findings: in the ring around the focus, spread apart. */
function placeFindings(buildings: Building[]): Finding[] {
  const candidates = buildings
    .map((building) => {
      const base = building.tiers[0];
      return base ? { building, base, r: Math.hypot(base.x - FOCUS.x, base.z - FOCUS.z) } : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .filter(
      ({ building, base, r }) =>
        building.kind === 'prewar' &&
        r > FINDING_RING.min &&
        r < FINDING_RING.max &&
        base.h > 9 &&
        base.h < 28,
    );
  candidates.sort((a, b) => a.r - b.r);
  const chosen: typeof candidates = [];
  const nearest = candidates[0];
  if (nearest) chosen.push(nearest);
  while (chosen.length < FINDINGS.length && chosen.length < candidates.length) {
    let best = candidates[0];
    let bestGap = -1;
    for (const candidate of candidates) {
      let gap = Infinity;
      for (const pick of chosen)
        gap = Math.min(gap, Math.hypot(candidate.base.x - pick.base.x, candidate.base.z - pick.base.z));
      if (gap > bestGap) {
        bestGap = gap;
        best = candidate;
      }
    }
    if (!best || bestGap <= 0) break;
    chosen.push(best);
  }
  return chosen.flatMap((pick, i) => {
    const finding = FINDINGS[i];
    if (!finding) return [];
    const top = pick.building.top + (pick.building.tank ? 1.7 : 0);
    const { x, z, w, d, h } = pick.base;
    return [
      {
        ...finding,
        building: pick.building.index,
        box: { x, z, w, d, h },
        top,
        anchor: new Vector3(x, top + 2.2, z),
      },
    ];
  });
}

/** The results' row (skyline.ts), as buildings: towers, then the wall in the gap, which also carries
 * the platform they all stand on. Everything is built from the row's data, with no randomness. */
function planRow(firstIndex: number): Building[] {
  const F = GRID.floor;
  const { tower, lot, plinth } = ROW;
  const row: Building[] = [];
  for (let i = 0; i < RESULTS.runs; i += 1) {
    const x = towerX(i);
    const height = towerFloors(i) * F;
    const crown = tower.crownFloors * F;
    const inset = tower.crownInset * 2;
    const shaft: Tier = {
      x,
      z: ROW.z,
      w: tower.width,
      d: tower.depth,
      y0: 0,
      h: height,
      style: STYLE.deco,
      tier: 0,
    };
    row.push({
      index: firstIndex + i,
      kind: 'deco',
      seed: i * 7.3,
      tiers: [
        shaft,
        { ...shaft, w: tower.width - inset, d: tower.depth - inset, y0: height, h: crown, tier: 1 },
      ],
      trims: [
        {
          ...shaft,
          w: tower.width + 0.3,
          d: tower.depth + 0.3,
          y0: height - 0.12,
          h: 0.4,
          style: STYLE.trim,
          tier: 9,
        },
      ],
      top: height + crown,
      tank: null,
      spire: null,
    });
  }
  const wallHeight = lot.wallFloors * F;
  const east = towerX(0) + ROW.pitch / 2;
  const west = gapX() - lot.width / 2;
  row.push({
    index: firstIndex + RESULTS.runs,
    kind: 'walkup',
    seed: RESULTS.runs * 7.3,
    tiers: [
      {
        x: gapX(),
        z: ROW.z,
        w: lot.wallWidth,
        d: lot.wallDepth,
        y0: 0,
        h: wallHeight,
        style: STYLE.stone,
        tier: 0,
      },
    ],
    trims: [
      {
        x: (east + west) / 2,
        z: ROW.z,
        w: east - west,
        d: plinth.depth,
        y0: 0,
        h: plinth.height,
        style: STYLE.trim,
        tier: 9,
      },
    ],
    top: wallHeight,
    tank: null,
    spire: null,
  });
  const { company } = ROW;
  const companyHeight = company.floors * F;
  const companyShaft: Tier = {
    x: company.x,
    z: ROW.z,
    w: company.width,
    d: company.depth,
    y0: 0,
    h: companyHeight,
    style: STYLE.deco,
    tier: 0,
  };
  row.push({
    index: firstIndex + RESULTS.runs + 1,
    kind: 'deco',
    seed: (RESULTS.runs + 1) * 7.3,
    tiers: [
      companyShaft,
      {
        ...companyShaft,
        w: company.width - company.crownInset * 2,
        d: company.depth - company.crownInset * 2,
        y0: companyHeight,
        h: company.crownFloors * F,
        tier: 1,
      },
    ],
    trims: [],
    top: companyHeight + company.crownFloors * F,
    tank: null,
    spire: null,
  });
  return row;
}

/**
 * What stands on a roof in New York: a stair bulkhead, and the boxes of the air conditioning and lift
 * motors. Decoration on the layout, from its own seed, so the city's layout does not change. They are
 * cornice boxes, so they cost one instance each and take no part in choosing where a word goes.
 */
function dressRoofs(buildings: readonly Building[], quality: Quality): void {
  const random = seeded(0x524f4f46); // "ROOF"
  const units = quality === 'high' ? 3 : 1;
  for (const building of buildings) {
    const roof = building.tiers[building.tiers.length - 1];
    if (!roof) continue;
    const place = (w: number, d: number, h: number, inset: number): void => {
      const room = (size: number, span: number): number =>
        (random() - 0.5) * Math.max(span - size - inset * 2, 0);
      building.trims.push({
        x: roof.x + room(w, roof.w),
        z: roof.z + room(d, roof.d),
        w,
        d,
        y0: roof.y0 + roof.h,
        h,
        style: STYLE.trim,
        tier: 9,
      });
    };
    if (roof.w > 2.4 && roof.d > 2.4)
      place(0.9 + random() * 0.5, 0.9 + random() * 0.5, 1.0 + random() * 0.5, 0.3);
    const count = Math.floor(random() * (units + 1));
    for (let i = 0; i < count; i += 1) {
      if (roof.w > 1.8 && roof.d > 1.8)
        place(0.35 + random() * 0.55, 0.3 + random() * 0.45, 0.2 + random() * 0.3, 0.2);
    }
  }
}

/** A box of a building, as a facade display needs it (display.ts `TierGeometry`, and its index). */
export interface TierInfo {
  readonly tier: number;
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly y0: number;
  readonly h: number;
}

/** A building's kind, its highest point and its main boxes (cornices and plant rooms left out). */
export interface BuildingInfo {
  readonly index: number;
  readonly kind: Kind;
  readonly top: number;
  readonly tiers: readonly TierInfo[];
  /** It belongs to the results (skyline.ts): the words of other beats never go on it. */
  readonly reserved?: boolean;
  /** The bulkheads and plant on its roof: no display goes on them, but they can hide one. */
  readonly roofBoxes?: readonly TierInfo[];
}

export interface City {
  readonly group: Group;
  readonly findings: readonly Finding[];
  /** Every building, for placing facade displays. */
  readonly buildings: readonly BuildingInfo[];
  /** The results' row: one tower a run, in order, and the low wall in the gap after them. */
  readonly row: {
    readonly towers: readonly BuildingInfo[];
    readonly wall: BuildingInfo;
    /** The visitor's tower, past the gap: not one of the runs. */
    readonly company: BuildingInfo;
  };
  /** How far along the row the light has come, in towers (facade.frag.glsl). */
  setRowFront(front: number): void;
  /** Marks a face of a tier as carrying display `slot` (or none, -1): the facade shader draws the
   * display only there. The display system calls this when a display is placed or released. */
  setDisplaySlot(building: number, tier: number, face: FaceId, slot: number): void;
  /** The uniforms street furniture shares with the buildings, so it clears and dims with them. */
  readonly focus: Record<string, IUniform>;
  /** The tallest point within `radius` of (x, z): used to keep flight paths above the city. */
  heightAround(x: number, z: number, radius: number): number;
  /** Pushes in on one building: `amount` 0 to 1, `target` the point the camera looks at. `edge` is
   * whether any piece stands on the soft edge of the line of sight just now, part way out: its
   * transparent copy must be drawn, or it would not be drawn at all. */
  setFocus(building: number, amount: number, target: Vector3, edge: boolean): void;
  /** The building whose crack the pointer is over (-1 for none), and the pointer in drawing-buffer
   * pixels with how strongly cracks near it brighten (0 off). pointer.glsl. */
  setPointerGlow(hover: number, x: number, y: number, near: number, radius: number): void;
  /** One small mesh of each pushed-in variant, to compile them before the camera first needs them. */
  pushedInVariants(): Scene;
  /** Registers a mesh elsewhere (street furniture) to switch material variants with the city. */
  track(mesh: InstancedMesh, pair: MaterialPair): void;
  /** Seconds since the focused crack's test failed (large when it has not), for the pulse. */
  setPulse(seconds: number): void;
  /** How much of the focused crack the patch covers, 0 to 1. */
  setPatch(amount: number): void;
  /** The focused fix sealed (`seal` 0 or 1), and how far it is merged (0 dim to 1 full). */
  setSeal(seal: number, merge: number): void;
  /** Drawing-buffer pixels per world unit at one unit away (height / (2 tan(fov / 2))), so the
   * crack halos keep their size in the world at any resolution. */
  setViewScale(pixels: number): void;
  dispose(): void;
}

/**
 * A material in three variants sharing one set of uniforms: the plain one; the CLEARING one, which
 * leaves out the pieces standing in the camera's line of sight while it is pushed in; and the FADE
 * one, drawn over it, which draws only the pieces on their way out, truly transparent
 * (focus-clear.glsl).
 */
export interface MaterialPair {
  readonly plain: ShaderMaterial;
  readonly clearing: ShaderMaterial;
  readonly fading: ShaderMaterial;
}

export function materialPair(
  params: ConstructorParameters<typeof ShaderMaterial>[0] & {
    defines: Record<string, string>;
    vertexShader: string;
  },
  /** Defines only the pushed-in variants get: the camera is close there, and only there is it worth it. */
  close: Record<string, string> = {},
): MaterialPair {
  const withClear = { ...params, vertexShader: focusClearGlsl + params.vertexShader };
  const closeDefines = { ...params.defines, ...close, FOCUS_FADE: FOCUS_FADE.toFixed(2) };
  return {
    plain: new ShaderMaterial(params),
    clearing: new ShaderMaterial({ ...withClear, defines: { ...closeDefines, CLEARING: '' } }),
    fading: new ShaderMaterial({
      ...withClear,
      defines: { ...closeDefines, FADE: '' },
      transparent: true,
      // writes depth all the same: the pieces on their way out still hide each other properly, and
      // the depth of field reads them where they stand, not as the far city behind them (which blurred
      // them away as soon as the push began)
      depthWrite: true,
    }),
  };
}

/** How far into the push the pieces in the camera's way have finished fading out. */
const FOCUS_FADE = 0.5;

/** Where the camera spends most of the descent: building instances are drawn nearest first. */
const DRAW_FROM = { x: 26, z: 50 } as const;

/** One instanced mesh from per-instance matrices and attributes. */
export function instanced(
  geometry: BufferGeometry,
  material: ShaderMaterial,
  matrices: readonly Matrix4[],
  attributes: Record<string, { data: Float32Array; size: number }>,
): InstancedMesh {
  for (const [name, { data, size }] of Object.entries(attributes)) {
    geometry.setAttribute(name, new InstancedBufferAttribute(data, size));
  }
  const mesh = new InstancedMesh(geometry, material, Math.max(matrices.length, 1));
  matrices.forEach((matrix, i) => {
    mesh.setMatrixAt(i, matrix);
  });
  mesh.count = matrices.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

export function createCity(
  palette: WorldPalette,
  shared: SharedUniforms,
  quality: Quality,
  displays: DisplayUniforms,
): City {
  const laidOut = layOut(quality);
  const findings = placeFindings(laidOut);
  // the row goes in after the findings are chosen, and the blocks in front of it make way, so the
  // layout and every shot of the earlier beats (none of which looks south) stay exactly as they were
  const rowBuildings = planRow(Math.max(...laidOut.map((b) => b.index)) + 1);
  const buildings = [
    ...laidOut.filter((building) => {
      const base = building.tiers[0];
      return !base || base.z < ROW.clearFromZ || Math.abs(base.x) > ROW.clearReachX;
    }),
    ...rowBuildings,
  ];
  const state = new Map<number, number>(findings.map((f) => [f.building, BUILDING_STATE.open]));
  rowBuildings.forEach((building, i) => {
    state.set(building.index, i < RESULTS.runs ? towerState(i) : WALL_STATE);
  });
  const reservedFrom = rowBuildings[0]?.index ?? Infinity;
  dressRoofs(laidOut, quality);
  const target = new Vector3();
  const focus: Record<string, IUniform> = {
    uFocusIndex: { value: -1 },
    uFocus: { value: 0 },
    uFocusTarget: { value: target },
  };
  // the pointer over the cracks (pointer.glsl): shared by the facades and their halos
  const pointer = {
    uHoverIndex: { value: -1 },
    uNear: { value: new Vector3(0, 0, 0) },
    uNearRadius: { value: 180 },
  };
  const defines: Record<string, string> = {
    ...gridDefines(quality),
    ROW_RUNS: `${String(RESULTS.runs)}.0`,
  };
  const { city } = palette;

  // --- Masses and cornices: one instanced box -----------------------------------------------
  const boxes: Array<{ tier: Tier; building: Building }> = [];
  for (const building of buildings) {
    for (const tier of [...building.tiers, ...building.trims]) boxes.push({ tier, building });
  }
  // nearest first, so the depth test rejects most hidden walls before they are shaded
  boxes.sort(
    (a, b) =>
      Math.hypot(a.tier.x - DRAW_FROM.x, a.tier.z - DRAW_FROM.z) -
      Math.hypot(b.tier.x - DRAW_FROM.x, b.tier.z - DRAW_FROM.z),
  );
  const n = boxes.length;
  const size = new Float32Array(n * 3);
  const y0 = new Float32Array(n);
  const seed = new Float32Array(n);
  const buildingState = new Float32Array(n);
  const index = new Float32Array(n);
  const style = new Float32Array(n);
  const tierIndex = new Float32Array(n);
  // facade display slots, one a face of each box (+x, -x, +z, -z), -1 for none; and which box is which
  const displaySlots = new Float32Array(n * 4).fill(-1);
  const boxOf = new Map<string, number>();
  const matrices: Matrix4[] = [];
  boxes.forEach(({ tier, building }, i) => {
    size.set([tier.w, tier.h, tier.d], i * 3);
    y0[i] = tier.y0;
    seed[i] = building.seed;
    buildingState[i] = state.get(building.index) ?? BUILDING_STATE.quiet;
    index[i] = building.index;
    style[i] = tier.style;
    tierIndex[i] = tier.tier;
    if (tier.style !== STYLE.trim) boxOf.set(`${String(building.index)}:${String(tier.tier)}`, i);
    matrices.push(new Matrix4().makeScale(tier.w, tier.h, tier.d).setPosition(tier.x, tier.y0, tier.z));
  });
  const box = new BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  const facadePair = materialPair(
    {
      defines,
      uniforms: {
        ...focus,
        uBrick: { value: city.brick },
        uStone: { value: city.stone },
        uGlass: { value: city.glass },
        uDeco: { value: city.deco },
        uTrim: { value: city.trim },
        uRoof: { value: city.roof },
        uWindowDark: { value: city.windowDark },
        uWindowCool: { value: city.windowCool },
        uWindowWarm: { value: city.windowWarm },
        uStreetLight: { value: city.streetLight },
        uSky: shared.uSky,
        uOpen: { value: palette.open },
        uSealed: { value: palette.sealed },
        uHold: { value: palette.hold },
        uRowFront: { value: 0 },
        uRowVerified: { value: RESULTS.verified },
        uPixelLit: { value: palette.pixelLit },
        uFogColor: shared.uFogColor,
        uFogDensity: shared.uFogDensity,
        uAmbient: shared.uAmbient,
        uMoonLight: shared.uMoonLight,
        uGrade: shared.uGrade,
        uNight: shared.uNight,
        uTime: shared.uTime,
        ...mergeUniforms(shared),
        ...scanUniforms(shared),
        ...displays,
        ...pointer,
        uPulse: { value: 99 },
        uPatch: { value: 0 },
        uSeal: { value: 0 },
        uMerge: { value: 0 },
      },
      vertexShader: facadeVert,
      fragmentShader:
        commonGlsl + fogGlsl + mergeGlsl + focusGlsl + pointerGlsl + displayGlsl + scanGlsl + facadeFrag,
    },
    quality === 'high' ? { DETAIL: '' } : {},
  );
  const facadeMaterial = facadePair.plain;
  const masses = instanced(box, facadeMaterial, matrices, {
    aSize: { data: size, size: 3 },
    aY0: { data: y0, size: 1 },
    aSeed: { data: seed, size: 1 },
    aState: { data: buildingState, size: 1 },
    aIndex: { data: index, size: 1 },
    aStyle: { data: style, size: 1 },
    aTier: { data: tierIndex, size: 1 },
    aDisplays: { data: displaySlots, size: 4 },
  });

  // --- Roof tanks and spires: instanced props -----------------------------------------------
  const propsPair = materialPair({
    defines,
    uniforms: {
      ...focus,
      uGlow: { value: city.streetLight },
      uGlowFrom: { value: 99 },
      uNight: shared.uNight,
      uFogColor: shared.uFogColor,
      uFogDensity: shared.uFogDensity,
      uAmbient: shared.uAmbient,
      uMoonLight: shared.uMoonLight,
      uGrade: shared.uGrade,
      ...mergeUniforms(shared),
    },
    vertexShader: propsVert,
    fragmentShader: commonGlsl + fogGlsl + mergeGlsl + focusGlsl + propsFrag,
  });
  const propsMaterial = propsPair.plain;
  const tankParts = [
    new BoxGeometry(0.95, 0.34, 0.95).translate(0, 0.17, 0),
    new CylinderGeometry(0.55, 0.55, 0.9, 10).translate(0, 0.79, 0),
    new ConeGeometry(0.62, 0.42, 10).translate(0, 1.45, 0),
  ];
  const tankGeometry = mergeGeometries(tankParts);
  for (const part of tankParts) part.dispose();
  const tanked = buildings.filter((b) => b.tank);
  const tankColour = city.trim.clone().lerp(city.brick, 0.35);
  const tanks = instanced(
    tankGeometry,
    propsMaterial,
    tanked.map((b) => new Matrix4().setPosition(b.tank?.x ?? 0, b.tank?.y ?? 0, b.tank?.z ?? 0)),
    {
      aColor: {
        data: Float32Array.from(tanked.flatMap(() => [tankColour.r, tankColour.g, tankColour.b])),
        size: 3,
      },
      aIndex: { data: Float32Array.from(tanked, (b) => b.index), size: 1 },
      aEmit: { data: new Float32Array(tanked.length), size: 1 },
    },
  );
  const spired = buildings.filter((b) => b.spire);
  const spireGeometry = new ConeGeometry(1, 1, 8).translate(0, 0.5, 0);
  const spireColour = city.deco.clone().multiplyScalar(1.15);
  const spires = instanced(
    spireGeometry,
    propsMaterial,
    spired.map((b) => {
      const s = b.spire;
      return new Matrix4()
        .makeScale(s?.r ?? 1, s?.h ?? 1, s?.r ?? 1)
        .setPosition(s?.x ?? 0, s?.y ?? 0, s?.z ?? 0);
    }),
    {
      aColor: {
        data: Float32Array.from(spired.flatMap(() => [spireColour.r, spireColour.g, spireColour.b])),
        size: 3,
      },
      aIndex: { data: Float32Array.from(spired, (b) => b.index), size: 1 },
      aEmit: { data: new Float32Array(spired.length), size: 1 },
    },
  );

  // --- Halos: open cracks and sealed pixels glow into the air beside their walls ---------------
  // Soft additive points just off each wall of every cracked mass, so the glow needs no bloom pass
  // on any quality tier. They share the facade's story uniforms, so they follow the patch, the
  // pulse, the seal and the merge exactly as the crack does.
  const glowRandom = seeded(0x474c4f); // "GLO"
  const glowPositions: number[] = [];
  const glowIndex: number[] = [];
  const glowFrac: number[] = [];
  const glowSeed: number[] = [];
  for (const finding of findings) {
    const { x, z, w, d, h } = finding.box;
    const walls: Array<[number, number, number, number]> = [
      [x + w / 2 + GLOW.offset, z, 0, 1],
      [x - w / 2 - GLOW.offset, z, 0, 1],
      [x, z + d / 2 + GLOW.offset, 1, 0],
      [x, z - d / 2 - GLOW.offset, 1, 0],
    ];
    for (const [wx, wz, alongX, alongZ] of walls) {
      const span = alongX ? w : d;
      for (let k = 0; k < GLOW.perWall; k += 1) {
        const frac = 0.2 + ((k + glowRandom()) / GLOW.perWall) * 0.7;
        const across = (glowRandom() - 0.5) * span * 0.35;
        glowPositions.push(wx + across * alongX, frac * h, wz + across * alongZ);
        glowIndex.push(finding.building);
        glowFrac.push(frac);
        glowSeed.push(glowRandom());
      }
    }
  }
  const glowGeometry = new BufferGeometry();
  glowGeometry.setAttribute('position', new BufferAttribute(Float32Array.from(glowPositions), 3));
  glowGeometry.setAttribute('aIndex', new BufferAttribute(Float32Array.from(glowIndex), 1));
  glowGeometry.setAttribute('aFrac', new BufferAttribute(Float32Array.from(glowFrac), 1));
  glowGeometry.setAttribute('aSeed', new BufferAttribute(Float32Array.from(glowSeed), 1));
  const storyUniforms = facadeMaterial.uniforms as Record<'uPulse' | 'uPatch' | 'uSeal' | 'uMerge', IUniform>;
  const glowScale: IUniform<number> = { value: 1000 };
  const glowMaterial = new ShaderMaterial({
    uniforms: {
      ...scanUniforms(shared),
      ...focus,
      uPulse: storyUniforms.uPulse,
      uPatch: storyUniforms.uPatch,
      uSeal: storyUniforms.uSeal,
      uMerge: storyUniforms.uMerge,
      uOpen: { value: palette.open },
      uSealed: { value: palette.sealed },
      uNight: shared.uNight,
      uTime: shared.uTime,
      uScale: glowScale,
      ...pointer,
      ...mergeUniforms(shared),
    },
    vertexShader: glowVert,
    fragmentShader: commonGlsl + mergeGlsl + focusGlsl + pointerGlsl + scanGlsl + glowFrag,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const glow = new Points(glowGeometry, glowMaterial);
  glow.frustumCulled = false;
  glow.renderOrder = 4;

  const group = new Group();
  group.add(masses, tanks, spires, glow);
  /** The transparent copy of a mesh that the FADE variant draws, over the rest of the city. */
  const fadeCopy = (mesh: InstancedMesh, pair: MaterialPair): InstancedMesh => {
    const copy = new InstancedMesh(mesh.geometry, pair.fading, mesh.count);
    copy.instanceMatrix = mesh.instanceMatrix;
    copy.frustumCulled = false;
    copy.visible = false;
    copy.renderOrder = 3;
    group.add(copy);
    return copy;
  };
  const tracked: Array<{ mesh: InstancedMesh; pair: MaterialPair; fade: InstancedMesh }> = [
    { mesh: masses, pair: facadePair, fade: fadeCopy(masses, facadePair) },
    { mesh: tanks, pair: propsPair, fade: fadeCopy(tanks, propsPair) },
    { mesh: spires, pair: propsPair, fade: fadeCopy(spires, propsPair) },
  ];
  let clearing = false;
  let fades = false;
  const story = facadeMaterial.uniforms as Record<
    'uPulse' | 'uPatch' | 'uSeal' | 'uMerge' | 'uRowFront',
    IUniform<number>
  >;
  const shared3 = focus as Record<'uFocusIndex' | 'uFocus', IUniform<number>>;

  const info: BuildingInfo[] = buildings.map(({ index, kind, top, tiers, trims }) => ({
    index,
    kind,
    top,
    roofBoxes: trims
      .filter((trim) => trim.h > 0.45)
      .map(({ tier, x, z, w, d, y0, h }) => ({ tier, x, z, w, d, y0, h })),
    tiers: tiers.map(({ tier, x, z, w, d, y0, h }) => ({ tier, x, z, w, d, y0, h })),
    ...(index >= reservedFrom ? { reserved: true } : {}),
  }));
  const reserved = info.filter((building) => building.reserved);
  const wallInfo = reserved[RESULTS.runs];
  const companyInfo = reserved[RESULTS.runs + 1];
  if (!wallInfo || !companyInfo) throw new Error('The results row has no wall or no visitor tower.');

  return {
    group,
    findings,
    buildings: info,
    row: { towers: reserved.slice(0, RESULTS.runs), wall: wallInfo, company: companyInfo },
    setRowFront(front) {
      story.uRowFront.value = front;
    },
    setDisplaySlot(building, tier, face, slot) {
      const box = boxOf.get(`${String(building)}:${String(tier)}`);
      if (box === undefined) return;
      displaySlots[box * 4 + face - 1] = slot;
      const attribute = masses.geometry.getAttribute('aDisplays');
      attribute.needsUpdate = true;
    },
    focus,
    heightAround(x, z, radius) {
      let top = 0;
      for (const building of buildings) {
        const base = building.tiers[0];
        if (base && Math.hypot(base.x - x, base.z - z) < radius + Math.max(base.w, base.d) / 2) {
          top = Math.max(top, building.top + (building.spire?.h ?? 0) + (building.tank ? 1.7 : 0));
        }
      }
      return top;
    },
    pushedInVariants() {
      const scene = new Scene();
      for (const { mesh, pair } of tracked) {
        for (const material of [pair.clearing, pair.fading]) {
          const one = new InstancedMesh(mesh.geometry, material, 1);
          one.setMatrixAt(0, new Matrix4().makeScale(0, 0, 0));
          one.frustumCulled = false;
          scene.add(one);
        }
      }
      return scene;
    },
    setPointerGlow(hover, x, y, near, radius) {
      pointer.uHoverIndex.value = hover;
      pointer.uNear.value.set(x, y, near);
      pointer.uNearRadius.value = radius;
    },
    setFocus(building, amount, at, edge) {
      shared3.uFocusIndex.value = building;
      shared3.uFocus.value = amount;
      target.copy(at);
      const wanted = amount > 0.001;
      if (wanted !== clearing) {
        clearing = wanted;
        for (const { mesh, pair } of tracked) mesh.material = wanted ? pair.clearing : pair.plain;
      }
      // the transparent copies are drawn only while pieces are actually part way out: during the
      // push itself, or while one stands on the soft edge of the line of sight as the camera moves
      const fading = wanted && (amount < FOCUS_FADE || edge);
      if (fading !== fades) {
        fades = fading;
        for (const { fade } of tracked) fade.visible = fading;
      }
    },
    track(mesh, pair) {
      const fade = fadeCopy(mesh, pair);
      fade.visible = fades;
      tracked.push({ mesh, pair, fade });
      mesh.material = clearing ? pair.clearing : pair.plain;
    },
    setPulse(seconds) {
      story.uPulse.value = seconds;
    },
    setPatch(amount) {
      story.uPatch.value = amount;
    },
    setSeal(seal, merge) {
      story.uSeal.value = seal;
      story.uMerge.value = merge;
    },
    setViewScale(pixels) {
      glowScale.value = pixels * GLOW.size;
    },
    dispose() {
      box.dispose();
      tankGeometry.dispose();
      spireGeometry.dispose();
      glowGeometry.dispose();
      glowMaterial.dispose();
      for (const pair of [facadePair, propsPair]) {
        pair.plain.dispose();
        pair.clearing.dispose();
        pair.fading.dispose();
      }
    },
  };
}
