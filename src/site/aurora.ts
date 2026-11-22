/**
 * The footer's night sky: ascii.rest's "aurora fjord" (MIT, see ./ascii/LICENSE), drawn as a halftone of
 * dots on one canvas. It only plays while the footer is on screen and the tab is visible; phones, small
 * screens and reduced motion get a single still frame, so it never costs anything while scrolling.
 */
import auroraFjord, { meta } from './ascii/aurora-fjord';

const canvas = document.querySelector<HTMLCanvasElement>('[data-aurora]');
const ctx = canvas?.getContext('2d');

if (canvas && ctx) {
  const { cols, rows, palette, ground, fps } = meta;
  const CELL = 6; // canvas pixels per cell; CSS scales the canvas to cover the footer
  canvas.width = cols * CELL;
  canvas.height = rows * CELL;
  const frame = auroraFjord();
  const color = new Uint8Array(cols * rows);
  // the piece draws " ·•●": a dot's radius grows with its brightness
  const radius = [0, CELL * 0.17, CELL * 0.31, CELL * 0.47];
  const step: Record<string, number> = { ' ': 0, '·': 1, '•': 2, '●': 3 };

  const draw = (t: number): void => {
    const text = frame(t, { color });
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // one path per palette colour, so the canvas changes fill only a few dozen times a frame
    const paths = palette.map(() => new Path2D());
    let r = 0;
    let c = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text.charAt(i);
      if (ch === '\n') {
        r++;
        c = 0;
        continue;
      }
      const rad = radius[step[ch] ?? 0] ?? 0;
      const p = paths[color[r * cols + c] ?? 0];
      if (rad > 0 && p) {
        const x = c * CELL + CELL / 2;
        const y = r * CELL + CELL / 2;
        p.moveTo(x + rad, y);
        p.arc(x, y, rad, 0, Math.PI * 2);
      }
      c++;
    }
    paths.forEach((p, i) => {
      ctx.fillStyle = palette[i] ?? '#ffffff';
      ctx.fill(p);
    });
  };

  const still =
    window.matchMedia('(max-width: 52rem)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const STILL_AT = 4; // a moment with the curtains well lit

  if (still) {
    // draw once, when the footer is about to come into view
    const once = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        draw(STILL_AT);
        once.disconnect();
      }
    }, { rootMargin: '400px 0px' });
    once.observe(canvas);
  } else {
    let visible = false;
    let raf = 0;
    let last = 0;
    const start = performance.now() - STILL_AT * 1000;
    const tick = (now: number): void => {
      raf = 0;
      if (!visible || document.hidden) return;
      if (now - last >= 1000 / fps) {
        last = now;
        draw((now - start) / 1000);
      }
      raf = requestAnimationFrame(tick);
    };
    const play = (): void => {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(tick);
    };
    new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      play();
    }, { rootMargin: '200px 0px' }).observe(canvas);
    document.addEventListener('visibilitychange', play);
    draw(STILL_AT);
  }
}
