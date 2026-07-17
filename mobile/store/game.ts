import { create } from 'zustand';
import {
  api,
  ApiError,
  type CityState,
  type ClientCase,
  type Session,
  type Standing,
  type VerdictResult,
} from '@/lib/api';
import type { ProviderToken } from '@/lib/auth';
import { resolveCountry } from '@/lib/location';
import { storage } from '@/lib/storage';

const JUROR_KEY = 'fault.juror.id';

interface GameState {
  jurorId: string | null;
  jurorName: string | null;
  clockSeconds: number;
  trialUnlocked: boolean;
  hasBriefed: boolean;

  activeCase: ClientCase | null;
  lastResult: VerdictResult | null;
  /** The decided case's accent, kept alive after activeCase is cleared so the
   *  verdict screen can still flash the colour the case arrived in. */
  lastAccent: string | null;
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
  deliverVerdict: (verdict: 'guilty' | 'not_guilty' | null, timeRemaining: number) => Promise<VerdictResult>;
  refreshCity: () => Promise<void>;
  setClockSeconds: (seconds: number) => Promise<void>;
  markBriefed: () => void;
  clearError: () => void;
}

export const useGame = create<GameState>((set, get) => ({
  jurorId: null,
  jurorName: null,
  clockSeconds: 120,
  trialUnlocked: false,
  hasBriefed: false,

  activeCase: null,
  lastResult: null,
  lastAccent: null,
  city: null,
  standing: null,

  bootstrapping: true,
  error: null,

  /** Re-attach the juror this device already belongs to, if any. */
  bootstrap: async () => {
    try {
      const stored = await storage.get(JUROR_KEY);
      if (!stored) {
        set({ bootstrapping: false });
        return;
      }

      const session: Session = await api.me(stored);
      set({
        jurorId: session.userId,
        jurorName: session.jurorName,
        clockSeconds: session.clockSeconds,
        trialUnlocked: session.trialUnlocked,
        // A returning juror has already read the letter.
        hasBriefed: (session.casesHeard ?? 0) > 0,
        bootstrapping: false,
      });
    } catch {
      // A juror id that the server no longer knows is worse than none.
      await storage.remove(JUROR_KEY).catch(() => {});
      set({ bootstrapping: false });
    }
  },

  /**
   * First time through. Resolves the country on-device (coordinates never
   * leave the phone — see lib/location) and swears the juror in under the
   * name they chose, not the one their Apple or Google account carries.
   */
  swearInWith: async (token: ProviderToken, jurorName: string) => {
    const country = await resolveCountry();

    const result = await api.signIn({
      provider: token.provider,
      token: token.token,
      jurorName,
      ...(country.code ? { country: country.code } : {}),
    });

    await storage.set(JUROR_KEY, result.userId);
    set({ jurorId: result.userId, jurorName: result.jurorName, hasBriefed: false });
    await get().refreshStanding();
  },

  /**
   * A returning juror. Returns false when the court has never met this
   * identity and needs a name before it will seat them.
   */
  signInExisting: async (token: ProviderToken) => {
    try {
      const result = await api.signIn({ provider: token.provider, token: token.token });
      await storage.set(JUROR_KEY, result.userId);
      set({ jurorId: result.userId, jurorName: result.jurorName, hasBriefed: true });
      await get().refreshStanding();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.code === 'juror_name_required') return false;
      throw err;
    }
  },

  refreshStanding: async () => {
    const { jurorId } = get();
    if (!jurorId) return;
    try {
      set({ standing: await api.standing(jurorId) });
    } catch {
      // Standing is a display concern; never block the room on it.
    }
  },

  loadCase: async () => {
    const { jurorId } = get();
    if (!jurorId) throw new Error('not sworn in');
    const activeCase = await api.nextCase(jurorId);
    set({ activeCase });
  },

  /**
   * A null verdict means the clock ran out. The server decides what a forced
   * verdict becomes — the client never flips that coin.
   */
  deliverVerdict: async (verdict, timeRemaining) => {
    const { jurorId, activeCase } = get();
    if (!jurorId || !activeCase) throw new Error('no case in progress');

    const result = await api.submitVerdict(jurorId, {
      caseId: activeCase.id,
      ...(verdict ? { verdict } : {}),
      timeRemaining,
      wasHung: verdict === null,
    });

    set({ lastResult: result, lastAccent: activeCase.accent, city: result.city, activeCase: null });
    // Rank may have moved; standing is cheap and the lobby shows it.
    void get().refreshStanding();
    return result;
  },

  refreshCity: async () => {
    const { jurorId } = get();
    if (!jurorId) return;
    const city = await api.cityState(jurorId);
    set({ city });
  },

  setClockSeconds: async (seconds: number) => {
    const { jurorId } = get();
    if (!jurorId) return;
    await api.updateSettings(jurorId, { clockSeconds: seconds });
    set({ clockSeconds: seconds });
  },

  markBriefed: () => set({ hasBriefed: true }),
  clearError: () => set({ error: null }),
}));
