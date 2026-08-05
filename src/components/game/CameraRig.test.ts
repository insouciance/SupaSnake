/**
 * CameraRig fit-math tests.
 *
 * The iterative corner-projection auto-fit must produce a distance at which
 * the whole board (plus margin cells) is inside the viewport with a small
 * margin - at any aspect ratio and at the tilted default pitch.
 */

// The module under test imports r3f/drei for the component half; only the
// pure fit math is exercised here, so both are mocked away (ESM packages
// that next/jest does not transform).
jest.mock('@react-three/fiber', () => ({
  useFrame: jest.fn(),
  useThree: jest.fn(),
}));
jest.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
}));

import * as THREE from 'three';
import { SLAB_THICKNESS } from './ArenaFloor';
import { COCKPIT_CANVAS_OVERHANG } from './screen/gameScreenTokens';
import {
  buildFitPoints,
  COCKPIT_BASE_FIT_SCALE,
  COCKPIT_DEFAULT_POLAR,
  COCKPIT_FIT_SCALE,
  COCKPIT_FRAME_MARGIN,
  COCKPIT_TARGET_Y,
  computeFitDistance,
  DEFAULT_AZIMUTH,
  DEFAULT_POLAR,
  MIN_POLAR,
  MAX_POLAR,
} from './CameraRig';

const GRID = 20;
const FOV = 50;
const COCKPIT_FOV = 44;

function maxNdcExtent(
  fov: number,
  aspect: number,
  dir: THREE.Vector3,
  target: THREE.Vector3,
  points: THREE.Vector3[],
  distance: number
): number {
  const cam = new THREE.PerspectiveCamera(fov, aspect, 0.1, 1000);
  cam.position.copy(target).addScaledVector(dir, distance);
  cam.lookAt(target);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  const v = new THREE.Vector3();
  let extent = 0;
  for (const p of points) {
    v.copy(p).project(cam);
    extent = Math.max(extent, Math.abs(v.x), Math.abs(v.y));
  }
  return extent;
}

function projectedPoints(
  fov: number,
  aspect: number,
  dir: THREE.Vector3,
  target: THREE.Vector3,
  points: THREE.Vector3[],
  distance: number
): THREE.Vector2[] {
  const cam = new THREE.PerspectiveCamera(fov, aspect, 0.1, 1000);
  cam.position.copy(target).addScaledVector(dir, distance);
  cam.lookAt(target);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return points.map((point) => {
    const projected = point.clone().project(cam);
    return new THREE.Vector2(projected.x, projected.y);
  });
}

/**
 * The slab's outer corners, top and bottom.
 *
 * These used to be called the "chassis" corners, and the chassis is deleted:
 * the slab's apron is exactly `COCKPIT_FRAME_MARGIN`, so the same eight points
 * now describe the stone tile itself. Its vertical extent is the slab, not the
 * old base plate - it rises to y = 0 and drops SLAB_THICKNESS below.
 */
function cockpitSlabPoints(): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (const x of [-COCKPIT_FRAME_MARGIN, GRID + COCKPIT_FRAME_MARGIN]) {
    for (const z of [-COCKPIT_FRAME_MARGIN, GRID + COCKPIT_FRAME_MARGIN]) {
      for (const y of [-SLAB_THICKNESS, 0]) points.push(new THREE.Vector3(x, y, z));
    }
  }
  return points;
}

function defaultDir(): THREE.Vector3 {
  return new THREE.Vector3().setFromSphericalCoords(
    1,
    DEFAULT_POLAR,
    DEFAULT_AZIMUTH
  );
}

function cockpitDir(): THREE.Vector3 {
  return new THREE.Vector3().setFromSphericalCoords(
    1,
    COCKPIT_DEFAULT_POLAR,
    DEFAULT_AZIMUTH
  );
}

describe('buildFitPoints', () => {
  it('covers all four board corners with a margin cell and vertical extent', () => {
    const points = buildFitPoints(GRID);
    const xs = points.map((p) => p.x);
    const zs = points.map((p) => p.z);
    const ys = points.map((p) => p.y);
    expect(Math.min(...xs)).toBe(-1);
    expect(Math.max(...xs)).toBe(GRID + 1);
    expect(Math.min(...zs)).toBe(-1);
    expect(Math.max(...zs)).toBe(GRID + 1);
    expect(Math.max(...ys)).toBeGreaterThan(0);
  });

  it('can fit a wider visual chassis without changing the released default', () => {
    const points = buildFitPoints(GRID, 1.25);
    const xs = points.map((point) => point.x);
    const zs = points.map((point) => point.z);
    expect(Math.min(...xs)).toBe(-1.25);
    expect(Math.max(...xs)).toBe(GRID + 1.25);
    expect(Math.min(...zs)).toBe(-1.25);
    expect(Math.max(...zs)).toBe(GRID + 1.25);
  });
});

describe('computeFitDistance', () => {
  const target = new THREE.Vector3(GRID / 2, 0, GRID / 2);
  const points = buildFitPoints(GRID);

  it.each([
    ['landscape desktop', 16 / 9],
    ['square', 1],
    ['portrait phone', 9 / 19.5],
  ])('fits the whole board with margin on %s', (_label, aspect) => {
    const dir = defaultDir();
    const distance = computeFitDistance(FOV, aspect, dir, target, points);
    const extent = maxNdcExtent(FOV, aspect, dir, target, points, distance);

    // Everything visible (inside NDC) with a small margin, and a tight
    // fit (not zoomed way out beyond the margin)
    expect(extent).toBeLessThanOrEqual(0.96);
    expect(extent).toBeGreaterThan(0.85);
  });

  it('produces a finite positive distance across the allowed pitch range', () => {
    for (const polar of [MIN_POLAR, DEFAULT_POLAR, MAX_POLAR]) {
      const dir = new THREE.Vector3().setFromSphericalCoords(1, polar, 0);
      const distance = computeFitDistance(FOV, 16 / 9, dir, target, points);
      expect(Number.isFinite(distance)).toBe(true);
      expect(distance).toBeGreaterThan(0);
    }
  });

  it('needs more distance on narrower aspects (portrait crops horizontally)', () => {
    const dir = defaultDir();
    const wide = computeFitDistance(FOV, 16 / 9, dir, target, points);
    const narrow = computeFitDistance(FOV, 9 / 19.5, dir, target, points);
    expect(narrow).toBeGreaterThan(wide);
  });

  it('default view is aligned parallel to a board side (south, facing north)', () => {
    const dir = defaultDir();
    // Azimuth 0 = offset purely in +Z: no X component (not the 45-degree
    // legacy corner diagonal)
    expect(dir.x).toBeCloseTo(0, 10);
    expect(dir.z).toBeGreaterThan(0);
    // 70-degree down-look: y component dominates
    expect(dir.y).toBeCloseTo(Math.cos(DEFAULT_POLAR), 10);
  });

  /**
   * RE-EXPRESSED FOR THE TRAYLESS BOARD AND THE POP-OUT.
   *
   * The premise this test was built on is gone, twice over, and both halves
   * were removed deliberately rather than drifting:
   *
   *   1. THE VIEWPORT IS NO LONGER CLIPPED. It was an octagonal well with a
   *      4% corner mask and a square `min(100cqw, 100cqh)` frame, which on
   *      desktop made roughly half the bay's width chassis and cut the board
   *      off the moment anyone zoomed or panned. There is no clip-path and no
   *      corner mask left to keep the board inside, so asserting against one
   *      would be asserting against a shape the product does not draw.
   *   2. THE CANVAS IS BIGGER THAN THE BAY. `.arenaCanvasBleed` grows the
   *      drawing surface by COCKPIT_CANVAS_OVERHANG per side so a twisted
   *      board can break out over the tray and the HUD, and NDC is relative
   *      to that larger surface.
   *
   * What must still hold is the guarantee those two changes could most easily
   * have broken, and it is the one the old test was really protecting: AT
   * REST the board is framed exactly as tightly as it always was, INSIDE the
   * bay, so the pop-out is something the player causes and never the default
   * state. So the projection is converted from canvas NDC back into bay NDC
   * by the same growth factor the fit scale is derived from, and held to the
   * same bounds the pre-pop-out fit produced.
   */
  it('frames the slab inside the bay at rest, despite painting on a larger canvas', () => {
    const aspect = 1;
    const dir = cockpitDir();
    const cockpitTarget = new THREE.Vector3(
      GRID / 2,
      COCKPIT_TARGET_Y,
      GRID / 2
    );
    const cockpitPoints = buildFitPoints(GRID, COCKPIT_FRAME_MARGIN);
    const distance = computeFitDistance(
      COCKPIT_FOV,
      aspect,
      dir,
      cockpitTarget,
      cockpitPoints
    ) * COCKPIT_FIT_SCALE;
    const slabProjection = projectedPoints(
      COCKPIT_FOV,
      aspect,
      dir,
      cockpitTarget,
      cockpitSlabPoints(),
      distance
    );

    // Canvas NDC -> bay NDC. The surface is the bay grown by the same factor
    // on both axes, so one scalar is the whole conversion.
    const growth = 1 + 2 * COCKPIT_CANVAS_OVERHANG;
    const bayExtent = Math.max(
      ...slabProjection.flatMap((point) => [
        Math.abs(point.x) * growth,
        Math.abs(point.y) * growth,
      ])
    );

    // The fit scale is DERIVED from the overhang, so the pair cannot drift.
    expect(COCKPIT_FIT_SCALE).toBeCloseTo(COCKPIT_BASE_FIT_SCALE * growth, 10);
    // Wholly inside the bay at rest: nothing overhangs the tray until the
    // player twists the camera.
    expect(bayExtent).toBeLessThanOrEqual(1);
    // And still broadcast-tight - the board fills the bay rather than
    // floating in the middle of it.
    expect(bayExtent).toBeGreaterThan(0.9);
  });
});
