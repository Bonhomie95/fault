import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether the player has asked the system to reduce motion.
 *
 * This matters more here than in most apps. FAULT's camera is a head in a
 * fixed seat, and a head that sways, breathes and swings its gaze across a
 * room is exactly the vocabulary that triggers vestibular symptoms — the same
 * reason first-person games ship a "reduce camera motion" toggle. Someone who
 * has set this switch is telling us that the difference between a snap and a
 * swing is the difference between playing and feeling ill.
 *
 * Reads the setting once and then listens: it can be changed while the app is
 * open, and a player who reaches for it mid-case is telling us something
 * urgent about right now.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive) setReduced(v);
    });

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
