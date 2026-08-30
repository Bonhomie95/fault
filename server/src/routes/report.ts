import { Router } from 'express';
import { z } from 'zod';
import { env } from '../lib/env.js';
import { log } from '../lib/log.js';
import { prisma } from '../lib/prisma.js';
import { reportLimiter } from '../middleware/limits.js';
import { requireJuror } from '../middleware/requireJuror.js';

export const reportRouter = Router();

/**
 * Reporting.
 *
 * Two things needed this and neither had it.
 *
 * The first is App Store Guideline 1.2: an app with user-generated content
 * needs a filter, a way to report, and a way to act. Juror names are published
 * on a leaderboard to every other player, so they are user-generated content
 * whether or not the design thinks of them that way.
 *
 * The second is the generated docket, and it is the one that actually keeps me
 * up. This server asks a language model to write criminal accusations against
 * invented people, set in named real jurisdictions, at scale, and ships them
 * to a player without a human ever reading them. The system prompt is careful
 * and the content filter catches the categories it knows about. Neither is a
 * guarantee. At some point a case will name a real person, or land somewhere
 * genuinely harmful, and when it does the only thing that matters is whether
 * there was a path for someone to tell us — and whether we kept enough context
 * to work out how it happened.
 *
 * So a report captures the case id and the full generation context, and
 * quarantines the case immediately rather than waiting for a human. A
 * quarantined case is withheld from the docket; it is not deleted, because the
 * generation context is the evidence.
 */

const REASONS = [
  'real_person',
  'harmful_content',
  'offensive_name',
  'broken_case',
  'other',
] as const;

const reportSchema = z.object({
  kind: z.enum(['case', 'juror_name']),
  /** The case being reported, or the juror whose name is. */
  subjectId: z.string().min(1).max(64),
  reason: z.enum(REASONS),
  /** The reporter's own words. Optional, capped, never echoed anywhere. */
  detail: z.string().max(1000).optional(),
});

reportRouter.post('/', requireJuror, reportLimiter, async (req, res) => {
  const { userId } = req.juror;

  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid report' });
    return;
  }

  const { kind, subjectId, reason, detail } = parsed.data;

  // Verify the subject exists and that this juror could plausibly have seen
  // it. Not to gatekeep reporting — reporting should be easy — but so the
  // queue is not trivially floodable with references to nothing.
  if (kind === 'case') {
    const found = await prisma.case.findFirst({
      where: { id: subjectId, userId },
      select: { id: true },
    });
    if (!found) {
      res.status(404).json({ error: 'no such case' });
      return;
    }

    // Quarantine now, review later. A case reported for naming a real person
    // must not be served to anyone else while it waits in a queue, and the
    // cost of being wrong is one case nobody sees.
    await prisma.case.update({
      where: { id: subjectId },
      data: { quarantinedAt: new Date() },
    });
  }

  const report = await prisma.contentReport.create({
    data: {
      reporterId: userId,
      kind,
      subjectId,
      reason,
      detail: detail ?? null,
    },
  });

  // At error level deliberately: this is a page-worthy event, not a metric.
  // A report of `real_person` on a generated case is the failure mode this
  // whole boundary exists to prevent, and it should interrupt someone.
  log.error('content reported', {
    reportId: report.id,
    kind,
    subjectId,
    reason,
    reporterId: userId,
  });

  res.status(201).json({
    reported: true,
    reference: report.id,
    message: env.SUPPORT_EMAIL
      ? `The court has your report. Reference ${report.id.slice(0, 8)}. For anything urgent, write to ${env.SUPPORT_EMAIL}.`
      : `The court has your report. Reference ${report.id.slice(0, 8)}.`,
  });
});

/** What a player may report, so the client does not hardcode the list. */
reportRouter.get('/reasons', requireJuror, (_req, res) => {
  res.json({
    reasons: [
      { key: 'real_person', label: 'This names a real person' },
      { key: 'harmful_content', label: 'This content is harmful' },
      { key: 'offensive_name', label: 'This juror name is offensive' },
      { key: 'broken_case', label: 'This case does not make sense' },
      { key: 'other', label: 'Something else' },
    ],
  });
});
