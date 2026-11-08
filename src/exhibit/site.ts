/**
 * The facts only the owner can give. Each part of the exhibition that needs one is left out until it is
 * filled in here, so a visitor never sees a placeholder; fill a field, rebuild, and the part appears in
 * its place (and the rooms after a new one are renumbered).
 */
export interface Site {
  /** The 2-minute demo: a video file or embeddable URL, and its poster image (shown until play). */
  readonly demo: { readonly video: string; readonly poster: string; readonly caption: string };
  /** The curator's statement (Room 9): name, role, photo path, two lines on why, and a direct email. */
  readonly curator: {
    readonly name: string;
    readonly role: string;
    readonly photo: string;
    readonly lines: readonly [string, string] | readonly [];
    readonly email: string;
  };
  /** Room 1's severity line: the level the scanner gave this finding. */
  readonly severity: string;
  /** Visitor information answers still to come. */
  readonly faq: { readonly cost: string; readonly selfHosting: string };
  /** The exit's links. */
  readonly privacy: string;
  readonly terms: string;
}

export const SITE: Site = {
  demo: { video: '', poster: '', caption: '' },
  curator: { name: '', role: '', photo: '', lines: [], email: '' },
  severity: '',
  faq: { cost: '', selfHosting: '' },
  privacy: '',
  terms: '',
};

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

function placard(title: string, medium: string, caption: string): HTMLElement {
  const p = el('p', 'placard');
  p.append(
    el('span', 'placard__title', title),
    el('br'),
    el('span', 'placard__medium', medium),
    el('span', 'placard__caption', caption),
  );
  return p;
}

function room(
  id: string,
  wall: string,
  title: string,
  card: HTMLElement,
): { section: HTMLElement; body: HTMLElement } {
  const section = el('section', 'room');
  section.id = id;
  section.dataset.wall = wall;
  section.setAttribute('aria-labelledby', `${id}-title`);
  const head = el('div', 'room__head');
  const left = el('div');
  const h2 = el('h2', 'room__title', title);
  h2.id = `${id}-title`;
  left.append(h2);
  head.append(left, card);
  section.append(head);
  return { section, body: left };
}

/** Puts in every part whose facts have been given. Run before the route is laid out. */
export function applySite(site: Site = SITE): void {
  // the severity line on the acquisition record
  if (site.severity) {
    const record = document.querySelector('.record-card');
    const weakness = record?.querySelector('dt:nth-of-type(3)');
    if (record && weakness) {
      const dd = weakness.nextElementSibling;
      dd?.after(el('dt', '', 'Severity'), el('dd', '', site.severity));
    }
  }

  // the screening room, between the Finding and the Proof, and the entrance's button to it
  if (site.demo.video && site.demo.poster) {
    const { section, body } = room(
      'screening',
      'projection',
      'The screening room.',
      placard(
        'The Screening Room.',
        'A film, about two minutes.',
        site.demo.caption || 'The whole fix, start to finish.',
      ),
    );
    const screen = el('button', 'screen');
    screen.type = 'button';
    screen.setAttribute('aria-label', 'Play the 2-minute demo');
    const poster = el('img');
    poster.src = site.demo.poster;
    poster.alt = '';
    poster.loading = 'lazy';
    screen.append(poster, el('span', 'screen__play', 'Play the demo'));
    // no video bytes until the visitor presses play
    screen.addEventListener('click', () => {
      const video = el('video', 'screen__video');
      video.src = site.demo.video;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      video.poster = site.demo.poster;
      screen.replaceWith(video);
      video.focus();
    });
    body.append(screen);
    document.querySelector('#finding')?.after(section);
    const actions = document.querySelector('.entrance__actions');
    const watch = el('a', 'button button--plain', 'Watch the 2-minute demo');
    watch.href = '#screening';
    actions?.firstElementChild?.after(watch);
  }

  // the curator's statement, Room 9, before the invitation; the rooms after it move up a number
  const c = site.curator;
  if (c.name && c.photo && c.email && c.lines.length === 2) {
    const { section, body } = room(
      'curator',
      'limestone',
      "The curator's statement.",
      placard('Room 9. The Curator.', c.role || 'AUTOSP', 'A note from the person who built it.'),
    );
    const figure = el('figure', 'curator');
    const photo = el('img', 'curator__photo');
    photo.src = c.photo;
    photo.alt = `${c.name}, ${c.role}`.replace(/, $/, '');
    photo.width = 160;
    photo.height = 200;
    photo.loading = 'lazy';
    const quote = el('blockquote', 'curator__note');
    for (const line of c.lines) quote.append(el('p', 'room__text', line));
    const caption = el('figcaption', 'curator__name', `${c.name}${c.role ? `, ${c.role}` : ''}. `);
    const mail = el('a', '', c.email);
    mail.href = `mailto:${c.email}`;
    caption.append(mail);
    figure.append(photo, quote, caption);
    body.append(figure);
    document.querySelector('#invitation')?.before(section);
    for (const [id, n] of [
      ['invitation', 10],
      ['information', 11],
    ] as const) {
      const title = document.querySelector(`#${id} .placard__title`);
      if (title) title.textContent = title.textContent.replace(/Room \d+\./, `Room ${String(n)}.`);
    }
  }

  // the information desk's answers still to come
  const desk = document.querySelector('.desk');
  for (const [question, answer] of [
    ['What does it cost after the pilot?', site.faq.cost],
    ['Can we host it ourselves?', site.faq.selfHosting],
  ] as const) {
    if (!answer || !desk) continue;
    const details = el('details');
    details.setAttribute('name', 'desk');
    details.append(el('summary', '', question), el('p', '', answer));
    desk.append(details);
  }

  // the exit's privacy and terms
  const exit = document.querySelector('.exit ul');
  for (const [label, href] of [
    ['Privacy', site.privacy],
    ['Terms', site.terms],
  ] as const) {
    if (!href || !exit) continue;
    const li = el('li');
    const a = el('a', '', label);
    a.href = href;
    li.append(a);
    exit.append(li);
  }
}
