import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

process.env.DATABASE_URL = 'postgresql://bonhomie@localhost:5432/fault_test?schema=public';

const { prisma } = await import('../src/lib/prisma.js');
const { redis } = await import('../src/lib/redis.js');
const { collectWait, startWait, waitState, WAIT_MS } = await import('../src/services/waitReward.js');
const { MERIT } = await import('../src/domain/store.js');

/**
 * The slow path to a reward. What matters is not that it runs but that the
 * clock cannot be cheated and the reward cannot be taken twice.
 */
describe('waiting for a reward', () => {
  let userId: string;

  before(async () => {
    const u = await prisma.user.create({ data: { jurorName: `Wait Probe ${Date.now()}` } });
    userId = u.id;
  });

  after(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await redis.del(`wait:${userId}:merit`).catch(() => {});
    await prisma.$disconnect();
    redis.disconnect();
  });

  it('starts, and is not collectable before it finishes', async () => {
    const started = await startWait(userId, 'merit');
    assert.ok(started.readyAt !== null, 'no finish time');
    assert.equal(started.ready, false);
    assert.ok(started.readyAt! - Date.now() > WAIT_MS - 5000, 'finishes too soon');

    await assert.rejects(
      () => collectWait(userId, 'merit'),
      /not finished/,
      'collected a wait that had not finished — the clock is cheatable',
    );
  });

  it('returns the SAME finish time when started again', async () => {
    // A double tap or a reconnect must neither cost the player their progress
    // nor restart — and, more to the point, must not let them shorten it by
    // tapping repeatedly.
    const a = await waitState(userId, 'merit');
    const b = await startWait(userId, 'merit');
    assert.equal(a.readyAt, b.readyAt);
  });

  it('pays once the clock says so, and not twice', async () => {
    // Move the stored finish time into the past. The SERVER'S clock is what
    // decides, so this is the only way to make it ready — which is the point.
    await redis.set(`wait:${userId}:merit`, String(Date.now() - 1000));

    const before = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).merit;
    const merit = await collectWait(userId, 'merit');
    assert.equal(merit, before + MERIT.rewardedAd, 'wrong amount paid');

    await assert.rejects(
      () => collectWait(userId, 'merit'),
      /no wait in progress/,
      'collected the same wait twice',
    );
  });

  it('draws on the advert allowance rather than a second one', async () => {
    // The collection above spent one of the day's rewarded views. If the wait
    // had its own allowance this would still read the full cap, and the two
    // routes together would be twice the faucet the economy is balanced for.
    const state = await waitState(userId, 'merit');
    assert.equal(
      state.left,
      MERIT.rewardedAdsPerDay - 1,
      'the wait did not spend the advert allowance',
    );
  });
});
