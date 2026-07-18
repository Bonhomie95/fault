import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';

/**
 * The routes.
 *
 * Every exploit fixed in this codebase was verified once, by hand, against a
 * running server — which means none of it was verified twice, and none of it
 * survives a refactor. These are the tests that make the security work
 * durable: the free unlock, the client-owned clock, the legacy auth door and
 * the bearer header are all closed here, permanently, by something that runs.
 *
 * Runs against fault_test with no Groq keys: cases come from the offline
 * docket, so nothing here spends tokens or depends on a model's mood.
 */

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://bonhomie@localhost:5432/fault_test?schema=public';
process.env.REDIS_URL = 'redis://localhost:6379/1';
process.env.JWT_SECRET = 'test-secret-that-is-comfortably-long-enough-for-hs256-signing';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.GROQ_API_KEY = '';
process.env.GROQ_API_KEYS = '';
// The pool also reads GROQ_API_KEY_1..N straight off process.env, and dotenv
// will happily fill those from a real .env. Clear them explicitly or the suite
// spends live tokens — which is exactly what happened the first time this ran.
for (const k of Object.keys(process.env)) if (/^GROQ_API_KEY_\d+$/.test(k)) delete process.env[k];
process.env.DISABLE_RATE_LIMITS = 'true';

const { app } = await import('../src/app.js');
const { prisma } = await import('../src/lib/prisma.js');
const { redis } = await import('../src/lib/redis.js');

const api = () => request(app);

/** A signed-in juror, from nothing. */
async function swearIn(token: string, country = 'NO') {
  const res = await api()
    .post('/api/auth/sign-in')
    .send({ provider: 'device', token, jurorName: 'Test Juror', country, timezone: 'Europe/Oslo' });

  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body as { userId: string; accessToken: string; refreshToken: string };
}

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

before(async () => {
  await prisma.user.deleteMany({});
});

after(async () => {
  await prisma.user.deleteMany({});
  await prisma.$disconnect();
  redis.disconnect();
});

describe('the door', () => {
  it('has no unauthenticated way to create a juror', async () => {
    // POST /api/session predated OAuth and minted a playable juror from a name
    // alone, which made every token check bypassable by calling the endpoint
    // next to it.
    const res = await api().post('/api/session').send({ jurorName: 'Hacker' });
    assert.equal(res.status, 404);
  });

  it('refuses the old permanent bearer header outright', async () => {
    const { userId } = await swearIn('routes-old-header');
    const res = await api().get('/api/standing').set('x-juror-id', userId);
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'unsupported_auth');
  });

  it('refuses a request with no token', async () => {
    assert.equal((await api().get('/api/standing')).status, 401);
  });

  it('refuses a forged token', async () => {
    const res = await api()
      .get('/api/standing')
      .set(auth('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJoYWNrZXIifQ.not-a-real-signature'));
    assert.equal(res.status, 401);
  });

  it('lets a real juror through', async () => {
    const { accessToken } = await swearIn('routes-happy');
    const res = await api().get('/api/standing').set(auth(accessToken));
    assert.equal(res.status, 200);
    assert.equal(res.body.rankTitle, 'Empanelled');
  });
});

describe('tokens', () => {
  it('rotates a refresh token and rejects the old one', async () => {
    const { refreshToken } = await swearIn('routes-refresh');

    const first = await api().post('/api/auth/refresh').send({ refreshToken });
    assert.equal(first.status, 200);
    assert.ok(first.body.accessToken);

    // Rotation means the spent token is dead. If a stolen one is replayed, the
    // real player's next refresh fails loudly — which is the outcome we want.
    const replay = await api().post('/api/auth/refresh').send({ refreshToken });
    assert.equal(replay.status, 401);
  });

  it('treats a replayed refresh token as theft and kills the whole family', async () => {
    const { refreshToken } = await swearIn('routes-reuse');

    // Normal rotation. The player now holds `second`.
    const first = await api().post('/api/auth/refresh').send({ refreshToken });
    assert.equal(first.status, 200);
    const second = first.body.refreshToken as string;

    // Someone replays the token that was already spent. Rotation alone would
    // just fail this one request and let the holder of `second` carry on — so
    // a thief who rotated first would keep the account.
    const replay = await api().post('/api/auth/refresh').send({ refreshToken });
    assert.equal(replay.status, 401);

    // The point of the fix: the currently-valid token is dead too. Both
    // parties are logged out and must sign in with a provider again, which an
    // attacker cannot do.
    const after = await api().post('/api/auth/refresh').send({ refreshToken: second });
    assert.equal(after.status, 401, 'reuse must revoke every session, not just the replayed one');
  });

  it('kills every token when the juror signs out', async () => {
    const { accessToken, refreshToken } = await swearIn('routes-signout');
    assert.equal((await api().post('/api/auth/sign-out').set(auth(accessToken))).status, 200);
    assert.equal((await api().post('/api/auth/refresh').send({ refreshToken })).status, 401);
  });
});

describe('the paid game is paid', () => {
  it('gives a new juror nothing', async () => {
    const { accessToken } = await swearIn('routes-entitle');
    const res = await api().get('/api/session/me').set(auth(accessToken));
    assert.deepEqual(res.body.entitlements, []);
    assert.equal(res.body.merit, 0);
  });

  it('has no endpoint that grants an entitlement on request', async () => {
    // The original hole: PATCH /api/session/me accepted { trialUnlocked: true }
    // and handed over $4.99 of campaign to anyone with curl.
    const { accessToken } = await swearIn('routes-free-unlock');
    const res = await api()
      .patch('/api/session/me')
      .set(auth(accessToken))
      .send({ trialUnlocked: true, entitlements: ['campaign'], merit: 999999 });
    assert.equal(res.status, 404);

    const after = await api().get('/api/session/me').set(auth(accessToken));
    assert.deepEqual(after.body.entitlements, []);
    assert.equal(after.body.merit, 0);
  });

  it('refuses to redeem a receipt it cannot verify', async () => {
    const { accessToken } = await swearIn('routes-receipt');
    const res = await api()
      .post('/api/store/redeem')
      .set(auth(accessToken))
      .send({
        sku: 'campaign',
        transactionId: `made-up-${Date.now()}`,
        platform: 'ios',
        receipt: 'obviously-not-a-real-receipt',
      });
    // Dev mode still refuses anything Apple/Google would not sign off.
    assert.notEqual(res.status, 200);
  });

  it('will not sell what cannot be afforded', async () => {
    const { accessToken } = await swearIn('routes-broke');
    const res = await api().post('/api/store/buy').set(auth(accessToken)).send({ sku: 'campaign' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'insufficient merit');
  });

  it('prices everything itself', async () => {
    const { accessToken } = await swearIn('routes-prices');
    const res = await api().get('/api/store').set(auth(accessToken));
    const campaign = res.body.items.find((i: { id: string }) => i.id === 'campaign');
    assert.equal(campaign.priceMinor, 499);
    assert.equal(campaign.meritPrice, 6000);
  });
});

describe('the clock belongs to the server', () => {
  it('serves a case with the full window and a real deadline', async () => {
    const { accessToken } = await swearIn('routes-clock');
    const res = await api().get('/api/case/next').set(auth(accessToken));
    assert.equal(res.status, 200);
    assert.equal(res.body.clockSeconds, 120);
  });

  it('does not restart the clock when the same case is fetched again', async () => {
    // The reload exploit: re-requesting a pending case used to hand back a
    // fresh 120 seconds with the dossier already read.
    const { accessToken, userId } = await swearIn('routes-reload');
    await api().get('/api/case/next').set(auth(accessToken));

    // Rewind the serve by a minute rather than sleeping for one. UTC, because
    // the column has no timezone and Prisma reads it as UTC.
    await prisma.$executeRawUnsafe(
      `UPDATE cases SET "servedAt" = (now() at time zone 'utc') - interval '60 seconds' WHERE "userId" = $1`,
      userId,
    );

    const again = await api().get('/api/case/next').set(auth(accessToken));
    assert.ok(again.body.clockSeconds <= 61, `got ${again.body.clockSeconds}s back`);
    assert.ok(again.body.clockSeconds >= 55);
  });

  it('ignores a client that claims a full clock', async () => {
    const { accessToken, userId } = await swearIn('routes-liar');
    const c = await api().get('/api/case/next').set(auth(accessToken));

    await prisma.$executeRawUnsafe(
      `UPDATE cases SET "servedAt" = (now() at time zone 'utc') - interval '40 seconds' WHERE id = $1`,
      c.body.id,
    );

    const res = await api()
      .post('/api/verdict')
      .set(auth(accessToken))
      // The old fields, sent anyway. They must be ignored, not believed.
      .send({ caseId: c.body.id, verdict: 'guilty', timeRemaining: 119, wasHung: false });

    assert.equal(res.status, 200);
    assert.ok(res.body.timeRemaining <= 81, `server believed the client: ${res.body.timeRemaining}`);
  });

  it('treats a late verdict as hung, whatever the player tapped', async () => {
    const { accessToken } = await swearIn('routes-late');
    const c = await api().get('/api/case/next').set(auth(accessToken));

    await prisma.$executeRawUnsafe(
      `UPDATE cases SET "servedAt" = (now() at time zone 'utc') - interval '400 seconds' WHERE id = $1`,
      c.body.id,
    );

    const res = await api()
      .post('/api/verdict')
      .set(auth(accessToken))
      .send({ caseId: c.body.id, verdict: 'not_guilty' });

    assert.equal(res.body.wasHung, true);
    assert.equal(res.body.timeRemaining, 0);
  });

  it('refuses a second verdict on the same case', async () => {
    const { accessToken } = await swearIn('routes-double');
    const c = await api().get('/api/case/next').set(auth(accessToken));

    const first = await api()
      .post('/api/verdict')
      .set(auth(accessToken))
      .send({ caseId: c.body.id, verdict: 'guilty' });
    assert.equal(first.status, 200);

    const second = await api()
      .post('/api/verdict')
      .set(auth(accessToken))
      .send({ caseId: c.body.id, verdict: 'not_guilty' });
    assert.equal(second.status, 409);
  });

  it('will not let a juror deliver a verdict on another juror\'s case', async () => {
    const a = await swearIn('routes-owner-a');
    const b = await swearIn('routes-owner-b');
    const c = await api().get('/api/case/next').set(auth(a.accessToken));

    const res = await api()
      .post('/api/verdict')
      .set(auth(b.accessToken))
      .send({ caseId: c.body.id, verdict: 'guilty' });
    assert.equal(res.status, 404);
  });
});

describe('the client is never told the answer', () => {
  it('strips the verdict, the lies and the tells from every case', async () => {
    const { accessToken } = await swearIn('routes-secrets');
    const res = await api().get('/api/case/next').set(auth(accessToken));
    const blob = JSON.stringify(res.body);

    for (const secret of ['correct_verdict', 'evidence_strength', 'is_planted', 'lie_tell', '"lie"', 'wealth']) {
      assert.equal(blob.includes(secret), false, `leaked ${secret}`);
    }
  });
});

describe('the trial gate', () => {
  it('closes after ten cases and opens with the entitlement', async () => {
    const { accessToken, userId } = await swearIn('routes-gate');

    for (let i = 0; i < 10; i++) {
      const c = await api().get('/api/case/next').set(auth(accessToken));
      assert.equal(c.status, 200, `case ${i + 1} refused early`);
      await api()
        .post('/api/verdict')
        .set(auth(accessToken))
        .send({ caseId: c.body.id, verdict: 'guilty' });
    }

    const gated = await api().get('/api/case/next').set(auth(accessToken));
    assert.equal(gated.status, 402);
    assert.equal(gated.body.error, 'trial_complete');

    // Granted the way a receipt would grant it — never by the client asking.
    await prisma.userEntitlement.create({
      data: { userId, entitlement: 'campaign', source: 'grant' },
    });

    assert.equal((await api().get('/api/case/next').set(auth(accessToken))).status, 200);
  });
});

describe('account deletion', () => {
  it('erases the career and kills the tokens', async () => {
    const { accessToken, userId } = await swearIn('routes-delete');
    const c = await api().get('/api/case/next').set(auth(accessToken));
    await api().post('/api/verdict').set(auth(accessToken)).send({ caseId: c.body.id, verdict: 'guilty' });

    const res = await api().delete('/api/session/me').set(auth(accessToken));
    assert.equal(res.status, 200);

    // Apple requires the account to be gone, not hidden.
    assert.equal(await prisma.user.count({ where: { id: userId } }), 0);
    assert.equal(await prisma.case.count({ where: { userId } }), 0, 'cases survived the cascade');
    assert.equal(await prisma.verdictRecord.count({ where: { userId } }), 0);

    // A token for a juror who no longer exists must not work.
    assert.equal((await api().get('/api/standing').set(auth(accessToken))).status, 401);
  });
});

describe('health', () => {
  it('reports what is actually up', async () => {
    const res = await api().get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.postgres, true);
    // No keys configured in tests, so generation is honestly off.
    assert.equal(res.body.groq, false);
  });
});
