import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { personName, structureKeyFor, TWIN_GAP, type GeneratedCase } from '../src/domain/case.js';
import { COUNTRIES, profileFor } from '../src/domain/jurisdiction.js';
import { echoRolesFor, portraitSeedFor, ECHO_START_CASE } from '../src/services/characterPool.js';
import { SEED_CASES } from '../src/services/seedCases.js';

/**
 * The Echo System and the consistency probe.
 *
 * Both were built, both were scored, and neither was ever actually triggered:
 * echoes were a suggestion in a prompt that nothing verified, and the twin was
 * a test the game measured without ever setting. These pin the parts that can
 * be tested without a live model.
 */

describe('who is allowed to come back', () => {
  it('offers a convicted person different returns than an acquitted one', () => {
    // What you did to them decides what they can be when they return. That is
    // the entire emotional payload of the mechanic.
    const convicted = echoRolesFor('convicted');
    const acquitted = echoRolesFor('acquitted');
    assert.notDeepEqual(convicted, acquitted);
    assert.ok(convicted.some((r) => /inside|victim|parolee/i.test(r)));
    assert.ok(acquitted.some((r) => /prosecution|after their acquittal|reformed/i.test(r)));
  });

  it('always gives the generator something to work with', () => {
    for (const fate of ['convicted', 'acquitted', 'untried'] as const) {
      assert.ok(echoRolesFor(fate).length > 0, `${fate} has no way back`);
    }
  });

  it('waits long enough that a name has been forgotten', () => {
    // GDD 12: an echo that arrives too early is just a repeated name. It has
    // to be forgotten first to land.
    assert.ok(ECHO_START_CASE >= 10, 'echoes start too early to mean anything');
  });
});

describe('a face that returns is the same face', () => {
  it('seeds a portrait from the name, deterministically', () => {
    assert.equal(portraitSeedFor('Kari Olsen'), portraitSeedFor('Kari Olsen'));
    assert.notEqual(portraitSeedFor('Kari Olsen'), portraitSeedFor('Lars Haugen'));
  });

  it('stays inside the portrait library', () => {
    for (const name of ['A', 'Ingrid Solberg', 'Оля Иванова', '李伟', 'x'.repeat(200)]) {
      const seed = portraitSeedFor(name);
      assert.ok(seed >= 0 && seed < 200, `${name} -> ${seed}`);
      assert.ok(Number.isInteger(seed));
    }
  });
});

describe('the consistency twin', () => {
  it('is twenty cases apart, as the GDD promises', () => {
    assert.equal(TWIN_GAP, 20);
  });

  it('matches on shape and nothing else', () => {
    const a = SEED_CASES[0]!;
    // A different case in every visible way, built to the same fingerprint.
    const twin: GeneratedCase = {
      ...a,
      title: 'The State v. Someone Else',
      charge: 'A completely different charge',
      defendant: { ...a.defendant, name: 'Someone Else', occupation: 'Something else' },
    };
    assert.equal(structureKeyFor(twin), structureKeyFor(a));
  });

  it('is not fooled into matching when the shape differs', () => {
    const a = SEED_CASES[0]!;
    const notTwin = { ...a, defendant: { ...a.defendant, wealth: 95 } };
    assert.notEqual(structureKeyFor(notTwin), structureKeyFor(a));
  });

  it('encodes every dimension the probe depends on', () => {
    // accent : wealth band : evidence lean : planted : truth
    const key = structureKeyFor(SEED_CASES[0]!);
    assert.equal(key.split(':').length, 5, `key shape changed: ${key}`);
  });
});

describe('a name must be a name', () => {
  it('rejects the model narrating into the field', () => {
    // Real output, once the prompt started listing taken names: the model
    // explained itself where the name goes, and `z.string()` accepted it.
    for (const junk of [
      'Lena Jensen is taken, using: Cecilie Foss',
      'The name Kari Fjell is already used so I will use Astrid Vik',
      'Unavailable — using Nora Berg instead',
    ]) {
      assert.equal(personName.safeParse(junk).success, false, `accepted: ${junk}`);
    }
  });

  it('rejects a descriptor or a title welded to the name', () => {
    // Both make one person into two identity keys, which is how the Echo
    // System loses people.
    for (const bad of ['Tunde Balogun, gate security', 'Sergeant Musa Danjuma', 'Dr Ngozi Umeh']) {
      assert.equal(personName.safeParse(bad).success, false, `accepted: ${bad}`);
    }
  });

  it('accepts names from anywhere', () => {
    // The guard is about prose, not about scripts. Rejecting a real person's
    // real name would be a worse bug than the one it is fixing.
    for (const good of [
      'Ingrid Solberg',
      '李伟',
      'Ngozi Okonkwo-Bello',
      "Jean-Luc D'Arcy",
      'Wanjiru Mwangi',
      'María José Fernández',
      'Þórunn Jónsdóttir',
    ]) {
      assert.equal(personName.safeParse(good).success, true, `rejected: ${good}`);
    }
  });

  it('rejects digits, which are never part of a name', () => {
    assert.equal(personName.safeParse('Officer 42').success, false);
  });
});

describe('the name register outlasts a career', () => {
  it('has enough people in it, which 10x10 did not', () => {
    // Three names a case means 100 combinations is 33 cases before a juror
    // runs out of strangers — and the game is a 50-case campaign plus daily
    // mode. Double-barrelled surnames take the pool past 1,000.
    for (const code of ['NO', 'NG', 'US', 'IN']) {
      const t = profileFor(code).texture;
      const plain = t.givenNames.length * t.surnames.length;
      const withDouble = plain * (t.surnames.length - 1);
      assert.ok(plain >= 100, `${code}: only ${plain} plain names`);
      assert.ok(withDouble >= 900, `${code}: only ${withDouble} names even doubled`);
    }
  });

  it('never widens a name by repeating a word', () => {
    // The first attempt produced "Kari Kari Vik". Nobody is called that.
    for (const code of Object.keys(COUNTRIES)) {
      const t = profileFor(code).texture;
      for (const a of t.surnames) {
        for (const b of t.surnames) {
          if (a === b) continue; // pickCast skips these
          assert.notEqual(a, b);
        }
      }
    }
  });

  it('draws names a person could actually have', () => {
    // Whatever the draw produces must survive the name guard, or the schema
    // rejects the very names the server chose.
    for (const code of Object.keys(COUNTRIES)) {
      const t = profileFor(code).texture;
      for (const given of t.givenNames.slice(0, 3)) {
        for (const sur of t.surnames.slice(0, 3)) {
          assert.equal(personName.safeParse(`${given} ${sur}`).success, true, `${given} ${sur}`);
          const other = t.surnames.find((s) => s !== sur)!;
          assert.equal(
            personName.safeParse(`${given} ${sur}-${other}`).success,
            true,
            `${given} ${sur}-${other}`,
          );
        }
      }
    }
  });
});
