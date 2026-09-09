#!/usr/bin/env python3
"""Generate the built-in SVG frames in public/frames/.

Frames are transparent overlays: an outer rectangle with a rounded cut-out
window (even-odd fill) where the photos show through. Insets must match
lib/frames.ts.
"""
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'frames')


def window(W, H, t, r, b, l, rad):
    iw, ih = W - l - r, H - t - b
    return (
        f"M0 0H{W}V{H}H0Z "
        f"M{l + rad} {t}H{l + iw - rad}A{rad} {rad} 0 0 1 {l + iw} {t + rad}"
        f"V{t + ih - rad}A{rad} {rad} 0 0 1 {l + iw - rad} {t + ih}"
        f"H{l + rad}A{rad} {rad} 0 0 1 {l} {t + ih - rad}V{t + rad}A{rad} {rad} 0 0 1 {l + rad} {t}Z"
    )


def klasik(W, H):
    t = 40
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF8E3A"/><stop offset="0.5" stop-color="#FF6D00"/><stop offset="1" stop-color="#1C64F2"/></linearGradient></defs>
<path fill="#0d0d0d" fill-rule="evenodd" d="{window(W, H, t, t, t, t, 28)}"/>
<rect x="{t - 5}" y="{t - 5}" width="{W - 2 * t + 10}" height="{H - 2 * t + 10}" rx="32" fill="none" stroke="url(#g)" stroke-width="5"/>
<rect x="14" y="14" width="{W - 28}" height="{H - 28}" rx="44" fill="none" stroke="#ffffff" stroke-opacity="0.1" stroke-width="2"/>
</svg>
'''


def polaroid(W, H, bottom):
    t = 48
    ty = H - bottom / 2
    fs = 44 if W > H else 52
    dot = 330 if W > H else 300
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
<path fill="#faf9f6" fill-rule="evenodd" d="{window(W, H, t, t, bottom, t, 10)}"/>
<text x="{W / 2}" y="{ty + fs * 0.35}" text-anchor="middle" font-family="Poppins, Helvetica, Arial, sans-serif" font-weight="700" font-size="{fs}" fill="#1a1a1a" letter-spacing="2">SELFIE BOOTH</text>
<circle cx="{W / 2 - dot}" cy="{ty}" r="7" fill="#FF7E1D"/>
<circle cx="{W / 2 + dot}" cy="{ty}" r="7" fill="#1C64F2"/>
</svg>
'''


def neon(W, H):
    t = 56
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FF7E1D"/><stop offset="1" stop-color="#1C64F2"/></linearGradient>
<filter id="glow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="14"/></filter>
</defs>
<path fill="#07070a" fill-rule="evenodd" d="{window(W, H, t, t, t, t, 24)}"/>
<rect x="{t - 6}" y="{t - 6}" width="{W - 2 * t + 12}" height="{H - 2 * t + 12}" rx="30" fill="none" stroke="url(#g)" stroke-width="10" opacity="0.7" filter="url(#glow)"/>
<rect x="{t - 6}" y="{t - 6}" width="{W - 2 * t + 12}" height="{H - 2 * t + 12}" rx="30" fill="none" stroke="url(#g)" stroke-width="4"/>
<rect x="20" y="20" width="{W - 40}" height="{H - 40}" rx="40" fill="none" stroke="url(#g)" stroke-width="2" opacity="0.5"/>
</svg>
'''


def strip(style):
    W, H = 640, 1920
    top, side, bottom, bg, ink = {
        'klasik': (180, 24, 180, '#0d0d0d', '#faf9f6'),
        'polaroid': (144, 28, 240, '#faf9f6', '#1a1a1a'),
        'neon': (176, 32, 176, '#07070a', '#faf9f6'),
    }[style]
    ty = H - bottom / 2
    decoration = ''
    if style != 'polaroid':
        decoration = f'''<rect x="{side - 5}" y="{top - 5}" width="{W - side * 2 + 10}" height="{H - top - bottom + 10}" rx="20" fill="none" stroke="url(#g)" stroke-width="4"/>
<path d="M224 {ty + 32}H416" stroke="url(#g)" stroke-width="3"/>'''
    if style == 'neon':
        decoration += f'''<rect x="12" y="28" width="616" height="1864" rx="30" fill="none" stroke="url(#g)" stroke-opacity="0.45" stroke-width="2"/>
<path d="M250 124H390" stroke="url(#g)" stroke-width="4"/>'''
    if style == 'polaroid':
        decoration = f'''<circle cx="140" cy="{ty}" r="5" fill="#FF7E1D"/>
<circle cx="500" cy="{ty}" r="5" fill="#1C64F2"/>
<text x="320" y="{ty + 42}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#666666" letter-spacing="3">KEEP THE MOMENT</text>'''
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="640" height="1920" viewBox="0 0 640 1920">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF8E3A"/><stop offset="0.5" stop-color="#FF6D00"/><stop offset="1" stop-color="#1C64F2"/></linearGradient></defs>
<path fill="{bg}" fill-rule="evenodd" d="{window(W, H, top, side, bottom, side, 14)}"/>
{decoration}
<text x="320" y="{top / 2 + 10}" text-anchor="middle" font-family="Poppins, Helvetica, Arial, sans-serif" font-weight="700" font-size="34" fill="{ink}" letter-spacing="3">SELFIE BOOTH</text>
<text x="320" y="{ty + 7}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="{ink}" letter-spacing="4">GOOD TIMES</text>
</svg>
'''


FRAMES = {
    'klasik-16x9.svg': klasik(1920, 1080),
    'klasik-9x16.svg': klasik(1080, 1920),
    'polaroid-16x9.svg': polaroid(1920, 1080, 150),
    'polaroid-9x16.svg': polaroid(1080, 1920, 210),
    'neon-16x9.svg': neon(1920, 1080),
    'neon-9x16.svg': neon(1080, 1920),
    'klasik-1x3.svg': strip('klasik'),
    'polaroid-1x3.svg': strip('polaroid'),
    'neon-1x3.svg': strip('neon'),
}

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, svg in FRAMES.items():
        with open(os.path.join(OUT, name), 'w') as f:
            f.write(svg)
        print('wrote', name)
