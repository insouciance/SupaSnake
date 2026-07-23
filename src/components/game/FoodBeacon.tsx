'use client';

/**
 * FoodBeacon - premium nested pickup: a hot emissive core inside a slowly
 * counter-tumbling additive wireframe shell.
 *
 * Design language: the core (0.34 cube, emissive 1.6) is the bloom
 * emitter - a bright jewel over the void; the wireframe cage (0.6 cube)
 * gives it presence and motion without fighting the board's quiet. Reads
 * categorically different from the exit portal's champagne beam: food is
 * a CONTAINED glow, extraction is a COLUMN of light.
 *
 * Cost: 2 draw calls. Geometries live at module scope; materials are
 * cached per color (bounded set: dynasty accents + COSMIC glyph colors).
 * Per-frame work: scale writes (spawn pop), two rotation writes, one
 * emissive write. No allocations, no React state.
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface FoodBeaconProps {
  /** Food position */
  position: [number, number, number];
  /** Dynasty accent color (or COSMIC constellation glyph color) */
  color?: string;
  /** Visual-only scale; released default remains 1. */
  visualScale?: number;
}

/** Inner core - the bloom emitter */
const CORE_SIZE = 0.34;
const CORE_EMISSIVE = 1.6;
/** Outer wireframe cage */
const SHELL_SIZE = 0.6;
/** Rest height of the nested pair's center */
const CENTER_Y = SHELL_SIZE / 2 + 0.06;
/** Spawn pop duration (elastic overshoot) */
const SPAWN_DURATION = 0.45;

// --- Module-scope shared geometry (never disposed) ---
const coreGeometry = new THREE.BoxGeometry(CORE_SIZE, CORE_SIZE, CORE_SIZE);
const shellGeometry = new THREE.BoxGeometry(SHELL_SIZE, SHELL_SIZE, SHELL_SIZE);

// --- Per-color material caches (bounded: 3 accents + 3 glyph colors) ---
const coreMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
const shellMaterialCache = new Map<string, THREE.MeshBasicMaterial>();

function getCoreMaterial(color: string): THREE.MeshStandardMaterial {
  let material = coreMaterialCache.get(color);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: CORE_EMISSIVE,
      metalness: 0.3,
      roughness: 0.3,
    });
    coreMaterialCache.set(color, material);
  }
  return material;
}

function getShellMaterial(color: string): THREE.MeshBasicMaterial {
  let material = shellMaterialCache.get(color);
  if (!material) {
    // Modest opacity: thin additive wireframe lines scintillate when too
    // bright at small pixel sizes - dimmer + steady beats brighter + fizzy
    material = new THREE.MeshBasicMaterial({
      color,
      wireframe: true,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    shellMaterialCache.set(color, material);
  }
  return material;
}

export function FoodBeacon({
  position,
  color = '#22d3ee',
  visualScale = 1,
}: FoodBeaconProps) {
  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const shellRef = useRef<THREE.Mesh>(null);
  // Spawn tracking: re-pop whenever the food moves to a new cell (the
  // component instance persists across spawns)
  const lastXRef = useRef(position[0]);
  const lastZRef = useRef(position[2]);
  const spawnAtRef = useRef<number | null>(null);

  const coreMaterial = getCoreMaterial(color);
  const shellMaterial = getShellMaterial(color);

  useFrame(({ clock }, delta) => {
    const time = clock.getElapsedTime();
    if (
      spawnAtRef.current === null ||
      lastXRef.current !== position[0] ||
      lastZRef.current !== position[2]
    ) {
      lastXRef.current = position[0];
      lastZRef.current = position[2];
      spawnAtRef.current = time;
    }
    const age = time - spawnAtRef.current;

    // Elastic spawn pop - bigger overshoot than the old beacon so a new
    // objective announces itself across the board
    let spawnScale = 1;
    if (age >= 0 && age < SPAWN_DURATION) {
      const t = age / SPAWN_DURATION;
      spawnScale = 1 - Math.pow(1 - t, 3) * Math.cos(t * Math.PI * 2.5) * 1.35;
      if (spawnScale < 0.001) spawnScale = 0.001;
    }
    if (groupRef.current) {
      groupRef.current.scale.setScalar(spawnScale * visualScale);
    }

    // Core: slow tumble one way + emissive breathe (idempotent time-based
    // write - shared material, every instance writes the same value)
    if (coreRef.current) {
      coreRef.current.rotation.y += delta * 0.9;
      coreRef.current.rotation.x += delta * 0.35;
    }
    coreMaterial.emissiveIntensity =
      CORE_EMISSIVE * (1 + Math.sin(time * 2.2) * 0.15);

    // Shell: counter-tumble (opposite handedness, slower)
    if (shellRef.current) {
      shellRef.current.rotation.y -= delta * 0.5;
      shellRef.current.rotation.z += delta * 0.3;
    }
  });

  return (
    <group ref={groupRef} position={[position[0], CENTER_Y, position[2]]}>
      <mesh ref={coreRef} geometry={coreGeometry} material={coreMaterial} castShadow />
      <mesh ref={shellRef} geometry={shellGeometry} material={shellMaterial} />
    </group>
  );
}

export default FoodBeacon;
