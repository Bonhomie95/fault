import { ACCENTS, generatedCaseSchema, type GeneratedCase } from '../domain/case.js';
import type { CityMetrics } from '../domain/city.js';
import { GROQ_MODEL, groq } from '../lib/groq.js';
import { caseQueueKey, redis } from '../lib/redis.js';
import { deriveCaseMood, deriveFactions } from './cityEffects.js';
import { echoRolesFor, getEligibleCharacters, type PoolCharacter } from './characterPool.js';
import { computeJurorStats, weakestBias } from './jurorProfile.js';
import { seedCaseFor, SEED_CASES } from './seedCases.js';

const BATCH_SIZE = 5;
const REFILL_BELOW = 3;

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

interface GenerationContext {
  city: CityMetrics;
  jurorProfileSummary: string;
  weakestBias: string;
  characterPool: PoolCharacter[];
  caseNumber: number;
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

  return `
You are a case file generator for a legal drama mobile game set in Orun City, a
fictional African city. No real legal system, real person, or real case is
depicted.

Generate morally ambiguous, never clear-cut cases. Every piece of evidence must
have two valid readings — the prosecution reading and the defence reading must
both be genuinely arguable. Every witness must contain exactly one provable lie
and one ambiguous claim. The lie must be provable from other evidence in the
case, and lie_tell must explain what betrays it. Cases must feel like real human
situations, not genre clichés.

Content policy: ordinary adult crime only — theft, fraud, assault, arson,
corruption, negligence, drugs. No sexual violence. No crimes against children.
No terrorism or mass atrocity. Violence may be referenced but never described
graphically.

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
- Sets correct_verdict to "ambiguous" when the case genuinely has no right
  answer. In chapter 4 and 5, most cases should be ambiguous.

Return ONLY valid JSON matching this exact schema, no prose, no markdown fence:
{
  "title": "The State v. <name>",
  "charge": "string",
  "defendant": { "name": "string", "age": number, "occupation": "string", "background": "string", "wealth": number },
  "accent": "violent" | "financial" | "systemic" | "passion",
  "evidence": [ { "id": "e1", "description": "string", "prosecution_reading": "string", "defence_reading": "string", "is_planted": boolean } ],
  "witnesses": [ { "name": "string", "role": "string", "testimony": "string", "lie": "string", "lie_tell": "string" } ],
  "prosecution_argument": "string",
  "defence_argument": "string",
  "correct_verdict": "guilty" | "not_guilty" | "ambiguous",
  "evidence_strength": number,
  "character_pool_additions": [ { "name": "string", "role": "defendant" | "witness" | "prosecutor" | "defender" | "victim", "themes": ["string"] } ]
}
Exactly 3 evidence items and exactly 2 witnesses.
`.trim();
}

async function generateOne(ctx: GenerationContext): Promise<GeneratedCase | null> {
  if (!groq) return null;

  try {
    const response = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: buildSystemPrompt(ctx) },
        { role: 'user', content: 'Generate the next case file. Return only the JSON object.' },
      ],
      temperature: 0.9,
      max_tokens: 3000,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = generatedCaseSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn('[caseGenerator] schema reject:', parsed.error.issues[0]?.message);
      return null;
    }
    if (violatesPolicy(parsed.data)) {
      console.warn('[caseGenerator] content filter rejected a case');
      return null;
    }
    return parsed.data;
  } catch (err) {
    console.error('[caseGenerator] groq error:', (err as Error).message);
    return null;
  }
}

async function buildContext(userId: string, caseNumber: number, city: CityMetrics): Promise<GenerationContext> {
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
  };
}

/**
 * Keeps the player's buffer topped up (GDD 4.3). Called after every verdict and
 * never awaited on the request path — the player must never wait for Groq.
 */
export async function refillCaseCache(userId: string, caseNumber: number, city: CityMetrics) {
  if (!groq) return; // seed docket needs no cache

  const cached = await redis.llen(caseQueueKey(userId));
  if (cached >= REFILL_BELOW) return;

  const ctx = await buildContext(userId, caseNumber, city);
  const wanted = BATCH_SIZE - cached;

  const results = await Promise.all(Array.from({ length: wanted }, () => generateOne(ctx)));
  const good = results.filter((c): c is GeneratedCase => c !== null);

  if (good.length > 0) {
    await redis.rpush(caseQueueKey(userId), ...good.map((c) => JSON.stringify(c)));
  }
}

/**
 * The next case, from the fastest source that has one.
 *
 * Order: hand-authored opening (chapters 1-2, fixed narrative) → Redis buffer →
 * a blocking generate → seed docket. The last hop means an unkeyed or
 * unreachable Groq degrades the game's writing, never its playability.
 */
export async function nextCase(
  userId: string,
  caseNumber: number,
  city: CityMetrics,
): Promise<{ generated: GeneratedCase; source: 'authored' | 'cache' | 'live' | 'fallback' }> {
  const authoredWindow = caseNumber <= SEED_CASES.length;
  if (authoredWindow) {
    return { generated: seedCaseFor(caseNumber), source: 'authored' };
  }

  const cached = await redis.lpop(caseQueueKey(userId));
  if (cached) {
    const parsed = generatedCaseSchema.safeParse(JSON.parse(cached));
    if (parsed.success) return { generated: parsed.data, source: 'cache' };
  }

  const ctx = await buildContext(userId, caseNumber, city);
  const live = await generateOne(ctx);
  if (live) return { generated: live, source: 'live' };

  return { generated: seedCaseFor(caseNumber), source: 'fallback' };
}

export const accentHexFor = (accent: GeneratedCase['accent']) => ACCENTS[accent];
