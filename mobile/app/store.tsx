import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Busy } from '@/components/Busy';
import { Fonts, Palette } from '@/constants/theme';
import * as haptic from '@/lib/haptics';
import { play } from '@/lib/sound';
import { api, type StoreItem, type StoreView } from '@/lib/api';
import { useGame } from '@/store/game';

/**
 * The store.
 *
 * Two rules the layout has to carry, because they are the product:
 *
 *  1. Nothing here buys a better outcome. Not standing, not a verdict, not
 *     time on the clock. Everything is either MORE GAME or LESS FRICTION, and
 *     the copy says so out loud rather than hoping the player notices.
 *
 *  2. Almost everything has a Merit price next to the money price, because
 *     almost everything is earnable by playing. Money buys it sooner. The two
 *     prices sit side by side deliberately: a store that hides the free path
 *     is a store that is lying about having one.
 */
export default function Store() {
  const refreshWallet = useGame((s) => s.refreshWallet);
  const [view, setView] = useState<StoreView | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await api.store());
    } catch {
      setView(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onEarn = useCallback(
    async (item: StoreItem) => {
      if (busy) return;
      setBusy(true);
      setNotice(null);
      try {
        await api.buyWithMerit(item.id);
        play('stamp');
        haptic.stamped();
        setNotice(`${item.title} is yours.`);
        await load();
        await refreshWallet();
      } catch (err) {
        haptic.refused();
        setNotice((err as Error).message ?? 'That did not go through.');
      } finally {
        setBusy(false);
      }
    },
    [busy, load, refreshWallet],
  );

  /**
   * Real-money purchase.
   *
   * The IAP SDK belongs here: StoreKit / Play Billing returns a receipt, and
   * the app hands it to POST /api/store/redeem, which validates it with Apple
   * or Google before granting anything. Until that exists, the server refuses
   * to redeem outside development — so this button says what is true rather
   * than pretending to charge anyone.
   */
  const onBuy = useCallback((item: StoreItem) => {
    setNotice(
      `Payments are not connected yet. ${item.title} is still earnable with Merit by sitting cases.`,
    );
  }, []);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>THE CLERK'S OFFICE</Text>
          <Text style={styles.merit}>{view ? `${view.merit} MERIT` : ''}</Text>
        </View>
        <Text style={styles.creed}>
          Nothing here buys a verdict, a standing, or a second on the clock. Merit is earned by
          sitting cases — never by being right.
        </Text>

        {!view && <ActivityIndicator color={Palette.text} style={styles.loading} />}

        {notice && (
          <Animated.Text entering={FadeIn} style={styles.notice}>
            {notice}
          </Animated.Text>
        )}

        {view && (
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {view.rewardedAdsLeft > 0 && (
              <View style={[styles.item, styles.rewarded]}>
                <Text style={styles.itemTitle}>Sit through a notice</Text>
                <Text style={styles.itemBlurb}>
                  Watch an advertisement for {view.rewardedAdMerit} Merit. {view.rewardedAdsLeft}{' '}
                  left today. Entirely optional, and never required to play.
                </Text>
                <Pressable
                  onPress={() => setNotice('The ad network is not connected yet.')}
                  style={styles.rewardBtn}
                >
                  <Text style={styles.rewardBtnText}>WATCH · +{view.rewardedAdMerit}</Text>
                </Pressable>
              </View>
            )}

            {view.items.map((item) => (
              <View key={item.id} style={[styles.item, item.owned && styles.itemOwned]}>
                <View style={styles.itemHead}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  {item.owned && <Text style={styles.ownedTag}>OWNED</Text>}
                </View>
                <Text style={styles.itemBlurb}>{item.blurb}</Text>

                {!item.owned && (
                  <View style={styles.prices}>
                    {item.meritPrice !== null && (
                      <Pressable
                        onPress={() => onEarn(item)}
                        disabled={busy || !item.affordable}
                        style={[styles.earnBtn, !item.affordable && styles.cantAfford]}
                      >
                        <Text style={[styles.earnText, !item.affordable && styles.cantAffordText]}>
                          {item.affordable
                            ? `${item.meritPrice} MERIT`
                            : `${item.meritPrice} MERIT — keep sitting`}
                        </Text>
                      </Pressable>
                    )}
                    {item.priceMinor !== null && (
                      <Pressable onPress={() => onBuy(item)} disabled={busy} style={styles.buyBtn}>
                        <Text style={styles.buyText}>${(item.priceMinor / 100).toFixed(2)}</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        )}

        <View style={styles.footer}>
          <Pressable onPress={() => router.back()} style={styles.close}>
            <Text style={styles.closeText}>CLOSE</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      {/* A purchase in flight locks the shelf. Two taps must never be two
          charges — the server is idempotent, but the player should not have to
          rely on that to feel safe. */}
      {busy && <Busy label="THE CLERK IS WRITING IT DOWN" />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 10,
  },
  title: { fontFamily: Fonts.display, fontSize: 24, color: Palette.text, flex: 1 },
  merit: { fontFamily: Fonts.monoBold, fontSize: 13, color: '#D4860A' },
  creed: {
    fontFamily: Fonts.mono,
    fontSize: 9.5,
    lineHeight: 16,
    color: Palette.textMuted,
    paddingHorizontal: 20,
    paddingTop: 6,
    maxWidth: 460,
  },
  loading: { marginTop: 40 },
  notice: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    lineHeight: 17,
    color: '#D4860A',
    backgroundColor: 'rgba(212,134,10,0.08)',
    padding: 10,
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 2,
  },
  list: { padding: 20, gap: 10 },
  item: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: 2,
    padding: 14,
    gap: 6,
  },
  itemOwned: { opacity: 0.55, borderColor: '#1D7E6A' },
  rewarded: { borderStyle: 'dashed', borderColor: '#6B4FBB' },
  itemHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemTitle: { fontFamily: Fonts.display, fontSize: 17, color: Palette.text, flex: 1 },
  ownedTag: { fontFamily: Fonts.mono, fontSize: 8, letterSpacing: 1.4, color: '#1D7E6A' },
  itemBlurb: { fontFamily: Fonts.mono, fontSize: 11, lineHeight: 18, color: Palette.textMuted },
  prices: { flexDirection: 'row', gap: 8, marginTop: 6 },
  earnBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D4860A',
    paddingVertical: 11,
    alignItems: 'center',
    borderRadius: 2,
  },
  earnText: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.2, color: '#D4860A' },
  cantAfford: { borderColor: Palette.hairline },
  cantAffordText: { color: Palette.textFaint },
  buyBtn: {
    minWidth: 92,
    backgroundColor: Palette.text,
    paddingVertical: 11,
    alignItems: 'center',
    borderRadius: 2,
  },
  buyText: { fontFamily: Fonts.uiBold, fontSize: 12, color: Palette.bg },
  rewardBtn: {
    borderWidth: 1,
    borderColor: '#6B4FBB',
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 2,
    marginTop: 4,
  },
  rewardBtnText: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.2, color: '#6B4FBB' },
  footer: { paddingHorizontal: 20, paddingBottom: 12, paddingTop: 8 },
  close: {
    borderWidth: 1,
    borderColor: Palette.hairline,
    paddingVertical: 15,
    alignItems: 'center',
    borderRadius: 2,
  },
  closeText: { fontFamily: Fonts.uiBold, fontSize: 11, letterSpacing: 2.2, color: Palette.text },
});
