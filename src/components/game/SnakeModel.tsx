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

/** Head is slightly larger than body segments (grid cell = 1 unit). */
export const HEAD_SIZE = 0.9;
export const BODY_SIZE = 0.85;

/** Head glows brighter than the body for at-a-glance orientation. */
export const HEAD_EMISSIVE_INTENSITY = 0.6;
export const BODY_EMISSIVE_INTENSITY = 0.4;

export interface SnakeSegmentMeshProps {
  position: [number, number, number];
  isHead: boolean;
  dynasty: DynastyId;
  /** Ref from useInterpolatedMesh - attached to the rendered mesh. */
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
      color: new THREE.Color(theme.primary),
      emissive: new THREE.Color(theme.secondary),
      emissiveIntensity: isHead
        ? HEAD_EMISSIVE_INTENSITY
        : BODY_EMISSIVE_INTENSITY,
      metalness: 0.5,
      roughness: 0.3,
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
