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
 * The fallback goes through ipKeyGenerator rather than using req.ip raw, and
 * the difference is not cosmetic: an IPv6 subscriber is handed a whole /64 and
 * can pick a fresh address out of it for every request, so a limit keyed on
 * the full address counts to one and never higher. ipKeyGenerator keys the /64
 * instead — the thing the user actually cannot change. IPv4 is unaffected.
 */
const byJuror = (req: Request): string =>
  req.juror?.userId ?? (req.ip ? ipKeyGenerator(req.ip) : 'unknown');

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
