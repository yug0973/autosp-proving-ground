"""The box on each beat of the cinematic page, checked off the real pixels at three window sizes.

    python tests/panels.py [--base URL] [--flags=FLAG,FLAG] [--shots DIR]

  - Every piece of text in a box keeps 4.5:1 against what is actually behind it.
  - Each box stays in its own bounds, with nothing laid across the city, and fits the window.
  - Its beam runs in the colour of the step's state; the light on its edge follows the pointer.
  - A sweep down the whole page, with the city hidden: nothing the page lays over it draws a hard line
    across the frame at any scroll position.
  - Each step's fingerprint is the record's, and a rewritten entry decrypts into its new ones.
  - The checks run on the building: each finding's careless fix is refused by its own check.
  - The tower takes the company typed into the form, and the results' counters roll to 14 and 2.

Needs the dev server up. Exits 1 if a check fails.
"""
import argparse
import io
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

GPU = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--headless=new']
SIZES = [(1440, 900), (1890, 940), (1280, 720)]
BEATS = [('#pick', 0.5), ('#reproduce', 0.6), ('#sandbox', 0.6), ('#gates', 0.8), ('#merge', 0.6), ('#record', 0.3), ('#results', 0.55), ('#apply', 0.0)]
TEXTS = """(section) => {
  const out = [];
  const root = document.querySelector(section).querySelector('.track__panel, .chapter__panel, .closing__inner');
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement;
    if (!n.textContent.trim() || seen.has(el) || el.closest('button, .btn, option, select, textarea, [hidden], .panel__tag, .record__tip, .visually-hidden')) continue;
    seen.add(el);
    const range = document.createRange();
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    const c = getComputedStyle(el);
    if (r.width < 2 || r.top < 70 || r.bottom > innerHeight || c.visibility === 'hidden' || c.clipPath !== 'none') continue;
    out.push({ text: n.textContent.trim().slice(0, 30), box: [r.left, r.top, r.right, r.bottom], colour: c.color.match(/[\\d.]+/g).slice(0, 3).map(Number).map((v) => (c.color.startsWith('color(') ? v * 255 : v)) });
  }
  return out;
}"""
results = []


def check(name, ok, detail=''):
    results.append(bool(ok))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  ({detail})' if detail else ''))


def luminance(rgb):
    def channel(c):
        c /= 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])


def contrast(a, b):
    x, y = luminance(a), luminance(b)
    return (max(x, y) + 0.05) / (min(x, y) + 0.05)


def hard_line(img):
    """The strongest step between two pixel rows that runs across nearly the whole width of the frame."""
    small = img.convert('L').resize((96, img.height // 2))
    px = small.load()
    worst = (0, 0)
    for y in range(4, small.height - 4):
        steps = sorted(abs(px[x, y + 1] - px[x, y - 1]) for x in range(96))
        # the step most of the row agrees on: a building's edge never spans the frame
        share = steps[len(steps) // 5]
        if share > worst[0]:
            worst = (share, y * 2)
    return worst


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://127.0.0.1:5173/')
    ap.add_argument('--flags')
    ap.add_argument('--shots')
    args = ap.parse_args()

    with sync_playwright() as p:
        browser = p.chromium.launch(args=args.flags.split(',') if args.flags else GPU)

        def open_page(width, height, **options):
            ctx = browser.new_context(viewport={'width': width, 'height': height}, **options)
            ctx.add_init_script("Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })")
            page = ctx.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)[:200]))
            page.goto(f'{args.base}?test&sway=off', wait_until='networkidle')
            page.wait_for_function('window.__world', timeout=120000)
            page.wait_for_timeout(500)
            return ctx, page, errors

        for width, height in SIZES:
            for section, at in BEATS:
                ctx, page, errors = open_page(width, height)
                page.evaluate(
                    f"""(() => {{ const s = document.querySelector('{section}'); const top = s.getBoundingClientRect().top + scrollY;
                         const room = Math.max(s.offsetHeight - innerHeight, 0);
                         scrollTo(0, top + (room ? room * {at} : 0)); }})()"""
                )
                page.wait_for_timeout(2600)
                tag = f'{section} at {width}x{height}'
                if args.shots:
                    page.screenshot(path=f"{args.shots}/box-{section[1:]}-{width}.png", timeout=180000)
                info = page.evaluate(
                    """(section) => { const p = document.querySelector(section).querySelector('.track__panel, .chapter__panel, .closing__inner');
                         const c = getComputedStyle(p); const r = p.getBoundingClientRect(); const b = getComputedStyle(p, '::before');
                         return { radius: parseFloat(c.borderTopLeftRadius), h: r.height, room: innerHeight, width: r.width, wide: innerWidth,
                                  sideways: document.documentElement.scrollWidth > innerWidth,
                                  outset: parseFloat(b.top), beam: !!p.querySelector('.card-beam i'),
                                  state: p.querySelector('.pixel-state')?.dataset.state ?? '', colour: getComputedStyle(p).getPropertyValue('--beam'),
                                  drawn: !p.querySelector('.panel__tag') || !!p.querySelector('.pixel-state path')?.getAttribute('d') }; }""",
                    section,
                )
                check(f'{tag}: a box of its own, not across the frame', info['radius'] > 0 and info['width'] < info['wide'] * (0.8 if section == '#apply' else 0.7) and info['outset'] > -3, str(info))
                check(f'{tag}: it fits the window', info['h'] <= info['room'], f"{info['h']:.0f} of {info['room']}")
                check(f'{tag}: no sideways scroll', not info['sideways'])
                check(f'{tag}: it has its beam, its state drawn', info['beam'] and info['drawn'], info['state'])
                texts = page.evaluate(TEXTS, section)
                style = page.add_style_tag(content='#main *, .rail * { color: transparent !important; text-shadow: none !important; } .pixel-state { opacity: 0 !important }')
                page.wait_for_timeout(120)
                img = Image.open(io.BytesIO(page.screenshot(timeout=180000))).convert('RGB')
                style.evaluate('e => e.remove()')
                worst = (99, '')
                for t in texts:
                    left, top, right, bottom = (int(v) for v in t['box'])
                    crop = img.crop((max(left, 0), max(top, 0), min(right + 1, img.width), min(bottom + 1, img.height)))
                    values = sorted(crop.getdata(), key=lambda q: contrast(t['colour'], q))
                    ratio = contrast(t['colour'], values[len(values) // 50])
                    if ratio < worst[0]:
                        worst = (ratio, t['text'])
                check(f'{tag}: every word keeps 4.5:1, off the pixels', texts and worst[0] >= 4.5, f'{len(texts)} read, worst {worst[0]:.1f}:1 at "{worst[1]}"')
                check(f'{tag}: no script errors', not errors, '; '.join(errors)[:160])
                ctx.close()

        # --- what the beam says, and the light that follows the pointer ----------------------------------
        ctx, page, errors = open_page(1440, 900)
        beam = "(s) => getComputedStyle(document.querySelector(s + ' .card-beam i')).backgroundImage"
        scroll = "(s, at) => { const e = document.querySelector(s); scrollTo(0, e.getBoundingClientRect().top + scrollY + (e.offsetHeight - innerHeight) * at); }"
        page.evaluate(f'({scroll})("#reproduce", 0.6)')
        page.wait_for_function("document.querySelector('[data-run-status]').dataset.state === 'failed'", timeout=15000)
        check('failing: the beam is orange', '255, 106, 43' in page.evaluate(beam, '#reproduce'), page.evaluate(beam, '#reproduce')[:80])
        page.evaluate(f'({scroll})("#gates", 0.97)')
        page.wait_for_timeout(1500)
        check('passed: the beam is lime', '200, 242, 69' in page.evaluate(beam, '#gates'), page.evaluate(beam, '#gates')[:80])
        page.evaluate(f'({scroll})("#merge", 0.6)')
        page.wait_for_timeout(1500)
        check('waiting for a person: the beam is amber', '255, 185, 49' in page.evaluate(beam, '#merge'), page.evaluate(beam, '#merge')[:80])
        box = page.evaluate("(() => { const r = document.querySelector('#merge .track__panel').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()")
        page.mouse.move(box[0] + box[2] - 20, box[1] + 30)
        page.wait_for_timeout(500)
        light = page.evaluate("(() => { const p = document.querySelector('#merge .track__panel'); return [p.style.getPropertyValue('--mx'), getComputedStyle(p, '::before').opacity]; })()")
        check('the light on the edge follows the pointer', light[0] and float(light[1]) > 0.9, str(light))
        check('its beam runs while it is on screen', page.evaluate("document.querySelector('#merge .card-beam').hasAttribute('data-live')"))
        same = page.evaluate("""[...document.querySelectorAll('[data-tape-fp]')].every((f) => f.textContent === document.querySelectorAll('[data-record-short]')[+f.dataset.tapeFp].textContent)""")
        check('each step carries the fingerprint the record has', same)
        check('All products is gone', page.locator('text=All products').count() == 0)
        ctx.close()

        # --- the checks: run on the building, each finding's careless fix refused by its own check -----------------
        for finding, refused, flag in (('SQL injection', 2, 'Static scan refused it'), ('Cross-site scripting', 1, 'Existing suite refused it'), ('IDOR', 0, 'Reproduction test refused it')):
            ctx, page, errors = open_page(1440, 900)
            page.evaluate("document.querySelector('#pick').scrollIntoView()")
            page.wait_for_timeout(500)
            page.locator('[data-push] label', has_text=finding).click()
            page.evaluate("document.querySelector('#gates').scrollIntoView()")
            page.wait_for_timeout(400)
            page.locator('[data-choice] label', has_text='careless').click()
            page.evaluate("(() => { const s = document.querySelector('#gates'); scrollTo(0, s.getBoundingClientRect().top + scrollY + (s.offsetHeight - innerHeight) * 0.97); })()")
            page.wait_for_timeout(2400)
            got = page.evaluate("({ rows: [...document.querySelectorAll('[data-gates-list] li')].map((l) => l.dataset.state), flag: document.querySelector('[data-gate-flag]').hidden ? '' : document.querySelector('[data-gate-flag]').textContent.trim() })")
            want = ['passed'] * refused + ['refused'] + ['skipped'] * (2 - refused)
            check(f'checks: a careless {finding} fix is refused by its own check, over its building', got['rows'] == want and got['flag'] == flag, str(got))
            check(f'checks: {finding}: no script errors', not errors, '; '.join(errors)[:160])
            ctx.close()
        ctx, page, errors = open_page(1440, 900)
        page.evaluate("(() => { const s = document.querySelector('#gates'); scrollTo(0, s.getBoundingClientRect().top + scrollY + (s.offsetHeight - innerHeight) * 0.97); })()")
        page.wait_for_timeout(2400)
        check('checks: the fix from the sandbox passes all three', page.evaluate("[...document.querySelectorAll('[data-gates-list] li')].every((l) => l.dataset.state === 'passed')"))
        check('checks: no refusal flag over a fix that passed', page.evaluate("document.querySelector('[data-gate-flag]').hidden"))

        # --- the form (the one-page form; tests/world.py walks its validation and sending) ------------------------
        page.evaluate("scrollTo(0, document.querySelector('#apply').getBoundingClientRect().top + scrollY)")
        page.wait_for_timeout(1500)
        page.click('[data-apply] label.apply__tile:has-text("20 to 150")')
        page.wait_for_timeout(300)
        check('form: the tower answers the first step with the team size', '20 TO 150' in str(page.evaluate('__world.skyline()')).upper(), str(page.evaluate('__world.skyline()'))[:120])
        page.click('[data-apply] [data-step-next]')
        page.wait_for_timeout(300)
        page.fill('[data-apply] input[name=company]', 'Initech')
        page.wait_for_timeout(300)
        check('form: the tower takes the company typed', 'INITECH' in str(page.evaluate('__world.skyline()')).upper())

        # --- before you apply: the plan, the access, the comparison, the questions -------------------------------------
        page.evaluate("scrollTo(0, document.querySelector('#faq').getBoundingClientRect().top + scrollY - 200)")
        page.wait_for_timeout(600)
        items = page.locator('#faq ~ .faq summary')
        items.nth(0).click(); items.nth(2).click()
        page.wait_for_timeout(150)
        check('faq: one answer open at a time', page.evaluate("[...document.querySelectorAll('.faq details')].filter((d) => d.open).length") == 1)
        page.keyboard.press('Enter')
        page.wait_for_timeout(150)
        check('faq: and the keyboard closes it', page.evaluate("[...document.querySelectorAll('.faq details')].filter((d) => d.open).length") == 0)
        status = page.evaluate("fetch('/sample-evidence-pack.pdf').then((r) => r.status + ' ' + r.headers.get('content-type'))")
        check('record: the sample evidence pack downloads', status.startswith('200') and 'pdf' in status, status)
        tbd = page.evaluate("[...new Set([...document.querySelectorAll('[data-tbd]')].map((e) => e.dataset.tbd))]")
        print(f'  (still to confirm on the page: {", ".join(tbd)})')
        check('honest: every placeholder says so on the page', page.evaluate("[...document.querySelectorAll('[data-tbd]')].every((e) => e.textContent.startsWith('To confirm'))"))
        check('footer: product, how it works, FAQ, security, privacy, terms, contact and Nexarise', page.evaluate("[...document.querySelectorAll('.foot .foot__nav a')].map((a) => a.textContent)") == ['Product', 'How it works', 'FAQ', 'Security', 'Privacy', 'Terms', 'Contact', 'Nexarise'])

        # --- the counters and the fingerprints ------------------------------------------------------------------------
        a11y = page.evaluate("[...document.querySelectorAll('#results .stats__text')].map((e) => e.textContent.trim())")
        check('counters: screen readers still read 14/16, 2/2 and 0', a11y == ['14/16', '2/2', '0'], str(a11y))
        check('counters: the rolling digits are hidden from them', page.evaluate("[...document.querySelectorAll('.odometer')].every((o) => o.getAttribute('aria-hidden') === 'true')"))
        page.evaluate("(() => { const s = document.querySelector('#results'); scrollTo(0, s.getBoundingClientRect().top + scrollY + (s.offsetHeight - innerHeight) * 0.12); })()")
        page.wait_for_timeout(2600)
        shown = page.evaluate("[...document.querySelectorAll('.odometer__number')].map((n) => [...n.querySelectorAll('.odometer__strip')].map((s) => Math.round(-parseFloat(s.style.transform.replace('translateY(', '')))).join(''))")
        check('counters: they roll to 14 and 2 as the results arrive', shown == ['14', '2'], str(shown))
        page.evaluate("(() => { const s = document.querySelector('#record'); scrollTo(0, s.getBoundingClientRect().top + scrollY); })()")
        page.wait_for_timeout(1500)
        page.locator('[data-record-tamper]').click()
        page.wait_for_timeout(150)
        mid = page.evaluate("[...document.querySelectorAll('[data-record-short]')].map((e) => e.textContent)")
        page.wait_for_timeout(1200)
        end = page.evaluate("[...document.querySelectorAll('[data-record-short]')].map((e) => e.textContent)")
        check('fingerprints: a rewritten entry decrypts into its new fingerprints', mid != end and all(len(m) == 4 for m in mid), f'{mid} then {end}')
        check('fingerprints: and settles on them, the steps with them', page.evaluate("[...document.querySelectorAll('[data-tape-fp]')].every((f) => f.textContent === document.querySelectorAll('[data-record-short]')[+f.dataset.tapeFp].textContent)"))
        check("chips: the steps' fingerprint chips light once the record is reached", page.evaluate("document.documentElement.hasAttribute('data-record-reached') && getComputedStyle(document.querySelector('.hash-chip')).color === 'rgb(138, 180, 255)'"))
        check('one demo badge for the whole page, and no per-box Illustrative lines', page.evaluate("document.querySelectorAll('.demo-badge').length === 1 && ![...document.querySelectorAll('#main .track__panel, #main .chapter__panel')].some((p) => /Illustrative/.test(p.textContent))"))
        check('no script errors', not errors, '; '.join(errors)[:160])
        ctx.close()

        ctx, page, errors = open_page(1440, 900, reduced_motion='reduce')
        check('chips: muted before the record is reached', not page.evaluate("document.documentElement.hasAttribute('data-record-reached')"))
        check('badge: shown in the corner at the top of the page', page.evaluate("(() => { const b = document.querySelector('.demo-badge').getBoundingClientRect(); return b.width > 0 && b.right <= innerWidth && b.bottom <= innerHeight })()"))
        page.evaluate("(() => { const s = document.querySelector('#results'); scrollTo(0, s.getBoundingClientRect().top + scrollY + (s.offsetHeight - innerHeight) * 0.12); })()")
        page.wait_for_timeout(800)
        shown = page.evaluate("[...document.querySelectorAll('.odometer__number')].map((n) => [...n.querySelectorAll('.odometer__strip')].map((s) => Math.round(-parseFloat(s.style.transform.replace('translateY(', '')))).join(''))")
        check('reduced motion: the counters simply show 14 and 2', shown == ['14', '2'], str(shown))
        ctx.close()

        # --- the sweep: every scroll position, for what only shows on the way between beats ------------------
        ctx, page, errors = open_page(1890, 940)
        total = page.evaluate('document.documentElement.scrollHeight - innerHeight')
        # only what the page lays over the city: the city itself has edges of its own, and is hidden here
        page.add_style_tag(content='.stage__canvas { visibility: hidden !important } body { background: #050816 !important }')
        worst = (0, 0, 0)
        crowded = 0
        steps = 50
        for i in range(steps + 1):
            y = int(total * i / steps)
            page.evaluate(f'scrollTo(0, {y})')
            page.wait_for_timeout(450)
            img = Image.open(io.BytesIO(page.screenshot(timeout=180000))).convert('RGB')
            if args.shots:
                img.resize((472, 235)).save(f'{args.shots}/sweep-{i:02d}.png')
            step, row = hard_line(img.crop((0, 70, img.width, img.height - 110)))
            boxes = page.evaluate("""[...document.querySelectorAll('#main .track__panel, #main .chapter__panel, #main .closing__inner, #main .trust__panel')].filter((p) => {
                const r = p.getBoundingClientRect(); return +getComputedStyle(p).opacity > 0.05 && r.bottom > 60 && r.top < innerHeight - 20; }).length""")
            crowded = max(crowded, boxes)
            if step > worst[0]:
                worst = (step, y, row + 70)
        print(f'     strongest line across the frame: {worst[0]} at scroll {worst[1]}, row {worst[2]}')
        check('one chapter at a time: never two boxes on screen at once', crowded <= 1, str(crowded))
        check('no layer of the page draws a hard line across the city, anywhere down it', worst[0] < 14, str(worst))
        ctx.close()
        browser.close()

    print(f'\n{sum(results)}/{len(results)} checks passed')
    return 0 if all(results) else 1


if __name__ == '__main__':
    sys.exit(main())
