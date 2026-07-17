import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StandingBar } from '@/components/StandingBar';
import { CityScene } from '@/components/three/CityScene';
import { Fonts, Palette } from '@/constants/theme';
import { ApiError } from '@/lib/api';
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
    if (loading) return;
    setLoading(true);
    setGate(null);
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
            <Text style={styles.docket}>CASE DOCKET</Text>
            {city && (
              <Text style={styles.chapter}>
                CHAPTER {city.chapter} · {city.casesHeard} HEARD
              </Text>
            )}
          </View>

          {/* Who you are and where you sit — the record, on the way in. */}
          {standing && <StandingBar standing={standing} />}

          <Pressable
            style={styles.caseFile}
            onPress={beginCase}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Open the next case file"
          >
            {loading ? (
              <ActivityIndicator color={Palette.text} />
            ) : (
              <>
                <Text style={styles.caseFileLabel}>CASE FILE</Text>
                <Text style={styles.caseFileHint}>TAP TO BEGIN</Text>
                {/* The clock starts on load. You are already in the room. */}
                <Text style={styles.caseFileWarn}>THE CLOCK STARTS IMMEDIATELY</Text>
              </>
            )}
          </Pressable>

          {gate && (
            <Animated.Text entering={FadeIn} style={styles.gate}>
              {gate}
            </Animated.Text>
          )}

          {city && (
            <View style={styles.pulse}>
              <Text style={styles.pulseTitle}>CITY PULSE</Text>
              <PulseBar label="Crime" value={city.crimeRate} />
              <PulseBar label="Trust" value={city.judicialTrust} />
              <PulseBar label="Disparity" value={city.wealthDisparity} />
              <PulseBar label="Syndicate" value={city.organizedCrimePower} />
              <PulseBar label="Police" value={city.policeIntegrity} />
              <PulseBar label="Press" value={city.mediaPressure} />

              {city.activeFactions.length > 0 && (
                <Text style={styles.factions}>{city.activeFactions.join(' · ').toUpperCase()}</Text>
              )}
            </View>
          )}

          <View style={styles.links}>
            <LobbyLink label="The career" onPress={() => router.push('/career')} />
            {/* GDD Screen 3 — gated on rank, not on being right. */}
            <LobbyLink
              label="Review past cases"
              locked={standing ? !standing.unlocks.caseArchive : false}
              lockedNote={
                standing ? `OPENS TO JURORS OF RANK ${standing.unlocks.caseArchive ? '' : '2'}` : undefined
              }
              onPress={() => router.push('/review')}
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
    </View>
  );
}

/** GDD 6 — bars, blocky and unglamorous, like a printout. */
function PulseBar({ label, value }: { label: string; value: number }) {
  const filled = Math.round((value / 100) * 7);
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel}>{label}</Text>
      <Text style={styles.barTrack}>
        {'█'.repeat(filled)}
        <Text style={styles.barEmpty}>{'░'.repeat(7 - filled)}</Text>
      </Text>
      <Text style={styles.barValue}>{Math.round(value)}</Text>
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
  return (
    <Pressable
      onPress={locked ? undefined : onPress}
      disabled={locked}
      style={[styles.link, locked && styles.linkLocked]}
      accessibilityRole="button"
      accessibilityState={{ disabled: locked }}
    >
      <Text style={[styles.linkText, locked && styles.linkTextLocked]}>[ {label} ]</Text>
      {locked && lockedNote && <Text style={styles.linkNote}>{lockedNote}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  sceneWrap: { ...StyleSheet.absoluteFillObject },
  sceneFallback: { flex: 1, backgroundColor: Palette.bg },
  // Keeps the type legible over a moving city without hiding it.
  sceneScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13,13,13,0.55)',
  },
  safe: { flex: 1 },
  content: { padding: 22, gap: 22 },
  header: { gap: 4 },
  docket: {
    fontFamily: Fonts.display,
    fontSize: 26,
    letterSpacing: 1,
    color: Palette.text,
  },
  chapter: {
    fontFamily: Fonts.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: Palette.textMuted,
  },
  caseFile: {
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(28,28,25,0.86)',
    paddingVertical: 30,
    alignItems: 'center',
    borderRadius: 2,
    gap: 6,
  },
  caseFileLabel: {
    fontFamily: Fonts.display,
    fontSize: 20,
    letterSpacing: 3,
    color: Palette.text,
  },
  caseFileHint: {
    fontFamily: Fonts.mono,
    fontSize: 9,
    letterSpacing: 2.4,
    color: Palette.textMuted,
  },
  caseFileWarn: {
    fontFamily: Fonts.mono,
    fontSize: 8,
    letterSpacing: 1.8,
    color: '#C23B22',
    marginTop: 6,
  },
  gate: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    lineHeight: 18,
    color: '#D4860A',
    textAlign: 'center',
  },
  pulse: {
    backgroundColor: 'rgba(21,21,19,0.88)',
    borderWidth: 1,
    borderColor: Palette.hairline,
    padding: 16,
    borderRadius: 2,
    gap: 7,
  },
  pulseTitle: {
    fontFamily: Fonts.mono,
    fontSize: 9,
    letterSpacing: 3,
    color: Palette.textMuted,
    marginBottom: 4,
  },
  barRow: { flexDirection: 'row', alignItems: 'center' },
  barLabel: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: Palette.textMuted,
    width: 82,
  },
  barTrack: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Palette.text,
    letterSpacing: -1,
    flex: 1,
  },
  barEmpty: { color: Palette.textFaint },
  barValue: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: Palette.text,
    width: 26,
    textAlign: 'right',
  },
  factions: {
    fontFamily: Fonts.mono,
    fontSize: 8,
    letterSpacing: 1.6,
    color: '#6B4FBB',
    marginTop: 8,
  },
  links: { gap: 2 },
  link: { paddingVertical: 11 },
  linkLocked: { opacity: 0.45 },
  linkText: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    color: Palette.text,
  },
  linkTextLocked: { color: Palette.textFaint },
  linkNote: {
    fontFamily: Fonts.mono,
    fontSize: 8,
    letterSpacing: 1.4,
    color: Palette.textFaint,
    marginTop: 3,
  },
});
