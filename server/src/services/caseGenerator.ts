import type { Tier } from '@prisma/client';
import { ACCENTS, generatedCaseSchema, structureKeyFor, TWIN_GAP, type GeneratedCase } from '../domain/case.js';
import type { CityMetrics } from '../domain/city.js';
import { aiEnabled, availableCount, classifyError, GROQ_MODEL, leaseKey } from '../lib/groq.js';
import { log } from '../lib/log.js';
import { prisma } from '../lib/prisma.js';
import { caseQueueKey, redis } from '../lib/redis.js';
import { districtFor, profileFor, tierLabel } from '../domain/jurisdiction.js';
import { stripPresentation } from '../domain/presentation.js';
import { ambiguityBumpFor, currentDistrictFor, districtLadder } from '../domain/districts.js';
import { rankFor } from '../domain/progression.js';
import { presentsFeminine } from '../domain/nameGender.js';
import { deriveCaseMood, deriveFactions } from './cityEffects.js';
import { localizeCase } from './localizeCase.js';
import { echoRolesFor, getEligibleCharacters, type PoolCharacter } from './characterPool.js';
import { computeJurorStats, weakestBias } from './jurorProfile.js';
import { seedCaseFor, SEED_CASES } from './seedCases.js';

// Re-exported for existing callers; it lives in domain/case now because it is
// a pure function and this module dials Redis on import.
export { structureKeyFor, TWIN_GAP };

/**
 * Buffer sizing, against two real limits.
 *
 * MEASURED, not estimated. A case on openai/gpt-oss-120b at low reasoning
 * effort costs about 830 tokens in total — not the ~3,000 this comment used to
 * claim for llama-3.3. Groq's free tier caps both:
 *   - 12,000 tokens per minute → roughly 14 cases a minute
 *   - 100,000 tokens per DAY   → roughly 120 cases a day, per key
 *
 * With five keys that is ~600 cases a day rather than the ~165 the old
 * arithmetic gave, which is a real difference: it is the gap between a handful
 * of players and a small beta. The daily cap is still the binding constraint
 * and a paid tier is still what this needs to be a product — but the ceiling
 * is three and a half times higher than anyone thought, and it moved because
 * the model changed, not because anything was optimised.
 *
 * The GDD (4.3) specifies batches of five. Three is what the budget affords.
 * On a paid tier, raise BATCH_SIZE and drop SPACING_MS.
 */
/**
 * The completion budget, and why it is not 2000.
 *
 * It was, with a comment explaining that a case lands around 1.2k tokens so
 * reserving 3k was waste. That reasoning was correct for llama-3.3, and it
 * silently became wrong.
 *
 * The models Groq offers now are REASONING models, and their reasoning tokens
 * count against max_tokens before a single character of the answer is emitted.
 * At 2000 the model thought, ran out of budget mid-object, and Groq returned
 * `json_validate_failed` with an empty completion — which this code logged as
 * a generic error and fell back from. Every case, silently.
 *
 * 6000 is comfortably above what a case actually consumes end to end (~830
 * total at low reasoning effort) and cheap to reserve, because it is a CAP and
 * not a spend.
 */
const MAX_COMPLETION_TOKENS = 6000;

/**
 * Reasoning effort, for the models that take it.
 *
 * Low, and this is not a corner cut. Measured against the real case schema,
 * `openai/gpt-oss-120b` at low effort was simultaneously the fastest (1.6s vs
 * 2.7s at medium) and the CHEAPEST (832 total tokens vs 1382) — and both
 * produced a valid case. The extra thinking was buying nothing here: the
 * structure is pinned by the schema and the hard decisions (which names, how
 * ambiguous, which echo, which twin) are all made server-side before the model
 * is asked anything.
 *
 * Sent only to models that understand it; others reject unknown parameters.
 */
function reasoningParams(): Record<string, string> {
  return /gpt-oss/.test(GROQ_MODEL) ? { reasoning_effort: 'low' } : {};
}

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
    ...c.courtroom_lines.map((l) => l.text),
  ].join(' ');
  return BLOCKED_PATTERNS.some((p) => p.test(haystack));
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
  /** 1 home court .. 5 notorious. See domain/districts. */
  difficulty: number;
}

interface GenerationContext {
  /**
   * A special docket's theme (domain/store PACKS), or the Daily Trial's brief.
   * Shapes the kind of case; changes nothing about how it is judged.
   */
  special?: string;
  city: CityMetrics;
  jurorProfileSummary: string;
  weakestBias: string;
  characterPool: PoolCharacter[];
  caseNumber: number;
  place: PlaceContext;
  /** Whether THIS case is allowed to be unanswerable. Decided here, not by
   *  the model — see ambiguityTargetFor. */
  wantAmbiguous: boolean;
  /**
   * A specific person who must appear in this case, or null.
   *
   * The GDD calls the Echo System the game's biggest emotional hook, and until
   * now it was a suggestion in a prompt that nothing checked — echoes fired
   * whenever the model felt like it. If this is set, the returned case is
   * rejected unless it actually contains them.
   */
  mustEcho: PoolCharacter | null;
  /**
   * Names this juror has already met, which must not be reused by accident.
   *
   * A name IS the Echo System's identity key, so a coincidental collision is
   * not cosmetic: two unrelated defendants called Kjetil Jensen become one
   * person in the character pool, their fates merge, and the dossier tells the
   * player "PREVIOUSLY BEFORE YOU" about a stranger. Left to itself the model
   * reaches for the same handful of names out of a small register — it gave us
   * four Kjetil Jensens in five cases.
   */
  usedNames: string[];
  /**
   * The exact names this case must use, supplied rather than requested.
   *
   * Banning names did not work. The model's name register inside one country
   * is small, it fixates, and it ignored a 12-name ban list four retries in a
   * row — every case came back with the same defendant. Worse, being told
   * which names were taken made it narrate the problem into the name field.
   *
   * So the server picks. This is the same move that fixed the all-ambiguous
   * docket: where the model reliably will not comply, take the decision away
   * from it rather than asking louder.
   */
  castNames: { defendant: string; witnesses: [string, string] };
  /**
   * A structural fingerprint this case must match, or null.
   *
   * GDD 2.5 promises two structurally identical cases twenty apart, to see
   * whether you answer the same way. We were scoring that test without ever
   * setting it.
   */
  twinOf: { structureKey: string; ofCaseNumber: number } | null;
}

/** How often a returning face should walk back in, once echoes are possible. */
const ECHO_CHANCE = 0.35;

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

  // An echo is now an instruction, not a hope. The check after generation
  // enforces it.
  const echoText = ctx.mustEcho
    ? `
THIS CASE MUST BRING SOMEONE BACK.

${ctx.mustEcho.name} — ${ctx.mustEcho.role}, ${ctx.mustEcho.fate} in case
${ctx.mustEcho.originCaseNumber} — MUST appear in this case, by that exact name,
spelled exactly that way. They may return as: ${echoRolesFor(ctx.mustEcho.fate).join('; ')}.

Write them in matter-of-factly, the way a court record would. The file should
reference their past as established fact and offer no commentary on it — do not
have anyone say "you may remember" or explain the connection. The juror either
recognises the name or they do not, and the game must not do that work for
them. That recognition is the whole point.
`
    : '';

  // Names are assigned, not requested. See castNames.
  const cast = ctx.castNames;
  // Each person's presentation, from their name — the app renders a woman as
  // a woman, so the text must not call her "a man of my word". Unisex names
  // say nothing, and the model may choose.
  const who = (name: string) => {
    const f = presentsFeminine(name);
    return f === null ? '' : f ? '  (a woman)' : '  (a man)';
  };
  const defendantName = ctx.mustEcho ? ctx.mustEcho.name : cast.defendant;
  const usedText = `
THE CAST OF THIS CASE — USE THESE NAMES EXACTLY, AND NO OTHERS:

  defendant  : ${defendantName}${who(defendantName)}
  witness 1  : ${cast.witnesses[0]}${who(cast.witnesses[0])}
  witness 2  : ${cast.witnesses[1]}${who(cast.witnesses[1])}

Where a person is marked (a woman) or (a man), write them that way — in the
background, the testimony and every courtroom line they speak.

Copy them character for character into the "name" fields and into
character_pool_additions. Do not invent names, do not substitute, do not add a
title, and do not write anything in a "name" field except the name itself.
Every other person in the story stays unnamed — refer to them by their role.
`;

  const twinText = ctx.twinOf
    ? `
STRUCTURAL REQUIREMENT.

This case must have the same SHAPE as an earlier one the juror already decided
(case ${ctx.twinOf.ofCaseNumber}) while sharing none of its specifics:
  ${ctx.twinOf.structureKey}

That key reads: accent : defendant wealth band : which side the evidence
favours : whether evidence was planted : the true verdict. Match every part of
it. Change everything else — the people, the city, the crime, the details.
Nobody should recognise it as the same case; it should only feel familiar in a
way they cannot place.
`
    : '';

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

${ctx.special ? `SPECIAL DOCKET — this case MUST fit this brief:\n${ctx.special}\n\n` : ''}Current city state (0-100 each):
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
${echoText}${twinText}${usedText}

Naming: "name" is the person's name alone — "Anna Weber", never "Anna
Weber, gate security" and never "Inspector Anna Weber". Their standing goes
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

- Writes "courtroom_lines": 9 to 12 short things people SAY OUT LOUD in the
  room while the juror deliberates. This is the drama — make the juror doubt
  what they just read. Mix:
    * the defendant interrupting when an exhibit is examined (cue "e1".."e3"),
      disputing it, explaining it away, or turning it back on someone
    * the defendant appealing straight to the juror (cue "open" and "late")
    * each witness digging in when called (cue "witness1"/"witness2"), sure of
      themselves — including the one who is lying
    * counsel jabbing across the room (speaker "prosecution"/"defence", cue
      "arguments" or an exhibit cue)
  Lines should sway or unsettle: confident half-truths, a sharp question, an
  accusation against a witness, a detail that sounds important and might not
  be, an emotional plea.
  THE RULE THAT MATTERS: every line must be something the speaker would say
  whether the defendant is guilty OR innocent. Never confess, never hint at
  the true verdict, never reveal a witness's lie or its tell (a witness never
  admits, or half-admits, lying or being unsure), never introduce a new fact
  that settles the case. A juror who believes the loudest voice must
  be following nothing. Each line at most 20 words, in the voice of the person.

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
  "character_pool_additions": [ { "name": "string", "role": "defendant" | "witness" | "prosecutor" | "defender" | "victim", "themes": ["string"] } ],
  "courtroom_lines": [ { "speaker": "defendant" | "witness1" | "witness2" | "prosecution" | "defence", "cue": "open" | "e1" | "e2" | "e3" | "witness1" | "witness2" | "arguments" | "late", "tone": "pleading" | "defiant" | "tense" | "ashamed" | "startled" | "calm", "text": "string" } ]
}
Exactly 3 evidence items and exactly 2 witnesses.
`.trim();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Stable 32-bit hash — same juror and case, same fallback cast, forever. */
export function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

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
/**
 * How long one generation may take before we stop waiting.
 *
 * There was no timeout at all. The Groq SDK will wait as long as the socket
 * stays open, which on the request path meant a player could be held past
 * their client's own 15-second limit with no ceiling above it.
 */
const GENERATION_TIMEOUT_MS = 20_000;

/**
 * How long a player may be kept waiting for a case, in total.
 *
 * The client gives up at 15 seconds, and a case that arrives after that is a
 * case nobody sees, generated at full token cost. Ten leaves margin for the
 * round trip and the database write that follows, and comfortably fits two or
 * three attempts at the ~2s a generation actually takes — so one malformed
 * roll no longer costs the player a real case.
 */
const URGENT_BUDGET_MS = 10_000;

interface GenerateOptions {
  /**
   * Whether a human is waiting on this.
   *
   * On the background refill nobody is watching, so retries and rate-limit
   * sleeps are free and worth having. On the request path they are the
   * opposite of free — see nextCase.
   */
  urgent?: boolean;
  /**
   * Epoch ms after which an urgent generation gives up, whatever it is doing.
   *
   * A BUDGET, not an attempt count, and the distinction turned out to matter.
   * The first version of this fix gave the request path a single attempt — and
   * a single attempt is hostage to one bad roll: the model returns two
   * evidence items instead of three, the schema rejects it, and the player is
   * handed the fallback docket despite there being eight seconds and four
   * healthy keys still available. I watched that happen.
   *
   * Bound the thing the player actually experiences (time), not the thing they
   * cannot see (attempts). A retry that fits inside the deadline costs them
   * nothing; one that does not never starts.
   */
  deadline?: number;
}

async function generateOne(
  ctx: GenerationContext,
  opts: GenerateOptions = {},
  attempt = 0,
): Promise<GeneratedCase | null> {
  if (!aiEnabled) return null;

  // A key per attempt: a retry after a rate limit should land on a *different*
  // key, or it is not a retry, it is the same wall twice.
  const lease = leaseKey();
  if (!lease) {
    // Every key parked. The pool is spent; waiting will not help.
    return null;
  }

  // An urgent generation is capped by the wall clock, not by a retry count.
  // Whatever is left of the budget is how long this attempt may take; when the
  // budget is gone the caller falls back instantly.
  const remainingMs = opts.deadline ? opts.deadline - Date.now() : GENERATION_TIMEOUT_MS;
  if (opts.urgent && remainingMs <= 500) {
    lease.release('ok'); // nothing was spent, so the key is still healthy
    return null;
  }

  const timeoutMs = opts.urgent
    ? Math.min(remainingMs, GENERATION_TIMEOUT_MS)
    : GENERATION_TIMEOUT_MS;
  // Retries on the urgent path are governed by the deadline check above, so
  // the count only needs to be high enough not to be the binding constraint.
  const maxAttempts = MAX_ATTEMPTS;

  try {
    const response = await lease.client.chat.completions.create(
      {
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: buildSystemPrompt(ctx) },
          { role: 'user', content: 'Generate the next case file. Return only the JSON object.' },
        ],
        temperature: 0.9,
        max_tokens: MAX_COMPLETION_TOKENS,
        response_format: { type: 'json_object' },
        ...reasoningParams(),
      },
      { timeout: timeoutMs },
    );

    // The call itself succeeded, so the key is healthy whatever the content
    // turns out to be. Say so before any content check can return early.
    lease.release('ok');

    const raw = response.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = generatedCaseSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      log.warn('case rejected by schema', { issue: parsed.error.issues[0]?.message });
      // A malformed case is usually a bad roll, not a broken prompt.
      return attempt < maxAttempts ? generateOne(ctx, opts, attempt + 1) : null;
    }
    if (violatesPolicy(parsed.data)) {
      log.warn('case rejected by content filter');
      return attempt < maxAttempts ? generateOne(ctx, opts, attempt + 1) : null;
    }

    // The model reaches for "ambiguous" whenever it is allowed to, and an
    // all-ambiguous docket freezes standing and locks the ladder. If it
    // ignored the instruction, try again rather than accept a case that
    // quietly breaks progression.
    const isAmbiguous = parsed.data.correct_verdict === 'ambiguous';
    if (isAmbiguous !== ctx.wantAmbiguous && attempt < maxAttempts) {
      return generateOne(ctx, opts, attempt + 1);
    }

    // The names are ours, not the model's — see enforceCast. This also
    // guarantees the echo is present, because the echo IS the defendant name
    // when one is due.
    const cast = enforceCast(parsed.data, ctx.castNames, ctx.mustEcho);

    // And so is the body. appearance/demeanour/oddity are re-rolled here from
    // a source that has never seen correct_verdict — see domain/presentation.
    // The model writes the person; the server decides how they look, stand and
    // unsettle, because a model asked to be uncorrelated with guilt is a model
    // that will quietly make the guilty shifty and report that it did not.
    stripPresentation(cast);

    // The twin must actually be a twin, or the consistency probe is measuring
    // two unrelated cases and calling the juror inconsistent for noticing.
    if (ctx.twinOf && structureKeyFor(cast) !== ctx.twinOf.structureKey) {
      if (attempt < maxAttempts) return generateOne(ctx, opts, attempt + 1);
      log.warn('twin did not match; shipping as an ordinary case');
    }
    if (isAmbiguous !== ctx.wantAmbiguous) {
      // Out of retries: rather than ship a case that lies about its own
      // answer, take the verdict the evidence actually points at.
      const strength = cast.evidence_strength;
      if (!ctx.wantAmbiguous && Math.abs(strength) >= 0.2) {
        cast.correct_verdict = strength > 0 ? 'guilty' : 'not_guilty';
      }
    }

    /**
     * `cast`, not `parsed.data`.
     *
     * This line said `return parsed.data`, and that quietly threw away every
     * correction above it. `enforceCast` does a JSON round-trip and returns a
     * NEW object; it never mutates its argument. So the server-assigned names
     * were computed, the echo was guaranteed, the presentation was re-rolled —
     * and then the MODEL'S original object was shipped instead.
     *
     * Everything the surrounding comments describe as load-bearing was inert:
     *
     *   - the cast names never applied, so the model's own naming stood. Two
     *     consecutive cases both came back as "Astrid Pedersen" while I was
     *     testing this, which is the exact collision `pickCast` exists to
     *     prevent — and a name IS the Echo System's identity key, so a
     *     collision merges two strangers into one person in the pool.
     *   - a required echo was not actually guaranteed to be present.
     *   - the character_pool_additions rewrite never happened.
     */
    return cast;
  } catch (err) {
    const message = (err as Error).message ?? '';
    const kind = classifyError(message);
    lease.release(kind);

    if (attempt < maxAttempts) {
      // A spent key is not a reason to wait — it is a reason to use another
      // one. Only pause when the whole pool is busy at the minute level.
      if (kind === 'day-limit') return generateOne(ctx, opts, attempt + 1);

      const wait = retryAfterMs(message);
      if (wait !== null) {
        // With keys to spare, hop straight to the next rather than sleeping.
        if (availableCount() > 0) return generateOne(ctx, opts, attempt + 1);
        // Sleeping is for the background refill only. On the request path a
        // rate-limit backoff is guaranteed to outlast any sane deadline, and
        // waiting it out is exactly the behaviour that was charging players
        // for the server being busy.
        if (opts.urgent) return null;
        await sleep(wait * (attempt + 1));
        return generateOne(ctx, opts, attempt + 1);
      }
    }

    log.error('groq generation failed', { urgent: opts.urgent === true, err: message.slice(0, 300) });
    return null;
  }
}

async function buildContext(
  userId: string,
  caseNumber: number,
  city: CityMetrics,
  place: PlaceContext,
  /**
   * Names already spoken for by earlier cases in the same refill batch.
   *
   * The batch generates three cases before the player has delivered a single
   * verdict, so none of them are in the character pool yet and each would draw
   * its cast as though the others did not exist — two cases in one buffer came
   * back with an identical cast. The pool cannot know about people who have
   * not been judged yet, so the batch has to carry them itself.
   */
  reserved: string[] = [],
): Promise<GenerationContext> {
  const stats = await computeJurorStats(userId);

  // Themes are passed now. They never were, which made the thematic-resonance
  // filter in characterPool unreachable code — the pool came back in
  // relevance order and the model picked whoever it liked.
  const themes = themesForCity(city);
  const characterPool = await getEligibleCharacters(userId, caseNumber, themes);

  // Roll the echo here rather than leaving it to the model's mood.
  const mustEcho =
    characterPool.length > 0 && Math.random() < ECHO_CHANCE
      ? characterPool[Math.floor(Math.random() * characterPool.length)]!
      : null;

  const twinOf = await findTwinTarget(userId, caseNumber);

  // Everyone already in this juror's record.
  const known = await prisma.character.findMany({
    where: { userId },
    select: { name: true },
    take: 200,
  });
  const usedNames = [...known.map((k) => k.name), ...reserved].filter(
    (n) => n !== mustEcho?.name,
  );
  // The echo's name must be excluded too. It is filtered OUT of usedNames (so
  // the model is allowed to use it), which meant pickCast could hand the same
  // name to a witness — producing a case where the defendant and a witness
  // were the same person: "Kari Fjell | Kari Fjell, Maja Vik".
  const castNames = pickCast(
    place.country,
    mustEcho ? [...usedNames, mustEcho.name] : usedNames,
    `${userId}:${caseNumber}`,
  );

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
    // Harder districts are more often genuinely unanswerable — that is what
    // makes them hard, since the clock is the same everywhere.
    wantAmbiguous: twinOf
      ? false
      : Math.random() < ambiguityTargetFor(caseNumber) + ambiguityBumpFor(place.difficulty ?? 1),
    mustEcho,
    twinOf,
    usedNames,
    castNames,
  };
}

/**
 * Three names this juror has never seen, from their own country's register.
 *
 * Deterministic per case, so a retry does not reshuffle the cast — and drawn
 * from the same texture pools the offline docket uses, so the AI path and the
 * fallback path name people the same way.
 *
 * If the register is exhausted (a very long career), a middle name is added
 * rather than colliding: "Ingrid Solberg" becomes "Ingrid Marte Solberg". A
 * new person, still plausibly local, still unique.
 */
function pickCast(
  country: string,
  used: string[],
  seed: string,
): { defendant: string; witnesses: [string, string] } {
  const t = profileFor(country).texture;
  const taken = new Set(used);
  const chosen: string[] = [];
  let h = hashSeed(seed);

  const roll = () => {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    return h;
  };

  const next = (): string => {
    // Pass 1: an ordinary name. 10 given x 10 surnames is 100 people per
    // country, which sounds like plenty and is not: three names a case means a
    // career runs out of strangers in 33 cases.
    for (let i = 0; i < 250; i++) {
      const r = roll();
      const name = `${t.givenNames[r % t.givenNames.length]} ${t.surnames[(r >> 7) % t.surnames.length]}`;
      if (!taken.has(name) && !chosen.includes(name)) return name;
    }

    // Pass 2: a second surname rather than a middle given name.
    //
    // The first attempt at this inserted another given name and produced
    // "Kari Kari Vik" — nobody is called that. A double-barrelled surname is
    // plausible in every register here (Solberg-Vik, Okonkwo-Bello,
    // Silva-Ferreira) and multiplies the pool by ten to ~1,100 people, which
    // outlasts any real career.
    for (let i = 0; i < 250; i++) {
      const r = roll();
      const first = t.givenNames[r % t.givenNames.length]!;
      const a = t.surnames[(r >> 7) % t.surnames.length]!;
      const b = t.surnames[(r >> 13) % t.surnames.length]!;
      if (a === b) continue;
      const name = `${first} ${a}-${b}`;
      if (!taken.has(name) && !chosen.includes(name)) return name;
    }

    // Pass 3 does not exist. A juror who has met 1,100 people has earned a
    // repeat, and a repeat is better than a hang.
    const r = roll();
    return `${t.givenNames[r % t.givenNames.length]} ${t.surnames[(r >> 7) % t.surnames.length]}`;
  };

  for (let i = 0; i < 3; i++) chosen.push(next());
  return { defendant: chosen[0]!, witnesses: [chosen[1]!, chosen[2]!] };
}

/**
 * Make the cast the cast, whatever the model decided.
 *
 * Three escalating attempts to get unique names failed in turn: asking for
 * variety (four Kjetil Jensens), banning used names (ignored, and it started
 * narrating the ban into the name field), and assigning names outright
 * ("Astrid Nytun" — a surname that does not exist in our register at all).
 * The model simply will not take naming instructions.
 *
 * So the names are rewritten here instead of requested. The story does not
 * care what its people are called; the Echo System cares enormously, because
 * the name IS the identity key. Substitution is textual and global — the
 * surname goes too, since testimony says "Nwosu's code" and half-renaming a
 * person is worse than not renaming them.
 *
 * This is the localizeCase trick applied to the AI path: let the model write
 * the drama, and let the server own the facts the systems depend on.
 */
function enforceCast(
  c: GeneratedCase,
  cast: { defendant: string; witnesses: [string, string] },
  mustEcho: PoolCharacter | null,
): GeneratedCase {
  const want = [mustEcho?.name ?? cast.defendant, cast.witnesses[0], cast.witnesses[1]];
  const got = [c.defendant.name, c.witnesses[0]?.name, c.witnesses[1]?.name];

  let blob = JSON.stringify(c);

  for (let i = 0; i < 3; i++) {
    const from = got[i];
    const to = want[i];
    if (!from || !to || from === to) continue;

    // Longest first: replacing the surname before the full name would leave
    // the given name orphaned against a new surname.
    blob = blob.split(from).join(to);

    const fromLast = from.trim().split(/\s+/).pop();
    const toLast = to.trim().split(/\s+/).pop();
    // Only swap a bare surname if it is distinctive enough to be safe — a
    // three-letter surname would rewrite words inside ordinary prose.
    if (fromLast && toLast && fromLast !== toLast && fromLast.length >= 4) {
      blob = blob.split(fromLast).join(toLast);
    }
  }

  const rewritten = JSON.parse(blob) as GeneratedCase;

  // The pool additions must name the final cast, or the echo breaks at the
  // exact point it is supposed to work.
  rewritten.defendant.name = want[0]!;
  if (rewritten.witnesses[0]) rewritten.witnesses[0].name = want[1]!;
  if (rewritten.witnesses[1]) rewritten.witnesses[1].name = want[2]!;
  rewritten.character_pool_additions = [
    { name: want[0]!, role: 'defendant', themes: [] },
    { name: want[1]!, role: 'witness', themes: [] },
    { name: want[2]!, role: 'witness', themes: [] },
  ];

  return rewritten;
}

/**
 * Is a twin due?
 *
 * GDD 2.5: the same structure, twenty cases later, to see whether the juror
 * answers the same way. We look back exactly TWIN_GAP cases and, if that case
 * has a fingerprint and has not already been twinned, ask for a match.
 */
async function findTwinTarget(
  userId: string,
  caseNumber: number,
): Promise<{ structureKey: string; ofCaseNumber: number } | null> {
  const targetNumber = caseNumber - TWIN_GAP;
  if (targetNumber < 1) return null;

  const original = await prisma.case.findFirst({
    where: { userId, caseNumber: targetNumber, structureKey: { not: null } },
    select: { structureKey: true, caseNumber: true },
  });
  if (!original?.structureKey) return null;

  // Only once: a fingerprint that keeps recurring stops being a probe and
  // starts being a rut.
  const alreadyTwinned = await prisma.case.count({
    where: { userId, structureKey: original.structureKey, caseNumber: { gt: targetNumber } },
  });
  if (alreadyTwinned > 0) return null;

  return { structureKey: original.structureKey, ofCaseNumber: original.caseNumber };
}

/** What this city is currently about, for choosing who can plausibly return. */
function themesForCity(city: CityMetrics): string[] {
  const themes: string[] = [];
  if (city.organizedCrimePower > 60) themes.push('corruption', 'violence');
  if (city.policeIntegrity < 40) themes.push('police', 'systemic');
  if (city.wealthDisparity > 65) themes.push('class', 'fraud', 'housing');
  if (city.crimeRate > 60) themes.push('theft', 'violence');
  if (city.mediaPressure > 60) themes.push('systemic');
  return themes;
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
  if (!aiEnabled) return; // seed docket needs no cache

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
  // A fresh context per case, not one context reused three times.
  //
  // Each case rolls its own answerability, its own echo and its own twin
  // target — sharing a context would echo the same person into all three and
  // give them one twin between them, which is a buffer of the same case with
  // different names. The extra queries are free here: this loop already waits
  // 21 seconds between calls and nobody is watching it.
  // Names claimed so far in this batch, so case three does not reuse case
  // one's cast — neither has been judged yet, so the pool has never heard of
  // either of them.
  const reserved: string[] = [];

  for (let i = 0; i < wanted; i++) {
    const ctx = await buildContext(userId, caseNumber + i, city, place, reserved);
    const generated = await generateOne(ctx);

    if (generated) {
      reserved.push(
        generated.defendant.name,
        ...generated.witnesses.map((w) => w.name),
      );
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
/**
 * A case written to a brief — a special docket, or the Daily Trial.
 *
 * Never from the buffer (the buffer is ordinary cases) and never from the
 * authored docket (which has no themes): null means "not now", and the caller
 * says so rather than serving something that is not what was bought.
 */
export async function specialCase(
  userId: string,
  caseNumber: number,
  city: CityMetrics,
  place: PlaceContext,
  special: string,
  budgetMs = 14_000,
): Promise<GeneratedCase | null> {
  const ctx = await buildContext(userId, caseNumber, city, place);
  ctx.special = special;
  return generateOne(ctx, { urgent: true, deadline: Date.now() + budgetMs });
}

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

  /**
   * A buffer miss, with a player waiting.
   *
   * This used to call generateOne with the full retry policy: up to four
   * attempts, and on a rate limit `sleep(wait * (attempt + 1))` from an
   * eight-second floor. Worst case it blocked the request for well over a
   * minute, with no timeout on the Groq call underneath it.
   *
   * The client gives up at fifteen seconds. So the player saw "The court did
   * not answer" — while this function carried on, finished, and the route
   * created the case and stamped servedAt. On the retry they were handed that
   * case with the generation latency already deducted from their 120 seconds.
   * The player was charged, in the only currency this game has, for the server
   * being slow.
   *
   * `urgent` means one attempt and an eight-second ceiling. If it does not
   * land in that window, the authored docket does — instantly. A cold buffer
   * should cost the player texture, never clock.
   */
  const ctx = await buildContext(userId, caseNumber, city, place);
  const live = await generateOne(ctx, {
    urgent: true,
    deadline: Date.now() + URGENT_BUDGET_MS,
  });
  if (live) return { generated: live, source: 'live' };

  // Everything AI is spent, slow, or broken. The authored docket, moved to
  // wherever this juror actually lives — see localizeCase.
  log.info('serving fallback docket', { userId, caseNumber, keysLeft: availableCount() });

  const profile = profileFor(place.country);
  return {
    // The authored docket gets a fresh roll too. Hand-written cases have
    // FIXED verdicts, so a fixed presentation on each would be perfectly
    // correlated with guilt for anyone who played them twice.
    generated: stripPresentation(localizeCase(seedCaseFor(caseNumber), {
      profile,
      district: place.district,
      court: place.court,
      policeService: place.policeService,
      // Per juror and per case: two players see different casts, and one
      // player revisiting a case sees the same one.
      seed: hashSeed(`${userId}:${caseNumber}`),
    })),
    source: 'fallback',
  };
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
  currentDistrict?: string | null;
  xp?: number;
}): PlaceContext {
  const country = (user.currentCountry ?? user.homeCountry ?? 'NO').toUpperCase();
  const profile = profileFor(country);
  const home = user.homeDistrict ?? districtFor(country, user.id);
  // The seat the player chose, if they have opened it; home otherwise.
  const seat = {
    rank: rankFor(user.xp ?? 0).level,
    homeCountry: user.homeCountry,
    currentCountry: user.currentCountry,
    homeDistrict: home,
    currentDistrict: user.currentDistrict ?? null,
  };
  const district = currentDistrictFor(seat);
  const difficulty = districtLadder(seat).find((d) => d.name === district)?.difficulty ?? 1;

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
    difficulty,
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
