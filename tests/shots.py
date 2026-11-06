"""Before/after screenshots for a phase of work, at fixed page-scroll positions.

Each capture loads its own page: headless Chrome on some machines loses its WebGL context 10 to
30 s into a page, so every shot is taken within a few seconds of loading.

    python tests/shots.py LABEL [--base URL] [--at 0,5,20,40] [--sizes 1440x900,390x844]
                                [--zoom X,Y,W,H] [--scale 2] [--track SELECTOR] [--eval JS]
                                [--suffix NAME] [--hold MS [--then MS]] [--quality high|low]
                                [--flags FLAG,FLAG] [--dsf X]

Writes tests/output/LABEL/<width>x<height>-<percent>[-NAME].png (and -zoom.png with --zoom).
Positions are percentages of the page's whole scroll range, or with --track, of that section's own
scroll range. --eval runs a snippet after loading and before scrolling (to pick a finding, choose
the careless fix, and so on). --hold presses the merge button for that long after settling and
shoots while it is still held; with --then it lets go and shoots that long afterwards.
--quality forces a quality tier (the page picks 'low' on four cores or fewer, whatever the screen);
--flags replaces the default Chromium flags (for a machine without a GPU, use --use-angle=swiftshader,
--use-gl=angle,--enable-unsafe-swiftshader,--ignore-gpu-blocklist,--headless=new); --dsf is the device scale factor, so a small one renders cheaply.
"""
import argparse
import pathlib
import sys

from playwright.sync_api import sync_playwright

GPU = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--headless=new']
OUT = pathlib.Path(__file__).resolve().parent / 'output'


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('label')
    ap.add_argument('--base', default='http://127.0.0.1:5173/')
    ap.add_argument('--at', default='0,5,20,40', help='page scroll positions, in percent')
    ap.add_argument('--sizes', default='1440x900,390x844')
    ap.add_argument('--zoom', help='X,Y,W,H crop (CSS px) also saved at --scale')
    ap.add_argument('--scale', type=float, default=1.0, help='device scale factor')
    ap.add_argument('--settle', type=int, default=2200, help='ms to wait after scrolling')
    ap.add_argument('--no-gpu', action='store_true')
    ap.add_argument('--track', help='scroll within this section instead of the whole page')
    ap.add_argument('--eval', help='JavaScript to run after loading, before scrolling')
    ap.add_argument('--suffix', default='', help='added to each file name')
    ap.add_argument('--hold', type=int, help='ms to hold the merge button before the shot')
    ap.add_argument('--then', type=int, help='let go, then wait this many ms before the shot')
    ap.add_argument('--quality', choices=['high', 'low'], help='force the quality tier')
    ap.add_argument('--flags', help='comma-separated Chromium flags, replacing the default GPU set')
    ap.add_argument('--dsf', type=float, help='device scale factor (default: --scale)')
    args = ap.parse_args()

    folder = OUT / args.label
    folder.mkdir(parents=True, exist_ok=True)
    positions = [float(p) for p in args.at.split(',')]
    sizes = [tuple(int(n) for n in s.split('x')) for s in args.sizes.split(',')]
    zoom = [float(n) for n in args.zoom.split(',')] if args.zoom else None
    failures = 0

    with sync_playwright() as p:
        flags = args.flags.split(',') if args.flags else ([] if args.no_gpu else GPU)
        browser = p.chromium.launch(args=flags)
        for width, height in sizes:
            phone = width < 800
            for percent in positions:
                ctx = browser.new_context(
                    viewport={'width': width, 'height': height},
                    device_scale_factor=args.dsf if args.dsf is not None else args.scale,
                    is_mobile=phone,
                    has_touch=phone,
                )
                if args.quality:
                    # the page reads hardwareConcurrency once, when it picks the tier
                    cores = 8 if args.quality == 'high' else 2
                    ctx.add_init_script(
                        f"Object.defineProperty(navigator, 'hardwareConcurrency', {{ get: () => {cores} }})"
                    )
                page = ctx.new_page()
                errors: list[str] = []
                page.on('pageerror', lambda e, errors=errors: errors.append(str(e)))
                # shader compile failures only reach the console
                page.on('console', lambda m, errors=errors: m.type == 'error' and errors.append(m.text[:160]))
                page.goto(args.base, wait_until='networkidle')
                page.wait_for_timeout(900)
                if args.eval:
                    page.evaluate(args.eval)
                    page.wait_for_timeout(200)
                if args.track:
                    page.evaluate(
                        '''([sel, p]) => { const t = document.querySelector(sel); const travel = t.offsetHeight - innerHeight;
                        const span = travel >= innerHeight * 0.5 ? travel : t.offsetHeight;
                        scrollTo(0, t.offsetTop + span * p / 100); }''',
                        [args.track, percent],
                    )
                else:
                    page.evaluate(
                        '(p) => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p / 100)', percent
                    )
                page.wait_for_timeout(args.settle)
                if args.hold is not None:
                    page.locator('[data-hold]').scroll_into_view_if_needed()
                    page.wait_for_timeout(600)
                    box = page.locator('[data-hold]').bounding_box()
                    if box:
                        page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
                        page.mouse.down()
                        page.wait_for_timeout(args.hold)
                        if args.then is not None:
                            page.mouse.up()
                            page.wait_for_timeout(args.then)
                name = f'{width}x{height}-{percent:g}' + (f'-{args.suffix}' if args.suffix else '')
                try:
                    page.screenshot(path=str(folder / f'{name}.png'))
                    if zoom:
                        x, y, w, h = zoom
                        page.screenshot(
                            path=str(folder / f'{name}-zoom.png'), clip={'x': x, 'y': y, 'width': w, 'height': h}
                        )
                    world = page.evaluate('document.documentElement.dataset.world')
                    print(f'{name}: world={world}' + (f' errors={errors}' if errors else ''))
                except Exception as error:  # a lost GPU context makes the capture itself fail
                    failures += 1
                    print(f'{name}: capture failed ({str(error)[:80]})')
                ctx.close()
        browser.close()
    print(f'saved to {folder}')
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
