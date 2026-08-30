import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Fonts, Palette, Radius, Space, Type } from '@/constants/theme';

/**
 * What the accused is thinking, over their head, in a bubble.
 *
 * There is no voice yet (GDD: "no need for speech for now"), so the plea is
 * shown, not heard — typed out one word at a time the way a thought arrives,
 * held, then faded for the next one. It is styled as a thought bubble, tail and
 * all, because these are not lines addressed to the court: they are the thing
 * running under the still face while you decide.
 *
 * Like the face and the hands, the words are an unreliable channel — see
 * lib/defendantVoice. A juror moved by "please, look at me" is being moved by
 * nothing, and this is here so that pull is on the screen where you can feel it.
 */

interface ThoughtBoxProps {
  /** First-person lines, cycled in order and then repeated. */
  lines: string[];
  accent: string;
  /** Parent controls when the accused is the subject; hidden otherwise. */
  visible: boolean;
  reducedMotion?: boolean;
}

const CHAR_MS = 42; // per character while typing
const HOLD_MS = 2000; // dwell on a finished line
const FADE_MS = 360;

export function ThoughtBox({ lines, accent, visible, reducedMotion = false }: ThoughtBoxProps) {
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(0);
  const opacity = useSharedValue(0);
  // Timers for the current line's sequence, cleared whenever it restarts.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const line = lines.length > 0 ? lines[index % lines.length]! : '';

  useEffect(() => {
    if (!visible || lines.length === 0) return;

    const clear = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    clear();

    // Fade the new thought in, then either type it or (reduced motion) show it
    // whole. Either way: hold, fade out, advance.
    opacity.value = withTiming(1, { duration: reducedMotion ? 0 : 300 });

    const advance = () => setIndex((i) => (i + 1) % lines.length);
    const fadeThenAdvance = () => {
      opacity.value = withTiming(0, { duration: reducedMotion ? 0 : FADE_MS });
      timers.current.push(setTimeout(advance, reducedMotion ? 900 : FADE_MS + 40));
    };

    if (reducedMotion) {
      setShown(line.length);
      timers.current.push(setTimeout(fadeThenAdvance, 2400));
      return clear;
    }

    setShown(0);
    let n = 0;
    const typer = setInterval(() => {
      n += 1;
      setShown(n);
      if (n >= line.length) {
        clearInterval(typer);
        timers.current.push(setTimeout(fadeThenAdvance, HOLD_MS));
      }
    }, CHAR_MS);
    timers.current.push(typer as unknown as ReturnType<typeof setTimeout>);

    return () => {
      clearInterval(typer);
      clear();
    };
    // Re-run the whole sequence whenever the line changes or visibility flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, visible, reducedMotion, lines.length]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!visible || lines.length === 0) return null;

  const typing = shown < line.length;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Animated.View style={[styles.bubbleWrap, style]}>
        <View style={[styles.bubble, { borderColor: accent + '66' }]}>
          <Text style={styles.text}>
            {line.slice(0, shown)}
            {typing && <Text style={[styles.caret, { color: accent }]}>▌</Text>}
          </Text>
        </View>
        {/* the tail: two shrinking beads leading down toward the head, so it
            reads as a thought and not a caption */}
        <View style={[styles.beadLarge, { borderColor: accent + '66' }]} />
        <View style={[styles.beadSmall, { borderColor: accent + '66' }]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingHorizontal: Space.xl,
  },
  bubbleWrap: {
    alignItems: 'center',
    maxWidth: 300,
  },
  bubble: {
    backgroundColor: 'rgba(28,28,31,0.92)',
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  text: {
    fontFamily: Fonts.displayRegular,
    fontSize: Type.subhead,
    lineHeight: Type.subhead * 1.3,
    color: Palette.text,
    textAlign: 'center',
  },
  caret: {
    fontFamily: Fonts.mono,
    fontSize: Type.body,
  },
  beadLarge: {
    marginTop: 5,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: 'rgba(28,28,31,0.92)',
  },
  beadSmall: {
    marginTop: 4,
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1,
    backgroundColor: 'rgba(28,28,31,0.92)',
  },
});
