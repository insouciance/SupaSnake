/**
 * FOOD PLACEMENT — where the next food goes (WP-3.05).
 *
 * Two defects and one design change meet in this module.
 *
 * THE DESIGN CHANGE. Three simultaneous foods shipped in WP-3.02 as a
 * TRAVERSE-TIME fix: on the owner's record run seconds-per-food climbed from
 * 3.0 to 6.9 at the median while the MEAN quadrupled, and it is that tail —
 * a few enormous walks across a board that is mostly your own body — that ends
 * long runs in irritation rather than defeat. More foods on the board shortens
 * the walk by giving you a nearer target.
 *
 * It worked, and the owner rejected it anyway (2026-07-28: "what i certainly
 * don't like are the 3 foods on the screen"), correctly. Snake's loop is ONE
 * target: three targets means never committing to a path, which is a cheaper
 * decision, and the board reads as clutter. Worse, the extras spawn CLUSTERED
 * within `groupRadius` of the first, and only the first gets a spotlight — so
 * the mechanic paying for the traverse fix looked like a dim clump in a corner.
 *
 * So the traverse tail is fixed at its cause instead: ONE food, placed nearer
 * the head as the board fills. `foodSearchRadius` is the whole idea — an empty
 * board is unbounded (identical to the shipped game), a full one keeps the hunt
 * inside a neighbourhood you can actually reach.
 *
 * DEFECT 1: THE PLACER COULD RETURN AN ILLEGAL CELL. The shipped sampler
 * rejection-samples up to 1000 times and then RETURNS ITS LAST GUESS whatever
 * it is — potentially on top of the snake. That is statistically unreachable on
 * a sparse board, which is the only board this game has ever had; this wave
 * deliberately drives runs to high occupancy, where it stops being unreachable.
 * Enumerating the free cells removes the failure mode instead of making it
 * rarer: if a legal cell exists this returns one, and if none exists it returns
 * `null` and says so, which is a board the player has completely filled.
 *
 * DEFECT 2: FOOD COULD SPAWN WHERE THE HEAD CANNOT GO. Nothing checked
 * reachability, so a food could land in a pocket sealed by your own body —
 * an unwinnable position produced by the game rather than by the player. The
 * flood fill is ~400 cells once per food; the cost is not measurable.
 *
 * PHYSICS, NEVER PAYOUT. Placement decides where you go, not what you earn.
 * The server does not replay food positions and needs no new validation
 * surface — the recompute already bounds the only things placement can
 * influence, which are duration and food count. Determinism below exists for
 * REPLAYABILITY (challenge links, same-seed runs), matching `terrain.ts`.
 */

export interface PlacementCell {
  x: number;
  z: number;
}

/**
 * Closest the search may ever squeeze. Below this, food is effectively handed
 * to the player and the hunt stops being navigation — the failure mode at the
 * opposite end from the one this module exists to fix.
 */
export const FOOD_RADIUS_MIN = 5;

/**
 * How sharply the search tightens as the board fills. [H] — a dial the owner
 * settles by playing, not by analysis.
 *
 * Above 1 keeps the early game honest: at the 8% occupancy of a median run the
 * radius still spans the whole board, so nothing about the opening changes.
 * The bound only starts to bite past roughly half-full, which is exactly where
 * the seconds-per-food tail lives.
 */
export const FOOD_RADIUS_FALLOFF = 1.5;

/**
 * Chebyshev radius around the head within which food prefers to spawn.
 *
 * Returns a radius that covers the entire board while the board is empty, so
 * the shipped distribution is preserved where the shipped game was fine.
 */
export function foodSearchRadius(gridSize: number, occupancy: number): number {
  const free = Math.min(1, Math.max(0, 1 - occupancy));
  const scaled = Math.round(gridSize * Math.pow(free, FOOD_RADIUS_FALLOFF));
  return Math.max(FOOD_RADIUS_MIN, scaled);
}

export function placementKey(x: number, z: number): string {
  return `${x},${z}`;
}

function chebyshev(a: PlacementCell, b: PlacementCell): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
}

/**
 * Every cell the head can actually reach, walking orthogonally over free cells.
 *
 * The snake's own body counts as blocked. That is deliberately CONSERVATIVE:
 * the tail vacates as you travel, so a region sealed only by your tail may open
 * before you arrive. Treating it as sealed can therefore reject a cell that
 * would have been fine — but the opposite error puts food somewhere the player
 * provably cannot go, which is the game killing a run rather than the player
 * losing one. When the conservative filter finds nothing, the caller falls back
 * rather than refusing to place food at all.
 */
export function reachableFrom(
  gridSize: number,
  head: PlacementCell,
  blocked: ReadonlySet<string>
): Set<string> {
  const seen = new Set<string>();
  if (gridSize <= 0) return seen;
  const start: PlacementCell[] = [];
  // The head's own cell is blocked (it holds the head), so seed from its free
  // orthogonal neighbours - the cells a first move could actually enter.
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const nx = head.x + dx;
    const nz = head.z + dz;
    if (nx < 0 || nx >= gridSize || nz < 0 || nz >= gridSize) continue;
    const key = placementKey(nx, nz);
    if (blocked.has(key) || seen.has(key)) continue;
    seen.add(key);
    start.push({ x: nx, z: nz });
  }
  // Iterative, never recursive: a 400-cell fill is fine either way, but a
  // board-sized recursion is a stack depth nobody wants to reason about.
  for (let i = 0; i < start.length; i++) {
    const cell = start[i];
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = cell.x + dx;
      const nz = cell.z + dz;
      if (nx < 0 || nx >= gridSize || nz < 0 || nz >= gridSize) continue;
      const key = placementKey(nx, nz);
      if (blocked.has(key) || seen.has(key)) continue;
      seen.add(key);
      start.push({ x: nx, z: nz });
    }
  }
  return seen;
}

/**
 * Choose the next food cell, or `null` when the board holds no free cell at
 * all — the one honest answer to a completely filled board.
 *
 * Preference order, each falling through only when it is empty:
 *   1. reachable, and inside the occupancy-scaled radius  (the intent)
 *   2. reachable, at any distance                          (board is sparse
 *      near the head but the far side is open)
 *   3. any free cell                                       (the head is sealed
 *      in; the run is ending either way, and refusing to place food would
 *      freeze it instead of finishing it)
 *
 * `rng` is the engine's seeded stream, so a replayed run feeds identically.
 */
export function chooseFoodCell(
  gridSize: number,
  head: PlacementCell,
  blocked: ReadonlySet<string>,
  occupancy: number,
  rng: () => number,
  /**
   * COSMIC only. A constellation is a GROUP whose glyphs must be chaseable as
   * a chain, so its later foods cluster around the first rather than around
   * the head. Preserved deliberately: the group is the dynasty's identity, not
   * a traverse shortcut, and it predates the growth lab entirely.
   */
  anchor: { cell: PlacementCell; radius: number } | null = null
): PlacementCell | null {
  if (gridSize <= 0) return null;

  const free: PlacementCell[] = [];
  for (let x = 0; x < gridSize; x++) {
    for (let z = 0; z < gridSize; z++) {
      if (blocked.has(placementKey(x, z))) continue;
      free.push({ x, z });
    }
  }
  if (free.length === 0) return null;

  const reachable = reachableFrom(gridSize, head, blocked);
  const radius = foodSearchRadius(gridSize, occupancy);

  const clustered: PlacementCell[] = [];
  const near: PlacementCell[] = [];
  const far: PlacementCell[] = [];
  for (const cell of free) {
    if (!reachable.has(placementKey(cell.x, cell.z))) continue;
    if (anchor && chebyshev(cell, anchor.cell) <= anchor.radius) {
      clustered.push(cell);
    }
    if (chebyshev(cell, head) <= radius) near.push(cell);
    else far.push(cell);
  }

  const pool =
    clustered.length > 0
      ? clustered
      : near.length > 0
        ? near
        : far.length > 0
          ? far
          : free;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}
