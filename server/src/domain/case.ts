import { z } from 'zod';

/** GDD 5.1 — accent is chosen by case mood, never by the player. */
export const ACCENTS = {
  violent: '#C23B22',
  financial: '#D4860A',
  systemic: '#1D7E6A',
  passion: '#6B4FBB',
} as const;

export type AccentKey = keyof typeof ACCENTS;

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * A name has to look like a name.
 *
 * This is not pedantry — it is a real failure mode. Once the prompt started
 * telling the model which names were already taken, it began narrating the
 * decision into the field: a witness came back called
 * "Lena Jensen is taken, using: Cecilie Foss". The schema accepted it, because
 * `name` was `z.string()` and that string is a string.
 *
 * A name is also the Echo System's identity key, so a field full of the
 * model's reasoning is not just ugly on screen — it becomes a character in the
 * pool who can never be recognised again.
 *
 * Deliberately permissive about *scripts*: Ingrid Solberg, 李伟, Ngozi
 * Okonkwo-Bello and Jean-Luc D'Arcy are all fine. What it rejects is prose.
 */
export const personName = z
  .string()
  .trim()
  .min(2)
  .max(48)
  .refine((s) => wordCount(s) <= 4, { message: 'a name, not a sentence' })
  .refine((s) => !/[:;,]|\d/.test(s), { message: 'names carry no punctuation or digits' })
  .refine((s) => !/\b(is|are|was|using|taken|instead|already|unavailable|name)\b/i.test(s), {
    message: 'the model narrated instead of naming',
  })
  // No titles. This is the identity-key bug that already bit the authored
  // docket once: "Sergeant Musa Danjuma" and "Musa Danjuma" are one person and
  // two keys, so the Echo System never recognises him on the way back. The
  // rank belongs in `role`, which exists for exactly this.
  .refine(
    (s) =>
      !/^(dr|mr|mrs|ms|miss|prof|professor|sgt|sergeant|insp|inspector|officer|constable|detective|judge|justice|capt|captain|lt|lieutenant)\b\.?/i.test(
        s,
      ),
    { message: 'the title belongs in role, not in the name' },
  );

/** Both arguments are capped at 40 words (GDD 2.1). */
const argument = z
  .string()
  .min(1)
  .refine((s) => wordCount(s) <= 40, { message: 'argument exceeds 40 words' });

export const evidenceSchema = z.object({
  id: z.string(),
  description: z.string(),
  /** Every piece of evidence must read two ways. That is the whole game. */
  prosecution_reading: z.string(),
  defence_reading: z.string(),
  is_planted: z.boolean().default(false),
});

export const witnessSchema = z.object({
  /**
   * The person's name and nothing else — no ", gate security" qualifier.
   * This string is the Echo System's identity key: it is what gets written to
   * the character pool, what a later case is matched against, and what seeds
   * the silhouette. A descriptor baked in here makes the same human a
   * different person on their second appearance.
   */
  name: personName,
  /** How they come to be testifying: "gate security", "the estranged husband". */
  role: z.string().default(''),
  testimony: z.string(),
  /** Each witness carries one provable lie and one ambiguous claim (GDD 2.1). */
  lie: z.string(),
  lie_tell: z.string(),
});

/**
 * Who can speak in the room, and what sets them off.
 *
 * `cue` is the moment in the player's two minutes that prompts the line: the
 * defendant tab opening, an exhibit being lifted, a witness being called to
 * the stand, the arguments being read, or the clock getting short.
 */
export const SPEAKERS = ['defendant', 'witness1', 'witness2', 'prosecution', 'defence'] as const;
export const CUES = ['open', 'e1', 'e2', 'e3', 'witness1', 'witness2', 'arguments', 'late'] as const;
export const TONES = ['pleading', 'defiant', 'tense', 'ashamed', 'startled', 'calm'] as const;

/**
 * A line somebody says out loud in the courtroom.
 *
 * THESE ARE PRESENTATION, NOT EVIDENCE, and they obey the same rule as the
 * face: a line must be something the speaker would say whether or not the
 * defendant did it. An outburst, a pointed question to the juror, a witness
 * digging in, counsel needling — all of it pulls, none of it answers. A line
 * that could only come from a guilty (or only from an innocent) defendant
 * would be the game answering its own question, and the case is rejected for
 * it rather than shown.
 */
export const courtroomLineSchema = z.object({
  speaker: z.enum(SPEAKERS),
  cue: z.enum(CUES),
  tone: z.enum(TONES).catch('tense'),
  text: z
    .string()
    .trim()
    .min(2)
    .max(160)
    .refine((s) => wordCount(s) <= 24, { message: 'a line, not a speech' }),
});

export type CourtroomLine = z.infer<typeof courtroomLineSchema>;

/**
 * Lines that would give the answer away, whoever says them.
 *
 * The model writes these lines KNOWING the verdict, which is the same trap
 * presentation.ts describes for the face: asked for verdict-blind dialogue it
 * will still, now and then, have a guilty defendant mutter "I never meant for
 * it to go that far". That is a confession, and one of them in a case turns
 * the whole two minutes into a listening test.
 *
 * So the obvious tells are dropped here rather than hoped against: admissions,
 * "it was an accident", "I'm sorry for what I did" — and a witness conceding
 * the lie they are hiding ("I never intended to lie…"), which the model
 * produced within the first live case. Denials are allowed — the
 * guilty and the innocent both deny — and so are appeals, accusations and
 * questions. This is a coarse net; the prompt is the fine one.
 */
const CONFESSION = [
  /\bi did it\b/i,
  /\bi('m| am) guilty\b/i,
  /\bi confess\b/i,
  /\b(never|didn'?t|did not) mean(t)? (for it |to)\b/i,
  /\bit was an accident\b/i,
  /\bsorry for what i('ve)? did\b/i,
  /\bi (had|needed) to (do it|take it)\b/i,
  /\bi only (took|borrowed)\b/i,
  /\b(he|she|they) (is|are) (lying|telling the truth)\b.*\bi know\b/i,
  // A witness owning up to the lie the game hides from the juror (Witness.lie).
  /\b(meant|intended|mean|intend) to lie\b/i,
  /\bi (lied|was lying|made (it|that) up)\b/i,
  /\bi (may|might) have (lied|been wrong about what i saw)\b/i,
];

export function leaksVerdict(text: string): boolean {
  const t = text.replace(/[’‘]/g, "'");
  return CONFESSION.some((p) => p.test(t));
}

export const characterAdditionSchema = z.object({
  name: personName,
  role: z.enum(['defendant', 'witness', 'prosecutor', 'defender', 'victim']),
  themes: z.array(z.string()).default([]),
});

export const generatedCaseSchema = z.object({
  title: z.string(),
  charge: z.string(),
  defendant: z.object({
    name: personName,
    age: z.number().int().min(18).max(95),
    occupation: z.string(),
    background: z.string(),
    /** 0 = destitute, 100 = untouchable. Never surfaced to the player. */
    wealth: z.number().min(0).max(100).default(50),
    /**
     * How sympathetic this person *looks* — 0 unsettling, 100 disarming.
     * Drives the 3D face only. Must be uncorrelated with guilt: the whole
     * measurement depends on appearance carrying no information, so that a
     * juror who follows the face is following nothing.
     */
    appearance: z.number().min(0).max(100).default(50),
    /**
     * BODY LANGUAGE — 0 closed and defensive, 100 open and still.
     *
     * The second thing a juror reads off a person, and the second thing that
     * tells them nothing. A defendant who sits hunched with folded arms is not
     * more likely to have done it; a defendant who sits open and level is not
     * less. Measured as `demeanour_bias` for exactly that reason.
     *
     * Rolled by the SERVER, never by the model — see rollPresentation. The
     * model is a good writer and a hopeless randomiser: asked for a number
     * uncorrelated with guilt it will quietly make guilty people shifty,
     * because that is what the stories it learned from do.
     */
    demeanour: z.number().min(0).max(100).default(50),
    /**
     * ODDITY — 0 unremarkable, 100 openly strange.
     *
     * The uncanny axis: a gaze that does not quite meet yours, a face slightly
     * out of true, stillness held a beat too long. Things that unsettle and
     * mean nothing at all.
     *
     * This is the sharpest of the three, because strangeness is the bias
     * people are least willing to admit to and least able to justify. A juror
     * who convicts the odd one has done something they could not defend to a
     * defendant, and the Juror Record will say so.
     *
     * Server-rolled, for the same reason as demeanour.
     */
    oddity: z.number().min(0).max(100).default(50),
  }),
  accent: z.enum(['violent', 'financial', 'systemic', 'passion']),
  evidence: z.array(evidenceSchema).length(3),
  witnesses: z.array(witnessSchema).length(2),
  prosecution_argument: argument,
  defence_argument: argument,
  correct_verdict: z.enum(['guilty', 'not_guilty', 'ambiguous']),
  /** -1 fully favours defence .. +1 fully favours prosecution. */
  evidence_strength: z.number().min(-1).max(1).default(0),
  character_pool_additions: z.array(characterAdditionSchema).default([]),
  /** Optional: an older generation, or a model that drops it, still makes a
   *  case. The client falls back to its own generic lines. Malformed lines are
   *  dropped one by one rather than sinking the whole case. */
  courtroom_lines: z
    .array(z.unknown())
    .default([])
    .transform((lines) =>
      lines.flatMap((l) => {
        const parsed = courtroomLineSchema.safeParse(l);
        return parsed.success && !leaksVerdict(parsed.data.text) ? [parsed.data] : [];
      }),
    ),
});

export type GeneratedCase = z.infer<typeof generatedCaseSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type Witness = z.infer<typeof witnessSchema>;

/**
 * GDD 2.5 — how far apart a case and its structural twin sit.
 *
 * Lives here with structureKeyFor for the same reason: both are pure, and
 * caseGenerator opens a Redis connection at import time. A test that wants to
 * assert the gap should not have to start a database client to do it.
 */
export const TWIN_GAP = 20;

/**
 * A structural fingerprint, deliberately blind to names and specifics.
 * Two cases with the same key are the same case wearing different clothes —
 * that is how the consistency probe works (GDD 2.5).
 *
 * This lives in domain, not in caseGenerator, because it is a pure function
 * and caseGenerator opens a Redis connection at import time — anything that
 * wants this fingerprint should not have to dial a database to get it.
 */
export function structureKeyFor(c: GeneratedCase): string {
  const wealthBand = c.defendant.wealth <= 30 ? 'poor' : c.defendant.wealth >= 70 ? 'rich' : 'mid';
  const strengthBand =
    c.evidence_strength <= -0.4 ? 'defence' : c.evidence_strength >= 0.4 ? 'prosecution' : 'balanced';
  const planted = c.evidence.some((e) => e.is_planted) ? 'planted' : 'clean';
  return `${c.accent}:${wealthBand}:${strengthBand}:${planted}:${c.correct_verdict}`;
}

/** The shape the mobile client actually receives. Note what is absent:
 *  correct_verdict, evidence_strength, is_planted, and lie_tell never ship.
 *  The player is not allowed to know the answer. */
export interface ClientCase {
  id: string;
  caseNumber: number;
  title: string;
  charge: string;
  accent: string;
  mood: string;
  clockSeconds: number;
  /** Real place, real court, real police service. Every person is invented. */
  place: {
    country: string;
    jurisdiction: string;
    tier: string;
    tierLabel: string;
  };
  defendant: {
    name: string;
    age: number;
    occupation: string;
    background: string;
    portraitSeed: number;
    /** Shipped to the client because the face has to be drawn. It is the one
     *  "hidden" value the player is *meant* to see — just not as a number. */
    appearance: number;
    /** 0 closed and defensive .. 100 open and still. Means nothing. */
    demeanour: number;
    /** 0 unremarkable .. 100 openly strange. Means nothing. */
    oddity: number;
    /** How their NAME reads — see domain/nameGender. Null when it could be either. */
    feminine: boolean | null;
  };
  evidence: { id: string; description: string; prosecution_reading: string; defence_reading: string }[];
  witnesses: { name: string; role: string; testimony: string; feminine: boolean | null }[];
  prosecutionArgument: string;
  defenceArgument: string;
  /** What people say out loud in the room. Presentation; see CourtroomLine. */
  lines: CourtroomLine[];
  /** Names in this case the player has judged before. The Echo System (GDD 2.4)
   *  never announces itself — this only marks who is returning, not how. */
  /**
   * True when this case's window closed while the player was away.
   *
   * The client shows the adjournment and lets them acknowledge it before the
   * forced verdict is submitted, rather than firing one the instant the screen
   * loads. The outcome is identical; being told is the difference between a
   * consequence and a bug.
   */
  adjourned?: boolean;
  returningCharacters: { name: string; portraitSeed: number }[];
}
