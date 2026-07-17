import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { NewspaperScene } from '@/components/three/NewspaperScene';
import { Fonts, Palette } from '@/constants/theme';
import {
  googleClientId,
  isAppleAvailable,
  signInWithApple,
  signInWithDevice,
  signInWithGoogle,
  type ProviderToken,
} from '@/lib/auth';
import { useGame } from '@/store/game';

const HEADLINE = 'CITY COURT SEEKS JUROR';

/**
 * GDD 6, Screen 1 — Cold Open.
 * No logo. No tutorial. Just an assignment.
 */
export default function ColdOpen() {
  const jurorId = useGame((s) => s.jurorId);
  const swearInWith = useGame((s) => s.swearInWith);
  const signInExisting = useGame((s) => s.signInExisting);

  const [typed, setTyped] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appleReady, setAppleReady] = useState(false);
  /** Held while we ask the player to name themselves. */
  const [pending, setPending] = useState<ProviderToken | null>(null);

  // A returning juror is already sworn in. Send them to the docket.
  useEffect(() => {
    if (jurorId) router.replace('/lobby');
  }, [jurorId]);

  useEffect(() => {
    void isAppleAvailable().then(setAppleReady);
  }, []);

  // The headline types itself out (GDD 6, Screen 1).
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i++;
      setTyped(HEADLINE.slice(0, i));
      if (i >= HEADLINE.length) clearInterval(id);
    }, 62);
    return () => clearInterval(id);
  }, []);

  /**
   * Sign in with a provider. If the court already knows this identity we go
   * straight through; if not, we hold the token and ask for a name — because
   * the juror name is the player's to choose, never the one Apple or Google
   * happens to have on file.
   */
  const authenticate = useCallback(
    async (get: () => Promise<ProviderToken>) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        const token = await get();
        const known = await signInExisting(token);
        if (known) {
          router.replace('/lobby');
          return;
        }
        setPending(token);
        if (token.suggestedName) setName(token.suggestedName);
      } catch (err) {
        const message = (err as Error).message ?? '';
        // A cancelled sign-in is not an error worth shouting about.
        if (!/cancel/i.test(message)) setError('That sign-in did not go through.');
      } finally {
        setBusy(false);
      }
    },
    [busy, signInExisting],
  );

  const onSwearIn = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || busy || !pending) return;
    setBusy(true);
    setError(null);
    try {
      await swearInWith(pending, trimmed);
      router.replace('/briefing');
    } catch {
      setError('The court could not be reached.');
      setBusy(false);
    }
  }, [name, busy, pending, swearInWith]);

  return (
    <View style={styles.root}>
      <View style={StyleSheet.absoluteFill}>
        <NewspaperScene />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.masthead}>
          <Text style={styles.mastheadText}>THE ORUN HERALD</Text>
          <Text style={styles.mastheadRule}>ESTABLISHED 1961 · CITY EDITION</Text>
        </View>

        <View style={styles.headlineBlock}>
          <Text style={styles.headline}>
            {typed}
            {typed.length < HEADLINE.length && <Text style={styles.caret}>▌</Text>}
          </Text>
        </View>

        {typed.length === HEADLINE.length && !pending && (
          <Animated.View entering={FadeIn.duration(700).delay(300)} style={styles.entry}>
            <Text style={styles.label}>REPORT FOR SERVICE</Text>

            {appleReady && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={2}
                style={styles.appleButton}
                onPress={() => authenticate(signInWithApple)}
              />
            )}

            {googleClientId() && (
              <Pressable
                onPress={() => authenticate(signInWithGoogle)}
                disabled={busy}
                style={[styles.provider, busy && styles.acceptDisabled]}
                accessibilityRole="button"
              >
                <Text style={styles.providerText}>CONTINUE WITH GOOGLE</Text>
              </Pressable>
            )}

            {/* Expo Go has no Apple Sign In and there may be no Google client
                id yet. The server refuses this in production. */}
            {(!appleReady || !googleClientId()) && (
              <Pressable
                onPress={() => authenticate(signInWithDevice)}
                disabled={busy}
                style={[styles.provider, styles.providerGhost, busy && styles.acceptDisabled]}
                accessibilityRole="button"
              >
                <Text style={styles.providerGhostText}>CONTINUE ON THIS DEVICE</Text>
              </Pressable>
            )}

            {busy && <ActivityIndicator color={Palette.bg} style={styles.busy} />}
            {error && <Text style={styles.error}>{error}</Text>}
          </Animated.View>
        )}

        {/* The court has an identity; now it wants a name. Yours, not your
            account's. */}
        {pending && (
          <Animated.View entering={FadeIn.duration(500)} style={styles.entry}>
            <Text style={styles.label}>JUROR:</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Enter name"
              placeholderTextColor="#8B8578"
              style={styles.input}
              maxLength={40}
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={onSwearIn}
              editable={!busy}
              accessibilityLabel="Your name as juror"
            />
            <Text style={styles.note}>
              This is the name the city will remember. It need not be your own.
            </Text>

            <Pressable
              onPress={onSwearIn}
              disabled={!name.trim() || busy}
              style={[styles.accept, (!name.trim() || busy) && styles.acceptDisabled]}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator color={Palette.text} />
              ) : (
                <Text style={styles.acceptText}>ACCEPT ASSIGNMENT</Text>
              )}
            </Pressable>

            {error && <Text style={styles.error}>{error}</Text>}
          </Animated.View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  masthead: { alignItems: 'center', marginBottom: 26 },
  // Type on the newspaper is ink, so it is the one place we go dark-on-light.
  mastheadText: {
    fontFamily: Fonts.display,
    fontSize: 15,
    letterSpacing: 5,
    color: Palette.bg,
  },
  mastheadRule: {
    fontFamily: Fonts.mono,
    fontSize: 8,
    letterSpacing: 2,
    color: '#6B6558',
    marginTop: 3,
  },
  headlineBlock: { minHeight: 108, justifyContent: 'center' },
  headline: {
    fontFamily: Fonts.display,
    fontSize: 38,
    lineHeight: 42,
    color: Palette.bg,
    textAlign: 'center',
  },
  caret: { color: '#C23B22' },
  entry: { marginTop: 34, alignItems: 'center' },
  label: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    letterSpacing: 3,
    color: '#6B6558',
    marginBottom: 8,
  },
  input: {
    fontFamily: Fonts.monoBold,
    fontSize: 20,
    color: Palette.bg,
    borderBottomWidth: 1,
    borderBottomColor: '#6B6558',
    paddingVertical: 6,
    minWidth: 220,
    textAlign: 'center',
  },
  accept: {
    marginTop: 30,
    backgroundColor: Palette.bg,
    paddingHorizontal: 26,
    paddingVertical: 14,
    borderRadius: 2,
    minWidth: 220,
    alignItems: 'center',
  },
  acceptDisabled: { opacity: 0.3 },
  acceptText: {
    fontFamily: Fonts.uiBold,
    fontSize: 12,
    letterSpacing: 2.4,
    color: Palette.text,
  },
  appleButton: { width: 250, height: 46, marginTop: 4 },
  provider: {
    marginTop: 10,
    width: 250,
    height: 46,
    backgroundColor: Palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 2,
  },
  providerGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#6B6558',
  },
  providerText: {
    fontFamily: Fonts.uiBold,
    fontSize: 11,
    letterSpacing: 2,
    color: Palette.text,
  },
  providerGhostText: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    letterSpacing: 1.6,
    color: '#4A4A45',
  },
  busy: { marginTop: 16 },
  note: {
    fontFamily: Fonts.mono,
    fontSize: 9,
    lineHeight: 15,
    color: '#6B6558',
    textAlign: 'center',
    marginTop: 12,
    maxWidth: 250,
  },
  error: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: '#C23B22',
    marginTop: 14,
  },
});
