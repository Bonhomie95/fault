import { Router } from 'express';
import { z } from 'zod';
import type { Witness } from '../domain/case.js';
import { CLOCK_SECONDS, clockFor } from '../domain/clock.js';
import { xpForVerdict, trustForVerdict } from '../domain/progression.js';
import { meritForStreak, meritForVerdict } from '../domain/store.js';
import { prisma } from '../lib/prisma.js';
import { requireJuror } from '../middleware/requireJuror.js';
import { grantMerit } from '../services/economy.js';
import { noteCaseHeard } from '../services/ads.js';
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

/**
 * What the client is allowed to tell us: which case, and which way.
 *
 * `timeRemaining` and `wasHung` are deliberately NOT here any more. They used
 * to be sent by the phone and believed, which meant a player could claim 119
 * seconds left on every verdict — maximum XP and Merit — or declare their own
 * hung verdicts. Both are now derived from `Case.servedAt` on this server.
 * The client reports a decision; it does not report the circumstances of the
 * decision.
 */
const submitSchema = z.object({
  caseId: z.string().min(1),
  /** Absent = the player let the clock run out without choosing. */
  verdict: z.enum(['guilty', 'not_guilty']).optional(),
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

  const { caseId } = parsed.data;

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

  // ---- The clock, from the only place that knows ----
  //
  // Measured from when we served the case. If the window has closed, it is a
  // hung verdict no matter what the player just tapped — arriving late is the
  // same as not arriving, and that is the deal the game makes in GDD 2.2.
  const clock = clockFor(caseData.servedAt);
  const timeRemaining = clock.remaining;

  const tooLate = clock.expired;
  const neverChose = !parsed.data.verdict;
  const wasHung = tooLate || neverChose;

  // The coin flip stays here. A forced verdict is a consequence, and
  // consequences are not the client's to author.
  const verdict = wasHung
    ? (Math.random() < 0.5 ? 'guilty' : 'not_guilty')
    : parsed.data.verdict!;

  // 1. Record the verdict, along with what it will eventually cost.
  //
  // trustDelta is computed now but NOT applied: applying it here would tell
  // the player whether they were right the instant they tapped, which is the
  // one thing this game refuses to do. It settles at the review break, next
  // to the outcome that explains it (see progression.settleTrust).
  const trustDelta = trustForVerdict({
    verdict,
    correctVerdict: caseData.correctVerdict,
    wasHung,
  });
  const xpAwarded = xpForVerdict({
    tier: caseData.tier,
    wasHung,
    timeRemaining,
    clockSeconds: CLOCK_SECONDS,
  });
  const meritAwarded = meritForVerdict({ wasHung, timeRemaining, clockSeconds: CLOCK_SECONDS });

  const record = await prisma.verdictRecord.create({
    data: {
      userId,
      caseId,
      verdict,
      timeRemaining: wasHung ? 0 : timeRemaining,
      wasHung,
      // outcomeText is written later, off the hot path — see below.
      outcomeText: null,
      trustDelta,
      xpAwarded,
    },
  });

  // XP and Merit are service, so they land immediately and spoil nothing:
  // neither can see whether the verdict was right.
  const { rank, promoted } = await awardXp(userId, xpAwarded);
  const merit = await grantMerit(userId, meritAwarded, 'case_heard', caseId);

  const streak = await recordDocketDay(userId);
  if (streak.isNewDay && streak.streak > 1) {
    await grantMerit(userId, meritForStreak(streak.streak), 'streak', String(streak.streak));
  }
  await tickMissions(userId, { verdict, wasHung, timeRemaining, clockSeconds: CLOCK_SECONDS });

  // The outcome line ("Rearrested eight months later.") is generated by Groq,
  // and the player does not read it for another ten cases — so it has no
  // business blocking the verdict screen, which is the most dramatic beat in
  // the game. Fire it behind the response.
  void writeOutcome(caseData, verdict, wasHung)
    .then((text) =>
      prisma.verdictRecord.update({ where: { id: record.id }, data: { outcomeText: text } }),
    )
    .catch((err: Error) => console.error('[outcome]', err.message));

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

  // Whether an ad is due, decided here and never by the client. Comes after
  // the verdict, never during the case.
  const ad = await noteCaseHeard(userId);

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
    meritAwarded,
    merit,
    // The verdict screen shows the aftermath first; the interstitial belongs
    // between this case and the next one, not on top of the consequence.
    showInterstitial: ad.showInterstitial,
  });
});
