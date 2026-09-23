import { createPublicKey, verify } from 'node:crypto';
import { log } from '../lib/log.js';

/**
 * AdMob server-side verification (SSV) for rewarded ads.
 *
 * The reason rewarded ads were switched off: the client said "I watched one",
 * and a Merit faucet whose tap is on the client is a hole. With SSV, Google
 * calls US when a view completes, signed with a key only Google holds, and
 * that call is the only thing that pays. The client never claims anything.
 *
 * Google signs the query string up to (not including) `&signature=`; the
 * signature is base64url DER ECDSA/SHA-256 and `key_id` names which of the
 * published keys signed it. Keys rotate, so they are fetched and cached, and
 * refetched when an unknown key id turns up.
 *
 * https://developers.google.com/admob/android/ssv
 */

const KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
const KEYS_TTL_MS = 12 * 3_600_000;

let cache: { at: number; keys: Map<string, string> } | null = null;

async function fetchKeys(): Promise<Map<string, string>> {
  const res = await fetch(KEYS_URL, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`admob keys ${res.status}`);
  const body = (await res.json()) as { keys?: { keyId: number | string; pem: string }[] };
  const keys = new Map((body.keys ?? []).map((k) => [String(k.keyId), k.pem]));
  cache = { at: Date.now(), keys };
  return keys;
}

async function keyFor(keyId: string): Promise<string | null> {
  let keys = cache && Date.now() - cache.at < KEYS_TTL_MS ? cache.keys : await fetchKeys();
  if (!keys.has(keyId)) keys = await fetchKeys(); // rotated since we last looked
  return keys.get(keyId) ?? null;
}

export interface SsvReward {
  userId: string;
  transactionId: string;
  /** What the view pays: set by the app as `customData`. */
  reward: 'merit' | 'case';
}

/** Split out for tests: the exact bytes Google signed, and the signature. */
export function splitSigned(rawQuery: string): { message: string; params: URLSearchParams } | null {
  const at = rawQuery.indexOf('&signature=');
  if (at <= 0) return null;
  return { message: rawQuery.slice(0, at), params: new URLSearchParams(rawQuery) };
}

export function verifyWithPem(message: string, signature: string, pem: string): boolean {
  try {
    return verify(
      'sha256',
      Buffer.from(message, 'utf8'),
      { key: createPublicKey(pem), dsaEncoding: 'der' },
      Buffer.from(signature, 'base64url'),
    );
  } catch {
    return false;
  }
}

/**
 * Verify a callback's raw query string. Null means "not from Google", and the
 * caller pays nothing.
 */
export async function verifySsv(rawQuery: string): Promise<SsvReward | null> {
  const split = splitSigned(rawQuery);
  if (!split) return null;
  const { message, params } = split;

  const signature = params.get('signature');
  const keyId = params.get('key_id');
  if (!signature || !keyId) return null;

  let pem: string | null;
  try {
    pem = await keyFor(keyId);
  } catch (err) {
    log.warn('admob ssv keys unavailable', { error: (err as Error).message });
    return null;
  }
  if (!pem || !verifyWithPem(message, signature, pem)) return null;

  const userId = params.get('user_id');
  const transactionId = params.get('transaction_id');
  if (!userId || !transactionId) return null;
  const reward = params.get('custom_data') === 'case' ? 'case' : 'merit';
  return { userId, transactionId: `admob:${transactionId}`, reward };
}
