"""Recolour the CUEVO mark from its original green to the app's brand colour.

The artwork is exactly two colours -- a green field and a white mark -- with
every other pixel an antialiased blend of the two. So rather than shifting hues
(which smears the blends and leaves grey fringes), each pixel is solved back
into the blend factor that produced it:

    pixel = a * white + (1 - a) * green

and then rebuilt with the new colour at the same a. Antialiasing survives
exactly, and the white mark stays pure white.

About 1.5% of pixels sit slightly off that line -- soft shading in the artwork.
Their offset is measured and added back after the remap, so that shading is
carried over rather than flattened onto the new colour.

    python scripts/recolor-icon.py [--check]

Writes icon/app-icon.png and icon/app-icon.ico, keeping the originals as
icon/app-icon-green.*.
"""

import sys
from pathlib import Path

from PIL import Image

SRC_FIELD = (0x41, 0xB8, 0x83)   # original green
MARK = (0xFF, 0xFF, 0xFF)        # the winged C
NEW_FIELD = (0x33, 0x5C, 0x67)   # --primary

ICON_DIR = Path(__file__).resolve().parent.parent / "icon"
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]


def clamp8(v):
    return max(0, min(255, int(round(v))))


def blend_factor(pixel, field, mark):
    """Least-squares a in pixel = a*mark + (1-a)*field, across the 3 channels."""
    num = den = 0.0
    for p, f, m in zip(pixel, field, mark):
        d = m - f
        num += (p - f) * d
        den += d * d
    if den == 0:
        return 0.0
    return max(0.0, min(1.0, num / den))


def residual(pixel, a, field, mark):
    """How far the pixel sits off the field->mark line, in 0-255 units."""
    return max(
        abs(p - (a * m + (1 - a) * f))
        for p, f, m in zip(pixel, field, mark)
    )


def recolour(img, report=False):
    out = Image.new("RGBA", img.size)
    src = img.load()
    dst = out.load()
    worst = 0.0
    cache = {}
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, alpha = src[x, y]
            if alpha == 0:
                dst[x, y] = (0, 0, 0, 0)
                continue
            key = (r, g, b)
            if key not in cache:
                a = blend_factor(key, SRC_FIELD, MARK)
                if report:
                    worst = max(worst, residual(key, a, SRC_FIELD, MARK))
                cache[key] = tuple(
                    clamp8(a * m + (1 - a) * new_f + (p - (a * m + (1 - a) * old_f)))
                    for p, old_f, new_f, m in zip(key, SRC_FIELD, NEW_FIELD, MARK)
                )
            dst[x, y] = cache[key] + (alpha,)
    if report:
        print(f"  distinct colours: {len(cache)}")
        print(f"  worst off-line residual: {worst:.1f}/255 (carried over, not flattened)")
    return out


def main():
    check_only = "--check" in sys.argv
    src_png = ICON_DIR / "app-icon.png"
    green_png = ICON_DIR / "app-icon-green.png"
    green_ico = ICON_DIR / "app-icon-green.ico"

    # Work from the pristine green artwork, so re-running never compounds.
    source = green_png if green_png.exists() else src_png
    img = Image.open(source).convert("RGBA")
    print(f"source: {source.name} {img.size[0]}x{img.size[1]}")

    out = recolour(img, report=True)
    if check_only:
        return

    if not green_png.exists():
        Image.open(src_png).save(green_png)
        (ICON_DIR / "app-icon.ico").replace(green_ico)
        print(f"kept originals as {green_png.name} / {green_ico.name}")

    out.save(ICON_DIR / "app-icon.png")
    # Pillow downsamples to each requested size; all entries written as PNG,
    # matching how the original .ico was built.
    out.save(ICON_DIR / "app-icon.ico", sizes=[(s, s) for s in ICO_SIZES],
             bitmap_format="png")
    print(f"wrote app-icon.png and app-icon.ico ({len(ICO_SIZES)} sizes) "
          f"in #{NEW_FIELD[0]:02X}{NEW_FIELD[1]:02X}{NEW_FIELD[2]:02X}")


if __name__ == "__main__":
    main()
