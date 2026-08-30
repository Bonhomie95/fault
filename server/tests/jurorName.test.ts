import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkJurorName, NAME_MAX, NAME_MIN } from '../src/domain/jurorName.js';

/**
 * The juror name is the only user-generated string in this game, and it is
 * published to every other player on the leaderboard. It had no filter at all:
 * `z.string().trim().min(1).max(40)`, which accepted a script tag.
 *
 * The two halves of this file pull in opposite directions on purpose, and both
 * halves matter equally. A filter that stops every attack and also stops 坂本
 * 龍一 is not a strict filter, it is a broken one — and the first version of
 * this module did exactly that, because it tested membership against an ASCII
 * fold. In a game whose premise is sitting in the courts of your own country,
 * refusing most of the world's names is the more serious bug.
 */

const cp = (n: number) => String.fromCodePoint(n);

describe('a juror name is user-generated content', () => {
  it('accepts an ordinary name unchanged', () => {
    const r = checkJurorName('Ada Lovelace');
    assert.equal(r.ok, true);
    assert.equal(r.value, 'Ada Lovelace');
  });

  it('accepts names from every register the game can stage a case in', () => {
    // Not decoration. The game localises to real countries and names people
    // from their real registers; a Latin-only filter contradicts the product.
    const names = [
      'Kjetil Bjørnsen', // Norwegian
      'Ngozi Okonkwo-Bello', // Nigerian, hyphenated
      '坂本 龍一', // Japanese
      '김민준', // Korean
      'Мария Иванова', // Cyrillic
      'Ἀριστοτέλης', // Greek, polytonic
      'אברהם לוי', // Hebrew
      'محمد الأمين', // Arabic
      'สมชาย', // Thai
      'राज कुमार', // Devanagari
      'Ọlúwaṣeun', // Yoruba, sub-dots
      'Nguyễn Thị Hoa', // Vietnamese, stacked marks
      'Þórunn', // Icelandic
      "José O'Brien-Silva", // apostrophe and hyphen
    ];

    for (const name of names) {
      const r = checkJurorName(name);
      assert.equal(r.ok, true, `rejected a real name: ${name} (${r.reason})`);
    }
  });

  it('normalises rather than rejecting where it reasonably can', () => {
    // The stored value is never byte-identical to the input, and callers must
    // persist `value` rather than what was typed.
    assert.equal(checkJurorName('  Ada   Lovelace  ').value, 'Ada Lovelace');
    // Non-breaking spaces, pasted in from elsewhere.
    assert.equal(checkJurorName(`Ada${cp(0x00a0)}Lovelace`).value, 'Ada Lovelace');
  });
});

describe('a juror name cannot be an attack', () => {
  it('refuses the payload the audit signed up with', () => {
    // This exact string created a real account before the filter existed.
    const r = checkJurorName('<img src=x onerror=alert(1)>');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'unsupported_characters');
  });

  it('refuses markup and shell punctuation generally, not just that payload', () => {
    // Refusing the characters beats pattern-matching the attack: a filter that
    // looks for "onerror" is a filter you lose to the next encoding.
    for (const name of ['a<b', 'a>b', 'a{b}', 'a[b]', 'a\\b', 'a|b', 'a&b', 'a$b', 'a`b', 'a^b', 'a~b']) {
      assert.equal(checkJurorName(name).ok, false, `allowed ${name}`);
    }
  });

  it('refuses bidi overrides, which rewrite the row they sit in', () => {
    for (const c of [0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]) {
      const r = checkJurorName(`Ada${cp(c)}Lovelace`);
      assert.equal(r.ok, false, `allowed U+${c.toString(16)}`);
    }
  });

  it('refuses zero-width characters, which split a word past any blocklist', () => {
    for (const c of [0x200b, 0x200c, 0x200d, 0xfeff]) {
      // Also the specific attack: a zero-width joiner inside a reserved word.
      const r = checkJurorName(`Ad${cp(c)}min`);
      assert.equal(r.ok, false, `allowed U+${c.toString(16)}`);
    }
  });

  it('refuses control characters', () => {
    // NUL, ESC, DEL and the soft hyphen have no whitespace reading — there is
    // nothing to normalise them into, so they are refused outright.
    for (const c of [0x0000, 0x0001, 0x001b, 0x007f, 0x0085, 0x009f, 0x00ad]) {
      assert.equal(checkJurorName(`Ada${cp(c)}Lovelace`).ok, false, `allowed U+${c.toString(16)}`);
    }
  });

  it('normalises whitespace-like controls instead of refusing them', () => {
    // A tab, a newline or a NEL between two words is somebody pasting from a
    // spreadsheet, not an attack. Collapsing them to a single space is the
    // kinder and equally safe answer — the dangerous ones above have no such
    // reading. U+2028 and U+2029 land here too: JavaScript's \s covers them,
    // so they become a space before the forbidden-character check ever sees
    // them, and either outcome is safe.
    //
    // U+0085 (NEL) is deliberately NOT in this list — \s does not cover it,
    // so it falls to the C1 range above and is refused. Nobody types it;
    // refusing is the safe side of a choice that costs nothing.
    for (const c of [0x0009, 0x000a, 0x000d, 0x2028, 0x2029]) {
      const r = checkJurorName(`Ada${cp(c)}Lovelace`);
      assert.equal(r.ok, true, `refused a pasted separator U+${c.toString(16)}`);
      assert.equal(r.value, 'Ada Lovelace', `did not normalise U+${c.toString(16)}`);
    }
  });

  it('refuses a pile of combining marks but keeps ordinary diacritics', () => {
    const acute = cp(0x0301);
    // Two is a legitimate stack — Vietnamese does it routinely.
    assert.equal(checkJurorName(`Nguyễn Hoa`).ok, true);
    // Six is zalgo, and it overflows the row for everyone else on the board.
    assert.equal(checkJurorName(`e${acute.repeat(6)}x`).ok, false);
  });

  it('refuses a name with no letters in it', () => {
    // Punctuation or emoji only: cannot be read aloud, searched for, or
    // reported, so it is not a name.
    assert.equal(checkJurorName('...').ok, false);
    assert.equal(checkJurorName('!!!').ok, false);
  });
});

describe('a juror name cannot impersonate the court', () => {
  it('refuses the obvious ones', () => {
    for (const name of ['Admin', 'admin', 'Moderator', 'FAULT', 'Support', 'System']) {
      const r = checkJurorName(name);
      assert.equal(r.ok, false, `allowed ${name}`);
      assert.equal(r.reason, 'reserved');
    }
  });

  it('refuses them through spacing, case, and punctuation', () => {
    // The blocklist is matched against an aggressively folded form, so a name
    // cannot be walked past it with decoration.
    for (const name of ['A d m i n', 'A.d.m.i.n', '  ADMIN  ', 'a-d-m-i-n']) {
      assert.equal(checkJurorName(name).ok, false, `allowed ${name}`);
    }
  });

  it('refuses leetspeak and homoglyph substitutions', () => {
    // "M0derator" with a zero, and "Мoderator" with a Cyrillic М that renders
    // identically to the Latin one in almost every typeface.
    assert.equal(checkJurorName('M0derator').ok, false);
    assert.equal(checkJurorName(`${cp(0x041c)}oderator`).ok, false);
    assert.equal(checkJurorName('4dmin').ok, false);
  });

  it('refuses fullwidth forms', () => {
    assert.equal(checkJurorName('ＦＡＵＬＴ').ok, false);
  });

  it('refuses reserved prefixes however they continue', () => {
    assert.equal(checkJurorName('FAULT Official').ok, false);
    assert.equal(checkJurorName('Admin Kjetil').ok, false);
  });

  it('does not refuse a real name that merely contains a reserved word', () => {
    // The prefix rule is deliberately a prefix rule. Someone whose name ends
    // in a blocked substring is not impersonating anyone.
    assert.equal(checkJurorName('Sofia Modena').ok, true);
    assert.equal(checkJurorName('Helen Rootes').ok, true);
  });
});

describe('a juror name has to be a name', () => {
  it('enforces the length bounds', () => {
    assert.equal(checkJurorName('x').reason, 'too_short');
    assert.equal(checkJurorName('q'.repeat(NAME_MAX + 1)).reason, 'too_long');
    assert.equal(checkJurorName('q'.repeat(NAME_MAX)).ok, true);
    assert.equal(checkJurorName('q'.repeat(NAME_MIN)).ok, true);
  });

  it('measures length after normalisation, not before', () => {
    // Trailing whitespace must not push an acceptable name over the limit.
    const padded = `${'q'.repeat(NAME_MAX)}      `;
    assert.equal(checkJurorName(padded).ok, true);
  });

  it('always explains itself without quoting the input back', () => {
    const r = checkJurorName('<script>');
    assert.equal(r.ok, false);
    assert.ok(r.message, 'a rejection must say what to change');
    assert.ok(!r.message!.includes('<script>'), 'never echo the input into a message');
  });
});
