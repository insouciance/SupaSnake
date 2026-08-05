/**
 * TERRAIN — a cell that is occupied and lethal (WP-3.03).
 *
 * That is the whole idea. Not a hazard system, not an entity, not a mode: a
 * cell that behaves like wall. One primitive, four consumers:
 *
 *   - CYBER's arena hardens from the outside in (`DYNASTY_CYBER`)
 *   - COSMIC's uncollected stars calcify where they sat (`DYNASTY_COSMIC`,
 *     shipped WP-3.13)
 *   - PRIMAL's FERAL-2 "Fortress" petrifies the oldest tail segments (shipped
 *     WP-3.11)
 *   - a future ladder rung can start a run with a ring already placed
 *
 * TWO OF THOSE FOUR HAVE NO SCHEDULE, which is worth stating once here rather
 * than discovering twice. `nextTerrainCells` is the ARENA's selector: it picks
 * the outermost ring that still has room, and only CYBER wants that. Fortress
 * and COSMIC both know EXACTLY which cells they are laying - the body segments
 * that just petrified, the stars whose window just closed - so they use the
 * block, the forming phase and the pending state, and none of the schedule.
 * They meet in the engine's `placeTerrainAt`, not here.
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

/** The mechanic that permanently claimed this cell. */
export type TerrainSource = 'cyber' | 'fortress' | 'cosmic' | 'ladder';

export interface TerrainBlock extends TerrainCell {
  /** Visual/semantic provenance; physics remains identical for every source. */
  source: TerrainSource;
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
  /** Arena schedules currently belong to CYBER; ladder starts use `ladder`. */
  source: Extract<TerrainSource, 'cyber' | 'ladder'>;
  /** Blocks placed each interval. */
  blocksPerInterval: number;
  /** Foods between placements. Food-indexed, never time-indexed: a food count is replayable. */
  intervalFoods: number;
  /** Forming duration, in SECONDS. Converted by the live tick — see below. */
  formingSeconds: number;
}

/**
 * Seconds -> ticks at the live tick rate, floored at one tick.
 *
 * AUTHORED IN SECONDS AND CONVERTED BY THE LIVE TICK, DELIBERATELY. Three
 * bounds in this wave were found denominated in the wrong unit — the food-rate
 * bound (blind to multi-food), the extraction window (ticks, so it shrank
 * fourfold as CYBER accelerated), and the hold thresholds (absolute lengths).
 * A forming phase in ticks would rot the same way the moment a dynasty's speed
 * curve is retuned.
 *
 * A SECONDS ARGUMENT RATHER THAN A `TerrainSchedule`, because two of the four
 * consumers have no schedule. PRIMAL's Fortress (WP-3.11) places blocks on the
 * cells its own body is standing on and COSMIC (WP-3.13) on the cells its
 * missed stars sat on: a forming duration, but no ring, no interval and no
 * per-interval count. Handing either a fabricated schedule to reach the
 * conversion would put three meaningless numbers on the record.
 *
 * It had a `formingTicksFor(schedule, tickMs)` sibling that took the whole
 * schedule and read one field off it. That sibling lost its last call site
 * when the engine's three block-laying paths were composed into
 * `placeTerrainAt`, which takes seconds — so it was deleted rather than left
 * as a second way to reach one conversion, which is the thing this function
 * exists to prevent.
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

/** The four moves a head can make. Module-level so no fill allocates it. */
const ORTHOGONAL_STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * THE CONNECTIVITY GUARANTEE (owner ruling, 2026-08-05).
 *
 * Unlimited inward ring progression STAYS — it is CYBER's ruled trait, and a
 * board that keeps closing is the dynasty's whole difficulty story. What was
 * never ruled, and what the board-fill certification found, is the arena
 * SPLITTING the field: a block laid on an articulation point severs the free
 * cells into two regions, and everything on the far side becomes unreachable
 * for the rest of the run. That is the entombment BF-1 measured, and it is not
 * difficulty — it is the board deleting cells the player had earned a route to.
 *
 * So placement now asks one question before laying a cell: WOULD THIS PARTITION
 * THE FIELD? If yes, the cell is skipped, the ring lays its other cells, and the
 * skipped one is caught on a later pass — by then its neighbours have filled in
 * and it is no longer an articulation point. Nothing is removed and nothing is
 * refused permanently: Rule 15 is untouched, the schedule still owes exactly as
 * many blocks as it always did, and the field still closes all the way to a
 * single cell (a free set of size 0 or 1 is trivially connected, so saturation
 * remains reachable).
 *
 * DETERMINISM, WHICH IS THE WHOLE REASON IT IS SHAPED THIS WAY:
 *
 *   - The check is a pure function of (gridSize, the solid set, the candidate).
 *     It reads no clock, no body, no board object, and no engine field.
 *   - It consumes NO randomness. The seeded shuffle above it draws exactly the
 *     numbers it drew before, in the same order, whether a cell is skipped or
 *     taken — so the rng stream a replay walks is untouched by the guard.
 *   - The scan order is row-major and the fill is a queue, so the visited count
 *     is order-independent anyway; there is no set/map iteration order in it.
 *   - It is bounded by the board: at most `gridSize * gridSize` (400 shipped)
 *     nodes per candidate, with no allocation per neighbour.
 *
 * A replay therefore reaches byte-identical terrain, which is what lets the
 * server validate a CYBER run at all.
 */
function fieldStaysConnected(
  gridSize: number,
  solid: ReadonlySet<string>,
  candidate: TerrainCell,
  wrap: boolean
): boolean {
  const cells = gridSize * gridSize;
  // Every cell that would be solid AFTER this placement.
  const freeCount = cells - solid.size - 1;
  // Zero or one free cell cannot be partitioned - this is the saturation end
  // state, and refusing it here would be the arena declining to finish.
  if (freeCount <= 1) return true;

  const isSolid = (x: number, z: number): boolean =>
    solid.has(cellKey(x, z)) || (x === candidate.x && z === candidate.z);

  // Deterministic seed: the first free cell in row-major order.
  let startX = -1;
  let startZ = -1;
  for (let x = 0; x < gridSize && startX < 0; x++) {
    for (let z = 0; z < gridSize; z++) {
      if (isSolid(x, z)) continue;
      startX = x;
      startZ = z;
      break;
    }
  }
  if (startX < 0) return true;

  const seen = new Uint8Array(cells);
  const queue = new Int32Array(freeCount);
  let head = 0;
  let tail = 0;
  seen[startX * gridSize + startZ] = 1;
  queue[tail++] = startX * gridSize + startZ;
  let reached = 1;

  while (head < tail) {
    const index = queue[head++];
    const x = (index / gridSize) | 0;
    const z = index - x * gridSize;
    for (const [dx, dz] of ORTHOGONAL_STEPS) {
      let nx = x + dx;
      let nz = z + dz;
      if (wrap) {
        nx = ((nx % gridSize) + gridSize) % gridSize;
        nz = ((nz % gridSize) + gridSize) % gridSize;
      } else if (nx < 0 || nx >= gridSize || nz < 0 || nz >= gridSize) {
        continue;
      }
      const next = nx * gridSize + nz;
      if (seen[next]) continue;
      if (isSolid(nx, nz)) continue;
      seen[next] = 1;
      // `tail` can never exceed `freeCount`: only free cells are enqueued and
      // each is stamped once.
      queue[tail++] = next;
      reached += 1;
    }
  }
  return reached === freeCount;
}

/** The board topology and permanent occupancy the connectivity guard reads. */
export interface TerrainFieldOptions {
  /**
   * Cells that are PERMANENTLY claimed: existing terrain, of any source.
   *
   * Deliberately not the same set as `blocked`. Food, the exit portal and a
   * relic are cells placement must not bury, but they are cells the snake walks
   * over freely - counting them as walls would make the guard refuse placements
   * that partition nothing. Defaults to `blocked`, which is the conservative
   * reading for a caller that has no separate solid set.
   */
  solid?: ReadonlySet<string>;
  /** COSMIC's torus. Adjacency wraps at every edge when true. */
  wrap?: boolean;
}

/**
 * Choose the next terrain cells: outermost ring that still has room, in a
 * seeded order so a replayed run hardens identically.
 *
 * `blocked` is every cell that already holds terrain or a board object that
 * must not be buried (food, the exit portal). The snake is deliberately NOT
 * blocked: a block may FORM under the body — that is the interesting case, and
 * the pending state (§ `TerrainBlock.solid`) is what keeps it fair.
 *
 * A candidate that would PARTITION the free field is skipped (see
 * `fieldStaysConnected`). Skipped cells are retried in further passes over the
 * same ring, because a cell stops being an articulation point as soon as one of
 * its neighbours fills in - so a ring still completes, it just completes in an
 * order that never severs the board.
 */
export function nextTerrainCells(
  gridSize: number,
  blocked: ReadonlySet<string>,
  count: number,
  rng: () => number,
  field: TerrainFieldOptions = {}
): TerrainCell[] {
  if (count <= 0 || gridSize <= 0) return [];
  const maxRing = Math.floor((gridSize - 1) / 2);
  const chosen: TerrainCell[] = [];
  const taken = new Set(blocked);
  const solid = new Set(field.solid ?? blocked);
  const wrap = field.wrap === true;

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
    // modifier draw uses, so a replay lays the arena down identically. It runs
    // BEFORE any connectivity decision, and always draws the same numbers, so
    // the guard cannot move the rng stream.
    for (let i = free.length - 1; i > 0 && chosen.length < count; i--) {
      const j = Math.floor(rng() * (i + 1));
      [free[i], free[j]] = [free[j], free[i]];
    }
    // Repeated passes over the shuffled ring: a cell skipped as an articulation
    // point becomes legal once a neighbour is claimed, and a pass that places
    // nothing ends the ring. Terminates because each pass either shrinks the
    // candidate list or stops.
    let remaining = free;
    while (chosen.length < count && remaining.length > 0) {
      const deferred: TerrainCell[] = [];
      let placed = 0;
      for (const cell of remaining) {
        if (chosen.length >= count) {
          deferred.push(cell);
          continue;
        }
        if (!fieldStaysConnected(gridSize, solid, cell, wrap)) {
          deferred.push(cell);
          continue;
        }
        chosen.push(cell);
        taken.add(cellKey(cell.x, cell.z));
        solid.add(cellKey(cell.x, cell.z));
        placed += 1;
      }
      if (placed === 0) break;
      remaining = deferred;
    }
  }
  return chosen;
}

export function cellKey(x: number, z: number): string {
  return `${x},${z}`;
}
