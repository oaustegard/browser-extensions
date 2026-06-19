#!/usr/bin/env python3
"""Generate the extension icons (16/32/48/128) with Pillow.

Design: two overlapping account "busts" (head + shoulders) in white on a
Google-blue rounded square — the universal "profiles / accounts" symbol, which
reads even at 16px. Drawn large and downscaled with LANCZOS for clean edges.
Run: python3 generate_icons.py
"""

import os
from PIL import Image, ImageDraw

S = 512  # supersample canvas
BLUE = (26, 115, 232, 255)     # Google blue
WHITE = (255, 255, 255, 255)
HERE = os.path.dirname(os.path.abspath(__file__))


def rounded_bg(img):
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=BLUE)


def bust(d, cx, head_cy, hr, fill):
    """A head circle + arched shoulders, centered on cx."""
    # head
    d.ellipse([cx - hr, head_cy - hr, cx + hr, head_cy + hr], fill=fill)
    # shoulders: top half of a wide ellipse, just below the head
    sw = hr * 1.9          # half-width of shoulders
    sy = head_cy + hr * 1.15   # top of the shoulder arch
    sh = hr * 2.2          # height of the arch ellipse (only top half drawn)
    d.pieslice([cx - sw, sy, cx + sw, sy + sh * 2], start=180, end=360, fill=fill)


def main():
    base = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    rounded_bg(base)
    d = ImageDraw.Draw(base)

    hr = S * 0.135
    # back bust (up-left), front bust (down-right)
    back = (S * 0.40, S * 0.36)
    front = (S * 0.60, S * 0.46)

    bust(d, back[0], back[1], hr, WHITE)
    # blue gap ring so the front bust separates from the back one
    bust(d, front[0], front[1], hr * 1.16, BLUE)
    bust(d, front[0], front[1], hr, WHITE)

    for size in (128, 48, 32, 16):
        out = base.resize((size, size), Image.LANCZOS)
        path = os.path.join(HERE, "icons", "icon%d.png" % size)
        out.save(path)
        print("wrote", path)


if __name__ == "__main__":
    main()
