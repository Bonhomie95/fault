import { useMemo, useRef } from 'react';
import type { Group } from 'three';
import { useFrame } from '@/lib/r3f';

/**
 * A physical exhibit on the table.
 *
 * GDD 5.1 — "It should feel slightly uncomfortable, like handling evidence."
 * So evidence is an object, not a list item: it has thickness, it catches the
 * light, and it turns over when you pick it up. What kind of object it is gets
 * inferred from the description, because a bank record and a knife should not
 * be the same rectangle.
 */

export type ExhibitKind = 'document' | 'photo' | 'phone' | 'physical' | 'recording';

interface EvidenceObjectProps {
  description: string;
  index: number;
  accent: string;
  selected: boolean;
  /** Rises and turns to face the juror when examined. */
  examined: boolean;
  position: [number, number, number];
  onSelect: () => void;
}

/** The exhibit's form follows what it actually is. */
export function inferKind(description: string): ExhibitKind {
  const d = description.toLowerCase();
  if (/photo|camera|footage|video|cctv|body-cam|body cam/.test(d)) return 'photo';
  if (/phone|message|text|call|sms|whatsapp/.test(d)) return 'phone';
  if (/recording|audio|tape|voice/.test(d)) return 'recording';
  if (/ledger|record|report|policy|transfer|bank|statement|document|note|coursework|paper/.test(d))
    return 'document';
  return 'physical';
}

export function EvidenceObject({
  description,
  index,
  accent,
  selected,
  examined,
  position,
  onSelect,
}: EvidenceObjectProps) {
  const group = useRef<Group>(null);
  const kind = useMemo(() => inferKind(description), [description]);

  useFrame((state, delta) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;

    // Examined evidence lifts off the table and turns toward you.
    const targetY = examined ? position[1] + 0.42 : position[1];
    const targetRotX = examined ? -0.5 : -Math.PI / 2 + 0.06;
    const targetRotY = examined ? t * 0.35 : index * 0.12 - 0.12;

    group.current.position.y += (targetY - group.current.position.y) * Math.min(1, delta * 6);
    group.current.rotation.x += (targetRotX - group.current.rotation.x) * Math.min(1, delta * 6);
    group.current.rotation.y += (targetRotY - group.current.rotation.y) * Math.min(1, delta * 4);

    const targetScale = selected ? 1.08 : 1;
    const s = group.current.scale.x + (targetScale - group.current.scale.x) * Math.min(1, delta * 8);
    group.current.scale.setScalar(s);
  });

  const tint = selected ? accent : '#C9C3B6';

  return (
    <group
      ref={group}
      position={position}
      rotation={[-Math.PI / 2 + 0.06, 0, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {kind === 'document' && (
        <>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.34, 0.46, 0.006]} />
            <meshStandardMaterial color={tint} roughness={0.95} />
          </mesh>
          {/* typed lines — legible as texture, not as text */}
          {[0.14, 0.08, 0.02, -0.04, -0.1].map((y, i) => (
            <mesh key={i} position={[-0.02, y, 0.004]}>
              <planeGeometry args={[i % 3 === 2 ? 0.14 : 0.24, 0.012]} />
              <meshBasicMaterial color="#6B6558" />
            </mesh>
          ))}
        </>
      )}

      {kind === 'photo' && (
        <>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.38, 0.3, 0.006]} />
            <meshStandardMaterial color="#EDE8DE" roughness={0.6} />
          </mesh>
          {/* the image itself: never resolvable, always suggestive */}
          <mesh position={[0, 0.02, 0.004]}>
            <planeGeometry args={[0.33, 0.21]} />
            <meshBasicMaterial color={selected ? accent : '#33332E'} />
          </mesh>
        </>
      )}

      {kind === 'phone' && (
        <>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.2, 0.4, 0.02]} />
            <meshStandardMaterial color="#141412" roughness={0.35} metalness={0.5} />
          </mesh>
          <mesh position={[0, 0, 0.012]}>
            <planeGeometry args={[0.17, 0.34]} />
            <meshBasicMaterial color={selected ? accent : '#2A2A26'} />
          </mesh>
        </>
      )}

      {kind === 'recording' && (
        <mesh castShadow receiveShadow rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.16, 0.16, 0.05, 24]} />
          <meshStandardMaterial color={tint} roughness={0.5} metalness={0.3} />
        </mesh>
      )}

      {kind === 'physical' && (
        <mesh castShadow receiveShadow>
          {/* bagged and tagged */}
          <boxGeometry args={[0.3, 0.36, 0.07]} />
          <meshStandardMaterial color={tint} roughness={0.3} transparent opacity={0.62} />
        </mesh>
      )}

      {/* the exhibit tag — sticky-note marker in the case accent (GDD 5.1) */}
      <mesh position={[0.13, 0.2, 0.012]} rotation={[0, 0, 0.18]}>
        <planeGeometry args={[0.09, 0.06]} />
        <meshBasicMaterial color={accent} />
      </mesh>
    </group>
  );
}
