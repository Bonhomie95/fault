import { Router } from 'express';
import type { ClientCase, Evidence, Witness } from '../domain/case.js';
import { prisma } from '../lib/prisma.js';
import { accentHexFor, nextCase, structureKeyFor } from '../services/caseGenerator.js';
import { deriveCaseMood } from '../services/cityEffects.js';
import { getCityState } from '../services/cityState.js';
import { portraitSeedFor } from '../services/characterPool.js';
import { requireJuror } from '../middleware/requireJuror.js';

export const caseRouter = Router();

const TRIAL_CASE_LIMIT = 10;

/**
 * Strips everything the player must not see: correct_verdict, evidence_strength,
 * is_planted, and each witness's lie and lie_tell. The dossier the player holds
 * is the dossier a juror would hold — incomplete on purpose.
 */
function toClientCase(
  row: {
    id: string;
    caseNumber: number;
    title: string;
    charge: string;
    accent: string;
    mood: string;
    defendantName: string;
    defendantAge: number;
    defendantOccupation: string;
    defendantBackground: string;
    evidence: unknown;
    witnesses: unknown;
    prosecutionArgument: string;
    defenceArgument: string;
  },
  clockSeconds: number,
  returningCharacters: { name: string; portraitSeed: number }[],
): ClientCase {
  const evidence = row.evidence as Evidence[];
  const witnesses = row.witnesses as Witness[];

  return {
    id: row.id,
    caseNumber: row.caseNumber,
    title: row.title,
    charge: row.charge,
    accent: row.accent,
    mood: row.mood,
    clockSeconds,
    defendant: {
      name: row.defendantName,
      age: row.defendantAge,
      occupation: row.defendantOccupation,
      background: row.defendantBackground,
      portraitSeed: portraitSeedFor(row.defendantName),
    },
    evidence: evidence.map((e) => ({
      id: e.id,
      description: e.description,
      prosecution_reading: e.prosecution_reading,
      defence_reading: e.defence_reading,
    })),
    witnesses: witnesses.map((w) => ({ name: w.name, testimony: w.testimony })),
    prosecutionArgument: row.prosecutionArgument,
    defenceArgument: row.defenceArgument,
    returningCharacters,
  };
}

/** Which names in this case the player has already met. */
async function findReturning(userId: string, names: string[], excludeCaseId: string) {
  const known = await prisma.character.findMany({
    where: { userId, name: { in: names }, originCaseId: { not: excludeCaseId } },
    select: { name: true, portraitSeed: true },
  });
  return known;
}

caseRouter.get('/next', requireJuror, async (req, res) => {
  const { userId, user } = req.juror;

  // An unjudged case is still open — hand back the same one rather than
  // letting a reload skip a defendant.
  const pending = await prisma.case.findFirst({
    where: { userId, verdict: { is: null } },
    orderBy: { caseNumber: 'asc' },
  });

  if (pending) {
    const names = [
      pending.defendantName,
      ...(pending.witnesses as Witness[]).map((w) => w.name),
    ];
    const returning = await findReturning(userId, names, pending.id);
    res.json(toClientCase(pending, user.clockSeconds, returning));
    return;
  }

  const heard = await prisma.verdictRecord.count({ where: { userId } });

  if (!user.trialUnlocked && heard >= TRIAL_CASE_LIMIT) {
    res.status(402).json({
      error: 'trial_complete',
      message: 'The trial docket is closed. Unlock the full campaign to continue.',
      casesHeard: heard,
    });
    return;
  }

  const caseNumber = heard + 1;
  const city = await getCityState(userId);
  const { generated, source } = await nextCase(userId, caseNumber, city);

  const created = await prisma.case.create({
    data: {
      userId,
      caseNumber,
      title: generated.title,
      charge: generated.charge,
      accent: accentHexFor(generated.accent),
      mood: deriveCaseMood(city),
      defendantName: generated.defendant.name,
      defendantAge: generated.defendant.age,
      defendantOccupation: generated.defendant.occupation,
      defendantBackground: generated.defendant.background,
      defendantWealth: generated.defendant.wealth,
      evidence: generated.evidence,
      witnesses: generated.witnesses,
      prosecutionArgument: generated.prosecution_argument,
      defenceArgument: generated.defence_argument,
      correctVerdict: generated.correct_verdict,
      evidenceStrength: generated.evidence_strength,
      isHandAuthored: source === 'authored' || source === 'fallback',
      structureKey: structureKeyFor(generated),
    },
  });

  const names = [generated.defendant.name, ...generated.witnesses.map((w) => w.name)];
  const returning = await findReturning(userId, names, created.id);

  res.json(toClientCase(created, user.clockSeconds, returning));
});
