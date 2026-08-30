/**
 * The cast, as files.
 *
 * Identity is baked per archetype rather than morphed at runtime, because
 * MPFB expresses gender, age and ancestry as COMBINATION shape keys — the set
 * of keys changes with the values, so there is no fixed list of targets a
 * client could drive. See tools/suspect/export_suspect.py.
 *
 * `require` rather than a path string: Metro has to see the literal to bundle
 * the asset, and expo-asset needs the module reference to resolve it on the
 * device.
 */
import { ARCHETYPE_CHANNEL, FEMININE_CHANNEL, rand } from '@/lib/seed';

export interface SuspectArchetype {
  name: string;
  feminine: boolean;
  module: number;
}

/* eslint-disable @typescript-eslint/no-require-imports --
 * Metro resolves assets from a LITERAL `require`. An import, a variable path
 * or a template string all leave the .glb out of the bundle and the model
 * fails to load on device with a file-not-found nobody sees in development.
 * This is the one place the rule has to give. */
export const ARCHETYPES: SuspectArchetype[] = [
  { name: 'f_young_af', feminine: true, module: require('@/assets/suspect/f_young_af.glb') },
  { name: 'f_mid_ca', feminine: true, module: require('@/assets/suspect/f_mid_ca.glb') },
  { name: 'f_young_as', feminine: true, module: require('@/assets/suspect/f_young_as.glb') },
  { name: 'm_young_af', feminine: false, module: require('@/assets/suspect/m_young_af.glb') },
  { name: 'm_mid_ca', feminine: false, module: require('@/assets/suspect/m_mid_ca.glb') },
  { name: 'm_old_as', feminine: false, module: require('@/assets/suspect/m_old_as.glb') },
];

/**
 * Which archetype a defendant is.
 *
 * Presentation comes from the same channel the drawn accused uses — the model
 * and the drawing have to be the same person, and the seam where they swap is
 * the one moment a player could catch them disagreeing. Indexing the whole
 * cast by the seed instead, which is what this did first, gave a man named
 * Hector a woman's face for as long as it took the .glb to parse and then
 * changed him.
 *
 * Skin tone is NOT decided here. `suspect/skin` modulates it at runtime from
 * its own channel, so the three files do not stand for three skin tones — an
 * archetype is a body and a face, and the tone is drawn across it.
 */
export function archetypeFor(seed: number): SuspectArchetype {
  const feminine = rand(seed, FEMININE_CHANNEL) > 0.62;
  const pool = ARCHETYPES.filter((a) => a.feminine === feminine);
  const index = Math.floor(rand(seed, ARCHETYPE_CHANNEL) * pool.length);
  return pool[Math.min(index, pool.length - 1)] ?? ARCHETYPES[0]!;
}

/**
 * A seed that produces this archetype — for the dev screen, which wants to
 * pick a person rather than a number.
 *
 * Searched rather than derived, because `archetypeFor` is one-way: it is a
 * hash, and inverting it would mean keeping a second copy of the rule that
 * could quietly stop agreeing with the first. Returns 0 if nothing matches,
 * which cannot happen while both presentations have an archetype.
 */
export function seedForArchetype(name: string): number {
  for (let seed = 0; seed < 4096; seed += 1) {
    if (archetypeFor(seed).name === name) return seed;
  }
  return 0;
}
