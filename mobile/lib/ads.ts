import { reportError } from '@/lib/report';

/**
 * Advertising, as a seam.
 *
 * The placement design is done and it is the part that was worth getting
 * right: the server decides whether an interstitial is due on a 2–3 case
 * cadence the client cannot see, skip, or re-roll by force-quitting; the slot
 * sits AFTER the aftermath has been read and before the next case; and nothing
 * ever appears during a case. FAULT asks for 120 seconds of undivided
 * attention and then sells the gap — selling the 120 would break the only
 * promise the design makes.
 *
 * What was missing was any network behind it. `Interstitial` ran a `fakeLoad`
 * timer, and `lib/purchases` has the same shape for the same reason: choosing
 * an ad SDK is a real decision with real consequences — AdMob pulls in
 * Google Play Services and wants IDFA, and the tracking prompt that implies is
 * a product question, not a refactor. So this defines what an SDK has to
 * provide and leaves the choice open, with everything around it finished.
 *
 * REWARDED VIEWS, and the thing not to get wrong: the `viewId` this hands back
 * is what the server pays Merit against, and it is deduplicated there. In
 * production it should be an SSV (server-side verification) callback from the
 * ad network rather than the client's word — a rewarded ad is a Merit faucet,
 * and a faucet whose tap is on the client is a hole. The server-side cap
 * (5/day, enforced in the database) is what makes the current arrangement
 * survivable until then.
 */

export interface AdBackend {
  /** Ready to serve. False disables the slot entirely rather than stalling it. */
  isReady(): Promise<boolean>;
  /**
   * Show a full-screen interstitial and resolve when it is dismissed.
   *
   * Resolving `false` means no ad was available. That is not an error and must
   * not block the player: an advertiser who cannot produce an advert has
   * forfeited the slot.
   */
  showInterstitial(): Promise<boolean>;
  /**
   * Show a rewarded ad. Resolves with the network's view id if it was watched
   * to completion, or null if it was skipped or unavailable.
   */
  showRewarded(): Promise<string | null>;
}

let backend: AdBackend | null = null;

export function setAdBackend(impl: AdBackend | null): void {
  backend = impl;
}

export function adsAvailable(): boolean {
  return backend !== null;
}

/**
 * How long to wait for an ad before deciding the player's time is worth more.
 *
 * Matches the constant the Interstitial component already used. Six seconds is
 * longer than any healthy fill and short enough that nobody feels trapped.
 */
export const AD_LOAD_TIMEOUT_MS = 6000;

/**
 * Show an interstitial, or don't.
 *
 * Never rejects and never hangs: every failure path resolves false, and the
 * caller moves on. A player held hostage to an impression is a player who
 * uninstalls, and the revenue from one interstitial is not worth that trade.
 */
export async function showInterstitial(): Promise<boolean> {
  if (!backend) return false;

  try {
    if (!(await backend.isReady())) return false;

    return await Promise.race([
      backend.showInterstitial(),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), AD_LOAD_TIMEOUT_MS)),
    ]);
  } catch (err) {
    reportError('ads.interstitial', err);
    return false;
  }
}

/**
 * Show a rewarded ad and return the view id to claim Merit against.
 *
 * Null means nothing to claim — skipped, unavailable, or failed. The caller
 * must not grant anything on a null; the server would refuse it anyway, which
 * is the correct division of trust.
 */
export async function showRewarded(): Promise<string | null> {
  if (!backend) return null;

  try {
    if (!(await backend.isReady())) return null;
    return await backend.showRewarded();
  } catch (err) {
    reportError('ads.rewarded', err);
    return null;
  }
}
