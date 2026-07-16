import { useMemo, useRef } from 'react';
import { Vector3 } from 'three';
import type { ClientCase } from '@/lib/api';
import { Canvas, useFrame, useThree } from '@/lib/r3f';
import { EvidenceObject } from './EvidenceObject';
import { Figure } from './Figure';

export type DossierTab = 'defendant' | 'evidence' | 'witnesses' | 'arguments';

/**
 * The room.
 *
 * You are the jury of one, so the camera is your head: it does not cut, it
 * moves. Swiping a tab walks you around the same continuous space rather than
 * swapping a screen, which is what makes the dossier feel like a place you are
 * standing in instead of a document you are scrolling.
 */

interface CameraMark {
  position: [number, number, number];
  target: [number, number, number];
}

const MARKS: Record<DossierTab, CameraMark> = {
  // Face to face with the accused.
  defendant: { position: [0, 1.35, 2.5], target: [0, 0.95, 0] },
  // Over the exhibit table, looking down at what you have been given.
  evidence: { position: [0, 2.15, 1.45], target: [0, 0.75, 0.15] },
  // Turned toward the stand.
  witnesses: { position: [1.85, 1.4, 2.05], target: [1.5, 0.95, -0.4] },
  // Between the two arguments, watching them talk past each other.
  arguments: { position: [0, 1.5, 2.9], target: [0, 1.0, -1.1] },
};

function CameraRig({ tab }: { tab: DossierTab }) {
  const { camera } = useThree();
  const target = useRef(new Vector3(...MARKS.defendant.target));

  useFrame((_state, delta) => {
    const mark = MARKS[tab];
    const k = Math.min(1, delta * 2.4); // slow enough to feel like turning your head

    camera.position.lerp(new Vector3(...mark.position), k);
    target.current.lerp(new Vector3(...mark.target), k);
    camera.lookAt(target.current);
  });

  return null;
}

function Room({ accent }: { accent: string }) {
  return (
    <>
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[24, 24]} />
        <meshStandardMaterial color="#0D0D0D" roughness={1} />
      </mesh>

      {/* the exhibit table — the only lit surface in the room */}
      <mesh position={[0, 0.7, 0.15]} receiveShadow castShadow>
        <boxGeometry args={[2.5, 0.06, 1.2]} />
        <meshStandardMaterial color="#1C1C19" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.35, 0.15]}>
        <boxGeometry args={[2.3, 0.65, 1.0]} />
        <meshStandardMaterial color="#131311" roughness={0.9} />
      </mesh>

      {/* the bench, behind everything, unoccupied — nobody is coming to help */}
      <mesh position={[0, 0.95, -3.2]} receiveShadow>
        <boxGeometry args={[4.2, 1.9, 0.35]} />
        <meshStandardMaterial color="#121210" roughness={0.95} />
      </mesh>

      {/* witness stand */}
      <mesh position={[1.5, 0.45, -0.4]} receiveShadow castShadow>
        <boxGeometry args={[0.85, 0.9, 0.7]} />
        <meshStandardMaterial color="#171714" roughness={0.9} />
      </mesh>

      {/* accent wash on the back wall — the case's one colour, GDD 5.1 */}
      <mesh position={[0, 1.6, -4.4]}>
        <planeGeometry args={[9, 4]} />
        <meshBasicMaterial color={accent} transparent opacity={0.05} />
      </mesh>
    </>
  );
}

/** The jury box. Eleven shapes in the dark — present, silent, not voting. */
function JuryBox({ accent }: { accent: string }) {
  const seats = useMemo(
    () =>
      Array.from({ length: 11 }, (_, i) => ({
        seed: 900 + i,
        x: -3.4 + (i % 6) * 0.42,
        z: -1.6 - Math.floor(i / 6) * 0.5,
      })),
    [],
  );

  return (
    <group position={[-1.3, 0, 0]}>
      <mesh position={[-2.35, 0.32, -1.85]} receiveShadow>
        <boxGeometry args={[2.9, 0.64, 1.4]} />
        <meshStandardMaterial color="#141412" roughness={0.95} />
      </mesh>
      {seats.map((s) => (
        <Figure
          key={s.seed}
          seed={s.seed}
          posture="seated"
          position={[s.x, 0.64, s.z]}
          rotation={[0, 0.35, 0]}
          scale={0.62}
          accent={accent}
          alive={false}
        />
      ))}
    </group>
  );
}

interface SceneProps {
  activeCase: ClientCase;
  tab: DossierTab;
  examinedEvidence: string | null;
  onSelectEvidence: (id: string) => void;
  focusedWitness: number;
}

function hashName(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h % 200);
}

function Scene({ activeCase, tab, examinedEvidence, onSelectEvidence, focusedWitness }: SceneProps) {
  const accent = activeCase.accent;

  return (
    <>
      {/* Courtrooms are overhead-lit and unkind. */}
      <ambientLight intensity={0.28} />
      <directionalLight
        position={[2.5, 6, 3]}
        intensity={1.15}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      {/* the accent as a practical light, not just a colour */}
      <pointLight position={[0, 2.6, 0.4]} intensity={1.6} distance={7} color={accent} />
      <fog attach="fog" args={['#0D0D0D', 4.5, 12]} />

      <CameraRig tab={tab} />
      <Room accent={accent} />
      <JuryBox accent={accent} />

      {/* The accused. Stands where the light is worst. */}
      <Figure
        seed={activeCase.defendant.portraitSeed}
        posture="accused"
        position={[0, 0, -0.95]}
        accent={accent}
        focused={tab === 'defendant'}
      />

      {/* Witnesses — the focused one is at the stand, the other waits. */}
      {activeCase.witnesses.map((w, i) => (
        <Figure
          key={w.name}
          seed={hashName(w.name)}
          posture={i === focusedWitness ? 'testifying' : 'standing'}
          position={i === focusedWitness ? [1.5, 0.9, -0.4] : [2.6, 0, 0.6]}
          rotation={[0, i === focusedWitness ? -0.5 : -0.9, 0]}
          accent={accent}
          focused={tab === 'witnesses' && i === focusedWitness}
          scale={i === focusedWitness ? 1 : 0.95}
        />
      ))}

      {/* Prosecution and defence, facing each other across you. */}
      <Figure
        seed={hashName(`${activeCase.id}-prosecution`)}
        posture="arguing"
        position={[-1.15, 0, -1.15]}
        rotation={[0, 0.45, 0]}
        accent={accent}
        focused={tab === 'arguments'}
      />
      <Figure
        seed={hashName(`${activeCase.id}-defence`)}
        posture="arguing"
        position={[1.15, 0, -1.15]}
        rotation={[0, -0.45, 0]}
        accent={accent}
        focused={tab === 'arguments'}
      />

      {/* The three exhibits, laid out on the table. */}
      {activeCase.evidence.map((e, i) => (
        <EvidenceObject
          key={e.id}
          description={e.description}
          index={i}
          accent={accent}
          selected={examinedEvidence === e.id}
          examined={examinedEvidence === e.id && tab === 'evidence'}
          position={[-0.72 + i * 0.72, 0.76, 0.15]}
          onSelect={() => onSelectEvidence(e.id)}
        />
      ))}
    </>
  );
}

export function CourtroomScene(props: SceneProps) {
  return (
    <Canvas
      shadows
      camera={{ position: MARKS.defendant.position, fov: 42, near: 0.1, far: 40 }}
      gl={{ antialias: true }}
      style={{ flex: 1 }}
    >
      <color attach="background" args={['#0D0D0D']} />
      <Scene {...props} />
    </Canvas>
  );
}
