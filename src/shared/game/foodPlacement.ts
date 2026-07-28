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
 * an unwinnable position produced by the game rather than by the player.
 *
 * That check is NOT free, and the first version of this module claimed it was.
 * Reachability is Omega(free cells) — you cannot know a cell is reachable
 * without walking there — and the engine spawns a wave per eaten food, so it
 * replaced a ~3-operation rejection sample with a ~400-operation sweep on one
 * of the hottest paths in the codebase. `foldParity.test.ts` went from 11
 * seconds to over six minutes and the CI test job blew its timeout.
 *
 * So the guarantee is SCOPED, and the scope is stated rather than implied.
 * Placement samples randomly first and only enumerates when sampling exhausts
 * its attempts — which happens exactly when the board is crowded enough, or the
 * radius tight enough, that random draws stop landing. That is also exactly
 * when a sealed pocket becomes real, so the cost is paid where it buys
 * something and skipped where it would not.
 *
 * Two properties hold unconditionally, and they are the ones that mattered:
 * the returned cell is ALWAYS legal, and the placer never returns a guess.
 * Reachability is best-effort on a sparse board — as the shipped game left it —
 * and exact on a crowded one. `foodPlacement.test.ts` asserts both halves
 * including the limit, so nobody reads this header as promising more.
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
 * Rejection samples tried before falling through to exact enumeration.
 *
 * Bounded and small. At 50% occupancy each draw succeeds half the time, so 24
 * attempts fail with probability around 6e-8 — the exact path is genuinely a
 * last resort, and it is reached precisely when the board is crowded enough
 * for reachability to matter.
 */
export const FAST_PATH_ATTEMPTS = 24;

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

/**
 * An empty occupancy grid. One allocation per spawn, then pure integer writes —
 * the whole point of not taking a `Set<string>` here.
 */
export function blockedGrid(gridSize: number): Uint8Array {
  return new Uint8Array(Math.max(0, gridSize * gridSize));
}

/** Mark a cell blocked, ignoring anything off the board. */
export function markBlocked(
  grid: Uint8Array,
  gridSize: number,
  x: number,
  z: number
): void {
  if (x < 0 || x >= gridSize || z < 0 || z >= gridSize) return;
  grid[x * gridSize + z] = 1;
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
  /**
   * Occupancy grid, `gridSize * gridSize`, 1 = blocked. NOT a `Set<string>`.
   *
   * The first version took a string set, so the caller built one template
   * literal per snake segment on EVERY spawn — about four million string
   * allocations across `foldParity`'s 200-run sweep, against the numeric
   * comparisons it replaced. That alone took the suite from 11 seconds to six
   * minutes. Build it with `blockedGrid` and integer indices; allocate nothing
   * per cell.
   */
  blocked: Uint8Array,
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

  // SAMPLE FIRST, ENUMERATE ONLY WHEN SAMPLING ACTUALLY STRUGGLES.
  //
  // Reachability is Omega(free cells) — you cannot know a cell is reachable
  // without walking there — and the engine spawns a wave per eaten food. Paying
  // that on every spawn replaced a ~3-operation sample with a ~2000-operation
  // sweep and took `foldParity.test.ts` from 11 seconds to six minutes.
  //
  // An earlier attempt gated the sweep on an occupancy threshold. That was the
  // wrong trigger: a baseline 100-food run sits around 26% occupancy, so the
  // gate opened almost immediately and the sweep ran anyway. Attempt-exhaustion
  // is the honest signal — it fires exactly when the board is crowded enough,
  // or the radius tight enough, that random sampling stops working, which is
  // also exactly when sealed pockets become real.
  //
  // Stated plainly, so nobody reads more into this than it does: the placer
  // ALWAYS returns a legal cell (that was the shipped bug), and it prefers a
  // reachable one whenever sampling fails. On a sparse board a sealed pocket is
  // vanishingly rare and goes unchecked, exactly as the shipped game left it.
  const radius = foodSearchRadius(gridSize, occupancy);
  for (let attempt = 0; attempt < FAST_PATH_ATTEMPTS; attempt++) {
    const x = Math.floor(rng() * gridSize);
    const z = Math.floor(rng() * gridSize);
    if (blocked[x * gridSize + z]) continue;
    // The head's own cell, explicitly. The exact path excludes it for free —
    // its flood fill seeds from the head's NEIGHBOURS — so without this the two
    // paths would disagree about one cell. In the engine the head is always in
    // the blocked grid and this never fires; it exists so the two paths cannot
    // drift, which is the whole reason the shipped placer had a latent bug.
    if (x === head.x && z === head.z) continue;
    if (anchor) {
      if (chebyshev({ x, z }, anchor.cell) > anchor.radius) continue;
    } else if (chebyshev({ x, z }, head) > radius) continue;
    return { x, z };
  }
  // Sampling failed. Fall through and enumerate — never return a guess, which
  // is precisely what the shipped sampler did after 1000 misses.

  // INTEGER INDICES, NO STRINGS, PAST THIS POINT.
  //
  // The first version did every lookup against `ReadonlySet<string>`, which
  // meant building a template literal per probe: ~400 in the enumeration and up
  // to ~1600 more in the flood fill, on EVERY food spawn. Correct, and about a
  // hundred times too slow — it took `foldParity.test.ts` from 11 seconds to
  // over ten minutes and blew the CI test job past its timeout. The engine
  // spawns a wave per eaten food, so this is one of the hottest paths in the
  // codebase and it must not allocate.
  //
  // The Set API survives for callers and tests because it reads well; it is
  // flattened ONCE here, over the blocked cells only (snake length + terrain,
  // ~100-200 entries) rather than over the whole grid.
  const cells = gridSize * gridSize;
  const isBlocked = blocked;

  // Flood fill from the head over free cells, same semantics as
  // `reachableFrom` and asserted equivalent to it by test.
  const seen = new Uint8Array(cells);
  const queue = new Int32Array(cells);
  let head_ = 0;
  let tail = 0;
  const push = (x: number, z: number) => {
    if (x < 0 || x >= gridSize || z < 0 || z >= gridSize) return;
    const index = x * gridSize + z;
    if (isBlocked[index] || seen[index]) return;
    seen[index] = 1;
    queue[tail++] = index;
  };
  push(head.x + 1, head.z);
  push(head.x - 1, head.z);
  push(head.x, head.z + 1);
  push(head.x, head.z - 1);
  while (head_ < tail) {
    const index = queue[head_++];
    const x = (index / gridSize) | 0;
    const z = index - x * gridSize;
    push(x + 1, z);
    push(x - 1, z);
    push(x, z + 1);
    push(x, z - 1);
  }

  const anchorX = anchor ? anchor.cell.x : 0;
  const anchorZ = anchor ? anchor.cell.z : 0;

  // One pass, four candidate pools, no intermediate objects. Enumeration order
  // is x-major then z — preserved from the original, because the seeded draw
  // indexes into these pools and a reordering would change every replay.
  const clustered: number[] = [];
  const near: number[] = [];
  const far: number[] = [];
  const free: number[] = [];
  for (let x = 0; x < gridSize; x++) {
    const base = x * gridSize;
    const dxHead = x > head.x ? x - head.x : head.x - x;
    const dxAnchor = x > anchorX ? x - anchorX : anchorX - x;
    for (let z = 0; z < gridSize; z++) {
      const index = base + z;
      if (isBlocked[index]) continue;
      free.push(index);
      if (!seen[index]) continue;
      const dzAnchor = z > anchorZ ? z - anchorZ : anchorZ - z;
      if (anchor && Math.max(dxAnchor, dzAnchor) <= anchor.radius) {
        clustered.push(index);
      }
      const dzHead = z > head.z ? z - head.z : head.z - z;
      if (Math.max(dxHead, dzHead) <= radius) near.push(index);
      else far.push(index);
    }
  }
  if (free.length === 0) return null;

  const pool =
    clustered.length > 0
      ? clustered
      : near.length > 0
        ? near
        : far.length > 0
          ? far
          : free;
  const picked =
    pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  const x = (picked / gridSize) | 0;
  return { x, z: picked - x * gridSize };
}
