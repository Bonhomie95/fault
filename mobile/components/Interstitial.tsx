import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Fonts, Palette, Type } from '@/constants/theme';
import { adsAvailable, showInterstitial } from '@/lib/ads';

/**
 * The interstitial.
 *
 * Placement is the design. It appears between the aftermath and the next case
 * — after the player has read what their verdict did, before they pick up the
 * next file. Never during a case, never over the verdict, never on the clock.
 * FAULT asks for 120 seconds of undivided attention and then sells the gap;
 * selling the 120 would break the only promise it makes.
 *
 * Whether it appears at all is the server's decision (`showInterstitial` on the
 * verdict response), on a 2-3 case cadence the client never sees.
 *
 *
 * The network is AdMob, registered at startup (lib/admob).
 */

/**
 * The overlay only covers the LOAD. The advert itself is the network's own
 * full-screen view, and `showInterstitial` resolves when the player closes
 * it — so by then there is nothing left to show, and we go straight on.
 */
export function Interstitial({ onDone }: { onDone: () => void }) {
  const [slow, setSlow] = useState(false);
  // The caller's callback, read at the end rather than subscribed to: a new
  // function every render must not restart the advert.
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    let cancelled = false;
    const nag = setTimeout(() => setSlow(true), 1800);
    void (async () => {
      // With no network registered this resolves false at once and the slot
      // fails open. A failed or slow ad must never trap the player: lib/ads
      // gives up after six seconds whatever the network is doing.
      if (adsAvailable()) await showInterstitial();
      if (!cancelled) done.current();
    })();
    return () => {
      cancelled = true;
      clearTimeout(nag);
    };
  }, []);

  return (
    <View style={styles.root} pointerEvents="auto" accessibilityViewIsModal>
      <Animated.View entering={FadeIn.duration(150)} style={styles.card}>
        <ActivityIndicator color={Palette.textMuted} />
        <Text style={styles.loadingLabel} accessibilityLiveRegion="polite">
          THE COURT WILL RESUME SHORTLY
        </Text>
        {slow && (
          <Animated.Text entering={FadeIn.duration(300)} style={styles.note}>
            Waiting on the network. This will not take longer than a few seconds.
          </Animated.Text>
        )}
      </Animated.View>
    </View>
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
    gap: 12,
    alignItems: 'center',
    maxWidth: 340,
  },
  loadingLabel: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 2.2,
    color: Palette.textMuted,
    textAlign: 'center',
  },
  note: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    lineHeight: 15,
    color: Palette.textMuted,
    textAlign: 'center',
  },
});
