import type { NextFunction, Request, Response } from 'express';
import type { User } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      juror: { userId: string; user: User };
    }
  }
}

/**
 * There is no password. The juror id from SecureStore is the whole session —
 * appropriate for a single-player game with no shared or sensitive state.
 * If this ever grows a leaderboard identity, it needs a real token.
 */
export async function requireJuror(req: Request, res: Response, next: NextFunction) {
  const userId = req.header('x-juror-id');
  if (!userId) {
    res.status(401).json({ error: 'x-juror-id header required' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(404).json({ error: 'no such juror' });
    return;
  }

  req.juror = { userId, user };
  next();
}
