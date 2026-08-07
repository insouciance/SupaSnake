/**
 * ET-3 — value comparisons for the per-tick store sync.
 *
 * `SnakeGameLogic.getState()` deep-clones every collection it returns, on
 * purpose: a stable array reference would never re-render, and WP-3.05 already
 * paid for that once with terrain that was computed, lethal, and invisible.
 * The cost of that correctness is that EVERY mirrored field arrives with a new
 * identity on every movement tick, so a `set` per field per tick woke every
 * subscriber in the app whether or not anything it draws had changed.
 *
 * These comparators put the change detection where it belongs — on the VALUE,
 * not on the reference. The clone stays; the store write does not happen
 * unless the content actually moved. Nothing here is allowed to be cleverer
 * than the field it compares: an equality that misses a change is the
 * invisible-terrain bug again, so each function names every field that is
 * drawn from it.
 */

import type { Direction, Position } from '@/lib/game/SnakeGameLogic';
import type { TerrainBlock } from '@/shared/game/terrain';
import type { GenomeRevive } from '@/shared/game/genome';
import type { SpliceId, } from '@/shared/game/splices';
import type { StrainId, StrainPoints } from '@/shared/game/strains';

/** A single board cell: null-safe, because most of these fields can be absent. */
export function samePosition(
  left: Position | null | undefined,
  right: Position | null | undefined
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

/** The snake body, the food wave, any ordered run of cells. */
export function samePositions(
  left: readonly Position[],
  right: readonly Position[]
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
    if (a.x !== b.x || a.y !== b.y || a.z !== b.z) return false;
  }
  return true;
}

/**
 * Terrain blocks, including the forming countdown.
 *
 * `formingTicks` is compared because it is DRAWN — the fill that tells the
 * player how long a decal has before it turns lethal. Comparing only position
 * would freeze that fill at its first frame.
 */
export function sameTerrain(
  left: readonly TerrainBlock[],
  right: readonly TerrainBlock[]
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
    if (
      a.x !== b.x ||
      a.z !== b.z ||
      a.source !== b.source ||
      a.solid !== b.solid ||
      a.formingTicks !== b.formingTicks ||
      a.formingTotal !== b.formingTotal
    ) {
      return false;
    }
  }
  return true;
}

/** AURUM's Gilded Wake: the trail cells and their remaining life. */
export function sameGildedCells(
  left: readonly { x: number; z: number; ticks: number }[],
  right: readonly { x: number; z: number; ticks: number }[]
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
    if (a.x !== b.x || a.z !== b.z || a.ticks !== b.ticks) return false;
  }
  return true;
}

/** Buffered inputs, in the order the engine will consume them. */
export function sameDirections(
  left: readonly Direction[],
  right: readonly Direction[]
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

/** Strain points and strain tiers: both are sparse strain-keyed number maps. */
export function sameStrainMap(
  left: StrainPoints | Partial<Record<StrainId, number>>,
  right: StrainPoints | Partial<Record<StrainId, number>>
): boolean {
  if (left === right) return true;
  const leftKeys = Object.keys(left) as StrainId[];
  const rightKeys = Object.keys(right) as StrainId[];
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}

/** Fused splices, in fusion order — the order is part of the readout. */
export function sameFusedSplices(
  left: readonly { id: SpliceId; atFood: number }[],
  right: readonly { id: SpliceId; atFood: number }[]
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i].id !== right[i].id || left[i].atFood !== right[i].atFood) {
      return false;
    }
  }
  return true;
}

/** The run's one revive, once it has fired. */
export function sameRevive(
  left: GenomeRevive | null,
  right: GenomeRevive | null
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.kind === right.kind && left.atFood === right.atFood;
}
