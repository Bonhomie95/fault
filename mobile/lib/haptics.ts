import * as Haptics from 'expo-haptics';
import { hapticsOn } from '@/store/settings';

/**
 * Touch.
 *
 * Everything goes through here rather than calling expo-haptics directly, for
 * one reason: the settings switch has to work. Previously the toggle was
 * `useState` and every call site fired regardless — the control was a
 * decoration, which is worse than not having one.
 *
 * The vocabulary is deliberately small. FAULT is a game about weight, and a
 * phone that buzzes at everything communicates nothing.
 */

const guard = (fn: () => Promise<void>) => {
  if (!hapticsOn()) return;
  fn().catch(() => {
    /* a device without a taptic engine is not an error */
  });
};

/** Moving between tabs, picking up an exhibit. The lightest thing we do. */
export const tapLight = () =>
  guard(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));

/** Each of the last five seconds. Insistent, not painful. */
export const tick = () =>
  guard(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));

/** The gavel. The only heavy hit in the game. */
export const gavel = () =>
  guard(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));

/** A verdict delivered by your own hand. */
export const delivered = () =>
  guard(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));

/** The clock decided instead of you. */
export const clockRanOut = () =>
  guard(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));

/** Merit, a promotion, a mission claimed. */
export const stamped = () =>
  guard(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid));

/** Something refused: a purchase you cannot afford, a bench that declined. */
export const refused = () =>
  guard(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
