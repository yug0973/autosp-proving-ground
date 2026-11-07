"""An accessibility audit of both experiences, in a real browser.

  - One h1 shown, and headings that never skip a level going down.
  - Every control a person can reach has a name; every image has alt text (or is hidden).
  - Every form field has a label; an error is tied to its field and announced.
  - Tabbing walks the page in reading order, and every stop shows a focus ring.
  - Whatever the 3D scene draws is hidden from assistive technology, with real text in the page.

    python tests/audit.py --base http://127.0.0.1:5173
"""
import argparse
import sys

from playwright.sync_api import sync_playwright

GPU = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--headless=new']
results = []


def check(name, ok, detail=''):
    results.append(bool(ok))
    print(f"{'PASS' if ok else 'FAIL'} {name}" + (f'  ({detail})' if detail else ''))


SHOWN = """(e) => { if (e.closest('[hidden], [inert]')) return false; const s = getComputedStyle(e);
  if (s.display === 'none' || s.visibility === 'hidden') return false;
  for (let p = e; p; p = p.parentElement) if (getComputedStyle(p).display === 'none') return false; return true; }"""

AUDIT = """() => {
  const shown = """ + SHOWN + """;
  const name = (e) => (e.getAttribute('aria-label') || (e.getAttribute('aria-labelledby') || '').split(' ').map((id) => document.getElementById(id)?.textContent || '').join(' ')
    || (e.labels && [...e.labels].map((l) => l.textContent).join(' ')) || e.getAttribute('title') || e.textContent || e.getAttribute('alt') || '').trim();
  const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter(shown).map((h) => +h.tagName[1]);
  const skips = headings.filter((level, i) => i > 0 && level > headings[i - 1] + 1).length;
  const controls = [...document.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')]
    .filter(shown).filter((e) => e.type !== 'hidden' && !e.closest('[aria-hidden="true"]'));
  const nameless = controls.filter((e) => !name(e)).map((e) => e.outerHTML.slice(0, 80));
  const fields = [...document.querySelectorAll('input, select, textarea')].filter(shown).filter((e) => e.type !== 'hidden' && e.tabIndex !== -1);
  const unlabelled = fields.filter((e) => !(e.labels && e.labels.length) && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby') && !e.closest('fieldset')?.querySelector('legend'))
    .map((e) => e.outerHTML.slice(0, 80));
  const images = [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt') && !i.closest('[aria-hidden="true"]')).length;
  const canvases = [...document.querySelectorAll('canvas')].filter((c) => !c.closest('[aria-hidden="true"]')).length;
  return { h1: headings.filter((h) => h === 1).length, skips, headings: headings.join(''), nameless, unlabelled, images, canvases };
}"""

FOCUS = """() => { const e = document.activeElement; if (!e || e === document.body) return null; const r = e.getBoundingClientRect();
  // the ring may be drawn on the control's label (a chip or tile round a hidden input)
  const ringed = (x) => { if (!x) return false; const s = getComputedStyle(x); return (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2) || (s.boxShadow !== 'none' && s.boxShadow !== ''); };
  return { id: e.outerHTML.slice(0, 120), tag: e.tagName, text: (e.textContent || e.getAttribute('aria-label') || e.name || '').trim().slice(0, 30),
           ring: ringed(e) || ringed(e.closest('label')), top: r.top + scrollY }; }"""


def audit(page, label):
    a = page.evaluate(AUDIT)
    check(f'{label}: one h1 on screen', a['h1'] == 1, str(a['h1']))
    check(f'{label}: headings never skip a level', a['skips'] == 0, a['headings'])
    check(f'{label}: every control has a name', not a['nameless'], '; '.join(a['nameless'][:3]))
    check(f'{label}: every field has a label', not a['unlabelled'], '; '.join(a['unlabelled'][:3]))
    check(f'{label}: every image has alt text', a['images'] == 0, str(a['images']))
    check(f'{label}: the 3D scene is hidden from assistive technology', a['canvases'] == 0, str(a['canvases']))


def walk(page, label, stops):
    page.evaluate('scrollTo(0, 0)')
    page.mouse.click(2, 2)
    seen, ringless = [], []
    for _ in range(stops):
        page.keyboard.press('Tab')
        f = page.evaluate(FOCUS)
        if not f:
            continue
        if seen and f['id'] == seen[0]['id']:
            break  # round to the start again: the whole page has been walked
        seen.append(f)
        if not f['ring']:
            ringless.append(f"{f['tag']} {f['text']}")
    check(f'{label}: every focus stop shows a ring', not ringless, '; '.join(dict.fromkeys(ringless))[:200])
    backwards = sum(1 for a, b in zip(seen, seen[1:]) if b['top'] < a['top'] - 900)
    check(f'{label}: tabbing goes down the page, not back up it', backwards <= 1, str(backwards))
    print(f'     {label}: {len(seen)} focus stops walked')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default='http://127.0.0.1:5173')
    args = parser.parse_args()
    base = args.base.rstrip('/')
    with sync_playwright() as p:
        browser = p.chromium.launch(args=GPU)
        for label, options in (('cinematic', {'viewport': {'width': 1440, 'height': 900}}),
                               ('phone', {'viewport': {'width': 390, 'height': 844}, 'is_mobile': True, 'has_touch': True})):
            ctx = browser.new_context(**options)
            page = ctx.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto(base + '/', wait_until='networkidle')
            page.wait_for_timeout(1500)
            audit(page, label)
            walk(page, label, 70)
            # a field's error is tied to it and announced
            form = '[data-apply]' if label == 'cinematic' else '[data-calm-apply]'
            page.evaluate(f"document.querySelector('{form}').scrollIntoView()")
            page.wait_for_timeout(600)
            button = f'{form} [data-step-next]' if label == 'cinematic' else f'{form} [type=submit]'
            page.click(button)
            page.wait_for_timeout(300)
            tied = page.evaluate(f"""[...document.querySelectorAll('{form} .apply__error')].filter((e) => e.textContent.trim())
                .every((e) => e.id && document.querySelector(`[aria-describedby~="${{e.id}}"]`))""")
            invalid = page.evaluate(f"document.querySelectorAll('{form} [aria-invalid=true]').length")
            check(f'{label}: a field that needs attention says so, tied to its field', tied and invalid >= 1, f'{invalid} marked')
            check(f'{label}: no script errors', not errors, '; '.join(errors)[:200])
            ctx.close()
        browser.close()
    print(f'\n{sum(results)}/{len(results)} checks passed')
    return 0 if all(results) else 1


if __name__ == '__main__':
    sys.exit(main())
