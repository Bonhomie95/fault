import Groq from 'groq-sdk';
import { env } from './env.js';

/**
 * A pool of Groq keys, rotated.
 *
 * One free-tier key allows ~100k tokens per day — about 33 cases, across every
 * juror on the server. Five keys is five dockets' worth. The pool exists to
 * multiply that ceiling, not to hide it: when every key is spent the game
 * still falls back to the authored docket, it just takes five times longer to
 * get there.
 *
 * Two distinct failures need distinct handling:
 *   - per-minute (TPM): this key is busy. Try the next one immediately.
 *   - per-day (TPD): this key is finished until it resets. Park it, and stop
 *     asking — retrying a daily cap is how you burn a whole pool in seconds.
 */

export interface KeyLease {
  client: Groq;
  /** Tell the pool what happened, so the next caller routes around it. */
  release: (outcome: 'ok' | 'minute-limit' | 'day-limit' | 'error') => void;
}

interface PooledKey {
  client: Groq;
  /** Last four characters only — enough to identify in logs, never the key. */
  label: string;
  /** Epoch ms until which this key is unusable. */
  parkedUntil: number;
  failures: number;
}

/** Groq's daily window rolls; an hour is a conservative re-check. */
const DAY_PARK_MS = 60 * 60 * 1000;
const MINUTE_PARK_MS = 20 * 1000;
/** After this many consecutive hard errors a key is treated as bad, not busy. */
const ERROR_PARK_MS = 5 * 60 * 1000;
const MAX_FAILURES = 3;

/**
 * Collects keys from every shape a .env might reasonably hold them in:
 *
 *   GROQ_API_KEY        — a single key
 *   GROQ_API_KEYS       — comma-separated pool
 *   GROQ_API_KEY_1..N   — numbered, one per line
 *
 * All three are supported because all three are things people actually write,
 * and a key silently ignored because it was named the "wrong" way is a bug
 * that looks like a rate limit.
 */
function parseKeys(): string[] {
  const pool: string[] = [];

  const single = env.GROQ_API_KEY.trim();
  if (single) pool.push(single);

  for (const k of env.GROQ_API_KEYS.split(',')) {
    const key = k.trim();
    if (key) pool.push(key);
  }

  // Numbered keys, in numeric order rather than whatever order the env hands
  // them over in.
  const numbered = Object.entries(process.env)
    .filter(([name]) => /^GROQ_API_KEY_\d+$/.test(name))
    .sort(([a], [b]) => Number(a.split('_').pop()) - Number(b.split('_').pop()));

  for (const [, value] of numbered) {
    const key = value?.trim();
    if (key) pool.push(key);
  }

  return [...new Set(pool)];
}

const keys: PooledKey[] = parseKeys().map((key) => ({
  client: new Groq({ apiKey: key }),
  label: `…${key.slice(-4)}`,
  parkedUntil: 0,
  failures: 0,
}));

let cursor = 0;

export const aiEnabled = keys.length > 0;
export const keyCount = keys.length;

/**
 * Borrow a usable key. Round-robin, so a single busy key cannot monopolise the
 * pool, and parked keys are skipped.
 *
 * Returns null when every key is spent — the caller should fall back rather
 * than wait, because a whole parked pool means the day's budget is gone.
 */
export function leaseKey(): KeyLease | null {
  if (keys.length === 0) return null;

  const now = Date.now();

  for (let i = 0; i < keys.length; i++) {
    const index = (cursor + i) % keys.length;
    const entry = keys[index]!;
    if (entry.parkedUntil > now) continue;

    // Advance past the one we took, so the next caller starts elsewhere.
    cursor = (index + 1) % keys.length;

    return {
      client: entry.client,
      release: (outcome) => {
        switch (outcome) {
          case 'ok':
            entry.failures = 0;
            break;
          case 'minute-limit':
            entry.parkedUntil = Date.now() + MINUTE_PARK_MS;
            break;
          case 'day-limit':
            entry.parkedUntil = Date.now() + DAY_PARK_MS;
            console.warn(`[groq] key ${entry.label} spent for the day — ${availableCount()} left`);
            break;
          case 'error':
            entry.failures++;
            if (entry.failures >= MAX_FAILURES) {
              entry.parkedUntil = Date.now() + ERROR_PARK_MS;
              entry.failures = 0;
              console.warn(`[groq] key ${entry.label} parked after repeated errors`);
            }
            break;
        }
      },
    };
  }

  return null; // every key parked
}

export function availableCount(): number {
  const now = Date.now();
  return keys.filter((k) => k.parkedUntil <= now).length;
}

/** Which limit a 429 actually hit. They mean very different things. */
export function classifyError(message: string): 'minute-limit' | 'day-limit' | 'error' {
  if (/per day|TPD|RPD/i.test(message)) return 'day-limit';
  if (/per minute|TPM|RPM|rate.?limit|429/i.test(message)) return 'minute-limit';
  return 'error';
}

export const GROQ_MODEL = env.GROQ_MODEL;

/**
 * The single-client export the rest of the server used before the pool
 * existed. Kept for the outcome and profile writers, which make one small call
 * and do not need rotation.
 */
export const groq = keys[0]?.client ?? null;
