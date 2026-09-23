import { Router } from 'express';
import { z } from 'zod';
import { DOCKET, MERIT, PACKS, PASS_MERIT_MULTIPLIER, SKUS, skuById, STARTER_WINDOW_HOURS } from '../domain/store.js';
import { env } from '../lib/env.js';
import { log } from '../lib/log.js';
import { prisma } from '../lib/prisma.js';
import { economyLimiter } from '../middleware/limits.js';
import { requireJuror } from '../middleware/requireJuror.js';
import {
  buyWithMerit,
  claimRewardedAd,
  docketFor,
  entitlementsFor,
  hasEntitlement,
  passExpiry,
  redeemPurchase,
  ReceiptOwnedByAnotherAccount,
  rewardedAdsToday,
} from '../services/economy.js';
import { verifyReceipt } from '../services/receipts.js';
import { verifySsv } from '../services/adSsv.js';

export const storeRouter = Router();

/**
 * Rewarded views pay only through Google's signed callback (services/adSsv),
 * so they are offered only once that callback is configured in AdMob — or in
 * development, where the fake-purchase switch also fakes the view.
 */
const rewardedEnabled = () =>
  env.ADS_SERVER_VERIFIED || clientClaimAllowed();

/**
 * Whether a view may be paid on the client's word: development, or an
 * internal test running Google's test ad units (which send no callback).
 */
const clientClaimAllowed = () =>
  env.ADS_TRUST_CLIENT || (env.ALLOW_FAKE_PURCHASES && env.NODE_ENV !== 'production');

/** Courtrooms and seals a juror can put on, and what owning each means. */
const ROOMS = ['room_oak', 'room_concrete', 'room_marble', 'room_night'] as const;
const SEALS = ['seal_brass', 'seal_obsidian', 'seal_ivory', 'seal_gold', 'patron'] as const;

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
  const [docket, passUntil, starterBought, meritViews, caseViews] = await Promise.all([
    docketFor(user),
    passExpiry(userId),
    prisma.purchase.count({ where: { userId, sku: 'starter_bundle' } }),
    rewardedAdsToday(userId, 'merit'),
    rewardedAdsToday(userId, 'case'),
  ]);

  // The starter bundle: new jurors, once, and only while it is still a deal —
  // someone who already owns what it contains is not offered it again.
  const starterEndsAt = new Date(user.createdAt.getTime() + STARTER_WINDOW_HOURS * 3_600_000);
  const starterAvailable =
    starterBought === 0 &&
    starterEndsAt > new Date() &&
    !(owned.includes('campaign') && owned.includes('no_ads'));

  const rewarded = rewardedEnabled();

  // How far into each special docket this juror is.
  const packCounts = await prisma.case.groupBy({
    by: ['pack'],
    where: { userId, pack: { not: null } },
    _count: { _all: true },
  });
  const packs = Object.entries(PACKS).map(([entitlement, p]) => ({
    key: p.key,
    sku: entitlement,
    owned: owned.includes(entitlement as never),
    heard: packCounts.find((c) => c.pack === p.key)?._count._all ?? 0,
    total: DOCKET.packCases,
  }));

  res.json({
    merit: user.merit,
    entitlements: owned,
    shields: user.streakShields,
    docket,
    pass: { active: passUntil !== null, expiresAt: passUntil, meritMultiplier: PASS_MERIT_MULTIPLIER },
    starter: { available: starterAvailable, endsAt: starterAvailable ? starterEndsAt : null },
    equipped: { room: user.roomTheme, seal: user.sealStyle },
    packs,
    // Zero while ad rewards are switched off, so no client — including an old
    // build — offers a reward it cannot claim.
    rewardedAdsLeft: rewarded ? Math.max(0, MERIT.rewardedAdsPerDay - meritViews) : 0,
    rewardedCasesLeft: rewarded ? docket.adCasesLeft : 0,
    rewardedAdMerit: MERIT.rewardedAd,
    items: SKUS.filter((s) => !s.starter || starterAvailable).map((s) => ({
      id: s.id,
      title: s.title,
      blurb: s.blurb,
      kind: s.kind,
      store: s.store,
      period: s.period ?? null,
      badge: s.badge ?? null,
      priceMinor: s.priceMinor,
      meritPrice: s.meritPrice,
      meritGranted: s.meritGranted ?? null,
      shieldsGranted: s.shieldsGranted ?? null,
      casesGranted: s.casesGranted ?? null,
      grants: s.grants,
      owned: s.grants.length > 0 && s.grants.every((g) => owned.includes(g)),
      affordable: s.meritPrice !== null && user.merit >= s.meritPrice,
    })),
  });
});

/**
 * Put on a courtroom or a seal. Owned or nothing — and null takes it off.
 * An expired pass is not checked here: the room simply falls back when the
 * client stops seeing the entitlement.
 */
storeRouter.post('/equip', requireJuror, economyLimiter, async (req, res) => {
  const parsed = z
    .object({
      room: z.enum(ROOMS).nullable().optional(),
      seal: z.enum(SEALS).nullable().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid item' });
    return;
  }
  const owned = await entitlementsFor(req.juror.userId);
  const { room, seal } = parsed.data;
  if ((room && !owned.includes(room)) || (seal && !owned.includes(seal))) {
    res.status(403).json({ error: 'not owned' });
    return;
  }
  const user = await prisma.user.update({
    where: { id: req.juror.userId },
    data: {
      ...(room !== undefined ? { roomTheme: room } : {}),
      ...(seal !== undefined ? { sealStyle: seal } : {}),
    },
  });
  res.json({ equipped: { room: user.roomTheme, seal: user.sealStyle } });
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

  const { valid, expiresAt } = await verifyReceipt({
    ...parsed.data,
    // From OUR catalogue: the client does not get to say what kind of thing
    // it bought.
    subscription: sku.store === 'subscription',
  });
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
      expiresAt,
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
 * Claim a rewarded view on the client's word — DEVELOPMENT AND INTERNAL
 * TESTING ONLY (env ADS_TRUST_CLIENT).
 *
 * With real ad units a view pays only through Google's signed callback
 * (GET /api/store/ssv below). This exists so the whole loop can be exercised
 * against test ads, which send no callback.
 */
storeRouter.post('/ad-reward', requireJuror, economyLimiter, async (req, res) => {
  if (!clientClaimAllowed()) {
    res.status(404).json({ error: 'ad_rewards_unavailable', message: 'Rewarded notices are not available.' });
    return;
  }

  const parsed = z
    .object({ viewId: z.string().min(6), reward: z.enum(['merit', 'case']).default('merit') })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'viewId required' });
    return;
  }

  try {
    const merit = await claimRewardedAd(req.juror.userId, parsed.data.viewId, parsed.data.reward);
    res.json({ merit, awarded: parsed.data.reward === 'merit' ? MERIT.rewardedAd : 0 });
  } catch (err) {
    res.status(429).json({ error: (err as Error).message });
  }
});

/**
 * AdMob's server-side verification callback. Unauthenticated by design: the
 * caller is Google, and the signature is the authentication (services/adSsv).
 *
 * Always 200 once the signature checks out, even for a duplicate or a capped
 * view — a non-200 makes Google retry, and a retry of something we have
 * already decided is noise. Configure the URL in AdMob as
 * https://<api>/api/store/ssv on each rewarded ad unit.
 */
storeRouter.get('/ssv', async (req, res) => {
  const raw = req.originalUrl.split('?')[1] ?? '';
  const reward = await verifySsv(raw);
  if (!reward) {
    // AdMob's "verify URL" button sends an unsigned probe; tell it we exist.
    res.status(raw ? 400 : 200).json({ ok: !raw });
    return;
  }
  try {
    const exists = await prisma.user.findUnique({ where: { id: reward.userId }, select: { id: true } });
    if (exists) await claimRewardedAd(reward.userId, reward.transactionId, reward.reward);
  } catch (err) {
    log.info('ssv reward not paid', { userId: reward.userId, reason: (err as Error).message });
  }
  res.json({ ok: true });
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
    rewardedAvailable:
      rewardedEnabled() && (await rewardedAdsToday(userId, 'merit')) < MERIT.rewardedAdsPerDay,
  });
});
