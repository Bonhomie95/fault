import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CityMetrics } from '../src/domain/city.js';
import { applyCityEffect, deriveCaseMood, deriveEffectKey, deriveFactions } from '../src/services/cityEffects.js';

const neutral = (over: Partial<CityMetrics> = {}): CityMetrics => ({
  crimeRate: 50,
  judicialTrust: 50,
  wealthDisparity: 50,
  organizedCrimePower: 50,
  policeIntegrity: 50,
  mediaPressure: 50,
  ...over,
});

const ctx = (over: Partial<Parameters<typeof deriveEffectKey>[0]> = {}) => ({
  verdict: 'guilty' as const,
  wasHung: false,
  defendantWealth: 50,
  evidenceStrength: 0.5,
  organisedCrimeAdjacent: false,
  ...over,
});

describe('deriveEffectKey', () => {
  it('treats a hung verdict as hung regardless of everything else', () => {
    const key = deriveEffectKey(ctx({ wasHung: true, defendantWealth: 95, organisedCrimeAdjacent: true }));
    assert.equal(key, 'hung_verdict');
  });

  it('convicting on defence-favouring evidence is a weak-evidence conviction', () => {
    // The signed-strength case: -0.7 means the evidence exonerated them.
    // An absolute-value reading would score this as a strong case.
    assert.equal(deriveEffectKey(ctx({ evidenceStrength: -0.7 })), 'convict_weak_evidence');
  });

  it('convicting on a balanced case is also a weak-evidence conviction', () => {
    assert.equal(deriveEffectKey(ctx({ evidenceStrength: 0 })), 'convict_weak_evidence');
  });

  it('convicting a wealthy defendant on strong evidence closes the gap', () => {
    assert.equal(deriveEffectKey(ctx({ evidenceStrength: 0.8, defendantWealth: 85 })), 'convict_wealthy');
  });

  it('acquitting against strong prosecution evidence costs trust', () => {
    assert.equal(
      deriveEffectKey(ctx({ verdict: 'not_guilty', evidenceStrength: 0.7 })),
      'acquit_strong_evidence',
    );
  });

  it('acquitting a poor defendant is read as uncertainty, not error', () => {
    assert.equal(
      deriveEffectKey(ctx({ verdict: 'not_guilty', evidenceStrength: 0, defendantWealth: 20 })),
      'acquit_poor',
    );
  });

  it('organised crime outranks the class reading', () => {
    assert.equal(
      deriveEffectKey(ctx({ verdict: 'not_guilty', defendantWealth: 10, organisedCrimeAdjacent: true })),
      'acquit_organised_crime',
    );
  });
});

describe('applyCityEffect', () => {
  it('applies the GDD deltas to the named dials', () => {
    const next = applyCityEffect(neutral(), 'convict_wealthy');
    assert.equal(next.wealthDisparity, 48);
    assert.equal(next.judicialTrust, 53);
  });

  it('leaves untouched dials exactly where they were', () => {
    const next = applyCityEffect(neutral(), 'convict_wealthy');
    assert.equal(next.crimeRate, 50);
    assert.equal(next.policeIntegrity, 50);
    assert.equal(next.mediaPressure, 50);
  });

  it('clamps to 0 and never goes negative', () => {
    const next = applyCityEffect(neutral({ judicialTrust: 2 }), 'hung_verdict');
    assert.equal(next.judicialTrust, 0);
  });

  it('clamps to 100 and never overflows', () => {
    const next = applyCityEffect(neutral({ mediaPressure: 98 }), 'acquit_organised_crime');
    assert.equal(next.mediaPressure, 100);
  });

  it('returns only finite numbers — no NaN leaks into the city', () => {
    const next = applyCityEffect(neutral(), 'acquit_organised_crime');
    for (const value of Object.values(next)) {
      assert.equal(Number.isFinite(value), true, `expected finite, got ${value}`);
    }
  });
});

describe('deriveCaseMood', () => {
  it('lets the syndicate speak first when it is strongest', () => {
    assert.match(deriveCaseMood(neutral({ organizedCrimePower: 80 })), /intimidation/);
  });

  it('reads planted evidence as plausible once police integrity collapses', () => {
    assert.match(deriveCaseMood(neutral({ policeIntegrity: 20 })), /planted/);
  });

  it('falls back to a standard adversarial case in a calm city', () => {
    assert.equal(deriveCaseMood(neutral()), 'standard adversarial case');
  });
});

describe('deriveFactions', () => {
  it('keeps a neutral city free of factions', () => {
    assert.deepEqual(deriveFactions(neutral()), []);
  });

  it('summons the reform movement when trust collapses', () => {
    assert.ok(deriveFactions(neutral({ judicialTrust: 20 })).includes('Reform Movement'));
  });
});
