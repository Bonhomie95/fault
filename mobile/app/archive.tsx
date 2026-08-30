import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Fonts, Layout, Palette, Space, Type, Verdict as VerdictColour } from '@/constants/theme';
import { api, ApiError, type HistoryEntry } from '@/lib/api';
import { useGame } from '@/store/game';
import { useSettings } from '@/store/settings';

/**
 * GDD Screen 3 — "Review past cases". The whole record, not just the last ten.
 *
 * The server has had this endpoint and its rank-2 gate all along. The client
 * had no method to call it and no screen to show it, so the thing the gate
 * unlocked was unreachable from inside the app — a lock on a door with no room
 * behind it.
 *
 * Paged, because the endpoint no longer hands back an entire career in one
 * response. A juror at case 500 was previously sending five hundred dossiers,
 * evidence JSON and all, down a phone connection to render a list of charges.
 */
export default function Archive() {
  const jurorId = useGame((s) => s.jurorId);
  const textScale = useSettings((s) => s.textScale);

  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [locked, setLocked] = useState<string | null>(null);

  const load = useCallback(
    async (before?: string) => {
      try {
        const page = await api.history(before);
        setEntries((prev) => (before ? [...prev, ...page.entries] : page.entries));
        setCursor(page.nextCursor);
      } catch (err) {
        // 423 is the rank gate, and it explains itself. Anything else is a
        // failure the player can retry.
        setLocked(
          err instanceof ApiError && err.status === 423
            ? err.message
            : 'The archive could not be reached.',
        );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!jurorId) {
      router.replace('/lobby');
      return;
    }
    void load();
  }, [jurorId, load]);

  /** One more page, when the list reaches its end. */
  const loadMore = useCallback(() => {
    if (!cursor || loadingMore || loading) return;
    setLoadingMore(true);
    void load(cursor);
  }, [cursor, loadingMore, loading, load]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.kicker}>THE RECORD</Text>
          <Text style={styles.title}>EVERY CASE YOU HAVE HEARD</Text>
        </View>

        {loading && <ActivityIndicator color={Palette.text} style={styles.spinner} />}

        {locked && !loading && <Text style={styles.locked}>{locked}</Text>}

        {!loading && !locked && entries.length === 0 && (
          <Text style={styles.locked}>Nothing on the record yet.</Text>
        )}

        {!locked && (
          <FlatList
            data={entries}
            keyExtractor={(e) => `${e.caseNumber}`}
            contentContainerStyle={styles.list}
            onEndReached={loadMore}
            onEndReachedThreshold={0.4}
            showsVerticalScrollIndicator={false}
            ListFooterComponent={
              loadingMore ? <ActivityIndicator color={Palette.textFaint} style={styles.spinner} /> : null
            }
            renderItem={({ item }) => <Entry entry={item} scale={textScale} />}
          />
        )}

        <View style={styles.footer}>
          <Button label="Back to the docket" onPress={() => router.replace('/lobby')} variant="primary" />
        </View>
      </SafeAreaView>
    </View>
  );
}

function Entry({ entry, scale }: { entry: HistoryEntry; scale: number }) {
  const colour = entry.wasHung
    ? VerdictColour.hung
    : entry.verdict === 'guilty'
      ? VerdictColour.guilty
      : VerdictColour.notGuilty;

  // The word, always, beside the colour — roughly one man in twelve cannot
  // tell these two hues apart, and this is the one fact each row carries.
  const label = entry.wasHung ? 'HUNG' : entry.verdict === 'guilty' ? 'GUILTY' : 'NOT GUILTY';

  return (
    <Pressable
      style={[styles.entry, { borderLeftColor: entry.accent }]}
      accessibilityRole="text"
      accessibilityLabel={`Case ${entry.caseNumber}. ${entry.defendantName}, ${entry.charge}. You returned ${label}.${entry.outcome ? ` ${entry.outcome}` : ''}`}
    >
      <View style={styles.entryTop}>
        <Text style={styles.caseNumber}>№ {String(entry.caseNumber).padStart(3, '0')}</Text>
        <Text style={[styles.verdict, { color: colour }]}>{label}</Text>
      </View>

      <Text style={[styles.name, { fontSize: Type.body * scale }]}>{entry.defendantName}</Text>
      <Text style={[styles.charge, { fontSize: Type.micro * scale }]}>{entry.charge}</Text>

      {/* The consequence, once it has been read at a review break. Before that
          it stays sealed — the game does not spoil its own outcome here. */}
      {entry.outcome ? (
        <Text style={[styles.outcome, { fontSize: Type.small * scale, lineHeight: 20 * scale }]}>
          {entry.outcome}
        </Text>
      ) : (
        <Text style={styles.sealed}>OUTCOME NOT YET REPORTED</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  safe: { flex: 1 },
  header: { paddingHorizontal: Space.xl, paddingTop: Space.md, gap: Space.xs },
  kicker: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 2.4,
    color: Palette.textFaint,
  },
  title: { fontFamily: Fonts.display, fontSize: Type.heading, color: Palette.text },
  spinner: { marginTop: Space.xl },
  locked: {
    fontFamily: Fonts.mono,
    fontSize: Type.small,
    lineHeight: 22,
    color: Palette.textMuted,
    paddingHorizontal: Space.xl,
    marginTop: Space.xl,
  },
  list: { padding: Space.lg, gap: Space.sm },
  entry: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: Palette.hairline,
    backgroundColor: Palette.surface,
    borderRadius: 4,
    padding: Space.lg,
    gap: 3,
    minHeight: Layout.touchMin,
  },
  entryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  caseNumber: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 1.2,
    color: Palette.textFaint,
    fontVariant: ['tabular-nums'],
  },
  verdict: { fontFamily: Fonts.monoBold, fontSize: Type.micro, letterSpacing: 1.6 },
  name: { fontFamily: Fonts.display, color: Palette.text, marginTop: Space.xs },
  charge: { fontFamily: Fonts.mono, color: Palette.textMuted },
  outcome: {
    fontFamily: Fonts.displayRegular,
    fontStyle: 'italic',
    color: Palette.textMuted,
    marginTop: Space.sm,
  },
  sealed: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 1.2,
    color: Palette.textFaint,
    marginTop: Space.sm,
  },
  footer: { padding: Space.lg },
});
