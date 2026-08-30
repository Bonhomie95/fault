import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Busy } from '@/components/Busy';
import { StandingBar } from '@/components/StandingBar';
import { CityScene } from '@/components/three/CityScene';
import { Button } from '@/components/Button';
import { Accents, Elevation, Fonts, IMPACT_LEADING, Palette, Radius, Space, Type } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import * as haptic from '@/lib/haptics';
import { play } from '@/lib/sound';
import { useGame } from '@/store/game';

/**
 * GDD 6, Screen 3 — Courthouse Lobby.
 *
 * The City Pulse is the only place the numbers appear, and even here they are
 * a consequence, not a score. The city model behind them is the real readout;
 * the bars are just the part you can quote.
 */
export default function Lobby() {
  const city = useGame((s) => s.city);
  const standing = useGame((s) => s.standing);
  const refreshCity = useGame((s) => s.refreshCity);
  const refreshStanding = useGame((s) => s.refreshStanding);
  const loadCase = useGame((s) => s.loadCase);
  const [loading, setLoading] = useState(false);
  const [gate, setGate] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refreshCity();
      void refreshStanding();
    }, [refreshCity, refreshStanding]),
  );

  const beginCase = useCallback(async () => {
    // Guarded three ways: this check, the disabled prop, and the Busy scrim.
    // Opening a case costs a Groq generation and starts a 120-second clock —
    // a double-tap here is the most expensive accident available.
    if (loading) return;
    setLoading(true);
    setGate(null);
    play('paper');
    haptic.tapLight();
    try {
      await loadCase();
      router.push('/case');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'trial_complete') {
        setGate(err.message);
      } else {
        setGate('The docket could not be reached.');
      }
    } finally {
      setLoading(false);
    }
  }, [loading, loadCase]);

  const recordUnlocked = (city?.casesHeard ?? 0) >= 10;

  return (
    <View style={styles.root}>
      {/* Orun City, as your verdicts have left it. */}
      <View style={styles.sceneWrap}>
        {city ? <CityScene city={city} /> : <View style={styles.sceneFallback} />}
        <View style={styles.sceneScrim} pointerEvents="none" />
      </View>

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.docket}>CASE{'\n'}DOCKET</Text>
            {city && (
              <View style={styles.chapterRow}>
                <View style={styles.chip}>
                  <Text style={styles.chipText}>CHAPTER {city.chapter}</Text>
                </View>
                <Text style={styles.chapter}>{city.casesHeard} HEARD</Text>
              </View>
            )}
          </View>

          {/* Who you are and where you sit — the record, on the way in. */}
          {standing && <StandingBar standing={standing} />}

          {/* The one thing this screen is for. It is the only filled button on
              the page, because it is the only action that matters. */}
          <View style={styles.caseFile}>
            <Text style={styles.caseFileEyebrow}>NEXT ON THE DOCKET</Text>
            <Text style={styles.caseFileLabel}>A CASE FILE{'\n'}IS WAITING</Text>
            <Button
              label="Open the file"
              onPress={beginCase}
              variant="primary"
              busy={loading}
              accent={Accents.financial}
              hint="The clock starts immediately"
              accessibilityLabel="Open the next case file. The clock starts immediately."
              style={styles.caseFileBtn}
            />
          </View>

          {/* NOT an entering animation, deliberately.
              This is the only thing on the screen that explains why the one
              button that matters did nothing — the trial docket is closed and
              the case was refused with a 402. Wrapped in `Animated.Text
              entering={FadeIn}` it was mounted, laid out, given its colour and
              left at `visibility: hidden` forever, so the player saw a button
              that did nothing at all and no reason why. Adding a duration does
              not fix it; the same is true of the notices on the store and
              career screens, and they are plain Text for the same reason. A
              message a player has to read does not get to depend on an
              animation running. */}
          {gate && <Text style={styles.gate}>{gate}</Text>}

          {city && (
            <View style={styles.pulse}>
              <Text style={styles.pulseTitle}>CITY PULSE</Text>
              <PulseBar label="Crime" value={city.crimeRate} tint={Accents.violent} />
              <PulseBar label="Trust" value={city.judicialTrust} tint={Accents.systemic} />
              <PulseBar label="Disparity" value={city.wealthDisparity} tint={Accents.financial} />
              <PulseBar label="Syndicate" value={city.organizedCrimePower} tint={Accents.passion} />
              <PulseBar label="Police" value={city.policeIntegrity} tint={Accents.systemic} />
              <PulseBar label="Press" value={city.mediaPressure} tint={Accents.financial} />

              {city.activeFactions.length > 0 && (
                <Text style={styles.factions}>{city.activeFactions.join(' · ').toUpperCase()}</Text>
              )}
            </View>
          )}

          <View style={styles.links}>
            <LobbyLink label="The career" onPress={() => router.push('/career')} />
            <LobbyLink label="The cities" onPress={() => router.push('/boards')} />
            {/* GDD Screen 3 — gated on rank, not on being right.

                This pointed at /review, which is the Dossier Review BREAK —
                a different screen with a side effect. Opening it calls
                GET /api/review, which marks the last ten outcomes as seen and
                settles every pending trust delta. So tapping "Review past
                cases" from the lobby quietly cashed in the player's standing
                early and burned the outcome reveals the next real break was
                supposed to deliver, which is the one beat the whole delayed-
                consequence design exists to protect.

                /archive is the read-only record, and has no side effects. */}
            <LobbyLink
              label="Review past cases"
              locked={standing ? !standing.unlocks.caseArchive : false}
              lockedNote={
                standing && !standing.unlocks.caseArchive ? 'OPENS TO JURORS OF RANK 2' : undefined
              }
              onPress={() => router.push('/archive')}
            />
            <LobbyLink
              label="Juror record"
              locked={!recordUnlocked}
              lockedNote={`UNLOCKS AT 10 CASES · ${city?.casesHeard ?? 0}/10`}
              onPress={() => router.push('/record')}
            />
            <LobbyLink label="Settings" onPress={() => router.push('/settings')} />
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Nothing on this screen is tappable while the docket is being fetched. */}
      {loading && <Busy label="THE CLERK IS FETCHING THE FILE" />}
    </View>
  );
}

/**
 * A city meter.
 *
 * This used to be `'█'.repeat(filled)` — a bar drawn out of block characters in
 * a monospace font, quantised to seven steps, so a shift from 50 to 57 moved
 * nothing at all. It is geometry now: real width, real colour, and the number
 * in a tabular face so the column does not jitter as digits change.
 *
 * Colour is by role rather than by good/bad, because none of these are good or
 * bad — a city with no crime and no trust is not a city anyone wants.
 */
function PulseBar({ label, value, tint }: { label: string; value: number; tint: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View
      style={styles.barRow}
      accessibilityRole="progressbar"
      accessibilityLabel={`${label}: ${Math.round(pct)} out of 100`}
    >
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: tint }]} />
      </View>
      <Text style={styles.barValue}>{Math.round(pct)}</Text>
    </View>
  );
}

function LobbyLink({
  label,
  onPress,
  locked = false,
  lockedNote,
}: {
  label: string;
  onPress: () => void;
  locked?: boolean;
  lockedNote?: string;
}) {
  // `[ label ]` used to be the whole button. Square brackets around monospace
  // text is a text-adventure convention, not an affordance: nothing looked
  // pressable and nothing responded when it was pressed.
  return (
    <Button
      label={label}
      onPress={onPress}
      variant="secondary"
      disabled={locked}
      hint={locked ? lockedNote : undefined}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  sceneWrap: { ...StyleSheet.absoluteFillObject },
  sceneFallback: { flex: 1, backgroundColor: Palette.bg },
  // Keeps the type legible over a moving city without hiding it.
  sceneScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11,11,12,0.62)',
  },
  safe: { flex: 1 },
  content: { padding: Space.xl, gap: Space.xl, paddingBottom: Space.xxxl },

  header: { gap: Space.md, marginTop: Space.sm },
  docket: {
    fontFamily: Fonts.impact,
    fontSize: Type.hero,
    lineHeight: Type.hero * IMPACT_LEADING,
    letterSpacing: 0.5,
    color: Palette.text,
    textTransform: 'uppercase',
  },
  chapterRow: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  chip: {
    backgroundColor: Palette.surfaceHigh,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs + 1,
    borderRadius: Radius.pill,
  },
  chipText: {
    fontFamily: Fonts.uiBold,
    fontSize: Type.micro,
    letterSpacing: 1.4,
    color: Palette.text,
  },
  chapter: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 1.8,
    color: Palette.textMuted,
  },

  caseFile: {
    backgroundColor: Palette.surfaceRaised,
    borderRadius: Radius.lg,
    padding: Space.xl,
    gap: Space.sm,
    borderWidth: 1,
    borderColor: Palette.hairlineBright,
    ...Elevation.raised,
  },
  caseFileEyebrow: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 2.2,
    color: Accents.financial,
  },
  caseFileLabel: {
    fontFamily: Fonts.impact,
    fontSize: Type.title,
    lineHeight: Type.title * IMPACT_LEADING,
    color: Palette.text,
    textTransform: 'uppercase',
  },
  caseFileBtn: { marginTop: Space.lg },

  gate: {
    fontFamily: Fonts.ui,
    fontSize: Type.small,
    lineHeight: 20,
    color: Accents.financial,
    textAlign: 'center',
  },

  pulse: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.hairline,
    padding: Space.lg,
    borderRadius: Radius.lg,
    gap: Space.md,
    ...Elevation.card,
  },
  pulseTitle: {
    fontFamily: Fonts.uiBold,
    fontSize: Type.micro,
    letterSpacing: 2.4,
    color: Palette.textMuted,
    marginBottom: Space.xs,
  },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  barLabel: {
    fontFamily: Fonts.ui,
    fontSize: Type.small,
    color: Palette.text,
    width: 78,
  },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: Radius.pill,
    backgroundColor: Palette.surfaceHigh,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: Radius.pill },
  barValue: {
    fontFamily: Fonts.monoBold,
    fontSize: Type.small,
    color: Palette.text,
    width: 28,
    textAlign: 'right',
    // Digits must not shift the column as they change.
    fontVariant: ['tabular-nums'],
  },
  factions: {
    fontFamily: Fonts.uiBold,
    fontSize: Type.micro,
    letterSpacing: 1.4,
    color: Accents.passion,
    marginTop: Space.sm,
  },

  links: { gap: Space.md },
});
