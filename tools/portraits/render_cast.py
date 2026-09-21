"""
Render the cast as lit portrait frames.

    blender --background --python tools/portraits/render_cast.py -- \
        --glb tools/suspect/build --out tools/portraits/frames [--only m_mid_ca]

Then pack them for the app:

    python3 tools/portraits/pack_cast.py

WHY STILLS, WHEN THERE IS A MODEL

The .glb files draw in real time only where expo-gl can be trusted to present,
which excludes the iOS Simulator outright and an unknown slice of phones — and
wherever it fails, the player gets the flat vector drawing instead. A still
rendered here draws identically on every device through the ordinary image
pipeline, and it is lit by a renderer with shadows, subsurface and a proper
tone curve rather than three directional lights on a phone GPU.

The trade is continuity: a model can hold any blend of expressions, a still
holds the ones rendered. So the frames are the ones the game actually uses —
the trial expressions, each with three speaking mouths and a blink, and the
five verdict reactions — and pack_cast.py stores each one as the small patch of
the face that differs from the neutral base, so a talking mouth costs a few
kilobytes rather than a portrait.

FRAMING IS A CONTRACT. Every frame of every person puts the eyes at the same
pixel and makes eyes-to-crown the same number of pixels (EYES_PX, HEAD_PX).
The app places characters by those two numbers alone; see
mobile/components/cast/Actor.tsx.
"""

import bpy, math, os, sys
from mathutils import Vector

W, H = 1024, 1280
EYES_PX = (512, 470)  # where the eyes land, from top-left
HEAD_PX = 250  # eyes to crown — enough pixels for the defendant close-up at 3x
LENS = 85.0
SENSOR_H = 24.0

TRIAL = ["neutral", "tense", "pleading", "defiant", "ashamed", "startled"]
MOUTHS = ["", "talkA", "talkO", "talkE"]
REACTIONS = ["broken", "stricken", "smirk", "relief", "unreadable"]


def frames():
    """(frame name, {shape: value}) for everything the app draws."""
    out = []
    for e in TRIAL:
        base = {} if e == "neutral" else {e: 1.0}
        for m in MOUTHS:
            name = f"{e}" + (f"_{m}" if m else "")
            out.append((name, {**base, **({m: 1.0} if m else {})}))
        out.append((f"{e}_blink", {**base, "blink": 1.0}))
    for r in REACTIONS:
        out.append((r, {r: 1.0}))
    return out


def meshes():
    return [o for o in bpy.context.scene.objects if o.type == "MESH"]


def set_shapes(values: dict):
    for o in meshes():
        keys = o.data.shape_keys
        if not keys:
            continue
        for k in keys.key_blocks:
            if k.name == "Basis":
                continue
            k.value = values.get(k.name, 0.0)


def world_bounds(obj):
    pts = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    return pts


def look(scene):
    """AgX with a touch more contrast — a courtroom, not a catalogue."""
    try:
        scene.view_settings.view_transform = "AgX"
    except TypeError as err:
        print("view transform:", err)
    for candidate in ("AgX - Medium High Contrast", "Medium High Contrast"):
        try:
            scene.view_settings.look = candidate
            break
        except TypeError:
            continue


def skin(obj):
    """A little subsurface on the body — the difference between skin and plastic."""
    for slot in obj.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes:
            continue
        bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf:
            continue
        if "Subsurface Weight" in bsdf.inputs:
            bsdf.inputs["Subsurface Weight"].default_value = 0.12
        if "Subsurface Radius" in bsdf.inputs:
            bsdf.inputs["Subsurface Radius"].default_value = (1.0, 0.35, 0.2)
        if "Subsurface Scale" in bsdf.inputs:
            bsdf.inputs["Subsurface Scale"].default_value = 0.01
        if "Roughness" in bsdf.inputs and not bsdf.inputs["Roughness"].is_linked:
            bsdf.inputs["Roughness"].default_value = 0.52
        if "Specular IOR Level" in bsdf.inputs:
            bsdf.inputs["Specular IOR Level"].default_value = 0.35


def soften(obj):
    """
    Let hair, brows and lashes be soft-edged.

    The glTF importer turns a MASK material into a hard threshold — a MATH
    chain between the texture's alpha and the shader — so brows render as
    solid black bars and lashes as a row of dots. Walking back through that
    chain to the texture and feeding its alpha straight in gives the strand
    tips back; EEVEE's dithered transparency resolves it over 64 samples.
    The same fix SuspectModel applies at runtime, for the same reason.
    """
    for slot in obj.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes:
            continue
        tree = mat.node_tree
        bsdf = next((n for n in tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf or not bsdf.inputs["Alpha"].is_linked:
            continue
        link = bsdf.inputs["Alpha"].links[0]
        node, socket = link.from_node, link.from_socket
        while node.type == "MATH":
            linked = next((i for i in node.inputs if i.is_linked), None)
            if linked is None:
                break
            socket = linked.links[0].from_socket
            node = linked.links[0].from_node
        if node.type != "MATH":
            tree.links.new(socket, bsdf.inputs["Alpha"])
        # Brows are painted pure black; real ones are a hair colour.
        if "eyebrow" in obj.name.lower() and "Alpha" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = 0.8


def calm_irises(obj):
    """The iris textures read mauve under the warm key; bring them to brown."""
    for slot in obj.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes:
            continue
        tree = mat.node_tree
        bsdf = next((n for n in tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf or not bsdf.inputs["Base Color"].is_linked:
            continue
        src = bsdf.inputs["Base Color"].links[0].from_socket
        hsv = tree.nodes.new("ShaderNodeHueSaturation")
        # The stock iris maps are mauve; rotate them toward brown (0.5 is no
        # shift) and pull the sclera off pure white, which glares in a dim room.
        hsv.inputs["Hue"].default_value = 0.54
        hsv.inputs["Saturation"].default_value = 0.9
        hsv.inputs["Value"].default_value = 0.6
        tree.links.new(src, hsv.inputs["Color"])
        tree.links.new(hsv.outputs["Color"], bsdf.inputs["Base Color"])


HAIR_ASSETS = ("afro", "braid", "bob", "long", "short", "ponytail")


def grey(obj, strength: float):
    """
    Grey hair, for the older cast.

    The exporter can only TINT hair, and a tint multiplies the texture — so a
    dark-brown strand map can go darker but never grey. Desaturating it and
    lifting its value here is what actually ages a head of hair.
    """
    for slot in obj.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes:
            continue
        tree = mat.node_tree
        bsdf = next((n for n in tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf or not bsdf.inputs["Base Color"].is_linked:
            continue
        src = bsdf.inputs["Base Color"].links[0].from_socket
        hsv = tree.nodes.new("ShaderNodeHueSaturation")
        hsv.inputs["Saturation"].default_value = 0.12
        hsv.inputs["Value"].default_value = strength
        tree.links.new(src, hsv.inputs["Color"])
        tree.links.new(hsv.outputs["Color"], bsdf.inputs["Base Color"])


def smooth(obj):
    """MakeHuman hair is low-poly cards; one subdivision removes the banding."""
    mod = obj.modifiers.new("smooth", "SUBSURF")
    mod.levels = 1
    mod.render_levels = 1
    for poly in obj.data.polygons:
        poly.use_smooth = True


def area(name, energy, size, loc, target, colour):
    light = bpy.data.lights.new(name, "AREA")
    light.energy = energy
    light.size = size
    light.color = colour
    obj = bpy.data.objects.new(name, light)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = loc
    direction = Vector(target) - Vector(loc)
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return obj


def stage(glb):
    old = "_old_" in os.path.basename(glb)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=glb)
    set_shapes({})
    bpy.context.view_layer.update()

    all_meshes = meshes()
    eyes = next((o for o in all_meshes if o.name.lower().endswith("eyes")), None)
    if eyes is None:
        raise RuntimeError(f"{glb}: no eyes mesh")
    ep = world_bounds(eyes)
    ex = sum(p.x for p in ep) / 8
    ey = sum(p.y for p in ep) / 8
    ez = sum(p.z for p in ep) / 8
    crown = max(v.z for o in all_meshes for v in world_bounds(o)) - ez

    for o in all_meshes:
        name = o.name.lower()
        if name in ("base", "human") or name.endswith("base"):
            skin(o)
        elif name == "eyes":
            calm_irises(o)
        else:
            soften(o)
            is_hair = any(k in name for k in HAIR_ASSETS)
            if is_hair:
                smooth(o)
            if old and (is_hair or "eyebrow" in name):
                grey(o, 2.1 if is_hair else 1.8)

    scene = bpy.context.scene
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = LENS
    cam_data.sensor_fit = "VERTICAL"
    cam_data.sensor_height = SENSOR_H
    # Eyes above centre. A positive shift_y moves the camera's window UP, which
    # carries the subject DOWN the frame — so lifting the eyes wants negative.
    cam_data.shift_y = -(H / 2 - EYES_PX[1]) / max(W, H)
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    # Distance that makes eyes-to-crown exactly HEAD_PX tall.
    distance = crown * H * LENS / (HEAD_PX * SENSOR_H)
    cam.location = (ex, ey - distance, ez)
    cam.rotation_euler = (math.radians(90), 0, 0)
    scene.camera = cam

    head = Vector((ex, ey, ez))
    u = crown  # lights scale with the person so every portrait is lit alike
    # Key: high, in front, from the left of frame. Warm, the one lamp the room has.
    watts = (u / 0.12) ** 2
    area("key", 55 * watts, 4 * u, head + Vector((-4 * u, -7 * u, 5 * u)), head, (1.0, 0.93, 0.84))
    # Fill: low and weak from the other side, so shadows keep a floor.
    area("fill", 9 * watts, 6 * u, head + Vector((6 * u, -6 * u, -1 * u)), head, (0.85, 0.9, 1.0))
    # Rim: behind and above, cool — separates hair from the dark room.
    area("rim", 45 * watts, 3 * u, head + Vector((5 * u, 6 * u, 4 * u)), head, (0.72, 0.8, 1.0))

    world = bpy.data.worlds.new("room")
    scene.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (0.03, 0.03, 0.035, 1)
    bg.inputs[1].default_value = 1.0

    scene.render.engine = "BLENDER_EEVEE"
    eevee = scene.eevee
    for attr, value in (
        ("taa_render_samples", 64),
        ("use_raytracing", True),
        ("use_shadows", True),
        ("shadow_ray_count", 2),
        ("shadow_step_count", 8),
    ):
        if hasattr(eevee, attr):
            try:
                setattr(eevee, attr, value)
            except Exception as err:  # noqa: BLE001 — engine settings differ by version
                print("eevee", attr, err)
    scene.render.film_transparent = True
    scene.render.resolution_x = W
    scene.render.resolution_y = H
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    look(scene)


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    glb_dir, out_dir, only, which = "tools/suspect/build", "tools/portraits/frames", None, None
    for i, a in enumerate(argv):
        if a == "--glb":
            glb_dir = argv[i + 1]
        elif a == "--out":
            out_dir = argv[i + 1]
        elif a == "--only":
            only = argv[i + 1]
        elif a == "--frames":
            which = set(argv[i + 1].split(","))

    names = sorted(f[:-4] for f in os.listdir(glb_dir) if f.endswith(".glb"))
    for name in names:
        if only and name != only:
            continue
        stage(os.path.join(glb_dir, name + ".glb"))
        target = os.path.join(out_dir, name)
        os.makedirs(target, exist_ok=True)
        for frame, values in frames():
            if which and frame not in which:
                continue
            set_shapes(values)
            bpy.context.scene.render.filepath = os.path.abspath(os.path.join(target, frame + ".png"))
            bpy.ops.render.render(write_still=True)
        print("rendered", name)


if __name__ == "__main__":
    main()
