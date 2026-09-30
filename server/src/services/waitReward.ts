import { DOCKET, MERIT } from '../domain/store.js';
import { redis } from '../lib/redis.js';
import { claimRewardedAd, rewardedAdsToday } from './economy.js';

/**
 * The other way to open a reward: wait for it.
 *
 * Every reward in the Clerk's Office was behind a video. That is fine for the
 * players who will watch one and a dead end for the players who will not — and
 * "will not" includes everyone whose connection is too slow to fill an advert,
 * everyone who has bought ad removal, and everyone who simply refuses. They
 * had no route to the Merit at all.
 *
 * So a reward can also be started and collected later. The advert stays the
 * fast path, which is the point: fifteen minutes is long enough that watching
 * thirty seconds of video is plainly the better trade, and short enough that
 * waiting is a real offer rather than a punishment.
 *
 * It shares the ADVERT'S DAILY CAP rather than having its own. A second
 * uncapped faucet would undo the economy the caps exist to hold, so the two
 * routes draw from one allowance and a player picks how to spend it.
 *
 * State lives in Redis with a TTL: a wait that is never collected expires
 * rather than accumulating, and losing one to a restart costs a player fifteen
 * minutes, not a purchase.
 */

export type RewardKind = 'merit' | 'case';

/** How long the slow path takes. The advert is the fast one. */
export const WAIT_MS = 15 * 60 * 1000;

const key = (userId: string, reward: RewardKind) => `wait:${userId}:${reward}`;

export interface WaitState {
  /** When this wait finishes. Null when none is running. */
  readyAt: number | null;
  /** True once it has finished and can be collected. */
  ready: boolean;
  /** How many of today's allowance are left for this reward. */
  left: number;
}

async function allowanceLeft(userId: string, reward: RewardKind): Promise<number> {
  const cap = reward === 'case' ? DOCKET.adCasesPerDay : MERIT.rewardedAdsPerDay;
  return Math.max(0, cap - (await rewardedAdsToday(userId, reward)));
}

/** What the client needs to draw the button: running, ready, or neither. */
export async function waitState(userId: string, reward: RewardKind): Promise<WaitState> {
  const raw = await redis.get(key(userId, reward)).catch(() => null);
  const readyAt = raw ? Number(raw) : null;
  return {
    readyAt,
    ready: readyAt !== null && Date.now() >= readyAt,
    left: await allowanceLeft(userId, reward),
  };
}

/**
 * Start waiting.
 *
 * Idempotent: asking again while one is already running returns the SAME
 * finish time rather than restarting it, so a double tap or a reconnect cannot
 * cost a player their progress — and, equally, cannot be used to shorten it.
 */
export async function startWait(userId: string, reward: RewardKind): Promise<WaitState> {
  if ((await allowanceLeft(userId, reward)) <= 0) {
    throw new Error('daily limit reached');
  }
  const existing = await redis.get(key(userId, reward)).catch(() => null);
  if (existing) return waitState(userId, reward);

  const readyAt = Date.now() + WAIT_MS;
  // Twice the wait, so a finished-but-uncollected reward survives a while and
  // an abandoned one clears itself.
  await redis.set(key(userId, reward), String(readyAt), 'PX', WAIT_MS * 2);
  return waitState(userId, reward);
}

/**
 * Collect a finished wait.
 *
 * The clock is the SERVER'S. The client is told when the wait ends so it can
 * draw a countdown, but the decision that it has ended is made here against
 * Date.now() — a countdown the client owns is a countdown the client can skip.
 *
 * The key is deleted before the reward is granted, so two requests racing
 * cannot both collect it; `claimRewardedAd` then refuses a duplicate viewId as
 * a second line of defence.
 */
export async function collectWait(userId: string, reward: RewardKind): Promise<number> {
  const raw = await redis.get(key(userId, reward)).catch(() => null);
  if (!raw) throw new Error('no wait in progress');

  const readyAt = Number(raw);
  if (Date.now() < readyAt) throw new Error('that wait is not finished');

  const removed = await redis.del(key(userId, reward)).catch(() => 0);
  if (removed === 0) throw new Error('that wait has already been collected');

  return claimRewardedAd(userId, `wait:${readyAt}`, reward);
}
