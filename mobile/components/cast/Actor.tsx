import { Image } from 'expo-image';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { Expression } from '@/components/scene2d/expression';
import { SPRITE_H, SPRITE_W, SPRITES, type Patch, type Sprite } from './sprites';

/**
 * A rendered person, standing somewhere and doing something.
 *
 * The picture is a neutral base portrait with one PATCH laid over it — the
 * part of the face that differs for the current expression, mouth shape or
 * blink (see tools/portraits/pack_cast.py). Every patch this person may need
 * is mounted up front and all but one are hidden, so a mouth moving ten times
 * a second is an opacity change rather than an image load: an image that has
 * to load mid-word shows the base for a frame, and the face flickers neutral
 * between syllables.
 *
 * Mouths and blinks CUT — they are fast in life too. Expressions DISSOLVE: a
 * face that snaps from tense to defiant reads as a sprite swap rather than a
 * person, so each expression is a group that fades in over the last.
 *
 * Size and placement belong to the parent. The actor fills whatever box it is
 * given, which the parent sizes to SPRITE_W x SPRITE_H in proportion, with the
 * eyes at EYES_PX — see sprites.ts for the framing contract.
 */

type Mouth = '' | '_talkA' | '_talkO' | '_talkE';
const SUFFIXES = ['', '_talkA', '_talkO', '_talkE', '_blink'] as const;

/** Expressions a talking face can hold. Reactions do not talk. */
export const TRIAL_EXPRESSIONS: Expression[] = [
  'neutral',
  'tense',
  'pleading',
  'defiant',
  'ashamed',
  'startled',
];

const DISSOLVE_MS = 320;

/**
 * A mouth shape for a character of speech. Crude and good enough: the eye
 * reads rhythm and openness long before it reads phonemes, and a mouth that
 * opens on vowels and closes on stops is the difference between talking and
 * chewing.
 */
function mouthFor(ch: string, flip: boolean): Mouth {
  const c = ch.toLowerCase();
  if ('ai'.includes(c)) return '_talkA';
  if ('ouw'.includes(c)) return '_talkO';
  if ('ey'.includes(c)) return '_talkE';
  if ('bmp .,!?;:—-’\''.includes(c)) return '';
  return flip ? '_talkE' : '';
}

function place(p: Patch) {
  return {
    left: `${(p.x / SPRITE_W) * 100}%`,
    top: `${(p.y / SPRITE_H) * 100}%`,
    width: `${(p.w / SPRITE_W) * 100}%`,
    height: `${(p.h / SPRITE_H) * 100}%`,
  } as const;
}

/**
 * One expression's patches, faded as a unit.
 *
 * The expression's own patch (`tense`) is the group's floor and is always on;
 * its mouths and blink (`tense_talkA`) were diffed against it rather than
 * against neutral, and sit on top of it.
 */
function ExpressionGroup({
  expression,
  sprite,
  names,
  shown,
  visible,
  leaving,
  instant,
}: {
  expression: Expression;
  sprite: Sprite;
  names: string[];
  /** Which frame of this group is showing, or null for none. */
  shown: string | null;
  visible: boolean;
  /** This was the last expression: hold until the new one is in, then go. */
  leaving: 'hold' | 'fade' | null;
  instant: boolean;
}) {
  const opacity = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    if (instant) {
      opacity.value = visible ? 1 : 0;
    } else if (visible) {
      opacity.value = withTiming(1, { duration: DISSOLVE_MS, easing: Easing.out(Easing.quad) });
    } else if (leaving === 'hold') {
      opacity.value = withDelay(DISSOLVE_MS, withTiming(0, { duration: 0 }));
    } else if (leaving === 'fade') {
      opacity.value = withTiming(0, { duration: DISSOLVE_MS, easing: Easing.in(Easing.quad) });
    } else {
      opacity.value = 0;
    }
  }, [visible, leaving, instant, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      {names.map((name) => (
        <Image
          key={name}
          source={sprite.frames[name]!.src}
          contentFit="fill"
          allowDownscaling={false}
          transition={0}
          style={[
            styles.patch,
            place(sprite.frames[name]!),
            { opacity: name === expression || name === shown ? 1 : 0 },
          ]}
        />
      ))}
    </Animated.View>
  );
}

export interface ActorProps {
  /** Key into SPRITES — who this is. See lib/cast. */
  who: string;
  /** What their face is doing. Trial expressions, or a verdict reaction. */
  expression: Expression;
  /** What they are saying right now; the mouth moves while this is set. */
  speaking?: string | null;
  /** Characters per second the mouth walks through `speaking`. */
  speechRate?: number;
  /** Milliseconds between blinks; this person's own rhythm. */
  blinkPeriod?: number;
  /** 0 fidgety .. 1 does not move at all. The uncanny channel. */
  stillness?: number;
  /** Extra downward sink, in the parent's units. The posture channel. */
  slump?: number;
  /** Which expressions to keep ready. Defaults to all six trial faces. */
  ready?: Expression[];
  reducedMotion?: boolean;
  /** How far the chest rises, in the parent's units. */
  breathe?: number;
}

export const Actor = memo(function Actor({
  who,
  expression,
  speaking,
  speechRate = 13,
  blinkPeriod = 4000,
  stillness = 0,
  slump = 0,
  ready = TRIAL_EXPRESSIONS,
  reducedMotion = false,
  breathe = 1.5,
}: ActorProps) {
  const sprite = SPRITES[who] ?? Object.values(SPRITES)[0]!;
  const isTrial = TRIAL_EXPRESSIONS.includes(expression);

  /* ---------------------------------------------------------------- *
   * Mouth: walk through the line while it is being said.
   * ---------------------------------------------------------------- */
  const [mouth, setMouth] = useState<Mouth>('');
  useEffect(() => {
    if (!speaking || !isTrial) {
      setMouth('');
      return;
    }
    let i = 0;
    const text = speaking;
    const id = setInterval(() => {
      if (i >= text.length) i = 0; // the voice may outrun the estimate
      setMouth(mouthFor(text[i]!, i % 2 === 0));
      i += 1;
    }, Math.max(45, 1000 / speechRate));
    return () => {
      clearInterval(id);
      setMouth('');
    };
  }, [speaking, speechRate, isTrial]);

  /* ---------------------------------------------------------------- *
   * Blink: this person's rhythm, jittered so it never looks metronomic.
   * ---------------------------------------------------------------- */
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (reducedMotion || !isTrial) return;
    let open: ReturnType<typeof setTimeout> | undefined;
    let next: ReturnType<typeof setTimeout>;
    const schedule = () => {
      next = setTimeout(() => {
        setBlink(true);
        open = setTimeout(() => setBlink(false), 130);
        schedule();
      }, blinkPeriod * (0.6 + Math.random() * 0.8));
    };
    schedule();
    return () => {
      clearTimeout(next);
      if (open) clearTimeout(open);
    };
  }, [blinkPeriod, reducedMotion, isTrial]);

  const frame = isTrial
    ? blink && !mouth
      ? `${expression}_blink`
      : `${expression}${mouth}`
    : expression;

  /* ---------------------------------------------------------------- *
   * Groups: one per expression this person might need. Anything asked
   * for outside `ready` is added the first time it is needed and kept.
   * ---------------------------------------------------------------- */
  const seen = useRef(new Set<Expression>());
  seen.current.add(expression);
  const groups = useMemo(() => {
    const all = new Set<Expression>([...ready, ...seen.current]);
    return [...all].map((e) => ({
      e,
      names: (TRIAL_EXPRESSIONS.includes(e) ? SUFFIXES.map((s) => `${e}${s}`) : [e]).filter(
        (n) => sprite.frames[n],
      ),
    }));
    // `seen` only grows, and only when `expression` changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, sprite, expression]);

  // The previous expression, for the dissolve.
  const [previous, setPrevious] = useState<Expression | null>(null);
  const last = useRef(expression);
  useEffect(() => {
    if (last.current === expression) return;
    setPrevious(last.current);
    last.current = expression;
    const id = setTimeout(() => setPrevious(null), DISSOLVE_MS + 40);
    return () => clearTimeout(id);
  }, [expression]);

  // If the new face has no patch of its own (neutral, mouth closed), the
  // old patch has to fade OUT to reveal the base; otherwise it holds under
  // the new one while that fades IN, so the base never flashes through.
  const newHasPatch = Boolean(sprite.frames[`${expression}`]);
  const ordered = [
    ...groups.filter((g) => g.e !== expression),
    ...groups.filter((g) => g.e === expression),
  ];

  /* ---------------------------------------------------------------- *
   * Breath and sway. Nobody holds still while being judged — except the
   * ones who do, and that is the uncanny channel.
   * ---------------------------------------------------------------- */
  const breath = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) {
      breath.value = 0;
      return;
    }
    const period = 2100 + (who.length % 5) * 180;
    breath.value = withRepeat(
      withSequence(
        withTiming(1, { duration: period, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: period, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
  }, [reducedMotion, breath, who]);

  const sway = 1 - Math.max(0, Math.min(1, stillness));
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: slump + (breath.value - 0.5) * breathe * sway },
      { rotate: `${(breath.value - 0.5) * 0.4 * sway}deg` },
    ],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Image
        source={sprite.base}
        style={StyleSheet.absoluteFill}
        contentFit="fill"
        allowDownscaling={false}
        transition={0}
      />
      {ordered.map(({ e, names }) => (
        <ExpressionGroup
          key={e}
          expression={e}
          sprite={sprite}
          names={names}
          shown={e === expression ? frame : e === previous ? `${e}` : null}
          visible={e === expression}
          leaving={e === previous ? (newHasPatch ? 'hold' : 'fade') : null}
          instant={reducedMotion}
        />
      ))}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  patch: { position: 'absolute' },
});
