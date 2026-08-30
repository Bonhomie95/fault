import { useEffect, useRef, useState } from 'react';
import { Asset } from 'expo-asset';
import type { Group, Mesh, Vector3 } from 'three';
import { useFrame } from '@/lib/r3f';
import { archetypeFor, type SuspectArchetype } from './archetypes';
import { skinToneFor } from './skin';
import type { ReactionName } from '@/components/scene2d/expression';

/** The trial expressions the model carries, mirroring scene2d/expression. */
export type TrialExpression =
  | 'neutral'
  | 'tense'
  | 'pleading'
  | 'defiant'
  | 'ashamed'
  | 'startled';

export interface SuspectPose {
  /** The verdict reaction. Dominates everything else while it is set. */
  reaction?: ReactionName | null;
  /** What the face is doing during the trial. */
  expression?: TrialExpression;
  /** 0 open, 1 shut. */
  blink?: number;
  /** −1 their right, +1 their left. */
  gazeX?: number;
  /** −1 up, +1 down. */
  gazeY?: number;
  /** How far the shoulders have gone. The demeanour axis, 0..1. */
  slump?: number;
}

/**
 * The accused, as an actual model.
 *
 * Blender bakes one .glb per archetype — an upper body with eyes, brows,
 * lashes, hair and a garment — carrying sixteen morph targets: five verdict
 * reactions, five trial expressions, and six channels the client dials rather
 * than picks. Identity comes from which file is loaded and the skin tone
 * applied here. Nothing is pre-rendered, so every combination of person,
 * expression and outcome costs a few megabytes rather than a library of
 * thousands of images.
 *
 * The target names must match `scene2d/expression` and the server's
 * `domain/reaction`. When one does not, its influence is simply never set and
 * the face stays neutral — this degrades rather than throws, because it is
 * drawn on screens the player cannot leave.
 */
/**
 * Let hair be hair.
 *
 * The .glb tags hair, brows and lashes as glTF MASK, which three implements as
 * an alpha TEST: each pixel is fully drawn or fully discarded. A quarter of the
 * MakeHuman hair map is partial alpha — the soft tips of the strands — and
 * thresholding it threw all of that away, leaving a hard boundary that followed
 * the noise in the map rather than the shape of a hairline. On screen it was a
 * coastline bitten across the forehead, and it got worse the smaller the model
 * was drawn, because minification averages the fringe toward zero and the test
 * then eats it. Lowering the threshold does not help: it moves the coastline
 * without softening it, and at the same time bloats every brow into a bar.
 *
 * So the fringe is BLENDED instead of tested, and depth is still written:
 *
 *   alphaTest 0.02  a fully clear pixel is still discarded, so it writes no
 *                   depth and cannot punch a hole in the hair behind it
 *   transparent     what survives is composited by its own alpha — the strand
 *                   tips come back, and the edge follows the hair
 *   depthWrite      the ordinary depth test still applies, which is what kept
 *                   the old BLEND bug (brow cards painted across the nose)
 *                   from coming back with it
 *
 * The EYES are excluded by the caller and must stay excluded. Their cut-out is
 * a cornea over an iris, in one mesh, and blending it puts the cornea's
 * highlight back over the eye it is supposed to sit in front of.
 */
function softenCutout(mesh: Mesh) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) {
    // A glTF MASK material, and nothing else: three sets alphaTest from the
    // file's alphaCutoff, so this needs no agreement about asset names.
    if (!material || material.alphaTest <= 0) continue;
    material.alphaTest = 0.02;
    material.transparent = true;
    material.depthWrite = true;
    material.needsUpdate = true;
  }
}

/**
 * The top and middle of a mesh in world space, in ITS BASE POSE.
 *
 * three's bounding boxes include morph target extents, which is right for
 * culling and wrong for framing. This walks the position attribute instead, so
 * what comes back is where the geometry actually is when nothing is dialled in.
 */
function heightsOf(mesh: Mesh, scratch: Vector3) {
  const position = mesh.geometry.getAttribute('position');
  let top = -Infinity;
  let bottom = Infinity;
  for (let i = 0; i < position.count; i += 1) {
    scratch.fromBufferAttribute(position as never, i).applyMatrix4(mesh.matrixWorld);
    if (scratch.y > top) top = scratch.y;
    if (scratch.y < bottom) bottom = scratch.y;
  }
  return { top, bottom, middle: (top + bottom) / 2 };
}

export function SuspectModel({
  seed,
  pose,
  onReady,
}: {
  seed: number;
  pose: SuspectPose;
  onReady?: (ok: boolean) => void;
}) {
  const archetype: SuspectArchetype = archetypeFor(seed);
  const [scene, setScene] = useState<Group | null>(null);
  const morphMeshes = useRef<Mesh[]>([]);

  /**
   * The live influences, eased toward the target every frame.
   *
   * Held in a ref rather than state: this changes sixty times a second and
   * touching React state at that rate would re-render the whole courtroom.
   */
  const live = useRef<Record<string, number>>({});
  const latest = useRef<SuspectPose>(pose);
  latest.current = pose;

  /**
   * The callback, held rather than depended on.
   *
   * The load effect must run once per archetype and no more. With `onReady` in
   * its dependencies it ran on every render of the parent instead, and the
   * courtroom re-renders once a second for the clock — so the cleanup set
   * `cancelled` on the in-flight parse a moment before it finished, every
   * time, and the model never arrived. The screen showed the drawn fallback
   * and nothing anywhere reported a failure, because nothing had failed.
   */
  const ready = useRef(onReady);
  ready.current = onReady;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const asset = Asset.fromModule(archetype.module);
        await asset.downloadAsync();
        const uri = asset.localUri ?? asset.uri;
        const buffer = await (await fetch(uri)).arrayBuffer();
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        new GLTFLoader().parse(
          buffer,
          '',
          async (gltf) => {
            if (cancelled) return;
            const meshes: Mesh[] = [];
            const all: Mesh[] = [];
            let eyeMesh: Mesh | null = null;
            gltf.scene.traverse((object) => {
              const mesh = object as Mesh;
              if (mesh.isMesh) all.push(mesh);
              if (mesh.isMesh && mesh.morphTargetDictionary) meshes.push(mesh);
              // The eyeballs, named by the exporter. See the framing note.
              if (mesh.isMesh && /(^|\.)eyes$/i.test(mesh.name)) eyeMesh = mesh;
              // Skin tone is identity and stays runtime, so one archetype
              // covers a range of people rather than exactly one.
              if (mesh.isMesh && /^base$/i.test(mesh.name)) {
                const material = mesh.material as { color?: { set: (c: string) => void } };
                material.color?.set(skinToneFor(seed));
              }
            });
            morphMeshes.current = meshes;
            for (const mesh of all) if (mesh !== eyeMesh) softenCutout(mesh);

            /**
             * ONE UNIT IS EYES TO CROWN, AND THE ORIGIN IS THE EYES.
             *
             * Every consumer frames this model, so the two of them have to
             * agree on what its numbers mean. Head units are the useful ones:
             * portrait framing is described in heads, the drawn accused this
             * replaces is built from a head radius, and a head is the part of
             * a person whose size the eye actually judges. Normalising by the
             * whole figure instead — the first attempt — meant an archetype
             * cropped slightly lower arrived with a smaller face, because the
             * only thing holding the scale was how much chest was in the file.
             *
             * So the eyes are FOUND rather than assumed. The exporter names
             * the eyeball mesh `eyes` for exactly this, and the centre of its
             * bounds is the one landmark on a head that a portrait is framed
             * from. Trusting the file's own origin instead — which the
             * exporter does put at the measured eye height — came out 1.6
             * times too small in the room, because the crop, the parenting and
             * the Z-up to Y-up conversion each move the root a little and the
             * error is invisible until something is scaled by it.
             *
             * X needs no correction: the MakeHuman base mesh is symmetric
             * about its midline, and recentring on the bounds would drag the
             * face off-axis to compensate for a fringe.
             *
             * And the bounds are computed by hand rather than with Box3,
             * because `setFromObject` on a mesh with morph targets returns the
             * union of every target at full influence — so the "crown" came
             * back eleven centimetres above the actual skull, and the scale it
             * produced drifted whenever a pose changed. Nothing renders there;
             * it is the shape of a shrug that is never fully applied.
             */
            const { Vector3 } = await import('three');
            gltf.scene.updateMatrixWorld(true);
            const crownY = all.length
              ? Math.max(...all.map((m) => heightsOf(m, new Vector3()).top))
              : 0;
            const eyes = eyeMesh ? heightsOf(eyeMesh, new Vector3()).middle : 0;
            const crown = crownY - eyes;
            const scale = crown > 0 ? 1 / crown : 1;
            gltf.scene.scale.setScalar(scale);
            gltf.scene.position.set(0, -eyes * scale, 0);

            setScene(gltf.scene as unknown as Group);
            ready.current?.(meshes.length > 0);
          },
          () => ready.current?.(false),
        );
      } catch {
        if (!cancelled) ready.current?.(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [archetype, seed]);

  useFrame((_, delta) => {
    const meshes = morphMeshes.current;
    if (!meshes.length) return;
    const p = latest.current;

    // What every channel SHOULD be, this frame.
    const want: Record<string, number> = {
      blink: clamp01(p.blink ?? 0),
      slump: clamp01(p.slump ?? 0),
      gazeLeft: Math.max(0, p.gazeX ?? 0),
      gazeRight: Math.max(0, -(p.gazeX ?? 0)),
      gazeDown: Math.max(0, p.gazeY ?? 0),
      gazeUp: Math.max(0, -(p.gazeY ?? 0)),
    };
    if (p.reaction) want[p.reaction] = 1;
    else if (p.expression && p.expression !== 'neutral') want[p.expression] = 1;

    /**
     * Two speeds, deliberately.
     *
     * A blink is over in a tenth of a second and a reaction dawns over most of
     * a second; running both at one rate makes the blink look like a slow
     * swoon or the reaction look like a flinch. Gaze sits between them.
     */
    for (const mesh of meshes) {
      const dictionary = mesh.morphTargetDictionary;
      const influences = mesh.morphTargetInfluences;
      if (!dictionary || !influences) continue;

      for (const name of Object.keys(dictionary)) {
        const target = want[name] ?? 0;
        const current = live.current[name] ?? 0;
        const seconds = name === 'blink' ? 0.06 : name.startsWith('gaze') ? 0.16 : 0.55;
        const stepped = current + (target - current) * Math.min(1, delta / seconds);
        live.current[name] = stepped;
        influences[dictionary[name]!] = stepped;
      }
    }
  });

  return scene ? <primitive object={scene} /> : null;
}

function clamp01(value: number) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
