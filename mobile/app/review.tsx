import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Fonts, Palette } from '@/constants/theme';
import { api, type ReviewEntry } from '@/lib/api';
import { newspaperFor } from '@/lib/press';
import { useGame } from '@/store/game';
import { useSettings } from '@/store/settings';

/**
 * GDD 6, Screen 6 — Dossier Review, every 10 cases.
 *
 * Newspaper layout. Outcomes in factual newspaper style, no editorialising.
 * Read-only. No redo. Scroll and sit with it.
 */
export default function Review() {
  const jurorId = useGame((s) => s.jurorId);
  // The paper of the city they actually sit in.
  const district = useGame((s) => s.standing?.district);
  const textScale = useSettings((s) => s.textScale);
  const [entries, setEntries] = useState<ReviewEntry[] | null>(null);

  useEffect(() => {
    if (!jurorId) {
      router.replace('/lobby');
      return;
    }
    api
      .review()
      .then((r) => setEntries(r.entries))
      .catch(() => setEntries([]));
  }, [jurorId]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.masthead}>
            <Text style={styles.mastheadName}>{newspaperFor(district)}</Text>
            <View style={styles.rule} />
            <Text style={styles.headline}>WHAT HAPPENED NEXT</Text>
            <View style={styles.rule} />
          </View>

          {entries === null && <ActivityIndicator color="#33332E" style={styles.spinner} />}

          {entries?.length === 0 && <Text style={styles.empty}>No cases on record.</Text>}

          {entries?.map((e) => (
            <View key={e.caseNumber} style={styles.entry}>
              <View style={styles.entryHead}>
                <Text style={styles.entryName}>{e.defendantName}</Text>
                <View style={[styles.verdictChip, { borderColor: e.accent }]}>
                  <Text style={[styles.verdictChipText, { color: e.accent }]}>
                    {e.wasHung ? 'HUNG' : e.verdict === 'guilty' ? 'GUILTY' : 'NOT GUILTY'}
                  </Text>
                </View>
              </View>

              <Text style={styles.entryMeta}>
                CASE {e.caseNumber} · {e.charge.toUpperCase()}
              </Text>

              {/* Just facts. What you do with them is your business. */}
              <Text
                style={[
                  styles.outcome,
                  // Same rule as the case screen: prose scales, the mono labels
                  // and rules around it do not. A text-size setting that only
                  // worked on one screen was a setting that half-worked.
                  { fontSize: 12.5 * textScale, lineHeight: 21 * textScale },
                ]}
              >
                {e.outcome}
              </Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={() => router.replace('/lobby')}
            style={styles.continue}
            accessibilityRole="button"
          >
            <Text style={styles.continueText}>CONTINUE</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  // The review is print, so it is the one screen that is paper-coloured.
  root: { flex: 1, backgroundColor: Palette.paper },
  safe: { flex: 1 },
  content: { paddingHorizontal: 22, paddingVertical: 16, gap: 4 },
  spinner: { marginTop: 40 },
  masthead: { alignItems: 'center', marginBottom: 18 },
  mastheadName: {
    fontFamily: Fonts.display,
    fontSize: 13,
    letterSpacing: 4,
    color: '#33332E',
  },
  rule: { height: 1, backgroundColor: '#33332E', alignSelf: 'stretch', marginVertical: 10 },
  headline: {
    fontFamily: Fonts.display,
    fontSize: 30,
    letterSpacing: 1,
    color: '#0D0D0D',
    textAlign: 'center',
  },
  empty: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: '#6B6558',
    textAlign: 'center',
    marginTop: 40,
  },
  entry: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#BDB7A9',
    gap: 4,
  },
  entryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  entryName: {
    fontFamily: Fonts.display,
    fontSize: 20,
    color: '#0D0D0D',
    flex: 1,
  },
  verdictChip: {
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 1,
  },
  verdictChipText: {
    fontFamily: Fonts.mono,
    fontSize: 7.5,
    letterSpacing: 1.2,
  },
  entryMeta: {
    fontFamily: Fonts.mono,
    fontSize: 8,
    letterSpacing: 1.4,
    color: '#6B6558',
  },
  outcome: {
    fontFamily: Fonts.mono,
    fontSize: 12.5,
    lineHeight: 21,
    color: '#1A1A17',
    marginTop: 6,
  },
  footer: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#BDB7A9',
  },
  continue: {
    backgroundColor: '#0D0D0D',
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 2,
  },
  continueText: {
    fontFamily: Fonts.uiBold,
    fontSize: 12,
    letterSpacing: 2.4,
    color: Palette.text,
  },
});
