"""
Pull MakeHuman system assets out of the remote zip, without downloading it.

    python3 tools/suspect/fetch_assets.py --list clothes
    python3 tools/suspect/fetch_assets.py --want 'skins/.*\\.png$'

The system asset pack is a single 268MB archive and the mirror serves it at
roughly 8KB/s, so fetching the whole thing is not a plan. It does honour HTTP
range requests, though — which means the zip's central directory can be read
remotely and individual members pulled out of it. That turns "wait three hours
for everything" into "wait four minutes for the one suit you need".

Two things about the host, both learned the hard way:

  * `files.makehumancommunity.org` answers a direct download with an HTML
    "Access Forbidden" page that is a valid 200. `files2.` serves the bytes.
  * This Python has no CA bundle installed, so every https request from urllib
    dies on CERTIFICATE_VERIFY_FAILED. Everything below shells out to curl.

Assets land under MPFB's own user data root, which is where Blender looks for
them — `LocationService.get_user_data()` reports it on any platform.
"""

import argparse
import os
import re
import struct
import subprocess
import sys
import time
import zlib

URL = (
    "https://files2.makehumancommunity.org/asset_packs/"
    "makehuman_system_assets/makehuman_system_assets_cc0.zip"
)

DEFAULT_ROOT = os.path.expanduser(
    "~/Library/Application Support/Blender/5.2/extensions/"
    ".user/user_default/mpfb/data"
)


def _curl(args: list[str]) -> bytes:
    return subprocess.run(
        ["curl", "-sS", "--retry", "3", "--retry-delay", "2", "-m", "1800",
         "-A", "Mozilla/5.0", *args],
        capture_output=True, check=True,
    ).stdout


def archive_size() -> int:
    head = subprocess.run(
        ["curl", "-sS", "-m", "120", "-A", "Mozilla/5.0", "-r", "0-0",
         "-D", "-", "-o", "/dev/null", URL],
        capture_output=True, text=True, check=True,
    ).stdout
    for line in head.splitlines():
        if line.lower().startswith("content-range"):
            return int(line.split("/")[1].strip())
    raise SystemExit("the host did not answer a range request")


def fetch(start: int, end: int) -> bytes:
    return _curl(["-r", f"{start}-{end}", URL])


def central_directory():
    """Every member of the archive, read from its tail rather than its whole."""
    size = archive_size()
    tail = fetch(max(0, size - 200_000), size - 1)
    marker = tail.rfind(b"PK\x05\x06")
    if marker < 0:
        raise SystemExit("no end-of-central-directory record found")
    cd_size, cd_offset = struct.unpack("<II", tail[marker + 12:marker + 20])
    if cd_offset == 0xFFFFFFFF:
        raise SystemExit("zip64 archives are not handled")

    blob = fetch(cd_offset, cd_offset + cd_size - 1)
    entries, cursor = [], 0
    while cursor < len(blob) and blob[cursor:cursor + 4] == b"PK\x01\x02":
        method, = struct.unpack("<H", blob[cursor + 10:cursor + 12])
        csize, usize = struct.unpack("<II", blob[cursor + 20:cursor + 28])
        nlen, elen, clen = struct.unpack("<HHH", blob[cursor + 28:cursor + 34])
        offset, = struct.unpack("<I", blob[cursor + 42:cursor + 46])
        name = blob[cursor + 46:cursor + 46 + nlen].decode("utf-8", "replace")
        entries.append(
            {"name": name, "method": method, "csize": csize, "usize": usize, "off": offset}
        )
        cursor += 46 + nlen + elen + clen
    return size, entries


def extract(entry: dict, destination: str) -> int:
    # The local file header repeats the name and extra fields, and their
    # lengths differ from the central directory's — so they have to be read
    # rather than assumed, or the payload starts a few bytes off and inflate
    # fails on a file that downloaded perfectly.
    header = fetch(entry["off"], entry["off"] + 29)
    nlen, elen = struct.unpack("<HH", header[26:30])
    start = entry["off"] + 30 + nlen + elen
    raw = fetch(start, start + entry["csize"] - 1)
    data = zlib.decompress(raw, -15) if entry["method"] == 8 else raw
    os.makedirs(os.path.dirname(destination), exist_ok=True)
    with open(destination, "wb") as handle:
        handle.write(data)
    return len(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=DEFAULT_ROOT, help="MPFB user data directory")
    parser.add_argument("--want", action="append", default=[],
                        help="regex matched against the archive path; repeatable")
    parser.add_argument("--list", metavar="PREFIX",
                        help="list what the archive holds under a prefix, and stop")
    args = parser.parse_args()

    size, entries = central_directory()
    print(f"archive {size / 1048576:.0f} MB, {len(entries)} members", flush=True)

    if args.list:
        totals: dict[str, int] = {}
        for entry in entries:
            if entry["name"].startswith(args.list):
                parts = entry["name"].split("/")
                key = "/".join(parts[:2])
                totals[key] = totals.get(key, 0) + entry["usize"]
        for key in sorted(totals, key=lambda k: totals[k]):
            print(f"  {totals[key] / 1048576:8.1f} MB  {key}")
        return

    patterns = [re.compile(p) for p in args.want]
    wanted = [
        e for e in entries
        if e["usize"] > 0 and any(p.search(e["name"]) for p in patterns)
    ]
    total = sum(e["usize"] for e in wanted)
    print(f"{len(wanted)} files, {total / 1048576:.1f} MB", flush=True)

    # Smallest first: a partial run then leaves the widest spread of usable
    # assets rather than one enormous suit and nothing else.
    done = 0
    for entry in sorted(wanted, key=lambda e: e["csize"]):
        destination = os.path.join(args.root, entry["name"])
        if os.path.exists(destination) and os.path.getsize(destination) == entry["usize"]:
            done += entry["usize"]
            continue
        started = time.time()
        try:
            written = extract(entry, destination)
        except Exception as err:                        # pragma: no cover - network
            print(f"  FAIL {entry['name']}: {err}", flush=True)
            continue
        done += written
        print(
            f"  {entry['name']}  {written / 1024:.0f}K in {time.time() - started:.0f}s "
            f"[{done / total * 100:.0f}%]",
            flush=True,
        )
    print("__FETCH_DONE__", flush=True)


if __name__ == "__main__":
    main()
