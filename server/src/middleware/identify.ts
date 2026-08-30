import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../services/tokens.js';

/**
 * Who is asking, cheaply, before anything else runs.
 *
 * This exists for one reason: the rate limiter.
 *
 * `globalLimiter` keys on `req.juror?.userId ?? ip`, and it is mounted at app
 * level — which is to say BEFORE any router, and therefore before
 * `requireJuror` has ever run. `req.juror` was always undefined at that point,
 * so the limiter always fell through to IP, for every request, authenticated
 * or not. Two consequences, and both were reproduced:
 *
 *   - Every player behind one carrier-grade NAT shared a single 120/min
 *     budget. That is most of a mobile user base in several of the countries
 *     this game deliberately localises for.
 *
 *   - With X-Forwarded-For trusted, the key was attacker-controlled. One
 *     authenticated user rotating the header pushed 180 requests through a
 *     120/min limit without a single 429.
 *
 * So the identity has to be known before the limiter, and it has to be known
 * without a database round trip — a limiter that queries Postgres to decide
 * whether to reject you is a denial-of-service amplifier, not a defence.
 *
 * The access token is a signed JWT this server minted, so `sub` is verified
 * cryptographically and needs nothing else. That is enough to key a bucket.
 *
 * It is deliberately NOT enough to authorise anything: this middleware never
 * rejects, never loads the User, and never sets `req.juror.user`. Routes still
 * go through `requireJuror`, which does the database lookup and refuses tokens
 * belonging to deleted accounts. This only answers "is this the same caller as
 * last time", which is the only question a rate limiter asks.
 */
export async function identify(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.header('authorization') ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme?.toLowerCase() === 'bearer' && token) {
    const userId = await verifyAccessToken(token);
    // No user object yet — requireJuror loads it. This is a key, not a session.
    if (userId) req.rateKeyUserId = userId;
  }

  next();
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /**
       * The verified subject of the access token, if there was one.
       *
       * Separate from `req.juror` on purpose. `req.juror` means "this caller is
       * an authorised, existing juror and here is their record"; this means
       * only "this caller proved they hold a token we signed". Conflating them
       * is how a rate-limit key turns into an authorisation decision.
       */
      rateKeyUserId?: string;
    }
  }
}
