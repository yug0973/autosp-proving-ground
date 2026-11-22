/**
 * Room 9, the Invitation: the pilot form, styled as an RSVP. It sends to Web3Forms (the access key comes
 * from VITE_WEB3FORMS_KEY at build time; Web3Forms keys are meant to sit in public pages). There is no
 * mailto anywhere, and no address is shown.
 *
 * Each required field says what it needs, under itself, once it has been left or the form is sent, and
 * the message is tied to the field (aria-describedby, aria-invalid). Sending shows on the button; an error
 * keeps every answer and says what to do; success replaces the card with a thank-you, in place. A filled
 * honeypot is thanked and nothing is sent. Without script the form posts to Web3Forms directly.
 */
const ENDPOINT = 'https://api.web3forms.com/submit';
const KEY: string = import.meta.env.VITE_WEB3FORMS_KEY ?? '';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Field = 'name' | 'email' | 'company' | 'team';
const NEEDS: Record<Field, (form: HTMLFormElement) => string> = {
  name: (f) => (value(f, 'name') ? '' : 'Add your name.'),
  email: (f) => {
    const email = value(f, 'email');
    if (!email) return 'Add your work email.';
    return EMAIL.test(email) ? '' : 'That email does not look complete.';
  },
  company: (f) => (value(f, 'company') ? '' : 'Add your company.'),
  // only asked when the form has the question (the landing page's short form leaves it out)
  team: (f) =>
    !f.querySelector('input[name="team"]') || f.querySelector('input[name="team"]:checked') ? '' : 'Choose your team size.',
};

function value(form: HTMLFormElement, name: string): string {
  const field = form.elements.namedItem(name);
  return field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement ? field.value.trim() : '';
}

export function initRsvp(form: HTMLFormElement): () => void {
  const send = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const keyField = form.querySelector<HTMLInputElement>('input[name="access_key"]');
  if (!send || !keyField) return () => {};
  keyField.value = KEY;
  const touched = new Set<Field>();
  const status = document.createElement('p');
  status.className = 'rsvp__status';
  status.setAttribute('role', 'alert');
  send.after(status);

  /** The element a field's message goes after, and the controls it describes. */
  const parts = (field: Field): { host: HTMLElement; controls: HTMLElement[] } => {
    if (field === 'team') {
      const set = form.querySelector<HTMLElement>('fieldset.choices');
      return {
        host: set ?? form,
        controls: Array.from(form.querySelectorAll<HTMLElement>('input[name="team"]')),
      };
    }
    const input = form.querySelector<HTMLElement>(`[name="${field}"]`);
    return { host: input?.closest<HTMLElement>('.field') ?? form, controls: input ? [input] : [] };
  };
  /** Shows (or clears) a field's message; returns whether the field is fine. */
  const mark = (field: Field): boolean => {
    const message = NEEDS[field](form);
    const id = `rsvp-${field}-error`;
    const { host, controls } = parts(field);
    let note = document.getElementById(id);
    if (message && !note) {
      note = document.createElement('p');
      note.id = id;
      note.className = 'field__error';
      host.append(note);
    }
    if (note) note.textContent = message;
    for (const control of controls) {
      control.setAttribute('aria-invalid', String(message !== ''));
      const described = new Set((control.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean));
      if (message) described.add(id);
      else described.delete(id);
      if (described.size > 0) control.setAttribute('aria-describedby', [...described].join(' '));
      else control.removeAttribute('aria-describedby');
    }
    return message === '';
  };

  const onLeave = (event: FocusEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const field = target.name as Field;
    if (!(field in NEEDS)) return;
    // moving between the team sizes is not leaving the question
    if (
      field === 'team' &&
      event.relatedTarget instanceof HTMLInputElement &&
      event.relatedTarget.name === 'team'
    )
      return;
    touched.add(field);
    mark(field);
  };
  const onEdit = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const field = target.name as Field;
    if (touched.has(field)) mark(field);
  };

  const thank = (email: string): void => {
    const done = document.createElement('div');
    done.className = 'rsvp rsvp--done';
    done.tabIndex = -1;
    const title = document.createElement('p');
    title.className = 'rsvp__title';
    title.textContent = 'Thank you. Your reply is in.';
    const body = document.createElement('p');
    body.textContent = "We'll reply within 1 business day. Replies go to ";
    const strong = document.createElement('strong');
    strong.textContent = email;
    body.append(strong, '.');
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'button button--plain';
    again.textContent = 'Send another reply';
    again.addEventListener('click', () => {
      done.replaceWith(form);
      form.reset();
      touched.clear();
      status.textContent = '';
      form.querySelector<HTMLElement>('input[name="name"]')?.focus();
    });
    done.append(title, body, again);
    form.replaceWith(done);
    done.focus();
  };

  const onSubmit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    const fields = Object.keys(NEEDS) as Field[];
    const fine = fields.map((field) => {
      touched.add(field);
      return mark(field);
    });
    const first = fields.find((_, i) => !fine[i]);
    if (first) {
      parts(first).controls[0]?.focus();
      status.textContent = '';
      return;
    }
    const data = new FormData(form);
    const email = value(form, 'email');
    if (data.get('botcheck')) {
      thank(email);
      return;
    }
    if (!KEY) {
      status.textContent = 'This copy of the page cannot send yet. Please try again later.';
      return;
    }
    const payload: Record<string, string> = {
      access_key: KEY,
      subject: 'AUTOSP free pilot',
      from_name: 'One Fix, the AUTOSP exhibition',
    };
    for (const [name, entry] of data.entries()) {
      if (name === 'access_key' || name === 'subject' || name === 'botcheck' || typeof entry !== 'string')
        continue;
      payload[name] = payload[name] ? `${payload[name]}, ${entry}` : entry;
    }
    send.disabled = true;
    send.setAttribute('aria-busy', 'true');
    const label = send.textContent;
    send.textContent = 'Sending';
    status.textContent = '';
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { success?: boolean };
      if (!response.ok || !result.success) throw new Error('not sent');
      thank(email);
    } catch {
      status.textContent =
        'That did not send. Your answers are still here: check your connection and send it again.';
    } finally {
      send.disabled = false;
      send.removeAttribute('aria-busy');
      send.textContent = label;
    }
  };
  const submit = (event: SubmitEvent): void => {
    void onSubmit(event);
  };

  form.addEventListener('focusout', onLeave);
  form.addEventListener('input', onEdit);
  form.addEventListener('change', onEdit);
  form.addEventListener('submit', submit);
  return () => {
    form.removeEventListener('focusout', onLeave);
    form.removeEventListener('input', onEdit);
    form.removeEventListener('change', onEdit);
    form.removeEventListener('submit', submit);
    status.remove();
  };
}
