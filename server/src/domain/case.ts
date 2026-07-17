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
  name: z.string(),
  /** How they come to be testifying: "gate security", "the estranged husband". */
  role: z.string().default(''),
  testimony: z.string(),
  /** Each witness carries one provable lie and one ambiguous claim (GDD 2.1). */
  lie: z.string(),
  lie_tell: z.string(),
});

export const characterAdditionSchema = z.object({
  name: z.string(),
  role: z.enum(['defendant', 'witness', 'prosecutor', 'defender', 'victim']),
  themes: z.array(z.string()).default([]),
});

export const generatedCaseSchema = z.object({
  title: z.string(),
  charge: z.string(),
  defendant: z.object({
    name: z.string(),
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
});

export type GeneratedCase = z.infer<typeof generatedCaseSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type Witness = z.infer<typeof witnessSchema>;

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
  };
  evidence: { id: string; description: string; prosecution_reading: string; defence_reading: string }[];
  witnesses: { name: string; role: string; testimony: string }[];
  prosecutionArgument: string;
  defenceArgument: string;
  /** Names in this case the player has judged before. The Echo System (GDD 2.4)
   *  never announces itself — this only marks who is returning, not how. */
  returningCharacters: { name: string; portraitSeed: number }[];
}
