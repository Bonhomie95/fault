import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StandingBar } from '@/components/StandingBar';
import { Fonts, Palette } from '@/constants/theme';
import { ApiError, api, type JurisdictionsView, type Mission, type Tier } from '@/lib/api';
import { useGame } from '@/store/game';

/**
 * The career.
 *
 * Everything the player is climbing, in one room: the ladder out of their own
 * district, the benches abroad that may or may not have them, and the missions
 * that are worth coming back for. Deliberately separate from the Juror Record,
 * which is about who you *are*; this screen is about where you can go.
 */
export default function Career() {
  const jurorId = useGame((s) => s.jurorId);
  const standing = useGame((s) => s.standing);
  const refreshStanding = useGame((s) => s.refreshStanding);

  const [ladder, setLadder] = useState<{ tier: Tier; label: string; reached: boolean }[] | null>(null);
  const [missions, setMissions] = useState<Mission[] | null>(null);
  const [jurisdictions, setJurisdictions] = useState<JurisdictionsView | null>(null);
  const [foreignLock, setForeignLock] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!jurorId) {
      router.replace('/lobby');
      return;
    }
    await refreshStanding();

    const [l, m] = await Promise.all([
      api.ladder(jurorId).catch(() => null),
      api.missions(jurorId).catch(() => null),
    ]);
    if (l) setLadder(l.rungs);
    if (m) setMissions(m.missions);

    try {
      setJurisdictions(await api.jurisdictions(jurorId));
      setForeignLock(null);
    } catch (err) {
      // Locked is a normal state here, not a failure.
      setForeignLock(
        err instanceof ApiError && err.code === 'locked'
          ? err.message
          : 'Foreign benches could not be reached.',
      );
    }
  }, [jurorId, refreshStanding]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onPromote = useCallback(async () => {
    if (!jurorId || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await api.promote(jurorId);
      setNotice(`You now sit at ${r.standing.tierLabel}.`);
      await load();
    } catch (err) {
      setNotice(
        err instanceof ApiError && Array.isArray((err as never)['blockedBy'])
          ? 'The bench declined.'
          : 'The bench is not ready to hear from you.',
      );
    } finally {
      setBusy(false);
    }
  }, [jurorId, busy, load]);

  const onClaim = useCallback(
    async (key: string) => {
      if (!jurorId || busy) return;
      setBusy(true);
      try {
        await api.claimMission(jurorId, key);
        await load();
      } finally {
        setBusy(false);
      }
    },
    [jurorId, busy, load],
  );

  const onApply = useCallback(
    async (country: string) => {
      if (!jurorId || busy || !standing) return;
      setBusy(true);
      setNotice(null);
      try {
        const r = await api.applyToJurisdiction(jurorId, { country, tier: 'district' });
        setNotice(r.decisionText);
        await load();
      } catch {
        setNotice('That application could not be filed.');
      } finally {
        setBusy(false);
      }
    },
    [jurorId, busy, standing, load],
  );

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>THE CAREER</Text>

          {standing ? <StandingBar standing={standing} /> : <ActivityIndicator color={Palette.text} />}

          {notice && (
            <Animated.Text entering={FadeIn} style={styles.notice}>
              {notice}
            </Animated.Text>
          )}

          {/* ---- The ladder ---- */}
          <Section title="THE LADDER">
            {ladder?.map((rung) => (
              <View key={rung.tier} style={styles.rung}>
                <Text style={[styles.rungMark, rung.reached && styles.rungMarkOn]}>
                  {rung.reached ? '■' : '□'}
                </Text>
                <Text style={[styles.rungLabel, rung.reached && styles.rungLabelOn]}>
                  {rung.label}
                </Text>
              </View>
            ))}

            {standing?.promotion && (
              <View style={styles.promotion}>
                {standing.promotion.eligible ? (
                  <Pressable onPress={onPromote} disabled={busy} style={styles.promoteButton}>
                    <Text style={styles.promoteText}>
                      ASK TO SIT AT {standing.promotion.tierLabel.toUpperCase()}
                    </Text>
                  </Pressable>
                ) : (
                  <>
                    <Text style={styles.blockedTitle}>
                      {standing.promotion.tierLabel} is not open to you yet
                    </Text>
                    {standing.promotion.blockedBy.map((b) => (
                      <Text key={b} style={styles.blocked}>
                        — {b}
                      </Text>
                    ))}
                  </>
                )}
              </View>
            )}
          </Section>

          {/* ---- Missions ---- */}
          <Section title="STANDING ORDERS">
            {missions === null && <ActivityIndicator color={Palette.textMuted} />}
            {missions?.map((m) => (
              <View key={m.key} style={styles.mission}>
                <View style={styles.missionHead}>
                  <Text style={styles.missionTitle}>{m.title}</Text>
                  <Text style={styles.missionKind}>{m.kind.toUpperCase()}</Text>
                </View>
                <Text style={styles.missionDesc}>{m.description}</Text>
                <View style={styles.missionFoot}>
                  <View style={styles.missionTrack}>
                    <View
                      style={[
                        styles.missionFill,
                        { width: `${Math.min(100, (m.progress / m.target) * 100)}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.missionCount}>
                    {Math.min(m.progress, m.target)}/{m.target}
                  </Text>
                  {m.complete && !m.claimed && (
                    <Pressable onPress={() => onClaim(m.key)} disabled={busy} style={styles.claim}>
                      <Text style={styles.claimText}>CLAIM {m.xp}</Text>
                    </Pressable>
                  )}
                  {m.claimed && <Text style={styles.claimed}>CLAIMED</Text>}
                </View>
              </View>
            ))}
          </Section>

          {/* ---- Foreign benches ---- */}
          <Section title="OTHER JURISDICTIONS">
            {foreignLock && <Text style={styles.locked}>{foreignLock}</Text>}

            {jurisdictions?.applications.map((a) => (
              <View key={a.id} style={styles.application}>
                <Text
                  style={[
                    styles.applicationStatus,
                    a.status === 'accepted' ? styles.accepted : styles.rejected,
                  ]}
                >
                  {a.country} — {a.status.toUpperCase()}
                </Text>
                {a.decisionText && <Text style={styles.decision}>{a.decisionText}</Text>}
              </View>
            ))}

            {jurisdictions?.countries.map((c) => (
              <Pressable
                key={c.code}
                onPress={() => onApply(c.code)}
                disabled={busy}
                style={styles.country}
              >
                <Text style={styles.countryName}>{c.name}</Text>
                <Text style={styles.countryApply}>APPLY</Text>
              </Pressable>
            ))}
          </Section>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable onPress={() => router.replace('/lobby')} style={styles.back}>
            <Text style={styles.backText}>BACK TO DOCKET</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  safe: { flex: 1 },
  content: { padding: 20, gap: 20 },
  title: { fontFamily: Fonts.display, fontSize: 30, color: Palette.text },
  notice: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    lineHeight: 18,
    color: '#D4860A',
    backgroundColor: 'rgba(212,134,10,0.08)',
    padding: 10,
    borderRadius: 2,
  },
  section: { gap: 8 },
  sectionTitle: {
    fontFamily: Fonts.mono,
    fontSize: 8,
    letterSpacing: 2.4,
    color: Palette.textMuted,
    marginBottom: 2,
  },
  rung: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 },
  rungMark: { fontFamily: Fonts.mono, fontSize: 10, color: Palette.textFaint },
  rungMarkOn: { color: '#1D7E6A' },
  rungLabel: { fontFamily: Fonts.mono, fontSize: 12, color: Palette.textFaint },
  rungLabelOn: { color: Palette.text },
  promotion: { marginTop: 10, gap: 4 },
  promoteButton: {
    borderWidth: 1,
    borderColor: '#1D7E6A',
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: 2,
  },
  promoteText: { fontFamily: Fonts.uiBold, fontSize: 11, letterSpacing: 1.8, color: '#1D7E6A' },
  blockedTitle: { fontFamily: Fonts.mono, fontSize: 11, color: Palette.textMuted },
  blocked: { fontFamily: Fonts.mono, fontSize: 10, lineHeight: 17, color: Palette.textFaint },
  mission: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: 2,
    padding: 12,
    gap: 6,
  },
  missionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  missionTitle: { fontFamily: Fonts.displayRegular, fontSize: 15, color: Palette.text, flex: 1 },
  missionKind: { fontFamily: Fonts.mono, fontSize: 7, letterSpacing: 1.4, color: Palette.textFaint },
  missionDesc: { fontFamily: Fonts.mono, fontSize: 10, lineHeight: 16, color: Palette.textMuted },
  missionFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  missionTrack: { flex: 1, height: 2, backgroundColor: Palette.hairline },
  missionFill: { height: 2, backgroundColor: '#1D7E6A' },
  missionCount: { fontFamily: Fonts.mono, fontSize: 9, color: Palette.textMuted },
  claim: {
    borderWidth: 1,
    borderColor: '#D4860A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 2,
  },
  claimText: { fontFamily: Fonts.mono, fontSize: 8, letterSpacing: 1, color: '#D4860A' },
  claimed: { fontFamily: Fonts.mono, fontSize: 8, letterSpacing: 1, color: Palette.textFaint },
  locked: { fontFamily: Fonts.mono, fontSize: 11, lineHeight: 18, color: Palette.textFaint },
  application: {
    borderLeftWidth: 2,
    borderLeftColor: Palette.hairline,
    paddingLeft: 10,
    paddingVertical: 6,
    gap: 4,
  },
  applicationStatus: { fontFamily: Fonts.monoBold, fontSize: 10, letterSpacing: 1 },
  accepted: { color: '#1D7E6A' },
  rejected: { color: '#C23B22' },
  decision: { fontFamily: Fonts.mono, fontSize: 10, lineHeight: 17, color: Palette.textMuted },
  country: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairline,
  },
  countryName: { fontFamily: Fonts.mono, fontSize: 12, color: Palette.text },
  countryApply: { fontFamily: Fonts.mono, fontSize: 8, letterSpacing: 1.4, color: Palette.textMuted },
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
