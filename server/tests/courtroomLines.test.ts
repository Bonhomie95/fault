import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generatedCaseSchema, leaksVerdict } from '../src/domain/case.js';
import { profileFor } from '../src/domain/jurisdiction.js';
import { localizeCase } from '../src/services/localizeCase.js';
import { SEED_CASES } from '../src/services/seedCases.js';

const localized = (i: number) => {
  const profile = profileFor('NO');
  const district = profile.districts[0]!;
  return localizeCase(SEED_CASES[i]!, {
    profile,
    district,
    court: profile.courtName('district', district),
    policeService: profile.policeService(district),
    seed: 11 + i,
  });
};

describe('courtroom lines', () => {
  it('drops a confession, whoever says it', () => {
    for (const text of [
      'I did it, and I would do it again.',
      'It was an accident, I swear.',
      'I never meant for it to go that far.',
      'I’m guilty. There, I said it.',
      'I never intended to lie, but I was sure I saw the cash.',
      'Fine — I lied about the time.',
    ]) {
      assert.equal(leaksVerdict(text), true, text);
    }
  });

  it('keeps denials, appeals and accusations — both sides say those', () => {
    for (const text of [
      'I didn’t do this.',
      'Ask him where he was that night.',
      'Please. Look at me.',
      'That money buried my father.',
    ]) {
      assert.equal(leaksVerdict(text), false, text);
    }
  });

  it('a malformed line is dropped, not the case', () => {
    const base = localized(0);
    const parsed = generatedCaseSchema.safeParse({
      ...base,
      courtroom_lines: [
        { speaker: 'defendant', cue: 'open', tone: 'pleading', text: 'Please believe me.' },
        { speaker: 'the judge', cue: 'open', tone: 'calm', text: 'Order.' },
        { speaker: 'defendant', cue: 'e1', tone: 'ashamed', text: 'It was an accident.' },
        'not even an object',
      ],
    });
    assert.ok(parsed.success);
    assert.deepEqual(
      parsed.data.courtroom_lines.map((l) => l.text),
      ['Please believe me.'],
    );
  });

  it('an unknown tone falls back rather than failing the line', () => {
    const parsed = generatedCaseSchema.safeParse({
      ...localized(0),
      courtroom_lines: [{ speaker: 'defence', cue: 'arguments', tone: 'smug', text: 'Think it over.' }],
    });
    assert.ok(parsed.success);
    assert.equal(parsed.data.courtroom_lines[0]?.tone, 'tense');
  });

  it('a case with no lines at all is still a case', () => {
    const { courtroom_lines: _dropped, ...rest } = localized(1);
    const parsed = generatedCaseSchema.safeParse(rest);
    assert.ok(parsed.success);
    assert.deepEqual(parsed.data.courtroom_lines, []);
  });

  SEED_CASES.forEach((_, i) => {
    it(`authored case ${i + 1}: every line survives the guard and is localised`, () => {
      const c = localized(i);
      const parsed = generatedCaseSchema.parse(c);
      assert.equal(parsed.courtroom_lines.length, c.courtroom_lines.length, 'a line was dropped');
      assert.ok(parsed.courtroom_lines.some((l) => l.speaker === 'defendant' && l.cue === 'open'));
      for (const l of parsed.courtroom_lines) assert.doesNotMatch(l.text, /\{[A-Z0-9_]+\}/);
    });

    it(`authored case ${i + 1}: 9-12 lines, none of which gives the answer away in any country`, () => {
      const template = SEED_CASES[i]!;
      const lines = template.courtroom_lines ?? [];
      assert.ok(lines.length >= 9 && lines.length <= 12, `${lines.length} lines`);
      // Every cue a juror can trigger should usually have something to say, and
      // no single voice should carry the whole room.
      const speakers = new Set(lines.map((l) => l.speaker));
      assert.ok(speakers.has('defendant') && speakers.has('prosecution'), 'both sides speak');
      assert.ok(speakers.has('witness1') && speakers.has('witness2'), 'both witnesses speak');
      for (const code of ['NO', 'NG', 'US', 'IN']) {
        const profile = profileFor(code);
        const district = profile.districts[0]!;
        const c = localizeCase(template, {
          profile,
          district,
          court: profile.courtName('district', district),
          policeService: profile.policeService(district),
          seed: 3 + i,
        });
        for (const l of c.courtroom_lines) {
          assert.equal(leaksVerdict(l.text), false, `${code}: "${l.text}"`);
          const words = l.text.trim().split(/\s+/).length;
          assert.ok(words <= 24, `${code}: ${words} words in "${l.text}"`);
        }
        assert.equal(generatedCaseSchema.parse(c).courtroom_lines.length, lines.length, code);
      }
    });
  });
});

describe('name presentation', async () => {
  const { presentsFeminine } = await import('../src/domain/nameGender.js');
  const { profileFor } = await import('../src/domain/jurisdiction.js');

  it('reads the register names it knows, and admits the ones it does not', () => {
    assert.equal(presentsFeminine('Ngozi Chukwu'), true);
    assert.equal(presentsFeminine('Emeka Obi'), false);
    assert.equal(presentsFeminine('Dana Reyes'), null);
  });

  it('every NG register name is classified or deliberately unisex', () => {
    const unisex = new Set(['Yemi']);
    for (const n of profileFor('NG').texture.givenNames) {
      if (unisex.has(n)) continue;
      assert.notEqual(presentsFeminine(`${n} X`), null, n);
    }
  });
});

describe('authored cases cast names that match their pronouns', async () => {
  const { presentationOf } = await import('../src/services/localizeCase.js');
  const { presentsFeminine } = await import('../src/domain/nameGender.js');

  for (const country of ['NO', 'NG', 'US']) {
    it(`in ${country}, a "she" defendant gets a woman's name`, () => {
      const profile = profileFor(country);
      const district = profile.districts[0]!;
      SEED_CASES.forEach((template, i) => {
        const want = presentationOf(template)[0];
        if (!want) return;
        for (const seed of [3, 17, 91]) {
          const c = localizeCase(template, {
            profile,
            district,
            court: profile.courtName('district', district),
            policeService: profile.policeService(district),
            seed: seed + i,
          });
          const reads = presentsFeminine(c.defendant.name);
          if (reads === null) continue;
          assert.equal(reads, want === 'f', `case ${i + 1} ${country}: ${c.defendant.name}`);
        }
      });
    });
  }
});
