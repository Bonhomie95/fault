import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Fonts, Palette } from '@/constants/theme';

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
 * ───────────────────────────────────────────────────────────────────────────
 * NO AD NETWORK IS CONNECTED. This is the slot — correctly placed, correctly
 * gated, with the real lifecycle around it. Wiring
 * react-native-google-mobile-ads means replacing `fakeLoad` with the SDK's
 * load/show/close events; every state below already exists to receive them.
 * ───────────────────────────────────────────────────────────────────────────
 */

type Phase = 'loading' | 'showing' | 'failed';

/** How long we wait for an ad before deciding the player's time matters more. */
const LOAD_TIMEOUT_MS = 6000;
/** Minimum time the close button stays inert, as every real interstitial does. */
const MIN_WATCH_SECONDS = 3;

export function Interstitial({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [left, setLeft] = useState(MIN_WATCH_SECONDS);
  const [slow, setSlow] = useState(false);

  /**
   * Loading.
   *
   * The whole screen is inert while this runs — that is the point of the
   * overlay. An ad that takes four seconds on a bad connection must not leave
   * NEXT CASE tappable underneath, or the player taps it, gets a case, and the
   * ad arrives on top of the dossier with the clock already running.
   */
  useEffect(() => {
    const nag = setTimeout(() => setSlow(true), 1800);

    // Stand-in for the SDK's load callback.
    const loaded = setTimeout(() => setPhase('showing'), 900);

    /**
     * A failed or slow ad must never trap the player. If the network cannot
     * produce an advert in six seconds, that is the advertiser's problem and
     * we move on — nobody is held hostage to an impression.
     */
    const bail = setTimeout(() => {
      setPhase((p) => (p === 'loading' ? 'failed' : p));
    }, LOAD_TIMEOUT_MS);

    return () => {
      clearTimeout(nag);
      clearTimeout(loaded);
      clearTimeout(bail);
    };
  }, []);

  // A failed ad leaves immediately and silently. The player never learns that
  // an advert was supposed to happen, which is the correct amount to tell them.
  useEffect(() => {
    if (phase === 'failed') onDone();
  }, [phase, onDone]);

  useEffect(() => {
    if (phase !== 'showing') return;
    const id = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(id);
  }, [phase]);

  return (
    <View style={styles.root} pointerEvents="auto" accessibilityViewIsModal>
      {phase === 'loading' && (
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
      )}

      {phase === 'showing' && (
        <>
          <Animated.View entering={FadeIn.duration(200)} style={styles.card}>
            <Text style={styles.label}>A WORD FROM THE COURT&apos;S SPONSORS</Text>
            <Text style={styles.body}>
              This is where an advertisement would run. No ad network is connected yet.
            </Text>
            <Text style={styles.note}>
              Adverts never appear during a case — only between one and the next.
            </Text>
          </Animated.View>

          <Pressable
            onPress={left === 0 ? onDone : undefined}
            disabled={left > 0}
            style={[styles.close, left > 0 && styles.closeWaiting]}
            accessibilityRole="button"
            accessibilityLabel={left > 0 ? `Closes in ${left} seconds` : 'Continue'}
          >
            <Text style={styles.closeText}>{left > 0 ? `${left}` : 'CONTINUE'}</Text>
          </Pressable>
        </>
      )}
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
    fontSize: 9,
    letterSpacing: 2.2,
    color: Palette.textMuted,
    textAlign: 'center',
  },
  label: { fontFamily: Fonts.mono, fontSize: 8, letterSpacing: 2.4, color: Palette.textFaint },
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
