import { createHash } from 'node:crypto';
import Groq from 'groq-sdk';
import { env } from './env.js';
import { redis } from './redis.js';

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
  /** A hash of the key, so instances can agree on one without sharing it. */
  fingerprint: string;
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
  // The key itself never leaves this process — Redis sees only a hash of it,
  // so a cache dump is not a pile of working API keys.
  fingerprint: createHash('sha256').update(key).digest('hex').slice(0, 16),
  parkedUntil: 0,
  failures: 0,
}));

let cursor = 0;

/**
 * Parking, shared across every instance.
 *
 * `parkedUntil` lives in process memory, which is correct for exactly one
 * server and wrong for two. Run three instances and each keeps its own opinion
 * of which keys are spent: instance A learns that key 3 is finished for the
 * day, and instances B and C keep cheerfully spending requests against it,
 * collecting 429s, and burning the retry budget on a wall A already found.
 *
 * The whole point of the pool is that the DAILY cap is the binding constraint
 * — so the one fact that most needs sharing is which keys have hit it.
 *
 * Redis holds it, with the local value as a write-through cache so the hot
 * path (leaseKey) stays synchronous and never waits on the network. The local
 * copy is refreshed in the background; being a few seconds stale costs one
 * wasted request, which is exactly what it cost before, once, per instance.
 */
const parkKey = (fingerprint: string) => `groq:parked:${fingerprint}`;

async function publishPark(entry: PooledKey, untilMs: number): Promise<void> {
  const ttl = Math.ceil((untilMs - Date.now()) / 1000);
  if (ttl <= 0) return;
  await redis.set(parkKey(entry.fingerprint), String(untilMs), 'EX', ttl).catch(() => {
    // Redis down: the park is still honoured locally, which is precisely the
    // behaviour this whole mechanism had before it was shared. Degrade to it.
  });
}

/** Pull other instances' parks into this one's view. */
async function syncParks(): Promise<void> {
  if (keys.length === 0) return;
  try {
    const values = await redis.mget(...keys.map((k) => parkKey(k.fingerprint)));
    values.forEach((value, i) => {
      const entry = keys[i];
      if (!entry || !value) return;
      const until = Number(value);
      // Only ever extend. A stale read must not un-park a key this instance
      // has just discovered is spent.
      if (Number.isFinite(until) && until > entry.parkedUntil) entry.parkedUntil = until;
    });
  } catch {
    /* the local view is still usable */
  }
}

if (keys.length > 0) {
  void syncParks();
  // Every 15s. Frequent enough that a spent key stops being retried across the
  // fleet almost immediately; rare enough to be invisible next to the token
  // budget it protects. unref so it never holds a shutdown open.
  const timer = setInterval(() => void syncParks(), 15_000);
  timer.unref();
}

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
        // Every park is published so the rest of the fleet stops trying the
        // same key. Fire-and-forget: the local park has already taken effect,
        // and sharing it is an optimisation for everyone else.
        const park = (ms: number) => {
          entry.parkedUntil = Date.now() + ms;
          void publishPark(entry, entry.parkedUntil);
        };

        switch (outcome) {
          case 'ok':
            entry.failures = 0;
            break;
          case 'minute-limit':
            park(MINUTE_PARK_MS);
            break;
          case 'day-limit':
            park(DAY_PARK_MS);
            console.warn(`[groq] key ${entry.label} spent for the day — ${availableCount()} left`);
            break;
          case 'error':
            entry.failures++;
            if (entry.failures >= MAX_FAILURES) {
              park(ERROR_PARK_MS);
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
 * A short completion, through the pool.
 *
 * The outcome line and the juror profile used to import `groq` — which was
 * `keys[0]`, the first key, always, bypassing rotation entirely. So the moment
 * key one hit its daily cap, every outcome and every written profile started
 * failing while case generation carried on perfectly well on keys two through
 * five. The two features that make the review break mean anything were the
 * first to break, and they broke at one fifth of the budget.
 *
 * They are small calls and they genuinely do not need retries. They do need to
 * see the same parked keys everything else does.
 */
export async function completeOnce(opts: {
  prompt: string;
  maxTokens: number;
  temperature: number;
}): Promise<string | null> {
  const lease = leaseKey();
  if (!lease) return null;

  try {
    const response = await lease.client.chat.completions.create(
      {
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: opts.prompt }],
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
      },
      // Nobody is waiting on these — they are written behind a response — but
      // an unbounded call still pins a key's slot and a Node handle.
      { timeout: 15_000 },
    );
    lease.release('ok');
    return response.choices[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    lease.release(classifyError((err as Error).message ?? ''));
    return null;
  }
}


/**
 * Does the configured model actually exist?
 *
 * This check exists because it caught a live, silent, total outage.
 *
 * GROQ_MODEL was `llama-3.3-70b-versatile`, which Groq has since retired. Every
 * single generation was returning 404 model_not_found, every case was falling
 * through to the six hand-authored fallbacks, and NOTHING SAID SO — the health
 * endpoint reported `groq: true` and five keys available, because the keys were
 * fine. It was the model that was gone. From the outside the game looked
 * healthy and quietly served the same six cases to everybody.
 *
 * A provider retiring a model is not an exotic failure; it is a scheduled one,
 * announced in advance and then forgotten. The server should notice at boot,
 * loudly, rather than at the ten-thousandth case, never.
 *
 * Deliberately NOT fatal. The fallback docket is a real, designed mode and the
 * game is playable in it, so refusing to start would turn a degraded service
 * into no service. It logs at error level, names the models that DO exist, and
 * lets the operator decide.
 */
export async function checkModelAvailable(): Promise<
  { ok: true } | { ok: false; reason: string; available?: string[] }
> {
  const lease = leaseKey();
  if (!lease) return { ok: false, reason: 'no usable keys' };

  try {
    const models = await lease.client.models.list();
    lease.release('ok');

    const ids = models.data.map((m) => m.id);
    if (ids.includes(GROQ_MODEL)) return { ok: true };

    return {
      ok: false,
      reason: `GROQ_MODEL "${GROQ_MODEL}" is not available on this account`,
      // Chat models only — the list is mostly speech and guard models, and
      // burying the four usable ones in that is how this gets ignored again.
      available: ids.filter((id) => !/whisper|orpheus|prompt-guard|tts/i.test(id)),
    };
  } catch (err) {
    lease.release(classifyError((err as Error).message ?? ""));
    return { ok: false, reason: `could not list models: ${(err as Error).message.slice(0, 120)}` };
  }
}
