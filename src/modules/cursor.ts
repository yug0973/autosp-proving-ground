/**
 * The custom cursor (DESIGN.md §7): a small ring that follows the pointer and grows over
 * interactive elements and over the code line. It is purely additive: the native cursor is never
 * hidden, so text selection and inputs keep their usual cursor.
 *
 * It exists only for a fine, hovering pointer on a device with no touch input, without reduced
 * motion; it is created and torn down live as any of these change, and it hides while the pointer
 * is outside the window or a touch is detected.
 */
import { gsap } from 'gsap';
import { durationMs } from '../lib/css-tokens';
import { onReducedMotionChange, prefersReducedMotion } from '../lib/reduced-motion';

const GROW_TARGETS = 'a[href], button, input, select, textarea, label, summary, [data-cursor-grow]';
const FINE_POINTER = '(hover: hover) and (pointer: fine)';
// any touch input at all (phones, tablets, touchscreen laptops) counts as a touch device (§7)
const ANY_TOUCH = '(any-pointer: coarse)';

function mountCursor(): () => void {
  const cursor = document.createElement('div');
  cursor.className = 'cursor';
  cursor.setAttribute('aria-hidden', 'true');
  cursor.append(Object.assign(document.createElement('div'), { className: 'cursor__ring' }));
  document.body.append(cursor);

  const follow = { duration: durationMs('--dur-fast', 140) / 1000, ease: 'power3.out' };
  const moveX = gsap.quickTo(cursor, 'x', follow);
  const moveY = gsap.quickTo(cursor, 'y', follow);
  let placed = false;

  const onMove = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') {
      cursor.dataset.visible = 'false';
      return;
    }
    if (!placed) {
      // first sighting: jump there instead of sliding in from the corner
      gsap.set(cursor, { x: event.clientX, y: event.clientY });
      placed = true;
    }
    moveX(event.clientX);
    moveY(event.clientY);
    cursor.dataset.visible = 'true';
  };
  const onOver = (event: PointerEvent): void => {
    const grow = event.target instanceof Element && event.target.closest(GROW_TARGETS) !== null;
    cursor.dataset.grow = String(grow);
  };
  const onLeave = (): void => {
    cursor.dataset.visible = 'false';
  };

  document.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerover', onOver, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  window.addEventListener('blur', onLeave);

  return () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerover', onOver);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    window.removeEventListener('blur', onLeave);
    gsap.killTweensOf(cursor);
    cursor.remove();
  };
}

/** Starts the cursor where it belongs. Returns a function that removes it and every listener. */
export function initCursor(): () => void {
  const fine = window.matchMedia(FINE_POINTER);
  const touch = window.matchMedia(ANY_TOUCH);
  let unmount: (() => void) | null = null;

  const evaluate = (): void => {
    const wanted = fine.matches && !touch.matches && !prefersReducedMotion();
    if (wanted && !unmount) unmount = mountCursor();
    if (!wanted && unmount) {
      unmount();
      unmount = null;
    }
  };

  evaluate();
  fine.addEventListener('change', evaluate);
  touch.addEventListener('change', evaluate);
  const stopWatching = onReducedMotionChange(evaluate);
  return () => {
    fine.removeEventListener('change', evaluate);
    touch.removeEventListener('change', evaluate);
    stopWatching();
    unmount?.();
    unmount = null;
  };
}
