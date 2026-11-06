"""Renders the phone page's one sky, at three moments: night, before dawn and dawn.

    python tests/make-sky.py

Writes public/sky-night.webp, sky-predawn.webp, sky-dawn.webp, four mist banks and sky-grain.png. The cloud field is the same in all
three, so crossfading them reads as one sky brightening. The first two stay dark enough for light text
wherever it falls, the third light enough for ink: tests/light.py measures that.
"""
import pathlib

import numpy as np
from PIL import Image

W, H = 540, 1170
OUT = pathlib.Path(__file__).resolve().parent.parent / 'public'
rng = np.random.default_rng(29)


def field(beta, stretch):
    """Soft noise, longer sideways than tall, as thin morning cloud is."""
    fy = np.fft.fftfreq(H)[:, None]
    fx = np.fft.rfftfreq(W)[None, :] * stretch
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1
    spectrum = np.fft.rfft2(rng.standard_normal((H, W))) / f ** beta
    spectrum[0, 0] = 0
    n = np.fft.irfft2(spectrum, s=(H, W))
    return (n - n.mean()) / n.std()


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def ramp(y, stops):
    at = [s[0] for s in stops]
    colours = np.array([[int(s[1][i:i + 2], 16) / 255 for i in (1, 3, 5)] for s in stops]) ** 2.2
    return np.stack([np.interp(y, at, colours[:, c]) for c in range(3)], -1)


def mix(a, b, t):
    return a * (1 - t[..., None]) + b * t[..., None]


y = np.linspace(0, 1, H)[:, None] * np.ones((H, W))
base = field(2.5, 2.4)
wander = field(2.8, 1.6)
detail = field(1.9, 3.0)
# bend the field along itself, so banks swell and curl rather than run in streaks
rows, cols = np.indices((H, W))
n = base[np.clip(rows + (wander * 34).astype(int), 0, H - 1), (cols + (wander * 70).astype(int)) % W] + 0.16 * detail
# cloud gathers towards the horizon and thins, with no edge, as it rises
density = smooth(0.0, 0.85, n * 0.9 + 2.6 * (y - 0.74)) * smooth(0.34, 0.7, y)
# the light comes up from the horizon: the underside of each bank is the bright side
lit = smooth(-0.35, 0.55, (n - np.roll(n, -26, axis=0)) * 2.2 + 1.2 * (y - 0.7))
# where the sun is about to come up
glow = np.exp(-(((cols - W * 0.62) / (W * 0.7)) ** 2 + ((rows - H * 1.02) / (H * 0.3)) ** 2))

stars = np.zeros((H, W))
for _ in range(170):
    sy, sx = int(rng.uniform(0, H * 0.62) ** 1.0), int(rng.uniform(0, W))
    stars[sy:sy + 2, sx:sx + 2] = rng.uniform(0.12, 0.62) ** 2
stars = stars * smooth(0.65, 0.1, y)

SCENES = {
    'night': {
        'glow': ('#1c3370', 0.35),
        'sky': [(0, '#03060f'), (0.45, '#070d2a'), (0.8, '#0d1a4a'), (1, '#16295f')],
        'shade': [(0, '#050a22'), (1, '#0a1336')],
        'light': [(0, '#0d1a48'), (1, '#1a2c64')],
        'amount': 0.8,
        'stars': 1.0,
    },
    'predawn': {
        'glow': ('#3b6c98', 0.5),
        'sky': [(0, '#040a20'), (0.4, '#0b1c4c'), (0.72, '#17396f'), (0.92, '#23507f'), (1, '#2f5f88')],
        'shade': [(0, '#0c1e50'), (1, '#183869')],
        'light': [(0, '#1b3b72'), (1, '#3f6288')],
        'amount': 0.85,
        'stars': 0.18,
    },
    'dawn': {
        'glow': ('#ffd9a0', 0.85),
        'sky': [(0, '#5c9ce4'), (0.4, '#9cc8f0'), (0.72, '#d9e6ea'), (0.9, '#fde6c4'), (1, '#ffcf96')],
        'shade': [(0, '#a9c8ea'), (1, '#e6d6cc')],
        'light': [(0, '#eaf3fb'), (1, '#fff3e0')],
        'amount': 0.9,
        'stars': 0,
    },
}

for name, scene in SCENES.items():
    image = ramp(y, scene['sky'])
    cloud = mix(ramp(y, scene['shade']), ramp(y, scene['light']), lit)
    image = mix(image, cloud, density * scene['amount'])
    tint = np.array([int(scene['glow'][0][i:i + 2], 16) / 255 for i in (1, 3, 5)]) ** 2.2
    image = mix(image, tint[None, None, :] * np.ones((H, W, 3)), glow * scene['glow'][1])
    image = image + stars[..., None] * scene['stars'] * np.array([0.8, 0.88, 1.0])
    srgb = np.clip(image, 0, 1) ** (1 / 2.2) * 255
    path = OUT / f'sky-{name}.webp'
    Image.fromarray(np.clip(srgb + 0.5, 0, 255).astype('uint8')[:H - 34]).save(path, 'WEBP', quality=84, method=6)
    print(path.name, path.stat().st_size // 1024, 'KB')

# Grain laid over the sky on the page: it stops the long soft ramps banding on a phone's screen
tile = rng.normal(127, 34, (64, 64))
grain = np.stack([np.clip(tile, 0, 255), np.full((64, 64), 16.0)], -1).astype('uint8')
path = OUT / 'sky-grain.png'
Image.fromarray(grain, 'LA').save(path, optimize=True)
print(path.name, path.stat().st_size // 1024, 'KB')

# The mist in front of the words: the page's words rise out of it. Soft at the top, thick at the foot
MW, MH = 560, 240


def mist_field(beta, stretch):
    fy = np.fft.fftfreq(MH)[:, None]
    fx = np.fft.rfftfreq(MW)[None, :] / stretch
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1
    spectrum = np.fft.rfft2(rng.standard_normal((MH, MW))) / f ** beta
    spectrum[0, 0] = 0
    n = np.fft.irfft2(spectrum, s=(MH, MW))
    return (n - n.mean()) / n.std()


my = np.linspace(0, 1, MH)[:, None] * np.ones((MH, MW))
for layer, (lift, wave) in {'back': (0.0, 0.2), 'front': (0.24, 0.16)}.items():
    swell = mist_field(2.4, 3.0)
    wisp = mist_field(1.7, 2.0)
    alpha = smooth(0.0, 0.72, my - lift + swell * wave + wisp * 0.05)
    # the edges of the picture fade through the page's sides without a seam: the field wraps
    for tone, (top, foot) in {'night': ('#23457f', '#2f5a93'), 'dawn': ('#fff6e8', '#ffe8cc')}.items():
        colours = ramp(my, [(0, top), (1, foot)]) ** (1 / 2.2) * 255
        rgba = np.dstack([colours, alpha * (0.9 if layer == 'front' else 0.72) * 255])
        path = OUT / f'mist-{layer}-{tone}.webp'
        Image.fromarray(np.clip(rgba, 0, 255).astype('uint8'), 'RGBA').save(path, 'WEBP', quality=45, alpha_quality=55, method=6)
        print(path.name, path.stat().st_size // 1024, 'KB')
