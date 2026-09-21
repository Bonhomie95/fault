"""
FAULT's app icon, adaptive icon layers, and splash mark.

    python3 tools/brand/make_icons.py

A single bold letterform split by a fault line. The crack is the whole idea:
the game is about the line between what the evidence says and what you
decide, and a verdict is a fracture in somebody's life. Drawn procedurally so
it can be regenerated at any size and never drifts from the palette in
mobile/constants/theme.ts.
"""
import math, os, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "mobile", "assets", "images")
FONT = os.path.join(ROOT, "mobile", "node_modules", "@expo-google-fonts", "anton", "400Regular", "Anton_400Regular.ttf")

BG = (11, 11, 12)
INK = (244, 242, 239)
ACCENT = (224, 78, 46)  # Accents.violent


def crack_path(size, seed=7):
    """A jagged near-vertical fault line, top-right to bottom-left."""
    rnd = random.Random(seed)
    pts = []
    x0, x1 = size * 0.62, size * 0.38
    steps = 14
    for i in range(steps + 1):
        t = i / steps
        y = size * (0.06 + 0.88 * t)
        x = x0 + (x1 - x0) * t + (rnd.random() - 0.5) * size * 0.07
        pts.append((x, y))
    return pts


def mark(size, transparent=False, mono=False, scale=0.78):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0) if transparent else BG + (255,))
    if not transparent:
        # A soft pool of light behind the letter, like the dock's spotlight.
        glow = Image.new("L", (size, size), 0)
        ImageDraw.Draw(glow).ellipse((size * 0.12, size * 0.05, size * 0.88, size * 0.9), fill=38)
        glow = glow.filter(ImageFilter.GaussianBlur(size * 0.12))
        img = Image.composite(Image.new("RGBA", (size, size), (70, 62, 52, 255)), img, glow)

    letter = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(letter)
    font = ImageFont.truetype(FONT, int(size * scale))
    bbox = d.textbbox((0, 0), "F", font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(((size - w) / 2 - bbox[0], (size - h) / 2 - bbox[1]), "F", font=font, fill=255)

    # Split the letter along the fault: carve the gap out, then shift the
    # right-hand half up a little, the way a real fault offsets its sides.
    path = crack_path(size)
    gap = Image.new("L", (size, size), 0)
    ImageDraw.Draw(gap).line(path, fill=255, width=max(2, int(size * 0.035)), joint="curve")
    right = Image.new("L", (size, size), 0)
    poly = path + [(size, size), (size, 0)]
    ImageDraw.Draw(right).polygon(poly, fill=255)
    left_part = Image.composite(Image.new("L", (size, size), 0), letter, right)
    right_part = Image.composite(letter, Image.new("L", (size, size), 0), right)
    right_part = right_part.transform(right_part.size, Image.AFFINE, (1, 0, 0, 0, 1, size * 0.025))
    letter = Image.composite(Image.new("L", (size, size), 255), left_part, right_part)
    letter = Image.composite(Image.new("L", (size, size), 0), letter, gap)

    fill = (255, 255, 255) if mono else INK
    img.paste(Image.new("RGBA", (size, size), fill + (255,)), (0, 0), letter)

    if not mono:
        # The fault itself, glowing: accent core with a soft bloom.
        line = Image.new("L", (size, size), 0)
        ImageDraw.Draw(line).line(path, fill=255, width=max(1, int(size * 0.012)), joint="curve")
        bloom = line.filter(ImageFilter.GaussianBlur(size * 0.012))
        img.paste(Image.new("RGBA", (size, size), ACCENT + (255,)), (0, 0), bloom.point(lambda v: min(255, v * 2)))
        img.paste(Image.new("RGBA", (size, size), (255, 170, 140, 255)), (0, 0), line)
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    # iOS / store icon: opaque, square, no transparency allowed by Apple.
    mark(1024).convert("RGB").save(os.path.join(OUT, "icon.png"))
    # Android adaptive: the foreground must sit inside the 66% safe zone.
    mark(1024, transparent=True, scale=0.52).save(os.path.join(OUT, "android-icon-foreground.png"))
    Image.new("RGB", (1024, 1024), BG).save(os.path.join(OUT, "android-icon-background.png"))
    mark(1024, transparent=True, mono=True, scale=0.52).save(os.path.join(OUT, "android-icon-monochrome.png"))
    # Splash: the mark alone on transparency; app.json supplies the background.
    mark(600, transparent=True, scale=0.8).save(os.path.join(OUT, "splash-icon.png"))
    mark(196, scale=0.78).convert("RGB").save(os.path.join(OUT, "favicon.png"))
    # Store feature graphic (Play): 1024x500.
    fg = Image.new("RGB", (1024, 500), BG)
    m = mark(440).convert("RGB")
    fg.paste(m, (60, 30))
    d = ImageDraw.Draw(fg)
    d.text((540, 150), "FAULT", font=ImageFont.truetype(FONT, 150), fill=INK)
    d.text((546, 330), "EVERY VERDICT HAS A NEXT CASE", font=ImageFont.truetype(FONT, 26), fill=ACCENT)
    os.makedirs(os.path.join(ROOT, "store"), exist_ok=True)
    fg.save(os.path.join(ROOT, "store", "feature-graphic.png"))
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
