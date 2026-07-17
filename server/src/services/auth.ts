import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { AuthProvider } from '@prisma/client';
import { env } from '../lib/env.js';

/**
 * Verifying who someone is.
 *
 * The client is never trusted to say "I am user X". It hands over the
 * provider's own signed token and the server verifies it against the
 * provider's public keys. A client that could assert its own identity could
 * assert anyone's.
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
 * issuer, and that the audience is *our* app — without the audience check, a
 * token minted for any other Apple app would authenticate here.
 */
export async function verifyApple(identityToken: string): Promise<VerifiedIdentity> {
  if (!env.APPLE_BUNDLE_ID) {
    throw new Error('APPLE_BUNDLE_ID is not configured');
  }

  const { payload } = await jwtVerify(identityToken, appleKeys, {
    issuer: APPLE_ISSUER,
    audience: env.APPLE_BUNDLE_ID,
  });

  if (!payload.sub) throw new Error('apple token has no subject');

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
 */
export async function verifyGoogle(idToken: string): Promise<VerifiedIdentity> {
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
