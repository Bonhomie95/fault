import { useMemo, useRef } from 'react';
import { Vector3 } from 'three';
import type { ClientCase } from '@/lib/api';
import { useReducedMotion } from '@/lib/motion';
import { Canvas, useFrame, useThree } from '@/lib/r3f';
import { EvidenceObject } from './EvidenceObject';
import { Figure } from './Figure';

export type DossierTab = 'defendant' | 'evidence' | 'witnesses' | 'arguments';

/**
 * The room, from the twelfth seat.
 *
 * You are the jury of one. The camera is your head, and this file now means it
 * literally: your head does not move. It is bolted to a seat in the jury box
 * and only your gaze travels.
 *
 * It used to claim the same thing and not do it. The old marks flew the camera
 * to 2.15m to look down at the exhibit table and slid it 1.85m sideways to face
 * the witness stand — a drone on a boom, not a person in a chair. Two things
 * were wrong with that. It broke the fiction the whole game rests on, and
 * translating a camera through a space is the single most reliable way to make
 * someone motion-sick on a handset, which is a strange thing to do to a player
 * you have asked to sit still and concentrate for 120 seconds.
 *
 * So: one seat, four gazes. Turning to the witness is a turn of the head.
 * Reading the exhibits is looking down at the table in front of you. The room
 * is fixed and you are in it.
 */

/** The twelfth seat. Eye height of someone seated, and it does not change. */
const HEAD: [number, number, number] = [0, 1.15, 1.75];

/**
 * How far out counsel stand.
 *
 * Constrained by the lens, not by taste: at the arguments fov this frame is
 * ±11.6° wide, and anyone past that is simply not on screen.
 */
const COUNSEL_X = 0.58;

interface Gaze {
  /** Where you are looking. Never where you are. */
  target: [number, number, number];
  /**
   * Focal length, as attention.
   *
   * With the head fixed, this is what is left to express "lean in" and "take
   * the room in" — and it is honest, because narrowing on a face is what your
   * attention actually does. Kept in a narrow band: a big fov swing from a
   * static camera is a dolly zoom, which is a horror-film effect and would
   * read as the room lurching.
   */
  fov: number;
}

const GAZES: Record<DossierTab, Gaze> = {
  // Straight ahead at the accused, and narrowed — close enough to read them,
  // which is the whole trap. You are meant to look at this person and feel
  // something.
  defendant: { target: [0, 1.02, -0.95], fov: 36 },
  // Down at the table in front of you. You do not fly over it; the exhibit
  // rises to meet you when you pick it up (see EvidenceObject).
  evidence: { target: [0, 0.8, 0.15], fov: 46 },
  // A turn of the head to the right, toward the stand.
  witnesses: { target: [1.5, 1.05, -0.4], fov: 42 },
  // Both counsel at once, so this is the widest the room ever gets. It cannot
  // go wider: three.js fov is VERTICAL and this canvas is 0.461 aspect, so 48°
  // vertical buys only ~23° horizontal. Framing anyone beyond ±11.6° means
  // moving them, not the lens — see COUNSEL_X. Nobody is talking to you. They
  // are talking past you.
  arguments: { target: [0, 1.05, -1.6], fov: 48 },
};

function CameraRig({ tab, reducedMotion }: { tab: DossierTab; reducedMotion: boolean }) {
  const { camera } = useThree();
  const target = useRef(new Vector3(...GAZES.defendant.target));
  const head = useMemo(() => new Vector3(...HEAD), []);

  useFrame((state, delta) => {
    const gaze = GAZES[tab];
    // Slow enough to feel like turning your head rather than cutting to a
    // camera. Frame-rate independent, so a 120Hz phone does not turn twice as
    // fast as a 60Hz one.
    const k = 1 - Math.exp(-delta * 2.6);

    camera.position.copy(head);

    if (!reducedMotion) {
      // Breathing. Six millimetres — far too small to notice and the only
      // reason the room feels occupied rather than paused. A perfectly still
      // camera reads as a screenshot.
      const t = state.clock.elapsedTime;
      camera.position.y += Math.sin(t * 0.62) * 0.006;
      camera.position.x += Math.sin(t * 0.41) * 0.004;
    }

    target.current.lerp(new Vector3(...gaze.target), k);
    camera.lookAt(target.current);

    const cam = camera as typeof camera & { fov: number; updateProjectionMatrix: () => void };
    if (Math.abs(cam.fov - gaze.fov) > 0.01) {
      cam.fov += (gaze.fov - cam.fov) * k;
      cam.updateProjectionMatrix();
    }
  });

  return null;
}

/**
 * The rail of the jury box, at the bottom of your vision.
 *
 * The oldest trick in first-person: you believe you are somewhere when you can
 * see the edge of it. Without this the seat is an assertion; with it there is a
 * physical thing between you and the court, and you are behind it.
 *
 * Its height is not taste, it is arithmetic, and the first version got it wrong
 * — a frustum check said 0 of 4 sample points were on screen, because the rail
 * sat below the forward sightline and rendered nothing at all on three of the
 * four tabs.
 *
 * The band is narrow. Too low and it is off the bottom of the frame; too high
 * and it hides the exhibit table you look down at. At z=1.35 the window is
 * 1.000..1.062, so the top edge sits at 1.03: visible looking forward, and
 * still 3cm under the sightline to the evidence. Wide enough that the 6mm of
 * breathing cannot push it into either failure.
 */
function JuryRail({ accent }: { accent: string }) {
  return (
    <group>
      <mesh position={[0, 0.98, 1.35]} receiveShadow castShadow>
        <boxGeometry args={[9, 0.1, 0.12]} />
        <meshStandardMaterial color="#1A1A17" roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.5, 1.37]} receiveShadow>
        <boxGeometry args={[9, 0.86, 0.06]} />
        <meshStandardMaterial color="#111110" roughness={0.95} />
      </mesh>
      {/* the case's colour catches the rail edge nearest you */}
      <mesh position={[0, 1.031, 1.3]}>
        <boxGeometry args={[9, 0.004, 0.02]} />
        <meshBasicMaterial color={accent} transparent opacity={0.55} />
      </mesh>
    </group>
  );
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

/*
 * The other eleven are not rendered, and that is a decision, not an omission.
 *
 * They used to sit in a box off to the left the camera never visited. Moving
 * them to flank the twelfth seat felt like the fix — you would catch them in
 * your periphery when you turned your head. A frustum check said otherwise:
 * 0 of 11 on every tab, every frame.
 *
 * The lens cannot be argued with. This canvas is 0.461 aspect, which buys about
 * 22° of horizontal view, so anything visible has to be roughly five times
 * further forward than it is sideways. A person in the next seat is sideways at
 * zero depth. You would have to turn 90° to see them, and no gaze here does.
 *
 * Which is the truth of the room anyway: you do not see the jury beside you,
 * and in this game they were never going to look back. Eleven invisible figures
 * are eleven figures of cost on a phone for nothing, so they are gone and the
 * rail does the work of saying where you are sitting. You are the jury of one.
 * You never see the other eleven.
 */

interface SceneProps {
  activeCase: ClientCase;
  tab: DossierTab;
  examinedEvidence: string | null;
  onSelectEvidence: (id: string) => void;
  focusedWitness: number;
}

interface InnerSceneProps extends SceneProps {
  reducedMotion: boolean;
}

function hashName(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h % 200);
}

/**
 * Faces for everyone who is not on trial.
 *
 * Derived from the seed rather than sent by the server: only the defendant's
 * appearance is a measured variable. Everyone else just needs to not be a
 * clone of the person beside them.
 */
function appearanceForSeed(seed: number): number {
  const x = Math.sin(seed * 57.13) * 9371.7;
  return (x - Math.floor(x)) * 100;
}

function Scene({
  activeCase,
  tab,
  examinedEvidence,
  onSelectEvidence,
  focusedWitness,
  reducedMotion,
}: InnerSceneProps) {
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

      <CameraRig tab={tab} reducedMotion={reducedMotion} />
      <Room accent={accent} />
      <JuryRail accent={accent} />

      {/* The accused. Stands where the light is worst.
          `appearance` shapes this face and is uncorrelated with guilt — if it
          moves your verdict, appearance_bias is already counting. */}
      <Figure
        seed={activeCase.defendant.portraitSeed}
        appearance={activeCase.defendant.appearance}
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
          appearance={appearanceForSeed(hashName(w.name))}
          posture={i === focusedWitness ? 'testifying' : 'standing'}
          position={i === focusedWitness ? [1.5, 0.9, -0.4] : [2.6, 0, 0.6]}
          rotation={[0, i === focusedWitness ? -0.5 : -0.9, 0]}
          accent={accent}
          focused={tab === 'witnesses' && i === focusedWitness}
          scale={i === focusedWitness ? 1 : 0.95}
        />
      ))}

      {/* Prosecution and defence, flanking the accused and talking past him.

          They used to stand at x=±1.15, z=-1.15, which put them ±21.6° off
          centre — outside a frame that is only ±11.6° wide on a portrait phone.
          Both of them were cut off, in the old floating camera as well as this
          one, on the one tab that exists to show them. Nobody noticed because a
          3D scene that renders is assumed to render the right thing.

          Pulled in to ±9.8° and set behind the defendant, which frames him
          between the two people arguing about him. */}
      <Figure
        seed={hashName(`${activeCase.id}-prosecution`)}
        appearance={appearanceForSeed(hashName(`${activeCase.id}-prosecution`))}
        posture="arguing"
        position={[-COUNSEL_X, 0, -1.6]}
        rotation={[0, 0.5, 0]}
        accent={accent}
        focused={tab === 'arguments'}
      />
      <Figure
        seed={hashName(`${activeCase.id}-defence`)}
        appearance={appearanceForSeed(hashName(`${activeCase.id}-defence`))}
        posture="arguing"
        position={[COUNSEL_X, 0, -1.6]}
        rotation={[0, -0.5, 0]}
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
  // Read outside the Canvas: hooks inside r3f's tree run on its own renderer,
  // and this is a React Native accessibility API, not a three.js concern.
  const reducedMotion = useReducedMotion();

  return (
    <Canvas
      shadows
      camera={{ position: HEAD, fov: GAZES.defendant.fov, near: 0.1, far: 40 }}
      gl={{ antialias: true }}
      style={{ flex: 1 }}
    >
      <color attach="background" args={['#0D0D0D']} />
      <Scene {...props} reducedMotion={reducedMotion} />
    </Canvas>
  );
}
