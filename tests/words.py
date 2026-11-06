"""The beat keywords spelled by the city (Phase 3), checked in a real browser.

    python tests/words.py [--base URL] [--flags=FLAG,FLAG] [--shots DIR] [--beats a,b,c]

For each beat the page is scrolled to the middle of its section and left until its word has
rippled on. Then:
  - the word is read back off the canvas alone (the page's text hidden), pixel by pixel over those
    in plain sight, and compared with the bitmap;
  - each word's pixels are big enough on screen to read (--min-pixel CSS pixels);
  - a screenshot with the whole page is saved, to judge the word against the real layout.
Also: the word clears when the beat is left, appears at once with reduced motion, and the world's
canvas is hidden from assistive technology (the real headline stays in the page).

Needs the dev server up. Exits 1 if a check fails. A beat whose camera has no tower in plain sight
that the word fits on has no word, and is reported (SKIP); at least --min-words beats must have one.
"""
import argparse
import io
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

GPU = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--headless=new']
BEATS = [
    ('backlog', '#backlog'),
    ('test', '#reproduce'),
    ('sandbox', '#sandbox'),
    ('gates', '#gates'),
    ('merge', '#merge'),
    ('record', '#record'),
    ('results', '#results'),
]
results = []


def check(name, ok, detail=''):
    results.append(ok)
    print(('PASS ' if ok else 'FAIL ') + name + (f'  ({detail})' if detail else ''))


def luminance(px):
    return 0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2]


def sample(img, x, y, scale, radius):
    cx, cy = int(round(x * scale)), int(round(y * scale))
    out = [
        img.getpixel((cx + dx, cy + dy))[:3]
        for dy in range(-radius, radius + 1)
        for dx in range(-radius, radius + 1)
        if 0 <= cx + dx < img.width and 0 <= cy + dy < img.height
    ]
    return tuple(sum(c[i] for c in out) / len(out) for i in range(3)) if out else (0.0, 0.0, 0.0)


def spacing(info):
    c = info['cells']
    return ((c[0][0] - c[info['cols']][0]) ** 2 + (c[0][1] - c[info['cols']][1]) ** 2) ** 0.5


def decode(img, info, scale):
    keep = [i for i, v in enumerate(info['visible']) if v]
    radius = 1 if spacing(info) * scale >= 6 else 0
    pixels = [sample(img, *info['cells'][i], scale, radius) for i in keep]
    bits = [info['bits'][i] for i in keep]
    on = [luminance(p) for p, b in zip(pixels, bits, strict=True) if b]
    off = [luminance(p) for p, b in zip(pixels, bits, strict=True) if not b]
    if not on or not off:
        return 0.0, 0.0
    cut = (sum(on) / len(on) + sum(off) / len(off)) / 2
    read = [1 if luminance(p) > cut else 0 for p in pixels]
    return sum(1 for r, b in zip(read, bits, strict=True) if r == b) / len(bits), sum(on) / len(on) - sum(off) / len(off)


def frames(page, n=3):
    page.evaluate(
        'new Promise(r => { let k = 0; const f = () => (++k < %d ? requestAnimationFrame(f) : r()); requestAnimationFrame(f) })' % (n + 1)
    )


def scroll_to_middle(page, selector):
    """Scrolls so the section is at the middle of the screen. The chapters (record, results) have no
    pinned part to travel through, so the section's top is put a fifth of the way down instead. The
    results' word stands by their first stop, a quarter of the way along the flight."""
    share = 0.25 if selector == '#results' else 0.5
    page.evaluate(
        f"""(() => {{
          const s = document.querySelector('{selector}');
          const top = s.getBoundingClientRect().top + scrollY;
          const pinned = s.offsetHeight - innerHeight > innerHeight * 0.5;
          scrollTo(0, pinned ? top + (s.offsetHeight - innerHeight) * {share} : top - innerHeight * 0.2);
        }})()"""
    )


def wait_for_word(page, seconds):
    """Waits until the word has been planned and has rippled fully on, or planning ends with none."""
    for _ in range(seconds):
        page.wait_for_timeout(1000)
        s = page.evaluate('(() => { const i = __world.words.inspect(); return [i.shown, i.reveal ?? 0, i.planning] })()')
        if s[0] and s[1] >= 0.999:
            return True
        if not s[0] and not s[2]:
            page.wait_for_timeout(1500)
            s = page.evaluate('(() => { const i = __world.words.inspect(); return [i.shown, i.planning] })()')
            if not s[0] and not s[1]:
                return False
    return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://127.0.0.1:5173/')
    ap.add_argument('--flags')
    ap.add_argument('--shots')
    ap.add_argument('--beats')
    ap.add_argument('--min-agree', type=float, default=0.85, help='0.85 with the depth of field on, as in display.py')
    ap.add_argument('--min-pixel', type=float, default=4.0)
    ap.add_argument('--min-words', type=int, default=5)
    args = ap.parse_args()
    beats = [b for b in BEATS if not args.beats or b[0] in args.beats.split(',')]

    with sync_playwright() as p:
        browser = p.chromium.launch(args=args.flags.split(',') if args.flags else GPU)

        def open_page(**options):
            ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, **options)
            ctx.add_init_script("Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })")
            page = ctx.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('console', lambda m: m.type == 'error' and errors.append(m.text[:200]))
            page.goto(f'{args.base}?test&sway=off', wait_until='networkidle')
            page.wait_for_function("['live', 'still'].includes(document.documentElement.dataset.world)", timeout=120000)
            page.wait_for_timeout(800)
            return ctx, page, errors

        ctx, page, errors = open_page()
        check('the world is running', page.evaluate('document.documentElement.dataset.world') == 'live')
        hidden = page.evaluate('(() => { const c = document.querySelector("canvas"); return !!c && !!c.closest("[aria-hidden=true]") })()')
        check('the world canvas is hidden from assistive technology', hidden)

        found = 0
        for beat, selector in beats:
            scroll_to_middle(page, selector)
            ok = wait_for_word(page, 120)
            if not ok:
                print(f'SKIP {beat}: no tower in plain sight from this beat\'s camera has room for its word')
                continue
            frames(page)
            info = page.evaluate('__world.words.inspect()')
            if 'visible' not in info:
                # the beat can flicker at the end of the page; give it one more go
                wait_for_word(page, 60)
                info = page.evaluate('__world.words.inspect()')
            if 'visible' not in info:
                print(f'SKIP {beat}: the word had cleared before it could be read')
                continue
            found += 1
            if args.shots:
                page.screenshot(path=f'{args.shots}/word-{beat}-page.png', timeout=180000)
            page.add_style_tag(content='body * { visibility: hidden !important } canvas { visibility: visible !important }')
            frames(page)
            img = Image.open(io.BytesIO(page.screenshot(timeout=180000))).convert('RGB')
            page.evaluate('document.head.lastElementChild.remove()')
            agree, contrast = decode(img, info, img.width / 1440)
            if args.shots:
                img.save(f'{args.shots}/word-{beat}-world.png')
            px = spacing(info)
            detail = (
                f"{info['text']}: {info['cols']}x{info['rows']} {info['layout']}, {info['distance']:.0f} units away, "
                f"{px:.1f} px a pixel, {sum(info['visible'])} of {len(info['visible'])} in sight"
            )
            check(f'{beat}: the word reads back off the canvas', agree >= args.min_agree and contrast > 40, f'{agree * 100:.1f}% agree, contrast {contrast:.0f}; {detail}')
            check(f'{beat}: its pixels are big enough to read', px >= args.min_pixel, f'{px:.1f} px')
        check(f'at least {args.min_words} of the {len(beats)} beats have a word', found >= min(args.min_words, len(beats)), f'{found}')

        # the word clears when the beat is left
        page.evaluate('scrollTo(0, 0)')
        gone = False
        for _ in range(60):
            page.wait_for_timeout(1000)
            if page.evaluate('__world.displays.inspect().length') == 0:
                gone = True
                break
        check('the word clears and gives its slot back when the beat is left', gone)
        check('no script errors', not errors, '; '.join(errors)[:200])
        ctx.close()

        # reduced motion: there at once
        ctx, page, errors = open_page(reduced_motion='reduce')
        scroll_to_middle(page, '#sandbox')
        frames(page, 4)
        i = page.evaluate('(() => { const w = __world.words.inspect(); return [w.shown, w.reveal] })()')
        check('reduced motion: the word is on at once, with no ripple', i[0] is True and i[1] == 1, str(i))
        # leaving a beat must not feed itself: a word that clears asks for a frame, and that frame
        # used to clear it again, until the stack ran out, several hundred full frames later
        page.evaluate(
            """(() => { const P = WebGL2RenderingContext.prototype; const f = P.drawElementsInstanced;
               window.__draws = 0; P.drawElementsInstanced = function (...a) { window.__draws += 1; f.apply(this, a); }; })()"""
        )
        for selector in ('#gates', '#merge', '#sandbox'):
            page.evaluate('window.__draws = 0')
            started = page.evaluate('performance.now()')
            scroll_to_middle(page, selector)
            frames(page, 4)
            ms = page.evaluate('performance.now()') - started
            draws = page.evaluate('window.__draws')
            # the city draws a dozen instanced meshes a frame, and a jump needs a handful of frames
            check(f'reduced motion: moving to {selector} draws only a few frames', draws < 300, f'{draws} instanced draws')
            check(f'reduced motion: moving to {selector} does not freeze the page', ms < 2500, f'{ms:.0f} ms')
        check('reduced motion: no script errors', not errors, '; '.join(errors)[:200])
        ctx.close()
        browser.close()

    print(f'\n{sum(results)}/{len(results)} checks passed')
    return 0 if all(results) else 1


if __name__ == '__main__':
    sys.exit(main())
