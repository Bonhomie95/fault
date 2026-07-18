import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Accents, Fonts, Palette, Radius, Space, Type } from '@/constants/theme';

/**
 * What the player sees when a screen throws.
 *
 * There was nothing here. Any render error anywhere in the app produced a
 * blank screen in a release build — no message, no way back, nothing to do but
 * force-quit and hope. For a game whose sessions are two minutes long, that is
 * the difference between a bug and an uninstall.
 *
 * expo-router looks for an exported `ErrorBoundary` in a layout and renders it
 * in place of the subtree that failed, which means this catches render errors
 * on every screen without any screen having to know about it.
 *
 * The error text is shown deliberately. This is a game, not a bank: a player
 * who can read "Cannot read property 'name' of undefined" and paste it into a
 * report is worth more than one protected from an ugly string, and none of the
 * secrets in this app live in a render path.
 */
export function CourtError({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>THE COURT HAS RISEN</Text>
        <Text style={styles.title}>SOMETHING{'\n'}WENT WRONG</Text>

        <Text style={styles.body}>
          This is a fault in the game, not in anything you did. Your record and your standing are
          held on the server and are safe.
        </Text>

        <View style={styles.detail}>
          <Text style={styles.detailLabel}>WHAT BROKE</Text>
          <Text style={styles.detailText} selectable>
            {error?.message ?? 'Unknown error'}
          </Text>
        </View>

        <Button label="Try again" onPress={retry} variant="primary" accent={Accents.financial} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  content: { padding: Space.xl, gap: Space.lg, flexGrow: 1, justifyContent: 'center' },
  eyebrow: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 2.4,
    color: Accents.violent,
  },
  title: {
    fontFamily: Fonts.impact,
    fontSize: Type.title,
    lineHeight: Type.title * 0.94,
    color: Palette.text,
    textTransform: 'uppercase',
  },
  body: {
    fontFamily: Fonts.ui,
    fontSize: Type.body,
    lineHeight: 24,
    color: Palette.textMuted,
  },
  detail: {
    backgroundColor: Palette.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Palette.hairline,
    padding: Space.lg,
    gap: Space.sm,
  },
  detailLabel: {
    fontFamily: Fonts.uiBold,
    fontSize: Type.micro,
    letterSpacing: 1.8,
    color: Palette.textFaint,
  },
  detailText: {
    fontFamily: Fonts.mono,
    fontSize: Type.small,
    lineHeight: 20,
    color: Palette.text,
  },
});
