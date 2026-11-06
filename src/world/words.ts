/**
 * The keyword of each beat, spelled by the city: one short word in the windows of a tower, as an
 * echo of the real headline (which stays in the page, readable; the world is not in the
 * accessibility tree at all). The word ripples on from the foot of its tower as its beat arrives
 * and ripples off as the beat leaves. With reduced motion it is there or not there, at once.
 *
 * A tower is chosen for each word when its beat first arrives, from the camera as it is then
 * (word-planner.ts), a few milliseconds a frame, and remembered for that finding: the camera in
 * the close beats depends on which finding the visitor picked. A beat whose camera has no tower in
 * plain sight that the word fits on simply has no word; the headline carries it.
 *
 * Words are white. Orange, lime and amber carry meaning (an open finding, a sealed fix, a person is
 * needed), and a keyword is not one of those; change a word's tone here only if it is.
 */
import { Vector3 } from 'three';
import type { Box3 } from 'three';
import type { PerspectiveCamera } from 'three';
import type { BuildingInfo } from './city';
import type { DisplayHandle, DisplayTone, FacadeDisplays } from './display';
import { createOccluders, finish, pixelCentres, planWord, visiblePixels } from './word-planner';
import type { Occluders, PlannerOptions, WordChoice } from './word-planner';

export type WordKey = 'backlog' | 'test' | 'sandbox' | 'gates' | 'merge' | 'record' | 'results';

/** What each beat spells, and in what tone. One word each: windows cannot carry a sentence. */
export interface WordSpec {
  readonly text: string;
  readonly tone: DisplayTone;
  /**
   * Where it goes. 'tower': on whichever tower in view reads it best. 'subject': on the beat's own
   * building (the one with the crack), for the close beats, whose cameras are in the street among
   * low buildings, with no tower in view that the word fits on without covering the subject or the
   * panels. The failing test is spelled on the failing tower, the sandbox on the sandboxed one.
   * 'row': at a fixed place on the results' row (skyline.ts), which the camera flies along.
   */
  readonly on: 'tower' | 'subject' | 'row';
}

export const WORDS: Readonly<Record<WordKey, WordSpec>> = {
  backlog: { text: 'BACKLOG', tone: 'neutral', on: 'tower' },
  test: { text: 'TEST', tone: 'neutral', on: 'subject' },
  // on the sandboxed tower it did not show (the sandbox draws over it), and no other tower in view
  // fits it from this camera, so this beat has no word; the headline carries it
  sandbox: { text: 'SANDBOX', tone: 'neutral', on: 'tower' },
  gates: { text: 'GATES', tone: 'neutral', on: 'tower' },
  merge: { text: 'MERGE', tone: 'neutral', on: 'tower' },
  record: { text: 'RECORD', tone: 'neutral', on: 'tower' },
  results: { text: 'RESULTS', tone: 'neutral', on: 'row' },
};

/** Seconds for a word to ripple on, and to ripple off. */
export const WORD_SECONDS = { on: 1.6, off: 0.9 } as const;

export interface ScreenRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** A beat's camera is still moving when the beat arrives, so a word that finds no tower is planned
 * again, from the camera as it is then, this often (milliseconds) and up to this many times. */
const RETRY_MS = 700;
const MAX_TRIES = 8;

/** Clear space kept round the page's text and the subject, in CSS pixels and as a share of its size. */
const TEXT_PAD = 16;
const SUBJECT_PAD = 0.12;

export interface WordsOptions {
  readonly displays: FacadeDisplays;
  readonly buildings: readonly BuildingInfo[];
  readonly camera: PerspectiveCamera;
  /** The canvas size in CSS pixels. */
  readonly screen: () => { width: number; height: number };
  /** Names the chosen finding, since the close beats' cameras depend on it. */
  readonly focusKey: () => string;
  /** The page's text and panels on screen, in CSS pixels: a word does not go behind them. */
  readonly avoid: () => ReadonlyArray<ScreenRect>;
  /** The focused building's box in the world: a word does not go on top of the beat's subject. */
  readonly subject: () => Box3 | null;
  /** The building with the crack, for the words that go on the subject itself. */
  readonly subjectBuilding: () => number | null;
  /** How far the camera focuses now (world units). */
  readonly focusDistance: () => number;
  /** Where a word that belongs to the results' row stands. */
  readonly rowWord: (text: string) => Pick<WordChoice, 'building' | 'plan'> | null;
  /** With reduced motion the planning runs at once and the words appear and clear instantly. */
  readonly still: boolean;
}

export interface Words {
  /** The word of the beat now at the middle of the screen, or null between beats. */
  setActive(key: WordKey | null): void;
  /** Spends up to `budgetMs` milliseconds planning and tidies away words that have cleared. */
  update(budgetMs: number): void;
  /** For tests: the active word and where each of its pixels lands now, in plain sight or not. */
  inspect(): Record<string, unknown>;
  /** For tests: how every word could be placed from the current camera, run to the end at once. */
  planAll(overrides?: PlannerOptions): Record<string, unknown>;
}

interface Job {
  readonly key: WordKey;
  readonly cacheKey: string;
  readonly generator: Generator<void, WordChoice | null, void>;
}

export function createWords(options: WordsOptions): Words {
  const { displays, buildings, camera, screen, focusKey, still } = options;
  let occluders: Occluders | null = null;
  const occluding = (): Occluders => (occluders ??= createOccluders(buildings));

  const choices = new Map<string, WordChoice | null>();
  const handles = new Map<WordKey, DisplayHandle>();
  let active: WordKey | null = null;
  let job: Job | null = null;
  /** The word on show now, as placed: the camera's focus may change while it stands. */
  let shown: { key: WordKey; choice: WordChoice } | null = null;
  let tries = 0;
  let retryAt: number | null = null;

  function plan(key: WordKey, overrides: PlannerOptions = {}): Generator<void, WordChoice | null, void> {
    const snapshot = camera.clone(); // the camera as it is now; it moves on while this plans
    snapshot.updateMatrixWorld();
    // the places on screen a word may not go, in the screen's own -1 to 1: the page's text and
    // panels, and the beat's subject
    const { width, height } = screen();
    const rects = options.avoid().map((r) => ({
      left: ((r.left - TEXT_PAD) / width) * 2 - 1,
      right: ((r.right + TEXT_PAD) / width) * 2 - 1,
      top: 1 - ((r.top - TEXT_PAD) / height) * 2,
      bottom: 1 - ((r.bottom + TEXT_PAD) / height) * 2,
    }));
    const onSubject = WORDS[key].on === 'subject';
    // a word on the subject itself may of course be where the subject is
    const subject = onSubject ? null : options.subject();
    if (subject) {
      let left = 1;
      let right = -1;
      let top = -1;
      let bottom = 1;
      for (const x of [subject.min.x, subject.max.x]) {
        for (const y of [subject.min.y, subject.max.y]) {
          for (const z of [subject.min.z, subject.max.z]) {
            const ndc = new Vector3(x, y, z).project(snapshot);
            left = Math.min(left, ndc.x);
            right = Math.max(right, ndc.x);
            top = Math.max(top, ndc.y);
            bottom = Math.min(bottom, ndc.y);
          }
        }
      }
      const padX = (right - left) * SUBJECT_PAD;
      const padY = (top - bottom) * SUBJECT_PAD;
      rects.push({ left: left - padX, right: right + padX, top: top + padY, bottom: bottom - padY });
    }
    const keepClear = (x: number, y: number): boolean =>
      !rects.some((r) => x >= r.left && x <= r.right && y <= r.top && y >= r.bottom);
    const target = options.subjectBuilding();
    const own = onSubject ? buildings.filter((b) => b.index === target) : buildings;
    return planWord(WORDS[key].text, snapshot, own, occluding(), {
      keepClear,
      focusDistance: options.focusDistance(),
      ...(onSubject
        ? { minTop: 0, minDistance: 3, maxDistance: 90, minShare: 0.5, minPitch: 0.2, ignoreOcclusion: true }
        : {}),
      ...overrides,
    });
  }

  function show(key: WordKey, choice: WordChoice | null): void {
    if (!choice) return;
    const handle = handles.get(key) ?? displays.claim();
    if (!handle) return;
    handles.set(key, handle);
    shown = { key, choice };
    const { placement, bitmap, layout } = choice.plan;
    handle.place(placement);
    handle.setBitmap(bitmap);
    handle.setTone(WORDS[key].tone);
    // a stacked word lights from the foot of its tower upwards, a row from its left end
    handle.setOrigin(layout === 'stack' ? bitmap.cols / 2 : 0, layout === 'stack' ? 0 : bitmap.rows / 2);
    handle.to(1, WORD_SECONDS.on);
  }

  function clear(key: WordKey): void {
    handles.get(key)?.to(0, WORD_SECONDS.off);
  }

  function start(key: WordKey): void {
    const cacheKey = `${key}:${focusKey()}`;
    const generator = plan(key);
    if (still) {
      // reduced motion: the camera jumps to the beat's pose, so one plan from there is enough
      const choice = finish(generator);
      if (choice) choices.set(cacheKey, choice);
      show(key, choice);
      return;
    }
    job = { key, cacheKey, generator };
  }

  function arrive(key: WordKey): void {
    if (WORDS[key].on === 'row') {
      const fixed = options.rowWord(WORDS[key].text);
      if (fixed) {
        const base = fixed.building.tiers[0];
        const distance = base
          ? camera.position.distanceTo(new Vector3(base.x, fixed.plan.placement.y, base.z))
          : 0;
        show(key, { ...fixed, distance, share: 1, ignoresOcclusion: true });
      }
      return;
    }
    const cached = choices.get(`${key}:${focusKey()}`);
    if (cached) {
      show(key, cached);
      return;
    }
    tries = 0;
    retryAt = null;
    start(key);
  }

  return {
    setActive(key) {
      if (key === active) return;
      retryAt = null;
      const leaving = active;
      active = key;
      if (job && job.key !== key) job = null; // the visitor has moved on
      if (leaving) clear(leaving);
      if (key) arrive(key);
    },
    update(budgetMs) {
      const started = performance.now();
      while (job && performance.now() - started < budgetMs) {
        const step = job.generator.next();
        if (!step.done) continue;
        const { key, cacheKey } = job;
        job = null;
        if (step.value) {
          choices.set(cacheKey, step.value);
          if (active === key) show(key, step.value);
        } else {
          tries += 1;
          retryAt = tries < MAX_TRIES ? performance.now() + RETRY_MS : null;
        }
      }
      if (!job && active && retryAt !== null && performance.now() >= retryAt) {
        retryAt = null;
        start(active);
      }
      // a word that has finished clearing gives its slot back
      for (const [key, handle] of handles) {
        if (key !== active && handle.reveal === 0) {
          handles.delete(key);
          handle.release();
        }
      }
    },
    inspect() {
      const key = active;
      const choice = shown && shown.key === key ? shown.choice : null;
      const handle = key ? handles.get(key) : undefined;
      const planning = job !== null || retryAt !== null;
      if (!key || !choice || !handle) {
        return { active: key, planning, shown: false };
      }
      camera.updateMatrixWorld();
      const spots = pixelCentres(choice);
      const visible = visiblePixels(occluding(), camera, choice, spots);
      const { width, height } = screen();
      const cells = spots.map((spot): [number, number] => {
        const ndc = spot.clone().project(camera);
        return [((ndc.x + 1) / 2) * width, ((1 - ndc.y) / 2) * height];
      });
      return {
        active: key,
        planning,
        shown: true,
        text: WORDS[key].text,
        building: choice.building.index,
        tier: choice.plan.placement.tier,
        layout: choice.plan.layout,
        pitch: choice.plan.placement.pitch,
        distance: choice.distance,
        planShare: choice.share,
        reveal: handle.reveal,
        cols: choice.plan.bitmap.cols,
        rows: choice.plan.bitmap.rows,
        bits: Array.from(choice.plan.bitmap.data),
        cells,
        visible,
      };
    },
    planAll(overrides) {
      const out: Record<string, unknown> = {};
      const position = new Vector3();
      for (const key of Object.keys(WORDS) as WordKey[]) {
        const choice = finish(plan(key, overrides));
        out[key] = choice
          ? {
              building: choice.building.index,
              layout: choice.plan.layout,
              pitch: choice.plan.placement.pitch,
              distance: choice.distance,
              share: choice.share,
            }
          : null;
      }
      return { from: position.copy(camera.position).toArray(), words: out };
    },
  };
}
