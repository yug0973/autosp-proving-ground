/**
 * The primary buttons lean a little towards a mouse pointer over them and give under a press, the
 * same give as the hold to merge. A mouse only, and nothing with reduced motion (the press still
 * gives, as feedback, without travel).
 */
import { prefersReducedMotion } from '../lib/reduced-motion';

const PULL = 0.18; // of the pointer's distance from the button's centre
const MOST = 6; // px

export function initMagnet(root: ParentNode = document): () => void {
  const buttons = Array.from(root.querySelectorAll<HTMLElement>('.btn--primary'));
  const onMove = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse' || prefersReducedMotion()) return;
    const button = event.currentTarget as HTMLElement;
    const box = button.getBoundingClientRect();
    const dx = (event.clientX - (box.left + box.width / 2)) * PULL;
    const dy = (event.clientY - (box.top + box.height / 2)) * PULL;
    button.style.setProperty('--magnet-x', `${Math.max(-MOST, Math.min(MOST, dx)).toFixed(1)}px`);
    button.style.setProperty('--magnet-y', `${Math.max(-MOST, Math.min(MOST, dy)).toFixed(1)}px`);
  };
  const onLeave = (event: PointerEvent): void => {
    const button = event.currentTarget as HTMLElement;
    button.style.removeProperty('--magnet-x');
    button.style.removeProperty('--magnet-y');
  };
  for (const button of buttons) {
    button.addEventListener('pointermove', onMove);
    button.addEventListener('pointerleave', onLeave);
  }
  return () => {
    for (const button of buttons) {
      button.removeEventListener('pointermove', onMove);
      button.removeEventListener('pointerleave', onLeave);
      button.style.removeProperty('--magnet-x');
      button.style.removeProperty('--magnet-y');
    }
  };
}
