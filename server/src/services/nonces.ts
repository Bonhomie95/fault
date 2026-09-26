import { createHash, randomBytes } from 'node:crypto';
import { redis } from '../lib/redis.js';

/**
 * Sign-in nonces.
 *
 * The client used to generate its own. `signInWithApple` built a SHA-256 nonce
 * and handed it to Apple; `signInWithGoogle` put one in `extraParams`. Both
 * providers dutifully embedded it in the token they signed — and the server
 * never read it back out.
 *
 * A nonce the client invents and the server never checks is decoration. Its
 * entire purpose is to bind one identity token to one sign-in attempt that
 * THIS server asked for, and a value the server has never seen cannot do that.
 * Without it, an identity token captured anywhere inside its validity window —
 * a logging proxy, a debug build, a compromised device — can be replayed
 * straight into POST /api/auth/sign-in to take over that account. The audience
 * check stops tokens minted for other apps; nothing stopped a replay of a real
 * token minted for ours.
 *
 * So the server issues it, remembers it, and consumes it exactly once.
 *
 * Redis rather than Postgres: these are write-once, read-once, and expire in
 * minutes. Putting them in the database means a table that is pure churn and a
 * cleanup job that will be forgotten. The tradeoff is honest and stated below.
 */

/**
 * Long enough that a sign-in survives a slow provider sheet and a user reading
 * the Apple dialog; short enough that a stolen nonce is worthless by the time
 * anyone could use it.
 */
const NONCE_TTL_SECONDS = 10 * 60;

const key = (nonce: string) => `nonce:${nonce}`;

export interface IssuedNonce {
  /** Handed to the client. Apple wants this SHA-256'd; Google wants it raw. */
  nonce: string;
  /**
   * The value that will actually appear in Apple's token.
   *
   * Apple hashes whatever the app passes in `nonce` and puts the HASH in the
   * identityToken. Google puts the raw value in the id_token. So the two
   * providers need different comparisons against the same issued secret, and
   * shipping both spellings here means neither client has to know that.
   */
  nonceSha256: string;
  expiresInSeconds: number;
}

const sha256 = (raw: string) => createHash('sha256').update(raw).digest('hex');

/**
 * Mint a nonce for one sign-in attempt.
 *
 * Unauthenticated by necessity — this is the step before identity exists — so
 * it is rate limited like the sign-in route itself.
 */
export async function issueNonce(): Promise<IssuedNonce> {
  const nonce = randomBytes(32).toString('base64url');
  await redis.set(key(nonce), '1', 'EX', NONCE_TTL_SECONDS);
  return { nonce, nonceSha256: sha256(nonce), expiresInSeconds: NONCE_TTL_SECONDS };
}

/**
 * Is this nonce still good, without spending it?
 *
 * Sign-in for a NEW Apple or Google juror takes two requests: one that
 * discovers the court has never met them (409 `juror_name_required`) and one
 * that carries the name they chose. Both present the same provider token, and
 * a provider token carries exactly one nonce — the client cannot mint a fresh
 * one without sending the player back through the provider sheet.
 *
 * So the first request must CHECK the nonce without burning it, or the second
 * is rejected as a replay and no new juror can ever swear in. Spending happens
 * at the point the sign-in actually completes; see `consumeNonce`.
 */
export async function nonceIsLive(nonce: string): Promise<boolean> {
  return (await redis.exists(key(nonce))) === 1;
}

/**
 * Spend a nonce. True only the first time, and only within the TTL.
 *
 * DEL returns the number of keys removed, which makes this atomic without a
 * transaction: two concurrent replays of the same token race, and exactly one
 * of them gets the 1.
 */
export async function consumeNonce(nonce: string): Promise<boolean> {
  const removed = await redis.del(key(nonce));
  return removed === 1;
}

/**
 * Whether the nonce carried by a provider token matches the one we issued.
 *
 * Apple embeds sha256(nonce); Google embeds the nonce itself. Accepting either
 * spelling of the same issued secret keeps one code path for both providers
 * without weakening anything: an attacker still has to have been handed this
 * exact secret by this server, moments ago.
 */
export function nonceMatches(issued: string, claimed: string | undefined): boolean {
  if (!claimed) return false;
  return claimed === issued || claimed === sha256(issued);
}

/**
 * Whether nonce enforcement is available at all.
 *
 * Redis is a cache everywhere else in this codebase and its outage is
 * deliberately survivable. Here it is not: a nonce store that silently forgets
 * is a nonce check that silently passes, which is worse than no check because
 * it looks like one. So callers ask this first and refuse the sign-in outright
 * when the store is unreachable, rather than degrading into the vulnerability
 * this file exists to close.
 */
export async function nonceStoreReady(): Promise<boolean> {
  try {
    return (await redis.ping()) === 'PONG';
  } catch {
    return false;
  }
}
