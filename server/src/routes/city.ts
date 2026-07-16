import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireJuror } from '../middleware/requireJuror.js';
import { getCityState } from '../services/cityState.js';

export const cityRouter = Router();

/** GDD 6, Screen 3 — the City Pulse. The city never explains itself. */
cityRouter.get('/', requireJuror, async (req, res) => {
  const { userId } = req.juror;
  const city = await getCityState(userId);
  const casesHeard = await prisma.verdictRecord.count({ where: { userId } });

  res.json({
    ...city,
    casesHeard,
    chapter: Math.min(5, Math.floor(casesHeard / 10) + 1),
  });
});
