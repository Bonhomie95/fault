"""
Shrink an exported suspect .glb.

    python3 tools/suspect/optimise_glb.py tools/suspect/build/*.glb

Blender writes PNG for any material whose alpha is connected, and MPFB's
MakeSkin materials are node GROUPS with the texture's alpha wired through —
which cannot be unlinked from outside the group, and which
`material.blend_method = "OPAQUE"` does not affect because that property has
been vestigial since Blender 4.2. Six archetypes therefore shipped 39.5MB of
PNG for textures with no transparency to preserve.

This re-encodes those as JPEG and leaves the cut-outs alone: hair, eyebrows and
eyelashes ARE their alpha channel, and are identified by their material having
been tagged alphaMode MASK.

Run from a normal Python — Blender's bundled interpreter has no Pillow.
"""

import io
import json
import os
import struct
import sys

def recompress_images(path: str, quality: int = 82):
    """
    Re-encode every solid texture in the file as JPEG.

    Blender writes PNG for any material whose alpha is connected, and MPFB's
    MakeSkin materials are node GROUPS with the texture's alpha wired through —
    which cannot be unlinked from outside the group and which
    `material.blend_method = "OPAQUE"` does not affect, because that property
    has been vestigial since 4.2. So six archetypes shipped 39.5MB of PNG for
    textures that have no transparency to preserve.

    Cut-outs are left alone: hair, brows and lashes ARE their alpha channel.

    Rebuilding the binary chunk means recomputing every bufferView offset, so
    this walks them in order and re-lays the buffer rather than patching in
    place. Alignment matters — glTF requires four-byte boundaries and readers
    reject the file otherwise.
    """
    from PIL import Image

    with open(path, "rb") as handle:
        blob = handle.read()
    json_length = struct.unpack("<I", blob[12:16])[0]
    document = json.loads(blob[20:20 + json_length])
    bin_start = 20 + json_length + 8                     # skip the BIN chunk header
    binary = blob[bin_start:]

    # Which images belong to a cut-out material, and must keep their alpha.
    protected = set()
    for material in document.get("materials", []):
        if material.get("alphaMode") != "MASK":
            continue
        texture = material.get("pbrMetallicRoughness", {}).get("baseColorTexture")
        if texture is not None:
            source = document["textures"][texture["index"]].get("source")
            if source is not None:
                protected.add(source)

    views = document.get("bufferViews", [])
    replacements: dict[int, bytes] = {}
    for index, image in enumerate(document.get("images", [])):
        view = image.get("bufferView")
        if view is None or index in protected or image.get("mimeType") != "image/png":
            continue
        start = views[view].get("byteOffset", 0)
        raw = binary[start:start + views[view]["byteLength"]]
        try:
            decoded = Image.open(io.BytesIO(raw)).convert("RGB")
        except Exception:                                # pragma: no cover - image data
            continue
        buffer = io.BytesIO()
        decoded.save(buffer, format="JPEG", quality=quality, optimize=True)
        encoded = buffer.getvalue()
        if len(encoded) < len(raw):
            replacements[view] = encoded
            image["mimeType"] = "image/jpeg"

    if not replacements:
        return os.path.getsize(path)

    # Re-lay the whole buffer so every offset stays correct.
    rebuilt = bytearray()
    for position, view in enumerate(views):
        payload = replacements.get(position)
        if payload is None:
            start = view.get("byteOffset", 0)
            payload = binary[start:start + view["byteLength"]]
        while len(rebuilt) % 4:
            rebuilt.append(0)
        view["byteOffset"] = len(rebuilt)
        view["byteLength"] = len(payload)
        rebuilt.extend(payload)
    while len(rebuilt) % 4:
        rebuilt.append(0)

    document["buffers"][0]["byteLength"] = len(rebuilt)
    encoded_json = json.dumps(document, separators=(",", ":")).encode("utf-8")
    encoded_json += b" " * ((4 - len(encoded_json) % 4) % 4)

    total = 12 + 8 + len(encoded_json) + 8 + len(rebuilt)
    with open(path, "wb") as handle:
        handle.write(b"glTF" + struct.pack("<II", 2, total))
        handle.write(struct.pack("<I", len(encoded_json)) + b"JSON" + encoded_json)
        handle.write(struct.pack("<I", len(rebuilt)) + b"BIN\x00" + bytes(rebuilt))
    return os.path.getsize(path)


def main():
    paths = sys.argv[1:]
    if not paths:
        raise SystemExit(__doc__)
    for path in paths:
        before = os.path.getsize(path)
        after = recompress_images(path)
        if after < before:
            print(f"{os.path.basename(path)}: {before / 1024:.0f}K -> {after / 1024:.0f}K")
        else:
            print(f"{os.path.basename(path)}: unchanged")


if __name__ == "__main__":
    main()
