import type { Entitlement, MeritReason, PurchaseSource } from '@prisma/client';
import { MERIT, skuById, type Sku } from '../domain/store.js';
import { prisma } from '../lib/prisma.js';

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

export async function entitlementsFor(userId: string): Promise<Entitlement[]> {
  const rows = await prisma.userEntitlement.findMany({
    where: { userId },
    select: { entitlement: true },
  });
  return rows.map((r) => r.entitlement);
}

export async function hasEntitlement(userId: string, entitlement: Entitlement): Promise<boolean> {
  const row = await prisma.userEntitlement.findUnique({
    where: { userId_entitlement: { userId, entitlement } },
  });
  return row !== null;
}

/** Idempotent: granting twice is a no-op, which is what restore-purchases needs. */
export async function grantEntitlement(
  userId: string,
  entitlement: Entitlement,
  source: PurchaseSource,
): Promise<void> {
  await prisma.userEntitlement.upsert({
    where: { userId_entitlement: { userId, entitlement } },
    create: { userId, entitlement, source },
    update: {}, // already owned; never downgrade the source
  });
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
  granted: Entitlement | null;
  meritBalance: number;
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

  if (sku.grants && (await hasEntitlement(userId, sku.grants))) {
    throw new Error('already owned');
  }

  const meritBalance = await spendMerit(userId, sku.meritPrice, sku.id);

  if (sku.grants) await grantEntitlement(userId, sku.grants, 'merit');

  await prisma.purchase.create({
    data: { userId, sku: sku.id, source: 'merit', meritSpent: sku.meritPrice },
  });

  return { sku: sku.id, granted: sku.grants, meritBalance };
}

/**
 * Redeem a validated store purchase.
 *
 * `transactionId` is unique in the schema, so a replayed receipt collides and
 * is rejected by the database rather than by a check someone can forget to
 * write. Receipt *validation* itself happens before this, in the payments
 * layer — this function trusts its caller and nothing else does.
 */
export async function redeemPurchase(opts: {
  userId: string;
  sku: Sku;
  transactionId: string;
  platform: 'ios' | 'android';
}): Promise<PurchaseResult> {
  const { userId, sku, transactionId, platform } = opts;

  const already = await prisma.purchase.findUnique({ where: { transactionId } });
  if (already) {
    // Not an error: Apple and Google both replay transactions legitimately on
    // restore. Idempotent means the second one is simply a no-op.
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return { sku: sku.id, granted: sku.grants, meritBalance: user.merit };
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

  if (sku.grants) await grantEntitlement(userId, sku.grants, 'store');

  let meritBalance = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).merit;
  if (sku.meritGranted) {
    meritBalance = await grantMerit(userId, sku.meritGranted, 'purchase', sku.id);
  }

  return { sku: sku.id, granted: sku.grants, meritBalance };
}

/** Rewarded ads pay Merit, so the tap has a limit. */
export async function rewardedAdsToday(userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.adEvent.count({
    where: { userId, kind: 'rewarded', createdAt: { gte: since } },
  });
}

export async function claimRewardedAd(userId: string, viewId: string): Promise<number> {
  if ((await rewardedAdsToday(userId)) >= MERIT.rewardedAdsPerDay) {
    throw new Error('daily limit reached');
  }

  // viewId is unique: one view, one payment, enforced by the database.
  try {
    await prisma.adEvent.create({
      data: { userId, kind: 'rewarded', viewId, meritPaid: MERIT.rewardedAd },
    });
  } catch {
    throw new Error('that view has already been claimed');
  }

  return grantMerit(userId, MERIT.rewardedAd, 'rewarded_ad', viewId);
}
