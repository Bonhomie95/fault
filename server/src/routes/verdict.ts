import { Router } from 'express';
import { z } from 'zod';
import type { Witness } from '../domain/case.js';
import { xpForVerdict, trustForVerdict } from '../domain/progression.js';
import { prisma } from '../lib/prisma.js';
import { requireJuror } from '../middleware/requireJuror.js';
import { placeForUser, refillCaseCache } from '../services/caseGenerator.js';
import { awardXp } from '../services/progression.js';
import { recordDocketDay, tickMissions } from '../services/missions.js';
import { addToCharacterPool, type CharacterInput } from '../services/characterPool.js';
import { applyCityEffect, deriveEffectKey } from '../services/cityEffects.js';
import { getCityState, updateCityState } from '../services/cityState.js';
import { updateJurorProfile } from '../services/jurorProfile.js';
import { writeOutcome } from '../services/outcomes.js';

export const verdictRouter = Router();

const REVIEW_INTERVAL = 10;

const submitSchema = z.object({
  caseId: z.string().min(1),
  /** Absent verdict = the clock ran out and the player never chose. */
  verdict: z.enum(['guilty', 'not_guilty']).optional(),
  timeRemaining: z.number().int().min(0),
  wasHung: z.boolean().default(false),
});

/** Themes carried by the case, used to decide who can echo back later. */
function themesFor(accent: string, charge: string): string[] {
  const themes: string[] = [];
  const c = charge.toLowerCase();
  if (/theft|robbery|steal/.test(c)) themes.push('theft');
  if (/fraud|embezzl|bribe|corrupt/.test(c)) themes.push('fraud', 'corruption');
  if (/assault|murder|manslaughter|wound/.test(c)) themes.push('violence');
  if (/arson|fire/.test(c)) themes.push('arson');
  if (/drug|substance|traffick/.test(c)) themes.push('drugs');
  if (themes.length === 0) themes.push('general');
  themes.push(accent);
  return themes;
}

verdictRouter.post('/', requireJuror, async (req, res) => {
  const { userId, user } = req.juror;

  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid verdict payload' });
    return;
  }

  const { caseId, timeRemaining } = parsed.data;

  const caseData = await prisma.case.findFirst({
    where: { id: caseId, userId },
    include: { verdict: true },
  });

  if (!caseData) {
    res.status(404).json({ error: 'no such case' });
    return;
  }
  if (caseData.verdict) {
    res.status(409).json({ error: 'verdict already delivered on this case' });
    return;
  }

  // GDD 2.2 — at zero the game decides for you, and records it as hung.
  // The server, not the client, performs the coin flip: a forced verdict is a
  // consequence, and consequences are not the client's to author.
  const ranOut = parsed.data.wasHung || !parsed.data.verdict || timeRemaining <= 0;
  const verdict = parsed.data.verdict ?? (Math.random() < 0.5 ? 'guilty' : 'not_guilty');
  const wasHung = ranOut && !parsed.data.verdict;

  // 1. Record the verdict, along with what it will eventually cost.
  //
  // trustDelta is computed now but NOT applied: applying it here would tell
  // the player whether they were right the instant they tapped, which is the
  // one thing this game refuses to do. It settles at the review break, next
  // to the outcome that explains it (see progression.settleTrust).
  const outcomeText = await writeOutcome(caseData, verdict, wasHung);
  const trustDelta = trustForVerdict({
    verdict,
    correctVerdict: caseData.correctVerdict,
    wasHung,
  });
  const xpAwarded = xpForVerdict({
    tier: caseData.tier,
    wasHung,
    timeRemaining: wasHung ? 0 : timeRemaining,
    clockSeconds: user.clockSeconds,
  });

  await prisma.verdictRecord.create({
    data: {
      userId,
      caseId,
      verdict,
      timeRemaining: wasHung ? 0 : timeRemaining,
      wasHung,
      outcomeText,
      trustDelta,
      xpAwarded,
    },
  });

  // XP is service, so it lands immediately and spoils nothing.
  const { rank, promoted } = await awardXp(userId, xpAwarded);
  await recordDocketDay(userId);
  await tickMissions(userId, { verdict, wasHung, timeRemaining, clockSeconds: user.clockSeconds });

  // Community consensus counter for the "63% of players convicted" beat.
  await prisma.case.update({
    where: { id: caseId },
    data:
      verdict === 'guilty'
        ? { consensusGuilty: { increment: 1 } }
        : { consensusNotGuilty: { increment: 1 } },
  });

  // 2. Update the city.
  const city = await getCityState(userId);
  const effectKey = deriveEffectKey({
    verdict,
    wasHung,
    defendantWealth: caseData.defendantWealth,
    // Signed, not absolute: convicting against defence-favouring evidence must
    // read as weaker than convicting on a balanced case, not stronger.
    evidenceStrength: caseData.evidenceStrength,
    organisedCrimeAdjacent: /syndicate|organised|cartel|gang/i.test(
      `${caseData.charge} ${caseData.defendantBackground}`,
    ),
  });
  const updatedCity = await updateCityState(userId, applyCityEffect(city, effectKey));

  // 3. Update the juror profile.
  await updateJurorProfile(userId);

  // 4. Remember everyone who was in the room.
  const witnesses = caseData.witnesses as Witness[];
  const people: CharacterInput[] = [
    {
      name: caseData.defendantName,
      role: 'defendant',
      themes: themesFor(caseData.accent, caseData.charge),
    },
    ...witnesses.map((w) => ({
      name: w.name,
      role: 'witness' as const,
      themes: themesFor(caseData.accent, caseData.charge),
    })),
  ];
  await addToCharacterPool(
    userId,
    caseData.id,
    caseData.caseNumber,
    people,
    verdict === 'guilty' ? 'convicted' : 'acquitted',
    caseData.defendantName,
  );

  // 5. Top up the buffer. Never awaited — the player must never wait for Groq.
  void refillCaseCache(userId, caseData.caseNumber + 1, updatedCity, placeForUser(user)).catch(
    (err: Error) => console.error('[refill]', err.message),
  );

  // 6. Review break?
  const verdictCount = await prisma.verdictRecord.count({ where: { userId } });

  const totalVotes = caseData.consensusGuilty + caseData.consensusNotGuilty + 1;
  const guiltyVotes = caseData.consensusGuilty + (verdict === 'guilty' ? 1 : 0);

  res.json({
    verdict,
    wasHung,
    timeRemaining: wasHung ? 0 : timeRemaining,
    // GDD 5: the aftermath line. Not a score — a consequence.
    aftermath:
      verdict === 'guilty'
        ? 'The defendant was taken into custody.'
        : 'The defendant left the courthouse.',
    city: updatedCity,
    triggerReview: verdictCount % REVIEW_INTERVAL === 0,
    casesHeard: verdictCount,
    consensus: {
      guiltyPercent: Math.round((guiltyVotes / totalVotes) * 100),
      sampleSize: totalVotes,
    },
    // Service, shown immediately. Standing is not here on purpose — it lands
    // at the review break with the outcome that earned it.
    xpAwarded,
    rank,
    promoted,
  });
});
