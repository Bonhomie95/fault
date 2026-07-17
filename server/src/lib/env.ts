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
config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

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
  GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),
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
  if (problems.length > 0) {
    console.error('Refusing to start:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
}
