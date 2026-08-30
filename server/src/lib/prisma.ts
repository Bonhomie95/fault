import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env, isProduction } from './env.js';

/**
 * The connection pool.
 *
 * Prisma 7 requires an explicit driver adapter; the connection string no
 * longer flows from the schema.
 *
 * The pool size is set here rather than inherited. node-postgres defaults to
 * 10 connections, which is a number chosen for a laptop, and it is the wrong
 * one at both ends: too small to keep a busy instance fed, and — far worse —
 * multiplied by however many instances are running, easily past what Postgres
 * will accept. `max_connections` defaults to 100, of which some are reserved
 * for superusers, so five instances at a careless 50 each is an outage that
 * arrives the moment you scale out, presenting as "sorry, too many clients
 * already" on every request at once.
 *
 * 20 per instance is deliberate: enough that the ~38 sequential round trips a
 * verdict makes never queue behind each other under normal load, and small
 * enough that a fleet of four still leaves Postgres headroom. Deployments that
 * know their own arithmetic override it with DATABASE_POOL_MAX.
 *
 * The timeouts matter as much as the size. Without them a stuck query holds a
 * connection forever and the pool bleeds out one slot at a time, which looks
 * like a slow memory leak and is actually a queue.
 */
const DEFAULT_POOL_MAX = isProduction ? 20 : 10;

/**
 * Read as a number, and only believed if it is one.
 *
 * `Number(process.env.DATABASE_POOL_MAX ?? default)` returns NaN for anything
 * that is not a number — `DATABASE_POOL_MAX=twenty`, or a value that picked up
 * a trailing comment — and `new PrismaPg({ max: NaN })` does not complain. It
 * produces a pool whose size comparisons are all false, which is a connection
 * limit that does not limit. That is the kind of misconfiguration that is
 * invisible until production is under load, so it is refused here instead.
 */
function poolSize(): number {
  const raw = process.env.DATABASE_POOL_MAX;
  if (raw === undefined || raw === '') return DEFAULT_POOL_MAX;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `DATABASE_POOL_MAX must be a positive integer, got ${JSON.stringify(raw)}`,
    );
  }
  return value;
}

const poolMax = poolSize();

const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
  max: poolMax,
  // Reap idle connections so a quiet instance stops holding slots the rest of
  // the fleet could use.
  idleTimeoutMillis: 30_000,
  // Fail fast rather than hanging a request forever on an exhausted pool: a
  // request that cannot get a connection in ten seconds has already lost, and
  // the player is better served by an error than by a spinner.
  connectionTimeoutMillis: 10_000,
});

export const prisma = new PrismaClient({ adapter });
