import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  BANDS,
  biasFor,
  describeBias,
  rollPresentation,
  stripPresentation,
  type PresentationChannel,
} from '../src/domain/presentation.js';
import type { GeneratedCase } from '../src/domain/case.js';

/**
 * The three channels a juror reads off a defendant's body, and the one
 * property the whole measurement rests on: none of them may carry any
 * information about guilt.
 *
 * If they did, a juror who followed them would be RIGHT more often, "bias"
 * would be skill, and the Juror Record would be congratulating people for
 * pattern-matching while calling it prejudice. That is not a subtle failure —
 * it inverts the meaning of the game's central feature — and it is invisible
 * case by case. The only way to catch it is in aggregate, here.
 */

/** A deterministic roller, so a failure is reproducible rather than a mood. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    // xorshift32 — small, fast, and good enough to be uniform over 100k draws.
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;  state >>>= 0;
    return state / 0x100000000;
  };
}

const CHANNELS: PresentationChannel[] = ['appearance', 'demeanour', 'oddity'];

describe('presentation carries no information about guilt', () => {
  it('never mentions the verdict or the evidence in its source', () => {
    // The module's whole safety property is that it cannot see guilt. A
    // signature check does not prove that — `Function.length` ignores
    // defaulted parameters, so `rollPresentation(roll = Math.random)` reports
    // zero arguments and the assertion passes for the wrong reason.
    //
    // So read the source. If somebody later threads a case in to make the
    // guilty look shiftier, this fails and they have to argue with the comment
    // at the top of the module.
    const source = readFileSync(
      fileURLToPath(new URL('../src/domain/presentation.ts', import.meta.url)),
      'utf8',
    );
    const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''); // strip comments

    for (const forbidden of ['correct_verdict', 'correctVerdict', 'evidence_strength',
                             'evidenceStrength', 'is_planted', 'isPlanted', 'wasHung']) {
      assert.ok(
        !code.includes(forbidden),
        `presentation.ts reads ${forbidden} — the body now knows the answer`,
      );
    }
  });

  it('shows no correlation with guilt across ten thousand cases', () => {
    // The real test. Alternate the verdict and roll independently; if the two
    // are genuinely unrelated the mean presentation must be the same on both
    // sides to within sampling noise.
    const roll = seeded(20260822);
    const guilty: number[][] = [[], [], []];
    const innocent: number[][] = [[], [], []];

    for (let i = 0; i < 10_000; i++) {
      const p = rollPresentation(roll);
      const bucket = i % 2 === 0 ? guilty : innocent;
      bucket[0]!.push(p.appearance);
      bucket[1]!.push(p.demeanour);
      bucket[2]!.push(p.oddity);
    }

    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    CHANNELS.forEach((channel, i) => {
      const gap = Math.abs(mean(guilty[i]!) - mean(innocent[i]!));
      // 5000 samples a side on a bell over 0..100: a real correlation shows up
      // as several points. One point is noise.
      assert.ok(gap < 1.5, `${channel} differs by ${gap.toFixed(2)} between guilty and innocent`);
    });
  });

  it('overwrites whatever the model volunteered', () => {
    // The model returns these fields whether or not the prompt asks for it,
    // and it has read a great many stories in which the guilty man will not
    // meet your eye. Its numbers never survive.
    const smuggled = {
      defendant: { appearance: 3, demeanour: 2, oddity: 97 },
    } as unknown as GeneratedCase;

    const cleaned = stripPresentation(smuggled, seeded(7));
    assert.notEqual(cleaned.defendant.appearance, 3);
    assert.notEqual(cleaned.defendant.demeanour, 2);
    assert.notEqual(cleaned.defendant.oddity, 97);
  });

  it('spreads people across the range rather than piling them at the ends', () => {
    // A flat distribution puts as many openly bizarre defendants in the dock as
    // ordinary ones, and then strangeness stops being something a player can be
    // caught reacting to, because everyone is strange.
    const roll = seeded(99);
    const values = Array.from({ length: 5000 }, () => rollPresentation(roll).oddity);
    const middle = values.filter((v) => v > 30 && v < 70).length / values.length;
    const extreme = values.filter((v) => v < 10 || v > 90).length / values.length;

    assert.ok(middle > 0.55, `only ${(middle * 100).toFixed(0)}% of people are ordinary`);
    assert.ok(extreme < 0.06, `${(extreme * 100).toFixed(0)}% of people are extreme — that is a freak show`);
  });

  it('still reaches both measurement bands often enough to score anybody', () => {
    // A distribution so tight that nobody ever lands in a band would make every
    // bias permanently zero, which reads as "no bias" and means "no data".
    const roll = seeded(1234);
    const draws = Array.from({ length: 2000 }, () => rollPresentation(roll));
    for (const channel of CHANNELS) {
      const { low, high } = BANDS[channel];
      const lows = draws.filter((d) => d[channel] <= low).length;
      const highs = draws.filter((d) => d[channel] >= high).length;
      assert.ok(lows > 100, `${channel}: only ${lows}/2000 land in the low band`);
      assert.ok(highs > 60, `${channel}: only ${highs}/2000 land in the high band`);
    }
  });
});

describe('reading a bias back', () => {
  const at = (value: number, convicted: boolean) => ({ convicted, value });

  it('reports nothing when one side of the comparison is empty', () => {
    // A juror who has never seen an openly strange defendant has no oddity
    // bias yet. Reporting one would be inventing a finding out of an absence,
    // and the Juror Record states findings to the player as fact.
    const onlyOrdinary = [at(50, true), at(50, false), at(20, true)];
    assert.equal(biasFor(onlyOrdinary, 'oddity'), 0);
  });

  it('is positive when the low end is convicted more readily', () => {
    const verdicts = [
      at(10, true), at(20, true), at(15, true), at(30, false),   // 75% of the hard-faced
      at(90, false), at(80, false), at(70, false), at(85, true), // 25% of the disarming
    ];
    const score = biasFor(verdicts, 'appearance');
    assert.ok(score > 0, `expected a positive score, got ${score}`);
    assert.equal(Math.round(score), 50);
  });

  it('is negative when the high end is convicted more readily', () => {
    const verdicts = [at(10, false), at(20, false), at(90, true), at(80, true)];
    assert.ok(biasFor(verdicts, 'oddity') < 0);
  });

  it('is zero for a juror who treats both ends identically', () => {
    const verdicts = [at(10, true), at(20, false), at(90, true), at(80, false)];
    assert.equal(biasFor(verdicts, 'demeanour'), 0);
  });

  it('stays quiet below the reporting threshold', () => {
    // A small gap on a short record is noise, and the court does not accuse
    // anybody on the strength of noise.
    for (const channel of CHANNELS) {
      assert.equal(describeBias(channel, 12), null);
      assert.equal(describeBias(channel, -12), null);
      assert.ok(describeBias(channel, 45));
      assert.ok(describeBias(channel, -45));
    }
  });

  it('describes each channel in the court’s voice, never as an accusation', () => {
    for (const channel of CHANNELS) {
      for (const score of [45, -45]) {
        const line = describeBias(channel, score)!;
        // Every line has to slot into "Court records note that this juror ...".
        assert.ok(/^(convicts|acquits|spares)/.test(line), `"${line}" is not a verb phrase`);
        assert.ok(!/\b(you|your|prejudice|racist|bigot|should)\b/i.test(line),
          `"${line}" moralises — the record states, it does not lecture`);
      }
    }
  });

  it('gives the three channels three distinct descriptions', () => {
    // Three channels sharing a sentence would tell the player they have one
    // bias when the record found three, which is worse than saying nothing.
    const lines = CHANNELS.map((c) => describeBias(c, 45));
    assert.equal(new Set(lines).size, 3, `descriptions collide: ${lines}`);
  });
});
