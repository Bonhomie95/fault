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

/**
 * One listener for the whole file, not one per request.
 *
 * `request(app)` starts a fresh ephemeral server for every single call and
 * closes it again afterwards. This file makes well over a hundred of them in
 * a couple of seconds, and superagent keeps its sockets alive — so a request
 * would occasionally be handed a pooled socket pointing at a listener that had
 * already gone, and come back as ECONNRESET / "socket hang up".
 *
 * It failed roughly one run in four, on a different test each time, which is
 * the worst possible shape: it looks like whatever you happened to change
 * last. It cost an hour here being mistaken for a Prisma upgrade regression.
 * Binding once removes the race entirely and makes the suite faster.
 */
const server = app.listen(0);
server.unref();   // never the reason the test process stays alive
const api = () => request(server);

/** A signed-in juror, from nothing. */
async function swearIn(token: string, country = 'NO') {
  const res = await api()
    .post('/api/auth/sign-in')
    .send({ provider: 'device', token, jurorName: 'Test Juror', country, timezone: 'Europe/Oslo' });

  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body as { userId: string; accessToken: string; refreshToken: string };
}

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

/**
 * Clean up only THIS file's jurors.
 *
 * It used to be `deleteMany({})` — every user in the test database. Node runs
 * test files concurrently, so that reached into whatever else happened to be
 * running and deleted its fixtures mid-assertion. It surfaced once as a
 * refresh-token test failing in the full suite and passing three times in a
 * row alone, which is the most expensive kind of failure to chase.
 *
 * Every juror this file creates signs in with a device token prefixed
 * `routes-`, so that prefix is the scope. A test file should own its data and
 * nothing else's.
 */
const OWNED = { identities: { some: { subject: { startsWith: 'routes-' } } } };

before(async () => {
  await prisma.user.deleteMany({ where: OWNED });
});

after(async () => {
  server.close();
  await prisma.user.deleteMany({ where: OWNED });
  await prisma.$disconnect();
  redis.disconnect();
});

describe('two requests for the same next case', () => {
  it('serves one case to both, never a 500 and never two open cases', async () => {
    // `caseNumber` is read with an aggregate and written by a separate insert.
    // Two overlapping /next calls therefore compute the same number and the
    // second one used to hit @@unique([userId, caseNumber]) and come back as a
    // 500 with a Prisma stack in it. That is in the server log from an
    // ordinary session — and the client's answer to a failed /next is to ask
    // again, which collides again.
    const { accessToken, userId } = await swearIn('routes-race');

    const [a, b] = await Promise.all([
      api().get('/api/case/next').set(auth(accessToken)),
      api().get('/api/case/next').set(auth(accessToken)),
    ]);

    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.equal(b.status, 200, JSON.stringify(b.body));

    // Both callers hold the same case. Anything else means the juror is now
    // sitting two trials at once, and every other query in the route assumes
    // they are sitting one.
    assert.equal(a.body.id, b.body.id, 'the race produced two different cases');

    const open = await prisma.case.count({
      where: { userId, verdict: { is: null }, quarantinedAt: null },
    });
    assert.equal(open, 1, `juror has ${open} open cases`);
  });
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

  it('answers a second verdict with the first one, and changes nothing', async () => {
    /**
     * Submitting a verdict has to be safe to retry, because on a phone it WILL
     * be retried — the request succeeds, the response is lost to a dropped
     * connection or a backgrounded app, and the client asks again.
     *
     * This used to answer 409. The client treats that as a failure, so the
     * case was decided, the clock was dead, every retry failed the same way,
     * and the player was stuck on a screen with no way forward. It was
     * reproduced by playing one case.
     *
     * What must NOT happen is the second call taking effect: no second record,
     * no second helping of merit, and the verdict that stands is the first
     * one — note the retry below deliberately sends the OPPOSITE verdict.
     */
    const { accessToken, userId } = await swearIn('routes-double');
    const c = await api().get('/api/case/next').set(auth(accessToken));

    const first = await api()
      .post('/api/verdict')
      .set(auth(accessToken))
      .send({ caseId: c.body.id, verdict: 'guilty' });
    assert.equal(first.status, 200);

    const meritAfterFirst = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { merit: true, xp: true },
    });

    const second = await api()
      .post('/api/verdict')
      .set(auth(accessToken))
      .send({ caseId: c.body.id, verdict: 'not_guilty' });

    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.equal(second.body.verdict, 'guilty', 'the retry overwrote the verdict');
    assert.equal(second.body.replayed, true);
    // An advert belongs to a verdict that just happened, not to a retry.
    assert.equal(second.body.showInterstitial, false);

    const records = await prisma.verdictRecord.count({ where: { caseId: c.body.id } });
    assert.equal(records, 1, 'the retry created a second verdict record');

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { merit: true, xp: true },
    });
    assert.equal(after.merit, meritAfterFirst.merit, 'the retry paid merit twice');
    assert.equal(after.xp, meritAfterFirst.xp, 'the retry awarded xp twice');
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

describe('the daily docket', () => {
  it('closes after the free docket, and a rewarded view or the unlock reopens it', async () => {
    const { DOCKET } = await import('../src/domain/store.js');
    const { claimRewardedAd } = await import('../src/services/economy.js');
    const { accessToken, userId } = await swearIn('routes-gate');

    for (let i = 0; i < DOCKET.freePerDay; i++) {
      const c = await api().get('/api/case/next').set(auth(accessToken));
      assert.equal(c.status, 200, `case ${i + 1} refused early`);
      await api()
        .post('/api/verdict')
        .set(auth(accessToken))
        .send({ caseId: c.body.id, verdict: 'guilty' });
    }

    const gated = await api().get('/api/case/next').set(auth(accessToken));
    assert.equal(gated.status, 402);
    assert.equal(gated.body.error, 'docket_closed');
    assert.equal(gated.body.docket.left, 0);

    // One rewarded view (Google's callback, in production) opens one case.
    await claimRewardedAd(userId, 'admob:test-view-0001', 'case');
    const extra = await api().get('/api/case/next').set(auth(accessToken));
    assert.equal(extra.status, 200);
    await api().post('/api/verdict').set(auth(accessToken)).send({ caseId: extra.body.id, verdict: 'guilty' });
    assert.equal((await api().get('/api/case/next').set(auth(accessToken))).status, 402);

    // Granted the way a receipt would grant it — never by the client asking.
    await prisma.userEntitlement.create({
      data: { userId, entitlement: 'campaign', source: 'grant' },
    });
    assert.equal((await api().get('/api/case/next').set(auth(accessToken))).status, 200);
  });

  it('opens with a live pass, and closes again when it lapses', async () => {
    const { hasEntitlement } = await import('../src/services/economy.js');
    const { userId } = await swearIn('routes-pass');
    await prisma.userEntitlement.create({
      data: { userId, entitlement: 'pass', source: 'store', expiresAt: new Date(Date.now() + 86_400_000) },
    });
    assert.equal(await hasEntitlement(userId, 'campaign'), true, 'the pass includes the unlimited docket');
    assert.equal(await hasEntitlement(userId, 'room_night'), true);

    await prisma.userEntitlement.updateMany({
      where: { userId, entitlement: 'pass' },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    assert.equal(await hasEntitlement(userId, 'campaign'), false, 'a lapsed pass still unlocks');
    assert.equal(await hasEntitlement(userId, 'pass'), false);
  });

  it('never re-delivers a consumable on restore', async () => {
    const { redeemPurchase } = await import('../src/services/economy.js');
    const { skuById } = await import('../src/domain/store.js');
    const { userId } = await swearIn('routes-consumable');
    const sku = skuById('merit_small')!;
    const first = await redeemPurchase({ userId, sku, transactionId: 'txn-merit-01', platform: 'android' });
    const again = await redeemPurchase({ userId, sku, transactionId: 'txn-merit-01', platform: 'android' });
    assert.equal(first.meritBalance, again.meritBalance, 'restore printed Merit');
  });
});

describe('the Daily Trial', () => {
  it('is free, is served once, and reports how the world split', async () => {
    const { accessToken } = await swearIn('routes-daily');
    const status = await api().get('/api/case/daily/status').set(auth(accessToken));
    assert.equal(status.status, 200);
    assert.equal(status.body.sat, false);

    const c = await api().get('/api/case/daily').set(auth(accessToken));
    assert.equal(c.status, 200);
    assert.equal(c.body.daily, status.body.day);
    assert.doesNotMatch(JSON.stringify(c.body), /\{[A-Z0-9_]+\}/, 'a slot reached the player');

    // It is not a day's docket case.
    const standing = await api().get('/api/standing').set(auth(accessToken));
    assert.equal(standing.body.docket.usedToday, 0);

    const v = await api().post('/api/verdict').set(auth(accessToken)).send({ caseId: c.body.id, verdict: 'guilty' });
    assert.equal(v.status, 200);
    assert.ok(v.body.daily.tally.total >= 1);
    assert.ok(v.body.daily.tally.guilty >= 1);

    const again = await api().get('/api/case/daily').set(auth(accessToken));
    assert.equal(again.status, 409);
    assert.equal(again.body.error, 'daily_done');
  });
});

describe('streak shields', () => {
  it('cover a missed day, and only a whole gap', async () => {
    const { recordDocketDay } = await import('../src/services/missions.js');
    const { dayKey } = await import('../src/services/missions.js');
    const { userId } = await swearIn('routes-shield');
    const twoDaysAgo = dayKey('UTC', new Date(Date.now() - 2 * 86_400_000));
    await prisma.user.update({
      where: { id: userId },
      data: { timezone: 'UTC', lastDocketDay: twoDaysAgo, currentStreak: 9, streakShields: 1 },
    });
    const kept = await recordDocketDay(userId);
    assert.equal(kept.streak, 10);
    assert.equal(kept.shieldsUsed, 1);

    const fourDaysAgo = dayKey('UTC', new Date(Date.now() - 4 * 86_400_000));
    await prisma.user.update({
      where: { id: userId },
      data: { lastDocketDay: fourDaysAgo, currentStreak: 9, streakShields: 2 },
    });
    const broken = await recordDocketDay(userId);
    assert.equal(broken.streak, 1, 'two shields cannot cover three missed days');
    assert.equal(broken.shieldsUsed, 0);
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

describe('the name on the public registry', () => {
  it('refuses a name that could impersonate the court', async () => {
    const res = await api()
      .post('/api/auth/sign-in')
      .send({ provider: 'device', token: 'routes-impersonator', jurorName: 'FAULT Admin', country: 'NO' });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'juror_name_rejected');
    assert.equal(res.body.reason, 'reserved');
  });

  it('refuses the markup payload that used to create a real account', async () => {
    const res = await api()
      .post('/api/auth/sign-in')
      .send({
        provider: 'device',
        token: 'routes-xss',
        jurorName: '<img src=x onerror=alert(1)>',
        country: 'NO',
      });

    assert.equal(res.status, 400, 'a script tag became a juror name before this check existed');
    assert.equal(res.body.error, 'juror_name_rejected');
  });

  it('stores the normalised name, never the raw input', async () => {
    const res = await api()
      .post('/api/auth/sign-in')
      .send({ provider: 'device', token: 'routes-padded', jurorName: '   Ada   Lovelace   ', country: 'NO' });

    assert.equal(res.status, 201);
    assert.equal(res.body.jurorName, 'Ada Lovelace');
  });

  it('lets a juror be renamed, which is the only remedy short of deletion', async () => {
    // Guideline 1.2 asks for the ability to ACT on a report. Before this, the
    // only lever an operator had against an abusive name was deleting the
    // account and the whole career with it.
    const { accessToken } = await swearIn('routes-rename');

    const res = await api()
      .patch('/api/session/me/name')
      .set(auth(accessToken))
      .send({ jurorName: 'Renamed Juror' });

    assert.equal(res.status, 200);
    assert.equal(res.body.jurorName, 'Renamed Juror');
    assert.equal(res.body.changed, true);

    const me = await api().get('/api/session/me').set(auth(accessToken));
    assert.equal(me.body.jurorName, 'Renamed Juror');
  });

  it('applies the same filter on rename as on sign-up', async () => {
    const { accessToken } = await swearIn('routes-rename-bad');
    const res = await api()
      .patch('/api/session/me/name')
      .set(auth(accessToken))
      .send({ jurorName: 'Moderator' });

    assert.equal(res.status, 400);
    assert.equal(res.body.reason, 'reserved');
  });

  it('holds the rename cooldown, so a reported name cannot simply move', async () => {
    const { accessToken } = await swearIn('routes-rename-twice');
    const first = await api()
      .patch('/api/session/me/name')
      .set(auth(accessToken))
      .send({ jurorName: 'First Name' });
    assert.equal(first.status, 200);

    const second = await api()
      .patch('/api/session/me/name')
      .set(auth(accessToken))
      .send({ jurorName: 'Second Name' });
    assert.equal(second.status, 429);
    assert.equal(second.body.error, 'rename_too_soon');
  });
});

describe('reporting', () => {
  it('takes a report and withholds the case immediately', async () => {
    // The generated docket writes criminal accusations about invented people
    // in named real jurisdictions, unreviewed. Quarantine-then-review is the
    // only safe order: a case reported for naming a real person must stop
    // being served while it waits for a human.
    const { accessToken, userId } = await swearIn('routes-reporter');
    const c = await api().get('/api/case/next').set(auth(accessToken));
    assert.equal(c.status, 200);

    const res = await api()
      .post('/api/report')
      .set(auth(accessToken))
      .send({ kind: 'case', subjectId: c.body.id, reason: 'real_person' });

    assert.equal(res.status, 201);
    assert.equal(res.body.reported, true);

    const row = await prisma.case.findUnique({ where: { id: c.body.id } });
    assert.ok(row?.quarantinedAt, 'a reported case must leave the docket at once');

    // And it is genuinely gone from the docket: the next request must not hand
    // back the case they just reported.
    const next = await api().get('/api/case/next').set(auth(accessToken));
    assert.notEqual(next.body.id, c.body.id);

    const reports = await prisma.contentReport.findMany({ where: { reporterId: userId } });
    assert.equal(reports.length, 1);
    assert.equal(reports[0]?.reason, 'real_person');
  });

  it('does not collide the docket numbering when a case is withdrawn', async () => {
    // The bug this catches: caseNumber used to be `verdictsHeard + 1`. A
    // quarantined case is never judged, so the count does not move, and the
    // next case was handed a number that was already taken — turning a
    // player's report into a 500 on their very next request, via the
    // (userId, caseNumber) unique constraint.
    const { accessToken, userId } = await swearIn('routes-report-numbering');

    const first = await api().get('/api/case/next').set(auth(accessToken));
    assert.equal(first.status, 200);

    await api()
      .post('/api/report')
      .set(auth(accessToken))
      .send({ kind: 'case', subjectId: first.body.id, reason: 'real_person' });

    // Two more, so the numbering has to survive more than one gap.
    const second = await api().get('/api/case/next').set(auth(accessToken));
    assert.equal(second.status, 200, JSON.stringify(second.body));

    await api()
      .post('/api/report')
      .set(auth(accessToken))
      .send({ kind: 'case', subjectId: second.body.id, reason: 'broken_case' });

    const third = await api().get('/api/case/next').set(auth(accessToken));
    assert.equal(third.status, 200, JSON.stringify(third.body));

    const numbers = (
      await prisma.case.findMany({ where: { userId }, select: { caseNumber: true } })
    ).map((c) => c.caseNumber);

    assert.equal(new Set(numbers).size, numbers.length, `docket numbers collided: ${numbers}`);
  });

  it('refuses a report about a case that is not this juror\'s', async () => {
    const mine = await swearIn('routes-report-mine');
    const theirs = await swearIn('routes-report-theirs');
    const c = await api().get('/api/case/next').set(auth(theirs.accessToken));

    const res = await api()
      .post('/api/report')
      .set(auth(mine.accessToken))
      .send({ kind: 'case', subjectId: c.body.id, reason: 'harmful_content' });

    assert.equal(res.status, 404);
  });

  it('needs a reason it recognises', async () => {
    const { accessToken } = await swearIn('routes-report-bad');
    const res = await api()
      .post('/api/report')
      .set(auth(accessToken))
      .send({ kind: 'case', subjectId: 'whatever', reason: 'because-i-said-so' });

    assert.equal(res.status, 400);
  });
});

describe('a receipt belongs to one account', () => {
  it('refuses a transaction already redeemed by another juror', async () => {
    // Verified receipt, wrong owner. The old code returned 200 with
    // `granted: <sku>` and granted nothing — indistinguishable, from the
    // buyer's side, from paying and receiving nothing.
    const first = await swearIn('routes-receipt-owner');
    const second = await swearIn('routes-receipt-thief');

    await prisma.purchase.create({
      data: {
        userId: first.userId,
        sku: 'campaign',
        source: 'store',
        transactionId: 'txn-shared-000001',
        platform: 'ios',
        amountMinor: 499,
      },
    });

    const { redeemPurchase, ReceiptOwnedByAnotherAccount } = await import(
      '../src/services/economy.js'
    );
    const { skuById } = await import('../src/domain/store.js');

    await assert.rejects(
      () =>
        redeemPurchase({
          userId: second.userId,
          sku: skuById('campaign')!,
          transactionId: 'txn-shared-000001',
          platform: 'ios',
        }),
      ReceiptOwnedByAnotherAccount,
    );

    // And the thief got nothing.
    const owned = await prisma.userEntitlement.findMany({ where: { userId: second.userId } });
    assert.equal(owned.length, 0);
  });

  it('is idempotent for the juror who actually bought it', async () => {
    // The restore path, and it must re-grant rather than merely report success:
    // "already recorded" and "already granted" are different facts, and a
    // half-finished first attempt is exactly when someone taps restore.
    const { userId } = await swearIn('routes-receipt-restore');
    const { redeemPurchase } = await import('../src/services/economy.js');
    const { skuById } = await import('../src/domain/store.js');
    const sku = skuById('campaign')!;

    await redeemPurchase({ userId, sku, transactionId: 'txn-restore-01', platform: 'ios' });
    await prisma.userEntitlement.deleteMany({ where: { userId } }); // simulate a half-finished grant

    const again = await redeemPurchase({
      userId,
      sku,
      transactionId: 'txn-restore-01',
      platform: 'ios',
    });

    assert.equal(again.granted, 'campaign');
    const owned = await prisma.userEntitlement.findMany({ where: { userId } });
    assert.equal(owned.length, 1, 'restore must re-grant, not just report success');
  });
});

describe('a mission pays once', () => {
  it('does not pay twice when two claims arrive together', async () => {
    // Read-then-write: both requests saw claimed:false and both paid. The fix
    // is the conditional update that tokens.rotateRefresh already used.
    const { userId } = await swearIn('routes-mission-race');
    const { claimMission } = await import('../src/services/missions.js');

    await prisma.missionProgress.create({
      data: {
        userId,
        key: 'daily_hear_three',
        kind: 'daily',
        period: '2999-01-01',
        progress: 3,
        target: 3,
      },
    });

    // Same period the service will compute for this user's timezone.
    const { dayKey } = await import('../src/services/missions.js');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await prisma.missionProgress.updateMany({
      where: { userId, key: 'daily_hear_three' },
      data: { period: dayKey(user.timezone) },
    });

    const [a, b] = await Promise.all([
      claimMission(userId, 'daily_hear_three'),
      claimMission(userId, 'daily_hear_three'),
    ]);

    assert.equal([a, b].filter((x) => x > 0).length, 1, `both claims paid: ${a} and ${b}`);
  });
});

describe('xp is not lost to a race', () => {
  it('composes concurrent awards instead of overwriting them', async () => {
    // Read, add, write — two awards landing together both read the same
    // starting value and the second silently erased the first.
    const { userId } = await swearIn('routes-xp-race');
    const { awardXp } = await import('../src/services/progression.js');

    const before = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).xp;
    await Promise.all([awardXp(userId, 10), awardXp(userId, 10), awardXp(userId, 10)]);
    const after = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).xp;

    assert.equal(after - before, 30, 'an award was lost');
  });
});

describe('the archive is paged', () => {
  it('does not return an entire career in one response', async () => {
    const { accessToken, userId } = await swearIn('routes-history');

    // Rank 2 opens the archive; grant it directly rather than playing 30 cases.
    await prisma.user.update({ where: { id: userId }, data: { xp: 200, rank: 2 } });

    const res = await api().get('/api/review/history?limit=5').set(auth(accessToken));
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.entries));
    assert.ok(res.body.entries.length <= 5);
    // The cursor is present in the contract whether or not there is a page 2.
    assert.ok('nextCursor' in res.body);
  });
});

describe('trust settles exactly once', () => {
  it('does not double-apply when two review breaks land together', async () => {
    // The interleaving this guards: settle B reads the pending verdicts BEFORE
    // settle A marks them applied, but reads the user's trust AFTER A has
    // already lowered it — then applies the same deltas a second time on top.
    // Trust gates the promotion ladder, so a doubled run of wrongful
    // convictions is a career, not a rounding error.
    const { userId } = await swearIn('routes-settle-race');
    const { settleTrust } = await import('../src/services/progression.js');

    const start = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).trust;

    // Three unsettled verdicts worth -5 each. Cases first: VerdictRecord
    // requires one, and caseId is unique.
    for (let i = 1; i <= 3; i++) {
      const c = await prisma.case.create({
        data: {
          userId,
          caseNumber: 900 + i,
          title: `Settle ${i}`,
          charge: 'test',
          accent: '#fff',
          mood: 'test',
          defendantName: `Settle Person ${i}`,
          defendantAge: 40,
          defendantOccupation: 'tester',
          defendantBackground: 'x',
          evidence: [],
          witnesses: [],
          prosecutionArgument: 'x',
          defenceArgument: 'x',
          correctVerdict: 'guilty',
        },
      });
      await prisma.verdictRecord.create({
        data: { userId, caseId: c.id, verdict: 'guilty', timeRemaining: 60, trustDelta: -5 },
      });
    }

    const [a, b] = await Promise.all([settleTrust(userId), settleTrust(userId)]);

    // Exactly three verdicts settled in total, across both calls.
    assert.equal(a.applied + b.applied, 3, `settled ${a.applied} + ${b.applied} of 3`);

    const after = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).trust;
    assert.equal(after, Math.max(0, start - 15), `trust moved to ${after}, expected ${start - 15}`);

    // And nothing is left unsettled.
    const left = await prisma.verdictRecord.count({ where: { userId, trustApplied: false } });
    assert.equal(left, 0);
  });

  it('clamps at the floor rather than going negative', async () => {
    const { userId } = await swearIn('routes-settle-floor');
    const { settleTrust } = await import('../src/services/progression.js');

    const c = await prisma.case.create({
      data: {
        userId, caseNumber: 950, title: 'Floor', charge: 'test', accent: '#fff', mood: 'test',
        defendantName: 'Floor Person', defendantAge: 40, defendantOccupation: 'tester',
        defendantBackground: 'x', evidence: [], witnesses: [],
        prosecutionArgument: 'x', defenceArgument: 'x', correctVerdict: 'guilty',
      },
    });
    await prisma.verdictRecord.create({
      data: { userId, caseId: c.id, verdict: 'guilty', timeRemaining: 60, trustDelta: -500 },
    });

    const settled = await settleTrust(userId);
    assert.equal(settled.trust, 0, 'trust went below the floor');
  });

  it('is a no-op with nothing pending, and reports the real trust', async () => {
    const { userId } = await swearIn('routes-settle-empty');
    const { settleTrust } = await import('../src/services/progression.js');

    const current = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).trust;
    const settled = await settleTrust(userId);

    assert.equal(settled.applied, 0);
    assert.equal(settled.delta, 0);
    assert.equal(settled.trust, current);
  });
});

describe('xp awards are exact', () => {
  it('refuses a negative amount rather than silently clamping', async () => {
    // Every caller floors at zero already, so a negative is a caller bug —
    // and the old handling needed a second absolute write to clamp it, which
    // reintroduced the lost update this function exists to avoid.
    const { userId } = await swearIn('routes-xp-negative');
    const { awardXp } = await import('../src/services/progression.js');
    await assert.rejects(() => awardXp(userId, -50), /non-negative/);
  });

  it('reports promotion for exactly one of two awards that cross together', async () => {
    // Rank 2 is 120 xp. Two 70-point awards land together: their sum crosses
    // the boundary once, so exactly one caller may claim the promotion.
    const { userId } = await swearIn('routes-xp-promote');
    const { awardXp } = await import('../src/services/progression.js');
    await prisma.user.update({ where: { id: userId }, data: { xp: 0, rank: 1 } });

    const [a, b] = await Promise.all([awardXp(userId, 70), awardXp(userId, 70)]);
    const promoted = [a, b].filter((r) => r.promoted).length;

    assert.equal(promoted, 1, `${promoted} callers claimed the same promotion`);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    assert.equal(user.xp, 140, 'an award was lost');
    assert.equal(user.rank, 2, 'the stored rank did not follow the xp');
  });
});
