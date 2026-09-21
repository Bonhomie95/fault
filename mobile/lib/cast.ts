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
 *             the faces do too. Regions this cannot place (US, UK, BR, ZA,
 *             IN…) have no preference, since their registers are mixed.
 *
 * Nothing here can see the verdict, the evidence or the presentation scores,
 * so no face is ever a clue — the same guarantee the rest of the room makes.
 */

export type Role = 'defendant' | 'witness1' | 'witness2' | 'prosecution' | 'defence';

type Ancestry = 'af' | 'as' | 'ca';
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

/** Where the docket is heard, reduced to the one thing casting uses. */
const REGION: Record<string, Ancestry> = {
  NG: 'af', GH: 'af', KE: 'af', UG: 'af', TZ: 'af', ET: 'af', RW: 'af', CM: 'af',
  SN: 'af', CI: 'af', ZW: 'af', ZM: 'af', BW: 'af', MW: 'af',
  CN: 'as', JP: 'as', KR: 'as', TW: 'as', HK: 'as', SG: 'as', VN: 'as', TH: 'as',
  PH: 'as', MY: 'as', ID: 'as',
  NO: 'ca', SE: 'ca', DK: 'ca', FI: 'ca', IS: 'ca', DE: 'ca', NL: 'ca', PL: 'ca',
  CZ: 'ca', IE: 'ca', FR: 'ca', IT: 'ca', ES: 'ca', PT: 'ca', AT: 'ca', CH: 'ca',
  RU: 'ca', UA: 'ca',
};

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
  opts: { age?: number; region?: Ancestry; taken: Set<string>; feminine?: boolean | null },
): string {
  // The name decides when it can (the server reads it — "Ngozi" is a woman);
  // the seed decides when the name could be either.
  const feminine = opts.feminine ?? isFeminine(seed);
  const band = ageBand(opts.age);
  // Always prefer the court's region. It was a 3-in-4 coin, meant to make the
  // room less uniform — but every name comes from the local register, and a
  // Yoruba name on a face from the other side of the world is a casting
  // error, not diversity. Variety comes from age and the person instead.
  const local = opts.region != null;

  const pool = PEOPLE.filter((p) => p.feminine === feminine && !opts.taken.has(p.key));
  const candidates = pool.length ? pool : PEOPLE.filter((p) => !opts.taken.has(p.key));
  if (!candidates.length) return PEOPLE[0]!.key;

  const scored = candidates.map((p) => ({
    p,
    score: (band && p.age === band ? 2 : 0) + (local && p.ancestry === opts.region ? 3 : 0),
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
