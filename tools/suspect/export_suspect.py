"""
Export the accused as a real-time 3D model.

    blender --background --python tools/suspect/export_suspect.py -- \
        --out tools/suspect/build

Produces one .glb per archetype. Each carries an upper body — head, neck,
shoulders, arms and hands, which is as much as the courtroom camera ever sees —
plus eyes, brows, lashes, hair and a garment, and five morph targets named for
the five verdict reactions.

WHY MORPH TARGETS AND NOT A RENDER.

The pipeline in tools/portraits bakes Cycles stills, and they look better than
anything a phone GPU will draw. They cannot be used here. The reaction depends
on the verdict AND on whether the juror was right, the identity depends on
portraitSeed, and the two multiply: a library covering both is thousands of
images. A model with named shapes is a few megabytes and covers every
combination, because the combination happens at runtime.

WHY THE EXPRESSIONS ARE BAKED AND THE IDENTITY IS NOT.

MPFB's macro morphs — gender, age, ancestry, weight — are COMBINATION targets.
The set of shape keys on the mesh changes with the values, so there is no fixed
list to hand a client. Identity is therefore baked per archetype and shipped as
separate files. Expressions are different: every face unit is the same target
on the same topology whatever the body, so those become morph targets and the
client drives them.

The units themselves are the MakeHuman faceunits01 pack, which is the ARKit
blendshape set — mouthSmileLeft, browInnerUp, jawOpen and so on. Building a
reaction out of those is the difference between a face that emotes and a mesh
that has been squashed: a smirk is mouthSmileLeft WITHOUT mouthSmileRight, and
no amount of symmetric deformation gets there.
"""

import bpy, bmesh, importlib, json, math, os, random, struct, subprocess, sys, zlib
from mathutils import Vector

MPFB = "bl_ext.user_default.mpfb"


def ensure_mpfb():
    import addon_utils
    if MPFB not in bpy.context.preferences.addons:
        addon_utils.enable(MPFB, default_set=True, persistent=True)
    if MPFB not in bpy.context.preferences.addons:
        raise RuntimeError(
            "MPFB is not enabled. It reads its own addon preferences at import, "
            "so --background cannot enable it: turn it on in Blender's saved "
            "preferences once, then re-run."
        )


def services():
    ensure_mpfb()
    return importlib.import_module(MPFB + ".services")


# ------------------------------------------------------------------ reactions --
#
# Each reaction is a recipe of ARKit face units. These are the same five the
# server names in domain/reaction.ts and the client names in scene2d/expression;
# if a name here stops matching one there, the model simply has no shape to set
# and the face goes neutral, which is why the client falls back rather than
# throwing.

REACTIONS = {
    # Convicted, and they did it. Folded inward. Everything falls.
    "broken": {
        "browInnerUp": 0.45,
        "browDownLeft": 0.25, "browDownRight": 0.25,
        "eyeBlinkLeft": 0.55, "eyeBlinkRight": 0.55,
        "eyeLookDownLeft": 0.7, "eyeLookDownRight": 0.7,
        "mouthFrownLeft": 0.75, "mouthFrownRight": 0.75,
        "mouthShrugLower": 0.4,
        "cheekSquintLeft": 0.2, "cheekSquintRight": 0.2,
    },
    # Convicted, and they did not. Open, disbelieving, aimed at the juror.
    "stricken": {
        "browInnerUp": 1.0,
        "browOuterUpLeft": 0.55, "browOuterUpRight": 0.55,
        "eyeWideLeft": 0.8, "eyeWideRight": 0.8,
        # 0.45 dropped the jaw far enough to put the tongue on show, which
        # reads as comic rather than stricken. A shocked mouth is open, not
        # gaping.
        "jawOpen": 0.28,
        "mouthFrownLeft": 0.55, "mouthFrownRight": 0.55,
        "mouthStretchLeft": 0.34, "mouthStretchRight": 0.34,
        "mouthRollLower": 0.2,
    },
    # Acquitted, and they did it. The asymmetry IS the expression — a smirk is
    # one corner of the mouth, and a symmetric one is just a smile.
    "smirk": {
        "mouthSmileLeft": 0.85, "mouthSmileRight": 0.15,
        "mouthDimpleLeft": 0.6,
        "eyeSquintLeft": 0.45, "eyeSquintRight": 0.2,
        "browDownRight": 0.22,
        "browOuterUpLeft": 0.18,
        "noseSneerLeft": 0.15,
    },
    # Acquitted, and they did not. The breath they have been holding.
    "relief": {
        "mouthSmileLeft": 0.6, "mouthSmileRight": 0.6,
        "eyeBlinkLeft": 0.75, "eyeBlinkRight": 0.75,
        "browInnerUp": 0.55,
        "cheekSquintLeft": 0.45, "cheekSquintRight": 0.45,
        "mouthDimpleLeft": 0.3, "mouthDimpleRight": 0.3,
    },
    # No answer existed. Composed, and giving nothing.
    "unreadable": {
        "eyeSquintLeft": 0.12, "eyeSquintRight": 0.12,
        "mouthPressLeft": 0.2, "mouthPressRight": 0.2,
    },
}


# ------------------------------------------------------------------- the trial --
#
# The five above are the verdict. These are the two minutes before it, and they
# are the reason the game exists: the whole mechanic is a player reading a face
# that is telling them nothing reliable. They mirror scene2d/expression exactly,
# because a defendant must not change character when the renderer changes.
#
# Note what these carry and what they do not. Presentation is rolled blind to
# guilt (see server/domain/presentation), so an expression during the trial is
# information-free by construction — and that is precisely what makes measuring
# a juror's reaction to it meaningful. The verdict reactions are the opposite:
# those DO mean what they look like.

TRIAL = {
    # Holding it together, and not quite managing. The default under pressure.
    "tense": {
        "browDownLeft": 0.22, "browDownRight": 0.22,
        "browInnerUp": 0.18,
        "eyeSquintLeft": 0.2, "eyeSquintRight": 0.2,
        "mouthPressLeft": 0.4, "mouthPressRight": 0.4,
        "mouthFrownLeft": 0.2, "mouthFrownRight": 0.2,
    },
    # Looking for something in your face. Open, raised, slightly lost.
    "pleading": {
        "browInnerUp": 0.75,
        "browOuterUpLeft": 0.35, "browOuterUpRight": 0.35,
        "eyeWideLeft": 0.3, "eyeWideRight": 0.3,
        "mouthFrownLeft": 0.4, "mouthFrownRight": 0.4,
        "mouthShrugUpper": 0.25,
    },
    # Not giving you anything. Chin level, eyes steady, jaw set.
    "defiant": {
        "browDownLeft": 0.5, "browDownRight": 0.5,
        "eyeSquintLeft": 0.35, "eyeSquintRight": 0.35,
        "mouthPressLeft": 0.5, "mouthPressRight": 0.5,
        "jawForward": 0.3,
    },
    # Cannot look at you. The only one that breaks eye contact outright.
    "ashamed": {
        "browInnerUp": 0.4,
        "eyeBlinkLeft": 0.42, "eyeBlinkRight": 0.42,
        "eyeLookDownLeft": 0.6, "eyeLookDownRight": 0.6,
        "eyeLookInLeft": 0.35, "eyeLookOutRight": 0.35,
        "mouthFrownLeft": 0.25, "mouthFrownRight": 0.25,
    },
    # Something just landed. Brief, and it decays back on its own.
    "startled": {
        "browInnerUp": 0.6,
        "browOuterUpLeft": 0.7, "browOuterUpRight": 0.7,
        "eyeWideLeft": 0.75, "eyeWideRight": 0.75,
        "jawOpen": 0.22,
    },
}

# --------------------------------------------------------------- the channels --
#
# Named shapes are picked; these are DIALLED. The client sets an influence
# between 0 and 1 rather than choosing one — a blink is 0.7 shut, a gaze is 40%
# of the way left — so each one has to mean the same thing at every value.
#
# Gaze is four targets rather than an eye bone because the eyes are a single
# mesh holding both eyeballs: rotating that mesh turns them about the point
# between them, which slides them sideways in their sockets instead of aiming
# them. The ARKit units aim each eye about its own centre, which is the thing
# that makes a gaze read as a gaze.

CHANNELS = {
    "blink": {"eyeBlinkLeft": 1.0, "eyeBlinkRight": 1.0},
    "gazeLeft": {"eyeLookOutLeft": 1.0, "eyeLookInRight": 1.0},
    "gazeRight": {"eyeLookInLeft": 1.0, "eyeLookOutRight": 1.0},
    "gazeUp": {"eyeLookUpLeft": 1.0, "eyeLookUpRight": 1.0},
    "gazeDown": {"eyeLookDownLeft": 1.0, "eyeLookDownRight": 1.0},
    # Body only. Demeanour is a continuous axis, so the shoulders have to roll
    # by an amount rather than snap to a pose.
    "slump": {},
    # Mouth shapes for speech. Three are enough to read as talking rather than
    # as a jaw on a hinge: open (A), rounded (O) and spread (E). They are
    # dialled on top of whatever expression the face is already holding, so
    # a defiant mouth talks defiantly. Kept small — a shouted "A" is comedy.
    "talkA": {"jawOpen": 0.3, "mouthLowerDownLeft": 0.3, "mouthLowerDownRight": 0.3},
    "talkO": {"jawOpen": 0.16, "mouthFunnel": 0.55, "mouthPucker": 0.3},
    "talkE": {
        "jawOpen": 0.1,
        "mouthStretchLeft": 0.35, "mouthStretchRight": 0.35,
        "mouthUpperUpLeft": 0.2, "mouthUpperUpRight": 0.2,
        "mouthLowerDownLeft": 0.2, "mouthLowerDownRight": 0.2,
    },
}


# ----------------------------------------------------------------- archetypes --
#
# Identity is baked, so this list is the whole cast. Kept deliberately short and
# spread rather than long and clustered: the client picks one with
# `portraitSeed % len(ARCHETYPES)` and varies skin, hair and garment on top, so
# breadth here costs a file each while breadth there is free.

ARCHETYPES = [
    # MPFB's `gender` macro is a blend, not a switch, and 0.15 reads as
    # androgynous rather than female — the jaw and brow only resolve near the
    # ends of the range. These sit close to the extremes on purpose.
    #
    # Twenty people, spread over presentation x age x ancestry, each with their
    # OWN hair and outfit pinned. The first cast let `dress` pick, and with one
    # textured hairstyle per presentation and one courtroom-appropriate outfit,
    # every woman came out in the same long hair and striped blouse and every
    # man in the same suit — a room of clones. `hair_asset` / `clothes` name the
    # MakeHuman asset directly; `gray` asks the renderer to grey the hair,
    # because a tint MULTIPLIES a dark texture and can only make it darker.
    #
    # NOT worn by anyone: female_casualsuit01/02 and male_casualsuit02/04 are
    # T-shirts with the MakeHuman logo printed on the chest, and the bob cuts
    # (and braid01 and short03) sweep across one eye, and afro01's texture
    # renders as a blotchy helmet at portrait size — in a game about reading a face, that hides half
    # of it. Men's shirts and jackets fit onto a woman's body well enough
    # (MakeHuman fits garments by base-mesh vertex), and with a tint they are
    # most of the variety a courtroom needs. Ponytail01 reads as slicked-back
    # short hair from the front, so the women wearing it keep the blouse —
    # otherwise a woman's name lands on a face the eye reads as a man's.
    #
    # `wears` tints the garment (a multiply, so it can only deepen).
    #   name            gender age   race         hair_asset   clothes                 gray
    {"name": "f_young_af",   "gender": 0.05, "age": 0.28, "race": "african",   "hair_asset": "long01",     "clothes": "female_elegantsuit01",  "hair": (0.09, 0.06, 0.05), "wears": (0.66, 0.74, 0.86)},
    {"name": "f_young_af_b", "gender": 0.04, "age": 0.33, "race": "african",   "hair_asset": "long01",    "clothes": "female_elegantsuit01", "hair": (0.07, 0.05, 0.05), "wears": (0.80, 0.70, 0.66)},
    {"name": "f_mid_af",     "gender": 0.05, "age": 0.58, "race": "african",   "hair_asset": "long01",      "clothes": "female_elegantsuit01",  "hair": (0.06, 0.05, 0.05), "wears": (0.86, 0.80, 0.62)},
    {"name": "f_old_af",     "gender": 0.05, "age": 0.84, "race": "african",   "hair_asset": "short02",      "clothes": "female_elegantsuit01", "hair": (0.40, 0.39, 0.38), "wears": (0.78, 0.68, 0.66), "gray": True},
    {"name": "f_young_as",   "gender": 0.04, "age": 0.30, "race": "asian",     "hair_asset": "long01", "clothes": "female_elegantsuit01",  "hair": (0.07, 0.05, 0.05), "wears": (0.70, 0.86, 0.78)},
    {"name": "f_mid_as",     "gender": 0.05, "age": 0.56, "race": "asian",     "hair_asset": "long01",      "clothes": "female_elegantsuit01", "hair": (0.06, 0.05, 0.05), "wears": (0.76, 0.72, 0.80)},
    {"name": "f_old_as",     "gender": 0.05, "age": 0.86, "race": "asian",     "hair_asset": "short04",      "clothes": "male_casualsuit03",  "hair": (0.42, 0.41, 0.40), "wears": (0.72, 0.70, 0.66), "gray": True},
    {"name": "f_young_ca",   "gender": 0.05, "age": 0.30, "race": "caucasian", "hair_asset": "long01",     "clothes": "male_casualsuit05",  "hair": (0.20, 0.13, 0.08), "wears": (0.76, 0.72, 0.80)},
    {"name": "f_mid_ca",     "gender": 0.06, "age": 0.58, "race": "caucasian", "hair_asset": "long01",      "clothes": "female_elegantsuit01", "hair": (0.30, 0.19, 0.11), "wears": (0.80, 0.74, 0.70)},
    {"name": "f_old_ca",     "gender": 0.06, "age": 0.86, "race": "caucasian", "hair_asset": "short02",      "clothes": "male_casualsuit01",  "hair": (0.62, 0.60, 0.58), "wears": (0.70, 0.66, 0.74), "gray": True},
    {"name": "m_young_af",   "gender": 0.95, "age": 0.30, "race": "african",   "hair_asset": "short02",    "clothes": "male_casualsuit05",    "hair": (0.06, 0.05, 0.04), "wears": (0.74, 0.72, 0.80)},
    {"name": "m_young_af_b", "gender": 0.96, "age": 0.26, "race": "african",   "hair_asset": "short04",     "clothes": "male_elegantsuit01",   "hair": (0.05, 0.04, 0.04), "wears": (0.66, 0.70, 0.74)},
    {"name": "m_mid_af",     "gender": 0.95, "age": 0.55, "race": "african",   "hair_asset": "short04",    "clothes": "male_elegantsuit01",   "hair": (0.05, 0.04, 0.04), "wears": (0.80, 0.80, 0.84)},
    {"name": "m_old_af",     "gender": 0.94, "age": 0.86, "race": "african",   "hair_asset": "short01",    "clothes": "male_casualsuit01",    "hair": (0.40, 0.40, 0.39), "wears": (0.72, 0.70, 0.66), "gray": True},
    {"name": "m_young_as",   "gender": 0.95, "age": 0.28, "race": "asian",     "hair_asset": "short02",    "clothes": "male_casualsuit05",    "hair": (0.06, 0.05, 0.05), "wears": (0.72, 0.74, 0.78)},
    {"name": "m_mid_as",     "gender": 0.95, "age": 0.50, "race": "asian",     "hair_asset": "short01",    "clothes": "male_elegantsuit01",   "hair": (0.06, 0.05, 0.05), "wears": (0.80, 0.80, 0.84)},
    {"name": "m_old_as",     "gender": 0.94, "age": 0.86, "race": "asian",     "hair_asset": "short02",    "clothes": "male_worksuit01",      "hair": (0.42, 0.40, 0.39), "wears": (0.72, 0.70, 0.66), "gray": True},
    {"name": "m_young_ca",   "gender": 0.95, "age": 0.27, "race": "caucasian", "hair_asset": "short04",    "clothes": "male_casualsuit01",    "hair": (0.35, 0.24, 0.14), "wears": (0.70, 0.74, 0.70)},
    {"name": "m_mid_ca",     "gender": 0.96, "age": 0.62, "race": "caucasian", "hair_asset": "short01",    "clothes": "male_elegantsuit01",   "hair": (0.14, 0.10, 0.07), "wears": (0.86, 0.86, 0.88)},
    {"name": "m_old_ca",     "gender": 0.95, "age": 0.86, "race": "caucasian", "hair_asset": "short01",    "clothes": "male_casualsuit03",    "hair": (0.55, 0.54, 0.52), "wears": (0.74, 0.72, 0.70), "gray": True},

    # South Asian (sa), Latin American (la), Middle Eastern / North African (me).
    #
    # MakeHuman has three ancestry macros and photographed skins for exactly
    # those three, so these are a MIX of the mesh macros (`mix`) on a
    # photographed skin (`skin`) multiplied through by `tone` — the same
    # baseColorFactor trick the hair uses, so it can only deepen, which is why
    # the source is always the lightest skin. Without them a juror in Mumbai,
    # Mexico City or Cairo got a courtroom cast from another continent.
    {"name": "f_young_sa", "gender": 0.04, "age": 0.30, "race": "southasian", "mix": {"caucasian": 0.6, "african": 0.22, "asian": 0.18}, "skin": "caucasian", "tone": (0.26, 0.19, 0.14), "hair_asset": "long01", "clothes": "female_elegantsuit01", "hair": (0.05, 0.04, 0.04), "wears": (0.86, 0.70, 0.72)},
    {"name": "f_mid_sa",   "gender": 0.05, "age": 0.56, "race": "southasian", "mix": {"caucasian": 0.6, "african": 0.24, "asian": 0.16}, "skin": "caucasian", "tone": (0.25, 0.18, 0.13), "hair_asset": "long01", "clothes": "female_elegantsuit01", "hair": (0.05, 0.04, 0.04), "wears": (0.70, 0.80, 0.76)},
    {"name": "f_old_sa",   "gender": 0.05, "age": 0.85, "race": "southasian", "mix": {"caucasian": 0.6, "african": 0.24, "asian": 0.16}, "skin": "caucasian", "tone": (0.25, 0.18, 0.14), "hair_asset": "short02", "clothes": "female_elegantsuit01", "hair": (0.44, 0.43, 0.42), "wears": (0.80, 0.72, 0.62), "gray": True},
    {"name": "m_young_sa", "gender": 0.95, "age": 0.29, "race": "southasian", "mix": {"caucasian": 0.6, "african": 0.22, "asian": 0.18}, "skin": "caucasian", "tone": (0.25, 0.19, 0.14), "hair_asset": "short02", "clothes": "male_casualsuit05", "hair": (0.05, 0.04, 0.04), "wears": (0.76, 0.76, 0.84)},
    {"name": "m_mid_sa",   "gender": 0.95, "age": 0.54, "race": "southasian", "mix": {"caucasian": 0.6, "african": 0.24, "asian": 0.16}, "skin": "caucasian", "tone": (0.23, 0.17, 0.13), "hair_asset": "short01", "clothes": "male_elegantsuit01", "hair": (0.05, 0.04, 0.04), "wears": (0.82, 0.82, 0.86)},
    {"name": "m_old_sa",   "gender": 0.94, "age": 0.86, "race": "southasian", "mix": {"caucasian": 0.6, "african": 0.24, "asian": 0.16}, "skin": "caucasian", "tone": (0.25, 0.18, 0.14), "hair_asset": "short01", "clothes": "male_casualsuit03", "hair": (0.52, 0.51, 0.50), "wears": (0.76, 0.72, 0.68), "gray": True},
    {"name": "f_young_la", "gender": 0.04, "age": 0.29, "race": "latino", "mix": {"caucasian": 0.64, "asian": 0.2, "african": 0.16}, "skin": "caucasian", "tone": (0.48, 0.37, 0.29), "hair_asset": "long01", "clothes": "female_elegantsuit01", "hair": (0.10, 0.07, 0.05), "wears": (0.84, 0.76, 0.66)},
    {"name": "f_mid_la",   "gender": 0.04, "age": 0.57, "race": "latino", "mix": {"caucasian": 0.6, "asian": 0.24, "african": 0.16}, "skin": "caucasian", "tone": (0.46, 0.36, 0.26), "hair_asset": "long01", "clothes": "female_elegantsuit01", "hair": (0.08, 0.06, 0.05), "wears": (0.70, 0.74, 0.86)},
    {"name": "f_old_la",   "gender": 0.05, "age": 0.85, "race": "latino", "mix": {"caucasian": 0.6, "asian": 0.24, "african": 0.16}, "skin": "caucasian", "tone": (0.46, 0.36, 0.26), "hair_asset": "long01", "clothes": "female_elegantsuit01", "hair": (0.50, 0.49, 0.48), "wears": (0.74, 0.66, 0.72), "gray": True},
    {"name": "m_young_la", "gender": 0.95, "age": 0.27, "race": "latino", "mix": {"caucasian": 0.62, "asian": 0.22, "african": 0.16}, "skin": "caucasian", "tone": (0.47, 0.36, 0.27), "hair_asset": "short04", "clothes": "male_casualsuit01", "hair": (0.08, 0.06, 0.05), "wears": (0.72, 0.78, 0.72)},
    {"name": "m_mid_la",   "gender": 0.95, "age": 0.55, "race": "latino", "mix": {"caucasian": 0.6, "asian": 0.24, "african": 0.16}, "skin": "caucasian", "tone": (0.45, 0.34, 0.26), "hair_asset": "short02", "clothes": "male_elegantsuit01", "hair": (0.07, 0.05, 0.04), "wears": (0.84, 0.84, 0.88)},
    {"name": "m_old_la",   "gender": 0.94, "age": 0.86, "race": "latino", "mix": {"caucasian": 0.6, "asian": 0.24, "african": 0.16}, "skin": "caucasian", "tone": (0.46, 0.36, 0.26), "hair_asset": "short01", "clothes": "male_worksuit01", "hair": (0.56, 0.55, 0.54), "wears": (0.74, 0.72, 0.68), "gray": True},
    {"name": "f_young_me", "gender": 0.04, "age": 0.30, "race": "mena", "mix": {"caucasian": 0.76, "african": 0.14, "asian": 0.10}, "skin": "caucasian", "tone": (0.52, 0.41, 0.31), "hair_asset": "long01", "clothes": "female_elegantsuit01", "hair": (0.06, 0.05, 0.04), "wears": (0.72, 0.70, 0.82)},
    {"name": "f_mid_me",   "gender": 0.05, "age": 0.57, "race": "mena", "mix": {"caucasian": 0.76, "african": 0.14, "asian": 0.10}, "skin": "caucasian", "tone": (0.50, 0.39, 0.29), "hair_asset": "long01", "clothes": "female_elegantsuit01", "hair": (0.06, 0.05, 0.04), "wears": (0.80, 0.76, 0.66)},
    {"name": "f_old_me",   "gender": 0.05, "age": 0.86, "race": "mena", "mix": {"caucasian": 0.76, "african": 0.14, "asian": 0.10}, "skin": "caucasian", "tone": (0.50, 0.40, 0.30), "hair_asset": "short02", "clothes": "female_elegantsuit01", "hair": (0.46, 0.45, 0.44), "wears": (0.66, 0.70, 0.76), "gray": True},
    {"name": "m_young_me", "gender": 0.95, "age": 0.28, "race": "mena", "mix": {"caucasian": 0.76, "african": 0.14, "asian": 0.10}, "skin": "caucasian", "tone": (0.50, 0.40, 0.30), "hair_asset": "short02", "clothes": "male_casualsuit05", "hair": (0.05, 0.04, 0.04), "wears": (0.80, 0.74, 0.70)},
    {"name": "m_mid_me",   "gender": 0.96, "age": 0.56, "race": "mena", "mix": {"caucasian": 0.76, "african": 0.14, "asian": 0.10}, "skin": "caucasian", "tone": (0.49, 0.38, 0.29), "hair_asset": "short04", "clothes": "male_elegantsuit01", "hair": (0.05, 0.04, 0.04), "wears": (0.78, 0.80, 0.86)},
    {"name": "m_old_me",   "gender": 0.95, "age": 0.86, "race": "mena", "mix": {"caucasian": 0.76, "african": 0.14, "asian": 0.10}, "skin": "caucasian", "tone": (0.50, 0.39, 0.29), "hair_asset": "short01", "clothes": "male_casualsuit01", "hair": (0.58, 0.57, 0.56), "wears": (0.72, 0.70, 0.74), "gray": True},
]


def build_human(spec: dict, seed: int):
    """One body, from an archetype, deterministically."""
    svc = services()
    macro = svc.TargetService.get_default_macro_info_dict()
    macro["gender"] = spec["gender"]
    macro["age"] = spec["age"]
    rng = random.Random(seed)
    # Ancestry is a three-way mix. Pinning one to 1.0 makes a caricature, so the
    # named ancestry is dominant and the rest is a real mixture.
    if "mix" in spec:
        # A named blend (see the sa/la/me archetypes), jittered a little.
        for key in ("african", "asian", "caucasian"):
            macro["race"][key] = spec["mix"].get(key, 0.0) + rng.random() * 0.04
    else:
        for key in ("african", "asian", "caucasian"):
            macro["race"][key] = 0.08 + rng.random() * 0.10
        macro["race"][spec["race"]] = 1.0
    total = sum(macro["race"].values())
    for key in macro["race"]:
        macro["race"][key] /= total
    macro["muscle"] = 0.35 + rng.random() * 0.3
    macro["weight"] = 0.4 + rng.random() * 0.25
    macro["proportions"] = 0.4 + rng.random() * 0.2
    # Only meaningful on a feminine body, and MPFB wants them set either way.
    macro["cupsize"] = 0.35 + rng.random() * 0.25
    macro["firmness"] = 0.45 + rng.random() * 0.2

    human = svc.HumanService.create_human(macro_detail_dict=macro)
    bpy.context.view_layer.objects.active = human
    return human


# ------------------------------------------------------------------ geometry --

def evaluated_points(obj):
    """
    World-space vertices AFTER the morphs, with EVERY vertex-dropping modifier
    disabled.

    Three traps, and the third one shattered a model.

      1. `obj.data.vertices` is the BASE mesh. MPFB applies every macro as a
         shape key, so the un-evaluated mesh is a different, shorter person.

      2. The "Hide helpers" MASK DROPS vertices, so indices taken from the base
         mesh do not address the evaluated one.

      3. There is not always exactly one mask. Fitting a MakeHuman garment adds
         a SECOND — the delete group that hides the body under the clothes —
         and disabling only the first left it active. The evaluated mesh then
         had fewer vertices than the base, every index after the first hidden
         one referred to the wrong vertex, and flatten_shape_keys wrote those
         positions back into the mesh. The result was a body in shards, and
         nothing anywhere raised.

    Hence: disable them all, and the caller checks the count.
    """
    masks = [m for m in obj.modifiers if m.type == "MASK"]
    previous = [m.show_viewport for m in masks]
    for mask in masks:
        mask.show_viewport = False

    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = obj.evaluated_get(depsgraph).to_mesh()
    matrix = obj.matrix_world
    points = [matrix @ v.co for v in mesh.vertices]
    obj.evaluated_get(depsgraph).to_mesh_clear()

    for mask, was in zip(masks, previous):
        mask.show_viewport = was
    return points


def eye_height(human) -> float:
    """
    The Z of the eyes, found rather than assumed.

    Everything else in this file is positioned relative to it — the crop, the
    camera, the framing — because every archetype is a different height and a
    hardcoded metre value crops one of them through the jaw.
    """
    bm = bmesh.new()
    bm.from_mesh(human.data)
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
        loops.append((len(indices), centre, indices))
    bm.free()

    sockets = sorted([l for l in loops if l[0] == 32], key=lambda l: -l[1].z)[:2]
    if len(sockets) < 2:
        raise RuntimeError("could not find the eye sockets — has the base mesh changed?")
    points = evaluated_points(human)
    zs = [points[i].z for _, _, indices in sockets for i in indices]
    return sum(zs) / len(zs)


def masked_out(obj) -> set[int]:
    """
    The vertices every MASK modifier on this object is hiding.

    Blender keeps what is IN the modifier's vertex group, or everything else
    when the group is inverted. Reproducing that here is what turns a viewport
    effect into geometry — see crop_to_upper_body for why that matters.
    """
    hidden: set[int] = set()
    for modifier in obj.modifiers:
        if modifier.type != "MASK" or modifier.mode != "VERTEX_GROUP":
            continue
        name = modifier.vertex_group
        if not name or name not in obj.vertex_groups:
            continue
        index = obj.vertex_groups[name].index
        invert = modifier.invert_vertex_group
        for vertex in obj.data.vertices:
            inside = any(g.group == index and g.weight > 0 for g in vertex.groups)
            if inside == invert:
                hidden.add(vertex.index)
    return hidden


def crop_to_upper_body(obj, floor_z: float, keep_group: str | None = None):
    """
    Keep what the camera can see, delete the rest.

    Two kinds of vertex go here.

    THE LEGS. The courtroom frames the accused from the chest up, so everything
    below is pure cost: vertices in the base mesh, deltas in every one of the
    five morph targets, and bytes in a file a phone downloads.

    THE HELPERS. This is the one that actually broke the model. MakeHuman's
    base mesh carries helper geometry — the loose shells clothes are fitted
    against — plus a thousand vertices of joint cubes, and MPFB hides them with
    a MASK modifier rather than deleting them. glTF is exported without
    applying modifiers (applying one would destroy the shape keys), so all
    5,778 of them shipped, and the first model to reach the browser was a face
    behind a set of flat beige panels. It looked like a hair problem for a
    while. It was a mask that only ever existed in the viewport.

    THE BODY UNDER THE CLOTHES. Every MakeHuman garment ships a delete group:
    the body vertices it covers, which have to go or they push through the
    cloth. MPFB honours it with a MASK modifier, and a MASK modifier is a
    viewport effect — glTF is exported without applying modifiers, so on screen
    the suit was correct in Blender and wore a torn patch of bare chest through
    its own lapel in the app. Same shape of bug as the helpers, one layer down,
    and the same fix: read what the mask says and actually delete it.

    Both happen HERE, after every asset is attached, because a MakeHuman
    garment is fitted by base-mesh vertex index — remove a vertex earlier and
    the collar is holding on to somebody else's shoulder.
    """
    group_index = None
    if keep_group and keep_group in obj.vertex_groups:
        group_index = obj.vertex_groups[keep_group].index

    doomed_indices = set(masked_out(obj))
    # A margin below the floor: the plane cut below takes everything between
    # here and the floor itself, and it needs faces to cut through.
    reach = floor_z - 0.06
    for vertex in obj.data.vertices:
        if (obj.matrix_world @ vertex.co).z < reach:
            doomed_indices.add(vertex.index)
        elif group_index is not None and not any(g.group == group_index for g in vertex.groups):
            doomed_indices.add(vertex.index)

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    doomed = [v for v in bm.verts if v.index in doomed_indices]
    bmesh.ops.delete(bm, geom=doomed, context="VERTS")

    # And now cut the bottom STRAIGHT.
    #
    # Deleting whole vertices leaves the edge wherever the vertices happened to
    # be, which on a body mesh is a zigzag two centimetres deep — on screen, a
    # row of shark's teeth across the chest that no amount of scrim hid. The
    # plane cut adds the vertices needed to end the mesh exactly on the floor,
    # and bmesh interpolates the shape keys onto them, so the morphs survive.
    bm.verts.ensure_lookup_table()
    if bm.verts:
        local = obj.matrix_world.inverted() @ Vector((0.0, 0.0, floor_z))
        bmesh.ops.bisect_plane(
            bm,
            geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
            plane_co=local,
            plane_no=(0.0, 0.0, 1.0),
            clear_inner=True,
        )

    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


# ------------------------------------------------------------- body language --
#
# A face alone is not a reaction. A man who has just been sent down puts his
# head down and his hands up; a man who has got away with it lifts his chin and
# lets his shoulders go. The camera frames head to chest, so shoulders, arms and
# hands are all in shot and all worth using.
#
# There is no armature here on purpose. Rigging the body, weighting it and
# exporting skinned animation is a great deal of machinery for gestures that
# never exceed thirty degrees — and glTF morph targets interpolate linearly, so
# a small rotation baked as a target is indistinguishable from the real thing
# while a large one would visibly shorten the limb through the arc. Everything
# below is kept inside that budget deliberately.

# WHY THE ELBOW BARELY MOVES.
#
# It used to: twenty-four degrees for `broken`, thirty for `stricken`, on the
# reasoning that a man who has just been sent down brings his hands up. Two
# things killed it. The visible one is that it tore — past about eight degrees
# a thin skin-coloured ribbon stood up out of each fist, because the sleeve
# takes its motion from the four body vertices nearest it and those straddle
# the wrist, where the rotation stops being uniform. The decisive one is that
# it was invisible anyway: with the arms hanging, the hands sit at the waist,
# and both cameras in this game frame the head and chest. The flex was
# animating something below the bottom of the screen and putting an artefact
# above it.
#
# So the arms still react — the shoulders lift, hunch and turn, which is in
# frame and is most of what reads as body language at this distance — and the
# elbow keeps only what it can hold without tearing. `pose_offsets` still
# implements the flex properly; the numbers here are what it is safe to ask
# for while the sleeve follows by nearest-neighbour.
POSES = {
    # ------------------------------------------------------------- AFTER ----
    # The verdict has landed. These are the only shapes in the game where the
    # whole body is allowed to do something, because they are the only moment
    # the player is looking at a person rather than reading a file.
    #
    # `raise_` and `elbow` BOTH turn about the same axis and COMPOUND: the
    # hand takes the sum. Thirty-four and eighty-six put both hands above his
    # head, reaching backwards. What a person does is fold the elbow and leave
    # the upper arm nearly where it is, so the budget lives almost entirely in
    # the elbow.
    #
    #             head pitch/roll   shoulder lift   arm fwd   elbow    spread
    #
    # Head in his hands. The hands come most of the way up and the head comes
    # down to meet them, which is what people actually do — the arms do about
    # two thirds of the distance and the neck does the rest. The elbow stops
    # around sixty because a JACKET has to fold with it: past that the sleeve
    # crushes at the crease and shows its own inside, and no amount of
    # feathering fixes a tube folded double. A person can bend further than
    # their clothes can be made to.
    "broken":     dict(pitch=19.0,  roll=2.0,  lift=0.022, raise_=12.0, elbow=64.0, spread=-9.0),
    # Both hands up, open, in front of the chest. Warding it off.
    "stricken":   dict(pitch=-6.0,  roll=0.0,  lift=0.018, raise_=9.0,  elbow=56.0, spread=14.0),
    # He got away with it and is trying not to show it. Almost nothing moves;
    # that is the tell.
    "smirk":      dict(pitch=-8.0,  roll=-3.0, lift=-0.007, raise_=2.0, elbow=8.0,  spread=-4.0),
    # One hand to the chest, the breath going out of him.
    "relief":     dict(pitch=8.0,   roll=5.0,  lift=-0.016, raise_=5.0,  elbow=36.0, spread=3.0),
    # Nothing. The point of it.
    "unreadable": dict(pitch=0.0,   roll=0.0,  lift=0.0,   raise_=0.0,  elbow=0.0,  spread=0.0),

    # ------------------------------------------------------------ DURING ----
    # The trial. Far smaller than the verdict — the accused is standing still
    # being looked at, not reacting to a sentence — but not nothing: a body
    # holding perfectly still through two minutes of being read is its own
    # kind of wrong, and the demeanour axis is measured off what this does.
    "tense":      dict(pitch=2.0,   roll=0.0,  lift=0.006, raise_=3.0,  elbow=12.0, spread=-3.0),
    "pleading":   dict(pitch=-2.0,  roll=1.5,  lift=0.003, raise_=3.0,  elbow=22.0, spread=6.0),
    "defiant":    dict(pitch=-6.0,  roll=0.0,  lift=-0.005, raise_=0.0, elbow=4.0,  spread=-6.0),
    "ashamed":    dict(pitch=8.0,   roll=2.5,  lift=0.007, raise_=2.0,  elbow=16.0, spread=-5.0),
    "startled":   dict(pitch=-2.0,  roll=0.0,  lift=0.010, raise_=3.0,  elbow=18.0, spread=4.0),

    # -------------------------------------------------------- THE CHANNEL ---
    # `slump` is dialled rather than picked — the client drives it from the
    # measured demeanour axis — so it is the posture itself and no gesture.
    "slump":      dict(pitch=9.0,   roll=0.0,  lift=0.014, raise_=0.0,  elbow=0.0,  spread=-5.0),
}


def joint_centres(human, rest):
    """
    Where the joints are, read off the mesh.

    The MakeHuman base mesh carries a `joint-*` vertex group per joint — small
    cubes of geometry that exist to mark a position. They are stripped before
    export (see crop_to_upper_body), but while they are here they are an exact,
    per-archetype skeleton for free. Measuring beats assuming: every archetype
    is a different height and a hardcoded shoulder position bends one of them
    through the middle of the ribcage.
    """
    wanted = {g.index: g.name for g in human.vertex_groups if g.name.startswith("joint-")}
    sums: dict[str, Vector] = {}
    counts: dict[str, int] = {}
    for vertex in human.data.vertices:
        for group in vertex.groups:
            name = wanted.get(group.group)
            if name is None:
                continue
            sums[name] = sums.get(name, Vector()) + rest[vertex.index]
            counts[name] = counts.get(name, 0) + 1
    return {name: total / counts[name] for name, total in sums.items()}


def _turn(point, pivot, axis, degrees):
    from mathutils import Matrix
    return pivot + (Matrix.Rotation(math.radians(degrees), 4, axis) @ (point - pivot))


# How much surface the arm's rotation fades out over, once past the shoulder.
ROOT_FADE = 0.09


def geodesic_field(human, rest, seed_point, radius=0.035):
    """
    Distance from a seed, measured ALONG THE SURFACE rather than through space.

    THIS IS WHAT SEPARATES AN ARM FROM A TORSO. Straight-line distance cannot:
    with the arms hanging, the side of a jacket is five centimetres from the
    wrist bone, so every distance-based test that caught the sleeve also caught
    the hem — and the whole lower half of the jacket ballooned outward every
    time the hands came up. Along the surface the two are nowhere near each
    other, because the only way from a hand to a hip is up the arm, across the
    shoulder and back down: the arm is joined to the body at exactly one place,
    and that is the fact worth using.

    Vertices on an island of their own — the joint cubes, the fitting helpers —
    are unreachable, and take the value of the nearest vertex that is not.
    """
    import heapq
    from mathutils.kdtree import KDTree

    neighbours: list[list[int]] = [[] for _ in rest]
    for edge in human.data.edges:
        a, b = edge.vertices
        neighbours[a].append(b)
        neighbours[b].append(a)

    seeds = [i for i, point in enumerate(rest) if (point - seed_point).length <= radius]
    if not seeds:
        seeds = [min(range(len(rest)), key=lambda i: (rest[i] - seed_point).length)]

    far = float("inf")
    distance = [far] * len(rest)
    queue = []
    for index in seeds:
        distance[index] = 0.0
        heapq.heappush(queue, (0.0, index))
    while queue:
        so_far, index = heapq.heappop(queue)
        if so_far > distance[index]:
            continue
        here = rest[index]
        for other in neighbours[index]:
            step = so_far + (rest[other] - here).length
            if step < distance[other]:
                distance[other] = step
                heapq.heappush(queue, (step, other))

    reached = [i for i, value in enumerate(distance) if value < far]
    if reached and len(reached) != len(rest):
        tree = KDTree(len(reached))
        for i in reached:
            tree.insert(rest[i], i)
        tree.balance()
        for i, value in enumerate(distance):
            if value >= far:
                _, nearest, _ = tree.find(rest[i])
                distance[i] = distance[nearest]
    return distance


def pose_transform(human, rest, pose: dict):
    """
    The body's reaction, as a FUNCTION of a point rather than a table of
    vertex deltas.

    WHY A FUNCTION. It used to return deltas keyed by body vertex index, and
    everything riding on the body — the suit, the hair — inferred its own
    motion from them through the KD-tree in follow_the_skin: each asset vertex
    took the weighted average of the four body vertices nearest it. That is
    fine for an expression, where nothing moves more than a few millimetres.
    It falls apart completely on a gesture. A sleeve vertex near the armpit has
    neighbours on the torso, which does not move, and on the arm, which moves
    thirty centimetres; averaging them puts it nowhere, and the jacket came
    apart into a cone of shards over both shoulders every time the hands came
    up. It read as "morph targets cannot hold a gesture" for a long time.
    They can. The inference was the problem.

    An expression HAS to be inferred, because it comes out of MPFB as a shape
    key that only exists on the body. A pose does not: it is arithmetic on a
    position, so the sleeve can simply be put through the same arithmetic as
    the arm inside it and land exactly where the arm does.

    Returns None when the pose is empty — a blink does not move the shoulders.
    """
    pose = {k: float(pose.get(k, 0.0))
            for k in ("pitch", "roll", "lift", "elbow", "spread", "raise_")}
    if not any(abs(v) > 1e-6 for v in pose.values()):
        return None

    joints = joint_centres(human, rest)
    needed = ("joint-neck", "joint-l-shoulder", "joint-r-shoulder",
              "joint-l-elbow", "joint-r-elbow")
    if any(name not in joints for name in needed):
        return None

    neck = joints["joint-neck"]

    arms = []
    for side, sign in (("l", 1.0), ("r", -1.0)):
        shoulder = joints[f"joint-{side}-shoulder"]
        elbow = joints[f"joint-{side}-elbow"]
        upper = elbow - shoulder
        chain = arm_chain(joints, side)
        if upper.length < 1e-6 or not chain:
            continue

        # Surface distance from the fingertips. Everything on this arm is
        # nearer to them than the shoulder is; everything on the body is
        # further, because the only path there goes over the shoulder.
        surface = geodesic_field(human, rest, chain[-1])
        at_shoulder = surface[min(range(len(rest)), key=lambda i: (rest[i] - shoulder).length)]
        at_elbow = surface[min(range(len(rest)), key=lambda i: (rest[i] - elbow).length)]

        # WHERE THE ELBOW ENDS UP, under the shoulder's full rotation. The
        # forearm has to turn about the joint's NEW position; pivoting on the
        # one it left is fine while the shoulder barely moves, and it is what
        # made a large elbow impossible — the vertices had been carried by the
        # shoulder and the pivot had not.
        elbow_now = elbow
        if abs(pose["spread"]) > 0.01:
            elbow_now = _turn(elbow_now, shoulder, "Y", pose["spread"] * sign)
        if abs(pose["raise_"]) > 0.01:
            elbow_now = _turn(elbow_now, shoulder, "X", -pose["raise_"])
        arms.append((sign, shoulder, elbow_now, surface, at_shoulder, at_elbow))

    def weigh(index, point):
        """
        How much of each rotation a point takes. SCALARS, deliberately.

        These are what the clothes inherit — see bake_reactions. Distance to
        the arm bone cannot tell a jacket's side panel from its sleeve, because
        with the arm hanging the two are the same distance from the bone: the
        hem took a third of the elbow's rotation and the whole lower half of
        the jacket ballooned. The body knows the difference, so the asset takes
        the body's answer, interpolated. Interpolating a SCALAR is safe where
        interpolating a displacement is not — it cannot tear anything, it can
        only be slightly soft at a seam.
        """
        head = 0.0
        if abs(pose["pitch"]) > 0.01 or abs(pose["roll"]) > 0.01:
            above = point.z - neck.z
            if above > 0:
                # Feather over the first 6cm so the neck bends, not hinges.
                head = min(1.0, above / 0.06)

        limbs = []
        for _sign, _shoulder, _elbow_now, surface, at_shoulder, at_elbow in arms:
            here = surface[index]
            # One at the fingertips, fading to nothing as the surface crosses
            # the shoulder into the body.
            weight = max(0.0, min(1.0, (at_shoulder - here) / ROOT_FADE))
            # And how much of the ELBOW's rotation: one below the elbow, zero
            # above it, feathered across the joint. Monotonic in surface
            # distance, so it stays one through the wrist and the hand and
            # there is no step for a sleeve to straddle.
            fore = (at_elbow - here) / (2.0 * FOREARM_WINDOW) + 0.5
            fore = max(0.0, min(1.0, fore)) * weight
            limbs.append((weight, fore))
        return (head, limbs)

    def apply(point, weights):
        head, limbs = weights
        moved = point

        if head > 0.0:
            moved = _turn(moved, neck, "X", pose["pitch"] * head)
            moved = _turn(moved, neck, "Y", pose["roll"] * head)

        for (sign, shoulder, elbow_now, _s, _sh, _el), (weight, fore) in zip(arms, limbs):
            if weight <= 0.0:
                continue
            if abs(pose["lift"]) > 1e-6:
                moved = moved + Vector((0.0, 0.0, pose["lift"] * weight))
            if abs(pose["spread"]) > 0.01:
                moved = _turn(moved, shoulder, "Y", pose["spread"] * weight * sign)
            if abs(pose["raise_"]) > 0.01:
                # Negative about X swings the whole arm FORWARD, out of the
                # line of the body. It COMPOUNDS with the elbow — both turn on
                # the same axis and the hand takes the sum — so thirty degrees
                # here on top of eighty at the elbow put both hands above his
                # head, reaching backwards. Almost all of the budget belongs to
                # the elbow, which is the joint a person actually folds.
                moved = _turn(moved, shoulder, "X", -pose["raise_"] * weight)
            if abs(pose["elbow"]) > 0.01:
                moved = _turn(moved, elbow_now, "X", -pose["elbow"] * fore)

        return moved

    return weigh, apply


def blend_weights(body_weights, sample):
    """One asset vertex's share of the body's pose weights, from its neighbours."""
    head = 0.0
    limbs = None
    for index, share in sample:
        their_head, their_limbs = body_weights[index]
        head += their_head * share
        if limbs is None:
            limbs = [[0.0, 0.0] for _ in their_limbs]
        for slot, (weight, fore) in zip(limbs, their_limbs):
            slot[0] += weight * share
            slot[1] += fore * share
    return (head, [tuple(slot) for slot in (limbs or [])])


def average_weights(rows):
    """The mean of a set of blended weights — for anything that must stay rigid."""
    if not rows:
        return (0.0, [])
    head = sum(row[0] for row in rows) / len(rows)
    limbs = [[0.0, 0.0] for _ in rows[0][1]]
    for row in rows:
        for slot, (weight, fore) in zip(limbs, row[1]):
            slot[0] += weight / len(rows)
            slot[1] += fore / len(rows)
    return (head, [tuple(slot) for slot in limbs])


def follow_the_skin(human, rest, attached):
    """
    Work out, once, how everything on the body is attached to it.

    MakeHuman fits an asset by mapping its vertices onto BASE-MESH vertex
    indices, and `fit_clothes_to_human` re-reads that base mesh — not the
    evaluated one. Refitting after an expression therefore maps the brows onto
    an undeformed body while the face is somewhere else, and the first attempt
    at this put the eyebrows on the bridge of the nose. Writing the deformed
    positions into the base mesh for the duration of the fit did not help
    either: the fitter keeps state of its own, and it leaves a
    `temporary_fitting_key` shape key behind on every call.

    So the fitter is not used here at all. Each asset vertex takes the weighted
    displacement of the body vertices nearest to it at rest — which is what
    "fitted to the skin" means in the first place, and needs nothing but a
    KD-tree. A brow above a raised brow ridge goes up with it; hair over a
    tilting head tilts; a sleeve follows the arm inside it.
    """
    from mathutils.kdtree import KDTree

    tree = KDTree(len(rest))
    for index, point in enumerate(rest):
        tree.insert(point, index)
    tree.balance()

    NEIGHBOURS = 4
    mapped = []
    for obj in attached:
        # An eyeball that follows the skin per-vertex is an eyeball that gets
        # squashed into its socket, and it is the one thing on a face that has
        # to keep its shape. Eyes move rigidly; everything else deforms.
        rigid = "high-poly" in obj.name.lower() or obj.name.lower().endswith("eyes")
        weights = []
        for vertex in obj.data.vertices:
            found = tree.find_n(obj.matrix_world @ vertex.co, NEIGHBOURS)
            # 1/(d+e): a vertex sitting on the skin takes almost all of its
            # motion from the vertex it is sitting on.
            total = sum(1.0 / (d + 1e-4) for _, _, d in found)
            weights.append([(i, (1.0 / (d + 1e-4)) / total) for _, i, d in found])
        mapped.append((obj, weights, rigid))
    return mapped


def apply_follow(mapped, body_delta, name):
    """Give every attached mesh a shape key of `name`, from the body's motion."""
    from mathutils import Vector as V

    for obj, weights, rigid in mapped:
        if obj.data.shape_keys is None:
            obj.shape_key_add(name="Basis", from_mix=False)
        key = obj.shape_key_add(name=name, from_mix=False)
        key.value = 0.0

        if rigid:
            total = V()
            for sample in weights:
                for index, weight in sample:
                    total += body_delta.get(index, V()) * weight
            shift = total / max(1, len(weights))
            for i in range(len(obj.data.vertices)):
                key.data[i].co = key.data[i].co + shift
            continue

        for i, sample in enumerate(weights):
            delta = V()
            for index, weight in sample:
                delta += body_delta.get(index, V()) * weight
            if delta.length > 1e-7:
                key.data[i].co = key.data[i].co + delta


def all_shapes() -> dict[str, dict]:
    """
    Every named shape the model ships, in one table.

    Three kinds, and the client treats them differently: the verdict reactions
    are picked, the trial expressions are crossfaded between, and the channels
    are dialled from 0 to 1. To the exporter they are all the same thing — a
    set of ARKit unit weights and an optional body pose — so they are baked by
    one loop and the distinction lives in the names.
    """
    combined: dict[str, dict] = {}
    combined.update(REACTIONS)
    combined.update(TRIAL)
    combined.update(CHANNELS)
    return combined


# ------------------------------------------------------------- the rest pose --
#
# MakeHuman builds everyone in a T-pose: arms straight out from the shoulders,
# horizontal, palms down. That is the right rest pose for FITTING clothes and
# the wrong one for standing in a dock — the first full-body render of the
# finished model was a man in a suit with his arms held out like a scarecrow,
# and because the camera frames head-and-chest, nothing in the game had shown
# it. What the game did show was the consequence: the crop plane ran through
# both forearms, so the arms ended in two flat stumps at the edge of frame.
#
# The arms come down HERE, into the base mesh, and not as a morph target. A
# morph interpolates linearly along a chord, so a rotation this large would
# visibly shorten the limb through the middle of the arc — which is exactly why
# POSES keeps its rotations under thirty degrees. Geometry has no such problem:
# once the arms are down, they are simply down, and the reaction morphs are
# small deltas on top of a pose that already reads as a person.
#
# It also makes POSES mean what it says. `spread` rotates the arm about the
# axis running through the shoulders; from a T-pose that swung the arm up and
# down, and from a rest pose it swings it away from the body, which is what the
# word means and what the numbers were chosen for.

# How far below horizontal each segment should end up. The forearm hangs
# closer to vertical than the upper arm, which is what makes the elbow read as
# an elbow and not a bend in a hose. Neither is zero: arms rest a little away
# from the ribs, and a perfectly vertical arm reads as attention.
ARM_HANG = 78.0
FOREARM_HANG = 87.0
# A forearm is never quite straight. Small, forward, so the hands sit in front
# of the thighs rather than pressed flat against them.
ARM_ELBOW = 7.0
# And the fingers curl. MakeHuman models the hand flat with the fingers
# splayed, which is a fine pose for fitting a glove and reads, on a man waiting
# to be sentenced, as a conjuror about to produce something. A relaxed hand is
# never straight: each joint gives a little, and the further down the finger
# the more it gives. One rotation per phalanx, about the knuckle's own axis.
FINGER_CURL = 16.0
# A finger is about this thick. Vertices further than this from the bone
# belong to another finger or to the palm.
FINGER_RADIUS = 0.011
# Feathered over this much of each segment, by ANGLE rather than by position —
# scaling the position collapses the deltoid, scaling the angle bends it.
SHOULDER_FEATHER = 0.11
# The elbow's correction is the BIG one — the T-pose upper arm already droops
# most of the way, so the shoulder needs about twenty-five degrees and the
# forearm needs forty. Bending forty degrees over seven centimetres wrung the
# sleeve into a fan of loose triangles. It is spread over a hand's length now.
ELBOW_FEATHER = 0.15
# Which way the face looks, and therefore what "in front of" means. Used to
# decide how far the wrist has to turn for the palm to face the thigh.
FORWARD = Vector((0.0, -1.0, 0.0))
# How thick an arm is, and how far past that the pull fades to nothing.
#
# THIS IS THE ONE THAT TORE THE SLEEVE, TWICE. Selecting the arm began as a
# hard test — everything more than two centimetres inboard of the shoulder is
# chest, keep it still — and a hard test is a cliff: a chest vertex a finger's
# width inboard took none of the rotation while its neighbour a finger's width
# outboard took nearly all of it. The sleeve averages the motion of the four
# body vertices nearest it, straddled that cliff, and came apart into a fan of
# loose triangles across both shoulders.
#
# Softening the cliff fixed the T-pose and broke the reactions, because the
# test was measuring SIDEWAYS distance — which says "arm" only while the arms
# stick out sideways. Once they hang, the whole arm is directly below the
# shoulder, every vertex on it scored nearly zero, and the reaction poses tore
# the sleeves open along the forearm instead.
#
# So the question is asked properly now: how far is this vertex from the arm?
# Distance to the bone chain works in any pose, which is the point — the rest
# pose is measured in a T-pose and the reactions are measured hanging, and they
# have to agree or they crease exactly where they differ.
# How far either side of the elbow the forearm's rotation is feathered in.
#
# Measured along the SURFACE, like everything else about the arm.
#
# There are two failures either side of the right answer. Too wide and the
# whole forearm sits inside the band, where blending two rotations by blending
# the POSITIONS they produce collapses it — the classic candy-wrapper pinch —
# and the arm comes out as a strip. Too narrow and the crease is sharp enough
# to shred the sleeve over it. Four and a half centimetres of surface is about
# what an elbow actually creases over.
FOREARM_WINDOW = 0.045
ARM_REACH = 0.085
ARM_FADE = 0.05


def arm_chain(joints, side):
    """
    The bone chain of one arm, shoulder to fingertip.

    IT HAS TO REACH THE FINGERS. Ending it at the wrist makes the hand
    measure as something hanging NEAR the arm rather than part of it, so the
    palm took the full rotation and the fingertips — a hand's length past the
    end of the chain — took a fraction of it. Every reaction pulled both hands
    out into a set of claws three times the width of the body.
    """
    chain = [joints.get(f"joint-{side}-shoulder"), joints.get(f"joint-{side}-elbow")]
    if any(point is None for point in chain):
        return []
    for name in (f"joint-{side}-hand", f"joint-{side}-finger-3-1", f"joint-{side}-finger-3-4"):
        point = joints.get(name)
        if point is not None:
            chain.append(point)
    return chain


def _to_chain(point, chain):
    """Distance along a polyline to the nearest point on it, and how far off."""
    best_along, best_radial = 0.0, float("inf")
    travelled = 0.0
    for a, b in zip(chain, chain[1:]):
        segment = b - a
        length = segment.length
        if length < 1e-6:
            continue
        t = max(0.0, min(1.0, (point - a).dot(segment) / (length * length)))
        radial = (point - (a + segment * t)).length
        if radial < best_radial:
            best_along, best_radial = travelled + t * length, radial
        travelled += length
    return best_along, best_radial


def in_hand(point, chain) -> bool:
    """
    Is this vertex part of the hand?

    A HAND IS RIGID. It swings with the forearm rather than deforming along
    it, and every attempt to let a falloff run through it came back as spikes:
    weighting per-vertex drew the thumb out into a point, and feathering the
    elbow bend by distance stood one finger up out of each fist like a ribbon.
    Both got worse the larger the rotation, which is how they were traced back
    here from the reactions that bend the elbow most.

    Measured from the WRIST rather than along the bone chain, because the chain
    runs down the middle finger and the thumb's nearest point on it is back up
    the forearm. Generous, too: catching a little of the forearm costs nothing,
    since near the wrist it is at full weight anyway.
    """
    if len(chain) < 4:
        return False
    wrist = chain[2]
    return (point - wrist).length <= (chain[-1] - wrist).length + 0.05


def arm_weight(point, chain, feather) -> float:
    """
    How much of an arm rotation this vertex takes: 0 on the chest, 1 on the arm.

    Two falloffs multiplied — ALONG the bone, so a rotation starts at the joint
    rather than at the ribs, and ACROSS it, so the chest between the two
    shoulders is never dragged after either of them.
    """
    along, radial = _to_chain(point, chain)
    if along <= 0.0:
        return 0.0

    # A HAND IS RIGID. Past the wrist every vertex takes the whole rotation,
    # because a hand swings with the forearm rather than deforming along it.
    # Letting the falloff run through it meant the middle finger, which the
    # chain runs down, took slightly more than the thumb, which does not —
    # and the thumb was drawn out into a spike while the palm flattened into
    # a blade. Nothing about that is subtle at any size.
    if in_hand(point, chain):
        return 1.0

    across = (ARM_REACH + ARM_FADE - radial) / ARM_FADE
    if across <= 0.0:
        return 0.0
    return min(1.0, along / feather) * min(1.0, across)


def _drop(direction) -> float:
    """How far below horizontal a direction points, in degrees."""
    return math.degrees(math.asin(max(-1.0, min(1.0, -direction.normalized().z))))


def _twist_about(axis, start, target) -> float:
    """
    The signed rotation about `axis` that takes `start` onto `target`.

    Both are flattened onto the plane the axis is normal to first, because only
    their component around the axis can be changed by turning about it.
    """
    axis = axis.normalized()
    a = start - axis * start.dot(axis)
    b = target - axis * target.dot(axis)
    if a.length < 1e-6 or b.length < 1e-6:
        return 0.0
    a.normalize()
    b.normalize()
    return math.degrees(math.atan2(axis.dot(a.cross(b)), max(-1.0, min(1.0, a.dot(b)))))


def _turn_about(point, pivot, axis, degrees_):
    from mathutils import Matrix
    return pivot + (Matrix.Rotation(math.radians(degrees_), 4, axis.normalized()) @ (point - pivot))


def crop_floor(human, eyes_z: float, chest: float) -> float:
    """
    Where to cut the body, measured off the hands.

    Low enough that no hand is cut through, and no lower: every centimetre
    below that is vertices, morph deltas and bytes for a part of the body the
    camera never frames. Falls back to the chest height if the hand joints are
    missing, which only loses the hands rather than producing a wrong model.
    """
    joints = joint_centres(human, [v.co.copy() for v in human.data.vertices])
    hands = [p.z for name, p in joints.items() if "finger" in name or "hand" in name]
    if not hands:
        return chest
    # A little under the lowest fingertip, so the cut is in clear air.
    return min(chest, min(hands) - 0.04)


def curl_fingers(human, rest_local, joints, side, sign, place, offsets):
    """
    Bend each finger at its three joints, in place, into the offsets dict.

    The joint markers give the chain — `joint-{side}-finger-{n}-{1..4}` runs
    from the knuckle to the tip — so each phalanx is rotated about the axis
    across its own joint, and the vertices it carries are the ones beyond that
    joint along the finger. That is a small enough rotation to be done bluntly:
    a finger is two centimetres of mesh and nothing about it needs feathering.
    """
    for finger in range(1, 6):
        chain = [joints.get(f"joint-{side}-finger-{finger}-{n}") for n in range(1, 5)]
        if any(point is None for point in chain):
            continue
        chain = [place(point) for point in chain]
        # The axis a finger bends about: across the hand, perpendicular to both
        # the finger and the palm. Taken from the finger itself so a thumb,
        # which lies at an angle to the others, bends the way a thumb does.
        span = chain[3] - chain[0]
        if span.length < 1e-5:
            continue
        # Across the finger and across the palm: the axis a knuckle turns on.
        # Taken from the settled hand, so it curls toward the palm wherever the
        # arm has ended up rather than wherever it started.
        axis = span.cross(FORWARD)
        if axis.length < 1e-6:
            continue
        # NOT multiplied by `sign`. The axis is derived from this hand's own
        # geometry, so it is already mirrored; multiplying by the side as well
        # turned one hand's fingers inward and the other's backward through the
        # knuckles. The thumb gets less: it folds across the palm rather than
        # into it, and a full curl puts it through the hand.
        amount = FINGER_CURL * (0.5 if finger == 1 else 1.0)

        for stage in range(3):
            pivot = chain[stage]
            reach = (chain[3] - pivot)
            if reach.length < 1e-6:
                continue
            direction = reach.normalized()
            for vertex in human.data.vertices:
                point = rest_local[vertex.index] + offsets.get(vertex.index, Vector())
                reached = point - pivot
                ahead = reached.dot(direction)
                # Beyond this joint, and inside a tube the width of a finger
                # around the bone. Without the tube each rotation also caught
                # the fingers either side of it — every vertex was bent three
                # or four times, in three or four directions, and the hand came
                # out as a spray of splinters.
                if ahead <= 0 or ahead > reach.length + 0.010:
                    continue
                if (reached - direction * ahead).length > FINGER_RADIUS:
                    continue
                turned = _turn_about(point, pivot, axis, amount)
                offsets[vertex.index] = offsets.get(vertex.index, Vector()) + (turned - point)


def settle_arms(human, attached) -> bool:
    """
    Bring the arms down out of the T-pose, and everything on them with it.

    Returns False if the joint groups are missing, in which case the model is
    still correct — just still a scarecrow.
    """
    rest_local = [v.co.copy() for v in human.data.vertices]
    rest_world = [human.matrix_world @ p for p in rest_local]
    joints = joint_centres(human, rest_local)
    needed = ("joint-l-shoulder", "joint-r-shoulder", "joint-l-elbow", "joint-r-elbow")
    if any(name not in joints for name in needed):
        return False

    offsets: dict[int, Vector] = {}
    for side, sign in (("l", 1.0), ("r", -1.0)):
        shoulder = joints[f"joint-{side}-shoulder"]
        elbow = joints[f"joint-{side}-elbow"]
        wrist = joints.get(f"joint-{side}-hand")
        index_knuckle = joints.get(f"joint-{side}-finger-2-1")
        little_knuckle = joints.get(f"joint-{side}-finger-5-1")
        upper = elbow - shoulder
        if upper.length < 1e-6:
            continue
        upper_dir = upper.normalized()

        # How far the arm ALREADY hangs, measured rather than assumed: the
        # T-pose is not exactly horizontal and it differs with the archetype's
        # build, so a fixed rotation leaves the heavy ones lower than the thin.
        shoulder_turn = ARM_HANG - _drop(upper_dir)

        # Where the elbow ends up, so the forearm turns about the joint's new
        # position instead of the one it left. Over an angle this size, using
        # the old one swings the whole forearm out into the air.
        elbow_after = _turn(elbow, shoulder, "Y", shoulder_turn * sign)

        # THE FOREARM IS ITS OWN SEGMENT. Rotating everything past the shoulder
        # by one angle keeps the forearm at whatever angle it made with the
        # upper arm in the T-pose, which is not the angle it makes on a person
        # standing still — the first attempt left both hands held out to the
        # sides as though he were asking a question. So it is measured and
        # corrected the same way the upper arm is.
        elbow_turn = 0.0
        twist = 0.0
        forearm_axis = None
        # How far past the elbow a vertex is, measured along the FOREARM rather
        # than along the upper arm. The two point in different directions, and
        # projecting the forearm onto the upper arm's axis compresses it —
        # so the feather that should have covered the whole forearm was
        # finishing before the wrist, and the hand came away in one piece.
        past_dir = upper_dir
        if wrist is not None:
            rest_forearm = wrist - elbow
            if rest_forearm.length > 1e-6:
                past_dir = rest_forearm.normalized()
            wrist_1 = _turn(wrist, shoulder, "Y", shoulder_turn * sign)
            elbow_turn = FOREARM_HANG - _drop(wrist_1 - elbow_after)
            wrist_2 = _turn(wrist_1, elbow_after, "Y", elbow_turn * sign)
            forearm_axis = (wrist_2 - elbow_after)

            # AND THE WRIST HAS TO TURN OVER. MakeHuman builds the T-pose with
            # the palms facing down, so bringing the arm to the side leaves
            # them facing front — hands open to the room, which reads as a
            # shrug and is the last thing this man is doing. The angle is not
            # guessed: the line across the knuckles is where the palm faces,
            # and this is the rotation that puts it against the thigh.
            if index_knuckle is not None and little_knuckle is not None and forearm_axis.length > 1e-6:
                def carried(point):
                    return _turn(_turn(point, shoulder, "Y", shoulder_turn * sign),
                                 elbow_after, "Y", elbow_turn * sign)
                across = carried(index_knuckle) - carried(little_knuckle)
                twist = _twist_about(forearm_axis, across, FORWARD)

        chain = arm_chain(joints, side)

        def place(point, weight=None):
            """Where a point on this arm ends up. One definition, used for the
            mesh and for the joint markers, so the fingers can be curled about
            joints that are where the hand actually is."""
            if weight is None:
                weight = arm_weight(point, chain, SHOULDER_FEATHER)
            moved = _turn(point, shoulder, "Y", shoulder_turn * weight * sign)
            past = (point - elbow).dot(past_dir)
            if past > 0:
                bend = min(1.0, past / ELBOW_FEATHER) * weight
                moved = _turn(moved, elbow_after, "Y", elbow_turn * bend * sign)
                moved = _turn(moved, elbow_after, "X", -ARM_ELBOW * bend)
                if forearm_axis is not None and abs(twist) > 0.01:
                    moved = _turn_about(moved, elbow_after, forearm_axis, twist * bend)
            return moved

        for vertex in human.data.vertices:
            point = rest_local[vertex.index]
            weight = arm_weight(point, chain, SHOULDER_FEATHER)
            if weight <= 0.0:
                continue
            delta = place(point, weight) - point
            if delta.length > 1e-6:
                offsets[vertex.index] = delta

        # THE FINGERS, ON THE HAND WHERE IT NOW IS. Curling them about the
        # joint markers as they sit in the T-pose pivots each finger about a
        # point half a metre from the hand, and the first version did exactly
        # that: every vertex failed the "is this part of the finger" distance
        # test, nothing moved, and the hands stayed flat with no sign that
        # anything had been attempted. The markers go through `place` first.
        curl_fingers(human, rest_local, joints, side, sign, place, offsets)

    if not offsets:
        return False

    # Sleeves, and anything else riding on the arm, come with it. Same KD-tree
    # the expressions use — see follow_the_skin — but written into the mesh
    # rather than into a shape key, because this IS the rest pose now.
    mapped = follow_the_skin(human, rest_world, attached)
    for index, delta in offsets.items():
        human.data.vertices[index].co = human.data.vertices[index].co + delta
    human.data.update()

    for obj, weights, rigid in mapped:
        if rigid:
            continue                      # the eyes are nowhere near an arm
        for i, sample in enumerate(weights):
            delta = Vector()
            for index, weight in sample:
                delta += offsets.get(index, Vector()) * weight
            if delta.length > 1e-7:
                obj.data.vertices[i].co = obj.data.vertices[i].co + delta
        obj.data.update()
    return True


def bake_reactions(human, assets, extra=()):
    """
    Five named shapes — face and body together — on the model and everything
    riding on it.

    The face comes from the ARKit units in REACTIONS; the shoulders, arms and
    head come from POSES. They are folded into ONE target per reaction rather
    than shipped as two, because the client should never be able to put a smirk
    on a man with his head in his hands.

    An asset's Basis has to be captured BEFORE the first expression, or the
    rest pose is an already-deformed asset and every delta is measured from the
    wrong place. That is what apply_follow does on its first call.
    """
    svc = services()
    shapes = all_shapes()
    unit_names = sorted({u for recipe in shapes.values() for u in recipe})
    attached = [obj for obj, _, _ in assets if obj] + [o for o in extra if o]

    for unit in unit_names:
        path = svc.TargetService.target_full_path(unit)
        if not path or not os.path.exists(path):
            raise RuntimeError(f"face unit {unit} is not installed — see the faceunits01 pack")
        svc.TargetService.load_target(human, path, weight=0.0, name=unit)

    rest_world = [human.matrix_world @ v.co for v in human.data.vertices]
    rest_local = [v.co.copy() for v in human.data.vertices]
    mapped = follow_the_skin(human, rest_world, attached)

    baked = []
    for reaction, recipe in shapes.items():
        for unit in unit_names:
            svc.TargetService.set_target_value(human, unit, recipe.get(unit, 0.0))
        bpy.context.view_layer.update()

        key = human.shape_key_add(name=reaction, from_mix=True)

        # THE EXPRESSION FIRST, AND ON ITS OWN.
        #
        # What the face did has to be inferred by the things riding on it —
        # it arrives as an MPFB shape key that exists only on the body, so a
        # brow above a raised brow ridge can only know to go up by looking at
        # the ridge. That inference is sound at this scale: nothing here moves
        # more than a few millimetres.
        expression_delta = {}
        for index in range(len(rest_local)):
            moved = key.data[index].co - rest_local[index]
            if moved.length > 1e-7:
                expression_delta[index] = moved
        apply_follow(mapped, expression_delta, reaction)

        # THE POSE SECOND, AND NOT INFERRED AT ALL.
        #
        # A gesture moves the hand thirty centimetres, and inferring THAT from
        # the four nearest body vertices tore the sleeve off the jacket every
        # time — see pose_transform. It is arithmetic on a position, so the
        # sleeve goes through the same arithmetic as the arm inside it and
        # lands exactly where the arm lands.
        posed = pose_transform(human, rest_local, POSES.get(reaction, {}))
        if posed is not None:
            weigh, apply = posed
            body_weights = [weigh(i, point) for i, point in enumerate(rest_local)]
            for index, point in enumerate(rest_local):
                key.data[index].co = (
                    key.data[index].co + (apply(point, body_weights[index]) - point)
                )

            # And everything worn, in the body's own frame: an asset is
            # parented to the body, so its local coordinates are the body's
            # shifted, and a rotation has to be applied about the body's
            # joints rather than about the asset's own origin.
            into_body = human.matrix_world.inverted()
            for obj, sampling, rigid in mapped:
                blocks = obj.data.shape_keys.key_blocks
                if reaction not in blocks:
                    continue
                worn = blocks[reaction]
                to_body = into_body @ obj.matrix_world
                inherited = [blend_weights(body_weights, sample) for sample in sampling]
                if rigid:
                    # An eyeball takes ONE weight for all of it. Feathering the
                    # head rotation across a sphere squashes it into its socket,
                    # and it is the one thing on a face that has to keep its
                    # shape.
                    inherited = [average_weights(inherited)] * len(inherited)
                for index, vertex in enumerate(obj.data.vertices):
                    point = to_body @ vertex.co
                    worn.data[index].co = (
                        worn.data[index].co + (apply(point, inherited[index]) - point)
                    )

        key.value = 0.0
        baked.append(key.name)

    for unit in unit_names:
        svc.TargetService.set_target_value(human, unit, 0.0)
    bpy.context.view_layer.update()

    # Only the five may survive. MPFB's macro combinations and any scratch keys
    # left by the asset loader would otherwise ship as morph targets.
    keep = set(shapes) | {"Basis"}
    for obj in [human] + attached:
        keys = obj.data.shape_keys
        if not keys:
            continue
        for block in list(keys.key_blocks):
            if block.name not in keep:
                obj.shape_key_remove(block)
            else:
                block.value = 0.0

    return baked

# --------------------------------------------------------------------- assets --

def asset_paths(subdir: str, kind: str = "mhclo"):
    try:
        svc = services().AssetService
        lister = svc.list_mhclo_assets if kind == "mhclo" else svc.list_mhmat_assets
        return sorted(str(p) for p in lister(subdir))
    except Exception:
        return []


def companion_material(mhclo: str) -> str:
    if not mhclo:
        return ""
    candidate = os.path.splitext(mhclo)[0] + ".mhmat"
    return candidate if os.path.exists(candidate) else ""


def textures_present(mhmat: str) -> bool:
    """
    An asset whose diffuse image is missing renders magenta, and MPFB builds the
    material around it without complaining. The system asset pack is a 268MB
    download that may only be partly fetched, so this is checked rather than
    assumed — a half-downloaded pack otherwise ships bright pink suspects.
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
    return True


def add_asset(human, path: str, kind: str, material_override: str = ""):
    """Fit one MakeHuman asset, returning (object, mhclo) so it can be re-fitted."""
    if not path or not os.path.exists(path):
        return None, None
    material = material_override or companion_material(path)
    if material and not textures_present(material):
        print(f"  · {kind}: {os.path.basename(path)} has no texture yet, skipping")
        return None, None
    svc = services()
    try:
        obj = svc.HumanService.add_mhclo_asset(
            path, human, asset_type=kind,
            set_up_rigging=False, interpolate_weights=False,
            import_subrig=False, import_weights=False,
            subdiv_levels=0, material_type="MAKESKIN",
        )
    except Exception as err:                             # pragma: no cover - asset data
        print(f"  ! {kind} {os.path.basename(path)} failed: {err}")
        return None, None

    if material_override and textures_present(material_override):
        # The eyeball is the one asset whose material does not sit beside its
        # mesh — MakeHuman keeps eye colours in eyes/materials/ and expects one
        # to be chosen. Without this the eyes load untextured, which on a
        # sphere in a socket reads as no eyes at all.
        try:
            from bl_ext.user_default.mpfb.entities.material.makeskinmaterial import MakeSkinMaterial
            svc.MaterialService.delete_all_materials(obj)
            skin = MakeSkinMaterial()
            skin.populate_from_mhmat(material_override)
            blender_material = svc.MaterialService.create_empty_material(
                os.path.basename(material_override), obj)
            skin.apply_node_tree(blender_material)
        except Exception as err:                         # pragma: no cover - asset data
            print(f"  ! iris material failed: {err}")

    mhclo = None
    try:
        from bl_ext.user_default.mpfb.entities.clothes.mhclo import Mhclo
        mhclo = Mhclo()
        mhclo.load(path)
        # fit_clothes_to_human reads the asset off the mhclo itself. A freshly
        # loaded one has only the file's contents, so without this every refit
        # fails with "'Mhclo' object has no attribute 'clothes'" — and the
        # expression shapes for the brows and lashes come out empty.
        mhclo.clothes = obj
    except Exception:
        mhclo = None
    return obj, mhclo


# "male" IS A SUBSTRING OF "female", and both places that matched on it were
# wrong. The skin scorer gave `young_african_female` the same score as
# `young_african_male` for a male archetype and `max` broke the tie
# alphabetically, so the male African suspect wore a woman's skin; the garment
# filter would have let him wear her clothes for the same reason. Ask this
# instead of writing the substring test again.
def matches_gender(name: str, feminine: bool) -> bool:
    lower = name.lower()
    return ("female" in lower) if feminine else ("male" in lower and "female" not in lower)


# Garments with a MakeHuman logo printed ON them, as opposed to a credit line
# in the unused corner of the UV sheet. The courtroom camera frames the chest,
# so a defendant in a branded t-shirt is what the player would be looking at.
BRANDED_CLOTHES = {"male_casualsuit06"}
# Not branded — just wrong. `female_sportsuit01` is a cropped sports top over
# leggings, and once the crop dropped far enough to keep the hands it dropped
# far enough to show that it leaves the midriff bare. A defendant is dressed
# for a courtroom or the clothes are telling the player something the case is
# not.
UNSUITABLE_CLOTHES = {"female_sportsuit01"}


# Eye colour, weighted rather than uniform.
#
# MakeHuman ships brown, deepblue, green and grey, and picking evenly gave both
# African archetypes bright green eyes on dark skin — which does occur and is
# rare enough that seeing it twice in a cast of six reads as a costume. Brown is
# repeated in these lists to weight the draw toward it, which is roughly how the
# world is; the rarer colours stay reachable rather than being cut.
IRIS_WEIGHTS = {
    "african": ("brown", "brown", "brown", "brown", "grey"),
    "asian": ("brown", "brown", "brown", "brown", "grey"),
    "caucasian": ("brown", "deepblue", "green", "grey"),
    "southasian": ("brown",),
    "latino": ("brown", "brown", "brown", "green"),
    "mena": ("brown", "brown", "brown", "green", "grey"),
}


def weight_irises(options, race: str):
    """Expand the iris list so the draw favours what the archetype would have."""
    by_name = {os.path.splitext(os.path.basename(p))[0]: p for p in options}
    wanted = [by_name[n] for n in IRIS_WEIGHTS.get(race, ()) if n in by_name]
    return wanted or options


def dress(human, spec: dict, seed: int):
    """Eyes, brows, lashes, hair and something to wear."""
    rng = random.Random(seed ^ 0x9E3779B9)
    feminine = spec["gender"] < 0.5
    picked = []

    pins = {"hair": spec.get("hair_asset"), "clothes": spec.get("clothes")}

    def choose(subdir, contains=None, gendered=False, exclude=()):
        paths = [p for p in asset_paths(subdir)
                 if textures_present(companion_material(p))
                 and os.path.splitext(os.path.basename(p))[0] not in exclude]
        # A pinned asset wins when it is installed; otherwise fall through to
        # the seeded pick rather than failing the export.
        pinned = pins.get(subdir)
        if pinned:
            exact = [p for p in paths if os.path.splitext(os.path.basename(p))[0] == pinned]
            if exact:
                return exact[0]
            print(f"  ! pinned {subdir} {pinned} not installed; picking instead")
        if gendered:
            paths = [p for p in paths if matches_gender(os.path.basename(p), feminine)] or paths
        if contains:
            narrowed = [p for p in paths if any(c in os.path.basename(p).lower() for c in contains)]
            paths = narrowed or paths
        return rng.choice(paths) if paths else None

    # The eyes are chosen separately: their mesh has no companion .mhmat, so
    # the generic "does this asset have a texture" filter throws them away.
    iris_options = [m for m in asset_paths("eyes", "mhmat")
                    if "materials" in m and textures_present(m)]
    iris_options = weight_irises(iris_options, spec["race"])
    eye_meshes = [p for p in asset_paths("eyes") if "high-poly" in os.path.basename(p).lower()]
    if eye_meshes and iris_options:
        obj, mhclo = add_asset(human, eye_meshes[0], "Eyes",
                               material_override=rng.choice(iris_options))
        if obj:
            # Named, not left as `Human.high-poly`. The client anchors the
            # whole model on the centre of this mesh — it is the one landmark
            # a face is actually framed from — and matching a MakeHuman asset
            # filename would break the day the eye asset changes.
            obj.name = "eyes"
            picked.append((obj, mhclo, "Eyes"))

    for subdir, kind, contains, gendered, exclude in (
        ("eyebrows", "Eyebrows", None, False, ()),
        ("eyelashes", "Eyelashes", None, False, ()),
        ("hair", "Hair", ("bob", "long", "afro") if feminine else ("short", "afro"), False, ()),
        # Gendered, because MakeHuman's garments are cut for one body or the
        # other and a female sportsuit fitted to a male torso is not a
        # stylistic choice.
        ("clothes", "Clothes", None, True, BRANDED_CLOTHES | UNSUITABLE_CLOTHES),
    ):
        obj, mhclo = add_asset(human, choose(subdir, contains, gendered, exclude), kind)
        if obj:
            picked.append((obj, mhclo, kind))
    return picked


def apply_skin(human, spec: dict) -> bool:
    """A photographed skin where one is installed; the shader stays otherwise."""
    # `young_caucasian_male_special_suit` and its siblings have a shirt and tie
    # PAINTED INTO the skin texture. On a bare torso that reads as a blotchy
    # stain, and underneath an actual garment it reads as two garments.
    skins = [p for p in asset_paths("skins", "mhmat")
             if textures_present(p) and "special" not in os.path.basename(p).lower()]
    if not skins:
        return False
    age = "young" if spec["age"] < 0.45 else "middleage" if spec["age"] < 0.75 else "old"
    feminine = spec["gender"] < 0.5

    def score(path: str) -> int:
        name = os.path.basename(path).lower()
        return ((spec.get("skin", spec["race"]) in name) * 4
                + matches_gender(name, feminine) * 2
                + (age in name))

    best = max(skins, key=score)
    # Ancestry AND gender, or nothing. Age can be missing — the pack has no old
    # Asian female and a middle-aged one is a fair stand-in. Gender cannot: a
    # photographed male skin on a female body is a mistake the eye finds
    # immediately, and MPFB's plain shader is a better answer than the wrong
    # photograph.
    if score(best) < 6:
        return False
    try:
        services().HumanService.set_character_skin(best, human, skin_type="ENHANCED_SSS")
        return True
    except Exception as err:                             # pragma: no cover - asset data
        print(f"  ! skin failed: {err}")
        return False


# --------------------------------------------------------------------- export --

def flatten_shape_keys(obj):
    """
    Bake the current shape into the base mesh and drop every key.

    Two things force this. MPFB expresses the macros — gender, age, ancestry,
    weight — as shape keys, so a fresh human is a neutral base plus a stack of
    combination targets. `shape_key_add(from_mix=True)` captures the CURRENT
    mix, so baking an expression on top of that stack would fold the macros
    into the expression and apply the body twice the moment the client set the
    influence to 1.

    And identity is baked per archetype here anyway, so the macros have no
    business surviving as adjustable keys in a file the client is going to
    drive by name.
    """
    points = evaluated_points(obj)
    if len(points) != len(obj.data.vertices):
        # Refuse rather than write mismatched positions. Silently indexing past
        # the end here is what turns a body into shards, and it does it without
        # an error anywhere — see evaluated_points.
        raise RuntimeError(
            f"{obj.name}: evaluated mesh has {len(points)} vertices, base has "
            f"{len(obj.data.vertices)} — a modifier is still dropping geometry"
        )
    inverse = obj.matrix_world.inverted()
    if obj.data.shape_keys:
        for block in list(obj.data.shape_keys.key_blocks):
            obj.shape_key_remove(block)
    for i, vertex in enumerate(obj.data.vertices):
        if i < len(points):
            vertex.co = inverse @ points[i]
    obj.data.update()


GARMENTS = [
    # `neck` is where the garment meets the shoulder, as a fraction of
    # chin-to-chest. SMALL IS HIGH: the shoulders are about a third of the way
    # down, so anything past 0.3 cuts them off entirely and the garment becomes
    # a bandeau under the collarbone — which is exactly what the first version
    # produced. `scoop` then drops the neckline at the centre of the chest,
    # which is what separates a singlet from a collar.
    #             neck  scoop sleeve  colour
    ("suit",      0.10, 0.10, 1.00, (0.055, 0.058, 0.070)),
    ("shirt",     0.10, 0.13, 1.00, (0.62, 0.63, 0.60)),
    ("workshirt", 0.11, 0.12, 1.00, (0.24, 0.30, 0.34)),
    ("tshirt",    0.12, 0.16, 0.34, (0.30, 0.32, 0.36)),
    ("singlet",   0.10, 0.30, 0.02, (0.72, 0.70, 0.66)),
]


def add_garment(human, style_index: int, eyes_z: float, floor_z: float):
    """
    Something to wear, built from the body rather than fitted to it.

    MakeHuman ships real garments and the pipeline picks one up automatically
    when the pack is installed — see `dress`. What it cannot do is invent one,
    and a suspect in a courtroom cannot be bare-chested, so this is the floor:
    the torso duplicated, cut at a neckline, and pushed out along its own
    normals until it reads as cloth over a body instead of skin.

    It is a shell, not a garment: no seams, no cuffs, no drape. What it does
    give is the thing the scene actually needs from clothing at this distance —
    a neckline, a colour, and a silhouette that differs between a suit, a shirt
    and a singlet. Delete this the day the clothes pack is downloaded.
    """
    name, neckline, scoop, sleeve, colour = GARMENTS[style_index % len(GARMENTS)]

    bpy.ops.object.select_all(action="DESELECT")
    human.select_set(True)
    bpy.context.view_layer.objects.active = human
    bpy.ops.object.duplicate()
    cloth = bpy.context.active_object
    cloth.name = f"garment_{name}"

    # A shell has no business carrying the face's expressions.
    if cloth.data.shape_keys:
        for block in list(cloth.data.shape_keys.key_blocks):
            cloth.shape_key_remove(block)

    # The chin sits about 0.13 below the eyes on this mesh, so the neckline is
    # measured down from there rather than from an absolute height that would
    # be wrong on every other archetype.
    chin = eyes_z - 0.13
    reach = chin - floor_z
    cut = chin - reach * neckline
    # Sleeves are measured down from the shoulder, which is roughly a third of
    # the way from the chin to the chest floor.
    shoulder_z = chin - reach * 0.32
    sleeve_end = shoulder_z - reach * sleeve * 2.2

    points = [cloth.matrix_world @ v.co for v in cloth.data.vertices]
    xs = [p.x for p in points]
    torso_half = (max(xs) - min(xs)) * 0.19 if points else 0.1
    centre_x = (max(xs) + min(xs)) / 2 if points else 0.0

    doomed_indices = set()
    for vertex in cloth.data.vertices:
        point = points[vertex.index]
        # A neckline is not a horizontal line. It is deepest at the sternum and
        # rises over the shoulders — which is the whole reason a singlet has
        # straps and my first attempt, a flat cut, produced a bandeau. `across`
        # is 0 at the centre of the chest and 1 at the edge of the torso.
        across = min(1.0, abs(point.x - centre_x) / max(torso_half, 1e-6))
        local_cut = cut - reach * scoop * (1.0 - across) ** 2
        if point.z > local_cut:
            doomed_indices.add(vertex.index)
        elif abs(point.x - centre_x) > torso_half and point.z < sleeve_end:
            # Past the torso and below the sleeve end: this is bare arm.
            doomed_indices.add(vertex.index)

    bm = bmesh.new()
    bm.from_mesh(cloth.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index in doomed_indices],
                     context="VERTS")
    bm.verts.ensure_lookup_table()
    bm.normal_update()
    # Out along the normals, feathered to nothing at the neckline so the collar
    # meets the neck instead of standing off it in a ring.
    for vertex in bm.verts:
        world_z = (cloth.matrix_world @ vertex.co).z
        near_edge = min(1.0, max(0.0, (cut - world_z) / (reach * 0.06)))
        vertex.co += vertex.normal * (0.009 * near_edge)
    bm.to_mesh(cloth.data)
    bm.free()
    cloth.data.update()

    material = bpy.data.materials.new(f"cloth_{name}")
    material.use_nodes = True
    bsdf = material.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*colour, 1)
    bsdf.inputs["Roughness"].default_value = 0.86
    cloth.data.materials.clear()
    cloth.data.materials.append(material)

    return cloth


MAX_TEXTURE = 768
# Cut-outs are carried by their ALPHA, and a downscaled alpha channel is what
# turns a hairline into a torn edge — so hair gets more pixels than the skin
# does. Eyes are the exception on this list: they keep their alpha for the
# cornea, but an eyeball is forty pixels across on screen and a 1024 map for it
# was half a megabyte per archetype.
CUTOUT_CAPS = {"Hair": 1024, "Eyebrows": 512, "Eyelashes": 512, "Eyes": 384}
MAX_CUTOUT_TEXTURE = 768


# How hard each cut-out is cut, by kind.
#
# One number for all of them does not work. Hair is carried by a soft map and a
# hard cut tears the hairline into a coastline, so it wants a low threshold.
# Eyelashes are the opposite: the MakeHuman lash maps fade out into long
# individual hairs, and keeping those gave every defendant a set of black
# spider legs across the eye — at the sizes this renders, only the dense root
# of the lash should survive, which is what a lash line actually looks like.
# Eyebrows are cut HIGH, and the reason is a mole. The MakeHuman brow maps
# have a faint patch of alpha between the two brows, and at 0.3 it survived as
# a black dot in the middle of every defendant's forehead — while the brows
# themselves thickened into two painted bars. Cutting at 0.55 removes the patch
# and leaves the brow feathered, which is what a brow looks like.
CUTOFFS = {"Hair": 0.22, "Eyebrows": 0.55, "Eyelashes": 0.6, "Eyes": 0.5}
DEFAULT_CUTOFF = 0.4


# Only these are cut-outs. Everything else on a human is solid.
#
# EYES ARE ON THIS LIST, and it is not obvious why. A MakeHuman eyeball is two
# shells: the sclera and iris, and a cornea over the top that is transparent
# except for its highlight. Calling it solid dropped the alpha channel so the
# exporter could write JPEG — and the cornea became an opaque black cap over
# the iris. Every suspect in the game had two empty sockets, which read as a
# lighting problem for a while because a shadowed eye and a missing eye look
# alike at a distance. As a cut-out the cornea's clear pixels are discarded
# and the eye behind it is simply visible.
CUTOUT_KINDS = {"Hair", "Eyebrows", "Eyelashes", "Eyes"}


def hair_tint(assets, colour) -> dict[str, tuple]:
    """
    Which materials get a colour multiplied through them, and what colour.

    Every MakeHuman hair asset ships one texture, and `long01` ships a blonde
    one — so the African and Asian archetypes arrived blonde, which is the
    single loudest wrong note on a model otherwise trying to look like a
    photograph. Brows are tinted with it, because hair and eyebrows that
    disagree look stranger than either.

    IT IS DONE TO THE FILE, NOT TO THE MATERIAL. Setting the Principled node's
    Base Color is silently a no-op here: MPFB wires the diffuse texture into
    that socket through a mix node, and a linked socket ignores its default.
    glTF multiplies `baseColorFactor` by the base colour texture by definition,
    so writing it there is both simpler and impossible to get half-applied.
    """
    tints: dict[str, tuple] = {}
    for obj, _, kind in assets:
        if kind not in ("Hair", "Eyebrows") or not obj:
            continue
        for slot in obj.material_slots:
            if slot.material:
                tints[slot.material.name] = colour
    return tints


def garment_tint(assets, colour) -> dict[str, tuple]:
    """The same trick as hair_tint, for the one suit everybody owns."""
    tints: dict[str, tuple] = {}
    if not colour:
        return tints
    for obj, _, kind in assets:
        if kind != "Clothes" or not obj:
            continue
        for slot in obj.material_slots:
            if slot.material:
                tints[slot.material.name] = colour
    return tints


def image_nodes(tree, seen=None):
    """
    Every TEX_IMAGE node in a tree, INCLUDING the ones inside node groups.

    MakeSkin wraps its shader in a group, so a flat `for node in tree.nodes`
    never sees the skin texture at all — which is why the texture cap was a
    silent no-op and a 2048px face shipped in every file. Nothing failed; the
    loop simply had nothing to iterate over.
    """
    seen = seen if seen is not None else set()
    if tree is None or tree.name in seen:
        return
    seen.add(tree.name)
    for node in tree.nodes:
        if node.type == "TEX_IMAGE" and node.image:
            yield node
        elif node.type == "GROUP":
            yield from image_nodes(node.node_tree, seen)


# How much to lift a brow map's alpha.
#
# The MakeHuman brow textures are painted as individual hairs at low opacity,
# for a renderer that composites them over skin at full strength. Alpha TESTING
# them threw the soft half away and left either two painted bars or two faint
# smudges depending on where the threshold fell; BLENDING them shows them at
# the opacity they were painted with, which on the sparser maps is a suggestion
# of an eyebrow rather than an eyebrow. Lifting the alpha makes the body of
# each hair solid while leaving its tip soft, which is what the map means.
BROW_ALPHA_GAIN = 2.4
_boosted: set[str] = set()


def boost_alpha(image, gain: float):
    """
    Multiply an image's alpha, once per image per run.

    Blender shares an image datablock between every archetype that loads the
    same asset, so this keeps a set: without it the second suspect to wear
    eyebrow005 got the gain applied twice and arrived with two black slugs
    above his eyes.
    """
    if image.name in _boosted or not image.has_data or image.channels != 4:
        return
    _boosted.add(image.name)
    pixels = [0.0] * (len(image.pixels))
    image.pixels.foreach_get(pixels)
    for i in range(3, len(pixels), 4):
        a = pixels[i] * gain
        pixels[i] = 1.0 if a > 1.0 else a
    image.pixels.foreach_set(pixels)
    image.update()


def prepare_materials(objects, cutouts: dict[str, str]):
    """
    Decide, per material, whether it is solid or a cut-out — and say so.

    THIS IS NOT A TWEAK. MPFB's MakeSkin materials arrive with the texture's
    alpha already wired into the Principled shader and the blend method set to
    BLEND, and the glTF exporter faithfully wrote `alphaMode: BLEND` for every
    single one — the body, the lips, the ears, the eyeballs. A BLEND material
    in three does not write depth and is sorted per object back to front, so
    the model rendered with the teeth showing through the cheeks and the
    eyebrow cards painting their black texture across the nose. It looked like
    a fitting bug for a long time. It was the whole body being treated as
    glass.

    So the choice is made here explicitly rather than inherited:

      cut-outs (hair, brows, lashes)  MASK, which discards per fragment and
                                      writes depth — what a card needs
      everything else                 OPAQUE, alpha unlinked, alpha channel
                                      dropped from the image so the exporter
                                      can write JPEG instead of PNG

    Textures are also capped at MAX_TEXTURE: a MakeHuman skin is a 4096px PNG
    of about four megabytes and it is going to be shown at a couple of hundred
    pixels.
    """
    seen = set()
    for obj in objects:
        if not obj or obj.type != "MESH":
            continue
        is_cutout = obj.name in cutouts

        for slot in obj.material_slots:
            material = slot.material
            if not material or material.name in seen:
                continue
            seen.add(material.name)

            tree = material.node_tree
            if not tree:
                continue
            principled = next((n for n in tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            image_node = next(
                (n for n in tree.nodes
                 if n.type == "TEX_IMAGE" and n.image and n.outputs["Color"].is_linked),
                None,
            )

            if is_cutout:
                if principled and image_node and not principled.inputs["Alpha"].is_linked:
                    tree.links.new(image_node.outputs["Alpha"], principled.inputs["Alpha"])
                for method in ("CLIP", "HASHED", "BLEND"):
                    try:
                        material.blend_method = method
                        break
                    except (TypeError, ValueError):
                        continue
                try:
                    material.alpha_threshold = 0.4
                except Exception:
                    pass
            else:
                if principled:
                    for link in list(principled.inputs["Alpha"].links):
                        tree.links.remove(link)
                    principled.inputs["Alpha"].default_value = 1.0
                try:
                    material.blend_method = "OPAQUE"
                except (TypeError, ValueError):
                    pass

            for node in image_nodes(tree):
                if node.image:
                    image = node.image
                    # Dropping the alpha channel on a solid material is what
                    # lets the exporter choose JPEG. It is the difference
                    # between a 3.5MB skin and a 300KB one.
                    if not is_cutout and image.alpha_mode != "NONE":
                        image.alpha_mode = "NONE"
                    if is_cutout and cutouts[obj.name] == "Eyebrows":
                        boost_alpha(image, BROW_ALPHA_GAIN)
                    cap = (CUTOUT_CAPS.get(cutouts[obj.name], MAX_CUTOUT_TEXTURE)
                           if is_cutout else MAX_TEXTURE)
                    if max(image.size) > cap and image.has_data:
                        ratio = cap / max(image.size)
                        image.scale(
                            max(1, int(image.size[0] * ratio)),
                            max(1, int(image.size[1] * ratio)),
                        )


def retag_alpha(path: str, cutout_materials: dict[str, float], tints: dict[str, tuple]):
    """
    Set every material's alphaMode in the exported file, because Blender will
    not.

    `material.blend_method = "OPAQUE"` reports success and leaves the value at
    HASHED — since 4.2 the property is vestigial, and the glTF exporter derives
    alphaMode from the node tree instead. MPFB's MakeSkin materials are node
    GROUPS with the texture's alpha wired through, so every one of them
    exported as BLEND: the body, the lips, the ears, the eyeballs.

    That is not cosmetic. A BLEND material in three writes no depth and is
    sorted per object, so the model came out with the teeth showing through the
    cheeks and the eyebrow cards painting black across the nose. It reads as a
    fitting bug and it is not one.

    Rewriting the JSON chunk afterwards is precise, needs no cooperation from
    the exporter, and is a dozen lines. The chunk has to be re-padded to a
    four-byte boundary and both it and the file header carry lengths that must
    be corrected — glTF readers reject the file otherwise.
    """
    with open(path, "rb") as handle:
        blob = handle.read()

    if blob[:4] != b"glTF":
        raise RuntimeError(f"{path} is not a GLB")

    json_length = struct.unpack("<I", blob[12:16])[0]
    document = json.loads(blob[20:20 + json_length])
    rest = blob[20 + json_length:]

    changed = 0
    for material in document.get("materials", []):
        name = material.get("name", "")
        if name in cutout_materials:
            material["alphaMode"] = "MASK"
            material["alphaCutoff"] = cutout_materials[name]
        else:
            material.pop("alphaCutoff", None)
            material["alphaMode"] = "OPAQUE"
        if name in tints:
            pbr = material.setdefault("pbrMetallicRoughness", {})
            pbr["baseColorFactor"] = [*tints[name], 1.0]
        changed += 1

    encoded = json.dumps(document, separators=(",", ":")).encode("utf-8")
    encoded += b" " * ((4 - len(encoded) % 4) % 4)          # chunks are 4-byte aligned
    header = b"glTF" + struct.pack("<II", 2, 12 + 8 + len(encoded) + len(rest))
    chunk = struct.pack("<I", len(encoded)) + b"JSON" + encoded

    with open(path, "wb") as handle:
        handle.write(header + chunk + rest)
    return changed


def recompress_images(path: str) -> int:
    """
    Hand the finished file to optimise_glb, which re-encodes solid textures.

    It runs in a separate interpreter because Blender's bundled Python has no
    Pillow, and adding one to a Blender install is not a thing to ask of anyone
    checking this repository out. If the call fails the model is still correct,
    just larger — so this reports and carries on rather than failing an export
    that otherwise worked.
    """
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "optimise_glb.py")
    try:
        result = subprocess.run(
            [sys.executable if "python" in sys.executable.lower() else "python3", script, path],
            capture_output=True, text=True, timeout=600,
        )
        if result.returncode != 0:
            result = subprocess.run(["python3", script, path],
                                    capture_output=True, text=True, timeout=600)
        if result.returncode == 0:
            for line in result.stdout.strip().splitlines():
                print(f"  {line}")
        else:
            print(f"  · textures left as exported: {result.stderr.strip().splitlines()[-1:]}")
    except Exception as err:                             # pragma: no cover - tooling
        print(f"  · textures left as exported: {err}")
    return os.path.getsize(path)


def export(objects, path: str):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        if obj:
            obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_morph=True,
        export_morph_normal=False,   # halves the morph payload; a phone will not miss it
        export_apply=False,          # applying modifiers would destroy the shape keys
        export_skins=False,
        export_animations=False,
        export_yup=True,
        # AUTO writes JPEG for anything without an alpha channel and PNG for
        # the rest. It matters: a single 1024px skin arrived as a 3.5MB PNG and
        # took two archetypes from 2.5MB to 6MB each. Hair and lashes still get
        # PNG, because their alpha IS the asset.
        export_image_format="AUTO",
        export_jpeg_quality=82,
    )
    return os.path.getsize(path)


def build_one(spec: dict, out_dir: str):
    """
    One archetype, in the only order that works.

    Every step here is constrained by the one after it:

      - MakeHuman assets are fitted by BASE-MESH VERTEX INDEX, so nothing may
        add or remove a vertex until the last asset is attached. That rules out
        cropping first, and it rules out decimating at all — a decimated body
        has no vertex 12,431 for the collar to hold on to.
      - `shape_key_add(from_mix=True)` captures the current mix, so the macro
        keys have to be flattened before any expression is baked or the body
        gets applied twice.
      - Blender will not apply a modifier to a mesh with shape keys, and after
        the reactions everything has five — so the crop is a bmesh vertex
        delete, and it comes last.
    """
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

    # crc32, not hash(). Python randomises string hashing per process, so
    # `hash(name)` would give this archetype different hair and different
    # clothes on every export — and the whole point of deriving a face from a
    # seed is that the same person comes back looking like themselves.
    seed = zlib.crc32(spec["name"].encode()) % 100000
    human = build_human(spec, seed)
    eyes_z = eye_height(human)

    apply_skin(human, spec)
    assets = dress(human, spec, seed)

    flatten_shape_keys(human)

    # Out of the T-pose before anything is measured off the body. See
    # settle_arms: this is geometry, not a morph, and everything below —
    # where the crop falls, where the shell's sleeves end, what the reaction
    # poses mean — is relative to a body that is standing rather than
    # semaphoring.
    settle_arms(human, [obj for obj, _, _ in assets if obj])

    # Chest height, for the shell's proportions. Not the crop: the crop has to
    # clear the hands, which is a different and much lower number.
    chest = eyes_z - 0.52

    # Dressed BEFORE the reactions are baked. The garment has to be in the list
    # of things that follow the body, or the shoulders hunch and the shirt
    # stays where it was.
    garment = None
    # The procedural shell is a FALLBACK. If a real MakeHuman garment was
    # fitted, wearing both is wearing both.
    if not any(kind == "Clothes" for _, _, kind in assets):
        garment = add_garment(human, seed, eyes_z, chest)

    # And the crop, measured off the hands rather than guessed. With the arms
    # down the fingertips are the lowest thing that matters, and a plane
    # anywhere above them cuts a hand in half — which is what the old fixed
    # 0.52 did, leaving two flat stumps where the wrists should be.
    floor = crop_floor(human, eyes_z, chest)

    baked = bake_reactions(human, assets, extra=[garment] if garment else [])

    crop_to_upper_body(human, floor, keep_group="body")
    for obj, _, _ in assets:
        crop_to_upper_body(obj, floor)
    if garment:
        crop_to_upper_body(garment, floor)

    # Sit the model at the origin with the eyes at zero, so the client can frame
    # every archetype with one camera instead of a table of offsets.
    dressed = [human] + [o for o, _, _ in assets] + ([garment] if garment else [])

    # Only the ROOTS move.
    #
    # `add_mhclo_asset` parents every asset to the body, so a child already
    # inherits the body's transform. Shifting each object as well applied the
    # offset twice: the hair ended up at world y -3.2 instead of -1.6, sitting
    # below the chin where it was invisible from the front. It read as an alpha
    # problem for a long time, and the alpha was fine all along.
    for obj in dressed:
        if obj.parent is None:
            obj.location.z -= eyes_z

    objects = dressed
    cutouts = {o.name: kind for o, _, kind in assets if kind in CUTOUT_KINDS}
    prepare_materials(objects, cutouts)

    path = os.path.join(out_dir, f"{spec['name']}.glb")
    size = export(objects, path)

    # Blender's exporter cannot be told which materials are solid, so the file
    # is corrected after the fact. See retag_alpha.
    cutout_materials: dict[str, float] = {}
    for obj, _, kind in assets:
        if kind in CUTOUT_KINDS and obj:
            for slot in obj.material_slots:
                if slot.material:
                    cutout_materials[slot.material.name] = CUTOFFS.get(kind, DEFAULT_CUTOFF)
    tints = hair_tint(assets, spec.get("hair", (0.10, 0.08, 0.06)))
    tints.update(garment_tint(assets, spec.get("wears")))
    if spec.get("tone"):
        for slot in human.material_slots:
            if slot.material:
                tints[slot.material.name] = spec["tone"]
    retag_alpha(path, cutout_materials, tints)
    size = recompress_images(path)
    worn = ", ".join(obj.name for obj, _, _ in assets if obj)
    print(
        f"  {spec['name']}: {len(human.data.vertices)} body verts, "
        f"{len(assets)} assets, {len(baked)} shapes, {size / 1024:.0f}KB\n"
        f"      wearing: {worn}"
    )
    return {"name": spec["name"], "file": os.path.basename(path), "bytes": size}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out_dir = "tools/suspect/build"
    only = None
    for i, a in enumerate(argv):
        if a == "--out":
            out_dir = argv[i + 1]
        elif a == "--only":
            only = argv[i + 1]

    ensure_mpfb()
    specs = [s for s in ARCHETYPES if only is None or s["name"] == only]
    print(f"exporting {len(specs)} archetype(s) to {out_dir}")

    manifest = []
    for spec in specs:
        manifest.append(build_one(spec, out_dir))

    index = os.path.join(out_dir, "manifest.json")
    with open(index, "w", encoding="utf-8") as handle:
        json.dump({
            "reactions": list(REACTIONS),
            "trial": list(TRIAL),
            "channels": list(CHANNELS),
            "archetypes": manifest,
        }, handle, indent=2)
    print("wrote", index)


if __name__ == "__main__":
    main()
