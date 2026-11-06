"""Frame times at the beats a phase touches, for the before/after in its report.

    python tests/frames.py [--base URL] [--at record,results-a,results-b,results-c] [--seconds 4]

For each quality tier and screen size it holds the page still at each position for a few seconds and
reports the time between frames (median and 95th percentile, from requestAnimationFrame), and the GPU
time per frame where the driver reports it. Headless Chrome on this machine draws through its real
GPU, but the numbers are for comparing one build with another, not a promise for other machines.
"""
import argparse
import json
import statistics

from playwright.sync_api import sync_playwright

GPU = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--headless=new']
TIERS = [('high', 8, 1440, 900, False), ('low', 2, 1440, 900, False)]
# name: (section, how far through it). The results sit at the three stops of the flight once built.
SPOTS = {
    'backlog': ('#backlog', 0.2),
    'gates': ('#gates', 0.5),
    'record': ('#record', 0.3),
    'results-a': ('#results', 0.25),
    'results-b': ('#results', 0.64),
    'results-c': ('#results', 0.95),
    'dawn': ('#apply', 0),
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://127.0.0.1:5173/')
    ap.add_argument('--at', default='backlog,gates,record,results-a,results-c,dawn')
    ap.add_argument('--seconds', type=float, default=4.0)
    args = ap.parse_args()
    out = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=GPU)
        for tier, cores, width, height, phone in TIERS:
            for name in args.at.split(','):
                section, share = SPOTS[name]
                ctx = browser.new_context(viewport={'width': width, 'height': height}, is_mobile=phone, has_touch=phone)
                ctx.add_init_script(f"Object.defineProperty(navigator, 'hardwareConcurrency', {{ get: () => {cores} }})")
                page = ctx.new_page()
                page.goto(f'{args.base}?test', wait_until='networkidle')
                page.wait_for_function("document.documentElement.dataset.world === 'live'", timeout=120000)
                page.evaluate(
                    """([s, f]) => { const e = document.querySelector(s); const r = e.getBoundingClientRect();
                       const span = Math.max(e.offsetHeight - innerHeight, innerHeight * 0.4);
                       scrollTo(0, r.top + scrollY + span * f); }""",
                    [section, share],
                )
                page.wait_for_timeout(3000)  # shaders compile, the ripple and the count finish
                deltas = page.evaluate(
                    """(seconds) => new Promise((done) => {
                       const out = []; let last = performance.now(); const end = last + seconds * 1000;
                       const step = (now) => { out.push(now - last); last = now;
                         now < end ? requestAnimationFrame(step) : done(out); };
                       requestAnimationFrame(step); })""",
                    args.seconds,
                )
                gpu = page.evaluate('__world.inspect().gpuMs')
                deltas = sorted(deltas[2:])
                row = {
                    'tier': tier,
                    'size': f'{width}x{height}',
                    'at': name,
                    'frame_median_ms': round(statistics.median(deltas), 1),
                    'frame_p95_ms': round(deltas[int(len(deltas) * 0.95)], 1),
                    'gpu_median_ms': round(statistics.median(gpu), 1) if gpu else None,
                    'calls': page.evaluate('__world.inspect().calls'),
                }
                out.append(row)
                print(json.dumps(row))
                ctx.close()
        browser.close()


if __name__ == '__main__':
    main()
