/**
 * FOOD PLACEMENT — where the next food goes (WP-3.06).
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
 * rejection-sampled up to 1000 times and then RETURNED ITS LAST GUESS whatever
 * it was — potentially on top of the snake. That is statistically unreachable on
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
 * ───────────────────────────────────────────────────────────────────────────
 * THE PERFORMANCE STORY, MEASURED RATHER THAN REASONED ABOUT
 *
 * The first version of this module took `foldParity.test.ts` from 11 seconds to
 * ~356 seconds (32x) and blew the CI test job's 15-minute timeout. Four fixes
 * were attempted, every one diagnosed by reading the code rather than timing
 * it, and every one was wrong. So this time it was measured first. The numbers,
 * for the version that was parked:
 *
 *     board    rng        ms per call
 *     20x20    constant       0.0352
 *     20x20    random         0.0012
 *     400x400  constant      12.9019      <- the entire regression
 *     400x400  random         0.0007
 *
 * Two facts fall out of that table, and both matter more than any of the four
 * guesses did.
 *
 * FIRST: THE SHIPPED GAME WAS NEVER SLOW. `gridSize` is 20, so the real board
 * is 400 cells. `foldParity.test.ts` sets `GRID = 400` — 160,000 cells — to
 * keep its length arithmetic clear of wall collisions. The regression was 400x,
 * not 32x, and it lived entirely inside a test harness.
 *
 * SECOND: THE FAST PATH NEVER SURVIVED THAT HARNESS. `foldParity` drives the
 * engine with `rng: () => 0.5` — a constant. The parked placer sampled
 * uniformly over the WHOLE board and then rejected anything outside the search
 * radius, so a constant stream drew the same cell 24 times, missed 24 times,
 * and fell through to the exact path on every single spawn.
 *
 * Which is why the third attempt (gate the sweep on occupancy) and the fourth
 * (gate it on attempt exhaustion) each failed: each was half of the trigger.
 * Sampling struggles for two reasons — the board is genuinely crowded, or the
 * stream is degenerate — and only the first deserves an exact sweep.
 *
 * THE FIX IS THEREFORE THREE CHANGES, NOT A GATE:
 *
 *   1. SAMPLE INSIDE THE BOX, DON'T SAMPLE-THEN-REJECT. Draws are taken from
 *      the legal window directly, clamped to the board, so the radius can never
 *      reject a draw and no draw ever lands off-board. Failure probability is
 *      now exactly the window's occupancy raised to the attempt count, which is
 *      what the FAST_PATH_ATTEMPTS comment always claimed it was.
 *   2. THE EXACT PATH EXPANDS, IT DOES NOT SWEEP. It searches a window around
 *      the head and doubles it only when that window comes back empty. Cost
 *      tracks the neighbourhood that actually holds candidates instead of the
 *      board, so a degenerate stream on a 400x400 board costs ~81 cells rather
 *      than 160,000.
 *   3. NOTHING ALLOCATES. The flood fill's scratch buffers are module-level,
 *      grown on demand and reused, with a generation stamp instead of a clear.
 *      The parked version allocated two grid-sized typed arrays PER CALL —
 *      640 KB per food spawn at `foldParity`'s grid size.
 *
 * The guarantee is still SCOPED, and still stated rather than implied.
 * Placement samples first and enumerates only when sampling exhausts its
 * attempts, which on a real stream happens exactly when the board is crowded —
 * which is also exactly when a sealed pocket becomes real. Two properties hold
 * unconditionally, and they are the ones that mattered: the returned cell is
 * ALWAYS legal, and the placer never returns a guess. Reachability is
 * best-effort on a sparse board — as the shipped game left it — and exact on a
 * crowded one. `foodPlacement.test.ts` asserts both halves including the limit,
 * so nobody reads this header as promising more.
 *
 * FOOD COUNT IS A DIAL, AND MUST STAY ONE (owner, 2026-07-28: "the food
 * placement module should allow for different food counts, as we might need to
 * adjust that in the future"). Nothing here special-cases one food. A wave of N
 * is N calls that each exclude the cells already placed, and the caller builds
 * the occupancy grid ONCE for the whole wave rather than once per food — so
 * raising `simultaneousFoods` costs one more call, never a rewrite. COSMIC's
 * constellation group is already exactly that path, and `anchor` exists to keep
 * it clustered and chaseable.
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
 * Bounded, small, and now honest: because draws are taken from inside the legal
 * window rather than from the whole board, a draw fails only when it lands on
 * an occupied cell. At 50% window occupancy 24 attempts fail with probability
 * around 6e-8, so the exact path is genuinely a last resort on any real stream.
 */
export const FAST_PATH_ATTEMPTS = 24;

/**
 * Half-width of the first window the exact path examines, and the factor it
 * grows by when that window turns up nothing.
 *
 * This is what stops the fallback from costing the board. A 9x9 window is 81
 * cells; a 400x400 board is 160,000. On a sparse board the first window
 * answers; on a full one the doubling reaches the whole board in log2(gridSize)
 * rounds whose total work is about twice the last round's. So the worst case is
 * a small constant times the board, and the common case is the constant alone.
 */
export const EXACT_WINDOW_START = 4;
export const EXACT_WINDOW_GROWTH = 2;

/**
 * Half-width of the neighbourhood the fast path checks reachability within.
 *
 * REACHABILITY IS NO LONGER BEST-EFFORT, and the reason the old trade-off died
 * is worth stating. This module used to check reachability only on the exact
 * path — i.e. only once random sampling had exhausted, which on a sparse board
 * never happens. The justification was that a pocket sealed by your own BODY is
 * transient: the tail vacates, so a cell that looks sealed now may be open by
 * the time you arrive, and refusing it would be over-strict.
 *
 * Terrain voids that argument completely. A pocket sealed by terrain is sealed
 * FOREVER — Rule 15 forbids ever removing a block — so food placed inside one
 * is not "briefly awkward", it is a target the player can never take. The owner
 * hit exactly that: food in the outer ring, walled off by the arena, reachable
 * only by dying.
 *
 * Bounded rather than unbounded because an unbounded fill is what made the
 * first version of this module 400x too slow on `foldParity`'s 400x400 board.
 * 16 covers a 33x33 neighbourhood — the entire 20x20 game board, so the check
 * is EXACT where it ships, and a fixed 1089-cell ceiling anywhere else.
 */
export const REACH_CHECK_RADIUS = 16;

/**
 * Largest pocket the escape check will bother measuring.
 *
 * REACHABLE IS NOT THE SAME AS SURVIVABLE, and the owner had to lose a run to
 * show me the difference: *"that food was reachable, but you couldn't get out
 * alive - there was no escape path. I had to crash into myself, but I got the
 * food first."*
 *
 * A reachability check only asks "can the head walk to this cell". It says
 * nothing about whether the head can walk BACK OUT, and a cul-de-sac sealed by
 * terrain is a cell you can enter exactly once. Taking that food is not a
 * mistake the player made; it is a death the board arranged, which is precisely
 * the class of thing this module exists to stop.
 *
 * So a candidate's pocket must hold enough free cells for the body that will
 * come into it. The count is capped because the question is only ever "is this
 * a trap" - a pocket with 64 free cells is not one, and measuring further costs
 * time to learn nothing. That also bounds the fill, which is the constraint the
 * first version of this module learned the hard way.
 *
 * This is a HEURISTIC and is documented as one. Proving a food is survivable is
 * a Hamiltonian question, not a flood fill; what this rules out is the blatant
 * case the owner hit, at a cost the hot path can carry.
 */
export const ESCAPE_BUDGET_CAP = 64;

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

/** The four moves a snake can make. Module-level so no fill allocates it. */
const ORTHOGONAL = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * An empty occupancy grid. One allocation per WAVE, not per food — the caller
 * builds it once and marks each placed cell as it goes.
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
 *
 * This is the READABLE statement of the rule, kept because tests and future
 * readers want it in this form. `chooseFoodCell` runs the same fill over
 * integer indices inside a bounded window, and `foodPlacement.test.ts` asserts
 * that the two agree.
 */
export function reachableFrom(
  gridSize: number,
  head: PlacementCell,
  blocked: ReadonlySet<string>
): Set<string> {
  const seen = new Set<string>();
  if (gridSize <= 0) return seen;
  const start: PlacementCell[] = [];
  // The head's own cell holds the head and is never a candidate. Seeding from
  // its neighbours is not enough to exclude it - the fill walks back into it
  // from the first neighbour it expands - so it is refused explicitly, exactly
  // as the windowed fill in `chooseFoodCell` refuses it.
  const enqueue = (nx: number, nz: number): void => {
    if (nx < 0 || nx >= gridSize || nz < 0 || nz >= gridSize) return;
    if (nx === head.x && nz === head.z) return;
    const key = placementKey(nx, nz);
    if (blocked.has(key) || seen.has(key)) return;
    seen.add(key);
    start.push({ x: nx, z: nz });
  };

  for (const [dx, dz] of ORTHOGONAL) {
    enqueue(head.x + dx, head.z + dz);
  }
  // Iterative, never recursive: a 400-cell fill is fine either way, but a
  // board-sized recursion is a stack depth nobody wants to reason about.
  for (let i = 0; i < start.length; i++) {
    const cell = start[i];
    for (const [dx, dz] of ORTHOGONAL) {
      enqueue(cell.x + dx, cell.z + dz);
    }
  }
  return seen;
}

/**
 * Reusable flood-fill scratch.
 *
 * The parked version allocated `new Uint8Array(cells)` and `new
 * Int32Array(cells)` inside every call — 640 KB per food spawn at
 * `foldParity`'s 400x400 grid, on the hottest path in the engine. These are
 * grown on demand and never freed; the largest board a process ever sees costs
 * one allocation for the life of that process.
 *
 * `visitStamp` holds a generation rather than a boolean so a fill never has to
 * clear it. `visitGeneration` increments per fill, and a cell counts as visited
 * only while its stamp equals the current generation.
 */
let scratchCells = 0;
let visitStamp = new Int32Array(0);
let visitQueue = new Int32Array(0);
let visitGeneration = 0;

function ensureScratch(cells: number): void {
  if (scratchCells >= cells) return;
  scratchCells = cells;
  visitStamp = new Int32Array(cells);
  visitQueue = new Int32Array(cells);
  // A fresh array is all zeros, so restart the counter with it — otherwise a
  // stale high generation would read every cell of the new array as visited.
  visitGeneration = 0;
}

/**
 * Flood-fill from the head over free cells, confined to a window, collecting
 * every reachable free cell into `visitQueue`.
 *
 * Returns how many cells were collected; they occupy `visitQueue[0 .. n-1]` as
 * flat `x * gridSize + z` indices. The fill's frontier and its result are the
 * same array — every cell it enqueues is by construction free, reachable and
 * inside the window, which is exactly the candidate pool.
 *
 * CONFINING THE FILL IS CONSERVATIVE, WHICH IS THE SAFE DIRECTION. A path that
 * leaves the window and re-enters it is not followed, so a cell reachable only
 * by such a detour is treated as unreachable. That can cost a candidate; it can
 * never invent one. It is the same asymmetry the body-as-blocked rule above is
 * chosen for.
 */
function collectReachable(
  gridSize: number,
  head: PlacementCell,
  blocked: Uint8Array,
  x0: number,
  x1: number,
  z0: number,
  z1: number
): number {
  visitGeneration += 1;
  const generation = visitGeneration;
  let tail = 0;

  const push = (x: number, z: number): void => {
    if (x < x0 || x > x1 || z < z0 || z > z1) return;
    // The head's own cell, explicitly. Seeding from the head's NEIGHBOURS is
    // not enough to exclude it: the fill walks back into it from the first
    // neighbour it expands. In the engine the head is always in the blocked
    // grid so this never fires, which is exactly why it went unnoticed - the
    // one test that blocks the board down to a single free cell and puts the
    // head on the other one caught it, and it was the test that was right.
    if (x === head.x && z === head.z) return;
    const index = x * gridSize + z;
    if (blocked[index] || visitStamp[index] === generation) return;
    visitStamp[index] = generation;
    visitQueue[tail++] = index;
  };

  // Seed from the head's free orthogonal neighbours, exactly as `reachableFrom`
  // does — the head's own cell holds the head and is never a candidate.
  push(head.x + 1, head.z);
  push(head.x - 1, head.z);
  push(head.x, head.z + 1);
  push(head.x, head.z - 1);

  for (let read = 0; read < tail; read++) {
    const index = visitQueue[read];
    const x = (index / gridSize) | 0;
    const z = index - x * gridSize;
    push(x + 1, z);
    push(x - 1, z);
    push(x, z + 1);
    push(x, z - 1);
  }
  return tail;
}

/**
 * Does the free region containing `index` hold at least `needed` cells?
 *
 * Flood fill from the candidate over free cells, stopping the moment the count
 * is reached — so a cell in open board costs `needed` steps, not a board sweep.
 * The snake's body is already blocked, so this measures the room that will
 * actually be there when the head arrives.
 */
function regionHolds(
  gridSize: number,
  blocked: Uint8Array,
  index: number,
  needed: number
): boolean {
  if (needed <= 1) return true;
  visitGeneration += 1;
  const generation = visitGeneration;
  let tail = 0;
  let seen = 0;
  visitStamp[index] = generation;
  visitQueue[tail++] = index;
  for (let read = 0; read < tail; read++) {
    const current = visitQueue[read];
    seen++;
    if (seen >= needed) return true;
    const x = (current / gridSize) | 0;
    const z = current - x * gridSize;
    if (x + 1 < gridSize) {
      const n = current + gridSize;
      if (!blocked[n] && visitStamp[n] !== generation) {
        visitStamp[n] = generation;
        visitQueue[tail++] = n;
      }
    }
    if (x > 0) {
      const n = current - gridSize;
      if (!blocked[n] && visitStamp[n] !== generation) {
        visitStamp[n] = generation;
        visitQueue[tail++] = n;
      }
    }
    if (z + 1 < gridSize) {
      const n = current + 1;
      if (!blocked[n] && visitStamp[n] !== generation) {
        visitStamp[n] = generation;
        visitQueue[tail++] = n;
      }
    }
    if (z > 0) {
      const n = current - 1;
      if (!blocked[n] && visitStamp[n] !== generation) {
        visitStamp[n] = generation;
        visitQueue[tail++] = n;
      }
    }
  }
  return seen >= needed;
}

/** Every free cell in a window, reachable or not — the last-resort pool. */
function collectFree(
  gridSize: number,
  blocked: Uint8Array,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  /**
   * The head's flat index, always excluded. Both fills that CAN return it seed
   * from the head's neighbours and so drop it for free; this one sweeps a
   * window and would hand it back. In the engine the head is always in the
   * blocked grid so it never fires - it exists so the paths cannot disagree
   * about one cell, which is exactly the drift the shipped placer's latent bug
   * came from.
   */
  skipIndex: number
): number {
  let tail = 0;
  for (let x = x0; x <= x1; x++) {
    const base = x * gridSize;
    for (let z = z0; z <= z1; z++) {
      const index = base + z;
      if (blocked[index] || index === skipIndex) continue;
      visitQueue[tail++] = index;
    }
  }
  return tail;
}

/**
 * Keep only the collected cells whose pocket is big enough to leave, compacting
 * them to the front of the scratch queue.
 *
 * Copies out first because `regionHolds` reuses the same queue for its own
 * fill — the two cannot share the buffer, and a second buffer would be a second
 * thing to keep sized.
 */
const survivorScratch: number[] = [];
function filterSurvivable(
  gridSize: number,
  blocked: Uint8Array,
  count: number,
  needed: number
): number {
  if (needed <= 1) return count;
  survivorScratch.length = 0;
  for (let i = 0; i < count; i++) survivorScratch.push(visitQueue[i]);
  let kept = 0;
  for (const index of survivorScratch) {
    if (regionHolds(gridSize, blocked, index, needed)) {
      visitQueue[kept++] = index;
    }
  }
  return kept;
}

/**
 * Draw one of the collected cells. `Math.min` guards the one input this module
 * cannot control: an rng that returns exactly 1.
 */
function pick(count: number, rng: () => number): number {
  return visitQueue[Math.min(count - 1, Math.floor(rng() * count))];
}

function decode(index: number, gridSize: number): PlacementCell {
  const x = (index / gridSize) | 0;
  return { x, z: index - x * gridSize };
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
 * The expanding window implements 1 and 2 as a single loop: windows no wider
 * than the search radius are preference 1, and continuing past it is
 * preference 2.
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
   * literal per snake segment on every spawn — about four million string
   * allocations across `foldParity`'s sweep, against the numeric comparisons it
   * replaced. Build it with `blockedGrid` and integer indices, once per wave,
   * and allocate nothing per cell.
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
  anchor: { cell: PlacementCell; radius: number } | null = null,
  /**
   * Free cells the candidate's pocket must hold for the run to survive taking
   * it — normally the snake's length, capped by ESCAPE_BUDGET_CAP. Zero
   * disables the check, which is what every caller that has no body wants.
   */
  minEscapeCells = 0
): PlacementCell | null {
  if (gridSize <= 0) return null;
  ensureScratch(gridSize * gridSize);

  const headIndex = head.x * gridSize + head.z;
  const radius = foodSearchRadius(gridSize, occupancy);
  const centre = anchor ? anchor.cell : head;
  const window = anchor ? anchor.radius : radius;

  // Reachability, computed ONCE and consulted by both paths. `collectReachable`
  // stamps every cell it reaches with `visitGeneration`, so membership is an
  // integer compare rather than a set lookup.
  const rx0 = Math.max(0, head.x - REACH_CHECK_RADIUS);
  const rx1 = Math.min(gridSize - 1, head.x + REACH_CHECK_RADIUS);
  const rz0 = Math.max(0, head.z - REACH_CHECK_RADIUS);
  const rz1 = Math.min(gridSize - 1, head.z + REACH_CHECK_RADIUS);
  const reachedCount = collectReachable(
    gridSize, head, blocked, rx0, rx1, rz0, rz1
  );
  const reachGeneration = visitGeneration;
  // A head with nowhere to go cannot be served by a reachability filter, and
  // refusing to place food would freeze a run that is ending anyway.
  const requireReachable = reachedCount > 0;
  const escapeNeeded = Math.min(
    ESCAPE_BUDGET_CAP,
    Math.max(0, Math.floor(minEscapeCells))
  );

  // ── FAST PATH ──────────────────────────────────────────────────────────
  // Draw from inside the legal window, clamped to the board. Sampling the
  // whole board and rejecting on distance — what the parked version did — is
  // what made a constant rng fall through on every call, and it also skewed
  // the distribution near the edges, where most of a rejected draw's mass sat
  // off-board.
  const wx0 = Math.max(0, centre.x - window);
  const wx1 = Math.min(gridSize - 1, centre.x + window);
  const wz0 = Math.max(0, centre.z - window);
  const wz1 = Math.min(gridSize - 1, centre.z + window);
  const spanX = wx1 - wx0 + 1;
  const spanZ = wz1 - wz0 + 1;
  if (spanX > 0 && spanZ > 0) {
    for (let attempt = 0; attempt < FAST_PATH_ATTEMPTS; attempt++) {
      const x = Math.min(wx1, wx0 + Math.floor(rng() * spanX));
      const z = Math.min(wz1, wz0 + Math.floor(rng() * spanZ));
      const index = x * gridSize + z;
      if (blocked[index]) continue;
      // The whole point of the up-front fill: a sampled cell must be somewhere
      // the head can actually walk to. Without this the fast path hands back
      // any free cell, including one the arena has sealed off permanently.
      if (requireReachable && visitStamp[index] !== reachGeneration) continue;
      // Reachable is not survivable. A pocket smaller than the body that will
      // enter it is a cell you can take once and never leave.
      if (escapeNeeded > 1 && !regionHolds(gridSize, blocked, index, escapeNeeded)) {
        continue;
      }
      // The head's own cell, explicitly. The exact path excludes it for free —
      // its flood fill seeds from the head's NEIGHBOURS — so without this the
      // two paths would disagree about one cell. In the engine the head is
      // always in the blocked grid and this never fires; it exists so the two
      // paths cannot drift, which is the whole reason the shipped placer had a
      // latent bug.
      if (x === head.x && z === head.z) continue;
      return { x, z };
    }
  }

  // ── EXACT PATH ─────────────────────────────────────────────────────────
  // Sampling exhausted. Either the window is genuinely crowded — in which case
  // a sealed pocket is a real hazard and the sweep buys something — or the
  // stream is degenerate, in which case the expanding window keeps the cost
  // proportional to the neighbourhood rather than to the board. Never return a
  // guess, which is precisely what the shipped sampler did after 1000 misses.

  // A clustered group is placed around its anchor, not around the head, and
  // the anchor was itself placed head-reachable — so a glyph's reachability
  // rides on the first glyph's. Cluster if the neighbourhood has room, and
  // fall through to the head-centred search if it does not, rather than fail.
  if (anchor) {
    const clustered = collectFree(
      gridSize, blocked, wx0, wx1, wz0, wz1, headIndex
    );
    if (clustered > 0) return decode(pick(clustered, rng), gridSize);
  }

  let span = Math.max(1, Math.min(window, EXACT_WINDOW_START));
  for (;;) {
    const x0 = Math.max(0, head.x - span);
    const x1 = Math.min(gridSize - 1, head.x + span);
    const z0 = Math.max(0, head.z - span);
    const z1 = Math.min(gridSize - 1, head.z + span);
    const found = collectReachable(gridSize, head, blocked, x0, x1, z0, z1);
    if (found > 0) {
      const survivable = filterSurvivable(gridSize, blocked, found, escapeNeeded);
      if (survivable > 0) return decode(pick(survivable, rng), gridSize);
    }
    if (span >= gridSize) break;
    span = Math.min(gridSize, span * EXACT_WINDOW_GROWTH);
  }

  // Preference 3: the head is sealed in. Place anywhere legal so the run can
  // finish; `null` is reserved for a board with no free cell at all.
  const free = collectFree(
    gridSize, blocked, 0, gridSize - 1, 0, gridSize - 1, headIndex
  );
  if (free === 0) return null;
  return decode(pick(free, rng), gridSize);
}
