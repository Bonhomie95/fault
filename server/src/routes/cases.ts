import { Router } from 'express';
import type { Tier } from '@prisma/client';
import type { ClientCase, Evidence, Witness } from '../domain/case.js';
import { clockFor } from '../domain/clock.js';
import { CAMPAIGN_TRIAL_CASES } from '../domain/store.js';
import { hasEntitlement } from '../services/economy.js';
import { generationLimiter } from '../middleware/limits.js';
import { prisma } from '../lib/prisma.js';
import { accentHexFor, nextCase, placeForUser, structureKeyFor } from '../services/caseGenerator.js';
import { tierLabel } from '../domain/jurisdiction.js';
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
    country: string;
    jurisdiction: string;
    tier: Tier;
    defendantName: string;
    defendantAge: number;
    defendantOccupation: string;
    defendantBackground: string;
    defendantAppearance: number;
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
    place: {
      country: row.country,
      jurisdiction: row.jurisdiction,
      tier: row.tier,
      tierLabel: tierLabel(row.tier, row.country),
    },
    defendant: {
      name: row.defendantName,
      age: row.defendantAge,
      occupation: row.defendantOccupation,
      background: row.defendantBackground,
      portraitSeed: portraitSeedFor(row.defendantName),
      // The face is meant to work on you. It is the one thing the game hides
      // by showing rather than by withholding.
      appearance: row.defendantAppearance,
    },
    evidence: evidence.map((e) => ({
      id: e.id,
      description: e.description,
      prosecution_reading: e.prosecution_reading,
      defence_reading: e.defence_reading,
    })),
    witnesses: witnesses.map((w) => ({
      name: w.name,
      role: w.role ?? '',
      testimony: w.testimony,
    })),
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

caseRouter.get('/next', requireJuror, generationLimiter, async (req, res) => {
  const { userId, user } = req.juror;

  // An unjudged case is still open — hand back the same one rather than
  // letting a reload skip a defendant.
  //
  // Crucially, servedAt is NOT reset here. Re-requesting a case you already
  // hold returns it with whatever time is actually left; reloading the screen
  // used to hand back a fresh 120 seconds with the dossier already read.
  const pending = await prisma.case.findFirst({
    where: { userId, verdict: { is: null } },
    orderBy: { caseNumber: 'asc' },
  });

  if (pending) {
    const clock = clockFor(pending.servedAt);
    const names = [
      pending.defendantName,
      ...(pending.witnesses as Witness[]).map((w) => w.name),
    ];
    const returning = await findReturning(userId, names, pending.id);
    res.json(toClientCase(pending, clock.remaining, returning));
    return;
  }

  const heard = await prisma.verdictRecord.count({ where: { userId } });
  const hasCampaign = await hasEntitlement(userId, 'campaign');

  // The gate reads an entitlement row now, not a boolean the client could set.
  if (!hasCampaign && heard >= CAMPAIGN_TRIAL_CASES) {
    res.status(402).json({
      error: 'trial_complete',
      message: 'The trial docket is closed. Open the full docket to continue.',
      casesHeard: heard,
    });
    return;
  }

  const caseNumber = heard + 1;
  const city = await getCityState(userId);
  const place = placeForUser(user);
  const { generated, source } = await nextCase(userId, caseNumber, city, place);

  const created = await prisma.case.create({
    data: {
      userId,
      caseNumber,
      title: generated.title,
      charge: generated.charge,
      accent: accentHexFor(generated.accent),
      mood: deriveCaseMood(city),
      country: place.country,
      // The fallback docket is set in a fictional city, so it must not claim a
      // real court. Only generated cases carry a real jurisdiction.
      jurisdiction: source === 'fallback' ? '' : place.court,
      tier: place.tier,
      defendantName: generated.defendant.name,
      defendantAge: generated.defendant.age,
      defendantOccupation: generated.defendant.occupation,
      defendantBackground: generated.defendant.background,
      defendantWealth: generated.defendant.wealth,
      defendantAppearance: generated.defendant.appearance,
      evidence: generated.evidence,
      witnesses: generated.witnesses,
      prosecutionArgument: generated.prosecution_argument,
      defenceArgument: generated.defence_argument,
      correctVerdict: generated.correct_verdict,
      evidenceStrength: generated.evidence_strength,
      isHandAuthored: source === 'fallback',
      structureKey: structureKeyFor(generated),
    },
  });

  const names = [generated.defendant.name, ...generated.witnesses.map((w) => w.name)];
  const returning = await findReturning(userId, names, created.id);

  // The clock starts the moment the case leaves the building. There is no
  // "ready?" prompt in the fiction (GDD 2.2) and there is no grace here.
  const served = await prisma.case.update({
    where: { id: created.id },
    data: { servedAt: new Date() },
  });

  res.json(toClientCase(served, clockFor(served.servedAt).remaining, returning));
});
