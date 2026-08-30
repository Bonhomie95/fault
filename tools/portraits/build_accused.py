"""
The accused, built in Blender.

Run inside Blender with MPFB2 installed:

    blender --background --python tools/portraits/build_accused.py -- --seeds 0-63 --out mobile/assets/portraits

WHY THIS EXISTS
---------------
The shipping renderer draws the accused as flat SVG shapes. It is deterministic
and it works, and it is the reason `appearance_bias` is measurable at all — but
it is shapes, and the whole thesis of this game is that you are looking at a
person and being worked on by them.

This builds real humans instead: MPFB2 (MakeHuman for Blender) gives a genuine
19k-vertex anatomical base mesh with macro morphs for gender, age, build,
height, proportions and ancestry. Everything here is offline. Nothing in this
file runs on a phone.

THE THREE AXES, AND WHY THEY MUST NOT TOUCH EACH OTHER
------------------------------------------------------
FAULT measures whether a defendant's *appearance* moved the player's verdict.
That measurement only means anything because appearance is generated blind to
guilt. The same discipline has to hold for everything added here, so the
generator takes three independent inputs and never mixes them:

  seed        the PERSON. Ancestry, build, age, bone structure. Drawn from
              `portraitSeed`, so a returning character is the same human — the
              Echo System's whole payoff depends on that being exact.

  appearance  the MEASURED axis, 0..100, hard <-> disarming. Applied as our own
              shape key on top of MPFB's identity: brow angle, lid, jaw, mouth.
              Deliberately NOT an MPFB face target — those would entangle it
              with identity, and then appearance_bias would be measuring bone
              structure and ancestry rather than the one variable it claims to.

  oddity      the UNCANNY axis, 0..100. Asymmetry, a gaze that does not quite
              meet yours, stillness. Things that unsettle and mean nothing.

Body language (`demeanour`) is deliberately NOT baked here — see LAYERS below.

LAYERS, AND WHY
---------------
Baking every combination is combinatorial suicide: 64 identities x 5 appearance
x 5 demeanour x 5 oddity is 8,000 renders nobody will ship. So this bakes only
what is genuinely identity-shaped, and leaves the rest to the runtime:

    <seed>_a<appearance>_body.png   torso and shoulders
    <seed>_a<appearance>_head.png   head, hair, brows — no eyes
    <seed>_a<appearance>_eyes.png   eyes alone, on transparency
    <seed>_a<appearance>_lids.png   closed lids, for blinking

The client composites them and animates the composition: the head layer tilts
and drops, the body layer rolls its shoulders, the eye layer slides for gaze,
the lid layer fades in to blink. That is what carries demeanour and oddity, it
costs no extra assets, and it composes with the expression system that already
exists in `mobile/components/scene2d/expression.ts`.

WHAT IS NOT HERE
----------------
Skin textures, hair cards, real garments and eye assets all live in the
MakeHuman system asset packs, which are a separate download this pipeline does
not assume. Without them the result is good stylised realism — real anatomy,
real light, real depth — rather than photoreal. Dropping those packs in is an
asset change, not a code change: see `apply_skin` and `add_hair`.
"""

import argparse
import bmesh
import bpy
import importlib
import math
import os
import random
from typing import NamedTuple
import sys
from mathutils import Vector

MPFB = "bl_ext.user_default.mpfb"


# ---------------------------------------------------------------- services --

_MPFB_READY = False


def ensure_mpfb():
    """
    Turn the extension on before importing it.

    In `--background` Blender does not enable extensions, and MPFB builds its
    package paths at import time from a context the enable step populates. So a
    bare `import ...mpfb.services` in a headless run does not fail with
    "addon not enabled" — it fails with `'NoneType' object is not subscriptable`
    from deep inside its logging service, which is a considerably worse hour.
    """
    global _MPFB_READY
    if _MPFB_READY:
        return
    import addon_utils

    if not addon_utils.check(MPFB)[1]:
        # Enabling it HERE does not work in background mode: MPFB reads its own
        # addon preferences while importing UiService, those preferences only
        # exist once the addon is registered through the normal startup path,
        # and the failure it produces is `ValueError: I don't seem to exist`
        # from four frames deep. It has to be enabled in SAVED preferences so
        # Blender loads it at startup instead.
        raise RuntimeError(
            f"{MPFB} is not enabled in your saved Blender preferences.\n"
            f"Fix once, in the Blender GUI:\n"
            f"  Edit > Preferences > Get Extensions > search 'MPFB' > Install\n"
            f"  then Edit > Preferences > Save Preferences\n"
            f"Background renders cannot enable it for you."
        )
    _MPFB_READY = True


def services():
    """MPFB's scripting API. Import lazily so --help works without Blender."""
    ensure_mpfb()
    return importlib.import_module(MPFB + ".services")


# ------------------------------------------------------------------ identity --

def macro_for_seed(seed: int) -> dict:
    """
    The person, from the seed. Deterministic, and that is the whole point.

    `portraitSeed` on the server is derived from the character's NAME, so the
    same name is the same face forever. If this function ever stops being pure
    in `seed`, every echo in the game silently starts showing a stranger.
    """
    svc = services()
    spec = svc.RandomizationService.get_default_phenotype_spec()

    # Adults only. The content policy in the case generator forbids crimes
    # involving children; a generator that can produce a child in the dock
    # contradicts it, whatever the prompt says.
    spec["phenotype"]["attributes"]["age"]["allowed"] = ["young", "middleage", "old"]

    # Never pin ancestry: this game stages cases in the player's real country
    # and draws names from that country's register. A defendant pool that skews
    # is a defendant pool that is saying something, and this one must not.
    spec["phenotype"]["discrete_race"] = False

    return svc.RandomizationService.randomize_macro_info_dict(spec, random.Random(seed))


def build_human(seed: int):
    """One anatomical human, posed neutrally, at origin."""
    svc = services()
    for obj in list(bpy.data.objects):
        if obj.type in {"MESH", "ARMATURE"}:
            bpy.data.objects.remove(obj, do_unlink=True)

    human = svc.HumanService.create_human(
        mask_helpers=True,
        detailed_helpers=False,
        extra_vertex_groups=False,
        feet_on_ground=True,
        scale=0.1,
        macro_detail_dict=macro_for_seed(seed),
    )
    human.name = "Human"
    return human


# -------------------------------------------------------------- measurement --

def evaluated_points(human):
    """
    World-space vertices AFTER the morphs, with the helper mask disabled.

    Two traps, both of which cost me a render each:

      1. `human.data.vertices` is the BASE mesh. MPFB applies every macro morph
         as a shape key, so the un-evaluated mesh is a different, shorter person
         than the one on screen — 1.67m against 1.96m for the same object.

      2. The "Hide helpers" mask modifier DROPS vertices, so indices taken from
         the base mesh do not address the evaluated one. Disable it, evaluate,
         restore it.
    """
    mask = next((m for m in human.modifiers if m.type == "MASK"), None)
    previous = mask.show_viewport if mask else None
    if mask:
        mask.show_viewport = False

    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = human.evaluated_get(depsgraph).to_mesh()
    matrix = human.matrix_world
    points = [matrix @ v.co for v in mesh.vertices]
    human.evaluated_get(depsgraph).to_mesh_clear()

    if mask:
        mask.show_viewport = previous
    return points


class Socket(NamedTuple):
    """An eye socket, as measured on this particular skull."""
    centre: Vector
    radius: float
    rim: list          # the boundary loop, in order around the orbit


def order_ring(edges):
    """
    Walk a set of boundary edges into one ordered cycle of vertex indices.

    `eye_sockets` already collects the loop as an unordered component, which is
    all a centre and a radius need. Lids need more than that: they are built by
    bridging this ring to a smaller one, and quads built from an arbitrary
    ordering cross over each other.
    """
    adjacency = {}
    for edge in edges:
        a, b = edge.verts[0].index, edge.verts[1].index
        adjacency.setdefault(a, []).append(b)
        adjacency.setdefault(b, []).append(a)

    start = min(adjacency)
    ring, previous, current = [start], None, start
    while True:
        following = next((v for v in adjacency[current] if v != previous), None)
        if following is None or following == start:
            break
        ring.append(following)
        previous, current = current, following
    return ring


def eye_sockets(human):
    """
    Where the eyes go, found rather than assumed.

    The MakeHuman base mesh has open eye sockets — eyeballs are a separate
    asset — so the sockets are literal boundary loops. Find the symmetric pair
    of 32-vertex holes highest in the mesh, take their indices from the base
    mesh, and read those indices back off the EVALUATED mesh. Topology is
    stable under shape keys; positions are not.

    Measured rather than hardcoded because every seed is a different skull.
    """
    bm = bmesh.new()
    bm.from_mesh(human.data)
    # Required before indexing bm.verts[i]. Interactive Blender often has the
    # table already built, so leaving this out fails only in --background.
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()

    seen, loops = set(), []
    for edge in bm.edges:
        if len(edge.link_faces) != 1 or edge.index in seen:
            continue
        stack, component = [edge], []
        while stack:
            current = stack.pop()
            if current.index in seen or len(current.link_faces) != 1:
                continue
            seen.add(current.index)
            component.append(current)
            for vert in current.verts:
                for other in vert.link_edges:
                    if other.index not in seen and len(other.link_faces) == 1:
                        stack.append(other)
        indices = sorted({v.index for e in component for v in e.verts})
        centre = sum((bm.verts[i].co for i in indices), Vector()) / len(indices)
        loops.append((len(indices), centre, indices, order_ring(component)))
    bm.free()

    candidates = sorted([l for l in loops if l[0] == 32], key=lambda l: -l[1].z)[:2]
    if len(candidates) < 2:
        raise RuntimeError("could not find the eye sockets — has the base mesh changed?")

    points = evaluated_points(human)
    sockets = []
    for _, _, indices, ring in candidates:
        pts = [points[i] for i in indices]
        centre = sum(pts, Vector()) / len(pts)
        radius = max((p - centre).length for p in pts)
        # The ring is kept in loop order, not sorted order: the lids are built
        # by bridging it to a smaller ring, and a bridge between two rings that
        # do not run the same way around produces a bow tie.
        sockets.append(Socket(centre, radius, [points[i] for i in ring]))

    # Left first, so downstream code can rely on the order.
    sockets.sort(key=lambda s: -s[0].x)
    return sockets


# ------------------------------------------------------- the appearance axis --

def apply_appearance(human, sockets, appearance: float):
    """
    The one measured variable, as a shape key of our own.

    `appearance` runs 0 (unsettling) to 100 (disarming) and moves exactly what
    the 2D renderer already moves — brow, lid, jaw, mouth — so the two
    renderers agree about who a person is and `appearance_bias` keeps meaning
    the same thing in both.

    It is applied as an ADDITIVE shape key on top of MPFB's identity morphs, so
    it cannot alter bone structure, ancestry or build. That separation is the
    reason the measurement is honest: if appearance rode on an MPFB face target
    it would be entangled with identity, and the bias score would be reading
    the person rather than the variable.
    """
    a = max(0.0, min(100.0, appearance)) / 100.0
    if human.data.shape_keys is None:
        human.shape_key_add(name="Basis", from_mix=False)
    key = human.shape_key_add(name="fault_appearance", from_mix=False)
    key.value = 1.0

    left, right = sockets[0][0], sockets[1][0]
    eye_z = (left.z + right.z) / 2.0
    eye_span = abs(left.x - right.x)
    matrix = human.matrix_world
    inverse = matrix.inverted()

    # Signed: negative hardens, positive softens. Zero at appearance 50, so the
    # midpoint is the person MPFB generated and nothing else.
    t = (a - 0.5) * 2.0

    for i, point in enumerate(key.data):
        world = matrix @ point.co
        dz = world.z - eye_z
        lateral = abs(world.x) / max(eye_span, 1e-6)

        # Brow ridge: inward-and-down reads as glowering. The strongest single
        # signal in a face, which is why it gets the largest displacement.
        if 0.012 < dz < 0.045 and lateral < 2.2:
            world.z += t * 0.0045 * (1.0 - lateral / 2.2)
            world.y += t * 0.0020

        # Upper lid: hooded reads as unimpressed.
        elif -0.012 < dz <= 0.012 and lateral < 1.9:
            world.z += t * 0.0020

        # Jaw: square and wide reads harder than soft.
        elif -0.115 < dz < -0.045:
            world.x -= t * 0.0035 * (world.x / max(abs(world.x), 1e-6)) * lateral * 0.5

        # Mouth corners: a flat line against the faintest lift.
        elif -0.052 < dz < -0.030 and lateral < 1.4:
            world.z += t * 0.0018 * lateral

        point.co = inverse @ world

    return key


# ------------------------------------------------------------- the oddity axis --

def apply_oddity_shape(human, sockets, oddity: float, rng: random.Random):
    """
    The uncanny axis: strange, and empty of information.

    This is the one the player will feel and not be able to name — a face
    slightly out of true, a gaze that does not quite land on them. It is drawn
    from its own roll and is INDEPENDENT of guilt, exactly like appearance,
    because the entire point is to measure whether a juror punishes strangeness
    it cannot justify.

    Two mechanisms, both cheap and both real:

      asymmetry   every human face is asymmetric; an unsettling one is
                  asymmetric slightly past what we read as normal.
      gaze offset the eyes converge a little in front of, or behind, the
                  viewer. Nobody consciously notices. Everybody feels it.

    Deliberately small. Past a point this stops being unease and becomes a
    deformity, and a game that makes disfigurement the tell for guilt would be
    saying something vile by accident.
    """
    o = max(0.0, min(100.0, oddity)) / 100.0
    if o <= 0.001:
        return

    # --- asymmetry, as a shape key so it stacks with appearance ---
    key = human.shape_key_add(name="fault_oddity", from_mix=False)
    key.value = 1.0
    matrix = human.matrix_world
    inverse = matrix.inverted()

    eye_z = (sockets[0][0].z + sockets[1][0].z) / 2.0
    lean = (rng.random() - 0.5) * 2.0          # which way this face is off
    for point in key.data:
        world = matrix @ point.co
        dz = world.z - eye_z
        if -0.13 < dz < 0.09:                   # the face only, not the skull
            side = 1.0 if world.x >= 0 else -1.0
            fade = 1.0 - min(1.0, abs(dz) / 0.13)
            world.z += lean * side * o * 0.0035 * fade
            world.y += lean * side * o * 0.0015 * fade
        point.co = inverse @ world


def apply_gaze_drift(eyes, oddity: float, rng: random.Random):
    """
    A gaze that does not quite meet yours.

    Split out from the asymmetry because of ORDER. The asymmetry is a shape key
    on the face, so it has to land before the sockets are re-measured and the
    lids are built on top of them. The drift moves the eyeballs only — and it
    has to happen AFTER the lids, because the whole effect is the ball sliding
    behind a lid that stays put. Move them together and the eyes never leave
    their sockets, which is the one thing eyes do.
    """
    o = max(0.0, min(100.0, oddity)) / 100.0
    if o <= 0.001:
        return
    # Converge in front of or behind the camera rather than on it.
    drift = (rng.random() - 0.5) * 2.0 * o * 0.010
    for eye in eyes:
        eye.location.x += drift
        eye.location.z += (rng.random() - 0.5) * o * 0.004


# ------------------------------------------------------------- the library --
#
# Real MakeHuman assets, when they are installed.
#
# Everything below returns None (or False) when the system asset pack is not
# present, and every caller falls back to the procedural version it had before.
# That is deliberate: the pack is a 268MB download that this pipeline must not
# depend on, and a contributor who has not fetched it should still be able to
# render a portrait — just a plainer one.
#
# Fetching only what is needed is possible, incidentally: files2.makehumancommunity.org
# serves range requests, so the zip's central directory can be read and single
# members pulled out of it. See the note in the README.


def library(subdir: str, kind: str = "mhclo"):
    """Every installed asset of one kind, in a stable order.

    Sorted, because a seed choosing `paths[seed % len(paths)]` must choose the
    same person's eyebrows tomorrow. Directory order is not stable and would
    quietly re-cast every returning character.
    """
    try:
        svc = services().AssetService
        lister = svc.list_mhclo_assets if kind == "mhclo" else svc.list_mhmat_assets
        return sorted(str(p) for p in lister(subdir))
    except Exception:
        return []


def pick(paths, seed: int, contains=None, textured=False):
    """
    One asset from a list, chosen by seed. None if the list is empty.

    `textured` drops anything whose diffuse image has not been downloaded. That
    is not the same as the guard in add_mh_asset, which refuses a single named
    asset and falls back to the procedural version: this narrows the CHOICE, so
    a seed whose hairstyle happens to be missing its texture gets a different
    real hairstyle rather than the built-in cap. On a partial library that is
    the difference between one asset working and none of them working.
    """
    if contains:
        paths = [p for p in paths if any(c in os.path.basename(p).lower() for c in contains)] or paths
    if textured:
        paths = [p for p in paths if textures_present(companion_material(p))] or []
    return paths[seed % len(paths)] if paths else None


def textures_present(mhmat: str) -> bool:
    """
    Does this material's diffuse texture actually exist on disk?

    MakeHuman materials name their textures by relative path, and MPFB will
    happily build a material around one that is not there. Blender's stand-in
    for a missing image is magenta, so an asset whose texture has not been
    downloaded does not fail — it renders a bright pink head, which is far
    worse than the procedural version it replaced.

    Checked here rather than trusted, because the system asset pack is a 268MB
    download that a contributor may have taken only part of.
    """
    if not mhmat or not os.path.exists(mhmat):
        return False
    root = os.path.dirname(mhmat)
    try:
        with open(mhmat, "r", encoding="utf-8", errors="replace") as handle:
            for line in handle:
                parts = line.split()
                if len(parts) >= 2 and parts[0] == "diffuseTexture":
                    return os.path.exists(os.path.join(root, parts[1]))
    except OSError:
        return False
    # No diffuse texture named at all: a flat-coloured material, which is fine.
    return True


def companion_material(mhclo: str) -> str:
    """The .mhmat sitting next to a .mhclo, which is the one it will load."""
    if not mhclo:
        return ""
    base = os.path.splitext(mhclo)[0]
    for candidate in (base + ".mhmat", os.path.join(os.path.dirname(mhclo), "material.mhmat")):
        if os.path.exists(candidate):
            return candidate
    return ""


def add_mh_asset(human, path: str, kind: str):
    """Fit one MakeHuman asset to this body, or return None if it will not."""
    if not path or not os.path.exists(path):
        return None
    # An asset whose texture is missing renders magenta. Refuse it and let the
    # caller fall back to the procedural version. See textures_present.
    material = companion_material(path)
    if material and not textures_present(material):
        print(f"  · {kind}: {os.path.basename(path)} has no texture yet, using the built-in")
        return None
    try:
        return services().HumanService.add_mhclo_asset(
            path, human,
            asset_type=kind,
            # No rig on these portraits, so nothing to skin the asset to.
            set_up_rigging=False, interpolate_weights=False,
            import_subrig=False, import_weights=False,
            subdiv_levels=0, material_type="MAKESKIN",
        )
    except Exception as err:                       # pragma: no cover - asset data
        print(f"  ! {kind} asset {os.path.basename(path)} failed: {err}")
        return None


def real_eyes(human, seed: int):
    """The MakeHuman eyeball, which brings its own iris texture and lids."""
    path = pick(library("eyes"), seed, contains=("high-poly",), textured=True)
    eyes = add_mh_asset(human, path, "Eyes")
    if not eyes:
        return None
    # Iris colour is identity, so it is chosen by the same seed as the face.
    materials = library("eyes", "mhmat")
    material = pick([m for m in materials if "materials" in m and textures_present(m)], seed >> 3)
    if material:
        try:
            from bl_ext.user_default.mpfb.entities.material.makeskinmaterial import MakeSkinMaterial
            skin = MakeSkinMaterial()
            skin.populate_from_mhmat(material)
            services().MaterialService.delete_all_materials(eyes)
            blender_material = services().MaterialService.create_empty_material(
                os.path.basename(material), eyes)
            skin.apply_node_tree(blender_material)
        except Exception as err:                   # pragma: no cover - asset data
            print(f"  ! iris material failed: {err}")
    return [eyes]


def real_brows(human, seed: int):
    return add_mh_asset(human, pick(library("eyebrows"), seed, textured=True), "Eyebrows")


def real_lashes(human, seed: int):
    return add_mh_asset(human, pick(library("eyelashes"), seed >> 2, textured=True), "Eyelashes")


def real_hair(human, seed: int, feminine: bool):
    """
    Hair, chosen the way the rest of the face is: by seed, within a set that
    suits the person. Never by ancestry — see macro_for_seed.
    """
    styles = library("hair")
    if not styles:
        return None
    wanted = ("bob", "long", "afro") if feminine else ("short", "afro")
    return add_mh_asset(human, pick(styles, seed >> 1, contains=wanted, textured=True), "Hair")


def real_skin(human, macro: dict) -> bool:
    """
    A photographed skin, picked to match the body the macros already built.

    The pack ships skins named by ancestry, age and gender, and the macro dict
    holds exactly those three as weights. Taking the largest weight is not a
    judgement about the person — it is reading back the body MPFB has already
    made, so the texture lands on the anatomy it was photographed for.
    """
    skins = library("skins", "mhmat")
    if not skins:
        return False

    race = macro.get("race", {})
    ancestry = max(("african", "asian", "caucasian"), key=lambda k: race.get(k, 0.0))
    gender = "female" if macro.get("gender", 0.5) < 0.5 else "male"
    age_value = macro.get("age", 0.5)
    age = "young" if age_value < 0.45 else "middleage" if age_value < 0.75 else "old"

    def score(path: str) -> int:
        name = os.path.basename(path).lower()
        return (ancestry in name) * 4 + (gender in name) * 2 + (age in name)

    usable = [p for p in skins if textures_present(p)]
    if not usable:
        return False
    best = max(usable, key=score)
    if score(best) < 4:            # nothing for this ancestry — keep the shader
        return False
    try:
        services().HumanService.set_character_skin(best, human, skin_type="ENHANCED_SSS")
        return True
    except Exception as err:                       # pragma: no cover - asset data
        print(f"  ! skin {os.path.basename(best)} failed: {err}")
        return False


# ----------------------------------------------------------------- surfacing --

def apply_skin(human, macro: dict):
    """
    Skin, procedural rather than textured — deliberately.

    A texture pack ships a handful of fixed skins. This game needs tone to vary
    continuously with the seed's ancestry mix, so the tone is computed and the
    shader is built. Subsurface scattering is the whole difference between
    flesh and plastic and costs one input.

    Swap this for `HumanService.set_character_skin(...)` the day the MakeHuman
    system asset pack is installed; nothing else here needs to change.
    """
    race = macro.get("race", {})
    african = race.get("african", 0.33)
    asian = race.get("asian", 0.33)
    caucasian = race.get("caucasian", 0.33)

    # Endpoints sampled from the plausible human range, mixed by the seed's own
    # ancestry weights, so tone follows identity rather than being rolled twice.
    tones = (
        (0.085, 0.040, 0.024),   # deep
        (0.290, 0.165, 0.100),   # medium
        (0.430, 0.275, 0.205),   # light
    )
    base = tuple(
        african * tones[0][i] + asian * tones[1][i] + caucasian * tones[2][i]
        for i in range(3)
    )

    material = bpy.data.materials.get("FaultSkin") or bpy.data.materials.new("FaultSkin")
    material.use_nodes = True
    bsdf = material.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*base, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.52
    for name, value in (("Subsurface Weight", 0.11), ("Subsurface Scale", 0.010),
                        ("Specular IOR Level", 0.30)):
        if name in bsdf.inputs:
            bsdf.inputs[name].default_value = value
    if "Subsurface Radius" in bsdf.inputs:
        bsdf.inputs["Subsurface Radius"].default_value = (0.30, 0.11, 0.07)

    human.data.materials.clear()
    human.data.materials.append(material)
    return material


def flat_material(name: str, colour, roughness=0.9, specular=0.15):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*colour, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = specular
    return material


# The eye, in millimetres, because that is the only unit it can be got right in.
IRIS_MM, PUPIL_MM, LIMBUS_MM = 11.8, 3.6, 0.7

# Iris colours by frequency, not by prettiness: brown is most of the world.
IRIS_COLOURS = (
    ((0.115, 0.062, 0.028), (0.052, 0.028, 0.014)),   # dark brown
    ((0.185, 0.105, 0.048), (0.086, 0.048, 0.022)),   # brown
    ((0.245, 0.170, 0.078), (0.110, 0.078, 0.036)),   # amber / hazel
    ((0.135, 0.150, 0.105), (0.062, 0.072, 0.050)),   # hazel-green
    ((0.105, 0.150, 0.175), (0.048, 0.072, 0.086)),   # blue-grey
    ((0.090, 0.135, 0.190), (0.042, 0.064, 0.092)),   # blue
)


def _cap_position(feature_mm: float, ball_radius_m: float) -> float:
    """
    Where a feature of a given real-world width lands on the sphere's own
    Generated-Y axis.

    Generated coordinates run 0..1 across the object's bounding box, and 0 is
    the front pole because -Y is the way the face looks. A circular feature of
    radius `a` centred on that pole is a spherical cap of depth
    r - sqrt(r² - a²), and its position on the axis is that depth over the
    diameter.

    This function exists because the ramp stops used to be typed in by hand.
    They put the iris at 0.185, which on an 11.6mm eyeball is a cap 4.3mm deep
    — an iris 18mm across. A real one is 11.8mm, and the palpebral fissure it
    shows through is barely 7mm tall, so a dark brown iris that size covered
    the entire opening and every defendant rendered with two black slots for
    eyes. Anatomy is not a matter of taste, so it stopped being tuned.
    """
    a = min(feature_mm / 2000.0, ball_radius_m * 0.99)   # mm across -> metres, radius
    depth = ball_radius_m - math.sqrt(max(ball_radius_m ** 2 - a * a, 0.0))
    return depth / (2.0 * ball_radius_m)


def eye_material(ball_radius: float, seed: int):
    """
    Sclera, limbus, iris, pupil — driven off the sphere's own local Y, and
    positioned from millimetres rather than from guesses. See _cap_position.
    """
    name = f"FaultEye{seed % len(IRIS_COLOURS)}"
    material = bpy.data.materials.get(name)
    if material:
        return material
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    tree = material.node_tree
    tree.nodes.clear()

    out = tree.nodes.new("ShaderNodeOutputMaterial")
    bsdf = tree.nodes.new("ShaderNodeBsdfPrincipled")
    coords = tree.nodes.new("ShaderNodeTexCoord")
    split = tree.nodes.new("ShaderNodeSeparateXYZ")
    ramp = tree.nodes.new("ShaderNodeValToRGB")

    pupil = _cap_position(PUPIL_MM, ball_radius)
    iris = _cap_position(IRIS_MM, ball_radius)
    limbus = _cap_position(IRIS_MM + LIMBUS_MM * 2, ball_radius)

    bright, deep = IRIS_COLOURS[seed % len(IRIS_COLOURS)]
    black = (0.006, 0.005, 0.005, 1)

    # LINEAR, not B_SPLINE. A spline overshoots between stops, and between a
    # black pupil and a pale sclera it overshoots into values that read as a
    # glowing ring around the iris.
    ramp.color_ramp.interpolation = "LINEAR"
    while len(ramp.color_ramp.elements) > 1:
        ramp.color_ramp.elements.remove(ramp.color_ramp.elements[-1])
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = black

    for position, colour in (
        (pupil * 0.92, black),                                   # pupil
        (pupil * 1.08, (*deep, 1)),                              # its edge
        (pupil + (iris - pupil) * 0.45, (*bright, 1)),           # the iris body
        (iris * 0.97, (*deep, 1)),                               # darkening out
        (iris, (0.020, 0.016, 0.014, 1)),                        # limbal ring
        (limbus, (0.74, 0.71, 0.70, 1)),                         # sclera, in shadow
        (limbus * 2.2, (0.92, 0.90, 0.88, 1)),
        (1.000, (0.72, 0.70, 0.69, 1)),
    ):
        ramp.color_ramp.elements.new(min(position, 1.0)).color = colour

    tree.links.new(coords.outputs["Generated"], split.inputs[0])
    tree.links.new(split.outputs["Y"], ramp.inputs[0])
    tree.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    # A cornea is wet. The catchlight it throws is most of what separates a
    # living eye from a bead, so the whole ball is glossy and slightly
    # translucent rather than a matte painted sphere.
    bsdf.inputs["Roughness"].default_value = 0.045
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.85
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = 0.6
        bsdf.inputs["Coat Roughness"].default_value = 0.02
    tree.links.new(bsdf.outputs[0], out.inputs[0])
    return material


def add_eyes(sockets, seed: int):
    """Eyeballs seated in the palpebral fissure the base mesh already has."""
    eyes = []
    for name, socket in zip(("EyeL", "EyeR"), sockets):
        centre, radius = socket.centre, socket.radius
        existing = bpy.data.objects.get(name)
        if existing:
            bpy.data.objects.remove(existing, do_unlink=True)
        # Seated by measurement, not by taste.
        #
        # The base mesh already HAS eyelids — the 32-vertex hole this pipeline
        # finds is the palpebral fissure, the gap between them, not an empty
        # orbit. So the only question is how deep the ball sits behind that
        # gap, and the previous answer (a flat 19mm setback) was larger than
        # the eyeball itself: the cornea ended up almost 2mm BEHIND the lid
        # margins and the aperture rendered as a black hole. The same constant
        # on a smaller skull pushed the ball out through the lids instead,
        # which is where "the eyes protrude" came from. One constant cannot be
        # right for every face.
        #
        # Anatomy gives the rule for free. A real cornea sits slightly PROUD of
        # the lid margins — that is why an eye catches the key light and a
        # doll's does not — so put the front pole a tenth of a radius in front
        # of the plane of the fissure and let both numbers scale with the head.
        ball = radius * 0.72
        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=ball, segments=48, ring_count=24,
            location=(centre.x, centre.y + ball * 0.90, centre.z),
        )
        eye = bpy.context.view_layer.objects.active
        eye.name = name
        for polygon in eye.data.polygons:
            polygon.use_smooth = True
        eye.data.materials.append(eye_material(ball, seed))
        eyes.append(eye)
    return eyes


def add_hair(human, sockets, rng: random.Random):
    """
    A skull-cap shrinkwrapped to THIS cranium.

    Not hair cards and not a particle system — both need assets or a render
    budget this pipeline does not have. Shrinkwrapping means it fits whatever
    skull the seed produced, which a fixed hair mesh would not.
    """
    crown_z = sockets[0][0].z + 0.115
    style = rng.random()
    if style < 0.12:
        return None                                  # bald

    recession = 0.0 if style > 0.45 else 0.018       # a receding hairline
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=0.115, segments=32, ring_count=20, location=(0, -0.02, crown_z - 0.055)
    )
    hair = bpy.context.view_layer.objects.active
    hair.name = "Hair"

    bm = bmesh.new()
    bm.from_mesh(hair.data)
    doomed = [
        v for v in bm.verts
        if v.co.z < -0.012 + recession or (v.co.y < -0.055 and v.co.z < 0.045 + recession)
    ]
    bmesh.ops.delete(bm, geom=doomed, context="VERTS")
    bm.to_mesh(hair.data)
    bm.free()

    wrap = hair.modifiers.new("SW", "SHRINKWRAP")
    wrap.target = human
    wrap.offset = 0.0032
    solid = hair.modifiers.new("Sol", "SOLIDIFY")
    solid.thickness = 0.004
    solid.offset = 1
    for polygon in hair.data.polygons:
        polygon.use_smooth = True

    greying = rng.random()
    shade = 0.030 + greying * 0.16 if greying > 0.72 else 0.030 + greying * 0.05
    hair.data.materials.append(flat_material("FaultHair", (shade, shade * 0.85, shade * 0.75), 0.97, 0.12))
    return hair


def add_brows(human, sockets, rng: random.Random):
    """The brow is the strongest signal in a face. It gets its own geometry."""
    brows = []
    weight = 0.22 + rng.random() * 0.16
    for name, socket in zip(("BrowL", "BrowR"), sockets):
        centre, radius = socket.centre, socket.radius
        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=radius * 0.98, segments=20, ring_count=10,
            location=(centre.x, centre.y - 0.004, centre.z + 0.0235),
        )
        brow = bpy.context.view_layer.objects.active
        brow.name = name
        brow.scale = (1.25, 0.30, weight)
        wrap = brow.modifiers.new("SW", "SHRINKWRAP")
        wrap.target = human
        wrap.offset = 0.0035
        for polygon in brow.data.polygons:
            polygon.use_smooth = True
        brow.data.materials.append(bpy.data.materials.get("FaultHair") or
                                   flat_material("FaultHair", (0.03, 0.026, 0.022), 0.97, 0.12))
        brows.append(brow)
    return brows


def add_shirt(human, sockets, rng: random.Random):
    """
    Clothing derived from the body, so it cannot fail to fit.

    Built by duplicating the evaluated torso and pushing it out along its own
    normals. A primitive scaled to "about right" intersects the chest on half
    the seeds; this one is correct on all of them.
    """
    neck_z = sockets[0][0].z - 0.098   # just under the jaw, so a collar is visible
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mask = next((m for m in human.modifiers if m.type == "MASK"), None)
    previous = mask.show_viewport if mask else None
    if mask:
        mask.show_viewport = False
    mesh = bpy.data.meshes.new_from_object(human.evaluated_get(depsgraph))
    if mask:
        mask.show_viewport = previous

    shirt = bpy.data.objects.new("Shirt", mesh)
    bpy.context.scene.collection.objects.link(shirt)
    shirt.matrix_world = human.matrix_world

    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.delete(
        bm,
        geom=[v for v in bm.verts if v.co.z > neck_z or v.co.z < neck_z - 0.36],
        context="VERTS",
    )
    bm.to_mesh(mesh)
    bm.free()

    solid = shirt.modifiers.new("Sol", "SOLIDIFY")
    solid.thickness = 0.014
    solid.offset = 1.0
    push = shirt.modifiers.new("Push", "DISPLACE")
    push.strength = 0.010
    push.mid_level = 0.0
    for polygon in mesh.polygons:
        polygon.use_smooth = True

    # Court clothes: muted, unremarkable, and never a colour that reads as a
    # character note. The accent belongs to the case, not to the accused.
    palette = ((0.075, 0.082, 0.100), (0.090, 0.086, 0.078),
               (0.062, 0.070, 0.066), (0.100, 0.092, 0.086))
    shirt.data.materials.clear()
    shirt.data.materials.append(
        flat_material("FaultCloth", rng.choice(palette), 0.95, 0.10)
    )
    return shirt


# -------------------------------------------------------------------- stage --

def build_stage(sockets):
    """
    One hard key from above and in front, a cold rim, almost no fill.

    This is the room the game already describes: near-black, one overhead
    source, high contrast. It is also simply how you light a face you want
    somebody to read — and being read is what the accused is here for.
    """
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 200
    scene.render.resolution_x = 512
    scene.render.resolution_y = 640
    scene.render.film_transparent = True
    # AgX rolls highlights off instead of clipping them. Under a single hard
    # key, Standard turns every lit cheek into a white patch.
    try:
        scene.view_settings.view_transform = "AgX"
        scene.view_settings.look = "AgX - Medium Contrast"
    except Exception:
        pass
    scene.view_settings.exposure = -0.35

    head_z = sockets[0][0].z - 0.015

    for name in ("Key", "Rim", "Fill", "Cam", "Focus"):
        existing = bpy.data.objects.get(name)
        if existing:
            bpy.data.objects.remove(existing, do_unlink=True)

    focus = bpy.data.objects.new("Focus", None)
    focus.location = (0, -0.06, head_z)
    scene.collection.objects.link(focus)

    for name, location, energy, size, colour in (
        ("Key",  (0.30, -0.48, head_z + 0.50), 19.0, 0.14, (1.00, 0.94, 0.85)),
        ("Rim",  (-0.46, 0.22, head_z + 0.16), 14.0, 0.12, (0.66, 0.76, 1.00)),
        ("Fill", (-0.30, -0.45, head_z - 0.10),  0.7, 0.40, (0.86, 0.90, 1.00)),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.size = size
        data.color = colour
        light = bpy.data.objects.new(name, data)
        light.location = location
        scene.collection.objects.link(light)
        track = light.constraints.new("TRACK_TO")
        track.target = focus
        track.track_axis = "TRACK_NEGATIVE_Z"
        track.up_axis = "UP_Y"

    camera_data = bpy.data.cameras.new("Cam")
    camera_data.lens = 85                       # portrait lens: no wide distortion
    camera_data.dof.use_dof = True
    camera_data.dof.focus_object = focus
    camera_data.dof.aperture_fstop = 4.0

    frame_height = 0.34
    vfov = 2 * math.atan(camera_data.sensor_width / (2 * camera_data.lens))
    distance = (frame_height / 2) / math.tan(vfov / 2)

    camera = bpy.data.objects.new("Cam", camera_data)
    camera.location = (0, -distance, head_z)
    camera.rotation_euler = (math.radians(90), 0, 0)
    scene.collection.objects.link(camera)
    scene.camera = camera

    world = bpy.data.worlds.get("FaultWorld") or bpy.data.worlds.new("FaultWorld")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.02, 0.02, 0.024, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.06
    return camera


# ------------------------------------------------------------------ rendering --

def render_layers(out_dir: str, stem: str, parts: dict):
    """
    Render each layer alone, on transparency.

    Layers rather than one flat image because demeanour and oddity are RUNTIME
    behaviour: the head tilts, the shoulders roll, the eyes slide, the lids
    close. Baking those in would multiply the library by every combination and
    freeze the one thing that should stay alive.
    """
    os.makedirs(out_dir, exist_ok=True)
    scene = bpy.context.scene
    written = []

    for layer, objects in parts.items():
        objects = [o for o in objects if o is not None]
        if not objects:
            continue
        visible = {o.name for o in objects}
        for obj in bpy.data.objects:
            if obj.type == "MESH":
                obj.hide_render = obj.name not in visible

        path = os.path.join(out_dir, f"{stem}_{layer}.png")
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        written.append(path)
        print(f"  wrote {os.path.basename(path)}")

    for obj in bpy.data.objects:
        if obj.type == "MESH":
            obj.hide_render = False
    return written


def build_one(seed: int, appearance: float, oddity: float, out_dir: str):
    """One person, at one point on the measured axes, as a set of layers."""
    rng = random.Random(seed ^ 0x5F3759DF)      # decor, never identity

    macro = macro_for_seed(seed)
    human = build_human(seed)

    # Every deformation is a shape key, and every shape key moves the orbit.
    # Measure, deform, measure again — anything built off a stale socket sits
    # a few millimetres out, which on a face is the whole difference.
    apply_appearance(human, eye_sockets(human), appearance)
    apply_oddity_shape(human, eye_sockets(human), oddity, rng)
    sockets = eye_sockets(human)

    # Real assets where they are installed, procedural where they are not.
    # Each of these is a whole-quality step — a photographed skin instead of a
    # computed one, a modelled eyeball instead of a sphere, hair cards instead
    # of a shrinkwrapped cap — and each is independent, so a partial asset
    # library still improves the render rather than failing it.
    feminine = macro.get("gender", 0.5) < 0.5
    if not real_skin(human, macro):
        apply_skin(human, macro)

    eyes = real_eyes(human, seed) or add_eyes(sockets, seed)
    hair = real_hair(human, seed, feminine) or add_hair(human, sockets, rng)
    # Called once and held: `real_brows(...) if real_brows(...)` would fit the
    # asset to the mesh twice and leave the first copy in the scene.
    fitted_brows = real_brows(human, seed)
    brows = [fitted_brows] if fitted_brows else add_brows(human, sockets, rng)
    lashes = real_lashes(human, seed)
    shirt = add_shirt(human, sockets, rng)
    # Last, so the ball slides behind a lid that stays where it was.
    apply_gaze_drift(eyes, oddity, rng)

    build_stage(sockets)

    stem = f"{seed:04d}_a{int(appearance):03d}_o{int(oddity):03d}"
    # ONE image, not three.
    #
    # This used to render body / head / eyes as separate layers, on the theory
    # that the client could then move the eyes at runtime. It could not: the
    # body mesh is a single object, so `human` appeared in both the body layer
    # and the head layer, and compositing head over eyes painted the full face
    # straight back over the eyeballs. Every defendant came out with two black
    # slots. A layer split that cannot be composited is not a layer split.
    #
    # Gaze and blink stay runtime, but they belong to the vector overlay the
    # client draws on top — see components/scene2d. What Blender bakes is the
    # one thing vectors cannot fake: a lit, shaded, anatomically real head.
    return render_layers(out_dir, stem, {
        "figure": [human, shirt, hair, lashes, *brows, *eyes],
    })


# ----------------------------------------------------------------------- cli --

def parse_seeds(spec: str):
    out = []
    for chunk in spec.split(","):
        chunk = chunk.strip()
        if "-" in chunk:
            lo, hi = chunk.split("-")
            out.extend(range(int(lo), int(hi) + 1))
        elif chunk:
            out.append(int(chunk))
    return out


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Render the accused.")
    parser.add_argument("--seeds", default="0-7", help="e.g. 0-63 or 1,4,9")
    parser.add_argument("--appearance", default="20,50,80",
                        help="points on the measured hard<->disarming axis")
    parser.add_argument("--oddity", default="0", help="points on the uncanny axis")
    parser.add_argument("--out", default="portraits")
    parser.add_argument("--samples", type=int, default=200)
    args = parser.parse_args(argv)

    seeds = parse_seeds(args.seeds)
    appearances = [float(x) for x in args.appearance.split(",")]
    oddities = [float(x) for x in args.oddity.split(",")]

    print(f"rendering {len(seeds)} x {len(appearances)} x {len(oddities)} "
          f"= {len(seeds)*len(appearances)*len(oddities)} portraits -> {args.out}")

    for seed in seeds:
        for appearance in appearances:
            for oddity in oddities:
                print(f"seed {seed} appearance {appearance:.0f} oddity {oddity:.0f}")
                bpy.context.scene.cycles.samples = args.samples
                build_one(seed, appearance, oddity, args.out)


if __name__ == "__main__":
    main()
