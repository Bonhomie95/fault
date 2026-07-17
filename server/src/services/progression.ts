import type { Tier, User } from '@prisma/client';
import {
  clampTrust,
  GATES,
  meetsTier,
  rankFor,
  nextRank,
  RANKS,
  TIER_REQUIREMENTS,
  trustLabel,
} from '../domain/progression.js';
import { COUNTRIES, ladderFor, nextTier, profileFor, tierLabel } from '../domain/jurisdiction.js';
import { prisma } from '../lib/prisma.js';
import { computeJurorStats } from './jurorProfile.js';

/**
 * Applies every trust delta that has been waiting for a review break.
 *
 * This is the whole reason trust is stored per-verdict rather than applied on
 * submit: the player learns what a verdict cost them at the same moment they
 * learn what it *did* (GDD 2.6). The number and the story arrive together, or
 * the number is just a spoiler with a delay.
 */
export async function settleTrust(userId: string): Promise<{
  applied: number;
  delta: number;
  trust: number;
}> {
  const pending = await prisma.verdictRecord.findMany({
    where: { userId, trustApplied: false },
    select: { id: true, trustDelta: true },
  });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (pending.length === 0) return { applied: 0, delta: 0, trust: user.trust };

  const delta = pending.reduce((sum, v) => sum + v.trustDelta, 0);
  const trust = clampTrust(user.trust + delta);

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { trust } }),
    prisma.verdictRecord.updateMany({
      where: { id: { in: pending.map((v) => v.id) } },
      data: { trustApplied: true },
    }),
  ]);

  return { applied: pending.length, delta, trust };
}

/** Rank is derived from XP, never stored as truth. */
export async function awardXp(userId: string, amount: number): Promise<{ rank: number; promoted: boolean }> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const before = rankFor(user.xp).level;
  const xp = Math.max(0, user.xp + amount);
  const after = rankFor(xp).level;

  await prisma.user.update({ where: { id: userId }, data: { xp, rank: after } });
  return { rank: after, promoted: after > before };
}

export interface StandingView {
  jurorName: string;
  rank: number;
  rankTitle: string;
  xp: number;
  xpIntoRank: number;
  xpForNextRank: number | null;
  nextRankTitle: string | null;
  trust: number;
  trustLabel: string;
  tier: Tier;
  tierLabel: string;
  country: string | null;
  district: string | null;
  court: string | null;
  casesHeard: number;
  currentStreak: number;
  longestStreak: number;
  /** The next rung, and exactly what it wants — the player should always know
   *  what they are climbing toward. */
  promotion: {
    tier: Tier;
    tierLabel: string;
    requiredRank: number;
    requiredTrust: number;
    eligible: boolean;
    blockedBy: string[];
  } | null;
  unlocks: { caseArchive: boolean; jurorRecord: boolean; foreignApplications: boolean };
}

export async function standingFor(user: User): Promise<StandingView> {
  const casesHeard = await prisma.verdictRecord.count({ where: { userId: user.id } });
  const rank = rankFor(user.xp);
  const next = nextRank(user.xp);
  const country = user.currentCountry ?? user.homeCountry;
  const profile = profileFor(country);

  const upcoming = nextTier(user.currentTier, country);
  let promotion: StandingView['promotion'] = null;

  if (upcoming) {
    const req = TIER_REQUIREMENTS[upcoming];
    const blockedBy: string[] = [];
    if (rank.level < req.rank)
      blockedBy.push(`Requires ${rankTitleFor(req.rank)} — you are ${rank.title}`);
    if (user.trust < req.trust)
      blockedBy.push(`Requires standing of ${req.trust} — yours is ${Math.round(user.trust)}`);

    promotion = {
      tier: upcoming,
      tierLabel: tierLabel(upcoming, country),
      requiredRank: req.rank,
      requiredTrust: req.trust,
      eligible: meetsTier(upcoming, rank.level, user.trust),
      blockedBy,
    };
  }

  return {
    jurorName: user.jurorName,
    rank: rank.level,
    rankTitle: rank.title,
    xp: user.xp,
    xpIntoRank: user.xp - rank.xpRequired,
    xpForNextRank: next ? next.xpRequired - rank.xpRequired : null,
    nextRankTitle: next?.title ?? null,
    trust: user.trust,
    trustLabel: trustLabel(user.trust),
    tier: user.currentTier,
    tierLabel: tierLabel(user.currentTier, country),
    country,
    district: user.homeDistrict,
    court: user.homeDistrict ? profile.courtName(user.currentTier, user.homeDistrict) : null,
    casesHeard,
    currentStreak: user.currentStreak,
    longestStreak: user.longestStreak,
    promotion,
    unlocks: {
      caseArchive: rank.level >= GATES.caseArchive,
      jurorRecord: rank.level >= GATES.jurorRecord && casesHeard >= 10,
      foreignApplications: rank.level >= GATES.foreignApplications,
    },
  };
}

const rankTitleFor = (level: number) =>
  RANKS.find((r) => r.level === level)?.title ?? `rank ${level}`;

/** Promote if the ladder will have you. Returns the rung, or null. */
export async function tryPromote(userId: string): Promise<Tier | null> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const country = user.currentCountry ?? user.homeCountry;
  const upcoming = nextTier(user.currentTier, country);
  if (!upcoming) return null;

  if (!meetsTier(upcoming, rankFor(user.xp).level, user.trust)) return null;

  await prisma.user.update({ where: { id: userId }, data: { currentTier: upcoming } });
  return upcoming;
}

/**
 * The bench reviewing a foreign application.
 *
 * Decided on the record, exactly as the player was told it would be. The
 * thresholds are stricter than for a home promotion: a country taking a
 * foreign juror is taking a risk, and inconsistency is what frightens it most.
 */
export async function decideApplication(
  user: User,
  country: string,
  tier: Tier,
): Promise<{ accepted: boolean; text: string; trust: number; rank: number }> {
  const stats = await computeJurorStats(user.id);
  const rank = rankFor(user.xp).level;
  const profile = profileFor(country);
  const req = TIER_REQUIREMENTS[tier];

  const reasons: string[] = [];
  let accepted = true;

  // A foreign bench wants a clear margin, not a bare pass.
  if (rank < req.rank + 1) {
    accepted = false;
    reasons.push(`your rank is below what ${profile.name} requires of a visiting juror`);
  }
  if (user.trust < req.trust + 5) {
    accepted = false;
    reasons.push(`your standing of ${Math.round(user.trust)} falls short of the threshold`);
  }
  if (stats.totalCases >= 6 && stats.consistencyScore < 60) {
    accepted = false;
    reasons.push('your record shows the same facts decided different ways');
  }
  if (stats.totalCases >= 6 && Math.abs(stats.socioeconomicBias) > 35) {
    accepted = false;
    reasons.push('your record shows a pattern the bench could not explain to a defendant');
  }
  if (stats.totalCases < 10) {
    accepted = false;
    reasons.push('you have not yet heard enough cases to be assessed');
  }

  const text = accepted
    ? `The judicial service of ${profile.name} has reviewed your record across ${stats.totalCases} cases and accepted your application to sit at ${tierLabel(tier, country)} level. You are asked to note that procedure here will not resemble the room you learned in.`
    : `The judicial service of ${profile.name} has reviewed your record and declined your application at this time, on the grounds that ${listReasons(reasons)}. You may apply again when your record has changed.`;

  return { accepted, text, trust: user.trust, rank };
}

function listReasons(items: string[]): string {
  if (items.length === 0) return 'your record is incomplete';
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * Countries this juror could apply to — everywhere they are not already.
 * Only hand-localised countries can host: a generic profile has no real bench
 * to sit on, and inventing one would be worse than not offering it.
 */
export function eligibleCountries(user: User): { code: string; name: string; ladder: Tier[] }[] {
  const home = (user.currentCountry ?? user.homeCountry ?? '').toUpperCase();
  return Object.values(COUNTRIES)
    .filter((c) => c.code !== home)
    .map((c) => ({ code: c.code, name: c.name, ladder: ladderFor(c.code) }));
}
