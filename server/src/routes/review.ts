import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireJuror } from '../middleware/requireJuror.js';

export const reviewRouter = Router();

/**
 * GDD 2.6 / Screen 6 — "WHAT HAPPENED NEXT".
 * Facts only. No scores, no stars, no judgement from the game.
 */
reviewRouter.get('/', requireJuror, async (req, res) => {
  const { userId } = req.juror;

  const verdicts = await prisma.verdictRecord.findMany({
    where: { userId },
    include: { case: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const entries = verdicts.reverse().map((v) => ({
    caseNumber: v.case.caseNumber,
    defendantName: v.case.defendantName,
    charge: v.case.charge,
    accent: v.case.accent,
    verdict: v.verdict,
    wasHung: v.wasHung,
    timeRemaining: v.timeRemaining,
    outcome: v.outcomeText ?? 'No record was kept.',
  }));

  // Mark them read — an outcome lands once.
  await prisma.verdictRecord.updateMany({
    where: { id: { in: verdicts.map((v) => v.id) } },
    data: { outcomeSeen: true },
  });

  res.json({ entries });
});

/** Screen 3 — "Review past cases": the whole record, not just the last ten. */
reviewRouter.get('/history', requireJuror, async (req, res) => {
  const { userId } = req.juror;

  const verdicts = await prisma.verdictRecord.findMany({
    where: { userId },
    include: { case: true },
    orderBy: { createdAt: 'asc' },
  });

  res.json({
    entries: verdicts.map((v) => ({
      caseNumber: v.case.caseNumber,
      title: v.case.title,
      defendantName: v.case.defendantName,
      charge: v.case.charge,
      accent: v.case.accent,
      verdict: v.verdict,
      wasHung: v.wasHung,
      timeRemaining: v.timeRemaining,
      outcome: v.outcomeSeen ? v.outcomeText : null,
      deliveredAt: v.createdAt,
    })),
  });
});
