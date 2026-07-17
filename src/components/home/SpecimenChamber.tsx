'use client';

/**
 * SpecimenChamber - the home screen's living backdrop.
 *
 * A full-viewport R3F scene presenting the player's equipped snake as an
 * iconic character: hero-scaled voxel specimen, center-low in frame at a
 * three-quarter angle, idling with a gentle sine undulation inside a dark
 * void. A faint grid floor fades into fog (the arena's language, far
 * subtler) and the camera drifts on a slow lissajous path.
 *
 * Performance / correctness contract:
 * - Reuses the game's snake geometry + material machinery from
 *   SnakeModel.tsx (read-only: shared materials are cloned once per
 *   dynasty+role into a module cache, never mutated).
 * - Zero allocations in useFrame: base pose, camera vectors and grid
 *   buffers are precomputed once at module scope.
 * - dpr clamped to [1, 1.75], no shadows, antialias off (emissive glow
 *   carries the look), low-power GPU preference.
 * - Render loop pauses when the tab is hidden (frameloop -> 'never');
 *   under prefers-reduced-motion the scene renders a static composed pose
 *   (frameloop 'demand', no drift, no undulation).
 */

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { DynastyId } from '@/shared/types/game';
import {
  SNAKE_MODEL_URL,
  getSnakeGeometries,
  getSnakeSegmentMaterial,
  HEAD_SIZE,
  BODY_SIZE,
} from '@/components/game/SnakeModel';

// -----------------------------------------------------------------------------
// Look constants
// -----------------------------------------------------------------------------

/** Bright per-dynasty glow used for the key/rim lights (DB primaries are too
 *  dark for the void - same values the home UI uses for dynasty glow). */
const DYNASTY_GLOW: Record<DynastyId, string> = {
  CYBER: '#00FFFF',
  PRIMAL: '#86efac',
  COSMIC: '#a855f7',
};

const VOID_COLOR = '#06090d';

/** Specimen body plan */
const SEGMENT_COUNT = 9;
const SEGMENT_SPACING = 0.9;
const BODY_Y = 0.42;
const HEAD_LIFT = 0.34;
const NECK_LIFT = 0.14;
const HEAD_YAW = 0.55; // three-quarter turn toward the viewer

/** Camera framing: character center-low, target above the specimen */
const CAMERA_BASE = new THREE.Vector3(0, 2.1, 6.3);
const CAMERA_TARGET = new THREE.Vector3(0, 1.35, 0);
/** Lissajous drift: +/-2% of camera distance, ~20s period */
const DRIFT_AMPLITUDE = CAMERA_BASE.length() * 0.02;
const DRIFT_W1 = (2 * Math.PI) / 20;
const DRIFT_W2 = (2 * Math.PI) / 26;

// -----------------------------------------------------------------------------
// Base pose - serpentine S-curve receding from the camera, computed once
// -----------------------------------------------------------------------------

function buildBasePose(): [number, number, number][] {
  const points: [number, number, number][] = [];
  let x = 0;
  let z = 0;
  let heading = -Math.PI / 2; // recede straight back (-z) from the head
  for (let i = 0; i < SEGMENT_COUNT; i++) {
    points.push([x, BODY_Y, z]);
    heading += 0.45 * Math.sin(i * 0.75 + 0.6); // alternating curvature
    x += Math.cos(heading) * SEGMENT_SPACING;
    z += Math.sin(heading) * SEGMENT_SPACING;
  }
  // Center laterally; bias forward so the head sits nearest the camera
  const cx = points.reduce((s, p) => s + p[0], 0) / SEGMENT_COUNT;
  for (const p of points) {
    p[0] -= cx;
    p[2] += 1.7;
  }
  // Head raised and alert, neck following
  points[0][1] += HEAD_LIFT;
  points[1][1] += NECK_LIFT;
  return points;
}

const BASE_POSE = buildBasePose();

// -----------------------------------------------------------------------------
// Materials / geometry - shared caches, no per-render allocation
// -----------------------------------------------------------------------------

/** Hero-boosted clones of the game's shared segment materials. The game's
 *  cache is never mutated; one clone per dynasty+role lives here. */
const heroMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

function getHeroMaterial(
  dynasty: DynastyId,
  isHead: boolean
): THREE.MeshStandardMaterial {
  const key = `${dynasty}:${isHead ? 'head' : 'body'}`;
  let material = heroMaterialCache.get(key);
  if (!material) {
    material = getSnakeSegmentMaterial(dynasty, isHead).clone();
    // Antialias is off; emissive presence carries the character
    material.emissiveIntensity = isHead ? 0.95 : 0.6;
    heroMaterialCache.set(key, material);
  }
  return material;
}

/** Procedural stand-in while (or in case) the GLB streams in. */
const fallbackBoxGeometry = new THREE.BoxGeometry(1, 1, 1);

// -----------------------------------------------------------------------------
// Scene pieces
// -----------------------------------------------------------------------------

interface SpecimenBodyProps {
  dynasty: DynastyId;
  animate: boolean;
  headGeometry?: THREE.BufferGeometry;
  bodyGeometry?: THREE.BufferGeometry;
}

/** The character. Idle = sine undulation traveling down the body
 *  (per-segment phase offset, position-only) + subtle head sway. */
function SpecimenBody({
  dynasty,
  animate,
  headGeometry,
  bodyGeometry,
}: SpecimenBodyProps) {
  const meshRefs = useRef<(THREE.Mesh | null)[]>(
    Array.from({ length: SEGMENT_COUNT }, () => null)
  );

  useFrame(({ clock }) => {
    if (!animate) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const mesh = meshRefs.current[i];
      if (!mesh) continue;
      const base = BASE_POSE[i];
      mesh.position.x = base[0] + Math.sin(t * 1.1 - i * 0.62) * 0.055;
      mesh.position.y = base[1] + Math.sin(t * 0.8 - i * 0.5) * 0.028;
      mesh.position.z = base[2];
    }
    const head = meshRefs.current[0];
    if (head) {
      head.rotation.y = HEAD_YAW + Math.sin(t * 0.45) * 0.1;
      head.rotation.x = Math.sin(t * 0.62) * 0.05;
    }
  });

  return (
    // Slight group yaw completes the three-quarter presentation
    <group rotation={[0, -0.3, 0]}>
      {BASE_POSE.map(([x, y, z], i) => {
        const isHead = i === 0;
        return (
          <mesh
            key={i}
            ref={(mesh) => {
              meshRefs.current[i] = mesh;
            }}
            position={[x, y, z]}
            rotation={isHead ? [0, HEAD_YAW, 0] : undefined}
            scale={isHead ? HEAD_SIZE : BODY_SIZE}
            geometry={(isHead ? headGeometry : bodyGeometry) ?? fallbackBoxGeometry}
            material={getHeroMaterial(dynasty, isHead)}
          />
        );
      })}
    </group>
  );
}

/** GLB-backed specimen; suspends while the voxel model loads. */
function VoxelSpecimen(props: Omit<SpecimenBodyProps, 'headGeometry' | 'bodyGeometry'>) {
  const { scene } = useGLTF(SNAKE_MODEL_URL);
  const { head, body } = getSnakeGeometries(scene);
  return (
    <SpecimenBody
      {...props}
      headGeometry={head ?? undefined}
      bodyGeometry={body ?? undefined}
    />
  );
}

/** Slow lissajous camera drift; static under reduced motion. */
function CameraRig({ animate }: { animate: boolean }) {
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    camera.position.copy(CAMERA_BASE);
    camera.lookAt(CAMERA_TARGET);
  }, [camera]);

  useFrame(({ clock }) => {
    if (!animate) return;
    const t = clock.elapsedTime;
    camera.position.x = CAMERA_BASE.x + Math.sin(t * DRIFT_W1) * DRIFT_AMPLITUDE;
    camera.position.y =
      CAMERA_BASE.y + Math.sin(t * DRIFT_W2 + 1.3) * DRIFT_AMPLITUDE * 0.6;
    camera.lookAt(CAMERA_TARGET);
  });

  return null;
}

/** Dark void lighting: dynasty key + rim, soft neutral fill. */
function ChamberLights({ dynasty }: { dynasty: DynastyId }) {
  const glow = DYNASTY_GLOW[dynasty];
  return (
    <>
      <ambientLight intensity={0.22} color="#2b3b4d" />
      {/* Key: dynasty-colored, front-high */}
      <directionalLight position={[4, 6, 5]} intensity={1.15} color={glow} />
      {/* Rim: stronger, from behind for the silhouette edge */}
      <directionalLight position={[-6, 3.5, -4]} intensity={1.9} color={glow} />
      {/* Fill: soft neutral so the dark side keeps form */}
      <pointLight position={[-3, 2, 4.5]} intensity={9} color="#94a3b8" decay={1.6} />
    </>
  );
}

/** Faint grid floor fading into fog - the arena's language, far subtler. */
function FloorGrid() {
  const positions = useMemo(() => {
    const half = 14;
    const pts: number[] = [];
    for (let i = -half; i <= half; i++) {
      pts.push(i, 0, -half, i, 0, half);
      pts.push(-half, 0, i, half, 0, i);
    }
    return new Float32Array(pts);
  }, []);

  return (
    <group>
      <mesh position={[0, -0.06, 0]}>
        <boxGeometry args={[60, 0.1, 60]} />
        <meshStandardMaterial color="#0a0f15" metalness={0.3} roughness={0.7} />
      </mesh>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#2b3b4d" transparent opacity={0.22} />
      </lineSegments>
    </group>
  );
}

// -----------------------------------------------------------------------------
// Chamber
// -----------------------------------------------------------------------------

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return reduced;
}

export interface SpecimenChamberProps {
  /** Dynasty of the equipped snake (CYBER specimen for fresh visitors). */
  dynasty: DynastyId;
  /** Fired once the WebGL scene is live - drives the page's 600ms fade-in. */
  onReady?: () => void;
}

export function SpecimenChamber({ dynasty, onReady }: SpecimenChamberProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [hidden, setHidden] = useState(false);

  // Pause the render loop entirely while the tab is hidden
  useEffect(() => {
    const sync = () => setHidden(document.hidden);
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  const animate = !reducedMotion;
  const frameloop = hidden ? 'never' : reducedMotion ? 'demand' : 'always';

  return (
    <Canvas
      frameloop={frameloop}
      dpr={[1, 1.75]}
      gl={{ antialias: false, alpha: false, powerPreference: 'low-power' }}
      camera={{ fov: 38, near: 0.1, far: 40 }}
      onCreated={() => onReady?.()}
    >
      <color attach="background" args={[VOID_COLOR]} />
      <fog attach="fog" args={[VOID_COLOR, 7.5, 17]} />
      <CameraRig animate={animate} />
      <ChamberLights dynasty={dynasty} />
      <FloorGrid />
      <Suspense fallback={<SpecimenBody dynasty={dynasty} animate={animate} />}>
        <VoxelSpecimen dynasty={dynasty} animate={animate} />
      </Suspense>
    </Canvas>
  );
}

export default SpecimenChamber;
