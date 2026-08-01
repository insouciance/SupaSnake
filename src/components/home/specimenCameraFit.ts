export interface SpecimenCameraBounds {
  halfX: number;
  halfY: number;
  halfZ: number;
}

export interface HomeSafeStage {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface RectEdge {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const STAGE_GUTTER_PX = 8;
const MIN_STAGE_SIZE_PX = 96;

/**
 * Turn the actual Home HUD and dock geometry into an unobstructed stage.
 * Values are relative to the viewport because the chamber fills it.
 */
export function measureHomeSafeStage(
  width: number,
  height: number,
  header: RectEdge | null,
  dock: RectEdge | null
): HomeSafeStage {
  const safeWidth = Math.max(MIN_STAGE_SIZE_PX, Math.floor(width));
  const safeHeight = Math.max(MIN_STAGE_SIZE_PX, Math.floor(height));
  const top = Math.max(0, Math.ceil(header?.bottom ?? 0) + STAGE_GUTTER_PX);
  const requestedBottom = Math.max(
    0,
    Math.ceil(safeHeight - (dock?.top ?? safeHeight)) + STAGE_GUTTER_PX
  );
  const bottom = Math.min(
    requestedBottom,
    Math.max(0, safeHeight - top - MIN_STAGE_SIZE_PX)
  );

  return {
    top,
    right: Math.max(0, safeWidth - Math.floor(width)),
    bottom,
    left: 0,
  };
}

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
