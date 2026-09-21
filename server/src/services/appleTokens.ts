import { importPKCS8, SignJWT } from 'jose';
import { env } from '../lib/env.js';
import { log } from '../lib/log.js';
import { prisma } from '../lib/prisma.js';

/**
 * Sign in with Apple token revocation.
 *
 * App Store Review Guideline 5.1.1(v): an app that supports Sign in with
 * Apple and offers account deletion must also REVOKE the user's Apple tokens
 * when the account is deleted, via Apple's REST API. Deleting our own rows is
 * not enough — without the revoke, the app still appears under "Apps Using
 * Apple ID" in the player's settings, authorised, for an account that no
 * longer exists.
 *
 * Revoking needs a token to revoke, and the identityToken the app sends at
 * sign-in is not one: it is a short-lived assertion. The revocable credential
 * is the refresh_token Apple returns when the app's one-time
 * `authorizationCode` is exchanged at /auth/token. So:
 *
 *   sign-in   → exchange the code, keep the refresh_token on the user
 *   deletion  → POST it to /auth/revoke
 *
 * Both calls authenticate with a client_secret that is not a secret string but
 * a short ES256 JWT signed with a "Sign in with Apple" key — see the env notes
 * on why that is not the App Store Connect key.
 *
 * Everything here is best-effort by design. A failed exchange must not fail a
 * sign-in the player already completed with Apple, and a failed revoke must
 * NEVER stop a deletion: a player who asked to be forgotten is forgotten by us
 * whether or not Apple's endpoint answers. Failures are logged so the gap is
 * visible and can be closed by hand.
 */

const APPLE = 'https://appleid.apple.com';
const TIMEOUT_MS = 8000;

const clientId = () => env.APPLE_CLIENT_ID || env.APPLE_BUNDLE_ID;

export function appleRevocationConfigured(): boolean {
  return Boolean(
    env.APPLE_TEAM_ID && env.APPLE_SIGNIN_KEY_ID && env.APPLE_SIGNIN_PRIVATE_KEY && clientId(),
  );
}

/**
 * The client_secret: a JWT Apple verifies with the key's public half.
 *
 * Apple caps its lifetime at six months; this mints a five-minute one per
 * call, because the calls are rare (one per Apple sign-in, one per deletion)
 * and a secret that is never cached is a secret that is never stale.
 */
async function clientSecret(): Promise<string> {
  // .p8 contents usually arrive through env with literal "\n" escapes.
  const pem = env.APPLE_SIGNIN_PRIVATE_KEY.replace(/\\n/g, '\n');
  const key = await importPKCS8(pem, 'ES256');
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: env.APPLE_SIGNIN_KEY_ID })
    .setIssuer(env.APPLE_TEAM_ID)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .setAudience(APPLE)
    .setSubject(clientId())
    .sign(key);
}

async function post(path: string, form: Record<string, string>): Promise<Response> {
  return fetch(`${APPLE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/**
 * Trade the app's one-time authorization code for a refresh token, and keep it.
 *
 * Called after sign-in has already succeeded, and never awaited by it: this
 * is a round trip to Apple that the player should not wait on, and its
 * failure changes nothing about whether they are signed in.
 */
export async function storeAppleRefreshToken(userId: string, authorizationCode: string): Promise<void> {
  if (!appleRevocationConfigured()) return;
  try {
    const res = await post('/auth/token', {
      client_id: clientId(),
      client_secret: await clientSecret(),
      code: authorizationCode,
      grant_type: 'authorization_code',
    });
    if (!res.ok) {
      // Apple's error body is a short code ("invalid_grant"), never a secret.
      log.warn('apple code exchange refused', { userId, status: res.status, body: (await res.text()).slice(0, 200) });
      return;
    }
    const data = (await res.json()) as { refresh_token?: string };
    if (!data.refresh_token) {
      log.warn('apple code exchange returned no refresh token', { userId });
      return;
    }
    await prisma.user.update({ where: { id: userId }, data: { appleRefreshToken: data.refresh_token } });
  } catch (err) {
    log.warn('apple code exchange failed', { userId, err: (err as Error).message });
  }
}

/**
 * Tell Apple this app no longer holds the player's authorisation.
 *
 * Resolves true only on Apple's 200. Never throws — see the file comment.
 */
export async function revokeAppleToken(userId: string, refreshToken: string | null): Promise<boolean> {
  if (!refreshToken) return false;
  if (!appleRevocationConfigured()) {
    log.warn('apple revocation skipped: Sign in with Apple key not configured', { userId });
    return false;
  }
  try {
    const res = await post('/auth/revoke', {
      client_id: clientId(),
      client_secret: await clientSecret(),
      token: refreshToken,
      token_type_hint: 'refresh_token',
    });
    if (!res.ok) {
      log.error('apple revocation refused', { userId, status: res.status });
      return false;
    }
    log.info('apple authorisation revoked', { userId });
    return true;
  } catch (err) {
    log.error('apple revocation failed', { userId, err: (err as Error).message });
    return false;
  }
}
