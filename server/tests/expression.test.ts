import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { EXPRESSIONS, REACTION_NAMES, amplify, blend, blinkPeriodMs, defendantExpression, intensityFor, tellFor, type RoomState, witnessExpression } from '../../mobile/components/scene2d/expression.js';

/**
 * The expression system, and the one invariant that matters.
 *
 * FAULT measures `appearance_bias` — whether a defendant's face moved the
 * player's verdict — and that measurement is only meaningful because
 * appearance is generated blind to guilt. Expression has to live inside that
 * constraint: a defendant who flinches at the exhibit that actually convicts
 * them is the game answering its own question.
 *
 * These tests live in the SERVER suite on purpose. There is no test runner in
 * the mobile app, and this module is not really a rendering concern — it is
 * the client half of a measurement the server depends on. It belongs where it
 * will actually be run.
 */

const room = (over: Partial<RoomState> = {}): RoomState => ({
  tab: 'defendant',
  examiningEvidence: false,
  witnessSpeaking: false,
  remaining: 100,
  tensionAt: 15,
  ...over,
});

describe('expression cannot leak the answer', () => {
  it('takes no input that could carry guilt', () => {
    // The enforcement is the signature: RoomState has no verdict, no evidence
    // strength, and — critically — no exhibit ID. `examiningEvidence` is a
    // boolean, so the face cannot react to a PARTICULAR piece of evidence even
    // if someone later wanted it to.
    const keys = Object.keys(room()).sort();
    assert.deepEqual(keys, [
      'examiningEvidence',
      'remaining',
      'tab',
      'tensionAt',
      'witnessSpeaking',
    ]);
  });

  it('never mentions the verdict or the evidence strength in its source', () => {
    // A blunt check, and worth having: the whole safety of this system is that
    // it cannot see those fields. If someone plumbs them through later, this
    // fails and they have to argue with the comment at the top of the module.
    const source = readFileSync(
      fileURLToPath(new URL('../../mobile/components/scene2d/expression.ts', import.meta.url)),
      'utf8',
    );
    const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''); // strip comments

    for (const forbidden of ['correct_verdict', 'correctVerdict', 'evidence_strength', 'evidenceStrength', 'is_planted', 'isPlanted']) {
      assert.ok(!code.includes(forbidden), `expression.ts reads ${forbidden} — the face now knows the answer`);
    }
  });

  it('imports nothing, which is what lets this suite run at all', () => {
    // expression.ts lives in the mobile package and is tested from the server
    // one, because the server suite is the only test runner in this repo. That
    // only works while the module has no imports: the moment it reaches for a
    // react-native module or the `@/` alias, this file stops compiling and the
    // guilt-independence checks above stop running — silently, in CI.
    //
    // It has no imports today by design. This keeps it that way.
    const source = readFileSync(
      fileURLToPath(new URL('../../mobile/components/scene2d/expression.ts', import.meta.url)),
      'utf8',
    );
    const imports = source.match(/^\s*import\s/gm) ?? [];
    assert.equal(
      imports.length,
      0,
      'expression.ts has grown an import; either remove it or move these tests into the app',
    );
  });

  it('gives the same face to the same person regardless of anything else', () => {
    // Determinism is what makes an echo land: a returning character must carry
    // the same tell, or the recognition the Echo System is built on is noise.
    for (const seed of [1, 42, 199, 5_000]) {
      assert.equal(tellFor(seed), tellFor(seed));
      assert.equal(defendantExpression(seed, room()), defendantExpression(seed, room()));
      assert.equal(blinkPeriodMs(seed), blinkPeriodMs(seed));
    }
  });
});

describe('expression reads the room', () => {
  it('gives different people different faces in the same room', () => {
    const seen = new Set(
      Array.from({ length: 200 }, (_, seed) => defendantExpression(seed, room())),
    );
    assert.ok(seen.size >= 3, `only ${seen.size} distinct expressions across 200 people`);
  });

  it('gives one person different faces in different rooms', () => {
    // A face that never changes is a photograph, which is what this replaced.
    for (const seed of [7, 42, 113]) {
      const byTab = (['defendant', 'evidence', 'witnesses', 'arguments'] as const).map((tab) =>
        defendantExpression(
          seed,
          room({ tab, examiningEvidence: tab === 'evidence', witnessSpeaking: tab === 'witnesses' }),
        ),
      );
      assert.ok(new Set(byTab).size >= 2, `seed ${seed} wears one face everywhere: ${byTab}`);
    }
  });

  it('spreads all four tells across the population', () => {
    const tells = new Set(Array.from({ length: 400 }, (_, s) => tellFor(s)));
    assert.equal(tells.size, 4, `only ${[...tells]} occur`);
  });

  it('leaves counsel to talk past the accused', () => {
    // GDD: on the arguments tab the two lawyers argue and the defendant is
    // furniture to them. Neutral is the correct read, for everyone.
    for (const seed of [1, 42, 199]) {
      assert.equal(defendantExpression(seed, room({ tab: 'arguments' })), 'neutral');
    }
  });
});

describe('the clock shows on the face', () => {
  it('does nothing until the tension threshold', () => {
    assert.equal(intensityFor(room({ remaining: 100 })), 1);
    assert.equal(intensityFor(room({ remaining: 16 })), 1);
    assert.equal(intensityFor(room({ remaining: 15 })), 1);
  });

  it('tightens as the window closes', () => {
    const at8 = intensityFor(room({ remaining: 8 }));
    const at2 = intensityFor(room({ remaining: 2 }));
    assert.ok(at8 > 1, 'nothing happened at 8 seconds');
    assert.ok(at2 > at8, 'the last two seconds are not tighter than the last eight');
    assert.ok(at2 <= 1.75, 'intensity ran away');
  });

  it('actually moves the geometry, which the first version did not', () => {
    // The bug this locks down: pressure used to switch to a DIFFERENT
    // expression whose mapping was identical to the calm one, so the final
    // fifteen seconds changed nothing at all on screen.
    const calm = room({ remaining: 100 });
    const urgent = room({ remaining: 2 });

    const a = amplify(EXPRESSIONS[defendantExpression(42, calm)], intensityFor(calm));
    const b = amplify(EXPRESSIONS[defendantExpression(42, urgent)], intensityFor(urgent));

    assert.notEqual(a.browAngle, b.browAngle, 'the clock is invisible on the face');
    assert.ok(Math.abs(b.browAngle) > Math.abs(a.browAngle));
  });

  it('does not push the eyes out of the head', () => {
    // Gaze is the one delta that must not scale: an amplified gaze is a pupil
    // sliding off the sclera.
    const hard = amplify(EXPRESSIONS.ashamed, 1.75);
    assert.equal(hard.gazeX, EXPRESSIONS.ashamed.gazeX);
    assert.equal(hard.gazeY, EXPRESSIONS.ashamed.gazeY);
  });
});

describe('expressions stay inside the person', () => {
  it('keeps every trial delta small enough to be a face and not a mask', () => {
    // These sit on top of faceGeom, not instead of it. A delta large enough to
    // swamp the base geometry would collapse every defendant onto six faces
    // and take appearance_bias with it.
    for (const [name, d] of Object.entries(EXPRESSIONS)) {
      if ((REACTION_NAMES as readonly string[]).includes(name)) continue;
      assert.ok(Math.abs(d.browAngle) <= 0.2, `${name} browAngle is too strong`);
      assert.ok(Math.abs(d.mouthCurve) <= 0.35, `${name} mouthCurve is too strong`);
      assert.ok(Math.abs(d.lidDrop) <= 0.35, `${name} lidDrop is too strong`);
      assert.ok(Math.abs(d.headTilt) <= 4, `${name} headTilt is too strong`);
      assert.ok(Math.abs(d.gazeX) <= 0.2 && Math.abs(d.gazeY) <= 0.2, `${name} gaze is too strong`);
    }
  });

  it('lets the reactions go further, but not out of the head', () => {
    /**
     * The verdict-screen faces are held to a looser bound than the trial ones,
     * and the difference is not cosmetic.
     *
     * The tight limit above exists to protect a measurement: while a case is
     * being judged, the expression must not swamp the geometry, or every
     * defendant collapses onto six faces and appearance_bias stops measuring
     * appearance. None of that applies after the gavel. The case is recorded,
     * nothing further is measured from this face, and the whole point of the
     * beat is that the accused finally stops holding it together.
     *
     * They are still bounded. A reaction that leaves the head is not drama,
     * it is a broken drawing — and gaze in particular keeps the SAME limit as
     * everywhere else, because the eye geometry is anatomical now and a pupil
     * pushed past this slides out through the lids.
     *
     * The numbers here are large because they had to be. Rendered side by side
     * at portrait size the first attempt was five identical faces: the fissure
     * is only about 10mm tall now that it is drawn to life, so lidDrop moves
     * the lid roughly a pixel, and gaze has almost nowhere to travel. What
     * reads at this scale is the brow line, the mouth, and the angle of the
     * head — so that is where the reaction has to live.
     */
    for (const name of REACTION_NAMES) {
      const d = EXPRESSIONS[name];
      assert.ok(Math.abs(d.browAngle) <= 0.6, `${name} browAngle is too strong`);
      assert.ok(Math.abs(d.mouthCurve) <= 1, `${name} mouthCurve is outside its own range`);
      assert.ok(Math.abs(d.lidDrop) <= 0.7, `${name} lidDrop is too strong`);
      assert.ok(Math.abs(d.headTilt) <= 10, `${name} headTilt is too strong`);
      assert.ok(Math.abs(d.gazeX) <= 0.2 && Math.abs(d.gazeY) <= 0.2, `${name} gaze is too strong`);
    }
  });

  it('separates the two acquittals by more than a shade', () => {
    // The smirk is the beat this feature exists for. If it ever drifts close
    // enough to relief to be mistaken for it, letting a guilty man go stops
    // costing the player anything.
    const smirk = EXPRESSIONS.smirk;
    const relief = EXPRESSIONS.relief;
    assert.ok(smirk.mouthCurve > 0 && relief.mouthCurve > 0, 'both acquittals should read as a smile');
    // What separates them is where the eyes go: the smirk holds the juror,
    // relief looks away.
    assert.ok(
      Math.abs(smirk.gazeY - relief.gazeY) + Math.abs(smirk.gazeX - relief.gazeX) > 0.08,
      'smirk and relief look the same way — nothing distinguishes them',
    );
    assert.ok(smirk.browAngle > relief.browAngle, 'the smirk should carry the harder brow');
  });

  it('blends, and clamps outside 0..1', () => {
    const half = blend(EXPRESSIONS.neutral, EXPRESSIONS.defiant, 0.5);
    assert.ok(Math.abs(half.browAngle - EXPRESSIONS.defiant.browAngle / 2) < 1e-9);

    assert.deepEqual(blend(EXPRESSIONS.neutral, EXPRESSIONS.defiant, 2), EXPRESSIONS.defiant);
    assert.deepEqual(blend(EXPRESSIONS.neutral, EXPRESSIONS.defiant, -1), EXPRESSIONS.neutral);
  });

  it('gives witnesses a face without giving away which of them is lying', () => {
    // The client is never told which witness lies, and if it were, this would
    // be the exact place the tell leaked. Witness expression is seeded from the
    // NAME and nothing else — same input, same face, no correlation available.
    const a = witnessExpression(1234, room({ tab: 'witnesses', witnessSpeaking: true }));
    const b = witnessExpression(1234, room({ tab: 'witnesses', witnessSpeaking: true }));
    assert.equal(a, b);
    // And they are quiet everywhere except their own tab.
    assert.equal(witnessExpression(1234, room({ tab: 'evidence' })), 'neutral');
  });

  it('varies blink rate per person, within human bounds', () => {
    const periods = Array.from({ length: 50 }, (_, s) => blinkPeriodMs(s));
    assert.ok(Math.min(...periods) >= 2600);
    assert.ok(Math.max(...periods) <= 5800);
    assert.ok(new Set(periods.map(Math.round)).size > 40, 'everyone blinks at the same rate');
  });
});
