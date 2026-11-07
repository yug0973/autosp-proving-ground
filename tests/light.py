"""The calm phone page, and how a visit gets it, checked in a real browser.

    python tests/light.py [--base URL] [--flags=FLAG,FLAG] [--shots DIR]

  - Who gets what: phones and portrait tablets get the calm page; 1024 wide and up the cinematic one; a
    wide screen without WebGL the calm page. Resizing keeps what the visit started with.
  - The calm page never asks for GSAP or three.js and never makes a WebGL context, and shows no city. The
    cinematic page never fetches the sky.
  - Lenis runs and the scroll really glides; frame times are reported with the processor slowed 4x.
  - The sky goes from night to dawn with no words on the change: every piece of text, read off the real
    pixels at each scroll position, keeps at least 4.5:1.
  - The whole message is there, with the benchmark caveat, and nothing overflows the screen.
  - The form opens its email; the links land where they say, with focus; targets take a thumb.
  - Reduced motion: no Lenis and nothing waits. No script (on a build): a complete, readable page.

Needs the dev server up. Exits 1 if a check fails.
"""
import argparse
import io
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

GPU = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--headless=new']
HEAVY = ('world-stage', '/three', 'three.', 'gsap', 'modules/cinematic', 'scroll.ts')
PHONE = {'viewport': {'width': 390, 'height': 844}, 'is_mobile': True, 'has_touch': True}
TABLET = {'viewport': {'width': 768, 'height': 1024}, 'is_mobile': True, 'has_touch': True}
COUNT_CONTEXTS = """
  window.__contexts = 0;
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
    if (String(kind).startsWith('webgl')) window.__contexts += 1;
    return original.call(this, kind, ...rest);
  };
"""
# Every piece of running text fully on the screen, with its box and colour
TEXTS = """() => {
  const out = [];
  const walk = document.createTreeWalker(document.querySelector('.calm'), NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement;
    if (!n.textContent.trim() || seen.has(el) || el.closest('option, .calm__skip, .calm-button, textarea, select')) continue;
    seen.add(el);
    const range = document.createRange();
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    // what is still coming up out of the mist at the foot of the screen is on its way to being read
    if (r.width < 2 || r.top < 0 || r.bottom > innerHeight * 0.66) continue;
    const c = getComputedStyle(el);
    out.push({ text: n.textContent.trim().slice(0, 32), box: [r.left, r.top, r.right, r.bottom], colour: c.color.match(/[\\d.]+/g).slice(0, 3).map(Number) });
  }
  return out;
}"""
TARGETS = """() => {
  const small = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('.calm a[href], .calm button, .calm input, .calm select, .calm textarea')) {
    const box = el.closest('label') ?? el;
    // the skip link appears on focus; a control that is not displayed at all (the form's bot trap) is no target
    if (seen.has(box) || el.matches('.calm__skip') || box.getClientRects().length === 0) continue;
    seen.add(box);
    const r = box.getBoundingClientRect();
    if (r.height < 43.5 || r.width < 43.5) small.push(`${el.tagName} ${(el.textContent || el.name).trim().slice(0, 20)} ${r.width.toFixed(0)}x${r.height.toFixed(0)}`);
  }
  return small;
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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://127.0.0.1:5173/')
    ap.add_argument('--flags')
    ap.add_argument('--shots')
    args = ap.parse_args()

    with sync_playwright() as p:
        browser = p.chromium.launch(args=args.flags.split(',') if args.flags else GPU)

        def open_page(init=COUNT_CONTEXTS, **options):
            ctx = browser.new_context(**options)
            ctx.add_init_script(init)
            page = ctx.new_page()
            errors, asked = [], []
            page.on('pageerror', lambda e: errors.append(str(e)[:300]))
            page.on('console', lambda m: m.type == 'error' and errors.append(m.text[:300]))
            page.on('request', lambda r: asked.append(r.url))
            page.goto(args.base, wait_until='networkidle')
            page.wait_for_timeout(500)
            return ctx, page, errors, asked

        def heavy(asked):
            return [u.rsplit('/', 1)[-1][:40] for u in asked if any(k in u for k in HEAVY)]

        def experience(page):
            return page.evaluate('document.documentElement.dataset.experience')

        # --- who gets what -----------------------------------------------------------------------
        for label, options in (('phone', PHONE), ('portrait tablet', TABLET)):
            ctx, page, errors, asked = open_page(**options)
            check(f'{label}: the calm page', experience(page) == 'light', experience(page))
            check(f'{label}: no GSAP and no three.js', not heavy(asked), str(heavy(asked)))
            check(f'{label}: no WebGL context', page.evaluate('window.__contexts') == 0)
            check(
                f'{label}: nothing of the cinematic page shows',
                page.evaluate("[...document.querySelectorAll('.stage, #main, .strip, .rail, .foot')].every((e) => getComputedStyle(e).display === 'none')"),
            )
            check(f'{label}: the sky is there', 'sky-night' in page.evaluate("getComputedStyle(document.querySelector('.sky--night')).backgroundImage"))
            sideways = page.evaluate('document.documentElement.scrollWidth - innerWidth')
            check(f'{label}: no sideways scroll', sideways <= 0, str(sideways))
            over = page.evaluate(
                """[...document.querySelectorAll('.calm h1, .calm h2, .calm p, .calm dt, .calm dd, .calm a, .calm button, .calm input')]
                   .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && !e.matches('.calm__skip') && (r.right > innerWidth + 0.5 || r.left < -6); })
                   .map((e) => e.textContent.trim().slice(0, 24))"""
            )
            check(f'{label}: nothing runs off the screen', not over, str(over))
            print(f"     {label}: {page.evaluate('document.documentElement.scrollHeight / innerHeight'):.1f} screens long")
            check(f'{label}: no script errors', not errors, '; '.join(errors)[:200])
            if args.shots:
                page.screenshot(path=f'{args.shots}/calm-{label.replace(" ", "-")}.png', timeout=180000)
            if label == 'phone':
                page.set_viewport_size({'width': 1280, 'height': 900})
                page.wait_for_timeout(600)
                check('window widened: stays calm, nothing heavy fetched', experience(page) == 'light' and not heavy(asked), str(heavy(asked)))
            ctx.close()

        ctx, page, errors, asked = open_page(viewport={'width': 1024, 'height': 768})
        page.wait_for_function("document.documentElement.dataset.world === 'live'", timeout=120000)
        check('1024 wide: the cinematic page with its world', experience(page) == 'cinematic')
        check('cinematic: the sky is never fetched', not [u for u in asked if '/sky-' in u])
        check('cinematic: the calm page is not shown', page.evaluate("getComputedStyle(document.querySelector('.calm')).display") == 'none')
        page.set_viewport_size({'width': 800, 'height': 700})
        page.wait_for_timeout(600)
        check('window narrowed: stays cinematic', experience(page) == 'cinematic')
        check('cinematic: no script errors', not errors, '; '.join(errors)[:200])
        ctx.close()

        ctx, page, errors, asked = open_page(init='HTMLCanvasElement.prototype.getContext = () => null', viewport={'width': 1440, 'height': 900})
        check('wide without WebGL: the calm page', experience(page) == 'light')
        check('wide without WebGL: nothing heavy fetched', not heavy(asked), str(heavy(asked)))
        check('wide without WebGL: no sideways scroll', page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        check('wide without WebGL: no script errors', not errors, '; '.join(errors)[:200])
        if args.shots:
            page.screenshot(path=f'{args.shots}/calm-wide.png', timeout=180000)
        ctx.close()

        # --- the page itself, on a phone -------------------------------------------------------------
        ctx, page, errors, asked = open_page(**PHONE)
        hero = page.evaluate("(() => { const b = document.querySelector('.calm-hero .calm-button').getBoundingClientRect(); return { title: document.querySelector('.calm h1').textContent, bottom: b.bottom, h: innerHeight }; })()")
        check('the first screen has the title', hero['title'] == 'Verified fixes for the findings your scanner keeps reporting.', hero['title'])
        check('and the action', hero['bottom'] <= hero['h'], str(hero))
        clear = page.evaluate("(() => { const b = document.querySelector('.calm-hero .calm-button').getBoundingClientRect(); const m = document.querySelector('.calm__mist').getBoundingClientRect(); return b.bottom <= m.top + m.height * 0.3; })()")
        check('with the mist still low beneath it', clear)
        links = page.evaluate("[...document.querySelectorAll('a')].filter((a) => a.textContent.trim() === 'Nexarise').map((a) => a.href)")
        check('every Nexarise link goes to the Nexarise site', links and all(u == 'https://nexarise-website.vercel.app/' for u in links), str(links))
        check('the closing line is gone', 'Software that rises' not in page.evaluate('document.body.textContent'))
        check('one heading level one showing', page.evaluate("[...document.querySelectorAll('h1')].filter((h) => h.getBoundingClientRect().height > 0).length") == 1)
        text = page.evaluate("document.querySelector('.calm').textContent.replace(/\\s+/g, ' ')")
        for words in (
            'It has to fail first',
            'Written where it can’t reach anything',
            'Any one of three checks',
            'and a fresh static scan has to come back clear',
            'Every merge is made by a person',
            'A record you can’t quietly change',
            'Early results, on test applications',
            '14/16',
            '2/2',
            'not a benchmark',
            'For teams with a scanner backlog',
            'Nothing touches your code',
        ):
            check(f'the page says: {words}', words in text)
        dots = page.evaluate("[...document.querySelectorAll('.calm-matrix i')].map((d) => d.dataset.kind)")
        check('fourteen lime squares and two amber', dots.count('fixed') == 14 and dots.count('held') == 2)
        lead = page.evaluate("(() => { const a = document.querySelector('.calm-results__lead dt').getBoundingClientRect(); const b = document.querySelector('.calm-results__lead dd').getBoundingClientRect(); return b.top >= a.bottom - 1; })()")
        check('the big number stands clear of its sentence', lead)
        name = page.evaluate("(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('.calm-foot__name')); return r.getBoundingClientRect().right <= innerWidth; })()")
        check('the name at the close fits the screen', name)
        small = page.evaluate(TARGETS)
        check('every target takes a thumb', not small, '; '.join(small)[:300])
        zoom = page.evaluate("[...document.querySelectorAll('.calm :is(input:not([type=checkbox]), select, textarea)')].filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).length")
        check('no field makes a phone zoom when it takes focus', zoom == 0, str(zoom))
        body = page.evaluate("parseFloat(getComputedStyle(document.querySelector('.calm-step__text p')).fontSize)")
        check('running text is at least 18px', body >= 18, f'{body}px')

        # --- Lenis, and the sky ------------------------------------------------------------------------
        check('Lenis is running', page.evaluate("document.documentElement.classList.contains('lenis')"))
        sky = "[+document.querySelector('.sky--predawn').style.opacity, +document.querySelector('.sky--dawn').style.opacity]"
        check('it starts at night', page.evaluate(sky) == [0, 0], str(page.evaluate(sky)))
        total, screen = page.evaluate('[document.documentElement.scrollHeight, innerHeight]')
        worst = (99, '', 0)
        seen = 0
        waiting = 0
        for y in range(0, total - screen + screen // 2, screen // 2):
            page.evaluate(f'scrollTo(0, {y})')
            page.wait_for_timeout(1250)
            waiting += page.evaluate("[...document.querySelectorAll('[data-waiting]:not([data-risen])')].filter((e) => { const r = e.getBoundingClientRect(); return r.top < innerHeight * 0.85 && r.bottom > 0; }).length")
            texts = page.evaluate(TEXTS)
            tag = page.add_style_tag(content='.calm__head, .calm__main, .calm-foot { visibility: hidden !important }')
            img = Image.open(io.BytesIO(page.screenshot(timeout=180000))).convert('RGB')
            tag.evaluate('e => e.remove()')
            for t in texts:
                left, top, right, bottom = (int(v) for v in t['box'])
                crop = img.crop((max(left, 0), max(top, 0), min(right + 1, img.width), min(bottom + 1, img.height)))
                seen += 1
                # the worst of the ground behind it, leaving out the grain
                values = sorted(crop.getdata(), key=lambda q: contrast(t['colour'], q))
                ratio = contrast(t['colour'], values[len(values) // 50])
                if ratio < worst[0]:
                    worst = (ratio, t['text'], y)
        check('read off the pixels: every piece of text keeps 4.5:1, all the way down', worst[0] >= 4.5, f'{seen} readings, worst {worst[0]:.1f}:1 at "{worst[1]}", {worst[2]}px')
        check('nothing stays hidden once it has arrived', waiting == 0, str(waiting))
        check('it ends at dawn', page.evaluate(sky)[1] == 1, str(page.evaluate(sky)))
        check('and the mist has cleared off the form', page.evaluate("document.querySelector('.calm__mist').getBoundingClientRect().top >= innerHeight - 2"))
        check('no script errors, all the way down', not errors, '; '.join(errors)[:200])

        # --- getting around, and the form ---------------------------------------------------------------
        page.evaluate('scrollTo(0, 0)')
        page.wait_for_timeout(600)
        page.locator('.calm-hero .calm-button').tap()
        page.wait_for_timeout(350)
        moving = page.evaluate('scrollY')
        page.wait_for_timeout(2400)
        s = page.evaluate("(() => ({ top: document.querySelector('#pilot').getBoundingClientRect().top, focus: document.activeElement.id, y: scrollY }))()")
        check('the action glides down to the form', 0 < moving < s['y'], f"{moving:.0f} on the way to {s['y']:.0f}")
        check('and lands on it, with focus', abs(s['top'] - 48) < 4 and s['focus'] == 'pilot', str(s))
        form = 'document.querySelector("[data-calm-apply]")'
        check('an empty form does not send', not page.evaluate(f'{form}.checkValidity()'))
        check('the mailto is there for readers without script', page.evaluate(f'{form}.getAttribute("action")').startswith('mailto:nexarise.office@gmail.com'))
        sent = []
        page.route('https://api.web3forms.com/submit', lambda route, request: (sent.append(request.post_data or ''), route.fulfill(
            status=200, content_type='application/json', body='{"success":true}')))
        page.fill('.calm-form input[name=name]', 'Pat')
        page.fill('.calm-form input[name=email]', 'pat@initech.example')
        page.fill('.calm-form input[name=company]', 'Initech')
        page.select_option('.calm-form select[name=team]', '20 to 150')
        page.locator('.calm-check', has_text='Semgrep').tap()
        mode = page.evaluate(f'{form}.dataset.send')
        page.locator('.calm-form button[type=submit]').tap()
        page.wait_for_timeout(600)
        if mode == 'direct':
            body = sent[0] if sent else ''
            check('the form sends straight to the inbox', 'Initech' in body and 'Semgrep' in body and 'pat@initech.example' in body, body[:90])
            check('and says it was sent', page.is_visible('.calm-pilot .apply__done'))
        else:
            mail = page.evaluate(f'{form}.dataset.mailto ?? ""')
            check('without a key, the form composes its email', 'Initech' in mail and 'Semgrep' in mail and '20%20to%20150' in mail, mail[:90])
            check('and says what happened', 'email app' in page.evaluate("document.querySelector('[data-calm-apply] [data-apply-status]').textContent"))
        if args.shots:
            page.screenshot(path=f'{args.shots}/calm-form.png', timeout=180000)
        ctx.close()

        # --- the wheel, and frame times --------------------------------------------------------------------
        ctx, page, errors, asked = open_page(viewport={'width': 800, 'height': 900})
        page.mouse.move(400, 400)
        page.mouse.wheel(0, 700)
        page.wait_for_timeout(120)
        early = page.evaluate('scrollY')
        page.wait_for_timeout(1500)
        late = page.evaluate('scrollY')
        check('a wheel turn glides rather than jumps', 0 < early < late * 0.8, f'{early:.0f} then {late:.0f}')
        ctx.close()

        ctx, page, errors, asked = open_page(**PHONE)
        cdp = ctx.new_cdp_session(page)
        cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
        page.evaluate(
            """() => { window.__times = []; let last = performance.now(); const f = (t) => { window.__times.push(t - last); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f);
                 const end = document.documentElement.scrollHeight - innerHeight; let at = 0;
                 window.__walk = setInterval(() => { at = Math.min(at + 24, end); scrollTo(0, at); if (at >= end) clearInterval(window.__walk); }, 16); }"""
        )
        page.wait_for_timeout(7000)
        times = sorted(page.evaluate('window.__times.slice(5)'))
        if times:
            print(f'     frames, processor slowed 4x: median {times[len(times) // 2]:.1f} ms, 95th {times[int(len(times) * 0.95)]:.1f} ms, worst {times[-1]:.1f} ms, {len(times)} frames')
        check('holds 30fps on a slowed phone', times and times[int(len(times) * 0.95)] < 34, f'{times[int(len(times) * 0.95)]:.1f} ms' if times else 'no frames')
        ctx.close()

        # --- reduced motion ---------------------------------------------------------------------------------
        ctx, page, errors, asked = open_page(reduced_motion='reduce', **PHONE)
        check('reduced motion: no Lenis', not page.evaluate("document.documentElement.classList.contains('lenis')"))
        check('reduced motion: nothing waits to rise', page.evaluate("document.querySelectorAll('[data-waiting]').length") == 0)
        page.evaluate('scrollTo(0, document.documentElement.scrollHeight)')
        page.wait_for_timeout(200)
        check('reduced motion: the sky still reaches dawn', page.evaluate("+document.querySelector('.sky--dawn').style.opacity") == 1)
        check('reduced motion: no script errors', not errors, '; '.join(errors)[:200])
        ctx.close()

        # --- no script at all -----------------------------------------------------------------------------------
        ctx = browser.new_context(java_script_enabled=False, **PHONE)
        page = ctx.new_page()
        page.goto(args.base, wait_until='networkidle')
        # the dev server brings its styles in through script, so this means something only on a build
        if page.locator('link[rel=stylesheet]').count() == 0:
            print('     no script: skipped on the dev server; run against a build')
        else:
            check('no script: the title is there', page.locator('.calm h1').is_visible())
            check('no script: the stage is not', not page.locator('.stage').is_visible())
            check('no script: the numbers are there', page.locator('.calm-results__lead dt').is_visible())
            check('no script: the form is there', page.locator('.calm-form button[type=submit]').is_visible())
            if args.shots:
                page.screenshot(path=f'{args.shots}/calm-noscript.png', timeout=180000, full_page=True)
        ctx.close()
        browser.close()

    print(f'\n{sum(results)}/{len(results)} checks passed')
    return 0 if all(results) else 1


if __name__ == '__main__':
    sys.exit(main())
