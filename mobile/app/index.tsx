import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Courthouse } from '@/components/Courthouse';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useReducedMotion } from '@/lib/motion';
import { Fonts, Palette, Type, Verdict } from '@/constants/theme';
import { api, ApiError } from '@/lib/api';
import {
  googleClientId,
  isAppleAvailable,
  isExpoGo,
  signInAsGuest,
  signInWithApple,
  signInWithGoogle,
  type ProviderToken,
  type SignInNonce,
} from '@/lib/auth';

import { useGame } from '@/store/game';

const HEADLINE = 'Every verdict\nhas a next chapter.';

const MASTHEAD = 'FAULT /';

/** Explain provider availability without blocking guest play. */
function providerHint(): string {
  return isExpoGo()
    ? 'Apple and Google sign-in need a development build — use “Play as guest” here.'
    : 'Try again, or play as guest.';
}

export default function ColdOpen() {
  const jurorId = useGame((s) => s.jurorId);
  const swearInWith = useGame((s) => s.swearInWith);
  const signInExisting = useGame((s) => s.signInExisting);
  const offline = useGame((s) => s.offline);
  const bootstrap = useGame((s) => s.bootstrap);

  const reducedMotion = useReducedMotion();
  const [typed] = useState(HEADLINE);
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

  /**
   * Sign in with a provider. If the court already knows this identity we go
   * straight through; if not, we hold the token and ask for a name — because
   * the juror name is the player's to choose, never the one Apple or Google
   * happens to have on file.
   */
  const authenticate = useCallback(
    /**
     * @param get  Opens a provider's sheet. It is handed a way to ASK for a
     *             nonce rather than a nonce, so only the providers that need
     *             one pay for it — a guest secret has nothing to bind a
     *             nonce to, and requiring one would make local development
     *             depend on Redis being reachable just to sign in.
     */
    async (get: (requestNonce: () => Promise<SignInNonce>) => Promise<ProviderToken>) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        // Issued by our server, before the provider sheet opens. The device
        // used to invent its own and nothing ever checked it, which meant a
        // captured provider token could be replayed into a sign-in.
        const token = await get(() => api.signInNonce());
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
        if (/cancel/i.test(message)) return;

        // SAY WHAT HAPPENED.
        //
        // Every ApiError already carries a sentence written for a player —
        // lib/api turns a dead radio into "Could not reach the court. Check
        // your connection.", the server says "Too many attempts. Try again
        // shortly." — and this screen used to throw all of them away and
        // print one line that fitted none of them. A juror on a phone that
        // could not see the server, a juror who had tried twenty times, and a
        // juror presenting a token the court genuinely refused were all told
        // the same nothing, and so was anybody trying to work out why.
        if (err instanceof ApiError) {
          setError(err.message);
          return;
        }

        // Not ours: the provider sheet itself failed. Apple's own errors are
        // written for developers, so they are named rather than repeated.
        setError('That sign-in did not go through. ' + providerHint());
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
    } catch (err) {
      // The registry filter refuses reserved, unprintable and impersonating
      // names, and says exactly what to change. Show that rather than a
      // generic failure — "The court could not be reached" is a lie when the
      // court answered and explained itself.
      if (err instanceof ApiError && err.code === 'juror_name_rejected') {
        setError(err.message);
      } else {
        setError('The court could not be reached.');
      }
      setBusy(false);
    }
  }, [name, busy, pending, swearInWith]);

  return (
    <View style={styles.root}>


      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <SafeAreaView style={{ flex: 1 }}><ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.masthead}>
          <Text style={styles.mastheadText}>{MASTHEAD}</Text>
          <Text style={styles.mastheadRule}>THE VERDICT IS YOURS</Text>
        </View>

        <Courthouse compact />
        <View style={styles.headlineBlock}>
          <Text style={styles.headline}>
            {typed}
            {typed.length < HEADLINE.length && <Text style={styles.caret}>▌</Text>}
          </Text>
        </View>

        <Text style={styles.intro}>A legal drama in two minutes. Read between the lines. Make the call. Live with the consequences.</Text>

        {/* Signed in, but the court could not be reached to check. Never
            the sign-in buttons: this juror already has a career. */}
        {typed.length === HEADLINE.length && offline && (
          <View style={styles.entry}>
            <Text style={styles.label}>THE COURT COULD NOT BE REACHED</Text>
            <Pressable
              onPress={() => void bootstrap()}
              style={[styles.provider, styles.providerGhost]}
              accessibilityRole="button"
            >
              <Text style={styles.providerGhostText}>Try again</Text>
            </Pressable>
          </View>
        )}

        {typed.length === HEADLINE.length && !pending && !offline && (
          <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(450)} style={styles.entry}>
            <Text style={styles.label}>REPORT FOR SERVICE</Text>

            {appleReady && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={24}
                style={styles.appleButton}
                onPress={() => authenticate(async (nonce) => signInWithApple(await nonce()))}
              />
            )}

            {googleClientId() && (
              <Pressable
                onPress={() => authenticate(async (nonce) => signInWithGoogle(await nonce()))}
                disabled={busy}
                style={[styles.provider, busy && styles.acceptDisabled]}
                accessibilityRole="button"
              >
                <Text style={styles.providerText}>Continue with Google</Text>
              </Pressable>
            )}

            {/* Always offered, on every platform, in every build. This used
                to be "CONTINUE ON THIS DEVICE" — the dev bypass, shown only
                when a provider was missing and refused outright by a
                production server, so a release build on Android had no door
                at all. A guest is a 256-bit secret kept in the keychain
                (lib/auth signInAsGuest), which the server can safely accept
                in production. Apple and Google stay above it when they are
                configured; nobody is made to create an account to try a
                game. */}
            <Pressable
              onPress={() => authenticate(signInAsGuest)}
              disabled={busy}
              style={[styles.provider, styles.providerGhost, busy && styles.acceptDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Play as guest"
            >
              <Text style={styles.providerGhostText}>Play as guest</Text>
            </Pressable>

            {/* Said BEFORE any button does anything, and the sign-in request
                carries the version shown (store/game), which is what the
                server records as consent. The documents open in-app and
                offline — agreement to something you cannot read first is not
                agreement. */}
            <Text style={styles.consent}>
              By continuing you confirm you are 13 or older and agree to the{' '}
              <Text
                style={styles.consentLink}
                onPress={() => router.push({ pathname: '/legal', params: { doc: 'terms' } })}
                accessibilityRole="link"
              >
                Terms
              </Text>{' '}
              and{' '}
              <Text
                style={styles.consentLink}
                onPress={() => router.push({ pathname: '/legal', params: { doc: 'privacy' } })}
                accessibilityRole="link"
              >
                Privacy Policy
              </Text>
              .
            </Text>

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
            {/* Said before they choose, not after: this name goes on a public
                board next to the state of their city. */}
            <Text style={styles.note}>
              This is the name the city will remember, and the name other jurors will see on the
              public registry. It need not be your own.
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
                <Text style={styles.acceptText}>Accept assignment</Text>
              )}
            </Pressable>

            {error && <Text style={styles.error}>{error}</Text>}
          </Animated.View>
        )}
      </ScrollView></SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  overlay: {
    flex: 1,
    paddingHorizontal: 28,
  },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24 },
  intro: { fontFamily: Fonts.ui, fontSize: Type.small, color: Palette.textMuted, lineHeight: 22, textAlign: 'center', marginTop: 12, maxWidth: 340, alignSelf: 'center' },
  masthead: { alignItems: 'center', marginBottom: 26 },
  // Brand and editorial type share the same warm foreground.
  mastheadText: {
    fontFamily: Fonts.display,
    fontSize: Type.heading,
    letterSpacing: 5,
    color: Palette.text,
  },
  mastheadRule: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 2,
    color: Palette.textMuted,
    marginTop: 3,
  },
  headlineBlock: { minHeight: 94, justifyContent: 'center' },
  headline: {
    fontFamily: Fonts.display,
    fontSize: Type.title,
    lineHeight: 42,
    color: Palette.text,
    textAlign: 'center',
  },
  caret: { color: Verdict.guilty },
  entry: { marginTop: 24, alignItems: 'center' },
  label: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 3,
    color: Palette.textMuted,
    marginBottom: 8,
  },
  input: {
    fontFamily: Fonts.monoBold,
    fontSize: 20,
    color: Palette.text,
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairlineBright,
    paddingVertical: 6,
    minWidth: 220,
    textAlign: 'center',
  },
  accept: {
    marginTop: 30,
    backgroundColor: Palette.surfaceHigh,
    paddingHorizontal: 26,
    paddingVertical: 14,
    borderRadius: 24,
    minWidth: 220,
    alignItems: 'center',
  },
  acceptDisabled: { opacity: 0.3 },
  acceptText: {
    fontFamily: Fonts.uiBold,
    fontSize: 15,
    letterSpacing: 0.2,
    color: Palette.text,
  },
  appleButton: { width: 250, height: 46, marginTop: 4 },
  provider: {
    marginTop: 10,
    width: 250,
    height: 46,
    backgroundColor: Palette.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
  },
  providerGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Palette.hairlineBright,
  },
  providerText: {
    fontFamily: Fonts.uiBold,
    fontSize: 15,
    letterSpacing: 0.2,
    color: Palette.text,
  },
  providerGhostText: {
    fontFamily: Fonts.ui,
    fontSize: 15,
    letterSpacing: 0.2,
    color: Palette.textMuted,
  },
  busy: { marginTop: 16 },
  consent: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    lineHeight: 17,
    color: Palette.textMuted,
    textAlign: 'center',
    marginTop: 16,
    maxWidth: 270,
  },
  consentLink: { color: Palette.text, textDecorationLine: 'underline' },
  note: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    lineHeight: 16,
    color: Palette.textMuted,
    textAlign: 'center',
    marginTop: 12,
    maxWidth: 250,
  },
  error: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: Verdict.guilty,
    marginTop: 14,
  },
});
