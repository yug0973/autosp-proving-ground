"""The buildings up close: no speckle while blockers clear, for all three findings a visitor can pick.

    python tests/buildings.py [--base URL] [--before DIR]

  - Part way through the push, the frame has no pixel noise: the share of pixels that stand far from
    their neighbours' median stays small. (The old dissolve was a 2-pixel dither, which scores high.)
  - The fade's second pass is drawn only while pieces are fading, and never once the push has settled.
  - The shaders compile on both tiers, in every variant, with no console errors.
  - Walking back and forth through the beats on the high tier, the WebGL context is never lost. (It
    used to be, about one run in two on an integrated GPU, which turned the whole world off.)

With --before DIR, it also scores the frames tests/close.py saved there, for comparison. Exits 1 if a
check fails.
"""
import argparse
import io
import pathlib
import sys

from PIL import Image, ImageFilter
from playwright.sync_api import sync_playwright

GPU = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--headless=new']
FINDINGS = ['CWE-89', 'CWE-79', 'CWE-639']
# with the depth of field on, and without it (where every window edge counts): the old dither scored
# 1.16% to 1.35% on the high tier
MAX_SPECKLE = {'high': 0.009, 'low': 0.012}
results = []


def check(name, ok, detail=''):
    results.append(bool(ok))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  ({detail})' if detail else ''))


def speckle(img):
    """The share of pixels far from the median of their neighbourhood: single-pixel noise."""
    grey = img.convert('L')
    median = grey.filter(ImageFilter.MedianFilter(3))
    a, b = grey.tobytes(), median.tobytes()
    return sum(1 for x, y in zip(a, b, strict=True) if abs(x - y) > 34) / len(a)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://127.0.0.1:5173/')
    ap.add_argument('--before')
    args = ap.parse_args()
    if args.before:
        for path in sorted(pathlib.Path(args.before).glob('high-CWE-*-20.png')):
            print(f'before, {path.name}: speckle {speckle(Image.open(path).convert("RGB")) * 100:.2f}%')

    with sync_playwright() as p:
        browser = p.chromium.launch(args=GPU)
        for tier, cores in (('high', 8), ('low', 2)):
            ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
            ctx.add_init_script(f"Object.defineProperty(navigator, 'hardwareConcurrency', {{ get: () => {cores} }})")
            page = ctx.new_page()
            errors = []
            page.on('pageerror', lambda e, errors=errors: errors.append(str(e)))
            page.on('console', lambda m, errors=errors: m.type in ('error', 'warning') and 'attribute height' not in m.text and errors.append(m.text[:300]))
            page.goto(f'{args.base}?test&sway=off', wait_until='networkidle')
            page.wait_for_function("document.documentElement.dataset.world === 'live'", timeout=120000)

            def to_push(share):
                page.evaluate(
                    """(f) => { const t = document.querySelector('[data-push]'); const r = t.getBoundingClientRect();
                       scrollTo(0, r.top + scrollY + (t.offsetHeight - innerHeight) * f); }""",
                    share,
                )

            tag = None
            for cwe in FINDINGS:
                page.evaluate(f"document.querySelector('input[value=\"{cwe}\"]').click()")
                worst = 0.0
                for share in (0.12, 0.2, 0.26):
                    to_push(share)
                    page.wait_for_timeout(1500)
                    if tag is None:
                        tag = page.add_style_tag(content='body * { visibility: hidden !important } canvas { visibility: visible !important }')
                    img = Image.open(io.BytesIO(page.screenshot(timeout=180000))).convert('RGB')
                    worst = max(worst, speckle(img))
                check(f'{tier}, {cwe}: no speckle while blockers clear', worst < MAX_SPECKLE[tier], f'worst {worst * 100:.2f}% of pixels')
            to_push(0.9)
            page.wait_for_timeout(1500)
            calls = page.evaluate('__world.inspect().calls')
            if tier == 'low':
                check('low: once the push has settled, no second pass of the city is drawn', calls <= 24, f'{calls} draw calls')
            check(f'{tier}: every variant compiles, with no console errors', not errors, '; '.join(errors)[:240])
            ctx.close()
        browser.close()

        # the context survives a long walk through every beat, a fresh browser each time
        walk = [
            ('[data-reproduce]', 0.4), ('[data-sandbox]', 0.95), ('[data-gates]', 0.95), ('[data-merge]', 0.5),
            ('#results', 0), ('[data-gates]', 0.45), ('#backlog', 0), ('[data-push]', 0.1),
            ('[data-sandbox]', 0.7), ('#record', 0.2), ('#apply', 0),
        ]
        lost = []
        for _ in range(4):
            browser = p.chromium.launch(args=GPU)
            ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
            ctx.add_init_script("Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })")
            ctx.add_init_script(
                """window.__lost = 0; addEventListener('DOMContentLoaded', () => {
                     document.querySelector('canvas')?.addEventListener('webglcontextlost', () => { window.__lost += 1; }); })"""
            )
            page = ctx.new_page()
            page.goto(f'{args.base}?sway=off', wait_until='networkidle')
            page.wait_for_timeout(1500)
            for _ in range(2):
                for selector, share in walk:
                    page.evaluate(
                        """([s, f]) => { const t = document.querySelector(s); const r = t.getBoundingClientRect();
                           scrollTo(0, r.top + scrollY + Math.max(t.offsetHeight - innerHeight, 0) * f); }""",
                        [selector, share],
                    )
                    page.wait_for_timeout(1200)
            lost.append(page.evaluate('window.__lost'))
            browser.close()
        check('walking through every beat, the WebGL context is never lost', not any(lost), f'{lost} in four walks')
    print(f'\n{sum(results)}/{len(results)} checks passed')
    return 0 if all(results) else 1


if __name__ == '__main__':
    sys.exit(main())
