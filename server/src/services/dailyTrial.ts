import type { Tier } from '@prisma/client';
import { generatedCaseSchema, type GeneratedCase } from '../domain/case.js';
import { genericProfile, profileFor } from '../domain/jurisdiction.js';
import { stripPresentation } from '../domain/presentation.js';
import { log } from '../lib/log.js';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { hashSeed, specialCase, type PlaceContext } from './caseGenerator.js';
import { localizeCase } from './localizeCase.js';
import { SEED_CASES } from './seedCases.js';

/**
 * The Daily Trial.
 *
 * One case a day, the same facts for every juror in the world, told in each
 * juror's own country — their names, their court, their police. After the
 * verdict they see how the world split. That split is opinion, never the
 * answer: the game still does not say who was right.
 *
 * How one case becomes everyone's: it is generated ONCE, somewhere placeless,
 * and then turned into the same slot template the authored docket uses —
 * every name, the court and the police become {D_FULL}, {COURT}, {POLICE} —
 * so localizeCase can move it into any country exactly as it moves the
 * authored cases. If generation fails the day falls back to an authored case,
 * which is already a template.
 */

/** The day, in UTC: everyone's Daily Trial changes at the same instant. */
export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

const DAILY_BRIEF =
  'THE DAILY TRIAL: every juror in the world hears this same case today, in their own country. Make it universal — a human dilemma that reads the same in any city (a debt, a betrayal, an accident, a small fraud, a fight). Nothing that depends on one country\'s laws, customs or currency. Refer to money in plain words ("a few thousand", "their savings") rather than amounts.';

const NEUTRAL_CITY = {
  crimeRate: 50,
  judicialTrust: 50,
  wealthDisparity: 50,
  organizedCrimePower: 30,
  policeIntegrity: 55,
  mediaPressure: 50,
};

/** Somewhere that is nowhere: the generic profile, before localisation. */
function placelessPlace(): PlaceContext {
  const p = genericProfile('ZZ', 'the country');
  const district = p.districts[0]!;
  const tier: Tier = 'district';
  return {
    country: 'ZZ',
    countryName: p.name,
    district,
    court: p.courtName(tier, district),
    policeService: p.policeService(district),
    currency: p.currency,
    nameRegister: p.nameRegister,
    tier,
    tierLabel: 'District',
    difficulty: 3,
  };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Turn a generated case into a template: its people and institutions become
 * slots. Full names first, then first and last names alone, so "Nadia" and
 * "Ms Haddad" follow the person too.
 */
export function toTemplate(gc: GeneratedCase, place: PlaceContext): GeneratedCase {
  const people: [string, string][] = [
    [gc.defendant.name, 'D'],
    [gc.witnesses[0]?.name ?? '', 'W1'],
    [gc.witnesses[1]?.name ?? '', 'W2'],
  ];
  const swaps: [RegExp, string][] = [];
  for (const [name, slot] of people) {
    if (!name.trim()) continue;
    swaps.push([new RegExp(`\\b${escape(name)}\\b`, 'g'), `{${slot}_FULL}`]);
  }
  for (const [name, slot] of people) {
    const parts = name.trim().split(/\s+/);
    if (parts.length < 2) continue;
    swaps.push([new RegExp(`\\b${escape(parts[0]!)}\\b`, 'g'), `{${slot}_FIRST}`]);
    swaps.push([new RegExp(`\\b${escape(parts[parts.length - 1]!)}\\b`, 'g'), `{${slot}_LAST}`]);
  }
  swaps.push([new RegExp(escape(place.court), 'g'), '{COURT}']);
  swaps.push([new RegExp(escape(place.policeService), 'g'), '{POLICE}']);
  swaps.push([new RegExp(escape(place.district), 'g'), '{DISTRICT}']);

  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return swaps.reduce((s, [re, to]) => s.replace(re, to), v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return walk(gc) as GeneratedCase;
}

/** Today's template, generating it on first ask. */
export async function dailyTemplate(day = utcDay()): Promise<GeneratedCase> {
  const existing = await prisma.dailyTrial.findUnique({ where: { day } });
  if (existing) return fromRow(existing);

  // One generator per day across every server instance; everyone else gets
  // the authored fallback for the few seconds that takes, rather than waiting.
  const got = await redis.set(`daily-lock:${day}`, '1', 'EX', 60, 'NX').catch(() => 'OK');
  if (got !== 'OK') {
    // Someone else is writing today's case. Wait for it rather than settling
    // the whole world on the authored fallback because two jurors arrived in
    // the same second.
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const row = await prisma.dailyTrial.findUnique({ where: { day } });
      if (row) return fromRow(row);
    }
  }
  let payload: GeneratedCase | null = null;
  if (got === 'OK') {
    const place = placelessPlace();
    const generated = await specialCase(`daily:${day}`, 1, NEUTRAL_CITY, place, DAILY_BRIEF, 20_000).catch(
      (err) => {
        log.warn('daily trial generation failed', { day, error: (err as Error).message });
        return null;
      },
    );
    if (generated) {
      const template = toTemplate(generated, place);
      // Stored only if it comes back out whole — see usable().
      if (usable(template)) payload = template;
      else log.warn('daily trial template unusable; using the authored docket', { day });
    }
  }

  const seedIndex = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000) % SEED_CASES.length;
  const row = await prisma.dailyTrial.upsert({
    where: { day },
    create: { day, payload: payload ?? undefined, seedIndex: payload ? null : seedIndex },
    update: {},
  });
  return fromRow(row);
}

/**
 * Whether a template localises into a valid case.
 *
 * A template cannot be schema-checked as it stands — "{W1_FULL}" is, rightly,
 * not a name — so it is filled somewhere real first and THAT is checked.
 */
function usable(template: unknown): template is GeneratedCase {
  try {
    const probe = localizeCase(template as GeneratedCase, {
      profile: profileFor('GB'),
      district: 'Leeds',
      court: 'Leeds Magistrates’ Court',
      policeService: 'West Yorkshire Police',
      seed: 1,
    });
    return generatedCaseSchema.safeParse(probe).success;
  } catch {
    return false;
  }
}

function fromRow(row: { payload: unknown; seedIndex: number | null }): GeneratedCase {
  if (row.payload && usable(row.payload)) return row.payload;
  return SEED_CASES[(row.seedIndex ?? 0) % SEED_CASES.length]!;
}

/** Today's case, told in this juror's country. */
export function dailyFor(template: GeneratedCase, userId: string, day: string, place: PlaceContext): GeneratedCase {
  return stripPresentation(
    localizeCase(template, {
      profile: profileFor(place.country),
      district: place.district,
      court: place.court,
      policeService: place.policeService,
      seed: hashSeed(`${userId}:daily:${day}`),
    }),
  );
}

export interface DailyTally {
  guilty: number;
  notGuilty: number;
  hung: number;
  total: number;
}

export async function tallyFor(day: string): Promise<DailyTally | null> {
  const row = await prisma.dailyTrial.findUnique({ where: { day } });
  if (!row) return null;
  return { guilty: row.guilty, notGuilty: row.notGuilty, hung: row.hung, total: row.guilty + row.notGuilty + row.hung };
}

/** Count one verdict toward the world's split. */
export async function recordDailyVerdict(day: string, verdict: 'guilty' | 'not_guilty' | null): Promise<DailyTally | null> {
  const field = verdict === 'guilty' ? 'guilty' : verdict === 'not_guilty' ? 'notGuilty' : 'hung';
  await prisma.dailyTrial
    .update({ where: { day }, data: { [field]: { increment: 1 } } })
    .catch(() => null);
  return tallyFor(day);
}

/**
 * Write today's case before anyone asks for it, so the first juror of the
 * day never waits on the model. Cheap when it already exists.
 */
export function warmDailyTrial(everyMs = 10 * 60_000): NodeJS.Timeout {
  const warm = () =>
    void dailyTemplate(utcDay()).catch((err: Error) => log.warn('daily trial warm failed', { error: err.message }));
  setTimeout(warm, 5_000).unref();
  const t = setInterval(warm, everyMs);
  t.unref();
  return t;
}
