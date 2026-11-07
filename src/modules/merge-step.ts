/**
 * The merge step: the pull request, and the one decision on the page the visitor makes. Holding
 * the button (pointer, Space or Enter) fills it; letting go early drains it; a full hold merges,
 * the world lights the fix in lime and lifts its pixels, and the call to action takes the
 * button's place. Choosing another finding, or "Undo the demo merge", sets it back.
 *
 * The hold is shared (story `setHold`) so the world can run its wave as far as it has gone. Each
 * change of state is announced. A screen reader's own activation (a click with no pointer or key
 * behind it, as from a browse-mode Enter) cannot hold, so it merges at once.
 */
import { GATES } from '../lib/gates';
import {
  getChoice,
  getFinding,
  isMerged,
  onChoice,
  onFinding,
  onMerge,
  setHold,
  setMerged,
} from '../lib/story';
import type { FindingId } from '../lib/story';

/** How long a full hold takes, and how much faster it drains after letting go. */
const HOLD_MS = 1400;
const DRAIN = 2.5;
/** A hold that gets this far and is let go is announced as cancelled. */
const NOTICED = 0.08;
/** A click this soon after a Space or Enter key event comes from that key, not a screen reader. */
const KEY_CLICK_MS = 500;

const PULL_REQUESTS: Readonly<Record<FindingId, { number: number; title: string }>> = {
  'CWE-89': { number: 412, title: 'Fix SQL injection in find_invoice' },
  'CWE-79': { number: 413, title: 'Escape the display name in greeting' },
  'CWE-639': { number: 414, title: 'Check the owner in get_order' },
};

export function initMergeStep(section: HTMLElement): () => void {
  const button = section.querySelector<HTMLButtonElement>('[data-hold]');
  const area = section.querySelector<HTMLElement>('[data-hold-area]');
  const note = section.querySelector<HTMLElement>('[data-merged-note]');
  const careless = section.querySelector<HTMLElement>('[data-merge-careless]');
  const unmerge = section.querySelector<HTMLButtonElement>('[data-unmerge]');
  const number = section.querySelector<HTMLElement>('[data-pr-number]');
  const status = section.querySelector<HTMLElement>('[data-pr-status]');
  const title = section.querySelector<HTMLElement>('[data-pr-title]');
  const branch = section.querySelector<HTMLElement>('[data-pr-branch]');
  const suite = section.querySelector<HTMLElement>('[data-pr-suite]');
  const review = section.querySelector<HTMLElement>('[data-pr-review]');
  const announce = section.querySelector<HTMLElement>('[data-hold-status]');
  if (
    !button ||
    !area ||
    !note ||
    !careless ||
    !unmerge ||
    !number ||
    !status ||
    !title ||
    !branch ||
    !suite ||
    !review ||
    !announce
  ) {
    return () => {};
  }

  let progress = 0;
  let holding = false;
  let frame = 0;
  let last = 0;
  let furthest = 0; // how far this hold got, to tell a cancelled hold from a stray tap
  let keyedAt = -Infinity; // when Space or Enter last went down or up on the button

  const paint = (): void => {
    button.style.setProperty('--hold', progress.toFixed(3));
    setHold(progress);
  };
  const say = (text: string): void => {
    announce.textContent = text;
  };

  const tick = (now: number): void => {
    const dt = now - last;
    last = now;
    progress += holding ? dt / HOLD_MS : (-dt * DRAIN) / HOLD_MS;
    progress = Math.min(Math.max(progress, 0), 1);
    furthest = Math.max(furthest, progress);
    paint();
    if (progress >= 1) {
      frame = 0;
      holding = false;
      setMerged(true);
      return;
    }
    if (progress <= 0 && !holding) {
      frame = 0;
      if (furthest >= NOTICED) say('Let go early. Nothing was merged.');
      furthest = 0;
      return;
    }
    frame = requestAnimationFrame(tick);
  };

  const press = (): void => {
    if (isMerged()) return;
    holding = true;
    if (progress === 0) say('Keep holding to merge.');
    if (!frame) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
  };
  const release = (): void => {
    holding = false;
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    button.setPointerCapture(event.pointerId);
    press();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    keyedAt = performance.now();
    if (!event.repeat) press();
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    keyedAt = performance.now();
    release();
  };
  const block = (event: Event): void => {
    event.preventDefault();
  };
  const onClick = (event: MouseEvent): void => {
    event.preventDefault();
    const assistive = event.detail === 0 && performance.now() - keyedAt > KEY_CLICK_MS;
    if (assistive && !isMerged()) {
      progress = 1;
      paint();
      setMerged(true);
    }
  };
  const onUnmerge = (): void => {
    setMerged(false);
    say('The demo merge is undone. The pull request is waiting for a person again.');
    button.focus();
  };

  const render = (): void => {
    const id = getFinding();
    const pr = PULL_REQUESTS[id];
    number.textContent = `Pull request #${String(pr.number)}`;
    title.textContent = pr.title;
    branch.textContent = `autosp/fix-${id.toLowerCase()}`;
    suite.textContent = GATES[id].good[1].detail;
    careless.hidden = getChoice() !== 'careless';
    const merged = isMerged();
    section.toggleAttribute('data-merged', merged);
    area.hidden = merged;
    note.hidden = !merged;
    status.dataset.state = merged ? 'cleared' : 'hold';
    status.textContent = merged ? 'Merged' : 'Waiting for a person';
    review.textContent = merged ? 'Approved and merged by you' : '1 approving review required';
    if (!merged) {
      cancelAnimationFrame(frame);
      frame = 0;
      holding = false;
      progress = 0;
      furthest = 0;
      paint();
    }
  };

  button.addEventListener('pointerdown', onPointerDown);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
  button.addEventListener('keydown', onKeyDown);
  button.addEventListener('keyup', onKeyUp);
  button.addEventListener('blur', release);
  button.addEventListener('click', onClick);
  // M held on the keyboard (keys.ts) holds the button the same way
  button.addEventListener('hold:press', press);
  button.addEventListener('hold:release', release);
  button.addEventListener('contextmenu', block);
  unmerge.addEventListener('click', onUnmerge);
  const stops = [
    onMerge((merged) => {
      render();
      if (!merged) return;
      say('Merged. You approved and merged the fix.');
      note.querySelector<HTMLElement>('a')?.focus({ preventScroll: true });
    }),
    onFinding(() => {
      setMerged(false);
      render();
    }),
    onChoice(render),
  ];
  render();

  return () => {
    cancelAnimationFrame(frame);
    setHold(0);
    for (const stop of stops) stop();
    button.removeEventListener('pointerdown', onPointerDown);
    button.removeEventListener('pointerup', release);
    button.removeEventListener('pointercancel', release);
    button.removeEventListener('lostpointercapture', release);
    button.removeEventListener('keydown', onKeyDown);
    button.removeEventListener('hold:press', press);
    button.removeEventListener('hold:release', release);
    button.removeEventListener('keyup', onKeyUp);
    button.removeEventListener('blur', release);
    button.removeEventListener('click', onClick);
    button.removeEventListener('contextmenu', block);
    unmerge.removeEventListener('click', onUnmerge);
  };
}
