import { Router } from 'express';
import { GATES, rankFor, trustLabel } from '../domain/progression.js';
import { prisma } from '../lib/prisma.js';
import { requireJuror } from '../middleware/requireJuror.js';
import { settleTrust } from '../services/progression.js';

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

  // The review break is where standing finally moves. Every trust delta these
  // verdicts earned has been sitting unapplied precisely so it could land
  // here, beside the outcome that justifies it, instead of the moment the
  // player tapped and learned nothing.
  const settled = await settleTrust(userId);

  res.json({
    entries,
    standing: {
      trust: settled.trust,
      trustLabel: trustLabel(settled.trust),
      delta: settled.delta,
      verdictsSettled: settled.applied,
    },
  });
});

/**
 * Screen 3 — "Review past cases": the whole record, not just the last ten.
 *
 * Gated on rank, not standing. A juror earns the right to read back over their
 * own career by serving; they do not lose it by being wrong, because a gate
 * that closed on a bad verdict would be a score wearing a lock.
 */
reviewRouter.get('/history', requireJuror, async (req, res) => {
  const { userId, user } = req.juror;

  const rank = rankFor(user.xp);
  if (rank.level < GATES.caseArchive) {
    res.status(423).json({
      error: 'locked',
      message: 'The archive opens to jurors who have been sworn a while. Keep sitting.',
      requiredRank: GATES.caseArchive,
      rank: rank.level,
      rankTitle: rank.title,
    });
    return;
  }

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
