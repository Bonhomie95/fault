import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { effectiveVolume } from '@/store/settings';

/**
 * The room's sound.
 *
 * Two kinds of thing live here and they behave differently:
 *
 *   BEDS   (room, tension) loop, and fade rather than cut. The room bed runs
 *          under a whole case; the tension bed rises under the last fifteen
 *          seconds. Cutting either would be more noticeable than the sound.
 *
 *   HITS   (gavel, paper, tick, ...) are fired and forgotten. They are
 *          rewound before playing, because a hit that is already playing must
 *          restart rather than be ignored — a tick that skips is a clock that
 *          skips.
 *
 * Every play reads the live volume, so the settings slider takes effect on the
 * next sound rather than the next launch. Muting is volume 0, not a separate
 * path: one place to be wrong instead of two.
 *
 * All of it is best-effort. Audio failing is never a reason for the game to
 * fail — a silent courtroom is a worse game, not a broken one.
 */

const FILES = {
  room: require('../assets/sound/room.wav'),
  tension: require('../assets/sound/tension.wav'),
  tick: require('../assets/sound/tick.wav'),
  gavel: require('../assets/sound/gavel.wav'),
  paper: require('../assets/sound/paper.wav'),
  exhibit: require('../assets/sound/exhibit.wav'),
  open: require('../assets/sound/open.wav'),
  stamp: require('../assets/sound/stamp.wav'),
} as const;

export type SoundName = keyof typeof FILES;

/** Relative levels, so one slider governs a balanced mix. */
const GAIN: Record<SoundName, number> = {
  room: 0.35,
  tension: 0.8,
  tick: 0.5,
  gavel: 1,
  paper: 0.45,
  exhibit: 0.5,
  open: 0.6,
  stamp: 0.7,
};

const BEDS: SoundName[] = ['room', 'tension'];

const players = new Map<SoundName, AudioPlayer>();
let ready = false;

/**
 * Called once at launch.
 *
 * `playsInSilentMode: false` is deliberate: this game's sound is atmosphere,
 * not content. A player who has silenced their phone has said what they want,
 * and a courtroom drone is not the thing to override that with.
 */
export async function initSound(): Promise<void> {
  if (ready) return;
  ready = true;

  try {
    await setAudioModeAsync({
      playsInSilentMode: false,
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
    });

    for (const name of Object.keys(FILES) as SoundName[]) {
      const player = createAudioPlayer(FILES[name]);
      if (BEDS.includes(name)) player.loop = true;
      player.volume = 0;
      players.set(name, player);
    }
  } catch {
    // No audio. The game still works.
  }
}

/** Fire a one-shot. */
export function play(name: SoundName): void {
  if (BEDS.includes(name)) return;
  const player = players.get(name);
  if (!player) return;

  try {
    const vol = effectiveVolume() * GAIN[name];
    if (vol <= 0) return; // muted — do not even start it
    player.volume = vol;
    player.seekTo(0);
    player.play();
  } catch {
    /* never let a sound break a screen */
  }
}

/** Start a looping bed, from silence. */
export function startBed(name: SoundName): void {
  const player = players.get(name);
  if (!player) return;
  try {
    player.volume = effectiveVolume() * GAIN[name];
    player.play();
  } catch {
    /* ignore */
  }
}

export function stopBed(name: SoundName): void {
  const player = players.get(name);
  if (!player) return;
  try {
    player.pause();
    player.seekTo(0);
  } catch {
    /* ignore */
  }
}

export function stopAllBeds(): void {
  for (const name of BEDS) stopBed(name);
}

/**
 * Re-apply the current volume to anything already playing.
 *
 * Without this, dragging the slider while a bed is running does nothing until
 * the next case — which reads as a broken slider.
 */
export function refreshBedVolume(): void {
  for (const name of BEDS) {
    const player = players.get(name);
    if (!player) continue;
    try {
      player.volume = effectiveVolume() * GAIN[name];
    } catch {
      /* ignore */
    }
  }
}
