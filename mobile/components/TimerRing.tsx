import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';
import { Clock, Palette } from '@/constants/theme';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

/**
 * GDD 6, Screen 4 — the clock is the frame of the screen itself.
 *
 * Not a widget in a corner you can ignore: the room has a border and the
 * border is running out. It depletes clockwise, pulses at 15s, and the last
 * 5 seconds are felt rather than read (haptics live in the case screen).
 */

const STROKE = 3;
const INSET = 1.5;
const RADIUS = 14;

interface TimerRingProps {
  /** Seconds left. Drives the ring directly so a pause or reload cannot desync it. */
  remaining: number;
  total: number;
  accent: string;
  running: boolean;
}

export function TimerRing({ remaining, total, accent, running }: TimerRingProps) {
  const { width, height } = useWindowDimensions();

  const w = width - INSET * 2;
  const h = height - INSET * 2;
  // Rounded-rect perimeter: straights + the four corner arcs.
  const perimeter = 2 * (w + h) - 8 * RADIUS + 2 * Math.PI * RADIUS;

  const progress = useSharedValue(1);
  const pulse = useSharedValue(1);

  useEffect(() => {
    const fraction = Math.max(0, Math.min(1, remaining / total));
    // One second of linear travel per tick — the ring moves like a clock,
    // not like an animation easing to a stop.
    progress.value = withTiming(fraction, { duration: 1000, easing: Easing.linear });
  }, [remaining, total, progress]);

  useEffect(() => {
    // GDD 2.2 — at 15 seconds the ring starts pulsing.
    if (running && remaining <= Clock.tensionAt && remaining > 0) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(0.45, { duration: 380, easing: Easing.out(Easing.quad) }),
          withTiming(1, { duration: 380, easing: Easing.in(Easing.quad) }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 150 });
    }
    return () => cancelAnimation(pulse);
  }, [running, remaining, pulse]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: perimeter * (1 - progress.value),
  }));

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.container, pulseStyle]} pointerEvents="none">
      <Svg width={width} height={height}>
        {/* the track — what you have already spent */}
        <Rect
          x={INSET}
          y={INSET}
          width={w}
          height={h}
          rx={RADIUS}
          stroke={Palette.hairline}
          strokeWidth={STROKE}
          fill="none"
        />
        <AnimatedRect
          x={INSET}
          y={INSET}
          width={w}
          height={h}
          rx={RADIUS}
          stroke={accent}
          strokeWidth={STROKE}
          fill="none"
          // An ARRAY. `strokeDasharray` is a list in SVG and in the native
          // prop converter, and Fabric refuses a bare number the same way it
          // refuses a transform string — silently, at the C++ layer, on every
          // frame the ring animates. See CourtroomScene's frameProps.
          strokeDasharray={[perimeter]}
          animatedProps={animatedProps}
          strokeLinecap="butt"
        />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 10,
  },
});
