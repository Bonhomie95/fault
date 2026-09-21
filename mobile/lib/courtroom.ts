import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClientCase, CourtroomLine, Cue, Speaker, Tone } from '@/lib/api';
import type { Casting } from '@/lib/cast';
import { defendantLines } from '@/lib/defendantVoice';
import { rand } from '@/lib/seed';
import { hush, say } from '@/lib/say';
import { tellFor, type Expression } from '@/components/scene2d/expression';

/**
 * Who speaks in the room, and when.
 *
 * The player's own attention drives it. Lifting an exhibit is what makes the
 * defendant interrupt about it; calling a witness to the stand is what makes
 * them dig in; reading the arguments is what sets counsel off. So the room
 * answers what the juror is doing — and that is the point, because those
 * answers are designed to pull (see server domain/case, CourtroomLine): each
 * one is something the speaker would say whether or not the defendant did it.
 *
 * One voice at a time. A new cue replaces whatever was WAITING, never what is
 * being said — a sentence cut off because the player tapped a tab is the room
 * reacting to the interface instead of to the case.
 */

export interface Utterance {
  id: number;
  speaker: Speaker;
  text: string;
  tone: Tone;
}

const GAP_MS = 650;
/** How long the defendant tab can sit silent before the accused fills it. */
const IDLE_MS = 13000;
const IDLE_LIMIT = 4;
/** When the room turns to the clock. */
const LATE_AT = 30;

/**
 * Lines for a case the server sent none for — an older server, or a model
 * that dropped them. Generic by necessity, so every one of them is safe on any
 * case: denials, appeals, and the things witnesses and counsel always say.
 */
function fallback(c: ClientCase): CourtroomLine[] {
  const seed = c.defendant.portraitSeed;
  const pick = <T,>(xs: T[], ch: number) => xs[Math.floor(rand(seed, ch) * xs.length) % xs.length]!;
  const pleas = defendantLines(seed, 4);
  const lines: CourtroomLine[] = [
    { speaker: 'defendant', cue: 'open', tone: 'pleading', text: pleas[0]! },
    { speaker: 'defendant', cue: 'open', tone: 'tense', text: pleas[1]! },
    { speaker: 'defendant', cue: 'late', tone: 'pleading', text: pleas[2]! },
    {
      speaker: 'prosecution',
      cue: 'arguments',
      tone: 'calm',
      text: pick(['The evidence speaks for itself. Let it.', 'Sympathy is not a defence.'], 81),
    },
    {
      speaker: 'defence',
      cue: 'arguments',
      tone: 'calm',
      text: pick(['Doubt is not a technicality. It is the law.', 'Ask what they cannot prove.'], 82),
    },
  ];
  const exhibit = [
    'That is not what it looks like.',
    'Ask them where that came from.',
    'You are reading it exactly the way they want you to.',
  ];
  c.evidence.slice(0, 3).forEach((_, i) => {
    lines.push({
      speaker: 'defendant',
      cue: `e${i + 1}` as Cue,
      tone: i === 1 ? 'defiant' : 'tense',
      text: exhibit[(i + Math.floor(rand(seed, 83) * 3)) % 3]!,
    });
  });
  const stand = ['I know what I saw.', 'I have no reason to lie to this court.', 'I told the police the same thing.'];
  c.witnesses.slice(0, 2).forEach((w, i) => {
    lines.push({
      speaker: `witness${i + 1}` as Speaker,
      cue: `witness${i + 1}` as Cue,
      tone: 'calm',
      text: stand[(i + Math.floor(rand(seed, 84 + i) * 3)) % 3]!,
    });
  });
  return lines;
}

/** Order within a cue: the accused cuts in first, then whoever answers. */
const ORDER: Record<Speaker, number> = {
  defendant: 0,
  witness1: 1,
  witness2: 1,
  prosecution: 2,
  defence: 3,
};

/** How long a line stays up when nobody is voicing it. Reading pace. */
export function readingMs(text: string): number {
  return 1400 + text.length * 62;
}

export function useCourtroomTalk({
  activeCase,
  casting,
  tab,
  examined,
  focusedWitness,
  remaining,
  active,
}: {
  activeCase: ClientCase | null;
  casting: Casting | null;
  tab: string;
  examined: string | null;
  focusedWitness: number;
  remaining: number;
  /** False while delivering, adjourned or reporting: the room falls silent. */
  active: boolean;
}): Utterance | null {
  const lines = useMemo(() => {
    if (!activeCase) return [];
    const own = activeCase.lines?.filter((l) => l.text.trim()) ?? [];
    return own.length ? own : fallback(activeCase);
  }, [activeCase]);

  const [current, setCurrent] = useState<Utterance | null>(null);
  const queue = useRef<CourtroomLine[]>([]);
  const fired = useRef(new Set<Cue>());
  const said = useRef(new Set<string>());
  const nextId = useRef(1);
  const idle = useRef(0);
  const [tick, setTick] = useState(0); // wakes the player when the queue changes

  const enqueue = (cue: Cue) => {
    if (fired.current.has(cue)) return;
    fired.current.add(cue);
    const batch = lines
      .filter((l) => l.cue === cue && !said.current.has(l.text))
      .sort((a, b) => ORDER[a.speaker] - ORDER[b.speaker]);
    if (!batch.length) return;
    queue.current = batch; // replaces what was waiting, not what is being said
    setTick((t) => t + 1);
  };

  // Cues from what the juror is doing.
  const evidenceIndex = activeCase?.evidence.findIndex((e) => e.id === examined) ?? -1;
  useEffect(() => {
    if (!active || !activeCase) return;
    if (tab === 'defendant') enqueue('open');
    else if (tab === 'evidence' && evidenceIndex >= 0 && evidenceIndex < 3)
      enqueue(`e${evidenceIndex + 1}` as Cue);
    else if (tab === 'witnesses') enqueue(focusedWitness === 1 ? 'witness2' : 'witness1');
    else if (tab === 'arguments') enqueue('arguments');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, tab, evidenceIndex, focusedWitness, activeCase?.id]);

  const late = remaining <= LATE_AT && remaining > 0;
  useEffect(() => {
    if (active && late) enqueue('late');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, late]);

  // The room goes quiet the moment it stops being a trial.
  useEffect(() => {
    if (active) return;
    queue.current = [];
    setCurrent(null);
    hush();
  }, [active]);
  useEffect(() => () => hush(), []);

  // The player: one line at a time, then a breath, then the next.
  useEffect(() => {
    if (!active || current || !casting || !activeCase) return;

    const next = queue.current.shift();
    if (!next) {
      // Nothing waiting. If the juror is simply looking at the accused, the
      // accused does not stay silent for long.
      if (tab !== 'defendant' || idle.current >= IDLE_LIMIT) return;
      const id = setTimeout(() => {
        const unsaid = lines.filter(
          (l) => l.speaker === 'defendant' && !said.current.has(l.text),
        );
        const pool = unsaid.length ? unsaid : lines.filter((l) => l.speaker === 'defendant');
        const pick = pool[Math.floor(Math.random() * pool.length)];
        if (!pick) return;
        idle.current += 1;
        queue.current = [pick];
        setTick((t) => t + 1);
      }, IDLE_MS);
      return () => clearTimeout(id);
    }

    const start = setTimeout(() => {
      const u: Utterance = { id: nextId.current++, ...next };
      said.current.add(next.text);
      setCurrent(u);
    }, GAP_MS);
    return () => clearTimeout(start);
  }, [active, current, tick, tab, casting, activeCase, lines]);

  // Speaking the current line, and ending it.
  useEffect(() => {
    if (!current || !casting || !activeCase) return;
    const me = current.id;
    const end = () => setCurrent((c) => (c?.id === me ? null : c));
    const who = casting[current.speaker];
    const voiced = say(current.text, {
      voice: { seed: who.seed, feminine: who.feminine, country: activeCase.place.country },
      tone: current.tone,
      onDone: () => setTimeout(end, 350),
    });
    // Unvoiced lines end by reading time; voiced ones on the voice finishing,
    // with a ceiling in case the engine never says it has.
    const id = setTimeout(end, voiced ? readingMs(current.text) * 2.2 + 2500 : readingMs(current.text));
    return () => clearTimeout(id);
  }, [current, casting, activeCase]);

  return current;
}

/** What a line's tone looks like on the speaker's face. */
export function faceForTone(tone: Tone): Expression {
  return tone === 'calm' ? 'neutral' : tone;
}

/**
 * How the accused takes it when somebody ELSE is talking.
 *
 * From their seeded tell, not from what is being said — the face reacts to
 * being talked about, never to whether the talk is true. A defendant who
 * flinches at the prosecutor flinches at every prosecutor.
 */
export function listeningFace(seed: number, speaker: Speaker): Expression {
  const tell = tellFor(seed);
  if (speaker === 'defence') return tell === 'appeals' ? 'pleading' : 'tense';
  switch (tell) {
    case 'hardens':
      return 'defiant';
    case 'looks_away':
      return 'ashamed';
    case 'flinches':
      return 'startled';
    default:
      return 'pleading';
  }
}
