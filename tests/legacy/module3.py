"""Module 3 checks: the pinned, scroll-scrubbed proving sequence, its static fallback and controls.

Run with a server up (the production preview is the reference):
    python tests/module3.py [--base http://127.0.0.1:4173/] [--gpu]
Screenshots go to tests/output/.
"""
import argparse, json, pathlib, statistics, sys
from playwright.sync_api import sync_playwright

OUT = pathlib.Path(__file__).resolve().parent / 'output'
OUT.mkdir(exist_ok=True)
GPU = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--headless=new']
results = []
SIGNAL = {'pass': (61, 220, 151), 'open': (255, 90, 71)}


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


SECTION = '''(() => { const s = document.querySelector(".proving"); const r = s.getBoundingClientRect();
  return { top: r.top + scrollY, height: s.offsetHeight } })()'''

STATE = '''(() => {
  const added = [...document.querySelectorAll(".morph__cell--after")];
  const removed = [...document.querySelectorAll(".morph__cell--before")];
  const op = (els) => els.length ? els.reduce((a, e) => a + parseFloat(getComputedStyle(e).opacity), 0) / els.length : null;
  const stages = [...document.querySelectorAll("[data-proving-stages] > .proving__stage")].map(e => +parseFloat(getComputedStyle(e).opacity).toFixed(2));
  const rail = [...document.querySelectorAll("[data-proving-rail] .proving__rail-item")].map(e => e.dataset.state || null);
  const pinTop = Math.round(document.querySelector("[data-proving-pin]").getBoundingClientRect().top);
  return { addedOpacity: op(added), removedOpacity: op(removed), stages, rail, pinTop,
           counter: (document.querySelector("[data-stage-counter]") || {}).textContent } })()'''


def scrub(page, section, progress):
    y = section['top'] + progress * (section['height'] - page.viewport_size['height'])
    page.evaluate('(y) => window.__autospTest.scrollTo(y)', y)
    page.wait_for_timeout(950)  # let the 0.6 scrub settle to its resting state for this position
    return page.evaluate(STATE)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://127.0.0.1:4173/')
    ap.add_argument('--gpu', action='store_true')
    args = ap.parse_args()
    base = args.base
    with sync_playwright() as p:
        browser = p.chromium.launch(args=GPU if args.gpu else [])

        # ---------- desktop: animated ----------
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: m.type in ('error', 'warning') and errors.append(m.text))
        page.add_init_script('''window.__audioContexts = 0; const A = window.AudioContext;
          if (A) window.AudioContext = class extends A { constructor(...a) { super(...a); window.__audioContexts++; } };''')
        page.goto(base + '?test', wait_until='networkidle')
        page.wait_for_function('document.documentElement.dataset.reveal === "done" || !document.documentElement.dataset.reveal', timeout=5000)

        built = page.evaluate('''(() => { const s = document.querySelector(".proving");
          return { animated: s.classList.contains("proving--animated"), controlsHidden: document.querySelector("[data-proving-controls]").hidden,
                   pinned: !!document.querySelector(".pin-spacer") || getComputedStyle(document.querySelector("[data-proving-pin]")).position === "fixed",
                   rails: document.querySelectorAll("[data-proving-rail] .proving__rail-item").length,
                   morphCells: document.querySelectorAll(".morph__cell").length, tallEnough: s.offsetHeight > innerHeight * 3 } })()''')
        record('animated build: desktop gets the pinned, scrubbed sequence (5 rail steps, a morph grid, a tall scroll track, controls shown)',
               built['animated'] and not built['controlsHidden'] and built['rails'] == 5 and built['morphCells'] > 0 and built['tallEnough'], built)

        section = page.evaluate(SECTION)
        # scrub through the five stages
        samples = {round(p, 2): scrub(page, section, p) for p in (0.02, 0.1, 0.3, 0.5, 0.7, 0.9, 0.98)}
        page.evaluate('(y) => window.__autospTest.scrollTo(y)', section['top'])
        page.wait_for_timeout(300)

        # pinning: while scrubbing, the pinned frame stays near the top of the viewport
        pin_tops = [s['pinTop'] for s in samples.values()]
        record('pinning: the frame stays pinned near the top of the viewport across the whole scrub',
               all(abs(t) <= 2 for t in pin_tops), {'pin_tops': pin_tops})

        # the morph: vulnerable at the start, parameterized by the end
        start, end = samples[0.02], samples[0.98]
        record('morph: at the start the vulnerable glyphs show and the new ones are hidden; by the end it has fully morphed',
               start['removedOpacity'] > 0.9 and start['addedOpacity'] < 0.1 and end['removedOpacity'] < 0.1 and end['addedOpacity'] > 0.9,
               {'start': {'removed': start['removedOpacity'], 'added': start['addedOpacity']}, 'end': {'removed': end['removedOpacity'], 'added': end['addedOpacity']}})

        # the morph text matches the static after-pre (single source of the fixed code)
        codes = page.evaluate('''(() => { const after = document.querySelector("[data-code-after] code").textContent.replace(/\\n$/, "");
          const cells = [...document.querySelectorAll(".morph__cell")].filter(e => !e.classList.contains("morph__cell--before"));
          const grid = {}; for (const c of cells) { const r = +c.style.getPropertyValue("--row"), col = +c.style.getPropertyValue("--col"); (grid[r] ||= {})[col] = c.textContent; }
          const lines = Object.keys(grid).sort((a,b)=>a-b).map(r => { const row = grid[r]; const w = Math.max(...Object.keys(row).map(Number)) + 1;
            let s = ""; for (let i=0;i<w;i++) s += row[i] ?? " "; return s.replace(/\\s+$/, ""); });
          return { after, morph: lines.join("\\n") } })()''')
        record('morph text is the parameterized query, sourced from the same after-code the static version shows',
               'id = ?' in codes['after'] and codes['morph'].replace(' ', '') == codes['after'].replace(' ', ''), codes)

        # stage artifacts cross-fade: exactly one is near full opacity at each stage centre
        centres = {round(p, 2): scrub(page, section, p) for p in (0.1, 0.3, 0.5, 0.7, 0.9)}
        page.evaluate('(y) => window.__autospTest.scrollTo(y)', section['top'])
        page.wait_for_timeout(200)
        dominant = []
        for i, s in enumerate(centres.values()):
            visible = [j for j, o in enumerate(s['stages']) if o > 0.6]
            dominant.append(visible == [i])
        rail_current = [s['rail'][i] == 'current' for i, s in enumerate(centres.values())]
        record('stages: each stage centre shows its own artifact (the others faded) and marks its rail step current',
               all(dominant) and all(rail_current),
               {'dominant_per_stage': dominant, 'rail_current_per_stage': rail_current, 'stage_opacities': [s['stages'] for s in centres.values()]})

        # scroll-position purity: a position revisited gives the same state
        a = scrub(page, section, 0.4)
        scrub(page, section, 0.9)
        b = scrub(page, section, 0.4)
        record('purity: scrubbing away and back to the same position restores the same morph and stage state exactly',
               abs((a['addedOpacity'] or 0) - (b['addedOpacity'] or 0)) < 0.02 and a['stages'] == b['stages'] and a['rail'] == b['rail'],
               {'first': {'added': a['addedOpacity'], 'stages': a['stages']}, 'again': {'added': b['addedOpacity'], 'stages': b['stages']}})

        record('sound: the scrubbed sequence plays nothing (no AudioContext is created)', page.evaluate('window.__audioContexts') == 0,
               {'contexts': page.evaluate('window.__audioContexts')})

        # keyboard controls
        page.evaluate('(y) => window.__autospTest.scrollTo(y)', section['top'])
        page.wait_for_timeout(200)
        page.focus('[data-stage-next]')
        for _ in range(4):
            page.click('[data-stage-next]')
            page.wait_for_timeout(500)
        after_next = page.evaluate(STATE)
        page.click('[data-stage-prev]')
        page.wait_for_timeout(500)
        after_prev = page.evaluate(STATE)
        record('controls: Next stage steps to Approved and Previous steps back, the live counter following along',
               after_next['counter'] == 'Stage 5 of 5: Approved' and after_prev['counter'] == 'Stage 4 of 5: Verified', {'after_4_next': after_next['counter'], 'after_prev': after_prev['counter']})

        live = page.evaluate('''(() => { const c = document.querySelector("[data-stage-counter]"); return { live: c.getAttribute("aria-live"),
          controlsFocusable: [...document.querySelectorAll("[data-proving-controls] button, [data-proving-controls] a")].length } })()''')
        record('controls: the counter is a polite live region and every control is in the tab order', live['live'] == 'polite' and live['controlsFocusable'] == 3, live)

        page.click('[data-skip-animation]')
        page.wait_for_timeout(400)
        skipped = page.evaluate('scrollY > (window.__sectionBottom || 0)', )
        past = page.evaluate('(s) => scrollY >= s.top + s.height - innerHeight - 4', section)
        record('controls: Skip animation jumps past the pinned section', past, {'scrollY': page.evaluate('Math.round(scrollY)'), 'section_end': round(section['top'] + section['height'] - 900)})

        # contrast
        colors = page.evaluate('''(() => { const cs = (s) => getComputedStyle(document.querySelector(s));
          return { bg: getComputedStyle(document.body).backgroundColor, name: cs(".proving__rail-item .proving__name").color,
                   desc: cs(".proving__desc").color, finding: cs(".proving__finding").color, counter: cs(".proving__counter").color } })()''')
        bg = rgb(colors['bg'])
        ratios = {k: contrast(rgb(v), bg) for k, v in colors.items() if k != 'bg'}
        ratios['signal_pass'] = contrast(SIGNAL['pass'], bg)
        ratios['signal_open'] = contrast(SIGNAL['open'], bg)
        record('contrast: rail names, descriptions, finding meta, counter and signal text all clear 4.5:1', all(v >= 4.5 for v in ratios.values()), ratios)
        record('desktop: no console errors or warnings', not errors, errors)

        # ---------- 60fps while scrubbing (real GPU only) ----------
        if args.gpu:
            page.evaluate('(y) => window.__autospTest.scrollTo(y)', section['top'])
            page.wait_for_timeout(200)
            frames = page.evaluate('''(s) => new Promise(res => { const d = []; let last = performance.now(); let i = 0; const steps = 90;
              function tick(now) { d.push(now - last); last = now; i++; const p = i / steps; window.__autospTest.scrollTo(s.top + p * (s.height - innerHeight));
                if (i < steps) requestAnimationFrame(tick); else res(d.slice(3)); } requestAnimationFrame(tick); })''', section)
            med = statistics.median(frames)
            long = [round(f, 1) for f in frames if f > 20]
            record('performance: scrubbing the pinned sequence holds ~60fps (median frame near 16.7ms, few long frames)',
                   med < 20 and len(long) <= 3, {'median_ms': round(med, 1), 'p95_ms': round(sorted(frames)[int(len(frames) * 0.95)], 1), 'long_frames': long})
        ctx.close()

        # ---------- reduced motion: static fallback ----------
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce')
        page = ctx.new_page()
        page.goto(base, wait_until='networkidle')
        rm = page.evaluate('''(() => { const s = document.querySelector(".proving");
          const stages = [...document.querySelectorAll("[data-proving-stages] > .proving__stage")];
          return { animated: s.classList.contains("proving--animated"), controlsHidden: document.querySelector("[data-proving-controls]").hidden,
                   morph: !!document.querySelector(".morph"), stages: stages.length, allVisible: stages.every(e => getComputedStyle(e).opacity === "1" && e.getBoundingClientRect().height > 0),
                   stacked: stages.length > 1 ? stages[1].getBoundingClientRect().top > stages[0].getBoundingClientRect().bottom - 2 : false,
                   tall: s.offsetHeight, finalStates: { chip: !!document.querySelector(".chip--open"), checks: document.querySelectorAll(".check .status--pass").length, pr: !!document.querySelector(".panel--pr") } } })()''')
        record('reduced motion: no pin, no morph, controls hidden; the five stages are stacked and all visible at their final states',
               not rm['animated'] and not rm['morph'] and rm['controlsHidden'] and rm['stages'] == 5 and rm['allVisible'] and rm['stacked']
               and rm['finalStates'] == {'chip': True, 'checks': 3, 'pr': True}, rm)
        page.evaluate('document.querySelector("#proving").scrollIntoView()')
        page.wait_for_timeout(200)
        page.screenshot(path=str(OUT / 'm3-static.png'), full_page=True)
        ctx.close()

        # ---------- short viewport: static ----------
        ctx = browser.new_context(viewport={'width': 1024, 'height': 620})
        page = ctx.new_page()
        page.goto(base, wait_until='networkidle')
        short = page.evaluate('document.querySelector(".proving").classList.contains("proving--animated")')
        record('short viewport (<700px tall): the static version is used, not the pin', not short, {'animated': short})
        ctx.close()

        # ---------- phone ----------
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(base, wait_until='networkidle')
        phone = page.evaluate('''(() => { const s = document.querySelector(".proving");
          return { animated: s.classList.contains("proving--animated"), overflow: document.documentElement.scrollWidth - innerWidth,
                   stages: document.querySelectorAll("[data-proving-stages] > .proving__stage").length } })()''')
        record('phone: static stacked version, no horizontal scroll, all five stages present',
               not phone['animated'] and phone['overflow'] <= 0 and phone['stages'] == 5, phone)
        page.evaluate('document.querySelector("#proving").scrollIntoView()')
        page.wait_for_timeout(200)
        page.screenshot(path=str(OUT / 'm3-phone.png'))
        record('phone: no console errors', not errors, errors)
        ctx.close()

        # ---------- no JavaScript ----------
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, java_script_enabled=False)
        page = ctx.new_page()
        page.goto(base, wait_until='load')
        nojs = page.evaluate('''(() => { const stages = [...document.querySelectorAll("[data-proving-stages] > .proving__stage")];
          return { stages: stages.length, readable: stages.every(e => e.innerText.trim().length > 0), rail: document.querySelectorAll("[data-proving-rail] .proving__rail-item").length,
                   approved: document.body.innerText.includes("Waiting for your reviewer") } })()''')
        record('no JavaScript: the five stages and the rail are readable, through to the approved pull request',
               nojs['stages'] == 5 and nojs['readable'] and nojs['rail'] == 5 and nojs['approved'], nojs)
        ctx.close()
        browser.close()

    passed = sum(ok for _, ok in results)
    print(f'\n{passed}/{len(results)} passed')
    sys.exit(0 if passed == len(results) else 1)


if __name__ == '__main__':
    main()
