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
  /** Apple gives a name exactly once, at first authorisation. We do NOT use it
   *  as the juror name — the player always names themselves — but it makes a
   *  reasonable prefill in the name field. */
  suggestedName?: string;
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

export async function signInWithApple(): Promise<ProviderToken> {
  // A nonce ties this response to this request, so a token captured elsewhere
  // cannot be replayed into our sign-in.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  if (!credential.identityToken) throw new Error('Apple returned no identity token');

  const given = credential.fullName?.givenName ?? '';
  const family = credential.fullName?.familyName ?? '';
  const suggestedName = `${given} ${family}`.trim();

  return {
    provider: 'apple',
    token: credential.identityToken,
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

export async function signInWithGoogle(): Promise<ProviderToken> {
  const clientId = googleClientId();
  if (!clientId) throw new Error('No Google client id configured');

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'fault' });
  const rawNonce = Crypto.randomUUID();

  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    scopes: ['openid', 'profile', 'email'],
    // implicit id_token: nothing to exchange, nothing to keep secret on device
    responseType: AuthSession.ResponseType.IdToken,
    extraParams: { nonce: rawNonce },
  });

  const result = await request.promptAsync(GOOGLE_DISCOVERY);

  if (result.type !== 'success') throw new Error('Google sign-in was cancelled');
  const token = result.params.id_token;
  if (!token) throw new Error('Google returned no id token');

  return { provider: 'google', token };
}

/**
 * The dev bypass. Uses a stable per-install id so a reload keeps the same
 * juror. The server refuses this entirely when ALLOW_DEV_AUTH is off or
 * NODE_ENV is production — it authenticates anyone who can name a device.
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
