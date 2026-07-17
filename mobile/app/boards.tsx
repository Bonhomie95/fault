import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Fonts, Palette } from '@/constants/theme';
import { Seal, sealFrom } from '@/components/Seal';
import { api, type Board, type BoardView } from '@/lib/api';
import { useGame } from '@/store/game';

/**
 * The boards.
 *
 * Two lists off one scale: the cities most at peace and the cities most lost.
 * Nobody tops both.
 *
 * A player outside the top 100 gets a pinned row at the foot of the screen
 * showing exactly where they stand — tapping it jumps the list to their
 * position if they are on it, and otherwise just states the number. You should
 * never have to scroll 4,000 rows to find yourself.
 */
export default function Boards() {
  const jurorId = useGame((s) => s.jurorId);
  const mySeal = sealFrom(useGame((s) => s.entitlements));
  const [board, setBoard] = useState<Board>('peaceful');
  const [view, setView] = useState<BoardView | null>(null);
  const [loading, setLoading] = useState(true);

  const scroller = useRef<ScrollView>(null);
  const youOffset = useRef<number | null>(null);

  useEffect(() => {
    if (!jurorId) {
      router.replace('/lobby');
      return;
    }
    setLoading(true);
    youOffset.current = null;
    api
      .leaderboard(board)
      .then(setView)
      .catch(() => setView(null))
      .finally(() => setLoading(false));
  }, [jurorId, board]);

  const jumpToYou = useCallback(() => {
    if (youOffset.current !== null) {
      scroller.current?.scrollTo({ y: Math.max(0, youOffset.current - 160), animated: true });
    }
  }, []);

  const onYouLayout = useCallback((e: LayoutChangeEvent) => {
    youOffset.current = e.nativeEvent.layout.y;
  }, []);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>THE CITIES</Text>
          <Text style={styles.subtitle}>
            {view ? `${view.ranked} cities under judgement` : 'Ranked by what your verdicts built'}
          </Text>
        </View>

        <View style={styles.tabs}>
          <BoardTab
            label="MOST PEACEFUL"
            active={board === 'peaceful'}
            colour="#1D7E6A"
            onPress={() => setBoard('peaceful')}
          />
          <BoardTab
            label="MOST LAWLESS"
            active={board === 'lawless'}
            colour="#C23B22"
            onPress={() => setBoard('lawless')}
          />
        </View>

        {loading && <ActivityIndicator color={Palette.text} style={styles.loading} />}

        {!loading && !view && <Text style={styles.empty}>The registry could not be reached.</Text>}

        {view && (
          <ScrollView
            ref={scroller}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          >
            {view.top.length === 0 && (
              <Text style={styles.empty}>
                No city has been governed long enough to be judged.
              </Text>
            )}

            {view.top.map((entry) => (
              <View
                key={`${entry.rank}-${entry.jurorName}`}
                onLayout={entry.you ? onYouLayout : undefined}
                style={[styles.row, entry.you && styles.rowYou]}
              >
                <Text style={[styles.rank, entry.you && styles.youText]}>
                  {String(entry.rank).padStart(3, ' ')}
                </Text>
                <View style={styles.rowMain}>
                  <Text style={[styles.name, entry.you && styles.youText]} numberOfLines={1}>
                    {entry.jurorName}
                    {entry.you ? '  — you' : ''}
                  </Text>
                  <Text style={styles.meta}>
                    {entry.verdict}
                    {entry.country ? ` · ${entry.country}` : ''} · {entry.casesHeard} cases
                  </Text>
                </View>
                <Text style={[styles.index, entry.you && styles.youText]}>
                  {entry.peaceIndex.toFixed(1)}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Your standing, always in reach. */}
        {view && (
          <Animated.View entering={FadeIn.duration(300)}>
            <Pressable
              onPress={view.you?.inTop ? jumpToYou : undefined}
              style={styles.youBar}
              accessibilityRole={view.you?.inTop ? 'button' : 'text'}
              accessibilityLabel={
                view.you
                  ? `Your city is ranked ${view.you.rank} of ${view.ranked}`
                  : 'Your city is not yet ranked'
              }
            >
              {view.you ? (
                <>
                  <Text style={styles.youRank}>#{view.you.rank}</Text>
                  <View style={styles.rowMain}>
                    <View style={styles.youNameRow}>
                      <Seal kind={mySeal} size={13} />
                      <Text style={styles.youName} numberOfLines={1}>
                        {view.you.jurorName}
                      </Text>
                    </View>
                    <Text style={styles.meta}>
                      {view.you.verdict} · of {view.ranked}
                      {view.you.inTop ? ' · tap to find yourself' : ' · outside the top 100'}
                    </Text>
                  </View>
                  <Text style={styles.youIndex}>{view.you.peaceIndex.toFixed(1)}</Text>
                </>
              ) : (
                <Text style={styles.unranked}>
                  Your city is not yet judged. {view.qualifyAt} cases are needed before it appears
                  here.
                </Text>
              )}
            </Pressable>
          </Animated.View>
        )}

        <View style={styles.footer}>
          <Pressable onPress={() => router.replace('/lobby')} style={styles.back}>
            <Text style={styles.backText}>BACK TO DOCKET</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function BoardTab({
  label,
  active,
  colour,
  onPress,
}: {
  label: string;
  active: boolean;
  colour: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tab, active && { borderBottomColor: colour }]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.tabLabel, active && { color: colour }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  safe: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, gap: 3 },
  title: { fontFamily: Fonts.display, fontSize: 30, color: Palette.text },
  subtitle: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.4, color: Palette.textMuted },
  tabs: { flexDirection: 'row', marginTop: 16, paddingHorizontal: 20, gap: 4 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: Palette.hairline,
  },
  tabLabel: {
    fontFamily: Fonts.mono,
    fontSize: 9,
    letterSpacing: 1.6,
    color: Palette.textFaint,
  },
  loading: { marginTop: 40 },
  empty: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    lineHeight: 18,
    color: Palette.textFaint,
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: 30,
  },
  list: { paddingHorizontal: 20, paddingVertical: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairline,
  },
  rowYou: { backgroundColor: 'rgba(240,237,232,0.05)' },
  rowMain: { flex: 1, gap: 2 },
  rank: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: Palette.textFaint,
    width: 28,
    textAlign: 'right',
  },
  name: { fontFamily: Fonts.monoBold, fontSize: 13, color: Palette.text },
  meta: { fontFamily: Fonts.mono, fontSize: 8, letterSpacing: 0.8, color: Palette.textMuted },
  index: { fontFamily: Fonts.mono, fontSize: 12, color: Palette.text, width: 40, textAlign: 'right' },
  youText: { color: '#D4860A' },
  youBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: Palette.surfaceRaised,
    borderWidth: 1,
    borderColor: '#D4860A',
    borderRadius: 2,
  },
  youRank: { fontFamily: Fonts.monoBold, fontSize: 13, color: '#D4860A' },
  youName: { fontFamily: Fonts.monoBold, fontSize: 13, color: Palette.text },
  youNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  youIndex: { fontFamily: Fonts.monoBold, fontSize: 13, color: '#D4860A' },
  unranked: {
    flex: 1,
    fontFamily: Fonts.mono,
    fontSize: 10,
    lineHeight: 16,
    color: Palette.textMuted,
  },
  footer: { paddingHorizontal: 20, paddingBottom: 12 },
  back: {
    borderWidth: 1,
    borderColor: Palette.hairline,
    paddingVertical: 15,
    alignItems: 'center',
    borderRadius: 2,
  },
  backText: { fontFamily: Fonts.uiBold, fontSize: 11, letterSpacing: 2.2, color: Palette.text },
});
