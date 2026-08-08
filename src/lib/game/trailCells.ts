import type { InterpolationBuffer } from './interpolationBuffer';

/** Five deposited cells share one visual band: grouping, not confetti. */
export const TRAIL_BAND_RUN_CELLS = 5;

/**
 * Cell-persistent trail representation.
 *
 * Segment identity advances through the whole body every tick; board
 * occupancy usually does not. Rendering segment identity therefore makes a
 * packed coil conveyor across stationary cells. This state records the thing
 * the player plans against instead: which CELLS remained occupied, entered,
 * or departed between the two authoritative ticks.
 */
export interface TrailCellState {
  readonly gridSize: number;
  readonly capacity: number;
  readonly previousMask: Uint8Array;
  readonly currentMask: Uint8Array;
  readonly previousCells: Uint16Array;
  readonly currentCells: Uint16Array;
  readonly departingCells: Uint16Array;
  readonly previousRepresentative: Int32Array;
  readonly currentRepresentative: Int32Array;
  /** Deposited group number, stable for as long as the cell stays occupied. */
  readonly bandPhase: Uint16Array;
  previousCount: number;
  currentCount: number;
  departingCount: number;
  depositionCount: number;
  initialized: boolean;
}

export function createTrailCellState(gridSize: number): TrailCellState {
  const size = Math.max(0, Math.trunc(gridSize));
  const capacity = size * size;
  const state: TrailCellState = {
    gridSize: size,
    capacity,
    previousMask: new Uint8Array(capacity),
    currentMask: new Uint8Array(capacity),
    previousCells: new Uint16Array(capacity),
    currentCells: new Uint16Array(capacity),
    departingCells: new Uint16Array(capacity),
    previousRepresentative: new Int32Array(capacity),
    currentRepresentative: new Int32Array(capacity),
    bandPhase: new Uint16Array(capacity),
    previousCount: 0,
    currentCount: 0,
    departingCount: 0,
    depositionCount: 0,
    initialized: false,
  };
  resetTrailCells(state);
  return state;
}

export function resetTrailCells(state: TrailCellState): void {
  state.previousMask.fill(0);
  state.currentMask.fill(0);
  state.previousRepresentative.fill(-1);
  state.currentRepresentative.fill(-1);
  state.bandPhase.fill(0);
  state.previousCount = 0;
  state.currentCount = 0;
  state.departingCount = 0;
  state.depositionCount = 0;
  state.initialized = false;
}

function indexAt(
  cells: Float32Array,
  segment: number,
  gridSize: number
): number {
  const x = cells[segment * 2];
  const z = cells[segment * 2 + 1];
  if (!Number.isInteger(x) || !Number.isInteger(z)) return -1;
  if (x < 0 || x >= gridSize || z < 0 || z >= gridSize) return -1;
  return z * gridSize + x;
}

/** Fold a new authoritative tick. Allocation-free after state construction. */
export function updateTrailCells(
  state: TrailCellState,
  buffer: InterpolationBuffer
): void {
  const {
    gridSize,
    previousMask,
    currentMask,
    previousCells,
    currentCells,
    departingCells,
    previousRepresentative,
    currentRepresentative,
    bandPhase,
  } = state;
  previousMask.fill(0);
  currentMask.fill(0);
  previousRepresentative.fill(-1);
  currentRepresentative.fill(-1);
  state.previousCount = 0;
  state.currentCount = 0;
  state.departingCount = 0;

  const previousHead = buffer.prevCount > 0 ? indexAt(buffer.prev, 0, gridSize) : -1;
  for (let segment = 1; segment < buffer.prevCount; segment += 1) {
    const cell = indexAt(buffer.prev, segment, gridSize);
    // During a revive the rewound head can share a body cell. Head hierarchy
    // wins visually; drawing an equal body cube inside it creates the exact
    // overlap noise this representation exists to remove.
    if (cell < 0 || cell === previousHead || previousMask[cell] === 1) continue;
    previousMask[cell] = 1;
    previousRepresentative[cell] = segment;
    previousCells[state.previousCount++] = cell;
  }

  const currentHead = buffer.count > 0 ? indexAt(buffer.curr, 0, gridSize) : -1;
  for (let segment = 1; segment < buffer.count; segment += 1) {
    const cell = indexAt(buffer.curr, segment, gridSize);
    if (cell < 0 || cell === currentHead || currentMask[cell] === 1) continue;
    currentMask[cell] = 1;
    currentRepresentative[cell] = segment;
    currentCells[state.currentCount++] = cell;
  }

  if (!state.initialized) {
    // Seed the opening body as grouped longitudinal strata. Later cells are
    // assigned only when they ENTER, so the pattern never flows through a
    // stationary coil as segment indices advance.
    for (let index = 0; index < state.currentCount; index += 1) {
      const cell = currentCells[index];
      const representative = currentRepresentative[cell];
      bandPhase[cell] = Math.floor(
        Math.max(0, representative - 1) / TRAIL_BAND_RUN_CELLS
      );
    }
    state.depositionCount = state.currentCount;
    state.initialized = true;
  } else {
    for (let index = 0; index < state.currentCount; index += 1) {
      const cell = currentCells[index];
      if (previousMask[cell] === 1) continue;
      bandPhase[cell] = Math.floor(
        state.depositionCount / TRAIL_BAND_RUN_CELLS
      );
      state.depositionCount += 1;
    }
  }

  for (let index = 0; index < state.previousCount; index += 1) {
    const cell = previousCells[index];
    if (currentMask[cell] === 0) {
      departingCells[state.departingCount++] = cell;
    }
  }
}

/**
 * The cell key for a grid position, or -1 if it is off the board. The inverse
 * of `trailCellX`/`trailCellZ`, for callers holding a position rather than a
 * key - the renderer identifying the tile the head just left.
 */
export function trailCellIndex(
  state: TrailCellState,
  x: number,
  z: number
): number {
  const gx = Math.round(x);
  const gz = Math.round(z);
  if (gx < 0 || gx >= state.gridSize || gz < 0 || gz >= state.gridSize) {
    return -1;
  }
  return gz * state.gridSize + gx;
}

export function trailCellX(state: TrailCellState, cell: number): number {
  return cell % state.gridSize;
}

export function trailCellZ(state: TrailCellState, cell: number): number {
  return Math.floor(cell / state.gridSize);
}
