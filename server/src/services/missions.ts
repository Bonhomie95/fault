import type { MissionKind } from '@prisma/client';
import { rankFor } from '../domain/progression.js';
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
  /** Merit paid on claim, alongside the XP. */
  merit: number;
  /** Not offered below this rank — a mission about districts needs districts. */
  minRank?: number;
  /**
   * How this verdict moves the mission.
   *
   *   'add'    progress += n
   *   'max'    progress = max(progress, n)   — milestones like "reach rank 5"
   *   'streak' progress += n, but n === 0 resets to 0 — "in a row" missions
   */
  mode?: 'add' | 'max' | 'streak';
  /** What this verdict is worth to the mission. Never reads correctness. */
  count: (s: MissionSignal) => number;
}

/**
 * Everything a mission is allowed to know about a verdict.
 *
 * Read the list for what is NOT here: whether the verdict was right. Missions
 * reward how a juror SITS — reading the file, not letting the clock decide,
 * taking harder rooms, holding a city together — and never which way they
 * voted or whether it matched the truth. A mission that paid for right answers
 * would teach the player to hunt the answer instead of weigh the evidence.
 */
export interface MissionSignal {
  wasHung: boolean;
  timeRemaining: number;
  clockSeconds: number;
  /** violent | financial | systemic | passion */
  mood?: string;
  /** Exhibits opened before the verdict, 0..3. Reported by the client. */
  examined?: number;
  /** Witnesses read, 0..2. Reported by the client. */
  witnesses?: number;
  /** Whether the arguments tab was read. */
  arguments?: boolean;
  /** The district difficulty the case was heard in, 1..5. */
  difficulty?: number;
  /** A returning face was in the case. */
  echo?: boolean;
  /** The city's dials after the verdict. */
  city?: { crimeRate: number; judicialTrust: number; organizedCrimePower: number; policeIntegrity: number };
  rank?: number;
  streak?: number;
  districtsOpen?: number;
}

const decided = (s: MissionSignal) => !s.wasHung;
const used = (s: MissionSignal) => s.clockSeconds - s.timeRemaining;
const fullFile = (s: MissionSignal) =>
  decided(s) && (s.examined ?? 0) >= 3 && (s.witnesses ?? 0) >= 2 && Boolean(s.arguments);

/**
 * The DAILY pool. Three are drawn per player per day (see activeKeys), so two
 * players rarely have the same three and nobody has the same three twice in a
 * row. Keys are stable forever — progress rows are keyed by them.
 */
export const DAILY: MissionDef[] = [
  { key: 'daily_hear_three', kind: 'daily', title: 'Sit the day’s docket', description: 'Hear three cases today.', target: 3, xp: 60, merit: 30, count: () => 1 },
  { key: 'daily_hear_five', kind: 'daily', title: 'A long day in court', description: 'Hear five cases today.', target: 5, xp: 110, merit: 60, minRank: 3, count: () => 1 },
  { key: 'daily_deliberate', kind: 'daily', title: 'Read before you decide', description: 'Deliver two verdicts having used at least half the clock.', target: 2, xp: 50, merit: 25, count: (s) => (decided(s) && used(s) >= s.clockSeconds / 2 ? 1 : 0) },
  { key: 'daily_no_hung', kind: 'daily', title: 'Decide it yourself', description: 'Hear three cases in a row without letting the clock decide one.', target: 3, xp: 45, merit: 25, mode: 'streak', count: (s) => (s.wasHung ? 0 : 1) },
  { key: 'daily_examine_all', kind: 'daily', title: 'Handle every exhibit', description: 'Open all three exhibits before deciding, twice.', target: 2, xp: 55, merit: 30, count: (s) => (decided(s) && (s.examined ?? 0) >= 3 ? 1 : 0) },
  { key: 'daily_hear_witnesses', kind: 'daily', title: 'Hear them both out', description: 'Read both witnesses before deciding, twice.', target: 2, xp: 50, merit: 25, count: (s) => (decided(s) && (s.witnesses ?? 0) >= 2 ? 1 : 0) },
  { key: 'daily_arguments', kind: 'daily', title: 'Let counsel speak', description: 'Read the closing arguments before two verdicts.', target: 2, xp: 40, merit: 20, count: (s) => (decided(s) && s.arguments ? 1 : 0) },
  { key: 'daily_full_file', kind: 'daily', title: 'The whole file', description: 'Read every exhibit, both witnesses and the arguments — then decide.', target: 1, xp: 70, merit: 40, count: (s) => (fullFile(s) ? 1 : 0) },
  { key: 'daily_with_time', kind: 'daily', title: 'A steady hand', description: 'Decide three cases with at least twenty seconds to spare.', target: 3, xp: 45, merit: 20, count: (s) => (decided(s) && s.timeRemaining >= 20 ? 1 : 0) },
  { key: 'daily_nerve', kind: 'daily', title: 'Nerve', description: 'Decide a case in its final fifteen seconds — without letting it hang.', target: 1, xp: 55, merit: 30, count: (s) => (decided(s) && s.timeRemaining <= 15 ? 1 : 0) },
  { key: 'daily_violent', kind: 'daily', title: 'Blood on the file', description: 'Hear a case of violence.', target: 1, xp: 40, merit: 20, count: (s) => (s.mood === 'violent' ? 1 : 0) },
  { key: 'daily_financial', kind: 'daily', title: 'Follow the money', description: 'Hear a financial case.', target: 1, xp: 40, merit: 20, count: (s) => (s.mood === 'financial' ? 1 : 0) },
  { key: 'daily_systemic', kind: 'daily', title: 'The system on trial', description: 'Hear a case about power and institutions.', target: 1, xp: 40, merit: 20, count: (s) => (s.mood === 'systemic' ? 1 : 0) },
  { key: 'daily_passion', kind: 'daily', title: 'Crimes of the heart', description: 'Hear a crime of passion.', target: 1, xp: 40, merit: 20, count: (s) => (s.mood === 'passion' ? 1 : 0) },
  { key: 'daily_away_court', kind: 'daily', title: 'Travelling juror', description: 'Hear two cases outside your home district.', target: 2, xp: 70, merit: 45, minRank: 3, count: (s) => ((s.difficulty ?? 1) > 1 ? 1 : 0) },
  { key: 'daily_hard_room', kind: 'daily', title: 'The hard room', description: 'Hear a case in a district rated Hard or worse.', target: 1, xp: 90, merit: 55, minRank: 6, count: (s) => ((s.difficulty ?? 1) >= 4 ? 1 : 0) },
  { key: 'daily_crime_watch', kind: 'daily', title: 'Hold the line', description: 'Deliver two verdicts while city crime is below 50.', target: 2, xp: 60, merit: 30, count: (s) => (decided(s) && (s.city?.crimeRate ?? 100) < 50 ? 1 : 0) },
  { key: 'daily_trust', kind: 'daily', title: 'A court people believe', description: 'Deliver two verdicts while judicial trust is 50 or higher.', target: 2, xp: 60, merit: 30, count: (s) => (decided(s) && (s.city?.judicialTrust ?? 0) >= 50 ? 1 : 0) },
  { key: 'daily_echo', kind: 'daily', title: 'A face you know', description: 'Sit a case where someone from your past docket returns.', target: 1, xp: 80, merit: 40, minRank: 3, count: (s) => (s.echo ? 1 : 0) },
];

export const WEEKLY: MissionDef[] = [
  { key: 'weekly_docket', kind: 'weekly', title: 'A week on the bench', description: 'Hear fifteen cases this week.', target: 15, xp: 260, merit: 150, count: () => 1 },
  { key: 'weekly_examine', kind: 'weekly', title: 'Handle the evidence', description: 'Deliver ten verdicts with the clock still running.', target: 10, xp: 200, merit: 120, count: (s) => (decided(s) ? 1 : 0) },
  { key: 'weekly_full_file', kind: 'weekly', title: 'Thorough', description: 'Read the whole file before deciding, five times this week.', target: 5, xp: 240, merit: 140, count: (s) => (fullFile(s) ? 1 : 0) },
  { key: 'weekly_no_hung', kind: 'weekly', title: 'Ten clean verdicts', description: 'Ten cases in a row with no hung verdict.', target: 10, xp: 250, merit: 150, mode: 'streak', count: (s) => (s.wasHung ? 0 : 1) },
  { key: 'weekly_crime', kind: 'weekly', title: 'Clean streets', description: 'Deliver six verdicts while crime is below 45.', target: 6, xp: 280, merit: 170, count: (s) => (decided(s) && (s.city?.crimeRate ?? 100) < 45 ? 1 : 0) },
  { key: 'weekly_syndicate', kind: 'weekly', title: 'Break the Syndicate', description: 'Deliver five verdicts while organised crime is below 50.', target: 5, xp: 280, merit: 170, minRank: 3, count: (s) => (decided(s) && (s.city?.organizedCrimePower ?? 100) < 50 ? 1 : 0) },
  { key: 'weekly_police', kind: 'weekly', title: 'Clean hands', description: 'Deliver five verdicts while police integrity is 55 or higher.', target: 5, xp: 260, merit: 160, minRank: 3, count: (s) => (decided(s) && (s.city?.policeIntegrity ?? 0) >= 55 ? 1 : 0) },
  { key: 'weekly_tour', kind: 'weekly', title: 'Circuit judge', description: 'Hear six cases outside your home district.', target: 6, xp: 320, merit: 200, minRank: 3, count: (s) => ((s.difficulty ?? 1) > 1 ? 1 : 0) },
  { key: 'weekly_hard', kind: 'weekly', title: 'Notorious', description: 'Hear three cases in a Notorious district.', target: 3, xp: 400, merit: 260, minRank: 8, count: (s) => ((s.difficulty ?? 1) >= 5 ? 1 : 0) },
  { key: 'weekly_every_kind', kind: 'weekly', title: 'Every kind of case', description: 'Hear two cases of violence and two financial cases.', target: 4, xp: 220, merit: 130, count: (s) => (s.mood === 'violent' || s.mood === 'financial' ? 1 : 0) },
  { key: 'weekly_steady', kind: 'weekly', title: 'Unhurried', description: 'Decide eight cases with at least half the clock used.', target: 8, xp: 230, merit: 140, count: (s) => (decided(s) && used(s) >= s.clockSeconds / 2 ? 1 : 0) },
];

/**
 * CAREER: milestones, always visible, paid once, never rotated.
 */
export const CAREER: MissionDef[] = [
  { key: 'career_first', kind: 'career', title: 'Sworn in', description: 'Deliver your first verdict.', target: 1, xp: 50, merit: 100, count: () => 1 },
  { key: 'career_ten', kind: 'career', title: 'Ten cases', description: 'Hear ten cases.', target: 10, xp: 150, merit: 200, count: () => 1 },
  { key: 'career_twentyfive', kind: 'career', title: 'Regular', description: 'Hear twenty-five cases.', target: 25, xp: 300, merit: 300, count: () => 1 },
  { key: 'career_consistency', kind: 'career', title: 'Fifty cases', description: 'Hear fifty cases.', target: 50, xp: 500, merit: 450, count: () => 1 },
  { key: 'career_hundred', kind: 'career', title: 'One hundred cases', description: 'Hear one hundred cases.', target: 100, xp: 900, merit: 800, count: () => 1 },
  { key: 'career_twofifty', kind: 'career', title: 'Institution', description: 'Hear two hundred and fifty cases.', target: 250, xp: 1800, merit: 1500, count: () => 1 },
  { key: 'career_fivehundred', kind: 'career', title: 'Part of the building', description: 'Hear five hundred cases.', target: 500, xp: 3500, merit: 3000, count: () => 1 },
  { key: 'career_rank3', kind: 'career', title: 'Seasoned', description: 'Reach rank 3.', target: 3, xp: 0, merit: 200, mode: 'max', count: (s) => s.rank ?? 0 },
  { key: 'career_rank5', kind: 'career', title: 'Presiding', description: 'Reach rank 5.', target: 5, xp: 0, merit: 400, mode: 'max', count: (s) => s.rank ?? 0 },
  { key: 'career_rank8', kind: 'career', title: 'Senior bench', description: 'Reach rank 8.', target: 8, xp: 0, merit: 800, mode: 'max', count: (s) => s.rank ?? 0 },
  { key: 'career_rank12', kind: 'career', title: 'Chief Juror', description: 'Reach the top rank.', target: 12, xp: 0, merit: 2000, mode: 'max', count: (s) => s.rank ?? 0 },
  { key: 'career_streak7', kind: 'career', title: 'A week of service', description: 'Sit cases seven days in a row.', target: 7, xp: 300, merit: 350, mode: 'max', count: (s) => s.streak ?? 0 },
  { key: 'career_streak30', kind: 'career', title: 'A month of service', description: 'Sit cases thirty days in a row.', target: 30, xp: 1200, merit: 1500, mode: 'max', count: (s) => s.streak ?? 0 },
  { key: 'career_districts3', kind: 'career', title: 'Three courts', description: 'Open three districts.', target: 3, xp: 200, merit: 300, mode: 'max', count: (s) => s.districtsOpen ?? 1 },
  { key: 'career_districts5', kind: 'career', title: 'The whole map', description: 'Open five districts.', target: 5, xp: 600, merit: 700, mode: 'max', count: (s) => s.districtsOpen ?? 1 },
  { key: 'career_full_file_25', kind: 'career', title: 'Never skim', description: 'Read the whole file before deciding, 25 times.', target: 25, xp: 500, merit: 500, count: (s) => (fullFile(s) ? 1 : 0) },
  { key: 'career_clean_25', kind: 'career', title: 'Twenty-five clean', description: 'Twenty-five cases in a row without a hung verdict.', target: 25, xp: 600, merit: 600, mode: 'streak', count: (s) => (s.wasHung ? 0 : 1) },
  { key: 'career_hard_10', kind: 'career', title: 'Hard rooms', description: 'Hear ten cases in Hard or Notorious districts.', target: 10, xp: 700, merit: 800, minRank: 6, count: (s) => ((s.difficulty ?? 1) >= 4 ? 1 : 0) },
  { key: 'career_echoes', kind: 'career', title: 'They come back', description: 'Face five returning names.', target: 5, xp: 400, merit: 450, count: (s) => (s.echo ? 1 : 0) },
];

export const MISSIONS: MissionDef[] = [...DAILY, ...WEEKLY, ...CAREER];
const BY_KEY = new Map(MISSIONS.map((m) => [m.key, m]));

export const DAILY_OFFERED = 3;
export const WEEKLY_OFFERED = 2;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A seeded draw of `n` from a pool, stable for this player and period. */
function draw(pool: MissionDef[], n: number, seed: string, rank: number): MissionDef[] {
  const eligible = pool.filter((m) => (m.minRank ?? 1) <= rank);
  return [...eligible]
    .map((m) => ({ m, k: hash(`${seed}:${m.key}`) }))
    .sort((a, b) => a.k - b.k)
    .slice(0, n)
    .map((x) => x.m);
}

/**
 * The missions on offer to this player right now.
 *
 * The first daily is always "sit the day's docket" — every day should have one
 * mission a player can finish just by playing. The rest are drawn.
 */
export function activeMissions(userId: string, rank: number, day: string, week: string): MissionDef[] {
  const anchor = BY_KEY.get('daily_hear_three')!;
  const dailies = [
    anchor,
    ...draw(DAILY.filter((m) => m !== anchor), DAILY_OFFERED - 1, `${userId}:${day}`, rank),
  ];
  const weeklies = draw(WEEKLY, WEEKLY_OFFERED, `${userId}:${week}`, rank);
  return [...dailies, ...weeklies, ...CAREER.filter((m) => (m.minRank ?? 1) <= rank)];
}

export function missionMerit(key: string): number {
  return BY_KEY.get(key)?.merit ?? 0;
}

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
 *
 * Streak shields cover missed days: one per day, spent automatically, and
 * only if there are enough to cover the WHOLE gap — a shield that saved three
 * days of a five-day absence would be spent for nothing.
 */
export async function recordDocketDay(
  userId: string,
): Promise<{ streak: number; isNewDay: boolean; shieldsUsed: number }> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const today = dayKey(user.timezone);
  if (user.lastDocketDay === today) return { streak: user.currentStreak, isNewDay: false, shieldsUsed: 0 };

  const missed = user.lastDocketDay ? daysBetween(user.lastDocketDay, today) - 1 : 0;
  const shieldsUsed = missed > 0 && missed <= user.streakShields ? missed : 0;
  const kept = user.lastDocketDay !== null && (missed === 0 || shieldsUsed > 0);
  const streak = kept ? user.currentStreak + 1 : 1;

  await prisma.user.update({
    where: { id: userId },
    data: {
      lastDocketDay: today,
      currentStreak: streak,
      longestStreak: Math.max(streak, user.longestStreak),
      lastSeenAt: new Date(),
      ...(shieldsUsed ? { streakShields: { decrement: shieldsUsed } } : {}),
    },
  });

  return { streak, isNewDay: true, shieldsUsed };
}

/** Whole days from one YYYY-MM-DD to another. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** What the verdict route passes in. */
export type VerdictSignal = MissionSignal & { verdict: 'guilty' | 'not_guilty' };

export async function tickMissions(userId: string, signal: VerdictSignal) {
  const { timezone, xp } = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true, xp: true },
  });
  const rank = signal.rank ?? rankFor(xp).level;
  const active = activeMissions(userId, rank, dayKey(timezone), weekKey());

  const moves = active
    .map((def) => ({ def, n: def.count({ ...signal, rank }) }))
    .filter(({ def, n }) => n !== 0 || def.mode === 'streak');
  if (moves.length === 0) return;

  const periods = [...new Set(moves.map(({ def }) => periodFor(def.kind, timezone)))];
  const existing = await prisma.missionProgress.findMany({
    where: { userId, key: { in: moves.map(({ def }) => def.key) }, period: { in: periods } },
  });
  const byKeyPeriod = new Map(existing.map((row) => [`${row.key}:${row.period}`, row]));
  const now = new Date();

  await Promise.all(
    moves.map(({ def, n }) => {
      const period = periodFor(def.kind, timezone);
      const prior = byKeyPeriod.get(`${def.key}:${period}`);
      // A finished mission stays finished — a hung verdict after completing
      // "three in a row" does not take the reward back.
      if (prior && prior.progress >= def.target) return Promise.resolve();
      const base = prior?.progress ?? 0;
      const mode = def.mode ?? 'add';
      const next =
        mode === 'max' ? Math.max(base, n) : mode === 'streak' && n === 0 ? 0 : base + n;
      const progress = Math.max(0, Math.min(def.target, next));
      const completedAt = progress >= def.target ? (prior?.completedAt ?? now) : null;
      return prisma.missionProgress.upsert({
        where: { userId_key_period: { userId, key: def.key, period } },
        create: { userId, key: def.key, kind: def.kind, period, progress, target: def.target, completedAt },
        update: { progress, completedAt },
      });
    }),
  );
}

export interface MissionView {
  key: string;
  kind: MissionKind;
  title: string;
  description: string;
  target: number;
  xp: number;
  merit: number;
  progress: number;
  complete: boolean;
  claimed: boolean;
  /** When this mission's period ends, for the countdown on the card. */
  endsAt: string | null;
}

function endOfDayUtc(timezone: string): Date {
  // Good enough for a countdown: the next local midnight, computed by walking
  // forward until the local day key changes.
  const today = dayKey(timezone);
  const t = new Date();
  t.setUTCMinutes(0, 0, 0);
  for (let i = 0; i < 26; i++) {
    t.setUTCHours(t.getUTCHours() + 1);
    if (dayKey(timezone, t) !== today) return t;
  }
  return new Date(Date.now() + 86400000);
}

function endOfWeekUtc(): Date {
  const now = new Date();
  const day = now.getUTCDay() || 7;
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + (8 - day)));
  return end;
}

export async function missionsFor(userId: string): Promise<MissionView[]> {
  const { timezone, xp } = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true, xp: true },
  });
  const day = dayKey(timezone);
  const week = weekKey();
  const active = activeMissions(userId, rankFor(xp).level, day, week);
  const rows = await prisma.missionProgress.findMany({
    where: { userId, period: { in: [day, week, 'career'] } },
  });
  const dayEnd = endOfDayUtc(timezone).toISOString();
  const weekEnd = endOfWeekUtc().toISOString();
  const views = active.map((def) => {
    const row = rows.find((r) => r.key === def.key && r.period === periodFor(def.kind, timezone));
    const progress = row?.progress ?? 0;
    return {
      key: def.key,
      kind: def.kind,
      title: def.title,
      description: def.description,
      target: def.target,
      xp: def.xp,
      merit: def.merit,
      progress,
      complete: progress >= def.target,
      claimed: row?.claimed ?? false,
      endsAt: def.kind === 'daily' ? dayEnd : def.kind === 'weekly' ? weekEnd : null,
    };
  });
  // Career: claimed milestones fall away, and only the next handful show, so
  // the list is a to-do rather than a trophy cabinet.
  const career = views.filter((v) => v.kind === 'career' && !v.claimed);
  const shownCareer = [
    ...career.filter((v) => v.complete),
    ...career.filter((v) => !v.complete).sort((a, b) => b.progress / b.target - a.progress / a.target).slice(0, 4),
  ];
  return [...views.filter((v) => v.kind !== 'career'), ...shownCareer];
}

export async function claimMission(userId: string, key: string): Promise<number> {
  const def = BY_KEY.get(key);
  if (!def) return 0;
  const { timezone } = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true },
  });
  const period = periodFor(def.kind, timezone);
  // Conditional update: two claims arriving together cannot both pay.
  const claimed = await prisma.missionProgress.updateMany({
    where: { userId, key, period, claimed: false, progress: { gte: def.target } },
    data: { claimed: true },
  });
  // Returns XP for compatibility; a milestone with no XP still counts as paid.
  return claimed.count === 1 ? Math.max(1, def.xp) : 0;
}

export async function unclaimMission(userId: string, key: string): Promise<void> {
  const def = BY_KEY.get(key);
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
