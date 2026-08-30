import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { AuthProvider } from '@prisma/client';
import { env } from '../lib/env.js';
import { nonceMatches } from './nonces.js';

/**
 * Verifying who someone is.
 *
 * The client is never trusted to say "I am user X". It hands over the
 * provider's own signed token and the server verifies it against the
 * provider's public keys. A client that could assert its own identity could
 * assert anyone's.
 *
 * Three questions, and all three now get asked:
 *
 *   1. Did the provider sign this?     (JWKS)
 *   2. Was it minted for OUR app?      (aud, and azp on Google)
 *   3. Was it minted for THIS attempt? (nonce — see services/nonces)
 *
 * The third used to be skipped. The client generated a nonce, both providers
 * embedded it, and nothing here ever looked at it — so a real token for our
 * app, captured anywhere in its validity window, could be replayed into a
 * sign-in. Signature and audience were doing all the work and neither of them
 * can tell a fresh token from a stolen one.
 */

export interface VerifiedIdentity {
  provider: AuthProvider;
  /** The provider's stable subject id — never the email. */
  subject: string;
  email: string | null;
}

const APPLE_ISSUER = 'https://appleid.apple.com';
const appleKeys = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

/**
 * Apple's identityToken is a JWT signed by Apple. We check the signature, the
 * issuer, that the audience is *our* app — without the audience check, a token
 * minted for any other Apple app would authenticate here — and that its nonce
 * is the one this server issued for this attempt.
 *
 * Apple embeds sha256(whatever the app passed), not the raw value, which is
 * why `nonceMatches` accepts either spelling of the issued secret.
 */
export async function verifyApple(
  identityToken: string,
  issuedNonce: string,
): Promise<VerifiedIdentity> {
  if (!env.APPLE_BUNDLE_ID) {
    throw new Error('APPLE_BUNDLE_ID is not configured');
  }

  const { payload } = await jwtVerify(identityToken, appleKeys, {
    issuer: APPLE_ISSUER,
    audience: env.APPLE_BUNDLE_ID,
  });

  if (!payload.sub) throw new Error('apple token has no subject');
  if (!nonceMatches(issuedNonce, payload.nonce as string | undefined)) {
    throw new Error('apple token nonce does not match this sign-in');
  }

  return {
    provider: 'apple',
    subject: payload.sub,
    // Apple only ever sends this on the first authorisation, and it may be a
    // private relay address. Treat it as a nicety, never as the identity.
    email: typeof payload.email === 'string' ? payload.email : null,
  };
}

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

/**
 * Google's id_token, verified the same way. The audience must be one of our
 * own client ids — Google issues tokens to every app in the world, and only
 * the aud claim distinguishes ours.
 *
 * `azp` is checked alongside it. On Google, `aud` is who the token is FOR and
 * `azp` is who REQUESTED it, and they differ whenever one project's clients
 * share a backend audience — so a token legitimately issued to a different
 * client of ours (or, in some configurations, someone else's) can carry an
 * `aud` we accept. Requiring azp to be one of ours too closes that gap.
 */
export async function verifyGoogle(
  idToken: string,
  issuedNonce: string,
): Promise<VerifiedIdentity> {
  const audiences = env.GOOGLE_CLIENT_IDS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (audiences.length === 0) {
    throw new Error('GOOGLE_CLIENT_IDS is not configured');
  }

  const { payload } = await jwtVerify(idToken, googleKeys, {
    issuer: GOOGLE_ISSUERS,
    audience: audiences,
  });

  if (!payload.sub) throw new Error('google token has no subject');
  if (payload.email_verified === false) throw new Error('google email not verified');

  const azp = payload.azp;
  if (typeof azp === 'string' && !audiences.includes(azp)) {
    throw new Error('google token was requested by another client');
  }

  if (!nonceMatches(issuedNonce, payload.nonce as string | undefined)) {
    throw new Error('google token nonce does not match this sign-in');
  }

  return {
    provider: 'google',
    subject: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : null,
  };
}

/**
 * The dev bypass.
 *
 * Apple Sign In does not work in Expo Go — it needs a native dev build — and
 * Google needs client ids that may not exist yet. Rather than block the game
 * on credentials, a device-scoped identity stands in.
 *
 * This is gated on ALLOW_DEV_AUTH and refuses to run when NODE_ENV is
 * production. It must never be the path a real player takes: it authenticates
 * anyone who can name a device id.
 */
export function verifyDevice(deviceId: string): VerifiedIdentity {
  if (!env.ALLOW_DEV_AUTH || env.NODE_ENV === 'production') {
    throw new Error('device auth is disabled');
  }
  if (deviceId.length < 8) throw new Error('device id too short');

  return { provider: 'device', subject: deviceId, email: null };
}
