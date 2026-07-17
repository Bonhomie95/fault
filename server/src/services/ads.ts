import { prisma } from '../lib/prisma.js';
import { hasEntitlement } from './economy.js';

/**
 * Advertising.
 *
 * The GDD (§10) said "No ads. No subscriptions. Premium positioning, no dark
 * patterns." That has been reversed as a product decision, so the job here is
 * to take the money without taking the game apart. Three rules do most of it:
 *
 *  1. NEVER inside a case. Not before the verdict, not between tabs, not on
 *     the timer. The one thing FAULT asks of a player is 120 seconds of
 *     undivided attention; selling that attention back to an advertiser
 *     mid-deliberation would break the only promise the design makes.
 *
 *  2. The cadence is random and the server owns it. A client-side counter is
 *     a client-side counter — skippable, and re-rollable by force-quitting.
 *
 *  3. Rewarded views are opt-in, capped, and never required. Merit is always
 *     reachable by playing; an ad is a shortcut, not a toll.
 */

/** Interstitial every 2-3 cases, rolled fresh so the player cannot count. */
const MIN_CASES_BETWEEN_ADS = 2;
const MAX_CASES_BETWEEN_ADS = 3;

export function rollCadence(): number {
  const span = MAX_CASES_BETWEEN_ADS - MIN_CASES_BETWEEN_ADS + 1;
  return MIN_CASES_BETWEEN_ADS + Math.floor(Math.random() * span);
}

export interface AdDecision {
  /** Show an interstitial now — after the verdict, before the next case. */
  showInterstitial: boolean;
  /** How many more cases until the next one. Display/debug only. */
  casesUntilNext: number;
}

/**
 * Called once per verdict, after the fact.
 *
 * Rolling a new cadence on every ad is what makes it feel like weather rather
 * than a meter. A fixed "every 3rd case" teaches the player to brace; 2-or-3
 * does not.
 */
export async function noteCaseHeard(userId: string): Promise<AdDecision> {
  if (await hasEntitlement(userId, 'no_ads')) {
    return { showInterstitial: false, casesUntilNext: Number.POSITIVE_INFINITY };
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { casesSinceAd: true, adEveryNCases: true },
  });

  const seen = user.casesSinceAd + 1;

  if (seen < user.adEveryNCases) {
    await prisma.user.update({ where: { id: userId }, data: { casesSinceAd: seen } });
    return { showInterstitial: false, casesUntilNext: user.adEveryNCases - seen };
  }

  // Due. Reset the counter and roll the next stretch.
  const next = rollCadence();
  await prisma.user.update({
    where: { id: userId },
    data: { casesSinceAd: 0, adEveryNCases: next },
  });

  return { showInterstitial: true, casesUntilNext: next };
}

/** Record that an interstitial was actually shown, for reporting and for support. */
export async function recordInterstitial(userId: string): Promise<void> {
  await prisma.adEvent.create({ data: { userId, kind: 'interstitial' } });
}
