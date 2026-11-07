"""The facade display system, checked in a real browser (Phase 2).

    python tests/display.py [--base URL] [--flags=FLAG,FLAG] [--text SANDBOX] [--shots DIR]

  1. The font and the label rules (display-font.ts), run in the page.
  2. The system's state: a claimed slot holds the bitmap, the ripple moves with `to` and `set`, it
     is instant with reduced motion, and a ninth display is refused.
  3. Legibility, the real test: at the camera pose of each beat, `world.testDisplay` puts the word on
     the tower in view it reads best on; the screenshot is read back at the centre of every pixel and
     compared with the bitmap. Reported with the depth of field off (the shader alone) and on.
  4. Colour: neutral reads white, sealed lime, open orange, amber amber.
  5. No speckle: a second frame of the same view decodes to exactly the same pixels.

Needs the dev server up. The scene is drawn at the real size (1440x900), so on a machine without a
GPU this takes a few minutes. Exits 1 if any check fails.
"""
import argparse
import io
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

GPU = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--headless=new']
# where the beats' cameras are, as shares of the page's scroll: the end of the descent, the pick,
# the failing test, the sandbox, the gates seen from the side, and the merge
# each beat's pose, as a share of its own section's height from the section's top: the moments these
# were chosen at, kept wherever the page around them grows or shrinks
POSES = [
    ('backlog', ('#backlog', -0.06)),
    ('pick', ('#pick', 0.317)),
    ('test', ('#reproduce', 0.391)),
    ('sandbox', ('#sandbox', 0.208)),
    ('gates', ('#gates', 0.492)),
    ('merge', ('#merge', 0.131)),
]
results = []


def check(name, ok, detail=''):
    results.append(ok)
    print(('PASS ' if ok else 'FAIL ') + name + (f'  ({detail})' if detail else ''))


def luminance(px):
    return 0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2]


def sample(img, x, y, scale, radius=1):
    """The mean colour of the patch (3 by 3, or one pixel) at a point in CSS pixels."""
    cx, cy = int(round(x * scale)), int(round(y * scale))
    out = []
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if 0 <= cx + dx < img.width and 0 <= cy + dy < img.height:
                out.append(img.getpixel((cx + dx, cy + dy))[:3])
    if not out:
        return (0.0, 0.0, 0.0)
    return tuple(sum(c[i] for c in out) / len(out) for i in range(3))


def decode(img, info, scale):
    """Reads the bitmap back off a screenshot, over the pixels in plain sight: the share that agree,
    the contrast between lit and dark, and the mean colour of the lit ones."""
    keep = [i for i, v in enumerate(info['visible']) if v]
    cols = info['cols']
    spacing = ((info['cells'][0][0] - info['cells'][cols][0]) ** 2 + (info['cells'][0][1] - info['cells'][cols][1]) ** 2) ** 0.5
    radius = 1 if spacing * scale >= 6 else 0  # a small pixel is read at its centre, not blended with its neighbours
    pixels = [sample(img, *info['cells'][i], scale, radius) for i in keep]
    bits = [info['bits'][i] for i in keep]
    on = [luminance(p) for p, b in zip(pixels, bits, strict=True) if b]
    off = [luminance(p) for p, b in zip(pixels, bits, strict=True) if not b]
    if not on or not off:
        return 0.0, 0.0, (0, 0, 0)
    cut = (sum(on) / len(on) + sum(off) / len(off)) / 2
    read = [1 if luminance(p) > cut else 0 for p in pixels]
    agree = sum(1 for r, b in zip(read, bits, strict=True) if r == b) / len(bits)
    lit = [p for p, b in zip(pixels, bits, strict=True) if b]
    mean = tuple(sum(p[i] for p in lit) / len(lit) for i in range(3))
    return agree, sum(on) / len(on) - sum(off) / len(off), mean


def settle(page, frames=3):
    page.evaluate(
        'new Promise(r => { let n = 0; const f = () => (++n < %d ? requestAnimationFrame(f) : r()); requestAnimationFrame(f) })'
        % (frames + 1)
    )


def scroll_share(page, pose):
    """Scrolls to a pose: a share of a section's height, from its top."""
    selector, share = pose
    page.evaluate(
        f"""(() => {{ const s = document.querySelector('{selector}');
           scrollTo(0, s.getBoundingClientRect().top + scrollY + s.offsetHeight * {share}); }})()"""
    )
    page.wait_for_timeout(1500)  # the camera glides to a new building; let it arrive
    settle(page, 6)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://127.0.0.1:5173/')
    ap.add_argument('--flags', help='comma-separated Chromium flags, replacing the default GPU set')
    ap.add_argument('--text', default='SANDBOX')
    ap.add_argument('--shots', help='save the screenshots in this folder')
    ap.add_argument('--min-agree', type=float, default=0.95)
    ap.add_argument('--passes', default='flat,dof,colour', help='which to run: flat, dof, colour (the font and state checks always run)')
    ap.add_argument('--poses', help='comma-separated beats to test (default all)')
    args = ap.parse_args()
    flags = args.flags.split(',') if args.flags else GPU

    with sync_playwright() as p:
        browser = p.chromium.launch(args=flags)

        def open_page(query, **options):
            ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, **options)
            ctx.add_init_script("Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })")
            page = ctx.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('console', lambda m: m.type == 'error' and errors.append(m.text[:200]))
            page.goto(f'{args.base}?test&sway=off{query}', wait_until='networkidle')
            page.wait_for_timeout(1200)
            # read the world alone: the page's text panels sit over it, and would be read as pixels
            page.add_style_tag(content='body * { visibility: hidden !important } canvas { visibility: visible !important }')
            return ctx, page, errors

        # 1. the font and the label rules
        ctx, page, errors = open_page('&dof=off')
        check('the world is running at the high tier', page.evaluate('document.documentElement.dataset.world') == 'live')
        font = page.evaluate(
            """async () => {
              const { renderText, sanitiseLabel } = await import('/src/world/display-font.ts');
              const all = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,-'!?&/:+#()";
              const sound = [...all].every((c) => {
                const row = renderText(c); const stack = renderText(c, { layout: 'stack' });
                return row.rows === 5 && row.data.length === row.cols * row.rows && stack.cols === row.cols;
              });
              const word = renderText('SANDBOX');
              const tall = renderText('SANDBOX', { layout: 'stack' });
              const big = renderText('14', { scale: 2 });
              return {
                sound,
                word: [word.cols, word.rows], tall: [tall.cols, tall.rows], big: [big.cols, big.rows],
                a: sanitiseLabel('  acmé  corp!! <b>', 14),
                b: sanitiseLabel('x'.repeat(30), 14),
                c: sanitiseLabel('', 14),
                d: sanitiseLabel('<script>alert(1)</script>', 40),
                e: sanitiseLabel('日本語 ok', 14),
              };
            }"""
        )
        check('every glyph draws five rows tall and stacks to the same width', font['sound'])
        check('a word is a row of pixels: SANDBOX is 28 by 5', font['word'] == [28, 5], str(font['word']))
        check('stacked, it is 4 wide (an N is four) and 41 tall', font['tall'] == [4, 41], str(font['tall']))
        check('a numeral scales by whole pixels: 14 at 2x is 14 by 10', font['big'] == [14, 10], str(font['big']))
        check('typed text is made upper case, plain, with single spaces', font['a'] == 'ACME CORP!! B', font['a'])
        check('typed text is capped at 14 characters', len(font['b']) == 14, font['b'])
        check('an empty label stays empty', font['c'] == '')
        check('markup characters are dropped, not drawn', font['d'] == 'SCRIPTALERT(1)/SCRIPT', font['d'])
        check('letters the font does not have are dropped', font['e'] == 'OK', font['e'])

        # 2. the system's state
        state = page.evaluate(
            """() => {
              const d = __world.displays;
              const first = d.claim();
              const taken = [first];
              for (let i = 1; i < 8; i += 1) taken.push(d.claim());
              const ninth = d.claim();
              taken.forEach((h) => h && h.release());
              return { all: taken.every(Boolean), ninth: ninth === null };
            }"""
        )
        check('eight displays can be claimed', state['all'])
        check('a ninth is refused until one is released', state['ninth'])
        ripple = page.evaluate(
            """async () => {
              const { renderText } = await import('/src/world/display-font.ts');
              const d = __world.displays;
              const h = d.claim();
              const b = renderText('AB');
              h.place({ building: 0, tier: 0, face: 3, u: 1, y: 3, pitch: 1 });
              h.setBitmap(b);
              const held = d.inspect()[0];
              h.to(1, 1);
              d.update(0.25);
              const quarter = h.reveal;
              d.update(0.5);
              const threeQuarters = h.reveal;
              h.to(0, 0.5);
              d.update(0.25);
              const back = h.reveal;
              h.set(0.4);
              const direct = h.reveal;
              h.to(1, 0);
              const instant = h.reveal;
              let refused = false;
              try { h.setBitmap({ cols: 129, rows: 1, data: new Uint8Array(129) }); } catch { refused = true; }
              const lit = b.data.reduce((s, v) => s + v, 0);
              h.release();
              return { held, quarter, threeQuarters, back, direct, instant, refused, lit, after: d.inspect().length };
            }"""
        )
        check('the bitmap lands in the atlas intact', ripple['held']['atlasLit'] == ripple['lit'] == ripple['held']['lit'])
        check('the ripple plays on over its time', abs(ripple['quarter'] - 0.25) < 1e-6 and abs(ripple['threeQuarters'] - 0.75) < 1e-6)
        check('and plays off again', abs(ripple['back'] - 0.25) < 1e-6, f"{ripple['back']:.2f}")
        check('it can be set directly, for the scroll to drive', abs(ripple['direct'] - 0.4) < 1e-6)
        check('zero seconds is instant', ripple['instant'] == 1)
        check('a bitmap too big for a slot is refused', ripple['refused'])
        check('a released slot is empty', ripple['after'] == 0)
        ctx.close()

        # reduced motion: no ripple, the change is instant
        ctx, page, errors = open_page('&dof=off', reduced_motion='reduce')
        still = page.evaluate(
            """() => { const h = __world.displays.claim(); h.to(1, 5); const r = h.reveal; h.to(0, 5); const z = h.reveal; h.release(); return [r, z]; }"""
        )
        check('reduced motion: the windows come on at once', still == [1, 0], str(still))
        ctx.close()

        # 3. legibility at the beats, with the depth of field off and on
        passes = args.passes.split(',')
        poses = [pose for pose in POSES if not args.poses or pose[0] in args.poses.split(',')]
        for label, query, name in (('shader alone', '&dof=off', 'flat'), ('with depth of field', '', 'dof')):
            if name not in passes:
                continue
            ctx, page, errors = open_page(query)
            tested = 0
            for beat, share in poses:
                scroll_share(page, share)
                word, info = args.text, None
                for word in (args.text, 'TEST'):
                    info = page.evaluate(f'__world.testDisplay("{word}", "neutral")')
                    if info:
                        break
                if not info:
                    # close in, among the street's low buildings, no tower stands in plain sight
                    print(f'SKIP {beat}: no tower in plain sight has room for a word ({label})')
                    continue
                tested += 1
                settle(page)
                img = Image.open(io.BytesIO(page.screenshot(timeout=180000))).convert('RGB')
                agree, contrast, _ = decode(img, info, img.width / 1440)
                if args.shots:
                    img.save(f'{args.shots}/display-{beat}-{"flat" if query else "dof"}.png')
                seen = sum(info['visible'])
                size = (
                    f"{word}: {info['cols']}x{info['rows']} {info['layout']}, pitch {info['pitch']:.2f}, "
                    f"{info['distance']:.0f} units away, {seen} of {len(info['visible'])} pixels in sight"
                )
                need = args.min_agree if query else 0.85
                check(
                    f'{beat}: the word reads back ({label})',
                    agree >= need and contrast > 40,
                    f'{agree * 100:.1f}% of pixels agree, contrast {contrast:.0f}; {size}',
                )
                if query:
                    # 5. no speckle: the same view a moment later decodes to the same pixels
                    page.wait_for_timeout(500)
                    settle(page)
                    again = Image.open(io.BytesIO(page.screenshot(timeout=180000))).convert('RGB')
                    agree2, _, _ = decode(again, info, again.width / 1440)
                    check(f'{beat}: no speckle, a second frame reads the same', abs(agree2 - agree) < 0.01, f'{agree2 * 100:.1f}%')
            check(f'a word could be tested at four of the six beats ({label})', tested >= min(4, len(poses)), f'{tested} of {len(poses)}')
            ctx.close()

        # 4. colour
        ctx, page, errors = open_page('&dof=off')
        scroll_share(page, dict(POSES)['sandbox'])
        expected = {
            'neutral': lambda c: max(c) - min(c) < 0.25 * max(c) and max(c) > 150,
            'sealed': lambda c: c[1] > c[0] * 1.15 and c[1] > c[2] * 1.8,
            'open': lambda c: c[0] > c[1] * 1.3 and c[1] > c[2] * 1.3,
            'amber': lambda c: c[0] > c[2] * 2 and c[1] > c[2] * 1.5 and abs(c[0] - c[1]) < 0.55 * c[0],
        }
        for tone, ok in expected.items() if 'colour' in passes else []:
                info = page.evaluate(f'__world.testDisplay("{args.text}", "{tone}")')
                settle(page)
                img = Image.open(io.BytesIO(page.screenshot(timeout=180000))).convert('RGB')
                _, _, mean = decode(img, info, img.width / 1440) if info else (0, 0, (0, 0, 0))
                check(f'the {tone} tone reads as {tone}', bool(info) and ok(mean), 'rgb ' + ','.join(f'{c:.0f}' for c in mean))
        check('no script errors', not errors, '; '.join(errors)[:200])
        ctx.close()
        browser.close()

    print(f'\n{sum(results)}/{len(results)} checks passed')
    return 0 if all(results) else 1


if __name__ == '__main__':
    sys.exit(main())
