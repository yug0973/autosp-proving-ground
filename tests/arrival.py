"""The arrival handoff from Nexarise (Phase 8), checked in a real browser at 1440x900.

    python tests/arrival.py [--base URL] [--flags=FLAG,FLAG] [--shots DIR]

  - It plays for ?from=nexarise and for a Nexarise referrer, and not for a direct visit, another site
    or a reload of this page.
  - The cloud deck is whole for about a second, then it rips, and ends on the hero's own view.
  - It never delays the headline or the pilot button, which work during it. Scrolling takes over.
  - Once a session. With sessionStorage unavailable the page still renders, with no errors.
  - Reduced motion: no arrival at all.

Needs the dev server up. Saves frames with --shots. Exits 1 if a check fails.
"""
import argparse
import io
import sys
import time

from PIL import Image
from playwright.sync_api import sync_playwright

GPU = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--headless=new']
results = []


def check(name, ok, detail=''):
    results.append(bool(ok))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  ({detail})' if detail else ''))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://127.0.0.1:5173/')
    ap.add_argument('--flags')
    ap.add_argument('--shots')
    args = ap.parse_args()
    base = args.base

    def amount(page):
        return page.evaluate('__world.inspect().arrival')

    with sync_playwright() as p:
        browser = p.chromium.launch(args=args.flags.split(',') if args.flags else GPU)

        def open_page(query='?test', referer=None, init=None, **options):
            ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, **options)
            ctx.add_init_script("Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })")
            if init:
                ctx.add_init_script(init)
            page = ctx.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('console', lambda m: m.type == 'error' and 'attribute height' not in m.text and errors.append(m.text[:200]))
            page.goto(f'{base}{query}', wait_until='commit', referer=referer)
            return ctx, page, errors

        def ready(page):
            page.wait_for_function("['live', 'still', 'off'].includes(document.documentElement.dataset.world) && window.__world", timeout=120000)

        # --- who gets it ------------------------------------------------------------------------
        for label, query, referer, want in (
            ('a direct visit', '?test', None, False),
            ('another site', '?test', 'https://example.com/page', False),
            ('this page reloaded', '?test', base, False),
            ('?from=nexarise', '?test&from=nexarise', None, True),
            ('a Nexarise referrer', '?test', 'https://nexarise-website.vercel.app/', True),
        ):
            ctx, page, errors = open_page(query, referer)
            ready(page)
            seen = amount(page)
            check(f'{label}: {"plays" if want else "does not play"}', (seen > 0) == want, f'arrival {seen}')
            check(f'{label}: no script errors', not errors, '; '.join(errors)[:200])
            ctx.close()

        # the page's own view, to come back to
        ctx, page, errors = open_page('?test&sway=off')
        ready(page)
        page.wait_for_timeout(2500)
        rest = page.evaluate('__world.inspect()')
        ctx.close()

        # --- the arrival itself ------------------------------------------------------------------
        ctx, page, errors = open_page('?test&sway=off&from=nexarise')
        ready(page)
        start = time.perf_counter()
        trace = [(0.0, amount(page))]
        check('it begins on the arrival view', trace[0][1] == 1, str(trace[0][1]))
        page.wait_for_timeout(250)
        held = page.evaluate('__world.inspect().tear')
        check('the cloud deck is whole to begin with', held['radius'] == 0 and held['opened'] == 0, str(held))
        canvas = page.add_style_tag(content='body * { visibility: hidden !important } canvas { visibility: visible !important }')
        page.evaluate('new Promise(requestAnimationFrame)')
        img = Image.open(io.BytesIO(page.screenshot(timeout=180000))).convert('RGB')
        canvas.evaluate('e => e.remove()')
        if args.shots:
            img.save(f'{args.shots}/arrival-world.png')
            page.screenshot(path=f'{args.shots}/arrival-page.png', timeout=180000)
        # the night city is dark in every channel; the sky's blue is bright in its blue, and cloud in all
        light = sum(1 for q in img.getdata() if q[2] > 170) / (img.width * img.height)
        check('read off the canvas: nothing but the bright sky and its cloud', light > 0.97, f'{light * 100:.0f}% of the screen')

        # the headline and button do not wait
        ui = page.evaluate(
            """() => { const b = document.querySelector('.beat--sky .beat__actions a, .beat--sky .beat__actions button');
               const h = document.querySelector('.beat--sky .beat__title'); const r = b.getBoundingClientRect();
               const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
               return { button: b.textContent.trim(), hit: b === hit || b.contains(hit), title: getComputedStyle(h).visibility }; }"""
        )
        check('the headline is there during the arrival', ui['title'] == 'visible')
        check('the pilot button can be clicked during it', ui['hit'], ui['button'])

        while amount(page) == 1 and time.perf_counter() - start < 6:
            page.wait_for_timeout(30)
        hold = time.perf_counter() - start
        check('it holds for about a second', 0.6 <= hold <= 1.8, f'{hold:.2f} s')
        while page.evaluate('__world.inspect().tear.opened') < 1 and time.perf_counter() - start < 10:
            page.wait_for_timeout(50)
        total = time.perf_counter() - start
        check('and rips open soon after', total <= 4, f'{total:.2f} s')
        after = page.evaluate('__world.inspect()')
        check('ending on the hero view, the same camera as ever', after['camera'] == rest['camera'] and after['target'] == rest['target'], f"{after['camera']} vs {rest['camera']}")
        check('with the tear at its full size', after['tear']['radius'] == rest['tear']['radius'], str(after['tear']['radius']))
        check("and the arrival done", after['arrival'] == 0)

        # --- once a session -----------------------------------------------------------------------
        page.goto(f'{base}?test&sway=off&from=nexarise', wait_until='commit')
        ready(page)
        check('it plays once a session: a second visit does not', amount(page) == 0, str(amount(page)))
        check('no script errors', not errors, '; '.join(errors)[:200])
        ctx.close()

        # --- the headline's timing is the same with and without it ---------------------------------
        def first_paint(query):
            ctx, page, _ = open_page(query)
            page.wait_for_selector('.beat--sky .beat__title', state='visible', timeout=30000)
            page.wait_for_selector('.beat--sky .beat__actions a', state='visible', timeout=30000)
            t = page.evaluate('performance.now()')
            ctx.close()
            return t

        plain = sorted(first_paint('?test') for _ in range(3))[1]
        came = sorted(first_paint('?test&from=nexarise') for _ in range(3))[1]
        check('it does not delay the headline or the button', came <= plain + 250, f'{plain:.0f} ms without, {came:.0f} ms with')

        # --- scrolling takes over -------------------------------------------------------------------
        ctx, page, errors = open_page('?test&sway=off&from=nexarise')
        ready(page)
        page.evaluate('scrollTo(0, 900)')
        page.wait_for_timeout(300)
        scrolled = page.evaluate('__world.inspect()')
        check('scrolling during it takes over at once', scrolled['tear']['gone'] > 0, str(scrolled['tear']))
        ctx.close()

        # --- no storage -------------------------------------------------------------------------------
        block = "Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('denied', 'SecurityError'); } })"
        ctx, page, errors = open_page('?test&from=nexarise', init=block)
        ready(page)
        visible = page.evaluate("getComputedStyle(document.querySelector('.beat--sky .beat__title')).visibility")
        check('with storage unavailable the page still renders', visible == 'visible')
        check('with storage unavailable there are no errors', not errors, '; '.join(errors)[:200])
        ctx.close()

        # --- reduced motion ----------------------------------------------------------------------------
        ctx, page, errors = open_page('?test&from=nexarise', reduced_motion='reduce')
        ready(page)
        check('reduced motion: no arrival', amount(page) == 0, str(amount(page)))
        ctx.close()
        browser.close()

    print(f'\n{sum(results)}/{len(results)} checks passed')
    return 0 if all(results) else 1


if __name__ == '__main__':
    sys.exit(main())
