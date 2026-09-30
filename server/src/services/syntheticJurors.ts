import { Prisma } from '@prisma/client';
import { COUNTRIES, profileFor, type CountryProfile } from '../domain/jurisdiction.js';
import { peaceIndex } from '../domain/peace.js';
import { log } from '../lib/log.js';
import { prisma } from '../lib/prisma.js';

/**
 * House jurors, so the boards are not empty on day one.
 *
 * A player who sits ten cases, opens the World tab and finds three cities on
 * it concludes the game is deserted and leaves. That is the whole problem this
 * solves: the boards need a population before there is one.
 *
 * What makes them survive a second look:
 *
 *  - NAMES COME FROM THE COUNTRY'S OWN REGISTER. A juror in Nigeria is called
 *    something a Nigerian would recognise, with the given name and the surname
 *    drawn from the SAME tradition (domain/jurisdiction), so the board does not
 *    read as a random-word generator to anyone who lives there.
 *  - CITIES ARE SHAPED, NOT UNIFORM. Real populations bunch in the middle. A
 *    flat spread of peace indices is the single most obvious tell, so most of
 *    these sit Strained or Troubled and only a few reach either end.
 *  - THE SIX DIALS AGREE WITH EACH OTHER. A city with rampant organised crime
 *    and pristine police integrity is a contradiction; the dials are derived
 *    from one underlying "how well is this going" draw plus noise, so they
 *    correlate the way a real city's would.
 *  - EXPERIENCE MATCHES THE CITY. A juror whose city has moved a long way from
 *    neutral has heard a lot of cases, because that is the only thing that
 *    moves it.
 *  - THEY ARRIVED OVER TIME. createdAt is spread backwards over weeks, so the
 *    population does not look like it was poured in at once — which it was.
 *
 * What they are NOT: they hold no credentials, so nobody can sign in as one;
 * they are flagged `isSynthetic`, so they can be excluded or removed wholesale;
 * and they never receive a case, a verdict or a penny.
 */

/** How many house jurors the world should have. */
export const SYNTHETIC_POOL = 420;

/**
 * Where they come from.
 *
 * Weighted towards the countries this game is actually likely to be played in
 * first, rather than spread evenly over all 69 — an even spread puts as many
 * jurors in Luxembourg as in Nigeria and reads as generated immediately.
 */
const COUNTRY_WEIGHTS: Record<string, number> = {
  NG: 16, US: 14, GB: 9, IN: 8, ZA: 5, KE: 5, GH: 4, CA: 4, AU: 3, IE: 2,
  DE: 3, FR: 3, BR: 4, PH: 3, PK: 3, ID: 2, MY: 2, SG: 2, AE: 2, EG: 2,
  NL: 1, SE: 1, NO: 1, ES: 2, IT: 2, PT: 1, PL: 1, TR: 1, MX: 2, AR: 1,
  CO: 1, JM: 1, TT: 1, UG: 2, TZ: 2, ZW: 1, ZM: 1, CM: 1, SN: 1, CI: 1,
  RW: 1, ET: 1, MA: 1, DZ: 1, TN: 1, BD: 2, LK: 1, VN: 1, TH: 1, JP: 1,
  KR: 1, NZ: 1,
};

/** A deterministic 0..1 from a string, so a seeded juror is always the same. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** A small deterministic generator, so seeding twice produces the same world. */
function rng(seed: string) {
  let h = Math.floor(hash(seed) * 2147483647) || 1;
  return () => {
    h = (h * 16807) % 2147483647;
    return (h - 1) / 2147483646;
  };
}

/** Two independent draws averaged: a hump in the middle, not a flat line. */
function humped(roll: () => number): number {
  return (roll() + roll()) / 2;
}

function pick<T>(arr: readonly T[], roll: () => number): T {
  return arr[Math.min(arr.length - 1, Math.floor(roll() * arr.length))]!;
}

function weightedCountry(roll: () => number): string {
  const entries = Object.entries(COUNTRY_WEIGHTS).filter(([c]) => COUNTRIES[c]);
  const total = entries.reduce((n, [, w]) => n + w, 0);
  let r = roll() * total;
  for (const [code, w] of entries) {
    r -= w;
    if (r <= 0) return code;
  }
  return entries[0]![0];
}

/**
 * A name from ONE of the country's naming traditions.
 *
 * Uses the same registers the case generator uses, so a house juror is named
 * exactly the way a defendant in that country is named — and never ends up as
 * a Yoruba given name on an Igbo surname.
 */
function nameFor(profile: CountryProfile, roll: () => number): string {
  const t = profile.texture;
  const regs = t.registers;
  if (regs && regs.length > 0) {
    const total = regs.reduce((n, r) => n + r.weight, 0);
    let r = roll() * total;
    let reg = regs[regs.length - 1]!;
    for (const candidate of regs) {
      r -= candidate.weight;
      if (r <= 0) {
        reg = candidate;
        break;
      }
    }
    return `${pick(reg.given, roll)} ${pick(reg.surnames, roll)}`;
  }
  return `${pick(t.givenNames, roll)} ${pick(t.surnames, roll)}`;
}

/**
 * Six dials that agree with one another.
 *
 * Derived from one `fortune` draw — how well this city is going — so a place
 * with high organised crime also has poor police integrity and low trust, the
 * way a real one would. The noise is what stops six dials being the same
 * number six times.
 */
function cityFor(fortune: number, roll: () => number) {
  const n = (spread = 14) => (roll() - 0.5) * spread;
  const clamp = (v: number) => Math.max(2, Math.min(98, Math.round(v * 10) / 10));
  return {
    crimeRate: clamp(90 - fortune * 75 + n()),
    judicialTrust: clamp(15 + fortune * 72 + n()),
    policeIntegrity: clamp(18 + fortune * 68 + n()),
    organizedCrimePower: clamp(82 - fortune * 66 + n()),
    wealthDisparity: clamp(76 - fortune * 45 + n(20)),
    mediaPressure: clamp(30 + roll() * 45),
  };
}

export interface SeedResult {
  created: number;
  existing: number;
}

/**
 * Create any house jurors that are missing, up to `size`.
 *
 * Idempotent and deterministic: juror `n` is always the same person with the
 * same country and the same city, so re-running this tops the pool up rather
 * than inventing a second population. Names are checked against the ones
 * already taken, because a board with two Wale Adebayos is its own kind of
 * tell.
 */
export async function ensureSyntheticPool(size = SYNTHETIC_POOL): Promise<SeedResult> {
  const existing = await prisma.user.count({ where: { isSynthetic: true } });
  if (existing >= size) return { created: 0, existing };

  const taken = new Set(
    (await prisma.user.findMany({ select: { jurorName: true } })).map((u) => u.jurorName),
  );

  /**
   * How often each surname has already been used, per country.
   *
   * A country without naming registers has ten given names and ten surnames —
   * a hundred people — so forty house jurors from it share ten surnames, and
   * the first seeded board put "Ray Okafor" and "Dana Okafor" at ninth and
   * tenth. Two of a surname is a family; four is a generator. Capped at two,
   * and the draw simply tries again.
   */
  const surnameUse = new Map<string, number>();
  const SURNAME_CAP = 2;

  let created = 0;
  for (let i = existing; i < size; i++) {
    const roll = rng(`fault-house-juror:${i}`);
    const code = weightedCountry(roll);
    const profile = profileFor(code);

    // Up to a few attempts at a name that is neither taken nor a surname this
    // country has already worn out.
    let jurorName = '';
    for (let attempt = 0; attempt < 24; attempt++) {
      const candidate = nameFor(profile, roll);
      if (taken.has(candidate)) continue;
      const surname = candidate.slice(candidate.indexOf(' ') + 1);
      const key = `${code}:${surname}`;
      // The cap relaxes on the last few tries rather than losing the juror: a
      // third Okafor is better than a gap in the pool.
      const cap = attempt < 18 ? SURNAME_CAP : SURNAME_CAP + 2;
      if ((surnameUse.get(key) ?? 0) >= cap) continue;
      jurorName = candidate;
      surnameUse.set(key, (surnameUse.get(key) ?? 0) + 1);
      break;
    }
    if (!jurorName) continue;
    taken.add(jurorName);

    const fortune = humped(roll);
    const city = cityFor(fortune, roll);
    const index = peaceIndex(city);

    // A city only moves because someone heard cases. The further it has gone
    // from neutral, the more of them there must have been.
    const distance = Math.abs(index - 50) / 50;
    const totalCases = Math.round(12 + distance * 180 + roll() * 60);

    // Arrived over the last ten weeks, not all at once this morning.
    const daysAgo = Math.round(roll() * 70) + 1;
    const createdAt = new Date(Date.now() - daysAgo * 86_400_000);
    // Last seen somewhere between joining and now, weighted recent.
    const lastSeenAt = new Date(Date.now() - Math.round(roll() * roll() * daysAgo) * 86_400_000);

    try {
      await prisma.user.create({
        data: {
          jurorName,
          isSynthetic: true,
          homeCountry: code,
          currentCountry: code,
          homeDistrict: pick(profile.districts, roll),
          localeTag: profile.localeTag,
          createdAt,
          lastSeenAt,
          cityState: { create: { ...city, peaceIndex: index } },
          jurorProfile: { create: { totalCases } },
        },
      });
      created++;
    } catch (err) {
      // A unique-name race or a bad country is one juror lost, not a failed
      // batch. The pool is topped up on the next run.
      log.warn('synthetic juror not created', { i, error: (err as Error).message });
    }
  }

  log.info('synthetic pool seeded', { created, total: existing + created });
  return { created, existing };
}

/**
 * Nudge the house cities, so the boards are not a photograph.
 *
 * A leaderboard whose order never changes is as obvious a tell as an empty
 * one. Each city drifts a little — bounded, and biased gently back towards
 * where it started, so the population keeps its shape instead of every city
 * wandering to an extreme over a month.
 *
 * Cheap enough to run on a schedule: one read and one write per juror, and the
 * pool is in the hundreds.
 */
export async function driftSyntheticCities(limit = 120): Promise<number> {
  const rows = await prisma.cityState.findMany({
    where: { user: { isSynthetic: true } },
    select: {
      userId: true,
      crimeRate: true,
      judicialTrust: true,
      wealthDisparity: true,
      organizedCrimePower: true,
      policeIntegrity: true,
      mediaPressure: true,
    },
    orderBy: { updatedAt: 'asc' },
    take: limit,
  });

  for (const row of rows) {
    const { userId, ...city } = row;
    const next = { ...city };
    for (const key of Object.keys(next) as (keyof typeof next)[]) {
      // A nudge, plus a small pull back towards the middle.
      const drift = (Math.random() - 0.5) * 3.5 + (50 - next[key]) * 0.01;
      next[key] = Math.max(2, Math.min(98, Math.round((next[key] + drift) * 10) / 10));
    }
    await prisma.cityState.update({
      where: { userId },
      data: { ...next, peaceIndex: peaceIndex(next) },
    });
  }
  return rows.length;
}

/** Remove every house juror. Their cities and profiles cascade. */
export async function clearSyntheticPool(): Promise<number> {
  const { count } = await prisma.user.deleteMany({ where: { isSynthetic: true } });
  return count;
}

/** Everything the boards would show, for a quick sanity read. */
export async function syntheticSummary() {
  const total = await prisma.user.count({ where: { isSynthetic: true } });
  const byCountry = await prisma.user.groupBy({
    by: ['homeCountry'],
    where: { isSynthetic: true },
    _count: true,
    orderBy: { _count: { homeCountry: 'desc' } },
    take: 8,
  });
  return { total, byCountry };
}

export const _internals = { cityFor, nameFor, weightedCountry, rng, humped, Prisma };
