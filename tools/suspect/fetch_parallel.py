"""
fetch_assets, but many members at once.

The mirror throttles each connection to a few KB/s, not the host, so pulling
twelve members in parallel is twelve times faster. Only what rendering needs is
taken: mesh, fitting, material, and the diffuse texture — not thumbnails, not
ambient-occlusion maps, and normal maps only with --normals.

    python3 tools/suspect/fetch_parallel.py --want '^hair/' --workers 16
"""
import argparse, importlib.util, os, re, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("fetch_assets", os.path.join(HERE, "fetch_assets.py"))
fa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fa)

ESSENTIAL = re.compile(r"\.(obj|mhclo|mhmat|proxy|mhskel|mhw)$|_diffuse\.(png|jpg)$|/[^/]*diffuse[^/]*\.png$", re.I)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--want", action="append", default=[])
    p.add_argument("--workers", type=int, default=16)
    p.add_argument("--normals", action="store_true")
    p.add_argument("--root", default=fa.DEFAULT_ROOT)
    a = p.parse_args()
    pats = [re.compile(x) for x in a.want]
    size, entries = fa.central_directory()
    want = []
    for e in entries:
        n = e["name"]
        if e["usize"] == 0 or not any(x.search(n) for x in pats):
            continue
        base = os.path.basename(n).lower()
        ok = ESSENTIAL.search(n) or (a.normals and "_normal" in base)
        # Skins name their texture anything (old_darkskinned_male_diffuse.png);
        # take every png in a skin folder except thumbnails.
        if n.startswith("skins/") and base.endswith(".png"):
            ok = True
        if ok:
            want.append(e)
    total = sum(e["usize"] for e in want)
    print(f"{len(want)} files, {total/1048576:.1f} MB, {a.workers} workers", flush=True)

    def one(e):
        dest = os.path.join(a.root, e["name"])
        if os.path.exists(dest) and os.path.getsize(dest) == e["usize"]:
            return e["name"], 0, "skip"
        t = time.time()
        n = fa.extract(e, dest)
        return e["name"], n, f"{time.time()-t:.0f}s"

    done = 0
    with ThreadPoolExecutor(a.workers) as pool:
        futs = [pool.submit(one, e) for e in sorted(want, key=lambda e: e["csize"])]
        for f in as_completed(futs):
            try:
                name, n, how = f.result()
                done += n
                print(f"  {name} {n/1024:.0f}K {how} [{done/max(total,1)*100:.0f}%]", flush=True)
            except Exception as err:
                print(f"  FAIL {err}", flush=True)
    print("__FETCH_DONE__", flush=True)


if __name__ == "__main__":
    main()
