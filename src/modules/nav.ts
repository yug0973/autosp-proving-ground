/**
 * The nav: the sound preference and the current-section marker on the section links.
 *
 * Sound (DESIGN.md §7) is off by default. The toggle stores the visitor's choice; the modules that
 * play the three UI sounds (exploit hit, check pass, merge) read it through `isSoundOn()` and the
 * `autosp:sound` event, and never play anything while it is off.
 */

const STORAGE_KEY = 'autosp:sound';
export const SOUND_EVENT = 'autosp:sound';

let soundOn = false;

function readStoredPreference(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false; // storage blocked (private mode, site data off): fall back to off
  }
}

function storePreference(on: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // storage blocked: the choice still applies for this visit
  }
}

/** Whether the visitor has turned interface sound on. */
export function isSoundOn(): boolean {
  return soundOn;
}

function renderToggle(button: HTMLButtonElement): void {
  button.setAttribute('aria-pressed', String(soundOn));
  button.title = soundOn ? 'Interface sound: on' : 'Interface sound: off';
}

function initSoundToggle(button: HTMLButtonElement): () => void {
  soundOn = readStoredPreference();
  renderToggle(button);
  const onClick = (): void => {
    soundOn = !soundOn;
    storePreference(soundOn);
    renderToggle(button);
    document.dispatchEvent(new CustomEvent<boolean>(SOUND_EVENT, { detail: soundOn }));
  };
  button.addEventListener('click', onClick);
  return () => {
    button.removeEventListener('click', onClick);
  };
}

/**
 * Marks the section link whose target is currently under the reading line (a band just below
 * the nav) with aria-current. Links whose targets are not on the page are left alone.
 */
function initCurrentSection(links: HTMLAnchorElement[]): () => void {
  const pairs = links
    .map((link) => ({ link, target: document.getElementById(decodeURIComponent(link.hash.slice(1))) }))
    .filter((pair): pair is { link: HTMLAnchorElement; target: HTMLElement } => pair.target !== null);
  if (pairs.length === 0 || typeof IntersectionObserver !== 'function') return () => {};

  const visible = new Set<Element>();
  const update = (): void => {
    const current = pairs.find((pair) => visible.has(pair.target));
    for (const pair of pairs) {
      if (pair === current) pair.link.setAttribute('aria-current', 'true');
      else pair.link.removeAttribute('aria-current');
    }
  };
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      }
      update();
    },
    // a thin reading line about a fifth of the way down the viewport
    { rootMargin: '-20% 0px -79% 0px' },
  );
  for (const pair of pairs) observer.observe(pair.target);
  return () => {
    observer.disconnect();
  };
}

/** Starts the nav's behaviour. Returns a function that removes every listener and observer. */
export function initNav(nav: HTMLElement): () => void {
  const cleanups: Array<() => void> = [];
  const toggle = nav.querySelector<HTMLButtonElement>('[data-sound-toggle]');
  if (toggle) cleanups.push(initSoundToggle(toggle));
  const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('.site-nav__link[href^="#"]'));
  cleanups.push(initCurrentSection(links));
  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
