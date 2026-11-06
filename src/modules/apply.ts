/**
 * The pilot application. There is no backend: applying is an email, as on the live site, so the
 * form composes that email from its fields and opens it in the visitor's mail app. Without
 * script the form posts to the same mailto address as plain text.
 */

const ADDRESS = 'nexarise.office@gmail.com';
const SUBJECT = 'AUTOSP free pilot';

function field(form: HTMLFormElement, name: string): string {
  const element = form.elements.namedItem(name);
  // the team size is a row of choices: the one picked is the answer
  if (element instanceof RadioNodeList) return element.value.trim();
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ) {
    return element.value.trim();
  }
  return '';
}

/** The email body: one line per answer, then the visitor's own note. */
export function composeBody(form: HTMLFormElement): string {
  const scanners = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="scanner"]:checked')).map(
    (input) => input.value,
  );
  const lines = [
    `Name: ${field(form, 'name')}`,
    `Company: ${field(form, 'company')}`,
    `Engineering team size: ${field(form, 'team')}`,
    `Scanners: ${scanners.length > 0 ? scanners.join(', ') : 'none chosen'}`,
    `Python services on GitHub: ${field(form, 'services') || 'not given'}`,
  ];
  const note = field(form, 'note');
  if (note) lines.push('', note);
  return lines.join('\n');
}

export function initApply(form: HTMLFormElement): () => void {
  const status = form.querySelector<HTMLElement>('[data-apply-status]');

  const onSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const url = `mailto:${ADDRESS}?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(composeBody(form))}`;
    form.dataset.mailto = url;
    window.location.href = url;
    if (status) {
      status.textContent = `Your email app should open with the application filled in. If it does not, write to ${ADDRESS}.`;
    }
  };

  form.addEventListener('submit', onSubmit);
  return () => {
    form.removeEventListener('submit', onSubmit);
  };
}
