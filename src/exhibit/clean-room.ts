/**
 * Room 3, the Clean Room. As the room comes into view the case closes and is sealed: the network line
 * leading into it snaps, the read-only seal stamps on, and the time bar starts to run down (it has no
 * number on it: the limit is hard, and nothing here invents its length). The patch is written line by line
 * while the case is sealed; then the job ends, the case empties, and the patch is what leaves it.
 */
import { onceInView, timeline } from './moment';

export function initCleanRoom(room: HTMLElement, quiet: boolean): () => void {
  const box = room.querySelector<HTMLElement>('[data-sandbox]');
  const job = room.querySelector<HTMLElement>('[data-sandbox-job]');
  const patch = room.querySelector<HTMLElement>('[data-patch]');
  if (!box || !job || !patch) return () => {};
  const lines = Array.from(patch.querySelectorAll<HTMLElement>('.line'));
  const steps = timeline();
  const end = (): void => {
    box.dataset.stage = 'empty';
    job.textContent = 'Job sbx-7f3a, ended. The case is empty.';
    for (const line of lines) line.classList.remove('line--wait');
  };

  if (quiet) {
    end();
    return () => {};
  }
  box.dataset.stage = 'open';
  job.textContent = 'Job sbx-7f3a, opening';
  for (const line of lines) line.classList.add('line--wait');

  const stop = onceInView(room, () => {
    steps.at(250, () => {
      box.dataset.stage = 'sealed';
      job.textContent = 'Job sbx-7f3a, sealed: writing the fix';
    });
    lines.forEach((line, i) => {
      steps.at(1100 + i * 420, () => {
        line.classList.remove('line--wait');
        line.classList.add('line--in');
      });
    });
    steps.at(1100 + lines.length * 420 + 900, end);
  });
  return () => {
    stop();
    steps.cancel();
    end();
  };
}
