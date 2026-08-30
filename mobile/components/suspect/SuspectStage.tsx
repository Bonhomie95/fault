import { useCallback, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import type { Group } from 'three';
import { Canvas, useFrame } from '@/lib/r3f';
import { SuspectModel, type SuspectPose } from './SuspectModel';
import { glUsable } from '@/components/three/glCapability';

/**
 * The accused, standing in the courtroom.
 *
 * The room is an SVG scene 400x720 units wide, drawn with a camera that
 * translates and scales as the player moves between dossier tabs. The model
 * has to stand on the same mark and move with it, and it cannot be nested
 * inside the SVG — so this reproduces the room's mapping in three.js instead.
 *
 * WHY THE MODEL MOVES AND THE CANVAS DOES NOT. The obvious approach is to put
 * the canvas in a transformed view driven by the same Reanimated values, which
 * is perfect lockstep for free. It does not survive contact: a CSS transform
 * on the canvas's ancestor left react-three-fiber's measurement at its default
 * 300x150, and `transformOrigin` — needed because the room scales about the
 * origin and React Native scales about the centre — is dropped on the web
 * renderer as an unknown DOM property.
 *
 * So the canvas sits still and full-screen, and the model is placed each frame
 * from the same shared values the room uses. Reading three floats per frame off
 * the UI thread is nothing, the two cannot drift because they read one source
 * of truth, and the render stays at native resolution at every zoom instead of
 * being a magnified bitmap.
 */

/** Must match CourtroomScene. The room is authored in these units. */
const SCENE_W = 400;
const SCENE_H = 720;
/**
 * Where the accused's EYES are, and how big their head is — both in scene
 * units, both taken from the drawn accused this stands in for.
 *
 * CourtroomScene draws him with `Figure r={62} cx={200} cy={250}`, whose face
 * is `1.14 * r` from crown to chin with the eyes `0.06` of that above centre.
 * So the eyes land at 246 and the crown at 179. Matching those two numbers is
 * what makes the model and the drawing interchangeable: whichever one the
 * device can show stands in the same place at the same size, and the plea
 * bubble positioned over his head is over his head either way.
 */
const EYES = { x: 200, y: 246 };
const EYES_TO_CROWN = 66;
const FOV = 30;

function Placement({
  target,
  tx,
  ty,
  s,
  cover,
  left,
  top,
  width,
  height,
}: {
  target: Group;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  s: SharedValue<number>;
  cover: number;
  left: number;
  top: number;
  width: number;
  height: number;
}) {
  useFrame(({ camera }) => {
    // Where the room would put the accused's eyes, in screen pixels.
    const zoom = s.value;
    const screenX = left + (tx.value + EYES.x * zoom) * cover;
    const screenY = top + (ty.value + EYES.y * zoom) * cover;
    const headPx = EYES_TO_CROWN * zoom * cover;

    // One pixel, in world units, at the plane the model stands on.
    const perspective = camera as unknown as { position: { z: number } };
    const worldPerPixel =
      (2 * perspective.position.z * Math.tan((FOV * Math.PI) / 360)) / Math.max(height, 1);

    // One model unit is eyes-to-crown, and its origin is the eyes.
    target.scale.setScalar(headPx * worldPerPixel);
    target.position.set(
      (screenX - width / 2) * worldPerPixel,
      -(screenY - height / 2) * worldPerPixel,
      0,
    );
  });

  return null;
}

export function SuspectStage({
  seed,
  pose,
  tx,
  ty,
  s,
  onReady,
}: {
  seed: number;
  pose: SuspectPose;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  s: SharedValue<number>;
  onReady?: (ok: boolean) => void;
}) {
  const { width, height } = useWindowDimensions();

  /**
   * Two conditions, and the caller is told only when BOTH hold.
   *
   * The .glb parsing proves there is a model; the context check proves it will
   * be seen. Neither is enough alone — expo-gl hands back contexts that report
   * WebGL2, highp and a clean sixty frames a second and still put nothing on
   * the screen (see three/glCapability). Reporting readiness on the parse
   * alone would retire the drawn accused in favour of an empty rectangle.
   */
  const parsed = useRef(false);
  const trusted = useRef(false);
  const settle = useCallback(() => {
    onReady?.(parsed.current && trusted.current);
  }, [onReady]);

  /**
   * `null` until the context has been judged, then false if it cannot paint.
   *
   * A transparent canvas over the room is harmless to look at — the drawn
   * accused shows straight through it — but it is a live GL context and a
   * render loop being paid for on exactly the devices that can least afford
   * one. Once the context has failed the check there is no reason to keep it.
   */
  const [usable, setUsable] = useState<boolean | null>(null);
  const onParsed = useCallback(
    (ok: boolean) => {
      parsed.current = ok;
      settle();
    },
    [settle],
  );

  /**
   * The scene rectangle, in screen pixels.
   *
   * The SVG uses preserveAspectRatio="xMidYMid slice", which scales to COVER
   * and centres the overflow. Reproducing that exactly is what puts the model
   * on the same spot as the drawing it replaces.
   */
  const cover = Math.max(width / SCENE_W, height / SCENE_H);
  const left = (width - SCENE_W * cover) / 2;
  const top = (height - SCENE_H * cover) / 2;

  const [group, setGroup] = useState<Group | null>(null);

  if (usable === false) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas
        camera={{ position: [0, 0, 6], fov: FOV, near: 0.01, far: 60 }}
        gl={{ antialias: true }}
        style={{ width: '100%', height: '100%' }}
        onCreated={({ gl }) => {
          trusted.current = glUsable(gl);
          setUsable(trusted.current);
          settle();
        }}
      >
        {/* The room has one hard source overhead and almost no fill — the
            accused is the only lit thing in it (see the `spot` gradient the SVG
            draws under them), so the light here matches rather than competes. */}
        <ambientLight intensity={0.4} />
        <directionalLight position={[0.6, 1.6, 1.4]} intensity={2.4} color="#FFF2E2" />
        <directionalLight position={[-1.5, 0.3, -1.1]} intensity={0.4} color="#9DAFC8" />
        <group ref={setGroup}>
          <SuspectModel seed={seed} pose={pose} onReady={onParsed} />
        </group>
        {group && (
          <Placement
            target={group}
            tx={tx}
            ty={ty}
            s={s}
            cover={cover}
            left={left}
            top={top}
            width={width}
            height={height}
          />
        )}
      </Canvas>
    </View>
  );
}
