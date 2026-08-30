import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Fonts, Layout, Palette, Space, Type } from '@/constants/theme';

/**
 * The clock ran out while you were away.
 *
 * Not resetting `servedAt` when a pending case is re-served is correct — it
 * closes the reload exploit, and the case's window really has closed. What was
 * missing was anyone telling the player.
 *
 * The old behaviour: take a phone call, come back five minutes later, and the
 * case screen loaded with zero seconds, immediately submitted a null verdict,
 * and the server flipped a coin. Minus four trust, minus twenty Merit, minus
 * ten XP, and a permanent line on the record the whole game is about —
 * delivered with no warning and no way it could have been avoided. Trust gates
 * the promotion ladder, so it is not cosmetic either.
 *
 * The rule does not change. This screen changes it from something the player
 * discovers afterwards into something the court tells them, in the court's own
 * voice, before the gavel falls. A consequence you are told about is drama; a
 * consequence that happens silently is a bug, whatever the code intended.
 */
export function Adjourned({
  caseTitle,
  accent,
  onAcknowledge,
}: {
  caseTitle: string;
  accent: string;
  onAcknowledge: () => void;
}) {
  return (
    <Animated.View entering={FadeIn.duration(240)} style={styles.root}>
      <View style={styles.card}>
        <Text style={[styles.kicker, { color: accent }]}>THE COURT ADJOURNED</Text>

        <Text style={styles.title} numberOfLines={3}>
          {caseTitle.toUpperCase()}
        </Text>

        {/* Facts, in the register the rest of the game uses. No apology, no
            explanation of the rule — the fiction states what happened and
            leaves the player to feel about it. */}
        <Text style={styles.body}>
          Your deliberation window closed while this file was in your hands. The bench could not
          wait, and a verdict was returned without you.
        </Text>

        <Text style={styles.body}>It is recorded as hung. It stands on your record.</Text>

        <Pressable
          onPress={onAcknowledge}
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel="Acknowledge the adjournment and see the verdict"
          hitSlop={8}
        >
          <Text style={styles.buttonText}>SEE THE RECORD</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,8,9,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Space.xl,
    zIndex: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderWidth: 1,
    borderColor: Palette.hairline,
    backgroundColor: Palette.surface,
    borderRadius: 4,
    padding: Space.xl,
    gap: Space.md,
  },
  kicker: {
    fontFamily: Fonts.mono,
    fontSize: Type.label,
    letterSpacing: 2,
  },
  title: {
    fontFamily: Fonts.display,
    fontSize: Type.subhead,
    color: Palette.text,
    marginBottom: Space.xs,
  },
  body: {
    fontFamily: Fonts.mono,
    fontSize: Type.small,
    lineHeight: 22,
    color: Palette.textMuted,
  },
  button: {
    marginTop: Space.md,
    minHeight: Layout.touchMin,
    borderWidth: 1,
    borderColor: Palette.hairlineBright,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontFamily: Fonts.uiBold,
    fontSize: Type.label,
    letterSpacing: 2,
    color: Palette.text,
  },
});
