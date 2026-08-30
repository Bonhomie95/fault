import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Fonts, Palette, Type } from '@/constants/theme';
import { courtCityFor } from '@/lib/press';
import { useGame } from '@/store/game';
import { useSettings } from '@/store/settings';

/**
 * GDD 6, Screen 2 — Briefing, first launch only.
 * A single letter. Read-only. No tutorial. No mechanics explanation.
 * This is intentional: you learn the job by doing it badly.
 */
export default function Briefing() {
  const jurorName = useGame((s) => s.jurorName);
  const district = useGame((s) => s.standing?.district);
  const markBriefed = useGame((s) => s.markBriefed);
  // The longest prose in the game and the first thing anyone reads. If the
  // text-size setting does not reach the letter, it does not reach the moment
  // the player most needs it.
  const textScale = useSettings((s) => s.textScale);
  const [canDismiss, setCanDismiss] = useState(false);

  // Five seconds before you are allowed to look away.
  useEffect(() => {
    const id = setTimeout(() => setCanDismiss(true), 5000);
    return () => clearTimeout(id);
  }, []);

  const dismiss = () => {
    if (!canDismiss) return;
    markBriefed();
    router.replace('/lobby');
  };

  return (
    // Scrollable, though it rarely needs to scroll. The letter is centred and
    // fixed-height, so at Larger text on a small phone the signature — and the
    // TAP TO CONTINUE that tells you what to do — would simply be off-screen
    // with no way to reach them. A player who cannot read small type is exactly
    // the player who would hit that.
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
    <Pressable onPress={dismiss} accessibilityRole="button">
      <Animated.View entering={FadeIn.duration(1200)} style={styles.letter}>
        <Text style={styles.crest}>◆</Text>
        <Text style={styles.from}>OFFICE OF THE CHIEF JUSTICE</Text>
        <View style={styles.rule} />

        <Text style={[styles.salutation, { fontSize: 19 * textScale }]}>
          {jurorName ? `${jurorName},` : 'Juror,'}
        </Text>

        <Animated.Text
          entering={FadeIn.duration(1400).delay(700)}
          style={[styles.body, { fontSize: 15 * textScale, lineHeight: 26 * textScale }]}
        >
          Your role is singular. You will hear evidence. You will decide.
          {'\n\n'}
          You are allowed two minutes for each case. The court does not grant
          extensions, and silence is itself a verdict.
          {'\n\n'}
          The city will remember.
        </Animated.Text>

        <Animated.View entering={FadeIn.duration(1000).delay(1800)} style={styles.signature}>
          <View style={styles.rule} />
          <Text style={styles.signatureName}>A. Oyelaran</Text>
          <Text style={styles.signatureTitle}>Chief Justice, {courtCityFor(district)}</Text>
        </Animated.View>
      </Animated.View>

      {canDismiss && (
        <Animated.Text entering={FadeInDown.duration(800)} style={styles.dismiss}>
          TAP TO CONTINUE
        </Animated.Text>
      )}
    </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Palette.bg,
  },
  scroll: {
    // flexGrow, not flex: the letter stays vertically centred when it fits and
    // becomes scrollable when it does not.
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 30,
    paddingVertical: 30,
  },
  letter: {
    backgroundColor: Palette.paper,
    paddingHorizontal: 26,
    paddingVertical: 34,
    borderRadius: 2,
  },
  crest: {
    fontSize: 16,
    color: '#33332E',
    textAlign: 'center',
    marginBottom: 12,
  },
  from: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 2.6,
    color: '#6B6558',
    textAlign: 'center',
  },
  rule: {
    height: 1,
    backgroundColor: '#A9A395',
    marginVertical: 18,
  },
  salutation: {
    fontFamily: Fonts.displayRegular,
    fontSize: 19,
    color: '#1A1A17',
    marginBottom: 16,
  },
  body: {
    fontFamily: Fonts.mono,
    fontSize: 15,
    lineHeight: 26,
    color: '#1A1A17',
  },
  signature: { marginTop: 26 },
  signatureName: {
    fontFamily: Fonts.displayRegular,
    fontSize: 20,
    color: '#1A1A17',
  },
  signatureTitle: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 1.4,
    color: '#6B6558',
    marginTop: 3,
  },
  dismiss: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 3,
    color: Palette.textFaint,
    textAlign: 'center',
    marginTop: 30,
  },
});
