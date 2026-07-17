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

/** Local calendar day for the player. Streaks are a human thing, not a UTC thing. */
export function dayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
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

function periodFor(kind: MissionKind): string {
  if (kind === 'daily') return dayKey();
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
  const today = dayKey();
  if (user.lastDocketDay === today) return { streak: user.currentStreak, isNewDay: false };

  const yesterday = dayKey(new Date(Date.now() - 86400000));
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

  for (const def of MISSIONS) {
    const inc = increments[def.key] ?? 0;
    if (inc === 0) continue;

    const period = periodFor(def.kind);
    const existing = await prisma.missionProgress.findUnique({
      where: { userId_key_period: { userId, key: def.key, period } },
    });

    const base = existing?.progress ?? 0;
    const progress = Math.max(0, Math.min(def.target, inc < 0 ? 0 : base + inc));
    const completedAt =
      progress >= def.target ? (existing?.completedAt ?? new Date()) : null;

    await prisma.missionProgress.upsert({
      where: { userId_key_period: { userId, key: def.key, period } },
      create: { userId, key: def.key, kind: def.kind, period, progress, target: def.target, completedAt },
      update: { progress, completedAt },
    });
  }
}

export interface MissionView extends MissionDef {
  progress: number;
  complete: boolean;
  claimed: boolean;
}

export async function missionsFor(userId: string): Promise<MissionView[]> {
  const periods = [dayKey(), weekKey(), 'career'];
  const rows = await prisma.missionProgress.findMany({
    where: { userId, period: { in: periods } },
  });

  return MISSIONS.map((def) => {
    const row = rows.find((r) => r.key === def.key && r.period === periodFor(def.kind));
    const progress = row?.progress ?? 0;
    return {
      ...def,
      progress,
      complete: progress >= def.target,
      claimed: row?.claimed ?? false,
    };
  });
}

/** Claim a finished mission's XP. Idempotent — a mission pays once. */
export async function claimMission(userId: string, key: string): Promise<number> {
  const def = MISSIONS.find((m) => m.key === key);
  if (!def) return 0;

  const period = periodFor(def.kind);
  const row = await prisma.missionProgress.findUnique({
    where: { userId_key_period: { userId, key, period } },
  });

  if (!row || row.claimed || row.progress < def.target) return 0;

  await prisma.missionProgress.update({
    where: { id: row.id },
    data: { claimed: true },
  });

  return def.xp;
}
