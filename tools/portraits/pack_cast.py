"""
Pack rendered cast frames for the app.

    python3 tools/portraits/pack_cast.py [--frames tools/portraits/frames]

Reads the PNGs render_cast.py wrote and produces:

    mobile/assets/cast/<person>/base.webp      the neutral portrait, whole
    mobile/assets/cast/<person>/<frame>.webp   only the part of <frame> that
                                               differs from its parent: base
                                               for an expression, the
                                               expression for its mouths
    mobile/components/cast/sprites.ts          the index, with literal requires

WHY PATCHES. A talking mouth changes perhaps a twentieth of the picture. Saving
every frame whole would ship the same jacket forty times per person; saving the
difference ships the mouth. The app lays the patch over the base at the
recorded rectangle, and because both came from one camera and one light the
seam is invisible — the pixels either side of it are the same pixels.

THE FADE. The exporter cuts each body off at the chest, and a hard horizontal
edge across a person reads as a cut-out. The base fades out over its lowest
stretch, and the room draws the dock rail across the same band, so the eye
reads a person standing behind something rather than a bust on a shelf.
"""

import json, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ASSETS = os.path.join(ROOT, "mobile", "assets", "cast")
INDEX = os.path.join(ROOT, "mobile", "components", "cast", "sprites.ts")

# Must agree with render_cast.py.
W, H = 1024, 1280
EYES_PX = (512, 470)
HEAD_PX = 250

FADE_FROM = 0.80  # fraction of height where the chest starts to fade
THRESHOLD = 6  # per-channel difference, 0..255, that counts as "changed"
PAD = 6
QUALITY = 80


def fade_mask() -> np.ndarray:
    rows = np.arange(H, dtype=np.float32) / H
    ramp = np.clip((1.0 - rows) / (1.0 - FADE_FROM), 0.0, 1.0)
    ramp = ramp * ramp * (3 - 2 * ramp)  # smoothstep — no visible band edge
    return ramp[:, None]


def load(path: str) -> np.ndarray:
    return np.array(Image.open(path).convert("RGBA"), dtype=np.uint8)


def save(arr: np.ndarray, path: str):
    Image.fromarray(arr, "RGBA").save(path, "WEBP", quality=QUALITY, method=6, alpha_quality=90)


def faded(arr: np.ndarray, mask: np.ndarray, top: int = 0) -> np.ndarray:
    out = arr.copy()
    m = mask[top : top + arr.shape[0]]
    out[:, :, 3] = (out[:, :, 3].astype(np.float32) * m).astype(np.uint8)
    return out


def main():
    frames_dir = os.path.join(ROOT, "tools", "portraits", "frames")
    argv = sys.argv[1:]
    if "--frames" in argv:
        frames_dir = argv[argv.index("--frames") + 1]

    mask = fade_mask()
    people = sorted(d for d in os.listdir(frames_dir) if os.path.isdir(os.path.join(frames_dir, d)))
    index: dict[str, dict] = {}
    total = 0

    for person in people:
        src = os.path.join(frames_dir, person)
        base_path = os.path.join(src, "neutral.png")
        if not os.path.exists(base_path):
            print("skip", person, "(no neutral.png)")
            continue
        out = os.path.join(ASSETS, person)
        os.makedirs(out, exist_ok=True)

        base = load(base_path)
        save(faded(base, mask), os.path.join(out, "base.webp"))
        entry = {"frames": {}}

        # Expressions move the body as well as the face (the exporter bakes
        # shoulders and head carriage into them), so an expression differs
        # from neutral nearly everywhere and is stored close to whole. Its
        # mouths and blink are then diffed against THAT expression, not
        # against neutral — which keeps them the size of a mouth.
        frames = sorted(n[:-4] for n in os.listdir(src) if n.endswith(".png") and n != "neutral.png")
        cache: dict[str, np.ndarray] = {"neutral": base}

        def parent_of(frame: str) -> str:
            head = frame.split("_")[0]
            return head if head != frame and os.path.exists(os.path.join(src, head + ".png")) else "neutral"

        for frame in frames:
            img = load(os.path.join(src, frame + ".png"))
            parent = parent_of(frame)
            if parent not in cache:
                cache[parent] = load(os.path.join(src, parent + ".png"))
            ref = cache[parent]
            diff = np.abs(img.astype(np.int16) - ref.astype(np.int16)).max(axis=2) > THRESHOLD
            ys, xs = np.where(diff)
            if len(ys) == 0:
                continue
            y0 = max(0, ys.min() - PAD) & ~1
            x0 = max(0, xs.min() - PAD) & ~1
            y1 = min(H, ys.max() + PAD + 1)
            x1 = min(W, xs.max() + PAD + 1)
            patch = faded(img[y0:y1, x0:x1], mask, y0)
            save(patch, os.path.join(out, frame + ".webp"))
            entry["frames"][frame] = [int(x0), int(y0), int(x1 - x0), int(y1 - y0), parent]

        size = sum(os.path.getsize(os.path.join(out, f)) for f in os.listdir(out))
        total += size
        index[person] = entry
        print(f"{person}: {len(entry['frames'])} patches, {size // 1024}KB")

    write_index(index)
    print(f"total {total // 1024}KB -> {INDEX}")


def write_index(index: dict):
    lines = [
        "/**",
        " * GENERATED by tools/portraits/pack_cast.py — do not edit by hand.",
        " *",
        " * Every portrait is W x H with the eyes at EYES_PX and HEAD_PX from eyes to",
        " * crown. Each frame is a patch [x, y, w, h]. An expression's patch lies",
        " * over the base; its mouths and blink lie over the expression.",
        " *",
        " * Metro bundles an asset only from a LITERAL require, hence the list.",
        " */",
        "",
        f"export const SPRITE_W = {W};",
        f"export const SPRITE_H = {H};",
        f"export const EYES_PX = {{ x: {EYES_PX[0]}, y: {EYES_PX[1]} }};",
        f"export const HEAD_PX = {HEAD_PX};",
        "",
        "export type Patch = { src: number; x: number; y: number; w: number; h: number };",
        "export type Sprite = { base: number; frames: Record<string, Patch> };",
        "",
        "export const SPRITES: Record<string, Sprite> = {",
    ]
    for person, entry in index.items():
        lines.append(f"  {person}: {{")
        lines.append(f"    base: require('@/assets/cast/{person}/base.webp'),")
        lines.append("    frames: {")
        for frame, (x, y, w, h, _parent) in entry["frames"].items():
            lines.append(
                f"      {frame}: {{ src: require('@/assets/cast/{person}/{frame}.webp'), x: {x}, y: {y}, w: {w}, h: {h} }},"
            )
        lines.append("    },")
        lines.append("  },")
    lines.append("};")
    lines.append("")
    os.makedirs(os.path.dirname(INDEX), exist_ok=True)
    with open(INDEX, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines))


if __name__ == "__main__":
    main()
