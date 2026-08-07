'use client';

/**
 * CameraRig - THE CANONICAL COMPETITIVE CAMERA (ET-5).
 *
 * The played board is viewed from one fixed pose and no other: square-on to
 * the south side (azimuth 0), 28 degrees from zenith, at the board's own
 * auto-fit distance, aimed at board centre, fov 44. The numbers and the ruling
 * behind them live in `./canonicalViewpoint`; this file is what puts the
 * camera there.
 *
 * WHAT USED TO BE HERE, AND WHY IT IS GONE. The rig previously mounted
 * OrbitControls on the live board: free pitch inside 12..45 degrees, free zoom
 * across 0.55x..1.6x of the fit, free azimuth magnetically snapped to the
 * nearest board side on release, plus a HUD button to put it all back. That is
 * removed - not disabled, removed. Two reasons, in order of weight:
 *
 *   1. COMPETITIVE. A camera the player can move is a camera two players on
 *      the same ladder do not share. Pitch alone moved far-row legibility from
 *      0.80 to 0.62 (see canonicalViewpoint), which is a material difference
 *      in how much warning the far wall gives - a setting, effectively, and
 *      settings do not belong in the fatal geometry of a leaderboard game.
 *   2. INPUT. The board is also the steering surface. Every pointer that
 *      OrbitControls could claim was a pointer flick steering had to be
 *      protected from, and that competition has already cost one production
 *      hotfix (PR #95). With no controls on the board the class of bug is
 *      closed rather than fenced.
 *
 * The pointer island (`[data-arena-input-island]`) stays exactly where #95 put
 * it: it is what guarantees the pop-out canvas can never take a hit, and it is
 * still the OrbitControls host in the one place controls still exist.
 *
 * FREE CAMERA SURVIVES WHERE IT COSTS NOTHING: `freeCamera` is passed by the
 * dev-only ET-5 surveyor (`/game?cameraTune=1`, dev builds only), which is how
 * this viewpoint was chosen and how the next one would be. It is never passed
 * in production. The Specimen Chamber's camera is a separate rig entirely and
 * is untouched by this.
 *
 * Performance: the fit math (iterative corner projection) runs on mount and
 * resize only. In the locked configuration the rig subscribes to no frame loop
 * at all - it renders `null` and the camera simply stays where it was put.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { COCKPIT_CANVAS_OVERHANG } from './screen/gameScreenTokens';
import { CANONICAL_POLAR_DEG, readViewpoint } from './canonicalViewpoint';

/** Default pitch: 70 degrees down from horizontal = 20 degrees from zenith */
export const DEFAULT_POLAR = THREE.MathUtils.degToRad(20);
/**
 * THE RATIFIED PITCH (ET-5, owner ruling 7 August 2026): 28 degrees from
 * zenith, replacing the 26 this board shipped with.
 *
 * The constraint the owner set when the pitch was first lowered still holds -
 * "keep that top down in general and only go as far as possible to make it
 * look beautiful" - and 28 is where the surveyor session landed after playing
 * real runs at candidate angles with the legibility meter on screen. It costs
 * two points of far-row legibility (0.696 -> 0.677) and buys the vertical
 * presence the 90s art direction is built on. `canonicalViewpoint.ts` carries
 * the full table and the reason 0.68 is a ruling rather than a regression.
 *
 * There is no manual pitch any more: this is the pitch, everywhere the game is
 * played.
 */
export const CANONICAL_POLAR = THREE.MathUtils.degToRad(CANONICAL_POLAR_DEG);
/** Exact outer half-overhang of the premium undertray chassis. */
export const COCKPIT_FRAME_MARGIN = 1.175;
/**
 * The fit the cockpit framed with before the board could overhang its bay.
 * Calibrated against the chassis bounds: a broadcast-tight board with all four
 * corners clear of the viewport edge.
 */
export const COCKPIT_BASE_FIT_SCALE = 0.94;

/**
 * Fit scale, DERIVED from the cockpit's canvas overhang.
 *
 * The board canvas is inset by `--arena-overhang` per side
 * (`.arenaCanvasBleed` in CockpitPrototype.module.css) so that a twisted board
 * can visibly break out over the tray, the gap and the HUD - the owner's
 * pop-out. That makes the drawing surface larger than the bay on both axes,
 * and a fit computed against the canvas would therefore render the board
 * proportionally larger than the bay and break it out of the tray AT REST,
 * which is exactly what must not happen.
 *
 * The compensation is exact rather than tuned: the board occupies
 * FIT_MARGIN / fitScale of the canvas, so holding its on-screen size while the
 * canvas grows by G means multiplying the fit scale by G. Both axes grow by
 * the same fraction, so the canvas aspect is unchanged and one scalar is the
 * whole correction.
 *
 *     G = 1 + 2 x overhang
 *     COCKPIT_FIT_SCALE = 0.94 x G
 *
 * Owner ruling (pop-out refinement 2): "the only real cutoff is the browser
 * window itself." At a 9% overhang the drawing surface stopped ~76px short of
 * each window edge at 1280x800 - the board could not reach the glass no matter
 * how far it was twisted, because a canvas cannot paint outside its own
 * element. At the shipped 25% per side:
 *
 *     G = 1 + 2 x 0.25 = 1.50
 *     0.94 x 1.50 = 1.41
 *
 * The relationship is EXPRESSED rather than asserted: the overhang is a single
 * shared constant (`COCKPIT_CANVAS_OVERHANG`) that both this scale and
 * `.arenaCanvasBleed` are computed from, so the pair cannot drift. Raising the
 * overhang alone would break the board out of the tray at rest, which is the
 * one thing the pop-out must never do; it is now arithmetically impossible to
 * raise it alone.
 *
 * ET-5 note: the surplus surface no longer serves a player-twisted board,
 * because nothing twists it. It still serves the effects and the snake's own
 * silhouette, which paint outside the slab, and it is the surface every
 * shipped framing number was calibrated against - so it stays, and the
 * at-rest containment it guarantees is now a permanent property rather than a
 * default state.
 */
export const COCKPIT_FIT_SCALE =
  COCKPIT_BASE_FIT_SCALE * (1 + 2 * COCKPIT_CANVAS_OVERHANG);
/** Small framing bias that protects the near (south) chassis corners. */
export const COCKPIT_TARGET_Y = -0.3;
/** Default azimuth: behind the south (+Z) side, facing north */
export const DEFAULT_AZIMUTH = 0;
/** Fraction of NDC half-extent the board may fill (rest is margin) */
const FIT_MARGIN = 0.94;

/**
 * Free-look limits for the ET-5 camera surveyor, and for nothing else.
 *
 * The played camera has no limits because it has no freedom. The surveyor's
 * whole job is to find where a viewpoint stops being playable, so it must be
 * able to look from angles the game will never ship; these bounds exist only
 * to keep three's spherical math away from its poles.
 */
export const FREE_MIN_POLAR = THREE.MathUtils.degToRad(1);
export const FREE_MAX_POLAR = THREE.MathUtils.degToRad(88);
/** Surveyor zoom band, relative to the auto-fit baseline distance. */
const FREE_ZOOM_IN_RATIO = 0.2;
const FREE_ZOOM_OUT_RATIO = 4;

/**
 * Iterative corner-projection auto-fit: place a trial camera at `distance`
 * along `dir` from `target`, project the board's corner points, measure the
 * max NDC overflow ratio, and rescale. Projection is not linear in distance
 * at a tilted view, so 3 iterations refine to a tight fit. Called only on
 * mount/resize - allocations here are fine.
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
  /**
   * Optional sink: the azimuth (radians) the flick basis should be read
   * against. In the locked configuration the rig writes `DEFAULT_AZIMUTH` once
   * and never again - the flick basis is a CONSTANT, which is the input half
   * of the ET-5 ruling. The dev surveyor writes it per frame, because there
   * the camera really does orbit.
   */
  azimuthRef?: MutableRefObject<number>;
  /** Visible non-playable chassis beyond the board; released default is 1. */
  frameMargin?: number;
  /** Multiplier on the computed baseline distance; released default is 1. */
  fitScale?: number;
  /** Pitch, as a polar angle from zenith. Production passes the ratified one. */
  defaultPolar?: number;
  /** Vertical orbit target used to bias ground-plane framing. */
  targetY?: number;
  /**
   * ET-5 camera surveyor (dev builds only, `/game?cameraTune=1`).
   *
   * Mounts OrbitControls with panning on and the clamps widened, so a
   * candidate viewpoint can be held exactly and quoted. Defaults false, and
   * the production bundle has no caller that sets it: on a played board this
   * component renders nothing at all.
   */
  freeCamera?: boolean;
  /**
   * Optional sink for the live OrbitControls instance (surveyor only).
   *
   * The surveyor readout needs the orbit TARGET, which panning moves, and it
   * lives on the controls and nowhere else.
   */
  controlsSink?: MutableRefObject<OrbitControlsImpl | null>;
}

/**
 * Publishes the camera pose that ACTUALLY RENDERED onto the canvas element, so
 * the cockpit verifiers can assert the ruling instead of trusting it.
 *
 * Measured back out of `camera.position` and the live projection matrix -
 * never echoed from the constants that posed the camera, because a readout
 * that repeats its own input proves nothing. Written on mount and resize only;
 * there is no per-frame cost.
 */
function publishViewpoint(
  canvas: HTMLCanvasElement | undefined,
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  fitDistance: number,
  gridSize: number,
  width: number,
  height: number,
  locked: boolean
): void {
  if (!canvas) return;
  camera.updateMatrixWorld(true);
  const readout = readViewpoint(camera, target, fitDistance, gridSize, width, height);
  canvas.dataset.cameraLocked = locked ? 'true' : 'false';
  canvas.dataset.cameraAzimuthDeg = readout.azimuthDeg.toFixed(3);
  canvas.dataset.cameraPolarDeg = readout.polarDeg.toFixed(3);
  canvas.dataset.cameraFitMultiple = readout.fitMultiple.toFixed(4);
  canvas.dataset.cameraFov = readout.fov.toFixed(2);
  canvas.dataset.cameraFarNear = readout.farNear.toFixed(4);
}

/**
 * The surveyor's OrbitControls - a separate component so that a locked rig
 * mounts no controls, subscribes to no frame loop, and attaches no pointer
 * listeners. Rendered only when `freeCamera` is set, which only dev code does.
 */
function SurveyorControls({
  target,
  fitDistance,
  azimuthRef,
  controlsSink,
}: {
  target: THREE.Vector3;
  fitDistance: number;
  azimuthRef?: MutableRefObject<number>;
  controlsSink?: MutableRefObject<OrbitControlsImpl | null>;
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  /**
   * The cockpit's pointer island (see `.arenaInputIsland`).
   *
   * The board canvas overhangs its bay and is pointer-transparent so it can
   * never swallow a HUD hit; this element is the bay rectangle. Looked up
   * rather than passed: the game mounts its Canvas as `children` of a cockpit
   * it does not own. `null` is a first-class value - drei then falls back to
   * the canvas.
   */
  const [inputIsland, setInputIsland] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setInputIsland(
      document.querySelector<HTMLElement>('[data-arena-input-island]')
    );
  }, []);

  const attachControls = useCallback(
    (instance: OrbitControlsImpl | null) => {
      controlsRef.current = instance;
      if (controlsSink) controlsSink.current = instance;
    },
    [controlsSink]
  );

  useFrame(() => {
    const controls = controlsRef.current;
    if (controls && azimuthRef) {
      azimuthRef.current = controls.getAzimuthalAngle();
    }
  });

  return (
    <OrbitControls
      ref={attachControls}
      domElement={inputIsland ?? undefined}
      target={target}
      enablePan
      // Ground-plane panning, so a panned target stays ON the board and its
      // offset is honestly expressible in cells.
      screenSpacePanning={false}
      minDistance={fitDistance * FREE_ZOOM_IN_RATIO}
      maxDistance={fitDistance * FREE_ZOOM_OUT_RATIO}
      minPolarAngle={FREE_MIN_POLAR}
      maxPolarAngle={FREE_MAX_POLAR}
      enableDamping
      dampingFactor={0.05}
      rotateSpeed={0.5}
    />
  );
}

export function CameraRig({
  gridSize,
  azimuthRef,
  frameMargin = 1,
  fitScale = 1,
  defaultPolar = DEFAULT_POLAR,
  targetY = 0,
  freeCamera = false,
  controlsSink,
}: CameraRigProps) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const initialized = useRef(false);
  const [fitDistance, setFitDistance] = useState(0);

  const target = useMemo(
    () => new THREE.Vector3(gridSize / 2, targetY, gridSize / 2),
    [gridSize, targetY]
  );
  const fitPoints = useMemo(
    () => buildFitPoints(gridSize, frameMargin),
    [gridSize, frameMargin]
  );

  const applyFit = useCallback(
    (firstMount: boolean) => {
      const persp = camera as THREE.PerspectiveCamera;
      const dir = new THREE.Vector3();
      /**
       * A LOCKED rig recomputes the ratified direction every time, rather than
       * preserving whatever orientation the camera happens to hold. There is
       * only one orientation, so "preserve" and "restore" are the same
       * instruction - and stating it as restore means no accumulated float
       * drift or stray external write can survive a resize.
       */
      if (!freeCamera || firstMount || persp.position.distanceToSquared(target) < 1e-6) {
        dir.setFromSphericalCoords(1, defaultPolar, DEFAULT_AZIMUTH);
      } else {
        dir.copy(persp.position).sub(target).normalize();
      }

      const distance =
        computeFitDistance(
          persp.fov,
          size.width / size.height,
          dir,
          target,
          fitPoints
        ) * fitScale;

      setFitDistance(distance);

      // Surveying pans, so a resize refit must not haul the camera back to a
      // board-centre framing the owner deliberately moved off. The zoom clamps
      // above still follow the new viewport; only the pose is left alone.
      if (freeCamera && !firstMount) {
        publishViewpoint(
          gl?.domElement,
          persp,
          target,
          distance,
          gridSize,
          size.width,
          size.height,
          false
        );
        return;
      }

      persp.position.copy(target).addScaledVector(dir, distance);
      persp.lookAt(target);
      persp.updateProjectionMatrix();

      if (azimuthRef && !freeCamera) azimuthRef.current = DEFAULT_AZIMUTH;

      publishViewpoint(
        gl?.domElement,
        persp,
        target,
        distance,
        gridSize,
        size.width,
        size.height,
        !freeCamera
      );
    },
    [
      camera,
      gl,
      size.width,
      size.height,
      target,
      fitPoints,
      fitScale,
      defaultPolar,
      freeCamera,
      gridSize,
      azimuthRef,
    ]
  );

  // Mount: the ratified pose. Resize: refit (locked re-derives the same pose).
  useEffect(() => {
    applyFit(!initialized.current);
    initialized.current = true;
  }, [applyFit]);

  // `fitDistance` is 0 until the first fit lands; mounting controls with a
  // zero zoom band would collapse the camera onto the target for a frame.
  if (!freeCamera || fitDistance <= 0) return null;

  return (
    <SurveyorControls
      target={target}
      fitDistance={fitDistance}
      azimuthRef={azimuthRef}
      controlsSink={controlsSink}
    />
  );
}

export default CameraRig;
