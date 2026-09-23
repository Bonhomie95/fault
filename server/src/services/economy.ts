import type { Entitlement, MeritReason, PurchaseSource } from '@prisma/client';
import {
  DOCKET,
  MERIT,
  PASS_INCLUDES,
  PASS_SHIELDS_PER_PERIOD,
  skuById,
  type Sku,
} from '../domain/store.js';
import { prisma } from '../lib/prisma.js';
import { dayKey } from './missions.js';

/**
 * Merit and entitlements.
 *
 * Two invariants hold this together, and both exist because the client used to
 * be trusted with things it should never have been trusted with:
 *
 *   1. The client never states a balance or an entitlement. It asks; the
 *      server answers. `trialUnlocked` used to be a boolean the phone could
 *      PATCH, which made the paid campaign free to anyone with curl.
 *
 *   2. Merit moves only through `grantMerit`/`spendMerit`, which write a
 *      ledger row and the running total in one transaction. A balance without
 *      a ledger is a number nobody can ever audit after the fact — and this
 *      one is convertible to money.
 */

/**
 * What this juror owns RIGHT NOW.
 *
 * A subscription row carries an expiry and lapses on its own; everything the
 * Juror Pass includes is implied by a live pass row and never written, so it
 * lapses with it. Nothing has to run at midnight to take a lapsed pass away.
 */
export async function entitlementsFor(userId: string): Promise<Entitlement[]> {
  const rows = await prisma.userEntitlement.findMany({
    where: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    select: { entitlement: true },
  });
  const owned = new Set(rows.map((r) => r.entitlement));
  if (owned.has('pass')) for (const e of PASS_INCLUDES) owned.add(e);
  return [...owned];
}

export async function hasEntitlement(userId: string, entitlement: Entitlement): Promise<boolean> {
  return (await entitlementsFor(userId)).includes(entitlement);
}

/** When a live pass runs out, for the store screen. Null when there is none. */
export async function passExpiry(userId: string): Promise<Date | null> {
  const row = await prisma.userEntitlement.findUnique({
    where: { userId_entitlement: { userId, entitlement: 'pass' } },
    select: { expiresAt: true },
  });
  return row?.expiresAt && row.expiresAt > new Date() ? row.expiresAt : null;
}

/**
 * Idempotent: granting twice is a no-op, which is what restore-purchases
 * needs. With an expiry (a subscription), the later of the two dates wins —
 * a replayed old renewal must never shorten a newer one.
 */
export async function grantEntitlement(
  userId: string,
  entitlement: Entitlement,
  source: PurchaseSource,
  expiresAt: Date | null = null,
): Promise<void> {
  const existing = await prisma.userEntitlement.findUnique({
    where: { userId_entitlement: { userId, entitlement } },
  });
  if (!existing) {
    await prisma.userEntitlement.create({ data: { userId, entitlement, source, expiresAt } });
    return;
  }
  // Owned for ever already: nothing a subscription says can improve on that.
  if (existing.expiresAt === null) return;
  if (expiresAt === null || expiresAt > existing.expiresAt) {
    await prisma.userEntitlement.update({ where: { id: existing.id }, data: { expiresAt } });
  }
}

/**
 * Extra cases for the player's today. A new day starts from zero, so bonus
 * cases never pile up into tomorrow.
 */
export async function addBonusCases(userId: string, n: number): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true, bonusCases: true, bonusCasesDay: true },
    });
    const today = dayKey(user.timezone);
    const bonus = (user.bonusCasesDay === today ? user.bonusCases : 0) + n;
    await tx.user.update({ where: { id: userId }, data: { bonusCases: bonus, bonusCasesDay: today } });
    return bonus;
  });
}

export async function addShields(userId: string, n: number): Promise<number> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { streakShields: { increment: n } },
    select: { streakShields: true },
  });
  return user.streakShields;
}

export interface DocketView {
  /** No daily limit (the unlimited docket or a live pass). */
  unlimited: boolean;
  freePerDay: number;
  /** Extra cases opened today. */
  bonus: number;
  /** Ordinary cases served today. The Daily Trial and special dockets are free. */
  usedToday: number;
  /** Null when unlimited. */
  left: number | null;
  /** Rewarded views that can still open a case today. */
  adCasesLeft: number;
}

/** How much of today's docket is left. */
export async function docketFor(user: {
  id: string;
  timezone: string;
  bonusCases: number;
  bonusCasesDay: string | null;
}): Promise<DocketView> {
  const today = dayKey(user.timezone);
  const unlimited = await hasEntitlement(user.id, 'campaign');
  // Two days back covers every timezone's "today"; the day test is exact.
  const recent = await prisma.case.findMany({
    where: {
      userId: user.id,
      createdAt: { gte: new Date(Date.now() - 50 * 3_600_000) },
      dailyKey: null,
      pack: null,
    },
    select: { createdAt: true },
  });
  const usedToday = recent.filter((c) => dayKey(user.timezone, c.createdAt) === today).length;
  const bonus = user.bonusCasesDay === today ? user.bonusCases : 0;
  const adCasesToday = await rewardedAdsToday(user.id, 'case');
  return {
    unlimited,
    freePerDay: DOCKET.freePerDay,
    bonus,
    usedToday,
    left: unlimited ? null : Math.max(0, DOCKET.freePerDay + bonus - usedToday),
    adCasesLeft: Math.max(0, DOCKET.adCasesPerDay - adCasesToday),
  };
}

/**
 * Move Merit and record why, atomically.
 *
 * Returns the new balance. Refuses to let a balance go negative — a spend that
 * would overdraw throws rather than clamping, because a silently clamped spend
 * is an item handed over for free.
 */
export async function moveMerit(
  userId: string,
  delta: number,
  reason: MeritReason,
  reference?: string,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { merit: true },
    });

    const balance = user.merit + delta;
    if (balance < 0) throw new Error('insufficient merit');

    await tx.user.update({ where: { id: userId }, data: { merit: balance } });
    await tx.meritEntry.create({
      data: { userId, delta, reason, reference: reference ?? null, balance },
    });

    return balance;
  });
}

export const grantMerit = (userId: string, amount: number, reason: MeritReason, ref?: string) =>
  moveMerit(userId, Math.abs(amount), reason, ref);

export const spendMerit = (userId: string, amount: number, ref?: string) =>
  moveMerit(userId, -Math.abs(amount), 'spend', ref);

export interface PurchaseResult {
  sku: string;
  /** The first thing it grants, or null for a consumable. */
  granted: Entitlement | null;
  meritBalance: number;
}

/**
 * A verified receipt that belongs to somebody else's account.
 *
 * Its own error type because the route has to tell these apart: an
 * unverifiable receipt is "we could not confirm that purchase", and this is
 * "that purchase is real and it is not yours". The second one is worth
 * logging, because at any volume it means either receipt sharing or a player
 * who has managed to end up with two accounts and one purchase — and those
 * need different answers.
 */
export class ReceiptOwnedByAnotherAccount extends Error {
  constructor() {
    super('receipt_belongs_to_another_account');
    this.name = 'ReceiptOwnedByAnotherAccount';
  }
}

/** Everything a sku hands over besides its entitlements. */
async function deliverExtras(userId: string, sku: Sku, reference: string): Promise<number | null> {
  let merit: number | null = null;
  if (sku.meritGranted) merit = await grantMerit(userId, sku.meritGranted, 'purchase', reference);
  if (sku.shieldsGranted) await addShields(userId, sku.shieldsGranted);
  if (sku.casesGranted) await addBonusCases(userId, sku.casesGranted);
  // Each paid period of the pass brings its shields: a renewal is a new
  // transaction, and only a new transaction reaches here.
  if (sku.kind === 'pass') await addShields(userId, PASS_SHIELDS_PER_PERIOD);
  return merit;
}

/**
 * Buy something with Merit.
 *
 * The server prices it. The client sends a sku id and nothing else — it never
 * sends a price, because a client that sends a price is a client that sets one.
 */
export async function buyWithMerit(userId: string, skuId: string): Promise<PurchaseResult> {
  const sku = skuById(skuId);
  if (!sku) throw new Error('no such item');
  if (sku.meritPrice === null) throw new Error('this cannot be earned');

  if (sku.grants.length) {
    const owned = await entitlementsFor(userId);
    if (sku.grants.every((g) => owned.includes(g))) throw new Error('already owned');
  }

  let meritBalance = await spendMerit(userId, sku.meritPrice, sku.id);

  for (const g of sku.grants) await grantEntitlement(userId, g, 'merit');
  meritBalance = (await deliverExtras(userId, sku, sku.id)) ?? meritBalance;

  await prisma.purchase.create({
    data: { userId, sku: sku.id, source: 'merit', meritSpent: sku.meritPrice },
  });

  return { sku: sku.id, granted: sku.grants[0] ?? null, meritBalance };
}

/**
 * Redeem a validated store purchase.
 *
 * `transactionId` is unique in the schema, so a replayed receipt collides and
 * is rejected by the database rather than by a check someone can forget to
 * write. Receipt *validation* itself happens before this, in the payments
 * layer — this function trusts its caller and nothing else does.
 *
 * `expiresAt` is the store's own expiry for a subscription, read from Apple or
 * Google by the verifier — never from the client.
 */
export async function redeemPurchase(opts: {
  userId: string;
  sku: Sku;
  transactionId: string;
  platform: 'ios' | 'android';
  expiresAt?: Date | null;
}): Promise<PurchaseResult> {
  const { userId, sku, transactionId, platform } = opts;
  const expiresAt = sku.store === 'subscription' ? (opts.expiresAt ?? null) : null;
  if (sku.store === 'subscription' && !expiresAt) throw new Error('subscription without an expiry');

  const already = await prisma.purchase.findUnique({ where: { transactionId } });
  if (already) {
    // WHOSE purchase, though.
    //
    // A receipt already redeemed by ANOTHER account used to get a cheerful
    // `{ granted }` and no entitlement row — indistinguishable, from the
    // buyer's side, from paying and receiving nothing.
    if (already.userId !== userId) {
      throw new ReceiptOwnedByAnotherAccount();
    }

    // Same juror: the restore path, and it is supposed to be boring. It still
    // re-grants, because "already recorded" and "already granted" are
    // different facts — and for a subscription it refreshes the expiry, which
    // is how a Google renewal (same token, same order id) extends the pass.
    // Consumables are NOT re-delivered: that would be a Merit printer.
    for (const g of sku.grants) await grantEntitlement(userId, g, 'store', expiresAt);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return { sku: sku.id, granted: sku.grants[0] ?? null, meritBalance: user.merit };
  }

  await prisma.purchase.create({
    data: {
      userId,
      sku: sku.id,
      source: 'store',
      amountMinor: sku.priceMinor ?? 0,
      currency: 'USD',
      transactionId,
      platform,
    },
  });

  for (const g of sku.grants) await grantEntitlement(userId, g, 'store', expiresAt);

  const merit = await deliverExtras(userId, sku, sku.id);
  const meritBalance = merit ?? (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).merit;

  return { sku: sku.id, granted: sku.grants[0] ?? null, meritBalance };
}

/** Rewarded views in the last day, of one kind or all. */
export async function rewardedAdsToday(userId: string, reward?: 'merit' | 'case'): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.adEvent.count({
    where: {
      userId,
      kind: 'rewarded',
      createdAt: { gte: since },
      // Rows from before `reward` existed paid Merit.
      ...(reward === 'case' ? { reward: 'case' } : reward === 'merit' ? { NOT: { reward: 'case' } } : {}),
    },
  });
}

/**
 * Pay for one completed rewarded view: Merit, or one more case today.
 *
 * Capped per day for each, and deduplicated by the network's own view id —
 * one view, one payment, enforced by the database.
 */
export async function claimRewardedAd(
  userId: string,
  viewId: string,
  reward: 'merit' | 'case' = 'merit',
): Promise<number> {
  const cap = reward === 'case' ? DOCKET.adCasesPerDay : MERIT.rewardedAdsPerDay;
  if ((await rewardedAdsToday(userId, reward)) >= cap) {
    throw new Error('daily limit reached');
  }

  try {
    await prisma.adEvent.create({
      data: {
        userId,
        kind: 'rewarded',
        viewId,
        reward,
        meritPaid: reward === 'merit' ? MERIT.rewardedAd : 0,
      },
    });
  } catch {
    throw new Error('that view has already been claimed');
  }

  if (reward === 'case') {
    await addBonusCases(userId, 1);
    return (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).merit;
  }
  return grantMerit(userId, MERIT.rewardedAd, 'rewarded_ad', viewId);
}
