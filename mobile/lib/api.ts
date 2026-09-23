import Constants from 'expo-constants';

/**
 * The API base. On a device, localhost is the device — so we borrow the host
 * that Metro itself is served from, which is the dev machine's LAN address.
 */
/**
 * Why a release build cannot talk to the court, or null if it can.
 *
 * This used to be a `throw` at module load. That is loud in development and
 * the opposite in a release build: the throw happens while the JS bundle is
 * still importing, before the root ErrorBoundary exists, so the player gets
 * a splash screen that never goes away and nobody gets a message. The
 * _layout renders a plain explanation instead when this is set.
 *
 * `.invalid` is covered for the same reason. eas.json ships
 * `https://api.example.invalid` as a deliberate placeholder until the real
 * host exists — a reserved TLD that can never resolve (RFC 2606) — and a build
 * made before someone replaced it would otherwise fail every request as
 * "Could not reach the court. Check your connection.", which sends the player
 * to check a connection that is fine.
 */
let configError: string | null = null;

function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) {
    if (!__DEV__ && /\.invalid(?::\d+)?(?:\/|$)/i.test(fromEnv)) {
      configError =
        `This build points at a placeholder server (${fromEnv}). ` +
        'Set EXPO_PUBLIC_API_URL in eas.json to the real API host and rebuild.';
      return '';
    }
    return fromEnv;
  }

  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(':')[0];
  if (host) return `http://${host}:4000`;

  // A release build has no Metro host to borrow, so reaching here means
  // EXPO_PUBLIC_API_URL was never set — and the alternative is an app that
  // ships pointing at localhost and fails every request on every device with
  // no clue why.
  if (!__DEV__) {
    configError =
      'EXPO_PUBLIC_API_URL is not set. A release build cannot infer the API host.';
    return '';
  }

  return 'http://localhost:4000';
}

export const API_BASE = resolveBaseUrl();
export const API_CONFIG_ERROR: string | null = configError;

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
let refreshing: Promise<RefreshResult> | null = null;

/**
 * `rejected` is the server saying no — the session is over. `transient` is
 * the network or the server having a bad moment, and must NOT sign anybody
 * out: it used to, so a dropped connection at the thirty-minute mark ended a
 * player's session.
 */
type RefreshResult = 'ok' | 'rejected' | 'transient';

async function refreshTokens(): Promise<RefreshResult> {
  if (!refreshToken) return 'rejected';
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
      if (!res.ok) return res.status >= 500 || res.status === 429 ? 'transient' : 'rejected';
      const data = await res.json();
      setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      await persistTokens?.(data);
      return 'ok';
    } catch {
      return 'transient';
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
  if (API_CONFIG_ERROR) throw new ApiError(0, 'misconfigured', API_CONFIG_ERROR);
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
    const refreshed = await refreshTokens();
    if (refreshed === 'ok') {
      res = await send(path, method, body, auth);
    } else if (refreshed === 'rejected') {
      onSignedOut?.();
    } else {
      throw new ApiError(0, 'offline', 'Could not reach the court. Check your connection.');
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

export type Speaker = 'defendant' | 'witness1' | 'witness2' | 'prosecution' | 'defence';
export type Cue = 'open' | 'e1' | 'e2' | 'e3' | 'witness1' | 'witness2' | 'arguments' | 'late';
export type Tone = 'pleading' | 'defiant' | 'tense' | 'ashamed' | 'startled' | 'calm';

export interface CourtroomLine {
  speaker: Speaker;
  cue: Cue;
  tone: Tone;
  text: string;
}

export interface ClientCase {
  /** Set when this is the Daily Trial (its UTC day). */
  daily?: string;
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
    /**
     * The three channels a juror reads off a body, none of which mean
     * anything. All rolled server-side, blind to the verdict — which is the
     * only reason measuring a player's reaction to them says anything.
     */
    /** 0 unsettling .. 100 disarming. Shapes the face. */
    appearance: number;
    /** 0 closed and defensive .. 100 open and still. Shapes the posture. */
    demeanour: number;
    /** 0 unremarkable .. 100 uncanny. Shapes the strangeness. */
    oddity: number;
    /** How their name reads; null when it could be either. Absent on older servers. */
    feminine?: boolean | null;
  };
  evidence: {
    id: string;
    description: string;
    prosecution_reading: string;
    defence_reading: string;
  }[];
  witnesses: { name: string; role: string; testimony: string; feminine?: boolean | null }[];
  prosecutionArgument: string;
  defenceArgument: string;
  /**
   * What people say out loud in the room — outbursts, witnesses digging in,
   * counsel needling. Presentation, like the face: every line is one the
   * speaker would say whether or not the defendant did it. Absent on older
   * servers; the room falls back to its own lines (lib/courtroom).
   */
  lines?: CourtroomLine[];
  returningCharacters: { name: string; portraitSeed: number }[];
  /**
   * The window closed while the player was away.
   *
   * Set only when a pending case is re-served after its clock has run out.
   * The forced hung verdict is unavoidable at that point — the server has been
   * counting since it served the case — but the app now says so and waits for
   * an acknowledgement instead of firing the verdict the instant the screen
   * mounts. Losing four trust and twenty Merit is a consequence; discovering
   * it afterwards with no explanation was a bug.
   */
  adjourned?: boolean;
}

/** A row in the archive. Deliberately lighter than a ClientCase. */
export interface HistoryEntry {
  caseNumber: number;
  title: string;
  defendantName: string;
  charge: string;
  accent: string;
  verdict: 'guilty' | 'not_guilty';
  wasHung: boolean;
  timeRemaining: number;
  /** Null until the outcome has been read at a review break. */
  outcome: string | null;
  deliveredAt: string;
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
  /** Stories in the papers the player has not read. */
  unreadNews?: number;
  /** What the city did while the player was away, oldest first. Usually empty. */
  away?: NewsStory[];
}

/** A story in the papers. See server services/news. */
export interface NewsStory {
  id: string;
  outlet: string;
  kind:
    | 'verdict'
    | 'backlash'
    | 'crime'
    | 'protest'
    | 'reform'
    | 'syndicate'
    | 'police'
    | 'economy'
    | 'press'
    | 'echo'
    | 'city';
  headline: string;
  body: string;
  /** 1 local colour .. 3 front page. */
  severity: number;
  district: string | null;
  read: boolean;
  at: string;
}

/** A district on the player's map. Opens by rank. */
export interface District {
  name: string;
  unlockRank: number;
  unlocked: boolean;
  current: boolean;
  home: boolean;
  difficulty: number;
  difficultyLabel: string;
  reward: number;
  outlet: string;
}

export interface VerdictResult {
  verdict: 'guilty' | 'not_guilty';
  wasHung: boolean;
  /** Measured by the server from when it served the case, not claimed by us. */
  timeRemaining: number;
  aftermath: string;
  /**
   * What the accused does with their face, for the verdict screen.
   *
   * The only field in this response that reflects whether the juror was right,
   * and it is deliberately shaped as the defendant's reaction rather than a
   * correctness flag — the client should not be holding "you were right" as a
   * boolean it could render as a score. Optional so an older server, or a
   * cached response from before the field existed, degrades to `neutral`
   * rather than throwing on a screen the player cannot leave.
   */
  reaction?: 'broken' | 'stricken' | 'smirk' | 'relief' | 'unreadable';
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
  /** The front page this verdict made. Absent on older servers. */
  headlines?: NewsStory[];
  /** Districts this verdict's promotion opened. */
  districtsOpened?: string[];
  /** XP/Merit multiplier for the district it was heard in. */
  rewardMultiplier?: number;
  streak?: number;
  /** Streak shields this verdict spent covering missed days. */
  shieldsUsed?: number;
  /** Set when this was the Daily Trial: how the world split so far. */
  daily?: { day: string; tally: DailyTally | null } | null;
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
  | 'seal_gold'
  | 'room_oak'
  | 'room_concrete'
  | 'room_marble'
  | 'room_night'
  // reserved: in the schema, not for sale — nothing renders them
  | 'stock_onionskin'
  | 'stock_vellum'
  // the Juror Pass (expires; the server reports what it implies)
  | 'pass'
  // a thank-you
  | 'patron';

export type RoomTheme = 'room_oak' | 'room_concrete' | 'room_marble' | 'room_night';
export type SealStyle = 'seal_brass' | 'seal_obsidian' | 'seal_ivory' | 'seal_gold' | 'patron';

export interface Session {
  userId: string;
  jurorName: string;
  /** Always 120. The server owns it; this is display only. */
  clockSeconds: number;
  entitlements: Entitlement[];
  merit: number;
  casesHeard?: number;
  /** The courtroom and seal the juror has put on. Absent on older servers. */
  equipped?: { room: RoomTheme | null; seal: SealStyle | null };
  /**
   * The player has not accepted the CURRENT Terms and Privacy Policy. The
   * ConsentGate blocks play until they do. Absent on older servers, which is
   * treated as "not required".
   */
  consentRequired?: boolean;
  /** The server's LEGAL_VERSION, to compare with the bundled one. */
  legalVersion?: string;
  /**
   * Where to send a player who wants the policy, the terms, or a human.
   *
   * Served rather than hardcoded so a URL can be corrected without shipping a
   * build — Apple requires both links to be reachable in-app from any app that
   * creates accounts, and a dead privacy policy link is a rejection.
   */
  support?: {
    privacyPolicyUrl: string | null;
    termsUrl: string | null;
    supportEmail: string | null;
  };
}

export interface StoreItem {
  id: string;
  title: string;
  blurb: string;
  kind: 'pass' | 'bundle' | 'unlock' | 'pack' | 'currency' | 'consumable' | 'cosmetic' | 'support';
  /** How the platform store sells it; null = Merit only. */
  store: 'nonconsumable' | 'consumable' | 'subscription' | null;
  period: 'month' | 'year' | null;
  badge: string | null;
  /** USD minor units — a fallback label; the store's localised price wins. */
  priceMinor: number | null;
  meritPrice: number | null;
  meritGranted: number | null;
  shieldsGranted: number | null;
  casesGranted: number | null;
  grants: Entitlement[];
  owned: boolean;
  affordable: boolean;
}

export interface DocketView {
  unlimited: boolean;
  freePerDay: number;
  bonus: number;
  usedToday: number;
  /** Null when unlimited. */
  left: number | null;
  adCasesLeft: number;
}

export interface StoreView {
  merit: number;
  entitlements: Entitlement[];
  shields: number;
  docket: DocketView;
  pass: { active: boolean; expiresAt: string | null; meritMultiplier: number };
  starter: { available: boolean; endsAt: string | null };
  equipped: { room: RoomTheme | null; seal: SealStyle | null };
  /** Progress through each special docket. */
  packs: { key: string; sku: string; owned: boolean; heard: number; total: number }[];
  rewardedAdsLeft: number;
  rewardedCasesLeft: number;
  rewardedAdMerit: number;
  items: StoreItem[];
}

export interface DailyTally {
  guilty: number;
  notGuilty: number;
  hung: number;
  total: number;
}

export interface DailyStatus {
  day: string;
  sat: boolean;
  open: boolean;
  verdict: 'guilty' | 'not_guilty' | null;
  tally: DailyTally | null;
  nextAt: string;
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
  /** The daily summons. Absent on older servers. */
  daily?: { available: boolean; satToday?: boolean; merit: number; day: string };
  /** Today's docket and the streak shields held. Absent on older servers. */
  docket?: DocketView;
  shields?: number;
  /** The fictional Chief Justice who signs the letter, named for the juror's country. */
  chiefJustice?: string;
}

export interface Mission {
  key: string;
  kind: 'daily' | 'weekly' | 'career';
  title: string;
  description: string;
  target: number;
  xp: number;
  /** Merit paid alongside the XP. */
  merit?: number;
  progress: number;
  complete: boolean;
  claimed: boolean;
  /** When a daily or weekly expires (ISO). Null for career milestones. */
  endsAt?: string | null;
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
  /** What a report of this name is filed against. Absent on older servers. */
  ref?: string;
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
  /** See Session.consentRequired. */
  consentRequired?: boolean;
  /** 30-minute bearer. */
  accessToken: string;
  /** Long-lived, rotated on every use, revocable server-side. */
  refreshToken: string;
  expiresInSeconds: number;
}

export const api = {
  /**
   * A nonce for one sign-in attempt, issued by the server.
   *
   * The client used to invent its own and the server never checked it, which
   * made it decoration — a nonce exists to bind one identity token to one
   * sign-in THIS server asked for, and a value the server has never seen
   * cannot do that. Without it, a provider token captured anywhere inside its
   * validity window could be replayed to take over an account.
   */
  signInNonce: () =>
    request<{ nonce: string; nonceSha256: string; expiresInSeconds: number }>(
      '/api/auth/nonce',
      { auth: false },
    ),

  /**
   * Sign in or swear in. The provider token is verified server-side — the
   * client never asserts who it is, only hands over what the provider signed.
   * `jurorName` is the player's own choice and is required on first sign-in;
   * a 409 juror_name_required means the court needs a name before proceeding.
   * A 400 juror_name_rejected means the name did not pass the registry filter,
   * and `message` says what to change.
   */
  signIn: (body: {
    provider: 'apple' | 'google' | 'guest' | 'device';
    token: string;
    /** Apple only, so account deletion can revoke Apple's grant. */
    authorizationCode?: string;
    /** The LEGAL_VERSION the sign-in screen showed and the player continued past. */
    consentVersion?: string;
    /** The nonce from signInNonce(). Required for apple and google. */
    nonce?: string;
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
    request<{ xp: number; rank: number; merit?: number }>('/api/standing/missions/claim', {
      method: 'POST',
      body: { key },
    }),

  districts: () => request<{ districts: District[] }>('/api/standing/districts'),

  selectDistrict: (district: string) =>
    request<{ districts: District[]; standing: Standing }>('/api/standing/districts/select', {
      method: 'POST',
      body: { district },
    }),

  collectDaily: () =>
    request<{ merit: number; meritTotal: number; day: string }>('/api/standing/daily', {
      method: 'POST',
    }),

  news: (before?: string) =>
    request<{ items: NewsStory[]; unread: number }>(
      `/api/news${before ? `?before=${encodeURIComponent(before)}` : ''}`,
    ),

  readNews: (ids?: string[]) =>
    request<{ ok: boolean }>('/api/news/read', { method: 'POST', body: ids ? { ids } : {} }),

  jurisdictions: () =>
    request<JurisdictionsView>('/api/standing/jurisdictions'),

  applyToJurisdiction: (body: { country: string; tier: Tier }) =>
    request<{ accepted: boolean; decisionText: string; standing: Standing }>(
      '/api/standing/jurisdictions/apply',
      { method: 'POST', body },
    ),

  /**
   * NOTE: `createSession` and `updateSettings` are gone.
   *
   * Both were fossils of vulnerabilities the server had already closed, still
   * sitting here as callable methods. `createSession` posted to /api/session,
   * which was deleted for minting a fully playable juror from a name and no
   * provider token. `updateSettings` PATCHed `trialUnlocked` — the exact field
   * the entitlement rewrite removed BECAUSE the client could set it, which is
   * what made the paid campaign free to anyone with curl.
   *
   * Neither had a caller. Both would have 404'd. They are removed rather than
   * left as documentation, because a client method that names a closed hole is
   * an invitation to somebody who does not know the history.
   */

  me: () => request<Session>('/api/session/me'),

  /**
   * Accept the Terms and Privacy Policy, naming the version shown. A 409
   * `legal_version_mismatch` means the server has newer papers than this
   * build bundles — the player needs an update, not another tap.
   */
  acceptConsent: (version: string) =>
    request<{ consentVersion: string; consentedAt: string }>('/api/session/consent', {
      method: 'POST',
      body: { version },
    }),

  /** Everything the court holds about this juror, as JSON (GDPR access). */
  exportData: () => request<Record<string, unknown>>('/api/session/export'),

  /**
   * Change the name on the public registry.
   *
   * The only remedy short of deleting an account, and required by App Store
   * Guideline 1.2 for user-generated content. One change a day.
   */
  renameJuror: (jurorName: string) =>
    request<{ jurorName: string; changed: boolean }>('/api/session/me/name', {
      method: 'PATCH',
      body: { jurorName },
    }),

  /** The next case: the ordinary docket, or a special docket by key. */
  nextCase: (pack?: string) =>
    request<ClientCase>(`/api/case/next${pack ? `?pack=${encodeURIComponent(pack)}` : ''}`),

  /** The Daily Trial — one case for the whole world today. */
  dailyCase: () => request<ClientCase>('/api/case/daily'),
  dailyStatus: () => request<DailyStatus>('/api/case/daily/status'),

  /**
   * Deliver a verdict.
   *
   * We send which case and which way, and nothing else. `timeRemaining` and
   * `wasHung` used to travel from here and be believed — the server now
   * measures both from when it served the case. The phone does not get a vote
   * on how long the phone took.
   */
  submitVerdict: (body: {
    caseId: string;
    verdict?: 'guilty' | 'not_guilty';
    /** How much of the file was read. For missions only; see server verdict.ts. */
    read?: { examined: number; witnesses: number; arguments: boolean };
  }) =>
    request<VerdictResult>('/api/verdict', { method: 'POST', body }),

  cityState: () => request<CityState>('/api/city-state'),

  review: () => request<{ entries: ReviewEntry[] }>('/api/review'),

  /**
   * The archive — the whole record, a page at a time.
   *
   * Unlocks at rank 2 and had no client method at all, so the thing the gate
   * opened was unreachable from the app. Paged because the server no longer
   * returns an entire career in one response, and neither should a list screen
   * ask for one.
   */
  history: (before?: string) =>
    request<{ entries: HistoryEntry[]; nextCursor: string | null }>(
      `/api/review/history${before ? `?before=${encodeURIComponent(before)}` : ''}`,
    ),

  jurorRecord: () => request<JurorRecord>('/api/juror-profile'),

  // ---- Reporting ----

  /**
   * Tell the court something is wrong.
   *
   * Required by App Store Guideline 1.2 for the juror names on the public
   * registry, and required by judgement for the generated docket: this game
   * ships model-written criminal accusations about invented people, set in
   * named real jurisdictions, without a human reading them first. A reported
   * case is quarantined immediately and leaves the docket.
   */
  report: (body: {
    kind: 'case' | 'juror_name';
    subjectId: string;
    reason: 'real_person' | 'harmful_content' | 'offensive_name' | 'broken_case' | 'other';
    detail?: string;
  }) =>
    request<{ reported: boolean; reference: string; message: string }>('/api/report', {
      method: 'POST',
      body,
    }),

  reportReasons: () =>
    request<{ reasons: { key: string; label: string }[] }>('/api/report/reasons'),

  // ---- Store ----

  store: () => request<StoreView>('/api/store'),

  /** Buy with Merit. The server prices it; we only name it. */
  buyWithMerit: (sku: string) =>
    request<{ sku: string; granted: Entitlement | null; meritBalance: number }>('/api/store/buy', {
      method: 'POST',
      body: { sku },
    }),

  /**
   * Hand a store receipt to the server for validation.
   *
   * This had no client method, which is why the money path was unreachable
   * however complete the server side was. The flow is: the IAP SDK completes a
   * purchase and returns a receipt (StoreKit 2's signedTransactionInfo, or
   * Play's purchaseToken), this posts it, and the server verifies it with
   * Apple or Google before granting anything.
   *
   * We never tell the server what was bought and expect to be believed — the
   * sku is checked against the product id in the receipt, and against what
   * Apple's own API says the transaction actually was.
   */
  redeemPurchase: (body: {
    sku: string;
    transactionId: string;
    platform: 'ios' | 'android';
    receipt: string;
  }) =>
    request<{ sku: string; granted: Entitlement | null; meritBalance: number }>(
      '/api/store/redeem',
      { method: 'POST', body },
    ),

  restorePurchases: () =>
    request<{ restored: number; entitlements: Entitlement[] }>('/api/store/restore', {
      method: 'POST',
    }),

  adPolicy: () => request<AdPolicy>('/api/store/ads'),

  /** Development only: production views are paid by Google's callback. */
  claimAdReward: (viewId: string, reward: 'merit' | 'case' = 'merit') =>
    request<{ merit: number; awarded: number }>('/api/store/ad-reward', {
      method: 'POST',
      body: { viewId, reward },
    }),

  /** Put on a courtroom or seal the juror owns; null takes it off. */
  equip: (body: { room?: RoomTheme | null; seal?: SealStyle | null }) =>
    request<{ equipped: { room: RoomTheme | null; seal: SealStyle | null } }>('/api/store/equip', {
      method: 'POST',
      body,
    }),

  // ---- Account ----

  signOut: () => request<{ signedOut: boolean }>('/api/auth/sign-out', { method: 'POST' }),

  /** Irreversible. Takes the career, the city, and every verdict with it. */
  deleteAccount: () => request<{ deleted: boolean }>('/api/session/me', { method: 'DELETE' }),
};
