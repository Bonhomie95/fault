/**
 * What a juror may call themselves.
 *
 * This is user-generated content on a public registry. The name a player types
 * is shown to every other player on the leaderboard, and until now the only
 * rule was `z.string().trim().min(1).max(40)` — which accepted, and I checked,
 * `<img src=x onerror=alert(1)>`.
 *
 * React Native's <Text> will not execute that, so there was never an XSS in
 * the app. That is luck, not a control: the boards screen is one design change
 * away from being a WebView, and the same string is one integration away from
 * an email, a push notification, or a support dashboard. Output escaping is
 * the other half and belongs at the point of render; this is the input half.
 *
 * The three real problems, in order of how quickly they bite:
 *
 *   1. IMPERSONATION. Nothing stopped "FAULT Admin", "Apple Support" or
 *      "Moderator" appearing beside a real rank on a public list.
 *   2. RENDERING ATTACKS. Bidi overrides reverse the rest of a line;
 *      zero-width joiners and stacked combining marks ("zalgo") overflow a row
 *      and break the layout of the boards screen for everyone on it.
 *   3. ABUSE. No blocklist, no reporting path, and — worse — no way to rename
 *      an account, so the only remedy available to an operator was deleting a
 *      player's entire career.
 *
 * App Store Guideline 1.2 requires a content filter, a reporting mechanism,
 * and the ability to act on a report, for any app with user-generated content.
 * A public name list is user-generated content.
 *
 * This module is the filter. `routes/report.ts` is the reporting mechanism and
 * `PATCH /api/session/me/name` is the ability to act.
 */

export type NameRejection =
  | 'empty'
  | 'too_long'
  | 'too_short'
  | 'unsupported_characters'
  | 'reserved'
  | 'not_allowed';

export interface NameCheck {
  ok: boolean;
  /** The value to store. Normalised — never exactly what was typed. */
  value: string;
  reason?: NameRejection;
  /** Shown to the player. Says what to change, never quotes their input back. */
  message?: string;
}

export const NAME_MIN = 2;
export const NAME_MAX = 32;

/**
 * Characters that do not belong in a display name, ever.
 *
 * Expressed as numeric code point ranges rather than a regex literal, for one
 * blunt reason: every character in this list is invisible. A regex containing
 * them is a regex nobody can read, review, or diff — and a reviewer who cannot
 * see a character cannot tell whether it is in the list or missing from it.
 *
 *   0x0000-0x001F, 0x007F-0x009F  C0 and C1 controls
 *   0x00AD                        soft hyphen: invisible until it breaks a line
 *   0x200B-0x200D                 zero-width space, non-joiner, joiner. These
 *                                 defeat any blocklist by splitting a word in
 *                                 half without leaving a visible seam
 *   0x202A-0x202E, 0x2066-0x2069  bidi embeddings and overrides. These reverse
 *                                 the rendering direction of everything after
 *                                 them, so a name can rewrite the row it sits
 *                                 in on the public boards
 *   0x2028, 0x2029                line and paragraph separators
 *   0xFEFF                        zero-width no-break space / BOM
 */
const FORBIDDEN_RANGES: readonly (readonly [number, number])[] = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x00ad, 0x00ad],
  [0x200b, 0x200d],
  [0x202a, 0x202e],
  [0x2028, 0x2029],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
];

function hasForbiddenCharacter(name: string): boolean {
  for (const ch of name) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    for (const [lo, hi] of FORBIDDEN_RANGES) {
      if (cp >= lo && cp <= hi) return true;
    }
  }
  return false;
}

/** Combining marks. A few are ordinary diacritics; a stack of them is an attack. */
const COMBINING = /\p{M}/gu;
const MAX_COMBINING_RUN = 2;

/**
 * Markup and shell punctuation, which no name in any register needs.
 *
 * This is the check that actually stops the payload I signed up with —
 * `<img src=x onerror=alert(1)>`. Everything above it is about invisible
 * characters, and that string is entirely visible: it is ordinary letters plus
 * angle brackets, so it sailed through the control-character and blocklist
 * passes untouched.
 *
 * Refusing the characters rather than pattern-matching the payload is the
 * right shape here. There is no legitimate juror name containing `<` or `>`,
 * so there is nothing to weigh — and a filter that looks for "onerror" is a
 * filter you lose to the next encoding.
 *
 * `&` goes too: it is how an escaped payload gets un-escaped one layer later,
 * and no register writes an ampersand into a personal name.
 */
const STRUCTURAL = /[<>{}[\]\\^~`|&$]/u;

/**
 * Does this string contain enough actual letters or digits to be a name?
 *
 * Deliberately Unicode-aware — \p{L} and \p{N}, not [a-z0-9]. The first
 * version of this check reused the ASCII `fold` below and rejected 坂本 龍一,
 * along with every name in Greek, Cyrillic, Hebrew, Arabic, Devanagari, Thai
 * and Han. In a game whose entire premise is sitting in the courts of your own
 * country, a name filter that only accepts the Latin alphabet is not a filter,
 * it is a bug with a security justification attached.
 */
function letterCount(name: string): number {
  let n = 0;
  for (const ch of name) if (/[\p{L}\p{N}]/u.test(ch)) n++;
  return n;
}

/**
 * Names the court reserves.
 *
 * Matched against the aggressively-folded form (see `fold`), so "M0derator",
 * "m o d e r a t o r" and "Мoderator" with a Cyrillic М all collapse onto the
 * same entry. The list is short on purpose: it covers impersonation of this
 * game, its operators, and the platforms it ships on. General profanity is a
 * different problem with a different shape, and a hand-rolled wordlist is the
 * wrong tool for it — see the note at the foot of this file.
 */
const RESERVED = [
  'admin',
  'administrator',
  'moderator',
  'mod',
  'staff',
  'support',
  'help',
  'helpdesk',
  'official',
  'system',
  'root',
  'owner',
  'fault',
  'faultgame',
  'faultofficial',
  'faultsupport',
  'faultadmin',
  'thecourt',
  'chiefjustice',
  'apple',
  'applesupport',
  'google',
  'googleplay',
  'appstore',
  'playstore',
  'anonymous',
  'null',
  'undefined',
  'deleted',
  'deleteduser',
];

/** Prefixes nobody may take, however they continue. */
const RESERVED_PREFIXES = ['fault', 'admin', 'moderator', 'official', 'support'];

/**
 * Fold a name to the form the blocklist is written in.
 *
 * Strips diacritics, maps the obvious homoglyph and leetspeak substitutions,
 * and removes everything that is not a letter or a digit — so spacing,
 * punctuation and decoration cannot be used to walk a name past the list.
 * Deliberately lossy: this value is only ever compared, never stored.
 */
function fold(name: string): string {
  return name
    .normalize('NFKD')
    .replace(COMBINING, '')
    .toLowerCase()
    // Cyrillic and Greek lookalikes that render identically in most faces.
    .replace(/[аα]/g, 'a')
    .replace(/[еёε]/g, 'e')
    .replace(/[оοθ]/g, 'o')
    .replace(/[рρ]/g, 'p')
    .replace(/[сς]/g, 'c')
    .replace(/[хχ]/g, 'x')
    .replace(/[уγ]/g, 'y')
    .replace(/[кκ]/g, 'k')
    .replace(/[мμ]/g, 'm')
    .replace(/[ті]/g, 'i')
    .replace(/[nη]/g, 'n')
    // Leetspeak.
    .replace(/[0]/g, 'o')
    .replace(/[1!|]/g, 'l')
    .replace(/[3]/g, 'e')
    .replace(/[4@]/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[8]/g, 'b')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Clean a name up before judging it.
 *
 * NFKC rather than NFKD: it composes diacritics back into single code points
 * and folds compatibility forms (fullwidth Latin, ligatures, enclosed
 * alphanumerics) onto their plain equivalents, so "ＦＡＵＬＴ" and "FAULT" are
 * the same name rather than two.
 */
function normalise(raw: string): string {
  return raw
    .normalize('NFKC')
    // Every flavour of space collapses to one ordinary space. \s under /u
    // already covers NBSP, the quad/thin/hair spaces, the ideographic space
    // and the BOM, so listing them out was unreadable and redundant.
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Reject a run of stacked combining marks — legible diacritics, not zalgo. */
function hasCombiningPileup(name: string): boolean {
  let run = 0;
  for (const ch of name) {
    if (/\p{M}/u.test(ch)) {
      run++;
      if (run > MAX_COMBINING_RUN) return true;
    } else {
      run = 0;
    }
  }
  return false;
}

/**
 * Check and normalise a juror name.
 *
 * Returns the value to store, which is never byte-identical to the input —
 * callers must persist `value`, not what the player typed.
 */
export function checkJurorName(raw: string): NameCheck {
  const value = normalise(raw);

  if (value.length === 0) {
    return { ok: false, value, reason: 'empty', message: 'The court needs a name.' };
  }
  if (value.length > NAME_MAX) {
    return {
      ok: false,
      value,
      reason: 'too_long',
      message: `A juror name is at most ${NAME_MAX} characters.`,
    };
  }
  if (value.length < NAME_MIN) {
    return {
      ok: false,
      value,
      reason: 'too_short',
      message: `A juror name is at least ${NAME_MIN} characters.`,
    };
  }
  if (hasForbiddenCharacter(value) || hasCombiningPileup(value)) {
    return {
      ok: false,
      value,
      reason: 'unsupported_characters',
      message: 'That name uses characters the register cannot print.',
    };
  }

  if (STRUCTURAL.test(value)) {
    return {
      ok: false,
      value,
      reason: 'unsupported_characters',
      message: 'A juror name cannot contain brackets or symbols.',
    };
  }

  // A name with almost no letters in it is punctuation, emoji or decoration.
  // It cannot be read aloud, searched for, or reported — so it is not a name.
  // Counted across all of Unicode, not just ASCII: see letterCount.
  if (letterCount(value) < NAME_MIN) {
    return {
      ok: false,
      value,
      reason: 'unsupported_characters',
      message: 'A juror name needs at least two letters.',
    };
  }

  const folded = fold(value);

  if (RESERVED.includes(folded) || RESERVED_PREFIXES.some((p) => folded.startsWith(p))) {
    return {
      ok: false,
      value,
      reason: 'reserved',
      message: 'That name is reserved by the court. Choose another.',
    };
  }

  return { ok: true, value };
}

/**
 * NOTE ON PROFANITY.
 *
 * There is deliberately no slur or profanity wordlist here. A hand-maintained
 * one is the classic wrong answer: it is always incomplete, it is always
 * behind, it is monolingual in a game that ships to every country it can name
 * a court in, and it reliably blocks real people's real surnames while missing
 * the abuse it was written for.
 *
 * The design instead is: this filter for the structural attacks it can
 * actually settle (impersonation, rendering, unreadable input), plus a
 * reporting path and a rename so a human can act on what the filter cannot
 * decide. If a managed moderation service is added later, it plugs in HERE, as
 * one more async check in `checkJurorName`'s caller — not as a longer array.
 */
