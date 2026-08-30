import { prisma } from '../lib/prisma.js';
import { aiEnabled, completeOnce } from '../lib/groq.js';
import { redis } from '../lib/redis.js';
import { biasFor, describeBias, type PresentationChannel } from '../domain/presentation.js';

export interface JurorStats {
  convictionRate: number;
  evidenceWeight: number;
  socioeconomicBias: number;
  consistencyScore: number;
  pressureAccuracy: number;
  gutAccuracy: number;
  /** Positive = convicts unsettling-looking defendants more readily than
   *  disarming ones. The face is the only difference the game controls for. */
  appearanceBias: number;
  /** Positive = convicts defendants who sit closed and defensive more readily. */
  demeanourBias: number;
  /** Positive = convicts the unremarkable; negative = convicts the strange. */
  oddityBias: number;
  totalCases: number;
  notablePatterns: string[];
}

/** A verdict delivered with under 10s left is a gut call (GDD 2.5). */
const GUT_THRESHOLD = 10;
const PRESSURE_THRESHOLD = 20;
const POOR_AT = 30;
const WEALTHY_AT = 70;
/** Faces below this read as unsettling; above it, as disarming. */
const UNSETTLING_AT = 35;
const DISARMING_AT = 65;

const pct = (n: number, d: number) => (d === 0 ? 0 : (n / d) * 100);

/**
 * Was this verdict "right"? Ambiguous cases have no right answer by design
 * (GDD 3.3, cases 31-50), so they are excluded from accuracy rather than
 * scored as failures — the game does not punish you for the unanswerable.
 */
const isAligned = (verdict: string, correct: string) =>
  correct === 'ambiguous' ? null : verdict === correct;

/** "a", "a and b", "a, b, and c" — never "a, and b, and c". */
function listSentence(items: string[]): string {
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * Exactly the columns the maths below touches, and nothing else.
 *
 * This used to be `include: { case: true }` — the whole Case row per verdict,
 * which drags along `evidence` and `witnesses` (JSON blobs holding the full
 * dossier), plus the long-text background, arguments and titles. None of it is
 * read here. At case 200 that is roughly a megabyte of JSON deserialised for a
 * function that wants seven numbers, and computeJurorStats is called on every
 * verdict, again on every case generation, and again on every foreign
 * application — so the cost lands two or three times per case and grows
 * linearly with the length of the career.
 *
 * That is the worst possible performance shape: it punishes your most engaged
 * players and leaves new ones feeling fine, so it never shows up in testing.
 */
const STATS_SELECT = {
  verdict: true,
  timeRemaining: true,
  wasHung: true,
  case: {
    select: {
      evidenceStrength: true,
      defendantWealth: true,
      defendantAppearance: true,
      defendantDemeanour: true,
      defendantOddity: true,
      correctVerdict: true,
      structureKey: true,
    },
  },
} as const;

/**
 * Memoised stats, keyed by how many verdicts they were computed from.
 *
 * Delivering one verdict used to run this whole computation two or three
 * times: once from updateJurorProfile on the verdict itself, once from
 * buildContext when the next case is generated, and once more on any foreign
 * application. Identical input, identical output, three full passes over the
 * career.
 *
 * The key includes the verdict count, which is what makes this safe to cache
 * without any invalidation logic: a new verdict changes the count, so it
 * cannot read a stale entry. There is no path where the count is unchanged and
 * the answer is different — every input to these statistics arrives as a
 * verdict row, and cases are immutable once judged.
 *
 * Redis is an optimisation here and nothing more. A miss, or an outage, costs
 * a recomputation and no correctness.
 */
const STATS_TTL_SECONDS = 15 * 60;
const statsKey = (userId: string, count: number) => `stats:${userId}:${count}`;

export async function computeJurorStats(userId: string): Promise<JurorStats> {
  // One cheap indexed count decides whether the cached answer is still the
  // right answer. Cheaper by far than the scan it guards.
  const count = await prisma.verdictRecord.count({ where: { userId } });

  try {
    const cached = await redis.get(statsKey(userId, count));
    if (cached) return JSON.parse(cached) as JurorStats;
  } catch {
    /* cache is an optimisation, never a dependency */
  }

  const stats = await computeJurorStatsUncached(userId);

  await redis
    .set(statsKey(userId, count), JSON.stringify(stats), 'EX', STATS_TTL_SECONDS)
    .catch(() => {});

  return stats;
}

/** The maths itself, always from the verdict rows. Exported for tests. */
export async function computeJurorStatsUncached(userId: string): Promise<JurorStats> {
  const verdicts = await prisma.verdictRecord.findMany({
    where: { userId },
    select: STATS_SELECT,
    orderBy: { createdAt: 'asc' },
  });

  const total = verdicts.length;
  if (total === 0) {
    return {
      convictionRate: 0,
      evidenceWeight: 0,
      socioeconomicBias: 0,
      consistencyScore: 0,
      pressureAccuracy: 0,
      gutAccuracy: 0,
      appearanceBias: 0,
      demeanourBias: 0,
      oddityBias: 0,
      totalCases: 0,
      notablePatterns: [],
    };
  }

  const convictions = verdicts.filter((v) => v.verdict === 'guilty').length;

  // evidence_weight: how often the verdict followed the stronger evidence.
  let evidenceMatched = 0;
  let evidenceScored = 0;
  for (const v of verdicts) {
    const strength = v.case.evidenceStrength;
    if (Math.abs(strength) < 0.2) continue; // genuinely balanced — nothing to follow
    evidenceScored++;
    const leansGuilty = strength > 0;
    if ((v.verdict === 'guilty') === leansGuilty) evidenceMatched++;
  }

  // socioeconomic_bias: conviction rate on poor defendants minus conviction
  // rate on wealthy ones. Positive = harder on the poor. Range -100..100.
  const poor = verdicts.filter((v) => v.case.defendantWealth <= POOR_AT);
  const wealthy = verdicts.filter((v) => v.case.defendantWealth >= WEALTHY_AT);
  const poorConvictionRate = pct(poor.filter((v) => v.verdict === 'guilty').length, poor.length);
  const wealthyConvictionRate = pct(wealthy.filter((v) => v.verdict === 'guilty').length, wealthy.length);
  const socioeconomicBias =
    poor.length === 0 || wealthy.length === 0 ? 0 : poorConvictionRate - wealthyConvictionRate;

  // The three presentation channels, measured by ONE function.
  //
  // appearance used to have its own inline calculation here. Now that there
  // are three of them, sharing `biasFor` is not tidiness — it is the only way
  // to be sure the face, the body and the strangeness are scored on identical
  // terms. Three hand-rolled versions would drift, and a drifted channel is a
  // finding the Juror Record states about somebody that is not true.
  //
  // All three are rolled blind to the verdict at generation (see
  // domain/presentation), so any gap here is the juror and not the docket.
  const channel = (pick: (c: (typeof verdicts)[number]['case']) => number) =>
    verdicts.map((v) => ({ convicted: v.verdict === 'guilty', value: pick(v.case) }));

  const appearanceBias = biasFor(channel((c) => c.defendantAppearance), 'appearance');
  const demeanourBias = biasFor(channel((c) => c.defendantDemeanour), 'demeanour');
  const oddityBias = biasFor(channel((c) => c.defendantOddity), 'oddity');

  // consistency: same structure in, same verdict out (GDD 2.5).
  const byStructure = new Map<string, string[]>();
  for (const v of verdicts) {
    const key = v.case.structureKey;
    if (!key) continue;
    const list = byStructure.get(key) ?? [];
    list.push(v.verdict);
    byStructure.set(key, list);
  }
  let pairs = 0;
  let agreed = 0;
  for (const list of byStructure.values()) {
    if (list.length < 2) continue;
    pairs++;
    if (list.every((x) => x === list[0])) agreed++;
  }
  // With no probe pairs delivered yet, consistency is unmeasured, not zero.
  const consistencyScore = pairs === 0 ? 100 : pct(agreed, pairs);

  const accuracyOf = (subset: typeof verdicts) => {
    let hit = 0;
    let scored = 0;
    for (const v of subset) {
      const aligned = isAligned(v.verdict, v.case.correctVerdict);
      if (aligned === null) continue;
      scored++;
      if (aligned) hit++;
    }
    return pct(hit, scored);
  };

  const pressureAccuracy = accuracyOf(verdicts.filter((v) => v.timeRemaining <= PRESSURE_THRESHOLD));
  const gutAccuracy = accuracyOf(verdicts.filter((v) => v.timeRemaining <= GUT_THRESHOLD));

  // Every pattern is a verb phrase agreeing with "this juror ...", so they can
  // be listed straight into a sentence without reading like a stat dump.
  const notablePatterns: string[] = [];
  const hung = verdicts.filter((v) => v.wasHung).length;
  if (hung > 0)
    notablePatterns.push(`left ${hung} verdict${hung === 1 ? '' : 's'} to the clock`);
  if (socioeconomicBias > 20) notablePatterns.push('convicts poor defendants more readily');
  if (socioeconomicBias < -20) notablePatterns.push('convicts wealthy defendants more readily');
  for (const [name, score] of [
    ['appearance', appearanceBias],
    ['demeanour', demeanourBias],
    ['oddity', oddityBias],
  ] as [PresentationChannel, number][]) {
    const line = describeBias(name, score);
    if (line) notablePatterns.push(line);
  }
  if (pairs > 0 && consistencyScore < 60)
    notablePatterns.push('gives different verdicts to structurally identical cases');
  const overall = accuracyOf(verdicts);
  if (gutAccuracy > overall + 10) notablePatterns.push('is more accurate under time pressure');
  if (gutAccuracy < overall - 10 && gutAccuracy > 0)
    notablePatterns.push('is less accurate under time pressure');

  return {
    convictionRate: pct(convictions, total),
    evidenceWeight: pct(evidenceMatched, evidenceScored),
    socioeconomicBias,
    consistencyScore,
    pressureAccuracy,
    gutAccuracy,
    appearanceBias,
    demeanourBias,
    oddityBias,
    totalCases: total,
    notablePatterns,
  };
}

/**
 * The bias the next case should probe (GDD 2.5). The generator aims at
 * whatever the player is worst at — the game plays the player back.
 */
export function weakestBias(stats: JurorStats): string {
  if (stats.totalCases < 3) return 'unknown — still reading this juror';
  if (Math.abs(stats.appearanceBias) > 25)
    return stats.appearanceBias > 0
      ? 'is swayed by the defendant’s face — convicts those who look unsettling'
      : 'is swayed by the defendant’s face — spares those who look unsettling';
  if (Math.abs(stats.socioeconomicBias) > 20)
    return stats.socioeconomicBias > 0
      ? 'convicts poor defendants more readily than wealthy ones'
      : 'convicts wealthy defendants more readily than poor ones';
  if (stats.consistencyScore < 60) return 'inconsistent across structurally identical cases';
  if (stats.evidenceWeight < 50) return 'verdicts drift away from the stronger evidence';
  if (stats.convictionRate > 75) return 'convicts by default';
  if (stats.convictionRate < 25) return 'acquits by default';
  return 'no dominant bias — probe the margins';
}

export async function updateJurorProfile(userId: string) {
  const stats = await computeJurorStats(userId);

  return prisma.jurorProfile.upsert({
    where: { userId },
    create: {
      userId,
      convictionRate: stats.convictionRate,
      evidenceWeight: stats.evidenceWeight,
      socioeconomicBias: stats.socioeconomicBias,
      consistencyScore: stats.consistencyScore,
      pressureAccuracy: stats.pressureAccuracy,
      gutAccuracy: stats.gutAccuracy,
      appearanceBias: stats.appearanceBias,
      demeanourBias: stats.demeanourBias,
      oddityBias: stats.oddityBias,
      totalCases: stats.totalCases,
    },
    update: {
      convictionRate: stats.convictionRate,
      evidenceWeight: stats.evidenceWeight,
      socioeconomicBias: stats.socioeconomicBias,
      consistencyScore: stats.consistencyScore,
      pressureAccuracy: stats.pressureAccuracy,
      gutAccuracy: stats.gutAccuracy,
      appearanceBias: stats.appearanceBias,
      demeanourBias: stats.demeanourBias,
      oddityBias: stats.oddityBias,
      totalCases: stats.totalCases,
    },
  });
}

/**
 * The same paragraph, written without a model.
 *
 * Pulled out of writeJurorProfile so it can serve as a real fallback rather
 * than only as the no-key path. It is the shipping voice whenever generation
 * is unavailable — a spent pool, a timeout, a bad response — and the previous
 * behaviour in those cases was to return the string "No profile available." on
 * a screen whose entire reason to exist is a paragraph about the player.
 */
function deterministicProfile(jurorName: string, stats: JurorStats): string {
  const acquittals = Math.round(((100 - stats.convictionRate) / 100) * stats.totalCases);
  const leaning =
    stats.convictionRate > 60
      ? 'convict more often than not' // agrees with the plural "They"
      : stats.convictionRate < 40
        ? 'acquit more often than not'
        : 'split evenly between conviction and acquittal';

  return [
    `Juror ${jurorName} has presided over ${stats.totalCases} case${stats.totalCases === 1 ? '' : 's'}, with a conviction rate of ${Math.round(stats.convictionRate)}%.`,
    `They ${leaning}, and have acquitted ${acquittals} defendant${acquittals === 1 ? '' : 's'}.`,
    stats.notablePatterns.length > 0
      ? `Court records note that this juror ${listSentence(stats.notablePatterns)}.`
      : 'Court records note no irregularity in their reasoning.',
  ].join(' ');
}

/** GDD 7.5 — a journalist's paragraph about you, not a stats screen. */
export async function writeJurorProfile(userId: string, jurorName: string): Promise<string> {
  const stats = await computeJurorStats(userId);
  if (stats.totalCases === 0) return 'This juror has not yet heard a case.';

  if (!aiEnabled) return deterministicProfile(jurorName, stats);

  const prompt = `
Write a 3-sentence factual profile of a juror based on these statistics.
Write in third person, newspaper style, no praise or criticism, no moralising.
Juror name: ${jurorName}
Conviction rate: ${Math.round(stats.convictionRate)}%
Cases heard: ${stats.totalCases}
Socioeconomic bias score: ${Math.round(stats.socioeconomicBias)} (positive = more likely to convict poor defendants)
Evidence alignment: ${Math.round(stats.evidenceWeight)}% (how often verdict matched stronger evidence)
Notable: ${stats.notablePatterns.join(', ') || 'none'}
Return only the profile text, no other content.
`.trim();

  // Through the pool. This used to call `groq` — keys[0] — directly, so the
  // written profile stopped working the moment the first key hit its daily cap
  // even though four others were idle.
  //
  // On failure it falls back to the deterministic writer rather than to "No
  // profile available.", which was the old behaviour and is a strange thing to
  // show on a screen whose entire purpose is a paragraph about the player.
  const written = await completeOnce({ prompt, maxTokens: 250, temperature: 0.7 });
  return written ?? deterministicProfile(jurorName, stats);
}
