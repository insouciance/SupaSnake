/**
 * ET-5 FOUR-WALL FAIRNESS GATE.
 *
 * The ruling that fixed the camera (see `./canonicalViewpoint`) is a
 * competitive one, so it owes a competitive proof. The claim being pinned has
 * two halves, and they are in one file because neither half is worth anything
 * alone:
 *
 *   HALF ONE - THE ENGINE IS ORIENTATION-AGNOSTIC. Approaching any of the four
 *   walls with a clear lane of N cells buys exactly N more ticks and then
 *   kills identically: same cause, same contact, same fatal cell one step
 *   outside the board. There is no favoured side in the simulation.
 *
 *   HALF TWO - SO EVERY ASYMMETRY A PLAYER CAN FEEL IS THE CAMERA'S, AND HERE
 *   IS EXACTLY HOW BIG IT IS. At the ratified viewpoint the two side walls are
 *   projected IDENTICALLY - bit-for-bit, because azimuth 0 puts the camera on
 *   the board's mirror plane - and the near/far axis differs by precisely the
 *   ratio the owner ratified, 0.68, which is the whole content of the trade.
 *
 * Together they say: the camera introduces one known, measured, deliberately
 * accepted asymmetry and no hidden ones. If the pitch drifts, half two fails.
 * If someone teaches the engine a favoured side, half one fails.
 */

// The camera module under test imports r3f/drei for its component half; only
// the pure fit math is exercised here, so both are mocked away (ESM packages
// that next/jest does not transform).
jest.mock('@react-three/fiber', () => ({
  useFrame: jest.fn(),
  useThree: jest.fn(),
}));
jest.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
}));

import * as THREE from 'three';
import {
  SnakeGameLogic,
  type Direction,
  type GameOverData,
} from '@/lib/game/SnakeGameLogic';
import { RULESETS } from '@/shared/game/rulesets';
import { GAME_CONFIG } from '@/shared/config/game';
import {
  buildFitPoints,
  CANONICAL_POLAR,
  COCKPIT_FIT_SCALE,
  COCKPIT_FRAME_MARGIN,
  COCKPIT_TARGET_Y,
  computeFitDistance,
  DEFAULT_AZIMUTH,
} from './CameraRig';
import {
  CANONICAL_FAR_NEAR_RATIO,
  CANONICAL_FOV,
  CANONICAL_RATIO_TOLERANCE,
  CANONICAL_SIDE_NEAR_RATIO,
  farNearRatio,
  measureWallApproach,
  sideNearRatio,
  WALL_SIDES,
  type WallSide,
} from './canonicalViewpoint';

const GRID = GAME_CONFIG.board.gridSize;

// ---------------------------------------------------------------------------
// HALF ONE - the simulation
// ---------------------------------------------------------------------------

/**
 * Where the food is parked for every approach run: a corner cell that no lane
 * in this file passes through. Eating mid-march would grow the snake and move
 * the mutation/portal cadence, and neither has anything to do with what is
 * being proved.
 */
const FOOD_OUT_OF_THE_WAY = { x: 1, y: 0, z: 1 } as const;

interface ApproachPlan {
  /** Turns issued before the march, in order. */
  readonly setup: readonly Direction[];
  /** The wall the march ends at. */
  readonly wall: WallSide;
}

/**
 * The snake starts at the board's centre cell facing RIGHT with its body
 * trailing to -x, so three of the four walls are one turn away and the fourth
 * is a reversal, which the engine correctly refuses. WEST therefore costs one
 * perpendicular tick first. That asymmetry is the INPUT's, not the board's,
 * and it is exactly why this gate asserts "N cells of lane buys N ticks"
 * rather than "all four runs take the same number of ticks" - the latter
 * would be a fact about the starting pose, not about fairness.
 */
const APPROACHES: readonly ApproachPlan[] = [
  { setup: ['RIGHT'], wall: 'east' },
  { setup: ['UP'], wall: 'north' },
  { setup: ['DOWN'], wall: 'south' },
  { setup: ['UP', 'LEFT'], wall: 'west' },
];

/** Free cells between the head and the board edge in the current heading. */
function gapToWall(head: { x: number; z: number }, wall: WallSide): number {
  switch (wall) {
    case 'east':
      return GRID - 1 - head.x;
    case 'west':
      return head.x;
    case 'north':
      return head.z;
    case 'south':
      return GRID - 1 - head.z;
  }
}

/** The out-of-bounds cell one step beyond the wall, from a given head cell. */
function fatalCell(
  head: { x: number; z: number },
  wall: WallSide
): { x: number; z: number } {
  switch (wall) {
    case 'east':
      return { x: GRID, z: head.z };
    case 'west':
      return { x: -1, z: head.z };
    case 'north':
      return { x: head.x, z: -1 };
    case 'south':
      return { x: head.x, z: GRID };
  }
}

interface ApproachOutcome {
  readonly gap: number;
  readonly ticksSurvived: number;
  readonly deathCause: string | null;
  readonly contact: string | null;
  readonly fatalCell: { x: number; z: number } | null;
  /** Where the board's geometry says the fatal step must land. */
  readonly expectedFatalCell: { x: number; z: number };
}

/**
 * Walk a clear lane into one wall and report what the engine did.
 *
 * PRIMAL because it is the plain ruleset here: COSMIC's board is a torus by
 * design, so its walls are not fatal and it is not a counter-example to
 * anything (its own wrap rules are proved elsewhere).
 */
function runApproach(plan: ApproachPlan): ApproachOutcome {
  const game = new SnakeGameLogic({ gridSize: GRID, ruleset: RULESETS.PRIMAL });
  /*
   * The collision diagnostic rides the terminal payload, not the live state -
   * the run is finalized in the same turn as the collision, and the death flag
   * that remains is presentation only. So the outcome is read where the engine
   * actually publishes it.
   */
  let terminal: GameOverData | null = null;
  game.on('gameOver', (payload) => {
    terminal = payload as GameOverData;
  });
  game.start();
  game.placeFood({ ...FOOD_OUT_OF_THE_WAY });

  plan.setup.forEach((direction, index) => {
    game.setDirection(direction);
    // Every setup turn but the last is followed by one tick, which is what
    // lets a reversal be reached as two legal perpendiculars.
    if (index < plan.setup.length - 1) {
      game.tick();
      game.placeFood({ ...FOOD_OUT_OF_THE_WAY });
    }
  });

  const head = game.getState().snake[0];
  const gap = gapToWall(head, plan.wall);
  const expectedFatal = fatalCell(
    plan.wall === 'east' || plan.wall === 'west'
      ? { x: plan.wall === 'east' ? GRID - 1 : 0, z: head.z }
      : { x: head.x, z: plan.wall === 'north' ? 0 : GRID - 1 },
    plan.wall
  );

  let ticksSurvived = 0;
  for (let i = 0; i < gap; i++) {
    game.tick();
    game.placeFood({ ...FOOD_OUT_OF_THE_WAY });
    if (game.getState().isDeathSequence || game.getState().isGameOver) break;
    ticksSurvived += 1;
  }

  // The killing tick: the head is now ON the boundary cell, so one more step
  // leaves the board.
  game.tick();
  const diagnostic: GameOverData['collisionDiagnostic'] =
    terminal === null ? null : (terminal as GameOverData).collisionDiagnostic;

  return {
    gap,
    ticksSurvived,
    deathCause: game.getDeathCause(),
    contact: diagnostic?.contact ?? null,
    fatalCell: diagnostic ? { x: diagnostic.cell.x, z: diagnostic.cell.z } : null,
    expectedFatalCell: expectedFatal,
  };
}

describe('ET-5 four-wall fairness: the simulation has no favoured side', () => {
  it('gives exactly one tick per free cell of lane, at every wall', () => {
    for (const plan of APPROACHES) {
      const outcome = runApproach(plan);
      expect({ wall: plan.wall, ticks: outcome.ticksSurvived }).toEqual({
        wall: plan.wall,
        ticks: outcome.gap,
      });
    }
  });

  it('kills identically at every wall: same cause, same contact', () => {
    const outcomes = APPROACHES.map((plan) => ({
      wall: plan.wall,
      cause: runApproach(plan).deathCause,
    }));
    for (const outcome of outcomes) {
      expect(outcome).toEqual({ wall: outcome.wall, cause: 'wall' });
    }

    const contacts = APPROACHES.map((plan) => runApproach(plan).contact);
    expect(new Set(contacts)).toEqual(new Set(['border']));
  });

  it('records the fatal cell exactly one step outside the board on each side', () => {
    for (const plan of APPROACHES) {
      const outcome = runApproach(plan);
      expect({ wall: plan.wall, cell: outcome.fatalCell }).toEqual({
        wall: plan.wall,
        cell: outcome.expectedFatalCell,
      });
    }
  });
});

// ---------------------------------------------------------------------------
// HALF TWO - the camera
// ---------------------------------------------------------------------------

/**
 * A camera posed exactly as `CameraRig` poses the shipped board: ratified
 * pitch, azimuth 0, board-centre target with the cockpit's framing bias, and
 * the distance the auto-fit produces for this viewport.
 */
function canonicalCamera(width: number, height: number): THREE.PerspectiveCamera {
  const aspect = width / height;
  const target = new THREE.Vector3(GRID / 2, COCKPIT_TARGET_Y, GRID / 2);
  const dir = new THREE.Vector3().setFromSphericalCoords(
    1,
    CANONICAL_POLAR,
    DEFAULT_AZIMUTH
  );
  const distance =
    computeFitDistance(
      CANONICAL_FOV,
      aspect,
      dir,
      target,
      buildFitPoints(GRID, COCKPIT_FRAME_MARGIN)
    ) * COCKPIT_FIT_SCALE;

  const camera = new THREE.PerspectiveCamera(CANONICAL_FOV, aspect, 0.1, 1000);
  camera.position.copy(target).addScaledVector(dir, distance);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

/** Landscape shapes, where the auto-fit is driven by the board's depth. */
const LANDSCAPE_VIEWPORTS: readonly (readonly [number, number])[] = [
  [1024, 768],
  [1280, 800],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
  [2560, 1080],
  [3440, 1440],
  [844, 390],
];

/** Portrait and tablet shapes, where the fit is driven by width instead. */
const PORTRAIT_VIEWPORTS: readonly (readonly [number, number])[] = [
  [320, 568],
  [375, 667],
  [390, 844],
  [412, 915],
  [768, 1024],
];

describe('ET-5 four-wall fairness: the camera adds one measured asymmetry', () => {
  /**
   * THE LEFT/RIGHT MIRROR IS EXACT, AND THAT IS THE WHOLE POINT OF AZIMUTH 0.
   *
   * A camera on the board's mirror plane projects the east and west walls to
   * the same numbers - not "within tolerance", identically, because the two
   * sample pairs are reflections of one another through the camera's own
   * plane. Asserting exact equality is therefore not brittleness; it is the
   * strongest available statement that the ruling introduced no handedness,
   * and any azimuth drift at all would break it.
   */
  it.each([...LANDSCAPE_VIEWPORTS, ...PORTRAIT_VIEWPORTS])(
    'projects the east and west walls identically at %ix%i',
    (width, height) => {
      const report = measureWallApproach(
        canonicalCamera(width, height),
        GRID,
        width,
        height
      );
      expect(report.east.approachPx).toBe(report.west.approachPx);
      expect(report.east.approachPx).toBeGreaterThan(0);
    }
  );

  /**
   * THE NEAR/FAR ASYMMETRY IS THE RATIFIED ONE, TO FOUR DECIMAL PLACES.
   *
   * Past roughly 1.13:1 the auto-fit is constrained by the board's vertical
   * extent, so the distance - and therefore this ratio - stops depending on
   * viewport width entirely. 0.6774 is not "the value on the owner's monitor";
   * it is the value on every landscape screen, which is what makes pinning it
   * meaningful.
   */
  it.each(LANDSCAPE_VIEWPORTS)(
    'holds the ratified far/near ratio at %ix%i',
    (width, height) => {
      const report = measureWallApproach(
        canonicalCamera(width, height),
        GRID,
        width,
        height
      );
      expect(farNearRatio(report)).toBeCloseTo(
        CANONICAL_FAR_NEAR_RATIO,
        // toBeCloseTo's digits are 10^-d/2; 3 checks to 0.0005, comfortably
        // tighter than the tolerance the constant documents.
        3
      );
      expect(sideNearRatio(report)).toBeCloseTo(CANONICAL_SIDE_NEAR_RATIO, 3);
    }
  );

  /**
   * PORTRAIT IS KINDER, NEVER HARSHER - so the landscape number is the floor
   * every player is guaranteed, not an average. A phone fits the board from
   * further away, which flattens the perspective and lifts the far row.
   */
  it.each(PORTRAIT_VIEWPORTS)(
    'never falls below the ratified far/near floor at %ix%i',
    (width, height) => {
      const report = measureWallApproach(
        canonicalCamera(width, height),
        GRID,
        width,
        height
      );
      expect(farNearRatio(report)).toBeGreaterThanOrEqual(
        CANONICAL_FAR_NEAR_RATIO - CANONICAL_RATIO_TOLERANCE
      );
    }
  );

  it('keeps every wall legible: no side is projected to nothing', () => {
    const report = measureWallApproach(canonicalCamera(1440, 900), GRID, 1440, 900);
    for (const side of WALL_SIDES) {
      expect(report[side].approachPx).toBeGreaterThan(8);
    }
    // The side walls sit at the board's centre depth, so they must land
    // between the far and near rows. A side wall outside that band would mean
    // the projection is doing something the mirror argument does not cover.
    const between = report.east.approachPx;
    expect(between).toBeGreaterThan(report.north.approachPx);
    expect(between).toBeLessThan(report.south.approachPx);
  });
});
