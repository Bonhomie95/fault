/**
 * Skin tone, kept at runtime.
 *
 * The archetype fixes the anatomy AND the ancestry — each .glb carries a
 * photographed skin chosen to match it — so what is left for runtime is the
 * variation WITHIN that: how light or how warm this particular person is.
 *
 * WHICH IS WHY THESE ARE NEARLY WHITE. They multiply over the texture, and the
 * first version of this file was a spread of absolute skin colours from
 * `#FFDBAC` to `#5C3317`. That was right when the models shipped with a neutral
 * shader and wrong the moment they shipped with a real skin: a dark-skinned
 * African texture multiplied by a dark brown came out almost black, and the
 * same six people looked like a different, worse set of six depending only on
 * which seed drew them. A multiplier near white leaves the photograph alone;
 * the spread below is about a fifth of a stop either side of it, with a little
 * warmth and a little sallowness at the ends, which is the range a real face
 * covers between one person and the next of the same ancestry.
 */
const TONES = [
  '#FFFFFF', '#F2E6DC', '#E6D8CC', '#FFF4E8', '#EFE4DA',
  '#F7ECE2', '#E2D4C8', '#FFF0E2', '#EADCD0', '#F5E8DE',
];

export function skinToneFor(seed: number): string {
  return TONES[Math.abs(seed) % TONES.length]!;
}
