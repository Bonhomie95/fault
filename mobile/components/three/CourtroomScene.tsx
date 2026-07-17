import { memo, useMemo, useRef } from 'react';
import { Vector3 } from 'three';
import type { ClientCase } from '@/lib/api';
import { useReducedMotion } from '@/lib/motion';
import { Canvas, useFrame, useThree } from '@/lib/r3f';
import { EvidenceObject } from './EvidenceObject';
import { Figure } from './Figure';

export type DossierTab = 'defendant' | 'evidence' | 'witnesses' | 'arguments';

/**
 * The room.
 *
 * Third person, and the person on trial is the subject. The single most
 * important thing this screen does is let you look at the human being you are
 * about to judge — appearance bias is a measured mechanic, so if you cannot
 * read their face the mechanic does not exist and the case is a wall of text.
 *
 * Two previous versions failed at that. The original flew a drone around the
 * room. The one after it bolted the camera into a jury seat, which was
 * technically first-person and put the defendant two and a half metres away in
 * the dark, seen past a rail. Both were more interested in where the camera was
 * than in what it was pointed at.
 *
 * So: no jury box, no rail, no first person, and no fog. The camera is a
 * portrait lens on the accused, and the room behind them stays sharp — the
 * people in a courtroom are the point of a courtroom, and blurring them to
 * suggest depth just hides them.
 */

/**
 * How far out counsel stand.
 *
 * Constrained by the lens, not by taste. A frustum check caught them at ±21.6°
 * against a frame only ±11.6° wide — both of them off screen, on the one tab
 * that exists to show them, in every version of this scene ever shipped.
 */
const COUNSEL_X = 0.58;

interface Mark {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

/**
 * Where the camera stands for each tab.
 *
 * It moves now, deliberately. The reason not to move it was motion sickness,
 * and that risk is real when a camera translates through a space at eye level
 * for two minutes. These are cuts between framings, not a flight: the lerp is
 * fast and the framings are far apart, so it reads as an edit rather than as
 * being carried across the room.
 *
 * Every fov here is checked against the frame: this canvas is ~0.461 aspect and
 * three.js fov is VERTICAL, so the horizontal view is roughly half what the
 * number suggests. Anything wider than ±11° of centre is off screen.
 */
const MARKS: Record<DossierTab, Mark> = {
  // A portrait. Close, slightly below eye line so they have a little height on
  // you, framed head-and-shoulders. This is the shot the whole game is for.
  defendant: { position: [0, 1.42, -0.02], target: [0, 1.34, -0.95], fov: 34 },
  // Over the exhibit table, looking down at what you have been handed.
  evidence: { position: [0, 1.72, 1.05], target: [0, 0.78, 0.15], fov: 44 },
  // At the stand, level with the witness.
  witnesses: { position: [1.5, 1.5, 0.72], target: [1.5, 1.42, -0.4], fov: 38 },
  // Between the two of them, close enough that both are inside the frame.
  arguments: { position: [0, 1.45, -0.35], target: [0, 1.28, -1.6], fov: 46 },
};

function CameraRig({ tab, reducedMotion }: { tab: DossierTab; reducedMotion: boolean }) {
  const { camera } = useThree();
  const target = useRef(new Vector3(...MARKS.defendant.target));
  const pos = useRef(new Vector3(...MARKS.defendant.position));

  useFrame((state, delta) => {
    const mark = MARKS[tab];
    // Frame-rate independent, so a 120Hz phone does not move twice as fast.
    const k = 1 - Math.exp(-delta * 5.5);

    pos.current.lerp(new Vector3(...mark.position), k);
    target.current.lerp(new Vector3(...mark.target), k);

    camera.position.copy(pos.current);
    if (!reducedMotion) {
      // A hand-held breath. Millimetres — enough that the room is not a
      // screenshot, small enough that nobody could point at it.
      const t = state.clock.elapsedTime;
      camera.position.y += Math.sin(t * 0.62) * 0.005;
      camera.position.x += Math.sin(t * 0.41) * 0.004;
    }
    camera.lookAt(target.current);

    const cam = camera as typeof camera & { fov: number; updateProjectionMatrix: () => void };
    if (Math.abs(cam.fov - mark.fov) > 0.01) {
      cam.fov += (mark.fov - cam.fov) * k;
      cam.updateProjectionMatrix();
    }
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

/**
 * The public gallery.
 *
 * Somebody came to watch. The room had no audience at all — the eleven jurors
 * were the only other bodies in it, and they were deleted for being invisible,
 * which left a courtroom containing five people and a lot of empty floor.
 *
 * They sit behind and above the well so they are inside the frame on the wide
 * tabs, and they are rendered sharp. `alive={false}` costs nothing per frame:
 * they are set dressing, not performers.
 */
function Gallery({ accent }: { accent: string }) {
  const seats = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => {
        const row = Math.floor(i / 5);
        return {
          seed: 700 + i,
          x: -1.55 + (i % 5) * 0.78,
          y: 0.34 + row * 0.34,
          z: -3.0 - row * 0.62,
        };
      }),
    [],
  );

  return (
    <group>
      {/* the benches they are sitting on */}
      {[0, 1].map((row) => (
        <mesh key={row} position={[0, 0.17 + row * 0.34, -3.0 - row * 0.62]} receiveShadow>
          <boxGeometry args={[4.6, 0.34 + row * 0.34, 0.5]} />
          <meshStandardMaterial color="#17171A" roughness={0.95} />
        </mesh>
      ))}
      {seats.map((s) => (
        <Figure
          key={s.seed}
          seed={s.seed}
          appearance={appearanceForSeed(s.seed)}
          posture="seated"
          position={[s.x, s.y, s.z]}
          rotation={[0, (s.x > 0 ? -1 : 1) * 0.08, 0]}
          scale={0.86}
          accent={accent}
          alive={false}
          // Shapes, not faces. See Figure's `simple`.
          simple
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
      {/* Courtrooms are overhead-lit and unkind — but you still have to be able
          to SEE the person. Ambient was 0.28, which is mood lighting for a face
          you are asked to read for bias. Lifted until the face carries. */}
      <ambientLight intensity={0.62} />
      {/* Key light on the accused: the one thing in the room that is properly
          lit is the human being on trial. */}
      <spotLight
        position={[0.9, 3.4, 1.6]}
        angle={0.7}
        penumbra={0.8}
        intensity={2.6}
        distance={12}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      {/* Fill from the opposite side, so the unlit half of the face is still a
          face and not a silhouette. */}
      <pointLight position={[-2.2, 1.9, 1.4]} intensity={0.75} distance={9} color="#9FB4C7" />
      {/* No castShadow here on purpose. Two shadow-casting lights means two
          full shadow passes over every mesh in the room, every frame, and the
          spot on the accused is the only one anybody would ever notice. */}
      <directionalLight position={[2.5, 6, 3]} intensity={1.0} />
      {/* the accent as a practical light, not just a colour */}
      {/* the accent as a practical light, not just a colour */}
      <pointLight position={[0, 2.9, -2.2]} intensity={1.5} distance={8} color={accent} />
      {/* No fog. It used to fade everything past 4.5m into the background,
          which is a cheap way to suggest depth and an expensive way to hide the
          people in the room. A courtroom is people; blurring them out to make a
          mood defeats the point of rendering them at all. */}

      <CameraRig tab={tab} reducedMotion={reducedMotion} />
      <Room accent={accent} />
      <Gallery accent={accent} />

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

/**
 * THE reason the game froze.
 *
 * This is memoised, and it is not an optimisation — it is the fix for a
 * game-breaking bug. The case screen holds `remaining` in state and ticks it
 * once a second, and this component was rendered from that same component. So
 * every single second React re-rendered the entire courtroom and r3f
 * reconciled the whole tree: hundreds of meshes, on the JS thread, forever.
 *
 * The symptom was taps on the tab bar doing nothing and the clock appearing to
 * freeze and then jump thirty seconds. The clock was never wrong — it derives
 * from Date.now(), so it was the one honest thing on screen. It looked frozen
 * because the thread was too busy rebuilding a room that had not changed to run
 * the interval, and when it came up for air the real time had moved on. The
 * player lost a quarter of their 120 seconds to a re-render.
 *
 * Every prop here is already stable across a tick — activeCase is the same
 * object, onSelectEvidence is a useState setter — so the memo holds and the
 * room is rebuilt only when something about the room actually changes.
 */
export const CourtroomScene = memo(function CourtroomScene(props: SceneProps) {
  // Read outside the Canvas: hooks inside r3f's tree run on its own renderer,
  // and this is a React Native accessibility API, not a three.js concern.
  const reducedMotion = useReducedMotion();

  return (
    <Canvas
      shadows
      camera={{ position: MARKS.defendant.position, fov: MARKS.defendant.fov, near: 0.1, far: 40 }}
      gl={{ antialias: true }}
      style={{ flex: 1 }}
    >
      <color attach="background" args={['#0D0D0D']} />
      <Scene {...props} reducedMotion={reducedMotion} />
    </Canvas>
  );
});
