/**
 * The progress rail: the seven beats of the proof (reproduce, sandbox, gates, merge, record,
 * results, pilot) as links down the right edge, the one on screen marked as the current step. It
 * appears once the visitor is past the descent, so the hero stays clear.
 *
 * On a wide screen every beat is named; on a narrower one the rail shows only its markers and names
 * them on hover or keyboard focus; where the layout stacks (tablets and phones) it collapses to one
 * small button naming the current beat, which opens the list. The list closes again when a link is
 * followed, on Escape, or on a click outside it. Each link scrolls through scroll.ts, which also
 * moves keyboard focus to the beat.
 */
const COLLAPSED = '(max-width: 60rem)';

export function initRail(rail: HTMLElement): () => void {
  const toggle = rail.querySelector<HTMLButtonElement>('[data-rail-toggle]');
  const current = rail.querySelector<HTMLElement>('[data-rail-current]');
  const count = rail.querySelector<HTMLElement>('[data-rail-count]');
  const start = document.querySelector<HTMLElement>('#pick');
  const links = Array.from(rail.querySelectorAll<HTMLAnchorElement>('.rail__link'));
  const sections = links.map((link) => document.querySelector<HTMLElement>(link.hash));
  if (!toggle || !current || !count || !start || sections.some((section) => !section)) return () => {};

  const collapsed = window.matchMedia(COLLAPSED);
  let frame = 0;
  let at = -2; // the current beat's index as last drawn; -1 between beats

  const setOpen = (open: boolean): void => {
    toggle.setAttribute('aria-expanded', String(open));
    rail.toggleAttribute('data-open', open);
  };

  /** The beat at the middle of the screen, or the last one passed while between beats. */
  const locate = (): number => {
    const middle = window.innerHeight / 2;
    let found = -1;
    sections.forEach((section, i) => {
      if (section && section.getBoundingClientRect().top <= middle) found = i;
    });
    return found;
  };

  const update = (): void => {
    frame = 0;
    rail.toggleAttribute('data-shown', start.getBoundingClientRect().top < window.innerHeight / 2);
    const index = locate();
    if (index === at) return;
    at = index;
    links.forEach((link, i) => {
      const state = i < index ? 'past' : i === index ? 'current' : 'next';
      link.dataset.state = state;
      if (state === 'current') link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });
    const here = links[index];
    current.textContent = here?.textContent.trim() ?? 'The proof';
    count.textContent = index >= 0 ? `${String(index + 1)} of ${String(links.length)}` : '';
  };
  const schedule = (): void => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  const onToggle = (): void => {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  };
  const onLink = (): void => {
    if (collapsed.matches) setOpen(false);
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !rail.hasAttribute('data-open')) return;
    setOpen(false);
    toggle.focus();
  };
  const onOutside = (event: PointerEvent): void => {
    if (rail.hasAttribute('data-open') && !rail.contains(event.target as Node)) setOpen(false);
  };
  const onWidth = (): void => {
    if (!collapsed.matches) setOpen(false);
  };

  toggle.addEventListener('click', onToggle);
  for (const link of links) link.addEventListener('click', onLink);
  rail.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', onOutside);
  collapsed.addEventListener('change', onWidth);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  update();

  return () => {
    cancelAnimationFrame(frame);
    toggle.removeEventListener('click', onToggle);
    for (const link of links) link.removeEventListener('click', onLink);
    rail.removeEventListener('keydown', onKey);
    document.removeEventListener('pointerdown', onOutside);
    collapsed.removeEventListener('change', onWidth);
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
  };
}
