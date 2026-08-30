import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reactionFor, type Reaction } from '../src/domain/reaction.js';

/**
 * The accused's face, after the verdict.
 *
 * Four combinations of what the juror said and what was true, plus the case
 * where nothing was true. The mapping is the feature, so it is pinned here
 * rather than left to be re-derived from the client's animation table.
 */
describe('the accused reacts to their own life', () => {
  it('gives a convicted guilty defendant nothing left to hold up', () => {
    assert.equal(reactionFor('guilty', 'guilty'), 'broken');
  });

  it('gives a convicted innocent defendant disbelief', () => {
    assert.equal(reactionFor('guilty', 'not_guilty'), 'stricken');
  });

  it('lets an acquitted guilty defendant smirk', () => {
    // The one that costs the player something, and the reason this exists.
    assert.equal(reactionFor('not_guilty', 'guilty'), 'smirk');
  });

  it('lets an acquitted innocent defendant breathe', () => {
    assert.equal(reactionFor('not_guilty', 'not_guilty'), 'relief');
  });

  it('gives nothing away on a case that had no answer', () => {
    // `ambiguous` exists precisely so that some cases cannot be got right. A
    // tell here would be a face that knows something on a case built so that
    // nobody could — worse than no reaction at all.
    assert.equal(reactionFor('guilty', 'ambiguous'), 'unreadable');
    assert.equal(reactionFor('not_guilty', 'ambiguous'), 'unreadable');
  });

  it('never returns the same reaction for a right and a wrong acquittal', () => {
    // If these ever collapse, the smirk stops meaning anything and the whole
    // beat is decoration.
    assert.notEqual(
      reactionFor('not_guilty', 'guilty'),
      reactionFor('not_guilty', 'not_guilty'),
    );
  });

  it('is total — every combination has a face', () => {
    const verdicts = ['guilty', 'not_guilty'] as const;
    const truths = ['guilty', 'not_guilty', 'ambiguous'] as const;
    const seen = new Set<Reaction>();
    for (const v of verdicts) {
      for (const t of truths) {
        const r = reactionFor(v, t);
        assert.ok(r, `${v} / ${t} has no reaction`);
        seen.add(r);
      }
    }
    assert.equal(seen.size, 5, `expected five distinct reactions, got ${[...seen].join(', ')}`);
  });
});
