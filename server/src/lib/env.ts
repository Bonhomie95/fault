import 'dotenv/config';
import { z } from 'zod';

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

  /** Signs access tokens. Must be long and secret; there is no safe default. */
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),

  /**
   * Comma-separated origins allowed to call the API. Empty means "reflect the
   * request origin", which is only tolerable in development — enforced below.
   */
  CORS_ORIGINS: z.string().default(''),
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
  if (!env.CORS_ORIGINS) problems.push('CORS_ORIGINS must be set in production');
  if (env.JWT_SECRET.length < 48) problems.push('JWT_SECRET should be at least 48 chars in production');
  if (problems.length > 0) {
    console.error('Refusing to start:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
}
