import { requireOptionalNativeModule } from 'expo-modules-core';
import { rand } from '@/lib/seed';
import { effectiveVolume, voiceOn } from '@/store/settings';

/**
 * The people in the room, out loud.
 *
 * Every line spoken is also a line the player can read (unless they chose
 * voice alone) — nothing is said that is not on the record. That matters more
 * here than usual: the game measures whether a juror is swayed by
 * presentation, and a voice is presentation. Voices are cast the same way
 * faces are, from the person's seed, so they carry no information either.
 *
 * EXPO-SPEECH IS LOADED LAZILY, AND ITS ABSENCE IS NOT AN ERROR. A native
 * module only exists in a build that was compiled with it, and a top-level
 * `import * as Speech from 'expo-speech'` in a build made before it was added
 * throws "Cannot find native module 'ExpoSpeech'" while the module graph is
 * still loading — which took down the whole case screen, from a file whose
 * only job is an optional flourish. Asking first means an older build is
 * simply a build where nobody speaks.
 */

interface NativeVoice {
  identifier: string;
  name: string;
  quality: string;
  language: string;
}

type SpeechModule = {
  speak: (text: string, options?: Record<string, unknown>) => void;
  stop: () => void;
  getAvailableVoicesAsync: () => Promise<NativeVoice[]>;
};

let speech: SpeechModule | null | undefined;

function engine(): SpeechModule | null {
  if (speech !== undefined) return speech;
  speech = null;
  try {
    // ASK, rather than provoke. `require('expo-speech')` on a build without
    // the pod THROWS, and catching that is not enough: Expo reports the
    // failure through the global handler on its way out, so the red box says
    // "Uncaught Error" over a screen that is working fine.
    if (requireOptionalNativeModule('ExpoSpeech')) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above
      speech = require('expo-speech') as SpeechModule;
    }
  } catch {
    speech = null;
  }
  return speech;
}

/** Is there anything here that could speak? False on a build without the pod. */
export function canSpeak(): boolean {
  return engine() !== null;
}

/* ------------------------------------------------------------------ *
 * Casting voices.
 * ------------------------------------------------------------------ */

/**
 * Which system voices read as which presentation.
 *
 * Neither platform says. These are the stock English voices on iOS and the
 * common ones on Android; an unknown name is simply left out of both pools
 * and the pitch does the work instead.
 */
const FEMININE = new Set([
  'samantha', 'karen', 'moira', 'tessa', 'fiona', 'victoria', 'allison', 'ava', 'susan',
  'serena', 'kate', 'catherine', 'martha', 'nicky', 'zoe', 'veena', 'sangeeta', 'isha',
  'kathy', 'princess', 'vicki', 'joelle', 'shelley', 'sandy', 'flo', 'grandma',
]);
const MASCULINE = new Set([
  'daniel', 'alex', 'fred', 'tom', 'oliver', 'arthur', 'aaron', 'gordon', 'rishi', 'lee',
  'thomas', 'albert', 'ralph', 'bruce', 'junior', 'reed', 'rocko', 'eddy', 'grandpa', 'james', 'evan',
]);

let voices: NativeVoice[] | null = null;
let loading: Promise<void> | null = null;

/** Load the device's voices once. Speaking before this finishes uses the default. */
export function warmVoices(): Promise<void> {
  const e = engine();
  if (!e || voices) return Promise.resolve();
  loading ??= e
    .getAvailableVoicesAsync()
    .then((list) => {
      voices = list.filter((v) => /^en[-_]/i.test(v.language));
    })
    .catch(() => {
      voices = [];
    });
  return loading;
}

function firstName(v: NativeVoice): string {
  return v.name.toLowerCase().split(/[\s(]/)[0] ?? '';
}

export interface VoiceProfile {
  /** The person — the same seed always gets the same voice. */
  seed: number;
  feminine: boolean;
  /** ISO country of the court, for an accent when the device has one. */
  country?: string;
}

/** How a line is delivered: tone moves the rate and pitch a little. */
export type Delivery = 'pleading' | 'defiant' | 'tense' | 'ashamed' | 'startled' | 'calm';

const DELIVERY: Record<Delivery, { rate: number; pitch: number }> = {
  pleading: { rate: 0.9, pitch: 1.04 },
  defiant: { rate: 1.0, pitch: 0.96 },
  tense: { rate: 1.04, pitch: 1.0 },
  ashamed: { rate: 0.86, pitch: 0.95 },
  startled: { rate: 1.08, pitch: 1.06 },
  calm: { rate: 0.95, pitch: 0.98 },
};

function pickVoice(p: VoiceProfile): NativeVoice | null {
  if (!voices?.length) return null;
  const pool = voices.filter((v) =>
    (p.feminine ? FEMININE : MASCULINE).has(firstName(v)),
  );
  if (!pool.length) return null;
  // Prefer the court's own English, then the better-quality voices.
  const local = p.country
    ? pool.filter((v) => v.language.toUpperCase().endsWith(p.country!.toUpperCase()))
    : [];
  const ranked = local.length && rand(p.seed, 71) < 0.7 ? local : pool;
  const enhanced = ranked.filter((v) => /enhanced|premium/i.test(v.quality));
  const final = enhanced.length ? enhanced : ranked;
  return final[Math.floor(rand(p.seed, 73) * final.length) % final.length] ?? null;
}

/* ------------------------------------------------------------------ *
 * Speaking.
 * ------------------------------------------------------------------ */

export interface SayOptions {
  voice?: VoiceProfile;
  tone?: Delivery;
  onStart?: () => void;
  /** Fires once, however the line ends — finished, cut off, or failed. */
  onDone?: () => void;
}

/**
 * Say one line, cancelling whatever was still being said.
 *
 * The lines replace one another on screen, and a queue would leave the voice a
 * sentence behind the text. Returns false when nothing will be heard (voice
 * off, muted, or no engine) — and in that case `onDone` is NOT called, so the
 * caller paces the line by reading time instead.
 */
export function say(line: string, opts: SayOptions = {}): boolean {
  if (!voiceOn() || !line.trim()) return false;
  const e = engine();
  if (!e) return false;

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    opts.onDone?.();
  };

  try {
    e.stop();
    const v = opts.voice ? pickVoice(opts.voice) : null;
    const d = DELIVERY[opts.tone ?? 'calm'];
    // Each person's own register, from the seed: two men with the same
    // system voice still should not sound like one man.
    const personal = opts.voice ? (rand(opts.voice.seed, 79) - 0.5) * 0.16 : 0;
    // With no matching system voice, pitch alone has to carry presentation.
    const presentation = v || !opts.voice ? 1 : opts.voice.feminine ? 1.18 : 0.84;
    e.speak(line, {
      voice: v?.identifier,
      language: v?.language,
      rate: d.rate * (v ? 1 : 0.95),
      pitch: Math.max(0.5, Math.min(2, d.pitch * presentation + personal)),
      volume: effectiveVolume(),
      onStart: opts.onStart,
      onDone: finish,
      onStopped: finish,
      onError: finish,
    });
    return true;
  } catch {
    return false;
  }
}

/** Stop mid-sentence — the screen has moved on. */
export function hush() {
  try {
    engine()?.stop();
  } catch {
    /* nothing to stop */
  }
}
