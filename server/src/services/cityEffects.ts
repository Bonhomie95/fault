import {
  CITY_METRIC_KEYS,
  type CityMetricKey,
  type CityMetrics,
} from '../domain/city.js';

export type EffectKey =
  | 'convict_wealthy'
  | 'acquit_poor'
  | 'convict_weak_evidence'
  | 'acquit_strong_evidence'
  | 'hung_verdict'
  | 'convict_organised_crime'
  | 'acquit_organised_crime'
  | 'standard_convict'
  | 'standard_acquit';

type Deltas = Partial<Record<CityMetricKey, number>>;

/** GDD 7.3. Every verdict moves the city; nothing is neutral. */
export const VERDICT_EFFECTS: Record<EffectKey, Deltas> = {
  convict_wealthy: { wealthDisparity: -2, judicialTrust: +3 },
  acquit_poor: { judicialTrust: +2, crimeRate: +1 },
  convict_weak_evidence: { policeIntegrity: -3, judicialTrust: -2 },
  acquit_strong_evidence: { judicialTrust: -4, mediaPressure: +5 },
  hung_verdict: { judicialTrust: -4, mediaPressure: +5 },
  convict_organised_crime: { organizedCrimePower: -3, policeIntegrity: +2 },
  acquit_organised_crime: { organizedCrimePower: +4, mediaPressure: +6 },
  standard_convict: { crimeRate: -1, judicialTrust: +1 },
  standard_acquit: { crimeRate: +1 },
};

export interface EffectContext {
  verdict: 'guilty' | 'not_guilty';
  wasHung: boolean;
  defendantWealth: number;
  /** -1 fully favours defence .. +1 fully favours prosecution. */
  evidenceStrength: number;
  organisedCrimeAdjacent: boolean;
}

const WEALTHY_AT = 70;
const POOR_AT = 30;
/** Below this, the prosecution simply had not proved its case. */
const WEAK_EVIDENCE = 0.25;
const STRONG_EVIDENCE = 0.6;

/**
 * Picks the single most narratively significant effect for a verdict.
 * Order matters: a hung verdict is always a hung verdict, and organised crime
 * outranks the class read, because the Syndicate noticing you is the louder
 * event in the city.
 */
export function deriveEffectKey(ctx: EffectContext): EffectKey {
  if (ctx.wasHung) return 'hung_verdict';

  const convicted = ctx.verdict === 'guilty';

  if (ctx.organisedCrimeAdjacent) {
    return convicted ? 'convict_organised_crime' : 'acquit_organised_crime';
  }

  if (convicted) {
    if (ctx.evidenceStrength < WEAK_EVIDENCE) return 'convict_weak_evidence';
    if (ctx.defendantWealth >= WEALTHY_AT) return 'convict_wealthy';
    return 'standard_convict';
  }

  if (ctx.evidenceStrength >= STRONG_EVIDENCE) return 'acquit_strong_evidence';
  if (ctx.defendantWealth <= POOR_AT) return 'acquit_poor';
  return 'standard_acquit';
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/**
 * Applies deltas to the six numeric dials only, clamped to 0-100.
 * Non-metric fields (activeFactions) are deliberately untouched.
 */
export function applyCityEffect(city: CityMetrics, key: EffectKey): CityMetrics {
  const deltas = VERDICT_EFFECTS[key] ?? {};
  const next = { ...city };

  for (const metric of CITY_METRIC_KEYS) {
    next[metric] = clamp(city[metric] + (deltas[metric] ?? 0));
  }

  return next;
}

/**
 * GDD 4.2 — city state decides what kind of case arrives next.
 * First match wins; the city has one dominant anxiety at a time.
 */
export function deriveCaseMood(city: CityMetrics): string {
  if (city.organizedCrimePower > 70)
    return 'witness intimidation likely, defence implausibly clean';
  if (city.policeIntegrity < 30)
    return 'planted evidence plausible, prosecution overreaching';
  if (city.wealthDisparity > 75)
    return 'class dynamics central, evidence access unequal';
  if (city.mediaPressure > 60)
    return 'public narrative matters, defendant is polarising figure';
  return 'standard adversarial case';
}

/**
 * Factions surface once the city is extreme enough to organise around
 * something. They are read by the generator as narrative pressure.
 */
export function deriveFactions(city: CityMetrics): string[] {
  const factions: string[] = [];
  if (city.organizedCrimePower > 60) factions.push('The Syndicate');
  if (city.judicialTrust < 35) factions.push('Reform Movement');
  if (city.mediaPressure > 65) factions.push('The Press Gallery');
  if (city.policeIntegrity < 35) factions.push('Internal Affairs');
  if (city.wealthDisparity > 70) factions.push('DA Office');
  return factions;
}
