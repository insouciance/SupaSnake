/**
 * TERRAIN — a cell that is occupied and lethal (WP-3.03).
 *
 * That is the whole idea. Not a hazard system, not an entity, not a mode: a
 * cell that behaves like wall. One primitive, four consumers:
 *
 *   - CYBER's arena hardens from the outside in (`DYNASTY_CYBER`)
 *   - COSMIC's uncollected stars calcify where they sat (`DYNASTY_COSMIC`)
 *   - PRIMAL's FERAL-2 "Fortress" petrifies the oldest tail segments (shipped
 *     WP-3.11; it uses the block, the forming phase and the pending state, and
 *     none of the schedule - `nextTerrainCells` is the ARENA's selector)
 *   - a future ladder rung can start a run with a ring already placed
 *
 * PHYSICS, NEVER PAYOUT. Terrain decides when you die, not what you earn — the
 * same split COSMIC's wall cycle already uses ("physical, never in the payout
 * formula", rulesets.ts:216). The server therefore does not replay block
 * positions and needs no new validation surface: the recompute already bounds
 * the only things terrain can influence, which are duration and food count.
 * Determinism below exists for REPLAYABILITY (challenge links, same-seed runs),
 * not for validation.
 *
 * RULE 15. Blocks are added and never removed. No gene, tier, splice, revive or
 * rung may clear one — clearing terrain would grow free space, which is the one
 * thing the Constitution's fifteenth rule forbids.
 *
 * THE OVERLAP INVARIANT, and why it is structural rather than lucky:
 *
 *   > A solid block is never overlapped by any part of the snake.
 *
 * In Snake the body strictly follows the head — every segment was previously a
 * head position (the engine unshifts the head and pops the tail; growth
 * duplicates the tail cell). So if the head can never ENTER a solid cell, no
 * segment can ever OCCUPY one. Head-only lethality plus clear-cell
 * solidification therefore makes the overlap case impossible, not merely rare:
 * the renderer never has to solve it, and there is no unfair-death case to
 * tune. The owner ruled this after noticing that a block sharing a tile with
 * the tail "is just not gonna look good, graphics-wise" — the visual constraint
 * produced the better mechanic.
 */

export interface TerrainCell {
  x: number;
  z: number;
}

export interface TerrainBlock extends TerrainCell {
  /**
   * Ticks remaining before this block may solidify. While positive the block
   * is a floor DECAL: visible, animating, and harmless. The snake passes over
   * it freely.
   *
   * The forming phase is not a courtesy — it is what makes terrain a
   * positioning problem rather than a random death.
   */
  formingTicks: number;
  /**
   * Ticks this block's forming phase started with, so a renderer can show
   * PROGRESS rather than a bare countdown.
   *
   * WP-3.05: added because the forming phase is the entire fairness argument
   * for terrain, and an argument the player cannot see is not being made. The
   * remaining count alone cannot be drawn as a fill — you need what it started
   * from.
   */
  formingTotal: number;
  /**
   * Solid blocks are lethal to the HEAD only. A block whose forming has
   * finished but whose cell is still occupied by the snake stays a decal and
   * waits (the "pending" state): it can never kill the body it appeared under.
   */
  solid: boolean;
}

export interface TerrainSchedule {
  /** Blocks placed each interval. */
  blocksPerInterval: number;
  /** Foods between placements. Food-indexed, never time-indexed: a food count is replayable. */
  intervalFoods: number;
  /** Forming duration, in SECONDS. Converted by the live tick — see below. */
  formingSeconds: number;
}

/**
 * Authored in seconds and converted by the live tick, deliberately.
 *
 * Three bounds in this wave were found denominated in the wrong unit — the
 * food-rate bound (blind to multi-food), the extraction window (ticks, so it
 * shrank fourfold as CYBER accelerated), and the hold thresholds (absolute
 * lengths). A forming phase in ticks would rot the same way the moment a
 * dynasty's speed curve is retuned.
 */
export function formingTicksFor(
  schedule: TerrainSchedule,
  tickMs: number
): number {
  return formingTicksForSeconds(schedule.formingSeconds, tickMs);
}

/**
 * The same conversion for terrain that has no SCHEDULE.
 *
 * PRIMAL's Fortress (WP-3.11) places blocks on the cells its own body is
 * standing on, so it has a forming duration but no ring, no interval and no
 * per-interval count. Handing it a fabricated `TerrainSchedule` to reach the
 * conversion would put three meaningless numbers on the record; the honest
 * shape is a duration, and `formingTicksFor` now delegates here so the two can
 * never round differently.
 */
export function formingTicksForSeconds(
  seconds: number,
  tickMs: number
): number {
  const ms = Math.max(1, tickMs);
  return Math.max(1, Math.round((seconds * 1000) / ms));
}

/** How many blocks should exist by the time `foods` have been eaten. */
export function blocksDueAt(schedule: TerrainSchedule, foods: number): number {
  if (schedule.intervalFoods <= 0) return 0;
  const intervals = Math.floor(Math.max(0, foods) / schedule.intervalFoods);
  return intervals * schedule.blocksPerInterval;
}

/**
 * The ring index of a cell: 0 is the outermost ring, growing inward.
 *
 * The arena hardens from the OUTSIDE IN, which is what produces the "closing
 * in" read. Scattered interior blocks would be a different game and must not
 * arrive as a tuning value.
 */
export function ringOf(cell: TerrainCell, gridSize: number): number {
  return Math.min(cell.x, cell.z, gridSize - 1 - cell.x, gridSize - 1 - cell.z);
}

/**
 * Choose the next terrain cells: outermost ring that still has room, in a
 * seeded order so a replayed run hardens identically.
 *
 * `blocked` is every cell that already holds terrain or a board object that
 * must not be buried (food, the exit portal). The snake is deliberately NOT
 * blocked: a block may FORM under the body — that is the interesting case, and
 * the pending state (§ `TerrainBlock.solid`) is what keeps it fair.
 */
export function nextTerrainCells(
  gridSize: number,
  blocked: ReadonlySet<string>,
  count: number,
  rng: () => number
): TerrainCell[] {
  if (count <= 0 || gridSize <= 0) return [];
  const maxRing = Math.floor((gridSize - 1) / 2);
  const chosen: TerrainCell[] = [];
  const taken = new Set(blocked);

  for (let ring = 0; ring <= maxRing && chosen.length < count; ring++) {
    const free: TerrainCell[] = [];
    for (let x = ring; x < gridSize - ring; x++) {
      for (let z = ring; z < gridSize - ring; z++) {
        if (ringOf({ x, z }, gridSize) !== ring) continue;
        if (taken.has(cellKey(x, z))) continue;
        free.push({ x, z });
      }
    }
    // Seeded partial Fisher-Yates - the same shuffle discipline the Serpent's
    // modifier draw uses, so a replay lays the arena down identically.
    for (let i = free.length - 1; i > 0 && chosen.length < count; i--) {
      const j = Math.floor(rng() * (i + 1));
      [free[i], free[j]] = [free[j], free[i]];
    }
    for (const cell of free) {
      if (chosen.length >= count) break;
      chosen.push(cell);
      taken.add(cellKey(cell.x, cell.z));
    }
  }
  return chosen;
}

export function cellKey(x: number, z: number): string {
  return `${x},${z}`;
}
