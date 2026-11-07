/**
 * Mounts the world behind the page and ties it to the scroll. The descent runs over the
 * `[data-descent]` track: its top at the top of the viewport is progress 0, its bottom at the
 * bottom of the viewport is progress 1. The finding labels are DOM elements laid over the canvas,
 * so they stay readable, selectable and visible to screen readers.
 *
 * The `[data-push]` section that follows drives the push in on the chosen finding over the first
 * 55% of its scroll; while the camera is in, only that finding keeps its label. The `[data-sandbox]`
 * section drops the sandbox and writes the patch, and its `[data-orbit]` area turns the view:
 * drag sideways, or focus it and use the arrow keys (Home faces the front again). The `[data-gates]`
 * section flies the fix through the three gates (lib/gates.ts holds the shared timeline), and the
 * `[data-merge]` section brings the camera back to the sealed building for the merge, and the
 * `#results` section flies along the row of towers (world/skyline.ts). The sky lifts to dawn as the
 * `#apply` form arrives, and the company typed into it stands on the tallest tower in that view.
 *
 * Each beat shows only the finding labels it needs, and on a wide screen its panel is tied to what
 * it describes in the world (the chosen building, or the fix in flight) by a thin leader line.
 *
 * Quality is low on touch devices, small screens and machines with few cores. Without WebGL the
 * page keeps its text on a plain night ground (`data-world="off"` on <html>). With reduced motion
 * the scene is a storyboard of still frames: the sky under the headline, then the city at night, and
 * one frame per step after that.
 */
import type { WordKey } from '../world/words';
import { createWorld } from '../world/world';
import type { GateFlag, GateTop, LabelPlacement, ScreenPoint, World } from '../world/world';
import type { Finding } from '../world/city';
import type { Quality } from '../world/sky';
import { STATIC_PROGRESS } from '../world/journey';
import { SCAN } from '../world/scan';
import { resultsStat, stillResults } from '../world/skyline';
import { SHOTS } from '../world/shots';
import { onReducedMotionChange, prefersReducedMotion } from '../lib/reduced-motion';
import {
  getFinding,
  isFindingId,
  isMerged,
  onChoice,
  onFailure,
  onFinding,
  onHold,
  onMerge,
} from '../lib/story';
import { GATE_SHORT, GATES_FROM, gateMoment } from '../lib/gates';
import type { GateMoment } from '../lib/gates';
import { claimArrival } from './arrival';
import { refusingGate } from './gates-step';
import { ramp, signedProgress, smoothstep, trackProgress } from '../lib/track';
import { SANDBOX } from './sandbox-step';

const root = document.documentElement;

function pickQuality(): Quality {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const small = window.innerWidth < 768;
  const fewCores = (navigator.hardwareConcurrency || 4) <= 4;
  return coarse || small || fewCores ? 'low' : 'high';
}

function webglAvailable(): boolean {
  try {
    const probe = document.createElement('canvas').getContext('webgl2');
    // release the probe's context at once, rather than leave it for the browser to reclaim
    probe?.getExtension('WEBGL_lose_context')?.loseContext();
    return probe !== null;
  } catch {
    return false;
  }
}

/** Two labels closer than this, in CSS pixels, are pushed apart vertically. */
const LABEL_GAP = { x: 120, y: 30 } as const;
/** Clear space kept between a label and any text on the page. */
const TEXT_MARGIN = 16;

/** The dawn starts when the form's top is this many screens down, and takes this many screens. */
const DAWN_FROM = 1.15;
const DAWN_OVER = 1.1;

/** The gate flag's clear space from the screen edges and the gates panel, and below the strip. */
const FLAG_MARGIN = 16;
const FLAG_TOP = 88;
/** Two barrier names closer than this, in CSS pixels, would overlap: only one is shown. */
const TAG_GAP = { x: 170, y: 34 } as const;

/** Labels fade in only when night is dark enough, and never display at an unreadable opacity (< 0.8). */
function labelOpacity(night: number): number {
  if (night < 0.8) return 0;
  const t = smoothstep(0.8, 0.93, night);
  return t < 0.15 ? 0 : Math.max(t, 0.8);
}

/** Past this much push, only the focused finding keeps its label. */
const PUSH_SOLO = 0.2;

/** The leader line: drawn from this screen width up; its clear space from text, panel and edges,
 * how far it runs out level from the panel, how far down the panel it leaves, and its end pixels. */
const LEADER_MIN_WIDTH = 960;
const LEADER_CLEAR = 24;
const LEADER_ELBOW = 40;
const LEADER_TOP = 40;
const LEADER_PIXEL = 6;

/** Which beat a section is: what its labels show and what its panel is tied to. */
type Beat = 'overview' | 'pick' | 'proof' | 'gates' | 'record' | 'results';
/** Orbit: radians per CSS pixel of drag, radians per arrow key, and the limit either way. */
const ORBIT = { perPixel: 0.008, perKey: Math.PI / 12, limit: Math.PI } as const;

function describeYaw(yaw: number): string {
  const degrees = Math.round((yaw * 180) / Math.PI);
  if (degrees === 0) return 'Facing the front';
  return `Turned ${String(Math.abs(degrees))} degrees ${degrees < 0 ? 'left' : 'right'}`;
}

function buildLabels(list: HTMLOListElement, world: World): HTMLLIElement[] {
  list.replaceChildren();
  return world.findings.map((finding) => {
    const item = document.createElement('li');
    item.className = 'finding';
    const cwe = document.createElement('span');
    cwe.className = 'finding__cwe';
    cwe.textContent = finding.cwe;
    const name = document.createElement('span');
    name.className = 'finding__name';
    name.textContent = finding.name;
    item.append(cwe, ' ', name);
    list.append(item);
    return item;
  });
}

export function initWorldStage(stage: HTMLElement): () => void {
  const canvas = stage.querySelector<HTMLCanvasElement>('[data-world-canvas]');
  const list = stage.querySelector<HTMLOListElement>('[data-findings]');
  const track = document.querySelector<HTMLElement>('[data-descent]');
  const push = document.querySelector<HTMLElement>('[data-push]');
  const backlogSection = document.querySelector<HTMLElement>('#backlog');
  const reproduceSection = document.querySelector<HTMLElement>('[data-reproduce]');
  const recordSection = document.querySelector<HTMLElement>('#record');
  const resultsSection = document.querySelector<HTMLElement>('#results');
  const sandboxSection = document.querySelector<HTMLElement>('[data-sandbox]');
  const orbit = document.querySelector<HTMLElement>('[data-orbit]');
  const gatesSection = document.querySelector<HTMLElement>('[data-gates]');
  const mergeSection = document.querySelector<HTMLElement>('[data-merge]');
  const outroSection = document.querySelector<HTMLElement>('[data-outro]');
  const applySection = document.querySelector<HTMLElement>('#apply');
  const deckBlocks = Array.from(
    document.querySelectorAll<HTMLElement>('.beat--sky .beat__title, .beat--sky .hero__foot'),
  );
  const companyField = document.querySelector<HTMLInputElement>('[data-apply] input[name="company"]');
  if (!canvas || !list || !track) return () => {};
  if (!webglAvailable()) {
    root.dataset.world = 'off';
    return () => {};
  }

  let world: World | null = null;
  let items: HTMLLIElement[] = [];

  function progress(): number {
    return track ? trackProgress(track) : 0;
  }

  /** The descent with reduced motion: two still frames, the sky under the headline and then the
   * night city, swapped once the headline has scrolled away. */
  function stillProgress(): number {
    return progress() > 0.3 ? STATIC_PROGRESS : 0;
  }

  /** How far through the pick beat: the world eases its dolly in (shots.ts); one step with
   * reduced motion. */
  function pushAmount(): number {
    if (!push) return 0;
    const raw = trackProgress(push);
    if (prefersReducedMotion()) return raw > 0.15 ? 1 : 0;
    return raw;
  }

  /** How far through the failing test; held at its end with reduced motion. */
  function reproduceAmount(): number {
    if (!reproduceSection) return 0;
    const raw = trackProgress(reproduceSection);
    if (prefersReducedMotion()) return raw > 0 ? 1 : 0;
    return raw;
  }

  /** The sandbox: how far the volume has dropped (not eased: the world eases the camera and the
   * volume itself, shots.ts), how much of the patch is written, and how far through the beat (which
   * orbits the view; held still with reduced motion). */
  function sandboxAmounts(): readonly [number, number, number] {
    if (!sandboxSection) return [0, 0, 0];
    const p = trackProgress(sandboxSection);
    if (prefersReducedMotion()) return [p > 0.1 ? 1 : 0, p >= SANDBOX.patchTo ? 1 : 0, 0];
    return [ramp(SANDBOX.dropFrom, SANDBOX.dropTo, p), smoothstep(SANDBOX.patchFrom, SANDBOX.patchTo, p), p];
  }

  /** The gates at this scroll position; null until their section is coming up the screen, which is
   * when the camera comes round behind the fix (lib/gates.ts). */
  function gatesNow(): GateMoment | null {
    if (!gatesSection) return null;
    const p = signedProgress(gatesSection);
    if (p < GATES_FROM) return null;
    return gateMoment(p, refusingGate(), prefersReducedMotion());
  }

  /** The merge section's scroll progress, negative while it is still coming up the screen: the
   * world eases the camera back to the sealed building from it (shots.ts). With reduced motion it is
   * -1 (not begun) until the section is in place, then 1. */
  function mergeEnter(): number {
    if (!mergeSection) return -1;
    const p = signedProgress(mergeSection);
    if (prefersReducedMotion()) return p > 0 ? 1 : -1;
    return p;
  }

  /** The close: rises as the record section comes up the screen, done when it fills it (not eased:
   * the world eases the rise, shots.ts). */
  function outroAmount(): number {
    if (!outroSection) return 0;
    const top = outroSection.getBoundingClientRect().top;
    const p = (window.innerHeight - top) / (window.innerHeight * 0.9);
    if (prefersReducedMotion()) return p > 0.3 ? 1 : 0;
    return ramp(0, 1, p);
  }

  /** The results: the section's scroll progress, signed, which the world follows along the row; one
   * still frame for each number with reduced motion. */
  function resultsNow(): number {
    if (!resultsSection) return -1;
    const p = signedProgress(resultsSection);
    return prefersReducedMotion() ? stillResults(p) : p;
  }

  /** The dawn: follows the form coming up the screen, from just before it appears until it has
   * arrived (not eased: the world eases it, shots.ts). All or nothing with reduced motion. */
  function dawnNow(): number {
    if (!applySection) return 0;
    const top = applySection.getBoundingClientRect().top;
    const p = (window.innerHeight * DAWN_FROM - top) / (window.innerHeight * DAWN_OVER);
    if (prefersReducedMotion()) return p > 0.5 ? 1 : 0;
    return ramp(0, 1, p);
  }

  /** Puts the row's current statement forward in the panel. With reduced motion, and without the
   * world, all three stand equal. */
  function markResultsStat(): void {
    if (!resultsSection) return;
    if (prefersReducedMotion()) delete resultsSection.dataset.stat;
    else resultsSection.dataset.stat = String(resultsStat(signedProgress(resultsSection)));
  }

  let yaw = 0;
  let drag: { x: number; yaw: number } | null = null;
  function turn(next: number): void {
    yaw = Math.min(Math.max(next, -ORBIT.limit), ORBIT.limit);
    world?.setOrbit(yaw);
    if (orbit) {
      orbit.setAttribute('aria-valuenow', String(Math.round((yaw * 180) / Math.PI)));
      orbit.setAttribute('aria-valuetext', describeYaw(yaw));
    }
  }
  const onOrbitDown = (event: PointerEvent): void => {
    if (!orbit) return;
    drag = { x: event.clientX, yaw };
    orbit.setPointerCapture(event.pointerId);
    orbit.dataset.dragging = '';
  };
  const onOrbitMove = (event: PointerEvent): void => {
    if (drag) turn(drag.yaw + (event.clientX - drag.x) * ORBIT.perPixel);
  };
  const onOrbitUp = (): void => {
    drag = null;
    if (orbit) delete orbit.dataset.dragging;
  };
  const onOrbitKey = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') turn(yaw - ORBIT.perKey);
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') turn(yaw + ORBIT.perKey);
    else if (event.key === 'Home') turn(0);
    else return;
    event.preventDefault();
  };

  const texts = Array.from(document.querySelectorAll<HTMLElement>('.beat__text, [data-avoid]'));
  const order: number[] = [];
  const placed: Array<{ x: number; y: number }> = [];

  const railBox = document.querySelector<HTMLElement>('[data-rail]');

  /** True when a label anchored at (x, y) would sit over any text block on screen, or under the rail. */
  function overText(x: number, y: number): boolean {
    if (railBox?.hasAttribute('data-shown')) {
      const rail = railBox.getBoundingClientRect();
      if (
        x + LABEL_GAP.x / 2 > rail.left - TEXT_MARGIN &&
        y > rail.top - TEXT_MARGIN &&
        y - LABEL_GAP.y < rail.bottom
      ) {
        return true;
      }
    }
    for (const text of texts) {
      const box = text.getBoundingClientRect();
      if (box.bottom < 0 || box.top > window.innerHeight) continue;
      // the label sits above and centred on its anchor; its body spans about 120 x 30 px
      if (
        x + LABEL_GAP.x / 2 > box.left - TEXT_MARGIN &&
        x - LABEL_GAP.x / 2 < box.right + TEXT_MARGIN &&
        y > box.top - TEXT_MARGIN &&
        y - LABEL_GAP.y - 12 < box.bottom + TEXT_MARGIN
      ) {
        return true;
      }
    }
    return false;
  }

  const leaderSvg = stage.querySelector<SVGSVGElement>('[data-leader]');
  const leaderLine = leaderSvg?.querySelector<SVGPathElement>('.leader__line');
  const leaderDot = leaderSvg?.querySelector<SVGRectElement>('.leader__dot');
  const leaderAnchor = leaderSvg?.querySelector<SVGRectElement>('.leader__anchor');
  const gateFlag = stage.querySelector<HTMLElement>('[data-gate-flag]');
  const gatePanel = document.querySelector<HTMLElement>('#gates .track__panel');
  const flagSize = { width: 0, height: 0 };

  /**
   * The refusing check's flag: the failing check's name, hung over the building it was run on. It stays
   * whole on screen, below the strip and clear of the gates panel: beside the panel (wide screens)
   * it slides along the panel's edge; where the panel spans the screen (phones) and would cover it,
   * it hides, since the panel already names the failing check.
   */
  function placeFlag(flag: Readonly<GateFlag>): void {
    if (!gateFlag) return;
    const refused = refusingGate();
    let shown = flag.shown && refused !== null;
    if (shown && refused !== null) {
      const text = `${GATE_SHORT[refused]} refused it`;
      if (gateFlag.textContent !== text || flagSize.width === 0) {
        gateFlag.textContent = text;
        gateFlag.hidden = false;
        flagSize.width = gateFlag.offsetWidth;
        flagSize.height = gateFlag.offsetHeight;
      }
      const half = flagSize.width / 2 + FLAG_MARGIN;
      const y = Math.max(flag.y, flagSize.height + FLAG_TOP);
      let right = window.innerWidth;
      const panel = gatePanel?.getBoundingClientRect();
      if (panel && panel.width > 0 && y > panel.top && y - flagSize.height < panel.bottom) {
        if (panel.left > half * 2) right = panel.left;
        else shown = false;
      }
      const x = Math.min(Math.max(flag.x, half), right - half);
      gateFlag.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }
    if (gateFlag.hidden === shown) gateFlag.hidden = !shown;
  }

  // the barriers' names, on their top edges while the gates are out; the refusing one carries the flag
  const tagsPlaced: Array<{ x: number; y: number }> = [];
  const gateTags = GATE_SHORT.map((name) => {
    const tag = document.createElement('p');
    tag.className = 'gate-tag';
    tag.setAttribute('aria-hidden', 'true');
    tag.hidden = true;
    tag.textContent = name;
    stage.append(tag);
    return tag;
  });

  /** Each barrier's name over it, marked once the fix is through; left out where it would sit on the
   * panel or the copy, or under the strip. (The panel's ticker says the same for screen readers.) */
  function placeTags(tops: readonly Readonly<GateTop>[]): void {
    const panel = gatePanel?.getBoundingClientRect();
    // seen from behind the fix the three line up: the one ahead of it is named first, and another
    // only where it does not sit on a name already placed
    const ahead = tops.findIndex((top) => top.state === 0);
    const order = [0, 1, 2].sort((a, b) => Number(b === ahead) - Number(a === ahead));
    tagsPlaced.length = 0;
    order.forEach((i) => {
      const top = tops[i];
      const tag = gateTags[i];
      if (!top || !tag) return;
      let shown = top.shown && top.state !== 2 && top.y > FLAG_TOP + 24;
      if (
        shown &&
        tagsPlaced.some((p) => Math.abs(p.x - top.x) < TAG_GAP.x && Math.abs(p.y - top.y) < TAG_GAP.y)
      ) {
        shown = false;
      }
      if (shown && panel && panel.width > 0) {
        const overPanel =
          top.x > panel.left - 70 &&
          top.x < panel.right + 70 &&
          top.y > panel.top &&
          top.y - 32 < panel.bottom;
        if (overPanel || overText(top.x, top.y)) shown = false;
      }
      if (tag.hidden === shown) tag.hidden = !shown;
      if (!shown) return;
      tagsPlaced.push({ x: top.x, y: top.y });
      const state = top.state === 1 ? 'passed' : 'waiting';
      if (tag.dataset.state !== state) tag.dataset.state = state;
      tag.style.transform = `translate3d(${top.x.toFixed(1)}px, ${top.y.toFixed(1)}px, 0)`;
    });
  }

  /**
   * The beats, in page order, each with the panel that belongs to it. A beat whose panel is tied to
   * something in the world names it: the chosen building, or the fix while it flies the gates. The
   * results are about every run, so their panel has no leader.
   */
  const beats: ReadonlyArray<{ beat: Beat; section: HTMLElement | null; leader: 'building' | 'fix' | null }> =
    [
      { beat: 'overview', section: backlogSection, leader: null },
      { beat: 'pick', section: push, leader: 'building' },
      { beat: 'proof', section: reproduceSection, leader: 'building' },
      { beat: 'proof', section: sandboxSection, leader: 'building' },
      { beat: 'gates', section: gatesSection, leader: 'building' },
      { beat: 'proof', section: mergeSection, leader: 'building' },
      { beat: 'record', section: recordSection, leader: 'building' },
      { beat: 'results', section: resultsSection, leader: null },
    ];

  const panels = beats.map(({ section }) => section?.querySelector<HTMLElement>('.track__panel') ?? null);

  /** The keyword each beat spells on a tower (words.ts), in the same order as `beats`: none for the
   * pick, which has no word of its own. */
  const beatWords: ReadonlyArray<WordKey | null> = [
    'backlog',
    null,
    'test',
    'sandbox',
    'gates',
    'merge',
    'record',
    'results',
  ];

  // --- The scanner sweep (world/scan.ts) -----------------------------------------------------
  const countBox = document.querySelector<HTMLElement>('[data-count]');
  const countNum = document.querySelector<HTMLElement>('[data-count-num]');
  const countTotal = document.querySelector<HTMLElement>('[data-count-total]');
  // tests only (?test&scan=0.5): hold the sweep still at that point, so a frame can be looked at
  const heldScan = ((): number | null => {
    const query = new URLSearchParams(window.location.search);
    return query.has('test') && query.has('scan') ? Number(query.get('scan')) : null;
  })();
  let scanStarted: number | null = null;
  let scanDone = false;
  let scanPrimed = false;
  let shownCount = -1;

  /** Writes the count of cracks the line has passed into the beat. */
  function showCount(): void {
    if (!world || !countBox || !countNum) return;
    const { count, total } = world.scan();
    if (countBox.hidden) countBox.hidden = false;
    if (count !== shownCount) {
      shownCount = count;
      countNum.textContent = String(count);
    }
    // read out once, as a whole, and not number by number as it counts
    if (countTotal && countTotal.textContent === '')
      countTotal.textContent = `${String(total)} findings in this scene`;
  }

  /**
   * Plays the sweep once when the backlog beat (index 0) arrives. Before it, the cracks are dark; a
   * visitor who has already moved past the beat, or who asks for reduced motion, gets every crack
   * lit and the final count at once, with no line.
   */
  function driveScan(index: number): void {
    if (!world || scanDone) return;
    if (heldScan !== null && !prefersReducedMotion()) {
      world.setScan(heldScan);
      showCount();
      return;
    }
    if (prefersReducedMotion() || index > 0) {
      scanDone = true;
      world.setScan(1);
      showCount();
      return;
    }
    if (scanStarted === null && index !== 0) {
      // still falling through the sky: the cracks are dark and wait for the line
      if (!scanPrimed) {
        scanPrimed = true;
        world.setScan(0);
      }
      return;
    }
    scanStarted ??= performance.now();
    const progress = Math.min((performance.now() - scanStarted) / (SCAN.seconds * 1000), 1);
    world.setScan(progress);
    if (progress >= 1) scanDone = true;
    showCount();
  }

  /** Where the page's own text and panels are right now, for the words on the towers to keep clear of:
   * the header and rail, and every line, card and button of the beat at the middle of the screen. */
  function avoidRects(): Array<{ left: number; top: number; right: number; bottom: number }> {
    const rects: Array<{ left: number; top: number; right: number; bottom: number }> = [];
    const add = (element: Element): void => {
      const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
      if (width > 0 && height > 0) rects.push({ left, top, right, bottom });
    };
    document.querySelectorAll('header, .rail, .rail__link').forEach(add);
    beats[currentBeat()]?.section
      ?.querySelectorAll('h1, h2, h3, p, li, button, a, table, pre, .panel, .track__panel')
      .forEach(add);
    return rects;
  }

  /** The beat at the middle of the screen this frame, or -1 between beats (the sky, the form). */
  function currentBeat(): number {
    const middle = window.innerHeight / 2;
    return beats.findIndex(({ section }) => {
      if (!section) return false;
      const box = section.getBoundingClientRect();
      return box.top <= middle && box.bottom > middle;
    });
  }

  /** Which finding labels this beat needs: all of the backlog over the city, the three that can be
   * picked while choosing, and only the chosen one once the camera is on it. Between beats, and over
   * the results' row, where the findings are behind the camera, none. */
  function tagsFor(index: number): (finding: Finding) => boolean {
    const beat = beats[index]?.beat;
    const focus = world?.focus;
    const chosen = (finding: Finding): boolean => finding === focus;
    const pickable = (finding: Finding): boolean => isFindingId(finding.cwe);
    switch (beat) {
      case 'overview':
        return () => true;
      case 'pick':
        return (world?.push ?? 0) > PUSH_SOLO ? chosen : pickable;
      case 'proof':
      case 'gates':
      case 'record':
        return chosen;
      default:
        return () => false;
    }
  }

  /**
   * The leader: a thin line from the beat's panel to the thing it describes. It leaves the panel level,
   * then slants to the object, and shows only while there is clear room for it.
   */
  function placeLeader(index: number, labels: readonly LabelPlacement[], fix: Readonly<ScreenPoint>): void {
    if (!leaderSvg || !leaderLine || !leaderDot || !leaderAnchor) return;
    const entry = beats[index];
    const panel = panels[index];
    let end: { x: number; y: number } | null = null;
    if (entry?.leader === 'fix' && fix.shown) {
      end = fix;
    } else if (entry?.leader === 'building') {
      const label = labels.find((l) => l.finding === world?.focus);
      if (label?.targetOnScreen) end = { x: label.targetX, y: label.targetY };
      else if (label?.onScreen) end = { x: label.x, y: label.y };
    }
    const box = panel?.getBoundingClientRect();
    const text = entry?.section?.querySelector<HTMLElement>('.beat__text')?.getBoundingClientRect();
    const shown =
      end !== null &&
      box !== undefined &&
      window.innerWidth >= LEADER_MIN_WIDTH &&
      box.top >= 0 &&
      box.bottom <= window.innerHeight &&
      end.x < box.left - LEADER_CLEAR &&
      end.y > LEADER_CLEAR &&
      end.y < window.innerHeight - LEADER_CLEAR &&
      (text === undefined || end.x > text.right + LEADER_CLEAR);
    leaderSvg.toggleAttribute('data-shown', shown);
    if (!shown || !end) return;
    const px = box.left;
    const py = box.top + Math.min(LEADER_TOP, box.height / 4);
    // out from the panel level, then down (or up) to the object at a slant
    const elbow = Math.max(end.x + LEADER_CLEAR, px - LEADER_ELBOW);
    leaderLine.setAttribute(
      'd',
      `M ${px.toFixed(1)} ${py.toFixed(1)} H ${elbow.toFixed(1)} L ${end.x.toFixed(1)} ${end.y.toFixed(1)}`,
    );
    leaderAnchor.setAttribute('x', (px - LEADER_PIXEL / 2).toFixed(1));
    leaderAnchor.setAttribute('y', (py - LEADER_PIXEL / 2).toFixed(1));
    leaderDot.setAttribute('x', (end.x - LEADER_PIXEL).toFixed(1));
    leaderDot.setAttribute('y', (end.y - LEADER_PIXEL).toFixed(1));
    leaderDot.toggleAttribute('data-sealed', isMerged());
    // the fix in flight is its own block of pixels: the line ends on it without a marker
    leaderDot.toggleAttribute('hidden', entry?.leader === 'fix');
  }

  // --- The arrival from Nexarise (arrival.ts) ----------------------------------------------------
  // the clock starts on the world's first frame, so a slow load does not eat the visitor's second
  let arrivalFrom: number | null = claimArrival() ? -1 : null;

  function driveArrival(): void {
    if (!world || arrivalFrom === null) return;
    if (arrivalFrom < 0) arrivalFrom = performance.now();
    const seconds = (performance.now() - arrivalFrom) / 1000;
    const amount = seconds <= SHOTS.tear.arrivalHold ? 1 : 0;
    world.setArrival(amount);
    if (amount === 0) arrivalFrom = null;
  }

  /** The first screen's words, for the cloud deck to stay whole behind. */
  function deckWords(): Array<{ left: number; top: number; right: number; bottom: number }> {
    return deckBlocks.map((block) => {
      const { left, top, right, bottom } = block.getBoundingClientRect();
      return { left, top, right, bottom };
    });
  }

  function placeLabels(
    labels: readonly LabelPlacement[],
    flag: Readonly<GateFlag>,
    fix: Readonly<ScreenPoint>,
    gates: readonly Readonly<GateTop>[],
  ): void {
    if (!world) return;
    driveArrival();
    placeFlag(flag);
    placeTags(gates);
    const index = currentBeat();
    driveScan(index);
    world.setAvoid(avoidRects);
    // the row's word waits for the row: the camera is still turning round when the section arrives
    const early = beats[index]?.beat === 'results' && resultsNow() < SHOTS.results.stages.verified;
    world.setWord(early ? null : (beatWords[index] ?? null));
    placeLeader(index, labels, fix);
    const opacity = labelOpacity(world.night);
    list?.style.setProperty('--labels', opacity.toFixed(3));
    // the scrim for words on the night city waits until the day deck has gone
    stage.style.setProperty('--night-scrim', (opacity * world.deckGone).toFixed(3));
    if (world.deckGone < 1) world.setDeckGuards(deckWords());
    // the words go as the visitor falls, before the deck under them does
    document
      .querySelector<HTMLElement>('.beat--sky .beat__text')
      ?.style.setProperty('opacity', world.deckWords.toFixed(3));
    root.toggleAttribute('data-on-deck', world.deckGone < 0.5 && window.scrollY < window.innerHeight);
    if (list) list.hidden = opacity === 0;
    if (opacity === 0) return;

    // Only the labels this beat needs; the chosen finding first, then from the top of the screen
    // down. A label goes where it is asked, or a row below or above if that is taken; if all three
    // would overlap a placed label or the page's text, it is left out rather than stacked.
    const wanted = tagsFor(index);
    order.length = 0;
    labels.forEach((label, i) => {
      const item = items[i];
      if (label.onScreen && wanted(label.finding)) order.push(i);
      else if (item) item.hidden = true;
    });
    order.sort((a, b) => {
      const first = Number(labels[b]?.finding === world?.focus) - Number(labels[a]?.finding === world?.focus);
      return first || (labels[a]?.y ?? 0) - (labels[b]?.y ?? 0);
    });
    placed.length = 0;
    for (const i of order) {
      const label = labels[i];
      const item = items[i];
      if (!label || !item) continue;
      const y = [label.y, label.y + LABEL_GAP.y, label.y - LABEL_GAP.y].find(
        (candidate) =>
          candidate > FLAG_TOP &&
          candidate < window.innerHeight - LABEL_GAP.y &&
          !overText(label.x, candidate) &&
          !placed.some(
            (other) =>
              Math.abs(other.x - label.x) < LABEL_GAP.x && Math.abs(other.y - candidate) < LABEL_GAP.y,
          ),
      );
      // a finding's label waits for the scanner line to light its crack
      const lit = world.ignited(label.finding);
      item.hidden = y === undefined || !lit;
      if (y === undefined || !lit) continue;
      placed.push({ x: label.x, y });
      // the merged finding's label turns from open to sealed
      const sealed = isMerged() && label.finding === world.focus;
      if (sealed !== (item.dataset.state === 'sealed')) item.dataset.state = sealed ? 'sealed' : '';
      item.style.transform = `translate3d(${label.x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }
  }

  const onScroll = (): void => {
    if (!world) return;
    world.setProgress(prefersReducedMotion() ? stillProgress() : progress());
    world.setPush(pushAmount());
    world.setReproduce(reproduceAmount());
    world.setSandbox(...sandboxAmounts());
    world.setGates(gatesNow(), refusingGate());
    world.setMerge(mergeEnter(), isMerged());
    world.setOutro(outroAmount());
    world.setResults(resultsNow());
    world.setDawn(dawnNow());
    markResultsStat();
  };
  /** The name goes from the field to the sign and no further: nothing is stored or sent. */
  const onCompany = (): void => {
    world?.setCompany(companyField?.value ?? '');
  };
  const onPointer = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse' || !world) return;
    world.setDeckPointer(event.clientX, event.clientY);
    world.setPointer(
      (event.clientX / window.innerWidth) * 2 - 1,
      -((event.clientY / window.innerHeight) * 2 - 1),
    );
  };

  function mount(): void {
    world?.dispose();
    const still = prefersReducedMotion();
    const quality = pickQuality();
    try {
      world = createWorld({ canvas: canvas as HTMLCanvasElement, quality, still });
    } catch (error) {
      console.error(error);
      root.dataset.world = 'off';
      world = null;
      return;
    }
    root.dataset.world = still ? 'still' : 'live';
    if (arrivalFrom !== null) world.setArrival(1);
    root.dataset.quality = quality;
    items = buildLabels(list as HTMLOListElement, world);
    world.onFrame(placeLabels);
    if (new URLSearchParams(location.search).has('test')) Object.assign(window, { __world: world });
    world.setFinding(getFinding());
    world.setProgress(still ? stillProgress() : progress());
    world.setPush(pushAmount());
    world.setReproduce(reproduceAmount());
    world.setSandbox(...sandboxAmounts());
    world.setGates(gatesNow(), refusingGate());
    world.setMerge(mergeEnter(), isMerged());
    world.setOutro(outroAmount());
    world.setResults(resultsNow());
    world.setDawn(dawnNow());
    world.setCompany(companyField?.value ?? '');
    markResultsStat();
    world.setOrbit(yaw);
  }

  const onContextLost = (event: Event): void => {
    event.preventDefault(); // allows the browser to restore it
    if (resultsSection) delete resultsSection.dataset.stat;
    world?.dispose();
    world = null;
    root.dataset.world = 'off';
  };
  const onContextRestored = (): void => {
    mount();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);

  mount();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('pointermove', onPointer, { passive: true });
  companyField?.addEventListener('input', onCompany);
  orbit?.addEventListener('pointerdown', onOrbitDown);
  orbit?.addEventListener('pointermove', onOrbitMove);
  orbit?.addEventListener('pointerup', onOrbitUp);
  orbit?.addEventListener('pointercancel', onOrbitUp);
  orbit?.addEventListener('keydown', onOrbitKey);
  const stopWatching = onReducedMotionChange(mount);
  const stopFollowing = onFinding((id) => {
    world?.setFinding(id);
    world?.setGates(gatesNow(), refusingGate());
  });
  const stopChoosing = onChoice(() => {
    world?.setGates(gatesNow(), refusingGate());
  });
  const stopMerging = onMerge((merged) => {
    world?.setMerge(mergeEnter(), merged);
  });
  const stopHolding = onHold((amount) => {
    world?.setHold(amount);
  });
  const stopPulsing = onFailure(() => {
    world?.pulse();
  });

  return () => {
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.removeEventListener('webglcontextrestored', onContextRestored);
    stopWatching();
    stopFollowing();
    stopChoosing();
    stopMerging();
    stopHolding();
    stopPulsing();
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('pointermove', onPointer);
    companyField?.removeEventListener('input', onCompany);
    orbit?.removeEventListener('pointerdown', onOrbitDown);
    orbit?.removeEventListener('pointermove', onOrbitMove);
    orbit?.removeEventListener('pointerup', onOrbitUp);
    orbit?.removeEventListener('pointercancel', onOrbitUp);
    orbit?.removeEventListener('keydown', onOrbitKey);
    world?.dispose();
    world = null;
    delete root.dataset.world;
    delete root.dataset.quality;
    for (const tag of gateTags) tag.remove();
    if (resultsSection) delete resultsSection.dataset.stat;
  };
}
