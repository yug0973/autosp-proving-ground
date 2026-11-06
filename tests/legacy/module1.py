"""Module 1 checks: tokens, fonts, nav, smooth scroll and the reduced-motion guard.

Run with the dev server up:  python tests/module1.py [--base http://127.0.0.1:5173/] [--gpu]
Screenshots go to tests/output/. Sections arrive in later modules, so the scroll checks append a
tall test-only section to <main> in the served HTML; nothing is added to the page source.
"""
import argparse, json, pathlib, sys
from playwright.sync_api import sync_playwright

OUT = pathlib.Path(__file__).resolve().parent / 'output'
OUT.mkdir(exist_ok=True)
GPU = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--headless=new']
results = []


def record(name, ok, detail):
    results.append((name, bool(ok)))
    print(('PASS ' if ok else 'FAIL ') + name + ' | ' + json.dumps(detail, ensure_ascii=False, default=str)[:600])


def lum(rgb):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * ch(rgb[0]) + 0.7152 * ch(rgb[1]) + 0.0722 * ch(rgb[2])


def contrast(a, b):
    hi, lo = sorted((lum(a), lum(b)), reverse=True)
    return round((hi + 0.05) / (lo + 0.05), 2)


def rgb(css):
    nums = css[css.index('(') + 1:css.index(')')].replace(',', ' ').replace('/', ' ').split()
    return tuple(round(float(n)) for n in nums[:3])


TEST_SECTIONS = ('<div style="height:300vh"></div>'
                 '<section id="proving" style="height:120vh"><h2>Test target</h2></section>'
                 '<div style="height:100vh"></div></main>')


def with_test_sections(page, base):
    """Serve the real page with tall test-only sections after the hero, so link targets exist at load like real sections."""
    def handle(route):
        response = route.fetch()
        body = response.text()
        assert body.count('</main>') == 1
        route.fulfill(response=response, body=body.replace('</main>', TEST_SECTIONS))
    page.route(base, handle)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://127.0.0.1:5173/')
    ap.add_argument('--gpu', action='store_true')
    args = ap.parse_args()
    base = args.base
    with sync_playwright() as p:
        browser = p.chromium.launch(args=GPU if args.gpu else [])

        # ---------- desktop ----------
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: m.type in ('error', 'warning') and errors.append(m.text))
        page.goto(base, wait_until='networkidle')
        page.evaluate('document.fonts.ready')
        page.screenshot(path=str(OUT / 'm1-desktop-1440.png'))

        fonts = page.evaluate('''[...document.fonts].filter(f => f.status === "loaded").map(f => f.family + " " + f.weight)''')
        record('fonts: Cabinet Grotesk 800 and General Sans load from self-hosted WOFF2',
               any('Cabinet Grotesk' in f for f in fonts) and any('General Sans' in f for f in fonts), sorted(set(fonts)))

        styles = page.evaluate('''(() => {
          const cs = (sel) => getComputedStyle(document.querySelector(sel));
          const root = getComputedStyle(document.documentElement);
          return {
            body: { bg: cs("body").backgroundColor, color: cs("body").color, font: cs("body").fontFamily, lh: cs("body").lineHeight, size: cs("body").fontSize },
            wordmark: { font: cs(".wordmark").fontFamily, weight: cs(".wordmark").fontWeight },
            link: { color: cs(".site-nav__link").color },
            nav: { bg: cs(".site-nav").backgroundColor, position: cs(".site-nav").position, border: cs(".site-nav").borderBottomWidth, blur: cs(".site-nav").backdropFilter },
            cta: { bg: cs(".btn--primary").backgroundColor, color: cs(".btn--primary").color, radius: cs(".btn--primary").borderRadius },
            tokens: { slate950: root.getPropertyValue("--slate-950").trim(), bone100: root.getPropertyValue("--bone-100").trim(), bone300: root.getPropertyValue("--bone-300").trim() },
            layers: [...document.styleSheets].flatMap(s => { try { return [...s.cssRules] } catch { return [] } }).flatMap(r => r.constructor.name === "CSSLayerStatementRule" ? r.nameList : r.constructor.name === "CSSLayerBlockRule" ? [r.name] : []).filter((n, i, all) => all.indexOf(n) === i)
          } })()''')
        record('tokens: page ground slate-950, text bone-100, body General Sans at --step-0 / 1.55',
               rgb(styles['body']['bg']) == (16, 21, 23) and rgb(styles['body']['color']) == (235, 231, 219)
               and 'General Sans' in styles['body']['font'] and abs(float(styles['body']['lh'][:-2]) / float(styles['body']['size'][:-2]) - 1.55) < 0.01, styles['body'])
        record('cascade layers in priority order (first appearance): reset, tokens, base, components, utilities',
               styles['layers'] == ['reset', 'tokens', 'base', 'components', 'utilities'], styles['layers'])
        record('nav: fixed, opaque slate ground, no border, no blur; wordmark in Cabinet Grotesk 800',
               styles['nav']['position'] == 'fixed' and styles['nav']['border'] == '0px' and styles['nav']['blur'] in ('none', '')
               and 'Cabinet Grotesk' in styles['wordmark']['font'] and styles['wordmark']['weight'] == '800', styles['nav'] | {'wordmark': styles['wordmark']})
        nav_ground = (16, 21, 23)  # 92% slate-950 over slate-950 page ground
        record('contrast: nav links (bone-300) and CTA (slate-950 on bone-100) clear AA',
               contrast(rgb(styles['link']['color']), nav_ground) >= 4.5 and contrast(rgb(styles['cta']['color']), rgb(styles['cta']['bg'])) >= 4.5,
               {'links': contrast(rgb(styles['link']['color']), nav_ground), 'cta': contrast(rgb(styles['cta']['color']), rgb(styles['cta']['bg'])), 'cta_radius': styles['cta']['radius']})

        texts = page.evaluate('''(() => { const t = document.querySelector(".site-nav").innerText; return { text: t,
          middot: /·/.test(t), arrows: /[→↗]/.test(t), caps: [...document.querySelectorAll(".site-nav *")].some(e => getComputedStyle(e).textTransform === "uppercase") } })()''')
        record('banned treatments absent from the nav: middle dots, link arrows, uppercase transforms',
               not texts['middot'] and not texts['arrows'] and not texts['caps'], texts)

        # keyboard order and focus ring
        order = []
        for _ in range(9):
            page.keyboard.press('Tab')
            order.append(page.evaluate('''(() => { const e = document.activeElement, cs = getComputedStyle(e);
              return { name: e.getAttribute("aria-label") || e.innerText.trim(), outline: cs.outlineStyle + " " + cs.outlineWidth + " " + cs.outlineColor, offset: cs.outlineOffset } })()'''))
        names = [o['name'] for o in order]
        record('keyboard: skip link first, then wordmark, four links, sound toggle and Apply; 2px bone outline at 3px offset',
               names[:8] == ['Skip to content', 'AUTOSP, back to top', "How it's proven", 'The log', 'Results', 'FAQ', 'Interface sound', 'Apply for the free pilot']
               and all(o['outline'].startswith('solid 2px') and rgb(o['outline'][o['outline'].index('rgb'):]) == (235, 231, 219) and o['offset'] == '3px' for o in order[:8]),
               order[:8])

        # sound toggle: off by default, toggles, persists
        state0 = page.get_attribute('[data-sound-toggle]', 'aria-pressed')
        page.click('[data-sound-toggle]')
        state1 = page.get_attribute('[data-sound-toggle]', 'aria-pressed')
        page.reload(wait_until='networkidle')
        state2 = page.get_attribute('[data-sound-toggle]', 'aria-pressed')
        page.click('[data-sound-toggle]')
        stored = page.evaluate('localStorage.getItem("autosp:sound")')
        record('sound toggle: off by default, turns on, is remembered after reload, turns off again',
               (state0, state1, state2, stored) == ('false', 'true', 'true', 'off'), [state0, state1, state2, stored])

        # smooth scroll with Lenis: an anchor click glides, lands below the nav and moves focus
        with_test_sections(page, base)
        page.goto(base, wait_until='networkidle')
        mode = page.evaluate('document.documentElement.dataset.scroll')
        page.wait_for_timeout(300)
        page.click('.site-nav__link[href="#proving"]')
        samples = []
        for _ in range(12):
            page.wait_for_timeout(80)
            samples.append(round(page.evaluate('scrollY')))
        page.wait_for_timeout(1500)
        land = page.evaluate('''(() => { const t = document.getElementById("proving"); return { top: Math.round(t.getBoundingClientRect().top),
          navH: Math.round(document.querySelector(".site-nav").getBoundingClientRect().height), focused: document.activeElement === t, hash: location.hash,
          current: document.querySelector('.site-nav__link[href="#proving"]').getAttribute("aria-current") } })()''')
        glides = len(set(samples)) >= 5 and samples == sorted(samples)
        record('smooth scroll: Lenis drives the page; an anchor click glides over several frames, lands below the nav and focuses the target',
               mode == 'lenis' and glides and land['top'] >= land['navH'] and land['top'] <= land['navH'] + 40 and land['focused'] and land['hash'] == '#proving',
               {'mode': mode, 'scrollY_every_80ms': samples, 'landing': land})
        record('nav: the link for the section under the reading line is marked aria-current', land['current'] == 'true', land['current'])
        page.mouse.wheel(0, 600)
        page.wait_for_timeout(120)
        mid = page.evaluate('scrollY')
        page.wait_for_timeout(900)
        end = page.evaluate('scrollY')
        record('smooth scroll: wheel input is smoothed (still moving 120ms after the wheel event)', end > mid, {'at_120ms': mid, 'settled': end})
        record('desktop: no console errors or warnings', not errors, errors)
        ctx.close()

        # ---------- reduced motion ----------
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce')
        page = ctx.new_page()
        with_test_sections(page, base)
        page.goto(base, wait_until='networkidle')
        rm_mode = page.evaluate('document.documentElement.dataset.scroll')
        lenis_class = page.evaluate('document.documentElement.classList.contains("lenis")')
        page.click('.site-nav__link[href="#proving"]')
        page.wait_for_timeout(30)
        rm_land = page.evaluate('''(() => { const t = document.getElementById("proving"); return { top: Math.round(t.getBoundingClientRect().top), focused: document.activeElement === t } })()''')
        record('reduced motion: no Lenis, native scroll, and an anchor jump is instant (in place 30ms after the click) with focus moved',
               rm_mode == 'native' and not lenis_class and 0 <= rm_land['top'] <= 140 and rm_land['focused'], {'mode': rm_mode, 'lenis_class': lenis_class, 'landing': rm_land})
        ctx.close()

        # ---------- phone ----------
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(base, wait_until='networkidle')
        page.evaluate('document.fonts.ready')
        page.screenshot(path=str(OUT / 'm1-phone-390.png'))
        phone = page.evaluate('''(() => { const vis = (e) => getComputedStyle(e).display !== "none" && e.getClientRects().length;
          const targets = [...document.querySelectorAll(".site-nav a, .site-nav button")].filter(vis).map(e => { const r = e.getBoundingClientRect(); return [e.getAttribute("aria-label") || e.innerText.trim(), Math.round(r.width), Math.round(r.height)] });
          return { links: vis(document.querySelector(".site-nav__links")), apply: document.querySelector(".btn--primary").innerText.trim(), applyName: document.querySelector(".btn--primary").getAttribute("aria-label"),
                   overflow: document.documentElement.scrollWidth - innerWidth, targets } })()''')
        record('phone: section links hidden, Apply shortens (full accessible name kept), no horizontal scroll, every target at least 44px',
               not phone['links'] and phone['apply'] == 'Apply' and phone['applyName'] == 'Apply for the free pilot' and phone['overflow'] <= 0
               and all(w >= 44 and h >= 44 for _, w, h in phone['targets']), phone)
        record('phone: no console errors', not errors, errors)
        ctx.close()
        browser.close()

    passed = sum(ok for _, ok in results)
    print(f'\n{passed}/{len(results)} passed')
    sys.exit(0 if passed == len(results) else 1)


if __name__ == '__main__':
    main()
