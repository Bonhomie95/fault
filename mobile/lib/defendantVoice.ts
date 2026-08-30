/**
 * What the accused says while you decide.
 *
 * The face is a tell that means nothing (Head.tsx); the body is a tell that
 * means nothing (Figure.tsx); this is the third one. A defendant pleads,
 * protests, appeals to you — and none of it is evidence. A frightened innocent
 * and a frightened guilty man say the same words in the same voice, and a juror
 * who is moved by "please, I have a family" is being moved by nothing. That is
 * the whole game: notice which signals you actually followed.
 *
 * So the lines are deliberately generic emotional appeals, not claims of fact.
 * Nothing here asserts an alibi or contradicts a specific case ("I wasn't
 * there" would be a lie in a case that was never about presence). They are the
 * things anyone in the dock says, guilty or not, and they are chosen by the
 * defendant's seed so the same person always says the same things.
 *
 * There is no audio (GDD: "no need for speech for now"); these are rendered as
 * thoughts in a bubble. When the server one day ships a real per-case
 * statement, swap the pool for that — the ThoughtBox does not care where the
 * lines come from.
 */

/**
 * The pool. First person, present tense, short enough to read at a glance in a
 * bubble over a moving head. Every one of them is something a person says when
 * they are afraid of you, which is the point — fear is not guilt and is not
 * innocence.
 */
const APPEALS = [
  'I didn’t do this.',
  'You have to believe me.',
  'Please. Look at me.',
  'This is a mistake.',
  'I have a family.',
  'Why would I do that?',
  'I’m not who they say I am.',
  'I just want to go home.',
  'You don’t know me.',
  'I’ve never hurt anyone.',
  'Don’t let them do this.',
  'I swear it wasn’t me.',
] as const;

function rand(seed: number, channel: number): number {
  const x = Math.sin(seed * 127.1 + channel * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Three lines for this defendant, in a stable order, no repeats.
 *
 * Deterministic from the seed, exactly like the face and the build — a
 * defendant the Echo System brings back years later says the same things, in
 * the same order, because it is the same person.
 */
export function defendantLines(seed: number, count = 3): string[] {
  const pool = [...APPEALS];
  const picked: string[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(rand(seed, i + 1) * pool.length) % pool.length;
    picked.push(pool[idx]!);
    pool.splice(idx, 1);
  }
  return picked;
}
