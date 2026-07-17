import Slider from '@react-native-community/slider';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Clock, Fonts, Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import * as haptic from '@/lib/haptics';
import { play, refreshBedVolume } from '@/lib/sound';
import { useGame } from '@/store/game';
import { TEXT_SCALES, useSettings } from '@/store/settings';

/**
 * GDD 6, Screen 8 — Settings.
 *
 * The deliberation clock is no longer here. It is 120 seconds, for everyone,
 * everywhere, and the server owns it — the tiers are gone along with the
 * `clockSeconds` column they were stored in. Worth naming plainly: the GDD
 * listed extended timers as its accessibility mitigation for timer stress
 * (§12), so this is a real accessibility cost, taken deliberately and
 * reversible in one constant (domain/clock.ts) when it comes back.
 *
 * The toggles that used to live here — "Ambient tension", "Haptics" — were
 * `useState` and nothing else: not persisted, not read by anything, and
 * ambient sound had nothing to toggle because the game has no audio. A switch
 * that does nothing tells the player the game lies about small things, so they
 * are gone until they do something.
 */
export default function Settings() {
  const jurorName = useGame((s) => s.jurorName);
  const merit = useGame((s) => s.merit);
  const entitlements = useGame((s) => s.entitlements);
  const signOut = useGame((s) => s.signOut);
  const deleteAccount = useGame((s) => s.deleteAccount);

  const volume = useSettings((s) => s.volume);
  const muted = useSettings((s) => s.muted);
  const haptics = useSettings((s) => s.haptics);
  const textScale = useSettings((s) => s.textScale);
  const setSetting = useSettings((s) => s.set);

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const onRestore = useCallback(async () => {
    setBusy(true);
    try {
      const r = await api.restorePurchases();
      setNotice(
        r.restored > 0
          ? `Restored ${r.restored} purchase${r.restored === 1 ? '' : 's'}.`
          : 'Nothing to restore on this account.',
      );
    } catch {
      setNotice('Could not reach the store.');
    } finally {
      setBusy(false);
    }
  }, []);

  const onSignOut = useCallback(async () => {
    await signOut();
    router.replace('/');
  }, [signOut]);

  /**
   * Deletion is irreversible and takes the city with it, so it asks twice and
   * says exactly what is lost. Apple requires this to exist; the player
   * deserves it to be honest.
   */
  const onDelete = useCallback(() => {
    Alert.alert(
      'Delete this juror?',
      'Every verdict, the city you made, your standing and anything you have bought will be erased. This cannot be undone.',
      [
        { text: 'Keep my record', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Last chance', 'There is no appeal from this one.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  setBusy(true);
                  try {
                    await deleteAccount();
                    router.replace('/');
                  } catch {
                    setNotice('Deletion failed. Nothing was removed.');
                    setBusy(false);
                  }
                },
              },
            ]),
        },
      ],
    );
  }, [deleteAccount]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>SETTINGS</Text>
          {jurorName && <Text style={styles.juror}>JUROR: {jurorName.toUpperCase()}</Text>}

          {notice && <Text style={styles.notice}>{notice}</Text>}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>THE CLOCK</Text>
            <Text style={styles.sectionNote}>
              Every case, everywhere, is {Clock.defaultSeconds} seconds. The court keeps the time,
              not your phone.
            </Text>
          </View>

          {/* Real controls this time. Every one of these is persisted and read
              at the point of use — the previous switches were useState and a
              lie. */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>SOUND</Text>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Mute everything</Text>
              <Switch
                value={muted}
                onValueChange={(v) => {
                  void setSetting({ muted: v });
                  refreshBedVolume();
                  if (!v) play('paper');
                }}
                trackColor={{ false: Palette.hairline, true: '#C23B22' }}
                thumbColor={Palette.text}
              />
            </View>

            <View style={styles.sliderRow}>
              <Text style={styles.toggleLabel}>Volume</Text>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={1}
                value={volume}
                disabled={muted}
                minimumTrackTintColor={muted ? Palette.hairline : '#1D7E6A'}
                maximumTrackTintColor={Palette.hairline}
                thumbTintColor={muted ? Palette.textFaint : Palette.text}
                // While dragging: apply live so the beds follow the thumb.
                onValueChange={(v) => {
                  useSettings.setState({ volume: v });
                  refreshBedVolume();
                }}
                // On release: persist once, and let them hear the result.
                onSlidingComplete={(v) => {
                  void setSetting({ volume: v });
                  play('exhibit');
                }}
              />
              <Text style={styles.sliderValue}>{Math.round((muted ? 0 : volume) * 100)}</Text>
            </View>
            <Text style={styles.sectionNote}>
              FAULT stays silent when your phone is silenced. The sound here is atmosphere, not
              content — none of it tells you anything you cannot see.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>TOUCH</Text>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Haptics</Text>
              <Switch
                value={haptics}
                onValueChange={(v) => {
                  void setSetting({ haptics: v });
                  if (v) haptic.tick();
                }}
                trackColor={{ false: Palette.hairline, true: '#1D7E6A' }}
                thumbColor={Palette.text}
              />
            </View>
            <Text style={styles.sectionNote}>
              The last five seconds of every case are felt as well as heard.
            </Text>
          </View>

          {/* GDD 8 lists this first, and it matters more since the clock became
              a fixed 120 seconds for everyone: reading speed is the only part
              of the pressure a player can still adjust. */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>TEXT SIZE</Text>
            <View style={styles.tiers}>
              {TEXT_SCALES.map((t) => (
                <Pressable
                  key={t.label}
                  onPress={() => {
                    void setSetting({ textScale: t.value });
                    haptic.tapLight();
                  }}
                  style={[styles.tier, textScale === t.value && styles.tierActive]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: textScale === t.value }}
                >
                  <Text
                    style={[
                      styles.tierText,
                      { fontSize: 11 * t.value },
                      textScale === t.value && styles.tierTextActive,
                    ]}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.sectionNote, { fontSize: 11 * textScale, lineHeight: 18 * textScale }]}>
              The dossier will read at this size. No case can be finished in the time given — that is
              the design — but it should never be the type's fault.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ACCOUNT</Text>
            <Row label="Merit" value={String(merit)} />
            <Row
              label="Owned"
              value={entitlements.length > 0 ? String(entitlements.length) : 'nothing yet'}
            />
            <Action label="Open the store" onPress={() => router.push('/store')} />
            <Action label="Restore purchases" onPress={onRestore} disabled={busy} />
            <Action label="Sign out" onPress={onSignOut} disabled={busy} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>DATA</Text>
            <Text style={styles.sectionNote}>
              Your juror name appears on the public registry. Your country is stored; your location
              is not.
            </Text>
            <Pressable onPress={onDelete} disabled={busy} style={styles.danger}>
              <Text style={styles.dangerText}>DELETE THIS JUROR</Text>
            </Pressable>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function Action({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.action, disabled && styles.actionDisabled]}
      accessibilityRole="button"
    >
      <Text style={styles.actionText}>[ {label} ]</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  safe: { flex: 1 },
  content: { padding: 22, gap: 26 },
  title: { fontFamily: Fonts.display, fontSize: 28, color: Palette.text },
  juror: {
    fontFamily: Fonts.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: Palette.textMuted,
    marginTop: -18,
  },
  notice: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: '#D4860A',
    backgroundColor: 'rgba(212,134,10,0.08)',
    padding: 10,
    borderRadius: 2,
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  toggleLabel: { fontFamily: Fonts.mono, fontSize: 13, color: Palette.text },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  slider: { flex: 1, height: 36 },
  sliderValue: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: Palette.textMuted,
    width: 26,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  tiers: { flexDirection: 'row', gap: 8 },
  tier: {
    flex: 1,
    borderWidth: 1,
    borderColor: Palette.hairline,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 2,
    minHeight: 44,
  },
  tierActive: { borderColor: Palette.text, backgroundColor: Palette.surfaceRaised },
  tierText: { fontFamily: Fonts.mono, color: Palette.textMuted },
  tierTextActive: { color: Palette.text },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  rowLabel: { fontFamily: Fonts.mono, fontSize: 12, color: Palette.textMuted },
  rowValue: { fontFamily: Fonts.monoBold, fontSize: 12, color: Palette.text },
  action: { paddingVertical: 10 },
  actionDisabled: { opacity: 0.4 },
  actionText: { fontFamily: Fonts.mono, fontSize: 13, color: Palette.text },
  danger: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#C23B22',
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: 2,
  },
  dangerText: { fontFamily: Fonts.uiBold, fontSize: 11, letterSpacing: 2, color: '#C23B22' },
  footer: { paddingHorizontal: 22, paddingBottom: 12 },
  close: {
    borderWidth: 1,
    borderColor: Palette.hairline,
    paddingVertical: 15,
    alignItems: 'center',
    borderRadius: 2,
  },
  closeText: { fontFamily: Fonts.uiBold, fontSize: 11, letterSpacing: 2.2, color: Palette.text },
});
