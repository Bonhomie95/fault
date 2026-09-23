import { SPRITES } from '@/components/cast/sprites';
import { ARCHETYPE_CHANNEL, FEMININE_CHANNEL, rand } from '@/lib/seed';
import type { ClientCase } from '@/lib/api';

/**
 * Who plays whom.
 *
 * The rendered cast is a dozen people (tools/portraits). Every character in a
 * case is assigned one of them, deterministically, so the same name is the
 * same face every time it walks back in — the Echo System's payoff.
 *
 * What the choice may depend on, and what it may not:
 *
 *   name      presentation, when the server can tell from the name; the
 *             seed's presentation channel otherwise
 *   seed      which of the matching people it is
 *   age       the defendant's stated age, because a 71-year-old played by a
 *             twenty-something reads as a casting error, not as a person
 *   country   the court's region — names come from the local register, so
 *             the faces do too. Mixed countries (US, UK, BR, ZA…) draw each
 *             person from a realistic mix (REGION); unlisted countries have
 *             no preference.
 *
 * Nothing here can see the verdict, the evidence or the presentation scores,
 * so no face is ever a clue — the same guarantee the rest of the room makes.
 */

export type Role = 'defendant' | 'witness1' | 'witness2' | 'prosecution' | 'defence';

/**
 * The rendered ancestries (tools/suspect/export_suspect.py): African, East and
 * South-East Asian, European, South Asian, Latin American, and Middle Eastern
 * / North African.
 */
type Ancestry = 'af' | 'as' | 'ca' | 'sa' | 'la' | 'me';
type AgeBand = 'young' | 'mid' | 'old';

interface Person {
  key: string;
  feminine: boolean;
  age: AgeBand;
  ancestry: Ancestry;
}

const PEOPLE: Person[] = Object.keys(SPRITES).map((key) => {
  const [g, age, ancestry] = key.split('_') as [string, AgeBand, Ancestry];
  return { key, feminine: g === 'f', age, ancestry };
});

type Mix = Partial<Record<Ancestry, number>>;

/**
 * Who you would expect to see in a courtroom in this country, roughly.
 *
 * Weights, not a single answer: a London or Toronto courtroom is a mix, and
 * one face for the whole country would be wrong in a different way. Each
 * person in the room draws their own ancestry from the mix, by seed, so the
 * same name is still the same face every time.
 */
const AF: Mix = { af: 1 };
const AS: Mix = { as: 1 };
const EU: Mix = { ca: 0.9, me: 0.05, af: 0.05 };
const SA: Mix = { sa: 1 };
const LA: Mix = { la: 0.85, ca: 0.1, af: 0.05 };
const ME: Mix = { me: 0.9, af: 0.05, sa: 0.05 };

const REGION: Record<string, Mix> = {
  // Africa, sub-Saharan
  NG: AF, GH: AF, KE: AF, UG: AF, TZ: AF, ET: AF, RW: AF, CM: AF, SN: AF, CI: AF,
  ZW: AF, ZM: AF, BW: AF, MW: AF,
  ZA: { af: 0.75, ca: 0.12, sa: 0.05, la: 0.08 },
  // North Africa and the Middle East
  EG: ME, MA: ME, DZ: ME, TN: ME, SA: ME, AE: { me: 0.45, sa: 0.4, as: 0.1, ca: 0.05 },
  QA: { me: 0.45, sa: 0.45, as: 0.1 }, KW: { me: 0.6, sa: 0.3, as: 0.1 },
  TR: { me: 0.7, ca: 0.3 }, IL: { me: 0.55, ca: 0.4, af: 0.05 },
  // South Asia
  IN: SA, PK: SA, BD: SA, LK: SA, NP: SA,
  // East and South-East Asia
  CN: AS, JP: AS, KR: AS, TW: AS, HK: AS, VN: AS, TH: AS, PH: AS, ID: AS,
  SG: { as: 0.75, sa: 0.15, me: 0.1 }, MY: { as: 0.6, sa: 0.15, me: 0.25 },
  // Latin America and the Caribbean
  MX: LA, CO: LA, PE: LA, AR: { la: 0.6, ca: 0.4 }, CL: { la: 0.7, ca: 0.3 },
  BR: { la: 0.55, ca: 0.2, af: 0.25 }, JM: { af: 0.9, la: 0.05, sa: 0.05 },
  TT: { af: 0.45, sa: 0.4, la: 0.15 },
  // Europe
  NO: EU, SE: EU, DK: EU, FI: EU, IS: EU, DE: EU, NL: EU, PL: EU, CZ: EU, IE: EU,
  FR: { ca: 0.75, me: 0.12, af: 0.13 }, IT: EU, ES: { ca: 0.8, la: 0.12, me: 0.08 },
  PT: EU, AT: EU, CH: EU, BE: EU, GR: EU, RO: EU, HU: EU, RU: EU, UA: EU,
  GB: { ca: 0.72, sa: 0.12, af: 0.1, as: 0.03, me: 0.03 },
  // The Anglosphere and other mixed countries
  US: { ca: 0.58, la: 0.18, af: 0.14, as: 0.06, sa: 0.02, me: 0.02 },
  CA: { ca: 0.68, as: 0.12, sa: 0.1, af: 0.05, la: 0.05 },
  AU: { ca: 0.75, as: 0.14, sa: 0.06, me: 0.05 },
  NZ: { ca: 0.75, as: 0.15, sa: 0.05, la: 0.05 },
};

/** One ancestry from a mix, by seed — stable for the same person. */
function drawAncestry(mix: Mix, seed: number): Ancestry {
  const entries = Object.entries(mix) as [Ancestry, number][];
  const total = entries.reduce((n, [, w]) => n + w, 0);
  let r = rand(seed, ANCESTRY_CHANNEL) * total;
  for (const [a, w] of entries) {
    r -= w;
    if (r <= 0) return a;
  }
  return entries[entries.length - 1]![0];
}

/** A channel of its own, so ancestry does not correlate with which face in it. */
const ANCESTRY_CHANNEL = 29;

/** Stable 32-bit hash of a name — the same person, forever. */
export function hashName(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h % 100000);
}

function ageBand(age: number | undefined): AgeBand | null {
  if (age == null) return null;
  return age < 36 ? 'young' : age < 62 ? 'mid' : 'old';
}

export function isFeminine(seed: number): boolean {
  // Must match the drawn face (scene2d/CourtroomScene, faceGeom) exactly.
  return rand(seed, FEMININE_CHANNEL) > 0.62;
}

/**
 * The best-fitting person for a seed, avoiding anyone already cast.
 *
 * Presentation is a hard filter. Age and region are preferences: each match
 * adds weight, and the seed picks among the best-scoring few, so the room is
 * mostly local and the right age without being uniform about it.
 */
function castOne(
  seed: number,
  opts: { age?: number; region?: Mix; taken: Set<string>; feminine?: boolean | null },
): string {
  // The name decides when it can (the server reads it — "Ngozi" is a woman);
  // the seed decides when the name could be either.
  const feminine = opts.feminine ?? isFeminine(seed);
  const band = ageBand(opts.age);
  // Always prefer the court's region. It was a 3-in-4 coin, meant to make the
  // room less uniform — but every name comes from the local register, and a
  // Yoruba name on a face from the other side of the world is a casting
  // error, not diversity. Variety comes from age and the person instead.
  const want = opts.region ? drawAncestry(opts.region, seed) : null;

  const pool = PEOPLE.filter((p) => p.feminine === feminine && !opts.taken.has(p.key));
  const candidates = pool.length ? pool : PEOPLE.filter((p) => !opts.taken.has(p.key));
  if (!candidates.length) return PEOPLE[0]!.key;

  const scored = candidates.map((p) => ({
    p,
    score: (band && p.age === band ? 2 : 0) + (want && p.ancestry === want ? 3 : 0),
  }));
  const best = Math.max(...scored.map((s) => s.score));
  const top = scored.filter((s) => s.score === best).map((s) => s.p);
  const index = Math.floor(rand(seed, ARCHETYPE_CHANNEL) * top.length);
  return top[Math.min(index, top.length - 1)]!.key;
}

export type Casting = Record<Role, { key: string; seed: number; feminine: boolean }>;

/** Everyone in the room for this case. Stable for the life of the case. */
export function castFor(c: ClientCase): Casting {
  const region = REGION[c.place.country?.toUpperCase?.() ?? ''];
  const taken = new Set<string>();
  const one = (seed: number, age?: number, feminine?: boolean | null) => {
    const key = castOne(seed, { age, region, taken, feminine });
    taken.add(key);
    return { key, seed, feminine: PEOPLE.find((p) => p.key === key)?.feminine ?? isFeminine(seed) };
  };

  const defendant = one(c.defendant.portraitSeed, c.defendant.age, c.defendant.feminine);
  const w1 = c.witnesses[0]?.name ?? `${c.id}-w1`;
  const w2 = c.witnesses[1]?.name ?? `${c.id}-w2`;
  return {
    defendant,
    witness1: one(hashName(w1), undefined, c.witnesses[0]?.feminine),
    witness2: one(hashName(w2), undefined, c.witnesses[1]?.feminine),
    prosecution: one(hashName(`${c.id}-prosecution`)),
    defence: one(hashName(`${c.id}-defence`)),
  };
}
