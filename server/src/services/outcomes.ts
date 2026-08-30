import type { Case } from '@prisma/client';
import { aiEnabled, completeOnce } from '../lib/groq.js';

/**
 * What happened next (GDD 2.6).
 *
 * Written at verdict time, read ten cases later at the Dossier Review. The
 * voice is a court reporter's: facts, no editorialising, no judgement. The
 * game never tells you that you were wrong — it tells you what followed.
 */
export async function writeOutcome(
  caseData: Case,
  verdict: 'guilty' | 'not_guilty',
  wasHung: boolean,
): Promise<string> {
  if (caseData.correctVerdict === 'ambiguous' && !wasHung) {
    // GDD 2.6 — the unanswerable cases get no resolution, by design.
    return 'No consensus. Your reasoning was your own.';
  }

  if (!aiEnabled) return deterministicOutcome(caseData, verdict, wasHung);

  const wentRight = verdict === caseData.correctVerdict;
  const prompt = `
Write ONE sentence of newspaper-style follow-up reporting, past tense, factual,
no editorialising, no moral judgement, no adjectives of praise or blame.

Defendant: ${caseData.defendantName}, ${caseData.defendantOccupation}
Charge: ${caseData.charge}
The jury's verdict: ${verdict === 'guilty' ? 'guilty' : 'not guilty'}
${wasHung ? 'The verdict was returned by a hung jury and decided by lot.' : ''}
What was actually true: ${caseData.correctVerdict}
So the verdict was: ${wentRight ? 'correct' : 'a miscarriage'}

If the verdict was a miscarriage, report the consequence that revealed it —
an appeal upheld, an exoneration, a later crime, a confession by another.
If it was correct, report a plain consequence — a sentence served, a
rearrest, a life resumed.
Include a timeframe in months. Return only the sentence.
`.trim();

  // Through the pool, so a spent first key does not silently kill every
  // outcome line while case generation carries on. completeOnce returns null
  // rather than throwing — the deterministic writer is a real fallback here,
  // not an error path, and it is written in the same voice.
  const written = await completeOnce({ prompt, maxTokens: 120, temperature: 0.8 });
  return written ?? deterministicOutcome(caseData, verdict, wasHung);
}

function deterministicOutcome(
  caseData: Case,
  verdict: 'guilty' | 'not_guilty',
  wasHung: boolean,
): string {
  const name = caseData.defendantName;
  const wentRight = verdict === caseData.correctVerdict;

  if (wasHung) {
    return `${name}'s verdict was returned by a hung jury. The case drew press attention for eleven weeks and was cited in calls for reform of the single-juror system.`;
  }

  if (verdict === 'guilty') {
    return wentRight
      ? `${name} served the sentence in full and was released after fourteen months. No further charges have been brought.`
      : `${name}'s appeal was upheld. Released after nine months. Exonerated.`;
  }

  return wentRight
    ? `${name} returned to work. No further charges have been brought.`
    : `${name} was rearrested eight months later on a related charge. Pleaded guilty.`;
}
