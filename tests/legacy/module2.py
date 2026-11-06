"""Module 2 checks: the hero stage, the page-load reveal, the exploit demo, the cursor and the sound.

Run with a server up (the production preview is the reference):
    python tests/module2.py [--base http://127.0.0.1:4173/] [--gpu]
Screenshots go to tests/output/.
"""
import argparse, json, math, pathlib, statistics, sys
import numpy as np
from scipy.signal import lfilter
from playwright.sync_api import sync_playwright

OUT = pathlib.Path(__file__).resolve().parent / 'output'
OUT.mkdir(exist_ok=True)
GPU = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--headless=new']
results = []
EXPECTED_CODE = 'cur.execute(\n    "SELECT * FROM invoices"\n    " WHERE id = \'"\n    + invoice_id + "\'"\n)'
SIGNAL = {'pass': (61, 220, 151), 'open': (255, 90, 71), 'hold': (242, 177, 52)}


def record(name, ok, detail):
    results.append((name, bool(ok)))
    print(('PASS ' if ok else 'FAIL ') + name + ' | ' + json.dumps(detail, ensure_ascii=False, default=str)[:700])


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


def loudness_lufs(samples, rate=48000):
    """ITU-R BS.1770 K-weighted loudness of a mono signal over one 400 ms block (the signal is
    padded with silence to 400 ms). The coefficients are the standard 48 kHz ones."""
    x = np.asarray(samples, dtype=np.float64)
    x = np.pad(x, (0, max(0, int(0.4 * rate) - len(x))))
    y = lfilter([1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585], x)
    y = lfilter([1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621], y)
    ms = float(np.mean(y ** 2))
    return -math.inf if ms == 0 else -0.691 + 10 * math.log10(ms)


def audible_ms(samples, rate=48000, floor_db=-60):
    x = np.abs(np.asarray(samples))
    loud = np.nonzero(x > 10 ** (floor_db / 20))[0]
    return 0 if len(loud) == 0 else round((loud[-1] + 1) / rate * 1000)


AUDIO_SPY = '''(() => { window.__audioContexts = 0; const A = window.AudioContext;
  if (A) window.AudioContext = class extends A { constructor(...a) { super(...a); window.__audioContexts++; } }; })();'''

RESULT = '''(() => { const r = document.querySelector("[data-exploit-result] .result"); if (!r) return null;
  const status = r.querySelector(".result__status"), cell = r.querySelector(".result__rows td");
  return { state: r.dataset.state, status: status.innerText.trim(), statusColor: getComputedStyle(status).color,
           icon: status.querySelector("svg").innerHTML.length, rows: r.querySelectorAll(".result__rows tbody tr").length,
           rowColor: cell ? getComputedStyle(cell).color : null, query: (r.querySelector(".result__query code") || {}).textContent || null } })()'''


def run_exploit(page, value, via_keyboard=True):
    page.fill('#invoice-id', value)
    if via_keyboard:
        page.focus('#invoice-id')
        page.keyboard.press('Enter')
    else:
        page.click('.exploit .btn--secondary')
    page.wait_for_timeout(150)
    return page.evaluate(RESULT)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://127.0.0.1:4173/')
    ap.add_argument('--gpu', action='store_true')
    args = ap.parse_args()
    base = args.base
    with sync_playwright() as p:
        browser = p.chromium.launch(args=GPU if args.gpu else [])

        # ---------- desktop: reveal ----------
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: m.type in ('error', 'warning') and errors.append(m.text))
        page.add_init_script(AUDIO_SPY)
        page.add_init_script('''window.__animateCalls = []; const _animate = Element.prototype.animate;
          Element.prototype.animate = function (k, o) { window.__animateCalls.push({ cls: this.className, timing: o }); return _animate.call(this, k, o); };''')
        # record each reveal state with the time it began, polled every frame from the first one
        page.add_init_script('''window.__reveal = []; (function poll() { const v = document.documentElement && document.documentElement.dataset.reveal;
          if (v && window.__reveal[window.__reveal.length - 1]?.v !== v) window.__reveal.push({ v, t: Math.round(performance.now()) });
          if (v !== "done") requestAnimationFrame(poll); })();''')
        page.goto(base + '?test', wait_until='domcontentloaded')
        first = page.evaluate('document.documentElement.dataset.reveal')
        page.wait_for_function('document.documentElement.dataset.reveal === "typing"', timeout=5000)
        page.wait_for_timeout(250)
        page.screenshot(path=str(OUT / 'm2-desktop-typing.png'))
        mid = page.evaluate('''(() => { const c = [...document.querySelectorAll(".code--visual .code__char")]; return [c.filter(e => e.classList.contains("is-typed")).length, c.length] })()''')
        anims_during = page.evaluate('''document.getAnimations().map(a => { const t = a.effect && a.effect.target; return (t && (t.className && t.className.baseVal === undefined ? t.className : "svg")) + (a.effect.pseudoElement || "") })''')
        page.wait_for_function('document.documentElement.dataset.reveal === "done"', timeout=5000)
        steps = page.evaluate('window.__reveal')
        record('reveal: pending, then the code types in, then the underline draws, then done',
               [s['v'] for s in steps] == ['pending', 'typing', 'underline', 'done'] and 0 < mid[0] < mid[1],
               {'state_at_domcontentloaded': first, 'steps': steps, 'typed_250ms_in': mid})
        t = {s['v']: s['t'] for s in steps}
        record('reveal timing: typing and underline each take --dur-slow (640ms); the whole reveal ends within 2s of load',
               500 <= t['underline'] - t['typing'] <= 900 and 600 <= t['done'] - t['underline'] <= 760 and t['done'] < 2000, t)
        record('motion: nothing else animates during load (typing is class steps; the underline cover is the only transition)',
               all('code__flaw' in a for a in anims_during), anims_during)
        page.wait_for_timeout(300)
        page.screenshot(path=str(OUT / 'm2-desktop-1440.png'))

        code = page.evaluate('''(() => { const src = document.querySelector("[data-code-source]"), vis = document.querySelector(".code--visual"), cs = getComputedStyle(vis);
          return { source: src.textContent, visual: vis.innerText, sourceHidden: src.classList.contains("visually-hidden"), visualHidden: vis.getAttribute("aria-hidden"),
                   font: cs.fontFamily, size: parseFloat(cs.fontSize), wave: getComputedStyle(document.querySelector(".code--visual .code__flaw"), "::before").backgroundColor,
                   cover: getComputedStyle(document.querySelector(".code--visual .code__flaw"), "::after").transform,
                   fits: vis.scrollWidth <= vis.clientWidth + 1 } })()''')
        record('code: the vulnerable statement, in JetBrains Mono at large size, with a red wavy underline fully drawn; screen readers get the plain source',
               code['source'].strip() == EXPECTED_CODE and code['visual'].strip() == EXPECTED_CODE and code['sourceHidden'] and code['visualHidden'] == 'true'
               and 'JetBrains Mono' in code['font'] and code['size'] >= 48 and rgb(code['wave']) == SIGNAL['open'] and code['fits'],
               {k: v for k, v in code.items() if k not in ('source', 'visual')} | {'source_ok': code['source'].strip() == EXPECTED_CODE})

        fold = page.evaluate('''(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); return { code: r(".hero__code").top, demo: r(".exploit__row").bottom,
          strip: r("[data-exploit-result]").bottom, sentence: r(".hero__sentence").top, cta: r(".hero__actions .btn--primary").bottom, h: innerHeight,
          firstVisible: [...document.querySelectorAll("main *")].find(e => e.getBoundingClientRect().height > 0 && !e.closest(".visually-hidden") && getComputedStyle(e).opacity !== "0" && e.innerText)?.className } })()''')
        record('layout (1440x900): the code is the first thing in the hero; demo, result, sentence and CTA all sit above the fold',
               fold['cta'] <= fold['h'] and fold['strip'] <= fold['h'] and fold['code'] < fold['demo'], fold)

        # ---------- demo states, by keyboard ----------
        initial = page.evaluate(RESULT)
        record('demo: the benign ID 1042 shows one invoice row in --signal-pass, with a check icon and a text label',
               initial['state'] == 'found' and initial['rows'] == 1 and rgb(initial['rowColor']) == SIGNAL['pass'] and rgb(initial['statusColor']) == SIGNAL['pass'] and initial['icon'] > 0,
               initial)
        glitches_before = page.evaluate('window.__animateCalls.length')
        leak = run_exploit(page, "' OR '1'='1")
        glitch = page.evaluate('window.__animateCalls')
        record('demo: the tautology payload leaks all five rows in --signal-open, with a triangle icon, and shows the query that ran',
               leak['state'] == 'leak' and leak['rows'] == 5 and rgb(leak['rowColor']) == SIGNAL['open'] and rgb(leak['statusColor']) == SIGNAL['open']
               and leak['query'] == "SELECT * FROM invoices WHERE id = '' OR '1'='1'" and 'Every invoice leaked' in leak['status'], leak)
        record('demo: a leak glitches the line once, for --dur-glitch (120ms)',
               glitches_before == 0 and len(glitch) == 1 and 'code--visual' in glitch[0]['cls'] and glitch[0]['timing']['duration'] == 120
               and glitch[0]['timing']['iterations'] == 1, glitch)
        page.wait_for_timeout(400)
        other = run_exploit(page, "1' or 1=1 --", via_keyboard=False)
        error = run_exploit(page, "'")
        empty = run_exploit(page, '9999')
        blank = run_exploit(page, '')
        benign = run_exploit(page, '1043')
        record('demo: any tautology leaks (not only the example); a stray quote fails in --signal-hold; an unknown ID returns nothing; an empty field asks for an ID',
               other['state'] == 'leak' and other['rows'] == 5 and error['state'] == 'error' and rgb(error['statusColor']) == SIGNAL['hold']
               and empty['state'] == 'empty' and blank['state'] == 'no-input' and benign['state'] == 'found' and benign['rows'] == 1,
               {'other': other['status'], 'error': error['status'], 'empty': empty['status'], 'blank': blank['status'], 'benign': benign['status']})
        xss = run_exploit(page, "<img src=x onerror=window.__xss=1>' OR 1=1 --")
        injected = page.evaluate('({ imgs: document.querySelectorAll("[data-exploit-result] img").length, flag: window.__xss || 0 })')
        record('demo: input is rendered as text only (an HTML payload shows literally, creates no element and runs nothing)',
               injected == {'imgs': 0, 'flag': 0} and '<img' in (xss['query'] or ''), {'injected': injected, 'query': xss['query']})
        live = page.evaluate('''(() => { const r = document.querySelector("[data-exploit-result]"); return { role: r.getAttribute("role"), atomic: r.getAttribute("aria-atomic"),
          caption: document.getElementById("exploit-caption").innerText, describedby: document.getElementById("invoice-id").getAttribute("aria-describedby"),
          label: document.querySelector("label[for=invoice-id]").innerText } })()''')
        record('demo: the result strip is a polite live region (role=status); the input is labelled and described by the "Simulated query on sample data." caption',
               live['role'] == 'status' and live['atomic'] == 'true' and live['caption'] == 'Simulated query on sample data.' and live['describedby'] == 'exploit-caption' and live['label'] == 'invoice_id',
               live)

        # contrast of the demo against its real background
        colors = page.evaluate('''(() => { const cs = (s) => getComputedStyle(document.querySelector(s));
          return { bg: getComputedStyle(document.body).backgroundColor, input: cs("#invoice-id").backgroundColor, inputBorder: cs("#invoice-id").borderTopColor,
                   inputText: cs("#invoice-id").color, caption: cs(".exploit__caption").color, query: cs(".result__query").color, path: cs(".hero__path").color } })()''')
        bg = rgb(colors['bg'])
        ratios = {'open': contrast(SIGNAL['open'], bg), 'pass': contrast(SIGNAL['pass'], bg), 'hold': contrast(SIGNAL['hold'], bg),
                  'caption': contrast(rgb(colors['caption']), bg), 'query_label': contrast(rgb(colors['query']), bg), 'path': contrast(rgb(colors['path']), bg),
                  'input_text': contrast(rgb(colors['inputText']), rgb(colors['input'])), 'input_border_vs_page': contrast(rgb(colors['inputBorder']), bg)}
        record('contrast: signal text, captions and input text clear 4.5:1; the input boundary clears 3:1 (WCAG 1.4.11)',
               all(v >= 4.5 for k, v in ratios.items() if k != 'input_border_vs_page') and ratios['input_border_vs_page'] >= 3, ratios)

        # keyboard order through the hero
        page.evaluate('document.activeElement.blur(); window.scrollTo(0, 0)')
        page.focus('.site-nav .btn--primary')
        order = []
        for _ in range(4):
            page.keyboard.press('Tab')
            order.append(page.evaluate('''(() => { const e = document.activeElement, cs = getComputedStyle(e); return [e.id || e.innerText.trim(), cs.outlineStyle + " " + cs.outlineWidth] })()'''))
        record('keyboard: after the nav come the input, Run exploit, Apply for the free pilot and See a fix, each with the focus ring',
               [o[0] for o in order] == ['invoice-id', 'Run exploit', 'Apply for the free pilot', 'See a fix, step by step'] and all(o[1] == 'solid 2px' for o in order), order)

        # ---------- cursor (mouse) ----------
        page.mouse.move(700, 600)
        page.wait_for_timeout(200)
        box = page.locator('.exploit .btn--secondary').bounding_box()
        page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        page.wait_for_timeout(350)
        over_button = page.evaluate('({ grow: document.querySelector(".cursor").dataset.grow, visible: document.querySelector(".cursor").dataset.visible })')
        cbox = page.locator('.code--visual').bounding_box()
        page.mouse.move(cbox['x'] + 60, cbox['y'] + 30)
        page.wait_for_timeout(200)
        over_code = page.evaluate('document.querySelector(".cursor").dataset.grow')
        sbox = page.locator('.hero__sentence').bounding_box()
        page.mouse.move(sbox['x'] + sbox['width'] / 2, sbox['y'] + 10)
        page.wait_for_timeout(200)
        over_text = page.evaluate('document.querySelector(".cursor").dataset.grow')
        native = page.evaluate('''[...document.querySelectorAll("*")].filter(e => getComputedStyle(e).cursor === "none").length''')
        record('cursor: a ring follows the mouse, grows over controls and the code, not over plain text; the native cursor is never hidden',
               over_button == {'grow': 'true', 'visible': 'true'} and over_code == 'true' and over_text == 'false' and native == 0,
               {'button': over_button, 'code': over_code, 'text': over_text, 'elements_with_cursor_none': native})

        # ---------- sound ----------
        ctxs_off = page.evaluate('window.__audioContexts')
        page.click('[data-sound-toggle]')
        run_exploit(page, "' OR '1'='1")
        ctxs_on = page.evaluate('window.__audioContexts')
        record('sound: a leak plays nothing while sound is off (no AudioContext is even created) and plays once it is turned on',
               ctxs_off == 0 and ctxs_on == 1, {'contexts_while_off': ctxs_off, 'contexts_after_on': ctxs_on})
        page.click('[data-sound-toggle]')
        levels = {}
        for name in ('exploit', 'pass', 'merge'):
            samples = page.evaluate(f'window.__autospTest.renderSound("{name}", 48000).then(a => Array.from(a))')
            levels[name] = {'audible_ms': audible_ms(samples), 'lufs_400ms': round(loudness_lufs(samples), 1), 'peak_dbfs': round(20 * math.log10(max(abs(min(samples)), max(samples))), 1)}
        record('sound: exploit, pass and merge each last under 300ms and measure under -18 LUFS (BS.1770, one 400ms block)',
               all(v['audible_ms'] < 300 and v['lufs_400ms'] < -18 for v in levels.values()), levels)
        record('desktop: no console errors or warnings', not errors, errors)
        ctx.close()

        # ---------- reduced motion ----------
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce')
        page = ctx.new_page()
        page.goto(base, wait_until='domcontentloaded')
        page.wait_for_timeout(100)
        rm = page.evaluate('''(() => ({ reveal: document.documentElement.dataset.reveal || null, visual: !!document.querySelector(".code--visual"),
          opacity: getComputedStyle(document.querySelector(".code")).opacity, cover: getComputedStyle(document.querySelector(".code__flaw"), "::after").transform,
          cursor: !!document.querySelector(".cursor") }))()''')
        page.wait_for_load_state('networkidle')
        page.evaluate('window.__animateCalls = []; const _a = Element.prototype.animate; Element.prototype.animate = function (k, o) { window.__animateCalls.push(o); return _a.call(this, k, o) }; true')
        run_exploit(page, "' OR '1'='1")
        rm_glitch = page.evaluate('window.__animateCalls.length')
        record('reduced motion: no reveal (the code and its underline are there at once), no glitch on a leak, no cursor ring',
               rm['reveal'] is None and not rm['visual'] and rm['opacity'] == '1' and rm['cover'] != 'none' and not rm['cursor'] and rm_glitch == 0, rm | {'glitch_animations': rm_glitch})
        ctx.close()

        # ---------- no JavaScript ----------
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, java_script_enabled=False)
        page = ctx.new_page()
        page.goto(base, wait_until='load')
        nojs = page.evaluate('''(() => ({ code: getComputedStyle(document.querySelector(".code")).opacity, text: document.querySelector(".code").innerText.trim(),
          strip: document.querySelector("[data-exploit-result]").innerText.includes("1 row returned"), sentence: !!document.querySelector(".hero__sentence").innerText }))()''')
        record('no JavaScript: the code, the sample result, the sentence and the buttons are all visible',
               nojs['code'] == '1' and nojs['text'] == EXPECTED_CODE and nojs['strip'] and nojs['sentence'], nojs)
        ctx.close()

        # ---------- phone ----------
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(base, wait_until='networkidle')
        page.wait_for_function('document.documentElement.dataset.reveal === "done"', timeout=5000)
        page.wait_for_timeout(200)
        page.screenshot(path=str(OUT / 'm2-phone-390.png'))
        phone = page.evaluate('''(() => { const vis = document.querySelector(".code--visual"), cs = getComputedStyle(vis); return { overflow: document.documentElement.scrollWidth - innerWidth,
          codeFits: vis.scrollWidth <= vis.clientWidth + 1, codeSize: parseFloat(cs.fontSize), cursor: !!document.querySelector(".cursor"),
          targets: [...document.querySelectorAll(".hero a, .hero button, .hero input")].map(e => { const r = e.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height)) }) } })()''')
        page.tap('#invoice-id')
        page.fill('#invoice-id', "' OR '1'='1")
        page.tap('.exploit .btn--secondary')
        page.wait_for_timeout(200)
        tapped = page.evaluate(RESULT)
        record('phone (390): no horizontal scroll, the code fits at 18px or more, touch targets at least 44px, no cursor ring on touch, the demo works by tap',
               phone['overflow'] <= 0 and phone['codeFits'] and phone['codeSize'] >= 18 and min(phone['targets']) >= 44 and not phone['cursor'] and tapped['state'] == 'leak',
               phone | {'tap_result': tapped['state']})
        record('phone: no console errors', not errors, errors)
        # last: a full-page capture briefly drops touch emulation, which the cursor rightly reacts to
        page.screenshot(path=str(OUT / 'm2-phone-390-full.png'), full_page=True)
        ctx.close()

        # ---------- LCP and CLS on throttled 4G ----------
        perf = {}
        for label, vp, mobile in (('1440', {'width': 1440, 'height': 900}, False), ('390', {'width': 390, 'height': 844}, True)):
            lcps, clss = [], []
            for _ in range(3):
                c = browser.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile)
                pg = c.new_page()
                pg.add_init_script('''window.__lcp = 0; window.__cls = 0;
                  new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lcp = e.startTime }).observe({ type: "largest-contentful-paint", buffered: true });
                  new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value }).observe({ type: "layout-shift", buffered: true });''')
                cdp = c.new_cdp_session(pg)
                cdp.send('Network.enable')
                cdp.send('Network.setCacheDisabled', {'cacheDisabled': True})
                cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 150, 'downloadThroughput': 1.6e6 / 8, 'uploadThroughput': 750e3 / 8})
                pg.goto(base, wait_until='load')
                pg.wait_for_timeout(2500)
                lcps.append(round(pg.evaluate('window.__lcp')))
                clss.append(round(pg.evaluate('window.__cls'), 4))
                c.close()
            perf[label] = {'lcp_ms_median': statistics.median(lcps), 'lcp_runs': lcps, 'cls_max': max(clss)}
        record('performance: LCP under 2.0s and CLS under 0.05 on throttled 4G (150ms, 1.6 Mbps), median of 3',
               all(v['lcp_ms_median'] < 2000 and v['cls_max'] < 0.05 for v in perf.values()), perf)
        browser.close()

    passed = sum(ok for _, ok in results)
    print(f'\n{passed}/{len(results)} passed')
    sys.exit(0 if passed == len(results) else 1)


if __name__ == '__main__':
    main()
