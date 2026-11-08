/**
 * Room 6, the Signing. A person always decides: the pull request waits, as a document, for a signature.
 * "Hold to sign and merge": while the visitor holds (pointer, or Space or Enter held down), the signature
 * draws itself along the line; letting go early cancels it, and the ink draws back. A screen reader's
 * activation (a click with no hold behind it) signs at once, as a plain button would.
 *
 * Once signed, the room says so, the amber dot on the route turns viridian, the route and main are one,
 * a phone gives a small tap, and entry 5 is written into the guestbook ('exhibit:signed'). "Undo the demo
 * signing" puts it back. The hold works the same in quiet mode: it is the visitor's own motion.
 */
const HOLD_MS = 1600;
const DRAIN = 2.5; // the ink draws back this much faster than it went down
const KEY_CLICK_MS = 600; // a click this soon after Space or Enter is the end of a keyboard hold

export function initSigning(room: HTMLElement): () => void {
  const button = room.querySelector<HTMLButtonElement>('[data-hold]');
  const signature = room.querySelector<SVGPathElement>('[data-signature]');
  const done = room.querySelector<HTMLElement>('[data-signed-note]');
  const undo = room.querySelector<HTMLButtonElement>('[data-unsign]');
  const status = room.querySelector<HTMLElement>('[data-hold-status]');
  const label = button?.querySelector<HTMLElement>('.hold__label');
  if (!button || !signature || !done || !undo || !status || !label) return () => {};
  const length = signature.getTotalLength();
  signature.style.strokeDasharray = `${length.toFixed(1)} ${length.toFixed(1)}`;
  let progress = 0;
  let holding = false;
  let signed = false;
  let frame = 0;
  let last = 0;
  let furthest = 0;
  let keyedAt = -Infinity;
  let touch = false;

  const paint = (): void => {
    signature.style.strokeDashoffset = (length * (1 - progress)).toFixed(1);
    button.style.setProperty('--hold', progress.toFixed(3));
  };
  const announce = (text: string): void => {
    status.textContent = text;
  };

  const sign = (on: boolean): void => {
    signed = on;
    progress = on ? 1 : 0;
    paint();
    room.toggleAttribute('data-signed', on);
    document.documentElement.toggleAttribute('data-signed', on);
    done.hidden = !on;
    undo.hidden = !on;
    button.disabled = on;
    label.textContent = on ? 'Signed and merged' : 'Hold to sign and merge';
    document.dispatchEvent(new CustomEvent('exhibit:signed', { detail: on }));
    if (on) {
      announce('Merged. You made the call, and the test stays.');
      // Safari has no vibrate; elsewhere a phone gives a small tap
      if (touch && 'vibrate' in navigator) navigator.vibrate(40);
    }
  };

  const tick = (now: number): void => {
    const dt = now - last;
    last = now;
    progress += holding ? dt / HOLD_MS : (-dt * DRAIN) / HOLD_MS;
    progress = Math.min(Math.max(progress, 0), 1);
    furthest = Math.max(furthest, progress);
    paint();
    if (progress >= 1) {
      frame = 0;
      holding = false;
      sign(true);
      return;
    }
    if (progress <= 0 && !holding) {
      frame = 0;
      if (furthest > 0.08) announce('Let go early. Nothing was signed or merged.');
      furthest = 0;
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  const press = (): void => {
    if (signed) return;
    holding = true;
    if (progress === 0) announce('Keep holding to sign and merge.');
    if (!frame) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
  };
  const release = (): void => {
    holding = false;
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    touch = event.pointerType === 'touch';
    button.setPointerCapture(event.pointerId);
    press();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    keyedAt = performance.now();
    if (!event.repeat) press();
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    keyedAt = performance.now();
    release();
  };
  const onClick = (event: MouseEvent): void => {
    // no hold behind it (a screen reader's activation, or a switch): sign at once, as a plain button would
    if (event.detail === 0 && performance.now() - keyedAt > KEY_CLICK_MS && !signed) sign(true);
  };
  const block = (event: Event): void => {
    event.preventDefault();
  };
  const onUndo = (): void => {
    sign(false);
    announce('The demo signing is undone. The pull request is waiting for a person again.');
    button.focus();
  };

  paint();
  button.addEventListener('pointerdown', onPointerDown);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
  button.addEventListener('keydown', onKeyDown);
  button.addEventListener('keyup', onKeyUp);
  button.addEventListener('blur', release);
  button.addEventListener('click', onClick);
  button.addEventListener('contextmenu', block);
  undo.addEventListener('click', onUndo);
  return () => {
    cancelAnimationFrame(frame);
    button.removeEventListener('pointerdown', onPointerDown);
    button.removeEventListener('pointerup', release);
    button.removeEventListener('pointercancel', release);
    button.removeEventListener('lostpointercapture', release);
    button.removeEventListener('keydown', onKeyDown);
    button.removeEventListener('keyup', onKeyUp);
    button.removeEventListener('blur', release);
    button.removeEventListener('click', onClick);
    button.removeEventListener('contextmenu', block);
    undo.removeEventListener('click', onUndo);
  };
}
