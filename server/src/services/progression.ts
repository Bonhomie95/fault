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
import { currentDistrictFor } from '../domain/districts.js';
import { dayKey } from './missions.js';
import { docketFor, type DocketView } from './economy.js';
import { computeJurorStats } from './jurorProfile.js';

/**
 * Applies every trust delta that has been waiting for a review break.
 *
 * This is the whole reason trust is stored per-verdict rather than applied on
 * submit: the player learns what a verdict cost them at the same moment they
 * learn what it *did* (GDD 2.6). The number and the story arrive together, or
 * the number is just a spoiler with a delay.
 *
 * CLAIM FIRST, THEN APPLY — and the order is the correctness.
 *
 * This used to read the pending rows, read the user, sum, and write an
 * absolute trust value. Two concurrent settles could interleave so that the
 * second read the pending rows BEFORE the first marked them applied, but read
 * the user's trust AFTER the first had already lowered it — and then applied
 * the same deltas a second time on top. Trust gates the promotion ladder, so
 * double-applying a run of wrongful convictions is not a rounding error; it is
 * a career.
 *
 * `UPDATE ... RETURNING` is the primitive that fixes it. The claim and the
 * read are one statement, so a row can only ever be handed to one caller, and
 * the deltas that come back are exactly the ones this call is responsible for.
 * The trust write is then a relative increment clamped in SQL, so it composes
 * with anything else landing at the same time instead of overwriting it.
 */
export async function settleTrust(userId: string): Promise<{
  applied: number;
  delta: number;
  trust: number;
}> {
  return prisma.$transaction(async (tx) => {
    // Atomically take ownership of every unsettled verdict and get its delta
    // back in the same breath.
    const claimed = await tx.$queryRaw<{ trustDelta: number }[]>`
      UPDATE verdicts
         SET "trustApplied" = true
       WHERE "userId" = ${userId}
         AND "trustApplied" = false
      RETURNING "trustDelta"
    `;

    if (claimed.length === 0) {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { trust: true },
      });
      return { applied: 0, delta: 0, trust: user.trust };
    }

    const delta = claimed.reduce((sum, v) => sum + v.trustDelta, 0);

    // Relative, and clamped where the value lives. GREATEST/LEAST mirrors
    // clampTrust exactly — keep them in step.
    const [row] = await tx.$queryRaw<{ trust: number }[]>`
      UPDATE users
         SET trust = GREATEST(0, LEAST(100, trust + ${delta}))
       WHERE id = ${userId}
      RETURNING trust
    `;

    return { applied: claimed.length, delta, trust: row?.trust ?? clampTrust(delta) };
  });
}

/**
 * Rank is derived from XP, never stored as truth.
 *
 * The increment is atomic. This used to read `user.xp`, add, and write the sum
 * back — a lost-update race in which two awards landing together both read the
 * same starting value and the second overwrote the first, so one of them was
 * simply gone. XP is service, and service the player performed and did not get
 * paid for is the one kind of bug this economy must not have.
 *
 * `increment` makes Postgres do the addition, so concurrent awards compose.
 * The rank is then derived from the value the database actually landed on
 * rather than from anything computed here, which is also what makes `promoted`
 * honest under concurrency.
 */
export async function awardXp(userId: string, amount: number): Promise<{ rank: number; promoted: boolean }> {
  // XP is service, and service is only ever earned. Every caller today passes
  // a positive amount — xpForVerdict floors at 0, missions are positive — so a
  // negative here is a bug in the caller, and refusing it says so. The
  // alternative (clamping after the fact) needs a second absolute write, and
  // an absolute write is exactly the lost-update this function exists to
  // avoid.
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`awardXp requires a non-negative amount, got ${amount}`);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { xp: { increment: amount } },
    select: { xp: true, rank: true },
  });

  // The value this increment started from, derived from the value it landed
  // on — not from a separate read.
  //
  // Reading `xp` first and comparing was still racy: two awards crossing a
  // rank boundary together both read the same starting value and both claimed
  // the promotion. Subtracting our own contribution from the post-increment
  // total is exact for this caller no matter what else landed alongside it,
  // and costs one fewer round trip.
  const rankBefore = rankFor(updated.xp - amount).level;
  const rankAfter = rankFor(updated.xp).level;

  // `rank` is denormalised for display — nothing derives logic from it, every
  // decision uses rankFor(xp). So only write it when it actually moved, which
  // on the overwhelming majority of awards means not at all.
  if (rankAfter !== updated.rank) {
    await prisma.user.update({ where: { id: userId }, data: { rank: rankAfter } });
  }

  return { rank: rankAfter, promoted: rankAfter > rankBefore };
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
  /** The daily summons: whether today's is waiting, and what it pays. */
  daily: { available: boolean; satToday: boolean; merit: number; day: string };
  /** How much of today's docket is left, and the shields held. */
  docket: DocketView;
  shields: number;
  /**
   * Who signs the juror's letter of appointment: a fictional Chief Justice
   * with a name from the juror's own country. It was always "A. Oyelaran" —
   * a Yoruba name presiding over Mumbai and Oslo alike.
   */
  chiefJustice: string;
}

/**
 * The daily summons — a reason to open the app that is not a case.
 *
 * Pays more the longer the streak, capped at a week so a lapsed player is
 * never locked out of most of it. Collecting it does not extend the streak;
 * only sitting a case does (services/missions.recordDocketDay).
 */
export function dailyFor(user: Pick<User, 'timezone' | 'lastRewardDay' | 'currentStreak' | 'lastDocketDay'>) {
  const day = dayKey(user.timezone);
  return {
    available: user.lastRewardDay !== day,
    /** Whether a case has been sat today — for the streak reminder. */
    satToday: user.lastDocketDay === day,
    merit: DAILY_BASE + DAILY_STEP * Math.min(7, Math.max(0, user.currentStreak)),
    day,
  };
}

export const DAILY_BASE = 40;
export const DAILY_STEP = 10;

export async function standingFor(user: User): Promise<StandingView> {
  const casesHeard = await prisma.verdictRecord.count({ where: { userId: user.id } });
  const rank = rankFor(user.xp);
  const next = nextRank(user.xp);
  const country = user.currentCountry ?? user.homeCountry;
  const profile = profileFor(country);

  // Where they sit now: an unlocked district, or home. See domain/districts.
  const seat = currentDistrictFor({ ...user, rank: rank.level });

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
    district: seat,
    court: seat ? profile.courtName(user.currentTier, seat) : null,
    daily: dailyFor(user),
    docket: await docketFor(user),
    shields: user.streakShields,
    chiefJustice: chiefJusticeFor(profile, seat ?? country ?? ''),
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

/** A fictional, stable Chief Justice for a seat: an initial and a local surname. */
export function chiefJusticeFor(profile: { texture: { givenNames: string[]; surnames: string[] } }, seat: string): string {
  let h = 2166136261;
  for (let i = 0; i < seat.length; i++) {
    h ^= seat.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const n = Math.abs(h);
  const given = profile.texture.givenNames[n % profile.texture.givenNames.length] ?? 'A';
  const surname = profile.texture.surnames[(n >> 8) % profile.texture.surnames.length] ?? '';
  return `${given.charAt(0)}. ${surname}`.trim();
}
