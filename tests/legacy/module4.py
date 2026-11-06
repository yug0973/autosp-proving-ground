"""Module 4 checks: the interactive hash-chain log.

Run with a server up (the production preview is the reference):
    python tests/module4.py [--base http://127.0.0.1:4173/] [--gpu]
Screenshots go to tests/output/.
"""
import argparse, hashlib, json, pathlib, sys
from playwright.sync_api import sync_playwright

OUT = pathlib.Path(__file__).resolve().parent / 'output'
OUT.mkdir(exist_ok=True)
GPU = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--headless=new']
results = []
SIGNAL_OPEN = (255, 90, 71)
KNOWN_VECTOR = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
PAYLOADS = [
    'finding f-6239 CWE-89 app/repositories/invoices.py',
    'exploit reproduced, 5 rows returned',
    'parameterized query +1 -1',
    '3 checks passed',
    'approved by your reviewer',
]


def record(name, ok, detail):
    results.append((name, bool(ok)))
    print(('PASS ' if ok else 'FAIL ') + name + ' | ' + json.dumps(detail, ensure_ascii=False, default=str)[:600])


def rgb(css):
    nums = css[css.index('(') + 1:css.index(')')].replace(',', ' ').replace('/', ' ').split()
    return tuple(round(float(n)) for n in nums[:3])


def lum(c):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2])


def contrast(a, b):
    hi, lo = sorted((lum(a), lum(b)), reverse=True)
    return round((hi + 0.05) / (lo + 0.05), 2)


def py_chain(payloads):
    hashes, prev = [], ''
    for p in payloads:
        prev = hashlib.sha256((prev + p).encode('utf-8')).hexdigest()
        hashes.append(prev)
    return hashes


BLOCKS = '''(() => [...document.querySelectorAll("[data-log-block]")].map(b => ({
  broken: b.dataset.broken, status: b.querySelector("[data-log-status]").textContent,
  short: b.querySelector("[data-log-short]").textContent, full: b.querySelector("[data-log-full]").textContent,
  statusColor: getComputedStyle(b.querySelector("[data-log-status]")).color, shortColor: getComputedStyle(b.querySelector("[data-log-short]")).color,
  value: b.querySelector("[data-log-input]").value })))()'''


def edit(page, index, value):
    page.fill(f'#log-{index}', value)
    page.wait_for_timeout(200)
    return page.evaluate(BLOCKS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://127.0.0.1:4173/')
    ap.add_argument('--gpu', action='store_true')
    args = ap.parse_args()
    base = args.base
    expected = py_chain(PAYLOADS)
    expected_short = [h[:4] for h in expected]

    with sync_playwright() as p:
        browser = p.chromium.launch(args=GPU if args.gpu else [])

        # ---------- desktop ----------
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: m.type in ('error', 'warning') and errors.append(m.text))
        page.add_init_script('''window.__audioContexts = 0; const A = window.AudioContext;
          if (A) window.AudioContext = class extends A { constructor(...a) { super(...a); window.__audioContexts++; } };''')
        page.goto(base + '?test', wait_until='networkidle')
        page.wait_for_function('document.querySelector("[data-hash-log]").dataset.chainVerified !== undefined', timeout=5000)

        # SHA-256 implementation: known vector, and the browser chain equals an independent one
        vector = page.evaluate('window.__autospTest.sha256Hex("abc")')
        browser_chain = page.evaluate('(ps) => window.__autospTest.hashChain(ps)', PAYLOADS)
        record('sha256: matches the published vector SHA-256("abc") and the Web Crypto chain matches an independent SHA-256',
               vector == KNOWN_VECTOR and browser_chain == expected, {'vector_ok': vector == KNOWN_VECTOR, 'chain_ok': browser_chain == expected})

        verified = page.evaluate('document.querySelector("[data-hash-log]").dataset.chainVerified')
        blocks = page.evaluate(BLOCKS)
        record('log: five sealed blocks, each with its 4-char short hash and full 64-hex hash, matching the baked chain the page verified on load',
               verified == 'true' and len(blocks) == 5 and [b['short'] for b in blocks] == expected_short
               and [b['full'] for b in blocks] == expected and all(b['broken'] == 'false' and b['status'] == 'Sealed' for b in blocks),
               {'verified': verified, 'short': [b['short'] for b in blocks], 'full_ok': [b['full'] for b in blocks] == expected})

        # full hash shows on hover
        page.hover('.log__block:first-child .log__hash')
        page.wait_for_timeout(150)
        hover_vis = page.evaluate('getComputedStyle(document.querySelector(".log__block:first-child .log__full")).visibility')
        page.mouse.move(0, 0)
        record('hash: the full hash is revealed on hover', hover_vis == 'visible', {'visibility_on_hover': hover_vis})

        # edit block 3: blocks 3,4,5 break and recompute; 1,2 stay sealed
        after3 = edit(page, 3, 'parameterized query +1 -1 TAMPERED')
        live3 = page.evaluate('document.querySelector("[data-log-live]").textContent')
        changed_chain = py_chain([PAYLOADS[0], PAYLOADS[1], 'parameterized query +1 -1 TAMPERED', PAYLOADS[3], PAYLOADS[4]])
        record('edit: editing block 3 breaks blocks 3, 4 and 5 (open-red, "No longer matches"), leaves 1 and 2 sealed, and recomputes the downstream hashes',
               [b['broken'] for b in after3] == ['false', 'false', 'true', 'true', 'true']
               and all(after3[i]['status'] == 'No longer matches' and rgb(after3[i]['statusColor']) == SIGNAL_OPEN for i in (2, 3, 4))
               and [b['short'] for b in after3] == [h[:4] for h in changed_chain],
               {'broken': [b['broken'] for b in after3], 'downstream_recomputed': [b['short'] for b in after3] == [h[:4] for h in changed_chain]})
        record('edit: a polite live region announces which blocks no longer match',
               live3 == 'Edited block 3. Blocks 3 to 5 no longer match the sealed record.', {'announcement': live3})

        # restore
        page.click('[data-log-restore]')
        page.wait_for_timeout(200)
        restored = page.evaluate(BLOCKS)
        restore_state = page.evaluate('({ disabled: document.querySelector("[data-log-restore]").disabled, live: document.querySelector("[data-log-live]").textContent })')
        record('restore: resets every payload, reseals the chain and disables itself, announcing the restore',
               all(b['broken'] == 'false' for b in restored) and [b['value'] for b in restored] == PAYLOADS
               and restore_state['disabled'] and restore_state['live'] == 'Record restored. All five blocks match again.', restore_state)

        # editing the first block breaks the whole chain; editing only the last breaks only the last
        after1 = edit(page, 1, 'finding f-6239 CWE-89 app/repositories/invoices.py X')
        page.click('[data-log-restore]')
        page.wait_for_timeout(150)
        after5 = edit(page, 5, 'approved by your reviewer X')
        record('edit: the first block breaks all five; the last block breaks only itself',
               [b['broken'] for b in after1] == ['true'] * 5 and [b['broken'] for b in after5] == ['false', 'false', 'false', 'false', 'true'],
               {'edit_first': [b['broken'] for b in after1], 'edit_last': [b['broken'] for b in after5]})
        page.click('[data-log-restore]')
        page.wait_for_timeout(150)

        # input is text only: an HTML payload is stored and hashed as text, injects nothing
        edit(page, 2, '<img src=x onerror="window.__xss=1">')
        page.wait_for_timeout(100)
        xss = page.evaluate('({ imgs: document.querySelectorAll("[data-hash-log] img").length, flag: window.__xss || 0 })')
        record('security: an HTML payload in a field is treated as text (hashed, nothing injected or run)', xss == {'imgs': 0, 'flag': 0}, xss)
        page.click('[data-log-restore]')
        page.wait_for_timeout(150)

        record('sound: editing the log plays nothing (no AudioContext created)', page.evaluate('window.__audioContexts') == 0, {'contexts': page.evaluate('window.__audioContexts')})

        # keyboard: tab from the first input to its hash button (real keyboard focus, so :focus-visible matches)
        page.focus('#log-1')
        page.keyboard.press('Tab')
        focused_hash = page.evaluate('document.activeElement === document.querySelector(".log__block:first-child .log__hash")')
        focus_vis = page.evaluate('getComputedStyle(document.querySelector(".log__block:first-child .log__full")).visibility') if focused_hash else 'not-focused'
        page.click('.log__block:first-child .log__hash')
        page.wait_for_timeout(100)
        kb = page.evaluate('''(() => { const h = document.querySelector(".log__block:first-child .log__hash");
          const described = document.getElementById(h.getAttribute("aria-describedby"));
          return { shown: h.dataset.shown, expanded: h.getAttribute("aria-expanded"), name: h.innerText.trim(), described: (described || {}).textContent } })()''')
        record('keyboard: the hash reveals on focus, toggles open on activation, its name is its visible text, and the full hash is its description',
               focus_vis == 'visible' and kb['shown'] == 'true' and kb['expanded'] == 'true' and 'sha' in kb['name'] and kb['described'] == expected[0], kb)

        # contrast
        colors = page.evaluate('''(() => { const cs = (s) => getComputedStyle(document.querySelector(s));
          return { bg: getComputedStyle(document.querySelector(".log__block")).backgroundColor, lede: cs(".log__lede").color, step: cs(".log__step").color,
                   num: cs(".log__num").color, hashLabel: cs(".log__hash-label").color, short: cs(".log__short").color,
                   input: cs(".log__input").color, inputBg: cs(".log__input").backgroundColor, status: cs(".log__status").color, note: cs(".log__note").color } })()''')
        bg = rgb(colors['bg'])
        ratios = {k: contrast(rgb(colors[k]), bg) for k in ('lede', 'step', 'num', 'hashLabel', 'short', 'status', 'note')}
        ratios['input_text'] = contrast(rgb(colors['input']), rgb(colors['inputBg']))
        ratios['broken'] = contrast(SIGNAL_OPEN, bg)
        record('contrast: every small label (step, number, "sha", short hash, status, note), the lede, input text and the broken red clear 4.5:1 on the block',
               all(v >= 4.5 for v in ratios.values()), ratios)

        page.evaluate('document.querySelector("#log").scrollIntoView()')
        page.wait_for_timeout(200)
        page.screenshot(path=str(OUT / 'm4-sealed.png'))
        record('desktop: no console errors or warnings', not errors, errors)
        ctx.close()

        # ---------- reduced motion ----------
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce')
        page = ctx.new_page()
        page.goto(base, wait_until='networkidle')
        page.wait_for_function('document.querySelector("[data-hash-log]").dataset.chainVerified !== undefined', timeout=5000)
        rm_after = edit(page, 1, 'finding f-6239 CWE-89 X')
        rm = page.evaluate('getComputedStyle(document.querySelector(".log__block")).transitionDuration')
        record('reduced motion: no transition on the blocks, but editing still marks the chain broken',
               rm == '0s' and [b['broken'] for b in rm_after] == ['true'] * 5, {'transition': rm, 'broken': [b['broken'] for b in rm_after]})
        ctx.close()

        # ---------- phone ----------
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(base, wait_until='networkidle')
        page.wait_for_function('document.querySelector("[data-hash-log]").dataset.chainVerified !== undefined', timeout=5000)
        phone = page.evaluate('''(() => { const blocks = [...document.querySelectorAll("[data-log-block]")];
          const stacked = blocks.length > 1 ? blocks[1].getBoundingClientRect().top > blocks[0].getBoundingClientRect().bottom - 2 : false;
          return { overflow: document.documentElement.scrollWidth - innerWidth, blocks: blocks.length, stacked,
                   targets: [...document.querySelectorAll("[data-hash-log] input, [data-hash-log] button")].map(e => Math.round(Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height))) } })()''')
        page.fill('#log-3', 'tampered on phone')
        page.wait_for_timeout(200)
        tapped = page.evaluate(BLOCKS)
        record('phone: blocks stack with no horizontal scroll, targets at least 44px, and editing still breaks the chain',
               phone['overflow'] <= 0 and phone['blocks'] == 5 and phone['stacked'] and min(phone['targets']) >= 44
               and [b['broken'] for b in tapped] == ['false', 'false', 'true', 'true', 'true'], phone)
        page.evaluate('document.querySelector("#log").scrollIntoView()')
        page.wait_for_timeout(200)
        page.screenshot(path=str(OUT / 'm4-phone.png'))
        record('phone: no console errors', not errors, errors)
        ctx.close()

        # ---------- no JavaScript ----------
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, java_script_enabled=False)
        page = ctx.new_page()
        page.goto(base, wait_until='load')
        nojs = page.evaluate('''(() => { const blocks = [...document.querySelectorAll("[data-log-block]")];
          return { blocks: blocks.length, shorts: blocks.map(b => b.querySelector("[data-log-short]").textContent),
                   inputs: blocks.every(b => b.querySelector("[data-log-input]").value.length > 0),
                   auditor: document.body.innerText.includes("Your auditor gets an evidence pack for each assessment") } })()''')
        record('no JavaScript: the five blocks, their baked short hashes, their payloads and the auditor caption are all readable',
               nojs['blocks'] == 5 and nojs['shorts'] == expected_short and nojs['inputs'] and nojs['auditor'], nojs)
        ctx.close()
        browser.close()

    passed = sum(ok for _, ok in results)
    print(f'\n{passed}/{len(results)} passed')
    sys.exit(0 if passed == len(results) else 1)


if __name__ == '__main__':
    main()
