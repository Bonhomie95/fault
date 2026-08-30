import type { CorrectVerdict } from '@prisma/client';

/**
 * What the accused does with their face when the verdict lands.
 *
 * A NOTE ON WHAT THIS REVEALS, because it is not a small thing.
 *
 * Until now the server withheld correctness at verdict time on purpose —
 * `trustDelta` is computed the moment you tap and deliberately not applied,
 * "because applying it here would tell the player whether they were right the
 * instant they tapped, which is the one thing this game refuses to do" (see
 * routes/verdict). The truth surfaced later, at the review break, next to the
 * consequence that explained it.
 *
 * A reaction that distinguishes a guilty man walking free from an innocent one
 * walking free tells the player exactly that, immediately. It is a real change
 * to how the game plays: the review stops being a reveal and becomes a
 * summary, and the deferred not-knowing goes with it.
 *
 * It buys something in return, and it is the beat the whole scene was missing.
 * The smirk of somebody you have just let go is the strongest thing this game
 * can show a juror, and it only works if it means what it appears to mean.
 *
 * What it does NOT touch is the bias measurement. appearance, demeanour and
 * oddity are rolled blind to guilt (see domain/presentation), so a juror who
 * now learns the answer learns nothing whatsoever about presentation, and
 * appearance_bias keeps measuring the thing it was built to measure.
 *
 * The reaction is expressed as what the DEFENDANT knows, not as a score. They
 * are not reacting to the juror being right; they are reacting to their own
 * life, and they are the one person in the room who knows which it is.
 */
export type Reaction =
  /** Convicted, and they did it. Nothing left to hold up. */
  | 'broken'
  /** Convicted, and they did not. Disbelief, aimed straight at the juror. */
  | 'stricken'
  /** Acquitted, and they did it. The one that costs the player something. */
  | 'smirk'
  /** Acquitted, and they did not. The breath they have been holding. */
  | 'relief'
  /** No answer existed. They give nothing away, because there is nothing. */
  | 'unreadable';

export function reactionFor(
  verdict: 'guilty' | 'not_guilty',
  correctVerdict: CorrectVerdict,
): Reaction {
  /**
   * An ambiguous case has no right answer — that is the entire point of the
   * third enum value. Inventing a tell for it would be the worst version of
   * this feature: a face that appears to know something on a case where the
   * evidence was built so that nobody could.
   */
  if (correctVerdict === 'ambiguous') return 'unreadable';

  const didIt = correctVerdict === 'guilty';
  if (verdict === 'guilty') return didIt ? 'broken' : 'stricken';
  return didIt ? 'smirk' : 'relief';
}
