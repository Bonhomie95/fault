import type { NextFunction, Request, Response } from 'express';
import type { User } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { verifyAccessToken } from '../services/tokens.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      juror: { userId: string; user: User };
    }
  }
}

/**
 * Who is asking.
 *
 * `Authorization: Bearer <access token>` — a short-lived JWT this server
 * signed, verified cryptographically before we believe a word of it.
 *
 * This replaces `x-juror-id: <cuid>`, which asked the client who it was and
 * then believed the answer forever. That header is now refused outright rather
 * than quietly supported: a fallback that accepts the old credential is the
 * old vulnerability with extra steps, and there is no legacy client to break —
 * nothing has shipped.
 */
export async function requireJuror(req: Request, res: Response, next: NextFunction) {
  if (req.header('x-juror-id')) {
    res.status(401).json({
      error: 'unsupported_auth',
      message: 'Bearer tokens are required. Sign in again.',
    });
    return;
  }

  const header = req.header('authorization') ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    res.status(401).json({ error: 'unauthorized', message: 'Sign in to continue.' });
    return;
  }

  /**
   * Reuse the signature check `identify` already did, if it ran.
   *
   * That middleware verifies the same token, with the same issuer, audience
   * and expiry, before the rate limiter so the limiter has a key. Verifying it
   * again here is a second HMAC on every authenticated request for an answer
   * we already have.
   *
   * The fallback is not optional and not defensive clutter: routers can be
   * mounted without the app-level chain (the limiter tests do exactly that),
   * and a middleware that silently authenticates nobody when its neighbour is
   * missing is worse than one that repeats a little work.
   */
  const userId = req.rateKeyUserId ?? (await verifyAccessToken(token));
  if (!userId) {
    // Expired or forged — the client cannot tell which, and should just try a
    // refresh and then a sign-in.
    res.status(401).json({ error: 'token_invalid', message: 'Your session has expired.' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    // A valid token for a juror who no longer exists — a deleted account with
    // a token still in flight.
    res.status(401).json({ error: 'token_invalid', message: 'Your session has expired.' });
    return;
  }

  req.juror = { userId, user };
  next();
}
