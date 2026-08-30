import type { MissionKind } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

/**
 * Reasons to come back.
 *
 * The hard constraint: a mission must never tell you what verdict to reach.
 * "Convict three defendants" would be the game paying you to prejudge, which
 * is the exact failure the whole design is about. So every objective here is
 * about *service and attention* — turning up, reading, deliberating, sitting
 * with the consequences — and never about the direction of a verdict or
 * whether it turned out to be right.
 *
 * That constraint is what makes these missions safe to reward.
 */

export interface MissionDef {
  key: string;
  kind: MissionKind;
  title: string;
  description: string;
  target: number;
  xp: number;
}

export const MISSIONS: MissionDef[] = [
  // ---- daily ----
  {
    key: 'daily_hear_three',
    kind: 'daily',
    title: 'Sit the day’s docket',
    description: 'Hear three cases today.',
    target: 3,
    xp: 60,
  },
  {
    key: 'daily_deliberate',
    kind: 'daily',
    title: 'Read before you decide',
    description: 'Deliver two verdicts having used most of the clock.',
    target: 2,
    xp: 50,
  },
  {
    key: 'daily_no_hung',
    kind: 'daily',
    title: 'Decide it yourself',
    description: 'Hear three cases without letting the clock decide one.',
    target: 3,
    xp: 45,
  },
  // ---- weekly ----
  {
    key: 'weekly_docket',
    kind: 'weekly',
    title: 'A week on the bench',
    description: 'Hear fifteen cases this week.',
    target: 15,
    xp: 260,
  },
  {
    key: 'weekly_examine',
    kind: 'weekly',
    title: 'Handle the evidence',
    description: 'Deliver ten verdicts with the clock still running.',
    target: 10,
    xp: 200,
  },
  // ---- career ----
  {
    key: 'career_hundred',
    kind: 'career',
    title: 'One hundred cases',
    description: 'Hear one hundred cases.',
    target: 100,
    xp: 900,
  },
  {
    key: 'career_consistency',
    kind: 'career',
    title: 'The same facts, the same answer',
    description: 'Hear fifty cases.',
    target: 50,
    xp: 500,
  },
];

/**
 * The player's own calendar day.
 *
 * This used to be `toISOString().slice(0,10)` — UTC — under a comment claiming
 * it was local. It was not, and the consequence was that a juror in Lagos lost
 * their streak at 1am and one in Chicago at 6pm, mid-evening, for no reason
 * they could see. A streak is a promise about days, and a day is where the
 * player is standing.
 *
 * `en-CA` because it formats as YYYY-MM-DD, which is what we store.
 */
export function dayKey(timezone = 'UTC', now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    // An unknown zone should cost the player a correct streak boundary, not
    // their whole verdict.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  }
}

export function weekKey(now = new Date()): string {
  // ISO week — Thursday decides the year.
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Which instance of a mission we are talking about.
 *
 * Daily missions reset at the player's midnight, not UTC's — the same reason
 * streaks do. A player in Lagos should not watch today's docket reset at 1am.
 */
function periodFor(kind: MissionKind, timezone: string): string {
  if (kind === 'daily') return dayKey(timezone);
  if (kind === 'weekly') return weekKey();
  return 'career';
}

/**
 * The streak. Counts days you turned up, and nothing else — not accuracy, not
 * verdicts. Breaking it costs nothing but the number, because a game about
 * regret should not also punish you for having a life.
 */
export async function recordDocketDay(userId: string): Promise<{ streak: number; isNewDay: boolean }> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const today = dayKey(user.timezone);
  if (user.lastDocketDay === today) return { streak: user.currentStreak, isNewDay: false };

  const yesterday = dayKey(user.timezone, new Date(Date.now() - 86400000));
  const streak = user.lastDocketDay === yesterday ? user.currentStreak + 1 : 1;

  await prisma.user.update({
    where: { id: userId },
    data: {
      lastDocketDay: today,
      currentStreak: streak,
      longestStreak: Math.max(streak, user.longestStreak),
      lastSeenAt: new Date(),
    },
  });

  return { streak, isNewDay: true };
}

export interface VerdictSignal {
  verdict: 'guilty' | 'not_guilty';
  wasHung: boolean;
  timeRemaining: number;
  clockSeconds: number;
}

/** Advance whatever this verdict earned. Direction of the verdict is ignored. */
export async function tickMissions(userId: string, signal: VerdictSignal) {
  const { timezone } = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true },
  });
  const used = signal.clockSeconds - signal.timeRemaining;
  const deliberated = !signal.wasHung && used >= signal.clockSeconds / 2;
  const decidedInTime = !signal.wasHung;

  const increments: Record<string, number> = {
    daily_hear_three: 1,
    weekly_docket: 1,
    career_hundred: 1,
    career_consistency: 1,
    daily_deliberate: deliberated ? 1 : 0,
    weekly_examine: decidedInTime ? 1 : 0,
    // Letting the clock decide resets this one rather than advancing it.
    daily_no_hung: signal.wasHung ? -Number.MAX_SAFE_INTEGER : 1,
  };

  // One read for every mission, then one write each — instead of a
  // read-then-write per mission, serially.
  //
  // This loop was doing findUnique + upsert for each of seven missions: up to
  // fifteen sequential round trips inside POST /api/verdict, which was already
  // the heaviest write path in the game at roughly thirty-eight. Each one waits
  // for the last, so it is fifteen network latencies stacked end to end for
  // work that touches at most seven small rows.
  //
  // The reads collapse to a single findMany. The writes stay separate — each
  // upsert has different data — but they go out together rather than in
  // lockstep, so it is one round trip's worth of waiting instead of seven.
  const advancing = MISSIONS.filter((def) => (increments[def.key] ?? 0) !== 0);
  if (advancing.length === 0) return;

  const periods = [...new Set(advancing.map((def) => periodFor(def.kind, timezone)))];

  const existing = await prisma.missionProgress.findMany({
    where: {
      userId,
      key: { in: advancing.map((def) => def.key) },
      period: { in: periods },
    },
  });

  const byKeyPeriod = new Map(existing.map((row) => [`${row.key}:${row.period}`, row]));
  const now = new Date();

  await Promise.all(
    advancing.map((def) => {
      const inc = increments[def.key]!;
      const period = periodFor(def.kind, timezone);
      const prior = byKeyPeriod.get(`${def.key}:${period}`);

      const base = prior?.progress ?? 0;
      const progress = Math.max(0, Math.min(def.target, inc < 0 ? 0 : base + inc));
      const completedAt = progress >= def.target ? (prior?.completedAt ?? now) : null;

      return prisma.missionProgress.upsert({
        where: { userId_key_period: { userId, key: def.key, period } },
        create: { userId, key: def.key, kind: def.kind, period, progress, target: def.target, completedAt },
        update: { progress, completedAt },
      });
    }),
  );
}

export interface MissionView extends MissionDef {
  progress: number;
  complete: boolean;
  claimed: boolean;
}

export async function missionsFor(userId: string): Promise<MissionView[]> {
  const { timezone } = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true },
  });
  const periods = [dayKey(timezone), weekKey(), 'career'];
  const rows = await prisma.missionProgress.findMany({
    where: { userId, period: { in: periods } },
  });

  return MISSIONS.map((def) => {
    const row = rows.find((r) => r.key === def.key && r.period === periodFor(def.kind, timezone));
    const progress = row?.progress ?? 0;
    return {
      ...def,
      progress,
      complete: progress >= def.target,
      claimed: row?.claimed ?? false,
    };
  });
}

/**
 * Claim a finished mission's XP. Idempotent — a mission pays once.
 *
 * The claim is a CONDITIONAL update, not a read-then-write.
 *
 * It used to read the row, check `row.claimed`, then update by id with no
 * condition — so two requests arriving together both passed the check, both
 * wrote `claimed: true`, and both returned `def.xp`. Double pay, from a plain
 * double tap on a flaky connection.
 *
 * The correct pattern was already in this codebase, in tokens.rotateRefresh:
 * make the database do the checking with `updateMany` and a WHERE that
 * includes the condition, then trust `count`. Exactly one caller can win a row
 * that way, because the row can only transition once.
 */
export async function claimMission(userId: string, key: string): Promise<number> {
  const def = MISSIONS.find((m) => m.key === key);
  if (!def) return 0;

  const { timezone } = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true },
  });
  const period = periodFor(def.kind, timezone);

  const claimed = await prisma.missionProgress.updateMany({
    where: {
      userId,
      key,
      period,
      claimed: false,
      // Completeness is part of the condition too, so a claim cannot race a
      // tickMissions that has not yet pushed progress over the line.
      progress: { gte: def.target },
    },
    data: { claimed: true },
  });

  // Zero rows means: no such mission instance, not finished yet, or somebody
  // else already took it. All three are "nothing to claim" from here.
  return claimed.count === 1 ? def.xp : 0;
}

/**
 * Put a claim back.
 *
 * Only for the caller that took it and then failed to pay out — see the
 * mission claim route. Claiming marks the row before the XP is awarded, so a
 * failure between those two steps leaves a mission that says "paid" and a
 * player who was not. This is the compensation for that, and it is deliberately
 * not exported as anything more general: unclaiming a mission somebody WAS paid
 * for is a duplication bug wearing a helpful name.
 */
export async function unclaimMission(userId: string, key: string): Promise<void> {
  const def = MISSIONS.find((m) => m.key === key);
  if (!def) return;

  const { timezone } = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true },
  });

  await prisma.missionProgress.updateMany({
    where: { userId, key, period: periodFor(def.kind, timezone), claimed: true },
    data: { claimed: false },
  });
}
