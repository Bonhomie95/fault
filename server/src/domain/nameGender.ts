/**
 * Whether a given name reads as a woman's, a man's, or either.
 *
 * The courtroom used to decide how each person presents from a seed channel,
 * independent of their name. That was harmless for a drawn face and is not
 * for a rendered one: "Ngozi Chukwu" played by a man is a casting error the
 * player sees in the first second, and it takes them out of the room.
 *
 * Names are drawn by the server from the registers in domain/jurisdiction, so
 * this can be a closed list. Anything not on it — a unisex name, or a name the
 * model invented before the server started choosing — answers null, and the
 * client falls back to the seed exactly as before.
 *
 * Name is not evidence of anything. The registers are sampled blind to the
 * verdict, so presentation stays as uncorrelated with guilt as it always was.
 */

const FEMININE = new Set([
  'Ingrid', 'Kari', 'Astrid', 'Maja', 'Amina',
  'Tasha', 'Nicole', 'Beth', 'Shauna',
  'Aisha', 'Nadia', 'Priya', 'Roisin', 'Chloe',
  'Adaeze', 'Folake', 'Chinelo', 'Hauwa', 'Ngozi',
  'Wanjiru', 'Njeri', 'Achieng', 'Fatuma',
  'Lena', 'Fatma', 'Aylin', 'Katrin', 'Sofia',
  'Camille', 'Élodie', 'Aïcha', 'Fanta',
  'Meera', 'Fatima', 'Ananya', 'Lakshmi',
  'Camila', 'Luana', 'Beatriz', 'Juliana', 'Nara',
  'Thandiwe', 'Lerato', 'Nomsa', 'Zanele',
]);

const MASCULINE = new Set([
  'Lars', 'Sindre', 'Kjetil', 'Håkon', 'Emil',
  'Marcus', 'Luis', 'Ray', 'Andre', 'Hector',
  'Callum', 'Gareth', 'Dean', 'Tomasz',
  'Emeka', 'Ibrahim', 'Tunde', 'Bashir',
  'Otieno', 'Kipchoge', 'Musa', 'Brian', 'Kamau',
  'Jonas', 'Stefan', 'Matthias', 'Mehmet', 'Bernd',
  'Karim', 'Thomas', 'Julien', 'Mathieu', 'Bruno',
  'Rohit', 'Arjun', 'Vikram', 'Sameer', 'Imran',
  'Rafael', 'Thiago', 'Marcos', 'Everton', 'Caio',
  'Sipho', 'Pieter', 'Riaan', 'Bongani',
]);

/** true: reads as a woman. false: as a man. null: either, or unknown. */
export function presentsFeminine(fullName: string): boolean | null {
  const given = fullName.trim().split(/\s+/)[0] ?? '';
  if (FEMININE.has(given)) return true;
  if (MASCULINE.has(given)) return false;
  return null;
}
