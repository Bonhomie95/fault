import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CLOCK_GRACE_SECONDS, CLOCK_SECONDS, clockFor } from '../src/domain/clock.js';

const at = (secondsAgo: number) => new Date(Date.now() - secondsAgo * 1000);

describe('the clock is 120 seconds, everywhere', () => {
  it('is 120', () => {
    // The whole point of the constant: one number, no tiers, no per-user
    // override. If this ever needs to change it changes here and nowhere else.
    assert.equal(CLOCK_SECONDS, 120);
  });

  it('gives a case that has not been served its full window', () => {
    const c = clockFor(null);
    assert.equal(c.remaining, 120);
    assert.equal(c.expired, false);
  });
});

describe('the clock cannot be argued with', () => {
  it('counts down from when the case was served', () => {
    assert.equal(clockFor(at(0)).remaining, 120);
    assert.equal(clockFor(at(30)).remaining, 90);
    assert.equal(clockFor(at(119)).remaining, 1);
  });

  it('does not reset when the case is served again', () => {
    // The reload exploit: /api/case/next returns the pending case, and if that
    // path restamped servedAt the player could read the dossier at leisure and
    // start a fresh 120 whenever they liked.
    const servedAt = at(60);
    assert.equal(clockFor(servedAt).remaining, 60);
    assert.equal(clockFor(servedAt).remaining, 60, 'asking twice must not add time');
  });

  it('floors at zero rather than going negative', () => {
    assert.equal(clockFor(at(500)).remaining, 0);
  });

  it('expires once the window plus grace has passed', () => {
    assert.equal(clockFor(at(119)).expired, false);
    assert.equal(clockFor(at(CLOCK_SECONDS)).expired, false, 'exactly on time is on time');
    assert.equal(clockFor(at(CLOCK_SECONDS + CLOCK_GRACE_SECONDS)).expired, false);
    assert.equal(clockFor(at(CLOCK_SECONDS + CLOCK_GRACE_SECONDS + 1)).expired, true);
  });

  it('forgives the round trip', () => {
    // A juror who taps at 119.6s by their screen must not be hung by ours.
    assert.equal(clockFor(at(121)).expired, false);
    assert.ok(CLOCK_GRACE_SECONDS > 0 && CLOCK_GRACE_SECONDS < 10);
  });

  it('refuses to hand out an infinite clock on a skewed timestamp', () => {
    // servedAt in the future is impossible and therefore real: clock skew, or
    // a hand-written row. Clamping elapsed to 0 would mean the case never
    // expires — the exploit this file exists to close, arriving by accident.
    const future = new Date(Date.now() + 60_000);
    const c = clockFor(future);
    assert.equal(c.elapsed, 0);
    assert.equal(c.remaining, 120);
    assert.equal(c.expired, false, 'skew must not expire a case either');
  });
});
