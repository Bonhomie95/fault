import { useMemo, useRef } from 'react';
import type { Group } from 'three';
import { useFrame } from '@/lib/r3f';
import { Head } from './Head';

/**
 * A person in the room.
 *
 * The GDD called for faceless silhouettes (5.2). That has been overturned:
 * jurors are swayed by how a defendant looks, and a game about noticing your
 * own bias cannot hide the thing you are biased by. See Head.tsx.
 *
 * Everything here is deterministic from the seed, so a person who returns
 * years later is recognisably the same person — which is the Echo System's
 * whole payload. `appearance` shapes the face and the bearing; it is
 * generated independently of guilt, so it is information about nothing.
 */

export type Posture = 'standing' | 'accused' | 'testifying' | 'arguing' | 'seated';

interface FigureProps {
  seed: number;
  /** 0 unsettling .. 100 disarming. Only meaningful for people you judge. */
  appearance?: number;
  posture?: Posture;
  accent?: string;
  focused?: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  alive?: boolean;
  /**
   * Draw a cheap version: a body and a suggestion of a head, no face.
   *
   * A person in this scene costs ~39 meshes, 26 of them in the face — brow
   * ridges, jaw, the works. That is the right price for the defendant, whose
   * face is a game mechanic you are asked to read for bias. It is an absurd
   * price for someone sitting in the tenth row of the public gallery, whose
   * entire job is to be a shape that is clearly a person.
   *
   * Ten of those in the gallery came to 390 meshes — nearly triple the whole
   * rest of the room — on a phone already dropping frames.
   */
  simple?: boolean;
}

function rand(seed: number, channel: number): number {
  const x = Math.sin(seed * 127.1 + channel * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Ordinary clothes. Nobody in this room is dressed like a villain. */
const CLOTHES = ['#2E3440', '#3B3A36', '#243B33', '#40323C', '#1F2933', '#4A3B2A', '#31353B'];
const SHIRTS = ['#D8D2C6', '#B9C2C8', '#C9BFA8', '#A8B2A6', '#CFC3B8'];

export function Figure({
  seed,
  appearance = 50,
  posture = 'standing',
  accent = '#888880',
  focused = false,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  alive = true,
  simple = false,
}: FigureProps) {
  const group = useRef<Group>(null);

  const t = useMemo(() => {
    const a = Math.max(0, Math.min(100, appearance)) / 100;
    return {
      height: 0.92 + rand(seed, 1) * 0.16,
      // Build reads before the face does, at courtroom distance.
      build: 0.86 + rand(seed, 2) * 0.3 + (1 - a) * 0.08,
      shoulder: 0.9 + rand(seed, 3) * 0.24 + (1 - a) * 0.1,
      /** Disarming people stand straighter; hard men hunch. Bearing is bias too. */
      slouch: (1 - a) * 0.1 + rand(seed, 4) * 0.03,
      lean: (rand(seed, 5) - 0.5) * 0.1,
      coat: CLOTHES[Math.floor(rand(seed, 6) * CLOTHES.length)]!,
      shirt: SHIRTS[Math.floor(rand(seed, 7) * SHIRTS.length)]!,
      phase: rand(seed, 8) * Math.PI * 2,
    };
  }, [seed, appearance]);

  const tilt = useMemo(() => {
    switch (posture) {
      case 'accused':
        return { body: 0.05, head: -0.12 }; // shoulders forward, chin down
      case 'testifying':
        return { body: -0.04, head: 0.08 };
      case 'arguing':
        return { body: -0.08, head: 0.04 };
      case 'seated':
        return { body: 0.02, head: 0 };
      default:
        return { body: 0, head: 0 };
    }
  }, [posture]);

  useFrame((state) => {
    if (!group.current || !alive) return;
    const time = state.clock.elapsedTime;
    // Breath. Barely there, but the room is never quite still.
    const breath = Math.sin(time * 0.8 + t.phase) * 0.005;
    group.current.position.y = position[1] + breath;
    // A slight weight shift — standing for a long time is uncomfortable.
    group.current.rotation.y = rotation[1] + Math.sin(time * 0.19 + t.phase) * 0.03;
  });

  const seated = posture === 'seated' ? -0.2 : 0;
  const h = t.height;

  return (
    <group ref={group} position={position} rotation={rotation} scale={scale}>
      <group rotation={[tilt.body + t.slouch, 0, t.lean]}>
        {/* torso — a coat, not a capsule */}
        <mesh position={[0, 0.56 * h + seated, 0]} castShadow>
          <capsuleGeometry args={[0.155 * t.build, 0.46 * h, 6, 14]} />
          <meshStandardMaterial color={t.coat} roughness={0.88} />
        </mesh>

        {/* the shirt showing at the collar */}
        {!simple && (
        <mesh position={[0, 0.79 * h + seated, 0.022]} castShadow>
          <cylinderGeometry args={[0.055, 0.075, 0.07, 12]} />
          <meshStandardMaterial color={t.shirt} roughness={0.8} />
        </mesh>
        )}

        {/* shoulders — the capsule lies across the body, so the mesh turns,
            not the geometry */}
        {!simple && (
        <mesh position={[0, 0.8 * h + seated, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <capsuleGeometry args={[0.085, 0.3 * t.shoulder, 4, 10]} />
          <meshStandardMaterial color={t.coat} roughness={0.9} />
        </mesh>
        )}

        {/* arms, hanging */}
        {!simple &&
          [-1, 1].map((side) => (
          <mesh
            key={side}
            position={[side * 0.17 * t.shoulder, 0.56 * h + seated, 0.01]}
            rotation={[0, 0, side * 0.06]}
            castShadow
          >
            <capsuleGeometry args={[0.042, 0.38 * h, 4, 8]} />
            <meshStandardMaterial color={t.coat} roughness={0.9} />
          </mesh>
          ))}

        {/* neck */}
        {!simple && (
        <mesh position={[0, 0.87 * h + seated, 0]}>
          <cylinderGeometry args={[0.032, 0.038, 0.06, 10]} />
          <meshStandardMaterial color="#C68B5E" roughness={0.75} />
        </mesh>
        )}

        {/* the face — or, in the gallery, the fact of one */}
        <group position={[0, 1.0 * h + seated, 0]}>
          {simple ? (
            <mesh castShadow>
              <sphereGeometry args={[0.085, 10, 8]} />
              <meshStandardMaterial color="#C68B5E" roughness={0.85} />
            </mesh>
          ) : (
            <Head seed={seed} appearance={appearance} accent={accent} focused={focused} tilt={tilt.head} />
          )}
        </group>

        {/* legs */}
        {posture !== 'seated' &&
          [-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.06, 0.16 * h, 0]} castShadow>
              <capsuleGeometry args={[0.055 * t.build, 0.3 * h, 4, 8]} />
              <meshStandardMaterial color="#1A1A17" roughness={0.95} />
            </mesh>
          ))}
      </group>

      {/* the pool of light a focused figure stands in */}
      {focused && (
        <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.42, 32]} />
          <meshBasicMaterial color={accent} transparent opacity={0.13} />
        </mesh>
      )}
    </group>
  );
}
