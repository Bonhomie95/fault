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

/** The city a juror answers to, for the letter that swears them in. */
export function courtCityFor(district: string | null | undefined): string {
  return district ?? 'the city';
}
