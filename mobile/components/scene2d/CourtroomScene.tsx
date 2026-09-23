import { memo, useCallback, useEffect, useId, useMemo } from 'react';
import { useGame } from '@/store/game';
import { roomFor } from './themes';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Actor } from '@/components/cast/Actor';
import { EYES_PX, HEAD_PX, SPRITE_H, SPRITE_W } from '@/components/cast/sprites';
import type { ClientCase } from '@/lib/api';
import type { Casting } from '@/lib/cast';
import { faceForTone, listeningFace, type Utterance } from '@/lib/courtroom';
import {
  blinkPeriodMs,
  defendantExpression,
  EXPRESSIONS,
  postureFor,
  uncannyFor,
  witnessExpression,
  type Expression,
  type ExpressionDeltas,
  type RoomState,
} from './expression';
import { useReducedMotion } from '@/lib/motion';

export type DossierTab = 'defendant' | 'evidence' | 'witnesses' | 'arguments';

/**
 * The room, in two dimensions.
 *
 * This is the courtroom the game actually ships. The 3D version renders on a
 * real phone but composites black on the iOS Simulator's Expo-GL surface: it is
 * a software renderer with a present ceiling, and a scene of ~30k triangles and
 * five lights trips it — every draw call runs, the buffer fills, nothing
 * reaches the screen. That made the scene un-iterable in the sim.
 *
 * So the room is drawn with react-native-svg, which renders through the native
 * view layer and never touches GL at all. It presents everywhere, identically,
 * and the one thing the room exists to do survives: you can read the face of
 * the person you are about to judge.
 *
 * The face is NOT redrawn from taste — the feature maths is ported verbatim
 * from the 3D Head (brow, eye, jaw, mouth, and the appearance 0..100 mapping),
 * so a defendant looks the same person here as there and appearance_bias still
 * has a face to bite on.
 */

/* ------------------------------------------------------------------ *
 * Deterministic feature derivation — the same seed is the same person.
 * Lifted from Head.tsx so the two renderers agree on who a defendant is.
 * ------------------------------------------------------------------ */

function rand(seed: number, channel: number): number {
  const x = Math.sin(seed * 127.1 + channel * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const SKIN_TONES = [
  '#F2D3B8', '#E8C39E', '#D9A97C', '#C68B5E', '#A9683F',
  '#8D5524', '#6B3E1E', '#4A2A14', '#3A2113', '#EFD8C4',
];
const HAIR_TONES = ['#1A1512', '#2E2018', '#4A3524', '#6B4A2F', '#8A6A45', '#3A3A38', '#5C5C58'];
const GRAY_TONES = ['#9A968E', '#B4B0A6', '#7E7A72', '#C6C2B8'];
/**
 * Iris colours, ordered by how common they actually are rather than by how
 * interesting they look. Brown is most of the world, so brown comes up most.
 * Matched to the palette in tools/portraits so a defendant does not change
 * eye colour between the drawn face and a rendered one.
 */
const IRIS_TONES = ['#4A2C14', '#3A2210', '#5C3A18', '#6B4A22', '#3F4A38', '#31485A', '#2B4560'];
/** Ordinary clothes and jackets. Nobody in this room is dressed like a villain. */
const CLOTHES = ['#2E3440', '#3B3A36', '#243B33', '#40323C', '#1F2933', '#4A3B2A', '#31353B'];
const TIE_TONES = ['#20242B', '#2A2118', '#22303A', '#3A2028', '#1C2620', '#3A3630'];
const LIP_TONES = ['#8E4B45', '#A65A52', '#7A3F3A', '#9B5048'];
const LIPSTICK = ['#B4322E', '#9C2A46', '#C24B3E', '#7E2233'];

type Attire = 'suit' | 'blazer' | 'collar' | 'casual' | 'turtleneck';
type HairStyle = 'bald' | 'buzz' | 'short' | 'receding' | 'mid' | 'long';

interface Geom {
  a: number;
  /** Presentation, drawn from the seed. Independent of the bias score AND of
   *  guilt — see faceGeom. */
  feminine: boolean;
  skin: string;
  hair: string;
  /** Eye colour. Identity, like skin and hair — never a signal. */
  iris: string;
  clothes: string;
  tie: string;
  lip: string;
  width: number;
  length: number;
  browAngle: number;
  browThick: number;
  eyeScale: number;
  lidDrop: number;
  jawWidth: number;
  mouthWidth: number;
  mouthCurve: number;
  hairStyle: HairStyle;
  hairVol: number;
  /** 0 polished .. 1 weathered. Controls shadow and line weight, not the read. */
  rugged: number;
  stubble: boolean;
  age: number;
  attire: Attire;
  glasses: boolean;
  earrings: boolean;
  lipstick: boolean;
}

/**
 * Everything about how a person looks — split along two axes that must never be
 * confused with each other:
 *
 *   `appearance` (0..100, from the server) is the ONE measured variable. It
 *   pushes the face hard→soft: brow, eye, jaw, mouth. appearance_bias watches
 *   whether it moved your verdict.
 *
 *   `seed` decides everything else — gender presentation, skin, attire, hair,
 *   glasses, whether they came to court in a good suit. None of it is
 *   correlated with guilt, and that is the entire thesis of the room: looks
 *   deceive. A disarming person in a tailored suit is exactly as likely to have
 *   done it as the hard-faced one in a hoodie. The suit is not evidence. Neither
 *   is the face — but the face is the one the game is measuring you against.
 *
 * So a suit does not soften the brow, and a soft brow does not put on a suit.
 * The two axes are drawn from different channels and never touch.
 */
function faceGeom(seed: number, appearance: number): Geom {
  const a = Math.max(0, Math.min(100, appearance)) / 100;

  // Most of the room reads male; a good third do not. Presentation only.
  const feminine = rand(seed, 11) > 0.62;
  const age = rand(seed, 8);
  const gray = age > 0.7 && rand(seed, 17) > 0.45;
  const hair = gray
    ? GRAY_TONES[Math.floor(rand(seed, 18) * GRAY_TONES.length)]!
    : HAIR_TONES[Math.floor(rand(seed, 2) * HAIR_TONES.length)]!;

  // Attire — its own channel. Suits are common on purpose.
  const at = rand(seed, 12);
  const attire: Attire =
    at < 0.26 ? 'suit' : at < 0.46 ? 'blazer' : at < 0.66 ? 'collar' : at < 0.85 ? 'casual' : 'turtleneck';

  // Hair, gendered but varied.
  const hs = rand(seed, 5);
  const hairStyle: HairStyle = feminine
    ? hs < 0.52 ? 'long' : hs < 0.82 ? 'mid' : 'short'
    : hs < 0.1 ? 'bald' : hs < 0.22 ? 'buzz' : hs < 0.52 ? 'receding' : 'short';

  const lipstick = feminine && rand(seed, 20) > 0.55;

  return {
    a,
    feminine,
    skin: SKIN_TONES[Math.floor(rand(seed, 1) * SKIN_TONES.length)]!,
    hair,
    iris: IRIS_TONES[Math.floor(rand(seed, 23) * IRIS_TONES.length)]!,
    clothes: CLOTHES[Math.floor(rand(seed, 10) * CLOTHES.length)]!,
    tie: TIE_TONES[Math.floor(rand(seed, 19) * TIE_TONES.length)]!,
    lip: lipstick
      ? LIPSTICK[Math.floor(rand(seed, 21) * LIPSTICK.length)]!
      : LIP_TONES[Math.floor(rand(seed, 22) * LIP_TONES.length)]!,
    // Long-and-narrow reads harder than round; disarming faces widen a touch.
    // Feminine faces sit a little narrower at the baseline.
    width: (0.92 + rand(seed, 3) * 0.14 + a * 0.05) * (feminine ? 0.98 : 1),
    length: 1.14 - a * 0.06 + rand(seed, 4) * 0.08,
    // Brow: the single strongest signal. Inward-and-down = glowering. Thinner
    // on feminine faces, but the ANGLE (the actual tell) still swings on `a`.
    browAngle: (1 - a) * 0.34 - 0.06,
    browThick: (5 + (1 - a) * 5) * (feminine ? 0.6 : 1),
    // Deep-set and small vs open and large.
    eyeScale: (0.86 + a * 0.3) * (feminine ? 1.08 : 1),
    // How much of the eye the hood covers. Hooded reads as unimpressed.
    lidDrop: (1 - a) * 0.55,
    // Square-and-wide vs soft; feminine jaws tuck narrower.
    jawWidth: (0.82 + (1 - a) * 0.2) * (feminine ? 0.9 : 1),
    // A flat line vs a slight lift. -1 downturned .. +1 lifted.
    mouthWidth: (0.3 + a * 0.14) * (feminine ? 0.94 : 1),
    mouthCurve: (a - 0.5) * 2,
    hairStyle,
    hairVol: 0.06 + rand(seed, 6) * 0.12,
    // Weathering is grooming, not character — and a clean, polished face can
    // still be a hard one. Feminine faces render smoother here by convention.
    rugged: feminine ? rand(seed, 16) * 0.5 : 0.4 + rand(seed, 16) * 0.6,
    stubble: !feminine && rand(seed, 7) > 0.5,
    age,
    attire,
    glasses: rand(seed, 13) > 0.78,
    earrings: feminine && rand(seed, 14) > 0.5,
    lipstick,
  };
}

/** Front hairline for each style — a crescent whose lower edge sits high (a
 *  receded brow) or low (a full head of hair). */
/**
 * The control height for the hairline curve — NOT the height of the hairline.
 *
 * capPath closes with a cubic whose two control points both sit here, and a
 * cubic only comes about a quarter of the way to its controls. With the cap
 * now traced past the temples, the ends of that curve start well below the
 * eyes, so a control at -0.14 ry pulled the middle of the hairline down to eye
 * level and gave everybody a fringe over their eyebrows.
 *
 * These are the values that put the actual hairline where a hairline goes.
 * Worth stating plainly because the number you read here is roughly twice the
 * height you get.
 */
function hairlineY(style: HairStyle, ry: number): number {
  switch (style) {
    case 'receding':
      return -ry * 0.80;
    case 'buzz':
      return -ry * 0.44;
    case 'mid':
      return -ry * 0.54;
    default:
      return -ry * 0.50;
  }
}
/**
 * Hair, traced onto the skull it is growing from.
 *
 * This used to be a single cubic with its control points at ±1.02 rx, which
 * bulges wider than the head everywhere except at its two ends — and the ends
 * were pinned at ±0.99 rx. So the curve left the silhouette, came back to meet
 * it at a corner, and every head in the room wore a hard-edged helmet with the
 * sides sliced off vertically. It is the first thing the eye finds on the
 * contact sheet.
 *
 * Tracing the ellipse instead means the outer edge IS the skull. The swell
 * that gives hair its thickness is scaled by sin(theta), so it is fullest at
 * the crown and tapers to nothing at the temples, where the cap has to meet
 * the face exactly.
 */
function capPath(rx: number, ry: number, jawWidth: number, vol: number, lineY: number): string {
  const N = 34;
  // Past the widest point of the head, so hair comes down in FRONT of the
  // temple the way it actually does. Ending exactly at the equator left a
  // square notch on both sides of every head — the corner where the traced
  // skull met the hairline curve.
  const END = -0.16;
  const points: string[] = [];
  for (let i = 0; i <= N; i++) {
    const th = Math.PI - END - (i / N) * (Math.PI - 2 * END);
    const { x, y } = headPoint(th, rx, ry, jawWidth, vol * Math.max(0, Math.sin(th)));
    points.push(`${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  const start = points[0]!;
  return (
    `M${start} ` +
    points.slice(1).map((p) => `L${p}`).join(' ') +
    ` C${(rx * 0.72).toFixed(2)} ${lineY.toFixed(2)} ${(-rx * 0.72).toFixed(2)} ${lineY.toFixed(2)} ${start} Z`
  );
}

/**
 * One point on the face silhouette: an ellipse up top, tapered to a jaw and
 * chin below.
 *
 * Pulled out of headPath so the hair can trace the same outline. `swell` lifts
 * the point off the skull — hair has thickness — and is the only thing that
 * separates the two.
 */
function headPoint(th: number, rx: number, ry: number, jawWidth: number, swell = 0) {
  let x = Math.cos(th) * rx * (1 + swell);
  let y = -Math.sin(th) * ry * (1 + swell);
  if (y > 0) {
    // Lower half — narrow toward the chin, widen or tuck the jaw.
    const t = y / ry;
    x *= jawWidth * (1 - 0.3 * t);
    y *= 1.03;
  }
  return { x, y };
}

/** Face silhouette: an ellipse up top, tapered to a jaw and chin below. */
function headPath(rx: number, ry: number, jawWidth: number): string {
  const N = 40;
  let d = '';
  for (let i = 0; i <= N; i++) {
    const { x, y } = headPoint((i / N) * Math.PI * 2, rx, ry, jawWidth);
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)} `;
  }
  return `${d}Z`;
}

/* ------------------------------------------------------------------ *
 * A face, and a person wearing it.
 * ------------------------------------------------------------------ */

interface FaceProps {
  seed: number;
  appearance: number;
  /** Head radius in scene units — the whole face scales from this. */
  r: number;
  /**
   * What this person's face is doing right now, as offsets on the geometry
   * above — never as a replacement for it. See scene2d/expression.
   *
   * The person survives the expression: a disarming face going `defiant`
   * still reads as that same disarming person, hardened. That is what keeps
   * appearance_bias measurable, and it is the reason these are deltas.
   */
  expr?: ExpressionDeltas;
  /** 0 open, 1 shut. Blink.  */
  blink?: number;
  /**
   * Horizontal gaze error, in eye-widths.
   *
   * The eyes converge slightly in front of or behind the viewer instead of on
   * them. Nobody consciously notices; everybody feels it. Small on purpose —
   * past a point this stops being unease and becomes a squint, and a squint is
   * a readable signal rather than an unnameable one.
   */
  gazeError?: number;
}

function Face({ seed, appearance, r, expr, blink = 0, gazeError = 0 }: FaceProps) {
  const f = faceGeom(seed, appearance);
  const e = expr ?? EXPRESSIONS.neutral;
  const rx = r * f.width;
  const ry = r * f.length;
  // Clip paths need a document-unique id, and this face is drawn a dozen times
  // in one Svg — the gallery, the jury, the bench.
  const uid = useId();

  const eyeCy = -ry * 0.06;
  const eyeX = rx * 0.4;

  /**
   * The eye, in millimetres.
   *
   * This is what made every defendant look like a cartoon. The fissure was
   * drawn `eyeW * 0.62` tall — an eye nearly twice as open as a real one — and
   * the iris was `eyeH * 0.82`, which very nearly filled it. Two enormous
   * white ovals with a dark disc in each. It reads as a children's drawing,
   * and on the defendant tab, where the camera pushes right into the face, it
   * is the whole screen.
   *
   * A real palpebral fissure is about 30mm wide and 10mm tall; the iris is
   * 11.8mm across and the pupil around 3.6mm. So take the half-width the face
   * already decided as 15mm and derive everything else from that. The same
   * numbers drive the Blender pipeline — see tools/portraits — because there
   * is only one set of them and it is not a matter of taste.
   *
   * Note the iris comes out TALLER than the opening. That is correct and it is
   * the point: a human iris is always cropped top and bottom by the lids, and
   * seeing a whole one is the thing that makes a drawn eye look startled or
   * false. Hence the clip below.
   */
  const eyeW = rx * 0.16 * f.eyeScale;   // half-width of the fissure = 15mm
  const mm = eyeW / 15;
  const eyeH = 5 * mm;                    // half of a 10mm opening
  const irisR = 5.9 * mm;
  const pupilR = 1.8 * mm;

  // Expression offsets, applied here and nowhere else so the base geometry
  // above stays exactly what faceGeom decided.
  const browRaise = e.browRaise * ry * 0.1;
  // Anchored in millimetres, not in lid height. This used to be
  // `eyeCy - eyeH - rx * 0.13`, and when the fissure was corrected to its real
  // 10mm the brow came down with it and sat directly on the lash line, which
  // reads as a permanent scowl on every face in the room. A brow sits about
  // 21mm above the centre of the eye and stays there whatever the lids do.
  const browY = eyeCy - 21 * mm - browRaise;
  const browInX = rx * 0.13;
  const browOutX = rx * 0.55;
  const browInnerDrop = (f.browAngle + e.browAngle) * (rx * 0.5);

  const mouthCurve = Math.max(-1, Math.min(1, f.mouthCurve + e.mouthCurve));
  const mouthY = ry * 0.44;
  const mouthW = f.mouthWidth * rx;
  const mouthCtrlY = mouthY + mouthCurve * ry * 0.09;
  const endLift = mouthCurve * ry * 0.05;
  const mouthOpen = e.mouthOpen * ry * 0.1;

  const noseBaseY = ry * 0.17;
  // Blink shuts the lid the rest of the way, whatever the expression was doing.
  const effectiveLid = Math.max(0, Math.min(1, f.lidDrop + e.lidDrop + blink * (1 - f.lidDrop)));
  const lid = eyeCy - eyeH * (1 - effectiveLid);

  // Where they are looking. Only the pupils move — the eye stays put, which is
  // what makes averted eyes read as averted rather than as a squint.
  const gx = (e.gazeX + gazeError) * eyeW * 1.6;
  const gy = e.gazeY * eyeH * 1.4;

  return (
    <G>
      {/* the face */}
      <Path d={headPath(rx, ry, f.jawWidth)} fill={f.skin} />
      {/* The lit side and the unlit one.
          These were flat ellipses at a fixed opacity, and a flat ellipse laid
          over a face has an edge — a visible dark lozenge sitting on the
          cheek rather than light falling across it. Gradients cost nothing
          here and are the whole difference between shading and a stain. */}
      <Defs>
        <RadialGradient id={`shade${uid}`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#000000" stopOpacity={0.10 + f.rugged * 0.16} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`lit${uid}`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.10} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={rx * 0.42} cy={0} rx={rx * 0.78} ry={ry * 0.95} fill={`url(#shade${uid})`} />
      <Ellipse cx={-rx * 0.34} cy={ry * 0.06} rx={rx * 0.5} ry={ry * 0.58} fill={`url(#lit${uid})`} />

      {/* stubble */}
      {f.stubble && (
        <Ellipse cx={0} cy={ry * 0.34} rx={rx * 0.72} ry={ry * 0.34} fill={f.hair} opacity={0.16} />
      )}
      {/* blush — a soft warmth on the cheeks */}
      {f.feminine &&
        [-1, 1].map((side) => (
          <Ellipse key={side} cx={side * rx * 0.5} cy={ry * 0.14} rx={rx * 0.2} ry={ry * 0.12} fill="#C86B62" opacity={0.13} />
        ))}

      {/* age, not character
          A nasolabial fold starts at the WING of the nose and curves out and
          down around the corner of the mouth. Drawn as two straight lines from
          the bridge to the mouth corners — which is what these were — they
          close a hard triangle with the lips, and every older face in the room
          had a wedge drawn on it. */}
      {f.age > 0.55 &&
        [-1, 1].map((side) => (
          <Path
            key={side}
            d={
              `M${side * rx * 0.105} ${noseBaseY} ` +
              `Q${side * rx * 0.30} ${(noseBaseY + mouthY) / 2} ${side * mouthW * 1.06} ${mouthY + ry * 0.02}`
            }
            stroke="#000000"
            strokeOpacity={0.09 + f.rugged * 0.07}
            strokeWidth={Math.max(1, rx * 0.02)}
            fill="none"
            strokeLinecap="round"
          />
        ))}

      {/* eyes — always on you, because you are the one deciding */}
      {[-1, 1].map((side) => (
        <G key={side}>
          <Defs>
            <ClipPath id={`fissure${uid}${side}`}>
              <Ellipse cx={side * eyeX} cy={eyeCy} rx={eyeW} ry={eyeH} />
            </ClipPath>
          </Defs>
          {/* sclera — never pure white, which is the other half of the doll */}
          <Ellipse cx={side * eyeX} cy={eyeCy} rx={eyeW} ry={eyeH} fill="#E8E3D8" />
          {/* iris, pupil and catchlight, cropped by the lids that are actually
              in front of them */}
          <G clipPath={`url(#fissure${uid}${side})`}>
            <Circle cx={side * eyeX + gx} cy={eyeCy + gy} r={irisR} fill={f.iris} />
            <Circle cx={side * eyeX + gx} cy={eyeCy + gy} r={irisR * 0.62} fill={f.iris} opacity={0.55} />
            <Circle cx={side * eyeX + gx} cy={eyeCy + gy} r={pupilR} fill="#0A0604" />
            <Circle
              cx={side * eyeX + gx - irisR * 0.34}
              cy={eyeCy + gy - irisR * 0.34}
              r={pupilR * 0.7}
              fill="#FFFFFF"
              opacity={0.75}
            />
            {/* the shadow the upper lid throws onto the eye. Without it the
                ball reads as a flat disc pasted on the face. */}
            <Ellipse
              cx={side * eyeX}
              cy={eyeCy - eyeH * 1.15}
              rx={eyeW}
              ry={eyeH * 1.15}
              fill="#000000"
              opacity={0.22}
            />
          </G>
          {/* the hood — skin drawn back down over the top of the eye */}
          {effectiveLid > 0.02 && (
            <Path
              d={`M${side * eyeX - eyeW} ${eyeCy} A ${eyeW} ${eyeH} 0 0 1 ${side * eyeX + eyeW} ${eyeCy} L ${side * eyeX + eyeW} ${lid} A ${eyeW} ${eyeH * 0.5} 0 0 0 ${side * eyeX - eyeW} ${lid} Z`}
              fill={f.skin}
            />
          )}
          {/* upper lash line — heavier on a feminine face */}
          <Path
            d={`M${side * eyeX - eyeW} ${lid * 0.9} A ${eyeW} ${eyeH} 0 0 1 ${side * eyeX + eyeW} ${lid * 0.9}`}
            stroke="#1A120C"
            strokeWidth={f.feminine ? 2.4 : 1.4}
            fill="none"
            strokeLinecap="round"
          />
          {f.feminine && (
            <Line
              x1={side * (eyeX + eyeW * 0.8)}
              y1={eyeCy - eyeH * 0.5}
              x2={side * (eyeX + eyeW * 1.35)}
              y2={eyeCy - eyeH}
              stroke="#1A120C"
              strokeWidth={1.6}
              strokeLinecap="round"
            />
          )}
        </G>
      ))}

      {/* eyebrows */}
      {[-1, 1].map((side) => (
        <Line
          key={side}
          x1={side * browInX}
          y1={browY + browInnerDrop}
          x2={side * browOutX}
          y2={browY}
          stroke={f.hair}
          strokeWidth={f.browThick}
          strokeLinecap="round"
        />
      ))}

      {/* glasses — looks can be corrected, guilt cannot */}
      {f.glasses && (
        <G stroke="#15130F" strokeWidth={2.4} fill="#AEB6BC" fillOpacity={0.08} strokeLinejoin="round">
          {[-1, 1].map((side) => (
            <Rect
              key={side}
              x={side * eyeX - eyeW * 1.4}
              y={eyeCy - eyeW * 0.9}
              width={eyeW * 2.8}
              height={eyeW * 1.8}
              rx={eyeW * 0.5}
            />
          ))}
          <Line x1={-eyeX + eyeW * 1.4} y1={eyeCy - eyeH * 0.2} x2={eyeX - eyeW * 1.4} y2={eyeCy - eyeH * 0.2} />
          <Line x1={-eyeX - eyeW * 1.4} y1={eyeCy - eyeH * 0.6} x2={-rx * 0.95} y2={eyeCy - eyeH} />
          <Line x1={eyeX + eyeW * 1.4} y1={eyeCy - eyeH * 0.6} x2={rx * 0.95} y2={eyeCy - eyeH} />
        </G>
      )}

      {/* nose
          Not a line. It was one — a single stroke down and a hook at the
          bottom — and on the defendant tab, where the camera pushes into the
          face until it fills the screen, it read as a scribbled L.
          A nose is not an outline; it is two planes and a shadow. The room is
          lit from the left (see the side-shadow above), so the right plane is
          the dark one and the light catches the ridge. Everything here is
          low-opacity fill rather than stroke, so it stays a suggestion at
          gallery size and becomes a nose when the camera comes in. */}
      <G>
        {/* The shadowed plane, as a soft edge rather than a shape.
            Filled and closed back to the centre line, this read as a solid
            triangle drawn on the face — worse than the single stroke it
            replaced. A nose casts a soft-edged band down one side; it does not
            have an outline. */}
        <Defs>
          <RadialGradient id={`nose${uid}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#000000" stopOpacity={0.15 + f.rugged * 0.07} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse
          cx={rx * 0.055}
          cy={(eyeCy + eyeH + noseBaseY) / 2}
          rx={rx * 0.085}
          ry={(noseBaseY - eyeCy) * 0.55}
          fill={`url(#nose${uid})`}
        />
        {/* the ridge, catching what light there is */}
        <Path
          d={`M${-rx * 0.012} ${eyeCy + eyeH * 1.3} Q${-rx * 0.03} ${noseBaseY * 0.6} ${-rx * 0.022} ${noseBaseY * 0.9}`}
          stroke="#FFFFFF"
          strokeOpacity={0.07}
          strokeWidth={rx * 0.035}
          fill="none"
          strokeLinecap="round"
        />
        {/* the wings, and the shadow the tip drops onto the lip */}
        <Ellipse cx={0} cy={noseBaseY + ry * 0.012} rx={rx * 0.115} ry={ry * 0.022} fill="#000000" opacity={0.10} />
        {[-1, 1].map((side) => (
          <Ellipse
            key={side}
            cx={side * rx * 0.072}
            cy={noseBaseY + ry * 0.004}
            rx={rx * 0.026}
            ry={ry * 0.011}
            fill="#000000"
            opacity={0.34}
          />
        ))}
      </G>

      {/* mouth — a painted pair of lips on a feminine face, a line otherwise */}
      {f.feminine ? (
        <G>
          <Path
            d={
              `M${-mouthW} ${mouthY - endLift} Q${-mouthW * 0.4} ${mouthY - eyeH * 0.5} 0 ${mouthY - eyeH * 0.16} ` +
              `Q${mouthW * 0.4} ${mouthY - eyeH * 0.5} ${mouthW} ${mouthY - endLift} ` +
              `Q${mouthW * 0.4} ${mouthY + eyeH * 0.8} 0 ${mouthY + eyeH * 0.9} ` +
              `Q${-mouthW * 0.4} ${mouthY + eyeH * 0.8} ${-mouthW} ${mouthY - endLift} Z`
            }
            fill={f.lip}
          />
          <Path
            d={`M${-mouthW} ${mouthY - endLift} Q0 ${mouthY - eyeH * 0.1} ${mouthW} ${mouthY - endLift}`}
            stroke="#000000"
            strokeOpacity={0.18}
            strokeWidth={1}
            fill="none"
          />
        </G>
      ) : (
        <G>
          {/* A mouth, not a bar. The stroke version was a flat rounded rule of
              one colour, which at close range is the other thing that gave the
              face away. Lips have an upper that is darker and thinner than the
              lower, and a line where they meet — that contrast is most of the
              read, so it is cheap and worth having. */}
          <Path
            d={
              `M${-mouthW} ${mouthY - endLift} Q${-mouthW * 0.45} ${mouthCtrlY - ry * 0.016} 0 ${mouthY - ry * 0.006} ` +
              `Q${mouthW * 0.45} ${mouthCtrlY - ry * 0.016} ${mouthW} ${mouthY - endLift} ` +
              `Q${mouthW * 0.4} ${mouthY - ry * 0.03} 0 ${mouthY - ry * 0.026} ` +
              `Q${-mouthW * 0.4} ${mouthY - ry * 0.03} ${-mouthW} ${mouthY - endLift} Z`
            }
            fill={f.lip}
            opacity={0.85}
          />
          <Path
            d={
              `M${-mouthW} ${mouthY - endLift} Q${-mouthW * 0.45} ${mouthCtrlY + ry * 0.004} 0 ${mouthY + ry * 0.004} ` +
              `Q${mouthW * 0.45} ${mouthCtrlY + ry * 0.004} ${mouthW} ${mouthY - endLift} ` +
              `Q${mouthW * 0.42} ${mouthY + ry * 0.042} 0 ${mouthY + ry * 0.046} ` +
              `Q${-mouthW * 0.42} ${mouthY + ry * 0.042} ${-mouthW} ${mouthY - endLift} Z`
            }
            fill={f.lip}
          />
          {/* where they meet */}
          <Path
            d={`M${-mouthW} ${mouthY - endLift} Q0 ${mouthCtrlY} ${mouthW} ${mouthY - endLift}`}
            stroke="#2A1512"
            strokeOpacity={0.55}
            strokeWidth={Math.max(1, rx * 0.012)}
            fill="none"
            strokeLinecap="round"
          />
          {/* Startle opens it. A dark wedge rather than a second line, so it
              reads as a gap and not as a thicker mouth. */}
          {mouthOpen > 0.5 && (
            <Path
              d={`M${-mouthW * 0.8} ${mouthY} Q0 ${mouthCtrlY + mouthOpen} ${mouthW * 0.8} ${mouthY} Q0 ${mouthY - mouthOpen * 0.1} ${-mouthW * 0.8} ${mouthY} Z`}
              fill="#2A1512"
            />
          )}
        </G>
      )}

      {/* earrings */}
      {f.earrings &&
        [-1, 1].map((side) => (
          <Circle key={side} cx={side * rx * 0.88} cy={ry * 0.42} r={rx * 0.055} fill={f.lipstick ? '#C9B47A' : '#B9BCC2'} />
        ))}

      {/* front hairline / cap */}
      {f.hairStyle !== 'bald' && (
        <G>
          <Path
            d={capPath(rx, ry, f.jawWidth, f.hairStyle === 'buzz' ? f.hairVol * 0.4 : f.hairVol, hairlineY(f.hairStyle, ry))}
            fill={f.hair}
            opacity={f.hairStyle === 'buzz' ? 0.55 : 1}
          />
          {/* The shadow the hair drops onto the brow.
              A flat fill meeting flat skin along a clean curve is a swim cap.
              Hair has an underside, and the brow beneath it is the darkest
              part of the forehead — one soft band is the whole difference. */}
          <Defs>
            <RadialGradient id={`brow${uid}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#000000" stopOpacity={0.30} />
              <Stop offset="1" stopColor="#000000" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse
            cx={0}
            cy={hairlineY(f.hairStyle, ry) + ry * 0.02}
            rx={rx * 0.86}
            ry={ry * 0.13}
            fill={`url(#brow${uid})`}
          />
        </G>
      )}
    </G>
  );
}


/**
 * One person, drawn alone at whatever size you ask for.
 *
 * Exported for the verdict screen, where the accused reacts to what has just
 * happened to them, and for `app/dev-faces`, the development-only contact sheet. The
 * defendant tab pushes the camera right into a face and holds it there for two
 * minutes, which is both the place these drawings are judged and the worst
 * possible place to iterate on them — a hundred and twenty seconds per look,
 * and then the clock delivers a hung verdict and takes the face away. The
 * sheet renders thirty at once and never expires.
 */
export function StandaloneFace({
  seed,
  appearance,
  r,
  expr,
}: {
  seed: number;
  appearance: number;
  r: number;
  expr?: ExpressionDeltas;
}) {
  /**
   * The tilt is applied HERE, not inside Face.
   *
   * In the courtroom it is `Figure` that rotates the head — about the base of
   * the neck, so the head does not slide off the shoulders. A standalone face
   * has no neck to rotate about, and without this the tilt was simply dropped:
   * every verdict reaction rendered bolt upright, which removed the single
   * most legible difference between a man who cannot look at you and one who
   * cannot look anywhere else.
   */
  const tilt = expr?.headTilt ?? 0;
  return (
    <G rotation={tilt} originX={0} originY={r * 0.9}>
      <Face seed={seed} appearance={appearance} r={r} expr={expr} />
    </G>
  );
}

/* ------------------------------------------------------------------ *
 * The room and its furniture.
 * ------------------------------------------------------------------ */

/**
 * Where the "camera" sits for each tab. In 2D this is a content transform, not
 * a lens, but the intent is the 3D marks': a portrait of the accused, a look
 * down at the exhibits, level with the witness, between the two counsel.
 *
 * Each is a focus point (fx, fy) in scene space, a zoom, and the screen anchor
 * the focus should land on — kept high, because the dossier covers the lower
 * half of the screen and the face must sit in the clear band up top.
 */
const SCENE_W = 400;
const SCENE_H = 720;
const ACCUSED = { x: 200, y: 250 };
/** Where the eyes are on the accused: `Figure` puts them 0.06 of a face length
 *  above its centre, and a face is 1.14 head radii long. Kept here because the
 *  sprite stands on the same spot — see cast/Actor. */
const EYES_Y = 246;
const DEFENDANT_ZOOM = 1.4;

function frame(fx: number, fy: number, z: number, ay: number) {
  return { tx: 200 - fx * z, ty: ay - fy * z, s: z };
}
const FRAMES: Record<DossierTab, { tx: number; ty: number; s: number }> = {
  // The anchor here is a PLACEHOLDER. The defendant tab's framing is derived
  // from the measured header instead — see eyesFrame — because the plea bubble
  // hangs off the bottom of the header and the header is one or two lines
  // depending on the case title. A fixed anchor put the accused's eyes in the
  // clear on a short title and behind the plea on a long one, which is the one
  // tab where that is not a detail: it exists to let you read that face.
  defendant: frame(ACCUSED.x, ACCUSED.y, DEFENDANT_ZOOM, 178),
  evidence: frame(200, 470, 1.32, 250),
  // Anchored low enough that the witness's whole head clears the tab strip;
  // the case screen starts the witness cards below their chin to match.
  witnesses: frame(315, 282, 1.5, 272),
  arguments: frame(200, 320, 1.2, 226),
};

/**
 * The defendant frame that puts the accused's EYES at `eyesY` screen pixels.
 *
 * Inverts the mapping the room already uses. `frame` gives
 * `ty = ay - fy * z`, and the scene is drawn with preserveAspectRatio slice,
 * so a scene point lands at `top + (ty + y * z) * cover`. Solving that for the
 * anchor is the two lines below, and it means the caller can say where the
 * face should sit in screen terms — under the plea, above the dossier — rather
 * than in scene units nobody can check by eye.
 */
function eyesFrame(eyesY: number, width: number, height: number) {
  const cover = Math.max(width / SCENE_W, height / SCENE_H);
  const top = (height - SCENE_H * cover) / 2;
  const anchor = (eyesY - top) / cover - (EYES_Y - ACCUSED.y) * DEFENDANT_ZOOM;
  return frame(ACCUSED.x, ACCUSED.y, DEFENDANT_ZOOM, anchor);
}

const AnimatedG = Animated.createAnimatedComponent(G);

/**
 * Where each person stands, by their EYES, and how big their head is — both
 * in scene units. The accused matches the marks the camera frames above
 * (EYES_Y); everyone else is placed where the room has always put them.
 */
const MARKS = {
  accused: { x: ACCUSED.x, y: EYES_Y, head: 66 },
  witness: { x: 315, y: 282, head: 36 },
  prosecution: { x: 116, y: 324, head: 31 },
  defence: { x: 284, y: 324, head: 31 },
} as const;

/** A box sized and placed so the sprite's eyes land on a mark. */
function OnMark({
  mark,
  children,
  dim = 1,
}: {
  mark: { x: number; y: number; head: number };
  children: React.ReactNode;
  /** How present this person is on the current tab. See `presence`. */
  dim?: number;
}) {
  const k = mark.head / HEAD_PX;
  return (
    <View
      pointerEvents="none"
      style={{
        opacity: dim,
        position: 'absolute',
        left: mark.x - EYES_PX.x * k,
        top: mark.y - EYES_PX.y * k,
        width: SPRITE_W * k,
        height: SPRITE_H * k,
      }}
    >
      {children}
    </View>
  );
}

interface SceneProps {
  activeCase: ClientCase;
  tab: DossierTab;
  examinedEvidence: string | null;
  onSelectEvidence: (id: string) => void;
  focusedWitness: number;
  /**
   * Seconds left on the clock.
   *
   * Passed in so the room can tighten as it runs out, on the same threshold
   * the tension bed already uses. Note what is NOT passed and never will be:
   * the correct verdict and the evidence strength. Neither reaches the client
   * at all, which is what makes the expression system safe — see expression.ts.
   */
  remaining: number;
  tensionAt: number;
  /**
   * Where the accused's eyes should sit, in screen pixels.
   *
   * The defendant tab only. Supplied by the case screen because only it knows
   * how tall the header ended up and therefore where the speech hangs — see
   * eyesFrame.
   */
  eyesY?: number;
  /** Who plays whom. See lib/cast. */
  casting: Casting;
  /** Whoever is talking right now, if anyone. See lib/courtroom. */
  utterance: Utterance | null;
}

export const CourtroomScene = memo(function CourtroomScene({
  activeCase,
  tab,
  examinedEvidence,
  focusedWitness,
  remaining,
  tensionAt,
  eyesY,
  casting,
  utterance,
}: SceneProps) {
  const reduced = useReducedMotion();
  const accent = activeCase.accent;
  // The finish the juror put on, while they own it (store cosmetics).
  const finish = roomFor(
    useGame((g) => g.equipped.room),
    useGame((g) => g.entitlements),
  );

  // Framing — a quick cut between marks, eased. Reduced motion makes it instant.
  const { width: screenW, height: screenH } = useWindowDimensions();
  const frameFor = useCallback(
    (which: DossierTab) =>
      which === 'defendant' && eyesY != null
        ? eyesFrame(eyesY, screenW, screenH)
        : FRAMES[which],
    [eyesY, screenW, screenH],
  );

  const tx = useSharedValue(frameFor(tab).tx);
  const ty = useSharedValue(frameFor(tab).ty);
  const s = useSharedValue(frameFor(tab).s);

  useEffect(() => {
    const fr = frameFor(tab);
    const cfg = { duration: reduced ? 0 : 300, easing: Easing.out(Easing.cubic) };
    tx.value = withTiming(fr.tx, cfg);
    ty.value = withTiming(fr.ty, cfg);
    s.value = withTiming(fr.s, cfg);
  }, [tab, reduced, tx, ty, s, frameFor]);

  /**
   * AN ARRAY, NOT AN SVG TRANSFORM STRING.
   *
   * `transform="translate(x y) scale(s)"` is valid SVG and react-native-svg
   * parses it happily on the old architecture and on web. Under Fabric it is
   * a native prop whose converter expects a vector, and a string makes it
   * fail — `react_native_expect failure: value.hasType<std::vector<RawValue>>()`,
   * once per frame, which on the case screen is fourteen hundred times before
   * anyone has touched anything. It is logged at the C++ layer and never
   * reaches JS, so the app simply misbehaves in silence: the camera does not
   * move and the screen stops answering. The RN transform array converts.
   *
   * Two of them — one per Svg — because an animated-props object belongs to
   * one component. The room behind the people and the furniture in front of
   * them must move as one, and reading the same three values is how.
   */
  const backProps = useAnimatedProps(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: s.value }],
  }));
  const frontProps = useAnimatedProps(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: s.value }],
  }));

  /**
   * The people, on a plain view that reproduces the Svg's mapping.
   *
   * The Svg is drawn with preserveAspectRatio slice — scaled to COVER and
   * centred — so a scene point lands at `left + (tx + x * s) * cover`. The
   * transforms below are that expression, outermost first, about the top-left
   * corner. They cannot live inside the Svg: these are images, and an image
   * in an Svg is a bitmap scaled by the vector renderer.
   */
  const cover = Math.max(screenW / SCENE_W, screenH / SCENE_H);
  const left = (screenW - SCENE_W * cover) / 2;
  const top = (screenH - SCENE_H * cover) / 2;
  const stageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: left },
      { translateY: top },
      { scale: cover },
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: s.value },
    ],
  }));

  const d = activeCase.defendant;
  const witnesses = activeCase.witnesses;
  const focusW = witnesses[focusedWitness];
  const witnessRole = focusedWitness === 1 ? 'witness2' : 'witness1';

  /* ---------------------------------------------------------------- *
   * Expression.
   *
   * Everything here reads room state, a seed and who is talking. Nothing
   * reads the verdict, because the verdict is not on this device — and that
   * is the point, not a limitation to work around. A defendant who reacts to
   * WHICHEVER exhibit you lift is the game working on you; one who reacts to
   * the incriminating exhibit would be the game answering its own question.
   * ---------------------------------------------------------------- */
  const room: RoomState = {
    tab,
    // A boolean, deliberately — not the exhibit's id. The face cannot react to
    // a particular piece of evidence even by accident, because it is never
    // told which one is open.
    examiningEvidence: examinedEvidence !== null && tab === 'evidence',
    witnessSpeaking: tab === 'witnesses' && focusW !== undefined,
    remaining,
    tensionAt,
    demeanour: d.demeanour ?? 50,
    oddity: d.oddity ?? 50,
  };

  const speaker = utterance?.speaker ?? null;
  const said = (who: string) => (speaker === who ? utterance!.text : null);

  // The accused: their own line's tone while they speak; how they take it
  // while someone else does; the room otherwise.
  const accusedFace: Expression =
    speaker === 'defendant'
      ? faceForTone(utterance!.tone)
      : speaker
        ? listeningFace(d.portraitSeed, speaker)
        : defendantExpression(d.portraitSeed, room);

  const witnessFace: Expression =
    speaker === witnessRole
      ? faceForTone(utterance!.tone)
      : focusW
        ? witnessExpression(casting[witnessRole].seed, room)
        : 'neutral';

  const counselFace = (who: 'prosecution' | 'defence'): Expression =>
    speaker === who ? faceForTone(utterance!.tone) : speaker === 'defendant' ? 'tense' : 'neutral';

  /**
   * Posture and strangeness, alongside the expression rather than inside it.
   *
   * Three separate readings, kept separate: the face can be hard while the
   * body is open, and either can be true of somebody perfectly ordinary or
   * somebody who makes your skin crawl. The game scores all three against the
   * verdict independently, so the renderer has to be able to show them
   * disagreeing.
   */
  const posture = useMemo(
    () => postureFor(room),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d.demeanour, remaining, tensionAt],
  );
  const uncanny = useMemo(
    () => uncannyFor(d.portraitSeed, room),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d.portraitSeed, d.oddity],
  );

  /**
   * The room, described.
   *
   * It says who is in the room and what the room is doing, and it does not
   * editorialise about the defendant's face. `appearance` is the variable the
   * game measures the player against, and a label that said "a hard-faced man"
   * would hand a VoiceOver user a conclusion a sighted player has to reach
   * themselves. It names the tab's subject; the reading stays the reader's.
   */
  const sceneLabel = (() => {
    const where = `The courtroom. ${d.name} stands in the dock, on trial.`;
    switch (tab) {
      case 'defendant':
        return `${where} The camera is on their face.`;
      case 'evidence':
        return `${where} Three exhibits are laid out on the table below.`;
      case 'witnesses':
        return focusW
          ? `${where} ${focusW.name} is at the witness stand.`
          : `${where} The witness stand is empty.`;
      case 'arguments':
        return `${where} Counsel for the prosecution and the defence flank them.`;
    }
  })();

  const svgProps = {
    width: '100%',
    height: '100%',
    viewBox: `0 0 ${SCENE_W} ${SCENE_H}`,
    preserveAspectRatio: 'xMidYMid slice',
  } as const;

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* THE ROOM, behind everyone. */}
      <Svg
        {...svgProps}
        style={StyleSheet.absoluteFill}
        accessible
        accessibilityRole="image"
        accessibilityLabel={sceneLabel}
      >
        <Defs>
          {/* the one lit thing in the room is the person on trial */}
          <RadialGradient id="spot" cx="50%" cy="30%" rx="60%" ry="55%">
            <Stop offset="0" stopColor={finish.spot} stopOpacity={finish.spotOpacity} />
            <Stop offset="0.55" stopColor={finish.spot} stopOpacity={finish.spotOpacity / 4} />
            <Stop offset="1" stopColor={finish.spot} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={finish.wallTop} />
            <Stop offset="1" stopColor={finish.wallBottom} />
          </LinearGradient>
        </Defs>

        {/* the room itself, oversized so no framing move shows an edge */}
        <Rect x={-400} y={-400} width={1200} height={1520} fill={finish.base} />

        <AnimatedG animatedProps={backProps}>
          {/* panelled back wall, in the case's one colour, barely */}
          <Rect x={-200} y={-60} width={800} height={300} fill="url(#wall)" />
          <Rect x={-200} y={-40} width={800} height={220} fill={accent} opacity={0.05} />
          {Array.from({ length: 11 }, (_, i) => (
            <Line
              key={`panel-${i}`}
              x1={-100 + i * 60}
              y1={-60}
              x2={-100 + i * 60}
              y2={240}
              stroke={finish.seam}
              strokeOpacity={finish.seamOpacity}
              strokeWidth={1.2}
            />
          ))}

          {/* tall windows, for a room that has a sky behind it (night session) */}
          {finish.windows &&
            [-40, 60, 280, 380].map((x) => (
              <Rect key={`win-${x}`} x={x} y={-30} width={46} height={120} rx={23} fill={finish.windows!.color} opacity={finish.windows!.opacity} />
            ))}

          {/* the public gallery — somebody came to watch. Shapes, not faces. */}
          <G opacity={0.9}>
            <Rect x={40} y={150} width={320} height={44} rx={4} fill={finish.galleryFront} />
            <Rect x={40} y={110} width={320} height={40} rx={4} fill={finish.galleryBack} />
            {Array.from({ length: 7 }, (_, i) => (
              <G key={`g0-${i}`}>
                <Circle cx={64 + i * 46} cy={150} r={12} fill={finish.galleryHead} />
                <Rect x={50 + i * 46} y={158} width={28} height={24} rx={6} fill={finish.galleryBody} />
              </G>
            ))}
            {Array.from({ length: 7 }, (_, i) => (
              <G key={`g1-${i}`}>
                <Circle cx={86 + i * 46} cy={112} r={11} fill={finish.galleryHead} opacity={0.85} />
                <Rect x={73 + i * 46} y={119} width={26} height={22} rx={6} fill={finish.galleryBody} opacity={0.85} />
              </G>
            ))}
          </G>

          {/* the judge's bench, behind everything, unoccupied */}
          <Rect x={96} y={186} width={208} height={70} rx={3} fill={finish.benchBody} />
          <Rect x={112} y={176} width={176} height={16} rx={3} fill={finish.benchTop} />

          {/* the spotlight, cast down the accused */}
          <Ellipse cx={ACCUSED.x} cy={ACCUSED.y - 30} rx={150} ry={230} fill="url(#spot)" />

          {/* the accent only ever touches whoever is the subject — never the
              face itself, or the colour would become the tell */}
          {tab === 'witnesses' && focusW && (
            <Ellipse cx={MARKS.witness.x} cy={MARKS.witness.y + 30} rx={70} ry={86} fill={accent} opacity={0.12} />
          )}
          {tab === 'arguments' && (
            <G>
              <Ellipse cx={MARKS.prosecution.x} cy={MARKS.prosecution.y + 26} rx={62} ry={76} fill={accent} opacity={0.1} />
              <Ellipse cx={MARKS.defence.x} cy={MARKS.defence.y + 26} rx={62} ry={76} fill={accent} opacity={0.1} />
            </G>
          )}
        </AnimatedG>
      </Svg>

      {/* THE PEOPLE. Back to front: counsel, the witness, the accused. */}
      <Animated.View pointerEvents="none" style={[styles.stage, stageStyle]}>
        <OnMark mark={MARKS.prosecution} dim={presence(tab, 'counsel')}>
          <Actor
            who={casting.prosecution.key}
            expression={counselFace('prosecution')}
            speaking={said('prosecution')}
            ready={COUNSEL_READY}
            blinkPeriod={blinkPeriodMs(casting.prosecution.seed)}
            reducedMotion={reduced}
            breathe={0.8}
          />
        </OnMark>
        <OnMark mark={MARKS.defence} dim={presence(tab, 'counsel')}>
          <Actor
            who={casting.defence.key}
            expression={counselFace('defence')}
            speaking={said('defence')}
            ready={COUNSEL_READY}
            blinkPeriod={blinkPeriodMs(casting.defence.seed)}
            reducedMotion={reduced}
            breathe={0.8}
          />
        </OnMark>
        {focusW && (
          <OnMark mark={MARKS.witness} dim={presence(tab, 'witness')}>
            <Actor
              // A different person at the stand is a different actor.
              key={casting[witnessRole].key}
              who={casting[witnessRole].key}
              expression={witnessFace}
              speaking={said(witnessRole)}
              ready={COUNSEL_READY}
              blinkPeriod={blinkPeriodMs(casting[witnessRole].seed)}
              reducedMotion={reduced}
              breathe={0.9}
            />
          </OnMark>
        )}
        {/* THE ACCUSED. Stands where the light is. The one face the game is
            for. Breath is damped by stillness and offset by slump — nobody
            holds as still as `stillness: 1`, which is exactly why it
            registers as wrong long before it registers at all. */}
        <OnMark mark={MARKS.accused} dim={presence(tab, 'accused')}>
          <Actor
            who={casting.defendant.key}
            expression={accusedFace}
            speaking={said('defendant')}
            blinkPeriod={blinkPeriodMs(d.portraitSeed) * uncanny.blinkStretch}
            stillness={uncanny.stillness}
            slump={posture.slump + posture.headDrop}
            reducedMotion={reduced}
            breathe={1.6}
          />
        </OnMark>
      </Animated.View>

      {/* THE FURNITURE IN FRONT OF THEM. The bodies are cut at the chest by
          the renderer; a rail across that line is what makes a cut-out read
          as a person standing behind something. */}
      <Svg {...svgProps} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={finish.woodTop} />
            <Stop offset="1" stopColor={finish.woodBottom} />
          </LinearGradient>
          <LinearGradient id="woodDark" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={finish.woodDarkTop} />
            <Stop offset="1" stopColor={finish.woodDarkBottom} />
          </LinearGradient>
          <RadialGradient id="vign" cx="50%" cy="42%" rx="75%" ry="75%">
            <Stop offset="0.6" stopColor="#000000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.55} />
          </RadialGradient>
        </Defs>
        <AnimatedG animatedProps={frontProps}>
          {/* counsel tables */}
          <Rect x={46} y={388} width={140} height={70} fill="url(#woodDark)" />
          <Rect x={42} y={382} width={148} height={9} rx={2} fill={finish.tableRail} />
          <Rect x={214} y={388} width={140} height={70} fill="url(#woodDark)" />
          <Rect x={210} y={382} width={148} height={9} rx={2} fill={finish.tableRail} />

          {/* the witness box */}
          <Rect x={264} y={340} width={102} height={90} fill="url(#wood)" />
          <Rect x={259} y={333} width={112} height={10} rx={2} fill={finish.boxRail} />
          <Rect x={276} y={352} width={78} height={66} fill="none" stroke="#000000" strokeOpacity={0.35} />

          {/* the dock — the accused stands behind its rail */}
          <Rect x={76} y={396} width={248} height={86} fill="url(#wood)" />
          <Rect x={70} y={388} width={260} height={11} rx={2} fill={finish.dockRail} />
          <Rect x={70} y={388} width={260} height={2} fill="#FFF2DC" opacity={0.12} />
          {[0, 1, 2].map((i) => (
            <Rect
              key={`dock-${i}`}
              x={90 + i * 76}
              y={408}
              width={68}
              height={62}
              fill="none"
              stroke="#000000"
              strokeOpacity={0.4}
            />
          ))}

          {/* the exhibit table — nearest the jury, in front of everything */}
          <Rect x={92} y={452} width={216} height={16} rx={2} fill={finish.exhibitTop} />
          <Rect x={104} y={468} width={192} height={78} fill={finish.exhibitBody} />
          {activeCase.evidence.slice(0, 3).map((e, i) => {
            const ex = 150 + i * 50;
            const open = examinedEvidence === e.id && tab === 'evidence';
            return (
              <G key={e.id}>
                {open && <Circle cx={ex} cy={446} r={22} fill={accent} opacity={0.2} />}
                <Rect
                  x={ex - 15}
                  y={432}
                  width={30}
                  height={20}
                  rx={2}
                  fill={open ? accent : '#8A8378'}
                  opacity={open ? 0.9 : 0.75}
                />
                <Rect x={ex - 15} y={432} width={30} height={20} rx={2} fill="#000000" opacity={0.12} />
              </G>
            );
          })}
        </AnimatedG>

        {/* darkened corners, so the eye goes to the lit centre */}
        <Rect x={0} y={0} width={SCENE_W} height={SCENE_H} fill="url(#vign)" />
      </Svg>
    </View>
  );
});

/**
 * How present each person is on each tab.
 *
 * The camera frames one subject per tab, and at those zooms the people who are
 * NOT the subject end up behind the header and the tabs — a rendered face
 * under the case title is noise the flat drawing never made. They recede into
 * the dark room rather than vanish: the accused is still in the dock while the
 * witness speaks, and the player should feel it.
 */
function presence(tab: DossierTab, who: 'accused' | 'witness' | 'counsel'): number {
  switch (tab) {
    case 'defendant':
      return 1;
    case 'evidence':
      return 0.28;
    case 'witnesses':
      return who === 'witness' ? 1 : 0.3;
    case 'arguments':
      return who === 'counsel' ? 1 : 0.4;
  }
}

/**
 * What everyone but the accused keeps decoded up front.
 *
 * An expression layer is close to a whole portrait (the exporter bakes body
 * carriage into it), so six of them per person is tens of megabytes across the
 * room. The accused keeps all six — theirs is the face being read. The others
 * load an expression the first time they need it, under the dissolve.
 */
const COUNSEL_READY: Expression[] = ['neutral'];

const styles = StyleSheet.create({
  stage: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: SCENE_W,
    height: SCENE_H,
    transformOrigin: 'top left',
  },
});
