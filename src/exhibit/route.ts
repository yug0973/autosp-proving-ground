/**
 * The three threads of the exhibition, driven by one frame per scroll:
 *
 *  - The route line: a hand-drawn ink line in the left margin, like the visitor route on a gallery floor.
 *    It begins at the glass case, wanders down past every room, and at the signing joins the faint
 *    straight "main" line beside it, as a branch merging. It draws itself as the visitor goes.
 *  - The amber dot: the finding, travelling the route. It pauses in each room (at the room's title) and
 *    moves on between rooms. At the signing it turns viridian (signing.ts sets that), and stays so.
 *  - The walls: the page's one background colour, moving from room to room across the pale walls
 *    (limestone, celadon, paper). The two dark rooms, the projection room and the signing room, keep walls of
 *    their own and are entered through a doorway, as a darkened room is: a blend from pale to dark would
 *    pass through greys that neither ink nor chalk can be read on. The line is drawn so it reads on both.
 *
 * Only transform, opacity, stroke-dashoffset and one background colour change; nothing runs between
 * scrolls. In quiet mode the walls stay with their rooms, the line is drawn whole and the dot waits at the
 * case. The SVG is decoration: it is hidden from assistive technology.
 */
const NS = 'http://www.w3.org/2000/svg';

type Rgb = readonly [number, number, number];

function hex(value: string): Rgb {
  const h = value.trim().replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as unknown as Rgb;
}
/** A blend that hurries through its middle: most of the way it is near one end or the other. */
function hurry(t: number): number {
  const u = t * 2 - 1;
  return 0.5 + 0.5 * Math.sign(u) * Math.abs(u) ** 0.3;
}
/** A little seeded wobble, the same on every visit, so the line looks drawn by hand, not plotted. */
function wobble(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}

interface Room {
  readonly el: HTMLElement;
  readonly wall: Rgb;
  readonly dark: boolean;
  top: number;
  bottom: number;
  stop: number; // the y the dot rests at in this room
}

export function initRoute(quiet: boolean): () => void {
  const root = document.documentElement;
  const main = document.querySelector<HTMLElement>('#main');
  const rooms: Room[] = Array.from(document.querySelectorAll<HTMLElement>('.room')).map((el) => ({
    el,
    wall: hex(getComputedStyle(el).getPropertyValue('--room-wall') || '#e2dfd6'),
    dark: el.matches('[data-wall="projection"], [data-wall="signing"]'),
    top: 0,
    bottom: 0,
    stop: 0,
  }));
  const signing = document.querySelector<HTMLElement>('#signing');
  const exhibit = document.querySelector<HTMLElement>('.entrance .case');
  if (!main || rooms.length === 0 || !exhibit) return () => {};

  // --- the drawing ---------------------------------------------------------------------------------------
  const svg = document.createElementNS(NS, 'svg');
  svg.classList.add('route');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const trunk = document.createElementNS(NS, 'path');
  trunk.classList.add('route__main');
  const line = document.createElementNS(NS, 'path');
  line.classList.add('route__line');
  const stops = document.createElementNS(NS, 'g');
  stops.classList.add('route__stops');
  svg.append(trunk, line, stops);
  // the dot on a layer of its own: the lines invert against the wall to read on pale and dark alike, and
  // the finding keeps its amber
  const dotLayer = document.createElementNS(NS, 'svg');
  dotLayer.classList.add('route', 'route--dot');
  dotLayer.setAttribute('aria-hidden', 'true');
  dotLayer.setAttribute('focusable', 'false');
  const dot = document.createElementNS(NS, 'circle');
  dot.classList.add('route__dot');
  dot.setAttribute('r', '5');
  dotLayer.append(dot);
  document.body.append(svg, dotLayer);
  root.toggleAttribute('data-walls', !quiet);
  root.toggleAttribute('data-route', true);

  let length = 0;
  let table: Array<{ y: number; at: number }> = []; // y down the page → length along the line
  let frame = 0;

  /** The length along the line at which it first reaches `y`. */
  const along = (y: number): number => {
    if (table.length === 0) return 0;
    let lo = 0;
    let hi = table.length - 1;
    if (y <= (table[0]?.y ?? 0)) return 0;
    if (y >= (table[hi]?.y ?? 0)) return length;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if ((table[mid]?.y ?? 0) < y) lo = mid;
      else hi = mid;
    }
    const a = table[lo];
    const b = table[hi];
    if (!a || !b || b.y === a.y) return a?.at ?? 0;
    return a.at + ((y - a.y) / (b.y - a.y)) * (b.at - a.at);
  };

  const layout = (): void => {
    const page = document.documentElement.scrollHeight;
    const width = Math.max(
      main.getBoundingClientRect().left + parseFloat(getComputedStyle(rooms[0]?.el ?? main).paddingLeft),
      20,
    );
    for (const layer of [svg, dotLayer]) {
      layer.setAttribute('width', String(width));
      layer.setAttribute('height', String(page));
      layer.setAttribute('viewBox', `0 0 ${String(width)} ${String(page)}`);
    }
    for (const room of rooms) {
      const box = room.el.getBoundingClientRect();
      room.top = box.top + scrollY;
      room.bottom = box.bottom + scrollY;
      const title = room.el.querySelector('h1, h2')?.getBoundingClientRect();
      room.stop = title ? title.top + scrollY + Math.min(title.height / 2, 40) : room.top + 120;
    }
    // the main line's place, the branch's, and how far the branch strays by hand
    const mainX = width * 0.3;
    const branchX = width * 0.64;
    const stray = Math.min(width * 0.12, 9);
    const caseBox = exhibit.getBoundingClientRect();
    const startY = caseBox.top + scrollY + caseBox.height / 2;
    const joinY = signing
      ? signing.getBoundingClientRect().top + scrollY + signing.getBoundingClientRect().height * 0.55
      : page * 0.7;
    // from the case's edge out into the margin, then down, wandering a little, to the join
    let d = `M ${(caseBox.left - 2).toFixed(1)} ${startY.toFixed(1)} C ${(branchX + 20).toFixed(1)} ${startY.toFixed(1)}, ${branchX.toFixed(1)} ${(startY + 30).toFixed(1)}, ${branchX.toFixed(1)} ${(startY + 90).toFixed(1)}`;
    const step = 220;
    let y = startY + 90;
    let x = branchX;
    let n = 1;
    while (y + step < joinY - 260) {
      const nextY = y + step;
      const nextX = branchX + wobble(n) * stray;
      d += ` C ${x.toFixed(1)} ${(y + step * 0.45).toFixed(1)}, ${nextX.toFixed(1)} ${(nextY - step * 0.45).toFixed(1)}, ${nextX.toFixed(1)} ${nextY.toFixed(1)}`;
      x = nextX;
      y = nextY;
      n += 1;
    }
    // the merge: the branch bends over and joins main, and from there the two are one line to the exit
    d += ` C ${x.toFixed(1)} ${(joinY - 120).toFixed(1)}, ${mainX.toFixed(1)} ${(joinY - 110).toFixed(1)}, ${mainX.toFixed(1)} ${joinY.toFixed(1)}`;
    d += ` L ${mainX.toFixed(1)} ${(page - 40).toFixed(1)}`;
    line.setAttribute('d', d);
    trunk.setAttribute('d', `M ${mainX.toFixed(1)} 0 L ${mainX.toFixed(1)} ${page.toFixed(1)}`);
    length = line.getTotalLength();
    line.style.strokeDasharray = `${length.toFixed(1)} ${length.toFixed(1)}`;
    table = [];
    let lastY = -Infinity;
    // 400 samples are plenty to place the dot (it is interpolated between them), and each one is a
    // geometry query: on a slow phone, one every few pixels of a long page held the page up for a second
    const sample = Math.max(length / 400, 6);
    for (let at = 0; at <= length; at += sample) {
      const p = line.getPointAtLength(at);
      if (p.y > lastY) {
        table.push({ y: p.y, at });
        lastY = p.y;
      }
    }
    // a small mark on the route where each room's stop is
    stops.replaceChildren(
      ...rooms.map((room) => {
        const at = line.getPointAtLength(along(room.stop));
        const mark = document.createElementNS(NS, 'circle');
        mark.setAttribute('cx', at.x.toFixed(1));
        mark.setAttribute('cy', at.y.toFixed(1));
        mark.setAttribute('r', '3');
        return mark;
      }),
    );
    update();
  };

  /** Where the dot is along the page: at a room's stop while the room holds the middle of the screen,
   * travelling between stops while the visitor walks from one room to the next. */
  const dotY = (middle: number): number => {
    const first = rooms[0];
    if (!first || middle <= first.stop) return first?.stop ?? 0;
    for (let i = 0; i < rooms.length; i += 1) {
      const room = rooms[i];
      const next = rooms[i + 1];
      if (!room) break;
      const holdTo = Math.max(room.stop, room.bottom - innerHeight * 0.2); // it moves on only at the doorway
      if (middle <= holdTo) return room.stop;
      if (!next) return room.stop;
      const leaveFrom = holdTo;
      const arriveAt = Math.max(next.stop, next.top + innerHeight * 0.2);
      if (middle < arriveAt)
        return room.stop + ((middle - leaveFrom) / (arriveAt - leaveFrom)) * (next.stop - room.stop);
    }
    return rooms[rooms.length - 1]?.stop ?? 0;
  };

  /** The pale wall at the middle of the screen: each pale room's own, blending across the doorway to the
   * next pale room, or, past a dark room (which paints its own wall), across that room while it hides the
   * page behind it. */
  const wallAt = (middle: number): Rgb => {
    const band = innerHeight * 0.22;
    const pale = rooms.filter((room) => !room.dark);
    for (let i = 0; i < pale.length; i += 1) {
      const room = pale[i];
      const next = pale[i + 1];
      if (!room) break;
      if (!next) return room.wall;
      const adjacent = rooms.indexOf(next) === rooms.indexOf(room) + 1;
      const from = adjacent ? room.bottom - band : room.bottom;
      const to = adjacent ? room.bottom + band : next.top;
      if (middle < from) return room.wall;
      if (middle <= to) {
        const t = hurry(Math.min(Math.max((middle - from) / Math.max(to - from, 1), 0), 1));
        return room.wall.map((v, k) => Math.round(v + ((next.wall[k] ?? v) - v) * t)) as unknown as Rgb;
      }
    }
    return pale[pale.length - 1]?.wall ?? [226, 223, 214];
  };

  const update = (): void => {
    frame = 0;
    const middle = scrollY + innerHeight / 2;
    if (quiet) {
      line.style.strokeDashoffset = '0';
      const start = line.getPointAtLength(0);
      dot.setAttribute('transform', `translate(${start.x.toFixed(1)} ${start.y.toFixed(1)})`);
      return;
    }
    // the line is drawn a little ahead of the visitor
    const drawn = along(scrollY + innerHeight * 0.7);
    line.style.strokeDashoffset = (length - drawn).toFixed(1);
    const p = line.getPointAtLength(Math.min(along(dotY(middle)), drawn));
    dot.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
    const wall = wallAt(middle);
    root.style.setProperty('--wall', `rgb(${wall.join(' ')})`);
  };
  const schedule = (): void => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  // at the signing the finding is fixed: the dot turns viridian and stays so
  const onSigned = (event: Event): void => {
    dot.toggleAttribute('data-signed', (event as CustomEvent<boolean>).detail);
  };
  document.addEventListener('exhibit:signed', onSigned);
  // laid out again only when the page has really changed size (the observer also calls once at the start,
  // and the fonts arriving rarely change it)
  let laidOut = '';
  const relayout = (): void => {
    const size = `${String(main.clientWidth)}x${String(document.documentElement.scrollHeight)}`;
    if (size === laidOut) return;
    laidOut = size;
    layout();
  };
  const resized = new ResizeObserver(relayout);
  resized.observe(main);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  void document.fonts.ready.then(relayout);
  relayout();

  return () => {
    cancelAnimationFrame(frame);
    document.removeEventListener('exhibit:signed', onSigned);
    resized.disconnect();
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    svg.remove();
    dotLayer.remove();
    root.removeAttribute('data-walls');
    root.removeAttribute('data-route');
    root.style.removeProperty('--wall');
  };
}
