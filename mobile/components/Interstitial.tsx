import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Fonts, Palette } from '@/constants/theme';

/**
 * The interstitial.
 *
 * Placement is the whole design here. It appears between the aftermath and the
 * next case — after the player has read what their verdict did, before they
 * pick up the next file. Never during a case, never over the verdict, never on
 * the clock. FAULT asks for 120 seconds of undivided attention and then sells
 * the gap; selling the 120 would break the only promise it makes.
 *
 * Whether it appears at all is the server's decision (`showInterstitial` on
 * the verdict response), on a 2-3 case cadence the client never sees.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NO AD NETWORK IS CONNECTED. This is the slot, correctly placed and
 * correctly gated, showing an honest placeholder. Wiring
 * react-native-google-mobile-ads means: load an interstitial on the lobby,
 * show it here, and report the close event. Everything around it — cadence,
 * entitlement, suppression, event recording — is done.
 * ───────────────────────────────────────────────────────────────────────────
 */

const MIN_SECONDS = 3;

export function Interstitial({ onDone }: { onDone: () => void }) {
  // A real interstitial has a dismiss timer. Mirroring it keeps the pacing
  // honest, so the slot does not feel free in testing and expensive in
  // production.
  const [left, setLeft] = useState(MIN_SECONDS);

  useEffect(() => {
    const id = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.label}>A WORD FROM THE COURT'S SPONSORS</Text>
        <Text style={styles.body}>
          This is where an advertisement would run. No ad network is connected yet.
        </Text>
        <Text style={styles.note}>
          Adverts never appear during a case — only between one and the next.
        </Text>
      </View>

      <Pressable
        onPress={left === 0 ? onDone : undefined}
        disabled={left > 0}
        style={[styles.close, left > 0 && styles.closeWaiting]}
        accessibilityRole="button"
        accessibilityLabel={left > 0 ? `Closes in ${left} seconds` : 'Continue'}
      >
        <Text style={styles.closeText}>{left > 0 ? `${left}` : 'CONTINUE'}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13,13,13,0.97)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
    gap: 22,
    zIndex: 50,
  },
  card: {
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderStyle: 'dashed',
    padding: 26,
    gap: 10,
    alignItems: 'center',
    maxWidth: 340,
  },
  label: {
    fontFamily: Fonts.mono,
    fontSize: 8,
    letterSpacing: 2.4,
    color: Palette.textFaint,
  },
  body: {
    fontFamily: Fonts.displayRegular,
    fontSize: 17,
    lineHeight: 25,
    color: Palette.text,
    textAlign: 'center',
  },
  note: {
    fontFamily: Fonts.mono,
    fontSize: 9,
    lineHeight: 15,
    color: Palette.textMuted,
    textAlign: 'center',
  },
  close: {
    borderWidth: 1,
    borderColor: Palette.hairline,
    paddingVertical: 13,
    paddingHorizontal: 30,
    minWidth: 130,
    alignItems: 'center',
    borderRadius: 2,
  },
  closeWaiting: { opacity: 0.4 },
  closeText: {
    fontFamily: Fonts.uiBold,
    fontSize: 12,
    letterSpacing: 2,
    color: Palette.text,
    fontVariant: ['tabular-nums'],
  },
});
