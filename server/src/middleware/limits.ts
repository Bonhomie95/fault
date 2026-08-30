import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
import type { Request } from 'express';
import { env } from '../lib/env.js';

/**
 * Rate limits.
 *
 * Ordinary API abuse is a nuisance. Here it is also a bill: `/api/case/next`
 * spends real tokens from a shared daily pool, so an unthrottled flood does
 * not merely slow the server down — it drains the generation budget and drops
 * every other juror on the planet to the fallback docket. The limiter on that
 * route is protecting other players, not the CPU.
 */

/**
 * Prefer the authenticated juror; fall back to IP for unauthenticated routes.
 *
 * `rateKeyUserId` comes from the `identify` middleware, which runs ahead of
 * every limiter and verifies the access token's signature without touching the
 * database. It replaces `req.juror?.userId`, which was the bug: `req.juror` is
 * set by `requireJuror`, and `requireJuror` runs INSIDE the routers — after
 * the app-level limiter had already chosen its key. So the juror branch was
 * dead code and every request was keyed by IP, including authenticated ones.
 *
 * The IP fallback goes through ipKeyGenerator rather than using req.ip raw,
 * and the difference is not cosmetic: an IPv6 subscriber is handed a whole /64
 * and can pick a fresh address out of it for every request, so a limit keyed
 * on the full address counts to one and never higher. ipKeyGenerator keys the
 * /64 instead — the thing the user actually cannot change. IPv4 is unaffected.
 *
 * Note that the IP itself is only trustworthy because TRUST_PROXY_HOPS is now
 * configured to the deployment's real hop count (see lib/env). With the old
 * hardcoded `trust proxy: 1` in front of a server that had no proxy, req.ip
 * was simply whatever the caller wrote in X-Forwarded-For.
 */
const byJuror = (req: Request): string =>
  req.rateKeyUserId ?? (req.ip ? ipKeyGenerator(req.ip) : 'unknown');

const base: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'too_many_requests', message: 'Slow down.' },
  // Route tests legitimately pull eleven cases in a second to prove the trial
  // gate closes at ten; without this they hit 429 and assert nothing useful.
  // Refused in production at boot (lib/env).
  skip: () => env.DISABLE_RATE_LIMITS,
};

/** Everything, as a backstop. */
export const globalLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: 120,
  keyGenerator: byJuror,
});

/**
 * Sign-in. Tight, and keyed by IP because there is no juror yet — this is the
 * route someone brute-forces.
 */
export const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60_000,
  limit: 20,
  keyGenerator: byJuror,
  message: { error: 'too_many_requests', message: 'Too many attempts. Try again shortly.' },
});

/**
 * Handing out a sign-in nonce.
 *
 * Separate from authLimiter, and more generous, because every sign-in attempt
 * now costs TWO requests: one for the nonce and one for the sign-in. Sharing
 * one 20-per-15-minute bucket would have quietly halved the number of attempts
 * an IP gets — which nobody notices on a home connection and which is a real
 * lockout behind a carrier-grade NAT, in exactly the markets this game
 * localises for.
 *
 * Minting a nonce is a random string and a Redis SET. The security-relevant
 * limit is on the sign-in itself, where a credential is actually presented.
 */
export const nonceLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60_000,
  limit: 60,
  keyGenerator: byJuror,
  message: { error: 'too_many_requests', message: 'Too many attempts. Try again shortly.' },
});

/**
 * Trading a refresh token for a new pair.
 *
 * This route presents a CREDENTIAL and is not behind requireJuror, and it was
 * covered only by globalLimiter — 120 a minute, which is 1,800 attempts per
 * quarter of an hour against a route that hands out sessions. `/sign-in` allows
 * twenty in the same window. There is no reason for the endpoint that trades
 * one bearer token for two to be ninety times more permissive than the one
 * that checks a password.
 *
 * Not authLimiter's twenty, though. There is no juror on this request either,
 * so the bucket falls back to the IP — and behind carrier-grade NAT that is a
 * whole neighbourhood sharing one key, in exactly the markets this game
 * localises for. Thirty is far more than the two-an-hour a real client needs
 * (access tokens last thirty minutes) while still cutting the grinding surface
 * by sixty times.
 *
 * Reuse detection in services/auth already revokes every session when a token
 * is replayed. This is the layer in front of it, so an attacker gets far fewer
 * swings before that trap is even reached.
 */
export const refreshLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60_000,
  limit: 30,
  keyGenerator: byJuror,
  message: { error: 'too_many_requests', message: 'Too many attempts. Try again shortly.' },
});

/**
 * Case generation — the expensive one.
 *
 * A human plays a case in 120 seconds, so ~10/minute is already far more than
 * anyone can legitimately consume. Anything above this is a script.
 */
export const generationLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: 10,
  keyGenerator: byJuror,
  message: { error: 'too_many_requests', message: 'The docket is not that fast.' },
});

/** Anything that moves money or Merit. */
export const economyLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: 20,
  keyGenerator: byJuror,
});

/**
 * Delivering a verdict.
 *
 * This had no limiter of its own and relied entirely on the global backstop —
 * which, per the note above, was bypassable. It is the heaviest write path in
 * the game (a transaction, a character pool update, a city recompute, a
 * background generation) and a verdict requires a case that took real tokens
 * to produce, so a human cannot legitimately exceed a handful per minute.
 */
export const verdictLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: 12,
  keyGenerator: byJuror,
  message: { error: 'too_many_requests', message: 'The court cannot hear them that fast.' },
});

/**
 * Filing a report about a case or a name.
 *
 * Low, because a report is a human action taken rarely, and because the
 * endpoint writes a row on the strength of an unverified claim.
 */
export const reportLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60_000,
  limit: 20,
  keyGenerator: byJuror,
  message: { error: 'too_many_requests', message: 'That is a great many reports.' },
});
