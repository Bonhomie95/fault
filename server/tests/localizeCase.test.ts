import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COUNTRIES, genericProfile, profileFor } from '../src/domain/jurisdiction.js';
import { localizeCase, slotsUsedIn } from '../src/services/localizeCase.js';
import { SEED_CASES } from '../src/services/seedCases.js';

const ctxFor = (code: string, seed = 7) => {
  const profile = profileFor(code);
  const district = profile.districts[0]!;
  return {
    profile,
    district,
    court: profile.courtName('district', district),
    policeService: profile.policeService(district),
    seed,
  };
};

const ALL = [...Object.keys(COUNTRIES), 'JP' /* unlisted → generic */];

describe('the authored docket travels', () => {
  it('leaves no unfilled slot anywhere, in any country', () => {
    // An unfilled {D_FULL} would be shown to a player verbatim. This is the
    // test that stops the fallback embarrassing itself on its worst day.
    for (const code of ALL) {
      for (const template of SEED_CASES) {
        const localized = localizeCase(template, ctxFor(code));
        const leftover = slotsUsedIn(localized);
        assert.deepEqual(leftover, [], `${code} / ${template.title} left ${leftover.join(', ')}`);
      }
    }
  });

  it('carries no naira, no Orun, no danfo into Norway', () => {
    const blob = SEED_CASES.map((c) => JSON.stringify(localizeCase(c, ctxFor('NO')))).join(' ');
    for (const trace of ['₦', 'Orun', 'danfo', 'naira', 'Balogun Market', 'Ikorodu']) {
      assert.equal(blob.includes(trace), false, `Norwegian docket still contains "${trace}"`);
    }
  });

  it('gives each country its own money', () => {
    const no = localizeCase(SEED_CASES[0]!, ctxFor('NO'));
    const ng = localizeCase(SEED_CASES[0]!, ctxFor('NG'));
    assert.ok(JSON.stringify(no).includes('NOK'));
    assert.ok(JSON.stringify(ng).includes('₦'));
  });

  it('gives each country its own names', () => {
    const no = localizeCase(SEED_CASES[0]!, ctxFor('NO'));
    const ke = localizeCase(SEED_CASES[0]!, ctxFor('KE'));
    assert.ok(COUNTRIES.NO!.texture.surnames.some((s) => no.defendant.name.includes(s)));
    assert.ok(COUNTRIES.KE!.texture.surnames.some((s) => ke.defendant.name.includes(s)));
    assert.notEqual(no.defendant.name, ke.defendant.name);
  });
});

describe('localisation keeps the case intact', () => {
  it('does not touch the tuned numbers or the answer', () => {
    for (const template of SEED_CASES) {
      const localized = localizeCase(template, ctxFor('DE'));
      assert.equal(localized.correct_verdict, template.correct_verdict);
      assert.equal(localized.evidence_strength, template.evidence_strength);
      assert.equal(localized.defendant.wealth, template.defendant.wealth);
      assert.equal(localized.defendant.appearance, template.defendant.appearance);
      assert.equal(localized.accent, template.accent);
      assert.equal(localized.evidence.length, 3);
      assert.equal(localized.witnesses.length, 2);
    }
  });

  it('keeps every witness lie and tell', () => {
    for (const template of SEED_CASES) {
      const localized = localizeCase(template, ctxFor('BR'));
      for (const w of localized.witnesses) {
        assert.ok(w.lie.length > 0);
        assert.ok(w.lie_tell.length > 0);
      }
    }
  });

  it('keeps the pool names identical to the cast', () => {
    // The Echo System matches on exact name. If localisation renamed the
    // defendant but not their pool entry, every echo would break silently.
    for (const code of ALL) {
      for (const template of SEED_CASES) {
        const c = localizeCase(template, ctxFor(code));
        const pool = c.character_pool_additions.map((p) => p.name);
        assert.ok(pool.includes(c.defendant.name), `${code}: pool lost ${c.defendant.name}`);
        for (const w of c.witnesses) {
          assert.ok(pool.includes(w.name), `${code}: pool lost witness ${w.name}`);
        }
      }
    }
  });
});

describe('the cast', () => {
  it('is three different people', () => {
    for (const code of ALL) {
      for (let seed = 0; seed < 40; seed++) {
        const c = localizeCase(SEED_CASES[0]!, ctxFor(code, seed));
        const names = [c.defendant.name, ...c.witnesses.map((w) => w.name)];
        assert.equal(new Set(names).size, 3, `${code} seed ${seed}: ${names.join(' / ')}`);
      }
    }
  });

  it('is stable for a given juror and case', () => {
    const a = localizeCase(SEED_CASES[2]!, ctxFor('GB', 99));
    const b = localizeCase(SEED_CASES[2]!, ctxFor('GB', 99));
    assert.equal(a.defendant.name, b.defendant.name);
  });

  it('differs between jurors', () => {
    const names = new Set(
      Array.from({ length: 12 }, (_, i) => localizeCase(SEED_CASES[0]!, ctxFor('US', i)).defendant.name),
    );
    assert.ok(names.size > 1, 'every juror got the same defendant');
  });
});

describe('unlisted countries', () => {
  it('borrow no one else’s culture', () => {
    const generic = genericProfile('JP', 'Japan');
    const c = localizeCase(SEED_CASES[0]!, {
      profile: generic,
      district: 'Tokyo',
      court: generic.courtName('district', 'Tokyo'),
      policeService: generic.policeService('Tokyo'),
      seed: 4,
    });
    const blob = JSON.stringify(c);
    // Placeless prose is the honest outcome for a country we have not done the
    // work on — better than dressing Tokyo in Lagos.
    for (const trace of ['₦', 'NOK', 'danfo', 'Balogun']) {
      assert.equal(blob.includes(trace), false);
    }
  });
});
