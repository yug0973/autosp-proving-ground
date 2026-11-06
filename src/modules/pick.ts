/**
 * The picker and its diff panel. Choosing a finding writes it to the story (the world reads it
 * from there and moves the camera); the panel shows that finding's file, what is wrong and the
 * proposed change. The HTML ships with SQL injection filled in, so it reads the same without
 * script.
 */
import { FIXES } from '../lib/fixes';
import type { Fix } from '../lib/fixes';
import { getFinding, isFindingId, onFinding, setFinding } from '../lib/story';

function renderDiff(code: HTMLElement, fix: Fix): void {
  const block = document.createElement('code');
  fix.diff.forEach((line, i) => {
    const span = document.createElement('span');
    span.className =
      line.kind === '-'
        ? 'code-line code-line--del'
        : line.kind === '+'
          ? 'code-line code-line--add'
          : 'code-line';
    span.textContent = `${line.kind}${line.text}`;
    block.append(span);
    if (i < fix.diff.length - 1) block.append('\n');
  });
  code.replaceChildren(block);
}

export function initPick(section: HTMLElement): () => void {
  const picker = section.querySelector<HTMLFieldSetElement>('[data-picker]');
  const file = section.querySelector<HTMLElement>('[data-diff-file]');
  const problem = section.querySelector<HTMLElement>('[data-diff-problem]');
  const code = section.querySelector<HTMLElement>('[data-diff-code]');
  if (!picker || !file || !problem || !code) return () => {};

  const show = (fix: Fix): void => {
    file.textContent = fix.file;
    problem.textContent = fix.problem;
    renderDiff(code, fix);
    const input = picker.querySelector<HTMLInputElement>(`input[value="${fix.id}"]`);
    if (input) input.checked = true;
  };

  const onChange = (event: Event): void => {
    const input = event.target;
    if (input instanceof HTMLInputElement && isFindingId(input.value)) setFinding(input.value);
  };
  picker.addEventListener('change', onChange);
  const stop = onFinding((id) => {
    show(FIXES[id]);
  });
  show(FIXES[getFinding()]);

  return () => {
    stop();
    picker.removeEventListener('change', onChange);
  };
}
