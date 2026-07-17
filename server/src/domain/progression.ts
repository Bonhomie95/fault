import type { Tier } from '@prisma/client';

/**
 * Two axes, deliberately separated.
 *
 * RANK is service. It is bought with hours in the room and never falls. It
 * cannot spoil a case, because it does not know whether you were right — it
 * only knows you sat there. This is what unlocks *access*.
 *
 * TRUST is judgement. It moves only on things the court could actually
 * observe about your record — appeals upheld, verdicts left to the clock,
 * the same facts decided two different ways — and it lands at review breaks,
 * never at the moment of the verdict. This is what unlocks *standing*.
 *
 * The split is what lets FAULT have progression without becoming a quiz.
 * A scoreboard that ticked up the instant you tapped GUILTY would answer the
 * question the whole game is built on refusing to answer.
 */

export interface RankDef {
  level: number;
  title: string;
  xpRequired: number;
}

/** Titles read as a career, not a battle pass. */
export const RANKS: RankDef[] = [
  { level: 1, title: 'Empanelled', xpRequired: 0 },
  { level: 2, title: 'Juror', xpRequired: 120 },
  { level: 3, title: 'Juror, Second Chair', xpRequired: 320 },
  { level: 4, title: 'Senior Juror', xpRequired: 640 },
  { level: 5, title: 'Presiding Juror', xpRequired: 1100 },
  { level: 6, title: 'Circuit Juror', xpRequired: 1750 },
  { level: 7, title: 'Bench Juror', xpRequired: 2600 },
  { level: 8, title: 'Assize Juror', xpRequired: 3700 },
  { level: 9, title: 'Juror of Record', xpRequired: 5100 },
  { level: 10, title: 'Standing Juror', xpRequired: 6900 },
  { level: 11, title: 'Juror Emeritus', xpRequired: 9200 },
  { level: 12, title: 'Chief Juror', xpRequired: 12000 },
];

export function rankFor(xp: number): RankDef {
  let current = RANKS[0]!;
  for (const r of RANKS) if (xp >= r.xpRequired) current = r;
  return current;
}

export function nextRank(xp: number): RankDef | null {
  return RANKS.find((r) => r.xpRequired > xp) ?? null;
}

/** XP earned for hearing a case. Service, not accuracy. */
export const XP = {
  /** Turning up and deciding. Paid for every case, right or wrong. */
  caseHeard: 40,
  /** Reading before deciding — rewards engagement, not correctness. A verdict
   *  delivered with most of the clock burned means you actually read it. */
  deliberated: 15,
  /** Letting the clock decide is not service. */
  hungPenalty: -10,
  /** Each rung outward is worth more. */
  tierMultiplier: { district: 1, state: 1.25, national: 1.6, supranational: 2, international: 2.5, world: 3 } as Record<Tier, number>,
} as const;

export function xpForVerdict(opts: {
  tier: Tier;
  wasHung: boolean;
  timeRemaining: number;
  clockSeconds: number;
}): number {
  if (opts.wasHung) return Math.max(0, XP.caseHeard + XP.hungPenalty);

  // "Deliberated" means you used at least a third of the clock. It says
  // nothing about whether you were right.
  const used = opts.clockSeconds - opts.timeRemaining;
  const deliberated = used >= opts.clockSeconds / 3 ? XP.deliberated : 0;
  const base = XP.caseHeard + deliberated;

  return Math.round(base * (XP.tierMultiplier[opts.tier] ?? 1));
}

/** What each rung of the ladder demands before it will hear from you. */
export interface TierRequirement {
  rank: number;
  trust: number;
}

export const TIER_REQUIREMENTS: Record<Tier, TierRequirement> = {
  district: { rank: 1, trust: 0 },
  state: { rank: 3, trust: 55 },
  national: { rank: 5, trust: 62 },
  supranational: { rank: 7, trust: 70 },
  international: { rank: 9, trust: 78 },
  world: { rank: 12, trust: 85 },
};

/**
 * Access gates. Rank only — never trust, because a gate that closed when you
 * were "wrong" would be a score by another name.
 */
export const GATES = {
  /** GDD Screen 3, "Review past cases": the full archive of your own record. */
  caseArchive: 2,
  /** GDD Screen 7, Juror Record. The GDD also unlocks this at 10 cases. */
  jurorRecord: 2,
  /** Applying to sit in another country. */
  foreignApplications: 4,
} as const;

export function meetsTier(tier: Tier, rank: number, trust: number): boolean {
  const req = TIER_REQUIREMENTS[tier];
  return rank >= req.rank && trust >= req.trust;
}

/**
 * Trust movements, all of them delayed.
 *
 * Note what is absent: there is no reward for "getting it right" on an
 * ambiguous case, because there is nothing to get right. And the miscarriage
 * penalties are not symmetric — convicting someone who was innocent costs
 * more than acquitting someone who was guilty. That asymmetry is the game's
 * moral position, and it is the only one it takes.
 */
export const TRUST = {
  soundVerdict: +1.5,
  /** You convicted someone the record later exonerated. */
  wrongfulConviction: -5,
  /** You acquitted someone the record later condemned. */
  wrongfulAcquittal: -3,
  /** The clock decided, not you. */
  hung: -4,
  /** Same facts, different verdict. */
  inconsistency: -2.5,
  /** An unanswerable case decided either way costs nothing. */
  ambiguous: 0,
} as const;

export function trustForVerdict(opts: {
  verdict: 'guilty' | 'not_guilty';
  correctVerdict: 'guilty' | 'not_guilty' | 'ambiguous';
  wasHung: boolean;
}): number {
  if (opts.wasHung) return TRUST.hung;
  if (opts.correctVerdict === 'ambiguous') return TRUST.ambiguous;
  if (opts.verdict === opts.correctVerdict) return TRUST.soundVerdict;
  return opts.verdict === 'guilty' ? TRUST.wrongfulConviction : TRUST.wrongfulAcquittal;
}

export const clampTrust = (n: number) => Math.max(0, Math.min(100, n));

/**
 * How the bench describes your standing. Never a number, in the fiction.
 *
 * The bands are set so that the starting value of 50 reads as "Sound": a juror
 * who has not yet heard a case has done nothing wrong, and opening their
 * career by calling them "Questioned" would be the game accusing them of
 * something before they had the chance to do it. You fall from sound; you do
 * not climb to it.
 */
export function trustLabel(trust: number): string {
  if (trust >= 85) return 'Unimpeachable';
  if (trust >= 70) return 'Well regarded';
  if (trust >= 50) return 'Sound';
  if (trust >= 35) return 'Questioned';
  if (trust >= 20) return 'Under review';
  return 'Discredited';
}
