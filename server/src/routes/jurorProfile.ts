import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireJuror } from '../middleware/requireJuror.js';
import { computeJurorStats, writeJurorProfile } from '../services/jurorProfile.js';
import { getCityState } from '../services/cityState.js';

export const jurorRouter = Router();

/** GDD 6, Screen 7 — unlocks at case 10. */
const UNLOCK_AT = 10;

jurorRouter.get('/', requireJuror, async (req, res) => {
  const { userId, user } = req.juror;

  const stats = await computeJurorStats(userId);

  if (stats.totalCases < UNLOCK_AT) {
    res.status(423).json({
      error: 'locked',
      casesHeard: stats.totalCases,
      unlocksAt: UNLOCK_AT,
    });
    return;
  }

  // Rewrite the prose only when the record has actually moved on.
  const existing = await prisma.jurorProfile.findUnique({ where: { userId } });
  let prose = existing?.writtenProfile ?? null;

  if (!prose || (existing && existing.totalCases !== stats.totalCases)) {
    prose = await writeJurorProfile(userId, user.jurorName);
    await prisma.jurorProfile.update({
      where: { userId },
      data: { writtenProfile: prose },
    });
  }

  const city = await getCityState(userId);

  res.json({
    jurorName: user.jurorName,
    casesHeard: stats.totalCases,
    profile: prose,
    // The raw six are never shown as a stats screen (GDD 2.5); the city
    // trajectory graph at the foot of the record is all the numbers you get.
    cityTrajectory: {
      crimeRate: city.crimeRate,
      judicialTrust: city.judicialTrust,
      wealthDisparity: city.wealthDisparity,
      organizedCrimePower: city.organizedCrimePower,
      policeIntegrity: city.policeIntegrity,
      mediaPressure: city.mediaPressure,
    },
  });
});
