import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Busy } from '@/components/Busy';
import { Seal, type SealKind } from '@/components/Seal';
import { THEMES } from '@/components/scene2d/themes';
import { Accents, Fonts, Palette, Radius, Type } from '@/constants/theme';
import { adsAvailable, earnReward } from '@/lib/ads';
import { api, type RoomTheme, type SealStyle, type StoreItem, type StoreView } from '@/lib/api';
import * as haptic from '@/lib/haptics';
import { loadProducts, manageSubscriptions, type StoreProduct } from '@/lib/iap';
import { buy, purchasesAvailable, restore } from '@/lib/purchases';
import { play } from '@/lib/sound';
import { useGame } from '@/store/game';

/**
 * The Clerk's Office.
 *
 * Two rules the layout carries, because they are the product:
 *
 *  1. Nothing here buys a better outcome — not standing, not a verdict, not a
 *     second on the clock. It sells MORE GAME, LESS FRICTION and HOW IT
 *     LOOKS, and the copy says so out loud.
 *
 *  2. The free path sits beside the paid one. Almost everything has a Merit
 *     price, and rewarded views are right at the top: a store that hides the
 *     free path is a store lying about having one.
 *
 * Prices are the STORE's, in the player's currency ("₦2,900", "4,99 €"),
 * never a dollar figure we made up. A product the store does not return is
 * not offered for money — Apple rejects buttons that cannot buy anything.
 */
export default function Store() {
  const refreshWallet = useGame((s) => s.refreshWallet);
  const refreshStanding = useGame((s) => s.refreshStanding);
  const loadCase = useGame((s) => s.loadCase);
  const [view, setView] = useState<StoreView | null>(null);
  const [prices, setPrices] = useState<Map<string, StoreProduct>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const v = await api.store();
      setView(v);
      if (purchasesAvailable()) {
        const forMoney = v.items.filter((i) => i.store);
        setPrices(
          await loadProducts({
            inApp: forMoney.filter((i) => i.store !== 'subscription').map((i) => i.id),
            subs: forMoney.filter((i) => i.store === 'subscription').map((i) => i.id),
            consumable: forMoney.filter((i) => i.store === 'consumable').map((i) => i.id),
          }),
        );
      }
    } catch {
      setView(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const after = useCallback(
    async (message: string) => {
      play('stamp');
      haptic.stamped();
      setNotice(message);
      await Promise.all([load(), refreshWallet(), refreshStanding()]);
    },
    [load, refreshWallet, refreshStanding],
  );

  const run = useCallback(
    async (key: string, fn: () => Promise<void>) => {
      if (busy) return;
      setBusy(key);
      setNotice(null);
      try {
        await fn();
      } catch (err) {
        haptic.refused();
        setNotice((err as Error).message || 'That did not go through.');
      } finally {
        setBusy(null);
      }
    },
    [busy],
  );

  const earn = (item: StoreItem) =>
    run(item.id, async () => {
      await api.buyWithMerit(item.id);
      await after(
        item.casesGranted
          ? `${item.casesGranted} more cases open today.`
          : item.shieldsGranted
            ? 'A streak shield is waiting for the day you need it.'
            : `${item.title} is yours.`,
      );
    });

  const pay = (item: StoreItem) =>
    run(item.id, async () => {
      const result = await buy(item.id);
      if (result.status === 'granted') await after(`${item.title} is yours. Thank you.`);
      else if (result.status === 'failed') throw new Error(result.message);
      else if (result.status === 'unavailable') throw new Error('The store is not reachable from this device.');
    });

  const watch = (reward: 'merit' | 'case') =>
    run(`watch-${reward}`, async () => {
      const r = await earnReward(reward);
      if (r === 'paid') await after(reward === 'merit' ? `+${view?.rewardedAdMerit ?? 0} Merit.` : 'One more case open today.');
      else if (r === 'pending') setNotice('Thanks — the court is confirming that view. It will arrive in a moment.');
      else setNotice('No notice was available. Nothing was lost.');
    });

  const equip = (body: { room?: RoomTheme | null; seal?: SealStyle | null }) =>
    run('equip', async () => {
      await api.equip(body);
      await refreshWallet();
      await load();
      haptic.tapLight();
    });

  const onRestore = () =>
    run('restore', async () => {
      const device = await restore();
      const r = await api.restorePurchases();
      await after(
        device.restored + r.restored > 0 ? 'Your purchases are restored.' : 'Nothing to restore on this account.',
      );
    });

  const openPack = (key: string) =>
    run(`pack-${key}`, async () => {
      await loadCase({ pack: key });
      router.replace('/case');
    });

  const by = useMemo(() => new Map((view?.items ?? []).map((i) => [i.id, i])), [view]);
  const price = (id: string) => prices.get(id)?.displayPrice ?? null;
  const rewarded = adsAvailable();
  const owned = (e: string) => view?.entitlements.includes(e as never) ?? false;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>THE CLERK&apos;S OFFICE</Text>
          {view && (
            <View style={styles.wallet}>
              <Text style={styles.merit}>{view.merit.toLocaleString()} MERIT</Text>
              <Text style={styles.shields}>
                {view.shields} SHIELD{view.shields === 1 ? '' : 'S'}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.creed}>
          Nothing here buys a verdict, a standing, or a second on the clock. Merit is earned by sitting
          cases — never by being right.
        </Text>

        {notice && <Text style={styles.notice}>{notice}</Text>}
        {!view && <ActivityIndicator color={Palette.text} style={{ marginTop: 40 }} />}

        {view && (
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {/* ---- Founding Juror: new jurors, once ---- */}
            {view.starter.available && by.get('starter_bundle') && price('starter_bundle') && (
              <View style={[styles.card, styles.hero]}>
                <Text style={styles.heroEyebrow}>FOR NEW JURORS · {countdown(view.starter.endsAt)}</Text>
                <Text style={styles.heroTitle}>Founding Juror Bundle</Text>
                <Bullets
                  items={[
                    'Unlimited docket, for ever',
                    'No adverts, for ever',
                    'The brass seal',
                    '1,500 Merit and two streak shields',
                  ]}
                />
                <PriceButton
                  label={price('starter_bundle')!}
                  onPress={() => pay(by.get('starter_bundle')!)}
                  busy={busy === 'starter_bundle'}
                  strong
                />
              </View>
            )}

            {/* ---- The Juror Pass ---- */}
            <View style={[styles.card, styles.pass]}>
              <View style={styles.row}>
                <Text style={styles.passTitle}>JUROR PASS</Text>
                <Seal kind="seal_gold" size={22} />
              </View>
              {view.pass.active ? (
                <>
                  <Text style={styles.blurb}>
                    Active until {new Date(view.pass.expiresAt!).toLocaleDateString()}. Everything below is
                    yours while it lasts.
                  </Text>
                  <Pressable onPress={() => void manageSubscriptions()} style={styles.linkBtn} accessibilityRole="button">
                    <Text style={styles.linkText}>MANAGE SUBSCRIPTION</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Bullets
                    items={[
                      'Unlimited cases, every day',
                      'No adverts',
                      'All three special dockets and all four courtrooms',
                      `+${Math.round((view.pass.meritMultiplier - 1) * 100)}% Merit from every case`,
                      'Two streak shields every period, and the gold seal',
                    ]}
                  />
                  <View style={styles.prices}>
                    {price('pass_monthly') && (
                      <PriceButton
                        label={`${price('pass_monthly')} / month`}
                        onPress={() => pay(by.get('pass_monthly')!)}
                        busy={busy === 'pass_monthly'}
                      />
                    )}
                    {price('pass_yearly') && (
                      <PriceButton
                        label={`${price('pass_yearly')} / year`}
                        badge="BEST VALUE"
                        onPress={() => pay(by.get('pass_yearly')!)}
                        busy={busy === 'pass_yearly'}
                        strong
                      />
                    )}
                  </View>
                  {(price('pass_monthly') || price('pass_yearly')) ? (
                    <Text style={styles.terms}>
                      Renews automatically until cancelled. Cancel any time in your{' '}
                      {Platform.OS === 'ios' ? 'App Store' : 'Google Play'} settings at least 24 hours before
                      renewal. Payment is charged to your account at confirmation.{' '}
                      <Text style={styles.termsLink} onPress={() => router.push('/legal?doc=terms')}>
                        Terms
                      </Text>{' '}
                      ·{' '}
                      <Text style={styles.termsLink} onPress={() => router.push('/legal?doc=privacy')}>
                        Privacy
                      </Text>
                    </Text>
                  ) : (
                    <Text style={styles.terms}>The pass is not available from this device yet.</Text>
                  )}
                </>
              )}
            </View>

            {/* ---- Free, for a moment of attention ---- */}
            {rewarded && (view.rewardedAdsLeft > 0 || view.rewardedCasesLeft > 0) && (
              <View style={[styles.card, styles.free]}>
                <Text style={styles.section}>FREE · WATCH A SHORT NOTICE</Text>
                {view.rewardedAdsLeft > 0 && (
                  <FreeRow
                    title={`+${view.rewardedAdMerit} Merit`}
                    sub={`${view.rewardedAdsLeft} left today`}
                    onPress={() => watch('merit')}
                    busy={busy === 'watch-merit'}
                  />
                )}
                {!view.docket.unlimited && view.rewardedCasesLeft > 0 && (
                  <FreeRow
                    title="+1 case today"
                    sub={`${view.rewardedCasesLeft} left today`}
                    onPress={() => watch('case')}
                    busy={busy === 'watch-case'}
                  />
                )}
              </View>
            )}

            {/* ---- Today's docket ---- */}
            <Text style={styles.section}>TODAY&apos;S DOCKET</Text>
            <View style={styles.card}>
              <Text style={styles.blurb}>
                {view.docket.unlimited
                  ? 'Unlimited. Sit as many cases as you like.'
                  : `${view.docket.left} of ${view.docket.freePerDay + view.docket.bonus} cases left today. A fresh docket opens at midnight. The Daily Trial and special dockets never count.`}
              </Text>
              {!view.docket.unlimited && by.get('extra_docket') && (
                <MeritButton item={by.get('extra_docket')!} onPress={earn} busy={busy === 'extra_docket'} />
              )}
            </View>
            {['campaign', 'no_ads'].map((id) => by.get(id) && (
              <ItemCard key={id} item={by.get(id)!} price={price(id)} busy={busy} onEarn={earn} onPay={pay} />
            ))}

            {/* ---- Special dockets ---- */}
            <Text style={styles.section}>SPECIAL DOCKETS · TEN CASES EACH</Text>
            {(['pack_corporate', 'pack_cold_case', 'pack_political'] as const).map((id) => {
              const item = by.get(id);
              if (!item) return null;
              const key = id.replace('pack_', '');
              return owned(id) ? (
                <View key={id} style={[styles.card, styles.ownedCard]}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.blurb}>{item.blurb}</Text>
                  <PriceButton label="OPEN THE DOCKET" onPress={() => openPack(key)} busy={busy === `pack-${key}`} />
                </View>
              ) : (
                <ItemCard key={id} item={item} price={price(id)} busy={busy} onEarn={earn} onPay={pay} />
              );
            })}

            {/* ---- Courtrooms ---- */}
            <Text style={styles.section}>COURTROOMS</Text>
            <View style={styles.card}>
              <Swatch
                name="Standard Court"
                colors={THEMES.standard.swatch}
                on={!view.equipped.room}
                owned
                onPress={() => equip({ room: null })}
              />
              {(['room_oak', 'room_marble', 'room_concrete', 'room_night'] as const).map((id) => {
                const item = by.get(id);
                if (!item) return null;
                return owned(id) ? (
                  <Swatch
                    key={id}
                    name={item.title}
                    colors={THEMES[id].swatch}
                    on={view.equipped.room === id}
                    owned
                    onPress={() => equip({ room: id })}
                  />
                ) : (
                  <View key={id} style={styles.lockedRow}>
                    <Swatch name={item.title} colors={THEMES[id].swatch} on={false} owned={false} />
                    <View style={styles.prices}>
                      <MeritButton item={item} onPress={earn} busy={busy === id} compact />
                      {price(id) && (
                        <PriceButton label={price(id)!} onPress={() => pay(item)} busy={busy === id} compact />
                      )}
                    </View>
                  </View>
                );
              })}
            </View>

            {/* ---- Seals ---- */}
            <Text style={styles.section}>SEALS · BESIDE YOUR NAME ON THE REGISTRY</Text>
            <View style={styles.card}>
              {(['seal_brass', 'seal_obsidian', 'seal_ivory', 'seal_gold', 'patron'] as const).map((id) => {
                const item = by.get(id);
                const mine = owned(id);
                if (!mine && (id === 'seal_gold' || id === 'patron')) return null;
                const name = item?.title ?? (id === 'seal_gold' ? 'Gold Seal (Juror Pass)' : 'Patron');
                return (
                  <View key={id} style={styles.sealRow}>
                    <Seal kind={id as SealKind} size={26} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>{name}</Text>
                    </View>
                    {mine ? (
                      <Pressable
                        onPress={() => equip({ seal: view.equipped.seal === id ? null : id })}
                        style={[styles.equip, view.equipped.seal === id && styles.equipOn]}
                        accessibilityRole="button"
                      >
                        <Text style={styles.equipText}>{view.equipped.seal === id ? 'WORN' : 'WEAR'}</Text>
                      </Pressable>
                    ) : (
                      item && (
                        <View style={styles.prices}>
                          <MeritButton item={item} onPress={earn} busy={busy === id} compact />
                          {price(id) && (
                            <PriceButton label={price(id)!} onPress={() => pay(item)} busy={busy === id} compact />
                          )}
                        </View>
                      )
                    )}
                  </View>
                );
              })}
            </View>

            {/* ---- Streak shields ---- */}
            <Text style={styles.section}>STREAK SHIELDS · YOU HOLD {view.shields}</Text>
            {['streak_shield', 'shield_pack'].map((id) => by.get(id) && (
              <ItemCard key={id} item={by.get(id)!} price={price(id)} busy={busy} onEarn={earn} onPay={pay} />
            ))}

            {/* ---- Merit ---- */}
            {['merit_small', 'merit_medium', 'merit_large'].some((id) => price(id)) && (
              <Text style={styles.section}>MERIT</Text>
            )}
            {['merit_small', 'merit_medium', 'merit_large', 'patron'].map((id) => by.get(id) && price(id) && (
              <ItemCard key={id} item={by.get(id)!} price={price(id)} busy={busy} onEarn={earn} onPay={pay} />
            ))}

            <Pressable onPress={onRestore} style={styles.linkBtn} accessibilityRole="button">
              <Text style={styles.linkText}>RESTORE PURCHASES</Text>
            </Pressable>
            <Text style={styles.terms}>
              Purchases are tied to your juror record and restored on any device you sign in on.
            </Text>
          </ScrollView>
        )}

        <View style={styles.footer}>
          <Pressable onPress={() => router.back()} style={styles.close} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.closeText}>CLOSE</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      {/* A purchase in flight locks the shelf: two taps must never be two charges. */}
      {busy && busy !== 'equip' && <Busy label="THE CLERK IS WRITING IT DOWN" />}
    </View>
  );
}

/** "ENDS IN 2D 5H" — a real deadline, never a fake one. */
function countdown(iso: string | null): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'ENDING';
  const h = Math.floor(ms / 3_600_000);
  return h >= 24 ? `ENDS IN ${Math.floor(h / 24)}D ${h % 24}H` : `ENDS IN ${h}H`;
}

function Bullets({ items }: { items: string[] }) {
  return (
    <View style={{ gap: 4 }}>
      {items.map((t) => (
        <Text key={t} style={styles.bullet}>
          ✓ {t}
        </Text>
      ))}
    </View>
  );
}

function PriceButton({
  label,
  onPress,
  busy,
  strong,
  compact,
  badge,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  strong?: boolean;
  compact?: boolean;
  badge?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={[styles.buyBtn, strong && styles.buyStrong, compact && styles.compact]}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
    >
      {badge && <Text style={styles.badge}>{badge}</Text>}
      <Text style={[styles.buyText, strong && styles.buyStrongText]}>{label}</Text>
    </Pressable>
  );
}

function MeritButton({
  item,
  onPress,
  busy,
  compact,
}: {
  item: StoreItem;
  onPress: (i: StoreItem) => void;
  busy?: boolean;
  compact?: boolean;
}) {
  if (item.meritPrice === null) return null;
  return (
    <Pressable
      onPress={() => onPress(item)}
      disabled={busy || !item.affordable}
      style={[styles.earnBtn, !item.affordable && styles.cantAfford, compact && styles.compact]}
      accessibilityRole="button"
      accessibilityLabel={
        item.affordable
          ? `${item.title} for ${item.meritPrice} Merit`
          : `${item.title} costs ${item.meritPrice} Merit — not enough yet`
      }
      hitSlop={6}
    >
      <Text style={[styles.earnText, !item.affordable && styles.cantAffordText]}>
        {item.casesGranted ? `+${item.casesGranted} CASES · ` : ''}
        {item.meritPrice.toLocaleString()} MERIT
      </Text>
    </Pressable>
  );
}

function ItemCard({
  item,
  price,
  busy,
  onEarn,
  onPay,
}: {
  item: StoreItem;
  price: string | null;
  busy: string | null;
  onEarn: (i: StoreItem) => void;
  onPay: (i: StoreItem) => void;
}) {
  // Money-only items the store cannot sell here are not shown at all.
  if (!item.owned && item.meritPrice === null && !price) return null;
  return (
    <View style={[styles.card, item.owned && styles.ownedCard]}>
      <View style={styles.row}>
        <Text style={styles.itemTitle}>{item.title}</Text>
        {item.owned ? (
          <Text style={styles.ownedTag}>OWNED</Text>
        ) : (
          item.badge && <Text style={styles.badgeInline}>{item.badge.toUpperCase()}</Text>
        )}
      </View>
      <Text style={styles.blurb}>{item.blurb}</Text>
      {!item.owned && (
        <View style={styles.prices}>
          <MeritButton item={item} onPress={onEarn} busy={busy === item.id} />
          {price && <PriceButton label={price} onPress={() => onPay(item)} busy={busy === item.id} />}
        </View>
      )}
    </View>
  );
}

function FreeRow({ title, sub, onPress, busy }: { title: string; sub: string; onPress: () => void; busy: boolean }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemTitle}>{title}</Text>
        <Text style={styles.blurb}>{sub}</Text>
      </View>
      <Pressable onPress={onPress} disabled={busy} style={styles.watchBtn} accessibilityRole="button" hitSlop={6}>
        <Text style={styles.watchText}>WATCH</Text>
      </Pressable>
    </View>
  );
}

function Swatch({
  name,
  colors,
  on,
  owned,
  onPress,
}: {
  name: string;
  colors: readonly string[];
  on: boolean;
  owned: boolean;
  onPress?: () => void;
}) {
  const body = (
    <View style={[styles.swatchRow, on && styles.swatchOn]}>
      <View style={styles.swatch}>
        {colors.map((c) => (
          <View key={c} style={{ flex: 1, backgroundColor: c }} />
        ))}
      </View>
      <Text style={[styles.itemTitle, !owned && { color: Palette.textMuted }]}>{name}</Text>
      {owned && <Text style={styles.equipText}>{on ? 'IN USE' : 'USE'}</Text>}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

const GOLD = '#D4A017';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 10,
  },
  title: { fontFamily: Fonts.display, fontSize: 24, color: Palette.text, flex: 1 },
  wallet: { alignItems: 'flex-end', gap: 2 },
  merit: { fontFamily: Fonts.monoBold, fontSize: 13, color: '#D4860A' },
  shields: { fontFamily: Fonts.mono, fontSize: Type.micro, color: Accents.systemic },
  creed: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    lineHeight: 16,
    color: Palette.textMuted,
    paddingHorizontal: 20,
    paddingTop: 6,
  },
  notice: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 17,
    color: '#D4860A',
    backgroundColor: 'rgba(212,134,10,0.08)',
    padding: 10,
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: Radius.sm,
  },
  list: { padding: 20, gap: 10, paddingBottom: 40 },
  section: {
    fontFamily: Fonts.monoBold,
    fontSize: Type.micro,
    letterSpacing: 1.8,
    color: Palette.textMuted,
    marginTop: 10,
  },
  card: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: Radius.md,
    padding: 14,
    gap: 8,
  },
  ownedCard: { borderColor: '#1D7E6A' },
  hero: { borderColor: GOLD, backgroundColor: '#1A160C' },
  heroEyebrow: { fontFamily: Fonts.monoBold, fontSize: Type.micro, letterSpacing: 1.6, color: GOLD },
  heroTitle: { fontFamily: Fonts.display, fontSize: 22, color: Palette.text },
  pass: { borderColor: GOLD },
  passTitle: { fontFamily: Fonts.impact, fontSize: 24, letterSpacing: 2, color: GOLD },
  free: { borderStyle: 'dashed', borderColor: '#6B4FBB' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  itemTitle: { fontFamily: Fonts.display, fontSize: 16, color: Palette.text, flexShrink: 1 },
  ownedTag: { fontFamily: Fonts.mono, fontSize: Type.micro, letterSpacing: 1.4, color: '#1D7E6A' },
  badgeInline: { fontFamily: Fonts.monoBold, fontSize: Type.micro, letterSpacing: 1.2, color: GOLD },
  blurb: { fontFamily: Fonts.ui, fontSize: 13, lineHeight: 19, color: Palette.textMuted },
  bullet: { fontFamily: Fonts.ui, fontSize: 14, lineHeight: 20, color: Palette.text },
  prices: { flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  earnBtn: {
    flexGrow: 1,
    borderWidth: 1,
    borderColor: '#D4860A',
    paddingVertical: 11,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  earnText: { fontFamily: Fonts.mono, fontSize: Type.micro, letterSpacing: 1.2, color: '#D4860A' },
  cantAfford: { borderColor: Palette.hairline },
  cantAffordText: { color: Palette.textFaint },
  buyBtn: {
    flexGrow: 1,
    minWidth: 92,
    backgroundColor: Palette.surfaceHigh,
    paddingVertical: 11,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  buyStrong: { backgroundColor: GOLD },
  buyText: { fontFamily: Fonts.uiBold, fontSize: 13, color: Palette.text },
  buyStrongText: { color: '#1A1203' },
  compact: { flexGrow: 0, paddingVertical: 8, minWidth: 0 },
  badge: { fontFamily: Fonts.monoBold, fontSize: Type.micro, letterSpacing: 1.2, color: '#1A1203', marginBottom: 2 },
  terms: { fontFamily: Fonts.ui, fontSize: 11, lineHeight: 16, color: Palette.textFaint },
  termsLink: { color: Palette.textMuted, textDecorationLine: 'underline' },
  linkBtn: { alignSelf: 'flex-start', paddingVertical: 8 },
  linkText: { fontFamily: Fonts.monoBold, fontSize: Type.micro, letterSpacing: 1.6, color: Palette.textMuted },
  watchBtn: {
    borderWidth: 1,
    borderColor: '#8A6BE0',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: Radius.sm,
  },
  watchText: { fontFamily: Fonts.monoBold, fontSize: Type.micro, letterSpacing: 1.4, color: '#8A6BE0' },
  lockedRow: { gap: 6 },
  swatchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, borderRadius: Radius.sm },
  swatchOn: { backgroundColor: Palette.surfaceRaised },
  swatch: {
    width: 44,
    height: 28,
    borderRadius: 6,
    overflow: 'hidden',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  sealRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  equip: {
    borderWidth: 1,
    borderColor: Palette.hairline,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: Radius.sm,
  },
  equipOn: { borderColor: Accents.systemic },
  equipText: { fontFamily: Fonts.monoBold, fontSize: Type.micro, letterSpacing: 1.2, color: Palette.textMuted, marginLeft: 'auto' },
  footer: { paddingHorizontal: 20, paddingBottom: 12, paddingTop: 8 },
  close: {
    borderWidth: 1,
    borderColor: Palette.hairline,
    paddingVertical: 15,
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  closeText: { fontFamily: Fonts.uiBold, fontSize: 11, letterSpacing: 2.2, color: Palette.text },
});
