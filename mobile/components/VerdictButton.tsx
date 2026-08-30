import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Fonts, Palette, Type } from '@/constants/theme';
import * as haptic from '@/lib/haptics';

/**
 * GDD 6, Screen 4 — hold to confirm.
 *
 * A verdict is not a tap. Half a second of deliberate pressure stands between
 * you and a person's life, which is both a fat-finger guard and the point: the
 * fill racing across the button is the last moment you can still change your
 * mind.
 */

const HOLD_MS = 500;

interface VerdictButtonProps {
  label: string;
  accent: string;
  disabled?: boolean;
  onConfirm: () => void;
}

export function VerdictButton({ label, accent, disabled = false, onConfirm }: VerdictButtonProps) {
  const fill = useSharedValue(0);

  const fire = useCallback(() => {
    haptic.delivered();
    onConfirm();
  }, [onConfirm]);

  const onPressIn = useCallback(() => {
    if (disabled) return;
    // The moment you commit. Light, because the gavel is what is heavy.
    haptic.tapLight();
    fill.value = withTiming(1, { duration: HOLD_MS, easing: Easing.linear }, (finished) => {
      if (finished) runOnJS(fire)();
    });
  }, [disabled, fill, fire]);

  const onPressOut = useCallback(() => {
    // Let go early and the commitment drains away.
    cancelAnimation(fill);
    fill.value = withTiming(0, { duration: 140 });
  }, [fill]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fill.value * 100}%`,
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: fill.value > 0.55 ? Palette.bg : Palette.text,
  }));

  return (
    <Pressable
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${label} — press and hold to deliver`}
      accessibilityHint="Hold for half a second to confirm this verdict"
      style={[styles.button, { borderColor: accent }, disabled && styles.disabled]}
    >
      <Animated.View style={[styles.fill, { backgroundColor: accent }, fillStyle]} />
      <View style={styles.labelWrap}>
        <Animated.Text style={[styles.label, labelStyle]}>{label}</Animated.Text>
        <Text style={styles.hint}>HOLD</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flex: 1,
    height: 62,
    borderWidth: 1,
    borderRadius: 2,
    overflow: 'hidden',
    justifyContent: 'center',
    backgroundColor: Palette.surface,
  },
  disabled: { opacity: 0.35 },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  labelWrap: { alignItems: 'center', gap: 2 },
  label: {
    fontFamily: Fonts.uiBold,
    fontSize: 15,
    letterSpacing: 1.6,
  },
  hint: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 2,
    color: Palette.textFaint,
  },
});
