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
  /** Google Play: a service account JSON with the androidpublisher scope. */
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().default(''),
  ANDROID_PACKAGE_NAME: z.string().default(''),

  // ---- Support ----
  /**
   * Where a player is sent for the privacy policy and the terms.
   *
   * Apple requires both to be reachable from inside any app that creates
   * accounts, and the settings screen links to whatever is here. Empty hides
   * the links rather than shipping a dead one, and production refuses to boot
   * without them (below) — a live game with accounts and no privacy policy is
   * a compliance problem, not a missing nicety.
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
  // Apple requires both to be reachable in-app from any app offering account
  // creation, and this one does. Refusing at boot is cheaper than a rejection.
  if (!env.PRIVACY_POLICY_URL) problems.push('PRIVACY_POLICY_URL must be set in production');
  if (!env.TERMS_URL) problems.push('TERMS_URL must be set in production');
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
