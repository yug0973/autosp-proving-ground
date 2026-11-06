"""Captures the facade display for the record (Phase 2): a ripple sequence and one frame a tone.

    python tests/display-frames.py OUTPUT_DIR [--base URL] [--flags=FLAG,FLAG] [--size 1440x900]

At the camera pose of the end of the descent the word goes up in a neutral tone and the ripple is
stepped from 0 to 1; then each tone is shown in turn. The page's text is hidden, so only the world
is in the frames. Needs the dev server up.
"""
import argparse
import sys

from playwright.sync_api import sync_playwright

GPU = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--headless=new']
STEPS = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0]
TONES = ['neutral', 'sealed', 'open', 'amber']


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--base', default='http://127.0.0.1:5173/')
    ap.add_argument('--flags')
    ap.add_argument('--size', default='1440x900')
    ap.add_argument('--text', default='SANDBOX')
    args = ap.parse_args()
    width, height = (int(n) for n in args.size.split('x'))
    with sync_playwright() as p:
        browser = p.chromium.launch(args=args.flags.split(',') if args.flags else GPU)
        ctx = browser.new_context(viewport={'width': width, 'height': height})
        ctx.add_init_script("Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })")
        page = ctx.new_page()
        page.goto(f'{args.base}?test&sway=off&dof=off', wait_until='networkidle')
        page.wait_for_timeout(1200)
        page.add_style_tag(content='body * { visibility: hidden !important } canvas { visibility: visible !important }')
        page.evaluate("scrollTo(0, (document.querySelector('#results').getBoundingClientRect().top + scrollY + 700) * 0.19)")
        page.wait_for_timeout(1500)
        info = page.evaluate(f'(() => {{ const r = __world.testDisplay("{args.text}", "neutral"); return r && r.cells.length }})()')
        if not info:
            print('no tower in view has room for the word')
            return 1
        frame = lambda: page.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))))')
        for step in STEPS:
            page.evaluate(f'__world.testReveal({step})')
            frame()
            page.screenshot(path=f'{args.out}/ripple-{int(step * 100):03d}.png', timeout=180000)
            print(f'ripple {step}')
        for tone in TONES:
            page.evaluate(f'__world.testDisplay("{args.text}", "{tone}")')
            frame()
            page.screenshot(path=f'{args.out}/tone-{tone}.png', timeout=180000)
            print(f'tone {tone}')
        browser.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
