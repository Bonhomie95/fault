import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Fonts, Palette, Space, Type } from '@/constants/theme';
import { api, type NewsStory } from '@/lib/api';
import { useGame } from '@/store/game';
import { INK, INK_MUTED, Masthead, Story } from '@/components/world/Papers';

/**
 * The papers — every story the city has printed about the player's docket,
 * newest first.
 *
 * Opening the papers is also "coming back": the server runs the city clock on
 * this request, so a player who goes straight here after a week away finds the
 * week in print. Everything shown is marked read on the way out, not on the way
 * in, so the unread dots are still there to find while they read.
 */
export default function Papers() {
  const standing = useGame((s) => s.standing);
  const [items, setItems] = useState<NewsStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (before?: string) => {
    try {
      const r = await api.news(before);
      setItems((prev) => (before ? [...prev, ...r.items] : r.items));
      setMore(r.items.length >= 30);
      setError(null);
    } catch {
      setError('The papers could not be reached.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      void api.readNews().catch(() => {});
    };
  }, [load]);

  const district = standing?.district ?? null;

  return (
    <View style={styles.root}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <FlatList
          data={items}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <View style={{ gap: Space.md, marginBottom: Space.md }}>
              <Masthead
                title={district ? `The ${district} Herald` : 'The Herald'}
                sub="AND THE REST OF THE CITY'S PRESS"
              />
              <Text style={styles.lede}>
                Every verdict you deliver is reported. What the city does next is reported too — and
                it does not stop when you close the app.
              </Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={styles.row}>
              <Story story={item} lead={index === 0 || item.severity >= 3} />
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator color={INK} style={{ marginTop: Space.xl }} />
            ) : (
              <Text style={styles.empty}>
                {error ?? 'Nothing printed yet. Sit a case — the city will talk about it.'}
              </Text>
            )
          }
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (!more || loading || items.length === 0) return;
            setLoading(true);
            void load(items[items.length - 1]!.at);
          }}
          ListFooterComponent={
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/lobby'))}
              style={styles.back}
              accessibilityRole="button"
            >
              <Text style={styles.backText}>BACK TO THE COURT</Text>
            </Pressable>
          }
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.paper },
  content: { padding: Space.xl, paddingBottom: Space.xxxl },
  lede: {
    fontFamily: Fonts.displayRegular,
    fontStyle: 'italic',
    fontSize: Type.small,
    lineHeight: 20,
    color: INK_MUTED,
    textAlign: 'center',
  },
  row: { paddingVertical: Space.xs },
  sep: { height: 1, backgroundColor: '#B5AE9F' },
  empty: {
    fontFamily: Fonts.displayRegular,
    fontSize: Type.body,
    color: INK_MUTED,
    textAlign: 'center',
    marginTop: Space.xl,
  },
  back: {
    marginTop: Space.xl,
    backgroundColor: INK,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },
  backText: { fontFamily: Fonts.uiBold, fontSize: Type.small, letterSpacing: 2, color: Palette.text },
});
