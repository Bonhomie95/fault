import { useMemo, useRef } from 'react';
import type { Group, Mesh, PointLight } from 'three';
import type { CityState } from '@/lib/api';
import { Canvas, useFrame } from '@/lib/r3f';

/**
 * Orun City.
 *
 * GDD 2.3 — "The city does not tell you it is changing. You observe it."
 * So this model has no labels and no numbers. Every dial is expressed as
 * something you can only read by looking:
 *
 *   wealth_disparity      → the skyline splits; towers climb, the rest sink
 *   crime_rate            → how much of the grid has gone dark
 *   judicial_trust        → the courthouse light at the centre
 *   organized_crime_power → fog thickening in the streets
 *   police_integrity      → patrol lights still moving
 *   media_pressure        → the press beacon sweeping the towers
 *
 * A player who never opens a menu should still feel the city curdle.
 */

const GRID = 7; // 7x7 blocks
const SPACING = 0.62;

interface Block {
  x: number;
  z: number;
  /** 0..1 — how central, and so how rich the block gets when disparity climbs */
  centrality: number;
  seed: number;
  isCourthouse: boolean;
}

function rand(seed: number, channel: number): number {
  const x = Math.sin(seed * 91.7 + channel * 47.3) * 21374.1;
  return x - Math.floor(x);
}

function useBlocks(): Block[] {
  return useMemo(() => {
    const blocks: Block[] = [];
    const mid = (GRID - 1) / 2;

    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        const dx = (i - mid) / mid;
        const dz = (j - mid) / mid;
        const dist = Math.min(1, Math.hypot(dx, dz));
        blocks.push({
          x: (i - mid) * SPACING,
          z: (j - mid) * SPACING,
          centrality: 1 - dist,
          seed: i * 31 + j * 17 + 1,
          isCourthouse: i === Math.floor(mid) && j === Math.floor(mid),
        });
      }
    }
    return blocks;
  }, []);
}

/** The courthouse. Its light is judicial trust — nothing else in the city glows. */
function Courthouse({ city }: { city: CityState }) {
  const light = useRef<PointLight>(null);
  const trust = city.judicialTrust / 100;

  useFrame((state) => {
    if (!light.current) return;
    // Low trust does not go dark — it goes unsteady. A guttering institution.
    const t = state.clock.elapsedTime;
    const instability = (1 - trust) * 0.5;
    light.current.intensity = 0.5 + trust * 2.6 + Math.sin(t * 7) * instability;
  });

  return (
    <group position={[0, 0, 0]}>
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.62, 0.6, 0.62]} />
        <meshStandardMaterial
          color="#2E2E29"
          emissive="#F0EDE8"
          emissiveIntensity={trust * 0.4}
          roughness={0.7}
        />
      </mesh>
      {/* dome */}
      <mesh position={[0, 0.68, 0]} castShadow>
        <sphereGeometry args={[0.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          color="#3A3A33"
          emissive="#F0EDE8"
          emissiveIntensity={trust * 0.5}
          roughness={0.5}
        />
      </mesh>
      <pointLight ref={light} position={[0, 0.9, 0]} distance={5} color="#F0EDE8" />
    </group>
  );
}

function Building({ block, city }: { block: Block; city: CityState }) {
  const mesh = useRef<Mesh>(null);

  const { height, dark, lit } = useMemo(() => {
    const disparity = city.wealthDisparity / 100;
    const crime = city.crimeRate / 100;

    // Disparity is a shape, not a number: the centre climbs and the edges are
    // pressed flat. At disparity 0 the skyline is even; at 100 it is a spike
    // surrounded by nothing.
    const base = 0.22 + rand(block.seed, 1) * 0.3;
    const privilege = Math.pow(block.centrality, 1.6) * disparity * 2.4;
    const neglect = (1 - block.centrality) * disparity * 0.16;
    const h = Math.max(0.08, base + privilege - neglect);

    // Crime takes the lights out, from the edges inward — the periphery goes
    // first, which is exactly how the city would tell you if it were honest.
    const vulnerability = 1 - block.centrality;
    const isDark = rand(block.seed, 2) < crime * vulnerability * 1.5;

    return { height: h, dark: isDark, lit: !isDark && rand(block.seed, 3) > 0.35 };
  }, [block, city]);

  useFrame((state) => {
    if (!mesh.current || !lit) return;
    // Windows flicker faster when the city is agitated.
    const t = state.clock.elapsedTime;
    const agitation = city.mediaPressure / 100;
    const flicker = 0.6 + Math.sin(t * (1 + agitation * 4) + block.seed) * 0.12;
    const mat = mesh.current.material as { emissiveIntensity?: number };
    if (mat.emissiveIntensity !== undefined) mat.emissiveIntensity = flicker * 0.5;
  });

  if (block.isCourthouse) return <Courthouse city={city} />;

  return (
    <mesh ref={mesh} position={[block.x, height / 2, block.z]} castShadow receiveShadow>
      <boxGeometry args={[0.4, height, 0.4]} />
      <meshStandardMaterial
        color={dark ? '#0F0F0E' : '#232320'}
        emissive={lit ? '#D4860A' : '#000000'}
        emissiveIntensity={lit ? 0.3 : 0}
        roughness={0.9}
      />
    </mesh>
  );
}

/** Police integrity, expressed as patrols that still bother to drive. */
function Patrols({ city }: { city: CityState }) {
  const group = useRef<Group>(null);
  const count = Math.round((city.policeIntegrity / 100) * 5);

  useFrame((state) => {
    if (!group.current) return;
    group.current.rotation.y = state.clock.elapsedTime * 0.18;
  });

  if (count === 0) return null;

  return (
    <group ref={group}>
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2;
        const radius = 1.1 + (i % 2) * 0.7;
        return (
          <pointLight
            key={i}
            position={[Math.cos(angle) * radius, 0.14, Math.sin(angle) * radius]}
            intensity={0.55}
            distance={1.3}
            color="#1D7E6A"
          />
        );
      })}
    </group>
  );
}

/** Media pressure, expressed as a beacon that will not stop looking at you. */
function PressBeacon({ city }: { city: CityState }) {
  const light = useRef<PointLight>(null);
  const pressure = city.mediaPressure / 100;

  useFrame((state) => {
    if (!light.current) return;
    const t = state.clock.elapsedTime * (0.6 + pressure * 1.8);
    light.current.position.x = Math.cos(t) * 2.2;
    light.current.position.z = Math.sin(t) * 2.2;
    light.current.intensity = pressure * 3.2;
  });

  if (pressure < 0.35) return null;

  return <pointLight ref={light} position={[2.2, 1.5, 0]} distance={4} color="#C23B22" />;
}

function CityModel({ city }: { city: CityState }) {
  const blocks = useBlocks();
  const group = useRef<Group>(null);

  useFrame((state) => {
    if (!group.current) return;
    // A slow orbit. You are looking down at what you made.
    group.current.rotation.y = state.clock.elapsedTime * 0.055;
  });

  // Organised crime is the fog: the more power it has, the less of your own
  // city you can see.
  const syndicate = city.organizedCrimePower / 100;
  const fogNear = 4.5 - syndicate * 2.6;
  const fogFar = 13 - syndicate * 6.5;

  return (
    <>
      <ambientLight intensity={0.18 + (city.judicialTrust / 100) * 0.14} />
      <directionalLight position={[3, 6, 2]} intensity={0.5} castShadow />
      <fog attach="fog" args={['#0D0D0D', fogNear, fogFar]} />

      <group ref={group}>
        {/* the ground the city stands on */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[14, 14]} />
          <meshStandardMaterial color="#111110" roughness={1} />
        </mesh>

        {blocks.map((b) => (
          <Building key={b.seed} block={b} city={city} />
        ))}

        <Patrols city={city} />
        <PressBeacon city={city} />
      </group>
    </>
  );
}

export function CityScene({ city }: { city: CityState }) {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 3.4, 4.6], fov: 38, near: 0.1, far: 40 }}
      gl={{ antialias: true }}
      style={{ flex: 1 }}
      onCreated={({ camera }) => camera.lookAt(0, 0.3, 0)}
    >
      <color attach="background" args={['#0D0D0D']} />
      <CityModel city={city} />
    </Canvas>
  );
}
