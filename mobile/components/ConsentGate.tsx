import { router, usePathname } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Fonts, Palette, Space, Type } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { useGame } from '@/store/game';

/**
 * "The court has published its papers."
 *
 * A small, blocking sheet for a signed-in player who has not accepted the
 * CURRENT Terms and Privacy Policy. Two populations reach it:
 *
 *   - jurors who swore in before consent was recorded at all, and
 *   - everyone, once legal/VERSION moves for a material change.
 *
 * New players never see it: the sign-in screen states the terms above every
 * button and the sign-in request carries the version they were shown, so the
 * server records consent at the moment of swearing in.
 *
 * Blocking is the point. Continuing to play under terms the player has not
 * agreed to is exactly the gap this closes, so there is no dismiss — only
 * read, accept, or sign out. It steps aside while the legal screen itself is
 * open, since it is the thing that screen is there to explain.
 *
 * Mounted once, in the root layout, so no screen has to remember it.
 */
export function ConsentGate() {
  const jurorId = useGame((s) => s.jurorId);
  const required = useGame((s) => s.consentRequired);
  const acceptConsent = useGame((s) => s.acceptConsent);
  const signOut = useGame((s) => s.signOut);
  const pathname = usePathname();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onAccept = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await acceptConsent();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The court could not be reached. Try again.');
    } finally {
      setBusy(false);
    }
  }, [acceptConsent]);

  const onSignOut = useCallback(async () => {
    await signOut();
    router.replace('/');
  }, [signOut]);

  const visible = Boolean(jurorId && required && pathname !== '/legal');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.scrim}>
        <View style={styles.card} accessibilityViewIsModal>
          <Text style={styles.kicker}>BEFORE YOU SIT AGAIN</Text>
          <Text style={styles.title}>The court has published its papers.</Text>
          <Text style={styles.body}>
            To keep playing, confirm you are 13 or older and agree to the Terms of Service and the
            Privacy Policy.
          </Text>

          <View style={styles.links}>
            <Button
              label="Read the Terms"
              variant="ghost"
              onPress={() => router.push({ pathname: '/legal', params: { doc: 'terms' } })}
            />
            <Button
              label="Read the Privacy Policy"
              variant="ghost"
              onPress={() => router.push({ pathname: '/legal', params: { doc: 'privacy' } })}
            />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <Button label="I agree" variant="primary" onPress={onAccept} busy={busy} disabled={busy} />
          <Button label="Sign out" variant="secondary" onPress={onSignOut} disabled={busy} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(8,8,9,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Space.xl,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: 4,
    padding: Space.xl,
    gap: Space.md,
  },
  kicker: { fontFamily: Fonts.mono, fontSize: Type.micro, letterSpacing: 2, color: Palette.textMuted },
  title: { fontFamily: Fonts.display, fontSize: Type.subhead, color: Palette.text },
  body: { fontFamily: Fonts.ui, fontSize: Type.small, lineHeight: 21, color: Palette.textMuted },
  links: { gap: Space.xs },
  error: { fontFamily: Fonts.mono, fontSize: Type.micro, color: '#E04E2E' },
});
