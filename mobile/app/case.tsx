import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Busy } from '@/components/Busy';
import { TimerRing } from '@/components/TimerRing';
import { VerdictButton } from '@/components/VerdictButton';
import { CourtroomScene, type DossierTab } from '@/components/three/CourtroomScene';
import { Clock, Fonts, Palette } from '@/constants/theme';
import type { ClientCase } from '@/lib/api';
import * as haptic from '@/lib/haptics';
import { play, startBed, stopAllBeds, stopBed } from '@/lib/sound';
import { useGame } from '@/store/game';
import { useSettings } from '@/store/settings';

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
        await deliverVerdict(verdict);
        router.replace('/verdict');
      } catch {
        submitted.current = false;
        setDelivering(false);
      }
    },
    [deliverVerdict],
  );

  // No case in hand means a reload landed here directly. Go back to the docket.
  useEffect(() => {
    if (!activeCase) router.replace('/lobby');
  }, [activeCase]);

  // The room runs under the whole case and stops when you leave it, however
  // you leave it — a bed still playing over the verdict screen would be worse
  // than no bed at all.
  useEffect(() => {
    if (!activeCase) return;
    play('open');
    startBed('room');
    return () => stopAllBeds();
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
  }, [activeCase, submit]);

  if (!activeCase) return <View style={styles.root} />;

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
        />
      </View>

      <TimerRing
        remaining={remaining}
        total={activeCase.clockSeconds}
        accent={accent}
        running={!delivering}
      />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
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
                accessibilityState={{ selected: tab === t.key }}
              >
                <Text style={[styles.tabLabel, tab === t.key && { color: Palette.text }]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <ScrollView
            style={styles.panel}
            contentContainerStyle={styles.panelContent}
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
        <View style={styles.verdicts}>
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
      <Text style={[styles.body, { fontSize: 12.5 * scale, lineHeight: 20 * scale }]}>
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
            accessibilityState={{ expanded: open }}
          >
            <Text style={[styles.cardTag, { color: accent }]}>EXHIBIT {i + 1}</Text>
            <Text style={[styles.body, { fontSize: 12.5 * scale, lineHeight: 20 * scale }]}>
              {e.description}
            </Text>

            {open && (
              <Animated.View entering={FadeIn.duration(180)} style={styles.readings}>
                {/* Both readings are valid. That is the whole game. */}
                <View style={styles.reading}>
                  <Text style={styles.readingLabel}>PROSECUTION READS IT</Text>
                  <Text style={[styles.readingText, { fontSize: 12 * scale, lineHeight: 19 * scale }]}>
                    {e.prosecution_reading}
                  </Text>
                </View>
                <View style={styles.reading}>
                  <Text style={styles.readingLabel}>DEFENCE READS IT</Text>
                  <Text style={[styles.readingText, { fontSize: 12 * scale, lineHeight: 19 * scale }]}>
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
        >
          <Text style={[styles.cardTag, { color: accent }]}>WITNESS {i + 1}</Text>
          <Text style={styles.name}>{w.name}</Text>
          {w.role.length > 0 && <Text style={styles.meta}>{w.role}</Text>}
          {/* The most text-heavy section. You will not finish it. */}
          <Text style={[styles.testimony, { fontSize: 12.5 * scale, lineHeight: 21 * scale }]}>
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
        <Text style={[styles.argument, { fontSize: 15 * scale, lineHeight: 23 * scale }]}>
          {activeCase.prosecutionArgument}
        </Text>
      </View>
      <View style={styles.card}>
        <Text style={[styles.cardTag, { color: accent }]}>DEFENCE</Text>
        <Text style={[styles.argument, { fontSize: 15 * scale, lineHeight: 23 * scale }]}>
          {activeCase.defenceArgument}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  scene: { ...StyleSheet.absoluteFillObject },
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
    fontSize: 17,
    letterSpacing: 0.5,
    color: Palette.text,
  },
  charge: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    color: Palette.textMuted,
    marginTop: 3,
  },
  jurisdiction: {
    fontFamily: Fonts.mono,
    fontSize: 8,
    letterSpacing: 1.2,
    color: Palette.textFaint,
    marginTop: 2,
  },
  clock: {
    fontFamily: Fonts.monoBold,
    fontSize: 19,
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
    paddingVertical: 9,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabLabel: {
    fontFamily: Fonts.mono,
    fontSize: 8.5,
    letterSpacing: 1.2,
    color: Palette.textFaint,
  },
  panel: { flex: 1 },
  panelContent: { paddingVertical: 12, gap: 10 },
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
    fontSize: 8,
    letterSpacing: 2,
  },
  name: {
    fontFamily: Fonts.display,
    fontSize: 19,
    color: Palette.text,
  },
  meta: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    color: Palette.textMuted,
  },
  body: {
    fontFamily: Fonts.mono,
    fontSize: 12.5,
    lineHeight: 20,
    color: Palette.text,
    marginTop: 4,
  },
  testimony: {
    fontFamily: Fonts.mono,
    fontSize: 12.5,
    lineHeight: 21,
    color: Palette.text,
    marginTop: 6,
  },
  argument: {
    fontFamily: Fonts.displayRegular,
    fontSize: 15,
    lineHeight: 23,
    color: Palette.text,
    marginTop: 4,
  },
  expand: {
    fontFamily: Fonts.mono,
    fontSize: 8,
    letterSpacing: 1.6,
    color: Palette.textFaint,
    marginTop: 6,
  },
  readings: { marginTop: 10, gap: 10 },
  reading: { gap: 3 },
  readingLabel: {
    fontFamily: Fonts.mono,
    fontSize: 8,
    letterSpacing: 1.4,
    color: Palette.textMuted,
  },
  readingText: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 19,
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
    fontSize: 8,
    letterSpacing: 1.8,
    color: Palette.textMuted,
  },
  echoName: {
    fontFamily: Fonts.monoBold,
    fontSize: 12,
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
