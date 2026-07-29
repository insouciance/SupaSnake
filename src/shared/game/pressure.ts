/**
 * BOARD PRESSURE — one vocabulary for the difficulty clock.
 *
 * Rule 15 names two monotonic quantities: logical length never falls and free
 * space never grows. The engine previously approximated both with
 * `snake.length / boardArea`, which stopped being true as soon as Fortress
 * moved live segments into terrain and growth began duplicating the tail cell.
 *
 * Three measurements are deliberately separate:
 *
 * - `logicalSegments` — every earned segment, including petrified length. This
 *   is the economic/difficulty clock and may exceed the number of board cells.
 * - `physicalOccupiedCells` — unique live-body cells plus SOLID terrain. These
 *   are the cells the head cannot enter right now.
 * - `committedOccupiedCells` — unique live-body cells plus every terrain cell,
 *   including forming and pending blocks. These cells have already been
 *   claimed permanently and are unavailable to food placement.
 *
 * A caller must choose the measurement whose question it is answering. In
 * particular, food-search radius reads COMMITTED occupancy: Fortress removing
 * six live array entries must not make the board appear roomier while the same
 * six cells are becoming permanent terrain.
 */

import type { TerrainBlock } from './terrain';

export interface BoardCell {
  x: number;
  z: number;
}

export interface BoardPressureSnapshot {
  boardCells: number;
  logicalSegments: number;
  uniqueLiveCells: number;
  solidTerrainCells: number;
  committedTerrainCells: number;
  physicalOccupiedCells: number;
  committedOccupiedCells: number;
  physicalFreeCells: number;
  committedFreeCells: number;
  physicalOccupancy: number;
  committedOccupancy: number;
}

function cellIndex(cell: BoardCell, gridSize: number): number {
  const x = Math.trunc(cell.x);
  const z = Math.trunc(cell.z);
  if (x !== cell.x || z !== cell.z) return -1;
  if (x < 0 || x >= gridSize || z < 0 || z >= gridSize) return -1;
  return z * gridSize + x;
}

/**
 * Measure current and already-committed board pressure.
 *
 * Allocates three board-sized byte arrays per call. The live engine calls this
 * when a food wave is placed, not per render frame; keeping the function pure
 * and impossible to drift is worth 1.2KB on the fixed 20x20 board.
 */
export function boardPressureSnapshot(
  gridSize: number,
  liveBody: readonly BoardCell[],
  terrain: readonly TerrainBlock[],
  logicalSegments: number = liveBody.length
): BoardPressureSnapshot {
  const size = Number.isFinite(gridSize) ? Math.max(0, Math.trunc(gridSize)) : 0;
  const boardCells = size * size;
  const logical = Number.isFinite(logicalSegments)
    ? Math.max(0, Math.trunc(logicalSegments))
    : 0;

  if (boardCells === 0) {
    return {
      boardCells: 0,
      logicalSegments: logical,
      uniqueLiveCells: 0,
      solidTerrainCells: 0,
      committedTerrainCells: 0,
      physicalOccupiedCells: 0,
      committedOccupiedCells: 0,
      physicalFreeCells: 0,
      committedFreeCells: 0,
      physicalOccupancy: 0,
      committedOccupancy: 0,
    };
  }

  const live = new Uint8Array(boardCells);
  const solid = new Uint8Array(boardCells);
  const committed = new Uint8Array(boardCells);

  for (const segment of liveBody) {
    const index = cellIndex(segment, size);
    if (index >= 0) live[index] = 1;
  }
  for (const block of terrain) {
    const index = cellIndex(block, size);
    if (index < 0) continue;
    committed[index] = 1;
    if (block.solid) solid[index] = 1;
  }

  let uniqueLiveCells = 0;
  let solidTerrainCells = 0;
  let committedTerrainCells = 0;
  let physicalOccupiedCells = 0;
  let committedOccupiedCells = 0;
  for (let index = 0; index < boardCells; index++) {
    const hasLive = live[index] === 1;
    const hasSolid = solid[index] === 1;
    const hasCommitted = committed[index] === 1;
    if (hasLive) uniqueLiveCells++;
    if (hasSolid) solidTerrainCells++;
    if (hasCommitted) committedTerrainCells++;
    if (hasLive || hasSolid) physicalOccupiedCells++;
    if (hasLive || hasCommitted) committedOccupiedCells++;
  }

  return {
    boardCells,
    logicalSegments: logical,
    uniqueLiveCells,
    solidTerrainCells,
    committedTerrainCells,
    physicalOccupiedCells,
    committedOccupiedCells,
    physicalFreeCells: boardCells - physicalOccupiedCells,
    committedFreeCells: boardCells - committedOccupiedCells,
    physicalOccupancy: physicalOccupiedCells / boardCells,
    committedOccupancy: committedOccupiedCells / boardCells,
  };
}
