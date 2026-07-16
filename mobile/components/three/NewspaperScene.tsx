import { useMemo, useRef } from 'react';
import type { Group } from 'three';
import { Canvas, useFrame } from '@/lib/r3f';

/**
 * The assignment, landing on a desk.
 *
 * GDD 6, Screen 1 — no logo, no menu, no tutorial. The first thing the game
 * does is hand you a newspaper. The 3D here is deliberately restrained: the
 * paper lands, settles, and stops. The headline itself is native text laid
 * over this, because you have to be able to read it.
 */

function rand(seed: number): number {
  const x = Math.sin(seed * 77.3) * 13791.7;
  return x - Math.floor(x);
}

function Newspaper() {
  const group = useRef<Group>(null);

  // Column rules and text lines — the furniture of a front page, suggested
  // rather than printed. Real words live in the React Native layer.
  const lines = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        y: -0.15 - (i % 13) * 0.075,
        x: i < 13 ? -0.42 : 0.42,
        w: 0.5 + rand(i) * 0.32,
        key: i,
      })),
    [],
  );

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    // It settles once, then only breathes. Paper on a desk, not a hologram.
    const settle = Math.min(1, t / 1.6);
    const ease = 1 - Math.pow(1 - settle, 3);
    group.current.rotation.x = -1.2 + ease * 0.28;
    group.current.position.y = 1.4 - ease * 1.4 + Math.sin(t * 0.5) * 0.008;
    group.current.rotation.z = (1 - ease) * 0.5 + Math.sin(t * 0.35) * 0.006;
  });

  return (
    <group ref={group} position={[0, 0, 0]} rotation={[-1.2, 0, 0.5]}>
      {/* the sheet */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[2.0, 2.7, 0.012]} />
        <meshStandardMaterial color="#D8D2C6" roughness={0.98} />
      </mesh>

      {/* masthead rule */}
      <mesh position={[0, 1.02, 0.008]}>
        <planeGeometry args={[1.8, 0.014]} />
        <meshBasicMaterial color="#0D0D0D" />
      </mesh>
      <mesh position={[0, 0.42, 0.008]}>
        <planeGeometry args={[1.8, 0.006]} />
        <meshBasicMaterial color="#33332E" />
      </mesh>

      {/* column gutter */}
      <mesh position={[0, -0.5, 0.008]}>
        <planeGeometry args={[0.005, 1.0]} />
        <meshBasicMaterial color="#A9A395" />
      </mesh>

      {/* body copy as texture */}
      {lines.map((l) => (
        <mesh key={l.key} position={[l.x, l.y - 0.42, 0.008]}>
          <planeGeometry args={[l.w, 0.011]} />
          <meshBasicMaterial color="#6B6558" />
        </mesh>
      ))}
    </group>
  );
}

export function NewspaperScene() {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 0.1, 3.5], fov: 40 }}
      gl={{ antialias: true }}
      style={{ flex: 1 }}
    >
      <color attach="background" args={['#0D0D0D']} />
      <ambientLight intensity={0.5} />
      {/* a desk lamp, off to one side */}
      <directionalLight position={[-2, 3, 4]} intensity={1.4} castShadow />
      <pointLight position={[2, 1, 2]} intensity={0.5} color="#D4860A" />
      <fog attach="fog" args={['#0D0D0D', 4, 9]} />
      <Newspaper />
    </Canvas>
  );
}
