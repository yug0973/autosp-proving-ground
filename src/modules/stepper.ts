/**
 * The pilot form, one step at a time, adapted from React Bits' Stepper (MIT + Commons Clause,
 * github.com/DavidHDev/react-bits): a progress bar that glides between steps, and each step sliding in.
 * Without script every step shows at once, as one plain form that still sends.
 *
 * Moving on checks the step's own fields first, so a visitor learns what is missing where they are. The
 * last step is a summary to read before the email opens. Sending is apply.ts's job, as before.
 */
const NAMES = [
  'Your name',
  'Company',
  'Engineering team size',
  'Python services on GitHub',
  'Scanners',
  'Note',
];

function value(form: HTMLFormElement, name: string): string {
  const field = form.elements.namedItem(name);
  if (field instanceof RadioNodeList) return field.value;
  if (
    field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement ||
    field instanceof HTMLSelectElement
  ) {
    return field.value.trim();
  }
  return '';
}

export function initStepper(form: HTMLFormElement): () => void {
  const steps = Array.from(form.querySelectorAll<HTMLElement>('[data-form-step]'));
  const progress = form.querySelector<HTMLElement>('[data-step-progress]');
  const label = form.querySelector<HTMLElement>('[data-step-label]');
  const back = form.querySelector<HTMLButtonElement>('[data-step-back]');
  const next = form.querySelector<HTMLButtonElement>('[data-step-next]');
  const send = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const summary = form.querySelector<HTMLElement>('[data-step-summary]');
  if (steps.length < 2 || !progress || !label || !back || !next || !send || !summary) return () => {};
  let current = 0;

  const fill = (): void => {
    const scanners = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="scanner"]:checked')).map(
      (input) => input.value,
    );
    const answers = [
      value(form, 'name'),
      value(form, 'company'),
      value(form, 'team'),
      value(form, 'services'),
      scanners.join(', '),
      value(form, 'note'),
    ];
    summary.replaceChildren(
      ...NAMES.flatMap((name, i) => {
        const term = document.createElement('dt');
        term.textContent = name;
        const answer = document.createElement('dd');
        answer.textContent = answers[i] || 'Not given';
        if (!answers[i]) answer.dataset.empty = '';
        return [term, answer];
      }),
    );
  };

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
    if (current === steps.length - 1) fill();
    if (focus) {
      const first = steps[current]?.querySelector<HTMLElement>('input, select, textarea, button');
      (first ?? steps[current])?.focus({ preventScroll: true });
    }
  };

  /** The step's own fields must be right before the visitor moves on. */
  const valid = (): boolean => {
    const fields = Array.from(
      steps[current]?.querySelectorAll<HTMLInputElement>('input, select, textarea') ?? [],
    );
    const wrong = fields.find((field) => !field.checkValidity());
    wrong?.reportValidity();
    return !wrong;
  };

  const onNext = (): void => {
    if (valid()) show(current + 1, true);
  };
  const onBack = (): void => {
    show(current - 1, true);
  };
  // Enter in a field moves on rather than sending a form that is only half filled in. The browser does
  // not submit by itself while the send button is hidden, so the key is taken here too
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' || current === steps.length - 1) return;
    if (!(event.target instanceof HTMLInputElement) || event.target.type === 'checkbox') return;
    event.preventDefault();
    onNext();
  };
  const onSubmit = (event: SubmitEvent): void => {
    if (current === steps.length - 1) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    onNext();
  };

  form.setAttribute('data-stepping', '');
  next.addEventListener('click', onNext);
  back.addEventListener('click', onBack);
  form.addEventListener('submit', onSubmit, { capture: true });
  form.addEventListener('keydown', onKey);
  show(0, false);
  return () => {
    form.removeAttribute('data-stepping');
    next.removeEventListener('click', onNext);
    back.removeEventListener('click', onBack);
    form.removeEventListener('submit', onSubmit, { capture: true });
    form.removeEventListener('keydown', onKey);
    for (const step of steps) step.removeAttribute('inert');
    back.hidden = true;
    next.hidden = true;
    send.hidden = false;
  };
}
