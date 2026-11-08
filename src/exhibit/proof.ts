/**
 * Room 2, the Proof: the run types out line by line, once, as the room comes into view; the FAILED lines
 * come in muted red. "Run it again" replays it. The lines are the page's own (the HTML holds the finished
 * run, for readers without script and for quiet mode); the room never invents output.
 */
import { onceInView, timeline } from './moment';

const LINE_MS = 260; // between lines
const FIRST_MS = 420; // the command, then a beat before pytest answers

export function initProof(room: HTMLElement, quiet: boolean): () => void {
  const run = room.querySelector<HTMLElement>('[data-run]');
  const again = room.querySelector<HTMLButtonElement>('[data-run-again]');
  const status = room.querySelector<HTMLElement>('[data-run-status]');
  if (!run || !again || !status) return () => {};
  const lines = Array.from(run.querySelectorAll<HTMLElement>('.line'));
  let steps = timeline();

  const play = (): void => {
    steps.cancel();
    steps = timeline();
    if (quiet) {
      for (const line of lines) line.classList.remove('line--wait');
      status.textContent = 'The test failed on the code as it is.';
      return;
    }
    status.textContent = 'Running the test.';
    for (const line of lines) line.classList.add('line--wait');
    lines.forEach((line, i) => {
      steps.at(i === 0 ? 0 : FIRST_MS + i * LINE_MS, () => {
        line.classList.remove('line--wait');
        line.classList.add('line--in');
      });
    });
    steps.at(FIRST_MS + lines.length * LINE_MS, () => {
      status.textContent = 'The test failed on the code as it is.';
    });
  };

  // before the room is reached, the terminal is waiting for its command (quiet mode shows the run whole)
  if (!quiet) for (const line of lines) line.classList.add('line--wait');
  const stop = onceInView(room, play);
  again.addEventListener('click', play);
  return () => {
    stop();
    steps.cancel();
    again.removeEventListener('click', play);
    for (const line of lines) line.classList.remove('line--wait');
  };
}
