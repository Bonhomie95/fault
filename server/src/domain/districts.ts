import { profileFor } from './jurisdiction.js';

/**
 * The map a juror works their way across.
 *
 * Every country profile names a handful of real districts. A juror starts in
 * their home district and the others open by RANK — service, not judgement —
 * so the map widens as you sit more cases, whatever you decided in them.
 *
 * A district is harder the further along the ladder it sits: its cases are
 * more often genuinely unanswerable, and it pays more for sitting them. That
 * is the only difference. The courtroom is the same room; the city is the same
 * city state. What changes is the place on the file, the papers that report
 * it, and how much the evidence is willing to tell you.
 */

/** Rank needed to open the n-th district (0 = home). */
export const DISTRICT_UNLOCK_RANKS = [1, 3, 4, 6, 8, 10, 12] as const;

export interface DistrictView {
  name: string;
  /** Rank at which it opens. */
  unlockRank: number;
  unlocked: boolean;
  current: boolean;
  home: boolean;
  /** 1 home court .. 5 the hardest room on this map. */
  difficulty: number;
  difficultyLabel: string;
  /** Multiplier on XP and Merit for a case heard here. */
  reward: number;
  outlet: string;
}

const LABELS = ['Home court', 'Busy', 'Contested', 'Hard', 'Notorious', 'Notorious', 'Notorious'];

/**
 * The districts of the player's current country, home first, in unlock order.
 *
 * Home first matters: the home district is always open, whichever position it
 * holds in the profile's list, and every other district keeps the order the
 * profile gives it so two players in the same country climb the same ladder.
 */
export function orderedDistricts(country: string | null, home: string | null): string[] {
  const all = profileFor(country).districts;
  if (!home || !all.includes(home)) return [...all];
  return [home, ...all.filter((d) => d !== home)];
}

export function districtLadder(user: {
  rank: number;
  homeCountry: string | null;
  currentCountry: string | null;
  homeDistrict: string | null;
  currentDistrict: string | null;
}): DistrictView[] {
  const country = user.currentCountry ?? user.homeCountry;
  // Abroad, "home" is simply the first district of the new country.
  const inHomeCountry = !user.currentCountry || user.currentCountry === user.homeCountry;
  const ordered = orderedDistricts(country, inHomeCountry ? user.homeDistrict : null);
  const current = currentDistrictFor(user);
  return ordered.map((name, i) => {
    const unlockRank = DISTRICT_UNLOCK_RANKS[Math.min(i, DISTRICT_UNLOCK_RANKS.length - 1)]!;
    const difficulty = Math.min(5, i + 1);
    return {
      name,
      unlockRank,
      unlocked: user.rank >= unlockRank,
      current: name === current,
      home: i === 0,
      difficulty,
      difficultyLabel: LABELS[i] ?? 'Notorious',
      reward: rewardFor(difficulty),
      outlet: `The ${name} Herald`,
    };
  });
}

/** Where the player is sitting now, validated against what they have opened. */
export function currentDistrictFor(user: {
  rank: number;
  homeCountry: string | null;
  currentCountry: string | null;
  homeDistrict: string | null;
  currentDistrict: string | null;
}): string {
  const country = user.currentCountry ?? user.homeCountry;
  const inHomeCountry = !user.currentCountry || user.currentCountry === user.homeCountry;
  const ordered = orderedDistricts(country, inHomeCountry ? user.homeDistrict : null);
  const i = user.currentDistrict ? ordered.indexOf(user.currentDistrict) : -1;
  if (i >= 0) {
    const need = DISTRICT_UNLOCK_RANKS[Math.min(i, DISTRICT_UNLOCK_RANKS.length - 1)]!;
    if (user.rank >= need) return ordered[i]!;
  }
  return ordered[0] ?? user.homeDistrict ?? 'the city';
}

/** 1.0 at home, +12% per step up the map. */
export function rewardFor(difficulty: number): number {
  return Math.round((1 + (difficulty - 1) * 0.12) * 100) / 100;
}

/**
 * How much more often a case here is genuinely unanswerable.
 *
 * Added to the chapter's ambiguity target (caseGenerator.ambiguityTargetFor).
 * Small on purpose: a district is harder, not hopeless, and the promotion
 * ladder still needs cases with an answer in them to be climbable.
 */
export function ambiguityBumpFor(difficulty: number): number {
  return (difficulty - 1) * 0.05;
}

/** Districts whose unlock rank was crossed by moving from `before` to `after`. */
export function newlyUnlocked(
  ladder: DistrictView[],
  before: number,
  after: number,
): DistrictView[] {
  return ladder.filter((d) => d.unlockRank > before && d.unlockRank <= after);
}
