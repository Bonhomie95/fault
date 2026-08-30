import { Router } from 'express';
import { z } from 'zod';
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
/**
 * A page of the archive.
 *
 * This used to return the player's ENTIRE record, with the full Case row
 * joined onto every verdict — no take, no cursor, no projection. At case 500
 * that is five hundred dossiers, JSON evidence blobs and all, serialised and
 * pushed down a phone connection so a list screen could show a charge and a
 * date. The read cost grew forever and the payload grew with it.
 *
 * Newest first now, and paged. Newest-first is also simply the right order for
 * an archive: the case you are looking for is almost always a recent one, and
 * the old version made you scroll your whole career to reach it.
 */
const HISTORY_PAGE = 25;

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

  const parsed = z
    .object({
      /** ISO timestamp of the last entry on the previous page. */
      before: z.string().datetime().optional(),
      limit: z.coerce.number().int().min(1).max(HISTORY_PAGE).default(HISTORY_PAGE),
    })
    .safeParse(req.query);

  if (!parsed.success) {
    res.status(400).json({ error: 'invalid page' });
    return;
  }

  const { before, limit } = parsed.data;

  // One extra row, purely to answer "is there another page" without a count.
  const verdicts = await prisma.verdictRecord.findMany({
    where: {
      userId,
      ...(before ? { createdAt: { lt: new Date(before) } } : {}),
    },
    // Only the columns the archive screen renders. The dossier itself lives
    // behind a case that has already been decided; nobody reads the evidence
    // JSON from a list row.
    select: {
      verdict: true,
      wasHung: true,
      timeRemaining: true,
      outcomeText: true,
      outcomeSeen: true,
      createdAt: true,
      case: {
        select: {
          caseNumber: true,
          title: true,
          defendantName: true,
          charge: true,
          accent: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  });

  const page = verdicts.slice(0, limit);
  const hasMore = verdicts.length > limit;

  res.json({
    entries: page.map((v) => ({
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
    /** Pass back as `before` for the next page. Null when the record ends. */
    nextCursor: hasMore ? (page[page.length - 1]?.createdAt.toISOString() ?? null) : null,
  });
});
