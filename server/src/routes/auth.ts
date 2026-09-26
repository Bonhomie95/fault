import { Router } from 'express';
import { z } from 'zod';
import { COUNTRIES, districtFor, profileFor } from '../domain/jurisdiction.js';
import { checkJurorName, NAME_MAX } from '../domain/jurorName.js';
import { log } from '../lib/log.js';
import { prisma } from '../lib/prisma.js';
import { LEGAL_VERSION } from '../lib/legalText.js';
import { storeAppleRefreshToken } from '../services/appleTokens.js';
import {
  verifyApple,
  verifyDevice,
  verifyGoogle,
  verifyGuest,
  type VerifiedIdentity,
} from '../services/auth.js';
import { getCityState } from '../services/cityState.js';
import { consumeNonce, issueNonce, nonceIsLive, nonceStoreReady } from '../services/nonces.js';
import { issueTokens, revokeAll, rotateRefresh } from '../services/tokens.js';
import { authLimiter, nonceLimiter, refreshLimiter } from '../middleware/limits.js';
import { requireJuror } from '../middleware/requireJuror.js';

export const authRouter = Router();

const signInSchema = z.object({
  provider: z.enum(['apple', 'google', 'guest', 'device']),
  /**
   * Apple identityToken / Google id_token / the guest secret / a device id
   * in dev. Bounded: every one of these is well under 4kb, and an unbounded
   * string on an unauthenticated route is free work for anyone.
   */
  token: z.string().min(1).max(4096),
  /**
   * The nonce this server issued for this attempt, from GET /api/auth/nonce.
   *
   * Optional in the schema only so the device provider (dev, never production)
   * does not have to fetch one. Both real providers require it — see `verify`.
   */
  nonce: z.string().min(16).optional(),
  /**
   * Chosen by the player, always — we never adopt the provider's display name.
   * Required on first sign-in, ignored afterwards.
   *
   * Length is checked properly in domain/jurorName; the bound here is only a
   * cheap guard so a megabyte of text never reaches the normaliser. It is
   * deliberately looser than NAME_MAX, because trimming and NFKC folding can
   * shorten a string and the player should get the real message rather than a
   * bare 400.
   */
  jurorName: z.string().min(1).max(NAME_MAX * 4).optional(),
  /**
   * ISO alpha-2, reverse-geocoded on the device. Only the country reaches us:
   * the personalisation is country-level, so coordinates would be data the
   * game collects and never uses.
   */
  country: z.string().length(2).optional(),
  /** IANA zone from the device, so streaks and daily missions end at the
   *  player's midnight rather than UTC's. */
  timezone: z.string().max(64).optional(),
  /**
   * Apple only: the one-time authorization code from the same sheet. Traded
   * for a refresh token so account deletion can revoke it with Apple
   * (services/appleTokens). Optional — sign-in never depends on it.
   */
  authorizationCode: z.string().min(1).max(2048).optional(),
  /**
   * The LEGAL_VERSION of the Terms and Privacy Policy the sign-in screen
   * showed, sent because the player continued past "By continuing you
   * confirm you are 13 or older and agree to…". Recorded only if it is the
   * CURRENT version: an old build agreeing to old terms is not consent to
   * the new ones, and the consent gate will ask again.
   */
  consentVersion: z.string().max(32).optional(),
});

/** Consent fields to write, if the client showed the current documents. */
function consentFrom(version: string | undefined) {
  return version === LEGAL_VERSION ? { consentedAt: new Date(), consentVersion: LEGAL_VERSION } : {};
}

/**
 * A nonce, for one sign-in attempt.
 *
 * Unauthenticated by necessity — this is the step before an identity exists.
 * On its own limiter rather than the sign-in one: an attempt now costs two
 * requests, and sharing a bucket would halve how many an IP gets (see
 * middleware/limits).
 */
authRouter.get('/nonce', nonceLimiter, async (_req, res) => {
  if (!(await nonceStoreReady())) {
    // Redis is a degradable cache everywhere else in this codebase. Not here:
    // a nonce store that silently forgets is a nonce check that silently
    // passes, which is worse than no check because it looks like one.
    res.status(503).json({
      error: 'sign_in_unavailable',
      message: 'The court cannot swear anyone in right now. Try again shortly.',
    });
    return;
  }
  res.json(await issueNonce());
});

async function verify(
  provider: string,
  token: string,
  nonce: string | undefined,
): Promise<VerifiedIdentity> {
  if (provider === 'device') return verifyDevice(token);
  // A guest secret is its own proof (services/auth.ts); there is no provider
  // for a nonce to bind to.
  if (provider === 'guest') return verifyGuest(token);

  // Both real providers must present a nonce this server issued and has not
  // already spent.
  //
  // This CHECKS the nonce but does not spend it, because a first-time Apple or
  // Google sign-in sends this endpoint two requests with the same provider
  // token: one to find out a name is needed, one carrying it. Spending here
  // burned the nonce on the first, so the second was refused as a replay and
  // nobody could ever complete a new sign-in. The nonce is spent at the two
  // points below where a sign-in actually succeeds, which is still exactly
  // once and still atomic.
  if (!nonce) throw new Error('sign-in nonce is required');
  if (!(await nonceIsLive(nonce))) {
    throw new Error('sign-in nonce is unknown, expired, or already used');
  }

  if (provider === 'apple') return verifyApple(token, nonce);
  return verifyGoogle(token, nonce);
}

/**
 * Spend the nonce, at the moment a sign-in is about to succeed.
 *
 * Providers that carry no nonce (guest, and `device` in development) have
 * nothing to spend and pass straight through. For the rest this is the single
 * atomic use: two concurrent replays race on Redis DEL and exactly one wins.
 */
async function spend(nonce: string | undefined): Promise<boolean> {
  if (!nonce) return true;
  return consumeNonce(nonce);
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

  const { provider, token, nonce, jurorName, country, timezone, authorizationCode, consentVersion } =
    parsed.data;

  let identity: VerifiedIdentity;
  try {
    identity = await verify(provider, token, nonce);
  } catch (err) {
    // Never echo the provider's error back — it can leak configuration.
    log.warn('sign-in verification failed', { provider, err: (err as Error).message });
    res.status(401).json({ error: 'could not verify that sign-in' });
    return;
  }

  const existing = await prisma.authIdentity.findUnique({
    where: { provider_subject: { provider: identity.provider, subject: identity.subject } },
    include: { user: true },
  });

  if (existing) {
    if (!(await spend(nonce))) {
      res.status(401).json({ error: 'could not verify that sign-in' });
      return;
    }
    const updated = await prisma.user.update({
      where: { id: existing.userId },
      data: {
        lastSeenAt: new Date(),
        // People travel and phones move; keep the day boundary where they are.
        ...(timezone ? { timezone } : {}),
        ...consentFrom(consentVersion),
      },
      select: { consentVersion: true },
    });

    if (provider === 'apple' && authorizationCode) {
      void storeAppleRefreshToken(existing.userId, authorizationCode);
    }

    res.json({
      userId: existing.userId,
      jurorName: existing.user.jurorName,
      returning: true,
      // "Returning" means the court has met this identity, NOT that they have
      // ever heard a case. Someone who swore in, closed the app on the Chief
      // Justice's letter and reinstalled is returning and has read nothing —
      // the client needs the count to tell those apart, and without it the
      // letter was skipped forever for anyone who quit before their first case.
      casesHeard: await prisma.verdictRecord.count({ where: { userId: existing.userId } }),
      consentRequired: updated.consentVersion !== LEGAL_VERSION,
      ...(await issueTokens(existing.userId)),
    });
    return;
  }

  if (!jurorName) {
    // A new identity with no name yet: the client must ask who they are.
    res.status(409).json({ error: 'juror_name_required' });
    return;
  }

  // The name goes on a public registry, so it is filtered and normalised
  // before it is stored — see domain/jurorName. `check.value` is what gets
  // written, never the raw input.
  const check = checkJurorName(jurorName);
  if (!check.ok) {
    res.status(400).json({ error: 'juror_name_rejected', reason: check.reason, message: check.message });
    return;
  }

  if (!(await spend(nonce))) {
    res.status(401).json({ error: 'could not verify that sign-in' });
    return;
  }

  const code = (country ?? 'NO').toUpperCase();
  const profile = profileFor(code);
  const localeTag = profile.localeTag;

  const user = await prisma.user.create({
    data: {
      jurorName: check.value,
      homeCountry: code,
      currentCountry: code,
      localeTag,
      timezone: timezone ?? 'UTC',
      ...consentFrom(consentVersion),
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

  if (provider === 'apple' && authorizationCode) {
    void storeAppleRefreshToken(user.id, authorizationCode);
  }

  res.status(201).json({
    userId: user.id,
    jurorName: user.jurorName,
    returning: false,
    homeCountry: code,
    homeDistrict: district,
    consentRequired: user.consentVersion !== LEGAL_VERSION,
    ...(await issueTokens(user.id)),
  });
});

/**
 * Trade a refresh token for a new pair.
 *
 * Access tokens last 30 minutes; without this the player is signed out
 * mid-case twice an hour.
 */
authRouter.post('/refresh', refreshLimiter, async (req, res) => {
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
