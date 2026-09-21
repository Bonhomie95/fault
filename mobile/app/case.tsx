import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Adjourned } from '@/components/Adjourned';
import { Busy } from '@/components/Busy';
import { ReportCase } from '@/components/ReportCase';
import { CourtSpeech } from '@/components/CourtSpeech';
import { TimerRing } from '@/components/TimerRing';
import { VerdictButton } from '@/components/VerdictButton';
import { CourtroomScene, type DossierTab } from '@/components/scene2d/CourtroomScene';
import { Clock, Fonts, Layout, Palette, Space, Type } from '@/constants/theme';
import type { ClientCase } from '@/lib/api';
import { castFor } from '@/lib/cast';
import { useCourtroomTalk } from '@/lib/courtroom';
import * as haptic from '@/lib/haptics';
import { useReducedMotion } from '@/lib/motion';
import { play, startBed, stopAllBeds, stopBed } from '@/lib/sound';
import { useGame } from '@/store/game';
import { canSpeak, warmVoices } from '@/lib/say';
import { showsText, useSettings } from '@/store/settings';

/**
 * How far below the header the accused's eyes sit: clear of the tab strip,
 * with the whole crown in view.
 *
 * Nothing floats over the face any more. What people say is a subtitle above
 * the verdict buttons (see CourtSpeech), so the camera frames against the
 * header alone, which never changes while the case is open — the face does
 * not jump when somebody starts talking.
 */
const FACE_BELOW_HEADER = 188;

const TABS: { key: DossierTab; label: string }[] = [
  { key: 'defendant', label: 'DEFENDANT' },
  { key: 'evidence', label: 'EVIDENCE' },
  { key: 'witnesses', label: 'WITNESSES' },
  { key: 'arguments', label: 'ARGUMENTS' },
];

/**
 * GDD 6, Screen 4 — the Case File.
 *
 * The clock starts when this screen loads. There is no "ready?" prompt,
 * because you are already in the room and nobody asked if you were ready.
 * No case can be fully read in the time given (GDD 2.1) — that is the design,
 * not a bug to fix.
 */
export default function CaseFile() {
  const activeCase = useGame((s) => s.activeCase);
  const deliverVerdict = useGame((s) => s.deliverVerdict);

  const [tab, setTab] = useState<DossierTab>('defendant');
  const [examined, setExamined] = useState<string | null>(null);
  const [focusedWitness, setFocusedWitness] = useState(0);
  const [remaining, setRemaining] = useState(activeCase?.clockSeconds ?? Clock.defaultSeconds);
  const [delivering, setDelivering] = useState(false);
  /**
   * The window closed while the player was away, and they have not been told
   * yet. Held in state rather than read straight off the case so the notice
   * survives the acknowledgement that dismisses it.
   */
  const [adjourned, setAdjourned] = useState(activeCase?.adjourned === true);
  /** The reporting sheet. Deliberately not on the clock — see below. */
  const [reporting, setReporting] = useState(false);
  /**
   * Where the header actually ends, measured.
   *
   * The plea used to be pinned at `top: 96`, and a charge is one to three
   * lines of wrapped text above a court name that may or may not be there —
   * so on most cases the bubble sat on top of the charge it was meant to be
   * reacting to. A fixed offset also cannot survive a larger text size, which
   * this screen otherwise honours, or a device with a different safe area.
   */
  const [headerBottom, setHeaderBottom] = useState(96);
  const reducedMotion = useReducedMotion();
  // Where the verdict buttons begin, so the subtitle can sit just above them.
  const { height: screenH } = useWindowDimensions();
  const [verdictsTop, setVerdictsTop] = useState(screenH - 90);
  const speech = useSettings((s) => s.speech);
  const muted = useSettings((s) => s.muted);

  // Who plays whom. Keyed on the case, so the room is not recast every tick.
  const casting = useMemo(
    () => (activeCase ? castFor(activeCase) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeCase?.id],
  );

  useEffect(() => {
    void warmVoices();
  }, []);

  // Who is talking. The room answers what the juror is doing — see lib/courtroom.
  const utterance = useCourtroomTalk({
    activeCase,
    casting,
    tab,
    examined,
    focusedWitness,
    remaining,
    active: !delivering && !adjourned && !reporting,
  });

  /**
   * How much of the file the player actually opened, for missions ("read the
   * whole file before deciding"). Refs, not state: nothing renders from them,
   * and a re-render per tap would be waste under a running clock.
   */
  const opened = useRef({ exhibits: new Set<string>(), witnesses: new Set<number>(), arguments: false });
  useEffect(() => {
    if (examined) opened.current.exhibits.add(examined);
  }, [examined]);
  useEffect(() => {
    if (tab === 'witnesses') opened.current.witnesses.add(focusedWitness);
    if (tab === 'arguments') opened.current.arguments = true;
  }, [tab, focusedWitness]);

  // Guards the forced verdict: the clock hitting zero and a player tapping at
  // 0.4s left must never both submit.
  const submitted = useRef(false);

  const submit = useCallback(
    async (verdict: 'guilty' | 'not_guilty' | null) => {
      if (submitted.current) return;
      submitted.current = true;
      setDelivering(true);
      try {
        // Only the direction travels. How long we took is the server's to
        // measure — it has been counting since it served the case.
        await deliverVerdict(verdict, {
          examined: Math.min(3, opened.current.exhibits.size),
          witnesses: Math.min(2, opened.current.witnesses.size),
          arguments: opened.current.arguments,
        });
        router.replace('/verdict');
      } catch {
        /**
         * Let them try again — but ONLY if the clock has not already run out.
         *
         * Resetting the guard unconditionally is what stranded a player whose
         * verdict failed at zero: nothing else was ever going to call submit
         * again, the clock was dead, and the screen had no way forward. When
         * the window has closed the case is over whatever happened here, so
         * leave rather than sit on it.
         */
        if (verdict === null) {
          router.replace('/lobby');
          return;
        }
        submitted.current = false;
        setDelivering(false);
      }
    },
    [deliverVerdict],
  );

  /**
   * No case in hand means a reload landed here directly. Go back to the docket.
   *
   * Except at the one moment when there legitimately is no case: delivering a
   * verdict clears `activeCase`, which fired this and raced
   * `router.replace('/verdict')` for the same navigation. Whichever won, the
   * player could land back on the docket with the verdict screen skipped —
   * and the aftermath is the payload of the whole case.
   */
  useEffect(() => {
    if (!activeCase && !submitted.current) router.replace('/lobby');
  }, [activeCase]);

  // The room runs under the whole case and stops when you leave it, however
  // you leave it — a bed still playing over the verdict screen would be worse
  // than no bed at all.
  useEffect(() => {
    if (!activeCase) return;
    play('open');
    startBed('room');
    return () => stopAllBeds();
    // Keyed on the id rather than the object. The object is in fact stable —
    // the store sets activeCase once on load and nulls it at the verdict, and
    // nothing touches it in between — but the id is what actually identifies a
    // case, and keying on identity rather than on reference means this survives
    // the store ever being changed to hand back a fresh object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCase?.id]);

  // GDD 2.2 — the tension tone begins at fifteen seconds and does not stop.
  useEffect(() => {
    if (delivering) return;
    if (remaining <= Clock.tensionAt && remaining > 0) startBed('tension');
    else stopBed('tension');
  }, [remaining, delivering]);

  // The countdown.
  //
  // This is a DISPLAY of the server's clock, not the clock. `clockSeconds` is
  // whatever the server said was left when it served the case — which, on a
  // reload mid-case, is already partly spent. We count down from there so the
  // number on screen matches the number the server will use, and we submit
  // without claiming a time at all.
  useEffect(() => {
    if (!activeCase) return;
    // The window has already closed — the Adjourned notice is up and the
    // player has not acknowledged it yet. Starting a countdown from zero here
    // would fire the forced verdict underneath the notice, which is the exact
    // silent charge that notice exists to prevent.
    if (adjourned) return;

    const total = activeCase.clockSeconds;
    const startedAt = Date.now();

    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const left = Math.max(0, total - elapsed);
      setRemaining(left);

      // GDD 2.2 — the last five seconds are felt and heard, once per second.
      if (left <= Clock.hapticAt && left > 0) {
        haptic.tick();
        play('tick');
      }

      if (left === 0) {
        clearInterval(id);
        stopAllBeds();
        haptic.clockRanOut();
        // Forced verdict. The server flips the coin and records it as hung —
        // and would do so anyway on lateness, whatever we sent.
        void submit(null);
      }
    }, 1000);

    return () => clearInterval(id);
  }, [activeCase, submit, adjourned]);

  if (!activeCase || !casting) return <View style={styles.root} />;

  const accent = activeCase.accent;
  const urgent = remaining <= Clock.tensionAt;

  return (
    <View style={styles.root}>
      {/* The room, behind everything. */}
      <View style={styles.scene}>
        <CourtroomScene
          activeCase={activeCase}
          tab={tab}
          examinedEvidence={examined}
          onSelectEvidence={setExamined}
          focusedWitness={focusedWitness}
          // The room tightens as the clock runs out, on the same threshold the
          // tension bed uses — so what you hear and what you see agree.
          remaining={remaining}
          tensionAt={Clock.tensionAt}
          // Where the face has to sit to be under the speech and above the
          // dossier. Both hang off the measured header, so the room is told
          // in screen pixels rather than guessing in scene units.
          eyesY={headerBottom + FACE_BELOW_HEADER}
          casting={casting!}
          utterance={utterance}
        />
      </View>

      {/* What was just said, and by whom — a subtitle above the verdict
          buttons on every tab. Never over a face: the face is what the player
          is weighing the words against. */}
      <View
        style={[styles.thought, { bottom: Math.max(0, screenH - verdictsTop) + Space.sm }]}
        pointerEvents="none"
      >
        <CourtSpeech
          activeCase={activeCase}
          utterance={utterance}
          accent={accent}
          showText={showsText(speech, muted, canSpeak())}
          reducedMotion={reducedMotion}
        />
      </View>

      <TimerRing
        remaining={remaining}
        total={activeCase.clockSeconds}
        accent={accent}
        running={!delivering}
      />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View
          style={styles.header}
          onLayout={(e) => setHeaderBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
        >
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={2}>
              {activeCase.title.toUpperCase()}
            </Text>
            <Text style={styles.charge}>Charge: {activeCase.charge}</Text>
            {/* The real court this sits in. The place is real; everyone in the
                room is invented. */}
            {activeCase.place.jurisdiction.length > 0 && (
              <Text style={styles.jurisdiction}>{activeCase.place.jurisdiction}</Text>
            )}
            {/* Reporting a case, deliberately understated.
                These files are model-written and unreviewed, so a player needs
                a way to say one is wrong — and needs it BEFORE they are made
                to judge it, which is why it lives here rather than only on the
                verdict screen. It is a filing note, not a button: anything
                louder would compete with the dossier for the 120 seconds the
                game asked for. Note that opening it does NOT pause the clock —
                a pause here would be the one exploit worth having. */}
            <Pressable
              onPress={() => setReporting(true)}
              accessibilityRole="button"
              accessibilityLabel="Report a problem with this case file"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.reportLink}>REPORT THIS FILE</Text>
            </Pressable>
          </View>
          <Text style={[styles.clock, urgent && { color: accent }]}>
            {String(Math.floor(remaining / 60)).padStart(2, '0')}:
            {String(remaining % 60).padStart(2, '0')}
          </Text>
        </View>

        {/* The dossier sits over the room, not instead of it. */}
        <View style={styles.dossier}>
          <View style={styles.tabStrip}>
            {TABS.map((t) => (
              <Pressable
                key={t.key}
                onPress={() => {
                  if (t.key === tab) return;
                  play('paper');
                  haptic.tapLight();
                  setTab(t.key);
                }}
                style={[styles.tab, tab === t.key && { borderBottomColor: accent }]}
                accessibilityRole="tab"
                accessibilityLabel={`${t.label} section of the case file`}
                accessibilityState={{ selected: tab === t.key }}
                // The four most-tapped targets in the game, previously ~29pt
                // tall against the 44pt minimum this project states in its own
                // theme file — and tapped repeatedly under a 120-second clock.
                // The strip cannot simply grow (it would eat the room behind
                // it), so the touchable area extends past the visible one.
                hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
              >
                <Text style={[styles.tabLabel, tab === t.key && { color: Palette.text }]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <ScrollView
            style={styles.panel}
            contentContainerStyle={[
              styles.panelContent,
              tab === 'defendant' && styles.panelBelowTheFace,
              tab === 'witnesses' && styles.panelBelowTheWitness,
            ]}
            showsVerticalScrollIndicator={false}
          >
            {tab === 'defendant' && <DefendantTab activeCase={activeCase} accent={accent} />}
            {tab === 'evidence' && (
              <EvidenceTab
                activeCase={activeCase}
                accent={accent}
                examined={examined}
                onExamine={setExamined}
              />
            )}
            {tab === 'witnesses' && (
              <WitnessesTab
                activeCase={activeCase}
                accent={accent}
                focused={focusedWitness}
                onFocus={setFocusedWitness}
              />
            )}
            {tab === 'arguments' && <ArgumentsTab activeCase={activeCase} accent={accent} />}
          </ScrollView>
        </View>

        {/* Always visible. Never scrolls away. (GDD 6, Screen 4) */}
        <View
          style={styles.verdicts}
          onLayout={(e) => setVerdictsTop(e.nativeEvent.layout.y)}
        >
          <VerdictButton
            label="GUILTY"
            accent={accent}
            disabled={delivering}
            onConfirm={() => submit('guilty')}
          />
          <VerdictButton
            label="NOT GUILTY"
            accent={accent}
            disabled={delivering}
            onConfirm={() => submit('not_guilty')}
          />
        </View>
      </SafeAreaView>

      {/* The verdict is in flight and cannot be taken back. Freeze the room —
          the clock is still running on the server, and a second tap here would
          be a second verdict on a case that already has one. */}
      {delivering && <Busy label="DELIVERING THE VERDICT" patienceMs={0} />}

      {/* Came back to a case whose window had already closed. The forced
          verdict is unavoidable — the server has been counting since it served
          the case — but it is announced here and submitted on acknowledgement,
          rather than fired the instant this screen mounted. */}
      {reporting && (
        <ReportCase
          caseId={activeCase.id}
          onClose={() => setReporting(false)}
          onReported={() => {
            // The court has withdrawn this case. Drop it and leave, rather
            // than returning the player to a dossier that no longer exists
            // with a clock still counting down on it.
            stopAllBeds();
            useGame.setState({ activeCase: null });
            router.replace('/lobby');
          }}
        />
      )}

      {adjourned && !delivering && (
        <Adjourned
          caseTitle={activeCase.title}
          accent={accent}
          onAcknowledge={() => {
            setAdjourned(false);
            void submit(null);
          }}
        />
      )}
    </View>
  );
}

function DefendantTab({ activeCase, accent }: { activeCase: ClientCase; accent: string }) {
  // GDD 8's first setting, finally connected. It scales the prose and nothing
  // else: labels and tags stay put, so the layout does not come apart at 1.3.
  const scale = useSettings((s) => s.textScale);
  const d = activeCase.defendant;
  // GDD 12 — the defendant tab is always short. A player who reads only this
  // still has enough to make an educated guess.
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.card}>
      <Text style={[styles.cardTag, { color: accent }]}>THE ACCUSED</Text>
      <Text style={styles.name}>{d.name}</Text>
      <Text style={styles.meta}>
        {d.age} · {d.occupation}
      </Text>
      <Text style={[styles.body, { fontSize: Type.small * scale, lineHeight: 21 * scale }]}>
        {d.background}
      </Text>

      {activeCase.returningCharacters.length > 0 && (
        // The Echo System never announces itself (GDD 2.4). This is a filing
        // note, not a notification — it states a fact and offers no meaning.
        <View style={styles.echo}>
          <Text style={styles.echoLabel}>PREVIOUSLY BEFORE YOU</Text>
          {activeCase.returningCharacters.map((c) => (
            <Text key={c.name} style={styles.echoName}>
              {c.name}
            </Text>
          ))}
        </View>
      )}
    </Animated.View>
  );
}

function EvidenceTab({
  activeCase,
  accent,
  examined,
  onExamine,
}: {
  activeCase: ClientCase;
  accent: string;
  examined: string | null;
  onExamine: (id: string | null) => void;
}) {
  const scale = useSettings((s) => s.textScale);
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.stack}>
      {activeCase.evidence.map((e, i) => {
        const open = examined === e.id;
        return (
          <Pressable
            key={e.id}
            onPress={() => {
              play('exhibit');
              haptic.tapLight();
              onExamine(open ? null : e.id);
            }}
            style={[styles.card, open && { borderColor: accent }]}
            accessibilityRole="button"
            accessibilityLabel={`Exhibit ${i + 1}. ${open ? 'Showing both readings.' : 'Tap to examine.'}`}
            accessibilityState={{ expanded: open }}
            hitSlop={6}
          >
            <Text style={[styles.cardTag, { color: accent }]}>EXHIBIT {i + 1}</Text>
            <Text style={[styles.body, { fontSize: Type.small * scale, lineHeight: 21 * scale }]}>
              {e.description}
            </Text>

            {open && (
              <Animated.View entering={FadeIn.duration(180)} style={styles.readings}>
                {/* Both readings are valid. That is the whole game. */}
                <View style={styles.reading}>
                  <Text style={styles.readingLabel}>PROSECUTION READS IT</Text>
                  <Text style={[styles.readingText, { fontSize: Type.small * scale, lineHeight: 20 * scale }]}>
                    {e.prosecution_reading}
                  </Text>
                </View>
                <View style={styles.reading}>
                  <Text style={styles.readingLabel}>DEFENCE READS IT</Text>
                  <Text style={[styles.readingText, { fontSize: Type.small * scale, lineHeight: 20 * scale }]}>
                    {e.defence_reading}
                  </Text>
                </View>
              </Animated.View>
            )}
            {!open && <Text style={styles.expand}>TAP TO EXAMINE</Text>}
          </Pressable>
        );
      })}
    </Animated.View>
  );
}

function WitnessesTab({
  activeCase,
  accent,
  focused,
  onFocus,
}: {
  activeCase: ClientCase;
  accent: string;
  focused: number;
  onFocus: (i: number) => void;
}) {
  // The most text-heavy tab in the game, and the one this setting is for.
  const scale = useSettings((s) => s.textScale);
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.stack}>
      {activeCase.witnesses.map((w, i) => (
        <Pressable
          key={w.name}
          onPress={() => {
            play('paper');
            haptic.tapLight();
            onFocus(i);
          }}
          style={[styles.card, focused === i && { borderColor: accent }]}
          accessibilityRole="button"
          accessibilityLabel={`Witness ${i + 1}, ${w.name}. Tap to bring them to the stand.`}
          accessibilityState={{ selected: focused === i }}
          hitSlop={6}
        >
          <Text style={[styles.cardTag, { color: accent }]}>WITNESS {i + 1}</Text>
          <Text style={styles.name}>{w.name}</Text>
          {w.role.length > 0 && <Text style={styles.meta}>{w.role}</Text>}
          {/* The most text-heavy section. You will not finish it. */}
          <Text style={[styles.testimony, { fontSize: Type.small * scale, lineHeight: 22 * scale }]}>
            “{w.testimony}”
          </Text>
        </Pressable>
      ))}
    </Animated.View>
  );
}

function ArgumentsTab({ activeCase, accent }: { activeCase: ClientCase; accent: string }) {
  const scale = useSettings((s) => s.textScale);
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.stack}>
      <View style={styles.card}>
        <Text style={[styles.cardTag, { color: accent }]}>PROSECUTION</Text>
        <Text style={[styles.argument, { fontSize: Type.body * scale, lineHeight: 25 * scale }]}>
          {activeCase.prosecutionArgument}
        </Text>
      </View>
      <View style={styles.card}>
        <Text style={[styles.cardTag, { color: accent }]}>DEFENCE</Text>
        <Text style={[styles.argument, { fontSize: Type.body * scale, lineHeight: 25 * scale }]}>
          {activeCase.defenceArgument}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  scene: { ...StyleSheet.absoluteFillObject },
  // Over the scene, under the dossier. Pinned near the top so the tail points
  // down at the head; exact offset tuned against the portrait framing.
  thought: {
    position: 'absolute',
    // `bottom` is supplied at render from the measured verdict bar.
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 5,
  },
  safe: { flex: 1 },
  stack: { gap: 10 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 18,
    paddingTop: 6,
    gap: 12,
  },
  headerText: { flex: 1 },
  title: {
    fontFamily: Fonts.display,
    fontSize: Type.subhead,
    letterSpacing: 0.5,
    color: Palette.text,
  },
  charge: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    color: Palette.textMuted,
    marginTop: 3,
  },
  jurisdiction: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 1.2,
    color: Palette.textFaint,
    marginTop: 2,
  },
  reportLink: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 1.2,
    color: Palette.textFaint,
    marginTop: 4,
    textDecorationLine: 'underline',
  },
  clock: {
    fontFamily: Fonts.monoBold,
    fontSize: Type.heading,
    color: Palette.text,
    fontVariant: ['tabular-nums'],
  },
  dossier: {
    flex: 1,
    marginTop: 12,
    // Sits over the lower half of the room — you can always see who you are judging.
    marginHorizontal: 12,
  },
  tabStrip: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairline,
  },
  tab: {
    flex: 1,
    // 44pt with the label, which is what Layout.touchMin has always asked for
    // and what nothing except Button.tsx ever honoured.
    minHeight: Layout.touchMin,
    justifyContent: 'center',
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabLabel: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 1.1,
    color: Palette.textFaint,
  },
  panel: { flex: 1 },
  panelContent: { paddingVertical: 12, gap: 10 },
  /**
   * A band for the face, on the one tab that is about the face.
   *
   * The defendant tab exists so you can look at the accused — the camera
   * pushes in on them and nothing else on the tab is a picture. But the header,
   * the plea and the first card between them left about eight points of clear
   * screen, so what you actually saw was a fringe and a collar. The card is
   * pushed down instead of the framing being pulled back, because the room is
   * already at the zoom the face needs, and the panel scrolls: everything is
   * still reachable, it just does not start on top of him.
   */
  panelBelowTheFace: { paddingTop: 262 },
  /** The same idea for the witness at the stand — see FRAMES.witnesses. */
  panelBelowTheWitness: { paddingTop: 150 },
  card: {
    backgroundColor: 'rgba(21,21,19,0.93)',
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: 2,
    padding: 14,
    gap: 5,
  },
  cardTag: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 1.8,
  },
  name: {
    fontFamily: Fonts.display,
    fontSize: Type.subhead,
    color: Palette.text,
  },
  meta: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    color: Palette.textMuted,
  },
  body: {
    fontFamily: Fonts.mono,
    fontSize: Type.small,
    lineHeight: 21,
    color: Palette.text,
    marginTop: 4,
  },
  testimony: {
    fontFamily: Fonts.mono,
    fontSize: Type.small,
    lineHeight: 22,
    color: Palette.text,
    marginTop: 6,
  },
  argument: {
    fontFamily: Fonts.displayRegular,
    fontSize: Type.body,
    lineHeight: 25,
    color: Palette.text,
    marginTop: 4,
  },
  expand: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 1.5,
    color: Palette.textFaint,
    marginTop: 6,
  },
  readings: { marginTop: 10, gap: 10 },
  reading: { gap: 3 },
  readingLabel: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 1.3,
    color: Palette.textMuted,
  },
  readingText: {
    fontFamily: Fonts.mono,
    fontSize: Type.small,
    lineHeight: 20,
    color: Palette.text,
  },
  echo: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Palette.hairline,
    gap: 3,
  },
  echoLabel: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 1.6,
    color: Palette.textMuted,
  },
  echoName: {
    fontFamily: Fonts.monoBold,
    fontSize: Type.small,
    color: Palette.text,
  },
  verdicts: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
});
