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

/** Settled-interior energy. The renderer uses one categorical head/interior
 * step instead of an index gradient, so a stationary coil does not carry a
 * moving brightness wave and the tail never becomes the least legible part. */
export const ENERGY_MIN = 0.88;

// -----------------------------------------------------------------------------
// The trail (WP-3.07) - pure per-segment shape, unit-tested in SnakeModel.test
// -----------------------------------------------------------------------------

/**
 * Cell footprint by fusion level, in GRID UNITS (a cell is 1.0 wide).
 *
 * This is the whole "fusion is earned" ruling made visible. See
 * `src/lib/game/trailFusion.ts` for the metric itself.
 *
 *   0 - running free: a 0.38 gap on every side, unmistakably discrete voxels
 *   1 - fusing at the edges: a 0.20 gap, cells reading as neighbours
 *   2 - fully fused: a 0.04 hairline, so the field reads solid while the grid
 *       stays countable - the player must still be able to tell WHICH tiles
 *       are blocked, which is the trail's first job.
 *
 * The old flat BODY_SIZE (0.75) sits between levels 0 and 1, so a snake that
 * is packing averagely looks about like it always did.
 *
 * A NOTE ON CORNERS, because it was nearly "fixed" by mistake. Mid-tick through
 * a turn two cells compress well inside 1.0 apart, so at 0.96 their boxes
 * INTERPENETRATE. That is not the rendering defect it looks like on paper:
 * intersecting opaque solids of the same material render as a clean union,
 * because their surfaces meet at an angle rather than sharing a depth. The
 * control render that isolated the real defect (the joint links, now deleted)
 * had this exact overlap and came back clean. Coplanar is the condition that
 * breaks; overlapping is not.
 */
export const TRAIL_FOOTPRINT: readonly number[] = [0.62, 0.8, 0.96];

export function getTrailFootprint(level: number): number {
  if (level <= 0) return TRAIL_FOOTPRINT[0];
  if (level >= TRAIL_FOOTPRINT.length - 1) {
    return TRAIL_FOOTPRINT[TRAIL_FOOTPRINT.length - 1];
  }
  return TRAIL_FOOTPRINT[level];
}

/**
 * Brightness multiplier by fusion level. Level 2 is "fully fused and
 * brightest"; a cell you left behind that is now unfillable is the dark seam.
 *
 * Kept modest and above zero at level 0: this is a readout, not a punishment,
 * and the segments must stay legible however badly you are packing. The top of
 * the range is bounded by the instanced body's albedo trim (x0.75) so even a
 * fully fused trunk stays under the bloom threshold - a blooming trunk is a
 * flicker amplifier in motion, which is why that trim exists.
 */
export const TRAIL_TONE: readonly number[] = [0.8, 0.94, 1.1];

export function getTrailTone(level: number): number {
  if (level <= 0) return TRAIL_TONE[0];
  if (level >= TRAIL_TONE.length - 1) return TRAIL_TONE[TRAIL_TONE.length - 1];
  return TRAIL_TONE[level];
}

/**
 * Height zones. Boxes are drawn BASE-ON-FLOOR (y = height / 2), matching
 * TerrainBlocks' convention.
 *
 * Pass 1 of the design: the head zone is a creature, the trail is what it
 * leaves behind. So the first TRAIL_HEAD_ZONE body segments stand tall and
 * ease down into a low, settled stack - Tetris's landed pieces. The trunk is
 * deliberately LOWER than a solid terrain block (0.72, TerrainBlocks.tsx), so
 * the two never compete for the same read: terrain is a raised wall that never
 * moves again, the trail is a low field that answers how you are playing.
 *
 * Nothing flattens to nothing. A zero-height segment forfeits its cast shadow,
 * and the shadow is a real occupancy cue.
 *
 * THE TRUNK IS A CUBE, NOT A PLATE (fixed 2026-07-28, from the owner's first
 * play of the shipped trail: *"not all sides of the cubes/segments are
 * visible"*). It was 0.42 against a footprint of up to 0.96 — barely two fifths
 * as tall as it was wide, so the body read as a flat ribbon and its side faces
 * had almost no screen area to be seen in. "Take quiet from height, not from
 * brightness" was the right instruction and this took it too far: the shipped
 * body was a uniform 0.75 cube, and the trunk needs to stay near that or the
 * step down from the head stops being a step and becomes a collapse.
 *
 * 0.58 preserves the OTHER constraint this file commits to and tests: the
 * trunk stays categorically below a 0.72 solid terrain cell, so terrain reads
 * as a raised wall and the trail as a settled field. The trunk is 0.58 against
 * a footprint of 0.62 when unfused, which remains cubic where it matters; at
 * 0.96 when fully fused it becomes the broad packed field the design asks for.
 * Head and tail are unchanged; the flatness was the trunk.
 */
export const TRAIL_HEAD_ZONE = 5;
export const TRAIL_HEIGHT_HEAD = 0.86;
export const TRAIL_HEIGHT_TRUNK = 0.58;
export const TRAIL_HEIGHT_TAIL = 0.26;

/**
 * The tail zone encodes IMMINENT VACANCY, and it is denominated in TICKS, not
 * in segments - the owner's wording, and it matters: what a player needs is
 * "that tile frees up in two moves", which a segment count only answers by
 * accident. The engine pops exactly one tail cell per tick, so segment `index`
 * of a body of length `length` vacates in `length - index` ticks.
 *
 * 4 ticks is roughly half a second at CYBER's floor and about a second at
 * PRIMAL's opening speed: long enough to route through, short enough that the
 * cue is a commitment rather than a suggestion.
 *
 * The approximation this makes, stated: on a tick where the snake eats, the
 * tail does not pop and every countdown is one tick pessimistic for one tick.
 * Under-promising vacancy is the safe direction to be wrong in.
 */
export const TRAIL_VACANCY_TICKS = 4;

/**
 * Per-segment height. Pure and allocation-free - called per segment per frame.
 *
 * Where the head zone and the vacancy zone overlap (a short snake), the lower
 * of the two wins: a segment that is both near the head and about to vacate is
 * about to vacate, and that is the more urgent thing to say.
 */
export function getTrailHeight(index: number, length: number): number {
  if (length <= 1) return TRAIL_HEIGHT_HEAD;

  // Head zone: ease from the tall head down into the settled stack.
  let height = TRAIL_HEIGHT_TRUNK;
  if (index <= TRAIL_HEAD_ZONE) {
    const t = index / TRAIL_HEAD_ZONE;
    const s = t * t * (3 - 2 * t); // smoothstep
    height = TRAIL_HEIGHT_HEAD - (TRAIL_HEIGHT_HEAD - TRAIL_HEIGHT_TRUNK) * s;
  }

  // Vacancy zone: sink toward the floor as the cell's countdown runs out.
  const ticksToVacancy = length - index;
  if (ticksToVacancy <= TRAIL_VACANCY_TICKS) {
    const t =
      TRAIL_VACANCY_TICKS <= 1
        ? 1
        : (TRAIL_VACANCY_TICKS - ticksToVacancy) / (TRAIL_VACANCY_TICKS - 1);
    const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
    const sinking =
      TRAIL_HEIGHT_TRUNK - (TRAIL_HEIGHT_TRUNK - TRAIL_HEIGHT_TAIL) * clamped;
    if (sinking < height) height = sinking;
  }

  return height;
}

/**
 * Head-zone breathing: a slow pulse travelling down the first few segments so
 * the creature end reads as alive while the trail behind it stays perfectly
 * still.
 *
 * Returns a HEIGHT multiplier, never a vertical offset - the base stays planted
 * on the floor, so the cast shadow and the "which tile is blocked" read are
 * both untouched. Amplitude decays to exactly 1.0 at the end of the head zone,
 * which is what preserves this file's standing promise that the trunk is steady
 * frame to frame.
 */
export const TRAIL_BREATHE_AMPLITUDE = 0.07;
export const TRAIL_BREATHE_HZ = 1.35;
/** Phase lag per segment (radians), so the pulse travels tail-ward instead of
 *  the whole head zone throbbing in unison. */
export const TRAIL_BREATHE_LAG = 0.85;

export function getTrailBreathe(index: number, elapsedSeconds: number): number {
  if (index <= 0 || index > TRAIL_HEAD_ZONE) return 1;
  const decay = 1 - index / TRAIL_HEAD_ZONE;
  const phase =
    elapsedSeconds * TRAIL_BREATHE_HZ * Math.PI * 2 - index * TRAIL_BREATHE_LAG;
  return 1 + TRAIL_BREATHE_AMPLITUDE * decay * Math.sin(phase);
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
