import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { storage } from '@/lib/storage';

/**
 * Signing in.
 *
 * The device's only job is to obtain a token the *provider* signed, and hand
 * it to our server. It never claims an identity of its own — the server
 * verifies every token against Apple's or Google's public keys before it will
 * believe a word of it.
 */

export type Provider = 'apple' | 'google' | 'guest' | 'device';

export interface ProviderToken {
  provider: Provider;
  token: string;
  /** The server-issued nonce this token was minted against. */
  nonce?: string;
  /** Apple gives a name exactly once, at first authorisation. We do NOT use it
   *  as the juror name — the player always names themselves — but it makes a
   *  reasonable prefill in the name field. */
  suggestedName?: string;
  /**
   * Apple only: the one-time authorization code from the same sheet. The
   * server trades it for a refresh token so that deleting the account can
   * revoke FAULT's access with Apple too (guideline 5.1.1(v)).
   */
  authorizationCode?: string;
}

/**
 * A sign-in nonce, from our own server.
 *
 * Every provider flow below takes one. The device used to invent its own —
 * `Crypto.randomUUID()` — hand it to Apple or Google, and the server never
 * looked at the value that came back. A nonce nobody issued and nobody checks
 * is decoration: its whole job is to bind one identity token to one sign-in
 * that THIS server asked for, and it cannot do that if the server has never
 * seen it.
 *
 * Fetching it costs one round trip before the provider sheet opens, which is
 * the cheapest possible place to spend it.
 */
export interface SignInNonce {
  /** Send this back to our server with the provider token. */
  nonce: string;
  /** What Apple wants: it hashes the input and embeds the hash in the token. */
  nonceSha256: string;
}

/** Apple Sign In needs a native build; it does not exist in Expo Go. */
/**
 * Is this build running inside Expo Go rather than one of our own?
 *
 * It matters for sign-in. Apple and Google both hand back a token bound to the
 * bundle id that ASKED for it, and inside Expo Go that is Expo's bundle, not
 * ours — so the sheet either refuses outright or returns a token this server
 * correctly rejects for having the wrong audience. Either way the player gets
 * an error they cannot do anything about, from a button that should not have
 * been offered.
 */
export function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

export async function isAppleAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  // `isAvailableAsync` answers "does this OS have Sign In with Apple", which
  // is true in Expo Go and useless there — the entitlement belongs to the
  // host app. Offering the button anyway is how "That sign-in did not go
  // through" became the first thing anyone saw.
  if (isExpoGo()) return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signInWithApple(issued: SignInNonce): Promise<ProviderToken> {
  // Apple hashes whatever it is given and embeds the HASH in the identity
  // token, so it receives the SHA-256 while our server keeps the raw value.
  // Both spellings come from the same server-issued secret.
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: issued.nonce,
  });

  if (!credential.identityToken) throw new Error('Apple returned no identity token');

  const given = credential.fullName?.givenName ?? '';
  const family = credential.fullName?.familyName ?? '';
  const suggestedName = `${given} ${family}`.trim();

  return {
    provider: 'apple',
    token: credential.identityToken,
    nonce: issued.nonce,
    ...(suggestedName ? { suggestedName } : {}),
    ...(credential.authorizationCode ? { authorizationCode: credential.authorizationCode } : {}),
  };
}

/**
 * Google, via the system browser (AuthSession). We ask for an id_token
 * directly rather than an access token: the id_token is what our server can
 * verify offline against Google's JWKS.
 */
const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

export function googleClientId(): string | null {
  const ios = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS;
  const android = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID;
  const web = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB;
  if (Platform.OS === 'ios' && ios) return ios;
  if (Platform.OS === 'android' && android) return android;
  return web ?? null;
}

export async function signInWithGoogle(issued: SignInNonce): Promise<ProviderToken> {
  const clientId = googleClientId();
  if (!clientId) throw new Error('No Google client id configured');

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'fault' });

  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    scopes: ['openid', 'profile', 'email'],
    // implicit id_token: nothing to exchange, nothing to keep secret on device
    responseType: AuthSession.ResponseType.IdToken,
    // Google embeds the raw value, unlike Apple.
    extraParams: { nonce: issued.nonce },
  });

  const result = await request.promptAsync(GOOGLE_DISCOVERY);

  if (result.type !== 'success') throw new Error('Google sign-in was cancelled');
  const token = result.params.id_token;
  if (!token) throw new Error('Google returned no id token');

  return { provider: 'google', token, nonce: issued.nonce };
}

/**
 * NOTE: `signInWithDevice` is gone.
 *
 * It sent the iOS vendor id / Android id as the whole credential, which the
 * server rightly refuses in production (it authenticates anyone who can name
 * a device), so it could never be the release door and it was the only
 * provider-free one. `signInAsGuest` below replaces it everywhere, dev
 * included — ALLOW_GUEST_AUTH defaults on, so local development still signs
 * in without Redis or provider credentials. The server's `device` flow
 * remains for the test suite. A dev juror created under the old flow is not
 * carried over; swear in again.
 */

/**
 * PLAY AS GUEST — the door that works in a release build.
 *
 * The old `signInWithDevice` could not be it: the server refuses the device flow
 * in production, correctly, because it believes anyone who can name a vendor
 * id. Before this, a release build on Android had no way in at all until
 * Google client ids existed.
 *
 * A guest is a 256-bit secret generated here once, from the platform CSPRNG,
 * and kept in the keychain / keystore via lib/storage. The secret IS the
 * credential; the server stores only its SHA-256 (services/auth.ts on the
 * server). Nothing about it is derived from the device, so unlike a vendor id
 * it cannot be guessed, enumerated, or read by another app.
 *
 * The secret is NOT deleted on sign-out — signing out and choosing "play as
 * guest" again should return the same juror, not orphan them. It is deleted
 * only when the account is (see store/game deleteAccount), so the next guest
 * on this phone is a new person.
 *
 * On iOS the keychain survives an uninstall, so a guest usually survives a
 * reinstall there; on Android it does not. The Terms say so.
 */
const GUEST_SECRET_KEY = 'fault.guest.secret';

export async function signInAsGuest(): Promise<ProviderToken> {
  let secret = await storage.get(GUEST_SECRET_KEY);
  if (!secret || !/^[A-Za-z0-9_-]{43}$/.test(secret)) {
    secret = base64url(Crypto.getRandomBytes(32));
    await storage.set(GUEST_SECRET_KEY, secret);
  }
  return { provider: 'guest', token: secret };
}

/** Forget this phone's guest, so the next one is a new juror. */
export async function forgetGuest(): Promise<void> {
  await storage.remove(GUEST_SECRET_KEY).catch(() => {});
}

function base64url(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += alphabet[(n >> 18) & 63]! + alphabet[(n >> 12) & 63]! + alphabet[(n >> 6) & 63]! + alphabet[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += alphabet[(n >> 18) & 63]! + alphabet[(n >> 12) & 63]!;
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += alphabet[(n >> 18) & 63]! + alphabet[(n >> 12) & 63]! + alphabet[(n >> 6) & 63]!;
  }
  return out;
}
