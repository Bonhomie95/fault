/**
 * The one seeded random the renderers share.
 *
 * A defendant's face is derived, not stored: the server sends a
 * `portraitSeed` and every renderer works out the same person from it. That
 * only holds while they all draw from the SAME function on the SAME channel,
 * which is why this is a module rather than a copy in each of them — the
 * drawn accused and the model disagreeing about someone's hair is a detail,
 * and disagreeing about their sex is not.
 *
 * `channel` separates the axes. Two features taken from the same channel move
 * together, which is how a soft brow ends up correlated with a good suit; the
 * room's whole argument is that those two are independent.
 */
export function rand(seed: number, channel: number): number {
  const x = Math.sin(seed * 127.1 + channel * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Channel 11 is presentation: how this defendant reads. See scene2d/CourtroomScene. */
export const FEMININE_CHANNEL = 11;
/** Which of the archetypes of that presentation gets used. Its own channel. */
export const ARCHETYPE_CHANNEL = 3;
