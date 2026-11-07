/**
 * Keyboard shortcuts on the cinematic page: J and K for the next and previous chapter, M (held) to
 * merge in the demo, and ? for the list of them. The arrow keys keep scrolling the page as they always
 * do. Nothing fires while the visitor types in a field, or with Ctrl, Alt or the Command key held.
 */
import { scrollToTarget } from './scroll';

const CHAPTERS = [
  '#top',
  '#backlog',
  '#pick',
  '#reproduce',
  '#sandbox',
  '#gates',
  '#merge',
  '#record',
  '#results',
  '#before',
  '#apply',
];

function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest('input, textarea, select, [contenteditable]') !== null)
  );
}

export function initKeys(): () => void {
  const sections = CHAPTERS.map((id) => document.querySelector<HTMLElement>(id)).filter(
    (section): section is HTMLElement => section !== null,
  );
  const dialog = document.querySelector<HTMLDialogElement>('[data-keys]');
  const openers = Array.from(document.querySelectorAll<HTMLElement>('[data-keys-open]'));
  const mergeSection = document.querySelector<HTMLElement>('#merge');
  const holdButton = document.querySelector<HTMLElement>('[data-hold]');
  let holdingM = false;

  /** The chapter at the middle of the screen. */
  const here = (): number => {
    const middle = window.innerHeight / 2;
    let found = 0;
    sections.forEach((section, i) => {
      if (section.getBoundingClientRect().top <= middle) found = i;
    });
    return found;
  };
  const go = (step: number): void => {
    const next = sections[Math.min(Math.max(here() + step, 0), sections.length - 1)];
    if (next) scrollToTarget(next);
  };
  const open = (): void => {
    if (dialog && !dialog.open) dialog.showModal();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey || typing(event.target) || dialog?.open) return;
    const key = event.key.toLowerCase();
    if (key === 'j') {
      event.preventDefault();
      go(1);
    } else if (key === 'k') {
      event.preventDefault();
      go(-1);
    } else if (key === '?') {
      event.preventDefault();
      open();
    } else if (key === 'm' && !event.repeat) {
      event.preventDefault();
      // held over the merge step, it holds the button; anywhere else it takes the visitor there
      const box = mergeSection?.getBoundingClientRect();
      if (box && box.top < window.innerHeight * 0.6 && box.bottom > window.innerHeight * 0.4) {
        holdingM = true;
        holdButton?.dispatchEvent(new CustomEvent('hold:press'));
      } else if (mergeSection) {
        scrollToTarget(mergeSection);
      }
    }
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.key.toLowerCase() !== 'm' || !holdingM) return;
    holdingM = false;
    holdButton?.dispatchEvent(new CustomEvent('hold:release'));
  };
  const onOpen = (): void => {
    open();
  };
  const onBackdrop = (event: MouseEvent): void => {
    if (dialog && event.target === dialog) dialog.close();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  for (const opener of openers) opener.addEventListener('click', onOpen);
  dialog?.addEventListener('click', onBackdrop);
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    for (const opener of openers) opener.removeEventListener('click', onOpen);
    dialog?.removeEventListener('click', onBackdrop);
  };
}
