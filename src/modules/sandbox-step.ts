/**
 * The sandbox step's panel: the job's steps follow the scroll (the same thresholds the world uses
 * to drop the volume and write the patch), and name the chosen finding's file and the size of
 * its change. The HTML ships with every step done, for readers without script.
 */
import { FIXES } from '../lib/fixes';
import type { Fix } from '../lib/fixes';
import { getFinding, onFinding } from '../lib/story';
import { trackProgress } from '../lib/track';

/** Scroll progress through the section at which the volume has landed, and the patch is done. */
export const SANDBOX = { dropFrom: 0.02, dropTo: 0.32, patchFrom: 0.42, patchTo: 0.8 } as const;

function lineCount(n: number, word: string): string {
  return `${String(n)} ${n === 1 ? 'line' : 'lines'} ${word}`;
}

function describe(fix: Fix): string {
  const removed = fix.diff.filter((line) => line.kind === '-').length;
  const added = fix.diff.filter((line) => line.kind === '+').length;
  return `${lineCount(removed, 'removed')}, ${String(added)} added`;
}

export function initSandboxStep(section: HTMLElement): () => void {
  const steps = section.querySelector<HTMLElement>('[data-sandbox-steps]');
  const file = section.querySelector<HTMLElement>('[data-sandbox-file]');
  const count = section.querySelector<HTMLElement>('[data-sandbox-count]');
  if (!steps || !file || !count) return () => {};
  const items = Array.from(steps.querySelectorAll<HTMLElement>('[data-step]'));

  const setState = (name: string, state: 'waiting' | 'active' | 'done'): void => {
    const item = items.find((element) => element.dataset.step === name);
    if (item && item.dataset.state !== state) item.dataset.state = state;
  };

  const update = (): void => {
    const p = trackProgress(section);
    const writing = p >= SANDBOX.patchFrom;
    const written = p >= SANDBOX.patchTo;
    setState('write', written ? 'done' : writing ? 'active' : 'waiting');
    setState('written', written ? 'done' : 'waiting');
    setState('next', written ? 'done' : 'waiting');
  };

  const show = (fix: Fix): void => {
    file.textContent = fix.file;
    count.textContent = describe(fix);
  };

  window.addEventListener('scroll', update, { passive: true });
  const stop = onFinding((id) => {
    show(FIXES[id]);
  });
  show(FIXES[getFinding()]);
  update();

  return () => {
    stop();
    window.removeEventListener('scroll', update);
  };
}
