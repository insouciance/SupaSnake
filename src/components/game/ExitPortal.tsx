'use client';

/**
 * ExitPortal - the extraction banking exit tile.
 *
 * Design language mirrors FoodBeacon: one emissive voxel over the void,
 * hard edges, zero per-frame allocations. The portal reads as a doorway
 * rather than a pickup: a flat cyan-white pad with a slim upright frame,
 * breathing brighter than food (it is the run's biggest decision).
 *
 * Urgency: while exitTicksRemaining is above URGENT_TICKS the emissive
 * breathes slowly; below it the pulse accelerates and deepens so the
 * closing window is legible at a glance without any UI text.
 *
 * Per-frame work: one scale write (spawn pop) + two emissive writes.
 * No allocations.
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface ExitPortalProps {
  /** Portal position (cell-centered x/z, y ignored) */
  position: [number, number, number];
  /** Ticks until the portal despawns (drives the urgency pulse) */
  ticksRemaining: number;
}

/** Pad footprint - slightly wider than the food voxel, flat like a hatch */
const PAD_SIZE = 0.8;
const PAD_HEIGHT = 0.12;
/** Upright frame */
const FRAME_WIDTH = 0.9;
const FRAME_HEIGHT = 1.1;
const FRAME_THICKNESS = 0.08;
/** Resting emissive level */
const EMISSIVE_BASE = 1.0;
/** Below this many ticks the pulse goes urgent */
const URGENT_TICKS = 30;
/** Portal identity color - cyan-white, deliberately outside dynasty accents */
const PORTAL_COLOR = '#7df9ff';

export function ExitPortal({ position, ticksRemaining }: ExitPortalProps) {
  const groupRef = useRef<THREE.Group>(null);
  const padMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const frameMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const spawnTimeRef = useRef<number | null>(null);

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    if (spawnTimeRef.current === null) {
      spawnTimeRef.current = time;
    }
    const age = time - spawnTimeRef.current;

    // Spawn pop (same elastic scale-in as FoodBeacon)
    const spawnDuration = 0.35;
    let spawnScale = 1;
    if (age >= 0 && age < spawnDuration) {
      const t = age / spawnDuration;
      spawnScale = 1 - Math.pow(1 - t, 3) * Math.cos(t * Math.PI * 2);
    }
    if (groupRef.current) {
      groupRef.current.scale.setScalar(spawnScale);
    }

    // Breathe: calm while open, fast + deep when the window is closing
    const urgent = ticksRemaining > 0 && ticksRemaining < URGENT_TICKS;
    const pulseHz = urgent ? 9 : 2.6;
    const pulseDepth = urgent ? 0.45 : 0.18;
    const emissive = EMISSIVE_BASE * (1 + Math.sin(time * pulseHz) * pulseDepth);
    if (padMaterialRef.current) {
      padMaterialRef.current.emissiveIntensity = emissive;
    }
    if (frameMaterialRef.current) {
      frameMaterialRef.current.emissiveIntensity = emissive * 0.8;
    }
  });

  return (
    <group ref={groupRef} position={[position[0], 0, position[2]]}>
      {/* Landing pad - the actual collision cell */}
      <mesh position={[0, PAD_HEIGHT / 2 + 0.02, 0]} castShadow>
        <boxGeometry args={[PAD_SIZE, PAD_HEIGHT, PAD_SIZE]} />
        <meshStandardMaterial
          ref={padMaterialRef}
          color={PORTAL_COLOR}
          emissive={PORTAL_COLOR}
          emissiveIntensity={EMISSIVE_BASE}
          metalness={0.3}
          roughness={0.25}
        />
      </mesh>
      {/* Upright doorway frame (visual only) */}
      <mesh position={[0, FRAME_HEIGHT / 2 + PAD_HEIGHT, 0]}>
        <boxGeometry args={[FRAME_WIDTH, FRAME_HEIGHT, FRAME_THICKNESS]} />
        <meshStandardMaterial
          ref={frameMaterialRef}
          color="#ffffff"
          emissive={PORTAL_COLOR}
          emissiveIntensity={EMISSIVE_BASE * 0.8}
          metalness={0.2}
          roughness={0.3}
          transparent
          opacity={0.65}
        />
      </mesh>
    </group>
  );
}

export default ExitPortal;
