import { Router } from 'express';
import { CLOCK_SECONDS } from '../domain/clock.js';
import { prisma } from '../lib/prisma.js';
import { requireJuror } from '../middleware/requireJuror.js';
import { entitlementsFor } from '../services/economy.js';
import { revokeAll } from '../services/tokens.js';

export const sessionRouter = Router();

/**
 * NOTE: `POST /api/session` is gone.
 *
 * It predated OAuth and minted a fully playable juror from nothing but a name
 * — no provider, no token, no verification. Every check in services/auth.ts
 * was bypassable by calling the older endpoint sitting next to it. Sign-in now
 * happens only through /api/auth/sign-in.
 *
 * `clockSeconds` is gone too: the deliberation window is a server constant
 * (domain/clock.ts), not a per-user setting, and the client is told what it is
 * rather than asked.
 */

sessionRouter.get('/me', requireJuror, async (req, res) => {
  const { userId, user } = req.juror;
  const casesHeard = await prisma.verdictRecord.count({ where: { userId } });

  res.json({
    userId: user.id,
    jurorName: user.jurorName,
    clockSeconds: CLOCK_SECONDS,
    entitlements: await entitlementsFor(userId),
    merit: user.merit,
    casesHeard,
  });
});

/**
 * Delete everything.
 *
 * Apple requires in-app account deletion from any app that offers account
 * creation, and GDPR requires it of us regardless. The schema cascades from
 * User, so one delete takes the cases, verdicts, characters, city, ledger and
 * tokens with it.
 *
 * This is genuinely irreversible and there is no soft-delete hiding behind it:
 * a player who asks to be forgotten is asking for the whole career — every
 * verdict, the city they made — to stop existing. Anything less is a lie.
 */
sessionRouter.delete('/me', requireJuror, async (req, res) => {
  const { userId } = req.juror;

  // Kill the tokens first: if the delete fails halfway, the account is at
  // least no longer reachable with the credentials the client holds.
  await revokeAll(userId);
  await prisma.user.delete({ where: { id: userId } });

  res.json({ deleted: true });
});
