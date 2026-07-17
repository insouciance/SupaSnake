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
const SEGMENT_COUNT = 10;
/** Segment scale is deliberately small with spacing > scale: distinct voxel
 *  cubes with visible gaps are what makes it read as a SNAKE, not a wall. */
const SPECIMEN_BODY_SCALE = 0.5;
const SPECIMEN_HEAD_SCALE = 0.66;
const SEGMENT_SPACING = 0.68;
const BODY_Y = 0.26;
const HEAD_LIFT = 0.3;
const NECK_LIFT = 0.12;
const HEAD_YAW = 0.5; // three-quarter turn toward the viewer

/** Lissajous drift: +/-2% of camera distance, ~20s period */
const DRIFT_W1 = (2 * Math.PI) / 20;
const DRIFT_W2 = (2 * Math.PI) / 26;
/** Camera elevation + three-quarter azimuth (radians) */
const CAMERA_ELEVATION = 0.46; // ~26 degrees above the specimen plane
const CAMERA_AZIMUTH = 0.32; // slight three-quarter offset
/** Fit margin: bounding radius is padded so the whole coil breathes */
const FIT_MARGIN = 1.45;

// -----------------------------------------------------------------------------
// Base pose - a coiled serpentine S the eye instantly parses as a snake:
// two pronounced bends, compact footprint, head lifted toward the camera.
// Computed once at module scope.
// -----------------------------------------------------------------------------

function buildBasePose(): [number, number, number][] {
  const points: [number, number, number][] = [];
  let x = 0;
  let z = 0;
  let heading = -Math.PI / 2; // recede straight back (-z) from the head
  for (let i = 0; i < SEGMENT_COUNT; i++) {
    points.push([x, BODY_Y, z]);
    // Strong alternating curvature = clearly visible S-coil
    heading += 0.78 * Math.sin(i * 0.92 + 0.4);
    x += Math.cos(heading) * SEGMENT_SPACING;
    z += Math.sin(heading) * SEGMENT_SPACING;
  }
  // Center on the coil's centroid (both axes) so framing math is exact
  const cx = points.reduce((s, p) => s + p[0], 0) / SEGMENT_COUNT;
  const cz = points.reduce((s, p) => s + p[2], 0) / SEGMENT_COUNT;
  for (const p of points) {
    p[0] -= cx;
    p[2] -= cz;
  }
  // Head raised and alert, neck following
  points[0][1] += HEAD_LIFT;
  points[1][1] += NECK_LIFT;
  return points;
}

const BASE_POSE = buildBasePose();

/** Bounding sphere of the pose (segment extents included) for camera fit. */
const POSE_BOUNDS = (() => {
  const center = new THREE.Vector3();
  for (const [x, y, z] of BASE_POSE) center.add(new THREE.Vector3(x, y, z));
  center.divideScalar(SEGMENT_COUNT);
  let radius = 0;
  for (const [x, y, z] of BASE_POSE) {
    radius = Math.max(radius, center.distanceTo(new THREE.Vector3(x, y, z)));
  }
  return { center, radius: radius + SPECIMEN_HEAD_SCALE };
})();

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
    // Emissive stays LOW so the key/rim lights shade the cube faces -
    // full-blast emissive renders every face identically and the form
    // collapses into a flat silhouette.
    material.emissiveIntensity = isHead ? 0.45 : 0.28;
    heroMaterialCache.set(key, material);
  }
  return material;
}

/** Procedural stand-in while (or in case) the GLB streams in. */
const fallbackBoxGeometry = new THREE.BoxGeometry(1, 1, 1);

/** Eye geometry/materials - shared across renders. */
const eyeGeometry = new THREE.BoxGeometry(1, 1, 1);
const eyeDarkMaterial = new THREE.MeshBasicMaterial({ color: '#06090d' });
const eyeGlintMaterial = new THREE.MeshBasicMaterial({ color: '#e6edf3' });

/**
 * Eyes on the head's camera-facing side - the single strongest "this is a
 * creature, not a box" signal. Positions are in head-local space (the head
 * is yawed toward the viewer); parenting to the head mesh means the idle
 * sway carries them naturally.
 */
function SpecimenEyes() {
  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.22, 0.16, 0.51]}>
          <mesh geometry={eyeGeometry} material={eyeDarkMaterial} scale={0.16} />
          <mesh
            geometry={eyeGeometry}
            material={eyeGlintMaterial}
            scale={0.055}
            position={[0.035, 0.04, 0.045]}
          />
        </group>
      ))}
    </group>
  );
}

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
    <group>
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
            scale={isHead ? SPECIMEN_HEAD_SCALE : SPECIMEN_BODY_SCALE}
            geometry={(isHead ? headGeometry : bodyGeometry) ?? fallbackBoxGeometry}
            material={getHeroMaterial(dynasty, isHead)}
          >
            {isHead && <SpecimenEyes />}
          </mesh>
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

/** Aspect-aware framing + slow lissajous drift.
 *  The camera distance is computed from the pose's bounding sphere against
 *  BOTH the vertical and horizontal fov, so the whole specimen is always
 *  fully in frame - portrait phones included. Recomputes on resize only. */
function CameraRig({ animate }: { animate: boolean }) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const baseRef = useRef(new THREE.Vector3());

  useEffect(() => {
    const persp = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    const vFov = THREE.MathUtils.degToRad(persp.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const limiting = Math.min(vFov, hFov);
    const distance =
      (POSE_BOUNDS.radius * FIT_MARGIN) / Math.tan(limiting / 2);

    const dir = new THREE.Vector3(
      Math.sin(CAMERA_AZIMUTH) * Math.cos(CAMERA_ELEVATION),
      Math.sin(CAMERA_ELEVATION),
      Math.cos(CAMERA_AZIMUTH) * Math.cos(CAMERA_ELEVATION)
    );
    baseRef.current.copy(POSE_BOUNDS.center).addScaledVector(dir, distance);
    camera.position.copy(baseRef.current);
    camera.lookAt(POSE_BOUNDS.center);
  }, [camera, size.width, size.height]);

  useFrame(({ clock }) => {
    if (!animate) return;
    const t = clock.elapsedTime;
    const base = baseRef.current;
    const amplitude = base.length() * 0.02;
    camera.position.x = base.x + Math.sin(t * DRIFT_W1) * amplitude;
    camera.position.y = base.y + Math.sin(t * DRIFT_W2 + 1.3) * amplitude * 0.6;
    camera.position.z = base.z;
    camera.lookAt(POSE_BOUNDS.center);
  });

  return null;
}

/** Dark void lighting: dynasty key + rim, soft neutral fill. */
function ChamberLights({ dynasty }: { dynasty: DynastyId }) {
  const glow = DYNASTY_GLOW[dynasty];
  return (
    <>
      <ambientLight intensity={0.16} color="#2b3b4d" />
      {/* Key: dynasty-colored, front-high-right - shapes the top faces */}
      <directionalLight position={[3.5, 5, 4]} intensity={1.5} color={glow} />
      {/* Rim: from behind-left for the silhouette edge */}
      <directionalLight position={[-5, 2.5, -4]} intensity={2.1} color={glow} />
      {/* Cool neutral fill from the off side keeps the dark faces readable
          without flattening the key/rim contrast */}
      <directionalLight position={[-4, 1.5, 5]} intensity={0.35} color="#94a3b8" />
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
