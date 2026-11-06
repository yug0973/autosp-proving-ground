"""The results as a skyline (Phase 5), checked in a real browser.

    python tests/results.py [--base URL] [--flags=FLAG,FLAG] [--shots DIR] [--size 1440x900]

  - The row matches the page's copy: 16 towers (14 lime, 2 amber), and the numbers on the towers are
    the numbers in the text. A gap with a person stands for the 0 merges: no tower stands in it.
  - The numbers count up on entry, never past their value, and they and the towers agree throughout.
    What has been reached stays: coming back does not play it again.
  - Read off the canvas: the towers really are lime and amber, the gap really is dark, and each large
    numeral really is drawn on its tower, in its colour.
  - The camera never passes through a building, and is at each stop when the visitor is.
  - The caveat stays on screen, unchanged in meaning, at every stop; the text is at least 18 px on a
    surface with at least 4.5:1 contrast, and all three statements stay in the page for a screen reader.
  - Reduced motion: every number and every tower there at once, no counting, one still frame per stop.

Needs the dev server up. Saves a frame at each stop with --shots. Exits 1 if a check fails.
"""
import argparse
import io
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

GPU = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--headless=new']
# the middle of each stop of the flight, as parts of the section's travel
STOPS = {'verified': 0.25, 'inconclusive': 0.65, 'merged': 0.95}
CAVEAT = (
    'Test applications and a development model, not customer code. A small sample from our 15 October '
    '2026 baseline: an early signal, not a benchmark.'
)
results = []


def check(name, ok, detail=''):
    results.append(bool(ok))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  ({detail})' if detail else ''))


def luminance(rgb):
    def channel(c):
        c /= 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = rgb
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def is_lime(p):
    r, g, b = p
    return g > 110 and g > r and r > 0.6 * g and b < 0.62 * g


def is_amber(p):
    r, g, b = p
    return r > 110 and g > 0.45 * r and g < 0.92 * r and b < 0.55 * r


def scroll_to_stop(page, share):
    page.evaluate(
        """(share) => { const s = document.querySelector('#results');
           const top = s.getBoundingClientRect().top + scrollY;
           scrollTo(0, top + (s.offsetHeight - innerHeight) * share); }""",
        share,
    )


def frames(page, n=3):
    page.evaluate(
        'new Promise(r => { let n = %d; const f = () => (--n > 0 ? requestAnimationFrame(f) : r()); requestAnimationFrame(f) })' % n
    )


def world_only(page):
    """The canvas alone, with the page's text hidden, as an image."""
    tag = page.add_style_tag(content='body * { visibility: hidden !important } canvas { visibility: visible !important }')
    frames(page)
    img = Image.open(io.BytesIO(page.screenshot(timeout=180000))).convert('RGB')
    tag.evaluate('e => e.remove()')
    return img


def project(page, x, y, z):
    return page.evaluate('([x, y, z]) => __world.project(x, y, z)', [x, y, z])


def sample_box(img, box):
    """The pixels of a screen-space box, clipped to the image."""
    left, top, right, bottom = (int(v) for v in box)
    left, top = max(left, 0), max(top, 0)
    right, bottom = min(right, img.width), min(bottom, img.height)
    if right <= left or bottom <= top:
        return []
    return list(img.crop((left, top, right, bottom)).getdata())


def tower_box(page, tower, scale):
    """The middle of the tower's north wall on screen, in image pixels."""
    half = tower['width'] / 2
    near = tower['z'] - tower['depth'] / 2
    corners = [project(page, tower['x'] + dx, y, near) for dx in (-half + 0.8, half - 0.8) for y in (8, 18)]
    if not all(c['shown'] for c in corners):
        return None
    xs = [c['x'] * scale for c in corners]
    ys = [c['y'] * scale for c in corners]
    return min(xs), min(ys), max(xs), max(ys)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://127.0.0.1:5173/')
    ap.add_argument('--flags')
    ap.add_argument('--shots')
    ap.add_argument('--size', default='1440x900')
    args = ap.parse_args()
    width, height = (int(n) for n in args.size.split('x'))
    tall = height > width

    with sync_playwright() as p:
        browser = p.chromium.launch(args=args.flags.split(',') if args.flags else GPU)

        def open_page(**options):
            ctx = browser.new_context(viewport={'width': width, 'height': height}, **options)
            ctx.add_init_script("Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })")
            page = ctx.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('console', lambda m: m.type == 'error' and 'attribute height' not in m.text and errors.append(m.text[:200]))
            page.goto(f'{args.base}?test&sway=off', wait_until='networkidle')
            page.wait_for_function("['live', 'still'].includes(document.documentElement.dataset.world)", timeout=120000)
            page.wait_for_timeout(600)
            return ctx, page, errors

        ctx, page, errors = open_page()
        row = page.evaluate('__world.skyline()')

        # --- the row against the page's copy ---------------------------------------------------
        copy = page.evaluate(
            """() => [...document.querySelectorAll('#results [data-numeral]')].map((n) => ({
                 value: Number(n.dataset.numeral), of: n.dataset.of ? Number(n.dataset.of) : null,
                 text: n.querySelector('.stats__text').textContent.trim(),
                 said: n.nextElementSibling.textContent.trim() }))"""
        )
        check('the page states 14/16, 2/2 and 0', [c['text'] for c in copy] == ['14/16', '2/2', '0'], str([c['text'] for c in copy]))
        check('the row has one tower for each of the 16 runs', row['runs'] == copy[0]['of'], str(row['runs']))
        check('before the beat, no tower has turned and no numeral stands', row['stage'] == 0 and row['front'] == 0)
        last = row['towers'][-1]
        wall_right = last['x'] - last['width'] / 2
        wall = row['wall']
        check(
            'no tower stands in the gap',
            all(abs(t['x'] - row['gapX']) > row['lot'] / 2 for t in row['towers']),
            f"gap at x={row['gapX']:.1f}",
        )
        check('the wall in the gap is far lower than any tower', wall['top'] * 1.5 < min(t['top'] for t in row['towers']), f"{wall['top']:.1f}")
        check('the wall stands inside the gap', wall['x'] + wall['width'] / 2 <= wall_right + 1e-6)
        buildings = page.evaluate(
            "__world.buildings.map((b) => ({ i: b.index, t: b.tiers.map((t) => [t.x - t.w / 2, t.y0, t.z - t.d / 2, t.x + t.w / 2, t.y0 + t.h, t.z + t.d / 2]) }))"
        )
        row_ids = {t['index'] for t in row['towers']} | {wall['index']}
        overlap = [
            b['i']
            for b in buildings
            if b['i'] not in row_ids
            for t in b['t']
            if t[3] > row['towers'][-1]['x'] - 30 and t[0] < row['towers'][0]['x'] + 10 and t[5] > row['towers'][0]['z'] - 10
        ]
        check('no other building stands in the row or close in front of it', not overlap, str(overlap[:5]))

        # --- the numbers count up on entry, with the towers -----------------------------------
        page.evaluate('scrollTo(0, 0)')
        page.wait_for_timeout(600)
        scroll_to_stop(page, STOPS['verified'])
        seen = []
        for _ in range(60):
            frames(page, 2)
            s = page.evaluate('__world.skyline()')
            if s['verified']:
                seen.append((s['verified']['shown'], s['lime']))
            if s['verified'] and s['verified']['shown'] == 14 and s['verified']['reveal'] == 1:
                break
        shown = [a for a, _ in seen]
        check('the first number counts up, to 14', shown and shown[-1] == 14 and len(set(shown)) > 3, str(sorted(set(shown))))
        check('and never goes down, or past its value', all(b >= a for a, b in zip(shown, shown[1:], strict=False)) and max(shown) <= 14)
        check('the number always matches the towers lit', all(a == b for a, b in seen), str(seen[:6]))
        s = page.evaluate('__world.skyline()')
        check('at the first stop only the lime towers have turned', s['lime'] == 14 and s['amber'] == 0, f"{s['lime']} lime, {s['amber']} amber")

        def stat_shown(page):
            return page.evaluate("document.querySelector('#results').dataset.stat")

        img = world_only(page)
        scale = img.width / width
        if args.shots:
            page.screenshot(path=f'{args.shots}/results-verified-page.png', timeout=180000)
            img.save(f'{args.shots}/results-verified-world.png')
        check('the first stop puts the first statement forward', stat_shown(page) == '0')
        tower = row['towers'][8]
        box = tower_box(page, tower, scale)
        check('the tower carrying 14/16 is in frame at its stop', box is not None, str(box))
        if box:
            pixels = sample_box(img, box)
            lime = sum(is_lime(q) for q in pixels) / max(len(pixels), 1)
            check('read off the canvas: that tower is lit lime', lime > 0.04, f'{lime * 100:.1f}% of its wall')

        # the next two stops
        scroll_to_stop(page, STOPS['inconclusive'])
        seen = []
        for _ in range(60):
            frames(page, 2)
            s = page.evaluate('__world.skyline()')
            if s['inconclusive']:
                seen.append(s['inconclusive']['shown'])
            if s['inconclusive'] and s['inconclusive']['shown'] == 2 and s['inconclusive']['reveal'] == 1:
                break
        check('the second number counts up, to 2', seen and seen[-1] == 2, str(sorted(set(seen))))
        s = page.evaluate('__world.skyline()')
        check('14 towers are lime and 2 amber', s['lime'] == 14 and s['amber'] == 2, f"{s['lime']} lime, {s['amber']} amber")
        img = world_only(page)
        if args.shots:
            page.screenshot(path=f'{args.shots}/results-inconclusive-page.png', timeout=180000)
            img.save(f'{args.shots}/results-inconclusive-world.png')
        check('the second stop puts the second statement forward', stat_shown(page) == '1')
        box = tower_box(page, row['towers'][14], scale)
        check('the tower carrying 2/2 is in frame at its stop', box is not None, str(box))
        if box:
            pixels = sample_box(img, box)
            amber = sum(is_amber(q) for q in pixels) / max(len(pixels), 1)
            lime = sum(is_lime(q) for q in pixels) / max(len(pixels), 1)
            check('read off the canvas: that tower is lit amber, not lime', amber > 0.04 and lime < amber / 3, f'{amber * 100:.1f}% amber, {lime * 100:.1f}% lime')

        scroll_to_stop(page, STOPS['merged'])
        for _ in range(60):
            frames(page, 2)
            s = page.evaluate('__world.skyline()')
            if s['merged'] and s['merged']['reveal'] == 1 and s['person']['shown'] == s['person']['of']:
                break
        s = page.evaluate('__world.skyline()')
        check('the third numeral stands at 0', s['merged'] and s['merged']['shown'] == 0, str(s['merged']))
        check('the person stands in the gap', s['person']['shown'] == s['person']['of'] and s['person']['of'] > 0, str(s['person']))
        img = world_only(page)
        if args.shots:
            page.screenshot(path=f'{args.shots}/results-merged-page.png', timeout=180000)
            img.save(f'{args.shots}/results-merged-world.png')
        check('the third stop puts the third statement forward', stat_shown(page) == '2')
        # the skyline's gap: from the top of the wall to well above it, with no tower behind it
        half = row['lot'] / 2 - 1.5
        gap_corners = [project(page, row['gapX'] + dx, y, last['z']) for dx in (-half, half) for y in (wall['top'] + 3, wall['top'] + 14)]
        if all(c['shown'] for c in gap_corners):
            xs = [c['x'] * scale for c in gap_corners]
            ys = [c['y'] * scale for c in gap_corners]
            pixels = sample_box(img, (min(xs), min(ys), max(xs), max(ys)))
            bright = sorted(luminance(q) for q in pixels)
            top = bright[int(len(bright) * 0.98)] if bright else 1
            check('read off the canvas: the gap in the skyline is dark', bool(pixels) and top < 0.06, f'98th percentile luminance {top:.3f}')
        else:
            check('the gap in the skyline is in frame at its stop', False, str(gap_corners))

        # --- it stays: coming back does not play it again ------------------------------------
        scroll_to_stop(page, STOPS['verified'])
        frames(page, 5)
        s = page.evaluate('__world.skyline()')
        check('coming back, the row stays as it was reached', s['lime'] == 14 and s['amber'] == 2 and s['stage'] == 3)
        check('the numerals stand at their values', s['verified']['shown'] == 14 and s['inconclusive']['shown'] == 2)

        # --- the camera's flight ---------------------------------------------------------------
        boxes = [t for b in buildings for t in b['t']]
        total = page.evaluate("(() => { const s = document.querySelector('#results'); return [s.getBoundingClientRect().top + scrollY, s.offsetHeight - innerHeight, innerHeight]; })()")
        top, travel, view = total
        inside = []
        for k in range(0, 121):
            y = top - view + (travel + view) * k / 120
            page.evaluate(f'scrollTo(0, {y})')
            frames(page, 3)
            c = page.evaluate('__world.inspect().camera')
            if any(t[0] < c[0] < t[3] and t[1] < c[1] < t[4] and t[2] < c[2] < t[5] for t in boxes):
                inside.append(c)
        check('the camera never passes through a building', not inside, str(inside[:3]))
        check('no script errors', not errors, '; '.join(errors)[:200])

        # --- the panel: the words stay readable at every stop -------------------------------
        for stop, share in STOPS.items():
            scroll_to_stop(page, share)
            page.wait_for_timeout(500)
            info = page.evaluate(
                """() => {
                  const panel = document.querySelector('#results .track__panel');
                  const caveat = document.querySelector('#results .stats__caveat');
                  const box = caveat.getBoundingClientRect();
                  const rgb = (c) => c.match(/[\\d.]+/g).map(Number);
                  const dd = [...document.querySelectorAll('#results dd')];
                  const seen = dd.filter((d) => { const r = d.getBoundingClientRect(); return r.width > 2 && r.height > 2; });
                  return {
                    caveat: caveat.textContent.replace(/\\s+/g, ' ').trim(),
                    onScreen: box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth,
                    uncovered: [[0.02, 0.1], [0.98, 0.1], [0.02, 0.9], [0.98, 0.9], [0.5, 0.5]].every(([fx, fy]) => {
                      const hit = document.elementFromPoint(box.left + box.width * fx, box.top + box.height * fy);
                      return hit === caveat || caveat.contains(hit);
                    }),
                    size: parseFloat(getComputedStyle(caveat).fontSize),
                    ddSize: parseFloat(getComputedStyle(seen[0]).fontSize),
                    colour: rgb(getComputedStyle(caveat).color),
                    dim: rgb(getComputedStyle(seen[seen.length - 1]).color),
                    ground: rgb(getComputedStyle(panel).backgroundColor),
                    panels: [...document.querySelectorAll('#results .track__panel')].length,
                    overflowX: document.documentElement.scrollWidth > innerWidth,
                    panelBox: (() => { const r = panel.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; })(),
                  };
                }"""
            )
            check(f'{stop}: the caveat is on screen, word for word', info['caveat'] == CAVEAT and info['onScreen'], info['caveat'][:40])
            check(f'{stop}: nothing on the page covers the caveat', info['uncovered'])
            if not tall:
                check(f'{stop}: the text is at least 18px', info['size'] >= 18 and info['ddSize'] >= 18, f"{info['size']:.1f}px, {info['ddSize']:.1f}px")
            check(f'{stop}: one panel', info['panels'] == 1)
            check(f'{stop}: the page does not scroll sideways', not info['overflowX'])
            # contrast against the panel's ground over the darkest and the brightest the world can be
            alpha = info['ground'][3] if len(info['ground']) > 3 else 1
            ground = info['ground'][:3]
            worst_behind = [200, 240, 80]  # a lit lime window under the panel
            mixed = [g * alpha + w * (1 - alpha) for g, w in zip(ground, worst_behind, strict=True)]
            for name, colour in (('caveat', info['colour'][:3]), ('quietest statement', info['dim'][:3])):
                a, b = luminance(colour), luminance(mixed)
                ratio = (max(a, b) + 0.05) / (min(a, b) + 0.05)
                check(f'{stop}: the {name} has at least 4.5:1 contrast, even over a lit window', ratio >= 4.5, f'{ratio:.1f}:1')

        a11y = page.evaluate(
            """() => ({
              dt: [...document.querySelectorAll('#results .stats__text')].map((e) => e.textContent.trim()),
              dd: [...document.querySelectorAll('#results dd')].map((e) => e.textContent.trim()),
              hiddenWorld: !!document.querySelector('canvas').closest('[aria-hidden=true]'),
              anyHidden: [...document.querySelectorAll('#results dd, #results dt')].some((e) => {
                const s = getComputedStyle(e); return s.display === 'none' || s.visibility === 'hidden' || e.closest('[aria-hidden=true]'); }),
              heading: document.querySelector('#results-title').textContent,
            })"""
        )
        check('a screen reader gets all three numbers', a11y['dt'] == ['14/16', '2/2', '0'], str(a11y['dt']))
        check('and all three statements, whichever is forward', len(a11y['dd']) == 3 and not a11y['anyHidden'])
        check('the world stays hidden from assistive technology', a11y['hiddenWorld'])
        ctx.close()

        # --- reduced motion --------------------------------------------------------------------
        ctx, page, errors = open_page(reduced_motion='reduce')
        s = page.evaluate('__world.skyline()')
        check('reduced motion: nothing stands before the beat', s['stage'] == 0)
        positions = []
        for stop, share in STOPS.items():
            scroll_to_stop(page, share)
            frames(page, 4)
            s = page.evaluate('__world.skyline()')
            positions.append(page.evaluate('__world.inspect().camera'))
            if stop == 'verified':
                check('reduced motion: the first number is there at once, with no counting', s['verified'] and s['verified']['shown'] == 14 and s['verified']['reveal'] == 1, str(s['verified']))
                check('reduced motion: its towers are lit at once', s['lime'] == 14 and s['front'] == 14, str(s['front']))
            if stop == 'merged':
                check('reduced motion: all of it is there at the last stop', s['lime'] == 14 and s['amber'] == 2 and s['merged']['reveal'] == 1 and s['person']['shown'] == s['person']['of'])
            if args.shots:
                page.screenshot(path=f'{args.shots}/results-still-{stop}.png', timeout=180000)
        check('reduced motion: a still frame for each stop', len({tuple(c) for c in positions}) == 3, str(positions))
        a = page.evaluate('__world.inspect().camera')
        page.evaluate("window.scrollBy(0, 40)")
        frames(page, 3)
        check('reduced motion: the camera does not travel with the scroll', a == page.evaluate('__world.inspect().camera'))
        check('reduced motion: no script errors', not errors, '; '.join(errors)[:200])
        ctx.close()

        # --- without WebGL: the numbers, drawn in the page, and the caveat, in the page flow -----
        ctx = browser.new_context(viewport={'width': width, 'height': height})
        ctx.add_init_script("HTMLCanvasElement.prototype.getContext = () => null")
        page = ctx.new_page()
        page.goto(f'{args.base}?test', wait_until='networkidle')
        page.wait_for_timeout(800)
        off = page.evaluate(
            """() => { const box = (q) => document.querySelector(q).getBoundingClientRect().height > 0;
               return { experience: document.documentElement.dataset.experience, number: box('.calm-results__lead dt'),
                        matrix: box('.calm-matrix'), caveat: box('.calm-results__caveat') }; }"""
        )
        check('without WebGL: the calm page, with all its numbers and the caveat', off['experience'] == 'light' and off['number'] and off['matrix'] and off['caveat'], str(off))
        ctx.close()
        browser.close()

    print(f'\n{sum(results)}/{len(results)} checks passed')
    return 0 if all(results) else 1


if __name__ == '__main__':
    sys.exit(main())
