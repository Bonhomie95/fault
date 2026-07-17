import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Elevation, Fonts, Layout, Palette, Radius, Space, Type, Verdict } from '@/constants/theme';
import { tapLight } from '@/lib/haptics';
import { play } from '@/lib/sound';

/**
 * A button.
 *
 * The app did not have one. Every action in the game was a monospace label
 * wrapped in square brackets — `[ The career ]` — which is a convention from
 * text adventures, not an affordance. Nothing looked pressable, nothing
 * responded to a press, and nothing said which action was the important one.
 *
 * This is the one place that knows what pressing something feels like: it
 * scales, it taps the taptic engine, it makes a sound, it goes quiet when it is
 * disabled and it refuses to fire twice. Every screen gets that for free, and
 * more importantly gets it *identically*.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** Small print under the label — a reason, a cost, a consequence. */
  hint?: string;
  disabled?: boolean;
  /** Shows a spinner and eats presses. */
  busy?: boolean;
  /** Paints the button in the case's colour. Primary only. */
  accent?: string;
  style?: ViewStyle;
  /** Overrides the label for screen readers when the label alone is not enough. */
  accessibilityLabel?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({
  label,
  onPress,
  variant = 'secondary',
  hint,
  disabled = false,
  busy = false,
  accent,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const scale = useSharedValue(1);
  const dead = disabled || busy;

  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  // 0.97, not 0.9. A button that shrinks a tenth of its size reads as a toy,
  // and this game is asking someone to convict a person.
  const press = (to: number) => {
    if (dead) return;
    scale.value = withSpring(to, { damping: 20, stiffness: 320 });
  };

  const fill =
    variant === 'primary' ? (accent ?? Palette.text) : variant === 'danger' ? Verdict.guilty : undefined;

  return (
    <View style={style}>
      <AnimatedPressable
        onPressIn={() => press(0.97)}
        onPressOut={() => press(1)}
        onPress={() => {
          if (dead) return;
          tapLight();
          play('open');
          onPress();
        }}
        disabled={dead}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: dead, busy }}
        // The visual bounds are the tap bounds, and both clear 44pt.
        style={[
          styles.base,
          variant === 'primary' && [styles.primary, fill ? { backgroundColor: fill } : null],
          variant === 'secondary' && styles.secondary,
          variant === 'ghost' && styles.ghost,
          variant === 'danger' && styles.danger,
          dead && styles.dead,
          animated,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={variant === 'primary' ? Palette.bg : Palette.text} />
        ) : (
          <Text
            numberOfLines={1}
            style={[
              styles.label,
              variant === 'primary' && styles.labelOnFill,
              variant === 'ghost' && styles.labelGhost,
            ]}
          >
            {label}
          </Text>
        )}
      </AnimatedPressable>

      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: Layout.touchMin + 8,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
    paddingVertical: Space.lg,
  },
  primary: {
    backgroundColor: Palette.text,
    ...Elevation.card,
  },
  secondary: {
    backgroundColor: Palette.surfaceRaised,
    borderWidth: 1,
    borderColor: Palette.hairlineBright,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  danger: {
    backgroundColor: Verdict.guilty,
    ...Elevation.card,
  },
  // 0.4, and it stops responding. Both, because opacity alone is a look and
  // not a state.
  dead: {
    opacity: 0.38,
    shadowOpacity: 0,
    elevation: 0,
  },
  label: {
    fontFamily: Fonts.impact,
    fontSize: Type.subhead,
    letterSpacing: 1.2,
    color: Palette.text,
    textTransform: 'uppercase',
  },
  labelOnFill: {
    color: Palette.bg,
  },
  labelGhost: {
    fontFamily: Fonts.ui,
    fontSize: Type.small,
    letterSpacing: 0.6,
    color: Palette.textMuted,
    textTransform: 'none',
  },
  hint: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 1.1,
    color: Palette.textFaint,
    textAlign: 'center',
    marginTop: Space.sm,
    textTransform: 'uppercase',
  },
});
