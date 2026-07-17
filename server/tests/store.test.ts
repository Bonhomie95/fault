import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CAMPAIGN_TRIAL_CASES,
  MERIT,
  meritForStreak,
  meritForVerdict,
  SKUS,
  skuById,
} from '../src/domain/store.js';

describe('the store cannot sell an advantage', () => {
  it('grants only content or the absence of ads', () => {
    // The design rule, asserted: if a sku ever grants standing, a verdict, or
    // time on the clock, FAULT stops being a game about judgement and becomes
    // a game about spending. This test is the tripwire.
    const allowed = ['campaign', 'no_ads', 'pack_corporate', 'pack_cold_case', 'pack_political'];
    for (const sku of SKUS) {
      if (sku.grants === null) continue;
      assert.ok(allowed.includes(sku.grants), `${sku.id} grants "${sku.grants}"`);
    }
  });

  it('sells nothing that touches rank, trust, the clock or a verdict', () => {
    const forbidden = /rank|trust|standing|verdict|clock|time|xp|promotion|skip/i;
    for (const sku of SKUS) {
      assert.equal(forbidden.test(sku.id), false, `${sku.id} sounds like an advantage`);
      assert.equal(
        forbidden.test(String(sku.grants)),
        false,
        `${sku.id} grants something that sounds like an advantage`,
      );
    }
  });
});

describe('everything meaningful is earnable', () => {
  it('lets a player reach the campaign without paying', () => {
    const campaign = skuById('campaign');
    assert.ok(campaign);
    assert.ok(campaign.meritPrice !== null, 'the campaign must be earnable, or "earnable" is a lie');
  });

  it('lets a player earn every case pack', () => {
    for (const pack of SKUS.filter((s) => s.kind === 'pack')) {
      assert.ok(pack.meritPrice !== null, `${pack.id} is money-only`);
    }
  });

  it('does NOT let ad-removal be ground for', () => {
    // Watching ads to earn the removal of ads is a dark pattern wearing a
    // progression system.
    assert.equal(skuById('no_ads')?.meritPrice, null);
  });

  it('keeps the campaign a real but long road', () => {
    const campaign = skuById('campaign')!;
    const perCase = MERIT.perCase + MERIT.deliberationBonus;
    const cases = Math.ceil(campaign.meritPrice! / perCase);
    // Long enough that $4.99 is genuine convenience; short enough that the
    // free path is not a fiction told to the app store.
    assert.ok(cases > 30, `only ${cases} cases to earn the campaign — too cheap`);
    assert.ok(cases < 120, `${cases} cases to earn the campaign — that is not a path, it is a wall`);
  });
});

describe('merit is paid for service, never for being right', () => {
  it('cannot see the verdict at all', () => {
    // meritForVerdict takes no `correct` and no `verdict` — it structurally
    // cannot reward prejudging, which is what makes it safe to reward.
    const a = meritForVerdict({ wasHung: false, timeRemaining: 30, clockSeconds: 120 });
    const b = meritForVerdict({ wasHung: false, timeRemaining: 30, clockSeconds: 120 });
    assert.equal(a, b);
  });

  it('pays more for reading than for snapping', () => {
    const read = meritForVerdict({ wasHung: false, timeRemaining: 20, clockSeconds: 120 });
    const snap = meritForVerdict({ wasHung: false, timeRemaining: 118, clockSeconds: 120 });
    assert.ok(read > snap);
  });

  it('pays less when the clock decided', () => {
    const hung = meritForVerdict({ wasHung: true, timeRemaining: 0, clockSeconds: 120 });
    const decided = meritForVerdict({ wasHung: false, timeRemaining: 118, clockSeconds: 120 });
    assert.ok(hung < decided);
    assert.ok(hung >= 0, 'a bad day must never cost merit outright');
  });

  it('caps the streak so it cannot run away', () => {
    assert.equal(meritForStreak(1000), MERIT.streakCap);
    assert.ok(meritForStreak(3) < meritForStreak(6));
  });

  it('caps rewarded ads per day', () => {
    // A rewarded ad is a merit faucet. A faucet needs a tap.
    assert.ok(MERIT.rewardedAdsPerDay > 0 && MERIT.rewardedAdsPerDay <= 10);
  });
});

describe('the trial', () => {
  it('is ten cases, as the GDD says', () => {
    assert.equal(CAMPAIGN_TRIAL_CASES, 10);
  });
});
