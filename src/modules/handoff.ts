/**
 * The handoff between the page and the top strip.
 *
 * - Once the page has scrolled at all, `data-scrolled` on <html> fades in the strip's ink scrim;
 *   at the very top the strip stays transparent over the hero's sky.
 * - Text and panels dissolve as they rise into the strip: each block gets a mask that is clear
 *   below the strip and fades out over the last FADE pixels before the strip's lower edge, so a
 *   line of copy never shows through or collides with the nav. Only blocks near the strip carry a
 *   mask at all; the rest are left untouched.
 */

/** The blocks that scroll under the strip: beat copy, panels and the form. */
const BLOCKS =
  '.beat__text, .track__text, .track__panel, .chapter__text, .chapter__panel, .closing__text, .apply';
/** How far below the strip's lower edge a block starts to fade, in CSS pixels. */
const FADE = 56;

export function initHandoff(): () => void {
  const root = document.documentElement;
  const strip = document.querySelector<HTMLElement>('.strip');
  const blocks = Array.from(document.querySelectorAll<HTMLElement>(BLOCKS));
  const masked = new Set<HTMLElement>();
  let frame = 0;

  const update = (): void => {
    frame = 0;
    root.toggleAttribute('data-scrolled', window.scrollY > 4);
    const edge = strip ? strip.getBoundingClientRect().bottom : 0;
    for (const block of blocks) {
      const box = block.getBoundingClientRect();
      // how far into the block (from its top) the clear line sits
      const cut = edge + FADE - box.top;
      // at the very top nothing has risen into the strip, so nothing is faded
      if (window.scrollY <= 4 || cut <= 0 || box.bottom <= 0 || box.height === 0) {
        if (masked.has(block)) {
          block.style.removeProperty('mask-image');
          block.style.removeProperty('-webkit-mask-image');
          masked.delete(block);
        }
        continue;
      }
      const from = Math.max(cut - FADE, 0);
      const mask = `linear-gradient(to bottom, transparent ${String(Math.round(from))}px, #000 ${String(Math.round(cut))}px)`;
      block.style.setProperty('mask-image', mask);
      block.style.setProperty('-webkit-mask-image', mask);
      masked.add(block);
    }
  };
  const schedule = (): void => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  update();
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    for (const block of masked) {
      block.style.removeProperty('mask-image');
      block.style.removeProperty('-webkit-mask-image');
    }
    root.removeAttribute('data-scrolled');
  };
}
