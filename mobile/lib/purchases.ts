import { Platform } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { reportError } from '@/lib/report';

/**
 * Buying something with money.
 *
 * The server side of this has been finished and correct for a while: receipts
 * are verified against Apple's App Store Server API and Google's Play
 * Developer API, production is asked before sandbox, the product id in the
 * receipt is checked against the sku, refunds are honoured, transaction ids
 * are unique so a replay collides in the database, and grants are idempotent
 * so restore works.
 *
 * None of it was reachable. There was no IAP SDK in the app, no client method
 * for POST /api/store/redeem, and the buy button showed a notice saying
 * payments were not connected. The entire revenue path was one missing layer.
 *
 * This is that layer, and it is deliberately written against an INTERFACE
 * rather than against a specific SDK. Choosing between `expo-iap`,
 * `react-native-iap` and StoreKit 2 directly is a real decision with real
 * consequences (build size, new-architecture support, who maintains it), and
 * it is not one to make silently inside an audit fix. What this does is make
 * that choice a single implementation of `PurchaseBackend` — everything
 * around it, including the part that actually matters, is done and tested.
 *
 * THE PART THAT MATTERS, and the reason this file is thin on purpose:
 *
 *   The client never decides what was bought. It forwards a receipt. The
 *   server asks Apple or Google what that receipt actually is and grants on
 *   THEIR answer, never on ours. So a compromised client can lie all it likes
 *   here and get nothing for it — which is why this layer is allowed to be
 *   simple, and why it must never be "improved" into deciding entitlements.
 */

export interface StorePurchase {
  /** Our sku id, which must equal the store product id. */
  sku: string;
  /** The store's own transaction id. */
  transactionId: string;
  /**
   * Apple: the transaction's signed JWS (StoreKit 2 signedTransactionInfo).
   * Google: the purchaseToken.
   */
  receipt: string;
}

/**
 * What an IAP SDK has to provide for this to work.
 *
 * Implement this once, against whichever library is chosen, and call
 * `setPurchaseBackend` at startup.
 */
export interface PurchaseBackend {
  /** True once the SDK has connected to the store. */
  isAvailable(): Promise<boolean>;
  /** Open the platform purchase sheet and resolve when it completes. */
  purchase(sku: string): Promise<StorePurchase>;
  /**
   * Every purchase this account has made, for restore.
   *
   * Apple requires a restore path to exist and be reachable, and this is the
   * device half of it — the server half (POST /api/store/restore) already
   * exists and is wired to the settings screen.
   */
  restore(): Promise<StorePurchase[]>;
  /**
   * Tell the store the goods were delivered.
   *
   * Called only AFTER the server has granted, never before. Finishing a
   * transaction the server has not yet honoured is how a player pays and
   * receives nothing with no way to recover it — the receipt is gone from the
   * device and the store considers the matter closed.
   */
  finish(purchase: StorePurchase): Promise<void>;
}

let backend: PurchaseBackend | null = null;

export function setPurchaseBackend(impl: PurchaseBackend | null): void {
  backend = impl;
}

export function purchasesAvailable(): boolean {
  return backend !== null;
}

export type BuyResult =
  | { status: 'granted'; granted: string | null; meritBalance: number }
  | { status: 'cancelled' }
  | { status: 'unavailable' }
  | { status: 'failed'; message: string };

/**
 * Buy a sku with real money, end to end.
 *
 * Order matters and is the whole correctness of this function:
 *
 *   1. the store takes the money and hands back a receipt
 *   2. OUR server verifies that receipt with Apple or Google, and grants
 *   3. only then do we finish the transaction with the store
 *
 * Doing (3) before (2) is the classic way to lose a player's money: the
 * receipt is consumed, the server never saw it, and there is nothing left to
 * prove the purchase happened. An unfinished transaction, by contrast, is
 * replayed by the store on next launch — which is exactly the recovery we
 * want, and why the failure path below deliberately does NOT finish.
 */
export async function buy(sku: string): Promise<BuyResult> {
  if (!backend) return { status: 'unavailable' };

  let purchase: StorePurchase;
  try {
    purchase = await backend.purchase(sku);
  } catch (err) {
    const message = (err as Error)?.message ?? '';
    if (/cancel/i.test(message)) return { status: 'cancelled' };
    reportError('iap.purchase', err, { sku });
    return { status: 'failed', message: 'That purchase did not go through.' };
  }

  try {
    const result = await api.redeemPurchase({
      sku: purchase.sku,
      transactionId: purchase.transactionId,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      receipt: purchase.receipt,
    });

    // Granted. Now, and only now, the store may close the transaction.
    await backend.finish(purchase);

    return { status: 'granted', granted: result.granted, meritBalance: result.meritBalance };
  } catch (err) {
    // Deliberately NOT finishing the transaction. The store will hand it back
    // on next launch and `restore` below will complete it — the player's money
    // is not lost to a bad network moment.
    reportError('iap.redeem', err, { sku, transactionId: purchase.transactionId });

    if (err instanceof ApiError && err.code === 'receipt_belongs_to_another_account') {
      return { status: 'failed', message: err.message };
    }
    return {
      status: 'failed',
      message: 'The court could not confirm that purchase. It will be retried next time you open the app.',
    };
  }
}

/**
 * Re-deliver anything already paid for.
 *
 * Two jobs at once, and the second is the one nobody remembers: it satisfies
 * Apple's restore requirement, AND it completes any purchase that was paid for
 * but never confirmed by our server — the exact case `buy` above leaves
 * deliberately unfinished.
 *
 * Safe to call on every launch. Redeeming an already-redeemed transaction is
 * idempotent server-side.
 */
export async function restore(): Promise<{ restored: number; failed: number }> {
  if (!backend) return { restored: 0, failed: 0 };

  let outstanding: StorePurchase[];
  try {
    outstanding = await backend.restore();
  } catch (err) {
    reportError('iap.restore', err);
    return { restored: 0, failed: 0 };
  }

  let restored = 0;
  let failed = 0;

  for (const purchase of outstanding) {
    try {
      await api.redeemPurchase({
        sku: purchase.sku,
        transactionId: purchase.transactionId,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        receipt: purchase.receipt,
      });
      await backend.finish(purchase);
      restored++;
    } catch (err) {
      // Leave it unfinished so the next launch tries again.
      reportError('iap.restore.redeem', err, { sku: purchase.sku });
      failed++;
    }
  }

  return { restored, failed };
}
