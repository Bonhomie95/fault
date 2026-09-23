import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import { z } from 'zod';

/**
 * Load .env.test under test, .env otherwise.
 *
 * Not cosmetic. Plain `dotenv/config` loads .env unconditionally, and dotenv
 * fills in any variable the process does not already have — so a test that
 * cleared GROQ_API_KEY still got GROQ_API_KEY_1..5 from the developer's real
 * .env and quietly spent live tokens against a 100k/day budget. The test run
 * that caught this logged "key …nFvA spent for the day".
 *
 * A test suite must not be able to cost money.
 */
const envPath = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
config({ path: envPath });

/**
 * Refuse a .env that defines the same key twice.
 *
 * dotenv takes the LAST occurrence silently. This file had accumulated two
 * complete blocks, and the duplicate DATABASE_URL had already caused one
 * outage — every query failing as role "USER", because a placeholder further
 * down the file beat the real value further up.
 *
 * The reason to make this fatal rather than a warning is NODE_ENV: it was
 * shadowed the same way, and NODE_ENV is the variable every production safety
 * gate below keys on. A shadowed NODE_ENV means ALLOW_DEV_AUTH and
 * ALLOW_FAKE_PURCHASES can be checked against the wrong environment — the boot
 * checks pass, and the backdoors stay open.
 */
function duplicateKeysIn(path: string): string[] {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return []; // no file is a supported deployment (real env vars); a bad one is not
  }

  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(trimmed);
    if (!match?.[1]) continue;
    if (seen.has(match[1])) duplicates.add(match[1]);
    seen.add(match[1]);
  }

  return [...duplicates];
}

const duplicates = duplicateKeysIn(envPath);
if (duplicates.length > 0) {
  console.error(
    `Refusing to start: ${envPath} defines these keys more than once, and the ` +
      `later value silently wins:\n  - ${duplicates.join('\n  - ')}`,
  );
  process.exit(1);
}

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  // Absent key is a supported mode, not an error: the server falls back to the
  // hand-authored docket (GDD 12, "emergency buffer").
  GROQ_API_KEY: z.string().default(''),
  /**
   * A comma-separated pool of Groq keys, rotated (see lib/groq.ts). Each free
   * key is ~100k tokens/day ≈ 33 cases, so the pool size is the daily docket
   * size. GROQ_API_KEY is folded in automatically if set.
   */
  GROQ_API_KEYS: z.string().default(''),
  /**
   * The generation model.
   *
   * Was `llama-3.3-70b-versatile`, which Groq has retired — every generation
   * was returning 404 and every juror was silently getting the fallback
   * docket. index.ts checks this at boot now and says so loudly.
   */
  GROQ_MODEL: z.string().default('openai/gpt-oss-120b'),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.string().default('development'),

  // ---- Identity ----
  // Apple: the audience every identityToken must be minted for — your iOS
  // bundle identifier.
  APPLE_BUNDLE_ID: z.string().default(''),
  // Google: comma-separated client ids (iOS, Android, and Web all differ).
  // Every one of them is a valid audience for a token that belongs to us.
  GOOGLE_CLIENT_IDS: z.string().default(''),
  /**
   * Lets the client authenticate with a device id instead of a provider.
   * Development only — this trusts whoever is asking. Forced off in
   * production regardless of what the env says (see services/auth.ts).
   */
  /**
   * Lets the client authenticate with a device id instead of a provider.
   * Defaults to FALSE: a default that is only safe when NODE_ENV happens to be
   * right is not a default, it is a trap. Opt in to insecurity, never out.
   */
  ALLOW_DEV_AUTH: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

  /**
   * Accept unverified purchase receipts.
   *
   * Deliberately NOT the same switch as ALLOW_DEV_AUTH. "Let me sign in
   * without an Apple account" and "let me have the paid campaign for free" are
   * different risks, and they were conflated: every non-production environment
   * with dev auth on would hand out entitlements to any made-up transaction
   * id. A staging server with real testers on it was giving the game away.
   */
  ALLOW_FAKE_PURCHASES: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

  /**
   * Guest accounts: play without Apple or Google.
   *
   * Not the dev bypass above, and not a relaxation of it. The device flow
   * trusts whoever can NAME a device id, which is why it can never run in
   * production. A guest is a 256-bit secret the app generated once and keeps
   * in the keychain; the server stores only its hash (services/auth.ts). That
   * is a credential, not a claim — as strong as a password nobody chose.
   *
   * Defaults to TRUE because without it a release build has no way in at all
   * on Android until Google client ids exist, and Apple reviews an app whose
   * only door is Sign in with Apple harshly (guideline 5.1.1(v): do not force
   * account creation for features that do not need it). Turn it off only if
   * abuse of free account creation becomes a real problem.
   */
  ALLOW_GUEST_AUTH: z
    .string()
    .default('true')
    .transform((v) => v === 'true' || v === '1'),

  /**
   * Pay Merit for rewarded adverts.
   *
   * POST /api/store/ad-reward trusts the client's `viewId`, and a Merit
   * faucet whose tap is on the client is a hole — the daily cap makes it
   * survivable, not correct. So the route is OFF unless an ad network's
   * server-side verification (SSV) callback is actually wired in and this is
   * set true. Until then the store neither offers the button nor honours the
   * claim, which is also the honest thing to show a store reviewer.
   */
  ADS_SERVER_VERIFIED: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

  /**
   * TESTING ONLY: pay rewarded views on the CLIENT's word.
   *
   * Google's public test ad units send no server-side verification callback,
   * so during an internal test there is no other way to exercise the rewarded
   * loop end to end. It is a Merit faucet with the tap on the client — safe
   * enough behind the per-day cap for a closed test with people you know, and
   * indefensible in a public release. Boot logs a warning while it is on.
   *
   * Turn it OFF the day real ad units and the SSV callback go live
   * (ADS_SERVER_VERIFIED).
   */
  ADS_TRUST_CLIENT: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

  /** Rate limiting off, for tests that legitimately hammer a route. */
  DISABLE_RATE_LIMITS: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

  /** Signs access tokens. Must be long and secret; there is no safe default. */
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),

  /**
   * Previous signing secrets, comma-separated, accepted but never issued.
   *
   * Without this, rotating JWT_SECRET invalidates every access token in flight
   * — which signs the whole player base out at once, and does it mid-case for
   * whoever is holding a dossier. Keep the old secret here for one access-token
   * lifetime (30 minutes) after a rotation, then remove it.
   */
  JWT_SECRET_PREVIOUS: z.string().default(''),

  /**
   * How many reverse proxies sit in front of this server.
   *
   * This was hardcoded to 1. Express skips that many hops from the right of
   * X-Forwarded-For, so a wrong number is not a rounding error: too high and
   * the client's own spoofed header becomes req.ip, which hands every
   * IP-keyed rate limit to the attacker. Too low and every player behind the
   * load balancer shares one bucket.
   *
   * 0 means no proxy — trust the socket address and ignore the header
   * entirely, which is the only safe default for a server reachable directly.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),

  /**
   * Comma-separated origins allowed to call the API. Empty means "reflect the
   * request origin", which is only tolerable in development — enforced below.
   */
  CORS_ORIGINS: z.string().default(''),

  // ---- Payments ----
  // Without these, receipt verification refuses everything. That is the correct
  // behaviour for a server that cannot tell a real purchase from a made-up one:
  // an unverifiable receipt is not a borderline case to wave through.
  /** App Store Connect: issuer UUID, key id, and the .p8 private key. */
  APPLE_ISSUER_ID: z.string().default(''),
  APPLE_KEY_ID: z.string().default(''),
  APPLE_PRIVATE_KEY: z.string().default(''),
  /**
   * Sign in with Apple — for REVOKING a player's Apple authorisation when they
   * delete their account (guideline 5.1.1(v)).
   *
   * Deliberately NOT the App Store Connect key above. That one is an In-App
   * Purchase API key; Apple's /auth/token and /auth/revoke endpoints need a
   * "Sign in with Apple" key from Certificates, Identifiers & Profiles → Keys,
   * signed as the TEAM, and Apple will not accept one in place of the other.
   * Sharing the variable names would make it look configured when it is not.
   *
   * All four empty is supported: sign-in still works, only revocation is
   * skipped (and logged at deletion time, so the gap is visible).
   */
  APPLE_TEAM_ID: z.string().default(''),
  APPLE_SIGNIN_KEY_ID: z.string().default(''),
  APPLE_SIGNIN_PRIVATE_KEY: z.string().default(''),
  /** The client_id Apple minted the authorization code for: the bundle id for
   *  a native app. Falls back to APPLE_BUNDLE_ID. */
  APPLE_CLIENT_ID: z.string().default(''),

  /** Google Play: a service account JSON with the androidpublisher scope. */
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().default(''),
  ANDROID_PACKAGE_NAME: z.string().default(''),

  // ---- Support ----
  /**
   * This server's own public origin, e.g. https://api.fault.game.
   *
   * The legal documents are served by this server now (routes/legal.ts), so
   * the privacy policy and terms URLs are derived from it rather than having
   * to exist somewhere else first. Render sets RENDER_EXTERNAL_URL on every
   * web service, so on Render this needs no configuration at all.
   */
  PUBLIC_BASE_URL: z.string().default(''),
  RENDER_EXTERNAL_URL: z.string().default(''),
  /**
   * Where a player is sent for the privacy policy and the terms.
   *
   * Apple requires both to be reachable from inside any app that creates
   * accounts. They used to be required here, with no default, and production
   * refused to boot without them — correct while the documents did not exist
   * anywhere, but it meant the server could not start until someone had
   * hosted a policy elsewhere.
   *
   * Now they default to this server's own /legal/privacy and /legal/terms
   * (see `legalUrls` below), and the app bundles the same text for reading
   * before sign-in. Set these only to point somewhere else, e.g. a marketing
   * site that mirrors the documents.
   */
  PRIVACY_POLICY_URL: z.string().default(''),
  TERMS_URL: z.string().default(''),
  /** Where content reports are mailed, shown to the player when they file one. */
  SUPPORT_EMAIL: z.string().default(''),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment:', z.treeifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';

/** This server's public origin, without a trailing slash, or '' if unknown. */
export const publicBaseUrl = (env.PUBLIC_BASE_URL || env.RENDER_EXTERNAL_URL).replace(/\/+$/, '');

/**
 * The absolute policy URLs handed to the client and pasted into the store
 * listings. An explicit env value wins; otherwise this server's own copy.
 */
export const legalUrls = {
  privacyPolicyUrl: env.PRIVACY_POLICY_URL || (publicBaseUrl ? `${publicBaseUrl}/legal/privacy` : ''),
  termsUrl: env.TERMS_URL || (publicBaseUrl ? `${publicBaseUrl}/legal/terms` : ''),
};

// Fail at boot, not at the first request. A production server with an open
// CORS policy or a dev-auth backdoor should refuse to start rather than run
// and hope nobody notices.
if (isProduction) {
  const problems: string[] = [];
  if (env.ALLOW_DEV_AUTH) problems.push('ALLOW_DEV_AUTH must be false in production');
  if (env.ALLOW_FAKE_PURCHASES) problems.push('ALLOW_FAKE_PURCHASES must be false in production');
  if (env.DISABLE_RATE_LIMITS) problems.push('DISABLE_RATE_LIMITS must be false in production');
  if (!env.CORS_ORIGINS) problems.push('CORS_ORIGINS must be set in production');
  if (env.JWT_SECRET.length < 48) problems.push('JWT_SECRET should be at least 48 chars in production');
  // Not a refusal: a closed internal test runs with NODE_ENV=production on a
  // real host and needs the rewarded loop to pay against Google's test ad
  // units. It IS loud, because leaving it on at launch hands every player an
  // unlimited Merit tap.
  if (env.ADS_TRUST_CLIENT) {
    console.warn(
      'ADS_TRUST_CLIENT is ON: rewarded adverts are paid on the CLIENT\'s word. ' +
        'Fine for an internal test with test ad units; turn it OFF before launch ' +
        'and use the AdMob server-side verification callback instead.',
    );
  }
  // The policy URLs are no longer a boot condition: the documents are served
  // from /legal on this server and bundled in the app, so they exist whether
  // or not anything is configured. What CAN be missing is an absolute URL to
  // hand the client — that degrades the Settings links to the in-app copy,
  // which is still compliant, so it is a warning rather than a refusal.
  if (!legalUrls.privacyPolicyUrl || !legalUrls.termsUrl) {
    console.warn(
      'PUBLIC_BASE_URL is not set (and RENDER_EXTERNAL_URL is absent), so the ' +
        'privacy policy and terms have no absolute URL. The app will show its ' +
        'bundled copy; set PUBLIC_BASE_URL so App Store Connect can link to ' +
        '<base>/legal/privacy.',
    );
  }
  if (problems.length > 0) {
    console.error('Refusing to start:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
}

/**
 * Every secret an access token may have been signed with, newest first.
 *
 * Verification walks this list; signing only ever uses the head.
 */
export const jwtSecrets: string[] = [
  env.JWT_SECRET,
  ...env.JWT_SECRET_PREVIOUS.split(',')
    .map((s) => s.trim())
    .filter((s) => s.length >= 32),
];
