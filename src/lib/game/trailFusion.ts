/**
 * TRAIL FUSION - the snake's body as a readout of how well you packed (WP-3.07).
 *
 * The owner's ruling, and the keystone of the trail redesign: fusion is EARNED,
 * not positional. Per body cell, count the orthogonal neighbours that are
 * occupied but are NOT that cell's two path neighbours - its predecessor and
 * successor in the body chain, which are adjacent for free and therefore prove
 * nothing.
 *
 *   0 = running free      -> discrete voxels with visible gaps
 *   1 = fusing at the edges
 *   2 = fully fused, brightest
 *
 * WALLS AND SOLID TERRAIN COUNT. Without that the metric rewards coiling in
 * open space, which is bad play: a coil hugging a wall has genuinely spent less
 * of the arena than the same coil floating in the middle.
 *
 * WHY THIS IS THE RIGHT THING TO REWARD (redesign status doc, pass 3): coiling
 * does not change the NUMBER of spawnable cells - free space is `n^2 - L` for
 * any shape whatsoever. It changes their GEOMETRY: one large contiguous
 * reachable region with short direct paths, versus the same count shredded into
 * corridors, slivers and sealed pockets. So a cell you left behind that is now
 * unfillable shows up as a dark seam in an otherwise solid field, and that is
 * the whole feedback loop.
 *
 * THE LINE NOT TO CROSS, recorded here because this module is where someone
 * would be tempted: do NOT shade the free region and do NOT surface the largest
 * contiguous open area. Feedback on how well YOU packed builds intuition;
 * showing where the safe space is replaces it.
 *
 * Contract:
 * - Pure TS (no three.js, no React) so the metric is unit-testable in
 *   isolation - the idiom this repo rewards after WP-3.03 shipped terrain as
 *   correct physics that nothing drew.
 * - Zero allocation after `createTrailFusionState`. `updateTrailFusion` is
 *   called from inside a `useFrame` loop whose stated contract is no per-frame
 *   allocation and no React work.
 * - Hysteresis is keyed by CELL, never by segment index. The index -> cell
 *   mapping shifts by one every tick as the body advances (`curr[i]` is
 *   `prev[i-1]`), so index-keyed state would smear each cell's history onto its
 *   neighbour. Cell keying makes the carry-forward automatic and free.
 */

import type { TerrainBlock } from '@/shared/game/terrain';

/** Levels are 0, 1 or 2. Three states is the design; a cell with three free
 *  orthogonal neighbours occupied is not "more fused" in any way a player can
 *  read at a glance, so the count clamps rather than extending the scale. */
export const FUSION_MAX = 2;

/**
 * How many CONSECUTIVE ticks a new measurement must hold before it is
 * committed.
 *
 * 2 is the smallest value that fully suppresses the failure the owner called
 * out: a raw level that alternates every tick flickers at half the tick rate,
 * and the tick rate lands in the 5-10 Hz band that is the worst possible place
 * to put a brightness change. With a threshold of 2 an alternating input never
 * commits at all, because the streak resets every time the measurement agrees
 * with what is already committed. At 5-10 Hz this costs 200-400 ms of latency
 * on a genuine change, which is under the threshold where a body-shape change
 * reads as laggy.
 */
export const FUSION_HYSTERESIS_TICKS = 2;

/** Orthogonal neighbour offsets. Module scope: the loop allocates nothing. */
const NEIGHBOUR_DX = [1, -1, 0, 0] as const;
const NEIGHBOUR_DZ = [0, 0, 1, -1] as const;

export interface TrailFusionState {
  readonly gridSize: number;
  /** Segment capacity of `levels`. */
  readonly capacity: number;
  /** 1 where a body segment sits this tick, indexed `z * gridSize + x`. */
  readonly body: Uint8Array;
  /** 1 where a SOLID terrain block sits. Forming blocks are flat decals the
   *  snake crosses freely, so they are not packing neighbours. */
  readonly solid: Uint8Array;
  /** Committed (hysteresis-filtered) level per cell. */
  readonly committed: Uint8Array;
  /** The level currently accumulating evidence against `committed`. */
  readonly pendingLevel: Uint8Array;
  /** Consecutive ticks `pendingLevel` has held. */
  readonly pendingTicks: Uint8Array;
  /** Tick number this cell last held a body segment; -1 for never. */
  readonly lastBodyTick: Int32Array;
  /** Output: committed level per SEGMENT INDEX, for the renderer to read. */
  readonly levels: Uint8Array;
  /** Segments described by `levels` after the last update. */
  count: number;
  /**
   * Monotonic tick counter. Starts at 1, deliberately: `lastBodyTick` is
   * seeded with -1 for "never", and if the first update ran as tick 0 then
   * `tick - 1` would equal that sentinel and every cell on the opening tick
   * would be mistaken for one that was already body last tick - the whole
   * first coil would need two ticks to reach its true level.
   */
  tick: number;
}

export function createTrailFusionState(
  gridSize: number,
  capacity: number
): TrailFusionState {
  const cells = gridSize * gridSize;
  const state: TrailFusionState = {
    gridSize,
    capacity,
    body: new Uint8Array(cells),
    solid: new Uint8Array(cells),
    committed: new Uint8Array(cells),
    pendingLevel: new Uint8Array(cells),
    pendingTicks: new Uint8Array(cells),
    lastBodyTick: new Int32Array(cells),
    levels: new Uint8Array(capacity),
    count: 0,
    tick: 0,
  };
  resetTrailFusion(state);
  return state;
}

/** Forget everything (call on run start, so a new run never inherits the
 *  previous run's committed levels for cells it happens to re-enter). */
export function resetTrailFusion(state: TrailFusionState): void {
  state.body.fill(0);
  state.solid.fill(0);
  state.committed.fill(0);
  state.pendingLevel.fill(0);
  state.pendingTicks.fill(0);
  state.lastBodyTick.fill(-1);
  state.levels.fill(0);
  state.count = 0;
  state.tick = 1;
}

/**
 * Fold one engine tick into the fusion state.
 *
 * `cells` is the interpolation buffer's `curr` array: the authoritative INTEGER
 * grid cells of the current tick, packed `[x0, z0, x1, z1, ...]`. Index 0 is
 * the head. The head is included in occupancy (it blocks its cell like any
 * other segment) even though the renderer draws it as a separate mesh.
 *
 * `wrapActive` must be true whenever the arena edges are a passage rather than
 * a wall - which, since WP-3.13, means `ruleset.torus`: COSMIC's board wraps
 * permanently, so its edges are NEVER packing neighbours, and the flag it used
 * to read (`fluxPhase === 'open'`, true for 75 ticks in every 125) no longer
 * exists. While the edge is passable it must NOT count as a packing neighbour,
 * or the metric pays out for hugging an open seam, which is the opposite of
 * the behaviour it exists to teach.
 *
 * Call this ONCE PER ENGINE TICK, not per frame: the measurement is defined on
 * integer grid cells and does not change between ticks.
 */
export function updateTrailFusion(
  state: TrailFusionState,
  cells: Float32Array,
  count: number,
  terrain: readonly TerrainBlock[] | null | undefined,
  wrapActive: boolean
): void {
  const { gridSize, body, solid, committed, pendingLevel, pendingTicks, lastBodyTick, levels } =
    state;
  // Logical length can exceed the board's 400 cells under Rule 15. Walk every
  // packed segment so a unique tail cell beyond index 399 still contributes
  // occupancy; the per-segment compatibility output remains capacity-bounded.
  const segments = Math.min(count, cells.length >> 1);

  // 400 bytes each on a 20x20 board: a memset is cheaper than tracking and
  // clearing last tick's cells, and it cannot drift out of sync.
  body.fill(0);
  solid.fill(0);

  for (let i = 0; i < segments; i++) {
    const x = cells[i * 2];
    const z = cells[i * 2 + 1];
    if (x < 0 || x >= gridSize || z < 0 || z >= gridSize) continue;
    body[z * gridSize + x] = 1;
  }

  if (terrain) {
    for (const block of terrain) {
      // Only solid blocks pack. A forming block is a floor decal the snake
      // crosses; treating it as occupied would promise a fusion the player
      // has not earned and cannot yet rely on.
      if (!block.solid) continue;
      const { x, z } = block;
      if (x < 0 || x >= gridSize || z < 0 || z >= gridSize) continue;
      solid[z * gridSize + x] = 1;
    }
  }

  const tick = state.tick;
  const previousTick = tick - 1;

  for (let i = 0; i < segments; i++) {
    const x = cells[i * 2];
    const z = cells[i * 2 + 1];
    if (x < 0 || x >= gridSize || z < 0 || z >= gridSize) {
      if (i < levels.length) levels[i] = 0;
      continue;
    }
    const cell = z * gridSize + x;

    // Growth duplicates the tail cell, so two indices can name one cell. The
    // second visit must read the level, never re-run the hysteresis step -
    // otherwise the duplicate looks like a cell that was absent last tick and
    // resets its own history.
    if (lastBodyTick[cell] === tick) {
      if (i < levels.length) levels[i] = committed[cell];
      continue;
    }

    const raw = rawFusionAt(state, cells, segments, i, x, z, wrapActive);

    if (lastBodyTick[cell] !== previousTick) {
      // This cell became body this tick (the head's cell, or a cell re-entered
      // after an absence). Adopt the measurement immediately: there is no
      // flicker to suppress yet, and inheriting a level committed on some
      // earlier visit would be simply wrong.
      committed[cell] = raw;
      pendingLevel[cell] = raw;
      pendingTicks[cell] = 0;
    } else if (raw === committed[cell]) {
      pendingLevel[cell] = raw;
      pendingTicks[cell] = 0;
    } else if (raw === pendingLevel[cell]) {
      const held = pendingTicks[cell] + 1;
      if (held >= FUSION_HYSTERESIS_TICKS) {
        committed[cell] = raw;
        pendingTicks[cell] = 0;
      } else {
        pendingTicks[cell] = held;
      }
    } else {
      pendingLevel[cell] = raw;
      pendingTicks[cell] = 1;
    }

    lastBodyTick[cell] = tick;
    if (i < levels.length) levels[i] = committed[cell];
  }

  state.count = Math.min(segments, state.capacity);
  state.tick = tick + 1;
}

/**
 * The unfiltered measurement for one segment: occupied orthogonal neighbours
 * that are not this segment's path neighbours, clamped to FUSION_MAX.
 *
 * Path neighbours are excluded BY CELL rather than by index, which also
 * disposes of the COSMIC wrap seam for free: when the chain crosses the seam
 * the predecessor's cell is a board away and simply is not one of the four
 * cells being tested.
 */
function rawFusionAt(
  state: TrailFusionState,
  cells: Float32Array,
  segments: number,
  index: number,
  x: number,
  z: number,
  wrapActive: boolean
): number {
  const { gridSize, body, solid } = state;

  const pathA = index > 0 ? cellIndexOf(cells, index - 1, gridSize) : -1;
  const pathB = index + 1 < segments ? cellIndexOf(cells, index + 1, gridSize) : -1;

  let packed = 0;
  for (let d = 0; d < 4; d++) {
    const nx = x + NEIGHBOUR_DX[d];
    const nz = z + NEIGHBOUR_DZ[d];

    if (nx < 0 || nx >= gridSize || nz < 0 || nz >= gridSize) {
      // A wall packs. An OPEN edge does not - while COSMIC's flux phase (or a
      // rift) has the border passable it is a corridor, not a backstop, and
      // paying for touching it would reward hugging the one seam that is not
      // actually spending space.
      if (!wrapActive) packed++;
      continue;
    }

    const neighbour = nz * gridSize + nx;
    if (neighbour === pathA || neighbour === pathB) continue;
    if (body[neighbour] === 1 || solid[neighbour] === 1) packed++;
  }

  return packed > FUSION_MAX ? FUSION_MAX : packed;
}

function cellIndexOf(cells: Float32Array, index: number, gridSize: number): number {
  const x = cells[index * 2];
  const z = cells[index * 2 + 1];
  if (x < 0 || x >= gridSize || z < 0 || z >= gridSize) return -1;
  return z * gridSize + x;
}

/** Committed level for a segment index; 0 for anything out of range. */
export function getFusionLevel(state: TrailFusionState, index: number): number {
  if (index < 0 || index >= state.count) return 0;
  return state.levels[index];
}
