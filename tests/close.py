"""Close views of the three findings a visitor can pick, for looking at the buildings.

    python tests/close.py LABEL [--base URL] [--quality high|low]

Each finding is shot part way through the push (where blockers are clearing), fully in, and from the
backlog's overview. Writes tests/output/LABEL/.
"""
import argparse
import pathlib

from PIL import Image
from playwright.sync_api import sync_playwright

GPU = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--headless=new']
OUT = pathlib.Path(__file__).resolve().parent / 'output'
FINDINGS = ['CWE-89', 'CWE-79', 'CWE-639']
PUSH = [0.12, 0.2, 0.32, 0.6]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('label')
    ap.add_argument('--base', default='http://127.0.0.1:5173/')
    ap.add_argument('--quality', default='high')
    args = ap.parse_args()
    folder = OUT / args.label
    folder.mkdir(parents=True, exist_ok=True)
    cores = 8 if args.quality == 'high' else 2
    with sync_playwright() as p:
        browser = p.chromium.launch(args=GPU)
        for cwe in FINDINGS:
            ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
            ctx.add_init_script(f"Object.defineProperty(navigator, 'hardwareConcurrency', {{ get: () => {cores} }})")
            page = ctx.new_page()
            page.goto(f'{args.base}?test&sway=off', wait_until='networkidle')
            page.wait_for_function("document.documentElement.dataset.world === 'live'", timeout=120000)
            page.evaluate(f"document.querySelector('input[value=\"{cwe}\"]').click()")
            shots = []
            for share in PUSH:
                page.evaluate(
                    """(f) => { const t = document.querySelector('[data-push]'); const r = t.getBoundingClientRect();
                       scrollTo(0, r.top + scrollY + (t.offsetHeight - innerHeight) * f); }""",
                    share,
                )
                page.wait_for_timeout(2500)
                path = folder / f'{args.quality}-{cwe}-{int(share * 100):02d}.png'
                page.screenshot(path=str(path), timeout=180000)
                shots.append(path)
                print(path.name, page.evaluate('__world.inspect().push'), flush=True)
            ctx.close()
            sheet = Image.new('RGB', (720 * 2, 450 * 2))
            for i, shot in enumerate(shots):
                sheet.paste(Image.open(shot).resize((720, 450)), ((i % 2) * 720, (i // 2) * 450))
            sheet.save(folder / f'{args.quality}-{cwe}-sheet.png')
        browser.close()


if __name__ == '__main__':
    main()
