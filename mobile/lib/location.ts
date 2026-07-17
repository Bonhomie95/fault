import * as Location from 'expo-location';
import { getLocales } from 'expo-localization';

/**
 * Where the player is, resolved to a country and nothing more.
 *
 * The personalisation this feeds is country-level: which real courts and
 * police services a case names. So the coordinates are used to answer one
 * question — "which country?" — and then discarded. They are never sent to
 * the server and never stored. Keeping them would be collecting data the game
 * has no use for.
 *
 * Permission is genuinely optional. A player who declines picks their
 * jurisdiction from a list instead, which is a perfectly good outcome and in
 * some ways a better one: it lets them choose the country they want to be a
 * juror in.
 */

export interface CountryResult {
  /** ISO 3166-1 alpha-2, or null if we could not tell. */
  code: string | null;
  source: 'gps' | 'locale' | 'declined' | 'unavailable';
}

/** The device's own guess, needing no permission at all. */
export function countryFromLocale(): string | null {
  try {
    const locales = getLocales();
    return locales[0]?.regionCode ?? null;
  } catch {
    return null;
  }
}

/**
 * Ask for location and reverse-geocode to a country.
 * Falls back to the device locale on any refusal or failure — the game must
 * never be blocked by this.
 */
export async function resolveCountry(): Promise<CountryResult> {
  const fallback = countryFromLocale();

  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== Location.PermissionStatus.GRANTED) {
      return { code: fallback, source: 'declined' };
    }

    // Lowest useful accuracy: we are answering "which country", and asking the
    // device for street-level precision to do it would be gratuitous.
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Lowest,
    });

    const places = await Location.reverseGeocodeAsync({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });

    // From here on the coordinates are gone. Only `isoCountryCode` survives.
    const code = places[0]?.isoCountryCode ?? null;
    if (!code) return { code: fallback, source: 'unavailable' };

    return { code: code.toUpperCase(), source: 'gps' };
  } catch {
    return { code: fallback, source: 'unavailable' };
  }
}
