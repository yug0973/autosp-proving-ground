"""Phase 4, the immersion pieces, checked in a real browser on the cinematic page.

  - A crack under the pointer says what it is; a click on one of the three takes the visitor to the
    pick with it chosen. Off the cracks, or over the page's words, nothing shows.
  - On the first screen, cracks near the pointer brighten (read off the pixels), and only there.
  - The test run can be skipped: every line shows at once and the failing lines flash.
  - The checks' diff is highlighted, and Copy patch puts a unified diff on the clipboard.
  - J and K move between chapters, ? opens the list and Escape closes it, and typing in a field
    never triggers them. M held at the merge step merges.
  - Sound is off by default; the toggle turns it on and is remembered.

    python tests/immersion.py --base http://127.0.0.1:5173
"""
import argparse
import io
import sys

from PIL import Image, ImageStat
from playwright.sync_api import sync_playwright

GPU = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--headless=new']
results = []


def check(name, ok, detail=''):
    results.append(bool(ok))
    print(f"{'PASS' if ok else 'FAIL'} {name}" + (f'  ({detail})' if detail else ''))


def scroll_to(page, selector, share):
    page.evaluate(f"(() => {{ const s = document.querySelector('{selector}'); scrollTo(0, s.getBoundingClientRect().top + scrollY + Math.max(0, s.offsetHeight - innerHeight) * {share}); }})()")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default='http://127.0.0.1:5173')
    args = parser.parse_args()
    base = args.base.rstrip('/')
    with sync_playwright() as p:
        browser = p.chromium.launch(args=GPU)
        ctx = browser.new_context(viewport={'width': 1890, 'height': 940})
        ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=base)
        ctx.add_init_script("Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })")
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
        page.goto(base + '/?test&sway=off', wait_until='networkidle')
        page.wait_for_function('window.__world', timeout=120000)
        page.evaluate("window.__t = []; __world.onFrame((l) => { window.__t = l.filter((x) => x.targetOnScreen).map((x) => ({ cwe: x.finding.cwe, x: x.targetX, y: x.targetY })); })")

        # --- the first screen: cracks near the pointer brighten, with nothing drawn -------------------------------
        page.wait_for_timeout(3000)
        page.mouse.move(40, 900)
        page.wait_for_timeout(500)
        img = Image.open(io.BytesIO(page.screenshot())).convert('RGB')
        px = img.load()
        # a crack the visitor can see through the torn deck: the first strongly orange pixel off the words
        spot = next(((x, y) for y in range(300, 900, 6) for x in range(800, 1850, 6)
                     if px[x, y][0] > 200 and px[x, y][1] < 140 and px[x, y][2] < 90), None)
        if spot:
            box = (spot[0] - 50, spot[1] - 50, spot[0] + 50, spot[1] + 50)
            dark = ImageStat.Stat(img.crop(box)).mean
            page.mouse.move(*spot)
            page.wait_for_timeout(500)
            lit = ImageStat.Stat(Image.open(io.BytesIO(page.screenshot())).convert('RGB').crop(box)).mean
            check('hero: a crack near the pointer burns brighter (red rises)', lit[0] > dark[0] + 1.5, f'{dark[0]:.1f} to {lit[0]:.1f}')
        else:
            check('hero: a crack shows through the deck', False)
        check('hero: no tooltip on the first screen', page.evaluate("document.querySelector('.crack-tip').hidden"))

        # --- the backlog: a crack says what it is, and a click follows it -----------------------------------------
        page.evaluate("(() => { const s = document.querySelector('#backlog'); scrollTo(0, s.getBoundingClientRect().top + scrollY + s.offsetHeight * 0.9 - innerHeight); })()")
        page.wait_for_timeout(3000)
        targets = page.evaluate('window.__t')
        free = [t for t in targets if t['cwe'] == 'CWE-79' and 0 < t['x'] < 1890 and 0 < t['y'] < 940
                and not page.evaluate(f"!!document.elementFromPoint({t['x']}, {t['y']})?.closest('.beat__text, a, button')")]
        if free:
            t = free[0]
            page.mouse.move(t['x'], t['y'])
            page.wait_for_timeout(400)
            tip = page.text_content('.crack-tip') or ''
            check('hover: the crack says its CWE, its name and its file', 'CWE-79' in tip and 'Cross-site scripting' in tip and '.py' in tip, tip)
            check('hover: and how to follow it', 'Click to follow this fix' in tip)
            check('hover: the tooltip is hidden from screen readers', page.evaluate("document.querySelector('.crack-tip').getAttribute('aria-hidden') === 'true'"))
            page.mouse.click(t['x'], t['y'])
            page.wait_for_timeout(2500)
            got = page.evaluate("[Math.round(document.querySelector('#pick').getBoundingClientRect().top), document.querySelector('input[name=finding]:checked').value]")
            check('click: it goes to the pick with that finding chosen', abs(got[0]) < 160 and got[1] == 'CWE-79', str(got))
        else:
            check('hover: a cross-site scripting crack is clear of the words', False, str(targets)[:160])
        page.mouse.move(60, 60)
        page.wait_for_timeout(300)
        check('hover: off the cracks, no tooltip', page.evaluate("document.querySelector('.crack-tip').hidden"))
        page.evaluate("document.querySelector('input[value=\"CWE-89\"]').click()")

        # --- the run: skippable, and its failures flash --------------------------------------------------------
        scroll_to(page, '#reproduce', 0.5)
        page.wait_for_timeout(1200)
        page.click('[data-rerun]')
        page.wait_for_timeout(150)
        check('run: a Skip button while it types', page.is_visible('[data-run-skip]'))
        partial = page.evaluate("document.querySelectorAll('[data-run-output] .code-line').length")
        page.click('[data-run-skip]')
        page.wait_for_timeout(150)
        after = page.evaluate("[document.querySelectorAll('[data-run-output] .code-line').length, document.querySelectorAll('[data-run-output] .code-line--flash').length, document.querySelector('[data-run-status]').dataset.state]")
        check('run: Skip shows every line at once', after[0] > partial and after[0] >= 5 and after[2] == 'failed', f'{partial} then {after}')
        check('run: the failing lines flash', after[1] >= 3, str(after[1]))
        check('run: Skip goes away once it has run', not page.is_visible('[data-run-skip]'))

        # --- the checks: a highlighted diff and a copyable patch -------------------------------------------------
        scroll_to(page, '#gates', 0.95)
        page.wait_for_timeout(2600)
        check('diff: the code is highlighted', page.evaluate("document.querySelectorAll('[data-gates-diff] .tok').length") >= 4)
        page.click('[data-gates-copy]')
        page.wait_for_timeout(300)
        clip = page.evaluate('navigator.clipboard.readText()')
        check('diff: Copy patch puts a unified diff on the clipboard', clip.startswith('--- a/app/') and '\n+++ b/' in clip and '\n-' in clip and '\n+' in clip, clip[:60])
        check('diff: the button says it was copied', page.text_content('[data-gates-copy]') == 'Copied')

        # --- the keys -------------------------------------------------------------------------------------------
        page.mouse.click(5, 470)
        page.keyboard.press('j')
        page.wait_for_timeout(2200)
        top = page.evaluate("Math.round(document.querySelector('#merge').getBoundingClientRect().top)")
        check('keys: J goes to the next chapter', abs(top) < 160, str(top))
        page.keyboard.press('k')
        page.wait_for_timeout(2200)
        top = page.evaluate("Math.round(document.querySelector('#gates').getBoundingClientRect().top)")
        check('keys: K goes back', abs(top) < 160, str(top))
        page.keyboard.press('Shift+Slash')
        page.wait_for_timeout(200)
        check('keys: ? opens the list of shortcuts', page.evaluate("document.querySelector('[data-keys]').open"))
        page.keyboard.press('Escape')
        page.wait_for_timeout(200)
        check('keys: Escape closes it', not page.evaluate("document.querySelector('[data-keys]').open"))
        scroll_to(page, '#merge', 0.3)
        page.wait_for_timeout(1500)
        page.mouse.click(5, 470)
        page.keyboard.down('m')
        page.wait_for_timeout(2600)
        page.keyboard.up('m')
        page.wait_for_timeout(400)
        check('keys: M held at the merge step merges', page.evaluate("document.querySelector('[data-pr-status]').dataset.state") == 'cleared')
        page.click('[data-unmerge]') if page.query_selector('[data-unmerge]:visible') else None

        # --- the form: typing never fires a shortcut, and the map steps aside ---------------------------------------
        page.evaluate("scrollTo(0, document.querySelector('#apply').getBoundingClientRect().top + scrollY)")
        page.wait_for_timeout(1500)
        before = page.evaluate('scrollY')
        page.click('[data-apply] label.apply__tile:has-text("20 to 150")')
        page.click('[data-apply] [data-step-next]')
        page.fill('[data-apply] input[name=company]', '')
        page.type('[data-apply] input[name=company]', 'jkm?')
        page.wait_for_timeout(600)
        check('keys: typing j, k, m and ? in a field stays in the field', page.input_value('[data-apply] input[name=company]') == 'jkm?' and abs(page.evaluate('scrollY') - before) < 40 and not page.evaluate("document.querySelector('[data-keys]').open"))

        # --- sound --------------------------------------------------------------------------------------------------
        check('sound: off by default', page.evaluate("document.querySelector('[data-sound]').getAttribute('aria-pressed')") == 'false')
        page.click('[data-sound]')
        check('sound: the toggle turns it on, and is remembered', page.evaluate("[document.querySelector('[data-sound]').getAttribute('aria-pressed'), localStorage.getItem('autosp-sound')]") == ['true', 'on'])
        page.click('[data-sound]')
        check('no script errors', not errors, '; '.join(errors)[:200])
        ctx.close()

        # --- low power: a machine that cannot hold 40 frames a second gets the low tier, once -------------------
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
        ctx.add_init_script("Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })")
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(base + '/?test&lowpower', wait_until='networkidle')
        page.wait_for_function('window.__world', timeout=120000)
        first = page.evaluate('document.documentElement.dataset.quality')
        page.wait_for_function("document.documentElement.dataset.quality === 'low'", timeout=20000)
        check('low power: a slow machine is switched from the high tier to the low one', first == 'high', first)
        check('low power: remembered for the visit', page.evaluate("sessionStorage.getItem('autosp-low-power')") == '1')
        check('low power: the world still draws', page.evaluate("document.documentElement.dataset.world") == 'live')
        check('low power: no script errors', not errors, '; '.join(errors)[:200])
        ctx.close()

        # --- reduced motion: no camera travel; a new chapter's still frame fades in --------------------------------
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce')
        page = ctx.new_page()
        page.goto(base + '/?test', wait_until='networkidle')
        page.wait_for_function('window.__world', timeout=120000)
        scroll_to(page, '#backlog', 0.5)
        page.wait_for_timeout(800)
        scroll_to(page, '#pick', 0.5)
        page.wait_for_timeout(30)
        mid = float(page.evaluate("getComputedStyle(document.querySelector('[data-world-canvas]')).opacity"))
        page.wait_for_timeout(900)
        end = float(page.evaluate("getComputedStyle(document.querySelector('[data-world-canvas]')).opacity"))
        check('reduced motion: a new chapter fades in over the last, not cut', mid < 0.95 and end == 1, f'{mid:.2f} then {end:.2f}')
        ctx.close()
        browser.close()
    print(f'\n{sum(results)}/{len(results)} checks passed')
    return 0 if all(results) else 1


if __name__ == '__main__':
    sys.exit(main())
