import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../lib/env.js';
import { prisma } from '../lib/prisma.js';

/**
 * Sessions.
 *
 * Before this, every authenticated call was `x-juror-id: <cuid>` — a bearer
 * credential that never expired, could not be revoked, and identified a whole
 * career. It leaked into every log line, proxy and crash report it touched,
 * and anyone who read one owned that juror permanently. It was an honest fit
 * when there were no accounts. It stopped being one the moment real sign-in
 * arrived.
 *
 * Now: a short-lived signed access token the server can verify without a
 * database round trip, and a long-lived refresh token that IS in the database
 * so it can be revoked — on sign-out, on account deletion, or when something
 * looks wrong.
 *
 * Refresh tokens are stored hashed. A database dump should not be a pile of
 * working credentials.
 */

const ISSUER = 'fault';
const AUDIENCE = 'fault-app';

/** Short enough that a leaked access token is a small window. */
const ACCESS_TTL = '30m';
/** Long enough that a player who plays weekly is never signed out. */
const REFRESH_TTL_DAYS = 90;

let cachedSecret: Uint8Array | null = null;

function secret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  if (env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
  cachedSecret = new TextEncoder().encode(env.JWT_SECRET);
  return cachedSecret;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

const hash = (raw: string) => createHash('sha256').update(raw).digest('hex');

export async function issueTokens(userId: string): Promise<TokenPair> {
  const accessToken = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(ACCESS_TTL)
    .sign(secret());

  const refreshToken = randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 86400_000);

  await prisma.refreshToken.create({
    data: { userId, tokenHash: hash(refreshToken), expiresAt },
  });

  return { accessToken, refreshToken, expiresInSeconds: 30 * 60 };
}

/** Verifies signature, issuer, audience and expiry. No database hit. */
export async function verifyAccessToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

/**
 * Trade a refresh token for a new pair, rotating it.
 *
 * The old token is consumed. If a stolen refresh token is used, the real
 * player's next refresh fails and they are signed out — which is noisy, and
 * noisy is what you want: silent theft is the bad outcome.
 */
export async function rotateRefresh(refreshToken: string): Promise<TokenPair | null> {
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: hash(refreshToken) },
  });

  if (!row || row.revokedAt || row.expiresAt < new Date()) return null;

  await prisma.refreshToken.update({
    where: { id: row.id },
    data: { revokedAt: new Date() },
  });

  return issueTokens(row.userId);
}

export async function revokeAll(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
