import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generatedCaseSchema, structureKeyFor } from '../src/domain/case.js';
import { profileFor } from '../src/domain/jurisdiction.js';
import { localizeCase, slotsUsedIn } from '../src/services/localizeCase.js';
import { SEED_CASES, seedCaseFor } from '../src/services/seedCases.js';

/**
 * The docket is TEMPLATES, not cases: names are slots like {D_FULL} and
 * {W1_FULL}, and a slot is not a name — {W1_FULL} contains a digit, which the
 * name guard rightly refuses. So the schema is asserted against what a player
 * actually receives, which is always the localised output. Testing the raw
 * template would be testing a thing that is never served.
 */
const localized = (i: number, code = 'NO', seed = 11 + i) => {
  const profile = profileFor(code);
  const district = profile.districts[0]!;
  return localizeCase(SEED_CASES[i]!, {
    profile,
    district,
    court: profile.courtName('district', district),
    policeService: profile.policeService(district),
    seed,
  });
};

/** The countries a launch player is most likely to be served the docket in. */
const COUNTRIES_UNDER_TEST = ['NO', 'NG', 'US', 'IN'] as const;

/**
 * The hand-authored docket ships in the app and is the fallback whenever Groq
 * is unavailable, so it has to satisfy the same contract the AI is held to.
 * A malformed seed case would surface as a broken dossier in production.
 */
describe('the authored docket', () => {
  it('has cases', () => {
    assert.ok(SEED_CASES.length > 0);
  });

  SEED_CASES.forEach((template, i) => {
    const c = localized(i);
    describe(template.title, () => {
      it('satisfies the generated-case schema once localised', () => {
        const parsed = generatedCaseSchema.safeParse(c);
        assert.equal(
          parsed.success,
          true,
          parsed.success ? '' : JSON.stringify(parsed.error.issues, null, 2),
        );
      });

      it('gives every exhibit two readings', () => {
        assert.equal(c.evidence.length, 3);
        for (const e of c.evidence) {
          assert.ok(e.prosecution_reading.length > 0);
          assert.ok(e.defence_reading.length > 0);
          assert.notEqual(e.prosecution_reading, e.defence_reading);
        }
      });

      it('gives every witness one provable lie and the tell that betrays it', () => {
        assert.equal(c.witnesses.length, 2);
        for (const w of c.witnesses) {
          assert.ok(w.lie.length > 0, `${w.name} has no lie`);
          assert.ok(w.lie_tell.length > 0, `${w.name} has no tell`);
        }
      });

      it('keeps both arguments inside the 40-word limit', () => {
        const count = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
        assert.ok(count(c.prosecution_argument) <= 40, `prosecution: ${count(c.prosecution_argument)}`);
        assert.ok(count(c.defence_argument) <= 40, `defence: ${count(c.defence_argument)}`);
      });

      it('points evidence_strength the same way as the verdict it implies', () => {
        // A case whose truth is "guilty" should not be one where the evidence
        // overwhelmingly favours the defence, and vice versa.
        if (c.correct_verdict === 'guilty') assert.ok(c.evidence_strength > -0.4);
        if (c.correct_verdict === 'not_guilty') assert.ok(c.evidence_strength < 0.4);
      });
    });
  });

  it('names every character it adds to the pool', () => {
    // The pool name and the witness name are the same identity key. If they
    // drift apart, the Echo System stops recognising people it has already met.
    for (const c of SEED_CASES.map((_, i) => localized(i))) {
      const names = c.character_pool_additions.map((p) => p.name);
      assert.ok(names.includes(c.defendant.name), `${c.title} omits its own defendant`);
      for (const w of c.witnesses) {
        assert.ok(names.includes(w.name), `${c.title} omits witness "${w.name}"`);
      }
    }
  });

  it('keeps titles and descriptors out of names', () => {
    // "Sergeant Musa Danjuma" and "Musa Danjuma" are one person; only one of
    // those strings can be the key, and it has to be the bare name.
    const offenders: string[] = [];
    for (const c of SEED_CASES.map((_, i) => localized(i))) {
      const people = [c.defendant.name, ...c.witnesses.map((w) => w.name)];
      for (const name of people) {
        if (name.includes(',')) offenders.push(`${name} (descriptor in name)`);
        if (/^(Dr|Mr|Mrs|Ms|Sergeant|Inspector|Officer)\b/.test(name))
          offenders.push(`${name} (title in name)`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  it('holds 24 cases, so a bad Groq day does not loop after six', () => {
    assert.equal(SEED_CASES.length, 24);
  });

  it('survives localisation in every launch country, for several casts', () => {
    // A slot that only breaks in one register (a name that trips the title
    // guard, a money string that pushes an argument past 40 words) would pass
    // in Norway and fail in Lagos. So every case is tried in each country,
    // with more than one cast.
    const failures: string[] = [];
    for (const code of COUNTRIES_UNDER_TEST) {
      for (const seed of [1, 7, 42, 1009]) {
        SEED_CASES.forEach((template, i) => {
          const c = localized(i, code, seed);
          const tag = `${code}/${seed}/#${i + 1} ${template.charge}`;
          const parsed = generatedCaseSchema.safeParse(c);
          if (!parsed.success) {
            failures.push(`${tag}: ${parsed.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`);
            return;
          }
          const leftover = slotsUsedIn(c);
          if (leftover.length) failures.push(`${tag}: unfilled ${leftover.join(', ')}`);
          if (parsed.data.courtroom_lines.length !== c.courtroom_lines.length)
            failures.push(`${tag}: a courtroom line was dropped by the schema or the verdict guard`);
          for (const name of [c.defendant.name, ...c.witnesses.map((w) => w.name)]) {
            if (/^(dr|mr|mrs|ms|miss|prof|sgt|sergeant|insp|inspector|officer|constable|detective|judge|captain)\b/i.test(name))
              failures.push(`${tag}: title in name "${name}"`);
          }
          const people = new Set([c.defendant.name, ...c.witnesses.map((w) => w.name)]);
          if (people.size !== 3) failures.push(`${tag}: cast is not three different people`);
        });
      }
    }
    assert.deepEqual(failures, []);
  });

  it('keeps names as slots in the template, never hard-coded people', () => {
    // The Echo System keys on names and the docket is re-cast per country; a
    // literal name in a template would follow the player across the world.
    for (const c of SEED_CASES) {
      assert.equal(c.defendant.name, '{D_FULL}', c.charge);
      assert.deepEqual(
        c.witnesses.map((w) => w.name).sort(),
        ['{W1_FULL}', '{W2_FULL}'],
        c.charge,
      );
    }
  });

  it('keeps evidence_strength honest about the verdict', () => {
    // An answerable case must lean the way its answer does; an unanswerable
    // one must not quietly lean at all.
    for (const c of SEED_CASES) {
      if (c.correct_verdict === 'guilty') assert.ok(c.evidence_strength >= 0.3, `${c.charge}: ${c.evidence_strength}`);
      if (c.correct_verdict === 'not_guilty') assert.ok(c.evidence_strength <= -0.3, `${c.charge}: ${c.evidence_strength}`);
      if (c.correct_verdict === 'ambiguous') assert.ok(Math.abs(c.evidence_strength) <= 0.3, `${c.charge}: ${c.evidence_strength}`);
    }
  });

  it('spreads verdicts, moods, wealth and planted evidence across the docket', () => {
    const count = (v: string) => SEED_CASES.filter((c) => c.correct_verdict === v).length;
    assert.ok(count('guilty') >= 6, `guilty: ${count('guilty')}`);
    assert.ok(count('not_guilty') >= 6, `not_guilty: ${count('not_guilty')}`);
    assert.ok(count('ambiguous') >= 4, `ambiguous: ${count('ambiguous')}`);
    for (const accent of ['violent', 'financial', 'systemic', 'passion'] as const) {
      const n = SEED_CASES.filter((c) => c.accent === accent).length;
      assert.ok(n >= 4, `${accent}: ${n}`);
    }
    const wealth = SEED_CASES.map((c) => c.defendant.wealth);
    assert.ok(Math.min(...wealth) <= 10 && Math.max(...wealth) >= 90, `wealth ${Math.min(...wealth)}..${Math.max(...wealth)}`);
    const planted = SEED_CASES.filter((c) => c.evidence.some((e) => e.is_planted));
    assert.ok(planted.length >= 3, `planted: ${planted.length}`);
    // Planted evidence must not itself become the tell for innocence.
    assert.ok(SEED_CASES.some((c) => c.correct_verdict === 'not_guilty' && !c.evidence.some((e) => e.is_planted)));
  });

  it('never repeats a charge', () => {
    const charges = SEED_CASES.map((c) => c.charge);
    assert.equal(new Set(charges).size, charges.length);
  });

  it('carries a mix of answerable and unanswerable cases', () => {
    // GDD 3.3 — if every case had a right answer the game would be a quiz.
    const ambiguous = SEED_CASES.filter((c) => c.correct_verdict === 'ambiguous');
    assert.ok(ambiguous.length > 0, 'no ambiguous cases in the docket');
    assert.ok(ambiguous.length < SEED_CASES.length, 'every case is ambiguous');
  });
});

describe('seedCaseFor', () => {
  it('is 1-indexed on the docket', () => {
    assert.equal(seedCaseFor(1).title, SEED_CASES[0]!.title);
  });

  it('cycles rather than running out', () => {
    assert.equal(seedCaseFor(SEED_CASES.length + 1).title, SEED_CASES[0]!.title);
    assert.equal(seedCaseFor(SEED_CASES.length + 1), SEED_CASES[0]);
  });

  it('reaches every case in the docket before repeating one', () => {
    const served = Array.from({ length: SEED_CASES.length }, (_, i) => seedCaseFor(i + 1));
    assert.equal(new Set(served).size, SEED_CASES.length);
    served.forEach((c, i) => assert.equal(c, SEED_CASES[i]));
  });
});

describe('structureKeyFor', () => {
  it('is blind to names and prose — only shape', () => {
    const a = SEED_CASES[0]!;
    const twin = { ...a, title: 'The State v. Someone Else', defendant: { ...a.defendant, name: 'Someone Else' } };
    assert.equal(structureKeyFor(a), structureKeyFor(twin));
  });

  it('separates cases that differ in what the evidence supports', () => {
    const a = SEED_CASES[0]!;
    const flipped = { ...a, evidence_strength: 0.9, correct_verdict: 'guilty' as const };
    assert.notEqual(structureKeyFor(a), structureKeyFor(flipped));
  });
});
