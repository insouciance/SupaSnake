'use client';

/**
 * InstancedSnake - one instanced body plus a separately readable head.
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
 *   BRIGHTNESS - fusion plus one categorical head/interior step. Deliberately
 *                NOT the old whole-body index gradient: dimming toward the
 *                tail made cells about to free up hardest to see, which is
 *                backwards on gameplay grounds.
 *
 * One instance per UNIQUE occupied body cell. Stacked growth is logical
 * pressure, not permission to z-fight several cubes in the same tile; joint
 * links remain deleted because interpenetrating opaque boxes caused the
 * original flicker and missing-face defect.
 *
 * Cell-persistence contract:
 * - The head follows exact tick-alpha interpolation. The body renders BOARD
 *   OCCUPANCY, not segment identity: established cells stay planted; only the
 *   cell deposited behind the head grows in and vacated tail cells sink out.
 *   A tight long coil therefore reads as settled terrain instead of a conveyor
 *   of 150 equally animated boxes.
 * - ZERO per-frame allocations: all scratch objects (Vector3/Quaternion/
 *   Matrix4) live at module scope; the loop only writes. The fusion metric's
 *   working set is preallocated typed arrays in a ref.
 * - No React state anywhere in the render loop; occupancy changes show up
 *   purely as a different `mesh.count` next frame.
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
  type InterpolationBuffer,
} from '@/lib/game/interpolationBuffer';
import {
  createTrailFusionState,
  FUSION_NEIGHBOUR_DX,
  FUSION_NEIGHBOUR_DZ,
  resetTrailFusion,
  updateTrailFusion,
  type TrailFusionState,
} from '@/lib/game/trailFusion';
import {
  createTrailCellState,
  resetTrailCells,
  trailCellX,
  trailCellZ,
  updateTrailCells,
  type TrailCellState,
} from '@/lib/game/trailCells';
import { getGameMaterialProfile } from './screen/gameMaterialProfiles';
import { getSnakeRoundedGeometry } from './screen/gameRenderGeometry';
import { createInkHullMaterial } from './screen/inkAmber';
import { centerYFromBase, FLOOR_CLEARANCE } from './ArenaFloor';
import {
  HEAD_SIZE,
  ENERGY_MIN,
  SNAKE_MODEL_URL,
  TRAIL_HEAD_ZONE,
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
   * permanent torus). Walls normally count as packing neighbours; an open
   * edge must not, or the metric rewards hugging the one seam that is not
   * actually spending any space.
   */
  wrapActive?: boolean;
  /** Static head shell during the short post-revive body/edge phase. */
  revivePhaseActive?: boolean;
}

// -----------------------------------------------------------------------------
// Module-scope scratch + shared assets: the render loop allocates NOTHING
// -----------------------------------------------------------------------------

const _position = new THREE.Vector3();
const _scale = new THREE.Vector3();
/** Cell boxes never rotate. */
const _identityQuaternion = new THREE.Quaternion();
const _matrix = new THREE.Matrix4();
const _energyColor = new THREE.Color();
const _whiteColor = new THREE.Color(1, 1, 1);

const TRAIL_BASE_COLORS: Record<DynastyId, THREE.Color> = {
  CYBER: new THREE.Color(getGameMaterialProfile('CYBER').snake.baseColor),
  PRIMAL: new THREE.Color(getGameMaterialProfile('PRIMAL').snake.baseColor),
  COSMIC: new THREE.Color(getGameMaterialProfile('COSMIC').snake.baseColor),
};

const TRAIL_STRAIN_COLORS: Record<StrainId, THREE.Color> = {
  AURUM: new THREE.Color(STRAINS.AURUM.color),
  VOLT: new THREE.Color(STRAINS.VOLT.color),
  FERAL: new THREE.Color(STRAINS.FERAL.color),
  FLUX: new THREE.Color(STRAINS.FLUX.color),
  UMBRA: new THREE.Color(STRAINS.UMBRA.color),
};

/** Strain bands remain visible without repainting the creature completely. */
export const TRAIL_STRAIN_BLEND = 0.38;
/** A band may never fall below this share of its Dynasty base luminance. */
export const TRAIL_STRAIN_LUMINANCE_FLOOR = 0.92;

function linearLuminance(color: THREE.Color): number {
  return color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
}

/**
 * Write the final semantic instance colour without allocating.
 *
 * Instance colour multiplies a material in Three.js. The old renderer put the
 * Dynasty colour on the material and the Strain colour on the instance, so a
 * cyan creature with a red/violet band lost most RGB channels and became
 * almost black. The body material is now neutral and this function authors the
 * final colour directly: a controlled blend whose luminance is protected.
 */
export function writeSnakeTrailColor(
  target: THREE.Color,
  dynasty: DynastyId,
  strain: StrainId | null,
  tone = 1
): THREE.Color {
  const base = TRAIL_BASE_COLORS[dynasty];
  target.copy(base);

  if (strain) {
    target.lerp(TRAIL_STRAIN_COLORS[strain], TRAIL_STRAIN_BLEND);
    const floor = linearLuminance(base) * TRAIL_STRAIN_LUMINANCE_FLOOR;
    const mixed = linearLuminance(target);
    if (mixed > 0 && mixed < floor) {
      // Lift toward white rather than multiplying channels. Multiplication
      // clips the already-bright channels first and can still miss the target
      // luminance; interpolation reaches the requested luminance exactly while
      // preserving the mixed hue as far as the available gamut permits.
      target.lerp(_whiteColor, (floor - mixed) / (1 - mixed));
    }
  }

  return target.multiplyScalar(Math.max(0, tone));
}

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
const TRAIL_INSTANCE_CAPACITY = GRID_SIZE * GRID_SIZE;

/**
 * Instanced-body material per dynasty: a clone of the shared body material
 * with two eye-comfort adjustments -
 * 1. albedo trimmed so the moving trunk sits safely UNDER the bloom
 *    threshold (only head/food/portal/glow strips may bloom; a blooming
 *    trunk is a flicker amplifier in motion), and
 * 2. an emissive shader patch that multiplies emissive by the per-instance
 *    color, so fusion tone and the categorical head/interior hierarchy drive
 *    BOTH albedo and glow. The trunk itself is otherwise perfectly steady:
 *    no time-varying material writes on body segments, ever.
 */
const instancedBodyMaterialCache = new Map<string, THREE.MeshToonMaterial>();

export function getInstancedBodyMaterial(
  dynasty: DynastyId
): THREE.MeshToonMaterial {
  let material = instancedBodyMaterialCache.get(dynasty);
  if (!material) {
    const surface = getGameMaterialProfile(dynasty).snake;
    material = getSnakeSegmentMaterial(dynasty, false).clone();
    // The instance now carries the authored final Dynasty/Strain colour. A
    // neutral material avoids the destructive RGB × RGB tint multiplication
    // that made complementary Strain bands muddy or nearly black.
    material.color.setRGB(
      surface.bodyAlbedoScalar,
      surface.bodyAlbedoScalar,
      surface.bodyAlbedoScalar
    );
    material.emissive.setRGB(1, 1, 1);
    // Ordinary body cells are categorical solids. Explicitly pinning these
    // flags protects that read if the shared material ever gains a semantic
    // transparent variant for portals, revive ghosts, or forming terrain.
    material.transparent = false;
    material.opacity = 1;
    material.depthWrite = true;
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n' +
          // WebGLProgram maps instance colours to USE_COLOR in the fragment
          // stage; USE_INSTANCING_COLOR exists only in the vertex stage.
          // Testing the latter left emissive white and washed dense coils out.
          '#ifdef USE_COLOR\n' +
          '\ttotalEmissiveRadiance *= vColor.rgb;\n' +
          '#endif'
      );
    };
    instancedBodyMaterialCache.set(dynasty, material);
  }
  return material;
}

/** Shared unit box for the pre-GLB fallback (same idea as SnakeModel's). */
const unitBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
const fallbackHeadGeometry = getSnakeRoundedGeometry('head');
const fallbackBodyGeometry = getSnakeRoundedGeometry('body');

/** Eye pieces - the SpecimenChamber pattern, shared across mounts. */
const eyeGeometry = new THREE.BoxGeometry(1, 1, 1);
const eyeDarkMaterial = new THREE.MeshBasicMaterial({ color: '#06090d' });
const eyeGlintMaterial = new THREE.MeshBasicMaterial({ color: '#e6edf3' });
const revivePhaseMaterial = new THREE.MeshBasicMaterial({
  color: '#f4d58d',
  transparent: true,
  opacity: 0.34,
  wireframe: true,
  depthWrite: false,
});
/**
 * INK & AMBER: the outline pass. One material for the 400-instance trail and
 * one for the head - both push the same geometry out by a constant WORLD-space
 * width (the hull shader divides by the object's own scale), so the line does
 * not thin on a vacancy voxel or thicken on the head.
 *
 * Two materials rather than one because the hull is bound to a mesh's
 * geometry, not to a colour: sharing a single instance across the instanced
 * trail (which compiles with USE_INSTANCING) and the plain head mesh (which
 * does not) would force three to keep re-resolving one material against two
 * program variants every frame.
 */
const trailHullMaterial = createInkHullMaterial();
const headHullMaterial = createInkHullMaterial();
const REVIVE_PHASE_HEAD_SCALE = HEAD_SIZE * 1.14;
const REVIVE_PHASE_HEAD_Y = (REVIVE_PHASE_HEAD_SCALE - HEAD_SIZE) / 2;

/** Shared head centre; its base is exactly the same render plane as the body. */
export const SNAKE_HEAD_CENTER_Y = centerYFromBase(
  FLOOR_CLEARANCE,
  HEAD_SIZE
);

/** A rare one-shot contact highlight, not a second persistent body layer. */
export const COIL_SEAL_DURATION_SECONDS = 0.52;
const COIL_SEAL_INSTANCE_CAPACITY = GRID_SIZE * GRID_SIZE * 4;
const coilSealMaterialCache = new Map<string, THREE.MeshBasicMaterial>();

function getCoilSealMaterial(dynasty: DynastyId): THREE.MeshBasicMaterial {
  let material = coilSealMaterialCache.get(dynasty);
  if (!material) {
    material = new THREE.MeshBasicMaterial({
      color: getGameMaterialProfile(dynasty).snake.coilSealColor,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    coilSealMaterialCache.set(dynasty, material);
  }
  return material;
}

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
 * Write one occupied cell's colour into `_energyColor`: fusion tone (the
 * earned signal) times the two-level head/interior hierarchy.
 */
function writeCellColor(
  index: number,
  level: number,
  dynasty: DynastyId,
  strainBands: readonly StrainId[],
  bandPhase: number
): void {
  // Only the live front carries full energy. The settled interior is one calm,
  // high-contrast value; no 150-cell gradient crawls through a stationary coil.
  const energy = index <= TRAIL_HEAD_ZONE ? 1 : ENERGY_MIN;
  const tone = getTrailTone(level) * energy;
  const strain = strainBands.length > 0
    ? strainBands[bandPhase % strainBands.length]
    : null;
  writeSnakeTrailColor(_energyColor, dynasty, strain, tone);
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

function writeTrailCell(
  sink: TrailInstanceSink,
  instance: number,
  cell: number,
  representative: number,
  length: number,
  transition: number,
  fusion: TrailFusionState,
  cells: TrailCellState,
  dynasty: DynastyId,
  strainBands: readonly StrainId[],
  elapsed: number
): number {
  if (instance >= TRAIL_INSTANCE_CAPACITY || transition <= 0.001) {
    return instance;
  }
  const level = fusion.committed[cell];
  const footprint =
    getTrailFootprint(level) *
    getSegmentScale(representative, length) *
    transition;
  const height =
    getTrailHeight(representative, length) *
    getTrailBreathe(representative, elapsed) *
    transition;
  _position.set(
    trailCellX(cells, cell) + 0.5,
    centerYFromBase(FLOOR_CLEARANCE, height),
    trailCellZ(cells, cell) + 0.5
  );
  _scale.set(footprint, height, footprint);
  _matrix.compose(_position, _identityQuaternion, _scale);
  sink.setMatrixAt(instance, _matrix);
  writeCellColor(
    representative,
    level,
    dynasty,
    strainBands,
    cells.bandPhase[cell]
  );
  sink.setColorAt(instance, _energyColor);
  return instance + 1;
}

/**
 * Emit the whole trail for one frame and return the instance count.
 *
 * One box per uniquely occupied body cell (segment 0 is the separate head).
 * Tick alpha drives only enter/leave scale; persistent coil cells remain on
 * their authoritative centres while segment identities pass through them.
 *
 * Allocation-free: every vector, quaternion, matrix and colour it touches is
 * module scratch, and the sink is expected to copy on write (InstancedMesh
 * does).
 */
export function writeTrailInstances(
  sink: TrailInstanceSink,
  buffer: InterpolationBuffer,
  alpha: number,
  fusion: TrailFusionState,
  cells: TrailCellState,
  dynasty: DynastyId,
  strainBands: readonly StrainId[],
  elapsed: number
): number {
  const count = buffer.count;
  let n = 0;

  const eased = alpha * alpha * (3 - 2 * alpha);

  // Persistent cells never translate. A newly deposited cell grows into the
  // previous head tile as the head leaves it; nothing else in the coil moves.
  for (let index = 0; index < cells.currentCount; index += 1) {
    const cell = cells.currentCells[index];
    const persistent = cells.previousMask[cell] === 1;
    const transition = persistent ? 1 : eased;
    // Segment identity advances one index every tick even when a coil cell
    // does not move. Blend that representative (and the run length it is
    // denominated in) so the vacancy taper flows instead of blinking once per
    // engine tick. Entering cells have no previous representative to blend.
    const representative = persistent
      ? cells.previousRepresentative[cell] +
        (cells.currentRepresentative[cell] -
          cells.previousRepresentative[cell]) *
          eased
      : cells.currentRepresentative[cell];
    const length = persistent
      ? buffer.prevCount + (count - buffer.prevCount) * eased
      : count;
    n = writeTrailCell(
      sink,
      n,
      cell,
      representative,
      length,
      transition,
      fusion,
      cells,
      dynasty,
      strainBands,
      elapsed
    );
  }

  // Cells that truly became free retain their old position and sink away.
  // Multiple departures (Fortress/revive) share the same one-tick grammar.
  for (let index = 0; index < cells.departingCount; index += 1) {
    const cell = cells.departingCells[index];
    n = writeTrailCell(
      sink,
      n,
      cell,
      cells.previousRepresentative[cell],
      buffer.prevCount,
      1 - eased,
      fusion,
      cells,
      dynasty,
      strainBands,
      elapsed
    );
  }

  // THE JOINT-LINK PASS REMAINS DELETED (2026-07-28).
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
  // is carried by FOOTPRINT and BRIGHTNESS: at level 2 a cell claims 0.90 of
  // its tile, so neighbours sit a narrow seam apart and already read as one
  // packed field, and at level 0 the 0.34 gap is the point. A link bridging
  // that gap was arguing with the metric it was supposed to express.
  //
  // If a continuous form is ever wanted again, the honest way is one mesh for
  // the whole trail, not a second box interpenetrating the first.

  return n;
}

export interface CoilSealInstanceSink {
  setMatrixAt(index: number, matrix: THREE.Matrix4): void;
}

/**
 * Zip short highlights along the exact contact edges that made a cell fully
 * fused. The settled level-2 body remains calm after this half-second event.
 */
export function writeCoilSealInstances(
  sink: CoilSealInstanceSink,
  buffer: InterpolationBuffer,
  alpha: number,
  fusion: TrailFusionState,
  cells: TrailCellState,
  elapsed: number
): number {
  let instance = 0;
  const eased = alpha * alpha * (3 - 2 * alpha);

  for (let index = 0; index < cells.currentCount; index += 1) {
    const cell = cells.currentCells[index];
    const startedAt = fusion.sealStartedAt[cell];
    const age = elapsed - startedAt;
    if (
      startedAt < 0 ||
      age < 0 ||
      age > COIL_SEAL_DURATION_SECONDS ||
      fusion.sealMask[cell] === 0
    ) {
      continue;
    }

    const persistent = cells.previousMask[cell] === 1;
    const representative = persistent
      ? cells.previousRepresentative[cell] +
        (cells.currentRepresentative[cell] -
          cells.previousRepresentative[cell]) *
          eased
      : cells.currentRepresentative[cell];
    const length = persistent
      ? buffer.prevCount + (buffer.count - buffer.prevCount) * eased
      : buffer.count;
    const bodyHeight =
      getTrailHeight(representative, length) *
      getTrailBreathe(representative, elapsed);
    const progress = age / COIL_SEAL_DURATION_SECONDS;
    const flare = Math.sin(progress * Math.PI);
    // Geometry, not global material opacity, carries the per-instance fade.
    // It reaches zero at both ends so the seal never pops on or blinks out.
    const dashLength = 0.44 * flare;
    const dashWidth = 0.08 * flare;
    const dashHeight = 0.053 * flare;
    const travel = (progress - 0.5) * 0.42;
    const x = trailCellX(cells, cell) + 0.5;
    const z = trailCellZ(cells, cell) + 0.5;

    for (let direction = 0; direction < 4; direction += 1) {
      if ((fusion.sealMask[cell] & (1 << direction)) === 0) continue;
      if (instance >= COIL_SEAL_INSTANCE_CAPACITY) return instance;

      const nx = trailCellX(cells, cell) + FUSION_NEIGHBOUR_DX[direction];
      const nz = trailCellZ(cells, cell) + FUSION_NEIGHBOUR_DZ[direction];
      if (nx >= 0 && nx < cells.gridSize && nz >= 0 && nz < cells.gridSize) {
        const neighbour = nz * cells.gridSize + nx;
        const opposite = direction ^ 1;
        const neighbourAge = elapsed - fusion.sealStartedAt[neighbour];
        // A shared body seam is one line, not two coplanar highlights.
        if (
          neighbour < cell &&
          cells.currentMask[neighbour] === 1 &&
          neighbourAge >= 0 &&
          neighbourAge <= COIL_SEAL_DURATION_SECONDS &&
          (fusion.sealMask[neighbour] & (1 << opposite)) !== 0
        ) {
          continue;
        }
      }

      if (FUSION_NEIGHBOUR_DX[direction] !== 0) {
        _position.set(
          x + FUSION_NEIGHBOUR_DX[direction] * 0.47,
          FLOOR_CLEARANCE + bodyHeight + dashHeight / 2 + 0.008,
          z + travel
        );
        _scale.set(dashWidth, dashHeight, dashLength);
      } else {
        _position.set(
          x + travel,
          FLOOR_CLEARANCE + bodyHeight + dashHeight / 2 + 0.008,
          z + FUSION_NEIGHBOUR_DZ[direction] * 0.47
        );
        _scale.set(dashLength, dashHeight, dashWidth);
      }
      _matrix.compose(_position, _identityQuaternion, _scale);
      sink.setMatrixAt(instance, _matrix);
      instance += 1;
    }
  }

  return instance;
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
  revivePhaseActive = false,
  headGeometry,
  bodyGeometry,
}: InstancedSnakeCoreProps) {
  const instancedRef = useRef<THREE.InstancedMesh>(null);
  const hullRef = useRef<THREE.InstancedMesh>(null);
  const sealRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.Group>(null);
  const yawRef = useRef(HEAD_FACE_YAW[direction]);
  // Fusion working set: preallocated typed arrays, hysteresis keyed by CELL.
  // A lazy ref rather than useMemo - it must survive every re-render and it is
  // never a render input.
  const fusionRef = useRef<TrailFusionState | null>(null);
  if (fusionRef.current === null) {
    fusionRef.current = createTrailFusionState(GRID_SIZE, TRAIL_INSTANCE_CAPACITY);
  }
  const cellRef = useRef<TrailCellState | null>(null);
  if (cellRef.current === null) {
    cellRef.current = createTrailCellState(GRID_SIZE);
  }
  // Which engine tick the fusion state was last folded for. `tickAt` is a
  // performance.now() stamp, so equality is an exact "same tick" test and
  // zero means the buffer was reset (run start).
  const lastTickAtRef = useRef(0);
  const elapsedRef = useRef(0);

  const headMaterial = getSnakeSegmentMaterial(dynasty, true);
  const bodyMaterial = getInstancedBodyMaterial(dynasty);
  const sealMaterial = getCoilSealMaterial(dynasty);

  // One-time GPU hints: the instance matrices stream every frame, and the
  // whole arena is always on screen - skip per-frame culling math.
  useEffect(() => {
    const mesh = instancedRef.current;
    const seal = sealRef.current;
    if (!mesh || !seal) return;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    seal.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    seal.count = 0;
    const hull = hullRef.current;
    if (hull) {
      hull.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      hull.count = 0;
    }
  }, [bodyGeometry]);

  useFrame((_, delta) => {
    const buffer = bufferRef.current;
    const mesh = instancedRef.current;
    const seal = sealRef.current;
    const head = headRef.current;
    const fusion = fusionRef.current;
    const cells = cellRef.current;
    if (!buffer || !mesh || !seal || !head || !fusion || !cells) return;

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
        resetTrailCells(cells);
        lastTickAtRef.current = 0;
      }
    } else if (tickAt !== lastTickAtRef.current) {
      lastTickAtRef.current = tickAt;
      updateTrailFusion(
        fusion,
        buffer.curr,
        count,
        terrain,
        wrapActive,
        elapsed
      );
      updateTrailCells(cells, buffer);
    }

    mesh.count = writeTrailInstances(
      mesh,
      buffer,
      alpha,
      fusion,
      cells,
      dynasty,
      strainBands,
      elapsed
    );
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }

    // Ink hull: the identical instance set, one typed-array copy rather than a
    // second transform pass. The expansion happens in the vertex shader, so
    // the hull never needs its own matrices computed - only copied.
    const hull = hullRef.current;
    if (hull) {
      (hull.instanceMatrix.array as Float32Array).set(
        mesh.instanceMatrix.array as Float32Array
      );
      hull.instanceMatrix.needsUpdate = true;
      hull.count = mesh.count;
    }

    seal.count = writeCoilSealInstances(
      seal,
      buffer,
      alpha,
      fusion,
      cells,
      elapsed
    );
    seal.instanceMatrix.needsUpdate = true;

    // Head: interpolated position + damped yaw toward the heading
    if (count > 0) {
      head.visible = true;
      head.position.set(
        getInterpolatedX(buffer, 0, alpha) + 0.5,
        SNAKE_HEAD_CENTER_Y,
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
        ref={hullRef}
        args={[bodyGeometry, trailHullMaterial, TRAIL_INSTANCE_CAPACITY]}
        frustumCulled={false}
        renderOrder={-1}
      />
      <instancedMesh
        ref={instancedRef}
        args={[bodyGeometry, bodyMaterial, TRAIL_INSTANCE_CAPACITY]}
        frustumCulled={false}
        castShadow
      />
      <instancedMesh
        ref={sealRef}
        args={[
          unitBoxGeometry,
          sealMaterial,
          COIL_SEAL_INSTANCE_CAPACITY,
        ]}
        frustumCulled={false}
        renderOrder={4}
      />
      <group ref={headRef} visible={false}>
        <mesh
          geometry={headGeometry}
          material={revivePhaseMaterial}
          scale={REVIVE_PHASE_HEAD_SCALE}
          position={[0, REVIVE_PHASE_HEAD_Y, 0]}
          visible={revivePhaseActive}
        />
        <mesh
          geometry={headGeometry}
          material={headHullMaterial}
          scale={HEAD_SIZE}
          renderOrder={-1}
        />
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
      headGeometry={head ?? fallbackHeadGeometry}
      bodyGeometry={body ?? fallbackBodyGeometry}
    />
  );
}

/** Instant procedural stand-in (unit boxes, same shared materials) so the
 *  run never blocks on asset load; identical Core, identical behavior. */
export function InstancedSnakeFallback(props: InstancedSnakeProps) {
  return (
    <InstancedSnakeCore
      {...props}
      headGeometry={fallbackHeadGeometry}
      bodyGeometry={fallbackBodyGeometry}
    />
  );
}

useGLTF.preload(SNAKE_MODEL_URL);
