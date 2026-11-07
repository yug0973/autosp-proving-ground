"""Smoke tests for the world page: the whole story, steps 1 to 7, in a real browser.

Run with the dev server up (npm run dev -- --port 5173 --host 127.0.0.1):

    python tests/world.py --base http://127.0.0.1:5173

Needs Playwright with Chromium. The real-GPU flags keep WebGL on the hardware; drop --gpu on a
machine without one. The tests written for the earlier page are in tests/legacy/.
"""
import argparse
import hashlib
import sys
from urllib.parse import unquote

from playwright.sync_api import sync_playwright

GPU = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--headless=new']
results = []


def check(name, ok, detail=''):
    results.append(ok)
    print(('PASS ' if ok else 'FAIL ') + name + (f'  ({detail})' if detail else ''))


def chain(entries):
    out, previous = [], ''
    for entry in entries:
        previous = hashlib.sha256((previous + entry).encode()).hexdigest()
        out.append(previous)
    return out


def scroll_to(pg, selector, fraction):
    pg.evaluate(f'''(() => {{
      const t = document.querySelector('{selector}');
      const travel = t.offsetHeight - innerHeight;
      const span = travel >= innerHeight * 0.5 ? travel : t.offsetHeight;
      scrollTo(0, t.offsetTop + span * {fraction});
    }})()''')


def story(pg, label, wait):
    """Walks the story once at the current viewport, picking XSS on the way."""
    check(f'{label}: world is running', pg.evaluate('document.documentElement.dataset.world') in ('live', 'still'))
    pg.evaluate('document.querySelector(\'input[value="CWE-79"]\').click()')
    pg.wait_for_timeout(200)
    check(f'{label}: picking XSS shows its file', pg.text_content('[data-diff-file]') == 'app/views/profile.py')

    scroll_to(pg, '[data-reproduce]', 0.4); pg.wait_for_timeout(wait + 2000)
    check(f'{label}: the reproduction test fails', pg.text_content('[data-run-status]') == 'Fails on your code')

    scroll_to(pg, '[data-sandbox]', 0.95); pg.wait_for_timeout(wait)
    steps = pg.evaluate('[...document.querySelectorAll("[data-step]")].map(e=>e.dataset.state)')
    check(f'{label}: the patch is written in the sandbox', steps == ['done', 'done', 'done'], ','.join(steps))

    scroll_to(pg, '[data-gates]', 0.95); pg.wait_for_timeout(wait)
    check(f'{label}: the sandbox fix passes all three gates', pg.text_content('[data-gates-status]') == 'Passed every check')
    pg.evaluate('document.querySelector(\'input[name="choice"][value="careless"]\').click()')
    pg.wait_for_timeout(300)
    states = pg.evaluate('[...document.querySelectorAll("[data-gates-list] li")].map(l=>l.dataset.state)')
    check(f'{label}: a careless XSS fix is refused by the suite', states == ['passed', 'refused', 'skipped'], ','.join(states))
    pg.evaluate('document.querySelector(\'input[name="choice"][value="sandbox"]\').click()')

    pg.locator('[data-hold]').scroll_into_view_if_needed(); pg.wait_for_timeout(wait)
    pg.focus('[data-hold]')
    pg.keyboard.down(' '); pg.wait_for_timeout(400); pg.keyboard.up(' '); pg.wait_for_timeout(800)
    check(f'{label}: letting go early does not merge', pg.text_content('[data-pr-status]') == 'Waiting for a person')
    said = pg.text_content('[data-hold-status]')
    check(f'{label}: letting go early is announced', said == 'Let go early. Nothing was merged.', said)
    pg.focus('[data-hold]')
    pg.keyboard.down(' '); pg.wait_for_timeout(1700); pg.keyboard.up(' '); pg.wait_for_timeout(400)
    check(f'{label}: a full hold merges', pg.text_content('[data-pr-status]') == 'Merged')
    said = pg.text_content('[data-hold-status]')
    check(f'{label}: the merge is announced', said.startswith('Merged.'), said)
    focused = pg.evaluate('document.activeElement && document.activeElement.textContent.trim()')
    check(f'{label}: focus moves to the call to action', focused == 'Apply for the free pilot', focused)

    pg.click('[data-unmerge]'); pg.wait_for_timeout(300)
    check(f'{label}: undo sets the pull request back', pg.text_content('[data-pr-status]') == 'Waiting for a person')
    # a screen reader's own activation is a click with no pointer or key behind it
    pg.evaluate("document.querySelector('[data-hold]').click()"); pg.wait_for_timeout(300)
    check(f'{label}: a screen reader activation merges', pg.text_content('[data-pr-status]') == 'Merged')


def record(pg):
    entries = [
        'Reported: CWE-79 in app/views/profile.py',
        'Reproduced: test_display_name_is_escaped failed',
        'Patched in sandbox sbx-7f3a: 1 line removed, 2 added',
        'Verified: all three gates passed',
        'Merged by a person after an approving review',
    ]
    want = [h[:4] for h in chain(entries)]
    got = pg.evaluate('[...document.querySelectorAll("[data-record-short]")].map(e=>e.textContent)')
    check('record: fingerprints are SHA-256 chained, five entries after the merge', got == want, f'{got} vs {want}')
    pg.fill('#record-3', 'Patched: anything')
    pg.wait_for_timeout(300)
    states = pg.evaluate('[...document.querySelectorAll("[data-record-row]")].map(r=>r.dataset.state)')
    check('record: editing entry 3 breaks 3 to 5', states == ['matches', 'matches', 'broken', 'broken', 'broken'], ','.join(states))
    pg.click('[data-record-restore]'); pg.wait_for_timeout(300)
    states = pg.evaluate('[...document.querySelectorAll("[data-record-row]")].map(r=>r.dataset.state)')
    check('record: restore reseals it', states == ['matches'] * 5, ','.join(states))
    carried = pg.evaluate('[...document.querySelectorAll("[data-record-carry]")].map(e=>e.textContent)')
    check('record: each link carries the fingerprint above it', carried == want[:4], f'{carried} vs {want[:4]}')
    label = pg.get_attribute('[data-record-row]:nth-child(3) [data-record-fp]', 'aria-label') or ''
    check('record: a fingerprint names its full value', label.endswith(chain(entries)[2]), label)
    pg.click('[data-record-tamper]'); pg.wait_for_timeout(300)
    states = pg.evaluate('[...document.querySelectorAll("[data-record-row]")].map(r=>r.dataset.state)')
    check('record: rewriting entry 2 breaks every later block', states == ['matches'] + ['broken'] * 4, ','.join(states))
    statuses = pg.evaluate('[...document.querySelectorAll("[data-record-status]")].map(e=>e.textContent)')
    check('record: only broken blocks carry a status', statuses == [''] + ['No longer matches'] * 4, ','.join(statuses))
    pg.click('[data-record-restore]'); pg.wait_for_timeout(300)
    states = pg.evaluate('[...document.querySelectorAll("[data-record-row]")].map(r=>r.dataset.state)')
    check('record: restore after the rewrite reseals it', states == ['matches'] * 5, ','.join(states))


LIT = '[data-numeral="14"] .numeral > .numeral__glyph > .is-lit'
LIT_14 = 24  # lit squares in the 5 by 7 glyphs for 1 and 4


def numbers(pg, label):
    """The results: the numbers drawn in the dot matrix, their text kept for screen readers."""
    if label == 'reduced motion':
        # no counting: the final value is drawn before the section is ever in view
        check(f'{label}: the numbers show at once', pg.locator(LIT).count() == LIT_14, str(pg.locator(LIT).count()))
    scroll_to(pg, '#results', 0); pg.wait_for_timeout(2600)
    # the count runs on the page's clock, and a jump this far can stall a slow GPU for a while
    lit = pg.locator(LIT).count()
    for _ in range(40):
        if lit == LIT_14:
            break
        pg.wait_for_timeout(250)
        lit = pg.locator(LIT).count()
    check(f'{label}: 14 is drawn in lit squares', lit == LIT_14, str(lit))
    text = pg.text_content('[data-numeral="14"] .stats__text')
    check(f'{label}: the number stays as text for screen readers', text == '14/16', text)


PICKABLE = {'CWE-89', 'CWE-79', 'CWE-639'}


def tags_and_leaders(pg):
    """Each beat shows only the finding labels it needs, and its panel is tied to the world."""
    shown = lambda: set(pg.evaluate('[...document.querySelectorAll(".finding:not([hidden]) .finding__cwe")].map(e=>e.textContent)'))
    leader = lambda: pg.evaluate('document.querySelector("[data-leader]").hasAttribute("data-shown")')
    scroll_to(pg, '#backlog', 0); pg.wait_for_timeout(1500)
    check('tags: the backlog shows findings beyond the three to pick', bool(shown() - PICKABLE), ','.join(sorted(shown())))
    scroll_to(pg, '[data-push]', 0.1); pg.wait_for_timeout(1500)
    check('tags: choosing shows only the three that can be picked', bool(shown()) and shown() <= PICKABLE, ','.join(sorted(shown())))
    scroll_to(pg, '[data-reproduce]', 0.5); pg.wait_for_timeout(1500)
    check('leader: the reproduction panel is tied to its building', leader())
    scroll_to(pg, '[data-sandbox]', 0.7); pg.wait_for_timeout(1500)
    check('tags: the sandbox shows only the chosen finding', shown() <= {'CWE-79'}, ','.join(sorted(shown())))
    scroll_to(pg, '#results', 0); pg.wait_for_timeout(1500)
    check('tags: the results show only the three categories they cover', shown() <= PICKABLE, ','.join(sorted(shown())))
    check('leader: the results panel has none', not leader())


def rail(pg, label):
    """The progress rail: seven links, the beat on screen marked as the current step."""
    check(f'{label}: the rail links the seven beats', pg.locator('.rail__link').count() == 7)
    scroll_to(pg, '[data-gates]', 0.45); pg.wait_for_timeout(1500)
    current = pg.evaluate('document.querySelector(".rail__link[aria-current=step]")?.textContent.trim()')
    check(f'{label}: the rail marks Gates as the current step', current == 'Gates', str(current))
    if label == 'phone':
        check('phone: the rail collapses to one button', pg.is_visible('[data-rail-toggle]') and not pg.is_visible('.rail__list'))
        pg.click('[data-rail-toggle]'); pg.wait_for_timeout(200)
        check('phone: the button opens the list', pg.is_visible('.rail__list'))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        check('phone: Escape closes it', not pg.is_visible('.rail__list'))
        width = pg.evaluate('document.documentElement.scrollWidth - innerWidth')
        check('phone: nothing scrolls sideways', width <= 0, str(width))
    else:
        check(f'{label}: every beat is named beside the panels', pg.is_visible('.rail__list') and not pg.is_visible('[data-rail-toggle]'))


def apply_form(pg):
    """One form: every field says what is missing, then it sends (straight through Web3Forms when a
    key is configured, through the mail app when not)."""
    form = '[data-apply]'
    sent = []
    pg.route('https://api.web3forms.com/submit', lambda route, request: (sent.append(request.post_data or ''), route.fulfill(
        status=200, content_type='application/json', body='{"success":true}')))
    pg.click(f'{form} button[type=submit]'); pg.wait_for_timeout(200)
    errors = pg.evaluate(f'[...document.querySelectorAll("{form} .apply__error")].map(e => e.textContent).filter(Boolean)')
    check('apply: an empty form says what each field needs', len(errors) == 4, '; '.join(errors))
    check('apply: and focuses the first', pg.evaluate('document.activeElement.name') == 'name')
    pg.fill(f'{form} input[name=name]', 'Ada Test'); pg.fill(f'{form} input[name=email]', 'ada@example.com')
    pg.fill(f'{form} input[name=company]', 'Example Ltd')
    pg.click(f'{form} label.apply__tile:has-text("20 to 150")'); pg.click(f'{form} label.apply__check:has-text("Semgrep")')
    mode = pg.evaluate(f'document.querySelector("{form}").dataset.send')
    try:
        pg.click(f'{form} button[type=submit]', no_wait_after=True)
    except Exception:  # the mailto navigation itself is not something a headless browser can follow
        pass
    pg.wait_for_timeout(600)
    if mode == 'direct':
        body = sent[0] if sent else ''
        check('apply: sends the application straight to the inbox',
              'Company: Example Ltd' in body and 'Scanners: Semgrep' in body and 'ada@example.com' in body, body[:90])
        check('apply: and says it was sent', pg.is_visible('.apply__done') and 'ada@example.com' in pg.text_content('.apply__done'))
    else:
        mailto = unquote(pg.evaluate(f'document.querySelector("{form}").dataset.mailto || ""'))
        check('apply: without a Web3Forms key, composes the application email',
              mailto.startswith('mailto:nexarise.office@gmail.com?subject=AUTOSP free pilot')
              and 'Company: Example Ltd' in mailto and 'Work email: ada@example.com' in mailto, mailto[:90])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default='http://127.0.0.1:5173')
    parser.add_argument('--no-gpu', action='store_true')
    args = parser.parse_args()
    with sync_playwright() as p:
        launch = {'args': [] if args.no_gpu else GPU}
        for label, options, wait in [
            ('desktop', {'viewport': {'width': 1440, 'height': 900}}, 1400),
            ('reduced motion', {'viewport': {'width': 1440, 'height': 900}, 'reduced_motion': 'reduce'}, 300),
        ]:
            # a browser of its own for each pass: headless Chrome on some machines loses its GPU
            # context after half a minute or so of WebGL, and every later page would start without one
            browser = p.chromium.launch(**launch)
            ctx = browser.new_context(**options)
            pg = ctx.new_page()
            errors = []
            pg.on('pageerror', lambda e, errors=errors: errors.append(str(e)))
            pg.on('console', lambda m, errors=errors: m.type == 'error' and errors.append(m.text))
            pg.goto(args.base + '/', wait_until='networkidle')
            pg.wait_for_timeout(1500)
            if label == 'reduced motion':
                numbers(pg, label)
            story(pg, label, wait)
            if label != 'reduced motion':
                numbers(pg, label)
                rail(pg, label)
            if label == 'desktop':
                tags_and_leaders(pg)
                record(pg)
                apply_form(pg)
            check(f'{label}: no errors in the console', not errors, '; '.join(errors)[:200])
            ctx.close()
            browser.close()

        browser = p.chromium.launch(**launch)

        ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, java_script_enabled=False)
        pg = ctx.new_page()
        pg.goto(args.base + '/', wait_until='load')
        # without script the visit stays on the calm page (tests/light.py), whose words are all in the HTML
        check('no script: the headline and the form still read',
              pg.locator('.calm h1').count() == 1 and pg.locator('.calm-form button[type=submit]').count() == 1)
        if pg.evaluate('document.styleSheets.length') == 0:
            # the dev server delivers CSS through script; a build (npm run preview) links it
            print('SKIP no script: the hold button is hidden  (no stylesheet without script on the dev server)')
        else:
            check('no script: the hold button is hidden', not pg.is_visible('[data-hold]'))
        ctx.close()
        browser.close()
    passed = sum(results)
    print(f'\n{passed}/{len(results)} passed')
    sys.exit(0 if passed == len(results) else 1)


if __name__ == '__main__':
    main()
