import type { Tier } from '@prisma/client';
import { ACCENTS, generatedCaseSchema, type GeneratedCase } from '../domain/case.js';
import type { CityMetrics } from '../domain/city.js';
import { GROQ_MODEL, groq } from '../lib/groq.js';
import { caseQueueKey, redis } from '../lib/redis.js';
import { districtFor, profileFor, tierLabel } from '../domain/jurisdiction.js';
import { deriveCaseMood, deriveFactions } from './cityEffects.js';
import { echoRolesFor, getEligibleCharacters, type PoolCharacter } from './characterPool.js';
import { computeJurorStats, weakestBias } from './jurorProfile.js';
import { seedCaseFor, SEED_CASES } from './seedCases.js';

/**
 * Buffer sizing, against two real limits.
 *
 * A case costs roughly 1.7k prompt + 1.2k completion ≈ 3k tokens. Groq's free
 * tier caps BOTH:
 *   - 12,000 tokens per minute  → about 4 cases a minute
 *   - 100,000 tokens per DAY    → about 33 cases a day, total, for everyone
 *
 * The daily cap is the one that matters and it is brutal: a single engaged
 * player can exhaust the entire free tier in one sitting, after which every
 * juror on the server drops to the fallback docket. This is a billing decision
 * disguised as a constant — FAULT needs a paid tier to exist as a product.
 *
 * The GDD (4.3) specifies batches of five. Three is what the budget affords.
 * On a paid tier, raise BATCH_SIZE and drop SPACING_MS.
 */
const BATCH_SIZE = 3;
const REFILL_BELOW = 2;
/** Spacing exists for the per-minute cap; it does nothing for the daily one. */
const SPACING_MS = 21_000;
const MAX_ATTEMPTS = 4;

/** GDD 12 — cases are human drama. This is the coarse net; the system prompt
 *  is the fine one. Anything caught here is dropped, never shown. */
const BLOCKED_PATTERNS = [
  /\bchild (sex|abuse|porn)/i,
  /\bsexual assault of a (child|minor)/i,
  /\brape\b/i,
  /\bgenocide\b/i,
  /\bterrorist attack on\b/i,
];

function violatesPolicy(c: GeneratedCase): boolean {
  const haystack = [
    c.title,
    c.charge,
    c.defendant.background,
    ...c.evidence.map((e) => e.description),
    ...c.witnesses.map((w) => w.testimony),
  ].join(' ');
  return BLOCKED_PATTERNS.some((p) => p.test(haystack));
}

/**
 * A structural fingerprint, deliberately blind to names and specifics.
 * Two cases with the same key are the same case wearing different clothes —
 * that is how the consistency probe works (GDD 2.5).
 */
export function structureKeyFor(c: GeneratedCase): string {
  const wealthBand = c.defendant.wealth <= 30 ? 'poor' : c.defendant.wealth >= 70 ? 'rich' : 'mid';
  const strengthBand =
    c.evidence_strength <= -0.4 ? 'defence' : c.evidence_strength >= 0.4 ? 'prosecution' : 'balanced';
  const planted = c.evidence.some((e) => e.is_planted) ? 'planted' : 'clean';
  return `${c.accent}:${wealthBand}:${strengthBand}:${planted}:${c.correct_verdict}`;
}

/** Where this case is heard. Real institutions; fictional people. */
export interface PlaceContext {
  country: string;
  countryName: string;
  district: string;
  court: string;
  policeService: string;
  currency: string;
  nameRegister: string;
  tier: Tier;
  tierLabel: string;
}

interface GenerationContext {
  city: CityMetrics;
  jurorProfileSummary: string;
  weakestBias: string;
  characterPool: PoolCharacter[];
  caseNumber: number;
  place: PlaceContext;
  /** Whether THIS case is allowed to be unanswerable. Decided here, not by
   *  the model — see ambiguityTargetFor. */
  wantAmbiguous: boolean;
}

/**
 * How often a case should have no right answer, by chapter.
 *
 * GDD 3.3 is explicit about the curve: cases 1-5 have clear evidence, 31-50
 * have "NO correct answer — only precedent, only your record". Left to itself
 * the model marks almost everything ambiguous, which sounds sophisticated and
 * is actually fatal: ambiguous cases move trust by design (there is nothing to
 * be right about), so a docket of pure ambiguity pins standing at its starting
 * value forever and the promotion ladder — which needs 55 to leave the
 * district — can never be climbed. The player would sit in their home district
 * for eternity being told "your reasoning was your own".
 *
 * So the roll happens server-side and the model is told the answer.
 */
export function ambiguityTargetFor(caseNumber: number): number {
  const chapter = Math.min(5, Math.floor((caseNumber - 1) / 10) + 1);
  switch (chapter) {
    case 1:
      return 0.1; // learn that evidence means something
    case 2:
      return 0.25;
    case 3:
      return 0.4;
    case 4:
      return 0.6;
    default:
      return 0.75; // the weight
  }
}

function buildSystemPrompt(ctx: GenerationContext): string {
  const mood = deriveCaseMood(ctx.city);
  const factions = deriveFactions(ctx.city);
  const chapter = Math.min(5, Math.floor((ctx.caseNumber - 1) / 10) + 1);

  const poolText =
    ctx.characterPool.length === 0
      ? 'none — do not reuse any character'
      : ctx.characterPool
          .map(
            (c) =>
              `- ${c.name} (${c.role}, ${c.fate}, from case ${c.originCaseNumber}). May return as: ${echoRolesFor(c.fate).join('; ')}`,
          )
          .join('\n');

  const place = ctx.place;

  return `
You are a case file generator for a legal drama mobile game. This case is heard
in ${place.district}, ${place.countryName}, at ${place.court}, investigated by
${place.policeService}.

SETTING VS PEOPLE — the most important rule here:
The place is real. ${place.district}, ${place.countryName}, ${place.court} and
${place.policeService} are real institutions and should be depicted with real
procedural and cultural texture — how a case actually moves in
${place.countryName}, what the police are actually called, what the money is
(${place.currency}), what the streets and jobs and pressures are.

Every PERSON is fictional and must be invented. Never use the name of a real
person — not a real officer, prosecutor, judge, politician, executive, or
public figure, living or dead, and no thinly-veiled version of one. Do not
reference a real criminal case, a real investigation, or a real scandal. If a
name you are about to write belongs to someone who actually exists in
${place.countryName}, choose a different name. Officers and officials are
fictional individuals who happen to work for a real service.

Names should read as ${place.nameRegister}, and reflect who actually lives in
${place.district} — including immigrant and minority communities where that is
true to the city.

Generate morally ambiguous, never clear-cut cases. Every piece of evidence must
have two valid readings — the prosecution reading and the defence reading must
both be genuinely arguable. Every witness must contain exactly one provable lie
and one ambiguous claim. The lie must be provable from other evidence in the
case, and lie_tell must explain what betrays it. Cases must feel like real human
situations, not genre clichés.

Content policy: ordinary adult crime only — theft, fraud, assault, arson,
corruption, negligence, drugs. No sexual violence. No crimes against children.
No terrorism or mass atrocity. Violence may be referenced but never described
graphically. Depict institutional failure as systemic and individual, never as
an indictment of a real named person.

Tier: this is a ${place.tierLabel}-level matter. A district case is a human
argument between neighbours; a national or international one is a matter of
law, precedent and states. Scale the stakes and the language to the rung.

Current city state (0-100 each):
- crime rate: ${Math.round(ctx.city.crimeRate)}
- judicial trust: ${Math.round(ctx.city.judicialTrust)}
- wealth disparity: ${Math.round(ctx.city.wealthDisparity)}
- organised crime power: ${Math.round(ctx.city.organizedCrimePower)}
- police integrity: ${Math.round(ctx.city.policeIntegrity)}
- media pressure: ${Math.round(ctx.city.mediaPressure)}
Active factions: ${factions.length ? factions.join(', ') : 'none yet'}
Case mood to honour: ${mood}
Chapter: ${chapter} of 5. Case number: ${ctx.caseNumber}.

The player's juror profile: ${ctx.jurorProfileSummary}
Probe this bias: ${ctx.weakestBias}

Characters available from previous cases:
${poolText}

Naming: "name" is the person's name alone — "Tunde Balogun", never "Tunde
Balogun, gate security" and never "Inspector Tunde Balogun". Their standing goes
in "role" ("gate security", "the estranged husband"). Names are identity keys
that persist across cases; a name with a title welded on becomes a different
person the next time they appear.

Generate a case that:
- Fits the current city mood
- Probes the player's identified bias without ever naming it
- Reuses at most ONE character from the pool, and only if chapter >= 2. If you
  reuse one, the reuse must make narrative sense given their fate, and the case
  must reference their past matter-of-factly, as a court record would.
- Keeps prosecution_argument and defence_argument to 40 words or fewer each
- Sets evidence_strength honestly: -1 means the evidence fully favours the
  defence, +1 fully favours the prosecution, 0 means truly balanced
${
    ctx.wantAmbiguous
      ? `- correct_verdict MUST be "ambiguous". This case genuinely has no right
  answer: both readings survive to the end, and an honest juror could go either
  way. Set evidence_strength between -0.3 and 0.3.`
      : `- correct_verdict MUST be "guilty" or "not_guilty" — NOT "ambiguous".
  Something did or did not happen here, and a careful reader of the evidence
  could arrive at it. The case must still be *hard*: the wrong answer should be
  tempting, the witnesses still lie, and the surface reading should favour the
  wrong side. But there is a truth underneath, and evidence_strength must point
  toward it (at least 0.4 away from zero in the direction of the truth).`
  }
- Sets "appearance" (0 unsettling, 100 disarming) INDEPENDENTLY of guilt. Do
  not make guilty defendants look unsettling or innocent ones look harmless —
  the game measures whether the player is swayed by a face, and that only
  works if the face means nothing. Roll it as if blind to the verdict, and let
  sympathetic people be guilty and frightening people be innocent as often as
  not. Never describe the defendant's looks in "background"; the face is shown,
  not narrated.

Return ONLY valid JSON matching this exact schema, no prose, no markdown fence:
{
  "title": "The State v. <name>",
  "charge": "string",
  "defendant": {
    "name": "string",
    "age": number (18-95),
    "occupation": "string",
    "background": "string",
    "wealth": number (0-100 BAND, NOT an amount of money — 0 destitute, 50 ordinary, 100 untouchable),
    "appearance": number (0-100 BAND — 0 unsettling to look at, 50 unremarkable, 100 disarming)
  },
  "accent": "violent" | "financial" | "systemic" | "passion",
  "evidence": [ { "id": "e1", "description": "string", "prosecution_reading": "string", "defence_reading": "string", "is_planted": boolean } ],
  "witnesses": [ { "name": "string", "role": "string", "testimony": "string", "lie": "string", "lie_tell": "string" } ],
  "prosecution_argument": "string",
  "defence_argument": "string",
  "correct_verdict": "guilty" | "not_guilty" | "ambiguous",
  "evidence_strength": number (-1.0 to 1.0),
  "character_pool_additions": [ { "name": "string", "role": "defendant" | "witness" | "prosecutor" | "defender" | "victim", "themes": ["string"] } ]
}
Exactly 3 evidence items and exactly 2 witnesses.
`.trim();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Whether a 429 is worth waiting out.
 *
 * A per-minute 429 clears in seconds and is worth retrying. A per-DAY 429 does
 * not clear for hours, and retrying it four times just burns the clock while a
 * player waits — the honest move is to fall back to the authored docket
 * immediately and let them play.
 */
const RETRY_FLOOR_MS = 8_000;

function retryAfterMs(message: string): number | null {
  if (/per day|TPD|RPD/i.test(message)) return null; // no amount of patience fixes tomorrow

  const m = /try again in ([\d.]+)s/i.exec(message);
  if (m?.[1]) {
    const advised = Math.ceil(Number(m[1]) * 1000) + 250;
    // Groq's advice is when the next *token* frees, not a whole case's worth.
    return advised > 120_000 ? null : Math.max(RETRY_FLOOR_MS, advised);
  }
  return /rate.?limit|429/i.test(message) ? RETRY_FLOOR_MS : null;
}

/**
 * One case, with patience for rate limits.
 *
 * Falling back on a 429 is worse than waiting two seconds: the fallback docket
 * is set in a fictional city and denominated in naira, so serving it to a
 * juror in Oslo breaks the premise far more than a short wait does. Generation
 * happens in the background buffer anyway, where nobody is watching a clock.
 */
async function generateOne(ctx: GenerationContext, attempt = 0): Promise<GeneratedCase | null> {
  if (!groq) return null;

  try {
    const response = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: buildSystemPrompt(ctx) },
        { role: 'user', content: 'Generate the next case file. Return only the JSON object.' },
      ],
      temperature: 0.9,
      // A case JSON lands around 1.2k tokens; reserving 3k just inflates the
      // rate-limit accounting for nothing.
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = generatedCaseSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn('[caseGenerator] schema reject:', parsed.error.issues[0]?.message);
      // A malformed case is usually a bad roll, not a broken prompt.
      return attempt < MAX_ATTEMPTS ? generateOne(ctx, attempt + 1) : null;
    }
    if (violatesPolicy(parsed.data)) {
      console.warn('[caseGenerator] content filter rejected a case');
      return attempt < MAX_ATTEMPTS ? generateOne(ctx, attempt + 1) : null;
    }

    // The model reaches for "ambiguous" whenever it is allowed to, and an
    // all-ambiguous docket freezes standing and locks the ladder. If it
    // ignored the instruction, try again rather than accept a case that
    // quietly breaks progression.
    const isAmbiguous = parsed.data.correct_verdict === 'ambiguous';
    if (isAmbiguous !== ctx.wantAmbiguous && attempt < MAX_ATTEMPTS) {
      return generateOne(ctx, attempt + 1);
    }
    if (isAmbiguous !== ctx.wantAmbiguous) {
      // Out of retries: rather than ship a case that lies about its own
      // answer, take the verdict the evidence actually points at.
      const strength = parsed.data.evidence_strength;
      if (!ctx.wantAmbiguous && Math.abs(strength) >= 0.2) {
        parsed.data.correct_verdict = strength > 0 ? 'guilty' : 'not_guilty';
      }
    }

    return parsed.data;
  } catch (err) {
    const message = (err as Error).message ?? '';
    const wait = retryAfterMs(message);

    if (wait !== null && attempt < MAX_ATTEMPTS) {
      await sleep(wait * (attempt + 1)); // linear backoff
      return generateOne(ctx, attempt + 1);
    }

    console.error("[caseGenerator] groq error:", message.slice(0, 400));
    return null;
  }
}

async function buildContext(
  userId: string,
  caseNumber: number,
  city: CityMetrics,
  place: PlaceContext,
): Promise<GenerationContext> {
  const stats = await computeJurorStats(userId);
  const characterPool = await getEligibleCharacters(userId, caseNumber);

  const summary =
    stats.totalCases === 0
      ? 'no cases heard yet — this is their first'
      : `conviction rate ${Math.round(stats.convictionRate)}%, evidence alignment ${Math.round(stats.evidenceWeight)}%, consistency ${Math.round(stats.consistencyScore)}%, ${stats.totalCases} cases heard`;

  return {
    city,
    jurorProfileSummary: summary,
    weakestBias: weakestBias(stats),
    characterPool,
    caseNumber,
    place,
    wantAmbiguous: Math.random() < ambiguityTargetFor(caseNumber),
  };
}

/**
 * Keeps the player's buffer topped up (GDD 4.3). Called after every verdict and
 * never awaited on the request path — the player must never wait for Groq.
 *
 * The buffer is keyed per user and a user's place can change (promotion, an
 * accepted foreign application), so the queue is dropped when the place moves
 * rather than serving a player five cases from a bench they have left.
 */
export async function refillCaseCache(
  userId: string,
  caseNumber: number,
  city: CityMetrics,
  place: PlaceContext,
) {
  if (!groq) return; // seed docket needs no cache

  // One refill per juror at a time.
  //
  // This is fire-and-forget from the verdict route, so without a lock every
  // verdict starts another worker: ten verdicts leave ten overlapping refills
  // racing to generate thirty cases, which saturates the token budget so
  // completely that the *player's* next case 429s and drops to the fallback
  // docket. The refill starves the thing it exists to feed. The lock expires
  // on its own so a crashed worker cannot wedge the queue shut.
  const lock = `refill-lock:${userId}`;
  const got = await redis.set(lock, '1', 'EX', 180, 'NX').catch(() => null);
  if (got !== 'OK') return;

  try {
    await doRefill(userId, caseNumber, city, place);
  } finally {
    await redis.del(lock).catch(() => {});
  }
}

async function doRefill(userId: string, caseNumber: number, city: CityMetrics, place: PlaceContext) {
  const cached = await redis.llen(caseQueueKey(userId));
  if (cached >= REFILL_BELOW) return;

  const ctx = await buildContext(userId, caseNumber, city, place);
  const wanted = BATCH_SIZE - cached;

  // Sequentially, not Promise.all.
  //
  // Firing five generations at once puts ~12k tokens on the wire in the same
  // instant, which is the entire free-tier per-minute budget — every request
  // 429s together and the whole batch falls through to the fallback docket.
  // Nobody is waiting on this loop (it runs behind the verdict response), so
  // spending a few seconds here costs the player nothing and costs the buffer
  // everything if we skip it.
  //
  // Each case rolls its own answerability, or a whole buffer comes back the
  // same shape.
  for (let i = 0; i < wanted; i++) {
    const generated = await generateOne({
      ...ctx,
      wantAmbiguous: Math.random() < ambiguityTargetFor(caseNumber + i),
    });

    if (generated) {
      await redis.rpush(caseQueueKey(userId), JSON.stringify(generated));
    }
    // Breathe between calls so a full refill does not trip the limiter.
    if (i < wanted - 1) await sleep(SPACING_MS);
  }
}

/**
 * The next case, from the fastest source that has one.
 *
 * Order: Redis buffer → a blocking generate → the authored docket.
 *
 * Note what changed when cases became localised to the player's real country:
 * the authored docket is no longer the scripted opening the GDD describes
 * (§12, "chapters 1-2 use hand-authored cases only"), because those six cases
 * are Nigerian and set in a fictional city — handing them to a juror in Bergen
 * would break the premise on case one. They are now purely the emergency
 * buffer. A scripted opening per country is a content problem, not a code one.
 */
export async function nextCase(
  userId: string,
  caseNumber: number,
  city: CityMetrics,
  place: PlaceContext,
): Promise<{ generated: GeneratedCase; source: 'cache' | 'live' | 'fallback' }> {
  const cached = await redis.lpop(caseQueueKey(userId));
  if (cached) {
    const parsed = generatedCaseSchema.safeParse(JSON.parse(cached));
    if (parsed.success) return { generated: parsed.data, source: 'cache' };
  }

  const ctx = await buildContext(userId, caseNumber, city, place);
  const live = await generateOne(ctx);
  if (live) return { generated: live, source: 'live' };

  return { generated: seedCaseFor(caseNumber), source: 'fallback' };
}

export const accentHexFor = (accent: GeneratedCase['accent']) => ACCENTS[accent];

/**
 * Where this juror currently sits, resolved to the real institutions a case
 * should name.
 */
export function placeForUser(user: {
  id: string;
  homeCountry: string | null;
  homeDistrict: string | null;
  currentCountry: string | null;
  currentTier: Tier;
}): PlaceContext {
  const country = (user.currentCountry ?? user.homeCountry ?? 'NO').toUpperCase();
  const profile = profileFor(country);
  const district = user.homeDistrict ?? districtFor(country, user.id);

  return {
    country,
    countryName: profile.name,
    district,
    court: profile.courtName(user.currentTier, district),
    policeService: profile.policeService(district),
    currency: profile.currency,
    nameRegister: profile.nameRegister,
    tier: user.currentTier,
    tierLabel: tierLabel(user.currentTier, country),
  };
}

/**
 * Drop the buffer. Called when a juror's bench changes — a promotion or an
 * accepted foreign application — so they never receive five pre-generated
 * cases from a court they no longer sit in.
 */
export async function invalidateCaseCache(userId: string) {
  await redis.del(caseQueueKey(userId)).catch(() => {});
}
