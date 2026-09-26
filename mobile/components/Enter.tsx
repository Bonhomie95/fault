import { useEffect, type ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

/**
 * A card arriving, rather than a card that was simply already there.
 *
 * Deliberately NOT reanimated's `entering={FadeInDown}`. That prop is what put
 * the docket's only error message at `visibility: hidden` forever (see the
 * note in app/(tabs)/lobby.tsx) — a screen full of content that depends on a
 * declarative animation having run is a screen that can render blank. Here the
 * animation only ever moves a value from 0 to 1 on a mounted, laid-out view:
 * if it never runs, the worst case is a card that is simply in place already.
 *
 * `index` staggers a column so it reads top to bottom instead of all at once.
 * Six is about the ceiling — past that the last card is waiting half a second
 * for its turn, and a player who has opened this tab fifty times is waiting
 * with it.
 */
export function Enter({
  children,
  index = 0,
  style,
}: {
  children: ReactNode;
  index?: number;
  style?: ViewStyle;
}) {
  const reduced = useReducedMotion();
  const t = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) return;
    t.value = withDelay(index * 55, withTiming(1, { duration: 320 }));
  }, [index, reduced, t]);

  const animated = useAnimatedStyle(() => ({
    opacity: t.value,
    // 14pt, not 40. The card is settling into place, not flying in from
    // off-screen; anything further reads as a transition between screens.
    transform: [{ translateY: (1 - t.value) * 14 }],
  }));

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
