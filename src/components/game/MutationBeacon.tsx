'use client';

/**
 * MutationBeacon - the mutation food pickup (Design v2 section 5.1).
 *
 * Design language mirrors FoodBeacon/ExitPortal: emissive voxels over the
 * void, hard edges, no per-frame allocations. The beacon reads as a slow-
 * pulsing violet double helix - two small counter-orbiting voxels around a
 * dim core - unmistakable from food (single accent cube) and the portal
 * (cyan doorway). Violet is deliberately outside every dynasty accent.
 *
 * Urgency: below URGENT_TICKS of its 40-tick life the pulse accelerates,
 * mirroring ExitPortal's closing-window language.
 *
 * Per-frame work: one group rotation write, two orbit position writes, two
 * emissive writes. No allocations.
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface MutationBeaconProps {
  /** Beacon position (cell-centered x/z, y ignored) */
  position: [number, number, number];
  /** Ticks until the beacon despawns (drives the urgency pulse) */
  ticksRemaining: number;
}

/** Violet pulse family - outside all dynasty accents */
const HELIX_COLOR = '#a855f7';
const CORE_COLOR = '#7c3aed';
/** Orbiting helix voxel size + orbit radius */
const HELIX_SIZE = 0.22;
const ORBIT_RADIUS = 0.28;
/** Core voxel size */
const CORE_SIZE = 0.34;
/** Resting emissive level */
const EMISSIVE_BASE = 0.9;
/** Below this many ticks the pulse goes urgent */
const URGENT_TICKS = 15;

export function MutationBeacon({ position, ticksRemaining }: MutationBeaconProps) {
  const groupRef = useRef<THREE.Group>(null);
  const helixARef = useRef<THREE.Mesh>(null);
  const helixBRef = useRef<THREE.Mesh>(null);
  const helixMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const coreMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const spawnTimeRef = useRef<number | null>(null);

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    if (spawnTimeRef.current === null) {
      spawnTimeRef.current = time;
    }
    const age = time - spawnTimeRef.current;

    // Spawn pop (same elastic scale-in as FoodBeacon)
    const spawnDuration = 0.3;
    let spawnScale = 1;
    if (age >= 0 && age < spawnDuration) {
      const t = age / spawnDuration;
      spawnScale = 1 - Math.pow(1 - t, 3) * Math.cos(t * Math.PI * 2);
    }
    if (groupRef.current) {
      groupRef.current.scale.setScalar(spawnScale);
      groupRef.current.rotation.y = time * 1.6;
    }

    // Double-helix orbit: two voxels opposite each other, weaving in height
    const bob = Math.sin(time * 2.4) * 0.14;
    if (helixARef.current) {
      helixARef.current.position.set(ORBIT_RADIUS, 0.42 + bob, 0);
    }
    if (helixBRef.current) {
      helixBRef.current.position.set(-ORBIT_RADIUS, 0.42 - bob, 0);
    }

    // Slow violet pulse; urgent flicker when the despawn window closes
    const urgent = ticksRemaining > 0 && ticksRemaining < URGENT_TICKS;
    const pulseHz = urgent ? 8 : 1.8;
    const pulseDepth = urgent ? 0.5 : 0.25;
    const emissive = EMISSIVE_BASE * (1 + Math.sin(time * pulseHz) * pulseDepth);
    if (helixMaterialRef.current) {
      helixMaterialRef.current.emissiveIntensity = emissive;
    }
    if (coreMaterialRef.current) {
      coreMaterialRef.current.emissiveIntensity = emissive * 0.7;
    }
  });

  return (
    <group ref={groupRef} position={[position[0], 0, position[2]]}>
      {/* Dim core voxel */}
      <mesh position={[0, CORE_SIZE / 2 + 0.02, 0]} castShadow>
        <boxGeometry args={[CORE_SIZE, CORE_SIZE, CORE_SIZE]} />
        <meshStandardMaterial
          ref={coreMaterialRef}
          color={CORE_COLOR}
          emissive={CORE_COLOR}
          emissiveIntensity={EMISSIVE_BASE * 0.7}
          metalness={0.4}
          roughness={0.4}
        />
      </mesh>
      {/* Orbiting helix voxels (share one material - one uniform update) */}
      <mesh ref={helixARef}>
        <boxGeometry args={[HELIX_SIZE, HELIX_SIZE, HELIX_SIZE]} />
        <meshStandardMaterial
          ref={helixMaterialRef}
          color={HELIX_COLOR}
          emissive={HELIX_COLOR}
          emissiveIntensity={EMISSIVE_BASE}
          metalness={0.3}
          roughness={0.3}
        />
      </mesh>
      <mesh ref={helixBRef}>
        <boxGeometry args={[HELIX_SIZE, HELIX_SIZE, HELIX_SIZE]} />
        <meshStandardMaterial
          color={HELIX_COLOR}
          emissive={HELIX_COLOR}
          emissiveIntensity={EMISSIVE_BASE}
          metalness={0.3}
          roughness={0.3}
        />
      </mesh>
    </group>
  );
}

export default MutationBeacon;
