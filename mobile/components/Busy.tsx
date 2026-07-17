import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Fonts, Palette } from '@/constants/theme';

/**
 * The room is doing something. Do not touch anything.
 *
 * A full-screen scrim that swallows every touch underneath it. Two jobs:
 *
 *  1. ONE PRESS, ONE ACTION. Without this, a slow network turns "open the case
 *     file" into three case files, "buy" into two purchases, and "promote" into
 *     a race. Disabling the button that was pressed is not enough — the player
 *     will press a different one.
 *
 *  2. SAY SOMETHING. A frozen screen with no explanation reads as a crash, and
 *     the player's next move is to force-quit — which, on a case, used to cost
 *     them the clock.
 *
 * `pointerEvents: 'auto'` on the root is the whole mechanism: the overlay is
 * the touch target, so nothing behind it can be.
 */

interface BusyProps {
  /** What is happening, in the game's voice. Not "Loading…". */
  label: string;
  /**
   * How long before we admit it is slow. Below this, showing anything at all
   * is worse than showing nothing: a spinner that flashes for 80ms reads as a
   * glitch, not as progress.
   */
  patienceMs?: number;
  /** Shown once the wait stops being reasonable. */
  slowLabel?: string;
  slowAfterMs?: number;
}

export function Busy({
  label,
  patienceMs = 180,
  slowLabel = 'The connection is slow. Still trying.',
  slowAfterMs = 4000,
}: BusyProps) {
  const [visible, setVisible] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const show = setTimeout(() => setVisible(true), patienceMs);
    const nag = setTimeout(() => setSlow(true), slowAfterMs);
    return () => {
      clearTimeout(show);
      clearTimeout(nag);
    };
  }, [patienceMs, slowAfterMs]);

  // Even before the label appears, the scrim is up and eating touches — the
  // debounce is about what the player *sees*, never about what they can press.
  return (
    <View style={styles.root} pointerEvents="auto" accessibilityViewIsModal>
      {visible && (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={styles.card}>
          <ActivityIndicator color={Palette.text} />
          <Text style={styles.label} accessibilityLiveRegion="polite">
            {label}
          </Text>
          {slow && (
            <Animated.Text entering={FadeIn.duration(300)} style={styles.slow}>
              {slowLabel}
            </Animated.Text>
          )}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13,13,13,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    zIndex: 100,
  },
  card: { alignItems: 'center', gap: 14, maxWidth: 300 },
  label: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    letterSpacing: 1.6,
    color: Palette.text,
    textAlign: 'center',
  },
  slow: {
    fontFamily: Fonts.mono,
    fontSize: 9.5,
    lineHeight: 15,
    color: Palette.textMuted,
    textAlign: 'center',
  },
});
