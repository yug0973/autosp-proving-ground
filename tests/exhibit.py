"""One Fix, the exhibition at /: checked in a real browser.

  - Every word on screen keeps 4.5:1 against the pixels behind it, at every point of a full scroll
    (the walls move between rooms, so this is read off the real pixels, frame by frame).
  - The route line draws itself as the visitor goes; the amber dot rests in a room and moves between rooms.
  - Quiet mode (reduced motion, ?quiet): each room keeps its own wall, the line is whole, the dot waits.
  - No placeholder ever reaches a visitor, and no mailto or Gmail address.
  - The page's script stays within 60 KB gzipped, with no three.js or GSAP.
  - No sideways scroll on a phone, a tablet or a laptop; no console errors.

    python tests/exhibit.py --base http://127.0.0.1:4174
"""
import argparse
import gzip
import io
import sys
import urllib.request

from PIL import Image
from playwright.sync_api import sync_playwright

results = []


def check(name, ok, detail=''):
    results.append(bool(ok))
    print(f"{'PASS' if ok else 'FAIL'} {name}" + (f'  ({detail})' if detail else ''))


def lum(c):
    f = lambda v: v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(c[0] / 255) + 0.7152 * f(c[1] / 255) + 0.0722 * f(c[2] / 255)


def ratio(a, b):
    x, y = lum(a), lum(b)
    return (max(x, y) + 0.05) / (min(x, y) + 0.05)


TEXTS = """() => {
  const out = [];
  // a sticky bar at the foot of a phone's screen covers what is under it, as it is meant to
  const bar = document.querySelector('[data-apply-bar][data-up]');
  const floor = bar ? bar.getBoundingClientRect().top : innerHeight;
  const walk = document.createTreeWalker(document.querySelector('#main'), NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement;
    if (!n.textContent.trim() || el.closest('[hidden], [aria-hidden="true"], .visually-hidden, input, textarea, button, .button, .document, .exhibit-line')) continue;
    if (getComputedStyle(el).visibility !== 'visible') continue;
    const r = document.createRange(); r.selectNodeContents(n);
    for (const b of r.getClientRects()) {
      if (b.width < 3 || b.top < 2 || b.bottom > Math.min(innerHeight - 2, floor)) continue;
      const c = getComputedStyle(el).color.match(/[\\d.]+/g).slice(0, 3).map(Number);
      out.push({ text: n.textContent.trim().slice(0, 30), box: [b.left, b.top, b.right, b.bottom], colour: c });
    }
  }
  return out;
}"""

PLACEHOLDERS = ['to confirm', 'tbd', 'todo', 'placeholder', 'lorem', '%vite', 'gmail', 'mailto:', 'undefined', 'null']


def contrast_sweep(page, label, steps):
    total = page.evaluate('document.documentElement.scrollHeight - innerHeight')
    worst, read, low = (99, '', 0), 0, 0
    for i in range(steps + 1):
        y = int(total * i / steps)
        page.evaluate(f'scrollTo(0, {y})')
        page.wait_for_timeout(120)
        texts = page.evaluate(TEXTS)
        if not texts:
            continue
        tag = page.add_style_tag(content='#main * { color: transparent !important; text-shadow: none !important; transition: none !important; } .route { visibility: hidden !important }')
        page.wait_for_timeout(40)
        img = Image.open(io.BytesIO(page.screenshot())).convert('RGB')
        tag.evaluate('e => e.remove()')
        for t in texts:
            l, tp, r, bt = (int(v) for v in t['box'])
            crop = img.crop((max(l, 0), max(tp, 0), min(r + 1, img.width), min(bt + 1, img.height)))
            values = sorted(crop.getdata(), key=lambda q: ratio(t['colour'], q))
            got = ratio(t['colour'], values[len(values) // 50])  # the 2nd percentile, past stray pixels
            read += 1
            if got < 4.5:
                low += 1
            if got < worst[0]:
                worst = (got, t['text'], y)
    check(f'{label}: every word on screen keeps 4.5:1, through the whole walk', low == 0,
          f'{read} read, worst {worst[0]:.2f}:1 at "{worst[1]}" (scroll {worst[2]}), {low} below')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default='http://127.0.0.1:4174')
    parser.add_argument('--steps', type=int, default=70)
    args = parser.parse_args()
    base = args.base.rstrip('/')
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--headless=new'])

        # --- the walk, with everything moving ------------------------------------------------------------------
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
        page = ctx.new_page()
        errors, scripts = [], []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
        page.on('request', lambda r: r.resource_type == 'script' and scripts.append(r.url))
        page.goto(base + '/?quiet=0', wait_until='networkidle')
        page.wait_for_timeout(600)
        check('walls: the moving walls are on', page.evaluate("document.documentElement.hasAttribute('data-walls')"))
        check('route: hidden from assistive technology', page.evaluate("document.querySelector('.route').getAttribute('aria-hidden') === 'true'"))
        state = lambda: page.evaluate("""(() => { const l = document.querySelector('.route__line'); const d = document.querySelector('.route__dot');
            return { off: parseFloat(l.style.strokeDashoffset), dot: d.getAttribute('transform') }; })()""")
        top = state()
        page.evaluate("(() => { const r = document.querySelector('#gates'); scrollTo(0, r.offsetTop + 40); })()")
        page.wait_for_timeout(200)
        gates_a = state()
        page.evaluate("(() => { const r = document.querySelector('#gates'); scrollTo(0, r.offsetTop + 160); })()")
        page.wait_for_timeout(200)
        gates_b = state()
        check('route: the line draws itself as the visitor goes', gates_a['off'] < top['off'], f"{top['off']:.0f} then {gates_a['off']:.0f}")
        check('dot: it rests in a room while the visitor reads it', gates_a['dot'] == gates_b['dot'], f"{gates_a['dot']} / {gates_b['dot']}")
        check('dot: it has travelled from the case', gates_a['dot'] != top['dot'])
        page.evaluate("(() => { const r = document.querySelector('#proof'); scrollTo(0, r.offsetTop + 100); })()")
        page.wait_for_timeout(200)
        check('walls: the projection room keeps its own dark wall, entered through a doorway',
              page.evaluate("getComputedStyle(document.querySelector('#proof')).backgroundColor") == 'rgb(38, 48, 63)'
              and page.evaluate("getComputedStyle(document.querySelector('#finding')).backgroundColor") == 'rgba(0, 0, 0, 0)')
        contrast_sweep(page, 'laptop', args.steps)
        text = page.evaluate("document.body.innerText.toLowerCase() + ' ' + document.body.innerHTML.toLowerCase().replace(/<[^>]+>/g, ' ')")
        found = [w for w in PLACEHOLDERS if w in page.evaluate('document.body.innerText.toLowerCase()')]
        check('no placeholder, mailto or Gmail address on the page', not found and 'mailto:' not in text, ', '.join(found))
        heavy = [u for u in scripts if any(k in u for k in ('three', 'gsap', 'world-stage', 'cinematic'))]
        check('script: no three.js, GSAP or the city on this page', not heavy, ', '.join(heavy))
        size = 0
        for u in dict.fromkeys(scripts):
            with urllib.request.urlopen(u) as r:
                size += len(gzip.compress(r.read(), 9))
        check('script: within 60 KB gzipped', size <= 60 * 1024, f'{size / 1024:.1f} KB')
        check('laptop: no script errors', not errors, '; '.join(errors)[:200])
        ctx.close()

        # --- each room's moment ----------------------------------------------------------------------------------
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
        page = ctx.new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto(base + '/?quiet=0', wait_until='networkidle')
        page.wait_for_timeout(400)
        height = page.evaluate('document.documentElement.scrollHeight')
        waiting = page.evaluate("document.querySelectorAll('[data-run] .line--wait').length")
        check('proof: before the room is reached, the run is waiting', waiting >= 5, str(waiting))
        page.evaluate("scrollTo(0, document.querySelector('#proof').offsetTop + 120)")
        page.wait_for_timeout(500)
        mid = page.evaluate("document.querySelectorAll('[data-run] .line--wait').length")
        page.wait_for_timeout(2200)
        end = page.evaluate("[document.querySelectorAll('[data-run] .line--wait').length, document.querySelector('[data-run-status]').textContent]")
        check('proof: the run types out line by line', 0 < mid < waiting and end[0] == 0, f'{waiting}, {mid}, then {end[0]}')
        check('proof: and says the test failed', 'failed' in end[1], end[1])
        page.click('[data-run-again]')
        page.wait_for_timeout(150)
        again = page.evaluate("document.querySelectorAll('[data-run] .line--wait').length")
        check('proof: "Run it again" runs it again', again > 0, str(again))
        page.evaluate("scrollTo(0, document.querySelector('#clean-room').offsetTop + 120)")
        page.wait_for_timeout(5200)
        clean = page.evaluate("[document.querySelector('[data-sandbox]').dataset.stage, document.querySelector('[data-sandbox-job]').textContent, document.querySelectorAll('[data-patch] .line--wait').length]")
        check('clean room: sealed, the patch written, and the case empty at the end', clean[0] == 'empty' and 'empty' in clean[1] and clean[2] == 0, str(clean))
        page.evaluate("scrollTo(0, document.querySelector('#gates').offsetTop + 380)")
        page.wait_for_timeout(3400)
        gates = page.evaluate("""[document.querySelector('[data-gates-status]').textContent,
            [...document.querySelectorAll('[data-verdict]')].map((v) => getComputedStyle(v).visibility === 'visible'),
            [...document.querySelectorAll('[data-case=careless] .gates-route span')].map((s) => s.textContent)]""")
        check('gates: the careless fix is rejected at the third gate, AUTOSP\'s accepted, and both are said aloud',
              'rejected at the third gate' in gates[0] and 'accepted' in gates[0] and gates[1] == [True, True]
              and gates[2][2].startswith('Refused'), str(gates)[:160])
        page.click('[data-light=autosp]')
        page.wait_for_timeout(3200)
        lit = page.evaluate("""[document.querySelector('#gates').dataset.lit, document.querySelector('[data-light=autosp]').getAttribute('aria-pressed'),
            document.querySelector('[data-gates-status]').textContent, getComputedStyle(document.querySelector('[data-case=careless]')).opacity]""")
        check('gates: lighting a case lights it, says so, and leaves the other fully readable',
              lit[0] == 'autosp' and lit[1] == 'true' and 'accepted' in lit[2] and lit[3] == '1', str(lit))
        # the guestbook: real fingerprints, tampering, the ink, restoring
        page.evaluate("document.querySelector('[data-guestbook]').scrollIntoView({ block: 'center' })")
        page.wait_for_timeout(400)
        printed = page.evaluate("[...document.querySelectorAll('[data-entry-fp]')].slice(0, 4).map((f) => f.textContent)")
        check('guestbook: the printed fingerprints are the real SHA-256 chain, recomputed here',
              page.evaluate("[...document.querySelectorAll('[data-entry-state]')].slice(0, 4).every((s) => s.textContent === 'Sealed')")
              and printed[0].startswith('d84ab5e4'))
        page.click('[data-tamper]')
        page.wait_for_timeout(250)
        running = page.evaluate("[...document.querySelectorAll('[data-entry-fp]')].filter((f) => f.style.filter).length")
        page.wait_for_timeout(1100)
        after = page.evaluate("""[[...document.querySelectorAll('[data-entry]')].map((e) => e.hasAttribute('data-broken')),
            [...document.querySelectorAll('[data-entry-fp]')].some((f) => f.style.filter), document.querySelector('[data-guestbook-status]').textContent]""")
        check('guestbook: tampering breaks entry 2 and every fingerprint after it', after[0] == [False, True, True, True, False], str(after[0]))
        check('guestbook: their ink runs once, and the filter is taken away after', running == 3 and not after[1], f'{running} running, then {after[1]}')
        check('guestbook: and says so', '3 fingerprints no longer match' in after[2], after[2])
        page.click('[data-restore]')
        page.wait_for_timeout(500)
        check('guestbook: restoring dries the record back', page.evaluate("[...document.querySelectorAll('[data-entry]')].every((e) => !e.hasAttribute('data-broken'))")
              and 'restored' in page.text_content('[data-guestbook-status]'))

        # the signing: hold, let go early, hold through, the keyboard, a screen reader, undo
        page.evaluate("document.querySelector('[data-hold]').scrollIntoView({ block: 'center' })")
        page.wait_for_timeout(400)
        box = page.query_selector('[data-hold]').bounding_box()
        page.mouse.move(box['x'] + 30, box['y'] + 20)
        page.mouse.down()
        page.wait_for_timeout(600)
        page.mouse.up()
        page.wait_for_timeout(900)
        check('signing: letting go early cancels, and the ink draws back', not page.evaluate("document.querySelector('#signing').hasAttribute('data-signed')")
              and 'Nothing was signed' in page.text_content('[data-hold-status]')
              and page.evaluate("parseFloat(document.querySelector('[data-signature]').style.strokeDashoffset) > 100"))
        page.mouse.down()
        page.wait_for_timeout(1900)
        page.mouse.up()
        page.wait_for_timeout(500)
        signed = page.evaluate("""[document.querySelector('#signing').hasAttribute('data-signed'), document.querySelector('.route__dot').hasAttribute('data-signed'),
            document.querySelector('[data-hold-status]').textContent, document.querySelectorAll('[data-entry]')[4].querySelector('[data-entry-state]').textContent,
            parseFloat(document.querySelector('[data-signature]').style.strokeDashoffset)]""")
        check('signing: a full hold signs and merges, and the dot turns viridian', signed[0] and signed[1] and 'Merged' in signed[2] and signed[4] < 1, str(signed))
        check('signing: entry 5 is written into the guestbook, with its own fingerprint, sealed', signed[3] == 'Sealed')
        page.click('[data-unsign]')
        page.wait_for_timeout(200)
        page.focus('[data-hold]')
        page.keyboard.down('Space')
        page.wait_for_timeout(1900)
        page.keyboard.up('Space')
        page.wait_for_timeout(400)
        check('signing: holding Space signs too', page.evaluate("document.querySelector('#signing').hasAttribute('data-signed')"))
        page.click('[data-unsign]')
        page.wait_for_timeout(1000)
        page.evaluate("document.querySelector('[data-hold]').click()")
        page.wait_for_timeout(200)
        check("signing: a screen reader's activation signs at once, as a plain button", page.evaluate("document.querySelector('#signing').hasAttribute('data-signed')"))
        page.click('[data-unsign]')
        page.wait_for_timeout(200)
        check('signing: undo puts the pull request back, and entry 5 waits again',
              not page.evaluate("document.querySelector('.route__dot').hasAttribute('data-signed')")
              and page.evaluate("document.querySelectorAll('[data-entry]')[4].hasAttribute('data-pending')"))
        height = page.evaluate('document.documentElement.scrollHeight')
        check('moments: nothing moves the page while they play', page.evaluate('document.documentElement.scrollHeight') == height,
              f"{height} then {page.evaluate('document.documentElement.scrollHeight')}")
        check('moments: no script errors', not errs, '; '.join(errs)[:200])
        ctx.close()

        # --- accessibility -------------------------------------------------------------------------------------
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
        page = ctx.new_page()
        page.goto(base + '/?quiet=0', wait_until='networkidle')
        page.wait_for_timeout(400)
        a = page.evaluate("""() => {
          const shown = (e) => { for (let p = e; p; p = p.parentElement) { const s = getComputedStyle(p); if (s.display === 'none' || p.hidden) return false; } return true; };
          const levels = [...document.querySelectorAll('h1, h2, h3')].filter(shown).map((h) => +h.tagName[1]);
          const name = (e) => (e.getAttribute('aria-label') || (e.labels && [...e.labels].map((l) => l.textContent).join(' ')) || e.textContent || '').trim();
          const controls = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), textarea, summary')].filter(shown)
            .filter((e) => !e.closest('[aria-hidden="true"]') && e.tabIndex !== -1);
          return { h1: levels.filter((l) => l === 1).length, skips: levels.filter((l, i) => i > 0 && l > levels[i - 1] + 1).length,
                   nameless: controls.filter((e) => !name(e) && !e.closest('fieldset')?.querySelector('legend')).map((e) => e.outerHTML.slice(0, 60)),
                   decorations: [...document.querySelectorAll('svg')].filter((s) => !s.closest('[aria-hidden="true"]') && s.getAttribute('aria-hidden') !== 'true').length };
        }""")
        check('a11y: one h1, and headings that never skip a level', a['h1'] == 1 and a['skips'] == 0, str(a))
        check('a11y: every control has a name', not a['nameless'], '; '.join(a['nameless'][:3]))
        check('a11y: every drawing is hidden from assistive technology', a['decorations'] == 0, str(a['decorations']))
        page.mouse.click(2, 2)
        ringless, seen = [], []
        for _ in range(60):
            page.keyboard.press('Tab')
            f = page.evaluate("""(() => { const e = document.activeElement; if (!e || e === document.body) return null; const s = getComputedStyle(e);
                const box = e.closest('label') ? getComputedStyle(e.closest('label')) : null;
                const ring = (x) => x && ((x.outlineStyle !== 'none' && parseFloat(x.outlineWidth) >= 2) || (x.boxShadow && x.boxShadow !== 'none'));
                return { id: e.outerHTML.slice(0, 80), ring: ring(s) || ring(box) }; })()""")
            if not f:
                continue
            if seen and f['id'] == seen[0]:
                break
            seen.append(f['id'])
            if not f['ring']:
                ringless.append(f['id'])
        check('a11y: every focus stop shows a ring', not ringless and len(seen) > 20, f"{len(seen)} stops; " + '; '.join(ringless[:2]))
        ctx.close()

        # --- the form: says what it needs, sends, fails honestly, thanks in place -----------------------------------
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
        page = ctx.new_page()
        sent = []
        answer = {'ok': True}
        def web3forms(route, request):
            sent.append(request.post_data or '')
            if answer['ok']:
                route.fulfill(status=200, content_type='application/json', body='{"success":true}')
            else:
                route.fulfill(status=500, content_type='application/json', body='{"success":false}')
        page.route('https://api.web3forms.com/submit', web3forms)
        page.goto(base + '/?quiet=0', wait_until='networkidle')
        form = '[data-rsvp]'
        page.evaluate(f"document.querySelector('{form}').scrollIntoView()")
        page.click(f'{form} button[type=submit]')
        page.wait_for_timeout(200)
        errors_shown = page.evaluate(f"""[...document.querySelectorAll('{form} .field__error')].map((e) => e.textContent)""")
        tied = page.evaluate(f"""[...document.querySelectorAll('{form} .field__error')].every((e) => document.querySelector(`[aria-describedby~="${{e.id}}"][aria-invalid=true]`))""")
        check('form: an empty send says what each field needs, under it and tied to it', len(errors_shown) == 4 and tied, '; '.join(errors_shown))
        check('form: and moves to the first that needs it', page.evaluate('document.activeElement.name') == 'name')
        keyed = page.evaluate(f"document.querySelector('{form} [name=access_key]').value")
        page.fill(f'{form} [name=name]', 'Ada Test')
        page.fill(f'{form} [name=email]', 'ada@example')
        page.fill(f'{form} [name=company]', 'Example Ltd')
        page.click(f'{form} label.choice:has-text("20 to 150")')
        page.click(f'{form} label.choice:has-text("Semgrep")')
        page.click(f'{form} button[type=submit]')
        page.wait_for_timeout(200)
        check('form: an incomplete email is caught', 'does not look complete' in (page.text_content('#rsvp-email-error') or ''))
        page.fill(f'{form} [name=email]', 'ada@example.com')
        if keyed:
            answer['ok'] = False
            page.click(f'{form} button[type=submit]')
            page.wait_for_timeout(600)
            failed = page.text_content(f'{form} .rsvp__status') or ''
            check('form: a failed send says so, and keeps every answer', 'did not send' in failed and page.input_value(f'{form} [name=company]') == 'Example Ltd', failed)
            answer['ok'] = True
            page.click(f'{form} button[type=submit]')
            page.wait_for_timeout(700)
            done = page.text_content('.rsvp--done') or ''
            check('form: it sends to Web3Forms with every answer', sent and '"company":"Example Ltd"' in sent[-1] and '"subject":"AUTOSP free pilot"' in sent[-1] and '"scanners":"Semgrep"' in sent[-1]
                  and '"team":"20 to 150"' in sent[-1], (sent[-1] if sent else '')[:120])
            check('form: and thanks the visitor in place, with their email', 'within 1 business day' in done and 'ada@example.com' in done, done[:90])
        else:
            page.click(f'{form} button[type=submit]')
            page.wait_for_timeout(300)
            check('form: with no Web3Forms key built in, it says it cannot send yet, and sends nothing',
                  'cannot send yet' in (page.text_content(f'{form} .rsvp__status') or '') and not sent)
        ctx.close()

        # --- the phone: the apply bar, tap targets, inputs that don't zoom ---------------------------------------
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        page = ctx.new_page()
        page.goto(base + '/?quiet=0', wait_until='networkidle')
        page.wait_for_timeout(300)
        up = lambda: page.evaluate("document.querySelector('[data-apply-bar]').hasAttribute('data-up')")
        at_top = up()
        page.evaluate("scrollTo(0, document.querySelector('#gates').offsetTop)")
        page.wait_for_timeout(500)
        mid = up()
        page.evaluate("document.querySelector('[data-rsvp]').scrollIntoView({ block: 'center' })")
        page.wait_for_timeout(500)
        at_form = up()
        check('phone: the apply bar comes up after the entrance and steps aside at the form', not at_top and mid and not at_form, f'{at_top}, {mid}, {at_form}')
        small = page.evaluate("""[...document.querySelectorAll('a[href], button, input:not([type=hidden]):not([type=radio]):not([type=checkbox]), textarea, summary, label.choice')]
            .filter((e) => e.getClientRects().length && !e.closest('[aria-hidden=true]') && e.tabIndex !== -1 && !e.closest('p, dd, li:not(.exit li)'))
            .filter((e) => { const r = e.getBoundingClientRect(); return r.height < 44; }).map((e) => (e.textContent || e.name || '').trim().slice(0, 24))""")
        check('phone: every tap target is at least 44px tall', not small, ', '.join(small[:5]))
        tiny = page.evaluate("[...document.querySelectorAll('input:not([type=hidden]), textarea')].filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16 && e.type !== 'radio' && e.type !== 'checkbox').length")
        check('phone: inputs are 16px or more, so the page never zooms', tiny == 0, str(tiny))
        ctx.close()

        # --- quiet mode --------------------------------------------------------------------------------------
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce')
        page = ctx.new_page()
        page.goto(base + '/', wait_until='networkidle')
        page.wait_for_timeout(400)
        check('quiet: on by itself with reduced motion', page.evaluate("document.documentElement.hasAttribute('data-quiet')"))
        check('quiet: each room keeps its own wall', page.evaluate("getComputedStyle(document.querySelector('#proof')).backgroundColor") == 'rgb(38, 48, 63)')
        page.evaluate("scrollTo(0, document.querySelector('#gates').offsetTop)")
        page.wait_for_timeout(200)
        q = page.evaluate("""[parseFloat(document.querySelector('.route__line').style.strokeDashoffset),
            document.querySelector('.route__dot').getAttribute('transform')]""")
        page.evaluate("scrollTo(0, 0)")
        page.wait_for_timeout(200)
        q0 = page.evaluate("document.querySelector('.route__dot').getAttribute('transform')")
        check('quiet: the line is drawn whole, and the dot waits at the case', q[0] == 0 and q[1] == q0, str(q))
        final = page.evaluate("""[document.querySelectorAll('.line--wait').length, document.querySelector('[data-sandbox]').dataset.stage,
            [...document.querySelectorAll('[data-verdict]')].every((v) => getComputedStyle(v).visibility === 'visible')]""")
        check('quiet: every room shows its final state at once', final == [0, 'empty', True], str(final))
        page.click('[data-light=careless]')
        page.wait_for_timeout(100)
        check('quiet: the demos still answer the visitor', page.evaluate("document.querySelector('#gates').dataset.lit") == 'careless'
              and 'rejected' in page.text_content('[data-gates-status]'))
        contrast_sweep(page, 'quiet', 30)
        ctx.close()

        # --- widths -------------------------------------------------------------------------------------------
        for label, size in (('phone 375', (375, 667)), ('phone 390', (390, 844)), ('tablet 768', (768, 1024))):
            ctx = browser.new_context(viewport={'width': size[0], 'height': size[1]}, is_mobile=True, has_touch=True)
            page = ctx.new_page()
            errs = []
            page.on('pageerror', lambda e, errs=errs: errs.append(str(e)))
            page.goto(base + '/?quiet=0', wait_until='networkidle')
            page.wait_for_timeout(400)
            check(f'{label}: no sideways scroll', page.evaluate('document.documentElement.scrollWidth <= innerWidth'),
                  str(page.evaluate('document.documentElement.scrollWidth - innerWidth')))
            if label == 'phone 390':
                contrast_sweep(page, label, 50)
            check(f'{label}: no script errors', not errs, '; '.join(errs)[:200])
            ctx.close()
        browser.close()
    print(f'\n{sum(results)}/{len(results)} checks passed')
    return 0 if all(results) else 1


if __name__ == '__main__':
    sys.exit(main())
