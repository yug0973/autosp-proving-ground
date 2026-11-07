/**
 * The pilot form in two steps: your team (size, scanners, services), then you (name, work email,
 * company, anything else). A bar shows the step; moving on asks apply.ts to check that step's own
 * fields first, so a visitor learns what is missing where they are. Without script both steps show at
 * once, as one plain form that still sends.
 */
export function initStepper(form: HTMLFormElement): () => void {
  const steps = Array.from(form.querySelectorAll<HTMLElement>('[data-form-step]'));
  const label = form.querySelector<HTMLElement>('[data-step-label]');
  const back = form.querySelector<HTMLButtonElement>('[data-step-back]');
  const next = form.querySelector<HTMLButtonElement>('[data-step-next]');
  const send = form.querySelector<HTMLButtonElement>('[data-apply-send]');
  if (steps.length < 2 || !label || !back || !next || !send) return () => {};
  let current = 0;

  const show = (index: number, focus: boolean): void => {
    const from = current;
    current = Math.min(Math.max(index, 0), steps.length - 1);
    steps.forEach((step, i) => {
      step.toggleAttribute('data-current', i === current);
      step.toggleAttribute('inert', i !== current);
      if (i === current) step.dataset.from = current >= from ? 'after' : 'before';
    });
    form.style.setProperty('--step', String((current + 1) / steps.length));
    label.textContent = `Step ${String(current + 1)} of ${String(steps.length)}: ${steps[current]?.dataset.formStep ?? ''}`;
    back.hidden = current === 0;
    next.hidden = current === steps.length - 1;
    send.hidden = current !== steps.length - 1;
    form.dataset.formAt = String(current + 1);
    if (focus) {
      steps[current]
        ?.querySelector<HTMLElement>('input:not([tabindex="-1"]), textarea')
        ?.focus({ preventScroll: true });
    }
  };

  /** Asks apply.ts to check the fields of this step only; it shows what is wrong and focuses it. */
  const valid = (): boolean => {
    const check = { scope: steps[current], ok: true };
    form.dispatchEvent(new CustomEvent('apply:check', { detail: check }));
    return check.ok;
  };
  const onNext = (): void => {
    if (valid()) show(current + 1, true);
  };
  const onBack = (): void => {
    show(current - 1, true);
  };
  // Enter in a field of the first step moves on rather than sending half a form
  const onSubmit = (event: SubmitEvent): void => {
    if (current === steps.length - 1) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    onNext();
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' || current === steps.length - 1) return;
    if (!(event.target instanceof HTMLInputElement) || event.target.type === 'checkbox') return;
    event.preventDefault();
    onNext();
  };

  form.setAttribute('data-stepping', '');
  next.addEventListener('click', onNext);
  back.addEventListener('click', onBack);
  form.addEventListener('submit', onSubmit, { capture: true });
  form.addEventListener('keydown', onKey);
  // a form sent and started again begins at its first step
  const onReset = (): void => {
    window.setTimeout(() => {
      show(0, false);
    });
  };
  form.addEventListener('reset', onReset);
  show(0, false);
  return () => {
    form.removeAttribute('data-stepping');
    delete form.dataset.formAt;
    next.removeEventListener('click', onNext);
    back.removeEventListener('click', onBack);
    form.removeEventListener('submit', onSubmit, { capture: true });
    form.removeEventListener('keydown', onKey);
    form.removeEventListener('reset', onReset);
    for (const step of steps) step.removeAttribute('inert');
    back.hidden = true;
    next.hidden = true;
    send.hidden = false;
  };
}
