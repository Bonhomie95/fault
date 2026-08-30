import { create } from 'zustand';
import {
  api,
  ApiError,
  setSignedOutHandler,
  setTokenPersister,
  setTokens,
  type CityState,
  type ClientCase,
  type Entitlement,
  type Session,
  type Standing,
  type VerdictResult,
} from '@/lib/api';
import type { ProviderToken } from '@/lib/auth';
import { resolveCountry } from '@/lib/location';
import { reportError, setReportingUser } from '@/lib/report';
import { storage } from '@/lib/storage';

const TOKEN_KEY = 'fault.session.tokens';

interface GameState {
  jurorId: string | null;
  jurorName: string | null;
  /** Display only; the server owns the real one. Always 120. */
  clockSeconds: number;
  entitlements: Entitlement[];
  merit: number;
  hasBriefed: boolean;

  activeCase: ClientCase | null;
  lastResult: VerdictResult | null;
  /** The decided case's accent, kept alive after activeCase is cleared so the
   *  verdict screen can still flash the colour the case arrived in. */
  lastAccent: string | null;
  /**
   * The person who was just judged, for the same reason.
   *
   * `activeCase` is cleared the moment a verdict lands — correctly, since the
   * trial is over and nothing should be able to re-read a decided dossier. But
   * the verdict screen now shows the accused reacting, and it cannot draw a
   * face it no longer has. Only what a portrait needs is kept: no evidence, no
   * witnesses, no charge.
   */
  lastDefendant: { portraitSeed: number; appearance: number } | null;
  city: CityState | null;
  standing: Standing | null;

  bootstrapping: boolean;
  error: string | null;

  bootstrap: () => Promise<void>;
  /** Sign in with a verified provider token. Country is resolved on device and
   *  only the ISO code is ever sent. */
  swearInWith: (token: ProviderToken, jurorName: string) => Promise<void>;
  signInExisting: (token: ProviderToken) => Promise<boolean>;
  refreshStanding: () => Promise<void>;
  loadCase: () => Promise<void>;
  /** null = the clock ran out and the player never chose. */
  deliverVerdict: (verdict: 'guilty' | 'not_guilty' | null) => Promise<VerdictResult>;
  refreshCity: () => Promise<void>;
  markBriefed: () => void;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshWallet: () => Promise<void>;
  clearError: () => void;
}

export const useGame = create<GameState>((set, get) => ({
  jurorId: null,
  jurorName: null,
  clockSeconds: 120,
  entitlements: [],
  merit: 0,
  hasBriefed: false,

  activeCase: null,
  lastResult: null,
  lastDefendant: null,
  lastAccent: null,
  city: null,
  standing: null,

  bootstrapping: true,
  error: null,

  /**
   * Re-attach this device's session.
   *
   * Restores the token pair into the API layer and installs the hooks it needs
   * to persist a rotated refresh token and to tell us when the session is
   * beyond saving.
   */
  bootstrap: async () => {
    setTokenPersister(async (t) => {
      await storage.set(TOKEN_KEY, JSON.stringify(t));
    });
    setSignedOutHandler(() => {
      void storage.remove(TOKEN_KEY);
      set({ jurorId: null, jurorName: null, activeCase: null, standing: null });
    });

    try {
      const raw = await storage.get(TOKEN_KEY);
      if (!raw) {
        set({ bootstrapping: false });
        return;
      }

      setTokens(JSON.parse(raw));
      const session: Session = await api.me();
      setReportingUser(session.userId);
      set({
        jurorId: session.userId,
        jurorName: session.jurorName,
        clockSeconds: session.clockSeconds,
        entitlements: session.entitlements,
        merit: session.merit,
        // A returning juror has already read the letter.
        hasBriefed: (session.casesHeard ?? 0) > 0,
        bootstrapping: false,
      });
    } catch (err) {
      // Tokens the server will not honour are worse than none. Worth
      // reporting even so: a bootstrap that fails for everyone is an outage,
      // and this catch used to make it invisible.
      reportError('bootstrap', err);
      setTokens(null);
      await storage.remove(TOKEN_KEY).catch(() => {});
      set({ bootstrapping: false });
    }
  },

  /**
   * First time through. Resolves the country on-device (coordinates never
   * leave the phone — see lib/location) and swears the juror in under the name
   * they chose, not the one their Apple or Google account carries.
   */
  swearInWith: async (token: ProviderToken, jurorName: string) => {
    const country = await resolveCountry();

    const result = await api.signIn({
      provider: token.provider,
      token: token.token,
      // The nonce the server issued for this attempt, carried back so it can
      // check that the provider signed THIS sign-in and not a replayed one.
      ...(token.nonce ? { nonce: token.nonce } : {}),
      jurorName,
      ...(country.code ? { country: country.code } : {}),
      // The player's own day is where streaks and daily missions end.
      timezone: deviceTimezone(),
    });

    await adoptSession(result);
    setReportingUser(result.userId);
    set({ jurorId: result.userId, jurorName: result.jurorName, hasBriefed: false });
    await get().refreshStanding();
    await get().refreshWallet();
  },

  /**
   * A returning juror. Returns false when the court has never met this
   * identity and needs a name before it will seat them.
   */
  signInExisting: async (token: ProviderToken) => {
    try {
      const result = await api.signIn({
        provider: token.provider,
        token: token.token,
        ...(token.nonce ? { nonce: token.nonce } : {}),
        timezone: deviceTimezone(),
      });
      await adoptSession(result);
      setReportingUser(result.userId);
      set({
        jurorId: result.userId,
        jurorName: result.jurorName,
        // Same rule as bootstrap: the letter is owed to anyone who has never
        // heard a case. This used to assume that signing in meant having read
        // it, so a juror who swore in, quit on the letter and came back was
        // dropped straight into the lobby having been told nothing.
        hasBriefed: (result.casesHeard ?? 0) > 0,
      });
      await get().refreshStanding();
      await get().refreshWallet();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.code === 'juror_name_required') return false;
      throw err;
    }
  },

  refreshStanding: async () => {
    if (!get().jurorId) return;
    try {
      set({ standing: await api.standing() });
    } catch (err) {
      // Standing is a display concern; never block the room on it — but a
      // display concern that fails silently forever is how a broken endpoint
      // goes unnoticed for a month.
      reportError('refreshStanding', err);
    }
  },

  refreshWallet: async () => {
    if (!get().jurorId) return;
    try {
      const session = await api.me();
      set({ merit: session.merit, entitlements: session.entitlements });
    } catch (err) {
      reportError('refreshWallet', err);
    }
  },

  loadCase: async () => {
    if (!get().jurorId) throw new Error('not sworn in');
    const activeCase = await api.nextCase();
    set({ activeCase });
  },

  /**
   * Deliver a verdict.
   *
   * We send the case and the direction. Nothing else: the server measures how
   * long we took and decides whether the clock beat us, because those are
   * facts about us and we are not a trustworthy witness to them.
   */
  deliverVerdict: async (verdict) => {
    const { activeCase } = get();
    if (!activeCase) throw new Error('no case in progress');

    const result = await api.submitVerdict({
      caseId: activeCase.id,
      ...(verdict ? { verdict } : {}),
    });

    set({
      lastResult: result,
      lastAccent: activeCase.accent,
      lastDefendant: {
        portraitSeed: activeCase.defendant.portraitSeed,
        appearance: activeCase.defendant.appearance,
      },
      city: result.city,
      activeCase: null,
    });
    void get().refreshStanding();
    void get().refreshWallet();
    return result;
  },

  refreshCity: async () => {
    if (!get().jurorId) return;
    set({ city: await api.cityState() });
  },

  markBriefed: () => set({ hasBriefed: true }),

  signOut: async () => {
    try {
      await api.signOut();
    } catch (err) {
      // Signing out locally matters more than telling the server about it.
      reportError('signOut', err);
    }
    setTokens(null);
    setReportingUser(null);
    await storage.remove(TOKEN_KEY).catch(() => {});
    set({ jurorId: null, jurorName: null, activeCase: null, standing: null, city: null });
  },

  deleteAccount: async () => {
    await api.deleteAccount();
    setTokens(null);
    await storage.remove(TOKEN_KEY).catch(() => {});
    set({ jurorId: null, jurorName: null, activeCase: null, standing: null, city: null });
  },

  clearError: () => set({ error: null }),
}));

/** The device's IANA zone, e.g. "Europe/Oslo". */
function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

async function adoptSession(result: { accessToken: string; refreshToken: string }) {
  setTokens(result);
  await storage.set(
    TOKEN_KEY,
    JSON.stringify({ accessToken: result.accessToken, refreshToken: result.refreshToken }),
  );
}
