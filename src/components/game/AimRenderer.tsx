'use client';

/**
 * AimRenderer - the aim telegraph, one renderer per selected aim system
 * (v2 meta-progression, see src/lib/game/aimSystems.ts):
 *
 * - deadeye:  THE LEAD - three chunky white dashes lying on the next three
 *             cells along the committed heading, rigidly attached to the
 *             smooth head, plus the grid-snapped cell highlight under it.
 *             (The board-spanning dashed crosshair this system used to draw
 *             was rejected outright; see THE LEAD below.)
 * - gridlock: full row+column rails smooth-following the INTERPOLATED
 *             head + a grid-snapped cell highlight under it (the "where
 *             exactly am I" fix); a rail brightens when a target sits on
 *             it, with a pip at the target.
 * - pathline: projected 5-cell path ribbon + queued-turn chevrons +
 *             danger tint - the direct port of v1 vector/sequence/radar.
 * - firefly:  a warm companion drone that eases toward the target food,
 *             bobbing under a soft glow. The cute one.
 *
 * Discipline (inherited from AimingCrosshair, plus eye-comfort rules):
 * - Parameter-free geometries are module-scope shared pools; materials are
 *   memoized per dynasty color and disposed on unmount.
 * - The only per-frame work is position/rotation/opacity WRITES - all
 *   scratch objects live at module scope, zero allocations in useFrame.
 * - Every animated pulse stays under 2.5Hz (photosensitivity budget);
 *   thin additive layers prefer thicker + dimmer over thinner + hotter.
 * - Per-tick math (target scans, path projection) runs in useMemo on prop
 *   changes, exactly like the engine-mirroring v1 renderer did.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Direction, Position } from '@/lib/game/SnakeGameLogic';
import type { AimSystemId } from '@/lib/game/aimSystems';
import type { InterpolationBuffer } from '@/lib/game/interpolationBuffer';
import {
  getAlpha,
  getGlideX,
  getGlideZ,
  getInterpolatedX,
  getInterpolatedZ,
  getRestSettle,
  settleToward,
} from '@/lib/game/interpolationBuffer';
import { arrivalMotion, getArrivalMode } from '@/lib/game/arrivalEasing';
import {
  DIRECTION_DELTAS,
  DIRECTION_YAW,
  findAlignedTargets,
  projectAimPath,
  projectDangerPath,
  type AimTarget,
} from './aimUtils';
import { createExactUnitRoundedBoxGeometry } from './screen/gameRenderGeometry';
import { createInkHullMaterial } from './screen/inkAmber';

export interface AimRendererProps {
  /** Snake head cell (null when not playing) */
  headPosition?: Position | null;
  /** Current committed heading */
  direction?: Direction;
  /** Buffered direction inputs (engine consumption order) */
  queuedDirections?: readonly Direction[];
  /** Full snake (for the pathline danger scan) */
  snake?: readonly Position[];
  /** Solid board cells beyond the snake (terrain, seals, and scars). */
  obstacles?: readonly { x: number; z: number }[];
  /** Grid size (default 20) */
  gridSize?: number;
  /** Player-selected aim system */
  aimSystem?: AimSystemId;
  /** Target-bearing cells on the board (rebuilt per tick by the game page) */
  targets?: readonly AimTarget[];
  /** Interpolation buffer - smooth-follow source for deadeye/gridlock/firefly */
  bufferRef?: { readonly current: InterpolationBuffer | null };
  /** Accent color (dynasty accent) */
  color?: string;
  /** Lane/rail color (dynasty primary) */
  laneColor?: string;
  /**
   * True on a dynasty whose edges wrap instead of killing (COSMIC).
   *
   * Render-only and deterministic: it decides whether THE LEAD is truncated
   * at the wall or continues across the seam. It reads no engine state and
   * changes no engine state - the cells it points at are exactly the cells
   * `SnakeGameLogic` would move through.
   */
  torus?: boolean;
}

/** Board-plane height for aim layers (above floor + grid lines) */
const AIM_Y = 0.05;
/** Cells of projected path / danger scan ahead of the head (pathline) */
const LANE_LENGTH = 5;
/** Distance-fade opacity ramp for the lane quads */
const LANE_OPACITIES = [0.3, 0.22, 0.16, 0.11, 0.07];
/** Danger tint ramp, indexed by distance FROM impact (0 = at impact) */
const DANGER_OPACITIES = [0.7, 0.52, 0.38, 0.26, 0.16];
/** Neon rose - the palette's danger accent */
const DANGER_COLOR = '#f43f5e';

/**
 * THE LEAD - what Deadeye draws.
 *
 * The board-spanning crosshair is gone, on a ruling about the whole system
 * rather than its styling: "completely wrong - take it away and replace it
 * with a different one." The crossbar, the forward stem and the grid-phased
 * dash shader are all deleted; what replaces them is a mark that occupies
 * three cells instead of two full board spans.
 *
 * WHY A SHORT PROJECTED PATH AND NOT A LANDING-CELL HIGHLIGHT
 *
 * Both candidates answer "where am I going". Only one of them answers it in
 * time. At the fastest ruleset a cell passes in 100-175ms, so a mark that
 * covers only the NEXT cell hands the player 100-175ms of notice - inside
 * human reaction time (~200-250ms), i.e. by the time it is read it is already
 * spent. Three cells of lead is 300-525ms: it brackets reaction time at every
 * speed the game runs at, which is why the number is three and not one and
 * not five. Five cells (Pathline's length) is a different, busier system that
 * also has to editorialise about danger; three is the shortest lead that is
 * still actionable, which is what "minimal" means here.
 *
 * The landing-cell idea is not discarded, it is folded in: dash 1 IS the next
 * landing cell and it is the biggest of the three. The taper makes the
 * immediate cell dominant without a second kind of mark competing with it.
 *
 * WHY IT IS A DASH PER CELL, TAPERING IN LENGTH
 *
 * One dash per cell centre, aligned WITH the heading, so it reads as lane
 * marking rather than as a stop line - a bar across the path says "barrier",
 * a bar along it says "this way". One dash per cell also keeps the guide
 * countable: the player reads lead distance without estimating it.
 *
 * The taper is in LENGTH, never in width. Width carries the ink edge, and an
 * edge is a fixed world thickness: narrowing a dash would eat its white core
 * until the third dash was all outline. Shortening it recedes just as clearly
 * and costs the third dash nothing in legibility.
 *
 * WHY WHITE, AND WHY IT IS A RAISED CHIP
 *
 * White because nothing else on the board is a flat white bar: the snake is
 * dynasty-coloured, terrain is slate, food and the portal are amber and
 * round. The dynasty accent would have tied the mark to the run, but it is
 * also the snake's own colour - the one confusion that matters most. Amber
 * stays spoken for (value), per the INK & AMBER law.
 *
 * The dashes are real low geometry wearing `createInkHullMaterial` - the
 * board's one outline mechanism, at the board's one line weight - rather than
 * an additive decal. That buys three things: depth, correct occlusion (the
 * snake passes OVER its own lead instead of glowing through it), and the
 * guarantee the ink hull exists for - wherever the mark overlaps a lit
 * object, a hard dark edge separates them. Against the dark board the edge is
 * invisible and does not need to be visible; against the snake, terrain or
 * food it is the whole point.
 *
 * WHY IT GLIDES INSTEAD OF SNAPPING
 *
 * The lead hangs off the INTERPOLATED head, so the mark and the head move as
 * one rigid body: the eye is already locked on the head and never has to
 * re-acquire the guide. Snapping the dashes to cell centres would teleport a
 * white object once per tick - 6-10Hz of strobe next to the most important
 * thing on screen, which is exactly the clutter this system replaces. The
 * snapped answer to "which cell am I in" is still given, by the cell tile
 * underneath, which is the same smooth-guide / snapped-tile split Gridlock
 * has always used.
 */
const LEAD_CELLS = 3;
/**
 * Dash length along the heading, per lead cell, in cells.
 *
 * The floor is the aspect ratio, not the arithmetic: measured on the board, a
 * third dash near 0.36 came out square and stopped reading as a dash at all.
 * 0.42 against the 0.28 width is 1.5:1, the shallowest ratio that still reads
 * as "pointing" rather than "sitting", so the taper is spent down to that
 * limit and no further.
 */
const LEAD_LENGTHS = [0.74, 0.58, 0.42];
/** Dash height, per lead cell - a mild recede, the mark stays board-flat. */
const LEAD_HEIGHTS = [0.16, 0.13, 0.1];
/** Width across the heading. Constant: see the taper note above. */
const LEAD_WIDTH = 0.28;
/** Corner radius of the chip, in its own unit space. */
const LEAD_CORNER_RADIUS = 0.09;
/** Paper. The core the ink edge is drawn around. */
const LEAD_PAPER = '#ffffff';

const EMPTY_QUEUE: readonly Direction[] = [];
const EMPTY_SNAKE: readonly Position[] = [];
const EMPTY_OBSTACLES: readonly { x: number; z: number }[] = [];
const EMPTY_TARGETS: readonly AimTarget[] = [];
const NULL_BUFFER = { current: null } as const;

// -----------------------------------------------------------------------------
// Module-scope scratch - the render loops allocate NOTHING
// -----------------------------------------------------------------------------

const _pursuit = new THREE.Vector3();

/** Lead instance authoring - runs at mount only, but never allocates anyway. */
const _leadMatrix = new THREE.Matrix4();
const _leadPosition = new THREE.Vector3();
const _leadScale = new THREE.Vector3();
const _leadRotation = new THREE.Quaternion();

export interface LeadHeadSample {
  /** Interpolated head centre - what the mark glides with. */
  smoothX: number;
  smoothZ: number;
  /** Authoritative head cell - what the tile snaps to. */
  snapX: number;
  snapZ: number;
}

const _headSample: LeadHeadSample = {
  smoothX: 0,
  smoothZ: 0,
  snapX: 0,
  snapZ: 0,
};

const _drawnHead = { x: 0, z: 0 };

/**
 * Where the head is DRAWN this frame, in grid units, under whichever arrival
 * mode is active.
 *
 * Everything glued to the head - THE LEAD, the rails, the drone - samples
 * through this one function. Three copies of the composition is how one of
 * them ends up on a different curve than the creature it is bound to, which is
 * the ET-1 defect reintroduced one layer up. The mode also selects the
 * SAMPLER: glide's motion above 1 is travel toward the next cell and only
 * `getGlideX/Z` resolve it against that anchor.
 *
 * Returns shared module scratch; callers read the fields immediately.
 */
function sampleDrawnHead(buffer: InterpolationBuffer, now: number) {
  const mode = getArrivalMode();
  const motion = arrivalMotion(getAlpha(buffer, now), mode);
  if (mode === 'glide') {
    // Under a pause the whole board composes onto tile centres; the telegraph
    // settles with the head rather than hanging where the glide left it.
    const settle = getRestSettle(buffer, now);
    _drawnHead.x = settleToward(
      getGlideX(buffer, 0, motion),
      buffer.curr[0],
      settle
    );
    _drawnHead.z = settleToward(
      getGlideZ(buffer, 0, motion),
      buffer.curr[1],
      settle
    );
  } else {
    _drawnHead.x = getInterpolatedX(buffer, 0, motion);
    _drawnHead.z = getInterpolatedZ(buffer, 0, motion);
  }
  return _drawnHead;
}

/**
 * The head sample THE LEAD is bound to: the interpolated centre to glide with,
 * and the authoritative cell to snap to.
 *
 * Returns the SHARED module scratch rather than a fresh object - this runs
 * every frame and the render loops in this file allocate nothing. Callers read
 * the fields immediately and never retain the reference. Reading the
 * interpolation buffer never mutates it.
 */
export function readLeadHeadSample(
  head: Position,
  buffer: InterpolationBuffer | null,
  now: number
): LeadHeadSample {
  _headSample.smoothX = head.x;
  _headSample.smoothZ = head.z;
  _headSample.snapX = head.x;
  _headSample.snapZ = head.z;
  if (buffer && buffer.count > 0) {
    // THE LEAD is glued to the head: it is drawn wherever the head is drawn,
    // and it snaps to the cell the simulation is on.
    const drawn = sampleDrawnHead(buffer, now);
    _headSample.smoothX = drawn.x;
    _headSample.smoothZ = drawn.z;
    _headSample.snapX = buffer.curr[0];
    _headSample.snapZ = buffer.curr[1];
  }
  return _headSample;
}

// -----------------------------------------------------------------------------
// Module-scope geometry pools (parameter-free, shared, never disposed)
// -----------------------------------------------------------------------------

const laneGeometry = new THREE.PlaneGeometry(0.86, 0.86);

const chevronGeometry = (() => {
  // Chevron band pointing +Y in shape space; the flat -PI/2 X-rotation
  // maps +Y to -Z (grid UP), matching DIRECTION_YAW.
  const shape = new THREE.Shape();
  shape.moveTo(-0.3, -0.14);
  shape.lineTo(0, 0.22);
  shape.lineTo(0.3, -0.14);
  shape.lineTo(0.18, -0.14);
  shape.lineTo(0, 0.06);
  shape.lineTo(-0.18, -0.14);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
})();

/**
 * THE LEAD's chip: one exact-unit rounded box, so instance SCALE is the sole
 * authority over each dash's footprint, and the analytic bevel normals let the
 * shared ink hull expand continuously instead of splitting at the corners.
 *
 * Both materials are parameter-free (paper and ink are dynasty-independent by
 * design), so they live at module scope as singletons like the board's other
 * ink-hulled objects, rather than being memoized and disposed per mount.
 */
const leadGeometry = createExactUnitRoundedBoxGeometry(LEAD_CORNER_RADIUS);
const leadMaterial = new THREE.MeshBasicMaterial({
  color: LEAD_PAPER,
  // A guide must read at one constant brightness wherever it is on the board;
  // tone mapping would let the arena's lighting decide how loud the aid is.
  toneMapped: false,
});
const leadHullMaterial = createInkHullMaterial();

/** Gridlock rail: unit plane, scaled per axis at mount. */
const railGeometry = new THREE.PlaneGeometry(1, 1);
/** Gridlock snapped-cell highlight. */
const highlightGeometry = new THREE.PlaneGeometry(0.95, 0.95);
/** Gridlock target pip - a diamond. */
const pipGeometry = (() => {
  const geometry = new THREE.PlaneGeometry(0.22, 0.22);
  geometry.rotateZ(Math.PI / 4);
  return geometry;
})();

/** Firefly drone pieces - warm palette, dynasty-independent. */
const fireflyBodyGeometry = new THREE.BoxGeometry(0.15, 0.15, 0.15);
const fireflyHaloGeometry = new THREE.OctahedronGeometry(0.16, 0);
const fireflyBodyMaterial = new THREE.MeshStandardMaterial({
  color: '#ffd98a',
  emissive: '#ffb347',
  emissiveIntensity: 1.3,
  metalness: 0.2,
  roughness: 0.45,
});
const fireflyHaloMaterial = new THREE.MeshBasicMaterial({
  color: '#ffe9b8',
  transparent: true,
  opacity: 0.4,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  wireframe: true,
});

/** Firefly glow sprite - lazy radial texture, one per session. */
let fireflyGlowMaterialSingleton: THREE.SpriteMaterial | null = null;
function getFireflyGlowMaterial(): THREE.SpriteMaterial | null {
  if (fireflyGlowMaterialSingleton) return fireflyGlowMaterialSingleton;
  if (typeof document === 'undefined') return null;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const grad = ctx.createRadialGradient(
    size / 2, size / 2, 2,
    size / 2, size / 2, size / 2
  );
  grad.addColorStop(0, 'rgba(255,225,160,0.9)');
  grad.addColorStop(0.4, 'rgba(255,200,110,0.35)');
  grad.addColorStop(1, 'rgba(255,180,80,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  fireflyGlowMaterialSingleton = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return fireflyGlowMaterialSingleton;
}

// -----------------------------------------------------------------------------
// DEADEYE - the snapped cell tile + THE LEAD
// -----------------------------------------------------------------------------

interface DeadeyeProps {
  head: Position;
  direction: Direction;
  gridSize: number;
  bufferRef: { readonly current: InterpolationBuffer | null };
  color: string;
  torus: boolean;
}

/**
 * Author the three lead chips once, into a shared instance buffer.
 *
 * They live in the group's LOCAL space with the heading along -Z (the same
 * convention `DIRECTION_YAW` already maps the chevron by), so the group's yaw
 * is the only thing that changes on a turn and the matrices themselves are
 * constant for the life of the mount. Dash i sits on the centre of the i-th
 * cell ahead; its base rests at `AIM_Y`, clear of the board graphics.
 */
export function writeLeadInstances(mesh: THREE.InstancedMesh): void {
  _leadRotation.identity();
  for (let i = 0; i < LEAD_CELLS; i += 1) {
    const height = LEAD_HEIGHTS[i];
    _leadPosition.set(0, AIM_Y + height / 2, -(i + 1));
    _leadScale.set(LEAD_WIDTH, height, LEAD_LENGTHS[i]);
    _leadMatrix.compose(_leadPosition, _leadRotation, _leadScale);
    mesh.setMatrixAt(i, _leadMatrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

/**
 * How many lead cells are still on the board.
 *
 * Counted from the AUTHORITATIVE head cell, so the count changes exactly once
 * per tick and never flickers on a fractional interpolated position. A dash
 * drawn past the wall would be a mark on nothing.
 *
 * On a torus the board has no wall to truncate at, so the full lead is always
 * drawn: the group simply carries the dashes over the seam, which is where the
 * snake is going. This is the render half of the same truth `projectAimPath`
 * conservatively omits; nothing here consults or mutates engine state.
 */
export function countLeadCells(
  head: Position,
  direction: Direction,
  gridSize: number,
  torus: boolean
): number {
  if (torus) return LEAD_CELLS;
  const delta = DIRECTION_DELTAS[direction];
  let visible = 0;
  for (let i = 1; i <= LEAD_CELLS; i += 1) {
    const x = head.x + delta.x * i;
    const z = head.z + delta.z * i;
    if (x < 0 || x >= gridSize || z < 0 || z >= gridSize) break;
    visible += 1;
  }
  return visible;
}

function Deadeye({
  head,
  direction,
  gridSize,
  bufferRef,
  color,
  torus,
}: DeadeyeProps) {
  const leadRef = useRef<THREE.Group>(null);
  const chipsRef = useRef<THREE.InstancedMesh>(null);
  const chipsInkRef = useRef<THREE.InstancedMesh>(null);
  const highlightRef = useRef<THREE.Mesh>(null);

  const highlightMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [color]
  );

  useEffect(() => {
    return () => {
      highlightMaterial.dispose();
    };
  }, [highlightMaterial]);

  /**
   * The chips are authored ONCE, on the first frame that has both meshes.
   *
   * On the frame loop rather than in an effect because that is where the
   * instanced meshes are guaranteed to exist and to have survived any
   * geometry or material swap: R3F recreates an `instancedMesh` when its
   * `args` change, and a mount-time effect would have written a buffer that
   * no longer belongs to the mesh on screen. Nothing but the group's
   * transform moves afterwards, so this runs exactly once per mesh identity
   * for the life of the run.
   */
  const authoredRef = useRef<THREE.InstancedMesh | null>(null);

  /**
   * Wall clip, recomputed per TICK (the head prop is a new object each tick),
   * never per frame.
   */
  const leadCount = useMemo(
    () => countLeadCells(head, direction, gridSize, torus),
    [head, direction, gridSize, torus]
  );

  useFrame(({ clock }) => {
    const chipsMesh = chipsRef.current;
    const inkMesh = chipsInkRef.current;
    if (chipsMesh && inkMesh && authoredRef.current !== chipsMesh) {
      authoredRef.current = chipsMesh;
      writeLeadInstances(chipsMesh);
      // The ink hull is the identical instance set: the expansion happens in
      // its vertex shader, so it needs one typed-array copy, never a second
      // transform pass.
      (inkMesh.instanceMatrix.array as Float32Array).set(
        chipsMesh.instanceMatrix.array as Float32Array
      );
      inkMesh.instanceMatrix.needsUpdate = true;
    }

    const sample = readLeadHeadSample(head, bufferRef.current, performance.now());
    // The lead rides the SMOOTH head, so the mark and the head move as one
    // rigid body; the tile snaps to the authoritative cell. That is the same
    // smooth-guide / snapped-tile split Gridlock has always used.
    const lead = leadRef.current;
    if (lead) {
      lead.position.set(sample.smoothX + 0.5, 0, sample.smoothZ + 0.5);
    }
    const chips = chipsRef.current;
    const ink = chipsInkRef.current;
    if (chips) chips.count = leadCount;
    if (ink) ink.count = leadCount;
    const highlight = highlightRef.current;
    if (highlight) {
      highlight.position.set(
        sample.snapX + 0.5,
        AIM_Y - 0.01,
        sample.snapZ + 0.5
      );
    }
    // Exact reuse of Gridlock's quiet current-cell breathe (~0.35Hz).
    highlightMaterial.opacity =
      0.28 + Math.sin(clock.getElapsedTime() * 2.2) * 0.05;
  });

  return (
    <group>
      {/* Authoritative grid cell: snapped, visual-only, below the snake. */}
      <mesh
        ref={highlightRef}
        name="deadeye-head-cell-highlight"
        geometry={highlightGeometry}
        material={highlightMaterial}
        position={[head.x + 0.5, AIM_Y - 0.01, head.z + 0.5]}
        rotation-x={-Math.PI / 2}
      />

      {/* THE LEAD - the next three cells, in two draw calls. The yaw is a
          declarative prop, so a turn costs nothing per frame, and it SNAPS:
          a guide that eases into a turn spends that ease telling the player
          something that stopped being true a tick ago. */}
      <group
        ref={leadRef}
        name="deadeye-lead"
        rotation-y={DIRECTION_YAW[direction]}
      >
        <instancedMesh
          ref={chipsInkRef}
          name="deadeye-lead-ink"
          args={[leadGeometry, leadHullMaterial, LEAD_CELLS]}
          frustumCulled={false}
          renderOrder={-1}
        />
        <instancedMesh
          ref={chipsRef}
          name="deadeye-lead-chips"
          args={[leadGeometry, leadMaterial, LEAD_CELLS]}
          frustumCulled={false}
        />
      </group>
    </group>
  );
}

// -----------------------------------------------------------------------------
// GRIDLOCK
// -----------------------------------------------------------------------------

interface GridlockProps {
  head: Position;
  targets: readonly AimTarget[];
  gridSize: number;
  bufferRef: { readonly current: InterpolationBuffer | null };
  color: string;
  laneColor: string;
}

function Gridlock({ head, targets, gridSize, bufferRef, color, laneColor }: GridlockProps) {
  const rowRailRef = useRef<THREE.Mesh>(null);
  const colRailRef = useRef<THREE.Mesh>(null);
  const highlightRef = useRef<THREE.Mesh>(null);

  const rowMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: laneColor,
        transparent: true,
        opacity: 0.14,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [laneColor]
  );
  const colMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: laneColor,
        transparent: true,
        opacity: 0.14,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [laneColor]
  );
  const highlightMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [color]
  );
  const pipMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [color]
  );

  useEffect(() => {
    return () => {
      rowMaterial.dispose();
      colMaterial.dispose();
      highlightMaterial.dispose();
      pipMaterial.dispose();
    };
  }, [rowMaterial, colMaterial, highlightMaterial, pipMaterial]);

  // Per-tick alignment scan
  const aligned = useMemo(() => findAlignedTargets(head, targets), [head, targets]);

  useFrame(({ clock }) => {
    const buffer = bufferRef.current;
    const time = clock.getElapsedTime();
    // Rails glide with the interpolated head; the highlight SNAPS to the
    // authoritative cell - together they answer "where exactly am I"
    let smoothX = head.x;
    let smoothZ = head.z;
    let snapX = head.x;
    let snapZ = head.z;
    if (buffer && buffer.count > 0) {
      const drawn = sampleDrawnHead(buffer, performance.now());
      smoothX = drawn.x;
      smoothZ = drawn.z;
      snapX = buffer.curr[0];
      snapZ = buffer.curr[1];
    }
    if (rowRailRef.current) {
      rowRailRef.current.position.set(gridSize / 2, AIM_Y - 0.02, smoothZ + 0.5);
    }
    if (colRailRef.current) {
      colRailRef.current.position.set(smoothX + 0.5, AIM_Y - 0.02, gridSize / 2);
    }
    if (highlightRef.current) {
      highlightRef.current.position.set(snapX + 0.5, AIM_Y - 0.01, snapZ + 0.5);
    }
    // Aligned rails brighten (steady lift + a slow ~0.35Hz breathe)
    const breathe = Math.sin(time * 2.2) * 0.03;
    rowMaterial.opacity = (aligned.row ? 0.34 : 0.14) + breathe;
    colMaterial.opacity = (aligned.col ? 0.34 : 0.14) + breathe;
    highlightMaterial.opacity = 0.28 + Math.sin(time * 2.2) * 0.05;
  });

  return (
    <group>
      {/* Row rail (spans X at the head's row) */}
      <mesh
        ref={rowRailRef}
        geometry={railGeometry}
        material={rowMaterial}
        rotation-x={-Math.PI / 2}
        scale={[gridSize, 0.92, 1]}
      />
      {/* Column rail (spans Z at the head's column) */}
      <mesh
        ref={colRailRef}
        geometry={railGeometry}
        material={colMaterial}
        rotation-x={-Math.PI / 2}
        scale={[0.92, gridSize, 1]}
      />
      {/* Snapped cell highlight - the authoritative cell under the head */}
      <mesh
        ref={highlightRef}
        geometry={highlightGeometry}
        material={highlightMaterial}
        rotation-x={-Math.PI / 2}
      />
      {/* Alignment pips at the rail targets (pre-mounted, toggled) */}
      <mesh
        geometry={pipGeometry}
        material={pipMaterial}
        visible={aligned.row !== null}
        position={[(aligned.row?.x ?? 0) + 0.5, AIM_Y + 0.01, (aligned.row?.z ?? 0) + 0.5]}
        rotation-x={-Math.PI / 2}
      />
      <mesh
        geometry={pipGeometry}
        material={pipMaterial}
        visible={aligned.col !== null}
        position={[(aligned.col?.x ?? 0) + 0.5, AIM_Y + 0.01, (aligned.col?.z ?? 0) + 0.5]}
        rotation-x={-Math.PI / 2}
      />
    </group>
  );
}

// -----------------------------------------------------------------------------
// PATHLINE (verbatim port of the v1 vector+sequence+radar layers)
// -----------------------------------------------------------------------------

interface PathlineProps {
  head: Position;
  direction: Direction;
  queuedDirections: readonly Direction[];
  snake: readonly Position[];
  obstacles: readonly { x: number; z: number }[];
  gridSize: number;
  color: string;
  laneColor: string;
}

function Pathline({
  head,
  direction,
  queuedDirections,
  snake,
  obstacles,
  gridSize,
  color,
  laneColor,
}: PathlineProps) {
  const laneMaterials = useMemo(
    () =>
      LANE_OPACITIES.map(
        (opacity) =>
          new THREE.MeshBasicMaterial({
            color: laneColor,
            transparent: true,
            opacity,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          })
      ),
    [laneColor]
  );
  const dangerMaterials = useMemo(
    () =>
      DANGER_OPACITIES.map(
        (opacity) =>
          new THREE.MeshBasicMaterial({
            color: DANGER_COLOR,
            transparent: true,
            opacity,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          })
      ),
    []
  );
  const headingMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    [color]
  );
  const turnMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#e6edf3',
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    []
  );

  useEffect(() => {
    return () => {
      laneMaterials.forEach((m) => m.dispose());
      dangerMaterials.forEach((m) => m.dispose());
      headingMaterial.dispose();
      turnMaterial.dispose();
    };
  }, [laneMaterials, dangerMaterials, headingMaterial, turnMaterial]);

  // Gentle pulse on the heading chevron (~0.8Hz) - one opacity write
  useFrame(({ clock }) => {
    headingMaterial.opacity = 0.65 + Math.sin(clock.getElapsedTime() * 5) * 0.2;
  });

  // Projected path (true engine path: queued turns applied per tick)
  const path = useMemo(
    () => projectAimPath(head, direction, queuedDirections, gridSize, LANE_LENGTH),
    [head, direction, queuedDirections, gridSize]
  );

  // Danger scan (committed heading only, no queue)
  const danger = useMemo(
    () => projectDangerPath(
      head,
      direction,
      snake,
      gridSize,
      LANE_LENGTH,
      obstacles
    ),
    [head, direction, snake, gridSize, obstacles]
  );
  const dangerCells = danger.impact ? danger.cells : [];

  const headingDelta = DIRECTION_DELTAS[direction];

  return (
    <group>
      {/* Heading chevron - committed direction, at the head's front edge */}
      <group
        position={[
          head.x + 0.5 + headingDelta.x * 0.55,
          AIM_Y + 0.015,
          head.z + 0.5 + headingDelta.z * 0.55,
        ]}
        rotation-y={DIRECTION_YAW[direction]}
      >
        <mesh
          geometry={chevronGeometry}
          material={headingMaterial}
          rotation-x={-Math.PI / 2}
          scale={0.85}
        />
      </group>

      {/* Projected path lane - fades with distance */}
      {path.map((cell, i) => (
        <mesh
          key={`lane-${i}`}
          geometry={laneGeometry}
          material={laneMaterials[i]}
          position={[cell.x + 0.5, AIM_Y - 0.02, cell.z + 0.5]}
          rotation-x={-Math.PI / 2}
        />
      ))}

      {/* Queued-turn chevrons - input-registered confirmation */}
      {path.map((cell, i) =>
        cell.isTurn ? (
          <group
            key={`turn-${i}`}
            position={[cell.x + 0.5, AIM_Y + 0.01, cell.z + 0.5]}
            rotation-y={DIRECTION_YAW[cell.direction]}
          >
            <mesh
              geometry={chevronGeometry}
              material={turnMaterial}
              rotation-x={-Math.PI / 2}
            />
          </group>
        ) : null
      )}

      {/* Danger sense - rose tint rising toward the impact, above the lane */}
      {dangerCells.map((cell, i) => (
        <mesh
          key={`danger-${i}`}
          geometry={laneGeometry}
          material={
            dangerMaterials[
              Math.min(dangerCells.length - 1 - i, DANGER_OPACITIES.length - 1)
            ]
          }
          position={[cell.x + 0.5, AIM_Y - 0.01, cell.z + 0.5]}
          rotation-x={-Math.PI / 2}
        />
      ))}
    </group>
  );
}

// -----------------------------------------------------------------------------
// FIREFLY
// -----------------------------------------------------------------------------

interface FireflyProps {
  head: Position;
  targets: readonly AimTarget[];
  bufferRef: { readonly current: InterpolationBuffer | null };
}

/** Drone hover height over the board. */
const FIREFLY_HOVER = 1.15;

function Firefly({ head, targets, bufferRef }: FireflyProps) {
  const droneRef = useRef<THREE.Group>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const spriteRef = useRef<THREE.Sprite>(null);
  const initializedRef = useRef(false);

  const glowMaterial = getFireflyGlowMaterial();

  // The drone's quarry: the nearest food on the board (per tick)
  const quarry = useMemo(() => {
    let best: AimTarget | null = null;
    let bestDistance = Infinity;
    for (const t of targets) {
      if (t.kind !== 'food') continue;
      const distance = Math.abs(t.x - head.x) + Math.abs(t.z - head.z);
      if (distance < bestDistance) {
        best = t;
        bestDistance = distance;
      }
    }
    return best;
  }, [targets, head]);

  useFrame(({ clock }, delta) => {
    const drone = droneRef.current;
    if (!drone) return;
    const time = clock.getElapsedTime();

    // Destination: hover over the quarry; drift home to the head when
    // the board is bare (reads as "waiting for the next course")
    if (quarry) {
      _pursuit.set(quarry.x + 0.5, FIREFLY_HOVER, quarry.z + 0.5);
    } else {
      const buffer = bufferRef.current;
      if (buffer && buffer.count > 0) {
        // The drone drifts home to where the head IS drawn, not to where a
        // plain blend would have put it.
        const drawn = sampleDrawnHead(buffer, performance.now());
        _pursuit.set(drawn.x + 0.5, FIREFLY_HOVER + 0.4, drawn.z + 0.5);
      } else {
        _pursuit.set(head.x + 0.5, FIREFLY_HOVER + 0.4, head.z + 0.5);
      }
    }

    if (!initializedRef.current) {
      initializedRef.current = true;
      drone.position.copy(_pursuit);
    }

    // Eased pursuit (exponential damp) + a happy bob (~0.35Hz)
    const ease = 1 - Math.exp(-2.4 * delta);
    // Cute banking: lean into the direction of travel (before the move)
    const leanX = (_pursuit.z - drone.position.z) * 0.22;
    const leanZ = (drone.position.x - _pursuit.x) * 0.22;
    drone.rotation.x += (Math.max(-0.4, Math.min(0.4, leanX)) - drone.rotation.x) * ease;
    drone.rotation.z += (Math.max(-0.4, Math.min(0.4, leanZ)) - drone.rotation.z) * ease;
    drone.position.x += (_pursuit.x - drone.position.x) * ease;
    drone.position.z += (_pursuit.z - drone.position.z) * ease;
    drone.position.y +=
      (_pursuit.y + Math.sin(time * 2.2) * 0.09 - drone.position.y) * ease;

    // Halo tumbles lazily; glow breathes (~0.4Hz, small)
    if (haloRef.current) {
      haloRef.current.rotation.y += delta * 1.1;
      haloRef.current.rotation.x += delta * 0.4;
    }
    if (spriteRef.current) {
      const breathe = 1 + Math.sin(time * 2.5) * 0.08;
      spriteRef.current.scale.set(0.85 * breathe, 0.85 * breathe, 1);
    }
  });

  return (
    <group ref={droneRef}>
      <mesh geometry={fireflyBodyGeometry} material={fireflyBodyMaterial} />
      <mesh ref={haloRef} geometry={fireflyHaloGeometry} material={fireflyHaloMaterial} />
      {glowMaterial && (
        <sprite ref={spriteRef} material={glowMaterial} scale={[0.85, 0.85, 1]} />
      )}
    </group>
  );
}

// -----------------------------------------------------------------------------
// Public renderer
// -----------------------------------------------------------------------------

export function AimRenderer({
  headPosition = null,
  direction = 'RIGHT',
  queuedDirections = EMPTY_QUEUE,
  snake = EMPTY_SNAKE,
  obstacles = EMPTY_OBSTACLES,
  gridSize = 20,
  aimSystem = 'deadeye',
  targets = EMPTY_TARGETS,
  bufferRef = NULL_BUFFER,
  color = '#22d3ee',
  laneColor = '#22d3ee',
  torus = false,
}: AimRendererProps) {
  if (!headPosition) return null;

  switch (aimSystem) {
    case 'gridlock':
      return (
        <Gridlock
          head={headPosition}
          targets={targets}
          gridSize={gridSize}
          bufferRef={bufferRef}
          color={color}
          laneColor={laneColor}
        />
      );
    case 'pathline':
      return (
        <Pathline
          head={headPosition}
          direction={direction}
          queuedDirections={queuedDirections}
          snake={snake}
          obstacles={obstacles}
          gridSize={gridSize}
          color={color}
          laneColor={laneColor}
        />
      );
    case 'firefly':
      return <Firefly head={headPosition} targets={targets} bufferRef={bufferRef} />;
    case 'deadeye':
    default:
      return (
        <Deadeye
          head={headPosition}
          direction={direction}
          gridSize={gridSize}
          bufferRef={bufferRef}
          color={color}
          torus={torus}
        />
      );
  }
}

export default AimRenderer;
