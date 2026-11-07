"""Draws public/sample-evidence-pack.pdf: an illustrative evidence pack built only from the demo fix the
page already shows (the CWE-89 finding, its test, the sandbox, the three checks and the record). It is
marked as a sample on every page and claims nothing beyond the page's own copy.

    python tests/make-evidence-pack.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H, M = 1240, 1754, 110  # A4 at 150 dpi
FONTS = Path('C:/Windows/Fonts')
INK, MUTED, RULE = (6, 10, 30), (70, 80, 110), (200, 206, 222)


def font(name, size):
    try:
        return ImageFont.truetype(str(FONTS / name), size)
    except OSError:
        return ImageFont.load_default(size)


SANS, BOLD, MONO = (lambda s: font('segoeui.ttf', s)), (lambda s: font('segoeuib.ttf', s)), (lambda s: font('consola.ttf', s))

RECORD = [
    ('Reported: CWE-89 in app/repositories/invoices.py', 'd84ab5e4ca8fe5840de48f4f74ed3ceccb311abeb18949aebdb8e41eb1f4ac11'),
    ('Reproduced: test_invoice_id_cannot_change_the_query failed', 'fead3b3a5eced2cd326382e3800b5b8fc1ece4d5ac7d9b64e93eeab444d823f0'),
    ('Patched in sandbox sbx-7f3a: 1 line removed, 1 added', '9e267cd2a625451e62887a4ecadd1dfd755d72774268f02d5df8ad05244a1765'),
    ('Verified: all three gates passed', 'c16297b38bb8adb8402e32409b9fd46bc03caeafcea9cf734a4a6f17a1b4e59f'),
    ('Waiting for a person to merge', None),
]


class Page:
    def __init__(self, number):
        self.img = Image.new('RGB', (W, H), 'white')
        self.d = ImageDraw.Draw(self.img)
        self.y = M
        self.d.text((M, 50), 'AUTOSP  /  Sample evidence pack', font=SANS(20), fill=MUTED)
        self.d.text((W - M, 50), 'SAMPLE: ILLUSTRATIVE, NOT A REAL ASSESSMENT', font=BOLD(20), fill=MUTED, anchor='ra')
        self.d.text((W - M, H - 60), f'Page {number}', font=SANS(20), fill=MUTED, anchor='ra')

    def wrap(self, text, f, width):
        lines, line = [], ''
        for word in text.split():
            test = f'{line} {word}'.strip()
            if self.d.textlength(test, font=f) > width and line:
                lines.append(line)
                line = word
            else:
                line = test
        return lines + [line]

    def text(self, text, f, fill=INK, gap=14, indent=0):
        for line in self.wrap(text, f, W - 2 * M - indent):
            self.d.text((M + indent, self.y), line, font=f, fill=fill)
            self.y += f.size + 10
        self.y += gap

    def heading(self, text):
        self.y += 24
        self.d.line((M, self.y, W - M, self.y), fill=RULE, width=2)
        self.y += 24
        self.text(text, BOLD(34), gap=18)

    def row(self, label, value):
        self.d.text((M, self.y), label, font=BOLD(24), fill=INK)
        top = self.y
        self.y = top
        for line in self.wrap(value, SANS(24), W - 2 * M - 300):
            self.d.text((M + 300, self.y), line, font=SANS(24), fill=INK)
            self.y += 34
        self.y += 12


one = Page(1)
one.y = 180
one.text('Sample evidence pack', BOLD(64), gap=10)
one.text('One fix, from the finding to the merge', SANS(32), fill=MUTED, gap=30)
one.text(
    'This sample shows the shape of the evidence pack an auditor gets for each assessment. It is built from the '
    'illustrative fix shown on the AUTOSP page. The service, the finding and the fingerprints are examples, not '
    'from a real customer.',
    SANS(26),
)
one.text('To confirm: the final layout and contents of the pack.', BOLD(24), fill=MUTED)
one.heading('The finding')
one.row('Weakness', 'CWE-89, SQL injection')
one.row('Where', 'app/repositories/invoices.py')
one.row('Reported by', 'Your existing scanner')
one.heading('Reproduced')
one.text(
    'Before anything was changed, AUTOSP wrote a test that fails while the weakness is there: '
    'test_invoice_id_cannot_change_the_query. It failed on the code as it was.',
    SANS(26),
)
one.heading('Patched in a sealed sandbox')
one.text(
    'The smallest fix was written inside a throwaway container with no internet, a read-only file system and hard '
    'time limits. The container was gone when the job ended.',
    SANS(26),
)
one.row('Sandbox', 'sbx-7f3a')
one.row('Change', '1 line removed, 1 added')

two = Page(2)
two.heading('Verified before merge')
two.text('The fix had to pass all three checks before a pull request was opened:', SANS(26))
for check in ('The reproduction test now passes', 'Your existing test suite still passes', 'A fresh static scan comes back clear'):
    two.text(f'Passed:  {check}', SANS(26), gap=6, indent=20)
two.y += 10
two.heading('A person merges')
two.text(
    'AUTOSP opened a pull request with this evidence and stopped there. Your reviewers approve and merge under your '
    'own branch protection, which the GitHub App can’t change or bypass.',
    SANS(26),
)
two.heading('The record')
two.text(
    'Every step was written to an append-only log. Each entry carries the fingerprint of the one before it, so '
    'editing any entry breaks every fingerprint after it.',
    SANS(26),
)
for i, (entry, fp) in enumerate(RECORD, 1):
    two.text(f'{i}.  {entry}', BOLD(24), gap=2)
    two.text(fp or 'written when a person merges', MONO(20), fill=MUTED, gap=14, indent=36)

out = Path(__file__).resolve().parent.parent / 'public' / 'sample-evidence-pack.pdf'
one.img.save(out, 'PDF', resolution=150, save_all=True, append_images=[two.img], title='AUTOSP sample evidence pack')
print(out, out.stat().st_size)
