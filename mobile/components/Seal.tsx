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

export type SealKind = 'patron' | 'seal_brass' | 'seal_obsidian' | 'seal_ivory' | 'seal_gold';

const SEALS: Record<SealKind, { ring: string; face: string; ink: string; glyph: string }> = {
  seal_brass: { ring: '#8A6A2F', face: '#C79A3C', ink: '#3A2C10', glyph: '§' },
  seal_obsidian: { ring: '#2A2A33', face: '#15151C', ink: '#8E8EA8', glyph: '§' },
  seal_ivory: { ring: '#B9B096', face: '#E8E1CC', ink: '#4A4433', glyph: '§' },
  /** The Juror Pass seal. Lapses with the pass, like everything it brings. */
  seal_gold: { ring: '#B8860B', face: '#F2C94C', ink: '#4A3505', glyph: '§' },
  /**
   * The patron's mark.
   *
   * This was sold for $19.99 and rendered by nothing at all — the entitlement
   * existed in the catalogue, in the Prisma enum and in the client's type
   * union, and no component ever read it. The blurb promised "a seal", and
   * there was no seal.
   *
   * A pilcrow rather than a section mark, so it reads as a different order of
   * thing beside the three you can buy or earn, and not merely as a fourth
   * colour of the same object.
   */
  patron: { ring: '#6E5A2E', face: '#1B1810', ink: '#D9BE7A', glyph: '¶' },
};

/**
 * The best seal a juror owns, or none. Order is preference, not value.
 *
 * Patron sits first because it is the only one that cannot be earned, and
 * somebody who paid for it and then earned another should not silently lose
 * the mark they paid for.
 */
export function sealFrom(entitlements: Entitlement[], preferred?: SealKind | null): SealKind | null {
  // The one the juror chose, while they still own it.
  if (preferred && entitlements.includes(preferred)) return preferred;
  const order: SealKind[] = ['patron', 'seal_gold', 'seal_obsidian', 'seal_brass', 'seal_ivory'];
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
      accessibilityLabel={kind === 'patron' ? "Patron of the Court's seal" : "Juror's seal"}
    >
      <Text style={[styles.glyph, { color: s.ink, fontSize: size * 0.55 }]}>{s.glyph}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  seal: { alignItems: 'center', justifyContent: 'center' },
  glyph: { fontFamily: Fonts.display, lineHeight: undefined, marginTop: -1 },
});
