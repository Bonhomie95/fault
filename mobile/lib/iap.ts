import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { reportError } from '@/lib/report';
import { restore, setPurchaseBackend, type PurchaseBackend, type StorePurchase } from '@/lib/purchases';

/**
 * The App Store and Google Play, behind lib/purchases' PurchaseBackend.
 *
 * expo-iap (StoreKit 2 / Play Billing 7+). Loaded lazily and optionally, like
 * lib/say and lib/reminders: a build compiled before the native module
 * existed simply has no store, rather than a red screen.
 *
 * The client never decides what was bought: it hands the server the store's
 * own token (StoreKit's signed JWS, or Play's purchaseToken) and the server
 * asks Apple or Google. This file only moves tokens.
 */

type Iap = typeof import('expo-iap');
type Purchase = import('expo-iap').Purchase;

let iap: Iap | null | undefined;

function load(): Iap | null {
  if (iap !== undefined) return iap;
  iap = null;
  if (Platform.OS === 'web') return iap;
  try {
    if (requireOptionalNativeModule('ExpoIap')) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module, see above
      iap = require('expo-iap') as Iap;
    }
  } catch {
    iap = null;
  }
  return iap;
}

/** What the store says about a product, in the player's own currency. */
export interface StoreProduct {
  id: string;
  /** "£4.99", "₦2,900", "4,99 €" — exactly as the store formats it. */
  displayPrice: string;
  subscription: boolean;
}

const products = new Map<string, StoreProduct & { offerToken?: string }>();
/** Which skus the store must CONSUME (buyable again), from the catalogue. */
const consumables = new Set<string>();
/** Purchases waiting on the server, by transaction id, for finish(). */
const inFlight = new Map<string, Purchase>();

let connecting: Promise<boolean> | null = null;

function connect(): Promise<boolean> {
  const n = load();
  if (!n) return Promise.resolve(false);
  connecting ??= n.initConnection().then(
    (ok) => ok !== false,
    (err) => {
      connecting = null; // try again next time
      // Deliberately NOT reportError.
      //
      // Failing to reach the billing service is the ordinary state of a great
      // many devices, not a fault: an emulator with no Play Store, a phone
      // without Google services, a country the store does not serve, or an app
      // not yet published. All of them land here, and the shelf already
      // handles it — products stay absent and the store says the pass is not
      // available from this device. Reporting it would fill the error channel
      // with a condition nobody can act on, and drown the purchase failures
      // that actually cost someone money, which are still reported below.
      // console.log, not console.warn: LogBox raises a yellow toast for a
      // warning, and a device that cannot reach billing is a fact about the
      // device, not something wrong with the app. Left as a breadcrumb so the
      // silent path is still traceable in development.
      if (__DEV__) console.log('[iap] billing unavailable on this device:', String(err));
      return false;
    },
  );
  return connecting;
}

/**
 * Ask the store for localised prices.
 *
 * A product the store does not return (not yet approved in App Store Connect,
 * not active in Play Console) is simply absent — the shelf shows it as
 * unavailable rather than at a made-up price.
 */
export async function loadProducts(skus: {
  inApp: string[];
  subs: string[];
  consumable: string[];
}): Promise<Map<string, StoreProduct>> {
  for (const c of skus.consumable) consumables.add(c);
  const n = load();
  if (!n || !(await connect())) return new Map();
  try {
    const [inApp, subs] = await Promise.all([
      skus.inApp.length ? n.fetchProducts({ skus: skus.inApp, type: 'in-app' }) : [],
      skus.subs.length ? n.fetchProducts({ skus: skus.subs, type: 'subs' }) : [],
    ]);
    for (const p of (inApp ?? []) as { id: string; displayPrice: string }[]) {
      products.set(p.id, { id: p.id, displayPrice: p.displayPrice, subscription: false });
    }
    for (const p of (subs ?? []) as {
      id: string;
      displayPrice: string;
      subscriptionOfferDetailsAndroid?: { offerToken: string }[];
    }[]) {
      products.set(p.id, {
        id: p.id,
        displayPrice: p.displayPrice,
        subscription: true,
        // Play needs an offer token to sell a subscription; the base plan is
        // the first one listed.
        offerToken: p.subscriptionOfferDetailsAndroid?.[0]?.offerToken,
      });
    }
  } catch (err) {
    reportError('iap.products', err);
  }
  return new Map([...products].map(([k, v]) => [k, { id: v.id, displayPrice: v.displayPrice, subscription: v.subscription }]));
}

/** The store's token for a completed purchase, or null if it is not one yet. */
function toStorePurchase(p: Purchase): StorePurchase | null {
  // Pending (Ask to Buy, a slow card) is not a sale. It arrives again, as
  // `purchased`, through the listener when it clears.
  if (p.purchaseState !== 'purchased' && p.purchaseState !== 'unknown') return null;
  const receipt = p.purchaseToken;
  const transactionId =
    (p as { transactionId?: string | null }).transactionId ?? p.id ?? p.purchaseToken ?? null;
  if (!receipt || !transactionId) return null;
  inFlight.set(transactionId, p);
  return { sku: p.productId, transactionId, receipt };
}

const backend: PurchaseBackend = {
  isAvailable: connect,

  purchase: (sku) =>
    new Promise<StorePurchase>((resolve, reject) => {
      const n = load();
      if (!n) {
        reject(new Error('store unavailable'));
        return;
      }
      let settled = false;
      const done = (fn: () => void) => {
        if (settled) return;
        settled = true;
        ok.remove();
        bad.remove();
        fn();
      };
      const ok = n.purchaseUpdatedListener((p) => {
        if (p.productId !== sku) return;
        const sp = toStorePurchase(p);
        if (sp) done(() => resolve(sp));
      });
      const bad = n.purchaseErrorListener((e) => {
        if (e.productId && e.productId !== sku) return;
        done(() => reject(new Error(e.code === 'user-cancelled' ? 'cancelled' : e.message)));
      });

      const product = products.get(sku);
      const request = product?.subscription
        ? n.requestPurchase({
            type: 'subs',
            request: {
              apple: { sku },
              google: {
                skus: [sku],
                subscriptionOffers: product.offerToken ? [{ sku, offerToken: product.offerToken }] : undefined,
              },
            },
          })
        : n.requestPurchase({ type: 'in-app', request: { apple: { sku }, google: { skus: [sku] } } });

      void Promise.resolve(request)
        .then((r) => {
          const p = Array.isArray(r) ? r.find((x) => x.productId === sku) : r;
          const sp = p ? toStorePurchase(p) : null;
          if (sp) done(() => resolve(sp));
        })
        .catch((err: { code?: string; message?: string }) =>
          done(() => reject(new Error(err?.code === 'user-cancelled' ? 'cancelled' : (err?.message ?? 'failed')))),
        );
    }),

  restore: async () => {
    const n = load();
    if (!n || !(await connect())) return [];
    const all = await n.getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
    return all.map(toStorePurchase).filter((p): p is StorePurchase => p !== null);
  },

  finish: async (purchase) => {
    const n = load();
    const p = inFlight.get(purchase.transactionId);
    if (!n || !p) return;
    await n.finishTransaction({ purchase: p, isConsumable: consumables.has(purchase.sku) });
    inFlight.delete(purchase.transactionId);
  },
};

/**
 * Register the store at startup, and settle anything left over.
 *
 * `restore` on launch is how a purchase interrupted by a crash or a dead
 * network gets delivered: the transaction was deliberately left unfinished,
 * so the store hands it back here and the server grants it.
 */
export function startPurchases(consumableSkus: string[] = ['shield_pack', 'merit_small', 'merit_medium', 'merit_large']): void {
  if (!load()) return;
  for (const c of consumableSkus) consumables.add(c);
  setPurchaseBackend(backend);
  void restore().catch((err) => reportError('iap.launchRestore', err));
}

/** Where a subscriber manages or cancels the pass — Apple and Google require a way. */
export async function manageSubscriptions(sku?: string): Promise<void> {
  const n = load();
  if (!n) return;
  try {
    await n.deepLinkToSubscriptions({
      skuAndroid: sku ?? null,
      packageNameAndroid: Constants.expoConfig?.android?.package ?? null,
    });
  } catch (err) {
    reportError('iap.manage', err);
  }
}
