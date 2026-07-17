import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Fonts, Palette } from '@/constants/theme';
import { api, type JurorRecord } from '@/lib/api';
import { useGame } from '@/store/game';

/**
 * GDD 6, Screen 7 — Juror Record. Unlocks after case 10.
 *
 * Not a stats screen — a character profile the game writes about YOU.
 * It reads like a journalist wrote it, because one did.
 */
export default function Record() {
  const jurorId = useGame((s) => s.jurorId);
  const [record, setRecord] = useState<JurorRecord | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!jurorId) {
      router.replace('/lobby');
      return;
    }
    api
      .jurorRecord()
      .then(setRecord)
      .catch(() => setLocked(true));
  }, [jurorId]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.kicker}>THE ORUN HERALD · CITY DESK</Text>
          <Text style={styles.headline}>THE JUROR</Text>

          {!record && !locked && <ActivityIndicator color={Palette.text} style={styles.spinner} />}

          {locked && <Text style={styles.locked}>This record opens after ten cases.</Text>}

          {record && (
            <>
              <Text style={styles.byline}>
                {record.jurorName.toUpperCase()} · {record.casesHeard} CASES HEARD
              </Text>

              {/* The profile the game wrote about you. Post-worthy (GDD 11.2). */}
              <Text style={styles.profile}>{record.profile}</Text>

              <View style={styles.trajectoryBlock}>
                <Text style={styles.trajectoryTitle}>THE CITY UNDER YOUR TENURE</Text>
                {Object.entries(record.cityTrajectory).map(([key, value]) => (
                  <TrajectoryRow key={key} label={humanise(key)} value={value} />
                ))}
              </View>
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={() => router.replace('/lobby')}
            style={styles.back}
            accessibilityRole="button"
          >
            <Text style={styles.backText}>BACK TO DOCKET</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function humanise(key: string): string {
  const map: Record<string, string> = {
    crimeRate: 'Crime',
    judicialTrust: 'Judicial trust',
    wealthDisparity: 'Wealth disparity',
    organizedCrimePower: 'Organised crime',
    policeIntegrity: 'Police integrity',
    mediaPressure: 'Media pressure',
  };
  return map[key] ?? key;
}

function TrajectoryRow({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.trajectoryRow}>
      <Text style={styles.trajectoryLabel}>{label}</Text>
      <View style={styles.trajectoryTrack}>
        <View style={[styles.trajectoryFill, { width: `${Math.max(0, Math.min(100, value))}%` }]} />
      </View>
      <Text style={styles.trajectoryValue}>{Math.round(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  safe: { flex: 1 },
  content: { paddingHorizontal: 22, paddingVertical: 18 },
  spinner: { marginTop: 40 },
  kicker: {
    fontFamily: Fonts.mono,
    fontSize: 8,
    letterSpacing: 2.6,
    color: Palette.textMuted,
  },
  headline: {
    fontFamily: Fonts.display,
    fontSize: 40,
    letterSpacing: 1,
    color: Palette.text,
    marginTop: 6,
  },
  byline: {
    fontFamily: Fonts.mono,
    fontSize: 9,
    letterSpacing: 1.8,
    color: Palette.textMuted,
    marginTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairline,
  },
  locked: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Palette.textMuted,
    marginTop: 40,
    textAlign: 'center',
  },
  profile: {
    fontFamily: Fonts.displayRegular,
    fontSize: 18,
    lineHeight: 30,
    color: Palette.text,
    marginTop: 22,
  },
  trajectoryBlock: {
    marginTop: 36,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: Palette.hairline,
    gap: 9,
  },
  trajectoryTitle: {
    fontFamily: Fonts.mono,
    fontSize: 8,
    letterSpacing: 2.4,
    color: Palette.textMuted,
    marginBottom: 6,
  },
  trajectoryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trajectoryLabel: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    color: Palette.textMuted,
    width: 106,
  },
  trajectoryTrack: {
    flex: 1,
    height: 3,
    backgroundColor: Palette.hairline,
  },
  trajectoryFill: { height: 3, backgroundColor: Palette.text },
  trajectoryValue: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    color: Palette.text,
    width: 24,
    textAlign: 'right',
  },
  footer: { paddingHorizontal: 22, paddingBottom: 12 },
  back: {
    borderWidth: 1,
    borderColor: Palette.hairline,
    paddingVertical: 15,
    alignItems: 'center',
    borderRadius: 2,
  },
  backText: {
    fontFamily: Fonts.uiBold,
    fontSize: 11,
    letterSpacing: 2.2,
    color: Palette.text,
  },
});
