/**
 * The results as a skyline: one tower for each run, standing in a row at the south edge of the city
 * with the open night behind it. The camera turns round above the city and flies along the row
 * (shots.ts): 14 towers turn lime, each a run that ended with a verified fix; 2 turn amber, the runs
 * closed as inconclusive; and past them a gap in the skyline, with a low dark wall and a small person
 * in it, stands for the merges AUTOSP made, which is none. A person makes them.
 *
 * The large numerals are facade displays (display.ts). The numbers come from `RESULTS`, which has to
 * match the page's copy (tests/results.py compares them); the page's text is what a screen reader
 * reads, and the world is hidden from assistive technology.
 *
 * What the towers show follows the scroll one way only: a stage, once reached, stays. So the row and
 * its numeral always agree, and a number on show is never a partial one left behind by a visitor who
 * stopped scrolling. Reaching a stage lights its towers in about a second and a half, the number
 * counting up with them; with reduced motion they are there at once. The numerals give their
 * display slots back while the camera is elsewhere, and stand again at their values on its return.
 *
 * Past the gap, apart from the row, stands one more tower: taller than any of the runs, never lit,
 * and not one of the 16. At dawn it carries the name the visitor types into the pilot form, in
 * neutral white. It does not go on a tower of the row, because a lime or amber tower is a result, and
 * a company's name there would look like a scan that never ran. The name stays on the page.
 */
import { BoxGeometry, CatmullRomCurve3, InstancedMesh, Matrix4, MeshBasicMaterial, Vector3 } from 'three';
import type { Color } from 'three';
import type { BuildingInfo } from './city';
import { faceWidth, fitOnFace, planText } from './display';
import type { DisplayHandle, DisplayTone, FaceId, FacadeDisplays, TextPlan } from './display';
import { renderCount, renderSign, sanitiseLabel } from './display-font';
import { GRID } from './grid';
import { SHOTS, along } from './shots';

/** The published numbers: of 16 runs, 14 verified and 2 inconclusive, and 0 merged by AUTOSP. */
export const RESULTS = { runs: 16, verified: 14, inconclusive: 2, merged: 0 } as const;

/** Every run's tower looks north, back at the city; that is the wall the camera flies along. */
export const ROW_FACE: FaceId = 4;

/** The layout of the row, in world units. Tower 0 stands furthest east, on the left of the view. */
export const ROW = {
  z: 186,
  firstX: 103,
  pitch: 12,
  tower: { width: 11, depth: 9, floors: [18, 26], crownFloors: 3, crownInset: 1.2 },
  /** The empty lot after the last tower, its low dark wall, and the platform the row stands on. */
  lot: { width: 15, wallWidth: 12.6, wallDepth: 6, wallFloors: 10 },
  plinth: { height: 1.4, depth: 14 },
  /** The visitor's tower, well past the gap, so it is out of the frame until the dawn's shot. */
  company: { x: -124, width: 18, depth: 9, floors: 30, crownFloors: 3, crownInset: 1.6 },
  /** City blocks south of this line and within this far of the row's middle make way for the view. */
  clearFromZ: 120,
  clearReachX: 200,
} as const;

/** Where the words and numerals stand on the row: towers by index, heights in world units. */
const PLACES = {
  /** The dot size of every numeral. */
  pitch: 0.66,
  word: { tower: 9, y: 20 },
  verified: { tower: 8, y: 7 },
  inconclusive: { tower: 14, y: 7 },
  /** On the wall in the gap the numeral stands to the left, and the person beside it, clear of it
   * (each measured from the wall's left edge as the camera sees it). */
  merged: { u: 1.2 },
  person: { u: 9.4 },
} as const;

/** How fast the row lights, in towers a second, and how long a numeral takes to ripple on. */
const LIGHT_RATE = 9;
/** The sign on the visitor's tower: what it says until they type, the longest name it takes, the room
 * it may fill, its largest pixel, and how long it takes to ripple on and off. */
export const SIGN = {
  empty: 'YOUR TEAM',
  maxLength: 14,
  width: 16.6,
  height: 13,
  maxPitch: 0.9,
  anchor: 0.82,
  on: 1.2,
  off: 0.6,
} as const;
const RIPPLE_SECONDS = 0.7;

/**
 * The person in the gap, drawn in square pixels like everything else that carries meaning in the
 * world: neutral white, because a person is not a state. `#` is a pixel.
 */
const PERSON = [
  '.###.',
  '.###.',
  '..#..',
  '#####',
  '#.#.#',
  '#.#.#',
  '..#..',
  '.#.#.',
  '.#.#.',
  '.#.#.',
] as const;
const PERSON_PITCH = 0.36;
/** How far in front of the wall the person stands, and how fast they appear (pixels a second). */
const PERSON_FRONT = 2.2;
const PERSON_RATE = 60;

export function towerX(tower: number): number {
  return ROW.firstX - tower * ROW.pitch;
}

/** The middle of the gap after the last tower. */
export function gapX(): number {
  return towerX(RESULTS.runs - 1) - ROW.pitch / 2 - ROW.lot.width / 2;
}

/** How tall a tower stands: a fixed scatter, so the row reads as a skyline. Height means nothing. */
export function towerFloors(tower: number): number {
  const [low, high] = ROW.tower.floors;
  // the fractional part of a multiple of the golden ratio spreads evenly and never repeats a pattern
  const scatter = (tower * 0.618034 + 0.31) % 1;
  return low + Math.round(scatter * (high - low));
}

/** The code a building's state attribute carries for the row (facade.frag.glsl): a tower's place in
 * the row as -1, -2 and so on, so lighting it needs no extra attribute. */
/** What the sign says for this typed text: letters, digits, spaces and basic punctuation, upper case,
 * at most 14 characters; 'YOUR TEAM' when that leaves nothing. Pure: nothing is stored or sent. */
export function signText(typed: string): string {
  return sanitiseLabel(typed, SIGN.maxLength).trim() || SIGN.empty;
}

export function towerState(tower: number): number {
  return -(tower + 1);
}
/** The wall in the gap: part of the row, so its windows stay dark, but past the last tower. */
export const WALL_STATE = -(RESULTS.runs + 1);

/** A scroll position with reduced motion: nothing until the section is near, then the stop it is at,
 * one still frame for each number, with no travel between them. */
export function stillResults(progress: number): number {
  const { stills, stages } = SHOTS.results;
  if (progress < stages.verified - 0.02) return -1;
  if (progress < stages.inconclusive) return stills[0];
  return progress < stages.merged ? stills[1] : stills[2];
}

/** Which of the three statements the beat is on at this scroll position, 0 to 2. */
export function resultsStat(progress: number): number {
  const { shown } = SHOTS.results;
  if (progress < shown.inconclusive) return 0;
  return progress < shown.merged ? 1 : 2;
}

export interface SkylineOptions {
  readonly displays: FacadeDisplays;
  /** The row's towers in order, and the wall in the gap. */
  readonly towers: readonly BuildingInfo[];
  readonly wall: BuildingInfo;
  /** The visitor's tower, past the gap. */
  readonly company: BuildingInfo;
  readonly personColor: Color;
  /** Tells the city how far along the row the light has come. */
  readonly setFront: (front: number) => void;
  readonly still: boolean;
}

export interface Skyline {
  readonly person: InstancedMesh;
  /** Moves on to this scroll progress of the beat (signed: negative before it arrives). */
  update(progress: number, dt: number): void;
  /** Writes the camera for this progress, and returns how far it has taken over, 0 to 1. */
  pose(progress: number, wide: boolean, position: Vector3, target: Vector3): number;
  /** How far the dawn has come, 0 to 1: it lights the sign on the visitor's tower, and clears it. */
  updateSign(dawn: number): void;
  /** What the visitor has typed as their company, in whatever form. */
  setCompany(typed: string): void;
  /** The word that belongs to the row: a fixed place on it, rather than one the planner finds. */
  word(text: string): { building: BuildingInfo; plan: TextPlan } | null;
  /** For tests (?test): what the row shows now. */
  inspect(): Record<string, unknown>;
  dispose(): void;
}

function curve(points: ReadonlyArray<readonly [number, number, number]>): CatmullRomCurve3 {
  return new CatmullRomCurve3(
    points.map((point) => new Vector3(...point)),
    false,
    'centripetal',
  );
}

interface Numeral {
  handle: DisplayHandle;
  shown: number;
  readonly final: number;
  readonly total: number | null;
  readonly building: BuildingInfo;
}

export function createSkyline(options: SkylineOptions): Skyline {
  const { displays, towers, wall, company, personColor, setFront, still } = options;

  // --- The camera's flight ---------------------------------------------------------------------
  const paths = {
    wide: {
      position: curve(SHOTS.results.wide.map((key) => key.position)),
      target: curve(SHOTS.results.wide.map((key) => key.target)),
    },
    tall: {
      position: curve(SHOTS.results.tall.map((key) => key.position)),
      target: curve(SHOTS.results.tall.map((key) => key.target)),
    },
  };
  const segments = SHOTS.results.wide.length - 1;

  // --- The person --------------------------------------------------------------------------------
  const pixels: Array<[number, number]> = [];
  PERSON.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] === '#') pixels.push([x, PERSON.length - 1 - y]);
    }
  });
  // from the feet up, so they appear standing
  pixels.sort((a, b) => a[1] - b[1]);
  const pixelGeometry = new BoxGeometry(PERSON_PITCH * 0.8, PERSON_PITCH * 0.8, PERSON_PITCH * 0.5);
  const personMaterial = new MeshBasicMaterial({ color: personColor });
  const person = new InstancedMesh(pixelGeometry, personMaterial, pixels.length);
  const wallTier = wall.tiers[0];
  // the first column is on the view's left, which is towards +x when looking south at the row
  const left =
    (wallTier?.x ?? gapX()) +
    (wallTier?.w ?? 0) / 2 -
    PLACES.person.u +
    ((PERSON[0].length - 1) / 2) * PERSON_PITCH;
  const matrix = new Matrix4();
  pixels.forEach(([x, y], i) => {
    matrix.setPosition(
      left - x * PERSON_PITCH,
      ROW.plinth.height + (y + 0.5) * PERSON_PITCH,
      (wallTier?.z ?? ROW.z) - (wallTier?.d ?? 0) / 2 - PERSON_FRONT,
    );
    person.setMatrixAt(i, matrix);
  });
  person.instanceMatrix.needsUpdate = true;
  person.frustumCulled = false;
  person.visible = false;
  person.count = 0;

  // --- The numerals ------------------------------------------------------------------------------
  let verified: Numeral | null = null;
  let inconclusive: Numeral | null = null;
  let merged: Numeral | null = null;

  function raise(
    building: BuildingInfo | undefined,
    final: number,
    total: number | null,
    tone: DisplayTone,
    start: number,
    y: number | null,
    u: number | null = null,
  ): Numeral | null {
    const tier = building?.tiers[0];
    if (!building || !tier) return null;
    const handle = displays.claim();
    if (!handle) return null;
    const bitmap = renderCount(start, final, total);
    const fit = fitOnFace(tier, ROW_FACE, renderCount(final, final, total), {
      maxPitch: PLACES.pitch,
      minPitch: PLACES.pitch * 0.5,
      margin: 0.2,
    });
    if (!fit) {
      handle.release();
      return null;
    }
    handle.place({
      building: building.index,
      tier: tier.tier,
      face: ROW_FACE,
      u: u ?? fit.u,
      y: y ?? fit.y,
      pitch: fit.pitch,
    });
    handle.setBitmap(bitmap);
    handle.setTone(tone);
    handle.setOrigin(bitmap.cols / 2, 0);
    handle.to(1, RIPPLE_SECONDS);
    return { handle, shown: start, final, total, building };
  }

  function count(numeral: Numeral | null, value: number): void {
    if (!numeral || numeral.shown === value) return;
    numeral.shown = value;
    numeral.handle.setBitmap(renderCount(value, numeral.final, numeral.total));
  }

  // --- The row -----------------------------------------------------------------------------------
  let stage = 0; // 0 before it, then 1 the verified fixes, 2 the inconclusive ones, 3 the merges
  let front = 0;
  let personShown = 0;
  let lastFront = -1;

  /** How many of a number's towers are lit now, the figure its numeral shows. */
  const litVerified = (): number => Math.min(Math.floor(front), RESULTS.verified);
  const litInconclusive = (): number => Math.max(Math.floor(front) - RESULTS.verified, 0);

  /** Puts up the numerals of the stages reached. */
  function raiseReached(): void {
    if (stage >= 1 && !verified) {
      verified = raise(
        towers[PLACES.verified.tower],
        RESULTS.verified,
        RESULTS.runs,
        'sealed',
        litVerified(),
        PLACES.verified.y,
      );
    }
    if (stage >= 2 && !inconclusive) {
      inconclusive = raise(
        towers[PLACES.inconclusive.tower],
        RESULTS.inconclusive,
        RESULTS.inconclusive,
        'amber',
        litInconclusive(),
        PLACES.inconclusive.y,
      );
    }
    if (stage >= 3 && !merged) {
      merged = raise(wall, RESULTS.merged, null, 'neutral', RESULTS.merged, null, PLACES.merged.u);
    }
  }

  function lowerAll(): void {
    const numerals = [verified, inconclusive, merged];
    verified = null;
    inconclusive = null;
    merged = null;
    for (const numeral of numerals) numeral?.handle.release();
  }

  // --- The sign on the visitor's tower -----------------------------------------------------------
  let sign: DisplayHandle | null = null;
  let signSaying: string = SIGN.empty;
  let signLeaving = false;

  /** Writes the words on the sign, fitted to the wall. */
  function writeSign(handle: DisplayHandle): void {
    const tier = company.tiers[0];
    if (!tier) return;
    const { bitmap, pitch } = renderSign(
      signSaying,
      Math.min(SIGN.width, faceWidth(tier, ROW_FACE) - 1),
      SIGN.height,
    );
    const size = Math.min(pitch, SIGN.maxPitch);
    const fit = fitOnFace(tier, ROW_FACE, bitmap, {
      maxPitch: size,
      minPitch: size * 0.9,
      anchor: SIGN.anchor,
      margin: 0.4,
    });
    if (!fit) return;
    handle.place({
      building: company.index,
      tier: tier.tier,
      face: ROW_FACE,
      u: fit.u,
      y: fit.y,
      pitch: fit.pitch,
    });
    handle.setBitmap(bitmap);
    handle.setOrigin(bitmap.cols / 2, 0);
  }

  return {
    person,
    updateSign(dawn) {
      const { signOn, signOff } = SHOTS.dawn;
      if (dawn >= signOn && (!sign || signLeaving)) {
        signLeaving = false;
        sign ??= displays.claim();
        if (!sign) return;
        sign.setTone('neutral');
        writeSign(sign);
        sign.to(1, SIGN.on);
      } else if (dawn <= signOff && sign && !signLeaving) {
        signLeaving = true;
        sign.to(0, SIGN.off);
      }
      if (sign && signLeaving && sign.reveal === 0) {
        const leaving = sign;
        sign = null;
        signLeaving = false;
        leaving.release();
      }
    },
    setCompany(typed) {
      const saying = signText(typed);
      if (saying === signSaying) return;
      signSaying = saying;
      if (sign && !signLeaving) writeSign(sign);
    },
    update(progress, dt) {
      const { stages } = SHOTS.results;
      const wanted =
        progress >= stages.merged
          ? 3
          : progress >= stages.inconclusive
            ? 2
            : progress >= stages.verified
              ? 1
              : 0;
      stage = Math.max(stage, wanted);

      const lit = stage >= 2 ? RESULTS.runs : stage >= 1 ? RESULTS.verified : 0;
      front = still ? lit : Math.min(front + LIGHT_RATE * dt, lit);
      if (front !== lastFront) {
        lastFront = front;
        setFront(front);
      }
      if (progress < SHOTS.results.take.from) {
        lowerAll();
      } else {
        raiseReached();
        count(verified, litVerified());
        count(inconclusive, litInconclusive());
      }

      if (stage >= 3 && personShown < pixels.length) {
        personShown = still ? pixels.length : Math.min(personShown + PERSON_RATE * dt, pixels.length);
        person.count = Math.ceil(personShown);
        person.visible = true;
      }
    },
    pose(progress, wide, position, target) {
      const { enter, toInconclusive, toMerged, take } = SHOTS.results;
      const travelled =
        along(enter, progress) * enter.segments +
        along(toInconclusive, progress) * toInconclusive.segments +
        along(toMerged, progress) * toMerged.segments;
      const path = wide ? paths.wide : paths.tall;
      const u = travelled / segments;
      path.position.getPoint(u, position);
      path.target.getPoint(u, target);
      return along(take, progress);
    },
    word(text) {
      const building = towers[PLACES.word.tower];
      const tier = building?.tiers[0];
      if (!building || !tier) return null;
      const plan = planText(
        text,
        building.index,
        [tier],
        { x: tier.x, z: tier.z - 100 },
        { layouts: ['row'], minPitch: GRID.floor / 4 },
      );
      return plan
        ? { building, plan: { ...plan, placement: { ...plan.placement, y: PLACES.word.y } } }
        : null;
    },
    inspect() {
      const lit = Math.floor(front);
      const counted = (numeral: Numeral | null): Record<string, unknown> | null =>
        numeral
          ? {
              shown: numeral.shown,
              final: numeral.final,
              total: numeral.total,
              building: numeral.building.index,
              slot: numeral.handle.slot,
              reveal: numeral.handle.reveal,
            }
          : null;
      return {
        stage,
        front,
        runs: towers.length,
        lime: Math.min(lit, RESULTS.verified),
        amber: Math.max(lit - RESULTS.verified, 0),
        verified: counted(verified),
        inconclusive: counted(inconclusive),
        merged: counted(merged),
        person: { shown: person.visible ? person.count : 0, of: pixels.length },
        towers: towers.map((tower) => ({
          index: tower.index,
          top: tower.top,
          x: tower.tiers[0]?.x,
          z: tower.tiers[0]?.z,
          width: tower.tiers[0]?.w,
          depth: tower.tiers[0]?.d,
        })),
        wall: { index: wall.index, top: wall.top, x: wallTier?.x, width: wallTier?.w },
        gapX: gapX(),
        lot: ROW.lot.width,
        company: {
          index: company.index,
          top: company.top,
          x: company.tiers[0]?.x,
          z: company.tiers[0]?.z,
          width: company.tiers[0]?.w,
          depth: company.tiers[0]?.d,
        },
        sign: sign ? { saying: signSaying, slot: sign.slot, reveal: sign.reveal } : null,
      };
    },
    dispose() {
      pixelGeometry.dispose();
      personMaterial.dispose();
      person.dispose();
    },
  };
}
