import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Interstitial } from '@/components/Interstitial';
import { AccusedReaction } from '@/components/scene2d/AccusedReaction';
import { askForReminders } from '@/lib/reminders';
import { Fonts, Palette, Type } from '@/constants/theme';
import * as haptic from '@/lib/haptics';
import { useReducedMotion } from '@/lib/motion';
import { play } from '@/lib/sound';
import { useGame } from '@/store/game';
import { useSettings } from '@/store/settings';

/**
 * GDD 6, Screen 5 — Verdict Delivered.
 * No score. No stars. Just consequence.
 */
export default function VerdictDelivered() {
  const result = useGame((s) => s.lastResult);
  const lastAccent = useGame((s) => s.lastAccent);
  const lastDefendant = useGame((s) => s.lastDefendant);
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<'flash' | 'aftermath'>('flash');
  // The aftermath is the payload of this screen — the consequence the whole
  // game exists to deliver — and it ignored the player's text size.
  const textScale = useSettings((s) => s.textScale);
  /** Shown after the player has read the aftermath and asked to move on. */
  const [showingAd, setShowingAd] = useState(false);

  useEffect(() => {
    if (!result) {
      router.replace('/lobby');
      return;
    }
    // The gavel lands with the flash, not before it.
    play('gavel');
    haptic.gavel();

    // The first verdict is the moment to ask about reminders: the player has
    // just seen what the game is, and a city that reacts is worth being told
    // about. Never at launch, and only ever asked once by the OS.
    if (result.casesHeard === 1 || result.casesHeard === 3) void askForReminders();

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
      {/* The accused, reacting to what has just happened to them.
          Behind the accent flash so the colour washes over them, and behind
          everything else so it stays ground rather than content. Absent only
          if the store has no defendant — an app resumed straight onto this
          route, say — and the screen simply plays as it always did. */}
      {lastDefendant && (
        <AccusedReaction
          seed={lastDefendant.portraitSeed}
          cast={lastDefendant.cast}
          reaction={result.reaction}
          reducedMotion={reducedMotion}
        />
      )}

      {/* The screen flashes the case's accent, then keeps a trace of it.
          The tint lives on an inner view, and this is not a style choice.
          Reanimated's FadeIn animates `opacity` to 1, so putting the 0.16 in
          the same style it drives means the entering animation ends by
          overwriting it — the "trace" became an opaque wash of the accent
          across the whole screen. The verdict itself is drawn in that same
          accent, so the one word this entire screen exists to deliver was
          rendered invisible, on top of its own colour, every single time. */}
      <Animated.View
        entering={FadeIn.duration(90)}
        exiting={FadeOut.duration(600)}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      >
        <View style={[StyleSheet.absoluteFill, { backgroundColor: accent, opacity: 0.16 }]} />
      </Animated.View>

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
              <Text
                style={[
                  styles.aftermath,
                  { fontSize: Type.subhead * textScale, lineHeight: 29 * textScale },
                ]}
              >
                {result.aftermath}
              </Text>

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
              {(result.districtsOpened?.length ?? 0) > 0 && (
                <Text style={styles.opened}>
                  NEW COURT OPEN: {result.districtsOpened!.join(', ').toUpperCase()}
                </Text>
              )}
            </Animated.View>
          )}
        </View>

        {/* Tomorrow's paper, today. The court report this verdict made — the
            city talking back, which is the thing that brings a player back to
            the lobby to read the rest. Below the face, never over it. */}
        {phase === 'aftermath' && result.headlines && result.headlines.length > 0 && (
          <Animated.View entering={FadeIn.duration(700).delay(900)} style={styles.teaser}>
            <Pressable
              onPress={() => router.push('/news')}
              accessibilityRole="button"
              accessibilityLabel={`In the papers: ${result.headlines[0]!.headline}. Read the papers.`}
            >
              <Text style={styles.teaserEyebrow}>
                IN THE PAPERS · {result.headlines[0]!.outlet.toUpperCase()}
              </Text>
              <Text style={styles.teaserHead} numberOfLines={2}>
                {result.headlines[0]!.headline}
              </Text>
              {result.headlines[1] && (
                <Text style={styles.teaserSub} numberOfLines={1}>
                  Also: {result.headlines[1].headline}
                </Text>
              )}
            </Pressable>
          </Animated.View>
        )}

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
  opened: {
    fontFamily: Fonts.monoBold,
    fontSize: Type.micro,
    letterSpacing: 1.6,
    color: '#1FA184',
    marginTop: 6,
    textAlign: 'center',
  },
  teaser: {
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: Palette.paper,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 3,
  },
  teaserEyebrow: { fontFamily: Fonts.monoBold, fontSize: Type.micro, letterSpacing: 1.4, color: '#5E594E' },
  teaserHead: { fontFamily: Fonts.display, fontSize: Type.body, lineHeight: Type.body * 1.25, color: '#0D0D0D' },
  teaserSub: { fontFamily: Fonts.displayRegular, fontSize: Type.small, color: '#3A3730' },
  safe: { flex: 1 },
  // TOP, not centre. The accused is framed below this block — see
  // AccusedReaction's EYES_SCREEN — and a centred column of text lands
  // squarely on the face it is describing.
  center: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 26,
    paddingTop: '9%',
  },
  verdict: {
    fontFamily: Fonts.display,
    fontSize: 46,
    letterSpacing: 2,
    textAlign: 'center',
  },
  timing: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
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
    fontSize: Type.micro,
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
