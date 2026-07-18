import Constants from 'expo-constants';

/**
 * The API base. On a device, localhost is the device — so we borrow the host
 * that Metro itself is served from, which is the dev machine's LAN address.
 */
function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv;

  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(':')[0];
  if (host) return `http://${host}:4000`;

  // A release build has no Metro host to borrow, so reaching here means
  // EXPO_PUBLIC_API_URL was never set — and the alternative is an app that
  // ships pointing at localhost and fails every request on every device with
  // no clue why. Fail loudly at startup instead of mysteriously at runtime.
  if (!__DEV__) {
    throw new Error(
      'EXPO_PUBLIC_API_URL is not set. A release build cannot infer the API host.',
    );
  }

  return 'http://localhost:4000';
}

export const API_BASE = resolveBaseUrl();

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Tokens.
 *
 * The client used to send `x-juror-id: <cuid>` — a permanent credential that
 * identified a whole career and never expired. Now it carries a 30-minute
 * access token and refreshes it when the server says it has gone stale.
 *
 * Held in module scope and injected by the store on boot, so no screen has to
 * know about tokens and no request has to be handed one.
 */
let accessToken: string | null = null;
let refreshToken: string | null = null;
let onSignedOut: (() => void) | null = null;

export function setTokens(tokens: { accessToken: string; refreshToken: string } | null) {
  accessToken = tokens?.accessToken ?? null;
  refreshToken = tokens?.refreshToken ?? null;
}

export function getTokens() {
  return accessToken && refreshToken ? { accessToken, refreshToken } : null;
}

/** Called when the session is beyond saving and the player must sign in again. */
export function setSignedOutHandler(handler: () => void) {
  onSignedOut = handler;
}

/**
 * How long we will wait before deciding the network is not coming back.
 *
 * fetch has no default timeout — on a flaky connection a request hangs until
 * the OS gives up, which can be minutes. Every call site here puts a Busy
 * scrim over the screen that eats input while it waits, so an unbounded fetch
 * is an app that is indistinguishable from frozen. Fifteen seconds is longer
 * than any healthy request and short enough to still feel like an answer.
 */
const TIMEOUT_MS = 15_000;

/** Only ever one refresh in flight; a burst of 401s must not become a burst of
 *  refreshes, each rotating the token out from under the last. */
let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  if (!refreshToken) return false;
  if (refreshing) return refreshing;

  refreshing = (async () => {
    // Its own timeout, and not via send(): send() attaches the access token we
    // are here precisely because it has expired. An unbounded refresh would
    // hang the retry of every request behind it.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      await persistTokens?.(data);
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
      refreshing = null;
    }
  })();

  return refreshing;
}

/** The store hands us a way to write refreshed tokens back to secure storage. */
let persistTokens: ((t: { accessToken: string; refreshToken: string }) => Promise<void>) | null = null;
export function setTokenPersister(fn: typeof persistTokens) {
  persistTokens = fn;
}

async function send(path: string, method: string, body?: unknown, auth = true): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${API_BASE}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(auth && accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (err) {
    // An abort and a dead radio are the same thing to the player: the court
    // could not be reached. Give both a message they can act on rather than
    // "Aborted" or "Network request failed".
    if ((err as Error).name === 'AbortError') {
      throw new ApiError(0, 'timeout', 'The court did not answer. Check your connection.');
    }
    throw new ApiError(0, 'offline', 'Could not reach the court. Check your connection.');
  } finally {
    clearTimeout(timer);
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  let res = await send(path, method, body, auth);

  // One transparent retry after a refresh. An expired access token is the
  // normal case every 30 minutes, not an error the player should ever see.
  if (res.status === 401 && auth && refreshToken) {
    if (await refreshTokens()) {
      res = await send(path, method, body, auth);
    } else {
      onSignedOut?.();
    }
  }

  const text = await res.text();

  // Not everything that answers is our server. A proxy 502, a captive portal
  // or a CDN error page all return HTML, and JSON.parse on HTML throws a
  // SyntaxError that is not an ApiError — so it escapes every `instanceof
  // ApiError` check in the app and surfaces as an unhandled crash instead of
  // "the court could not be reached".
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new ApiError(
        res.status,
        'bad_response',
        'The court sent something we could not read.',
      );
    }
  }

  if (!res.ok) {
    throw new ApiError(
      res.status,
      (data.error as string) ?? 'unknown',
      (data.message as string) ?? (data.error as string) ?? 'Request failed',
    );
  }

  return data as T;
}

// ---- Types mirroring the server's client-facing contract ----

export interface ClientCase {
  id: string;
  caseNumber: number;
  title: string;
  charge: string;
  accent: string;
  mood: string;
  clockSeconds: number;
  /** Real place, real court, real police service. Every person is invented. */
  place: {
    country: string;
    jurisdiction: string;
    tier: string;
    tierLabel: string;
  };
  defendant: {
    name: string;
    age: number;
    occupation: string;
    background: string;
    portraitSeed: number;
    /** 0 unsettling .. 100 disarming. Shapes the face and means nothing. */
    appearance: number;
  };
  evidence: {
    id: string;
    description: string;
    prosecution_reading: string;
    defence_reading: string;
  }[];
  witnesses: { name: string; role: string; testimony: string }[];
  prosecutionArgument: string;
  defenceArgument: string;
  returningCharacters: { name: string; portraitSeed: number }[];
}

export interface CityState {
  crimeRate: number;
  judicialTrust: number;
  wealthDisparity: number;
  organizedCrimePower: number;
  policeIntegrity: number;
  mediaPressure: number;
  activeFactions: string[];
  casesHeard: number;
  chapter: number;
}

export interface VerdictResult {
  verdict: 'guilty' | 'not_guilty';
  wasHung: boolean;
  /** Measured by the server from when it served the case, not claimed by us. */
  timeRemaining: number;
  aftermath: string;
  city: CityState;
  triggerReview: boolean;
  casesHeard: number;
  consensus: { guiltyPercent: number; sampleSize: number };
  /** Service, paid immediately — neither can see whether the verdict was right. */
  xpAwarded: number;
  rank: number;
  promoted: boolean;
  meritAwarded: number;
  merit: number;
  /**
   * Whether an interstitial is due, decided server-side on a 2-3 case cadence
   * the client cannot see, skip, or re-roll by force-quitting.
   */
  showInterstitial: boolean;
}

export interface ReviewEntry {
  caseNumber: number;
  defendantName: string;
  charge: string;
  accent: string;
  verdict: 'guilty' | 'not_guilty';
  wasHung: boolean;
  timeRemaining: number;
  outcome: string;
}

export interface JurorRecord {
  jurorName: string;
  casesHeard: number;
  profile: string;
  cityTrajectory: Record<string, number>;
}

/** Mirrors the Entitlement enum in the Prisma schema. */
export type Entitlement =
  // more game
  | 'campaign'
  | 'pack_corporate'
  | 'pack_cold_case'
  | 'pack_political'
  // less friction
  | 'no_ads'
  // how it looks, and nothing else
  | 'seal_brass'
  | 'seal_obsidian'
  | 'seal_ivory'
  // reserved: in the schema, not yet for sale — nothing renders them
  | 'room_oak'
  | 'room_concrete'
  | 'stock_onionskin'
  | 'stock_vellum'
  // a thank-you
  | 'patron';

export interface Session {
  userId: string;
  jurorName: string;
  /** Always 120. The server owns it; this is display only. */
  clockSeconds: number;
  entitlements: Entitlement[];
  merit: number;
  casesHeard?: number;
}

export interface StoreItem {
  id: string;
  title: string;
  blurb: string;
  kind: 'unlock' | 'pack' | 'currency';
  priceMinor: number | null;
  meritPrice: number | null;
  meritGranted: number | null;
  owned: boolean;
  affordable: boolean;
}

export interface StoreView {
  merit: number;
  entitlements: Entitlement[];
  rewardedAdsLeft: number;
  rewardedAdMerit: number;
  items: StoreItem[];
}

export interface AdPolicy {
  showAds: boolean;
  interstitialEveryNCases: number | null;
  rewardedAvailable: boolean;
}

export type Tier = 'district' | 'state' | 'national' | 'supranational' | 'international' | 'world';

export interface Standing {
  jurorName: string;
  rank: number;
  rankTitle: string;
  xp: number;
  xpIntoRank: number;
  xpForNextRank: number | null;
  nextRankTitle: string | null;
  trust: number;
  trustLabel: string;
  tier: Tier;
  tierLabel: string;
  country: string | null;
  district: string | null;
  court: string | null;
  casesHeard: number;
  currentStreak: number;
  longestStreak: number;
  promotion: {
    tier: Tier;
    tierLabel: string;
    requiredRank: number;
    requiredTrust: number;
    eligible: boolean;
    blockedBy: string[];
  } | null;
  unlocks: { caseArchive: boolean; jurorRecord: boolean; foreignApplications: boolean };
}

export interface Mission {
  key: string;
  kind: 'daily' | 'weekly' | 'career';
  title: string;
  description: string;
  target: number;
  xp: number;
  progress: number;
  complete: boolean;
  claimed: boolean;
}

export interface JurisdictionsView {
  countries: { code: string; name: string; ladder: Tier[] }[];
  applications: {
    id: string;
    country: string;
    tier: Tier;
    status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
    decisionText: string | null;
    decidedAt: string | null;
  }[];
}

export type Board = 'peaceful' | 'lawless';

export interface BoardEntry {
  rank: number;
  jurorName: string;
  country: string | null;
  peaceIndex: number;
  verdict: string;
  casesHeard: number;
  you?: boolean;
}

export interface BoardView {
  board: Board;
  top: BoardEntry[];
  /** Always present once the player qualifies — even outside the top 100. */
  you: (BoardEntry & { inTop: boolean }) | null;
  ranked: number;
  qualifyAt: number;
}

export interface SignInResult {
  userId: string;
  jurorName: string;
  returning: boolean;
  /**
   * Verdicts on the record. Absent for a juror the court has just met.
   * `returning` is about the identity; this is about the service — a juror can
   * be returning and still owed the letter.
   */
  casesHeard?: number;
  homeCountry?: string;
  homeDistrict?: string;
  /** 30-minute bearer. */
  accessToken: string;
  /** Long-lived, rotated on every use, revocable server-side. */
  refreshToken: string;
  expiresInSeconds: number;
}

export const api = {
  /**
   * Sign in or swear in. The provider token is verified server-side — the
   * client never asserts who it is, only hands over what the provider signed.
   * `jurorName` is the player's own choice and is required on first sign-in;
   * a 409 juror_name_required means the court needs a name before proceeding.
   */
  signIn: (body: {
    provider: 'apple' | 'google' | 'device';
    token: string;
    jurorName?: string;
    country?: string;
    /** IANA zone, so the player's day ends at their midnight. */
    timezone?: string;
  }) => request<SignInResult>('/api/auth/sign-in', { method: 'POST', body, auth: false }),

  countries: () =>
    request<{ countries: { code: string; name: string; districts: string[] }[] }>(
      '/api/auth/countries',
    ),

  standing: () => request<Standing>('/api/standing'),

  leaderboard: (board: Board) =>
    request<BoardView>(`/api/leaderboard?board=${board}`),

  ladder: () =>
    request<{ country: string; current: Tier; rungs: { tier: Tier; label: string; reached: boolean }[] }>(
      '/api/standing/ladder',
    ),

  promote: () =>
    request<{ promoted: Tier; standing: Standing }>('/api/standing/promote', {
      method: 'POST',
    }),

  missions: () =>
    request<{ missions: Mission[] }>('/api/standing/missions'),

  claimMission: (key: string) =>
    request<{ xp: number; rank: number }>('/api/standing/missions/claim', {
      method: 'POST',
      body: { key },
    }),

  jurisdictions: () =>
    request<JurisdictionsView>('/api/standing/jurisdictions'),

  applyToJurisdiction: (body: { country: string; tier: Tier }) =>
    request<{ accepted: boolean; decisionText: string; standing: Standing }>(
      '/api/standing/jurisdictions/apply',
      { method: 'POST', body },
    ),

  createSession: (jurorName: string) =>
    request<Session>('/api/session', { method: 'POST', body: { jurorName } }),

  me: () => request<Session>('/api/session/me'),

  updateSettings: (body: { clockSeconds?: number; trialUnlocked?: boolean }) =>
    request<{ clockSeconds: number; trialUnlocked: boolean }>('/api/session/me', {
      method: 'PATCH',
      body,
    }),

  nextCase: () => request<ClientCase>('/api/case/next'),

  /**
   * Deliver a verdict.
   *
   * We send which case and which way, and nothing else. `timeRemaining` and
   * `wasHung` used to travel from here and be believed — the server now
   * measures both from when it served the case. The phone does not get a vote
   * on how long the phone took.
   */
  submitVerdict: (body: { caseId: string; verdict?: 'guilty' | 'not_guilty' }) =>
    request<VerdictResult>('/api/verdict', { method: 'POST', body }),

  cityState: () => request<CityState>('/api/city-state'),

  review: () => request<{ entries: ReviewEntry[] }>('/api/review'),

  jurorRecord: () => request<JurorRecord>('/api/juror-profile'),

  // ---- Store ----

  store: () => request<StoreView>('/api/store'),

  /** Buy with Merit. The server prices it; we only name it. */
  buyWithMerit: (sku: string) =>
    request<{ sku: string; granted: Entitlement | null; meritBalance: number }>('/api/store/buy', {
      method: 'POST',
      body: { sku },
    }),

  restorePurchases: () =>
    request<{ restored: number; entitlements: Entitlement[] }>('/api/store/restore', {
      method: 'POST',
    }),

  adPolicy: () => request<AdPolicy>('/api/store/ads'),

  claimAdReward: (viewId: string) =>
    request<{ merit: number; awarded: number }>('/api/store/ad-reward', {
      method: 'POST',
      body: { viewId },
    }),

  // ---- Account ----

  signOut: () => request<{ signedOut: boolean }>('/api/auth/sign-out', { method: 'POST' }),

  /** Irreversible. Takes the career, the city, and every verdict with it. */
  deleteAccount: () => request<{ deleted: boolean }>('/api/session/me', { method: 'DELETE' }),
};
