import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Clock, Fonts, Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import { useGame } from '@/store/game';

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
