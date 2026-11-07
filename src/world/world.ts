/**
 * The world: one renderer, one camera and one scene holding the sky, the clouds, the city and the
 * ground. `setProgress` places the camera on the journey (0 above the clouds, 1 over the city at
 * night); the frame loop keeps the clouds drifting and the cracks flickering, and stops whenever
 * the tab is hidden.
 *
 * `setPush` then moves the camera from that overview in to the building carrying the chosen
 * finding (`setFinding`); changing the finding mid-push glides the camera across. Every beat's shot
 * (framing, easing and the move within the beat) is data in shots.ts; this file blends them.
 *
 * On the high quality tier the frame goes through a depth of field pass that keeps each beat's
 * subject sharp (depth-of-field.ts); the low tier draws straight to the screen, with a little more
 * fog instead.
 *
 * With `still: true` (reduced motion) nothing moves: one frame is drawn whenever the progress or
 * the size changes, and the clock stays at zero.
 */
import {
  Box3,
  MathUtils,
  PerspectiveCamera,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { readPalette } from './palette';
import { createAtmosphere } from './atmosphere';
import { createSharedUniforms, syncShared } from './uniforms';
import { createSky } from './sky';
import type { Quality } from './sky';
import { createCity } from './city';
import type { BuildingInfo, TierInfo } from './city';
import { createFacadeDisplays } from './display';
import type { DisplayHandle, DisplayTone, FacadeDisplays } from './display';
import { createOccluders, finish, pixelCentres, planWord, visiblePixels } from './word-planner';
import { SCAN, scanRange, scanX } from './scan';
import { createWords } from './words';
import type { ScreenRect, WordKey, Words } from './words';
import type { Finding } from './city';
import { createJourney, createJourneySample } from './journey';
import { createSandbox } from './sandbox';
import { createStreets } from './streets';
import { createTraffic } from './traffic';
import { createRise } from './rise';
import { createSkyline } from './skyline';
import { createTear } from './tear';
import type { TearGuard } from './tear';
import { SHOTS, along, ease } from './shots';
import type { Focus } from './shots';
import { createDepthOfField } from './depth-of-field';
import type { FocusState } from './depth-of-field';
import type { GateIndex, GateMoment } from '../lib/gates';
import { createGatePath, createGates } from './gates';

export interface WorldOptions {
  readonly canvas: HTMLCanvasElement;
  readonly quality: Quality;
  readonly still: boolean;
}

/** A finding's label position for this frame, in CSS pixels from the canvas's top-left corner. */
export interface LabelPlacement {
  readonly finding: Finding;
  x: number;
  y: number;
  /** False when the anchor is behind the camera or off screen. */
  onScreen: boolean;
  /** Facade / building center point for leader line targeting. */
  targetX: number;
  targetY: number;
  targetOnScreen: boolean;
}

/** A point in the scene on screen this frame, in CSS pixels; `shown` false when it is off screen. */
export interface ScreenPoint {
  shown: boolean;
  x: number;
  y: number;
}

/** Where the refusing gate's flag hangs this frame; `shown` false when no gate is refusing the fix
 * or its top edge is off screen. */
export type GateFlag = ScreenPoint;

/** The top edge of one of the gates' barriers on screen, and its state: 0 waiting, 1 passed by the
 * fix, 2 refused it. */
export interface GateTop extends ScreenPoint {
  state: number;
}

/** Called after every frame with the finding labels, the refusal flag, the fix in flight through the
 * gates (`shown` only while the gates are out), and the tops of the three barriers. */
export type FrameListener = (
  labels: readonly LabelPlacement[],
  flag: Readonly<GateFlag>,
  fix: Readonly<ScreenPoint>,
  gates: readonly Readonly<GateTop>[],
) => void;

export interface World {
  readonly findings: readonly Finding[];
  /** How dark it is, 0 to 1, after the last frame. */
  readonly night: number;
  setProgress(progress: number): void;
  /** How far through the pick beat the visitor is, 0 to 1: the camera dollies in on the chosen
   * finding over the shot's `enter` range. */
  setPush(amount: number): void;
  /** How far through the failing test the visitor is, 0 to 1: the dolly creeps in on the crack. */
  setReproduce(amount: number): void;
  /** The CWE id of the finding to push in on. */
  setFinding(cwe: string): void;
  /** The reproduction test just failed: pulse the focused crack. Skipped when still. */
  pulse(): void;
  /** The sandbox: `drop` 0 to 1 (not eased) brings the volume down and the camera back to see it whole;
   * `patch` 0 to 1 writes the fix over the crack; `progress` is how far through the beat the
   * visitor is, which orbits the view. */
  setSandbox(drop: number, patch: number, progress: number): void;
  /** Turns the sandbox view around the building by `yaw` radians (the visitor's drag). */
  setOrbit(yaw: number): void;
  /** The gates at this moment (null before the section), and the gate refusing this fix. */
  setGates(moment: GateMoment | null, refusedAt: GateIndex | null): void;
  /** The merge step: `enter` (the section's scroll progress, negative while it is still coming up
   * the screen) brings the camera back to the sealed building and clears the sandbox and gates away; `merged` is whether a person has merged
   * it (the pixels rise once). */
  setMerge(enter: number, merged: boolean): void;
  /** How far the merge button is held, 0 to 1: a lime wave runs out from the sealed building as
   * far as the hold has gone. Not drawn with reduced motion. */
  setHold(amount: number): void;
  /** The close: 0 to 1 (not eased) lifts the camera back over the whole city. */
  setOutro(amount: number): void;
  /** The results' flight along the row: the section's scroll progress, negative while it is still
   * coming up the screen (skyline.ts, shots.ts). */
  setResults(progress: number): void;
  /** The dawn, as the pilot form arrives: 0 to 1 (not eased) lifts the sky and moves the camera past
   * the end of the row (shots.ts). With reduced motion, 0 or 1. */
  setDawn(amount: number): void;
  /** What the visitor has typed as their company: the sign on the tallest tower follows it. */
  setCompany(typed: string): void;
  /** The arrival from Nexarise, 1 to 0: at 1 the cloud deck is held whole, and at 0 it rips. */
  setArrival(amount: number): void;
  /** How far the cloud deck of the first screen has gone, 0 to 1, as of the last frame. */
  readonly deckGone: number;
  /** 1 while the first screen's words stand on the deck, falling to 0 as the visitor falls. */
  readonly deckWords: number;
  /** Where the pointer is on the first screen (CSS pixels), or x null when it has left. */
  setDeckPointer(x: number | null, y: number): void;
  /** The page's words on the first screen: the cloud deck stays whole behind them. */
  setDeckGuards(guards: readonly TearGuard[]): void;
  /** For tests (?test): what the row shows now. */
  skyline(): Record<string, unknown>;
  /** A point in the world, on screen, in CSS pixels. */
  project(x: number, y: number, z: number): ScreenPoint;
  /** The outro as of the last frame, 0 to 1. */
  readonly outro: number;
  /** For tests (?test): where the camera is and what it looks at, and the story amounts. */
  inspect(): Record<string, unknown>;
  /** The facade displays: any tower's wall can show a word or a number in its windows (display.ts). */
  readonly displays: FacadeDisplays;
  /** Every building, for choosing where a display stands. */
  readonly buildings: readonly BuildingInfo[];
  /**
   * For tests (?test): puts `text` on the tower in view that it reads best on (the biggest pixel for
   * its distance), on the face towards the camera, fully shown, and returns where it stands and where each of its pixels lands on screen
   * (CSS pixels) and whether it is in plain sight, so a test can read the pixels back and compare
   * them with the bitmap. Null when no tower in view has room for it, mostly in plain sight.
   */
  testDisplay(text: string, tone?: DisplayTone): Record<string, unknown> | null;
  /** For tests (?test): sets the ripple of the display `testDisplay` put up, 0 to 1. */
  testReveal(reveal: number): void;
  /** The beat keyword to spell on a tower now: the beat at the middle of the screen, or null (words.ts). */
  setWord(key: WordKey | null): void;
  /**
   * The scanner sweep of the backlog beat (scan.ts): 0 to 1 moves the line across the city, lighting
   * each crack as it passes; 1 (the default) has every crack lit and no line.
   */
  setScan(progress: number): void;
  /** How far the sweep has got, how many findings the line has passed, and how many there are. */
  scan(): { progress: number; count: number; total: number };
  /** Whether the line has passed this finding's crack, so it is lit. */
  ignited(finding: Finding): boolean;
  /** Tells the world where the page's text and panels are (CSS pixels), so words keep clear of them. */
  setAvoid(provider: () => ReadonlyArray<ScreenRect>): void;
  /** For tests (?test): the active keyword and where its pixels land, and every word's placement. */
  readonly words: Pick<Words, 'inspect' | 'planAll'>;
  /** The push after easing, 0 to 1, as of the last frame. */
  readonly push: number;
  /** The finding being pushed in on. */
  readonly focus: Finding | undefined;
  /** Pointer position from -1 to 1 on each axis; the camera leans a little towards it. */
  setPointer(x: number, y: number): void;
  /** The crack under the pointer burns brighter (`hover`, or null), and cracks within reach of the
   * pointer (CSS pixels) brighten by `near`, 0 to 1 (the first screen only). x null: the pointer left. */
  setCrackPointer(hover: Finding | null, x: number | null, y: number, near: number): void;
  /** Called after every frame with the label positions, the refusal flag and the fix in flight. */
  onFrame(listener: FrameListener): void;
  dispose(): void;
}

/** Device pixel ratio ceiling; the shaders draw fine pixels, so a little supersampling helps. */
const MAX_DPR: Record<Quality, number> = { high: 1.75, low: 1.25 };
/** How far the camera leans towards the pointer, in world units. */
const LEAN = new Vector2(2.2, 1.2);
const UP = new Vector3(0, 1, 0);
/** The 3D cloud decks are drawn only once the camera is below this height (they hang above it). */
const DECKS_BELOW = 70;
/** How long after load (ms) the pushed-in shaders start compiling in the background. */
const WARM_AFTER = 3000;

/** The last view: high over the city, the sealed building among the findings still open. */
const FAREWELL = {
  wide: {
    position: new Vector3(...SHOTS.outro.wide.position),
    target: new Vector3(...SHOTS.outro.wide.target),
  },
  tall: {
    position: new Vector3(...SHOTS.outro.tall.position),
    target: new Vector3(...SHOTS.outro.tall.target),
  },
} as const;
/** The gates before their section: nothing has moved. */
const IDLE_GATES: GateMoment = {
  checks: [0, 0, 0],
  passed: 0,
  refused: false,
  cleared: false,
  at: -1,
  travel: 0,
  chase: 0,
  side: 0,
};
/** On the low tier, which has no depth of field, a little more fog softens the far towers. */
const LOW_TIER_FOG = 1.2;
/**
 * The merge's light. While the button is held, the wave runs out from the sealed building up to
 * `reach` (world units, block by block); once merged it runs on at `runOn` reaches a second and
 * fades out over `fade` seconds, and the rest of the city goes dark at `darken` per second. (The
 * camera's pull back is a shot: shots.ts.)
 */
const MERGE = {
  reach: 95,
  runOn: 0.8,
  fade: 0.9,
  darken: 3.2,
} as const;

/** The sandbox view: back from the close view far enough to see the whole volume, turned by yaw. */
function sandboxView(
  finding: Finding,
  from: Vector3,
  yaw: number,
  wide: boolean,
  position: Vector3,
  target: Vector3,
): void {
  const { x, z } = finding.box;
  const h = finding.top;
  const shot = SHOTS.sandbox.distance;
  target.set(x, h * 0.5, z);
  const distance = h * shot.perHeight + shot.base;
  position.subVectors(from, target).setY(0).normalize().applyAxisAngle(UP, yaw);
  position.multiplyScalar(distance * shot.out).add(target);
  position.y = target.y + distance * shot.up;
  if (!wide) target.y -= h * SHOTS.sandbox.tallDrop;
}
/** The overview camera's resting position; the close view faces the wall turned towards it. */
const OVERVIEW = new Vector3(...SHOTS.descent.overview);

/** A three-quarter view of the crack on the wall of `finding` that faces the overview. */
function closeView(finding: Finding, wide: boolean, position: Vector3, target: Vector3): void {
  const { x, z, w, d, h } = finding.box;
  const dx = OVERVIEW.x - x;
  const dz = OVERVIEW.z - z;
  const normal =
    Math.abs(dx) > Math.abs(dz) ? new Vector3(Math.sign(dx), 0, 0) : new Vector3(0, 0, Math.sign(dz));
  const tangent = new Vector3().crossVectors(UP, normal);
  const shot = SHOTS.pick;
  const face = new Vector3(x + (normal.x * w) / 2, h * shot.aim, z + (normal.z * d) / 2);
  const distance = (h * shot.distance.perHeight + shot.distance.base) * (wide ? 1 : shot.distance.tall);
  position
    .copy(face)
    .addScaledVector(normal, distance * shot.offset.out)
    .addScaledVector(UP, distance * shot.offset.up)
    .addScaledVector(tangent, distance * shot.offset.along);
  target.copy(face);
  // A wide screen keeps the building centred between the picker (left) and the diff (right); a
  // tall one lifts it into the upper half, above the picker
  if (!wide) target.y -= h * shot.tallDrop;
}

/** Measures GPU time per frame (tests only); keeps the last few hundred samples, in ms. */
function createGpuTimer(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
): { begin(): void; end(): void; samples: number[] } | null {
  if (!('createQuery' in gl)) return null;
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as {
    TIME_ELAPSED_EXT: number;
    GPU_DISJOINT_EXT: number;
  } | null;
  if (!ext) return null;
  const pending: WebGLQuery[] = [];
  const samples: number[] = [];
  let current: WebGLQuery | null = null;
  return {
    samples,
    begin() {
      while (pending.length > 0) {
        const query = pending[0];
        if (!query || !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) break;
        pending.shift();
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT))
          samples.push(Number(gl.getQueryParameter(query, gl.QUERY_RESULT)) / 1e6);
        gl.deleteQuery(query);
        if (samples.length > 400) samples.shift();
      }
      if (pending.length > 8) return;
      current = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, current);
    },
    end() {
      if (!current) return;
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      pending.push(current);
      current = null;
    },
  };
}

export function createWorld({ canvas, quality, still }: WorldOptions): World {
  const renderer = new WebGLRenderer({
    canvas,
    // No MSAA: the shaders anti-alias their own window grids and paint, and on an integrated GPU
    // multisampling the whole city costs more than the rest of the frame
    antialias: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DPR[quality]));

  const palette = readPalette();
  const atmosphere = createAtmosphere(palette);
  const shared = createSharedUniforms(atmosphere, palette.grade);
  const sky = createSky(atmosphere, shared, quality);
  const tear = createTear(renderer, palette.deck, still);
  const displays = createFacadeDisplays(palette, still);
  const city = createCity(palette, shared, quality, displays.uniforms);
  const journey = createJourney();
  const pose = createJourneySample();

  const streets = createStreets(palette, shared, quality, city.focus, city);
  const traffic = createTraffic(palette, shared, quality);
  const sandbox = createSandbox(palette.pixelLit);
  const rise = createRise(palette.sealed);
  // Tests only (?test): GPU time per frame, through EXT_disjoint_timer_query_webgl2 where present
  const gpuTimer = new URLSearchParams(location.search).has('test')
    ? createGpuTimer(renderer.getContext())
    : null;
  const scene = new Scene();
  scene.add(sky.group, streets.group, city.group, traffic.group, sandbox.mesh, rise.points);
  // the gates in the sky: three barriers of lit pixels, and the fix flying through them (gates.ts)
  const gates = createGates(
    { waiting: palette.pixelLit, passed: palette.pixelLit, refused: palette.open, cleared: palette.sealed },
    (x, z, radius) => city.heightAround(x, z, radius),
  );
  const gatePath = createGatePath();
  scene.add(...gates.objects);
  // Tests only (?test&no=lamps,cars,people,streets,city): leave parts of the scene out, to measure them.
  const params = new URLSearchParams(location.search);
  if (params.has('test')) {
    const without = new Set((params.get('no') ?? '').split(','));
    const [cars, lamps, people] = traffic.group.children;
    if (without.has('cars') && cars) cars.visible = false;
    if (without.has('lamps') && lamps) lamps.visible = false;
    if (without.has('people') && people) people.visible = false;
    if (without.has('streets')) streets.group.visible = false;
    if (without.has('city')) city.group.visible = false;
    const [ground, poles] = streets.group.children;
    const [, tanks, spires] = city.group.children;
    if (without.has('ground') && ground) ground.visible = false;
    if (without.has('props')) for (const prop of [poles, tanks, spires]) if (prop) prop.visible = false;
    if (without.has('masses')) {
      const masses = city.group.children[0];
      if (masses) masses.visible = false;
    }
  }
  const camera = new PerspectiveCamera(50, 1, 0.5, 2000);
  // depth of field on the high tier only (and off with ?test&dof=off, to measure it)
  const depthOfField =
    quality === 'high' && params.get('dof') !== 'off' ? createDepthOfField(renderer) : null;
  /** What is in focus this frame, blended through the beats like the camera. */
  const focusNow: FocusState = { distance: 50, depth: 10, blur: 0, tilt: 0 };
  const subject = new Vector3();
  const focusInto = (shot: Focus, point: Vector3, weight: number): void => {
    if (weight <= 0) return;
    subject.lerp(point, weight);
    focusNow.depth = MathUtils.lerp(focusNow.depth, shot.depth, weight);
    focusNow.blur = MathUtils.lerp(focusNow.blur, shot.blur, weight);
    focusNow.tilt = MathUtils.lerp(focusNow.tilt, shot.tilt, weight);
  };

  const labels: LabelPlacement[] = city.findings.map((finding) => ({
    finding,
    x: 0,
    y: 0,
    onScreen: false,
    targetX: 0,
    targetY: 0,
    targetOnScreen: false,
  }));
  const projected = new Vector3();
  const listeners: FrameListener[] = [];
  const gateFlag: GateFlag = { shown: false, x: 0, y: 0 };
  const fixOnScreen: ScreenPoint = { shown: false, x: 0, y: 0 };
  const flagPoint = new Vector3();
  const facadePoint = new Vector3();

  let progress = 0;
  let reproduce = 0;
  let sandboxProgress = 0;
  const dollyPosition = new Vector3();
  let pushRaw = 0;
  let pushEased = 0;
  let focus: Finding | undefined = city.findings[0];
  // how far the line of sight to the focus has been cleared, as the city was last told (city.setFocus)
  let clearAmount = 0;
  /**
   * How far a tier stands inside the line of sight to the focus (shaders/focus-clear.glsl, the same
   * test on the same numbers): 0 out of it, 1 wholly in, and between on the tube's soft edge.
   */
  const sight = new Vector3();
  const sightPoint = new Vector3();
  const sightColumn = new Vector3();
  const insideSight = (tier: TierInfo): number => {
    const from = camera.position;
    sight.subVectors(clearTarget, from);
    const stop = Math.max(0.86, 1 - 5 / Math.max(sight.length(), 1e-3));
    const reach = Math.max(tier.w, tier.d) / 2;
    const plan = sight.x * sight.x + sight.z * sight.z;
    const raw = ((tier.x - from.x) * sight.x + (tier.z - from.z) * sight.z) / Math.max(plan, 1e-4);
    const before = 1 - MathUtils.smoothstep((raw - 1) * sight.length(), -3, 0); // past the building: nothing in the way
    if (before <= 0) return 0;
    const t = MathUtils.clamp(raw, 0, 1);
    sightPoint.copy(from).addScaledVector(sight, t);
    sightColumn.set(tier.x, MathUtils.clamp(sightPoint.y, tier.y0, tier.y0 + tier.h), tier.z);
    const d = sightPoint.distanceTo(sightColumn);
    const spared = MathUtils.smoothstep(t, stop - 0.06, stop) * MathUtils.smoothstep(d, reach + 1, reach + 3);
    return (1 - MathUtils.smoothstep(d, 5 + reach, 9 + reach)) * (1 - spared) * before;
  };
  /** Whether the city has faded a building (mostly) out of the line of sight: a word on it would not
   * be seen, so none goes there. */
  const clearedAway = (building: BuildingInfo): boolean => {
    if (clearAmount <= 0.001 || !focus || building.index === focus.building) return false;
    return building.tiers.some((tier) => insideSight(tier) > 0.5);
  };
  /** Whether any building stands part way out on the soft edge of the line of sight just now. */
  const onClearEdge = (): boolean => {
    if (clearAmount <= 0.001 || !focus) return false;
    for (const building of city.buildings) {
      if (building.index === focus.building) continue;
      for (const tier of building.tiers) {
        const inside = insideSight(tier);
        if (inside > 0.001 && inside < 0.999) return true;
      }
    }
    return false;
  };
  let pulseAt = -1; // when the last pulse started, in performance.now() time
  let settled = false; // false until the close view has been placed once
  let last = performance.now();
  const closePosition = new Vector3();
  const closeTarget = new Vector3();
  const wantPosition = new Vector3();
  const wantTarget = new Vector3();
  const clearTarget = new Vector3();
  let drop = 0;
  let patch = 0;
  let yawWanted = 0;
  let yaw = 0;
  let swayClock = 0;
  // where the sweep runs: across the findings, with room either side (scan.ts)
  const range = scanRange(city.findings.map((finding) => finding.box.x));
  let scanProgress = 1;
  shared.uScanColor.value.copy(palette.pixelLit);
  const ignited = (finding: Finding): boolean => shared.uScanX.value - finding.box.x >= SCAN.shape.z / 2;
  const skyline = createSkyline({
    displays,
    towers: city.row.towers,
    wall: city.row.wall,
    company: city.row.company,
    personColor: palette.pixelLit,
    setFront: (front) => {
      city.setRowFront(front);
    },
    still,
  });
  scene.add(skyline.person);
  let disposed = false;
  let arrival = 0;
  let resultsProgress = -1;
  let dawn = 0;
  // the pointer over the cracks as last sent to the city (setCrackPointer), to send only changes
  let crackPointer = '';
  const dawnPosition = new Vector3();
  const dawnTarget = new Vector3();
  const rowPosition = new Vector3();
  const rowTarget = new Vector3();
  let testHandle: DisplayHandle | null = null; // the display testDisplay() put up
  displays.onPlacement((slot, from, to) => {
    if (from) city.setDisplaySlot(from.building, from.tier, from.face, -1);
    if (to) city.setDisplaySlot(to.building, to.tier, to.face, slot);
  });
  let avoidProvider: () => ReadonlyArray<ScreenRect> = () => [];
  const words = createWords({
    displays,
    buildings: city.buildings,
    camera,
    screen: () => renderer.domElement.getBoundingClientRect(),
    focusKey: () => focus?.cwe ?? 'none',
    avoid: () => avoidProvider(),
    subject: () =>
      focus
        ? new Box3(
            new Vector3(focus.box.x - focus.box.w * 0.9, 0, focus.box.z - focus.box.d * 0.9),
            new Vector3(focus.box.x + focus.box.w * 0.9, focus.top * 1.35, focus.box.z + focus.box.d * 0.9),
          )
        : null,
    subjectBuilding: () => focus?.building ?? null,
    hidden: clearedAway,
    focusDistance: () => focusNow.distance,
    rowWord: (text) => skyline.word(text),
    still,
  });
  // With reduced motion a frame is drawn only on demand, so a display that changes asks for one: on
  // the next animation frame, however many changes come before it. Never at once: a display can
  // change while a frame is being drawn, and a frame asked for there would draw inside that frame.
  let displayFrame = 0;
  displays.onChange(() => {
    if (!still || displayFrame) return;
    displayFrame = requestAnimationFrame(() => {
      displayFrame = 0;
      draw(performance.now());
    });
  });
  let sway = 0;
  // tests only (?test&sway=off): the view holds still, so the camera depends on the scroll alone
  const swayAmplitude = params.get('sway') === 'off' && params.has('test') ? 0 : SHOTS.sandbox.sway.amplitude;
  // tests only (?test&clock=stop): the shared clock holds at zero, so nothing moves but the camera
  const clockStopped = params.get('clock') === 'stop' && params.has('test');
  const boxPosition = new Vector3();
  const boxTarget = new Vector3();
  let gateMoment: GateMoment | null = null;
  let refusing: GateIndex | null = null;
  // the fix in flight, and the camera's chase behind it and view from the side
  const fix = new Vector3();
  const chasePosition = new Vector3();
  const chaseTarget = new Vector3();
  const sidePosition = new Vector3();
  const sideTarget = new Vector3();
  let fixOut = false; // the gates are out and the fix is flying this frame
  const gateTops: GateTop[] = [0, 1, 2].map(() => ({ shown: false, x: 0, y: 0, state: 0 }));
  let mergeProgress = -1; // the merge section's scroll progress; -1 before it comes up the screen
  let enter = 0; // the merge shot's entry, eased
  let merged = false;
  let mergedAt = -1; // performance.now() when the merge happened; -1 before
  let mergeGlow = 0; // eased 0 to 1 after the merge
  const mergePosition = new Vector3();
  const mergeTarget = new Vector3();
  const pullPosition = new Vector3();
  let hold = 0;
  let lone = 0; // eased 0 to 1 after the merge: how dark the rest of the city has gone
  let pull = 0; // the pull-back after the merge, 0 to 1
  let outro = 0;
  const pointer = new Vector2();
  const lean = new Vector2();
  let width = 0;
  let height = 0;
  let frame = 0;
  let running = false;
  let ready = false;
  const start = performance.now();

  function resize(): void {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Portrait screens see less sideways, so widen the lens to keep the city in frame
    camera.fov = camera.aspect < 1 ? 62 : 50;
    camera.updateProjectionMatrix();
    depthOfField?.setSize(width, height, renderer.getPixelRatio());
  }

  function draw(now: number): void {
    // nothing is drawn until the shaders have compiled off the main thread (below): a first draw
    // compiling them itself would hold the page still for over half a second
    if (!ready) return;
    journey.sample(progress, pose);
    atmosphere.update(pose.phase, along(SHOTS.dawn.sky, dawn));
    syncShared(shared, atmosphere, still || clockStopped ? 0 : (now - start) / 1000);
    if (quality === 'low') shared.uFogDensity.value *= LOW_TIER_FOG;

    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    displays.update(dt);
    words.update(4); // a few milliseconds a frame choosing towers for the words
    if (!still) lean.lerp(pointer, 0.05);
    const overCity = along(SHOTS.descent.overCity, progress);
    const wide = camera.aspect >= 1;
    camera.position.copy(pose.position);
    camera.position.y += wide ? 0 : SHOTS.descent.rise * overCity;
    pose.target.x -= wide ? SHOTS.descent.aside * overCity : 0;
    // over the city, the backlog is in focus; above the clouds, nothing is blurred
    subject.copy(pose.target);
    focusNow.depth = SHOTS.descent.focus.depth;
    focusNow.blur = SHOTS.descent.focus.blur * overCity;
    focusNow.tilt = SHOTS.descent.focus.tilt;

    pushEased = along(SHOTS.pick.enter, pushRaw);
    enter = along(SHOTS.merge.enter, mergeProgress);
    if (focus) {
      closeView(focus, wide, wantPosition, wantTarget);
      // glide to a newly chosen building rather than cut, except on the first placement
      const k = still || !settled ? 1 : 1 - Math.exp(-dt * 3.2);
      closePosition.lerp(wantPosition, k);
      closeTarget.lerp(wantTarget, k);
      settled = true;
      // the failing test: the dolly keeps creeping in on the crack
      const dolly = along(SHOTS.reproduce.move, reproduce);
      dollyPosition.lerpVectors(closePosition, closeTarget, SHOTS.reproduce.closer * dolly);
      camera.position.lerp(dollyPosition, pushEased);
      pose.target.lerp(closeTarget, pushEased);
      focusInto(SHOTS.pick.focus, closeTarget, pushEased);
      focusInto(SHOTS.reproduce.focus, closeTarget, dolly * pushEased);
      // the line of sight is cleared toward the middle of the building itself, from wherever the
      // camera stands (the close-up, the sandbox and the merge each see it from elsewhere)
      clearTarget.set(focus.box.x, focus.top * 0.5, focus.box.z);
      // over the row the camera has left the finding behind, so nothing needs clearing or dimming
      const away = along(SHOTS.results.enter, resultsProgress);
      clearAmount = pushEased * (1 - away);
      city.setFocus(focus.building, clearAmount, clearTarget, false);
      city.setPulse(pulseAt < 0 ? 99 : (now - pulseAt) / 1000);

      // the sandbox: step back to see the whole volume, then orbit it with the scroll; the
      // visitor's drag turns it further, and it drifts on slowly while nobody is dragging
      const view = along(SHOTS.sandbox.enter, drop);
      const volume = ease('smooth', drop);
      if (!still && drop > 0.95) swayClock += dt;
      sway = swayAmplitude * Math.sin((swayClock * Math.PI * 2) / SHOTS.sandbox.sway.period);
      const orbit = SHOTS.sandbox.orbit * (along(SHOTS.sandbox.move, sandboxProgress) - 0.5) * view;
      yaw += (yawWanted + sway - yaw) * (still ? 1 : 1 - Math.exp(-dt * 6));
      sandboxView(focus, closePosition, yaw + orbit, wide, boxPosition, boxTarget);
      camera.position.lerp(boxPosition, view);
      pose.target.lerp(boxTarget, view);
      focusInto(SHOTS.sandbox.focus, boxTarget, view);
      const clearAway = 1 - enter;
      sandbox.update(focus, volume * clearAway);
      city.setPatch(patch);

      // the gates in the sky (gates.ts): the fix rises off the sandbox's roof and flies through the
      // three barriers, the camera riding behind it, then out to the side to see where it has been;
      // a refused fix flies back to the sandbox
      gates.path(focus, gatePath);
      const moment = gateMoment;
      const show = moment ? Math.min(moment.chase * 2, 1) * clearAway : 0;
      fixOut = false;
      if (moment) {
        gates.pointAt(gatePath, moment.travel, fix);
        const shot = SHOTS.gates;
        chasePosition
          .copy(fix)
          .addScaledVector(gatePath.along, -shot.chase.back)
          .addScaledVector(UP, shot.chase.up);
        chaseTarget
          .copy(fix)
          .addScaledVector(gatePath.along, shot.chase.ahead)
          .addScaledVector(UP, -shot.chase.down);
        // three-quarter view from behind and to one side: all three barriers face the camera partly
        const sideShot = wide ? shot.side.wide : shot.side.tall;
        sideTarget.lerpVectors(gatePath.rise, gatePath.end, shot.side.at).addScaledVector(UP, sideShot.lift);
        sidePosition
          .copy(sideTarget)
          .addScaledVector(gatePath.side, sideShot.out)
          .addScaledVector(gatePath.along, -sideShot.back)
          .addScaledVector(UP, sideShot.up);
        const chase = ease(shot.ease, moment.chase) * clearAway;
        camera.position.lerp(chasePosition, chase);
        pose.target.lerp(chaseTarget, chase);
        focusInto(shot.focus, fix, chase);
        const side = ease(shot.ease, moment.side) * clearAway;
        camera.position.lerp(sidePosition, side);
        pose.target.lerp(sideTarget, side);
        focusInto(shot.focus, sideTarget, side);
        fixOut = show > 0.5;
      }
      gates.update(gatePath, moment ?? IDLE_GATES, refusing, show, (now - start) / 1000, still);

      // the merge: back to the building, sealed in dim lime until a person merges it
      if (enter > 0) {
        sandboxView(focus, closePosition, 0, wide, mergePosition, mergeTarget);
        camera.position.lerp(mergePosition, enter);
        pose.target.lerp(mergeTarget, enter);
        focusInto(SHOTS.merge.focus, mergeTarget, enter);
      }
      const target = merged ? 1 : 0;
      mergeGlow += (target - mergeGlow) * (still ? 1 : 1 - Math.exp(-dt * 2.2));
      city.setSeal(enter > 0.05 ? 1 : 0, mergeGlow);
      const since = merged && mergedAt >= 0 ? (now - mergedAt) / 1000 : -1;

      // holding: the lime wave runs out as far as the hold has gone (and back if let go early);
      // merged: it runs on and fades. With reduced motion there is no wave, only the end state.
      shared.uWaveFrom.value.set(focus.box.x, focus.box.z);
      let wave = 0;
      let waveFade = 0;
      if (!still && enter > 0.05) {
        if (since >= 0) {
          wave = MERGE.reach * (1 + since * MERGE.runOn);
          waveFade = 1 - MathUtils.smoothstep(since, 0, MERGE.fade);
        } else if (hold > 0) {
          wave = MERGE.reach * hold;
          waveFade = Math.min(hold * 4, 1);
        }
      }
      shared.uWave.value = wave;
      shared.uWaveFade.value = waveFade;
      // merged: the rest of the city goes dark around the sealed building, until the close
      lone += (target - lone) * (still ? 1 : 1 - Math.exp(-dt * MERGE.darken));
      shared.uLone.value = lone * enter * (1 - outro);

      // and the camera pulls back until the building stands alone (not with reduced motion)
      const shot = SHOTS.merge.pull;
      pull = merged
        ? still || since < 0
          ? 0
          : ease('cubicInOut', since / shot.seconds)
        : pull * Math.exp(-dt * 4);
      if (enter > 0 && pull > 0.001) {
        pullPosition.subVectors(mergePosition, mergeTarget).multiplyScalar(shot.distance);
        pullPosition.y *= shot.lift / shot.distance;
        pullPosition.add(mergeTarget);
        camera.position.lerp(pullPosition, pull * enter);
        // on a tall screen the copy covers the middle of the view: look lower, so the building
        // rises into the clear sky above the copy rather than standing behind it
        if (!wide) pose.target.y -= focus.top * shot.tallDrop * pull * enter;
      }
      rise.update(
        focus,
        merged && mergedAt >= 0 && !still ? (now - mergedAt) / 1000 : -1,
        renderer.getPixelRatio(),
      );

      if (outro > 0) {
        const view = wide ? FAREWELL.wide : FAREWELL.tall;
        const up = along(SHOTS.outro.rise, outro);
        camera.position.lerp(view.position, up);
        pose.target.lerp(view.target, up);
        focusInto(SHOTS.outro.focus, view.target, up);
      }

      // the results: round over the shoulder and along the row
      skyline.update(resultsProgress, dt);
      const onRow = skyline.pose(resultsProgress, wide, rowPosition, rowTarget);
      if (onRow > 0) {
        camera.position.lerp(rowPosition, onRow);
        pose.target.lerp(rowTarget, onRow);
        focusInto(SHOTS.results.focus, rowTarget, onRow);
      }

      // the dawn: past the end of the row, looking back along it
      skyline.updateSign(dawn);
      const morning = along(SHOTS.dawn.move, dawn);
      if (morning > 0) {
        const view = wide ? SHOTS.dawn.wide : SHOTS.dawn.tall;
        camera.position.lerp(dawnPosition.set(...view.position), morning);
        pose.target.lerp(dawnTarget.set(...view.target), morning);
        focusInto(SHOTS.dawn.focus, dawnTarget, morning);
      }
    }
    const leanShare = 1 - pushEased * 0.7;
    camera.position.x += lean.x * LEAN.x * leanShare;
    camera.position.y += lean.y * LEAN.y * leanShare;
    camera.lookAt(pose.target);

    // the first screen: the day deck over the night city, the findings burning through it
    tear.update(progress, arrival, dt, still ? 0 : (now - start) / 1000, width, height);
    shared.uEmbers.value = 1 - along(SHOTS.tear.embers, progress);
    sky.update(camera.position, atmosphere, tear.gone >= 1 && camera.position.y < DECKS_BELOW);
    streets.update(camera.position);
    const viewScale =
      (renderer.getPixelRatio() * height) / (2 * Math.tan(MathUtils.degToRad(camera.fov) / 2));
    city.setViewScale(viewScale);
    gates.setViewScale(viewScale);
    gpuTimer?.begin();
    focusNow.distance = camera.position.distanceTo(subject);
    // with the camera where the shaders will see it: a building part way out on the soft edge of the
    // line of sight needs its transparent copy drawn (focus-clear.glsl)
    if (focus) city.setFocus(focus.building, clearAmount, clearTarget, onClearEdge());
    // while the tear is small the city is drawn only inside it, the deck covering all the rest
    const inside = tear.scissor(width, height);
    if (inside) {
      renderer.setScissorTest(true);
      renderer.setScissor(inside.x, inside.y, inside.w, inside.h);
      renderer.render(scene, camera);
      renderer.setScissorTest(false);
    } else if (depthOfField) {
      depthOfField.render(scene, camera, focusNow);
    } else {
      renderer.render(scene, camera);
    }
    tear.render(renderer);
    gpuTimer?.end();

    for (const label of labels) {
      projected.copy(label.finding.anchor).project(camera);
      label.onScreen = projected.z < 1 && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.05;
      label.x = (projected.x * 0.5 + 0.5) * width;
      label.y = (-projected.y * 0.5 + 0.5) * height;

      facadePoint.set(label.finding.box.x, label.finding.box.h * 0.55, label.finding.box.z).project(camera);
      label.targetOnScreen =
        facadePoint.z < 1 && Math.abs(facadePoint.x) < 1.05 && Math.abs(facadePoint.y) < 1.05;
      label.targetX = (facadePoint.x * 0.5 + 0.5) * width;
      label.targetY = (-facadePoint.y * 0.5 + 0.5) * height;
    }
    gateFlag.shown = false;
    if (gates.flag(flagPoint)) {
      // the refusing barrier's flag; above the frame it still shows, held at the top edge (world-stage.ts)
      flagPoint.project(camera);
      gateFlag.shown = flagPoint.z < 1 && Math.abs(flagPoint.x) < 1 && flagPoint.y > -1;
      gateFlag.x = (flagPoint.x * 0.5 + 0.5) * width;
      gateFlag.y = (-flagPoint.y * 0.5 + 0.5) * height;
    }
    fixOnScreen.shown = false;
    if (fixOut) {
      flagPoint.copy(fix).project(camera);
      fixOnScreen.shown = flagPoint.z < 1 && Math.abs(flagPoint.x) < 1 && Math.abs(flagPoint.y) < 1;
      fixOnScreen.x = (flagPoint.x * 0.5 + 0.5) * width;
      fixOnScreen.y = (-flagPoint.y * 0.5 + 0.5) * height;
    }
    gateTops.forEach((top, i) => {
      top.shown = false;
      if (!gates.top(i, flagPoint)) return;
      flagPoint.project(camera);
      top.shown = flagPoint.z < 1 && Math.abs(flagPoint.x) < 1 && Math.abs(flagPoint.y) < 1;
      top.x = (flagPoint.x * 0.5 + 0.5) * width;
      top.y = (-flagPoint.y * 0.5 + 0.5) * height;
      top.state = gates.state(i);
    });
    for (const listener of listeners) listener(labels, gateFlag, fixOnScreen, gateTops);
  }

  function loop(now: number): void {
    draw(now);
    frame = requestAnimationFrame(loop);
  }

  function play(): void {
    if (!ready || still || running || document.hidden) return;
    running = true;
    frame = requestAnimationFrame(loop);
  }

  function pause(): void {
    running = false;
    cancelAnimationFrame(frame);
  }

  const onVisibility = (): void => {
    if (document.hidden) pause();
    else play();
  };
  const observer = new ResizeObserver(() => {
    resize();
    if (still) draw(performance.now());
  });
  observer.observe(canvas);
  document.addEventListener('visibilitychange', onVisibility);

  resize();
  // compile every shader in the scene in parallel where the driver can (KHR_parallel_shader_compile),
  // then start; the page's words and buttons are already there, over the CSS sky
  const begin = (): void => {
    if (disposed || ready) return;
    ready = true;
    if (still) draw(performance.now());
    else play();
  };
  renderer.compileAsync(scene, camera).then(begin, begin);

  // The pushed-in shaders are large, and compiled at first use they would freeze the page just as the
  // visitor scrolls into the first close-up. Compile them now, in the background, once the page has
  // had its first moments to itself.
  const warm = window.setTimeout(() => {
    const variants = city.pushedInVariants();
    void renderer.compileAsync(variants, camera).then(() => {
      if (disposed) return;
      // the first draw also builds what the driver needs for instancing, so do one out of sight
      const target = new WebGLRenderTarget(1, 1);
      renderer.setRenderTarget(target);
      renderer.render(variants, camera);
      renderer.setRenderTarget(null);
      target.dispose();
      variants.clear();
    });
  }, WARM_AFTER);

  return {
    findings: city.findings,
    displays,
    buildings: city.buildings,
    testReveal(reveal) {
      testHandle?.set(reveal);
    },
    testDisplay(text, tone = 'neutral') {
      testHandle?.release();
      testHandle = null;
      const snapshot = camera.clone();
      snapshot.updateMatrixWorld();
      // as the page's own words do (words.ts): on a tower other than the beat's subject, and not on one
      // the city has faded out of the line of sight to it
      const towers = city.buildings.filter((b) => b.index !== focus?.building && !clearedAway(b));
      const choice = finish(planWord(text, snapshot, towers, createOccluders(city.buildings)));
      const handle = displays.claim();
      if (!choice || !handle) {
        handle?.release();
        return null;
      }
      testHandle = handle;
      const { plan } = choice;
      handle.place(plan.placement);
      handle.setBitmap(plan.bitmap);
      handle.setTone(tone);
      handle.set(1);
      const spots = pixelCentres(choice);
      const visible = visiblePixels(createOccluders(city.buildings), snapshot, choice, spots);
      const { width, height } = renderer.domElement.getBoundingClientRect();
      return {
        building: choice.building.index,
        tier: plan.placement.tier,
        face: plan.placement.face,
        layout: plan.layout,
        pitch: plan.placement.pitch,
        distance: choice.distance,
        cols: plan.bitmap.cols,
        rows: plan.bitmap.rows,
        bits: Array.from(plan.bitmap.data),
        cells: spots.map((spot): [number, number] => {
          const ndc = spot.clone().project(snapshot);
          return [((ndc.x + 1) / 2) * width, ((1 - ndc.y) / 2) * height];
        }),
        visible,
      };
    },
    setWord(key) {
      words.setActive(key);
    },
    setScan(progress) {
      scanProgress = Math.min(Math.max(progress, 0), 1);
      shared.uScanX.value = scanX(scanProgress, range);
      shared.uScanOn.value = scanProgress > 0 && scanProgress < 1 ? 1 : 0;
      if (still) draw(performance.now());
    },
    scan() {
      return {
        progress: scanProgress,
        count: city.findings.filter(ignited).length,
        total: city.findings.length,
      };
    },
    ignited,
    setAvoid(provider) {
      avoidProvider = provider;
    },
    words: {
      inspect: () => words.inspect(),
      planAll: (overrides) => words.planAll(overrides),
    },
    get night() {
      return atmosphere.night;
    },
    get push() {
      return pushEased;
    },
    get focus() {
      return focus;
    },
    setPush(value) {
      if (value === pushRaw) return;
      pushRaw = value;
      if (still) draw(performance.now());
    },
    setReproduce(value) {
      if (value === reproduce) return;
      reproduce = value;
      if (still) draw(performance.now());
    },
    setSandbox(nextDrop, nextPatch, nextProgress) {
      if (nextDrop === drop && nextPatch === patch && nextProgress === sandboxProgress) return;
      drop = nextDrop;
      patch = nextPatch;
      sandboxProgress = nextProgress;
      if (still) draw(performance.now());
    },
    get outro() {
      return outro;
    },
    setResults(value) {
      if (value === resultsProgress) return;
      resultsProgress = value;
      if (still) draw(performance.now());
    },
    setArrival(amount) {
      arrival = amount;
    },
    get deckGone() {
      return tear.gone;
    },
    get deckWords() {
      return tear.wordsHold;
    },
    setDeckPointer(x, y) {
      tear.setPointer(x, y);
    },
    setDeckGuards(guards) {
      tear.setGuards(guards);
    },
    setDawn(amount) {
      if (amount === dawn) return;
      dawn = amount;
      if (still) draw(performance.now());
    },
    setCompany(typed) {
      skyline.setCompany(typed);
    },
    skyline() {
      return { ...skyline.inspect(), dawn, night: atmosphere.night };
    },
    project(x, y, z) {
      projected.set(x, y, z).project(camera);
      return {
        shown: projected.z < 1 && Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1,
        x: (projected.x * 0.5 + 0.5) * width,
        y: (-projected.y * 0.5 + 0.5) * height,
      };
    },
    inspect() {
      const round = (v: Vector3): number[] => [v.x, v.y, v.z].map((n) => Math.round(n * 10) / 10);
      return {
        camera: round(camera.position),
        target: round(pose.target),
        progress,
        arrival,
        tear: tear.inspect(),
        push: pushEased,
        drop,
        patch,
        enter,
        reproduce,
        merged,
        hold,
        lone,
        pull,
        outro,
        focus: focus?.cwe,
        depthOfField: depthOfField
          ? { distance: Math.round(focusNow.distance), blur: Math.round(focusNow.blur * 100) / 100 }
          : null,
        gpuMs: gpuTimer?.samples.slice(-60) ?? [],
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
      };
    },
    setOutro(amount) {
      if (amount === outro) return;
      outro = amount;
      if (still) draw(performance.now());
    },
    setMerge(nextProgress, nextMerged) {
      if (nextMerged && !merged) mergedAt = performance.now();
      if (!nextMerged) mergedAt = -1;
      const changed = nextProgress !== mergeProgress || nextMerged !== merged;
      mergeProgress = nextProgress;
      merged = nextMerged;
      if (changed && still) draw(performance.now());
    },
    setHold(amount) {
      hold = amount;
    },
    setGates(moment, refusedAt) {
      gateMoment = moment;
      refusing = refusedAt;
      if (still) draw(performance.now());
    },
    setOrbit(next) {
      yawWanted = next;
      if (still) draw(performance.now());
    },
    pulse() {
      if (!still) pulseAt = performance.now();
    },
    setFinding(cwe) {
      const next = city.findings.find((finding) => finding.cwe === cwe);
      if (!next || next === focus) return;
      focus = next;
      if (still) draw(performance.now());
    },
    setProgress(value) {
      if (value === progress) return;
      progress = value;
      if (still) draw(performance.now());
    },
    setPointer(x, y) {
      pointer.set(x, y);
    },
    setCrackPointer(hover, x, y, near) {
      // called from every frame's listener: only a change redraws (a still world draws on demand, and a
      // redraw here would call back into it)
      const key = `${String(hover?.building ?? -1)} ${String(x)} ${String(y)} ${near.toFixed(3)}`;
      if (key === crackPointer) return;
      crackPointer = key;
      const ratio = renderer.getPixelRatio();
      const height = renderer.domElement.clientHeight || window.innerHeight;
      city.setPointerGlow(
        hover?.building ?? -1,
        (x ?? 0) * ratio,
        (height - y) * ratio,
        x === null ? 0 : near,
        Math.min(window.innerWidth, height) * 0.16 * ratio,
      );
      if (still) draw(performance.now());
    },
    onFrame(listener) {
      listeners.push(listener);
    },
    dispose() {
      disposed = true;
      window.clearTimeout(warm);
      pause();
      cancelAnimationFrame(displayFrame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      sky.dispose();
      displays.dispose();
      city.dispose();
      streets.dispose();
      traffic.dispose();
      sandbox.dispose();
      rise.dispose();
      gates.dispose();
      skyline.dispose();
      tear.dispose();
      depthOfField?.dispose();
      renderer.dispose();
    },
  };
}
