import { Router } from 'express';
import { z } from 'zod';
import { CLOCK_SECONDS } from '../domain/clock.js';
import { checkJurorName, NAME_MAX } from '../domain/jurorName.js';
import { env } from '../lib/env.js';
import { log } from '../lib/log.js';
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
    // Apple requires both to be reachable from inside the app. Served from
    // here rather than hardcoded in the client so they can be corrected
    // without shipping a build — a dead privacy policy link is a rejection.
    support: {
      privacyPolicyUrl: env.PRIVACY_POLICY_URL || null,
      termsUrl: env.TERMS_URL || null,
      supportEmail: env.SUPPORT_EMAIL || null,
    },
  });
});

/**
 * Change the name on the record.
 *
 * This did not exist, and its absence was the real moderation problem. The
 * juror name is published on the leaderboard, and the only remedy an operator
 * had for an abusive one was deleting the account — which takes the player's
 * whole career with it for the sake of a string. Guideline 1.2 asks for the
 * ability to act on a report; this is that ability.
 *
 * Rate limited by the global limiter and bounded by a cooldown: a name that
 * can change every few seconds is a name nobody on the boards can report,
 * because it will not be the same name by the time anyone looks.
 */
const RENAME_COOLDOWN_HOURS = 24;

sessionRouter.patch('/me/name', requireJuror, async (req, res) => {
  const { userId, user } = req.juror;

  const parsed = z
    .object({ jurorName: z.string().min(1).max(NAME_MAX * 4) })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'jurorName required' });
    return;
  }

  const check = checkJurorName(parsed.data.jurorName);
  if (!check.ok) {
    res.status(400).json({ error: 'juror_name_rejected', reason: check.reason, message: check.message });
    return;
  }

  if (check.value === user.jurorName) {
    res.json({ jurorName: user.jurorName, changed: false });
    return;
  }

  const since = user.nameChangedAt
    ? Date.now() - user.nameChangedAt.getTime()
    : Number.POSITIVE_INFINITY;
  const cooldownMs = RENAME_COOLDOWN_HOURS * 3600_000;

  if (since < cooldownMs) {
    const hours = Math.ceil((cooldownMs - since) / 3600_000);
    res.status(429).json({
      error: 'rename_too_soon',
      message: `The register accepts one change a day. Try again in ${hours} hour${hours === 1 ? '' : 's'}.`,
      retryAfterHours: hours,
    });
    return;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { jurorName: check.value, nameChangedAt: new Date() },
  });

  // Logged so a moderated rename is traceable afterwards. The old name is
  // included because that is the one a report will have referred to.
  log.info('juror renamed', { userId, from: user.jurorName, to: check.value });

  res.json({ jurorName: check.value, changed: true });
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
