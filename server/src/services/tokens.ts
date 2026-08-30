import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { env, jwtSecrets } from '../lib/env.js';
import { log } from '../lib/log.js';
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

let cachedSecrets: Uint8Array[] | null = null;

/**
 * Every secret a token may have been signed with, newest first.
 *
 * Rotating JWT_SECRET used to invalidate every access token in flight at once
 * — which signs the entire player base out simultaneously, and does it
 * mid-case for anyone holding a dossier with the clock running. A verdict is
 * the one request in this game that cannot be retried, so "rotate the secret"
 * was effectively an operation you could never perform.
 *
 * Now the old secret goes in JWT_SECRET_PREVIOUS for one access-token lifetime
 * (30 minutes) after a rotation. Verification accepts either; signing only
 * ever uses the head, so every token minted after the rotation is already on
 * the new secret and the window closes on its own.
 */
function secrets(): Uint8Array[] {
  if (cachedSecrets) return cachedSecrets;
  if (env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
  const encoder = new TextEncoder();
  cachedSecrets = jwtSecrets.map((s) => encoder.encode(s));
  return cachedSecrets;
}

/** The one we sign with. Always the current secret, never a retired one. */
const secret = (): Uint8Array => secrets()[0]!;

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

/**
 * Verifies signature, issuer, audience and expiry. No database hit.
 *
 * Tries each accepted secret in turn (see `secrets`), so a token signed just
 * before a rotation still verifies until it expires on its own.
 */
export async function verifyAccessToken(token: string): Promise<string | null> {
  for (const key of secrets()) {
    try {
      const { payload } = await jwtVerify(token, key, {
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      return typeof payload.sub === 'string' ? payload.sub : null;
    } catch {
      // Wrong secret, or a bad token. Try the next one; if none match, the
      // loop falls through to null and the caller sees an ordinary 401.
    }
  }
  return null;
}

/**
 * Trade a refresh token for a new pair, rotating it.
 *
 * Rotation alone is not theft detection, which is what this used to assume.
 * The old code treated an already-revoked token as an ordinary failure and
 * returned null: the victim was signed out, the thief kept the token they had
 * rotated into, and nothing anywhere recorded that it had happened.
 *
 * A revoked-but-not-expired token being presented has exactly two causes. A
 * benign race — the client fired two refreshes and one lost — or someone is
 * replaying a stolen token. The two are indistinguishable at this layer, and
 * only one of them is dangerous, so it is treated as the dangerous one: every
 * token for that juror is revoked, which logs both the thief and the victim
 * out and forces a real provider sign-in that an attacker cannot complete.
 *
 * The cost of being wrong is one unexpected sign-in screen. The cost of the
 * other mistake is a permanently stolen account.
 */
export async function rotateRefresh(refreshToken: string): Promise<TokenPair | null> {
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: hash(refreshToken) },
  });

  if (!row) return null;

  if (row.revokedAt) {
    log.warn('refresh token reuse — revoking all sessions', {
      userId: row.userId,
      tokenId: row.id,
      revokedAt: row.revokedAt.toISOString(),
    });
    await revokeAll(row.userId);
    return null;
  }

  if (row.expiresAt < new Date()) return null;

  // Conditional update, so two simultaneous refreshes cannot both rotate the
  // same token: the loser matches zero rows and is treated as reuse on its
  // next attempt rather than being handed a second valid pair.
  const consumed = await prisma.refreshToken.updateMany({
    where: { id: row.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (consumed.count === 0) return null;

  return issueTokens(row.userId);
}

export async function revokeAll(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
