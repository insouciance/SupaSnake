'use client';

/**
 * CameraRig - side-aligned tactical camera with magnetic azimuth snapping.
 *
 * Defaults: 70-degree down-look (20 degrees polar from zenith), aligned
 * behind the board's south side facing north (parallel to a board side,
 * not the legacy corner diagonal), distance auto-fit so the whole board
 * plus a small margin is visible at any viewport aspect.
 *
 * Manipulation: pitch and zoom are free within clamps; azimuth is free
 * while dragging but snaps (damped ease, ~0.25s) to the nearest 90-degree
 * side on release, so the view always settles parallel to a board side.
 * The auto-fit distance recomputes on viewport resize (preserving the
 * player's orientation) and is the zoom baseline; `resetToken` restores
 * the full default view (wired to the HUD reset button).
 *
 * Performance: the fit math (iterative corner projection) runs only on
 * mount/resize/reset. The per-frame snap path allocates nothing - it
 * reuses one shared Vector3 and three.js's internal temp quaternion.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';

/** Default pitch: 70 degrees down from horizontal = 20 degrees from zenith */
export const DEFAULT_POLAR = THREE.MathUtils.degToRad(20);
/** Cockpit pitch: a slightly flatter broadcast view without sacrificing fit. */
export const COCKPIT_DEFAULT_POLAR = THREE.MathUtils.degToRad(16);
/** Exact outer half-overhang of the premium undertray chassis. */
export const COCKPIT_FRAME_MARGIN = 1.175;
/**
 * Calibrated against the chassis bounds and the viewport's 4% corner mask.
 * This retains a broadcast-tight board while keeping all four chassis
 * corners visible; the former 0.82 value crossed that mask on reset.
 */
export const COCKPIT_FIT_SCALE = 0.94;
/** Small framing bias that protects the near (south) chassis corners. */
export const COCKPIT_TARGET_Y = -0.3;
/** Pitch limits (polar angle from zenith) */
export const MIN_POLAR = THREE.MathUtils.degToRad(12);
export const MAX_POLAR = THREE.MathUtils.degToRad(45);
/** Default azimuth: behind the south (+Z) side, facing north */
export const DEFAULT_AZIMUTH = 0;
/** Fraction of NDC half-extent the board may fill (rest is margin) */
const FIT_MARGIN = 0.94;
/** Zoom clamps relative to the auto-fit baseline distance */
const ZOOM_IN_RATIO = 0.55;
const ZOOM_OUT_RATIO = 1.6;
/** Damped snap rate - time constant ~60ms, settles in ~0.25s */
const SNAP_SPEED = 16;
/** Snap epsilon (radians) below which the snap completes */
const SNAP_EPSILON = 0.002;

const HALF_PI = Math.PI / 2;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/**
 * Iterative corner-projection auto-fit: place a trial camera at `distance`
 * along `dir` from `target`, project the board's corner points, measure the
 * max NDC overflow ratio, and rescale. Projection is not linear in distance
 * at a tilted view, so 3 iterations refine to a tight fit. Called only on
 * mount/resize/reset - allocations here are fine.
 */
export function computeFitDistance(
  fov: number,
  aspect: number,
  dir: THREE.Vector3,
  target: THREE.Vector3,
  points: readonly THREE.Vector3[]
): number {
  const trial = new THREE.PerspectiveCamera(fov, aspect, 0.1, 1000);
  // Bounding-sphere first guess
  let radius = 0;
  for (const p of points) radius = Math.max(radius, p.distanceTo(target));
  let distance = radius / Math.tan(THREE.MathUtils.degToRad(fov) / 2);

  const projected = new THREE.Vector3();
  for (let i = 0; i < 3; i++) {
    trial.position.copy(target).addScaledVector(dir, distance);
    trial.lookAt(target);
    trial.updateMatrixWorld(true);
    trial.updateProjectionMatrix();

    let overflow = 0;
    for (const p of points) {
      projected.copy(p).project(trial);
      overflow = Math.max(overflow, Math.abs(projected.x), Math.abs(projected.y));
    }
    if (overflow <= 0) break;
    distance *= overflow / FIT_MARGIN;
  }
  return distance;
}

/** Board/chassis corner points (with configurable margin) used by the fit. */
export function buildFitPoints(gridSize: number, frameMargin = 1): THREE.Vector3[] {
  const lo = -frameMargin;
  const hi = gridSize + frameMargin;
  const points: THREE.Vector3[] = [];
  for (const x of [lo, hi]) {
    for (const z of [lo, hi]) {
      points.push(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 1, z));
    }
  }
  points.push(new THREE.Vector3(gridSize / 2, 0, gridSize / 2));
  return points;
}

interface CameraRigProps {
  gridSize: number;
  /** Increment to restore the default view (pitch, side, fit distance) */
  resetToken: number;
  /**
   * Optional sink: the rig writes its current azimuth (radians) here every
   * frame so DOM-side consumers (flick input) can read the live camera
   * orientation without reaching into the three.js scene. Write-only from
   * the rig's perspective; a plain number write allocates nothing.
   */
  azimuthRef?: MutableRefObject<number>;
  /** Visible non-playable chassis beyond the board; released default is 1. */
  frameMargin?: number;
  /** Multiplier on the computed baseline distance; released default is 1. */
  fitScale?: number;
  /** Default/reset pitch, expressed as polar angle from zenith. */
  defaultPolar?: number;
  /** Vertical orbit target used to bias ground-plane framing. */
  targetY?: number;
}

export function CameraRig({
  gridSize,
  resetToken,
  azimuthRef,
  frameMargin = 1,
  fitScale = 1,
  defaultPolar = DEFAULT_POLAR,
  targetY = 0,
}: CameraRigProps) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  /** Azimuth (radians) the camera is easing toward; null = not snapping */
  const snapTarget = useRef<number | null>(null);
  const initialized = useRef(false);
  const lastResetToken = useRef(resetToken);

  const [minDistance, setMinDistance] = useState(12);
  const [maxDistance, setMaxDistance] = useState(60);

  const target = useMemo(
    () => new THREE.Vector3(gridSize / 2, targetY, gridSize / 2),
    [gridSize, targetY]
  );
  const fitPoints = useMemo(
    () => buildFitPoints(gridSize, frameMargin),
    [gridSize, frameMargin]
  );
  /** Shared per-frame scratch vector (never reallocated) */
  const scratch = useMemo(() => new THREE.Vector3(), []);

  const applyFit = useCallback(
    (resetOrientation: boolean) => {
      const persp = camera as THREE.PerspectiveCamera;
      const dir = new THREE.Vector3();
      if (resetOrientation || persp.position.distanceToSquared(target) < 1e-6) {
        dir.setFromSphericalCoords(1, defaultPolar, DEFAULT_AZIMUTH);
      } else {
        dir.copy(persp.position).sub(target).normalize();
      }

      const distance = computeFitDistance(
        persp.fov,
        size.width / size.height,
        dir,
        target,
        fitPoints
      ) * fitScale;

      setMinDistance(distance * ZOOM_IN_RATIO);
      setMaxDistance(distance * ZOOM_OUT_RATIO);

      persp.position.copy(target).addScaledVector(dir, distance);
      persp.lookAt(target);
      persp.updateProjectionMatrix();
      snapTarget.current = null;
      controlsRef.current?.update();
    },
    [camera, size.width, size.height, target, fitPoints, fitScale, defaultPolar]
  );

  // Mount: full default view. Resize: refit preserving orientation.
  useEffect(() => {
    applyFit(!initialized.current);
    initialized.current = true;
  }, [applyFit]);

  // Reset affordance: restore the default view when the token changes
  useEffect(() => {
    if (resetToken !== lastResetToken.current) {
      lastResetToken.current = resetToken;
      applyFit(true);
    }
  }, [resetToken, applyFit]);

  // Magnetic azimuth: on release, ease to the nearest 90-degree side
  const handleStart = useCallback(() => {
    snapTarget.current = null;
  }, []);

  const handleEnd = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    snapTarget.current =
      Math.round(controls.getAzimuthalAngle() / HALF_PI) * HALF_PI;
  }, []);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (controls && azimuthRef) {
      azimuthRef.current = controls.getAzimuthalAngle();
    }
    const goal = snapTarget.current;
    if (!controls || goal === null) return;

    const current = controls.getAzimuthalAngle();
    const diff = goal - current;
    const done = Math.abs(diff) < SNAP_EPSILON;
    const step = done ? diff : diff * (1 - Math.exp(-SNAP_SPEED * delta));

    // Rotate the camera position around the target directly - bypasses the
    // controls' damping scaling so the ease rate is exactly ours.
    scratch.copy(camera.position).sub(target);
    scratch.applyAxisAngle(Y_AXIS, step);
    camera.position.copy(target).add(scratch);
    controls.update();

    if (done) snapTarget.current = null;
  });

  return (
    <OrbitControls
      ref={controlsRef}
      target={target}
      enablePan={false}
      minDistance={minDistance}
      maxDistance={maxDistance}
      minPolarAngle={MIN_POLAR}
      maxPolarAngle={MAX_POLAR}
      enableDamping
      dampingFactor={0.05}
      rotateSpeed={0.5}
      onStart={handleStart}
      onEnd={handleEnd}
    />
  );
}

export default CameraRig;
