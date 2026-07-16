import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
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

  const onNext = () => {
    if (result.triggerReview) router.replace('/review');
    else router.replace('/lobby');
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

              {/* GDD 11.4 — instant debate starter. */}
              {result.consensus.sampleSize > 1 && (
                <Text style={styles.consensus}>
                  {result.consensus.guiltyPercent}% of jurors convicted.
                  {(result.consensus.guiltyPercent >= 50) === (result.verdict === 'guilty')
                    ? ' You did too.'
                    : ' You did not.'}
                </Text>
              )}
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
