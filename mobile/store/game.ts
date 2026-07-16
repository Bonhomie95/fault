import { create } from 'zustand';
import { api, type CityState, type ClientCase, type Session, type VerdictResult } from '@/lib/api';
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

  bootstrapping: boolean;
  error: string | null;

  bootstrap: () => Promise<void>;
  swearIn: (name: string) => Promise<void>;
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

  swearIn: async (name: string) => {
    const session = await api.createSession(name);
    await storage.set(JUROR_KEY, session.userId);
    set({
      jurorId: session.userId,
      jurorName: session.jurorName,
      clockSeconds: session.clockSeconds,
      trialUnlocked: session.trialUnlocked,
      hasBriefed: false,
    });
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
