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
  /**
   * How the people in the room are heard: read, spoken, or both.
   *
   * Separate from `muted`, because they are different decisions: `muted` is
   * about the room you are sitting in, and this is about how you want the
   * courtroom delivered. Mute still silences voices — a mute switch that
   * leaves something talking is a broken mute switch — and when it does, a
   * player on 'voice' gets the words on screen instead of nothing at all.
   */
  speech: SpeechMode;
  /**
   * Local reminders: the daily summons, a streak about to lapse, the city
   * getting worse without you. Scheduled on this phone only (lib/reminders) —
   * no push server, no tracking. On by default; the OS still asks first.
   */
  reminders: boolean;
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
  set: (
    patch: Partial<Pick<SettingsState, 'volume' | 'muted' | 'speech' | 'haptics' | 'textScale' | 'reminders'>>,
  ) => Promise<void>;
}

export const TEXT_SCALES = [
  { label: 'Small', value: 0.9 },
  { label: 'Normal', value: 1 },
  { label: 'Large', value: 1.15 },
  { label: 'Larger', value: 1.3 },
] as const;

export type SpeechMode = 'text' | 'voice' | 'both';

export const SPEECH_MODES: { value: SpeechMode; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'voice', label: 'Voice' },
  { value: 'both', label: 'Both' },
];

const DEFAULTS = {
  volume: 0.7,
  muted: false,
  speech: 'both' as SpeechMode,
  reminders: true,
  haptics: true,
  textScale: 1,
};

/** Read a stored blob, including the shape before `speech` existed. */
function migrate(stored: Record<string, unknown>): Partial<SettingsState> {
  const out: Record<string, unknown> = { ...stored };
  if (!('speech' in stored) && 'voice' in stored) {
    out.speech = stored.voice ? 'both' : 'text';
  }
  delete out.voice;
  if (!['text', 'voice', 'both'].includes(out.speech as string)) delete out.speech;
  return out as Partial<SettingsState>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  loaded: false,

  load: async () => {
    try {
      const raw = await storage.get(KEY);
      if (raw) set({ ...DEFAULTS, ...migrate(JSON.parse(raw)), loaded: true });
      else set({ loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  set: async (patch) => {
    set(patch);
    const { volume, muted, speech, haptics, textScale, reminders } = get();
    await storage
      .set(KEY, JSON.stringify({ volume, muted, speech, haptics, textScale, reminders }))
      .catch(() => {});
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

/**
 * Should the people in the room be heard?
 *
 * Mute wins. A player who has silenced the game has silenced all of it.
 */
export function voiceOn(): boolean {
  const { speech, muted } = useSettings.getState();
  return speech !== 'text' && !muted;
}

/**
 * Should their words be on screen?
 *
 * Yes unless the player chose voice alone AND a voice can actually be heard —
 * muted, or on a build with no speech engine, 'voice' would otherwise mean
 * a courtroom of silent moving mouths.
 */
export function showsText(mode: SpeechMode, muted: boolean, canSpeak: boolean): boolean {
  return mode !== 'voice' || muted || !canSpeak;
}
