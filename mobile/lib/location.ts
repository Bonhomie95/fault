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
/**
 * The whole lookup, not just the fix.
 *
 * The timeout used to cover only getCurrentPositionAsync and
 * reverseGeocodeAsync, leaving `requestForegroundPermissionsAsync` outside it.
 * That is the call that actually hung: on a simulator with no simulated
 * location — and, in the field, on a device where the permission sheet is
 * interrupted — it can simply never settle, and the sign-in sits on a spinner
 * forever with no error and no way back. I watched it happen for a full
 * minute before killing the app.
 *
 * This function's own docstring promises the game is "never blocked by this".
 * A promise like that has to cover every await inside it, or it is only a
 * promise about the awaits somebody remembered.
 */
const LOOKUP_TIMEOUT_MS = 8000;

export async function resolveCountry(): Promise<CountryResult> {
  const fallback = countryFromLocale();

  const lookup = (async (): Promise<CountryResult> => {
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

    // From here on the coordinates are gone. Only isoCountryCode survives.
    const code = places[0]?.isoCountryCode;
    if (!code) return { code: fallback, source: 'unavailable' };

    return { code: code.toUpperCase(), source: 'gps' };
  })();

  try {
    return await Promise.race([
      lookup,
      new Promise<CountryResult>((resolve) =>
        setTimeout(() => resolve({ code: fallback, source: 'unavailable' }), LOOKUP_TIMEOUT_MS),
      ),
    ]);
  } catch {
    return { code: fallback, source: 'unavailable' };
  }
}
