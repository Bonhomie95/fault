import { StyleSheet, Text, View } from 'react-native';
import { Fonts } from '@/constants/theme';
import type { Entitlement } from '@/lib/api';

/**
 * The juror's seal.
 *
 * The one cosmetic that is actually worth money, because it is the only one
 * anyone else sees: it sits beside your name on the public registry. A seal in
 * a single-player room would be a sticker; a seal on a leaderboard is a
 * signature.
 *
 * It is drawn rather than shipped as art so it costs nothing to add, scales to
 * any size, and cannot be a missing asset in production.
 */

export type SealKind = 'seal_brass' | 'seal_obsidian' | 'seal_ivory';

const SEALS: Record<SealKind, { ring: string; face: string; ink: string; glyph: string }> = {
  seal_brass: { ring: '#8A6A2F', face: '#C79A3C', ink: '#3A2C10', glyph: '§' },
  seal_obsidian: { ring: '#2A2A33', face: '#15151C', ink: '#8E8EA8', glyph: '§' },
  seal_ivory: { ring: '#B9B096', face: '#E8E1CC', ink: '#4A4433', glyph: '§' },
};

/** The best seal a juror owns, or none. Order is preference, not value. */
export function sealFrom(entitlements: Entitlement[]): SealKind | null {
  const order: SealKind[] = ['seal_obsidian', 'seal_brass', 'seal_ivory'];
  return order.find((s) => entitlements.includes(s)) ?? null;
}

export function Seal({ kind, size = 18 }: { kind: SealKind | null; size?: number }) {
  if (!kind) return null;
  const s = SEALS[kind];

  return (
    <View
      style={[
        styles.seal,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: s.ring,
          backgroundColor: s.face,
          borderWidth: Math.max(1, size / 14),
        },
      ]}
      accessibilityLabel="Juror's seal"
    >
      <Text style={[styles.glyph, { color: s.ink, fontSize: size * 0.55 }]}>{s.glyph}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  seal: { alignItems: 'center', justifyContent: 'center' },
  glyph: { fontFamily: Fonts.display, lineHeight: undefined, marginTop: -1 },
});
