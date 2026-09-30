import { isIP } from 'node:net';
import geoip from 'geoip-country';

/** Country-only local lookup. No IP or coordinates leave the server. */
export function countryForIp(ip: string | undefined): string | null {
  if (!ip) return null;
  const address = ip.replace(/^::ffff:/, '');
  if (!isIP(address)) return null;
  try {
    const code = geoip.lookup(address)?.country;
    return code && /^[A-Z]{2}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

export function resolveSignInCountry(ip: string | undefined, country?: string, source?: string): string {
  // GPS is more precise than an IP (especially behind a VPN). A phone's
  // language/region setting is only a fallback, never evidence of location.
  const supplied = country?.toUpperCase();
  return (source === 'gps' || source === undefined ? supplied : null)
    ?? countryForIp(ip) ?? supplied ?? 'ZZ';
}
