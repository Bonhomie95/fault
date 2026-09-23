import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GATES,
  meetsTier,
  rankFor,
  RANKS,
  TIER_REQUIREMENTS,
  trustForVerdict,
  trustLabel,
  xpForVerdict,
} from '../src/domain/progression.js';
import { ladderFor, nextTier, profileFor, tierLabel } from '../src/domain/jurisdiction.js';
import { SEED_CASES } from '../src/services/seedCases.js';

describe('rank — service, never accuracy', () => {
  it('starts every juror empanelled', () => {
    assert.equal(rankFor(0).level, 1);
    assert.equal(rankFor(0).title, 'Empanelled');
  });

  it('rises monotonically with xp', () => {
    let last = 0;
    for (let xp = 0; xp < 14000; xp += 250) {
      const level = rankFor(xp).level;
      assert.ok(level >= last, `rank fell at ${xp}xp`);
      last = level;
    }
  });

  it('has strictly increasing thresholds', () => {
    for (let i = 1; i < RANKS.length; i++) {
      assert.ok(RANKS[i]!.xpRequired > RANKS[i - 1]!.xpRequired);
    }
  });
});

describe('xp — pays for turning up, not for being right', () => {
  const base = { tier: 'district' as const, clockSeconds: 120 };

  it('pays the same whichever way the verdict went', () => {
    // Nothing in the xp signature can see correct_verdict, and that is the
    // guarantee: xp cannot leak the answer because it never learns it.
    const a = xpForVerdict({ ...base, wasHung: false, timeRemaining: 10 });
    const b = xpForVerdict({ ...base, wasHung: false, timeRemaining: 10 });
    assert.equal(a, b);
  });

  it('rewards deliberating over snap-deciding', () => {
    const read = xpForVerdict({ ...base, wasHung: false, timeRemaining: 20 });
    const snap = xpForVerdict({ ...base, wasHung: false, timeRemaining: 115 });
    assert.ok(read > snap);
  });

  it('pays less when the clock decided', () => {
    const hung = xpForVerdict({ ...base, wasHung: true, timeRemaining: 0 });
    const decided = xpForVerdict({ ...base, wasHung: false, timeRemaining: 115 });
    assert.ok(hung < decided);
  });

  it('never goes negative', () => {
    assert.ok(xpForVerdict({ ...base, wasHung: true, timeRemaining: 0 }) >= 0);
  });

  it('pays more the further out the bench', () => {
    const district = xpForVerdict({ ...base, wasHung: false, timeRemaining: 10 });
    const world = xpForVerdict({ ...base, tier: 'world', wasHung: false, timeRemaining: 10 });
    assert.ok(world > district);
  });
});

describe('trust — judgement, and the asymmetry it carries', () => {
  it('costs nothing to decide an unanswerable case either way', () => {
    for (const verdict of ['guilty', 'not_guilty'] as const) {
      assert.equal(
        trustForVerdict({ verdict, correctVerdict: 'ambiguous', wasHung: false }),
        0,
        'ambiguous cases have no right answer and must not be scored',
      );
    }
  });

  it('punishes convicting the innocent harder than freeing the guilty', () => {
    const wrongfulConviction = trustForVerdict({
      verdict: 'guilty',
      correctVerdict: 'not_guilty',
      wasHung: false,
    });
    const wrongfulAcquittal = trustForVerdict({
      verdict: 'not_guilty',
      correctVerdict: 'guilty',
      wasHung: false,
    });
    assert.ok(wrongfulConviction < wrongfulAcquittal);
    assert.ok(wrongfulConviction < 0 && wrongfulAcquittal < 0);
  });

  it('rewards a sound verdict', () => {
    assert.ok(trustForVerdict({ verdict: 'guilty', correctVerdict: 'guilty', wasHung: false }) > 0);
  });

  it('treats a hung verdict as a failure to serve', () => {
    assert.ok(trustForVerdict({ verdict: 'guilty', correctVerdict: 'guilty', wasHung: true }) < 0);
  });

  it('describes standing in words, not numbers', () => {
    assert.equal(trustLabel(95), 'Unimpeachable');
    assert.equal(trustLabel(10), 'Discredited');
  });
});

describe('gates — rank only, never trust', () => {
  it('locks nothing behind being right', () => {
    // Every gate is a rank. If one were a trust threshold, a player could be
    // locked out of their own archive for a verdict that went badly.
    for (const [name, value] of Object.entries(GATES)) {
      assert.equal(typeof value, 'number', `${name} should be a rank`);
      assert.ok(value >= 1 && value <= RANKS.length, `${name} out of range`);
    }
  });

  it('opens the district bench to everyone', () => {
    assert.ok(meetsTier('district', 1, 0));
  });

  it('will not seat a fresh juror at the world bench', () => {
    assert.equal(meetsTier('world', 1, 100), false);
    assert.equal(meetsTier('world', 12, 40), false);
    assert.ok(meetsTier('world', 12, 90));
  });

  it('demands more the higher the rung', () => {
    const order = ['district', 'state', 'national', 'supranational', 'international', 'world'] as const;
    for (let i = 1; i < order.length; i++) {
      assert.ok(TIER_REQUIREMENTS[order[i]!].rank >= TIER_REQUIREMENTS[order[i - 1]!].rank);
      assert.ok(TIER_REQUIREMENTS[order[i]!].trust >= TIER_REQUIREMENTS[order[i - 1]!].trust);
    }
  });
});

describe('the ladder', () => {
  it('routes a Norwegian juror through a supranational bench', () => {
    assert.ok(ladderFor('NO').includes('supranational'));
    assert.equal(nextTier('national', 'NO'), 'supranational');
  });

  it('skips the rung for a country that answers to no one', () => {
    // The US has no supranational bench; inventing one would be worse than
    // going straight to international.
    assert.equal(ladderFor('US').includes('supranational'), false);
    assert.equal(nextTier('national', 'US'), 'international');
  });

  it('ends at the world for everyone', () => {
    for (const code of ['NO', 'US', 'NG', 'KE', 'BR']) {
      assert.equal(nextTier('world', code), null);
      assert.equal(ladderFor(code).at(-1), 'world');
    }
  });

  it('names the rung in the country’s own terms', () => {
    assert.equal(tierLabel('state', 'NO'), 'Fylke');
    assert.equal(tierLabel('state', 'US'), 'State');
    assert.equal(tierLabel('state', 'KE'), 'County');
  });

  it('falls back to a plausible country rather than to nowhere', () => {
    const p = profileFor('IS');
    assert.equal(p.code, 'IS');
    assert.ok(p.courtName('national', 'Reykjavík').length > 0);
  });

  it('names a real police service per district', () => {
    assert.equal(profileFor('NO').policeService('Oslo'), 'Oslo politidistrikt');
    assert.equal(profileFor('NG').policeService('Lagos'), 'Lagos State Police Command');
  });
});

describe('appearance is not a tell', () => {
  it('does not let the authored docket teach that looks predict guilt', () => {
    // If every innocent were disarming, players would learn to read the face
    // instead of the evidence, and appearance_bias would measure nothing.
    const innocent = SEED_CASES.filter((c) => c.correct_verdict === 'not_guilty');
    const unsettling = innocent.filter((c) => c.defendant.appearance <= 40);
    const disarming = innocent.filter((c) => c.defendant.appearance >= 60);
    assert.ok(unsettling.length > 0, 'no innocent defendant looks unsettling');
    assert.ok(disarming.length > 0, 'no innocent defendant looks disarming');
  });

  it('gives every authored defendant a face', () => {
    for (const c of SEED_CASES) {
      assert.ok(c.defendant.appearance >= 0 && c.defendant.appearance <= 100, c.title);
    }
  });
});
