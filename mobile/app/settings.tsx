import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Clock, Fonts, Palette } from '@/constants/theme';
import { useGame } from '@/store/game';

/**
 * GDD 6, Screen 8 — Settings.
 *
 * The timer tiers are accessibility, not difficulty. GDD 12 is explicit that
 * they carry no penalty and no badge change, so nothing here is labelled
 * "easy" and nothing is marked on your record.
 */
export default function Settings() {
  const clockSeconds = useGame((s) => s.clockSeconds);
  const setClockSeconds = useGame((s) => s.setClockSeconds);
  const jurorName = useGame((s) => s.jurorName);

  const [haptics, setHaptics] = useState(true);
  const [ambient, setAmbient] = useState(true);
  const [saving, setSaving] = useState(false);

  const pickClock = async (seconds: number) => {
    if (saving || seconds === clockSeconds) return;
    setSaving(true);
    try {
      await setClockSeconds(seconds);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>SETTINGS</Text>
          {jurorName && <Text style={styles.juror}>JUROR: {jurorName.toUpperCase()}</Text>}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>DELIBERATION CLOCK</Text>
            <Text style={styles.sectionNote}>
              No penalty. No change to your record. Take the time you need.
            </Text>
            <View style={styles.tiers}>
              {Clock.accessibleTiers.map((tier) => (
                <Pressable
                  key={tier}
                  onPress={() => pickClock(tier)}
                  style={[styles.tier, clockSeconds === tier && styles.tierActive]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: clockSeconds === tier }}
                >
                  <Text style={[styles.tierText, clockSeconds === tier && styles.tierTextActive]}>
                    {tier}s
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>THE ROOM</Text>
            <ToggleRow label="Ambient tension" value={ambient} onChange={setAmbient} />
            <ToggleRow label="Haptics" value={haptics} onChange={setHaptics} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>DATA</Text>
            <Text style={styles.sectionNote}>
              Verdict history export arrives with the campaign build.
            </Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable onPress={() => router.back()} style={styles.close} accessibilityRole="button">
            <Text style={styles.closeText}>CLOSE</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: Palette.hairline, true: '#1D7E6A' }}
        thumbColor={Palette.text}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  safe: { flex: 1 },
  content: { padding: 22, gap: 26 },
  title: {
    fontFamily: Fonts.display,
    fontSize: 28,
    color: Palette.text,
  },
  juror: {
    fontFamily: Fonts.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: Palette.textMuted,
    marginTop: -18,
  },
  section: { gap: 10 },
  sectionTitle: {
    fontFamily: Fonts.mono,
    fontSize: 8.5,
    letterSpacing: 2.4,
    color: Palette.textMuted,
  },
  sectionNote: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    lineHeight: 18,
    color: Palette.textFaint,
  },
  tiers: { flexDirection: 'row', gap: 8 },
  tier: {
    flex: 1,
    borderWidth: 1,
    borderColor: Palette.hairline,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 2,
  },
  tierActive: { borderColor: Palette.text, backgroundColor: Palette.surfaceRaised },
  tierText: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    color: Palette.textMuted,
  },
  tierTextActive: { color: Palette.text },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  toggleLabel: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    color: Palette.text,
  },
  footer: { paddingHorizontal: 22, paddingBottom: 12 },
  close: {
    borderWidth: 1,
    borderColor: Palette.hairline,
    paddingVertical: 15,
    alignItems: 'center',
    borderRadius: 2,
  },
  closeText: {
    fontFamily: Fonts.uiBold,
    fontSize: 11,
    letterSpacing: 2.2,
    color: Palette.text,
  },
});
