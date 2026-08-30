import { Router } from 'express';
import type { Tier } from '@prisma/client';
import type { ClientCase, Evidence, Witness } from '../domain/case.js';
import { clockFor } from '../domain/clock.js';
import { CAMPAIGN_TRIAL_CASES } from '../domain/store.js';
import { hasEntitlement } from '../services/economy.js';
import { generationLimiter } from '../middleware/limits.js';
import { prisma } from '../lib/prisma.js';
import { isForeignKeyViolation, isUniqueViolation } from '../lib/prismaErrors.js';
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
    defendantDemeanour: number;
    defendantOddity: number;
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
      // The three things the game hides by SHOWING rather than by withholding.
      // Every one of them is rolled blind to the verdict, so a juror who reads
      // them is reading nothing — which is precisely what makes them worth
      // measuring. See domain/presentation.
      appearance: row.defendantAppearance,
      demeanour: row.defendantDemeanour,
      oddity: row.defendantOddity,
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
    // A quarantined case is one a player reported — it must not be handed back
    // to them while it waits for review. It stays in the table (it is the
    // evidence about how the generator went wrong) but it leaves the docket.
    where: { userId, verdict: { is: null }, quarantinedAt: null },
    orderBy: { caseNumber: 'asc' },
  });

  if (pending) {
    const clock = clockFor(pending.servedAt);
    const names = [
      pending.defendantName,
      ...(pending.witnesses as Witness[]).map((w) => w.name),
    ];
    const returning = await findReturning(userId, names, pending.id);

    /**
     * The clock already ran out while they were away.
     *
     * Not resetting servedAt on re-serve is right — it closes the reload
     * exploit. Nothing handled the consequence, though: take a phone call,
     * come back five minutes later, and the client received this case with
     * zero seconds, immediately submitted null, and the player ate a forced
     * hung verdict. Minus four trust, minus twenty Merit, minus ten XP, and a
     * permanent line on the record the entire game is about — delivered with
     * no warning and no way to have avoided it.
     *
     * Trust gates the promotion ladder, so this is not cosmetic.
     *
     * The rule stays. What changes is that the client is TOLD, and gets to
     * read the sentence before the gavel falls, instead of discovering it
     * afterwards. See `adjourned` on the client case.
     */
    res.json({
      ...toClientCase(pending, clock.remaining, returning),
      adjourned: clock.expired,
    });
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

  /**
   * The next number on this juror's docket.
   *
   * Taken from the highest case they have ever been served, not from how many
   * verdicts they have delivered. Those two used to be the same number, and
   * the moment a case can exist without a verdict they stop being: a
   * quarantined case (reported, withdrawn, never judged) leaves `heard`
   * unchanged, so `heard + 1` would hand the next case a number that is
   * already taken — and `@@unique([userId, caseNumber])` would turn a player's
   * report into a 500 on their very next request.
   *
   * `heard` is still the right input for the trial gate above, because that
   * gate is genuinely about cases HEARD.
   */
  const highest = await prisma.case.aggregate({
    where: { userId },
    _max: { caseNumber: true },
  });
  const caseNumber = (highest._max.caseNumber ?? 0) + 1;

  const city = await getCityState(userId);
  const place = placeForUser(user);
  const { generated, source } = await nextCase(userId, caseNumber, city, place);

  // servedAt is written in the SAME insert as the case, not by a follow-up
  // update. It used to be a second round trip, which left a window in which a
  // case existed with a null clock — and `clockFor(null)` returns a full 120
  // seconds, so a crash or a slow write in that gap was a case whose deadline
  // began whenever it was next touched. One statement, one truth.
  const servedAt = new Date();

  let created;
  try {
    created = await prisma.case.create({
    data: {
      userId,
      caseNumber,
      // The clock starts the moment the case leaves the building. There is no
      // "ready?" prompt in the fiction (GDD 2.2) and there is no grace here.
      servedAt,
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
      defendantDemeanour: generated.defendant.demeanour,
      defendantOddity: generated.defendant.oddity,
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
  } catch (err) {
    /**
     * Two requests for the same juror's next case, at the same time.
     *
     * `caseNumber` is read with an aggregate and written by a separate insert,
     * so two overlapping calls both compute the same number and the second one
     * hits @@unique([userId, caseNumber]). That is not theoretical — it is in
     * the server log from an ordinary play session, as a 500 with a Prisma
     * stack in it, and the client's response to a 500 on /next is to try
     * again, which collides again.
     *
     * Bumping the number and retrying would be the obvious fix and the wrong
     * one: it would hand the juror TWO open cases, and every other line in
     * this route assumes there is at most one. The right answer is the one the
     * top of this handler already gives — a juror who has an unjudged case
     * gets that case back. So find it and serve it.
     *
     * The generated case is thrown away. That costs one model call in a race
     * that needs two requests inside the same few milliseconds, which is a
     * far better trade than a 500 on the screen where the clock is running.
     */
    if (isUniqueViolation(err, 'caseNumber')) {
      const raced = await prisma.case.findFirst({
        where: { userId, verdict: { is: null }, quarantinedAt: null },
        orderBy: { caseNumber: 'asc' },
      });
      if (raced) {
        const racedNames = [raced.defendantName, ...(raced.witnesses as Witness[]).map((w) => w.name)];
        res.json({
          ...toClientCase(raced, clockFor(raced.servedAt).remaining,
            await findReturning(userId, racedNames, raced.id)),
          adjourned: clockFor(raced.servedAt).expired,
        });
        return;
      }
    }
    /**
     * The juror's row is gone — the account was deleted while this request was
     * in flight. A foreign key error is the database being right; answering
     * with a 500 is us being wrong about whose fault it is.
     */
    if (isForeignKeyViolation(err)) {
      res.status(401).json({ error: 'unknown_juror' });
      return;
    }
    throw err;
  }

  const names = [generated.defendant.name, ...generated.witnesses.map((w) => w.name)];
  const returning = await findReturning(userId, names, created.id);

  res.json(toClientCase(created, clockFor(created.servedAt).remaining, returning));
});
