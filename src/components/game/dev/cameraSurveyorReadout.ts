/**
 * ET-5 camera surveyor - the numbers half.
 *
 * Pure formatting and grading for the dev-only camera-tuning readout. No DOM,
 * no three.js: this is the shape the owner quotes back when THE canonical
 * competitive viewpoint is ratified, so it is expressed once, here, and
 * unit-tested. Nothing in this module runs in a production bundle - both this
 * file and its consumers are reached only through the dev-gated dynamic import
 * in `src/app/game/page.tsx`.
 *
 * The parameter line is a contract, not a debug print. Its exact shape:
 *
 *     az=+12.5 pitch=48.2 fit=1.15 target=+0.0,+0.5 fov=44 far/near=0.74
 *
 * az     signed degrees from DEFAULT_AZIMUTH (the shipped south-side basis)
 * pitch  degrees from straight down (0 = top-down), i.e. the polar angle
 * fit    distance as a MULTIPLE of the auto-fit distance, so the pinned
 *        number is viewport-independent (the fit already absorbs aspect/fov)
 * target orbit-target offset from board centre, in cells, x then z
 * fov    vertical field of view in degrees
 * far/near  the legibility ratio - see `gradeLegibility`
 */

/**
 * ET-5's acceptance threshold: the far row's on-screen cell height must be at
 * least 0.70x the near row's. Below this the board stops being equally
 * playable end to end, which is the whole reason the pitch is a ruling rather
 * than a taste call (docs/ENGINE_ARCHITECTURE_REVIEW.md, ET-5).
 */
export const LEGIBILITY_ACCEPT = 0.7;
/** Below this the far rows are not merely tighter, they are a handicap. */
export const LEGIBILITY_FLOOR = 0.6;

export type LegibilityGrade = 'pass' | 'marginal' | 'fail';

export interface CameraSurveyorReadout {
  /** Signed degrees from DEFAULT_AZIMUTH, normalized to (-180, 180]. */
  azimuthDeg: number;
  /** Degrees from straight down (0 = top-down). */
  pitchDeg: number;
  /** Camera-to-target distance in world units (cells). */
  distance: number;
  /** `distance` as a multiple of the auto-fit distance. */
  fitMultiple: number;
  /** Orbit target offset from board centre, in cells. */
  targetOffsetX: number;
  targetOffsetZ: number;
  /** Vertical field of view, degrees. */
  fov: number;
  /** Far-row / near-row projected cell height. 0 when unmeasurable. */
  legibility: number;
}

/** Fold any angle into (-180, 180] so the sign always reads as "which way". */
export function normalizeSignedDegrees(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  let value = degrees % 360;
  if (value > 180) value -= 360;
  if (value <= -180) value += 360;
  return value;
}

/**
 * Fixed-point with an explicit sign, and never "-0.0".
 *
 * A viewpoint is quoted, typed back in, and diffed by eye; a minus sign that
 * appears only because the value is a hair below zero is a false difference.
 */
export function signedFixed(value: number, digits: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const fixed = safe.toFixed(digits);
  if (Number.parseFloat(fixed) === 0) return `+${(0).toFixed(digits)}`;
  return fixed.startsWith('-') ? fixed : `+${fixed}`;
}

/**
 * Graded on the DISPLAYED value, not the raw one.
 *
 * The shipped default measures 0.6996 on a 16:9 desktop, which prints as
 * "0.70" - and an amber "0.70" against a stated 0.70 threshold is a readout
 * arguing with itself. Rounding first means the colour can never disagree
 * with the number the owner is reading off the tray.
 */
export function gradeLegibility(ratio: number): LegibilityGrade {
  if (!Number.isFinite(ratio)) return 'fail';
  const displayed = Math.round(ratio * 100) / 100;
  if (displayed >= LEGIBILITY_ACCEPT) return 'pass';
  if (displayed >= LEGIBILITY_FLOOR) return 'marginal';
  return 'fail';
}

/** The one-line form the owner copies out of the tray. */
export function formatParameterLine(readout: CameraSurveyorReadout): string {
  const az = signedFixed(normalizeSignedDegrees(readout.azimuthDeg), 1);
  const pitch = (Number.isFinite(readout.pitchDeg) ? readout.pitchDeg : 0).toFixed(1);
  const fit = (Number.isFinite(readout.fitMultiple) ? readout.fitMultiple : 0).toFixed(2);
  const targetX = signedFixed(readout.targetOffsetX, 1);
  const targetZ = signedFixed(readout.targetOffsetZ, 1);
  const fov = Math.round(Number.isFinite(readout.fov) ? readout.fov : 0);
  const legibility = (Number.isFinite(readout.legibility) ? readout.legibility : 0).toFixed(2);
  return `az=${az} pitch=${pitch} fit=${fit} target=${targetX},${targetZ} fov=${fov} far/near=${legibility}`;
}

/** Per-slot display strings, so the tray never formats anything itself. */
export function formatReadoutSlots(
  readout: CameraSurveyorReadout
): Record<CameraSurveyorSlot, string> {
  return {
    azimuth: `${signedFixed(normalizeSignedDegrees(readout.azimuthDeg), 1)}°`,
    pitch: `${(Number.isFinite(readout.pitchDeg) ? readout.pitchDeg : 0).toFixed(1)}°`,
    distance: `${(Number.isFinite(readout.distance) ? readout.distance : 0).toFixed(2)} u`,
    fit: `${(Number.isFinite(readout.fitMultiple) ? readout.fitMultiple : 0).toFixed(2)}×`,
    target: `${signedFixed(readout.targetOffsetX, 1)}, ${signedFixed(readout.targetOffsetZ, 1)}`,
    fov: `${Math.round(Number.isFinite(readout.fov) ? readout.fov : 0)}°`,
    legibility: `far/near ${(Number.isFinite(readout.legibility) ? readout.legibility : 0).toFixed(2)}`,
    line: formatParameterLine(readout),
  };
}

/** Every live cell of the tray. The probe writes each one by name. */
export type CameraSurveyorSlot =
  | 'azimuth'
  | 'pitch'
  | 'distance'
  | 'fit'
  | 'target'
  | 'fov'
  | 'legibility'
  | 'line';
