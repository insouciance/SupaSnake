'use client';

/**
 * ET-5 camera surveyor - the measuring half, inside the Canvas.
 *
 * Reads the live camera every frame and publishes the tuning readout to the
 * DOM tray through `cameraSurveyorChannel`. It renders NOTHING: it is a
 * `useFrame` with a viewport, which is the only place the projection math can
 * honestly happen.
 *
 * THE VIEWPOINT IS ALREADY RATIFIED (az 0, pitch 28, fit 1.00, fov 44 - see
 * `../canonicalViewpoint`). This mode survives because the ruling is
 * revisitable: the next viewpoint session, if far-row death forensics ever
 * calls for one, needs the same instrument that produced this one. It is
 * dev-only and double-gated (`NODE_ENV !== 'production'` AND `?cameraTune=1`).
 *
 * Two numbers are the point of the whole mode:
 *
 * 1. `fit` - the distance as a multiple of the auto-fit distance, computed
 *    with the SAME `computeFitDistance` the rig frames the board with, at the
 *    same fov, aspect, frame margin and fit scale. That is what makes the
 *    pinned number viewport-independent: 1.15 means "15% further out than the
 *    board's own fit", which reproduces on any screen, where "37.4 world
 *    units" reproduces on none.
 *
 * 2. `far/near` - the legibility ratio, measured rather than eyeballed. It
 *    comes from `readViewpoint`, which is the SAME function the shipped rig
 *    publishes with and the SAME one the four-wall fairness gate asserts on,
 *    so the number the owner quotes and the number CI pins cannot be two
 *    different measurements. The surveyor grades it against 0.70, the ratio
 *    the 26-degree camera measured; the ratified 28 reads 0.68, deliberately.
 */

import { useMemo, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  buildFitPoints,
  computeFitDistance,
  DEFAULT_AZIMUTH,
  FREE_MAX_POLAR,
  FREE_MIN_POLAR,
} from '../CameraRig';
import { readViewpoint } from '../canonicalViewpoint';
import { publishReadout, takeCommand } from './cameraSurveyorChannel';
import type { CameraSurveyorReadout } from './cameraSurveyorReadout';

export interface CameraSurveyorProbeProps {
  gridSize: number;
  /** Visible non-playable chassis beyond the board - as passed to the rig. */
  frameMargin: number;
  /** Multiplier on the computed baseline distance - as passed to the rig. */
  fitScale: number;
  /** The rig's ratified pitch, as a polar angle from zenith. */
  defaultPolar: number;
  /** The rig's vertical orbit-target bias. */
  targetY: number;
  /** The live OrbitControls instance, sunk by the rig. */
  controlsRef: RefObject<OrbitControlsImpl | null>;
}

export function CameraSurveyorProbe({
  gridSize,
  frameMargin,
  fitScale,
  defaultPolar,
  targetY,
  controlsRef,
}: CameraSurveyorProbeProps) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  const boardTarget = useMemo(
    () => new THREE.Vector3(gridSize / 2, targetY, gridSize / 2),
    [gridSize, targetY]
  );
  const fitPoints = useMemo(
    () => buildFitPoints(gridSize, frameMargin),
    [gridSize, frameMargin]
  );
  const defaultDirection = useMemo(
    () => new THREE.Vector3().setFromSphericalCoords(1, defaultPolar, DEFAULT_AZIMUTH),
    [defaultPolar]
  );

  const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 0;
  /**
   * The auto-fit baseline, at the RATIFIED orientation.
   *
   * Deliberately not recomputed per orientation: orbiting must not move the
   * baseline under the owner's feet, or `fit` would read 1.00 at every angle
   * and stop meaning anything. Held at the framing the board ships with, so
   * `fit` is exactly "how much further out than the shipped framing".
   */
  const fitDistance = useMemo(() => {
    if (fov <= 0 || size.width <= 0 || size.height <= 0) return 0;
    return (
      computeFitDistance(
        fov,
        size.width / size.height,
        defaultDirection,
        boardTarget,
        fitPoints
      ) * fitScale
    );
  }, [fov, size.width, size.height, defaultDirection, boardTarget, fitPoints, fitScale]);

  // Per-frame scratch. Allocating in a frame loop is the thing this codebase
  // is spending effort removing, so the probe allocates nothing after mount
  // beyond what `readViewpoint` needs for its own projection round-trip.
  const scratch = useMemo(
    () => ({
      readout: {
        azimuthDeg: 0,
        pitchDeg: 0,
        distance: 0,
        fitMultiple: 0,
        targetOffsetX: 0,
        targetOffsetZ: 0,
        fov: 0,
        legibility: 0,
      } as CameraSurveyorReadout,
      direction: new THREE.Vector3(),
    }),
    []
  );

  useFrame(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const controls = controlsRef.current;

    // A queued viewpoint is applied before measuring, so the tray shows the
    // pose it just asked for on the same frame it lands.
    const command = takeCommand();
    if (command && controls && fitDistance > 0) {
      const requested =
        command.polarDeg === null
          ? defaultPolar
          : THREE.MathUtils.degToRad(command.polarDeg);
      const polar = THREE.MathUtils.clamp(requested, FREE_MIN_POLAR, FREE_MAX_POLAR);
      // Damping leaves a decaying pan/rotate residue after every drag, and an
      // ordinary `update()` only decays it - so a pose applied while residue
      // is in flight lands a fraction off the framing it names, which is
      // useless when the whole point is to quote the framing. Flushing first
      // with damping off applies the remainder in one go AND zeroes the
      // deltas (three's own else-branch), so the pose below is then set
      // against a controller with nothing pending. Damping is restored
      // straight after: dragging feels exactly as it did.
      const damping = controls.enableDamping;
      controls.enableDamping = false;
      controls.update();

      controls.target.copy(boardTarget);
      scratch.direction.setFromSphericalCoords(1, polar, DEFAULT_AZIMUTH);
      camera.position.copy(boardTarget).addScaledVector(scratch.direction, fitDistance);
      camera.lookAt(boardTarget);
      camera.updateProjectionMatrix();
      controls.update();
      controls.enableDamping = damping;
    }

    // `project` reads matrixWorldInverse, which the renderer refreshes at draw
    // time - one frame behind the controls update that just ran. Refresh it
    // here so the legibility meter measures THIS frame's camera.
    camera.updateMatrixWorld(true);

    const orbitTarget = controls ? controls.target : boardTarget;
    const measured = readViewpoint(
      camera,
      orbitTarget,
      fitDistance,
      gridSize,
      size.width,
      size.height
    );

    const readout = scratch.readout;
    readout.azimuthDeg = measured.azimuthDeg;
    readout.pitchDeg = measured.polarDeg;
    readout.distance = measured.distance;
    readout.fitMultiple = measured.fitMultiple;
    readout.targetOffsetX = orbitTarget.x - gridSize / 2;
    readout.targetOffsetZ = orbitTarget.z - gridSize / 2;
    readout.fov = measured.fov;
    readout.legibility = measured.farNear;
    publishReadout(readout);
  });

  return null;
}

export default CameraSurveyorProbe;
