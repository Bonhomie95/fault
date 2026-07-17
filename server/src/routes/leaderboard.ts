import { Router } from 'express';
import { z } from 'zod';
import { requireJuror } from '../middleware/requireJuror.js';
import { getBoard, type Board } from '../services/leaderboard.js';

export const leaderboardRouter = Router();

const querySchema = z.object({
  board: z.enum(['peaceful', 'lawless']).default('peaceful'),
});

/**
 * GET /api/leaderboard?board=peaceful|lawless
 *
 * Returns the top 100 and — always — the player's own rank, whether or not
 * they are in it. The client should never have to ask a second question to
 * find out where its own player stands.
 */
leaderboardRouter.get('/', requireJuror, async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'board must be "peaceful" or "lawless"' });
    return;
  }

  const board: Board = parsed.data.board;
  res.json(await getBoard(board, req.juror.userId));
});
