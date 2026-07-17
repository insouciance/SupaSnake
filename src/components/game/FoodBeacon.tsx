'use client';

/**
 * FoodBeacon - a single clean voxel block in the dynasty accent.
 *
 * Design language: emissive glow over void, hard edges. The food is one
 * crisp cube with a gentle emissive breathe - no rings, beams, or bobbing
 * (the old beacon dressing fought the board's quiet). Feedback on eat
 * stays with CollectEffect; this is just the objective, sitting solid on
 * the grid like the snake voxels it feeds.
 *
 * Per-frame work: one scale write (spawn pop) + one emissive write. No
 * allocations.
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface FoodBeaconProps {
  /** Food position */
  position: [number, number, number];
  /** Dynasty accent color */
  color?: string;
  /** Spawn time for animation */
  spawnTime?: number;
}

/** Voxel edge length - reads as a food pellet against 0.82-0.9 snake voxels */
const BLOCK_SIZE = 0.55;
/** Resting emissive level, breathing +/-15% */
const EMISSIVE_BASE = 0.8;

export function FoodBeacon({
  position,
  color = '#22d3ee',
  spawnTime = 0,
}: FoodBeaconProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    const age = time - spawnTime;

    // Spawn pop (elastic scale-in, simplified from the old beacon)
    const spawnDuration = 0.3;
    let spawnScale = 1;
    if (age >= 0 && age < spawnDuration) {
      const t = age / spawnDuration;
      spawnScale = 1 - Math.pow(1 - t, 3) * Math.cos(t * Math.PI * 2);
    }
    if (meshRef.current) {
      meshRef.current.scale.setScalar(spawnScale);
    }

    // Gentle emissive breathe (+/-15%)
    if (materialRef.current) {
      materialRef.current.emissiveIntensity =
        EMISSIVE_BASE * (1 + Math.sin(time * 2.2) * 0.15);
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={[position[0], BLOCK_SIZE / 2 + 0.02, position[2]]}
      castShadow
    >
      <boxGeometry args={[BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE]} />
      <meshStandardMaterial
        ref={materialRef}
        color={color}
        emissive={color}
        emissiveIntensity={EMISSIVE_BASE}
        metalness={0.4}
        roughness={0.35}
      />
    </mesh>
  );
}

export default FoodBeacon;
