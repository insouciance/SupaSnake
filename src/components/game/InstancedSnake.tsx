'use client';

/**
 * InstancedSnake - the whole snake in two draw calls.
 *
 * Body = ONE InstancedMesh (DynamicDrawUsage, frustumCulled off, instance
 * count written per frame straight from the interpolation buffer - growth
 * never touches React). Head = its own mesh with voxel eyes (the
 * SpecimenChamber "this is a creature" signal brought onto the board) and
 * a damped yaw that leans into turns instead of snapping.
 *
 * THE TRAIL (WP-3.07). The body is no longer a train of equal boxes. Three
 * things are being said at once, on three separate channels:
 *
 *   HEIGHT     - the head zone stands tall and breathes; the middle settles
 *                into a low, still stack (Tetris's landed pieces); the last
 *                few cells sink as their vacancy countdown runs out. The
 *                vacancy cue is denominated in TICKS-until-free, because
 *                "that tile opens in two moves" is the thing a player plans
 *                around and a segment count only answers it by accident.
 *   FOOTPRINT  - how much of its cell a segment claims, driven by the EARNED
 *                fusion metric (src/lib/game/trailFusion.ts): 0 neighbours =
 *                discrete voxels with visible gaps, 2 = a solid field with a
 *                hairline seam. A cell you left behind that is now unfillable
 *                shows as a dark gap in an otherwise solid mass.
 *   BRIGHTNESS - fusion only. Deliberately NOT the index falloff it used to
 *                be: dimming the tail made the cells about to free up the
 *                hardest to see, which is backwards on gameplay grounds.
 *
 * One instance per body cell plus one oriented LINK per joint, all in the same
 * InstancedMesh - the per-instance quaternion and non-uniform scale were both
 * sitting unused, so the continuous form costs no new draw call and no new
 * allocation. Corners need no cap instance: the corner cell's own box is the
 * cap, which is why TRAIL_LINK_WIDTH is strictly below 1.
 *
 * Fluidity contract:
 * - Positions come from the tick-alpha interpolation buffer every frame:
 *   exact blend between the last two authoritative engine states. The trail
 *   is NEVER snapped to the grid - 5-10 Hz is the worst flicker band there is,
 *   and the head/trail junction would gap a full cell every tick.
 * - ZERO per-frame allocations: all scratch objects (Vector3/Quaternion/
 *   Matrix4) live at module scope; the loop only writes. The fusion metric's
 *   working set is preallocated typed arrays in a ref.
 * - No React state anywhere in the render loop; segment growth shows up
 *   purely as a larger `mesh.count` next frame.
 * - The fusion metric is folded ONCE PER ENGINE TICK, not per frame: it is
 *   defined on integer grid cells and cannot change in between.
 * - Geometry comes from the shared GLB WeakMap cache and materials from
 *   the shared per-dynasty Map cache in SnakeModel.tsx - nothing new is
 *   created per mount beyond the InstancedMesh itself.
 *
 * The GLB Suspense fallback (InstancedSnakeFallback) shares this exact
 * Core with unit-box geometry, so the streaming swap changes shading only,
 * never structure or behavior.
 */

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { DynastyId } from '@/shared/types/game';
import type { Direction } from '@/lib/game/SnakeGameLogic';
import type { TerrainBlock } from '@/shared/game/terrain';
import { GAME_CONFIG } from '@/shared/config/game';
import { STRAINS, type StrainId } from '@/shared/game/strains';
import {
  getAlpha,
  getInterpolatedX,
  getInterpolatedZ,
  INTERPOLATION_CAPACITY,
  type InterpolationBuffer,
} from '@/lib/game/interpolationBuffer';
import {
  createTrailFusionState,
  resetTrailFusion,
  updateTrailFusion,
  type TrailFusionState,
} from '@/lib/game/trailFusion';
import { FLOOR_CLEARANCE } from './ArenaFloor';
import {
  HEAD_SIZE,
  SNAKE_MODEL_URL,
  TRAIL_LINK_HEIGHT,
  TRAIL_LINK_WIDTH,
  getSegmentEnergy,
  getSegmentScale,
  getSnakeGeometries,
  getSnakeSegmentMaterial,
  getTrailBreathe,
  getTrailFootprint,
  getTrailHeight,
  getTrailTone,
} from './SnakeModel';

export interface InstancedSnakeProps {
  /** The tick-alpha interpolation buffer ref (owned by the game page). */
  bufferRef: { readonly current: InterpolationBuffer | null };
  dynasty: DynastyId;
  /** Committed heading - drives the head's damped yaw. */
  direction: Direction;
  /** One strain band per held gene; colors reuse the existing instances. */
  strainBands?: readonly StrainId[];
  /**
   * The arena's terrain. SOLID blocks count as packing neighbours for the
   * fusion metric - a coil pressed against hardened terrain has genuinely
   * spent less of the board than the same coil floating in open space, and
   * without this the metric pays out for coiling in the middle, which is bad
   * play. Forming blocks are crossable decals and do not count.
   */
  terrain?: readonly TerrainBlock[];
  /**
   * True while the arena edges are a PASSAGE rather than a wall (COSMIC's
   * open flux phase). Walls normally count as packing neighbours; an open
   * edge must not, or the metric rewards hugging the one seam that is not
   * actually spending any space.
   */
  wrapActive?: boolean;
}

// -----------------------------------------------------------------------------
// Module-scope scratch + shared assets: the render loop allocates NOTHING
// -----------------------------------------------------------------------------

const _position = new THREE.Vector3();
const _scale = new THREE.Vector3();
/** Cell boxes never rotate; joint links do (see _linkQuaternion). */
const _identityQuaternion = new THREE.Quaternion();
const _linkQuaternion = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _matrix = new THREE.Matrix4();
const _energyColor = new THREE.Color();

const GRID_SIZE = GAME_CONFIG.board.gridSize;

/**
 * Instance budget: one box per body cell, so at most `segments - 1` for a snake
 * that has filled the whole board. Bounding the emission is not optional - the
 * alternative is silently dropping the tail of a 400-cell snake, which is
 * exactly the length at which the trail matters most.
 *
 * It was twice this while a second box was emitted per JOINT. That pass is
 * deleted (see `writeTrailInstances`), so the headroom went with it rather than
 * being left behind as a number nobody could explain.
 */
const TRAIL_INSTANCE_CAPACITY = INTERPOLATION_CAPACITY;

/**
 * Instanced-body material per dynasty: a clone of the shared body material
 * with two eye-comfort adjustments -
 * 1. albedo trimmed so the moving trunk sits safely UNDER the bloom
 *    threshold (only head/food/portal/glow strips may bloom; a blooming
 *    trunk is a flicker amplifier in motion), and
 * 2. an emissive shader patch that multiplies emissive by the per-instance
 *    color, so the trail's tone (getTrailTone x getSegmentEnergy) drives BOTH
 *    albedo and glow. The trunk itself is otherwise perfectly steady: no
 *    time-varying material writes on body segments, ever.
 */
const instancedBodyMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

function getInstancedBodyMaterial(dynasty: DynastyId): THREE.MeshStandardMaterial {
  let material = instancedBodyMaterialCache.get(dynasty);
  if (!material) {
    material = getSnakeSegmentMaterial(dynasty, false).clone();
    material.color.multiplyScalar(0.75);
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n' +
          '#ifdef USE_INSTANCING_COLOR\n' +
          '\ttotalEmissiveRadiance *= vColor;\n' +
          '#endif'
      );
    };
    instancedBodyMaterialCache.set(dynasty, material);
  }
  return material;
}

/** Shared unit box for the pre-GLB fallback (same idea as SnakeModel's). */
const unitBoxGeometry = new THREE.BoxGeometry(1, 1, 1);

/** Eye pieces - the SpecimenChamber pattern, shared across mounts. */
const eyeGeometry = new THREE.BoxGeometry(1, 1, 1);
const eyeDarkMaterial = new THREE.MeshBasicMaterial({ color: '#06090d' });
const eyeGlintMaterial = new THREE.MeshBasicMaterial({ color: '#e6edf3' });

/**
 * Yaw that points the head's face (+Z local: the eyes' side) along each
 * grid heading. rotation.y = t maps local +Z to (sin t, 0, cos t).
 */
const HEAD_FACE_YAW: Record<Direction, number> = {
  UP: Math.PI, // -Z
  DOWN: 0, // +Z
  LEFT: -Math.PI / 2, // -X
  RIGHT: Math.PI / 2, // +X
};

const TWO_PI = Math.PI * 2;

/** Damping rate for the head yaw (higher = snappier). */
const YAW_DAMP = 14;

/**
 * Write one segment's colour into `_energyColor`: fusion tone (the earned
 * signal) times the gentle head-primacy falloff. Module scope so the render
 * loop never builds a closure.
 */
function writeSegmentColor(
  index: number,
  count: number,
  level: number,
  strainBands: readonly StrainId[],
  bodyCount: number
): void {
  const tone = getTrailTone(level) * getSegmentEnergy(index, count);
  if (strainBands.length > 0) {
    const band = Math.min(
      strainBands.length - 1,
      Math.floor(((index - 1) / bodyCount) * strainBands.length)
    );
    _energyColor.set(STRAINS[strainBands[band]].color).multiplyScalar(tone);
  } else {
    _energyColor.setScalar(tone);
  }
}

/**
 * The instance sink the trail writes into. THREE.InstancedMesh satisfies it
 * structurally; a recording stub satisfies it in tests.
 *
 * This interface is the whole reason `writeTrailInstances` is a free function
 * instead of forty lines inline in `useFrame`. Every component test in this
 * directory mocks `useFrame` as a no-op (see `AimRenderer.test.tsx`), and
 * jsdom has no WebGL context, so a loop body living inside that callback is
 * unreachable by any test that could exist. WP-3.03's terrain defect - correct
 * model, nothing drawn, suite fully green - is what that costs.
 */
export interface TrailInstanceSink {
  setMatrixAt(index: number, matrix: THREE.Matrix4): void;
  setColorAt(index: number, color: THREE.Color): void;
}

/**
 * Emit the whole trail for one frame and return the instance count.
 *
 * One box per body cell (segment 0 is the separate head mesh), then one
 * oriented link per joint. Both passes read tick-alpha interpolated positions:
 * the middle is NEVER snapped to the grid, because 5-10 Hz is the worst
 * flicker band there is and the head/trail junction would gap a full cell
 * every tick.
 *
 * Allocation-free: every vector, quaternion, matrix and colour it touches is
 * module scratch, and the sink is expected to copy on write (InstancedMesh
 * does).
 */
export function writeTrailInstances(
  sink: TrailInstanceSink,
  buffer: InterpolationBuffer,
  alpha: number,
  levels: Uint8Array,
  strainBands: readonly StrainId[],
  elapsed: number
): number {
  const count = buffer.count;
  const bodyCount = Math.max(1, count - 1);
  let n = 0;

  // Pass A: one box per body cell. Base-on-floor (y = height / 2), matching
  // TerrainBlocks' convention, so a sinking tail sinks INTO the floor rather
  // than hovering above it.
  for (let i = 1; i < count && n < TRAIL_INSTANCE_CAPACITY; i++) {
    const level = levels[i];
    const footprint = getTrailFootprint(level) * getSegmentScale(i, count);
    const height = getTrailHeight(i, count) * getTrailBreathe(i, elapsed);
    // FLOOR_CLEARANCE, not 0: the arena platform's top face is at exactly
    // y = 0, so a cube sitting flush on it shares that plane at identical
    // depth and z-fights across its whole footprint. See ArenaFloor.
    _position.set(
      getInterpolatedX(buffer, i, alpha) + 0.5,
      FLOOR_CLEARANCE + height / 2,
      getInterpolatedZ(buffer, i, alpha) + 0.5
    );
    _scale.set(footprint, height, footprint);
    _matrix.compose(_position, _identityQuaternion, _scale);
    sink.setMatrixAt(n, _matrix);
    writeSegmentColor(i, count, level, strainBands, bodyCount);
    sink.setColorAt(n, _energyColor);
    n++;
  }

  // PASS B — THE JOINT LINKS — IS DELETED (2026-07-28).
  //
  // It emitted an oriented box per joint so the middle would read as a
  // continuous form rather than a chain. It also produced the defect the owner
  // hit on first play: "the blocks of the snake dont render properly, they are
  // flickering and not all sides of the cubes/segments are visible."
  //
  // The first diagnosis was coplanar top faces, and it was wrong — insetting
  // the link changed the render and fixed nothing the owner could see. What
  // settled it was a control render with this pass disabled and nothing else
  // changed: the body came back as clean, discrete, fully-faced cubes. The
  // links were the whole defect, not the way they were sized.
  //
  // They are not missed, which is the part worth recording. The fusion ruling
  // is carried by FOOTPRINT and BRIGHTNESS: at level 2 a cell claims 0.96 of
  // its tile, so neighbours sit a 0.04 hairline apart and already read as one
  // solid field, and at level 0 the 0.38 gap is the point. A link bridging
  // that gap was arguing with the metric it was supposed to express.
  //
  // If a continuous form is ever wanted again, the honest way is one mesh for
  // the whole trail, not a second box interpenetrating the first.

  return n;
}

/**
 * Eyes on the head's forward face - parented inside the head mesh so its
 * scale and damped yaw carry them (positions in unit-head-local space,
 * mirroring SpecimenChamber's SpecimenEyes).
 */
function SnakeEyes() {
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
// Core - shared by the GLB and fallback variants
// -----------------------------------------------------------------------------

interface InstancedSnakeCoreProps extends InstancedSnakeProps {
  headGeometry: THREE.BufferGeometry;
  bodyGeometry: THREE.BufferGeometry;
}

function InstancedSnakeCore({
  bufferRef,
  dynasty,
  direction,
  strainBands = [],
  terrain,
  wrapActive = false,
  headGeometry,
  bodyGeometry,
}: InstancedSnakeCoreProps) {
  const instancedRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.Group>(null);
  const yawRef = useRef(HEAD_FACE_YAW[direction]);
  // Fusion working set: preallocated typed arrays, hysteresis keyed by CELL.
  // A lazy ref rather than useMemo - it must survive every re-render and it is
  // never a render input.
  const fusionRef = useRef<TrailFusionState | null>(null);
  if (fusionRef.current === null) {
    fusionRef.current = createTrailFusionState(GRID_SIZE, INTERPOLATION_CAPACITY);
  }
  // Which engine tick the fusion state was last folded for. `tickAt` is a
  // performance.now() stamp, so equality is an exact "same tick" test and
  // zero means the buffer was reset (run start).
  const lastTickAtRef = useRef(0);
  const elapsedRef = useRef(0);

  const headMaterial = getSnakeSegmentMaterial(dynasty, true);
  const bodyMaterial = getInstancedBodyMaterial(dynasty);

  // One-time GPU hints: the instance matrices stream every frame, and the
  // whole arena is always on screen - skip per-frame culling math.
  useEffect(() => {
    const mesh = instancedRef.current;
    if (!mesh) return;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
  }, [bodyGeometry]);

  useFrame((_, delta) => {
    const buffer = bufferRef.current;
    const mesh = instancedRef.current;
    const head = headRef.current;
    const fusion = fusionRef.current;
    if (!buffer || !mesh || !head || !fusion) return;

    const count = buffer.count;
    const alpha = getAlpha(buffer, performance.now());
    elapsedRef.current += delta;
    const elapsed = elapsedRef.current;

    // Fold the fusion metric once per ENGINE tick. `tickAt === 0` means the
    // buffer was reset for a new run: drop every committed level, or the new
    // snake inherits the dead one's coil on any cell it happens to re-enter.
    const tickAt = buffer.tickAt;
    if (tickAt === 0) {
      if (lastTickAtRef.current !== 0) {
        resetTrailFusion(fusion);
        lastTickAtRef.current = 0;
      }
    } else if (tickAt !== lastTickAtRef.current) {
      lastTickAtRef.current = tickAt;
      updateTrailFusion(fusion, buffer.curr, count, terrain, wrapActive);
    }

    mesh.count = writeTrailInstances(
      mesh,
      buffer,
      alpha,
      fusion.levels,
      strainBands,
      elapsed
    );
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }

    // Head: interpolated position + damped yaw toward the heading
    if (count > 0) {
      head.visible = true;
      head.position.set(
        getInterpolatedX(buffer, 0, alpha) + 0.5,
        0.5,
        getInterpolatedZ(buffer, 0, alpha) + 0.5
      );
      const target = HEAD_FACE_YAW[direction];
      // Shortest-path wrap into [-PI, PI), then exponential damp
      let diff = (target - yawRef.current) % TWO_PI;
      if (diff > Math.PI) diff -= TWO_PI;
      if (diff < -Math.PI) diff += TWO_PI;
      yawRef.current += diff * (1 - Math.exp(-YAW_DAMP * delta));
      head.rotation.y = yawRef.current;
    } else {
      head.visible = false;
    }
  });

  return (
    <group>
      <instancedMesh
        ref={instancedRef}
        args={[bodyGeometry, bodyMaterial, TRAIL_INSTANCE_CAPACITY]}
        frustumCulled={false}
        castShadow
      />
      <group ref={headRef} visible={false}>
        <mesh
          geometry={headGeometry}
          material={headMaterial}
          scale={HEAD_SIZE}
          castShadow
        >
          <SnakeEyes />
        </mesh>
      </group>
    </group>
  );
}

// -----------------------------------------------------------------------------
// Public variants
// -----------------------------------------------------------------------------

/** GLB-backed snake. Suspends while the voxel model streams in - wrap in
 *  <Suspense fallback={<InstancedSnakeFallback ... />}>. */
export function InstancedSnake(props: InstancedSnakeProps) {
  const { scene } = useGLTF(SNAKE_MODEL_URL);
  const { head, body } = getSnakeGeometries(scene);
  return (
    <InstancedSnakeCore
      {...props}
      headGeometry={head ?? unitBoxGeometry}
      bodyGeometry={body ?? unitBoxGeometry}
    />
  );
}

/** Instant procedural stand-in (unit boxes, same shared materials) so the
 *  run never blocks on asset load; identical Core, identical behavior. */
export function InstancedSnakeFallback(props: InstancedSnakeProps) {
  return (
    <InstancedSnakeCore
      {...props}
      headGeometry={unitBoxGeometry}
      bodyGeometry={unitBoxGeometry}
    />
  );
}

useGLTF.preload(SNAKE_MODEL_URL);
