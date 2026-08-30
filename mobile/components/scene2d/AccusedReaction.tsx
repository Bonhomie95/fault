import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Canvas } from '@/lib/r3f';
import { SuspectModel } from '@/components/suspect/SuspectModel';
import { glUsable } from '@/components/three/glCapability';
import { EXPRESSIONS, reactionExpression, type ReactionName } from './expression';
import { StandaloneFace } from './CourtroomScene';
import { Palette } from '@/constants/theme';

/**
 * How big the head is, and where the eyes sit — both as fractions of the
 * viewport, because that is what composition actually means.
 *
 * SuspectModel normalises every archetype to one unit from eyes to crown with
 * its origin on the eyes, so a head that should occupy HEAD_SCREEN of the
 * screen needs a camera that sees 1/HEAD_SCREEN units, and the eyes go
 * wherever EYES_SCREEN puts them. Both derivations are below rather than
 * dialled in, so an archetype cropped differently still frames the same.
 */
const FOV = 34;
const HEAD_SCREEN = 0.155;
const EYES_SCREEN = 0.45;
const FIGURE_DISTANCE = 1 / HEAD_SCREEN / (2 * Math.tan((FOV * Math.PI) / 360));
const EYES_LIFT = (0.5 - EYES_SCREEN) / HEAD_SCREEN;

/**
 * The accused, behind the verdict.
 *
 * The one moment in the game where a face is worth reading. Everywhere else
 * the defendant's expression is presentation — rolled blind to guilt, and
 * measured precisely because it means nothing. Here it means what it looks
 * like: they are the only person in the room who knows whether they did it,
 * and the verdict has just landed on them.
 *
 * Behind, not beside. It arrives after the verdict word rather than with it,
 * because a reaction that is already on screen when the sentence appears is a
 * picture, and one that dawns a beat later is a person.
 *
 * The face is dim and the scrim is heavy on purpose. This is the emotional
 * ground of the screen, not its content — the moment it competes with the
 * aftermath line for attention it has stopped working.
 */
export function AccusedReaction({
  seed,
  appearance,
  reaction,
  reducedMotion = false,
}: {
  seed: number;
  appearance: number;
  reaction: ReactionName | null | undefined;
  reducedMotion?: boolean;
}) {
  const expr = EXPRESSIONS[reactionExpression(reaction)];
  const { width, height } = useWindowDimensions();

  /**
   * Which of the two accused is on screen.
   *
   * `null` means undecided — the canvas has not reported back yet — and both
   * layers are mounted with the drawn face underneath. It resolves one of two
   * ways:
   *
   *   `usable === false`  the context cannot be trusted to paint (see
   *                       glCapability: expo-gl will report WebGL2, highp and
   *                       a clean 60fps and still put nothing on the screen).
   *                       The canvas is unmounted and the drawn face stands.
   *   `modelReady`        the .glb parsed and has the morph targets. The drawn
   *                       face is retired, because two faces at once is worse
   *                       than either.
   */
  const [usable, setUsable] = useState<boolean | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const showDrawnFace = !(usable !== false && modelReady);

  /**
   * A viewBox with the screen's own aspect ratio.
   *
   * `slice` on a fixed box scales to COVER, which on a tall phone meant
   * scaling a 208x300 box by nearly three and cropping half the head off the
   * side — a giant ear where a person should be. `meet` letterboxes instead,
   * which leaves the scrim short and the face floating on bare background.
   * Neither is a framing decision; both are the consequence of guessing an
   * aspect ratio. Measuring it means the box IS the screen, and the numbers
   * below are then about composition rather than about fitting.
   */
  const boxHeight = 300;
  const boxWidth = boxHeight * (width / Math.max(height, 1));
  // The head is drawn around the origin, so putting the origin 34% down the
  // box puts the eyes a third of the way down the screen — where a face is
  // read from — and drops the jaw behind the verdict.
  const boxTop = -boxHeight * 0.34;
  // Wide enough to fill a phone, short of the edges so the temples stay on.
  const headRadius = boxWidth * 0.40;

  return (
    <Animated.View
      // 900ms after the verdict word, which lands at 240. Long enough to read
      // as a separate beat, short enough that it is not a second screen.
      entering={reducedMotion ? undefined : FadeIn.duration(1400).delay(900)}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      {/* The opacity lives on this inner view, never on the animated one.
          Reanimated's FadeIn animates `opacity` to 1 and would overwrite it —
          the same bug that turned this screen's accent flash into an opaque
          wash across the whole display. */}
      {showDrawnFace && (
      <View style={styles.dim}>
        {/* The drawn face is the GROUND, and the model is drawn over it.
            No capability check, and that is the point: an expo-gl surface that
            fails to paint is transparent, so the vector face shows through
            exactly when there is nothing on top of it. Where GL works the
            canvas is opaque over this and the player sees the real model.
            See components/three/glCapability for what "fails to paint" covers
            — a context can report WebGL2, highp and 60fps and still put
            nothing on screen. */}
        <Svg
          width="100%"
          height="100%"
          viewBox={`${-boxWidth / 2} ${boxTop} ${boxWidth} ${boxHeight}`}
        >
          <StandaloneFace seed={seed} appearance={appearance} r={headRadius} expr={expr} />
          {/* Ground the face into the dark rather than cutting it off. */}
          <Defs>
            <LinearGradient id="accusedScrim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={Palette.bg} stopOpacity={0.35} />
              <Stop offset="0.42" stopColor={Palette.bg} stopOpacity={0.1} />
              <Stop offset="0.78" stopColor={Palette.bg} stopOpacity={0.72} />
              <Stop offset="1" stopColor={Palette.bg} stopOpacity={0.96} />
            </LinearGradient>
          </Defs>
          <Rect
            x={-boxWidth / 2}
            y={boxTop}
            width={boxWidth}
            height={boxHeight}
            fill="url(#accusedScrim)"
          />
        </Svg>
      </View>
      )}

      {/* The accused, in three dimensions. */}
      {usable !== false && (
      <View style={styles.model} pointerEvents="none">
        <Canvas
          /**
           * Framed head AND chest, not head alone — the reaction is in the
           * shoulders and the hands as much as the face, and none of that
           * reads if the camera stops at the jaw.
           *
           * The numbers are derived rather than dialled. SuspectModel
           * normalises every archetype to one world unit tall with its head at
           * the origin, so to fill FIGURE_SCREEN of the viewport the camera
           * needs to see 1/FIGURE_SCREEN units, and the distance that shows
           * exactly that at this field of view is the arithmetic below. Tuning
           * a distance by eye instead would go wrong the moment an archetype
           * with different proportions was added.
           */
          camera={{ position: [0, 0, FIGURE_DISTANCE], fov: FOV, near: 0.01, far: 20 }}
          gl={{ antialias: true }}
          style={{ flex: 1 }}
          onCreated={({ gl }) => setUsable(glUsable(gl))}
        >
          {/* One hard key from above and in front, a cold rim, almost no fill.
              The same light the Cycles portraits use, and the same light the
              room is described as having. */}
          <ambientLight intensity={0.45} />
          <directionalLight position={[0.8, 1.4, 1.6]} intensity={2.6} color="#FFF0DD" />
          {/* Cool, and weak. A strong blue rim is the only light that lands on
              near-black surfaces — hair, brows, lashes — so at 0.9 it did not
              read as a rim at all, it read as blue eyebrows. */}
          <directionalLight position={[-1.6, 0.4, -1.2]} intensity={0.45} color="#9DAFC8" />
          <group position={[0, EYES_LIFT, 0]}>
          <SuspectModel
            seed={seed}
            pose={{ reaction: reactionExpression(reaction) === 'neutral' ? null : reaction }}
            onReady={setModelReady}
          />
          </group>
        </Canvas>
        {/* The same scrim the drawn face gets, over the model.
            Without it the figure ends at the crop — a hard sawtooth edge
            across the chest where the exporter cut the body away. Grounding it
            into the dark is also what the drawn version does, so the two read
            as one picture whichever is actually on screen. */}
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <LinearGradient id="modelScrim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={Palette.bg} stopOpacity={0.35} />
              <Stop offset="0.42" stopColor={Palette.bg} stopOpacity={0.1} />
              <Stop offset="0.72" stopColor={Palette.bg} stopOpacity={0.66} />
              <Stop offset="0.88" stopColor={Palette.bg} stopOpacity={0.98} />
              <Stop offset="1" stopColor={Palette.bg} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#modelScrim)" />
        </Svg>
      </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dim: { ...StyleSheet.absoluteFillObject, opacity: 0.42 },
  // Same dimming as the drawn face, so the two read as one layer whichever
  // of them the device is actually able to show.
  // Dimmer than a lit render would be, because this is the emotional ground of
  // the screen and not its content — the moment it competes with the aftermath
  // line for attention it has stopped working.
  model: { ...StyleSheet.absoluteFillObject, opacity: 0.62 },
});
