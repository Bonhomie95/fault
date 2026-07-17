import type { CityMetrics } from './city.js';

/**
 * How peaceful a city is, as one number.
 *
 * The leaderboards need a single scalar to sort on, and picking it is a design
 * statement, not a formula. "Peaceful" here is not merely "low crime" — a city
 * can be quiet because it is policed into silence. So the index reads peace as
 * something closer to a functioning society:
 *
 *   crime is the loudest signal, but not the only one
 *   a city nobody trusts is not at peace, however quiet
 *   a city whose police are bent is not at peace either
 *   a city the Syndicate runs is at peace only in the way a graveyard is
 *   and disparity counts, because a city can be calm and still be unjust
 *
 * The two boards are the two ends of this one scale, which is deliberate: the
 * most lawless city is not measured differently from the most peaceful one,
 * it is the same measurement read from the other side. Nobody gets to be top
 * of both.
 */

export const PEACE_WEIGHTS = {
  crime: 0.3,
  trust: 0.25,
  police: 0.2,
  syndicate: 0.15,
  disparity: 0.1,
} as const;

export function peaceIndex(city: CityMetrics): number {
  const raw =
    (100 - city.crimeRate) * PEACE_WEIGHTS.crime +
    city.judicialTrust * PEACE_WEIGHTS.trust +
    city.policeIntegrity * PEACE_WEIGHTS.police +
    (100 - city.organizedCrimePower) * PEACE_WEIGHTS.syndicate +
    (100 - city.wealthDisparity) * PEACE_WEIGHTS.disparity;

  return Math.max(0, Math.min(100, raw));
}

/** The same SQL, for ranking in the database rather than in memory. */
export const PEACE_SQL = `
  ((100 - cs."crimeRate") * ${PEACE_WEIGHTS.crime}
 + cs."judicialTrust"     * ${PEACE_WEIGHTS.trust}
 + cs."policeIntegrity"   * ${PEACE_WEIGHTS.police}
 + (100 - cs."organizedCrimePower") * ${PEACE_WEIGHTS.syndicate}
 + (100 - cs."wealthDisparity")     * ${PEACE_WEIGHTS.disparity})
`;

/**
 * How many cases before a city counts.
 *
 * Every juror starts at a flat 50 across the board, which computes to a peace
 * index of exactly 50. Without a floor, thousands of untouched cities would
 * sit in a dead heap in the middle of both boards, and a player who signed up
 * and never played would outrank someone who spent a month trying to hold
 * their city together. A city has to have been governed to be judged.
 */
export const MIN_CASES_TO_RANK = 10;

/** What the city is called on the board. */
export function cityVerdict(index: number): string {
  if (index >= 80) return 'At peace';
  if (index >= 65) return 'Orderly';
  if (index >= 50) return 'Strained';
  if (index >= 35) return 'Troubled';
  if (index >= 20) return 'Lawless';
  return 'Ungovernable';
}
