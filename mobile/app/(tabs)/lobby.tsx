import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Busy } from '@/components/Busy';
import { StandingBar } from '@/components/StandingBar';
import { CityScene } from '@/components/three/CityScene';
import { Button } from '@/components/Button';
import { Enter } from '@/components/Enter';
import { Accents, Elevation, Fonts, IMPACT_LEADING, Palette, Radius, Space, Type } from '@/constants/theme';
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
      {/* Orun City, as your verdicts have left it. */}
      <View style={styles.sceneWrap}>
        {city ? <CityScene city={city} /> : <View style={styles.sceneFallback} />}
        <View style={styles.sceneScrim} pointerEvents="none" />
      </View>

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.docket}>CASE DOCKET</Text>
            {city && (
              <View style={styles.chapterRow}>
                <View style={styles.chip}>
                  <Text style={styles.chipText}>CHAPTER {city.chapter}</Text>
                </View>
                <Text style={styles.chapter}>{city.casesHeard} HEARD</Text>
              </View>
            )}
          </View>

          {/* Who you are and where you sit — the record, on the way in. */}
          {standing && (
            <Enter>
              <StandingBar standing={standing} />
            </Enter>
          )}

          {/* The one thing this screen is for. It is the only filled button on
              the page, because it is the only action that matters. */}
          {/* One case for the whole world, today. */}
          <Enter index={1}>
            <DailyTrialCard
              refreshKey={focusKey}
              onOpen={() => void open({ daily: true })}
              busy={opening === 'daily'}
            />
          </Enter>

          <Enter index={2} style={styles.caseFile}>
            <Text style={styles.caseFileEyebrow}>
              NEXT ON THE DOCKET{docketLine(standing?.docket) ? ` · ${docketLine(standing?.docket)}` : ''}
            </Text>
            <Text style={styles.caseFileLabel}>A CASE FILE{'\n'}IS WAITING</Text>
            <Button
              label="Open the file"
              onPress={beginCase}
              variant="primary"
              busy={opening === 'next'}
              accent={Accents.financial}
              hint="The clock starts immediately"
              accessibilityLabel="Open the next case file. The clock starts immediately."
              style={styles.caseFileBtn}
            />
          </Enter>

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

/**
 * A city meter.
 *
 * This used to be `'█'.repeat(filled)` — a bar drawn out of block characters in
 * a monospace font, quantised to seven steps, so a shift from 50 to 57 moved
 * nothing at all. It is geometry now: real width, real colour, and the number
 * in a tabular face so the column does not jitter as digits change.
 *
 * Colour is by role rather than by good/bad, because none of these are good or
 * bad — a city with no crime and no trust is not a city anyone wants.
 */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  sceneWrap: { ...StyleSheet.absoluteFillObject },
  sceneFallback: { flex: 1, backgroundColor: Palette.bg },
  // Keeps the type legible over a moving city without hiding it.
  sceneScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11,11,12,0.62)',
  },
  safe: { flex: 1 },
  // Home is one screen. Everything that is not "hear a case today" now lives
  // in its own tab, and what is left is sized to land above the tab bar
  // without a scroll on a 375pt phone.
  content: { padding: Space.xl, paddingTop: Space.md, gap: Space.md, paddingBottom: Space.lg },

  header: { gap: Space.sm },
  docket: {
    fontFamily: Fonts.impact,
    fontSize: Type.title,
    lineHeight: Type.title * IMPACT_LEADING,
    letterSpacing: 0.5,
    color: Palette.text,
    textTransform: 'uppercase',
  },
  chapterRow: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  chip: {
    backgroundColor: Palette.surfaceHigh,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs + 1,
    borderRadius: Radius.pill,
  },
  chipText: {
    fontFamily: Fonts.uiBold,
    fontSize: Type.micro,
    letterSpacing: 1.4,
    color: Palette.text,
  },
  chapter: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 1.8,
    color: Palette.textMuted,
  },

  caseFile: {
    backgroundColor: Palette.surfaceRaised,
    borderRadius: Radius.lg,
    padding: Space.lg,
    gap: Space.sm,
    borderWidth: 1,
    borderColor: Palette.hairlineBright,
    ...Elevation.raised,
  },
  caseFileEyebrow: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 2.2,
    color: Accents.financial,
  },
  caseFileLabel: {
    fontFamily: Fonts.impact,
    fontSize: Type.title,
    lineHeight: Type.title * IMPACT_LEADING,
    color: Palette.text,
    textTransform: 'uppercase',
  },
  caseFileBtn: { marginTop: Space.lg },

  gate: {
    fontFamily: Fonts.ui,
    fontSize: Type.small,
    lineHeight: 20,
    color: Accents.financial,
    textAlign: 'center',
  },


});
