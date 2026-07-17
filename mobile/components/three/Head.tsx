import { useMemo, useRef } from 'react';
import type { Group, Mesh } from 'three';
import { useFrame } from '@/lib/r3f';

/**
 * A face.
 *
 * The GDD (5.2) banned these outright — faceless silhouettes, to dodge the
 * uncanny valley and any resemblance to a real person. That ban is overturned
 * here on purpose, because a face is not decoration in this game: jurors are
 * measurably swayed by how a defendant looks, and FAULT cannot ask you to
 * notice your own bias while hiding the thing you are biased by.
 *
 * So the face is built to work on you:
 *
 *   appearance 0   — deep-set eyes, heavy brow, hard jaw, unsmiling
 *   appearance 100 — open eyes, soft brow, round jaw, the ghost of a smile
 *
 * and `appearance` is generated INDEPENDENTLY of guilt. The face is a liar
 * that does not know it is lying. If you convict the man with the heavy brow,
 * appearance_bias records it, and one day the Juror Record will tell you.
 *
 * Two things it is deliberately NOT:
 *   - photoreal. Stylised keeps it out of the uncanny valley and off the
 *     frame budget, and stops any generated person resembling a real one.
 *   - random. Every feature is derived from the character's seed, so a face
 *     that returns is the same face you judged before.
 */

export interface HeadProps {
  /** Deterministic per person — the same seed is always the same face. */
  seed: number;
  /** 0 unsettling .. 100 disarming. The whole point of this component. */
  appearance: number;
  /** Skin is derived from the seed, not from anything about the case. */
  accent: string;
  focused: boolean;
  /** Radians. Head turns are driven by the parent posture. */
  tilt?: number;
}

function rand(seed: number, channel: number): number {
  const x = Math.sin(seed * 127.1 + channel * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * A spread of human skin tones. Chosen by seed alone: nothing about a
 * defendant's colouring is ever correlated with guilt, wealth, or appearance
 * score, and no case ever remarks on it.
 */
const SKIN_TONES = [
  '#F2D3B8', '#E8C39E', '#D9A97C', '#C68B5E', '#A9683F',
  '#8D5524', '#6B3E1E', '#4A2A14', '#3A2113', '#EFD8C4',
];

const HAIR_TONES = ['#1A1512', '#2E2018', '#4A3524', '#6B4A2F', '#8A6A45', '#3A3A38', '#5C5C58'];

export function Head({ seed, appearance, accent, focused, tilt = 0 }: HeadProps) {
  const group = useRef<Group>(null);
  const lids = useRef<Mesh>(null);

  const f = useMemo(() => {
    // 0 unsettling .. 1 disarming
    const a = Math.max(0, Math.min(100, appearance)) / 100;

    return {
      skin: SKIN_TONES[Math.floor(rand(seed, 1) * SKIN_TONES.length)]!,
      hair: HAIR_TONES[Math.floor(rand(seed, 2) * HAIR_TONES.length)]!,

      // Head shape: long and narrow reads harder than round.
      width: 0.9 + rand(seed, 3) * 0.16 + a * 0.06,
      length: 1.12 - a * 0.06 + rand(seed, 4) * 0.1,

      // Brow: the single strongest signal. Heavy and low reads as threat.
      browHeight: 0.028 - a * 0.012,
      browThickness: 0.03 - a * 0.014,
      browAngle: (1 - a) * 0.34 - 0.08, // inward-down = glowering

      // Eyes: deep-set and small vs open and large.
      eyeSize: 0.019 + a * 0.009,
      eyeDepth: -0.006 + a * 0.004,
      /** How much of the eye the lid covers. Hooded reads as unimpressed. */
      lidDrop: (1 - a) * 0.5,

      // Jaw: square and wide vs soft.
      jawWidth: 0.78 + (1 - a) * 0.22,
      jawDepth: 0.86 + (1 - a) * 0.12,

      // Mouth: a flat line vs a slight lift.
      mouthWidth: 0.05 + a * 0.022,
      mouthCurve: (a - 0.5) * 0.028, // negative = downturned
      mouthThickness: 0.006 + a * 0.005,

      // Grooming and wear. Independent of appearance — a well-kept face can
      // still be a hard one.
      hasHair: rand(seed, 5) > 0.18,
      hairVolume: 0.02 + rand(seed, 6) * 0.05,
      stubble: rand(seed, 7) > 0.55,

      /** Age lines. Reads as weathered, not as guilty. */
      age: rand(seed, 8),

      blinkPhase: rand(seed, 9) * 10,
    };
  }, [seed, appearance]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    // A blink every few seconds. It is a small thing and it does most of the
    // work of making the room feel occupied rather than staged.
    if (lids.current) {
      const cycle = (t + f.blinkPhase) % 4.2;
      const blinking = cycle < 0.14;
      const open = f.lidDrop;
      lids.current.scale.y = blinking ? 1 : open + 0.001;
      lids.current.position.y = blinking ? 0 : 0.012 * (1 - open);
    }

    // The head drifts. Nobody holds still while being judged.
    if (group.current) {
      group.current.rotation.y = Math.sin(t * 0.22 + f.blinkPhase) * 0.05;
      group.current.rotation.z = Math.sin(t * 0.17 + f.blinkPhase) * 0.012;
    }
  });

  const eyeX = 0.037 * f.width;

  return (
    <group ref={group} rotation={[tilt, 0, 0]} scale={[f.width, f.length, f.jawDepth]}>
      {/* cranium */}
      <mesh castShadow>
        <sphereGeometry args={[0.108, 24, 24]} />
        <meshStandardMaterial color={f.skin} roughness={0.72} />
      </mesh>

      {/* jaw — widened for hard faces, tucked for soft ones */}
      <mesh position={[0, -0.062, 0.006]} scale={[f.jawWidth, 0.72, 0.94]} castShadow>
        <sphereGeometry args={[0.098, 20, 20]} />
        <meshStandardMaterial color={f.skin} roughness={0.75} />
      </mesh>

      {/* brow ridge — the feature that decides whether you trust this person */}
      <mesh position={[0, 0.03 + f.browHeight, 0.086]} scale={[1.02, 0.5, 0.5]}>
        <sphereGeometry args={[0.1, 16, 12]} />
        <meshStandardMaterial color={f.skin} roughness={0.8} />
      </mesh>

      {/* eyebrows */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * eyeX, 0.028 + f.browHeight, 0.1]}
          rotation={[0, 0, side * f.browAngle]}
        >
          <boxGeometry args={[0.036, f.browThickness, 0.008]} />
          <meshStandardMaterial color={f.hair} roughness={0.9} />
        </mesh>
      ))}

      {/* eyes */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * eyeX, 0.004, 0.094 + f.eyeDepth]}>
          <mesh>
            <sphereGeometry args={[f.eyeSize, 14, 14]} />
            <meshStandardMaterial color="#F4F1EA" roughness={0.28} />
          </mesh>
          {/* iris — always looking at you, because you are the one deciding */}
          <mesh position={[0, 0, f.eyeSize * 0.72]}>
            <sphereGeometry args={[f.eyeSize * 0.5, 12, 12]} />
            <meshStandardMaterial color="#2A1B10" roughness={0.2} />
          </mesh>
        </group>
      ))}

      {/* upper lids — one mesh for both, so a blink is one write per frame */}
      <mesh ref={lids} position={[0, 0.012, 0.1]} scale={[1, f.lidDrop, 1]}>
        <boxGeometry args={[0.12, 0.024, 0.012]} />
        <meshStandardMaterial color={f.skin} roughness={0.7} />
      </mesh>

      {/* nose */}
      <mesh position={[0, -0.012, 0.104]} rotation={[0.3, 0, 0]}>
        <coneGeometry args={[0.017, 0.05, 8]} />
        <meshStandardMaterial color={f.skin} roughness={0.75} />
      </mesh>

      {/* mouth */}
      <mesh position={[0, -0.055 + f.mouthCurve, 0.094]} rotation={[0, 0, 0]}>
        <boxGeometry args={[f.mouthWidth, f.mouthThickness, 0.008]} />
        <meshStandardMaterial color="#7A4A42" roughness={0.6} />
      </mesh>

      {/* nasolabial lines — age, not character */}
      {f.age > 0.55 &&
        [-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.028, -0.04, 0.096]} rotation={[0, 0, side * 0.4]}>
            <boxGeometry args={[0.004, 0.03, 0.004]} />
            {/* #RRGGBBAA is a CSS notion; THREE.Color takes six digits and
                silently warns on eight. The alpha was being expressed twice —
                once in digits three.js discarded, once in the opacity prop
                beside it, which is the one that was doing the work. */}
            <meshStandardMaterial color="#000000" transparent opacity={0.25} roughness={1} />
          </mesh>
        ))}

      {f.stubble && (
        <mesh position={[0, -0.062, 0.03]} scale={[f.jawWidth * 0.99, 0.7, 0.92]}>
          <sphereGeometry args={[0.1, 18, 18]} />
          <meshStandardMaterial color={f.hair} roughness={1} transparent opacity={0.22} />
        </mesh>
      )}

      {f.hasHair && (
        <mesh position={[0, 0.03, -0.012]} scale={[1.04, 0.92, 1.04]} castShadow>
          <sphereGeometry args={[0.108 + f.hairVolume, 20, 20, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
          <meshStandardMaterial color={f.hair} roughness={0.95} />
        </mesh>
      )}

      {/* The accent only ever touches a focused figure — the face itself is
          never tinted by the case's colour, or the colour would become the
          tell instead of the face. */}
      {focused && (
        <mesh position={[0, 0, -0.06]}>
          <sphereGeometry args={[0.125, 16, 16]} />
          <meshBasicMaterial color={accent} transparent opacity={0.1} />
        </mesh>
      )}
    </group>
  );
}
