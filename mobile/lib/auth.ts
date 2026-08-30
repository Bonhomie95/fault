import * as AppleAuthentication from 'expo-apple-authentication';
import * as Application from 'expo-application';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

/**
 * Signing in.
 *
 * The device's only job is to obtain a token the *provider* signed, and hand
 * it to our server. It never claims an identity of its own — the server
 * verifies every token against Apple's or Google's public keys before it will
 * believe a word of it.
 */

export type Provider = 'apple' | 'google' | 'device';

export interface ProviderToken {
  provider: Provider;
  token: string;
  /** The server-issued nonce this token was minted against. */
  nonce?: string;
  /** Apple gives a name exactly once, at first authorisation. We do NOT use it
   *  as the juror name — the player always names themselves — but it makes a
   *  reasonable prefill in the name field. */
  suggestedName?: string;
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
export async function isAppleAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
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
 * The dev bypass. Uses a stable per-install id so a reload keeps the same
 * juror. The server refuses this entirely when ALLOW_DEV_AUTH is off or
 * NODE_ENV is production — it authenticates anyone who can name a device.
 *
 * Takes no nonce, and is not handed one. There is no provider to bind it to,
 * and asking for one would make local development depend on Redis being up
 * just to sign in — see the nonce request in app/index.
 */
export async function signInWithDevice(): Promise<ProviderToken> {
  let id: string | null = null;
  try {
    id =
      Platform.OS === 'ios'
        ? await Application.getIosIdForVendorAsync()
        : Application.getAndroidId();
  } catch {
    id = null;
  }

  return { provider: 'device', token: id ?? `dev-${Crypto.randomUUID()}` };
}
