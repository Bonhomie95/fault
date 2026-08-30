import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { SignJWT } from 'jose';
import request from 'supertest';

/**
 * The rate limiter, and the bug that made it decorative.
 *
 * `globalLimiter` keyed on `req.juror?.userId ?? ip`. It is mounted at app
 * level, which is BEFORE any router — and `req.juror` is set by `requireJuror`,
 * which runs INSIDE the routers. So the juror branch was unreachable, every
 * request was keyed by IP, and with `trust proxy` on, that IP was whatever the
 * caller wrote in X-Forwarded-For.
 *
 * Reproduced against the running server: one authenticated user sent 140
 * requests with a fixed spoofed header and was throttled at exactly 120, then
 * sent 60 more with a rotating header and every single one succeeded.
 *
 * Two things have to hold, and this file asserts both:
 *
 *   1. identity is known BEFORE the limiter runs, without a database hit
 *   2. an authenticated caller is keyed by juror, so rotating an IP header
 *      cannot buy them a fresh bucket
 */

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://bonhomie@localhost:5432/fault_test?schema=public';
process.env.REDIS_URL = 'redis://localhost:6379/1';
process.env.JWT_SECRET = 'test-secret-that-is-comfortably-long-enough-for-hs256-signing';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.GROQ_API_KEY = '';
process.env.GROQ_API_KEYS = '';
for (const k of Object.keys(process.env)) if (/^GROQ_API_KEY_\d+$/.test(k)) delete process.env[k];
// Deliberately NOT disabled here: this suite exists to watch limits work.
process.env.DISABLE_RATE_LIMITS = 'false';

const { identify } = await import('../src/middleware/identify.js');

/**
 * Access tokens minted here, not through issueTokens.
 *
 * `identify` verifies a signature and reads `sub`. It deliberately never
 * touches the database — a rate limiter that queries Postgres to decide
 * whether to reject you is a denial-of-service amplifier — so this suite has
 * no business creating User rows either.
 *
 * It also makes the file independent. routes.test.ts opens with a global
 * `user.deleteMany({})`, node runs test files in parallel, and the first
 * version of this suite created real users and then watched them vanish
 * mid-test. A test whose subject needs no database should not borrow one.
 */
async function tokenFor(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('fault')
    .setAudience('fault-app')
    .setExpirationTime('30m')
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

/**
 * A miniature app with the same middleware ORDER as the real one.
 *
 * The order is the thing under test, so it is spelled out here rather than
 * imported: a test that mounted the real app would pass even if someone later
 * moved `identify` after the limiter, because supertest would still see 200s
 * until the bucket filled.
 */
function harness(limit: number) {
  const app = express();
  app.set('trust proxy', 1); // the old, permissive setting — worst case on purpose
  app.use(identify);
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      keyGenerator: (req: express.Request) =>
        req.rateKeyUserId ?? (req.ip ? ipKeyGenerator(req.ip) : 'unknown'),
    }),
  );
  app.get('/probe', (req, res) => res.json({ keyedTo: req.rateKeyUserId ?? 'ip' }));
  return app;
}

describe('the limiter knows who is asking', () => {
  it('identifies a bearer token before any router runs', async () => {
    const accessToken = await tokenFor('juror-abc');

    const res = await request(harness(100))
      .get('/probe')
      .set('Authorization', `Bearer ${accessToken}`);

    assert.equal(res.status, 200);
    assert.equal(
      res.body.keyedTo,
      'juror-abc',
      'the limiter still cannot see the juror — identity must be resolved before it',
    );
  });

  it('falls back to the IP when there is no token', async () => {
    const res = await request(harness(100)).get('/probe');
    assert.equal(res.body.keyedTo, 'ip');
  });

  it('ignores a forged token rather than trusting its subject', async () => {
    const forged =
      Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') +
      '.' +
      Buffer.from(
        JSON.stringify({ sub: 'someone-else', iss: 'fault', aud: 'fault-app', exp: 9_999_999_999 }),
      ).toString('base64url') +
      '.';

    const res = await request(harness(100)).get('/probe').set('Authorization', `Bearer ${forged}`);
    assert.equal(res.body.keyedTo, 'ip', 'an unsigned token must not choose the rate-limit key');
  });
});

describe('an authenticated caller cannot buy a fresh bucket', () => {
  it('throttles the same juror across rotating X-Forwarded-For headers', async () => {
    // The exact bypass that was reproduced against the running server.
    const accessToken = await tokenFor('juror-rotator');
    const app = harness(5);
    const statuses: number[] = [];

    for (let i = 0; i < 12; i++) {
      const res = await request(app)
        .get('/probe')
        .set('Authorization', `Bearer ${accessToken}`)
        // A different "client IP" every single time.
        .set('X-Forwarded-For', `198.51.100.${i + 1}`);
      statuses.push(res.status);
    }

    const throttled = statuses.filter((s) => s === 429).length;
    assert.equal(
      throttled,
      7,
      `rotating the header bought ${12 - throttled} requests through a limit of 5`,
    );
  });

  it('still separates two different jurors sharing one IP', async () => {
    // The other half of the same bug: everyone behind one carrier-grade NAT
    // used to share a single bucket, which is most of a mobile user base in
    // several of the countries this game localises for.
    const tokenA = await tokenFor('juror-nat-a');
    const tokenB = await tokenFor('juror-nat-b');
    const app = harness(3);
    const sameIp = '203.0.113.9';

    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .get('/probe')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Forwarded-For', sameIp);
      assert.equal(res.status, 200);
    }

    // A has now spent their whole allowance. B, on the same IP, must be fine.
    const res = await request(app)
      .get('/probe')
      .set('Authorization', `Bearer ${tokenB}`)
      .set('X-Forwarded-For', sameIp);

    assert.equal(res.status, 200, 'two jurors behind one NAT are sharing a bucket');
  });
});

/**
 * Every route that accepts a credential is limited like one.
 *
 * `/refresh` was covered only by globalLimiter — 120 a minute against an
 * unauthenticated endpoint that trades a bearer token for a fresh session,
 * where `/sign-in` next to it allows twenty in fifteen minutes. Nothing about
 * the route said so; it was simply the one public POST in auth.ts that had no
 * limiter listed, and that is exactly the kind of omission that is invisible
 * in review. So assert the property rather than the line.
 */
describe('the credential routes are all rate limited', () => {
  it('lists a limiter on every public route in the auth router', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const source = readFileSync(
      fileURLToPath(new URL('../src/routes/auth.ts', import.meta.url)),
      'utf8',
    );

    const routes = [...source.matchAll(/authRouter\.(get|post)\('([^']+)',([^)]*?)(?:async )?\(/g)];
    assert.ok(routes.length >= 4, `found only ${routes.length} auth routes — did the file move?`);

    for (const [, method, path, middleware] of routes) {
      // A route behind requireJuror is keyed by juror everywhere downstream and
      // is not a place to guess a credential.
      if (middleware!.includes('requireJuror')) continue;
      // Static data, no credential, no database.
      if (path === '/countries') continue;

      assert.match(
        middleware!,
        /Limiter/,
        `${method.toUpperCase()} ${path} takes a credential and has no rate limiter`,
      );
    }
  });
});
