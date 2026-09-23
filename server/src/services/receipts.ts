import { importPKCS8, SignJWT, decodeJwt } from 'jose';
import { env } from '../lib/env.js';

/**
 * Receipt validation.
 *
 * The one thing between this catalogue and revenue. Everything around it was
 * already done — transactionId is unique so a replay collides in the database,
 * grants are idempotent so restore works, the server prices everything — and
 * none of it mattered while this function returned `true` for any string.
 *
 * Both stores answer the same three questions, and all three matter:
 *
 *   1. Did you actually sign this? (a receipt is worthless unsigned)
 *   2. Is it for OUR app and THIS product? (a receipt from another app is a
 *      real receipt, just not ours)
 *   3. Is it still valid? (refunded, revoked, cancelled — a purchase can be
 *      un-bought, and a player who refunds must not keep the campaign)
 *
 * Neither path can be exercised here: Apple needs a signing key and an issuer
 * id from App Store Connect, Google needs a service account with Play
 * Developer API access. Both refuse rather than guess when unconfigured, which
 * is the only safe default — the previous version's mistake was to be
 * permissive when it did not know.
 */

export interface ReceiptClaim {
  sku: string;
  transactionId: string;
  platform: 'ios' | 'android';
  /** Apple: signedTransactionInfo (JWS). Google: purchaseToken. */
  receipt: string;
  /** Set by the route from OUR catalogue, never by the client. */
  subscription?: boolean;
}

export interface ReceiptVerdict {
  valid: boolean;
  /** A subscription's expiry, as the store reports it. */
  expiresAt?: Date;
  /** Why not, for logs. Never returned to the client — it leaks configuration. */
  reason?: string;
}

// ── Apple ────────────────────────────────────────────────────────────────

/**
 * StoreKit 2 hands the app a signed JWS per transaction, signed with an x5c
 * chain rooted in Apple's G3 root CA — NOT with the appleid.apple.com JWKS,
 * which is Sign in with Apple and a different system entirely.
 *
 * Verifying that chain offline needs Apple's root bundled and pinned. Until it
 * is, the decode below is treated as an untrusted claim and proves nothing on
 * its own: the checks against it only ever REJECT, and the sole thing that
 * accepts is Apple's own answer in appleServerCheck(). A forged JWS can say
 * whatever it likes here and still dies at the network call.
 */
async function verifyApple(claim: ReceiptClaim): Promise<ReceiptVerdict> {
  if (!env.APPLE_BUNDLE_ID) return { valid: false, reason: 'APPLE_BUNDLE_ID unset' };

  try {
    const payload = decodeJwt(claim.receipt) as {
      bundleId?: string;
      productId?: string;
      transactionId?: string;
      revocationDate?: number;
      revocationReason?: number;
    };

    if (payload.bundleId !== env.APPLE_BUNDLE_ID) {
      // A real receipt, for someone else's app.
      return { valid: false, reason: 'bundle mismatch' };
    }
    if (payload.productId !== claim.sku) {
      // A real receipt, for a cheaper product.
      return { valid: false, reason: 'product mismatch' };
    }
    if (payload.transactionId !== claim.transactionId) {
      return { valid: false, reason: 'transaction id mismatch' };
    }
    if (payload.revocationDate) {
      // Refunded. They do not keep the goods.
      return { valid: false, reason: 'revoked' };
    }

    if (!env.APPLE_ISSUER_ID || !env.APPLE_KEY_ID || !env.APPLE_PRIVATE_KEY) {
      return { valid: false, reason: 'App Store Server API credentials unset' };
    }

    // Everything above rejected on the client's own say-so. Only Apple can
    // accept.
    return await appleServerCheck(claim);
  } catch (err) {
    return { valid: false, reason: (err as Error).message };
  }
}

/** A signed JWT is how the App Store Server API authenticates us. */
async function appleServerToken(): Promise<string> {
  const key = await importPKCS8(env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'), 'ES256');
  return new SignJWT({ bid: env.APPLE_BUNDLE_ID })
    .setProtectedHeader({ alg: 'ES256', kid: env.APPLE_KEY_ID, typ: 'JWT' })
    .setIssuer(env.APPLE_ISSUER_ID)
    .setAudience('appstoreconnect-v1')
    .setIssuedAt()
    .setExpirationTime('20m')
    .sign(key);
}

const APPLE_PROD = 'https://api.storekit.itunes.apple.com';
const APPLE_SANDBOX = 'https://api.storekit-sandbox.itunes.apple.com';

async function appleFetch(host: string, transactionId: string): Promise<Response> {
  return fetch(`${host}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, {
    headers: { Authorization: `Bearer ${await appleServerToken()}` },
  });
}

/**
 * Ask Apple what this transaction actually is.
 *
 * `res.ok` is not the answer. A 200 means the transaction id exists under our
 * bundle — it says nothing about WHICH product was bought. Accepting on status
 * alone would let someone buy the cheapest SKU, then replay that real
 * transaction id alongside a forged JWS naming the campaign, and Apple would
 * cheerfully confirm the id is real. The product must be read from Apple's
 * response, which arrives signed and over TLS, and never from the client's.
 */
async function appleServerCheck(claim: ReceiptClaim): Promise<ReceiptVerdict> {
  // Ask production first, then sandbox if production has never heard of this
  // transaction.
  //
  // This used to pick one host from NODE_ENV, which would have failed App
  // Review — and failing App Review is not a bug you find in testing, it is a
  // rejection weeks later. Apple's reviewers test with SANDBOX purchases
  // against whatever server the submitted build points at, which is
  // production. A sandbox transaction id does not exist in production, so
  // every purchase the reviewer attempted would have been refused, and the
  // app rejected for a broken store.
  //
  // The order matters the other way too: asking sandbox first would mean real
  // paying customers wait on a doomed request before the real one.
  let res = await appleFetch(APPLE_PROD, claim.transactionId);

  if (res.status === 404) {
    res = await appleFetch(APPLE_SANDBOX, claim.transactionId);
  }

  if (!res.ok) return { valid: false, reason: `apple ${res.status}` };

  const { signedTransactionInfo } = (await res.json()) as { signedTransactionInfo?: string };
  if (!signedTransactionInfo) return { valid: false, reason: 'apple returned no transaction' };

  const info = decodeJwt(signedTransactionInfo) as {
    bundleId?: string;
    productId?: string;
    revocationDate?: number;
    expiresDate?: number;
  };

  if (info.bundleId !== env.APPLE_BUNDLE_ID) return { valid: false, reason: 'apple: bundle mismatch' };
  if (info.productId !== claim.sku) return { valid: false, reason: 'apple: product mismatch' };
  if (info.revocationDate) return { valid: false, reason: 'apple: revoked' };

  if (claim.subscription) {
    // A lapsed renewal is a real transaction for a period that is over.
    if (!info.expiresDate || info.expiresDate <= Date.now()) return { valid: false, reason: 'apple: expired' };
    return { valid: true, expiresAt: new Date(info.expiresDate) };
  }
  return { valid: true };
}

// ── Google ───────────────────────────────────────────────────────────────

/**
 * Google Play has no offline path: the purchase token means nothing until the
 * Play Developer API says what it is.
 */
async function verifyGoogle(claim: ReceiptClaim): Promise<ReceiptVerdict> {
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON || !env.ANDROID_PACKAGE_NAME) {
    return { valid: false, reason: 'Play Developer API credentials unset' };
  }

  try {
    const token = await googleAccessToken();
    if (claim.subscription) return await verifyGoogleSubscription(claim, token);
    const url =
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
      `${encodeURIComponent(env.ANDROID_PACKAGE_NAME)}/purchases/products/` +
      `${encodeURIComponent(claim.sku)}/tokens/${encodeURIComponent(claim.receipt)}`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return { valid: false, reason: `play api ${res.status}` };

    const body = (await res.json()) as { purchaseState?: number; acknowledgementState?: number };

    // 0 = purchased. 1 = cancelled, 2 = pending. Only the first is a sale.
    if (body.purchaseState !== 0) return { valid: false, reason: `purchaseState ${body.purchaseState}` };

    return { valid: true };
  } catch (err) {
    return { valid: false, reason: (err as Error).message };
  }
}

/**
 * Subscriptions live behind a different Play endpoint, and the answer is a
 * state and an expiry per line item rather than a purchase state.
 */
async function verifyGoogleSubscription(claim: ReceiptClaim, token: string): Promise<ReceiptVerdict> {
  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${encodeURIComponent(env.ANDROID_PACKAGE_NAME)}/purchases/subscriptionsv2/tokens/` +
    `${encodeURIComponent(claim.receipt)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return { valid: false, reason: `play subs api ${res.status}` };

  const body = (await res.json()) as {
    subscriptionState?: string;
    lineItems?: { productId?: string; expiryTime?: string }[];
  };
  // Active, or in the grace period Google gives a failed card: both are paid.
  if (body.subscriptionState !== 'SUBSCRIPTION_STATE_ACTIVE' && body.subscriptionState !== 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD') {
    return { valid: false, reason: `subscriptionState ${body.subscriptionState}` };
  }
  const line = body.lineItems?.find((l) => l.productId === claim.sku);
  if (!line?.expiryTime) return { valid: false, reason: 'play: product mismatch' };
  const expiresAt = new Date(line.expiryTime);
  if (!(expiresAt.getTime() > Date.now())) return { valid: false, reason: 'play: expired' };
  return { valid: true, expiresAt };
}

/** Service-account JWT → OAuth token, the Google way. */
async function googleAccessToken(): Promise<string> {
  const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON) as {
    client_email: string;
    private_key: string;
  };

  const assertion = await new SignJWT({
    scope: 'https://www.googleapis.com/auth/androidpublisher',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(await importPKCS8(sa.private_key, 'RS256'));

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!res.ok) throw new Error(`google token ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

// ── The door ─────────────────────────────────────────────────────────────

/**
 * Verify a purchase, or refuse it.
 *
 * Refusing is the default and the fallback. An unverifiable receipt is not a
 * borderline case to be waved through — granting a paid entitlement on an
 * unverified claim is identical, from the player's side, to giving it away.
 */
export async function verifyReceipt(claim: ReceiptClaim): Promise<ReceiptVerdict> {
  // The escape hatch, on its own flag and refused in production at boot.
  if (env.ALLOW_FAKE_PURCHASES && env.NODE_ENV !== 'production') {
    console.warn(`[receipts] FAKE PURCHASE ACCEPTED: ${claim.sku} — ALLOW_FAKE_PURCHASES is on`);
    return claim.subscription
      ? { valid: true, expiresAt: new Date(Date.now() + 30 * 86_400_000) }
      : { valid: true };
  }

  const verdict =
    claim.platform === 'ios' ? await verifyApple(claim) : await verifyGoogle(claim);

  if (!verdict.valid) {
    // Logged, never returned: "APPLE_ISSUER_ID unset" tells an attacker how we
    // are configured, and tells the player nothing they can act on.
    console.warn(`[receipts] rejected ${claim.platform} ${claim.sku}: ${verdict.reason}`);
  }

  return verdict;
}
