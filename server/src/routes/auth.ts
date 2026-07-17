import { Router } from 'express';
import { z } from 'zod';
import { COUNTRIES, districtFor, profileFor } from '../domain/jurisdiction.js';
import { prisma } from '../lib/prisma.js';
import { verifyApple, verifyDevice, verifyGoogle, type VerifiedIdentity } from '../services/auth.js';
import { getCityState } from '../services/cityState.js';
import { issueTokens, revokeAll, rotateRefresh } from '../services/tokens.js';
import { authLimiter } from '../middleware/limits.js';
import { requireJuror } from '../middleware/requireJuror.js';

export const authRouter = Router();

const signInSchema = z.object({
  provider: z.enum(['apple', 'google', 'device']),
  /** Apple identityToken / Google id_token / a device id in dev. */
  token: z.string().min(1),
  /**
   * Chosen by the player, always — we never adopt the provider's display name.
   * Required on first sign-in, ignored afterwards.
   */
  jurorName: z.string().trim().min(1).max(40).optional(),
  /**
   * ISO alpha-2, reverse-geocoded on the device. Only the country reaches us:
   * the personalisation is country-level, so coordinates would be data the
   * game collects and never uses.
   */
  country: z.string().length(2).optional(),
  /** IANA zone from the device, so streaks and daily missions end at the
   *  player's midnight rather than UTC's. */
  timezone: z.string().max(64).optional(),
});

async function verify(provider: string, token: string): Promise<VerifiedIdentity> {
  if (provider === 'apple') return verifyApple(token);
  if (provider === 'google') return verifyGoogle(token);
  return verifyDevice(token);
}

/**
 * Sign in, or swear in for the first time.
 *
 * One endpoint for both: the provider identity is the key, and whether a
 * juror already exists behind it is our problem, not the client's.
 */
authRouter.post('/sign-in', authLimiter, async (req, res) => {
  const parsed = signInSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid sign-in payload' });
    return;
  }

  const { provider, token, jurorName, country, timezone } = parsed.data;

  let identity: VerifiedIdentity;
  try {
    identity = await verify(provider, token);
  } catch (err) {
    // Never echo the provider's error back — it can leak configuration.
    console.warn('[auth] verification failed:', (err as Error).message);
    res.status(401).json({ error: 'could not verify that sign-in' });
    return;
  }

  const existing = await prisma.authIdentity.findUnique({
    where: { provider_subject: { provider: identity.provider, subject: identity.subject } },
    include: { user: true },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.userId },
      data: {
        lastSeenAt: new Date(),
        // People travel and phones move; keep the day boundary where they are.
        ...(timezone ? { timezone } : {}),
      },
    });

    res.json({
      userId: existing.userId,
      jurorName: existing.user.jurorName,
      returning: true,
      ...(await issueTokens(existing.userId)),
    });
    return;
  }

  if (!jurorName) {
    // A new identity with no name yet: the client must ask who they are.
    res.status(409).json({ error: 'juror_name_required' });
    return;
  }

  const code = (country ?? 'NO').toUpperCase();
  const profile = profileFor(code);
  const localeTag = profile.localeTag;

  const user = await prisma.user.create({
    data: {
      jurorName,
      homeCountry: code,
      currentCountry: code,
      localeTag,
      timezone: timezone ?? 'UTC',
      cityState: { create: {} },
      jurorProfile: { create: {} },
      identities: {
        create: { provider: identity.provider, subject: identity.subject, email: identity.email },
      },
    },
  });

  // The home district needs the user id to be deterministic, so it is set
  // immediately after creation rather than guessed beforehand.
  const district = districtFor(code, user.id);
  await prisma.user.update({ where: { id: user.id }, data: { homeDistrict: district } });
  await getCityState(user.id);

  res.status(201).json({
    userId: user.id,
    jurorName: user.jurorName,
    returning: false,
    homeCountry: code,
    homeDistrict: district,
    ...(await issueTokens(user.id)),
  });
});

/**
 * Trade a refresh token for a new pair.
 *
 * Access tokens last 30 minutes; without this the player is signed out
 * mid-case twice an hour.
 */
authRouter.post('/refresh', async (req, res) => {
  const parsed = z.object({ refreshToken: z.string().min(10) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'refreshToken required' });
    return;
  }

  const pair = await rotateRefresh(parsed.data.refreshToken);
  if (!pair) {
    res.status(401).json({ error: 'refresh_invalid', message: 'Sign in again.' });
    return;
  }

  res.json(pair);
});

/** Sign out everywhere. */
authRouter.post('/sign-out', requireJuror, async (req, res) => {
  await revokeAll(req.juror.userId);
  res.json({ signedOut: true });
});

/** Countries the game can actually stage a case in. */
authRouter.get('/countries', (_req, res) => {
  res.json({
    countries: Object.values(COUNTRIES).map((c) => ({
      code: c.code,
      name: c.name,
      districts: c.districts,
    })),
  });
});
