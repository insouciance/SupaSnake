export interface SpecimenCameraBounds {
  halfX: number;
  halfY: number;
  halfZ: number;
}

/**
 * Home is a portrait, not a collection preview. The player asked for one
 * unmistakable little creature: its head and two body pieces. Keeping this in
 * the pure framing module lets the responsive contract be tested without a
 * WebGL environment.
 */
export const HOME_SPECIMEN_PIECES = 3 as const;

/**
 * Exact perspective fit for an axis-aligned specimen viewed at the chamber's
 * azimuth/elevation. The near-depth term is essential: fitting only X against
 * horizontal FOV crops the far side of a rotated coil on portrait screens.
 */
export function specimenCameraDistance(
  bounds: SpecimenCameraBounds,
  width: number,
  height: number,
  verticalFovRadians: number,
  elevation: number,
  azimuth: number,
  margin: number
): number {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const aspect = safeWidth / safeHeight;
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFovRadians / 2) * aspect);

  const sinA = Math.abs(Math.sin(azimuth));
  const cosA = Math.abs(Math.cos(azimuth));
  const sinE = Math.abs(Math.sin(elevation));
  const cosE = Math.abs(Math.cos(elevation));

  const projectedHorizontal =
    bounds.halfX * cosA + bounds.halfZ * sinA;
  const projectedVertical =
    bounds.halfY * cosE +
    (bounds.halfX * sinA + bounds.halfZ * cosA) * sinE;
  const projectedDepth =
    (bounds.halfX * sinA + bounds.halfZ * cosA) * cosE +
    bounds.halfY * sinE;

  const horizontalFit =
    (projectedHorizontal * margin) / Math.tan(horizontalFov / 2);
  const verticalFit =
    (projectedVertical * margin) / Math.tan(verticalFovRadians / 2);
  return projectedDepth + Math.max(horizontalFit, verticalFit);
}
