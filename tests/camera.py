"""The camera, checked as a whole: scroll the page from top to bottom and back again, read the camera
and the depth of field after every step (the page exposes them under ?test), and check three things.

  1. No whips. The camera never moves faster than --max-speed world units per 100 px of scroll,
     in any beat. (The descent is the fastest shot on purpose; the cap is set above it.) In the
     gates the camera rides behind the fix, so it moves as fast as the fix does, and that beat has
     its own cap, --max-speed-gates.
  2. Both directions. At the same scroll position the camera is where it was on the way down, to
     within --reverse-tolerance world units. The sandbox's idle sway is switched off for this
     (?sway=off), because it is the one thing that moves on a clock, not on the scroll.
  3. Focus. On the high tier every beat from the pick on has a subject in focus (the blur is set),
     the focus distance never jumps, and the blur never steps by more than --max-blur-step per
     100 px. On the low tier there is no depth of field, and the vignette stands in for it.

    python tests/camera.py [--base URL] [--quality high|low] [--size 1440x900] [--steps 400]
                           [--dsf 0.25] [--flags=FLAG,FLAG] [--max-speed 16]

The scene's geometry is hidden for the sweep (the camera does not depend on it) and the canvas is
rendered at a small device scale factor, so a machine without a GPU can run it; the layout, and so
the scroll lengths, stay at the real size. Exits 1 if any check fails.
"""
import argparse
import json
import math
import sys

from playwright.sync_api import sync_playwright

GPU = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--headless=new']
HIDE = 'cars,lamps,people,streets,city,ground,props,masses'
# A beat's camera starts moving when its section comes up the screen, so each beat runs from the
# moment its section's top edge crosses the bottom of the screen.
BEATS = [
    ('descent', '[data-descent]'),
    ('pick', '[data-push]'),
    ('reproduce', '[data-reproduce]'),
    ('sandbox', '[data-sandbox]'),
    ('gates', '[data-gates]'),
    ('merge', '[data-merge]'),
    ('outro', '[data-outro]'),
    ('results', '#results'),
    ('dawn', '#apply'),
]
results = []


def check(name, ok, detail=''):
    results.append(ok)
    print(('PASS ' if ok else 'FAIL ') + name + (f'  ({detail})' if detail else ''))


def beat_of(y, starts):
    name = BEATS[0][0]
    for beat, start in starts:
        if y >= start:
            name = beat
    return name


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://127.0.0.1:5173/')
    ap.add_argument('--quality', choices=['high', 'low'], default='high')
    ap.add_argument('--size', default='1440x900')
    ap.add_argument('--steps', type=int, default=400)
    ap.add_argument('--dsf', type=float, default=0.25)
    ap.add_argument('--flags', help='comma-separated Chromium flags, replacing the default GPU set')
    ap.add_argument('--max-speed', type=float, default=16.0, help='world units per 100 px of scroll')
    ap.add_argument('--max-speed-gates', type=float, default=28.0, help='the same, for the gates')
    ap.add_argument('--reverse-tolerance', type=float, default=0.5, help='world units')
    ap.add_argument('--max-blur-step', type=float, default=0.2, help='blur per 100 px of scroll')
    ap.add_argument('--save', help='write the raw samples to this JSON file')
    args = ap.parse_args()
    width, height = (int(n) for n in args.size.split('x'))

    with sync_playwright() as p:
        browser = p.chromium.launch(args=args.flags.split(',') if args.flags else GPU)
        ctx = browser.new_context(
            viewport={'width': width, 'height': height},
            device_scale_factor=args.dsf,
            is_mobile=width < 800,
            has_touch=width < 800,
        )
        cores = 8 if args.quality == 'high' else 2
        ctx.add_init_script(
            f"Object.defineProperty(navigator, 'hardwareConcurrency', {{ get: () => {cores} }})"
        )
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: m.type == 'error' and errors.append(m.text[:160]))
        page.goto(f'{args.base}?test&sway=off&no={HIDE}', wait_until='networkidle')
        page.wait_for_timeout(1200)
        check('the world is running', page.evaluate('document.documentElement.dataset.world') == 'live')
        check(
            f'the {args.quality} tier is in use',
            page.evaluate('document.documentElement.dataset.quality') == args.quality,
        )

        total = page.evaluate('document.documentElement.scrollHeight - innerHeight')
        starts = []
        for beat, selector in BEATS:
            top = page.evaluate(
                f'(() => {{ const e = document.querySelector("{selector}"); '
                f'return e ? e.getBoundingClientRect().top + scrollY : null }})()'
            )
            if top is not None:
                starts.append((beat, 0 if beat == 'descent' else max(top - height, 0)))
        check('every beat section is on the page', len(starts) == len(BEATS), str(len(starts)))

        def at(y):
            page.evaluate(f'scrollTo(0, {y})')
            # three frames: the world draws on the first, so the camera has settled by the third
            page.evaluate(
                'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => '
                'requestAnimationFrame(r))))'
            )
            return page.evaluate(
                '(() => { const i = __world.inspect(); '
                'return { c: i.camera, t: i.target, d: i.depthOfField, f: i.focus } })()'
            )

        n = args.steps
        down = [(k / n * total, at(k / n * total)) for k in range(n + 1)]
        up = [(k / n * total, at(k / n * total)) for k in range(n, -1, -1)]
        up.reverse()
        if args.save:
            json.dump({'down': down, 'up': up, 'total': total, 'starts': starts}, open(args.save, 'w'))
        has_dof = down[0][1]['d'] is not None
        browser.close()

    check('no script errors', not errors, '; '.join(errors)[:200])
    step_px = total / n

    # 1. speed, per beat, in either direction
    for label, samples in (('scrolling down', down), ('scrolling back', up)):
        worst = {}
        for i in range(1, len(samples)):
            (y0, s0), (y1, s1) = samples[i - 1], samples[i]
            speed = math.dist(s0['c'], s1['c']) / abs(y1 - y0) * 100
            beat = beat_of(max(y0, y1), starts)
            if speed > worst.get(beat, (0, 0))[0]:
                worst[beat] = (speed, max(y0, y1))
        for beat, _ in BEATS:
            speed, y = worst.get(beat, (0.0, 0))
            cap = args.max_speed_gates if beat == 'gates' else args.max_speed
            check(
                f'{beat}: camera speed {label} stays under {cap:g}',
                speed <= cap,
                f'peak {speed:.1f} units per 100 px at scroll {y:.0f}',
            )

    # 2. both directions agree
    worst = {}
    for (y, a), (_, b) in zip(down, up, strict=True):
        gap = max(math.dist(a['c'], b['c']), math.dist(a['t'], b['t']))
        beat = beat_of(y, starts)
        if gap > worst.get(beat, (0, 0))[0]:
            worst[beat] = (gap, y)
    for beat, _ in BEATS:
        gap, y = worst.get(beat, (0.0, 0))
        check(
            f'{beat}: scrolling back lands where scrolling down did',
            gap <= args.reverse_tolerance,
            f'worst gap {gap:.2f} units at scroll {y:.0f}',
        )

    # 3. focus
    if args.quality == 'low':
        check('the low tier draws without depth of field', not has_dof)
    else:
        check('the high tier has depth of field', has_dof)
        if has_dof:
            blur_step = 0.0
            dist_speed = 0.0
            for i in range(1, len(down)):
                (y0, s0), (y1, s1) = down[i - 1], down[i]
                blur_step = max(blur_step, abs(s1['d']['blur'] - s0['d']['blur']) / (y1 - y0) * 100)
                dist_speed = max(dist_speed, abs(s1['d']['distance'] - s0['d']['distance']) / (y1 - y0) * 100)
            check(
                'the blur never steps',
                blur_step <= args.max_blur_step,
                f'peak {blur_step:.3f} per 100 px (step {step_px:.0f} px)',
            )
            check(
                'the focus distance never jumps',
                dist_speed <= args.max_speed * 1.5,
                f'peak {dist_speed:.1f} units per 100 px',
            )
            for beat, start in starts:
                if beat == 'descent':
                    continue
                end = next((s for b, s in starts if s > start), total)
                middle = (start + end) / 2
                nearest = min(down, key=lambda sample: abs(sample[0] - middle))
                blur = nearest[1]['d']['blur']
                check(f'{beat}: the shot sets its focus at the middle of the beat', blur >= 0.4, f'blur {blur:.2f}')

    print(f'\n{sum(results)}/{len(results)} checks passed')
    return 0 if all(results) else 1


if __name__ == '__main__':
    sys.exit(main())
