/**
 * Room 4, the Three Gates. Two cases side by side, and under them a corridor of three arches: the
 * reproduction test, the existing suite and a fresh static scan. As the room comes into view a soft beam
 * leaves each case and travels through the arches. The careless fix passes the first two and is stopped at
 * the third (the scan finds SQL still built from strings); its case takes a red "Rejected". AUTOSP's fix
 * passes all three and takes a viridian "Accepted". Each case's list fills in as its beam reaches each arch.
 *
 * The visitor can light one case or the other: the other dims and the lit one's beam runs again. A live
 * region says what was decided. The corridor runs across on a wide screen and down on a narrow one. In
 * quiet mode the beams are drawn whole and the results are there at once.
 */
import { onceInView, timeline } from './moment';

const NS = 'http://www.w3.org/2000/svg';
const TRAVEL_MS = 2600;
const ARCHES = ['Reproduction test', 'Existing suite', 'Fresh static scan'];
type Which = 'careless' | 'autosp';
/** Where each fix stops: after the last arch it passes (3 is all of them). */
const PASSES: Record<Which, number> = { careless: 2, autosp: 3 };

interface Case {
  readonly which: Which;
  readonly el: HTMLElement;
  readonly items: HTMLElement[];
  readonly verdict: HTMLElement | null;
}

export function initGates(room: HTMLElement, quiet: boolean): () => void {
  const corridor = room.querySelector<HTMLElement>('[data-corridor]');
  const status = room.querySelector<HTMLElement>('[data-gates-status]');
  const buttons = Array.from(room.querySelectorAll<HTMLButtonElement>('[data-light]'));
  if (!corridor || !status) return () => {};
  const cases: Case[] = (['careless', 'autosp'] as const).flatMap((which) => {
    const el = room.querySelector<HTMLElement>(`[data-case="${which}"]`);
    if (!el) return [];
    const items = Array.from(el.querySelectorAll<HTMLElement>('.gates-route li span'));
    return [
      {
        which,
        el,
        items,
        verdict: el.querySelector('[data-verdict]'),
      },
    ];
  });

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('focusable', 'false');
  corridor.append(svg);
  const beams = new Map<Which, { glow: SVGPathElement; core: SVGPathElement; end: SVGElement }>();
  let across = true;
  let steps = timeline();

  /** The corridor, laid out across or down, with a lane for each fix. */
  const draw = (): void => {
    // drawn at its real size: across a wide screen, down a narrow one with the names beside the arches
    const space = corridor.clientWidth;
    across = space >= 560;
    const long = across ? space : 520;
    const wide = 150;
    const w = across ? long : space;
    const h = across ? wide : long;
    svg.setAttribute('viewBox', `0 0 ${String(w)} ${String(h)}`);
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    // a point along the corridor (t, 0..1) in a lane (0..1 across it)
    const at = (t: number, lane: number): [number, number] => {
      const along = 16 + t * (long - 32);
      const side = across ? 24 + lane * (wide - 48) : 28 + lane * 92;
      return across ? [along, side] : [side, along];
    };
    const parts: SVGElement[] = [];
    ARCHES.forEach((name, i) => {
      const t = (i + 1) / 4;
      const [x0, y0] = at(t, -0.12);
      const [x1, y1] = at(t, 1.12);
      const arch = document.createElementNS(NS, 'path');
      arch.classList.add('corridor__arch');
      // an arch: two posts and a round top, standing across both lanes
      arch.setAttribute(
        'd',
        across
          ? `M ${String(x0 - 14)} ${String(y1)} V ${String(y0 + 14)} A 14 14 0 0 1 ${String(x0 + 14)} ${String(y0 + 14)} V ${String(y1)}`
          : `M ${String(x1)} ${String(y0 - 14)} H ${String(x0 + 14)} A 14 14 0 0 0 ${String(x0 + 14)} ${String(y0 + 14)} H ${String(x1)}`,
      );
      const label = document.createElementNS(NS, 'text');
      label.classList.add('corridor__name');
      label.textContent = name;
      const [lx, ly] = at(t, 1.12);
      label.setAttribute('x', String(across ? lx : lx + 8));
      label.setAttribute('y', String(across ? ly + 18 : ly + 4));
      label.setAttribute('text-anchor', across ? 'middle' : 'start');
      parts.push(arch, label);
    });
    cases.forEach(({ which }, lane) => {
      const stopT = PASSES[which] === 3 ? 1 : (PASSES[which] + 1) / 4;
      const [sx, sy] = at(0, lane);
      const [ex, ey] = at(stopT, lane);
      const d = `M ${String(sx)} ${String(sy)} L ${String(ex)} ${String(ey)}`;
      const glow = document.createElementNS(NS, 'path');
      glow.classList.add('corridor__glow', `corridor__beam--${which}`);
      glow.setAttribute('d', d);
      const core = document.createElementNS(NS, 'path');
      core.classList.add('corridor__core', `corridor__beam--${which}`);
      core.setAttribute('d', d);
      let end: SVGElement;
      if (which === 'careless') {
        // stopped at the arch: a short red bar across the lane
        end = document.createElementNS(NS, 'path');
        end.setAttribute(
          'd',
          across
            ? `M ${String(ex)} ${String(ey - 9)} V ${String(ey + 9)}`
            : `M ${String(ex - 9)} ${String(ey)} H ${String(ex + 9)}`,
        );
        end.classList.add('corridor__stop');
      } else {
        end = document.createElementNS(NS, 'circle');
        end.setAttribute('cx', String(ex));
        end.setAttribute('cy', String(ey));
        end.setAttribute('r', '5');
        end.classList.add('corridor__through');
      }
      beams.set(which, { glow, core, end });
      parts.push(glow, core, end);
    });
    svg.replaceChildren(...parts);
    for (const { glow, core } of beams.values()) {
      for (const path of [glow, core]) {
        const length = path.getTotalLength();
        path.style.strokeDasharray = `${length.toFixed(1)} ${length.toFixed(1)}`;
        path.style.strokeDashoffset = 'ran' in room.dataset ? '0' : length.toFixed(1);
      }
    }
  };

  /** Shows a fix's results up to `passed` arches, and its verdict once its beam has stopped. */
  const show = (c: Case, reached: number, done: boolean): void => {
    // each result keeps its place (and its height) while a short note stands over it
    c.items.forEach((item, i) => {
      const cell = item.parentElement;
      if (!cell) return;
      if (i < reached) {
        delete cell.dataset.note;
      } else {
        cell.dataset.note = i === reached && !done ? 'Checking' : 'Waiting';
      }
    });
    // the verdict keeps its place while it waits, so nothing below it moves when it comes
    if (c.verdict) c.verdict.style.visibility = done ? '' : 'hidden';
    const beam = beams.get(c.which);
    beam?.end.classList.toggle('is-shown', done);
  };

  const run = (only: Which | null): void => {
    steps.cancel();
    steps = timeline();
    room.dataset.ran = '';
    const chosen = cases.filter((c) => only === null || c.which === only);
    for (const c of chosen) {
      const beam = beams.get(c.which);
      const stops = Math.min(PASSES[c.which] + 1, 3); // arches the beam reaches
      const travel = PASSES[c.which] === 3 ? TRAVEL_MS : (TRAVEL_MS * (PASSES[c.which] + 1)) / 4;
      if (quiet || !beam) {
        for (const p of beam ? [beam.glow, beam.core] : []) p.style.strokeDashoffset = '0';
        show(c, stops, true);
        continue;
      }
      show(c, 0, false);
      for (const p of [beam.glow, beam.core]) {
        p.style.transition = 'none';
        p.style.strokeDashoffset = p.style.strokeDasharray.split(' ')[0] ?? '0';
        void p.getBoundingClientRect();
        p.style.transition = `stroke-dashoffset ${String(travel)}ms cubic-bezier(0.33, 0.1, 0.4, 1)`;
        p.style.strokeDashoffset = '0';
      }
      for (let i = 1; i <= stops; i += 1) {
        const atMs = PASSES[c.which] === 3 ? (TRAVEL_MS * i) / 4 : (travel * i) / stops;
        steps.at(atMs, () => {
          show(c, i, false);
        });
      }
      steps.at(travel + 200, () => {
        show(c, stops, true);
      });
    }
    const say =
      only === 'careless'
        ? 'The careless fix passed two gates and was rejected at the third: SQL is still built from strings.'
        : only === 'autosp'
          ? "AUTOSP's fix passed all three gates and was accepted."
          : "The careless fix was rejected at the third gate. AUTOSP's fix passed all three and was accepted.";
    steps.at(quiet ? 0 : TRAVEL_MS + 300, () => {
      status.textContent = say;
    });
  };

  const light = (event: Event): void => {
    const button = event.currentTarget as HTMLButtonElement;
    const which = button.dataset.light as Which;
    const on = button.getAttribute('aria-pressed') !== 'true';
    for (const b of buttons) b.setAttribute('aria-pressed', String(on && b === button));
    if (on) room.dataset.lit = which;
    else delete room.dataset.lit;
    run(on ? which : null);
  };

  draw();
  if (quiet) run(null);
  else for (const c of cases) show(c, 0, false);
  // the beams run when the corridor itself comes into view, not just the room
  const stop = onceInView(corridor, () => {
    run(null);
  });
  const resized = new ResizeObserver(() => {
    const was = across;
    draw();
    if (room.dataset.ran !== undefined) {
      for (const c of cases) beams.get(c.which)?.end.classList.add('is-shown');
    }
    if (was !== across)
      for (const b of beams.values()) b.end.classList.toggle('is-shown', room.dataset.ran !== undefined);
  });
  resized.observe(corridor);
  for (const b of buttons) b.addEventListener('click', light);
  return () => {
    stop();
    steps.cancel();
    resized.disconnect();
    for (const b of buttons) b.removeEventListener('click', light);
    svg.remove();
  };
}
