import { StyleSheet, Text, View } from 'react-native';
import { Fonts, Palette, Type } from '@/constants/theme';
import type { Standing } from '@/lib/api';
import { Seal, sealFrom } from '@/components/Seal';
import { useGame } from '@/store/game';

/**
 * Who you are, at a glance.
 *
 * Two values, and they are deliberately different kinds of thing:
 *
 *   RANK is service — it only ever rises, and it is what opens doors.
 *   STANDING is judgement — it is named, not numbered ("Sound", "Questioned"),
 *   because a number next to your verdicts would turn the game into a score
 *   chase, and it moves only at review breaks.
 *
 * The streak is here too, and it counts days you turned up. Nothing about
 * this bar rewards a verdict going one way rather than the other.
 */

export function StandingBar({ standing }: { standing: Standing }) {
  // The seal is the one thing in this bar the player chose rather than earned.
  const seal = sealFrom(useGame((s) => s.entitlements));

  const pct =
    standing.xpForNextRank === null
      ? 1
      : Math.max(0, Math.min(1, standing.xpIntoRank / standing.xpForNextRank));

  return (
    <View style={styles.root}>
      <View style={styles.row}>
        <View style={styles.left}>
          <View style={styles.rankRow}>
            <Seal kind={seal} size={16} />
            <Text style={styles.rank}>{standing.rankTitle}</Text>
          </View>
          <Text style={styles.where}>
            {standing.court ?? standing.tierLabel}
            {standing.district ? ` · ${standing.district}` : ''}
          </Text>
        </View>

        <View style={styles.right}>
          <Text style={[styles.trust, trustColour(standing.trust)]}>
            {standing.trustLabel.toUpperCase()}
          </Text>
          <Text style={styles.trustCaption}>STANDING</Text>
        </View>
      </View>

      {/* Service toward the next rank. */}
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%` }]} />
      </View>

      <View style={styles.footRow}>
        <Text style={styles.foot}>
          {standing.nextRankTitle
            ? `${standing.xpIntoRank}/${standing.xpForNextRank} to ${standing.nextRankTitle}`
            : 'Nothing left to be promoted to.'}
        </Text>
        {standing.currentStreak > 1 && (
          <Text style={styles.streak}>{standing.currentStreak} DAY STREAK</Text>
        )}
      </View>
    </View>
  );
}

/** Standing is the one place the palette is allowed to editorialise. */
function trustColour(trust: number) {
  if (trust >= 70) return { color: '#1D7E6A' };
  if (trust >= 50) return { color: Palette.text };
  if (trust >= 35) return { color: '#D4860A' };
  return { color: '#C23B22' };
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: 'rgba(21,21,19,0.9)',
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: 2,
    padding: 14,
    gap: 9,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  left: { flex: 1, gap: 3 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  right: { alignItems: 'flex-end', gap: 2 },
  rank: {
    fontFamily: Fonts.display,
    fontSize: 17,
    color: Palette.text,
  },
  where: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    color: Palette.textMuted,
  },
  trust: {
    fontFamily: Fonts.monoBold,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  trustCaption: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 1.8,
    color: Palette.textFaint,
  },
  track: { height: 2, backgroundColor: Palette.hairline },
  fill: { height: 2, backgroundColor: Palette.text },
  footRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  foot: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 1,
    color: Palette.textFaint,
    flex: 1,
  },
  streak: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 1.2,
    color: '#D4860A',
  },
});
