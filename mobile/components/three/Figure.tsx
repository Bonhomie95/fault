import { useMemo, useRef } from 'react';
import type { Group } from 'three';
import { useFrame } from '@/lib/r3f';

/**
 * A person in the room.
 *
 * GDD 5.2 — stylised, never photorealistic. No faces: a face invites the
 * uncanny valley and implies a real likeness. What identifies someone here is
 * silhouette and posture, with one feature exaggerated, derived
 * deterministically from their portrait seed. The same person is always the
 * same shape, so a returning name is a returning body.
 */

export type Posture = 'standing' | 'accused' | 'testifying' | 'arguing' | 'seated';

interface FigureProps {
  seed: number;
  posture?: Posture;
  accent?: string;
  /** Highlights the figure — used for whoever the camera is about. */
  focused?: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  /** Breathing gives the room a pulse. Disabled for background jurors. */
  alive?: boolean;
}

/** Deterministic pseudo-random in [0,1) from a seed and a channel. */
function rand(seed: number, channel: number): number {
  const x = Math.sin(seed * 127.1 + channel * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function Figure({
  seed,
  posture = 'standing',
  accent = '#888880',
  focused = false,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  alive = true,
}: FigureProps) {
  const group = useRef<Group>(null);

  // One exaggerated identifying feature per person (GDD 5.2).
  const traits = useMemo(() => {
    const height = 0.85 + rand(seed, 1) * 0.3;
    const width = 0.8 + rand(seed, 2) * 0.45;
    const headSize = 0.9 + rand(seed, 3) * 0.25;
    const lean = (rand(seed, 4) - 0.5) * 0.28;
    const shoulderDrop = rand(seed, 5) * 0.12;
    // Which trait is pushed past normal — the thing you'd remember.
    const exaggerated = Math.floor(rand(seed, 6) * 4);
    return {
      height: exaggerated === 0 ? height * 1.18 : height,
      width: exaggerated === 1 ? width * 1.3 : width,
      headSize: exaggerated === 2 ? headSize * 1.2 : headSize,
      lean: exaggerated === 3 ? lean * 2.1 : lean,
      shoulderDrop,
      phase: rand(seed, 7) * Math.PI * 2,
    };
  }, [seed]);

  const postureTilt = useMemo(() => {
    switch (posture) {
      case 'accused':
        return { body: 0.06, head: -0.14 }; // shoulders forward, chin down
      case 'testifying':
        return { body: -0.05, head: 0.1 }; // upright, addressing the room
      case 'arguing':
        return { body: -0.1, head: 0.05 }; // leaning in
      case 'seated':
        return { body: 0.02, head: 0 };
      default:
        return { body: 0, head: 0 };
    }
  }, [posture]);

  useFrame((state) => {
    if (!group.current || !alive) return;
    // Breath — barely there, but the room is never quite still.
    const t = state.clock.elapsedTime;
    const breath = Math.sin(t * 0.8 + traits.phase) * 0.006;
    group.current.position.y = position[1] + breath;
    if (focused) {
      group.current.rotation.y = rotation[1] + Math.sin(t * 0.3 + traits.phase) * 0.04;
    }
  });

  const bodyColor = focused ? accent : '#262622';
  const emissive = focused ? accent : '#000000';
  const seatedOffset = posture === 'seated' ? -0.22 : 0;

  return (
    <group ref={group} position={position} rotation={rotation} scale={scale}>
      <group rotation={[postureTilt.body + traits.lean * 0.3, 0, traits.lean]}>
        {/* torso */}
        <mesh position={[0, 0.55 * traits.height + seatedOffset, 0]} castShadow>
          <capsuleGeometry args={[0.17 * traits.width, 0.52 * traits.height, 4, 12]} />
          <meshStandardMaterial
            color={bodyColor}
            emissive={emissive}
            emissiveIntensity={focused ? 0.22 : 0}
            roughness={0.85}
          />
        </mesh>

        {/* shoulders — the width that reads at silhouette distance */}
        <mesh position={[0, 0.82 * traits.height - traits.shoulderDrop + seatedOffset, 0]} castShadow>
          <capsuleGeometry args={[0.1, 0.34 * traits.width, 4, 8]} />
          <meshStandardMaterial color={bodyColor} roughness={0.9} />
        </mesh>

        {/* head — no face, on purpose */}
        <mesh
          position={[0, 1.02 * traits.height + seatedOffset, 0]}
          rotation={[postureTilt.head, 0, 0]}
          castShadow
        >
          <sphereGeometry args={[0.12 * traits.headSize, 16, 16]} />
          <meshStandardMaterial
            color={bodyColor}
            emissive={emissive}
            emissiveIntensity={focused ? 0.3 : 0}
            roughness={0.8}
          />
        </mesh>

        {/* legs / plinth — figures stand on a base, like exhibits */}
        {posture !== 'seated' && (
          <mesh position={[0, 0.14 * traits.height, 0]} castShadow>
            <capsuleGeometry args={[0.13 * traits.width, 0.3 * traits.height, 4, 8]} />
            <meshStandardMaterial color="#1A1A17" roughness={0.95} />
          </mesh>
        )}
      </group>

      {/* the accent pool a focused figure stands in */}
      {focused && (
        <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.42, 32]} />
          <meshBasicMaterial color={accent} transparent opacity={0.13} />
        </mesh>
      )}
    </group>
  );
}
