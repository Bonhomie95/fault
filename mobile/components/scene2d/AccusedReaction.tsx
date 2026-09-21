import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Actor } from '@/components/cast/Actor';
import { EYES_PX, HEAD_PX, SPRITE_H, SPRITE_W } from '@/components/cast/sprites';
import { blinkPeriodMs, reactionExpression, type ReactionName } from './expression';
import { Palette } from '@/constants/theme';

/**
 * How big the head is, and where the eyes sit — both as fractions of the
 * screen height, because that is what composition actually means.
 *
 * BELOW THE WORD, not behind it. The verdict is set in the top third of the
 * screen and the face is framed under it. Anywhere the two can collide, the
 * text wins and the face is lost — on the one screen whose entire purpose is
 * that you look at their face while you read what you did to it.
 */
const HEAD_SCREEN = 0.155;
const EYES_SCREEN = 0.58;

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
 * The same rendered person who stood in the dock (lib/cast, recorded when the
 * verdict was delivered), so the face you judged is the face that reacts.
 */
export function AccusedReaction({
  seed,
  cast,
  reaction,
  reducedMotion = false,
}: {
  seed: number;
  cast: string;
  reaction: ReactionName | null | undefined;
  reducedMotion?: boolean;
}) {
  const { width, height } = useWindowDimensions();
  const k = (HEAD_SCREEN * height) / HEAD_PX;
  const expression = reactionExpression(reaction);

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
      <View style={styles.dim}>
        <View
          style={{
            position: 'absolute',
            left: width / 2 - EYES_PX.x * k,
            top: EYES_SCREEN * height - EYES_PX.y * k,
            width: SPRITE_W * k,
            height: SPRITE_H * k,
          }}
        >
          <Actor
            who={cast}
            expression={expression}
            ready={[expression]}
            blinkPeriod={blinkPeriodMs(seed)}
            reducedMotion={reducedMotion}
            breathe={3}
          />
        </View>
      </View>
      {/* Ground the figure into the dark rather than cutting it off. */}
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="accusedScrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={Palette.bg} stopOpacity={0.35} />
            <Stop offset="0.42" stopColor={Palette.bg} stopOpacity={0.1} />
            <Stop offset="0.72" stopColor={Palette.bg} stopOpacity={0.66} />
            <Stop offset="0.88" stopColor={Palette.bg} stopOpacity={0.98} />
            <Stop offset="1" stopColor={Palette.bg} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#accusedScrim)" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Dimmer than a lit render would be, because this is the emotional ground of
  // the screen and not its content — the moment it competes with the aftermath
  // line for attention it has stopped working.
  dim: { ...StyleSheet.absoluteFillObject, opacity: 0.66 },
});
