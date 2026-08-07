/**
 * ET-5 - THE CANONICAL COMPETITIVE VIEWPOINT.
 *
 * The board camera is part of the competitive conditions, not a presentation
 * preference: where the camera stands decides how much screen a cell of
 * approach to each wall is worth, and therefore how much reaction time the
 * player is actually given on that side of the board. Two players on the same
 * ladder must be reading the same geometry, so the viewpoint is a RULING, and
 * it is recorded like one - in the Product Constitution (v1.16, §5 and §15
 * row 38) as well as here.
 *
 * THE RATIFIED VIEWPOINT (owner, 7 August 2026), quoted from the ET-5 camera
 * surveyor with the legibility meter visible while playing the real board:
 *
 *     az=+0.0 pitch=28.0 fit=1.00 target=+0.0,+0.0 fov=44 far/near=0.68
 *
 * az      signed degrees from DEFAULT_AZIMUTH (the south-side basis)
 * pitch   degrees from straight down, i.e. the polar angle from zenith
 * fit     distance as a MULTIPLE of the board's own auto-fit distance, which
 *         is what makes the number viewport-independent
 * target  orbit target offset from board centre, in cells
 * fov     vertical field of view
 * far/near  the legibility ratio measured below
 *
 * THE 0.68 IS AN INFORMED TRADE, NOT A MISS. The surveyor grades far/near
 * against 0.70 - the ratio the shipped 26-degree camera measures, and the
 * number ET-5 nominated as its acceptance threshold. The owner surveyed with
 * that meter reading amber and ratified 28 degrees anyway, buying the stronger
 * vertical read the art direction needs at a cost of two points of far-row
 * legibility. Do NOT "restore" 0.70: that is reverting a ruling. It is
 * revisited only on far-row death-forensics evidence, through the
 * Constitution's amendment process.
 *
 * Nothing here is r3f-aware on purpose: these are the numbers and the
 * measurement, so the rig, the fairness gate and the verifiers all read one
 * definition instead of three copies that can drift apart.
 */

import * as THREE from 'three';

/** Signed degrees from the south-side basis. The board is viewed square-on. */
export const CANONICAL_AZIMUTH_DEG = 0;
/** Degrees from zenith. 28 from straight down = 62 above the board plane. */
export const CANONICAL_POLAR_DEG = 28;
/** Vertical field of view, degrees. */
export const CANONICAL_FOV = 44;
/** Distance as a multiple of the board's own auto-fit distance. */
export const CANONICAL_FIT_MULTIPLE = 1;

/**
 * How closely a rendered camera must match the ruling before a verifier calls
 * it the canonical viewpoint. Half a degree is far below the threshold at
 * which the geometry changes measurably and far above float noise in the
 * projection round-trip.
 */
export const CANONICAL_ANGLE_TOLERANCE_DEG = 0.5;
/** Same idea for the fit multiple - 1% of the auto-fit distance. */
export const CANONICAL_FIT_TOLERANCE = 0.01;

/**
 * FAR/NEAR - the ratified legibility ratio, and the number the ruling trades.
 *
 * The on-screen size of one cell of approach to the FAR wall over the same
 * thing at the NEAR wall. Measured, not estimated: see `measureWallApproach`.
 *
 * 0.677366 is exact and viewport-INDEPENDENT on every landscape aspect at or
 * above ~1.13, because past that point the auto-fit is driven by the board's
 * vertical extent and the distance stops depending on width. Portrait aspects
 * fit from further away and therefore measure HIGHER (0.77 at 3:4, 0.84 at
 * 9:19.5) - kinder, never harsher. So the landscape value is the global floor,
 * and pinning it pins the worst case every player can see.
 *
 * For the record, the same measurement across candidate pitches at the shipped
 * fit (fov 44, frame margin 1.175, fit scale 1.41, landscape):
 *
 *     16 deg  0.799      26 deg  0.696   <- the camera this ruling replaces
 *     20 deg  0.756      28 deg  0.677   <- RATIFIED
 *     24 deg  0.716      30 deg  0.659
 *                        34 deg  0.621
 */
export const CANONICAL_FAR_NEAR_RATIO = 0.6774;

/**
 * SIDE/NEAR - the same measure for the two side walls, which sit between the
 * far and near rows because their midpoints sit at the board's centre depth.
 * Also exact and viewport-independent across landscape aspects.
 */
export const CANONICAL_SIDE_NEAR_RATIO = 0.9299;

/**
 * Tolerance on both ratios. The landscape values are analytically constant, so
 * this covers the rounding of the pinned literals to four places plus
 * projection float noise - it is NOT a licence to drift the pitch.
 */
export const CANONICAL_RATIO_TOLERANCE = 0.001;

/** The four board boundaries, named as the player would name them. */
export type WallSide = 'north' | 'south' | 'east' | 'west';

export const WALL_SIDES: readonly WallSide[] = ['north', 'south', 'east', 'west'];

export interface WallApproachMetrics {
  /**
   * On-screen length, in device-independent pixels, of ONE CELL OF APPROACH to
   * this wall, measured at the middle of the wall. This is the quantity that
   * decides how much warning a player gets before a fatal boundary: it is the
   * screen distance the head visibly covers per tick as it closes on that side.
   */
  readonly approachPx: number;
  /** Squared world distance from the camera to the sampled wall cell. */
  readonly cameraDistanceSq: number;
}

export type WallApproachReport = Record<WallSide, WallApproachMetrics>;

/**
 * The cell centre pair sampled for each wall: the boundary cell at the middle
 * of that wall, and its neighbour one step INTO the board, perpendicular to
 * the wall. Perpendicular is the point - the approach to a wall is the axis a
 * player is judging when they decide whether they have room for one more tick.
 */
function wallSamples(
  gridSize: number
): Record<WallSide, readonly [THREE.Vector3, THREE.Vector3]> {
  const mid = gridSize / 2 + 0.5;
  const lo = 0.5;
  const hi = gridSize - 0.5;
  return {
    north: [new THREE.Vector3(mid, 0, lo), new THREE.Vector3(mid, 0, lo + 1)],
    south: [new THREE.Vector3(mid, 0, hi), new THREE.Vector3(mid, 0, hi - 1)],
    west: [new THREE.Vector3(lo, 0, mid), new THREE.Vector3(lo + 1, 0, mid)],
    east: [new THREE.Vector3(hi, 0, mid), new THREE.Vector3(hi - 1, 0, mid)],
  };
}

/**
 * Screen-space length of the segment between two world points, in device
 * pixels. The full 2D magnitude rather than a single axis, so the number means
 * the same thing for a wall the player approaches sideways as for one they
 * approach up the screen.
 */
function projectedSegmentPx(
  camera: THREE.PerspectiveCamera,
  from: THREE.Vector3,
  to: THREE.Vector3,
  viewportWidth: number,
  viewportHeight: number
): number {
  const a = from.clone().project(camera);
  const b = to.clone().project(camera);
  if (!Number.isFinite(a.x) || !Number.isFinite(b.x)) return 0;
  if (Math.abs(a.z) > 1 || Math.abs(b.z) > 1) return 0;
  return Math.hypot(
    (b.x - a.x) * viewportWidth * 0.5,
    (b.y - a.y) * viewportHeight * 0.5
  );
}

/**
 * Measure one cell of approach to each of the four walls, through the camera
 * exactly as it is currently posed. The camera's world matrix must already be
 * up to date (`updateMatrixWorld()`), because `project` reads it.
 */
export function measureWallApproach(
  camera: THREE.PerspectiveCamera,
  gridSize: number,
  viewportWidth: number,
  viewportHeight: number
): WallApproachReport {
  const samples = wallSamples(gridSize);
  const report = {} as Record<WallSide, WallApproachMetrics>;
  for (const side of WALL_SIDES) {
    const [cell, inward] = samples[side];
    report[side] = {
      approachPx: projectedSegmentPx(
        camera,
        cell,
        inward,
        viewportWidth,
        viewportHeight
      ),
      cameraDistanceSq: camera.position.distanceToSquared(cell),
    };
  }
  return report;
}

/**
 * far/near for the current pose: the approach size at whichever of the two
 * depth walls is further from the camera, over the nearer one. Decided by
 * distance rather than by assuming the shipped azimuth, so the number stays
 * honest in the dev surveyor, which orbits.
 */
export function farNearRatio(report: WallApproachReport): number {
  const northIsFar = report.north.cameraDistanceSq > report.south.cameraDistanceSq;
  const far = northIsFar ? report.north : report.south;
  const near = northIsFar ? report.south : report.north;
  return near.approachPx > 1e-4 ? far.approachPx / near.approachPx : 0;
}

/** side/near, using the same near row `farNearRatio` picked. */
export function sideNearRatio(report: WallApproachReport): number {
  const northIsFar = report.north.cameraDistanceSq > report.south.cameraDistanceSq;
  const near = northIsFar ? report.south : report.north;
  const side = Math.min(report.east.approachPx, report.west.approachPx);
  return near.approachPx > 1e-4 ? side / near.approachPx : 0;
}

export interface ViewpointReadout {
  /** Signed degrees from `CANONICAL_AZIMUTH_DEG`, folded into (-180, 180]. */
  readonly azimuthDeg: number;
  /** Degrees from zenith. */
  readonly polarDeg: number;
  /** Camera-to-target distance, world units. */
  readonly distance: number;
  /** `distance` as a multiple of the auto-fit distance it was given. */
  readonly fitMultiple: number;
  /** Vertical field of view, degrees. */
  readonly fov: number;
  /** far/near for this pose. */
  readonly farNear: number;
}

/** Fold any angle into (-180, 180] so its sign always reads as "which way". */
export function normalizeSignedDegrees(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  let value = degrees % 360;
  if (value > 180) value -= 360;
  if (value <= -180) value += 360;
  return value;
}

/**
 * Read the viewpoint back OUT of a posed camera.
 *
 * Deliberately derived from `camera.position` and the live projection rather
 * than echoed from the constants that posed it: a readout that repeats its own
 * input proves nothing, and the whole job of this function is to let a verifier
 * assert that the canonical angle is what actually renders.
 */
export function readViewpoint(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  fitDistance: number,
  gridSize: number,
  viewportWidth: number,
  viewportHeight: number
): ViewpointReadout {
  const offset = camera.position.clone().sub(target);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  const report = measureWallApproach(camera, gridSize, viewportWidth, viewportHeight);
  return {
    azimuthDeg: normalizeSignedDegrees(
      THREE.MathUtils.radToDeg(spherical.theta) - CANONICAL_AZIMUTH_DEG
    ),
    polarDeg: THREE.MathUtils.radToDeg(spherical.phi),
    distance: offset.length(),
    fitMultiple: fitDistance > 0 ? offset.length() / fitDistance : 0,
    fov: camera.fov,
    farNear: farNearRatio(report),
  };
}
