import type { CharacterFate, CharacterRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

/**
 * GDD 12 — pool discipline. Chapters 1-2 are hand-authored, seeding begins at
 * case 5, and nobody comes back before case 15. An echo that arrives too early
 * is just a repeated name; it has to be forgotten first to land.
 */
export const ECHO_START_CASE = 15;
/**
 * Kept for reference: the GDD's "pool seeding begins at case 5". It is no
 * longer a gate on recording — see addToCharacterPool — because who may
 * RETURN is decided by ECHO_START_CASE and the cooldown, while who is
 * REMEMBERED must be everyone, or the generator hands their name to a
 * stranger.
 */
export const POOL_SEED_START_CASE = 5;
/** Minimum cases between a character's origin and their return. */
const ECHO_COOLDOWN = 8;
/** Nobody becomes a recurring cast member by accident. */
const MAX_ECHOES_PER_CHARACTER = 2;

export interface PoolCharacter {
  id: string;
  name: string;
  role: CharacterRole;
  fate: CharacterFate;
  portraitSeed: number;
  themes: string[];
  originCaseNumber: number;
  echoCount: number;
}

/**
 * Who is eligible to walk back into your courtroom.
 * A convicted person returns from the inside; an acquitted one returns from
 * the street. The fate decides which story they can carry (GDD 2.4).
 */
export async function getEligibleCharacters(
  userId: string,
  currentCaseNumber: number,
  themes: string[] = [],
): Promise<PoolCharacter[]> {
  if (currentCaseNumber < ECHO_START_CASE) return [];

  const pool = await prisma.character.findMany({
    where: {
      userId,
      originCaseNumber: { lte: currentCaseNumber - ECHO_COOLDOWN },
      lastUsedCase: { lte: currentCaseNumber - ECHO_COOLDOWN },
      echoCount: { lt: MAX_ECHOES_PER_CHARACTER },
    },
    orderBy: { relevanceScore: 'desc' },
    take: 12,
  });

  const mapped: PoolCharacter[] = pool.map((c) => ({
    id: c.id,
    name: c.name,
    role: c.role,
    fate: c.fate,
    portraitSeed: c.portraitSeed,
    themes: c.themes,
    originCaseNumber: c.originCaseNumber,
    echoCount: c.echoCount,
  }));

  if (themes.length === 0) return mapped.slice(0, 5);

  // Prefer thematic resonance, but never starve the pool: an echo that fits
  // loosely still beats no echo at all.
  const resonant = mapped.filter((c) => c.themes.some((t) => themes.includes(t)));
  return (resonant.length > 0 ? resonant : mapped).slice(0, 5);
}

/**
 * How a returning character may be used, given what you did to them.
 * This text goes to the generator, which writes the actual scene.
 */
export function echoRolesFor(fate: CharacterFate): string[] {
  if (fate === 'convicted')
    return [
      'a witness who met the current defendant inside',
      'the victim of a new crime',
      'a parolee whose alleged recidivism is the case itself',
    ];
  if (fate === 'acquitted')
    return [
      'a witness for the prosecution',
      'the alleged perpetrator of a crime committed after their acquittal',
      'a reformed citizen testifying for a similar defendant',
    ];
  return ['a witness returning to the stand', 'counsel on a new matter'];
}

export interface CharacterInput {
  name: string;
  role: CharacterRole;
  themes: string[];
}

/** Deterministic seed so a returning face is the same face (GDD 5.2). */
export function portraitSeedFor(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h % 200); // library of 200 pre-generated silhouettes
}

/**
 * Everyone in the room is remembered — the defendant with the fate you handed
 * them, everyone else as untried.
 */
export async function addToCharacterPool(
  userId: string,
  originCaseId: string,
  originCaseNumber: number,
  people: CharacterInput[],
  defendantFate: CharacterFate,
  defendantName: string,
) {
  // Everyone is recorded from case one.
  //
  // This used to skip anybody met before POOL_SEED_START_CASE, on the theory
  // that early characters should not echo. That is true, but it is enforced in
  // getEligibleCharacters — which already refuses to return anyone before
  // ECHO_START_CASE and inside the cooldown. Gating the *recording* as well
  // did nothing for echoes and quietly broke naming: the generator draws new
  // names by excluding everyone in this table, so four cases' worth of people
  // were invisible and got handed out again. A fresh juror met the same six
  // strangers across six cases.
  //
  // Record everyone; decide who may return later.

  for (const person of people) {
    const fate: CharacterFate = person.name === defendantName ? defendantFate : 'untried';

    const existing = await prisma.character.findFirst({
      where: { userId, name: person.name },
    });

    if (existing) {
      // They were already in the city — this is a return, not a debut.
      await prisma.character.update({
        where: { id: existing.id },
        data: {
          lastUsedCase: originCaseNumber,
          echoCount: { increment: 1 },
          // A defendant's fate is the strongest thing about them; keep it
          // rather than flattening it back to untried on a later cameo.
          fate: fate === 'untried' ? existing.fate : fate,
          relevanceScore: { increment: 1 },
        },
      });
      continue;
    }

    await prisma.character.create({
      data: {
        userId,
        name: person.name,
        role: person.role,
        fate,
        portraitSeed: portraitSeedFor(person.name),
        themes: person.themes,
        originCaseId,
        originCaseNumber,
        lastUsedCase: originCaseNumber,
        // A defendant you judged is more memorable than a witness you skimmed.
        relevanceScore: person.role === 'defendant' ? 3 : 1,
      },
    });
  }
}
