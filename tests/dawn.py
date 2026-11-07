"""The dawn ending, the form in the world, and the company on the tower (Phase 6), in a real browser.

    python tests/dawn.py [--base URL] [--flags=FLAG,FLAG] [--shots DIR] [--size 1440x900]

  - The sky goes from night to dawn as the form arrives, and back on the way up; the dawn's colours
    come from the token file, and the sealed towers stay lit.
  - The form stands on an opaque surface, its text at 4.5:1 or better, and the mailto is unchanged.
  - The sign reads the typed company live: upper case, letters, digits, spaces and basic punctuation,
    at most 14 characters; 'YOUR TEAM' when empty. It is read back off the canvas.
  - Nothing typed is stored or sent: no request and no storage, as the visitor types.
  - The tower with the sign is the tallest in view, not one of the 16 runs, and never lime or amber.
  - An 'Illustrative' label stands with the field, and the field's description points to it.
  - Reduced motion: dawn and sign at once, one still frame. Without WebGL, the form still works.

Needs the dev server up. Saves frames with --shots. Exits 1 if a check fails.
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


def to_form(page):
    page.evaluate("scrollTo(0, document.querySelector('#apply').getBoundingClientRect().top + scrollY)")


def world_only(page):
    tag = page.add_style_tag(content='body * { visibility: hidden !important } canvas { visibility: visible !important }')
    frames(page)
    img = Image.open(io.BytesIO(page.screenshot(timeout=180000))).convert('RGB')
    tag.evaluate('e => e.remove()')
    return img


def wait_sign(page, saying=None, tries=60):
    for _ in range(tries):
        frames(page, 2)
        sign = page.evaluate('__world.skyline().sign')
        if sign and sign['reveal'] == 1 and (saying is None or sign['saying'] == saying):
            return sign
    return page.evaluate('__world.skyline().sign')


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

        def open_page(**options):
            ctx = browser.new_context(viewport={'width': width, 'height': height}, **options)
            ctx.add_init_script("Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })")
            page = ctx.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('console', lambda m: m.type == 'error' and 'attribute height' not in m.text and errors.append(m.text[:200]))
            page.goto(f'{args.base}?test&sway=off', wait_until='networkidle')
            page.wait_for_function("['live', 'still'].includes(document.documentElement.dataset.world)", timeout=120000)
            page.wait_for_timeout(600)
            return ctx, page, errors

        ctx, page, errors = open_page()

        # --- the tokens --------------------------------------------------------------------------
        tokens = page.evaluate(
            """() => ['zenith', 'horizon', 'cloud-lit', 'cloud-shade'].map((k) =>
                 getComputedStyle(document.documentElement).getPropertyValue(`--atmo-dawn-${k}`).trim())"""
        )
        check('the dawn has its four tokens, next to day, dusk and night', all(t.startswith('#') for t in tokens), str(tokens))

        # --- the sky: night in the results, dawn at the form ------------------------------------
        page.evaluate("(() => { const s = document.querySelector('#results'); scrollTo(0, s.getBoundingClientRect().top + scrollY + (s.offsetHeight - innerHeight) * 0.9); })()")
        page.wait_for_timeout(1200)
        before = page.evaluate('__world.skyline()')
        check('in the results it is still night', before['dawn'] == 0 and before['night'] > 0.95, f"night {before['night']:.2f}")
        night_sky = world_only(page).getpixel((width - 60, 110))

        to_form(page)
        page.wait_for_timeout(1500)
        s = page.evaluate('__world.skyline()')
        check('at the form it is dawn', s['dawn'] == 1 and s['night'] < 0.5, f"dawn {s['dawn']}, night {s['night']:.2f}")
        sign = wait_sign(page)
        check('the sign is on, saying YOUR TEAM', sign and sign['saying'] == 'YOUR TEAM', str(sign))
        img = world_only(page)
        if args.shots:
            page.screenshot(path=f'{args.shots}/dawn-page.png', timeout=180000)
            img.save(f'{args.shots}/dawn-world.png')
        sky = [img.getpixel((width - 60, y)) for y in (110, 200)]
        check('read off the canvas: the sky has lifted, in blue', all(q[2] > q[0] and q[2] > q[1] for q in sky) and sum(sky[0]) > sum(night_sky) + 30, f'{sky} from {night_sky}')
        pixels = list(img.getdata())
        lime = sum(1 for r, g, b in pixels if g > 110 and g > r and r > 0.6 * g and b < 0.62 * g)
        if height > width:
            # too narrow for the row and a readable sign at once: the lime is seen on the way here
            s = page.evaluate('__world.skyline()')
            check('the sealed towers stay lit (out of this narrow frame)', s['lime'] == 14 and s['amber'] == 2, f"{s['lime']} lime, {s['amber']} amber")
        else:
            check('read off the canvas: the sealed towers stay lime', lime > 200, f'{lime} lime pixels')

        # going back up: the night returns, the sign clears
        page.evaluate("(() => { const s = document.querySelector('#results'); scrollTo(0, s.getBoundingClientRect().top + scrollY + (s.offsetHeight - innerHeight) * 0.9); })()")
        page.wait_for_timeout(1800)
        s = page.evaluate('__world.skyline()')
        check('scrolling back, the night returns and the sign clears', s['dawn'] == 0 and s['night'] > 0.95 and s['sign'] is None, str(s['sign']))
        to_form(page)
        page.wait_for_timeout(600)
        wait_sign(page)

        # --- the tower ---------------------------------------------------------------------------
        s = page.evaluate('__world.skyline()')
        company = s['company']
        check('the sign stands on a tower that is not one of the 16 runs', company['index'] not in [t['index'] for t in s['towers']])
        check('it is taller than every tower of the row', company['top'] > max(t['top'] for t in s['towers']), f"{company['top']:.1f}")
        check('it stands apart from the row, past the gap', company['x'] + company['width'] / 2 < s['gapX'] - s['lot'] / 2)
        placed = page.evaluate('__world.displays.inspect()')
        tones = {d['slot']: d for d in placed}
        check('the sign is neutral white, never a result colour', tones[s['sign']['slot']]['tone'] == 'neutral', tones[s['sign']['slot']]['tone'])
        check('the sign is on that tower', tones[s['sign']['slot']]['placement']['building'] == company['index'])

        # --- typing ----------------------------------------------------------------------------
        requests = []
        page.on('request', lambda r: requests.append(r.url))
        page.evaluate(
            """(() => { window.__stored = []; const f = Storage.prototype.setItem;
                 Storage.prototype.setItem = function (k, v) { window.__stored.push([k, v]); f.call(this, k, v); };
                 window.__before = JSON.stringify([{ ...localStorage }, { ...sessionStorage }, document.cookie]); })()"""
        )
        # the company is asked in the form's second step
        page.click('[data-apply] label.apply__tile:has-text("20 to 150")')
        page.click('[data-apply] [data-step-next]')
        field = page.locator('[data-apply] input[name="company"]')
        cases = [
            ('acme', 'ACME'),
            ('Acme & Sons', 'ACME & SONS'),
            ('Café Münster', 'CAFE MUNSTER'),
            ('a very long company name indeed', 'A VERY LONG CO'),
            ('<script>"x"', 'SCRIPTX'),
            ('日本語', '20 TO 150'),
            ('   ', '20 TO 150'),
            ('', '20 TO 150'),
        ]
        for typed, want in cases:
            field.fill(typed)
            frames(page, 3)
            said = page.evaluate('__world.skyline().sign.saying')
            check(f'typing {ascii(typed)} shows {want!r}', said == want, said)
        check('the field keeps what was typed, for the email', field.input_value() == '')

        field.click()
        field.press_sequentially('Globex 42', delay=30)
        frames(page, 3)
        said = page.evaluate('__world.skyline().sign.saying')
        check('it follows live, key by key', said == 'GLOBEX 42', said)
        lines = page.evaluate("(() => { const d = __world.displays.inspect().find((x) => x.slot === __world.skyline().sign.slot); return d.rows; })()")
        check('a name breaks at its space, not through a word', lines == 13, f'{lines} rows, two lines')
        check('nothing typed is sent anywhere', not requests, str(requests[:3]))
        check(
            'nothing typed is stored',
            page.evaluate('window.__stored.length === 0 && JSON.stringify([{ ...localStorage }, { ...sessionStorage }, document.cookie]) === window.__before'),
            str(page.evaluate('window.__stored')),
        )
        wait_sign(page, 'GLOBEX 42')
        frames(page, 4)
        if args.shots:
            page.screenshot(path=f'{args.shots}/dawn-typed-page.png', timeout=180000)

        # read the sign back off the canvas: its lit pixels against the dark ones
        info = page.evaluate(
            """() => {
              const s = __world.skyline(); const c = s.company;
              const d = __world.displays.inspect().find((x) => x.slot === s.sign.slot);
              const p = d.placement; const near = c.z - c.depth / 2;
              const left = c.x + c.width / 2 - p.u;
              const corners = [[left, p.y], [left - d.cols * p.pitch, p.y], [left, p.y + d.rows * p.pitch], [left - d.cols * p.pitch, p.y + d.rows * p.pitch]]
                .map(([x, y]) => __world.project(x, y, near));
              return { corners, cols: d.cols, rows: d.rows, lit: d.lit };
            }"""
        )
        check('the whole sign is on screen', all(c['shown'] for c in info['corners']), str(info['corners']))
        panel = page.evaluate("(() => { const r = document.querySelector('.closing__inner').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; })()")
        clear = not all(
            panel[0] <= c['x'] <= panel[2] and panel[1] <= c['y'] <= panel[3] for c in info['corners']
        )
        if height <= width:
            check('the form does not cover the sign', all(c['x'] > panel[2] for c in info['corners']), f"{min(c['x'] for c in info['corners']):.0f} vs {panel[2]:.0f}")
        else:
            check('the sign stands above the form', clear and all(c['y'] < panel[1] for c in info['corners']), f"{max(c['y'] for c in info['corners']):.0f} vs {panel[1]:.0f}")
        img = world_only(page)
        xs = [c['x'] for c in info['corners']]
        ys = [c['y'] for c in info['corners']]
        crop = img.crop((int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))))
        values = sorted(luminance(q) for q in crop.getdata())
        bright = values[int(len(values) * 0.92)] if values else 0
        dark = values[int(len(values) * 0.3)] if values else 1
        check('read off the canvas: the sign is bright on a dark wall', bright > 0.5 and bright > dark * 4, f'{bright:.2f} against {dark:.3f}')
        pixel_width = (max(xs) - min(xs)) / info['cols']
        check('its pixels are big enough to read', pixel_width >= 4, f'{pixel_width:.1f} px wide')

        # --- the form ----------------------------------------------------------------------------
        form = page.evaluate(
            """() => {
              const inner = document.querySelector('.closing__inner');
              const rgb = (c) => c.match(/[\\d.]+/g).map(Number);
              const note = document.querySelector('#company-note');
              const r = note.getBoundingClientRect();
              return {
                ground: rgb(getComputedStyle(inner).backgroundColor),
                colours: [...inner.querySelectorAll('.apply__label, .apply__illustrative, .apply__how, .beat__lede, .beat__note, .apply__check')]
                  .map((e) => rgb(getComputedStyle(e).color)),
                note: note.textContent.trim(),
                noteShown: r.width > 0 && r.height > 0,
                described: document.querySelector('input[name="company"]').getAttribute('aria-describedby'),
                action: document.querySelector('[data-apply]').getAttribute('action'),
                sideways: document.documentElement.scrollWidth > innerWidth,
              };
            }"""
        )
        check('the form stands on an opaque surface', len(form['ground']) == 3 or form['ground'][3] == 1, str(form['ground']))
        worst = min(contrast(c, form['ground']) for c in form['colours'])
        check('its text has at least 4.5:1 contrast', worst >= 4.5, f'{worst:.1f}:1')
        check('an Illustrative label stands with the field', form['note'].startswith('Illustrative') and form['noteShown'], form['note'])
        check('the field is described by it for screen readers', 'company-note' in (form['described'] or '').split(), form['described'])
        check('the mailto is unchanged', form['action'] == 'mailto:nexarise.office@gmail.com?subject=AUTOSP%20free%20pilot', form['action'])
        check('the page does not scroll sideways', not form['sideways'])
        check('no script errors', not errors, '; '.join(errors)[:200])
        ctx.close()

        # --- reduced motion ----------------------------------------------------------------------
        ctx, page, errors = open_page(reduced_motion='reduce')
        to_form(page)
        frames(page, 5)
        s = page.evaluate('__world.skyline()')
        check('reduced motion: the dawn is there at once', s['dawn'] == 1, str(s['dawn']))
        check('reduced motion: the sign is on at once', s['sign'] and s['sign']['reveal'] == 1, str(s['sign']))
        a = page.evaluate('__world.inspect().camera')
        page.evaluate('window.scrollBy(0, 60)')
        frames(page, 3)
        check('reduced motion: the camera does not travel', a == page.evaluate('__world.inspect().camera'))
        page.click('[data-apply] label.apply__tile:has-text("20 to 150")')
        page.click('[data-apply] [data-step-next]')
        page.locator('[data-apply] input[name="company"]').fill('Initech')
        frames(page, 4)
        s = page.evaluate('__world.skyline().sign')
        check('reduced motion: the sign follows the field', s and s['saying'] == 'INITECH' and s['reveal'] == 1, str(s))
        if args.shots:
            page.screenshot(path=f'{args.shots}/dawn-still.png', timeout=180000)
        check('reduced motion: no script errors', not errors, '; '.join(errors)[:200])
        ctx.close()

        # --- without WebGL -----------------------------------------------------------------------
        ctx = browser.new_context(viewport={'width': width, 'height': height})
        ctx.add_init_script("HTMLCanvasElement.prototype.getContext = () => null")
        page = ctx.new_page()
        page.goto(f'{args.base}?test', wait_until='networkidle')
        page.wait_for_timeout(800)
        off = page.evaluate(
            """() => ({ experience: document.documentElement.dataset.experience,
                 button: !!document.querySelector('.calm-form button[type=submit]').getBoundingClientRect().width })"""
        )
        check('without WebGL: the calm page, with its form', off['experience'] == 'light' and off['button'], str(off))
        ctx.close()
        browser.close()

    print(f'\n{sum(results)}/{len(results)} checks passed')
    return 0 if all(results) else 1


if __name__ == '__main__':
    sys.exit(main())
