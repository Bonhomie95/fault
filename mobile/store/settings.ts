import { create } from 'zustand';
import { storage } from '@/lib/storage';

const KEY = 'fault.settings';

/**
 * Device preferences.
 *
 * These live on the phone, not the server: they are about this device's
 * speaker, this device's taptic engine, and this person's eyes. A player with
 * two phones may reasonably want different answers on each.
 *
 * The important part is that they are PERSISTED and READ. The previous
 * settings screen had switches wired to `useState` and nothing else — they
 * looked like controls, did nothing, and told the player the game lies about
 * small things.
 */

export interface SettingsState {
  /** 0..1. Applied to every sound at play time. */
  volume: number;
  muted: boolean;
  haptics: boolean;
  /**
   * Type scale. GDD 8 lists text size first among settings — "critical, lots
   * of reading under pressure" — and it matters more now the clock is fixed at
   * 120 seconds for everyone, since reading speed is the one thing the player
   * can still change.
   */
  textScale: number;

  loaded: boolean;
  load: () => Promise<void>;
  set: (patch: Partial<Pick<SettingsState, 'volume' | 'muted' | 'haptics' | 'textScale'>>) => Promise<void>;
}

export const TEXT_SCALES = [
  { label: 'Small', value: 0.9 },
  { label: 'Normal', value: 1 },
  { label: 'Large', value: 1.15 },
  { label: 'Larger', value: 1.3 },
] as const;

const DEFAULTS = { volume: 0.7, muted: false, haptics: true, textScale: 1 };

export const useSettings = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  loaded: false,

  load: async () => {
    try {
      const raw = await storage.get(KEY);
      if (raw) set({ ...DEFAULTS, ...JSON.parse(raw), loaded: true });
      else set({ loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  set: async (patch) => {
    set(patch);
    const { volume, muted, haptics, textScale } = get();
    await storage.set(KEY, JSON.stringify({ volume, muted, haptics, textScale })).catch(() => {});
  },
}));

/** The gain a sound should actually play at, right now. */
export function effectiveVolume(): number {
  const { volume, muted } = useSettings.getState();
  return muted ? 0 : volume;
}

export function hapticsOn(): boolean {
  return useSettings.getState().haptics;
}
