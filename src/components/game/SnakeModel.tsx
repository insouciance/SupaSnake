'use client';

/**
 * Snake voxel model - renders one snake segment (head or body) using the
 * geometry from assets/3D/snake_voxel.glb.
 *
 * Performance / correctness contract:
 * - The GLB is loaded once via drei's useGLTF cache and NEVER mutated.
 *   Geometry is cloned exactly once per loaded scene (WeakMap cache) and
 *   shared by every segment mesh.
 * - Materials are built per dynasty + role (head/body) and cached at module
 *   level, so ~100 segments share 2 material instances.
 * - No per-frame allocations: this component allocates nothing after the
 *   first render for a given (scene, dynasty, role) combination.
 *
 * LOD note: snake_voxel_lod1/lod2.glb exist but ship POSITION-only vertex
 * data (no NORMAL attribute), which shades incorrectly under our lit
 * MeshStandardMaterial. The base mesh is a 24-vertex cube, so even ~100
 * segments stay under ~2.5k vertices - LOD switching would cost more than
 * it saves. We intentionally use the base mesh only.
 */

import { useMemo, type Ref } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { DynastyId } from '@/shared/types/game';
import { themeManager } from '@/lib/theme/ThemeManager';

export const SNAKE_MODEL_URL = '/assets/3D/snake_voxel.glb';

/** Head is clearly larger than body segments (grid cell = 1 unit); the
 *  head/body gap makes the creature read head-first at a glance. 0.75 is
 *  the eye-comfort compromise: enough gap for head primacy, small enough
 *  that inter-segment gaps don't strobe (accordion) through curves. */
export const HEAD_SIZE = 0.9;
export const BODY_SIZE = 0.75;

/** Tail taper: the last TAPER_SEGMENTS body segments ease (smoothstep)
 *  from full trunk scale down to TAPER_MIN at the tail tip, so the snake
 *  reads as a creature with a tail instead of a train of boxes. */
export const TAPER_SEGMENTS = 6;
export const TAPER_MIN = 0.85;

/**
 * Per-segment scale multiplier (applied on top of BODY_SIZE).
 *
 * Pure and allocation-free - called per segment per frame by the
 * instanced renderer. The head (index 0) and the trunk stay at 1.0;
 * the final TAPER_SEGMENTS indices smoothstep down to TAPER_MIN at the
 * tail tip. Short snakes clamp the taper window to the available body
 * (the head is never tapered, and no segment ever drops below TAPER_MIN).
 */
export function getSegmentScale(index: number, length: number): number {
  if (index <= 0 || length <= 1) return 1;
  const taperStart = Math.max(1, length - TAPER_SEGMENTS);
  if (index < taperStart) return 1;
  const t = (index - taperStart + 1) / (length - taperStart);
  const s = t * t * (3 - 2 * t); // smoothstep
  return 1 - (1 - TAPER_MIN) * s;
}

/** Energy falloff: the head + first ENERGY_FULL_SEGMENTS body segments
 *  carry the identity at full glow; behind them the trunk's emissive
 *  energy eases down to ENERGY_MIN at the tail. Eye-comfort measure: a
 *  long snake reads as ONE calm body with a bright front, instead of a
 *  chain of equally-hot pieces shimmering in motion. */
export const ENERGY_FULL_SEGMENTS = 3;
export const ENERGY_MIN = 0.55;

/**
 * Per-segment energy multiplier (1.0 near the head -> ENERGY_MIN at the
 * tail tip, smoothstepped). Pure and allocation-free; applied to the
 * instanced body's per-instance color so both emissive and albedo cool
 * toward the tail. Never below ENERGY_MIN, never above 1.
 */
export function getSegmentEnergy(index: number, length: number): number {
  if (index <= ENERGY_FULL_SEGMENTS || length <= ENERGY_FULL_SEGMENTS + 1) {
    return 1;
  }
  const t = (index - ENERGY_FULL_SEGMENTS) / (length - 1 - ENERGY_FULL_SEGMENTS);
  const s = t * t * (3 - 2 * t); // smoothstep
  return 1 - (1 - ENERGY_MIN) * s;
}

/** Head glows brighter than the body for at-a-glance orientation. Crisper
 *  emissive presence against the darker arena floor (#0b1016). */
export const HEAD_EMISSIVE_INTENSITY = 0.7;
export const BODY_EMISSIVE_INTENSITY = 0.45;

/** Base color sits slightly toward the void so the emissive reads as the
 *  identity (glow over void, not painted plastic). */
export const BASE_COLOR_SCALE = 0.85;

export interface SnakeSegmentMeshProps {
  position: [number, number, number];
  isHead: boolean;
  dynasty: DynastyId;
  /** Optional ref to the rendered mesh (for external animation). */
  meshRef?: Ref<THREE.Mesh>;
}

/**
 * Extract + normalize geometry from the GLTF scene, cached per scene object
 * so the clone happens once no matter how many segments render.
 */
const geometryCache = new WeakMap<
  THREE.Object3D,
  { head: THREE.BufferGeometry | null; body: THREE.BufferGeometry | null }
>();

function findMeshGeometry(
  scene: THREE.Object3D,
  name: string
): THREE.BufferGeometry | null {
  let found: THREE.BufferGeometry | null = null;
  scene.traverse((child) => {
    if (!found && child.name === name && (child as THREE.Mesh).isMesh) {
      found = (child as THREE.Mesh).geometry;
    }
  });
  return found;
}

/**
 * Clone the source geometry (never mutate the GLTF cache), center it on the
 * origin, and scale it to a unit cube so callers size it via mesh scale.
 */
function toUnitGeometry(
  source: THREE.BufferGeometry | null
): THREE.BufferGeometry | null {
  if (!source) return null;
  const geometry = source.clone();
  geometry.center();
  geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  geometry.boundingBox!.getSize(size);
  const maxDimension = Math.max(size.x, size.y, size.z);
  if (maxDimension > 0) {
    const s = 1 / maxDimension;
    geometry.scale(s, s, s);
  }
  return geometry;
}

export function getSnakeGeometries(scene: THREE.Object3D): {
  head: THREE.BufferGeometry | null;
  body: THREE.BufferGeometry | null;
} {
  let cached = geometryCache.get(scene);
  if (!cached) {
    cached = {
      head: toUnitGeometry(findMeshGeometry(scene, 'snake_head')),
      body: toUnitGeometry(findMeshGeometry(scene, 'snake_segment_1')),
    };
    geometryCache.set(scene, cached);
  }
  return cached;
}

/**
 * Per-dynasty materials, shared across all segments. Dynasty theme colors
 * are static, so module-level memoization is safe.
 */
const materialCache = new Map<string, THREE.MeshStandardMaterial>();

export function getSnakeSegmentMaterial(
  dynasty: DynastyId,
  isHead: boolean
): THREE.MeshStandardMaterial {
  const key = `${dynasty}:${isHead ? 'head' : 'body'}`;
  let material = materialCache.get(key);
  if (!material) {
    const theme = themeManager.getTheme(dynasty);
    material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(theme.primary).multiplyScalar(BASE_COLOR_SCALE),
      emissive: new THREE.Color(theme.secondary),
      emissiveIntensity: isHead
        ? HEAD_EMISSIVE_INTENSITY
        : BODY_EMISSIVE_INTENSITY,
      // Head keeps a glossy premium finish; the BODY is deliberately matte
      // (low metalness, higher roughness) so moving lights never race
      // specular glints down the trunk - the segment-shimmer eye-comfort fix
      metalness: isHead ? 0.5 : 0.2,
      roughness: isHead ? 0.3 : 0.55,
    });
    materialCache.set(key, material);
  }
  return material;
}

/** Shared unit box used as fallback while (or in case) the GLB is unavailable. */
const unitBoxGeometry = new THREE.BoxGeometry(1, 1, 1);

/**
 * Voxel snake segment. Suspends while the GLB loads - wrap in <Suspense>
 * with <SnakeSegmentFallback> so gameplay never blocks on asset load.
 */
export function SnakeModel({
  position,
  isHead,
  dynasty,
  meshRef,
}: SnakeSegmentMeshProps) {
  const { scene } = useGLTF(SNAKE_MODEL_URL);

  const geometry = useMemo(() => {
    const { head, body } = getSnakeGeometries(scene);
    return (isHead ? head : body) ?? unitBoxGeometry;
  }, [scene, isHead]);

  const material = useMemo(
    () => getSnakeSegmentMaterial(dynasty, isHead),
    [dynasty, isHead]
  );

  return (
    <mesh
      ref={meshRef}
      position={position}
      scale={isHead ? HEAD_SIZE : BODY_SIZE}
      geometry={geometry}
      material={material}
      castShadow
    />
  );
}

/**
 * Instant procedural stand-in rendered while the GLB streams in. Uses the
 * same shared per-dynasty materials so the swap is visually seamless.
 */
export function SnakeSegmentFallback({
  position,
  isHead,
  dynasty,
  meshRef,
}: SnakeSegmentMeshProps) {
  const material = useMemo(
    () => getSnakeSegmentMaterial(dynasty, isHead),
    [dynasty, isHead]
  );

  return (
    <mesh
      ref={meshRef}
      position={position}
      scale={isHead ? HEAD_SIZE : BODY_SIZE}
      geometry={unitBoxGeometry}
      material={material}
      castShadow
    />
  );
}

useGLTF.preload(SNAKE_MODEL_URL);
