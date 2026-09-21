import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireJuror } from '../middleware/requireJuror.js';
import { getCityState } from '../services/cityState.js';
import { feedFor, markRead, runCityClock, viewOf } from '../services/news.js';

export const cityRouter = Router();

/**
 * The city, caught up to now.
 *
 * Running the clock HERE — on the lobby's first request — is what makes coming
 * back mean something: the dials have moved while the player was away, and
 * `away` carries the stories that moved them, for the "while you were away"
 * front page.
 */
cityRouter.get('/', requireJuror, async (req, res) => {
  const { userId, user } = req.juror;
  const away = await runCityClock(user);
  const [city, casesHeard, unreadNews] = await Promise.all([
    getCityState(userId),
    prisma.verdictRecord.count({ where: { userId } }),
    prisma.newsItem.count({ where: { userId, read: false } }),
  ]);

  res.json({
    ...city,
    casesHeard,
    chapter: Math.min(5, Math.floor(casesHeard / 10) + 1),
    unreadNews,
    away: away.map(viewOf),
  });
});

export const newsRouter = Router();

/** The papers, newest first. `before` pages back through the archive. */
newsRouter.get('/', requireJuror, async (req, res) => {
  const q = z
    .object({
      before: z.string().datetime().optional(),
      limit: z.coerce.number().int().min(1).max(50).optional(),
    })
    .safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: 'bad query' });
    return;
  }
  // Reading the paper is also coming back.
  await runCityClock(req.juror.user);
  res.json(
    await feedFor(req.juror.userId, {
      before: q.data.before ? new Date(q.data.before) : undefined,
      limit: q.data.limit,
    }),
  );
});

/** Mark stories read — the given ids, or everything. */
newsRouter.post('/read', requireJuror, async (req, res) => {
  const parsed = z.object({ ids: z.array(z.string()).max(100).optional() }).safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'bad ids' });
    return;
  }
  await markRead(req.juror.userId, parsed.data.ids);
  res.json({ ok: true });
});
