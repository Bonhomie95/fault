import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Interstitial } from '@/components/Interstitial';
import { Fonts, Palette } from '@/constants/theme';
import { useGame } from '@/store/game';

/**
 * GDD 6, Screen 5 — Verdict Delivered.
 * No score. No stars. Just consequence.
 */
export default function VerdictDelivered() {
  const result = useGame((s) => s.lastResult);
  const lastAccent = useGame((s) => s.lastAccent);
  const [phase, setPhase] = useState<'flash' | 'aftermath'>('flash');
  /** Shown after the player has read the aftermath and asked to move on. */
  const [showingAd, setShowingAd] = useState(false);

  useEffect(() => {
    if (!result) {
      router.replace('/lobby');
      return;
    }
    // Two seconds to sit with it before the room tells you what happened.
    const id = setTimeout(() => setPhase('aftermath'), 2000);
    return () => clearTimeout(id);
  }, [result]);

  if (!result) return <View style={styles.root} />;

  const accent = lastAccent ?? '#C23B22';
  const label = result.verdict === 'guilty' ? 'GUILTY' : 'NOT GUILTY';

  const leave = () => {
    if (result.triggerReview) router.replace('/review');
    else router.replace('/lobby');
  };

  /**
   * The ad, if the server said one is due, goes here — after the aftermath has
   * been read and the player has chosen to move on. Never before it: the
   * consequence of a verdict is the payload of this screen, and an advert on
   * top of it would be selling the moment the game exists to deliver.
   */
  const onNext = () => {
    if (result.showInterstitial) setShowingAd(true);
    else leave();
  };

  return (
    <View style={styles.root}>
      {/* The screen flashes the case's accent, then keeps a trace of it. */}
      <Animated.View
        entering={FadeIn.duration(90)}
        exiting={FadeOut.duration(600)}
        style={[StyleSheet.absoluteFill, { backgroundColor: accent, opacity: 0.16 }]}
      />

      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Animated.Text entering={FadeIn.duration(240)} style={[styles.verdict, { color: accent }]}>
            {label}
          </Animated.Text>

          <Animated.Text entering={FadeIn.duration(400).delay(200)} style={styles.timing}>
            {result.wasHung
              ? 'THE CLOCK DECIDED · RECORDED AS HUNG'
              : `DELIVERED WITH ${result.timeRemaining}S REMAINING`}
          </Animated.Text>

          {phase === 'aftermath' && (
            <Animated.View entering={FadeIn.duration(900)} style={styles.aftermathBlock}>
              <Text style={styles.aftermath}>{result.aftermath}</Text>

              {/* GDD 11.4 — instant debate starter.
                  Currently unreachable: cases are per-player, so sampleSize is
                  always 1. It needs the shared daily docket. */}
              {result.consensus.sampleSize > 1 && (
                <Text style={styles.consensus}>
                  {result.consensus.guiltyPercent}% of jurors convicted.
                  {(result.consensus.guiltyPercent >= 50) === (result.verdict === 'guilty')
                    ? ' You did too.'
                    : ' You did not.'}
                </Text>
              )}

              {/* Service, paid on the spot. Standing is deliberately absent —
                  it lands at the review with the outcome that earned it. */}
              <Text style={styles.earned}>
                +{result.meritAwarded} MERIT{result.promoted ? '  ·  PROMOTED' : ''}
              </Text>
            </Animated.View>
          )}
        </View>

        {phase === 'aftermath' && (
          <Animated.View entering={FadeIn.duration(600).delay(500)} style={styles.footer}>
            <Pressable onPress={onNext} style={styles.next} accessibilityRole="button">
              <Text style={styles.nextText}>
                {result.triggerReview ? 'WHAT HAPPENED NEXT' : 'NEXT CASE'}
              </Text>
            </Pressable>
          </Animated.View>
        )}
      </SafeAreaView>

      {showingAd && <Interstitial onDone={leave} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  safe: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 26 },
  verdict: {
    fontFamily: Fonts.display,
    fontSize: 46,
    letterSpacing: 2,
    textAlign: 'center',
  },
  timing: {
    fontFamily: Fonts.mono,
    fontSize: 9,
    letterSpacing: 2.2,
    color: Palette.textMuted,
    marginTop: 12,
  },
  aftermathBlock: { marginTop: 46, alignItems: 'center', gap: 18 },
  aftermath: {
    fontFamily: Fonts.displayRegular,
    fontSize: 19,
    lineHeight: 28,
    color: Palette.text,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  consensus: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    lineHeight: 18,
    color: Palette.textMuted,
    textAlign: 'center',
  },
  earned: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    letterSpacing: 1.8,
    color: '#D4860A',
    textAlign: 'center',
  },
  footer: { paddingHorizontal: 22, paddingBottom: 12 },
  next: {
    borderWidth: 1,
    borderColor: Palette.hairline,
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 2,
  },
  nextText: {
    fontFamily: Fonts.uiBold,
    fontSize: 12,
    letterSpacing: 2.4,
    color: Palette.text,
  },
});
