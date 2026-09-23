import { countryFromLocale } from './location';

/**
 * The masthead.
 *
 * The paper is fictional and the city is real — the opposite way round from
 * the courts, on purpose. "Oslo politidistrikt investigated a fictional theft"
 * is ordinary fiction about a public institution. Inventing articles under a
 * real newspaper's name is inventing the words of a private company, which is
 * a different thing entirely. So the city is theirs and the paper is ours.
 *
 * This mirrors `newspaperFor` on the server. It is duplicated rather than
 * fetched because the cold open renders the masthead before the player has an
 * account, a token, or necessarily a network — and a newspaper that says
 * "loading" is not a newspaper.
 */

/** Where a juror in this country most likely sits, before we know better. */
const PRIMARY_DISTRICT: Record<string, string> = {
  NO: 'Oslo',
  US: 'Chicago',
  GB: 'Manchester',
  NG: 'Lagos',
  KE: 'Nairobi',
  DE: 'Berlin',
  FR: 'Paris',
  IN: 'Mumbai',
  BR: 'São Paulo',
  ZA: 'Johannesburg',
  CA: 'Toronto',
  AU: 'Sydney',
  NZ: 'Auckland',
  IE: 'Dublin',
  ES: 'Madrid',
  IT: 'Roma',
  PT: 'Lisboa',
  NL: 'Amsterdam',
  BE: 'Brussels',
  SE: 'Stockholm',
  DK: 'København',
  FI: 'Helsinki',
  PL: 'Warszawa',
  AT: 'Wien',
  CH: 'Zürich',
  CZ: 'Praha',
  GR: 'Athens',
  RO: 'București',
  HU: 'Budapest',
  TR: 'İstanbul',
  IL: 'Tel Aviv',
  AE: 'Dubai',
  SA: 'Riyadh',
  EG: 'Cairo',
  MA: 'Casablanca',
  PK: 'Karachi',
  BD: 'Dhaka',
  LK: 'Colombo',
  ID: 'Jakarta',
  MY: 'Kuala Lumpur',
  SG: 'Tampines',
  PH: 'Manila',
  TH: 'Bangkok',
  VN: 'Ho Chi Minh City',
  JP: 'Tokyo',
  KR: 'Seoul',
  CN: 'Shanghai',
  MX: 'Ciudad de México',
  AR: 'Buenos Aires',
  CO: 'Bogotá',
  CL: 'Santiago',
  PE: 'Lima',
  GH: 'Accra',
  UG: 'Kampala',
  TZ: 'Dar es Salaam',
  ET: 'Addis Ababa',
  RW: 'Kigali',
  CM: 'Douala',
  SN: 'Dakar',
  CI: 'Abidjan',
  ZW: 'Harare',
  ZM: 'Lusaka',
  UA: 'Kyiv',
  JM: 'Kingston',
  TT: 'Port of Spain',
  QA: 'Doha',
  KW: 'Kuwait City',
  DZ: 'Alger',
  TN: 'Tunis',
};

export function newspaperFor(district: string | null | undefined): string {
  if (!district) return 'THE CITY HERALD';
  return `THE ${district.toUpperCase()} HERALD`;
}

/**
 * The paper to show before anyone is sworn in.
 *
 * Uses the device's own region — no permission, no network, no waiting. Once
 * the player signs in, every screen switches to their real assigned district,
 * which may not be this one; the cold open is a guess and only ever a guess.
 */
export function localNewspaper(): string {
  const code = countryFromLocale();
  const district = code ? PRIMARY_DISTRICT[code.toUpperCase()] : null;
  return newspaperFor(district ?? null);
}

/**
 * The city a juror answers to, for the letter that swears them in.
 *
 * The fallback used to be the literal string 'the city', which signed the Chief
 * Justice's letter "Chief Justice, the city" — lowercase, ungrammatical, and
 * visibly a placeholder in the most formal object in the game. It only appears
 * when standing has not arrived yet, which is exactly when a brand-new juror is
 * reading it.
 *
 * The device's own region is a better guess than an apology, and it is the same
 * guess the masthead above already makes.
 */
export function courtCityFor(district: string | null | undefined): string {
  if (district) return district;
  const code = countryFromLocale();
  return (code ? PRIMARY_DISTRICT[code.toUpperCase()] : null) ?? 'the City';
}
