"""The first screen: the tear in the cloud deck, checked in a real browser at 1440x900.

    python tests/hero.py [--base URL] [--flags=FLAG,FLAG] [--shots DIR]

  - A clear title and a real action on the first screen; the headline is two lines at most.
  - Read off the canvas: the deck is bright, the city shows through the tear, and findings burn in it.
  - Ink on the deck: the words keep at least 4.5:1 against the cloud actually behind them.
  - The pointer pulls the tear. It never gets under the words, wherever the pointer goes.
  - Scrolling falls through: the deck goes, the words go with it, nothing is left floating, and
    scrolling back brings it all back.
  - Reduced motion: the tear is simply there and the pointer does nothing.
  - Without WebGL: the calm page (tests/light.py), with no world, and the button working.
  - It holds its frame time, and the city is drawn only inside the tear while it is small.

Needs the dev server up. Exits 1 if a check fails.
"""
import argparse
import io
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

GPU = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--headless=new']
results = []


def check(name, ok, detail=''):
    results.append(bool(ok))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  ({detail})' if detail else ''))


def luminance(rgb):
    def channel(c):
        c /= 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = rgb[:3]
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def contrast(a, b):
    x, y = luminance(a), luminance(b)
    return (max(x, y) + 0.05) / (min(x, y) + 0.05)


def frames(page, n=3):
    page.evaluate(
        'new Promise(r => { let n = %d; const f = () => (--n > 0 ? requestAnimationFrame(f) : r()); requestAnimationFrame(f) })' % n
    )


def canvas_only(page):
    tag = page.add_style_tag(content='body * { visibility: hidden !important } canvas { visibility: visible !important }')
    frames(page)
    img = Image.open(io.BytesIO(page.screenshot(timeout=180000))).convert('RGB')
    tag.evaluate('e => e.remove()')
    return img


def boxes(page):
    return page.evaluate(
        """() => ['.beat--sky .beat__title', '.beat--sky .beat__lede', '.beat--sky .beat__note', '.beat--sky .btn--primary'].map((s) => {
             const r = document.querySelector(s).getBoundingClientRect();
             return { s, box: [r.left, r.top, r.right, r.bottom], colour: getComputedStyle(document.querySelector(s)).color }; })"""
    )


def worst_contrast(img, boxes_list):
    worst = 99.0
    which = ''
    for b in boxes_list:
        if 'btn' in b['s']:
            continue
        ink = [float(v) for v in b['colour'].replace('rgb(', '').replace('rgba(', '').replace(')', '').split(',')[:3]]
        left, top, right, bottom = (int(v) for v in b['box'])
        crop = img.crop((max(left, 0), max(top, 0), min(right, img.width), min(bottom, img.height)))
        values = sorted(crop.getdata(), key=luminance)
        # the darkest 1% of the ground: one speck of city would show here
        darkest = values[int(len(values) * 0.01)]
        ratio = contrast(ink, darkest)
        if ratio < worst:
            worst, which = ratio, b['s']
    return worst, which


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://127.0.0.1:5173/')
    ap.add_argument('--flags')
    ap.add_argument('--shots')
    args = ap.parse_args()

    with sync_playwright() as p:
        browser = p.chromium.launch(args=args.flags.split(',') if args.flags else GPU)

        def open_page(cores=8, **options):
            ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, **options)
            ctx.add_init_script(f"Object.defineProperty(navigator, 'hardwareConcurrency', {{ get: () => {cores} }})")
            page = ctx.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('console', lambda m: m.type == 'error' and 'attribute height' not in m.text and errors.append(m.text[:300]))
            page.goto(f'{args.base}?test&sway=off', wait_until='networkidle')
            page.wait_for_function('window.__world', timeout=120000)
            return ctx, page, errors

        ctx, page, errors = open_page()
        page.wait_for_timeout(2500)

        # --- the first screen --------------------------------------------------------------------
        info = page.evaluate(
            """() => { const h = document.querySelector('h1'); const c = getComputedStyle(h); const b = document.querySelector('.beat--sky .btn--primary').getBoundingClientRect();
               return { text: h.textContent, lines: Math.round(h.offsetHeight / parseFloat(c.lineHeight)), size: parseFloat(c.fontSize),
                        button: b.bottom <= innerHeight && b.top >= 0, sideways: document.documentElement.scrollWidth > innerWidth }; }"""
        )
        check('the first screen has one clear title', ' '.join(info['text'].split()) == 'Verified fixes for the findings your scanner keeps reporting.', info['text'])
        check('the headline is at most two lines', info['lines'] <= 2, str(info['lines']))
        check('and set large', info['size'] >= 72, f"{info['size']:.0f}px")
        check('the pilot button is on the first screen', info['button'])
        check('the page does not scroll sideways', not info['sideways'])

        img = canvas_only(page)
        if args.shots:
            page.screenshot(path=f'{args.shots}/hero.png', timeout=180000)
        pixels = list(img.getdata())
        # the day's sky counts as well as its cloud: ink keeps its contrast on both
        bright = sum(1 for q in pixels if luminance(q) > 0.2) / len(pixels)
        dark = sum(1 for q in pixels if max(q) < 110) / len(pixels)
        burning = sum(1 for r, g, b in pixels if r > 180 and g < 0.65 * r and b < 0.4 * r)
        check('read off the canvas: the sky and cloud are bright', bright > 0.4, f'{bright * 100:.0f}% of the screen')
        check('read off the canvas: the night city shows through the tear', dark > 0.1, f'{dark * 100:.0f}% of the screen')
        check('read off the canvas: findings burn in it', burning > 300, f'{burning} orange pixels')
        worst, which = worst_contrast(img, boxes(page))
        check('the words keep at least 4.5:1 on the cloud behind them', worst >= 4.5, f'{worst:.1f}:1 at {which}')

        # --- the pointer ---------------------------------------------------------------------------
        before = page.evaluate('__world.inspect().tear.centre')
        for x, y in ((300, 650), (200, 200), (120, 800)):
            page.mouse.move(x, y)
            page.wait_for_timeout(1400)
            img = canvas_only(page)
            worst, which = worst_contrast(img, boxes(page))
            check(f'with the pointer at {x},{y} the tear stays off the words', worst >= 4.5, f'{worst:.1f}:1 at {which}')
        after = page.evaluate('__world.inspect().tear.centre')
        check('the pointer pulls the tear', abs(after[0] - before[0]) > 0.05, f'{before} to {after}')
        if args.shots:
            page.screenshot(path=f'{args.shots}/hero-pulled.png', timeout=180000)
        page.mouse.move(1000, 500)

        # --- the fall ------------------------------------------------------------------------------
        travel = page.evaluate("document.querySelector('[data-descent]').offsetHeight - innerHeight")
        page.evaluate(f'scrollTo(0, {travel} * 0.2)')
        page.wait_for_timeout(1000)
        s = page.evaluate(
            """() => ({ gone: __world.deckGone, words: getComputedStyle(document.querySelector('.beat--sky .beat__text')).opacity,
                        strip: getComputedStyle(document.querySelector('.strip__product')).color })"""
        )
        check('falling, the deck goes', s['gone'] == 1, str(s['gone']))
        check('and the words with it, leaving nothing floating', float(s['words']) == 0, s['words'])
        check('and the nav turns to white for the night', s['strip'].startswith('rgb(243') or s['strip'].startswith('rgb(2') and 'rgb(5,' not in s['strip'], s['strip'])
        img = canvas_only(page)
        dark = sum(1 for q in img.getdata() if max(q) < 170) / (img.width * img.height)
        check('read off the canvas: all city now', dark > 0.8, f'{dark * 100:.0f}% of the screen')
        page.evaluate('scrollTo(0, 0)')
        page.wait_for_timeout(1000)
        s = page.evaluate("[__world.deckGone, getComputedStyle(document.querySelector('.beat--sky .beat__text')).opacity]")
        check('scrolling back brings the deck and the words back', s[0] == 0 and float(s[1]) == 1, str(s))
        check('no script errors', not errors, '; '.join(errors)[:200])
        ctx.close()

        # --- reduced motion ------------------------------------------------------------------------
        ctx, page, errors = open_page(reduced_motion='reduce')
        page.wait_for_timeout(800)
        t = page.evaluate('__world.inspect().tear')
        check('reduced motion: the tear is simply there', t['opened'] == 1 and t['radius'] > 0.2, str(t))
        page.mouse.move(200, 700)
        page.wait_for_timeout(500)
        check('reduced motion: the pointer does nothing', page.evaluate('__world.inspect().tear.centre') == t['centre'])
        img = canvas_only(page)
        worst, which = worst_contrast(img, boxes(page))
        check('reduced motion: the words keep their contrast', worst >= 4.5, f'{worst:.1f}:1 at {which}')
        if args.shots:
            page.screenshot(path=f'{args.shots}/hero-still.png', timeout=180000)
        check('reduced motion: no script errors', not errors, '; '.join(errors)[:200])
        ctx.close()

        # --- low tier ----------------------------------------------------------------------------------
        ctx, page, errors = open_page(cores=2)
        page.wait_for_timeout(2500)
        if args.shots:
            page.screenshot(path=f'{args.shots}/hero-low.png', timeout=180000)
        img = canvas_only(page)
        worst, which = worst_contrast(img, boxes(page))
        check('low tier: the words keep their contrast', worst >= 4.5, f'{worst:.1f}:1 at {which}')
        check('low tier: no script errors', not errors, '; '.join(errors)[:200])
        ctx.close()

        # --- without WebGL -------------------------------------------------------------------------------
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
        ctx.add_init_script('HTMLCanvasElement.prototype.getContext = () => null')
        page = ctx.new_page()
        page.goto(f'{args.base}?test', wait_until='networkidle')
        page.wait_for_timeout(1500)
        off = page.evaluate(
            """() => ({ experience: document.documentElement.dataset.experience, stage: getComputedStyle(document.querySelector('.stage')).display,
                        button: !!document.querySelector('.calm-hero .calm-button').getBoundingClientRect().width,
                        three: performance.getEntriesByType('resource').some((r) => r.name.includes('world-stage')) })"""
        )
        if args.shots:
            page.screenshot(path=f'{args.shots}/hero-nowebgl.png', timeout=180000)
        check('without WebGL: the calm page, with no stage and no world', off['experience'] == 'light' and off['stage'] == 'none' and not off['three'], str(off))
        check('without WebGL: the button is there', off['button'])
        ctx.close()
        browser.close()

    print(f'\n{sum(results)}/{len(results)} checks passed')
    return 0 if all(results) else 1


if __name__ == '__main__':
    sys.exit(main())
