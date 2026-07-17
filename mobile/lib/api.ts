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

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; jurorId?: string | null } = {},
): Promise<T> {
  const { method = 'GET', body, jurorId } = options;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(jurorId ? { 'x-juror-id': jurorId } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? 'unknown', data.message ?? data.error ?? 'Request failed');
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
  timeRemaining: number;
  aftermath: string;
  city: CityState;
  triggerReview: boolean;
  casesHeard: number;
  consensus: { guiltyPercent: number; sampleSize: number };
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

export interface Session {
  userId: string;
  jurorName: string;
  clockSeconds: number;
  trialUnlocked: boolean;
  casesHeard?: number;
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

export interface SignInResult {
  userId: string;
  jurorName: string;
  returning: boolean;
  homeCountry?: string;
  homeDistrict?: string;
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
  }) => request<SignInResult>('/api/auth/sign-in', { method: 'POST', body }),

  countries: () =>
    request<{ countries: { code: string; name: string; districts: string[] }[] }>(
      '/api/auth/countries',
    ),

  standing: (jurorId: string) => request<Standing>('/api/standing', { jurorId }),

  ladder: (jurorId: string) =>
    request<{ country: string; current: Tier; rungs: { tier: Tier; label: string; reached: boolean }[] }>(
      '/api/standing/ladder',
      { jurorId },
    ),

  promote: (jurorId: string) =>
    request<{ promoted: Tier; standing: Standing }>('/api/standing/promote', {
      method: 'POST',
      jurorId,
    }),

  missions: (jurorId: string) =>
    request<{ missions: Mission[] }>('/api/standing/missions', { jurorId }),

  claimMission: (jurorId: string, key: string) =>
    request<{ xp: number; rank: number }>('/api/standing/missions/claim', {
      method: 'POST',
      body: { key },
      jurorId,
    }),

  jurisdictions: (jurorId: string) =>
    request<JurisdictionsView>('/api/standing/jurisdictions', { jurorId }),

  applyToJurisdiction: (jurorId: string, body: { country: string; tier: Tier }) =>
    request<{ accepted: boolean; decisionText: string; standing: Standing }>(
      '/api/standing/jurisdictions/apply',
      { method: 'POST', body, jurorId },
    ),

  createSession: (jurorName: string) =>
    request<Session>('/api/session', { method: 'POST', body: { jurorName } }),

  me: (jurorId: string) => request<Session>('/api/session/me', { jurorId }),

  updateSettings: (jurorId: string, body: { clockSeconds?: number; trialUnlocked?: boolean }) =>
    request<{ clockSeconds: number; trialUnlocked: boolean }>('/api/session/me', {
      method: 'PATCH',
      body,
      jurorId,
    }),

  nextCase: (jurorId: string) => request<ClientCase>('/api/case/next', { jurorId }),

  submitVerdict: (
    jurorId: string,
    body: { caseId: string; verdict?: 'guilty' | 'not_guilty'; timeRemaining: number; wasHung?: boolean },
  ) => request<VerdictResult>('/api/verdict', { method: 'POST', body, jurorId }),

  cityState: (jurorId: string) => request<CityState>('/api/city-state', { jurorId }),

  review: (jurorId: string) => request<{ entries: ReviewEntry[] }>('/api/review', { jurorId }),

  jurorRecord: (jurorId: string) => request<JurorRecord>('/api/juror-profile', { jurorId }),
};
