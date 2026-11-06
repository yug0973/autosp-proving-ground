"""The scanner sweep of the backlog beat (Phase 4), checked in a real browser.

    python tests/scan.py [--base URL] [--flags=FLAG,FLAG] [--shots DIR]

  - The count shown in the beat is read from the scene (world.findings), not written into the page:
    it ends at the number of findings, and a screen reader is told that number once.
  - Before the beat the cracks are dark and nothing is counted; the sweep is held at four points
    (?test&scan=) and the count rises with the line, never past the findings the line has passed.
  - A finding's label waits for its crack to light.
  - Played live, the count climbs from 0 to every finding in about the sweep's time, and plays once.
  - Reduced motion: every crack is lit and the final count shown at once, with no line.
  - The number is at least 18px at 1440 wide, and the animating figure is hidden from screen readers.

Needs the dev server up. Saves a frame at each held point with --shots. Exits 1 if a check fails.
"""
import argparse
import sys

from playwright.sync_api import sync_playwright

GPU = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--headless=new']
results = []


def check(name, ok, detail=''):
    results.append(ok)
    print(('PASS ' if ok else 'FAIL ') + name + (f'  ({detail})' if detail else ''))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://127.0.0.1:5173/')
    ap.add_argument('--flags')
    ap.add_argument('--shots')
    ap.add_argument('--size', default='1440x900')
    args = ap.parse_args()
    width, height = (int(n) for n in args.size.split('x'))

    with sync_playwright() as p:
        browser = p.chromium.launch(args=args.flags.split(',') if args.flags else GPU)

        def open_page(query='', **options):
            ctx = browser.new_context(viewport={'width': width, 'height': height}, **options)
            ctx.add_init_script("Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })")
            page = ctx.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('console', lambda m: m.type == 'error' and errors.append(m.text[:200]))
            page.goto(f'{args.base}?test{query}', wait_until='networkidle')
            page.wait_for_function("['live', 'still'].includes(document.documentElement.dataset.world)", timeout=120000)
            page.wait_for_timeout(800)
            return ctx, page, errors

        def to_backlog(page):
            page.evaluate(
                """(() => { const s = document.querySelector('#backlog');
                   scrollTo(0, s.getBoundingClientRect().top + scrollY - innerHeight * 0.2) })()"""
            )
            page.wait_for_timeout(1500)

        def state(page):
            return page.evaluate(
                """() => ({
                  scan: __world.scan(),
                  shown: document.querySelector('[data-count-num]').textContent,
                  hidden: document.querySelector('[data-count]').hidden,
                  labels: [...document.querySelectorAll('[data-findings] > *')].filter((l) => !l.hidden).length,
                })"""
            )

        # held at four points: the count rises with the line
        total = None
        last = -1
        for point in (0, 0.45, 0.6, 1):
            ctx, page, errors = open_page(f'&scan={point}')
            to_backlog(page)
            page.wait_for_timeout(2500)
            s = state(page)
            total = page.evaluate('__world.findings.length')
            count = s['scan']['count']
            check(f'sweep held at {point}: the line is at {point}', abs(s['scan']['progress'] - point) < 1e-6)
            check(f'sweep held at {point}: the figure in the beat is the count ({count} of {total})', s['shown'] == str(count) and not s['hidden'])
            check(f'sweep held at {point}: the count never falls', count >= last, f'{count}')
            check(f'sweep held at {point}: labels shown are only those whose crack is lit', s['labels'] <= count, f"{s['labels']} labels")
            if point == 0:
                check('before the line: nothing counted, no label', count == 0 and s['labels'] == 0)
            if point == 1:
                check('after the line: every finding counted', count == total, f'{count} of {total}')
            last = count
            if args.shots:
                page.screenshot(path=f'{args.shots}/scan-{int(point * 100):03d}.png', timeout=180000)
            ctx.close()

        # live: it counts up by itself, once
        ctx, page, errors = open_page()
        page.evaluate('scrollTo(0, 0)')
        page.wait_for_timeout(1200)
        before = state(page)
        check('before the beat arrives the cracks are dark and nothing is counted', before['scan']['count'] == 0 and before['scan']['progress'] == 0, str(before['scan']))
        to_backlog(page)
        seen = []
        for _ in range(30):
            page.wait_for_timeout(400)
            seen.append(state(page)['scan']['count'])
            if seen[-1] == total:
                break
        check('played live, the count climbs to every finding', seen and seen[-1] == total, str(seen))
        check('and never goes down', all(b >= a for a, b in zip(seen, seen[1:], strict=False)))
        page.evaluate('scrollTo(0, 0)')
        page.wait_for_timeout(800)
        to_backlog(page)
        page.wait_for_timeout(800)
        check('it plays once: coming back to the beat does not play it again', state(page)['scan']['progress'] == 1)
        # the page's markup: read out once as a whole; the animating figure is hidden
        a11y = page.evaluate(
            """() => ({
              total: document.querySelector('[data-count-total]').textContent,
              hiddenFigure: !!document.querySelector('[data-count-num]').closest('[aria-hidden=true]'),
              size: parseFloat(getComputedStyle(document.querySelector('[data-count-num]')).fontSize),
              label: parseFloat(getComputedStyle(document.querySelector('.beat__count-label')).fontSize),
            })"""
        )
        check('a screen reader is told the total once', a11y['total'] == f'{total} findings in this scene', a11y['total'])
        check('the figure that counts up is hidden from screen readers', a11y['hiddenFigure'])
        check('the number and its label are at least 18px', a11y['size'] >= 18 and a11y['label'] >= 18, f"{a11y['size']:.0f}px and {a11y['label']:.0f}px")
        check('no script errors', not errors, '; '.join(errors)[:200])
        ctx.close()

        # reduced motion: lit and final at once, no line
        ctx, page, errors = open_page(reduced_motion='reduce')
        page.evaluate('scrollTo(0, 0)')
        page.wait_for_timeout(1200)
        s = state(page)
        line = page.evaluate('__world.scan().progress')
        check('reduced motion: every crack is lit and the final count shown at once', s['scan']['count'] == total and s['shown'] == str(total), f"{s['scan']['count']} of {total}")
        check('reduced motion: no sweep (the line is never drawn)', line == 1)
        ctx.close()
        browser.close()

    print(f'\n{sum(results)}/{len(results)} checks passed')
    return 0 if all(results) else 1


if __name__ == '__main__':
    sys.exit(main())
