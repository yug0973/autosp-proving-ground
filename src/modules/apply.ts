/**
 * The pilot application, on both pages. Applying sends the answers straight to the Nexarise inbox
 * through Web3Forms (web3forms.com), with no mail app in between: the visitor presses the button,
 * sees it sending, and the form turns into a note that it was sent and where replies will go.
 *
 * The Web3Forms access key comes from the environment (`VITE_WEB3FORMS_KEY` in `.env.local`). It
 * only lets a form deliver to the address it was created for, so it is safe in the page. Without a
 * key the form falls back to composing the email in the visitor's mail app, as it did before, and
 * says so; without script it posts to the same mailto address as plain text.
 *
 * Each field says what is wrong under itself, once the visitor has left it or tried to send, and the
 * first field that needs attention takes focus. A hidden checkbox that people never tick catches
 * the simplest bots.
 */

const ADDRESS = 'nexarise.office@gmail.com';
const SUBJECT = 'AUTOSP free pilot';
const ENDPOINT = 'https://api.web3forms.com/submit';
const KEY = (import.meta.env.VITE_WEB3FORMS_KEY ?? '').trim();
/** A send that has not answered by then is treated as failed, so the button never hangs. */
const TIMEOUT_MS = 15000;

/** What each field says when it is empty, in the visitor's terms. */
const MISSING: Readonly<Record<string, string>> = {
  name: 'Add your name.',
  email: 'Add your work email, so we can reply.',
  company: 'Add your company.',
  team: 'Choose your team size.',
};

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

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
    `Work email: ${field(form, 'email')}`,
    `Company: ${field(form, 'company')}`,
    `Engineering team size: ${field(form, 'team')}`,
    `Scanners: ${scanners.length > 0 ? scanners.join(', ') : 'none chosen'}`,
    `Python services on GitHub: ${field(form, 'services') || 'not given'}`,
  ];
  const note = field(form, 'note');
  if (note) lines.push('', note);
  return lines.join('\n');
}

/** What to tell the visitor about one field, or '' when it is fine. */
function problem(control: Control): string {
  const v = control.validity;
  if (v.valueMissing) return MISSING[control.name] ?? 'This one is needed.';
  if (v.typeMismatch) return 'That email address looks incomplete, for example name@company.com.';
  if (v.patternMismatch) return 'Use digits only, for example 12.';
  return '';
}

interface Checked {
  readonly controls: Control[];
  readonly host: HTMLElement;
  readonly error: HTMLElement;
  touched: boolean;
}

export function initApply(form: HTMLFormElement): () => void {
  const status = form.querySelector<HTMLElement>('[data-apply-status]');
  const send = form.querySelector<HTMLButtonElement>('[data-apply-send]');
  const how = form.querySelector<HTMLElement>('[data-apply-how]');
  const direct = KEY !== '';
  const prefix = form.dataset.calmApply === undefined ? 'apply' : 'calm';
  form.dataset.send = direct ? 'direct' : 'mail-app';
  if (how) {
    how.textContent = direct
      ? `Sent straight to ${ADDRESS} through Web3Forms. Your email app stays closed.`
      : `Opens an email to ${ADDRESS} with your answers filled in.`;
  }
  // the page checks the fields itself, so each can say what is wrong in its own words
  form.noValidate = true;

  // one message under each field that can be wrong; a row of choices shares one
  const checked: Checked[] = [];
  for (const control of form.querySelectorAll<Control>('input, textarea, select')) {
    const name = control.name;
    if (!name || name === 'botcheck' || checked.some((item) => item.controls[0]?.name === name)) continue;
    const patterned = control instanceof HTMLInputElement && control.pattern !== '';
    if (!control.required && !patterned) continue;
    const host = control.closest<HTMLElement>('fieldset, label') ?? control.parentElement;
    if (!host) continue;
    const controls = Array.from(form.querySelectorAll<Control>(`[name="${name}"]`));
    const error = document.createElement('span');
    error.className = 'apply__error';
    error.id = `${prefix}-${name}-error`;
    host.append(error);
    for (const each of controls) {
      const described = each.getAttribute('aria-describedby');
      each.setAttribute('aria-describedby', described ? `${described} ${error.id}` : error.id);
    }
    checked.push({ controls, host, error, touched: false });
  }

  const show = (item: Checked): boolean => {
    const first = item.controls[0];
    const message = first ? problem(first) : '';
    item.error.textContent = message;
    for (const control of item.controls) control.setAttribute('aria-invalid', String(message !== ''));
    item.host.toggleAttribute('data-invalid', message !== '');
    return message === '';
  };
  const clear = (item: Checked): void => {
    item.touched = false;
    item.error.textContent = '';
    item.host.removeAttribute('data-invalid');
    for (const control of item.controls) control.removeAttribute('aria-invalid');
  };
  const owner = (target: EventTarget | null): Checked | undefined =>
    checked.find((item) => item.controls.includes(target as Control));

  const onLeave = (event: FocusEvent): void => {
    const item = owner(event.target);
    // leaving one choice for the next in the same row is not leaving the row
    if (!item || item.controls.includes(event.relatedTarget as Control)) return;
    item.touched = true;
    show(item);
  };
  const onEdit = (event: Event): void => {
    // once a field has said what is wrong, it keeps checking as the visitor types
    const item = owner(event.target);
    if (item?.touched) show(item);
  };

  const setStatus = (message: string, tone: 'quiet' | 'problem' = 'quiet'): void => {
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  };

  /** The form becomes a short note that it was sent; focus moves to it so it is read out. */
  const showSent = (email: string): void => {
    const done = document.createElement('div');
    done.className = 'apply__done';
    done.tabIndex = -1;
    const title = document.createElement('p');
    title.className = 'apply__done-title';
    title.textContent = 'Application sent';
    const body = document.createElement('p');
    body.className = 'apply__done-body';
    const strong = document.createElement('strong');
    strong.textContent = email;
    body.append(`It is with ${ADDRESS}. Replies will go to `, strong, '.');
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'btn btn--quiet btn--small apply__again';
    again.textContent = 'Send another application';
    again.addEventListener('click', () => {
      done.remove();
      form.reset();
      form.hidden = false;
      delete form.dataset.state;
      for (const item of checked) clear(item);
      setStatus('');
      form.querySelector<HTMLElement>('input:not([tabindex="-1"]), textarea')?.focus();
    });
    done.append(title, body, again);
    form.hidden = true;
    form.after(done);
    done.focus();
  };

  let sending = false;
  const submit = async (): Promise<void> => {
    // every field says what is wrong; the first one that needs attention takes focus
    let firstBad: Control | undefined;
    for (const item of checked) {
      item.touched = true;
      if (!show(item)) firstBad ??= item.controls[0];
    }
    if (firstBad) {
      setStatus('A few answers need a look before this can be sent.', 'problem');
      firstBad.focus();
      return;
    }
    const trap = form.elements.namedItem('botcheck');
    if (trap instanceof HTMLInputElement && trap.checked) return;

    if (!direct) {
      const url = `mailto:${ADDRESS}?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(composeBody(form))}`;
      form.dataset.mailto = url;
      window.location.href = url;
      setStatus(
        `Your email app should open with the application filled in. If it does not, write to ${ADDRESS}.`,
      );
      return;
    }

    sending = true;
    form.setAttribute('aria-busy', 'true');
    form.dataset.state = 'sending';
    const label = send?.textContent.trim() ?? 'Apply for the free pilot';
    if (send) {
      send.disabled = true;
      send.textContent = 'Sending';
    }
    setStatus('Sending your application.');
    const abort = new AbortController();
    const timer = window.setTimeout(() => {
      abort.abort();
    }, TIMEOUT_MS);
    const email = field(form, 'email');
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          access_key: KEY,
          subject: `${SUBJECT}: ${field(form, 'company')}`,
          from_name: field(form, 'name'),
          // Web3Forms makes this the reply-to address
          email,
          message: composeBody(form),
        }),
        signal: abort.signal,
      });
      const result = (await response.json().catch(() => ({}))) as { success?: boolean };
      if (!response.ok || result.success !== true)
        throw new Error(`Web3Forms answered ${String(response.status)}`);
      form.dataset.state = 'sent';
      setStatus('');
      showSent(email);
    } catch {
      form.dataset.state = 'failed';
      setStatus(
        `That did not send. Check your connection and press the button again, or write to ${ADDRESS}.`,
        'problem',
      );
    } finally {
      window.clearTimeout(timer);
      sending = false;
      form.removeAttribute('aria-busy');
      if (send) {
        send.disabled = false;
        send.textContent = label;
      }
    }
  };
  const onSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    if (!sending) void submit();
  };

  form.addEventListener('focusout', onLeave);
  form.addEventListener('input', onEdit);
  form.addEventListener('change', onEdit);
  form.addEventListener('submit', onSubmit);
  return () => {
    form.removeEventListener('focusout', onLeave);
    form.removeEventListener('input', onEdit);
    form.removeEventListener('change', onEdit);
    form.removeEventListener('submit', onSubmit);
    for (const item of checked) item.error.remove();
  };
}
