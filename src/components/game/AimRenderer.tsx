'use client';

/**
 * AimRenderer - the aim telegraph, one renderer per selected aim system
 * (v2 meta-progression, see src/lib/game/aimSystems.ts):
 *
 * - deadeye:  heading-relative T guide smooth-following the head: its
 *             crossbar spans the board and its forward stem reaches the
 *             wall, plus a grid-snapped cell highlight under the head.
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
  getInterpolatedX,
  getInterpolatedZ,
} from '@/lib/game/interpolationBuffer';
import {
  DIRECTION_DELTAS,
  DIRECTION_YAW,
  findAlignedTargets,
  projectAimPath,
  projectDangerPath,
  type AimTarget,
} from './aimUtils';

export interface AimRendererProps {
  /** Snake head cell (null when not playing) */
  headPosition?: Position | null;
  /** Current committed heading */
  direction?: Direction;
  /** Buffered direction inputs (engine consumption order) */
  queuedDirections?: readonly Direction[];
  /** Full snake (for the pathline danger scan) */
  snake?: readonly Position[];
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

/** Deadeye guide line dimensions. */
const DEADEYE_LINE_THICKNESS = 0.06;
const DEADEYE_LINE_Y = 0.06;

const EMPTY_QUEUE: readonly Direction[] = [];
const EMPTY_SNAKE: readonly Position[] = [];
const EMPTY_TARGETS: readonly AimTarget[] = [];
const NULL_BUFFER = { current: null } as const;

// -----------------------------------------------------------------------------
// Module-scope scratch - the render loops allocate NOTHING
// -----------------------------------------------------------------------------

const _pursuit = new THREE.Vector3();

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

/** Deadeye guide: one unit plane shared by the crossbar and forward stem. */
const crosshairLineGeometry = new THREE.PlaneGeometry(1, 1);

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
// DEADEYE
// -----------------------------------------------------------------------------

interface DeadeyeProps {
  head: Position;
  direction: Direction;
  gridSize: number;
  bufferRef: { readonly current: InterpolationBuffer | null };
  color: string;
}

interface PositionWriter {
  set(x: number, y: number, z: number): unknown;
}

interface TransformWriter {
  position: PositionWriter;
  scale: PositionWriter;
}

type VectorTuple = [number, number, number];

export interface DeadeyeGuideLayout {
  crossbar: {
    position: VectorTuple;
    scale: VectorTuple;
  };
  stem: {
    position: VectorTuple;
    scale: VectorTuple;
  };
}

/**
 * Write the two T-guide transforms without allocating in the render loop.
 * The crossbar spans the complete board perpendicular to the heading. The
 * stem starts at the head center and ends exactly at the forward boundary.
 */
function writeDeadeyeGuideTransforms(
  headCenterX: number,
  headCenterZ: number,
  direction: Direction,
  gridSize: number,
  crossbar: TransformWriter,
  stem: TransformWriter
): void {
  const delta = DIRECTION_DELTAS[direction];
  const boardCenter = gridSize / 2;

  if (delta.x !== 0) {
    const forwardEdge = delta.x > 0 ? gridSize : 0;
    crossbar.position.set(headCenterX, DEADEYE_LINE_Y, boardCenter);
    crossbar.scale.set(DEADEYE_LINE_THICKNESS, gridSize, 1);
    stem.position.set((headCenterX + forwardEdge) / 2, DEADEYE_LINE_Y, headCenterZ);
    stem.scale.set(Math.abs(forwardEdge - headCenterX), DEADEYE_LINE_THICKNESS, 1);
    return;
  }

  const forwardEdge = delta.z > 0 ? gridSize : 0;
  crossbar.position.set(boardCenter, DEADEYE_LINE_Y, headCenterZ);
  crossbar.scale.set(gridSize, DEADEYE_LINE_THICKNESS, 1);
  stem.position.set(headCenterX, DEADEYE_LINE_Y, (headCenterZ + forwardEdge) / 2);
  stem.scale.set(DEADEYE_LINE_THICKNESS, Math.abs(forwardEdge - headCenterZ), 1);
}

/** Initial-render layout; per-frame updates use the allocation-free writer. */
export function getDeadeyeGuideLayout(
  head: Position,
  direction: Direction,
  gridSize: number
): DeadeyeGuideLayout {
  const crossbar = {
    position: new THREE.Vector3(),
    scale: new THREE.Vector3(),
  };
  const stem = {
    position: new THREE.Vector3(),
    scale: new THREE.Vector3(),
  };
  writeDeadeyeGuideTransforms(
    head.x + 0.5,
    head.z + 0.5,
    direction,
    gridSize,
    crossbar,
    stem
  );
  return {
    crossbar: {
      position: crossbar.position.toArray() as VectorTuple,
      scale: crossbar.scale.toArray() as VectorTuple,
    },
    stem: {
      position: stem.position.toArray() as VectorTuple,
      scale: stem.scale.toArray() as VectorTuple,
    },
  };
}

/**
 * Track the guide and floor cue without mutating engine or movement state.
 * The T guide follows the same interpolated head position as the snake;
 * the tile deliberately uses the current authoritative cell, matching the
 * existing Gridlock visual-feedback contract.
 */
export function updateDeadeyeVisualTransforms(
  head: Position,
  direction: Direction,
  gridSize: number,
  buffer: InterpolationBuffer | null,
  now: number,
  crossbar: TransformWriter,
  stem: TransformWriter,
  highlightPosition: PositionWriter
): void {
  let smoothX = head.x;
  let smoothZ = head.z;
  let snapX = head.x;
  let snapZ = head.z;

  if (buffer && buffer.count > 0) {
    const alpha = getAlpha(buffer, now);
    smoothX = getInterpolatedX(buffer, 0, alpha);
    smoothZ = getInterpolatedZ(buffer, 0, alpha);
    snapX = buffer.curr[0];
    snapZ = buffer.curr[1];
  }

  writeDeadeyeGuideTransforms(
    smoothX + 0.5,
    smoothZ + 0.5,
    direction,
    gridSize,
    crossbar,
    stem
  );
  highlightPosition.set(snapX + 0.5, AIM_Y - 0.01, snapZ + 0.5);
}

function Deadeye({ head, direction, gridSize, bufferRef, color }: DeadeyeProps) {
  const crossbarRef = useRef<THREE.Mesh>(null);
  const stemRef = useRef<THREE.Mesh>(null);
  const highlightRef = useRef<THREE.Mesh>(null);
  const initialGuide = useMemo(
    () => getDeadeyeGuideLayout(head, direction, gridSize),
    [head, direction, gridSize]
  );

  const crosshairMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.68,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [color]
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

  useEffect(() => {
    return () => {
      crosshairMaterial.dispose();
      highlightMaterial.dispose();
    };
  }, [crosshairMaterial, highlightMaterial]);

  useFrame(({ clock }) => {
    const crossbar = crossbarRef.current;
    const stem = stemRef.current;
    const highlight = highlightRef.current;
    if (crossbar && stem && highlight) {
      updateDeadeyeVisualTransforms(
        head,
        direction,
        gridSize,
        bufferRef.current,
        performance.now(),
        crossbar,
        stem,
        highlight.position
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

      {/* Board-wide crossbar plus a stem that projects only toward the heading. */}
      <group name="deadeye-crosshair">
        <mesh
          ref={crossbarRef}
          name="deadeye-crosshair-crossbar"
          geometry={crosshairLineGeometry}
          material={crosshairMaterial}
          position={initialGuide.crossbar.position}
          rotation-x={-Math.PI / 2}
          scale={initialGuide.crossbar.scale}
        />
        <mesh
          ref={stemRef}
          name="deadeye-crosshair-stem"
          geometry={crosshairLineGeometry}
          material={crosshairMaterial}
          position={initialGuide.stem.position}
          rotation-x={-Math.PI / 2}
          scale={initialGuide.stem.scale}
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
      const alpha = getAlpha(buffer, performance.now());
      smoothX = getInterpolatedX(buffer, 0, alpha);
      smoothZ = getInterpolatedZ(buffer, 0, alpha);
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
  gridSize: number;
  color: string;
  laneColor: string;
}

function Pathline({
  head,
  direction,
  queuedDirections,
  snake,
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
    () => projectDangerPath(head, direction, snake, gridSize, LANE_LENGTH),
    [head, direction, snake, gridSize]
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
        const alpha = getAlpha(buffer, performance.now());
        _pursuit.set(
          getInterpolatedX(buffer, 0, alpha) + 0.5,
          FIREFLY_HOVER + 0.4,
          getInterpolatedZ(buffer, 0, alpha) + 0.5
        );
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
  gridSize = 20,
  aimSystem = 'deadeye',
  targets = EMPTY_TARGETS,
  bufferRef = NULL_BUFFER,
  color = '#22d3ee',
  laneColor = '#22d3ee',
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
        />
      );
  }
}

export default AimRenderer;
