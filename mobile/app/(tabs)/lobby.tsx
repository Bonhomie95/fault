import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Busy } from '@/components/Busy';
import { StandingBar } from '@/components/StandingBar';
import { Courthouse } from '@/components/Courthouse';
import Feather from '@expo/vector-icons/Feather';
import { Button } from '@/components/Button';
import { Enter } from '@/components/Enter';
import { Accents, Fonts, Palette, Radius, Space, Type } from '@/constants/theme';
import { ApiError, api, type NewsStory, type StoreView } from '@/lib/api';
import * as haptic from '@/lib/haptics';
import { play } from '@/lib/sound';
import { useGame } from '@/store/game';
import { AwayReport } from '@/components/world/LobbyWorld';
import { planReminders } from '@/lib/reminders';
import { DailyTrialCard, DocketClosed, docketLine, OfferStrip, SpecialDockets } from '@/components/world/Docket';

/**
 * GDD 6, Screen 3 — Courthouse Lobby.
 *
 * The City Pulse is the only place the numbers appear, and even here they are
 * a consequence, not a score. The city model behind them is the real readout;
 * the bars are just the part you can quote.
 */
export default function Lobby() {
  const city = useGame((s) => s.city);
  const merit = useGame((s) => s.merit);
  const standing = useGame((s) => s.standing);
  const refreshCity = useGame((s) => s.refreshCity);
  const refreshStanding = useGame((s) => s.refreshStanding);
  const loadCase = useGame((s) => s.loadCase);
  const [loading, setLoading] = useState(false);
  const [gate, setGate] = useState<string | null>(null);
  /** Bumped whenever the lobby comes back into focus, so the papers and
   *  missions refetch alongside the city. */
  const [focusKey, setFocusKey] = useState(0);
  /** What happened while the player was away — shown once, then dismissed. */
  const [away, setAway] = useState<NewsStory[] | null>(null);
  const refreshWallet = useGame((s) => s.refreshWallet);
  /** The shelf, for offers and special dockets. Null until it loads. */
  const [store, setStore] = useState<StoreView | null>(null);
  /** Today's docket is closed: show the ways to reopen it. */
  const [closed, setClosed] = useState(false);
  /** Which docket is being opened: 'next', 'daily' or a pack key. */
  const [opening, setOpening] = useState<string | null>(null);

  const loadStore = useCallback(() => {
    api
      .store()
      .then(setStore)
      .catch(() => setStore(null));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshCity();
      void refreshStanding();
      loadStore();
      setFocusKey((k) => k + 1);
    }, [refreshCity, refreshStanding, loadStore]),
  );

  // Re-plan this phone's reminders from what is true now: whether the summons
  // is waiting, whether the streak needs a case today, and the latest headline.
  useEffect(() => {
    if (!standing) return;
    let live = true;
    api
      .news()
      .then((r) => r.items[0] ?? null)
      .catch(() => null)
      .then((top) => {
        if (!live) return;
        void planReminders({
          summonsWaiting: standing.daily?.available ?? false,
          streak: standing.currentStreak,
          satToday: standing.daily?.satToday ?? false,
          headline: top ? { outlet: top.outlet, text: top.headline } : null,
          district: standing.district,
        });
      });
    return () => {
      live = false;
    };
  }, [standing]);

  // The city clock runs on the city-state request; if it printed anything,
  // the player has been away long enough to be told what they missed.
  useEffect(() => {
    if (city?.away && city.away.length > 0) setAway(city.away);
  }, [city?.away]);

  /**
   * Open a docket: the ordinary one, the Daily Trial, or a special docket.
   *
   * Guarded three ways: this check, the busy prop, and the Busy scrim.
   * Opening a case can cost a model generation and starts a 120-second clock
   * — a double-tap here is the most expensive accident available.
   */
  const open = useCallback(
    async (which: { daily?: boolean; pack?: string } = {}) => {
      if (loading) return;
      const key = which.daily ? 'daily' : (which.pack ?? 'next');
      setLoading(true);
      setOpening(key);
      setGate(null);
      play('paper');
      haptic.tapLight();
      try {
        await loadCase(which);
        router.push('/case');
      } catch (err) {
        if (err instanceof ApiError && (err.code === 'docket_closed' || err.code === 'trial_complete')) {
          loadStore();
          setClosed(true);
        } else if (err instanceof ApiError && err.code === 'daily_done') {
          setGate('You have sat today’s trial. The next one opens at midnight UTC.');
          setFocusKey((k) => k + 1);
        } else if (err instanceof ApiError && err.status !== 500 && err.message) {
          setGate(err.message);
        } else {
          setGate('The docket could not be reached.');
        }
      } finally {
        setLoading(false);
        setOpening(null);
      }
    },
    [loading, loadCase, loadStore],
  );
  const beginCase = useCallback(() => open(), [open]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Enter style={styles.header}>
            <View><Text style={styles.brand}>FAULT<Text style={{ color: Accents.financial }}> /</Text></Text><Text style={styles.eyebrow}>A CITY SHAPED BY YOU</Text></View>
            <View style={styles.headRight}>
              {/* Merit, where a player can actually see it.
                  It lived only inside the Clerk's Office, which meant the
                  currency the whole economy runs on was invisible until you
                  went looking for the shop — so nobody knew what they had, and
                  nobody knew earning it was doing anything. Tapping it opens
                  the shelf, because that is the question it provokes. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${merit} Merit. Open the Clerk's Office.`}
                onPress={() => router.push('/store')}
                style={styles.wallet}
              >
                <Feather name="award" size={13} color={Accents.financial} />
                <Text style={styles.walletText}>{merit.toLocaleString()}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Open settings" onPress={() => router.push('/settings')} style={styles.settings}><Feather name="sliders" size={19} color={Palette.text}/></Pressable>
            </View>
          </Enter>
          <Enter index={1} style={styles.welcome}>
            <Text style={styles.title}>The city is listening.</Text>
            <Text style={styles.subtitle}>One seat. Two minutes. A lasting consequence.</Text>
          </Enter>
          <Enter index={2} style={styles.caseFile}>
            <View style={styles.heroTop}><View style={styles.live}><View style={styles.dot}/><Text style={styles.liveText}>COURT IN SESSION</Text></View><Text style={styles.chapter}>CH. {String(city?.chapter ?? 1).padStart(2, '0')}</Text></View>
            <Courthouse />
            <View style={styles.heroCopy}>
              <Text style={styles.caseFileEyebrow}>YOUR NEXT VERDICT</Text>
              <Text style={styles.caseFileLabel}>A life in the balance.</Text>
              <Text style={styles.description}>Hear their story. Question the evidence.
Decide where the truth lies.</Text>
              <Button label="Hear a case   →" icon="folder" onPress={beginCase} variant="primary" busy={opening === 'next'} accent={Accents.financial} accessibilityLabel="Hear the next case. The clock starts immediately." />
              <View style={styles.heroFoot}><Feather name="clock" size={12} color={Palette.textMuted}/><Text style={styles.foot}>Clock starts on entry</Text><Text style={styles.foot}>{docketLine(standing?.docket) ?? '120 SECONDS'}</Text></View>
            </View>
          </Enter>
          <Enter index={3} style={styles.links}>
            <Pressable accessibilityRole="button" onPress={() => router.push('/news')} style={styles.link}><Feather name="radio" size={20} color="#E9C7A1"/><Text style={styles.linkTitle}>The city speaks</Text><Text style={styles.linkDetail}>Read the aftermath  ↗</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push('/career')} style={styles.link}><Feather name="compass" size={20} color={Accents.financial}/><Text style={styles.linkTitle}>Your next chapter</Text><Text style={styles.linkDetail}>Explore your career  ↗</Text></Pressable>
          </Enter>
          {standing && <Enter index={4}><Text style={styles.section}>YOUR STANDING</Text><StandingBar standing={standing} /></Enter>}
          <Enter index={5}><DailyTrialCard refreshKey={focusKey} onOpen={() => void open({ daily: true })} busy={opening === 'daily'} /></Enter>
          {/* NOT an entering animation, deliberately.
              This is the only thing on the screen that explains why the one
              button that matters did nothing — the trial docket is closed and
              the case was refused with a 402. Wrapped in `Animated.Text
              entering={FadeIn}` it was mounted, laid out, given its colour and
              left at `visibility: hidden` forever, so the player saw a button
              that did nothing at all and no reason why. Adding a duration does
              not fix it; the same is true of the notices on the store and
              career screens, and they are plain Text for the same reason. A
              message a player has to read does not get to depend on an
              animation running. */}
          {gate && <Text style={styles.gate}>{gate}</Text>}

          <SpecialDockets store={store} busy={opening} onOpen={(key) => void open({ pack: key })} />

          <OfferStrip store={store} />
        </ScrollView>
      </SafeAreaView>

      {/* Nothing on this screen is tappable while the docket is being fetched. */}
      {loading && <Busy label="THE CLERK IS FETCHING THE FILE" />}

      {away && away.length > 0 && <AwayReport stories={away} onClose={() => setAway(null)} />}

      {closed && (
        <DocketClosed
          store={store}
          onClose={() => setClosed(false)}
          onReopened={() => {
            setClosed(false);
            void refreshStanding();
            void refreshWallet();
            loadStore();
            void open();
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  safe: { flex: 1 },
  content: { paddingHorizontal: Space.xl, paddingTop: Space.lg, paddingBottom: Space.xxl, gap: Space.xl, maxWidth: 620, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { fontFamily: Fonts.uiBold, fontSize: Type.heading, letterSpacing: 5, color: Palette.text },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  wallet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Space.md,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Palette.hairlineBright,
    backgroundColor: Palette.surface,
  },
  walletText: { fontFamily: Fonts.monoBold, fontSize: Type.small, color: Accents.financial },
  eyebrow: { fontFamily: Fonts.ui, fontSize: Type.micro, letterSpacing: 2, color: Palette.textMuted, marginTop: 6 },
  settings: { width: 44, height: 44, borderRadius: 22, backgroundColor: Palette.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Palette.hairline },
  welcome: { gap: 8 },
  title: { fontFamily: Fonts.displayRegular, fontSize: Type.title, color: Palette.text },
  subtitle: { fontFamily: Fonts.ui, fontSize: Type.small, color: Palette.textMuted, lineHeight: 21 },
  caseFile: { backgroundColor: Palette.surface, borderRadius: 28, borderWidth: 1, borderColor: Palette.hairline, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 0 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Accents.financial },
  liveText: { fontFamily: Fonts.uiBold, fontSize: Type.micro, letterSpacing: 1.4, color: Accents.financial },
  chapter: { fontFamily: Fonts.mono, fontSize: Type.micro, color: Palette.textMuted },
  heroCopy: { padding: 22, paddingTop: 0, gap: 14 },
  caseFileEyebrow: { fontFamily: Fonts.uiBold, fontSize: Type.micro, letterSpacing: 2, color: '#E9C7A1' },
  caseFileLabel: { fontFamily: Fonts.displayRegular, fontSize: Type.title, lineHeight: 38, color: Palette.text },
  description: { fontFamily: Fonts.ui, fontSize: Type.small, lineHeight: 22, color: Palette.textMuted, marginBottom: 4 },
  heroFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5 },
  foot: { fontFamily: Fonts.ui, fontSize: Type.micro, color: Palette.textMuted },
  links: { flexDirection: 'row', gap: 12 },
  link: { flex: 1, padding: 16, borderRadius: 20, backgroundColor: Palette.surface, gap: 10, borderWidth: 1, borderColor: Palette.hairline },
  linkTitle: { fontFamily: Fonts.uiBold, fontSize: Type.small, color: Palette.text },
  linkDetail: { fontFamily: Fonts.ui, fontSize: Type.micro, lineHeight: 17, color: Palette.textMuted },
  section: { fontFamily: Fonts.uiBold, fontSize: Type.micro, letterSpacing: 2, color: Palette.textMuted, marginBottom: 12 },
  gate: { fontFamily: Fonts.ui, fontSize: Type.small, lineHeight: 20, color: Accents.financial, textAlign: 'center' },
});
