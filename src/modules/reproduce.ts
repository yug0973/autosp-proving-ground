/**
 * The reproduction step. When the section scrolls in, the chosen finding's test runs: the command,
 * pytest's progress mark, then FAILED and the assertion. At the moment it fails the story
 * announces it, and the world pulses the crack.
 *
 * The run plays once per finding each time the section is reached; scrolling back above the
 * section resets it, and "Run the test again" replays it. With reduced motion the result appears
 * at once. The HTML ships with the SQL injection run already shown, for readers without script.
 */
import { FIXES } from '../lib/fixes';
import type { Fix } from '../lib/fixes';
import { announceFailure, getFinding, onFinding } from '../lib/story';
import type { FindingId } from '../lib/story';
import { prefersReducedMotion } from '../lib/reduced-motion';
import { trackProgress } from '../lib/track';

/** The run starts once this much of the section has scrolled by, and resets above RESET. */
const START = 0.1;
const RESET = 0.02;

/** When each line of the run appears, in ms after it starts. */
const TIMING = { dot: 520, failed: 1050, detail: 1350, summary: 1750 } as const;

type Line = readonly [text: string, kind: 'cmd' | 'dim' | 'fail' | 'plain'];

function lines(fix: Fix): { before: Line[]; failed: Line; detail: Line[]; summary: Line } {
  const { test } = fix;
  return {
    before: [
      [`$ pytest ${test.file} -q`, 'cmd'],
      ['F', 'fail'],
    ],
    failed: [`FAILED ${test.file}::${test.name}`, 'fail'],
    detail: test.failure.map((text): Line => [text, text.startsWith('E') ? 'fail' : 'plain']),
    summary: ['1 failed in 0.21s', 'fail'],
  };
}

function lineElement([text, kind]: Line): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = kind === 'plain' ? 'code-line' : `code-line code-line--${kind}`;
  span.textContent = text;
  return span;
}

export function initReproduce(section: HTMLElement): () => void {
  const file = section.querySelector<HTMLElement>('[data-run-file]');
  const status = section.querySelector<HTMLElement>('[data-run-status]');
  const testCode = section.querySelector<HTMLElement>('[data-run-test]');
  const output = section.querySelector<HTMLElement>('[data-run-output]');
  const rerun = section.querySelector<HTMLButtonElement>('[data-rerun]');
  if (!file || !status || !testCode || !output || !rerun) return () => {};

  let timers: number[] = [];
  let ranFor: FindingId | null = null;
  let block: HTMLElement = document.createElement('code');

  const clearTimers = (): void => {
    for (const timer of timers) window.clearTimeout(timer);
    timers = [];
  };

  const append = (line: Line): void => {
    if (block.childNodes.length > 0) block.append('\n');
    block.append(lineElement(line));
  };

  const setStatus = (state: 'idle' | 'running' | 'failed'): void => {
    status.dataset.state = state;
    status.textContent =
      state === 'failed' ? 'Fails on your code' : state === 'running' ? 'Running' : 'Not run yet';
  };

  /** Shows the test for the chosen finding, with an empty run. */
  const prepare = (fix: Fix): void => {
    clearTimers();
    file.textContent = fix.test.file;
    const code = document.createElement('code');
    fix.test.code.forEach((text, i) => {
      if (i > 0) code.append('\n');
      code.append(lineElement([text, 'plain']));
    });
    testCode.replaceChildren(code);
    block = document.createElement('code');
    output.replaceChildren(block);
    setStatus('idle');
  };

  const run = (): void => {
    const fix = FIXES[getFinding()];
    prepare(fix);
    ranFor = fix.id;
    const { before, failed, detail, summary } = lines(fix);
    const fail = (): void => {
      append(failed);
      setStatus('failed');
      announceFailure();
    };
    if (prefersReducedMotion()) {
      before.forEach(append);
      fail();
      detail.forEach(append);
      append(summary);
      return;
    }
    setStatus('running');
    const [command, dot] = before;
    if (command) append(command);
    timers.push(
      window.setTimeout(() => {
        if (dot) append(dot);
      }, TIMING.dot),
      window.setTimeout(fail, TIMING.failed),
      window.setTimeout(() => {
        detail.forEach(append);
      }, TIMING.detail),
      window.setTimeout(() => {
        append(summary);
      }, TIMING.summary),
    );
  };

  const onScroll = (): void => {
    const progress = trackProgress(section);
    if (progress < RESET && ranFor !== null) {
      ranFor = null;
      prepare(FIXES[getFinding()]);
    } else if (progress > START && ranFor !== getFinding()) {
      run();
    }
  };

  const onRerun = (): void => {
    run();
  };

  rerun.addEventListener('click', onRerun);
  window.addEventListener('scroll', onScroll, { passive: true });
  const stop = onFinding((id) => {
    // a new choice while the section is on screen runs its test straight away
    ranFor = null;
    if (trackProgress(section) > START) run();
    else prepare(FIXES[id]);
  });
  prepare(FIXES[getFinding()]);
  onScroll();

  return () => {
    clearTimers();
    stop();
    rerun.removeEventListener('click', onRerun);
    window.removeEventListener('scroll', onScroll);
  };
}
