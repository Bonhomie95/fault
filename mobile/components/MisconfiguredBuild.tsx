import { StyleSheet, Text, View } from 'react-native';
import { Fonts, Palette, Space, Type } from '@/constants/theme';

/**
 * Shown instead of the app when a release build has no usable API host.
 *
 * This is a build problem, not a player problem, and it should be caught by
 * whoever installs the first TestFlight or internal-track build — which is
 * why it names the variable to fix instead of saying something soothing.
 * The alternative, and what used to happen, was either a splash screen that
 * never cleared (a throw at import time) or every request failing as "Check
 * your connection" against a placeholder host that can never resolve.
 */
export function MisconfiguredBuild({ reason }: { reason: string }) {
  return (
    <View style={styles.root} accessibilityRole="alert">
      <Text style={styles.kicker}>THE COURT IS NOT IN SESSION</Text>
      <Text style={styles.title}>This build cannot reach its server.</Text>
      <Text style={styles.body}>{reason}</Text>
      <Text style={styles.body}>
        If you downloaded FAULT from a store, please update it or try again later.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Palette.bg,
    justifyContent: 'center',
    padding: Space.xxl,
    gap: Space.md,
  },
  kicker: { fontFamily: Fonts.mono, fontSize: Type.micro, letterSpacing: 2, color: '#E04E2E' },
  title: { fontFamily: Fonts.display, fontSize: Type.heading, color: Palette.text },
  body: { fontFamily: Fonts.mono, fontSize: Type.label, lineHeight: 19, color: Palette.textMuted },
});
