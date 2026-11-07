/**
 * The gates step: the choice of which fix goes through, and the panel that shows that fix and
 * what each gate reports, as a ticker of the three checks (short name, state, short result) with a
 * refusal's full reason on its own line under it; the checks themselves happen in the world. The list follows the same timeline as the world (lib/gates.ts), so a
 * gate reads "passed" just as the fix flies through it. The HTML ships with the sandbox fix
 * passing all three, for readers without script.
 */
import { FIXES } from '../lib/fixes';
import type { DiffLine } from '../lib/fixes';
import { GATES, GATE_NAMES, GATE_SHORT, gateMoment } from '../lib/gates';
import type { GateIndex, GateReport } from '../lib/gates';
import { getChoice, getFinding, onChoice, onFinding, setChoice } from '../lib/story';
import { prefersReducedMotion } from '../lib/reduced-motion';
import { trackProgress } from '../lib/track';

type GateState = 'waiting' | 'passed' | 'refused' | 'skipped';

/** The gate that refuses the current choice, or null when the fix from the sandbox goes through. */
export function refusingGate(): GateIndex | null {
  return getChoice() === 'careless' ? GATES[getFinding()].careless.refusedAt : null;
}

function renderDiff(code: HTMLElement, diff: readonly DiffLine[]): void {
  const block = document.createElement('code');
  diff
    .filter((line) => line.kind !== ' ')
    .forEach((line, i) => {
      if (i > 0) block.append('\n');
      const span = document.createElement('span');
      span.className = line.kind === '-' ? 'code-line code-line--del' : 'code-line code-line--add';
      span.textContent = `${line.kind}${line.text}`;
      block.append(span);
    });
  code.replaceChildren(block);
}

export function initGatesStep(section: HTMLElement): () => void {
  const choice = section.querySelector<HTMLFieldSetElement>('[data-choice]');
  const file = section.querySelector<HTMLElement>('[data-gates-file]');
  const status = section.querySelector<HTMLElement>('[data-gates-status]');
  const diff = section.querySelector<HTMLElement>('[data-gates-diff]');
  const list = section.querySelector<HTMLOListElement>('[data-gates-list]');
  if (!choice || !file || !status || !diff || !list) return () => {};

  // the reason a check gave for refusing the fix, under the ticker
  const reason = document.createElement('p');
  reason.className = 'gates__reason';
  reason.hidden = true;
  list.after(reason);

  const items = GATE_SHORT.map((name, i) => {
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.className = 'gates__name';
    label.textContent = name;
    label.title = GATE_NAMES[i] ?? name;
    const detail = document.createElement('span');
    detail.className = 'gates__detail';
    item.append(label, detail);
    return { item, detail };
  });
  list.replaceChildren(...items.map(({ item }) => item));

  const showFix = (): void => {
    const fix = FIXES[getFinding()];
    file.textContent = fix.file;
    renderDiff(diff, getChoice() === 'careless' ? GATES[fix.id].careless.diff : fix.diff);
  };

  const update = (): void => {
    const refusedAt = refusingGate();
    const gateCase = GATES[getFinding()];
    const reports: readonly GateReport[] = refusedAt === null ? gateCase.good : gateCase.careless.reports;
    const moment = gateMoment(trackProgress(section), refusedAt, prefersReducedMotion());
    items.forEach(({ item, detail }, i) => {
      let state: GateState = 'waiting';
      let text = 'Waiting';
      if (i < moment.passed) {
        state = 'passed';
        text = reports[i]?.detail ?? '';
      } else if (moment.refused && i === refusedAt) {
        state = 'refused';
        text = 'Refused';
      } else if (moment.refused) {
        state = 'skipped';
        text = 'Not run';
      }
      if (item.dataset.state !== state) item.dataset.state = state;
      if (detail.textContent !== text) detail.textContent = text;
    });
    list.toggleAttribute('data-cleared', moment.cleared);
    const why = moment.refused && refusedAt !== null ? (reports[refusedAt]?.detail ?? '') : '';
    if (reason.textContent !== why) reason.textContent = why;
    reason.hidden = why === '';
    const next = moment.refused ? 'refused' : moment.cleared ? 'cleared' : 'running';
    if (status.dataset.state !== next) {
      status.dataset.state = next;
      status.textContent =
        next === 'refused'
          ? 'Sent back to the sandbox'
          : next === 'cleared'
            ? 'Passed every check'
            : 'Checking';
    }
  };

  const onChange = (event: Event): void => {
    const input = event.target;
    if (input instanceof HTMLInputElement && (input.value === 'sandbox' || input.value === 'careless')) {
      setChoice(input.value);
    }
  };

  choice.addEventListener('change', onChange);
  window.addEventListener('scroll', update, { passive: true });
  const stopChoice = onChoice(() => {
    showFix();
    update();
  });
  const stopFinding = onFinding(() => {
    showFix();
    update();
  });
  showFix();
  update();

  return () => {
    stopChoice();
    stopFinding();
    choice.removeEventListener('change', onChange);
    window.removeEventListener('scroll', update);
    reason.remove();
  };
}
