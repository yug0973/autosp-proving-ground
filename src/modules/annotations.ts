/**
 * What the box on each beat needs from script (styles/annotations.css). The light on its edge follows the
 * pointer; its beam runs only while it is on screen. A step's state is drawn in the pixel letters the city's
 * towers use, following its real text, which stays in the page. And the foot of each step carries that step's
 * fingerprint from the record, so what the record says and what the steps say can never differ.
 */
import { renderSign } from '../world/display-font';

const SVG = 'http://www.w3.org/2000/svg';
/** The room a state has in px, and the size of its letters' pixels at the most. */
const WIDTH = 900;
const HEIGHT = 56;
const CELL = 4;

function drawState(tag: HTMLElement): () => void {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'pixel-state');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG, 'path');
  svg.append(path);
  tag.after(svg);
  let drawn = '';
  const draw = (): void => {
    const state = tag.dataset.state ?? '';
    if (state) svg.dataset.state = state;
    else delete svg.dataset.state;
    const text = tag.textContent.trim();
    if (text === drawn) return;
    drawn = text;
    const { bitmap, pitch } = renderSign(text.toUpperCase(), WIDTH, HEIGHT, 1);
    const size = Math.min(pitch, CELL);
    const lit = size * 0.84;
    let d = '';
    for (let y = 0; y < bitmap.rows; y += 1) {
      for (let x = 0; x < bitmap.cols; x += 1) {
        if (bitmap.data[y * bitmap.cols + x]) {
          d += `M${(x * size).toFixed(2)} ${(y * size).toFixed(2)}h${lit.toFixed(2)}v${lit.toFixed(2)}h-${lit.toFixed(2)}z`;
        }
      }
    }
    path.setAttribute('d', d);
    svg.setAttribute('viewBox', `0 0 ${(bitmap.cols * size).toFixed(2)} ${(bitmap.rows * size).toFixed(2)}`);
  };
  const watcher = new MutationObserver(draw);
  watcher.observe(tag, { subtree: true, childList: true, characterData: true, attributes: true });
  draw();
  return () => {
    watcher.disconnect();
    svg.remove();
  };
}

function followFingerprints(): () => void {
  const list = document.querySelector<HTMLElement>('[data-record]');
  const feet = Array.from(document.querySelectorAll<HTMLElement>('[data-tape-fp]'));
  if (!list || feet.length === 0) return () => {};
  const copy = (): void => {
    const shorts = list.querySelectorAll<HTMLElement>('[data-record-short]');
    for (const foot of feet) {
      const text = shorts[Number(foot.dataset.tapeFp)]?.textContent;
      if (text && foot.textContent !== text) foot.textContent = text;
    }
  };
  const watcher = new MutationObserver(copy);
  watcher.observe(list, { subtree: true, childList: true, characterData: true });
  copy();
  return () => {
    watcher.disconnect();
  };
}

/** The light that follows the pointer, and the beam, which runs only while its box is on screen. */
function dressCards(): () => void {
  const cards = Array.from(
    document.querySelectorAll<HTMLElement>('#main :is(.track__panel, .chapter__panel, .closing__inner)'),
  );
  const onMove = (event: PointerEvent): void => {
    const card = event.currentTarget;
    if (!(card instanceof HTMLElement)) return;
    const box = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${(event.clientX - box.left).toFixed(0)}px`);
    card.style.setProperty('--my', `${(event.clientY - box.top).toFixed(0)}px`);
  };
  const seen = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      entry.target.querySelector('.card-beam')?.toggleAttribute('data-live', entry.isIntersecting);
    }
  });
  const beams = cards.map((card) => {
    const beam = document.createElement('span');
    beam.className = 'card-beam';
    beam.setAttribute('aria-hidden', 'true');
    beam.append(document.createElement('i'));
    card.append(beam);
    card.addEventListener('pointermove', onMove, { passive: true });
    seen.observe(card);
    return beam;
  });
  return () => {
    seen.disconnect();
    cards.forEach((card) => {
      card.removeEventListener('pointermove', onMove);
    });
    for (const beam of beams) beam.remove();
  };
}

export function initAnnotations(): () => void {
  const stops = Array.from(document.querySelectorAll<HTMLElement>('#main .panel__tag')).map(drawState);
  stops.push(followFingerprints(), dressCards());
  return () => {
    for (const stop of stops) stop();
  };
}
