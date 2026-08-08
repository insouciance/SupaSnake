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

/** One piece of the specimen, reduced to what centring it actually needs. */
export interface SpecimenPiecePlacement {
  /** Signed position along the camera's RIGHT axis, in cells. */
  lateral: number;
  /** Distance from the camera along its view axis, in cells. Always > 0. */
  depth: number;
  /** Apparent width of the piece at that depth, in cells. */
  width: number;
}

/**
 * THE OPTICAL AXIS — how far the camera's aim must move so the creature's
 * DRAWN SILHOUETTE is centred on the canvas.
 *
 * Owner, Home Round 2: "the logo, the snake below and the buttons dont appear
 * properly aligned — logo centre, snake offset a bit to the right, buttons
 * centre again."
 *
 * THE ROOT CAUSE IS A CONFLATION, not a bad number. The chamber has always had
 * exactly one point doing two unrelated jobs:
 *
 *   THE FIT ANCHOR  the origin the pose's half-extents are measured about, which
 *                   decides how far back the camera stands.
 *   THE AIM         the world point that lands at the centre of the canvas.
 *
 * Both were `POSE_BOUNDS.center`, and that point is deliberately weighted 70/30
 * toward the HEAD — a framing decision, made so the face rather than a tail
 * piece owns the composition's heart. As a fit anchor it is sound. As an AIM it
 * is what the owner is looking at: the head sits slightly LEFT of it and the
 * whole tapering body trails away to screen right, so the creature's drawn
 * shape straddles the canvas centre lopsidedly. Measured off the rendered
 * frame, the silhouette's midpoint sat 73px right of centre at 1440x900 and
 * 39px right at 390x844 — right in both, which is exactly the report.
 *
 * So the two jobs are separated and this function answers the second one. It
 * solves for the shift that puts the silhouette's two defining edges — the
 * leftmost and the rightmost a piece reaches — symmetrically about the aim:
 *
 *     (lateral_lo - width_lo/2 - shift) / depth_lo
 *   + (lateral_hi + width_hi/2 - shift) / depth_hi  =  0
 *
 * PERSPECTIVE IS THE WHOLE REASON THIS IS NOT AN AVERAGE OF TWO NUMBERS. The
 * head is nearest the lens and the tail furthest, so the near piece subtends a
 * far larger angle per cell than the far one; dividing each edge by its own
 * depth is what weights them the way the eye does. Solving it in world space
 * instead — the orthographic answer — over-corrects by about 0.25 cells, which
 * is 30-odd pixels of the error it is supposed to remove.
 *
 * Which two pieces define the edges can change as the shift moves, so the solve
 * is repeated a handful of times. It converges in two: the head and the tail
 * are the extremes under every pose this chamber has shipped, and the loop
 * exists so a future pose cannot silently break the assumption.
 */
export function specimenOpticalShift(
  pieces: readonly SpecimenPiecePlacement[],
  iterations = 4
): number {
  if (pieces.length === 0) return 0;
  let shift = 0;
  for (let pass = 0; pass < iterations; pass++) {
    let lowEdge = Infinity;
    let highEdge = -Infinity;
    let low = pieces[0];
    let high = pieces[0];
    for (const piece of pieces) {
      const depth = Math.max(1e-4, piece.depth);
      const centre = (piece.lateral - shift) / depth;
      const half = piece.width / 2 / depth;
      if (centre - half < lowEdge) {
        lowEdge = centre - half;
        low = piece;
      }
      if (centre + half > highEdge) {
        highEdge = centre + half;
        high = piece;
      }
    }
    const lowDepth = Math.max(1e-4, low.depth);
    const highDepth = Math.max(1e-4, high.depth);
    const numerator =
      (low.lateral - low.width / 2) / lowDepth +
      (high.lateral + high.width / 2) / highDepth;
    const denominator = 1 / lowDepth + 1 / highDepth;
    const next = numerator / denominator;
    if (!Number.isFinite(next)) return shift;
    if (Math.abs(next - shift) < 1e-6) return next;
    shift = next;
  }
  return shift;
}
