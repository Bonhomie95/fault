import { Router } from 'express';
import { z } from 'zod';
import { MERIT, SKUS, skuById } from '../domain/store.js';
import { log } from '../lib/log.js';
import { prisma } from '../lib/prisma.js';
import { economyLimiter } from '../middleware/limits.js';
import { requireJuror } from '../middleware/requireJuror.js';
import {
  buyWithMerit,
  claimRewardedAd,
  entitlementsFor,
  hasEntitlement,
  redeemPurchase,
  ReceiptOwnedByAnotherAccount,
  rewardedAdsToday,
} from '../services/economy.js';
import { verifyReceipt } from '../services/receipts.js';

export const storeRouter = Router();

/**
 * NOTE ON MIDDLEWARE ORDER.
 *
 * `storeRouter.use(economyLimiter)` used to live here, which put the limiter
 * ahead of `requireJuror` on every route below — so `economyLimiter` never saw
 * an authenticated juror and silently keyed every store request by IP, the
 * same bug the global limiter had.
 *
 * Each route now lists `requireJuror, economyLimiter` in that order. It is
 * more typing and it is the only ordering that actually limits per player.
 */

/**
 * The shelf.
 *
 * Prices come from the server, always. A client that is told the price cannot
 * set the price.
 */
storeRouter.get('/', requireJuror, economyLimiter, async (req, res) => {
  const { userId, user } = req.juror;
  const owned = await entitlementsFor(userId);

  res.json({
    merit: user.merit,
    entitlements: owned,
    rewardedAdsLeft: Math.max(0, MERIT.rewardedAdsPerDay - (await rewardedAdsToday(userId))),
    rewardedAdMerit: MERIT.rewardedAd,
    items: SKUS.map((s) => ({
      id: s.id,
      title: s.title,
      blurb: s.blurb,
      kind: s.kind,
      priceMinor: s.priceMinor,
      meritPrice: s.meritPrice,
      meritGranted: s.meritGranted ?? null,
      owned: s.grants ? owned.includes(s.grants) : false,
      affordable: s.meritPrice !== null && user.merit >= s.meritPrice,
    })),
  });
});

/** Buy with Merit — the earned path. */
storeRouter.post('/buy', requireJuror, economyLimiter, async (req, res) => {
  const parsed = z.object({ sku: z.string() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'sku required' });
    return;
  }

  try {
    const result = await buyWithMerit(req.juror.userId, parsed.data.sku);
    res.json(result);
  } catch (err) {
    const message = (err as Error).message;
    // These are all player-facing situations, not faults.
    const status = message === 'no such item' ? 404 : 409;
    res.status(status).json({ error: message });
  }
});

const redeemSchema = z.object({
  sku: z.string(),
  /** The store's transaction id, from the receipt we just validated. */
  transactionId: z.string().min(4),
  platform: z.enum(['ios', 'android']),
  /** The raw receipt / purchase token. Validated before anything is granted. */
  receipt: z.string().min(4),
});

/**
 * Redeem a real-money purchase.
 *
 * The receipt is verified with Apple or Google before anything is granted (see
 * services/receipts.ts). Unconfigured credentials mean every purchase is
 * refused — a server that cannot tell a real receipt from a made-up one must
 * not guess in the buyer's favour.
 *
 * The rest was already in place and is the part usually skipped: transactionId
 * is unique in the database so a replayed receipt collides rather than
 * double-granting, grants are idempotent so restore works, and the server
 * prices everything.
 */
storeRouter.post('/redeem', requireJuror, economyLimiter, async (req, res) => {
  const parsed = redeemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid purchase' });
    return;
  }

  const sku = skuById(parsed.data.sku);
  if (!sku || sku.priceMinor === null) {
    res.status(404).json({ error: 'no such item' });
    return;
  }

  const { valid } = await verifyReceipt(parsed.data);
  if (!valid) {
    res.status(402).json({
      error: 'receipt_unverified',
      message: 'That purchase could not be verified.',
    });
    return;
  }

  try {
    const result = await redeemPurchase({
      userId: req.juror.userId,
      sku,
      transactionId: parsed.data.transactionId,
      platform: parsed.data.platform,
    });
    res.json(result);
  } catch (err) {
    if (err instanceof ReceiptOwnedByAnotherAccount) {
      // A real, Apple-confirmed receipt — attached to a different juror. Worth
      // a log line at any volume: it is either receipt sharing, or a player
      // who has ended up with two accounts and one purchase, and those want
      // different answers from a human.
      log.warn('receipt redeemed against another account', {
        userId: req.juror.userId,
        sku: sku.id,
        transactionId: parsed.data.transactionId,
      });
      res.status(409).json({
        error: 'receipt_belongs_to_another_account',
        message:
          'That purchase is already on another juror’s record. Sign in as that juror to restore it.',
      });
      return;
    }
    throw err;
  }
});

/** Restore purchases — Apple requires this to exist and to be reachable. */
storeRouter.post('/restore', requireJuror, economyLimiter, async (req, res) => {
  const { userId } = req.juror;
  const purchases = await prisma.purchase.findMany({
    where: { userId, source: 'store' },
  });
  res.json({ restored: purchases.length, entitlements: await entitlementsFor(userId) });
});

/**
 * Claim a rewarded ad view.
 *
 * Server-side capped and deduplicated by viewId: a rewarded ad is a Merit
 * faucet, and a faucet without a tap is just a hole. In production the viewId
 * should be an SSV callback from the ad network rather than the client's word.
 */
storeRouter.post('/ad-reward', requireJuror, economyLimiter, async (req, res) => {
  const parsed = z.object({ viewId: z.string().min(6) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'viewId required' });
    return;
  }

  // Someone who paid to remove ads should not be offered Merit for watching
  // one; the rewarded slot stays available but it is opt-in, never pushed.
  try {
    const merit = await claimRewardedAd(req.juror.userId, parsed.data.viewId);
    res.json({ merit, awarded: MERIT.rewardedAd });
  } catch (err) {
    res.status(429).json({ error: (err as Error).message });
  }
});

/**
 * Who sees advertising.
 *
 * The server decides, not the app — an ad-free entitlement enforced only in
 * the client is an ad-free entitlement anyone can have.
 */
storeRouter.get('/ads', requireJuror, economyLimiter, async (req, res) => {
  const { userId } = req.juror;
  const noAds = await hasEntitlement(userId, 'no_ads');

  res.json({
    showAds: !noAds,
    // Never inside a case: an interstitial between reading evidence and
    // delivering a verdict would be the game selling the player's attention
    // during the one moment it asked them to concentrate.
    interstitialEveryNCases: noAds ? null : 3,
    rewardedAvailable: (await rewardedAdsToday(userId)) < MERIT.rewardedAdsPerDay,
  });
});
