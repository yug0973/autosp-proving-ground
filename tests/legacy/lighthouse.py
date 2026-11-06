"""Lighthouse accessibility audit (mobile and desktop) against a running server.

Lighthouse cannot spawn Chrome in this environment, so Playwright launches Chromium with a
remote-debugging port and Lighthouse attaches to it.
Run:  python tests/lighthouse.py [--base http://127.0.0.1:4173/]
"""
import argparse, json, pathlib, subprocess, sys
from playwright.sync_api import sync_playwright

OUT = pathlib.Path(__file__).resolve().parent / 'output'
OUT.mkdir(exist_ok=True)
PORT = 9333


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://127.0.0.1:4173/')
    base = ap.parse_args().base
    ok = True
    with sync_playwright() as p:
        browser = p.chromium.launch(args=[f'--remote-debugging-port={PORT}', '--headless=new'])
        for form in ('mobile', 'desktop'):
            report = OUT / f'lighthouse-{form}.json'
            cmd = ['npx', '-y', 'lighthouse@13.5.0', base, f'--port={PORT}', '--only-categories=accessibility',
                   '--output=json', f'--output-path={report}', '--quiet']
            if form == 'desktop':
                cmd.append('--preset=desktop')
            subprocess.run(cmd, check=True, shell=(sys.platform == 'win32'))
            data = json.loads(report.read_text(encoding='utf-8'))
            score = round(data['categories']['accessibility']['score'] * 100)
            failing = [f"{a['id']}: {a['title']}" for a in data['audits'].values()
                       if a.get('scoreDisplayMode') == 'binary' and a.get('score') == 0]
            print(f'{form}: accessibility {score}' + (f' | failing: {failing}' if failing else ''))
            ok = ok and score == 100
        browser.close()
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
