import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Accents, Fonts, Palette, Radius, Space, Type } from '@/constants/theme';
import type { CityState } from '@/lib/api';

/**
 * Six numbers describing the city the player's verdicts have made.
 *
 * This used to sit at the bottom of the docket, below the day's cases, the
 * Daily Trial, the offers and the missions. It reads far better next to the
 * OTHER cities — your city, then everyone else's — which is also the only
 * place the comparison means anything.
 *
 * The numbers are the city's, never the player's: nothing here says whether a
 * verdict was right, because the game never tells anyone that.
 */
export function CityPulse({ city }: { city: CityState }) {
  return (
    <View style={styles.pulse}>
      <Text style={styles.title}>CITY PULSE</Text>
      <PulseBar label="Crime" value={city.crimeRate} tint={Accents.violent} index={0} />
      <PulseBar label="Trust" value={city.judicialTrust} tint={Accents.systemic} index={1} />
      <PulseBar label="Disparity" value={city.wealthDisparity} tint={Accents.financial} index={2} />
      <PulseBar label="Syndicate" value={city.organizedCrimePower} tint={Accents.passion} index={3} />
      <PulseBar label="Police" value={city.policeIntegrity} tint={Accents.systemic} index={4} />
      <PulseBar label="Press" value={city.mediaPressure} tint={Accents.financial} index={5} />
      {city.activeFactions.length > 0 && (
        <Text style={styles.factions}>{city.activeFactions.join(' · ').toUpperCase()}</Text>
      )}
    </View>
  );
}

/**
 * The bars fill rather than simply being full.
 *
 * Six numbers that are already at rest read as a printed table. Filling them
 * in sequence says these are readings, and that they move — which is the whole
 * claim the screen is making about the player's verdicts.
 */
function PulseBar({
  label,
  value,
  tint,
  index,
}: {
  label: string;
  value: number;
  tint: string;
  index: number;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const reduced = useReducedMotion();
  const grown = useSharedValue(reduced ? pct : 0);

  useEffect(() => {
    grown.value = reduced ? pct : withDelay(index * 70, withTiming(pct, { duration: 650 }));
  }, [pct, index, reduced, grown]);

  const fill = useAnimatedStyle(() => ({ width: `${grown.value}%` }));

  return (
    <View
      style={styles.barRow}
      accessibilityRole="progressbar"
      accessibilityLabel={`${label}: ${Math.round(pct)} out of 100`}
    >
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.barTrack}>
        <Animated.View style={[styles.barFill, { backgroundColor: tint }, fill]} />
      </View>
      <Text style={styles.barValue}>{Math.round(pct)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pulse: {
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.hairline,
    padding: Space.lg,
    gap: Space.sm,
  },
  title: {
    fontFamily: Fonts.uiBold,
    fontSize: Type.micro,
    letterSpacing: 2,
    color: Palette.textMuted,
    marginBottom: 2,
  },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  barLabel: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    color: Palette.textMuted,
    width: 82,
  },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: Palette.surfaceHigh,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 3 },
  barValue: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    color: Palette.textFaint,
    width: 26,
    textAlign: 'right',
  },
  factions: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 1.2,
    color: Palette.textFaint,
    marginTop: 4,
  },
});
