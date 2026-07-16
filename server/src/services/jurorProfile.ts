import { prisma } from '../lib/prisma.js';
import { GROQ_MODEL, groq } from '../lib/groq.js';

export interface JurorStats {
  convictionRate: number;
  evidenceWeight: number;
  socioeconomicBias: number;
  consistencyScore: number;
  pressureAccuracy: number;
  gutAccuracy: number;
  totalCases: number;
  notablePatterns: string[];
}

/** A verdict delivered with under 10s left is a gut call (GDD 2.5). */
const GUT_THRESHOLD = 10;
const PRESSURE_THRESHOLD = 20;
const POOR_AT = 30;
const WEALTHY_AT = 70;

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

export async function computeJurorStats(userId: string): Promise<JurorStats> {
  const verdicts = await prisma.verdictRecord.findMany({
    where: { userId },
    include: { case: true },
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
      totalCases: stats.totalCases,
    },
    update: {
      convictionRate: stats.convictionRate,
      evidenceWeight: stats.evidenceWeight,
      socioeconomicBias: stats.socioeconomicBias,
      consistencyScore: stats.consistencyScore,
      pressureAccuracy: stats.pressureAccuracy,
      gutAccuracy: stats.gutAccuracy,
      totalCases: stats.totalCases,
    },
  });
}

/** GDD 7.5 — a journalist's paragraph about you, not a stats screen. */
export async function writeJurorProfile(userId: string, jurorName: string): Promise<string> {
  const stats = await computeJurorStats(userId);
  if (stats.totalCases === 0) return 'This juror has not yet heard a case.';

  const acquittals = Math.round(((100 - stats.convictionRate) / 100) * stats.totalCases);

  if (!groq) {
    // Deterministic fallback keeps the same voice when AI is off. This is the
    // shipping path whenever GROQ_API_KEY is unset, so it has to read like
    // prose a journalist filed, not like a template.
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

  const response = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 250,
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content?.trim() ?? 'No profile available.';
}
