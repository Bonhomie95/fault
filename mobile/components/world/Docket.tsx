import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Accents, Elevation, Fonts, IMPACT_LEADING, Palette, Radius, Space, Type } from '@/constants/theme';
import { adsAvailable, earnReward } from '@/lib/ads';
import { api, type DailyStatus, type DocketView, type StoreView } from '@/lib/api';
import * as haptic from '@/lib/haptics';
import { loadProducts } from '@/lib/iap';
import { play } from '@/lib/sound';

/**
 * The lobby's docket pieces: the Daily Trial, how much of today's docket is
 * left, the special dockets a juror owns, and — when the docket is closed —
 * the honest ways to open it again.
 */

const GOLD = '#D4A017';

/* ------------------------------------------------------------------ *
 * The Daily Trial.
 * ------------------------------------------------------------------ */

export function DailyTrialCard({
  refreshKey,
  onOpen,
  busy,
}: {
  refreshKey: number;
  onOpen: () => void;
  busy: boolean;
}) {
  const [status, setStatus] = useState<DailyStatus | null>(null);

  useEffect(() => {
    let live = true;
    api
      .dailyStatus()
      .then((s) => live && setStatus(s))
      .catch(() => live && setStatus(null));
    return () => {
      live = false;
    };
  }, [refreshKey]);

  if (!status) return null;

  if (status.sat) {
    const t = status.tally;
    const decided = t ? Math.max(1, t.guilty + t.notGuilty) : 1;
    const guilty = t ? Math.round((t.guilty / decided) * 100) : 0;
    const hours = Math.max(0, Math.ceil((new Date(status.nextAt).getTime() - Date.now()) / 3_600_000));
    return (
      <View style={[styles.daily, styles.dailyDone]}>
        <Text style={styles.dailyEyebrow}>THE DAILY TRIAL · SAT</Text>
        <Text style={styles.dailyBody}>
          {status.verdict
            ? `You said ${status.verdict === 'guilty' ? 'GUILTY' : 'NOT GUILTY'}. `
            : 'The clock decided for you. '}
          {t
            ? `The world: ${guilty}% guilty, ${100 - guilty}% not guilty, from ${t.total.toLocaleString()} juror${t.total === 1 ? '' : 's'}.`
            : ''}
        </Text>
        <Text style={styles.dailyMeta}>NEXT TRIAL IN {hours}H</Text>
      </View>
    );
  }

  return (
    <View style={styles.daily}>
      <Text style={styles.dailyEyebrow}>THE DAILY TRIAL · FREE</Text>
      <Text style={styles.dailyTitle}>ONE CASE.{'\n'}THE WHOLE WORLD.</Text>
      <Text style={styles.dailyBody}>
        Every juror on Earth hears this case today, in their own country. Deliver your verdict, then see
        how the world split.
      </Text>
      <Button
        label={status.open ? 'Return to the trial' : 'Sit today’s trial'}
        onPress={onOpen}
        variant="primary"
        busy={busy}
        accent={GOLD}
        hint="The clock starts immediately"
        style={{ marginTop: Space.md }}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * How much of today's docket is left.
 * ------------------------------------------------------------------ */

export function docketLine(d: DocketView | undefined): string | null {
  if (!d) return null;
  if (d.unlimited) return 'UNLIMITED DOCKET';
  const total = d.freePerDay + d.bonus;
  return `${d.left} OF ${total} CASES LEFT TODAY`;
}

/* ------------------------------------------------------------------ *
 * Offers, in one line, never more than one at a time.
 * ------------------------------------------------------------------ */

export function OfferStrip({ store }: { store: StoreView | null }) {
  // Only what this device can actually buy: an offer that leads to a shelf
  // with no price on it is a broken promise (and an App Review rejection).
  const [sellable, setSellable] = useState<Set<string>>(new Set());
  useEffect(() => {
    let live = true;
    void loadProducts({ inApp: ['starter_bundle'], subs: ['pass_monthly', 'pass_yearly'], consumable: [] }).then(
      (p) => live && setSellable(new Set(p.keys())),
    );
    return () => {
      live = false;
    };
  }, []);
  if (!store) return null;
  if (store.pass.active) return null;
  const starter = store.starter.available && sellable.has('starter_bundle');
  if (!starter && !sellable.has('pass_monthly') && !sellable.has('pass_yearly')) return null;
  return (
    <Pressable
      onPress={() => router.push('/store')}
      style={[styles.offer, starter && styles.offerStarter]}
      accessibilityRole="button"
      accessibilityLabel={starter ? 'Founding Juror Bundle, for new jurors. Open the store.' : 'Juror Pass. Open the store.'}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.offerEyebrow}>{starter ? 'FOR NEW JURORS' : 'JUROR PASS'}</Text>
        <Text style={styles.offerText}>
          {starter
            ? 'Founding Juror Bundle: unlimited cases and no adverts, for ever.'
            : 'Unlimited cases, no adverts, every courtroom and special docket.'}
        </Text>
      </View>
      <Text style={styles.offerGo}>SEE →</Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 * Special dockets the juror owns.
 * ------------------------------------------------------------------ */

const PACK_TITLES: Record<string, string> = {
  corporate: 'The Boardroom Docket',
  cold_case: 'The Cold Case Docket',
  political: 'The Power Docket',
};

export function SpecialDockets({
  store,
  onOpen,
  busy,
}: {
  store: StoreView | null;
  onOpen: (key: string) => void;
  busy: string | null;
}) {
  const mine = store?.packs.filter((p) => p.owned && p.heard < p.total) ?? [];
  if (!mine.length) return null;
  return (
    <View style={styles.packs}>
      <Text style={styles.packsTitle}>SPECIAL DOCKETS · FREE OF THE DAILY LIMIT</Text>
      {mine.map((p) => (
        <Button
          key={p.key}
          label={`${PACK_TITLES[p.key] ?? p.key} · ${p.total - p.heard} left`}
          onPress={() => onOpen(p.key)}
          variant="secondary"
          busy={busy === p.key}
        />
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * The docket is closed.
 * ------------------------------------------------------------------ */

export function DocketClosed({
  store,
  onClose,
  onReopened,
}: {
  store: StoreView | null;
  onClose: () => void;
  onReopened: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const extra = store?.items.find((i) => i.id === 'extra_docket');

  const watch = async () => {
    if (busy) return;
    setBusy('watch');
    setNote(null);
    try {
      const r = await earnReward('case');
      if (r === 'paid') {
        play('stamp');
        haptic.stamped();
        onReopened();
      } else if (r === 'pending') setNote('The court is confirming that view — try the file again in a moment.');
      else setNote('No notice was available. Nothing was lost.');
    } finally {
      setBusy(null);
    }
  };

  const spend = async () => {
    if (busy || !extra) return;
    setBusy('merit');
    setNote(null);
    try {
      await api.buyWithMerit('extra_docket');
      play('stamp');
      haptic.stamped();
      onReopened();
    } catch (err) {
      haptic.refused();
      setNote((err as Error).message || 'That did not go through.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={styles.sheet}>
          <Text style={styles.sheetEyebrow}>TODAY&apos;S DOCKET IS CLOSED</Text>
          <Text style={styles.sheetTitle}>The court rises.</Text>
          <Text style={styles.sheetBody}>
            A fresh docket opens at midnight. The Daily Trial and your special dockets are still open — or
            open more cases now.
          </Text>

          {adsAvailable() && (store?.rewardedCasesLeft ?? 0) > 0 && (
            <Button
              label={`Watch a notice · +1 case (${store!.rewardedCasesLeft} left)`}
              onPress={watch}
              variant="secondary"
              busy={busy === 'watch'}
            />
          )}
          {extra && (
            <Button
              label={`${extra.meritPrice?.toLocaleString()} Merit · +${extra.casesGranted} cases`}
              onPress={spend}
              variant="secondary"
              disabled={!extra.affordable}
              busy={busy === 'merit'}
              hint={extra.affordable ? undefined : `You have ${store?.merit ?? 0} Merit`}
            />
          )}
          <Button
            label={store?.starter.available ? 'Founding Juror Bundle' : 'Unlimited cases & more'}
            onPress={() => {
              onClose();
              router.push('/store');
            }}
            variant="primary"
            accent={GOLD}
          />
          {note && <Text style={styles.note}>{note}</Text>}
          <Pressable onPress={onClose} style={styles.later} accessibilityRole="button">
            <Text style={styles.laterText}>COME BACK TOMORROW</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  daily: {
    backgroundColor: '#17130A',
    borderRadius: Radius.lg,
    padding: Space.xl,
    gap: Space.sm,
    borderWidth: 1,
    borderColor: GOLD + '88',
    ...Elevation.raised,
  },
  dailyDone: { backgroundColor: Palette.surface, borderColor: Palette.hairline, padding: Space.lg },
  dailyEyebrow: { fontFamily: Fonts.monoBold, fontSize: Type.micro, letterSpacing: 2, color: GOLD },
  dailyTitle: {
    fontFamily: Fonts.impact,
    fontSize: Type.title,
    lineHeight: Type.title * IMPACT_LEADING,
    color: Palette.text,
  },
  dailyBody: { fontFamily: Fonts.ui, fontSize: Type.small, lineHeight: 20, color: Palette.textMuted },
  dailyMeta: { fontFamily: Fonts.mono, fontSize: Type.micro, letterSpacing: 1.6, color: Palette.textFaint },

  offer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: GOLD + '66',
    backgroundColor: Palette.surface,
    padding: Space.lg,
  },
  offerStarter: { backgroundColor: '#1A160C', borderColor: GOLD },
  offerEyebrow: { fontFamily: Fonts.monoBold, fontSize: Type.micro, letterSpacing: 1.8, color: GOLD },
  offerText: { fontFamily: Fonts.ui, fontSize: Type.small, lineHeight: 19, color: Palette.text },
  offerGo: { fontFamily: Fonts.monoBold, fontSize: Type.micro, letterSpacing: 1.4, color: GOLD },

  packs: { gap: Space.sm },
  packsTitle: { fontFamily: Fonts.uiBold, fontSize: Type.micro, letterSpacing: 2, color: Palette.textMuted },

  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'center', padding: Space.lg },
  sheet: {
    backgroundColor: Palette.surfaceRaised,
    borderRadius: Radius.xl,
    padding: Space.xl,
    gap: Space.md,
    borderWidth: 1,
    borderColor: Palette.hairlineBright,
  },
  sheetEyebrow: { fontFamily: Fonts.monoBold, fontSize: Type.micro, letterSpacing: 2, color: Accents.financial },
  sheetTitle: { fontFamily: Fonts.display, fontSize: Type.heading, color: Palette.text },
  sheetBody: { fontFamily: Fonts.ui, fontSize: Type.small, lineHeight: 20, color: Palette.textMuted },
  note: { fontFamily: Fonts.mono, fontSize: Type.micro, lineHeight: 16, color: Accents.financial },
  later: { alignItems: 'center', paddingVertical: Space.sm },
  laterText: { fontFamily: Fonts.monoBold, fontSize: Type.micro, letterSpacing: 1.8, color: Palette.textMuted },
});
