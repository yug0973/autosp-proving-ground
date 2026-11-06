"""Draws AUTOSP's mark: the letter A in the pixel font the city's towers use (world/display-font.ts),
on Nexarise ink, with one lime pixel after it, the full stop of a verified fix.

    python tests/make-icon.py

Writes public/favicon.svg, public/favicon-32.png and public/apple-touch-icon.png.
"""
import pathlib

from PIL import Image, ImageDraw

OUT = pathlib.Path(__file__).resolve().parent.parent / 'public'
INK = '#050816'
MIST = '#f3f6ff'
LIME = '#c8f245'
# the A of display-font.ts, then a gap, then the lime pixel on the baseline
A = ['.#.', '#.#', '###', '#.#', '#.#']
CELLS = [(x, y, MIST) for y, row in enumerate(A) for x, c in enumerate(row) if c == '#'] + [(4, 4, LIME)]
COLS, ROWS = 5, 5
LIT = 0.84  # each pixel fills this much of its cell, like a lit window


def layout(size):
    unit = size * 0.16
    left = (size - COLS * unit) / 2 + unit * (1 - LIT) / 2
    top = (size - ROWS * unit) / 2 + unit * (1 - LIT) / 2
    return unit, left, top


def svg():
    size = 32
    unit, left, top = layout(size)
    rects = ''.join(
        f'<rect x="{left + x * unit:.2f}" y="{top + y * unit:.2f}" width="{unit * LIT:.2f}" height="{unit * LIT:.2f}" fill="{colour}"/>'
        for x, y, colour in CELLS
    )
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}"><rect width="{size}" height="{size}" rx="7" fill="{INK}"/>{rects}</svg>\n'


def png(size, rounded):
    scale = 4
    big = size * scale
    img = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((0, 0, big - 1, big - 1), radius=big * 7 / 32 if rounded else 0, fill=INK)
    unit, left, top = layout(big)
    for x, y, colour in CELLS:
        x0, y0 = left + x * unit, top + y * unit
        draw.rectangle((x0, y0, x0 + unit * LIT, y0 + unit * LIT), fill=colour)
    return img.resize((size, size), Image.LANCZOS)


(OUT / 'favicon.svg').write_text(svg(), encoding='utf-8')
png(32, True).save(OUT / 'favicon-32.png', optimize=True)
# iOS rounds the corners of its own icons
png(180, False).save(OUT / 'apple-touch-icon.png', optimize=True)
png(512, True).save(pathlib.Path(__file__).resolve().parent / 'output' / 'logo-preview.png')
print('ok')
