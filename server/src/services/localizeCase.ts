import type { GeneratedCase } from '../domain/case.js';
import type { CountryProfile } from '../domain/jurisdiction.js';

/**
 * Moving the authored docket to wherever the juror actually lives.
 *
 * The six authored cases are the offline buffer — the thing every player sees
 * when the Groq budget is gone. Written once, they were Nigerian: naira,
 * danfo drivers, Balogun Market. Handing that to a juror in Bergen broke the
 * premise on case one, and it is the *failure* path, so it broke it precisely
 * when the game was already having a bad day.
 *
 * The dramas themselves travel fine. A clerk accused on a shared login, a man
 * who threw one punch over a debt, a builder who took deposits for homes that
 * were never built — none of that is Nigerian, it is human. Only the nouns
 * were local. So the nouns became slots.
 *
 * What this deliberately does NOT do is machine-translate. Every case stays in
 * the game's English; what changes is who these people are, what money they
 * lost, and where they lost it.
 */

/** Slots an authored case may contain. */
export type Slot =
  | 'D_FIRST' | 'D_LAST' | 'D_FULL'
  | 'W1_FIRST' | 'W1_LAST' | 'W1_FULL'
  | 'W2_FIRST' | 'W2_LAST' | 'W2_FULL'
  | 'MONEY_SMALL' | 'MONEY_MID' | 'MONEY_LARGE' | 'MONEY_HUGE'
  | 'MARKET' | 'DEPOT' | 'HOOD1' | 'HOOD2' | 'TRANSPORT_JOB'
  | 'POLICE' | 'COURT' | 'DISTRICT' | 'CURRENCY';

/** Deterministic index into a list, from a seed. */
function pick<T>(list: readonly T[], seed: number, channel: number): T {
  const x = Math.sin(seed * 91.7 + channel * 47.3) * 21374.1;
  const r = x - Math.floor(x);
  return list[Math.floor(r * list.length) % list.length]!;
}

export interface LocalizeContext {
  profile: CountryProfile;
  district: string;
  court: string;
  policeService: string;
  /** Same seed → same cast. A juror who sees this case twice sees one story. */
  seed: number;
}

function buildSlots(ctx: LocalizeContext): Record<Slot, string> {
  const t = ctx.profile.texture;

  // Three distinct people. Drawing from one pool with different channels can
  // collide, so each name is offset until it differs — two people sharing a
  // surname reads as family, and in these cases it would be an accident.
  const names: { first: string; last: string }[] = [];
  for (let i = 0; i < 3; i++) {
    let first = pick(t.givenNames, ctx.seed, 11 + i * 7);
    let last = pick(t.surnames, ctx.seed, 23 + i * 13);
    let guard = 0;
    while (names.some((n) => n.first === first || n.last === last) && guard < 12) {
      first = pick(t.givenNames, ctx.seed + guard * 31, 11 + i * 7);
      last = pick(t.surnames, ctx.seed + guard * 17, 23 + i * 13);
      guard++;
    }
    names.push({ first, last });
  }

  const [d, w1, w2] = names as [typeof names[0], typeof names[0], typeof names[0]];

  return {
    D_FIRST: d.first,
    D_LAST: d.last,
    D_FULL: `${d.first} ${d.last}`,
    W1_FIRST: w1.first,
    W1_LAST: w1.last,
    W1_FULL: `${w1.first} ${w1.last}`,
    W2_FIRST: w2.first,
    W2_LAST: w2.last,
    W2_FULL: `${w2.first} ${w2.last}`,
    MONEY_SMALL: t.money.small,
    MONEY_MID: t.money.mid,
    MONEY_LARGE: t.money.large,
    MONEY_HUGE: t.money.huge,
    MARKET: t.market,
    DEPOT: t.depot,
    HOOD1: pick(t.neighbourhoods, ctx.seed, 3),
    HOOD2: pick(t.neighbourhoods, ctx.seed, 71),
    TRANSPORT_JOB: t.transportJob,
    POLICE: ctx.policeService,
    COURT: ctx.court,
    DISTRICT: ctx.district,
    CURRENCY: ctx.profile.currency,
  };
}

const SLOT_PATTERN = /\{([A-Z0-9_]+)\}/g;

function fill(text: string, slots: Record<string, string>): string {
  return text.replace(SLOT_PATTERN, (whole, key: string) => slots[key] ?? whole);
}

/**
 * Rewrites an authored case into the player's country.
 *
 * Structure, evidence, lies, tells, verdict and every tuned number survive
 * untouched — only the prose slots move. The case that comes out is the same
 * case, tried somewhere else.
 */
export function localizeCase(template: GeneratedCase, ctx: LocalizeContext): GeneratedCase {
  const slots = buildSlots(ctx);
  const f = (s: string) => fill(s, slots);

  return {
    ...template,
    title: f(template.title),
    charge: f(template.charge),
    defendant: {
      ...template.defendant,
      name: f(template.defendant.name),
      occupation: f(template.defendant.occupation),
      background: f(template.defendant.background),
    },
    evidence: template.evidence.map((e) => ({
      ...e,
      description: f(e.description),
      prosecution_reading: f(e.prosecution_reading),
      defence_reading: f(e.defence_reading),
    })),
    witnesses: template.witnesses.map((w) => ({
      ...w,
      name: f(w.name),
      role: f(w.role ?? ''),
      testimony: f(w.testimony),
      lie: f(w.lie),
      lie_tell: f(w.lie_tell),
    })),
    prosecution_argument: f(template.prosecution_argument),
    defence_argument: f(template.defence_argument),
    // The pool keys are names, and they must match the localised names exactly
    // or the Echo System stops recognising its own cast.
    character_pool_additions: template.character_pool_additions.map((c) => ({
      ...c,
      name: f(c.name),
    })),
  };
}

/** Every slot an authored case references, for tests to check we can fill it. */
export function slotsUsedIn(template: GeneratedCase): string[] {
  const blob = JSON.stringify(template);
  const found = new Set<string>();
  for (const m of blob.matchAll(SLOT_PATTERN)) found.add(m[1]!);
  return [...found];
}
