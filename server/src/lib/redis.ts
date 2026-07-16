// Named export, not default: ioredis is CJS, and its default export does not
// carry a construct signature under node16 module resolution.
import { Redis } from 'ioredis';
import { env } from './env.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

redis.on('error', (err: Error) => {
  // Redis is a buffer, never the source of truth — Postgres always holds the
  // real city. A cache outage should degrade latency, not gameplay.
  console.error('[redis]', err.message);
});

export const caseQueueKey = (userId: string) => `cases:${userId}`;
export const cityKey = (userId: string) => `city:${userId}`;
