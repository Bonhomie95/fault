import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CityMetrics } from '../src/domain/city.js';
import { cityVerdict, MIN_CASES_TO_RANK, peaceIndex, PEACE_WEIGHTS } from '../src/domain/peace.js';

const city = (over: Partial<CityMetrics> = {}): CityMetrics => ({
  crimeRate: 50,
  judicialTrust: 50,
  wealthDisparity: 50,
  organizedCrimePower: 50,
  policeIntegrity: 50,
  mediaPressure: 50,
  ...over,
});

describe('the peace index', () => {
  it('puts a fresh, untouched city exactly in the middle', () => {
    // Every juror starts at 50 across the board. If this drifted, the
    // MIN_CASES floor would be hiding a bias rather than an absence of data.
    assert.equal(peaceIndex(city()), 50);
  });

  it('is 100 for a city that works and 0 for one that does not', () => {
    const utopia = city({
      crimeRate: 0,
      judicialTrust: 100,
      policeIntegrity: 100,
      organizedCrimePower: 0,
      wealthDisparity: 0,
    });
    const ruin = city({
      crimeRate: 100,
      judicialTrust: 0,
      policeIntegrity: 0,
      organizedCrimePower: 100,
      wealthDisparity: 100,
    });
    assert.equal(peaceIndex(utopia), 100);
    assert.equal(peaceIndex(ruin), 0);
  });

  it('weights crime heaviest, but never as the only thing', () => {
    // A quiet city nobody trusts is not at peace. If crime alone decided the
    // board, a police state would top it.
    const quietButRotten = city({ crimeRate: 0, judicialTrust: 0, policeIntegrity: 0 });
    assert.ok(peaceIndex(quietButRotten) < 100);
    assert.ok(peaceIndex(quietButRotten) > 0);
  });

  it('refuses to call a Syndicate city peaceful just because it is quiet', () => {
    const graveyard = city({ crimeRate: 0, organizedCrimePower: 100 });
    const ordinary = city({ crimeRate: 0, organizedCrimePower: 0 });
    assert.ok(peaceIndex(graveyard) < peaceIndex(ordinary));
  });

  it('never leaves the 0-100 range whatever the city does', () => {
    for (const v of [-50, 0, 50, 100, 150]) {
      const extreme = city({
        crimeRate: v,
        judicialTrust: v,
        wealthDisparity: v,
        organizedCrimePower: v,
        policeIntegrity: v,
      });
      const index = peaceIndex(extreme);
      assert.ok(index >= 0 && index <= 100, `index ${index} out of range at ${v}`);
      assert.ok(Number.isFinite(index));
    }
  });

  it('has weights that sum to one, or the scale is a lie', () => {
    const total = Object.values(PEACE_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, `weights sum to ${total}`);
  });

  it('is monotonic in crime — more crime is never more peaceful', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let crime = 0; crime <= 100; crime += 10) {
      const index = peaceIndex(city({ crimeRate: crime }));
      assert.ok(index <= previous, `peace rose as crime rose at ${crime}`);
      previous = index;
    }
  });
});

describe('what the boards call a city', () => {
  it('names both ends and the middle', () => {
    assert.equal(cityVerdict(peaceIndex(city())), 'Strained');
    assert.equal(cityVerdict(95), 'At peace');
    assert.equal(cityVerdict(5), 'Ungovernable');
  });

  it('never leaves a city unnamed', () => {
    for (let i = 0; i <= 100; i++) {
      assert.ok(cityVerdict(i).length > 0, `no verdict at ${i}`);
    }
  });
});

describe('qualification', () => {
  it('requires a city to have been governed before it is judged', () => {
    // Without this, an account that signed up and never played sits at a
    // perfect 50 and outranks people who actually tried.
    assert.ok(MIN_CASES_TO_RANK >= 1);
  });
});
