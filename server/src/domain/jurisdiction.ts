import type { Tier } from '@prisma/client';

/**
 * The ladder.
 *
 * You start where you live. Every rung outward is somewhere you had to be
 * trusted to reach, and the shape of the ladder depends on where you started:
 * a Norwegian juror climbs toward the EU, a Kenyan one toward the African
 * Union. Both end at the same place, which is the point.
 *
 * IMPORTANT: jurisdictions and police services named here are real, and are
 * used as *setting* only. Every person in a case — defendant, witness,
 * officer, counsel — is fictional. That line is enforced in the generator's
 * system prompt and content filter.
 */

export const TIER_ORDER: Tier[] = [
  'district',
  'state',
  'national',
  'supranational',
  'international',
  'world',
];

export interface CountryProfile {
  /** ISO 3166-1 alpha-2 */
  code: string;
  name: string;
  localeTag: string;
  currency: string;
  /** What the second rung is actually called here. */
  stateNoun: string;
  /** The supranational bench this country answers to, if any. */
  supranational: string | null;
  /** Real districts a player can be assigned to. */
  districts: string[];
  /** The real police service, per district where it differs. */
  policeService: (district: string) => string;
  /** The real court name at a given tier. */
  courtName: (tier: Tier, district: string) => string;
  /** Naming register for generated people — fictional individuals, real texture. */
  nameRegister: string;
}

const eu = 'European Union';
const au = 'African Union';

/**
 * Countries we localise properly. Anywhere else falls back to a generic
 * profile that still uses the player's real country name and locale, so an
 * unlisted country degrades to plausible rather than to Orun City.
 */
export const COUNTRIES: Record<string, CountryProfile> = {
  NO: {
    code: 'NO',
    name: 'Norway',
    localeTag: 'nb-NO',
    currency: 'NOK',
    stateNoun: 'fylke',
    supranational: 'European Economic Area / EFTA Court',
    districts: ['Oslo', 'Bergen', 'Trondheim', 'Stavanger', 'Tromsø'],
    policeService: (d) => `${d} politidistrikt`,
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} tingrett`;
      if (tier === 'state') return 'Borgarting lagmannsrett';
      if (tier === 'national') return 'Høyesterett';
      return 'EFTA-domstolen';
    },
    nameRegister: 'Norwegian given names and surnames (Ingrid Solberg, Lars Haugen)',
  },
  US: {
    code: 'US',
    name: 'the United States',
    localeTag: 'en-US',
    currency: 'USD',
    stateNoun: 'state',
    supranational: null, // no supranational bench; the ladder skips a rung
    districts: ['Chicago', 'Baltimore', 'Oakland', 'Phoenix', 'Detroit'],
    policeService: (d) => `${d} Police Department`,
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} Municipal Court`;
      if (tier === 'state') return 'State Superior Court';
      if (tier === 'national') return 'United States District Court';
      return 'International Court of Justice';
    },
    nameRegister: 'American given names and surnames across varied backgrounds',
  },
  GB: {
    code: 'GB',
    name: 'the United Kingdom',
    localeTag: 'en-GB',
    currency: 'GBP',
    stateNoun: 'region',
    supranational: 'European Court of Human Rights',
    districts: ['Manchester', 'Birmingham', 'Glasgow', 'Leeds', 'Bristol'],
    policeService: (d) => (d === 'Glasgow' ? 'Police Scotland' : `${d} Constabulary`),
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} Magistrates' Court`;
      if (tier === 'state') return `${d} Crown Court`;
      if (tier === 'national') return 'the Court of Appeal';
      return 'the European Court of Human Rights';
    },
    nameRegister: 'British given names and surnames across varied backgrounds',
  },
  NG: {
    code: 'NG',
    name: 'Nigeria',
    localeTag: 'en-NG',
    currency: 'NGN',
    stateNoun: 'state',
    supranational: au,
    districts: ['Lagos', 'Abuja', 'Kano', 'Port Harcourt', 'Ibadan'],
    policeService: (d) => `${d} State Police Command`,
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} Magistrate Court`;
      if (tier === 'state') return `${d} State High Court`;
      if (tier === 'national') return 'the Supreme Court of Nigeria';
      return 'the African Court on Human and Peoples’ Rights';
    },
    nameRegister: 'Nigerian given names and surnames (Yoruba, Igbo, Hausa)',
  },
  KE: {
    code: 'KE',
    name: 'Kenya',
    localeTag: 'en-KE',
    currency: 'KES',
    stateNoun: 'county',
    supranational: au,
    districts: ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret'],
    policeService: (d) => `${d} County Police Command`,
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} Magistrate's Court`;
      if (tier === 'state') return `${d} High Court`;
      if (tier === 'national') return 'the Supreme Court of Kenya';
      return 'the African Court on Human and Peoples’ Rights';
    },
    nameRegister: 'Kenyan given names and surnames',
  },
  DE: {
    code: 'DE',
    name: 'Germany',
    localeTag: 'de-DE',
    currency: 'EUR',
    stateNoun: 'Land',
    supranational: eu,
    districts: ['Berlin', 'Hamburg', 'München', 'Köln', 'Leipzig'],
    policeService: (d) => `Polizei ${d}`,
    courtName: (tier, d) => {
      if (tier === 'district') return `Amtsgericht ${d}`;
      if (tier === 'state') return `Landgericht ${d}`;
      if (tier === 'national') return 'der Bundesgerichtshof';
      return 'der Europäische Gerichtshof';
    },
    nameRegister: 'German given names and surnames',
  },
  FR: {
    code: 'FR',
    name: 'France',
    localeTag: 'fr-FR',
    currency: 'EUR',
    stateNoun: 'région',
    supranational: eu,
    districts: ['Paris', 'Marseille', 'Lyon', 'Toulouse', 'Lille'],
    policeService: (d) => `Police nationale — ${d}`,
    courtName: (tier, d) => {
      if (tier === 'district') return `Tribunal judiciaire de ${d}`;
      if (tier === 'state') return `Cour d'appel de ${d}`;
      if (tier === 'national') return 'la Cour de cassation';
      return 'la Cour de justice de l’Union européenne';
    },
    nameRegister: 'French given names and surnames',
  },
  IN: {
    code: 'IN',
    name: 'India',
    localeTag: 'en-IN',
    currency: 'INR',
    stateNoun: 'state',
    supranational: null,
    districts: ['Mumbai', 'Delhi', 'Bengaluru', 'Kolkata', 'Chennai'],
    policeService: (d) => `${d} Police`,
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} Sessions Court`;
      if (tier === 'state') return `${d} High Court`;
      if (tier === 'national') return 'the Supreme Court of India';
      return 'the International Court of Justice';
    },
    nameRegister: 'Indian given names and surnames across regions',
  },
  BR: {
    code: 'BR',
    name: 'Brazil',
    localeTag: 'pt-BR',
    currency: 'BRL',
    stateNoun: 'estado',
    supranational: 'Mercosur / Inter-American Court of Human Rights',
    districts: ['São Paulo', 'Rio de Janeiro', 'Salvador', 'Recife', 'Porto Alegre'],
    policeService: (d) => `Polícia Civil de ${d}`,
    courtName: (tier, d) => {
      if (tier === 'district') return `Vara Criminal de ${d}`;
      if (tier === 'state') return `Tribunal de Justiça de ${d}`;
      if (tier === 'national') return 'o Supremo Tribunal Federal';
      return 'a Corte Interamericana de Direitos Humanos';
    },
    nameRegister: 'Brazilian given names and surnames',
  },
  ZA: {
    code: 'ZA',
    name: 'South Africa',
    localeTag: 'en-ZA',
    currency: 'ZAR',
    stateNoun: 'province',
    supranational: au,
    districts: ['Johannesburg', 'Cape Town', 'Durban', 'Pretoria', 'Gqeberha'],
    policeService: (d) => `SAPS ${d}`,
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} Magistrate's Court`;
      if (tier === 'state') return `${d} High Court`;
      if (tier === 'national') return 'the Constitutional Court';
      return 'the African Court on Human and Peoples’ Rights';
    },
    nameRegister: 'South African given names and surnames across communities',
  },
};

/**
 * Anywhere we have not hand-localised. Still uses the player's real country,
 * so the experience degrades to "plausible" rather than to "somewhere else".
 */
export function genericProfile(code: string, displayName?: string): CountryProfile {
  const name = displayName ?? code;
  return {
    code,
    name,
    localeTag: 'en',
    currency: 'local currency',
    stateNoun: 'region',
    supranational: null,
    districts: ['the capital district'],
    policeService: (d) => `${d} police service`,
    courtName: (tier, d) => {
      if (tier === 'district') return `${d} District Court`;
      if (tier === 'state') return `${d} Regional Court`;
      if (tier === 'national') return `the Supreme Court of ${name}`;
      return 'the International Court of Justice';
    },
    nameRegister: `given names and surnames common in ${name}`,
  };
}

export function profileFor(code: string | null | undefined): CountryProfile {
  if (!code) return COUNTRIES.NO!; // a juror always sits somewhere
  return COUNTRIES[code.toUpperCase()] ?? genericProfile(code.toUpperCase());
}

/**
 * The ladder for a given country. Countries with no supranational bench skip
 * that rung rather than inventing one — a US juror goes national → international.
 */
export function ladderFor(code: string | null | undefined): Tier[] {
  const profile = profileFor(code);
  return TIER_ORDER.filter((t) => t !== 'supranational' || profile.supranational !== null);
}

/** What this rung is called to the player, in their own country's language of government. */
export function tierLabel(tier: Tier, code: string | null | undefined): string {
  const p = profileFor(code);
  switch (tier) {
    case 'district':
      return 'District';
    case 'state':
      return p.stateNoun.charAt(0).toUpperCase() + p.stateNoun.slice(1);
    case 'national':
      return 'National';
    case 'supranational':
      return p.supranational ?? 'Supranational';
    case 'international':
      return 'International';
    case 'world':
      return 'World';
  }
}

export function nextTier(tier: Tier, code: string | null | undefined): Tier | null {
  const ladder = ladderFor(code);
  const i = ladder.indexOf(tier);
  if (i === -1 || i === ladder.length - 1) return null;
  return ladder[i + 1]!;
}

/** Deterministic home district when we only know the country. */
export function districtFor(code: string | null | undefined, seed: string): string {
  const p = profileFor(code);
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return p.districts[Math.abs(h) % p.districts.length]!;
}
