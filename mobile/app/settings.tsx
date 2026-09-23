import Slider from '@react-native-community/slider';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Clock, Fonts, Layout, Palette, Space, Type } from '@/constants/theme';
import { api, ApiError, type Session } from '@/lib/api';
import { restore as restorePurchases } from '@/lib/purchases';
import { adPrivacyOptionsRequired, showAdPrivacyOptions } from '@/lib/admob';
import { manageSubscriptions } from '@/lib/iap';
import * as haptic from '@/lib/haptics';
import { askForReminders, clearReminders, remindersAvailable } from '@/lib/reminders';
import { canSpeak, say, warmVoices } from '@/lib/say';
import { LEGAL_VERSION } from '@/lib/legalText';
import { play, refreshBedVolume } from '@/lib/sound';
import { useGame } from '@/store/game';
import { SPEECH_MODES, TEXT_SCALES, useSettings } from '@/store/settings';

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
  const refreshWallet = useGame((s) => s.refreshWallet);

  const volume = useSettings((s) => s.volume);
  const muted = useSettings((s) => s.muted);
  const speech = useSettings((s) => s.speech);
  const haptics = useSettings((s) => s.haptics);
  const reminders = useSettings((s) => s.reminders);
  const textScale = useSettings((s) => s.textScale);
  const setSetting = useSettings((s) => s.set);

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * Where to send someone who wants the policy, the terms, or a human.
   *
   * Served by the API rather than hardcoded, so a URL can be corrected without
   * shipping a build. Apple requires both links to be reachable from inside
   * any app that creates accounts — a dead privacy policy link is a rejection,
   * and a missing one is a rejection too.
   */
  const [support, setSupport] = useState<Session['support'] | null>(null);

  /** The rename field. Empty until the player opens it. */
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    api
      .me()
      .then((session) => setSupport(session.support ?? null))
      .catch(() => setSupport(null));
  }, []);

  const onRename = useCallback(async () => {
    const wanted = newName.trim();
    if (!wanted || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await api.renameJuror(wanted);
      useGame.setState({ jurorName: res.jurorName });
      setNotice(res.changed ? `You are ${res.jurorName} on the registry now.` : 'That is already your name.');
      setRenaming(false);
      setNewName('');
    } catch (err) {
      // The registry filter explains itself; show what it said rather than a
      // generic failure.
      setNotice(
        err instanceof ApiError ? err.message : 'The register could not be reached.',
      );
    } finally {
      setBusy(false);
    }
  }, [newName, busy]);

  const onRestore = useCallback(async () => {
    setBusy(true);
    try {
      // Both halves. The device half re-presents any receipt the store still
      // holds — including a purchase that was paid for but never confirmed by
      // our server, which lib/purchases deliberately leaves unfinished so it
      // can be recovered here. The server half then reports what this account
      // owns. Asking only the server would satisfy Apple's requirement on
      // paper and still leave a paying player with nothing.
      const device = await restorePurchases();
      const r = await api.restorePurchases();
      await refreshWallet();

      const total = Math.max(r.restored, device.restored);
      setNotice(
        total > 0
          ? `Restored ${total} purchase${total === 1 ? '' : 's'}.`
          : 'Nothing to restore on this account.',
      );
    } catch {
      setNotice('Could not reach the store.');
    } finally {
      setBusy(false);
    }
  }, [refreshWallet]);

  /**
   * "Download my data" — GDPR access and portability, and the promise the
   * privacy policy makes.
   *
   * Shared as JSON text through the system share sheet rather than written
   * to a file: the share sheet already offers Save to Files, Mail, AirDrop
   * and Drive, it needs no storage permission, and the export is a few
   * hundred kilobytes at most. The server assembles it field by field
   * (routes/session.ts) so no credential can end up in it.
   */
  const onExport = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const data = await api.exportData();
      await Share.share({
        title: 'FAULT — my data',
        message: JSON.stringify(data, null, 2),
      });
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : 'Your record could not be exported.');
    } finally {
      setBusy(false);
    }
  }, [busy]);

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

          {/* How the people in the room are delivered. A voice is presentation,
              and presentation is what this game measures you against — so
              every voice is cast from the person, like their face, and means
              exactly as little. */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>COURTROOM SPEECH</Text>
            <View style={styles.tiers}>
              {SPEECH_MODES.map((m) => {
                const needsVoice = m.value !== 'text';
                const unavailable = needsVoice && !canSpeak();
                const selected = speech === m.value;
                return (
                  <Pressable
                    key={m.value}
                    disabled={unavailable}
                    onPress={() => {
                      void setSetting({ speech: m.value });
                      haptic.tapLight();
                      if (needsVoice && !muted) {
                        void warmVoices().then(() =>
                          say('You don’t know me. You only know what they told you.', {
                            voice: { seed: 7, feminine: false },
                            tone: 'pleading',
                          }),
                        );
                      }
                    }}
                    style={[
                      styles.tier,
                      selected && styles.tierActive,
                      unavailable && { opacity: 0.4 },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, disabled: unavailable }}
                    accessibilityLabel={`${m.label}${unavailable ? ', unavailable on this build' : ''}`}
                  >
                    <Text style={[styles.tierText, selected && styles.tierTextActive]}>
                      {m.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.sectionNote}>
              {speech === 'text'
                ? 'Everyone in the room is read, not heard.'
                : speech === 'voice'
                  ? 'Everyone in the room is heard; only their names are shown.'
                  : 'Everyone in the room is heard, and their words are shown as they speak.'}{' '}
              Each person has their own voice, and it tells you as little as their face does.
            </Text>
            {speech !== 'text' && muted && (
              <Text style={styles.sectionNote}>
                Sound is muted, so the words are shown instead.
              </Text>
            )}
            {!canSpeak() && (
              <Text style={styles.sectionNote}>
                This build has no speech engine, so the courtroom can only be read.
              </Text>
            )}
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

          {/* Local reminders — see lib/reminders. Scheduled on this phone
              only; turning this off cancels everything already planned. */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>REMINDERS</Text>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Summons & headlines</Text>
              <Switch
                value={reminders && remindersAvailable()}
                disabled={!remindersAvailable()}
                onValueChange={(v) => {
                  void setSetting({ reminders: v });
                  if (v) void askForReminders();
                  else void clearReminders();
                }}
                trackColor={{ false: Palette.hairline, true: '#1D7E6A' }}
                thumbColor={Palette.text}
              />
            </View>
            <Text style={styles.sectionNote}>
              At most one a day: your daily summons, a streak about to lapse, or what the papers
              printed while you were away. Nothing leaves this phone.
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
              the design — but it should never be the type&apos;s fault.
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
            {entitlements.includes('pass') && (
              <Action label="Manage Juror Pass" onPress={() => void manageSubscriptions()} />
            )}
            {/* Required wherever Google's consent form applies (EEA, UK,
                Switzerland): the player must be able to change their answer. */}
            {adPrivacyOptionsRequired() && (
              <Action label="Ad privacy choices" onPress={() => void showAdPrivacyOptions()} />
            )}
            <Action label="Sign out" onPress={onSignOut} disabled={busy} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>YOUR NAME ON THE REGISTRY</Text>
            <Row label="Juror" value={jurorName ?? '—'} />
            <Text style={styles.sectionNote}>
              This name is public. Other jurors see it beside the state of your city.
            </Text>

            {renaming ? (
              <View style={styles.renameBlock}>
                <TextInput
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="New name"
                  placeholderTextColor={Palette.textFaint}
                  style={styles.renameInput}
                  maxLength={32}
                  autoCorrect={false}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={onRename}
                  editable={!busy}
                  accessibilityLabel="Your new juror name"
                />
                <Text style={styles.sectionNote}>The register accepts one change a day.</Text>
                <Action label="Change it" onPress={onRename} disabled={busy || !newName.trim()} />
                <Action
                  label="Never mind"
                  onPress={() => {
                    setRenaming(false);
                    setNewName('');
                  }}
                  disabled={busy}
                />
              </View>
            ) : (
              <Action label="Change my name" onPress={() => setRenaming(true)} disabled={busy} />
            )}
          </View>

          {/* LEGAL. The documents are bundled (lib/legalText, generated from
              legal/*.md) and open in-app — they used to be external links
              that only appeared once the server had URLs configured, which
              meant a fresh deployment showed "The court has not published
              its papers yet" to an App Review tester. The web copies are
              still offered, for anyone who wants a link to send. */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>LEGAL</Text>
            <Action label="Terms of Service" onPress={() => openLegal('terms')} />
            <Action label="Privacy Policy" onPress={() => openLegal('privacy')} />
            <Action label="Copyright & DMCA" onPress={() => openLegal('dmca')} />
            <Action label="Community Guidelines" onPress={() => openLegal('community')} />
            {support?.privacyPolicyUrl && (
              <Action
                label="Privacy Policy on the web"
                onPress={() => void Linking.openURL(support.privacyPolicyUrl!)}
              />
            )}
            <Text style={styles.sectionNote}>Edition {LEGAL_VERSION}.</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>SUPPORT</Text>
            {support?.supportEmail ? (
              <>
                <Action
                  label="Contact the court"
                  onPress={() => void Linking.openURL(`mailto:${support.supportEmail}`)}
                />
                <Text style={styles.sectionNote}>{support.supportEmail}</Text>
              </>
            ) : (
              <Text style={styles.sectionNote}>
                To reach a human, use the report button on any case or name, or write to the address
                in the Privacy Policy.
              </Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ACKNOWLEDGEMENTS</Text>
            {/* Open-source licences require attribution to be reachable, and
                it costs nothing to be generous about it. Fonts are the ones
                loaded in app/_layout (constants/theme). The sounds are
                synthesised by scripts/generate-sounds.mjs, so there is no
                audio licence to credit. */}
            {ACKNOWLEDGEMENTS.map((a) => (
              <View key={a.name} style={styles.ack}>
                <Text style={styles.ackName}>{a.name}</Text>
                <Text style={styles.sectionNote}>{a.licence}</Text>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>DATA</Text>
            <Text style={styles.sectionNote}>
              Your country is stored; your location is not. Deleting your juror deletes every case,
              every verdict, and the city you made.
            </Text>
            <Action label="Download my data" onPress={onExport} disabled={busy} />
            {/* Destructive, separated, and in the semantic danger colour —
                never adjacent to the ordinary actions above it. */}
            <Button
              label="Delete this juror"
              onPress={onDelete}
              disabled={busy}
              variant="danger"
              hint="This cannot be undone"
              style={styles.dangerBtn}
            />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button label="Close" onPress={() => router.back()} variant="primary" />
        </View>
      </SafeAreaView>
    </View>
  );
}

function openLegal(doc: 'terms' | 'privacy' | 'dmca' | 'community') {
  router.push({ pathname: '/legal', params: { doc } });
}

/**
 * Third-party work in the shipped app.
 *
 * Not the full dependency tree — the licence texts for every npm package are
 * in node_modules and the store listing links the full notices — but every
 * component whose licence asks for visible credit, and every asset a player
 * can actually see or hear.
 */
const ACKNOWLEDGEMENTS = [
  { name: 'React Native, React, Expo', licence: 'MIT License. © Meta Platforms, Inc. and 650 Industries, Inc.' },
  { name: 'Expo Router, Reanimated, Gesture Handler, Screens, SVG', licence: 'MIT License.' },
  { name: 'three.js, React Three Fiber', licence: 'MIT License. © three.js authors, Poimandres.' },
  { name: 'Zustand', licence: 'MIT License. © Paul Henschel.' },
  {
    name: 'MakeHuman / MPFB assets',
    licence: 'Character bodies, faces, hair and clothing built from MakeHuman system assets, CC0 1.0.',
  },
  {
    name: 'Playfair Display, Anton, Archivo, IBM Plex Mono, Inter',
    licence: 'SIL Open Font License 1.1, via Google Fonts.',
  },
  { name: 'Sound', licence: 'Synthesised for FAULT. No third-party audio.' },
] as const;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

// The last of the bracket buttons. `[ Sign out ]` was the whole affordance.
function Action({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return <Button label={label} onPress={onPress} disabled={disabled} variant="secondary" />;
}

const styles = StyleSheet.create({
  dangerBtn: { marginTop: Space.md },
  ack: { gap: 2 },
  ackName: { fontFamily: Fonts.mono, fontSize: 12, color: Palette.text },
  renameBlock: { gap: Space.sm },
  renameInput: {
    fontFamily: Fonts.monoBold,
    fontSize: Type.body,
    color: Palette.text,
    borderWidth: 1,
    borderColor: Palette.hairlineBright,
    borderRadius: 4,
    paddingHorizontal: Space.md,
    minHeight: Layout.touchMin,
  },
  root: { flex: 1, backgroundColor: Palette.bg },
  safe: { flex: 1 },
  content: { padding: 22, gap: 26 },
  title: { fontFamily: Fonts.display, fontSize: 28, color: Palette.text },
  juror: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
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
    fontSize: Type.micro,
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
