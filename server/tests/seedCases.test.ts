import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generatedCaseSchema } from '../src/domain/case.js';
import { structureKeyFor } from '../src/services/caseGenerator.js';
import { SEED_CASES, seedCaseFor } from '../src/services/seedCases.js';

/**
 * The hand-authored docket ships in the app and is the fallback whenever Groq
 * is unavailable, so it has to satisfy the same contract the AI is held to.
 * A malformed seed case would surface as a broken dossier in production.
 */
describe('the authored docket', () => {
  it('has cases', () => {
    assert.ok(SEED_CASES.length > 0);
  });

  for (const c of SEED_CASES) {
    describe(c.title, () => {
      it('satisfies the generated-case schema', () => {
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
  }

  it('names every character it adds to the pool', () => {
    // The pool name and the witness name are the same identity key. If they
    // drift apart, the Echo System stops recognising people it has already met.
    for (const c of SEED_CASES) {
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
    for (const c of SEED_CASES) {
      const people = [c.defendant.name, ...c.witnesses.map((w) => w.name)];
      for (const name of people) {
        if (name.includes(',')) offenders.push(`${name} (descriptor in name)`);
        if (/^(Dr|Mr|Mrs|Ms|Sergeant|Inspector|Officer)\b/.test(name))
          offenders.push(`${name} (title in name)`);
      }
    }
    assert.deepEqual(offenders, []);
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
