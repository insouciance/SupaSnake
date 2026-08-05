/**
 * BOARD-FILL CERTIFICATION
 *
 * The owner's question: is a maximum-length run — a snake that fills the board
 * to the last free tile — a defined, settleable outcome, or does the stack
 * break somewhere on the way there?
 *
 * The owner's absolute, which this suite exists to police: NO CEILING — tick,
 * action, byte or otherwise — MAY EVER INVALIDATE A LEGITIMATE RUN. Bounds
 * exist against forgery, not against skill. A wall a player can reach by
 * playing well is a defect, and this file's job is to find every one of them
 * and put a number on it.
 *
 * WHAT THIS SUITE PROVES, AND HOW IT CONSTRUCTS THE STATE
 *
 * Driving 400 seeded foods with a real steering AI is a search problem, not a
 * test. So saturation is built CONSTRUCTIVELY: the drive uses the engine's own
 * `placeFood` test hook to lay the next food on the next cell of a Hamiltonian
 * cycle over the 20x20 board, and the snake eats on every tick. Every other
 * part of the simulation is the shipped one — the same `tick()`, the same
 * collision resolution, the same growth fold, the same terrain schedule, the
 * same Genome v2 reducer, the same `spawnFoods` on every eat.
 *
 * The server-side assertions are then made over a REPLAY WINDOW, exactly as
 * production makes them: `validateRunCheckpoint` and `deriveTerminalIntent`
 * both replay from the last accepted checkpoint, never from the opening. The
 * window this suite validates is the final one — the eat that closes the last
 * free cell, and the tick that kills the snake afterwards. Inside that window
 * nothing is placed by the test: `spawnFoods` runs for real on a board with
 * zero free cells, and the canonical replay must reproduce it bit for bit.
 *
 * The one thing deliberately NOT certified here is the seeded provenance of
 * the 397 eats before that window. That is `SnakeGameLogic.determinism` and
 * `runContinuity.genomeV2`'s job, and it is unrelated to board fill.
 *
 * WHAT IT MEASURED, AT THE 2026-08-05 RULES WAVE
 *
 *   dynasty  ticks  foods  body cells  terrain  free  regions  checkpoint B
 *   CYBER      149    144         147      133   120        1       136,907
 *   PRIMAL     400    393         400        0     0        1       134,959
 *   COSMIC     406    397         400        0     0        1       138,102
 *
 * `regions` is the new column and the point of the wave: the number of
 * DISCONNECTED regions the terrain field ever showed, sampled every tick. One
 * means the board was never severed. The previous measurement (ba253b5: CYBER
 * 155/150/153/139/108) recorded the opposite as FINDING BF-1 — free cells
 * stranded behind blocks — and the owner ruled the guarantee in without capping
 * ring progression.
 *
 * Against the caps: the checkpoint uses 13.1% of its 1,048,576-byte column, the
 * terminal facts well under their 262,144, and the settlement projection a few
 * percent. CYBER still stops short of a full body, but no longer because the
 * arena partitioned it — see the BF-1 residual case, which records exactly what
 * this harness can and cannot prove about CYBER saturation.
 */

import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  RUN_REPLAY_MAX_ACTIONS,
  RUN_REPLAY_MAX_ACTIONS_PER_CHECKPOINT,
  RUN_REPLAY_MAX_TICKS_PER_CHECKPOINT,
  RUN_CHECKPOINT_MAX_BYTES,
  RUN_TERMINAL_FACTS_MAX_BYTES,
  RunContinuityError,
  stageRunTerminalIntent,
  validateRunCheckpoint,
} from './runContinuity';
import {
  SNAKE_RULES_VERSION,
  SnakeGameLogic,
  type Direction,
  type SnakeCheckpointV1,
} from '@/lib/game/SnakeGameLogic';
import { buildTerminalReplayProof } from '@/lib/game/runContinuityClient';
import { sanitizeGenomeCapability } from '@/lib/game/genomeCapability';
import { genomeV2ActivePool } from '@/shared/game/genes';
import {
  GENOME_RULES_V2,
  deriveGenomeV2FtuePresentation,
} from '@/shared/game/genomeV2';
import { projectGenomeForSettlement } from '@/shared/game/settlementGenome';
import { RULESETS, type DynastyName } from '@/shared/game/rulesets';
import { GAME_CONFIG } from '@/shared/config/game';
import {
  blockedGrid,
  chooseFoodCell,
  chooseSurvivableTargetCell,
} from '@/shared/game/foodPlacement';
import { nextTerrainCells } from '@/shared/game/terrain';

const GRID = GAME_CONFIG.board.gridSize;
const CELLS = GRID * GRID;
const DYNASTIES: readonly DynastyName[] = ['CYBER', 'PRIMAL', 'COSMIC'];
const START_ID = '7a604a42-9f57-4f50-9a36-a7c7e85dbb28';
const LEASE = 'board-fill-certification-lease-with-enough-entropy';

const STEPS: ReadonlyArray<{ direction: Direction; dx: number; dz: number }> = [
  { direction: 'UP', dx: 0, dz: -1 },
  { direction: 'RIGHT', dx: 1, dz: 0 },
  { direction: 'DOWN', dx: 0, dz: 1 },
  { direction: 'LEFT', dx: -1, dz: 0 },
];

function key(cell: { x: number; z: number }): string {
  return `${cell.x}:${cell.z}`;
}

function inBounds(cell: { x: number; z: number }): boolean {
  return cell.x >= 0 && cell.z >= 0 && cell.x < GRID && cell.z < GRID;
}

/**
 * A Hamiltonian cycle over an even NxN board.
 *
 * Row 0 left to right, then a boustrophedon over columns N-1..1 of rows 1..N-1,
 * then column 0 bottom to top. Consecutive entries are always one cardinal step
 * apart and the last is adjacent to the first, so a snake laid along it can
 * grow to N*N cells without ever meeting itself.
 */
function hamiltonianCycle(n: number): Array<{ x: number; z: number }> {
  const cells: Array<{ x: number; z: number }> = [];
  for (let x = 1; x < n; x += 1) cells.push({ x, z: 0 });
  for (let x = n - 1; x >= 1; x -= 1) {
    const ascending = (n - 1 - x) % 2 === 0;
    for (let step = 1; step < n; step += 1) {
      cells.push({ x, z: ascending ? step : n - step });
    }
  }
  for (let z = n - 1; z >= 0; z -= 1) cells.push({ x: 0, z });
  return cells;
}

function directionTo(
  from: { x: number; z: number },
  to: { x: number; z: number }
): Direction {
  if (to.x === from.x + 1) return 'RIGHT';
  if (to.x === from.x - 1) return 'LEFT';
  if (to.z === from.z + 1) return 'DOWN';
  if (to.z === from.z - 1) return 'UP';
  throw new Error(`cells are not adjacent: ${key(from)} -> ${key(to)}`);
}

function v2Genome(runSeed: string, dynasty: DynastyName) {
  const genome = sanitizeGenomeCapability({
    rulesVersion: GENOME_RULES_V2,
    runSeed,
    v2GenePool: genomeV2ActivePool(dynasty),
    heirloom: {},
    ftuePresentation: deriveGenomeV2FtuePresentation(10, 3),
    offerTiltStrain: null,
    suppressedStrains: [],
    strainThresholdDelta: {},
  });
  if (!genome || genome.rulesVersion !== GENOME_RULES_V2) {
    throw new Error('Genome v2 fixture did not sanitize.');
  }
  return genome;
}

function manifestFor(
  sessionId: string,
  simulationSeed: string,
  genome: ReturnType<typeof v2Genome>,
  dynasty: DynastyName
) {
  return {
    sessionId,
    simulation: {
      seed: simulationSeed,
      version: 1,
      rulesVersion: SNAKE_RULES_VERSION,
    },
    runSnake: { dynasty },
    growthProfile: 'dynasty',
    genome,
  };
}

/**
 * Free cells the head can walk to, excluding the objectives a food may not be
 * buried under. This is the honest test of "the board still owed the player a
 * food": if one of these exists and the wave is empty, placement gave up on a
 * board that could still have carried a target.
 */
function reachableTargets(
  state: ReturnType<SnakeGameLogic['getState']>
): Array<{ x: number; z: number }> {
  const head = state.snake[0];
  if (!head) return [];
  const walls = new Set(state.snake.map(key));
  for (const block of state.terrain) if (block.solid) walls.add(key(block));
  for (const fact of state.genomeV2?.permanentTerrain ?? []) {
    for (const cell of fact.cells) walls.add(key(cell));
  }
  const reserved = new Set<string>();
  // A forming block is passable but is NOT a cell food may occupy: it turns
  // lethal within its window, and food there would be a trap the player could
  // not have read. Passable for reachability, reserved for placement.
  for (const block of state.terrain) if (!block.solid) reserved.add(key(block));
  if (state.exitTile) reserved.add(key(state.exitTile));
  if (state.exitTile2) reserved.add(key(state.exitTile2));
  if (state.mutationTile) reserved.add(key(state.mutationTile));
  // Live Genome targets are board objects in their own right - a relic, a
  // fork's other branch, a Circuit relay. Food may not be buried under one, so
  // a cell holding one is not a cell the board could have carried a food on.
  for (const target of Object.values(state.genomeV2?.targets ?? {})) {
    if (!['active', 'armed'].includes(target.lifecycle)) continue;
    reserved.add(key(target.cell));
    if (target.forkCell) reserved.add(key(target.forkCell));
    if (target.secondaryCell) reserved.add(key(target.secondaryCell));
    for (const cell of target.optionalRouteCells ?? []) reserved.add(key(cell));
  }
  const seen = new Set<string>([key(head)]);
  const queue = [{ x: head.x, z: head.z }];
  const found: Array<{ x: number; z: number }> = [];
  while (queue.length > 0) {
    const cell = queue.pop()!;
    for (const entry of STEPS) {
      const next = { x: cell.x + entry.dx, z: cell.z + entry.dz };
      const nextKey = key(next);
      if (!inBounds(next) || walls.has(nextKey) || seen.has(nextKey)) continue;
      seen.add(nextKey);
      queue.push(next);
      if (!reserved.has(nextKey)) found.push(next);
    }
  }
  return found;
}

/**
 * Connected components of the field terrain alone defines: every cell that is
 * not permanently claimed, walked orthogonally. The body is deliberately absent
 * - a snake sealing itself in is a death it played into, and the ruled
 * guarantee is about what the ARENA may do.
 */
function terrainFieldRegions(game: SnakeGameLogic): number {
  const state = game.getState({ includeGenomeV2: true });
  const solid = new Set<string>();
  for (const block of state.terrain) if (block.solid) solid.add(key(block));
  for (const fact of state.genomeV2?.permanentTerrain ?? []) {
    for (const cell of fact.cells) solid.add(key(cell));
  }
  const seen = new Set<string>();
  let regions = 0;
  for (let x = 0; x < GRID; x += 1) {
    for (let z = 0; z < GRID; z += 1) {
      const start = key({ x, z });
      if (solid.has(start) || seen.has(start)) continue;
      regions += 1;
      seen.add(start);
      const queue = [{ x, z }];
      while (queue.length > 0) {
        const cell = queue.pop()!;
        for (const entry of STEPS) {
          const next = { x: cell.x + entry.dx, z: cell.z + entry.dz };
          const nextKey = key(next);
          if (!inBounds(next) || solid.has(nextKey) || seen.has(nextKey)) continue;
          seen.add(nextKey);
          queue.push(next);
        }
      }
    }
  }
  return regions;
}

/** Every cell a head may not enter: body, solid terrain, permanent Genome terrain. */
function blockedCells(game: SnakeGameLogic): Set<string> {
  const state = game.getState({ includeGenomeV2: true });
  const blocked = new Set(state.snake.map(key));
  for (const block of state.terrain) if (block.solid) blocked.add(key(block));
  for (const fact of state.genomeV2?.permanentTerrain ?? []) {
    for (const cell of fact.cells) blocked.add(key(cell));
  }
  return blocked;
}

/**
 * Clear anything that stops `tick()` from advancing.
 *
 * A saturation drive must never be silently blocked by a decision surface, so
 * every pending choice is resolved with the option that neither ends the run
 * nor spends body length: gene offers are declined, portals are passed, Genome
 * v2 offers declined and Genome v2 portals continued.
 */
function resolvePending(game: SnakeGameLogic): boolean {
  const state = game.getState({ includeGenomeV2: true });
  if (state.pendingChoice) {
    game.declineMutation();
    return true;
  }
  if (state.pendingPortalChoice) {
    game.resolvePortalChoice('pass');
    return true;
  }
  const genomeV2 = state.genomeV2;
  if (genomeV2?.offer) {
    return game.resolveGenomeV2Offer({
      action: 'decline',
      offerId: genomeV2.offer.offerId,
    });
  }
  if (genomeV2?.portal) {
    return game.resolveGenomeV2Portal({
      action: 'continue',
      portalId: genomeV2.portal.portalId,
      activateMirror: false,
    });
  }
  return false;
}

interface SaturationDrive {
  game: SnakeGameLogic;
  startedAtMs: number;
  /** Why the drive stopped. `sealed` means the head has no legal move left. */
  stop: string;
  ticks: number;
  foodEaten: number;
  /** Distinct cells under the body. Growth stacks duplicates, so <= snake.length. */
  bodyCells: number;
  snakeLength: number;
  solidCells: number;
  occupiedCells: number;
  freeCells: number;
  actions: number;
  /**
   * Worst number of disconnected regions the TERRAIN field ever showed, sampled
   * on every tick of the drive. The ruled guarantee is that this never exceeds
   * one: terrain may close the board without limit, but never sever it.
   */
  maxTerrainRegions: number;
  /**
   * Ticks on which the wave was empty while the head could still WALK to a free
   * cell. Zero is the owner's absolute: a crowd is difficulty and must pass, so
   * food supply may only stop when the board genuinely cannot carry a target.
   */
  foodlessTicksWithSpace: number;
  /**
   * The longest CONSECUTIVE run of those ticks. This is the number the owner's
   * defect lived in: before the fix an empty wave was permanent, because the
   * only refill path ran inside the eat branch and there was nothing to eat.
   */
  longestFoodlessStreak: number;
  /** Ticks on which the rendered primary food was not the live wave's head. */
  ghostFoodTicks: number;
  /** The checkpoint one tick before the drive's final eat. */
  penultimate: SnakeCheckpointV1;
  /** The checkpoint at maximum occupancy, still live. */
  saturated: SnakeCheckpointV1;
}

/**
 * Drive one dynasty to the highest board occupancy its own rules allow.
 *
 * The route is the Hamiltonian cycle while the cycle stays clear, and an
 * adaptive fill when a dynasty's terrain has broken it — CYBER's arena hardens
 * six cells every five foods and does not respect the cycle. The adaptive step
 * prefers a move after which every remaining free cell is still reachable, so
 * it does not seal itself into a pocket while space remains elsewhere.
 */
function driveToSaturation(dynasty: DynastyName): SaturationDrive {
  const cycle = hamiltonianCycle(GRID);
  const cycleIndex = new Map(cycle.map((cell, index) => [key(cell), index]));
  const game = new SnakeGameLogic({
    gridSize: GRID,
    ruleset: RULESETS[dynasty],
    simulationSeed: `board-fill-${dynasty}`,
    growthProfileId: 'dynasty',
  });
  game.setGenome(v2Genome(`board-fill-run-${dynasty}`, dynasty));
  game.start();
  const startedAtMs = game.getState().startTime ?? Date.now();

  let stop = 'tick budget';
  let cursor = cycleIndex.get(key(game.getState().snake[0]))!;
  let onCycle = true;
  let penultimate: SnakeCheckpointV1 | null = null;
  let maxTerrainRegions = 0;
  let foodlessTicksWithSpace = 0;
  let foodlessStreak = 0;
  let longestFoodlessStreak = 0;
  let ghostFoodTicks = 0;

  /**
   * The three per-tick invariants this certification now polices, sampled on
   * every tick rather than only at the end - a partition that healed, or a
   * ghost that was overwritten by the next wave, is still a defect the player
   * met.
   */
  const sample = (): void => {
    maxTerrainRegions = Math.max(maxTerrainRegions, terrainFieldRegions(game));
    const live = game.getState({ includeGenomeV2: true });
    const claimed = new Set(live.snake.map(key));
    for (const block of live.terrain) if (block.solid) claimed.add(key(block));
    for (const fact of live.genomeV2?.permanentTerrain ?? []) {
      for (const cell of fact.cells) claimed.add(key(cell));
    }
    if (live.foods.length === 0 && reachableTargets(live).length > 0) {
      foodlessTicksWithSpace += 1;
      foodlessStreak += 1;
      longestFoodlessStreak = Math.max(longestFoodlessStreak, foodlessStreak);
    } else {
      foodlessStreak = 0;
    }
    const mirrored = live.food === null ? null : key(live.food);
    const head = live.foods.length > 0 ? key(live.foods[0]) : null;
    if (mirrored !== head) ghostFoodTicks += 1;
  };

  // Three ticks without eating so the whole body settles onto the cycle. The
  // food is parked far ahead so the snake cannot reach it in that time.
  for (let index = 0; index < 3; index += 1) {
    while (resolvePending(game)) {
      /* drain every decision surface */
    }
    const head = game.getState().snake[0];
    const next = cycle[(cursor + 1) % cycle.length];
    game.placeFood({ ...cycle[(cursor + 60) % cycle.length], y: 0 });
    const direction = directionTo(head, next);
    if (direction !== game.getState().direction) game.setDirection(direction);
    game.tick();
    cursor = (cursor + 1) % cycle.length;
  }

  for (let step = 0; step < 4 * CELLS; step += 1) {
    while (resolvePending(game)) {
      /* drain every decision surface */
    }
    const state = game.getState({ includeGenomeV2: true });
    if (state.isGameOver) {
      stop = `died:${game.getDeathCause()}`;
      break;
    }
    const head = state.snake[0];
    const blocked = blockedCells(game);
    const freeNow = CELLS - blocked.size;

    let target: { x: number; z: number; direction: Direction } | null = null;
    if (onCycle) {
      const next = cycle[(cursor + 1) % cycle.length];
      if (blocked.has(key(next))) {
        // A dynasty's own terrain has landed on the cycle. Fall back to the
        // adaptive fill for the rest of the drive.
        onCycle = false;
      } else {
        target = { ...next, direction: directionTo(head, next) };
      }
    }
    if (!target) {
      const open = STEPS.map((entry) => ({
        direction: entry.direction,
        x: head.x + entry.dx,
        z: head.z + entry.dz,
      })).filter((cell) => inBounds(cell) && !blocked.has(key(cell)));
      if (open.length === 0) {
        stop = 'sealed';
        break;
      }
      const scored = open.map((cell) => {
        const after = new Set(blocked);
        after.add(key(cell));
        const seen = new Set([key(cell)]);
        const queue = [cell as { x: number; z: number }];
        let reach = 0;
        while (queue.length > 0) {
          const current = queue.shift()!;
          for (const entry of STEPS) {
            const nextCell = { x: current.x + entry.dx, z: current.z + entry.dz };
            const cellKey = key(nextCell);
            if (!inBounds(nextCell) || after.has(cellKey) || seen.has(cellKey)) {
              continue;
            }
            seen.add(cellKey);
            reach += 1;
            queue.push(nextCell);
          }
        }
        const degree = STEPS.filter((entry) => {
          const nextCell = { x: cell.x + entry.dx, z: cell.z + entry.dz };
          return inBounds(nextCell) && !after.has(key(nextCell));
        }).length;
        return { cell, reach, whole: reach === freeNow - 1, degree };
      });
      scored.sort(
        (a, b) =>
          Number(b.whole) - Number(a.whole) ||
          b.reach - a.reach ||
          a.degree - b.degree ||
          key(a.cell).localeCompare(key(b.cell))
      );
      target = scored[0].cell;
    }

    // The checkpoint the server would hold when the last free cell closes.
    if (freeNow === 1) penultimate = game.exportCheckpoint(startedAtMs + 1_000);

    // Only override the wave when the engine's own seeded placement is not
    // already where the route needs it. `placeFood` re-registers Genome v2
    // targets and can draw from the RNG, so a redundant call would make this
    // window unreplayable — and the final window MUST be pristine, because it
    // is the one the server is asked to validate.
    if (!state.foods.some((food) => key(food) === key(target))) {
      game.placeFood({ x: target.x, y: 0, z: target.z });
    }
    if (target.direction !== state.direction) {
      const accepted = game.setDirection(target.direction);
      if (accepted !== 'accepted') {
        stop = `steering refused: ${target.direction} -> ${accepted}`;
        break;
      }
    }
    const before = game.getSimulationTick();
    game.tick();
    if (game.getSimulationTick() === before) {
      stop = 'tick stalled behind an unresolved decision';
      break;
    }
    sample();
    if (onCycle) cursor = (cursor + 1) % cycle.length;
  }

  const state = game.getState({ includeGenomeV2: true });
  const body = new Set(state.snake.map(key));
  const solid = new Set(state.terrain.filter((block) => block.solid).map(key));
  for (const fact of state.genomeV2?.permanentTerrain ?? []) {
    for (const cell of fact.cells) solid.add(key(cell));
  }
  const occupied = new Set([...body, ...solid]);
  const ticks = game.getSimulationTick();

  // Model the run's active clock at the dynasty's own legal food rate. The
  // drive eats on every tick, which no ruleset permits in real time; the
  // certification is about board geometry, so it must not be rejected by a
  // rate bound that has nothing to do with board fill.
  const modelledElapsedMs = Math.ceil(
    (state.foodEaten / RULESETS[dynasty].validation.maxFoodPerSecond) * 1_000
  ) + 5_000;

  return {
    game,
    startedAtMs,
    stop,
    ticks,
    foodEaten: state.foodEaten,
    bodyCells: body.size,
    snakeLength: state.snake.length,
    solidCells: solid.size,
    occupiedCells: occupied.size,
    freeCells: CELLS - occupied.size,
    actions: game.getReplayTrace().actions.length,
    maxTerrainRegions,
    foodlessTicksWithSpace,
    longestFoodlessStreak,
    ghostFoodTicks,
    penultimate: penultimate ?? game.exportCheckpoint(startedAtMs + 1_000),
    saturated: state.isGameOver
      ? penultimate ?? game.exportCheckpoint(startedAtMs + 1_000)
      : game.exportCheckpoint(startedAtMs + modelledElapsedMs),
  };
}

const DRIVES = new Map<DynastyName, SaturationDrive>();
function drive(dynasty: DynastyName): SaturationDrive {
  const existing = DRIVES.get(dynasty);
  if (existing) return existing;
  const fresh = driveToSaturation(dynasty);
  DRIVES.set(dynasty, fresh);
  return fresh;
}

function continuityRow(
  sessionId: string,
  drivenRun: SaturationDrive,
  checkpoint: SnakeCheckpointV1,
  manifest: ReturnType<typeof manifestFor>,
  now: number
): Record<string, unknown> {
  return {
    id: sessionId,
    start_request_id: START_ID,
    start_manifest: manifest,
    continuity_phase: 'active',
    continuity_activated_at: new Date(drivenRun.startedAtMs).toISOString(),
    continuity_checkpoint: checkpoint,
    continuity_checkpoint_revision: 1,
    continuity_checkpoint_saved_at: new Date(now - 500).toISOString(),
    continuity_lease_issued_at: new Date(now - 500).toISOString(),
    continuity_lease_hash: createHash('sha256').update(LEASE).digest('hex'),
    simulation_rules_version: SNAKE_RULES_VERSION,
    started_at: new Date(drivenRun.startedAtMs).toISOString(),
    ended_at: null,
    end_reason: null,
  };
}

function clientWithRowAndRpc(
  row: Record<string, unknown>,
  rpc: jest.Mock
): SupabaseClient {
  const query = {
    select: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest.fn().mockResolvedValue({ data: row, error: null }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return { from: jest.fn(() => query), rpc } as unknown as SupabaseClient;
}

function bytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

// ---------------------------------------------------------------------------

describe('FACT 1 — the 2048-tick / 512-action ceiling is a per-checkpoint window', () => {
  it('pins the four bounds a long run could plausibly meet', () => {
    // Pinned so a future tuning change cannot quietly move a wall a player can
    // reach. Any edit here must come with a fresh board-fill certification.
    expect(RUN_REPLAY_MAX_TICKS_PER_CHECKPOINT).toBe(2_048);
    expect(RUN_REPLAY_MAX_ACTIONS_PER_CHECKPOINT).toBe(512);
    expect(RUN_REPLAY_MAX_ACTIONS).toBe(50_000);
    expect(RUN_CHECKPOINT_MAX_BYTES).toBe(1_048_576);
    expect(RUN_TERMINAL_FACTS_MAX_BYTES).toBe(262_144);
  });

  it('measures 2048 and 512 as a delta against the last accepted checkpoint, not a run total', () => {
    // A snake circling an empty board, eating nothing. Two windows are cut
    // from the SAME 2400-tick run: one 2400-tick jump, and the same distance
    // split by an intermediate acceptance. If the ceiling were a run budget
    // both would fail; if it is a window, only the first does.
    const dynasty: DynastyName = 'PRIMAL';
    const simulationSeed = 'window-semantics';
    const genome = v2Genome('window-semantics-run', dynasty);
    const manifest = manifestFor('window', simulationSeed, genome, dynasty);
    const game = new SnakeGameLogic({
      gridSize: GRID,
      ruleset: RULESETS[dynasty],
      simulationSeed,
      growthProfileId: 'dynasty',
    });
    game.setGenome(genome);
    game.start();
    const startedAtMs = game.getState().startTime ?? Date.now();
    const startedAt = new Date(startedAtMs).toISOString();

    // Park the food outside the circuit and walk a fixed ring forever.
    const ring: Array<{ x: number; z: number }> = [];
    for (let x = 2; x <= 17; x += 1) ring.push({ x, z: 2 });
    for (let z = 3; z <= 17; z += 1) ring.push({ x: 17, z });
    for (let x = 16; x >= 2; x -= 1) ring.push({ x, z: 17 });
    for (let z = 16; z >= 3; z -= 1) ring.push({ x: 2, z });

    const walkTo = (cell: { x: number; z: number }) => {
      while (resolvePending(game)) {
        /* drain */
      }
      const head = game.getState().snake[0];
      const direction = directionTo(head, cell);
      if (direction !== game.getState().direction) {
        expect(game.setDirection(direction)).toBe('accepted');
      }
      game.tick();
      expect(key(game.getState().snake[0])).toBe(key(cell));
    };
    const walk = (steps: number, dx: number, dz: number) => {
      for (let index = 0; index < steps; index += 1) {
        const head = game.getState().snake[0];
        walkTo({ x: head.x + dx, z: head.z + dz });
      }
    };

    // Park the food in the middle, which the ring never touches, and approach
    // (2,2) heading UP so the first ring step is a legal turn and not a
    // reversal. The opening heading is RIGHT, so the first move must be UP.
    game.placeFood({ x: 10, y: 0, z: 10 });
    walk(1, 0, -1); // (10,10) -> (10,9), now heading UP
    walk(8, -1, 0); // (10,9) -> (2,9), now heading LEFT
    walk(7, 0, -1); // (2,9)  -> (2,2), now heading UP
    expect(key(game.getState().snake[0])).toBe('2:2');
    game.placeFood({ x: 10, y: 0, z: 10 });

    const opening = game.exportCheckpoint(startedAtMs + 1_000);
    let cursor = ring.findIndex(
      (cell) => key(cell) === key(game.getState().snake[0])
    );
    expect(cursor).toBeGreaterThanOrEqual(0);
    const capture: Record<number, SnakeCheckpointV1> = {};
    for (let step = 1; step <= 2_400; step += 1) {
      cursor = (cursor + 1) % ring.length;
      walkTo(ring[cursor]);
      if (game.getState().isGameOver) throw new Error('ring drive collided');
      if (step === 1_000 || step === 2_400) {
        capture[step] = game.exportCheckpoint(startedAtMs + 1_000 + step * 175);
      }
    }
    expect(game.getState().foodEaten).toBe(0);

    const context = (previous: SnakeCheckpointV1, atStep: number) => ({
      manifest,
      startedAt,
      now: startedAtMs + 1_000 + atStep * 175 + 5_000,
      previous,
    });

    // One 2400-tick leap with nothing accepted in between: refused.
    expect(() =>
      validateRunCheckpoint(capture[2_400], context(opening, 2_400))
    ).toThrow(RunContinuityError);
    try {
      validateRunCheckpoint(capture[2_400], context(opening, 2_400));
    } catch (error) {
      expect((error as RunContinuityError).message).toBe(
        'Run checkpoint forks its accepted replay history.'
      );
      expect((error as RunContinuityError).reason).toBe('invalid_checkpoint');
    }

    // The identical simulation, checkpointed once on the way: both accepted.
    const accepted = validateRunCheckpoint(capture[1_000], context(opening, 1_000));
    expect(accepted.state.foodEaten).toBe(0);
    expect(
      validateRunCheckpoint(capture[2_400], context(accepted, 2_400))
    ).toBeDefined();
  }, 120_000);

  it('shows a board-fill run never approaches the per-run action or tick caps', () => {
    // The owner's real run: 1,531 ticks across 51 foods = 30.0 ticks per food.
    const OWNER_TICKS = 1_531;
    const OWNER_FOODS = 51;
    const ticksPerFood = OWNER_TICKS / OWNER_FOODS;

    for (const dynasty of DYNASTIES) {
      // Foods needed to reach a 400-cell body, from the dynasty growth fold.
      // CYBER/COSMIC grow +1 per food; PRIMAL grows +4/+3/+2/+1 by length.
      const foodsToFill =
        dynasty === 'PRIMAL'
          ? 18 + 7 + 12 + (CELLS - 120) // 75 -> 96 -> 120 -> 400
          : CELLS - 3;
      const projectedTicks = Math.ceil(foodsToFill * ticksPerFood);
      // Every tick can carry at most one turn action, and only a turn, hold or
      // decision is recorded at all.
      const projectedActions = projectedTicks;

      expect(projectedTicks).toBeLessThan(10_000_000);
      expect(projectedActions).toBeLessThan(RUN_REPLAY_MAX_ACTIONS);
      // Headroom, not a squeeze: the worst case is under a quarter of the cap.
      expect(projectedActions * 4).toBeLessThan(RUN_REPLAY_MAX_ACTIONS);
    }
  });

  it('shows the window a legitimate player can accumulate is a fraction of 2048 ticks', () => {
    // The client checkpoints every 3s and freezes the board once writes have
    // been failing for 10s (ACTIVE_RUN_CHECKPOINT_INTERVAL_MS /
    // ACTIVE_RUN_CONNECTION_HOLD_MS in src/app/game/page.tsx), and each attempt
    // may itself burn its 4.5s abort budget before it is counted. The widest
    // window a player can legitimately open is therefore one full cadence plus
    // the hold plus one timed-out attempt, at the dynasty's fastest tick.
    const CADENCE_MS = 3_000;
    const CONNECTION_HOLD_MS = 10_000;
    const ATTEMPT_TIMEOUT_MS = 4_500;
    const fastestTickMs: Record<DynastyName, number> = {
      CYBER: 120,
      PRIMAL: 175,
      COSMIC: 160,
    };
    for (const dynasty of DYNASTIES) {
      const worstWindowTicks = Math.ceil(
        (CADENCE_MS + CONNECTION_HOLD_MS + ATTEMPT_TIMEOUT_MS) /
          fastestTickMs[dynasty]
      );
      // Worst case is CYBER at 146 ticks: 7.1% of the tick budget, and — since
      // a tick can carry at most one turn — 28.5% of the action budget.
      expect(worstWindowTicks).toBeLessThan(RUN_REPLAY_MAX_TICKS_PER_CHECKPOINT / 8);
      expect(worstWindowTicks * 3).toBeLessThan(
        RUN_REPLAY_MAX_ACTIONS_PER_CHECKPOINT
      );
    }
  });
});

// ---------------------------------------------------------------------------

describe('FACT 2 — every placement path answers on a saturated board', () => {
  const head = { x: 10, z: 10 };

  function grid(free: ReadonlyArray<{ x: number; z: number }>): Uint8Array {
    const blocked = blockedGrid(GRID);
    blocked.fill(1);
    for (const cell of free) blocked[cell.x * GRID + cell.z] = 0;
    return blocked;
  }

  const seeded = (seed: number) => () => {
    let state = seed;
    return (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
  };

  it('food placement returns null on a board with no free cell, and does not throw or hang', () => {
    const start = Date.now();
    const cell = chooseFoodCell(GRID, head, grid([]), 1, seeded(7));
    expect(cell).toBeNull();
    // A rejection sampler without an enumeration fallback would spin here.
    expect(Date.now() - start).toBeLessThan(1_000);
  });

  it('food placement finds the single remaining cell however unsurvivable it is', () => {
    const only = { x: 0, z: 0 };
    const cell = chooseFoodCell(GRID, head, grid([only]), 0.9975, seeded(11));
    expect(cell).toEqual(only);
  });

  it('food placement stays honest across the last twenty cells of the board', () => {
    for (let free = 20; free >= 1; free -= 1) {
      const cells = Array.from({ length: free }, (_, index) => ({
        x: index % GRID,
        z: Math.floor(index / GRID),
      }));
      const cell = chooseFoodCell(
        GRID,
        head,
        grid(cells),
        1 - free / CELLS,
        seeded(free)
      );
      expect(cell).not.toBeNull();
      expect(cells.map(key)).toContain(key(cell!));
    }
  });

  it('portal and relic placement DECLINE rather than draw an impossible target', () => {
    // `chooseSurvivableTargetCell` refuses the unsafe fallback on purpose: a
    // portal the player cannot survive reaching is worse than no portal.
    expect(
      chooseSurvivableTargetCell(GRID, head, grid([]), seeded(3), 400)
    ).toBeNull();
    expect(
      chooseSurvivableTargetCell(GRID, head, grid([{ x: 0, z: 0 }]), seeded(3), 400)
    ).toBeNull();
  });

  it('terrain placement returns fewer cells rather than failing when the rings are full', () => {
    const full = new Set<string>();
    for (let x = 0; x < GRID; x += 1) {
      for (let z = 0; z < GRID; z += 1) full.add(`${x},${z}`);
    }
    expect(nextTerrainCells(GRID, full, 6, seeded(5))).toEqual([]);
    const oneLeft = new Set(full);
    oneLeft.delete('0,0');
    expect(nextTerrainCells(GRID, oneLeft, 6, seeded(5))).toHaveLength(1);
  });

  it('the engine spawns nothing, and throws nothing, on a board it has filled', () => {
    for (const dynasty of DYNASTIES) {
      const driven = drive(dynasty);
      if (driven.freeCells > 0) continue;
      expect(() => driven.game.spawnFood()).not.toThrow();
      expect(driven.game.getState().foods).toHaveLength(0);
    }
  }, 300_000);
});

// ---------------------------------------------------------------------------

describe('FACT 3 — the engine survives its own saturated board', () => {
  it.each(DYNASTIES)('drives %s to the occupancy its rules allow', (dynasty) => {
    const driven = drive(dynasty);

    // Nothing threw, nothing hung, and the run is still a live resolved state
    // at the moment the board closed.
    expect(driven.stop).toBe('sealed');
    expect(driven.game.getState().isGameOver).toBe(false);
    expect(driven.occupiedCells + driven.freeCells).toBe(CELLS);
    expect(driven.bodyCells).toBeLessThanOrEqual(driven.snakeLength);

    // Whatever the mix of body and terrain, the head has no legal move left:
    // this is the board-fill end state for this dynasty.
    const blocked = blockedCells(driven.game);
    const headCell = driven.game.getState().snake[0];
    const escapes = STEPS.map((entry) => ({
      x: headCell.x + entry.dx,
      z: headCell.z + entry.dz,
    })).filter((cell) => inBounds(cell) && !blocked.has(key(cell)));
    expect(escapes).toEqual([]);
  }, 300_000);

  it('reaches a literally full board on the two dynasties without a terrain schedule', () => {
    for (const dynasty of ['PRIMAL', 'COSMIC'] as DynastyName[]) {
      const driven = drive(dynasty);
      expect(driven.solidCells).toBe(0);
      expect(driven.bodyCells).toBe(CELLS);
      expect(driven.freeCells).toBe(0);
    }
  }, 300_000);

  it('BF-1 RULED: the arena closes without limit and never severs the board', () => {
    // BF-1 measured CYBER entombed: free cells stranded on the far side of a
    // block, unreachable for the rest of the run. The owner ruled the CAP out
    // and the GUARANTEE in - unlimited inward ring progression stays, and
    // `nextTerrainCells` refuses any cell whose placement would partition the
    // free field, laying the ring's other cells and catching the skipped one
    // once a neighbour has filled in.
    //
    // Sampled on EVERY tick of the drive, not only at its end: a partition that
    // later healed is still a board the player was cheated by.
    const driven = drive('CYBER');
    expect(driven.solidCells).toBeGreaterThan(0);
    expect(driven.maxTerrainRegions).toBeLessThanOrEqual(1);
    expect(terrainFieldRegions(driven.game)).toBeLessThanOrEqual(1);

    // Ring progression is genuinely unlimited: the arena is well past its
    // outer ring (76 cells) by the time the drive ends.
    expect(driven.solidCells).toBeGreaterThan(76);

    // And the other two dynasties, which lay terrain from Fortress and
    // calcification rather than from a schedule, are held to the same line.
    for (const dynasty of ['PRIMAL', 'COSMIC'] as DynastyName[]) {
      expect(drive(dynasty).maxTerrainRegions).toBeLessThanOrEqual(1);
    }
  }, 300_000);

  it('BF-1 residual, stated honestly: this harness still corners CYBER with its own body', () => {
    // What the guarantee does NOT claim. The drive eats on every tick, so its
    // tail never vacates a cell and its body is a growing blob rather than a
    // moving snake; steering that blob to a full board around a terrain front
    // that closes 1.2 cells per food is a Hamiltonian search this certification
    // deliberately does not run. So CYBER still stops 'sealed' with free cells
    // on the board - but the cause is now the body, not the arena, and the
    // remaining free cells are one connected region rather than pockets behind
    // blocks. Recorded rather than asserted away, because a certification that
    // claimed "CYBER saturates" on this evidence would be lying.
    const driven = drive('CYBER');
    expect(driven.stop).toBe('sealed');
    expect(driven.freeCells).toBeGreaterThan(0);
    expect(driven.maxTerrainRegions).toBeLessThanOrEqual(1);
  }, 300_000);

  it('BF-2 RULED: the wave and the cell the renderer draws cannot disagree', () => {
    // BF-2 was "a filled board keeps rendering the food it just consumed":
    // `spawnFoods` emptied `state.foods` and nothing cleared the legacy
    // `state.food` the renderer reads. The same gap had a second, far worse
    // face on a crowded board - `registerGenomeV2Targets` drops a food it
    // cannot route to, AFTER the mirror was written, so the player chased a
    // cell the engine no longer held and the run silently lost its food supply.
    //
    // `state.food` is now nullable and has exactly one writer, and the wave is
    // retried on every tick while it is empty.
    for (const dynasty of DYNASTIES) {
      const driven = drive(dynasty);
      const state = driven.game.getState();
      // Sampled every tick of the drive, not just at the end.
      expect(driven.ghostFoodTicks).toBe(0);
      // The wave never STAYS empty. Before the fix an empty wave was terminal:
      // the only refill ran inside the eat branch, so a board with no food
      // could never produce the eat that would spawn more, and the run played
      // on foodless until it died. It is now retried every tick.
      //
      // Not zero, and the reason is recorded rather than asserted away: the
      // Genome's route model treats a FORMING decal as a wall (conservative -
      // it will be solid before the body arrives), so on CYBER a wave can be
      // skipped for the tick or two the front takes to settle. Transient by
      // construction, and the streak bound is what proves it.
      expect(driven.longestFoodlessStreak).toBeLessThanOrEqual(2);
      const live = driven.game.getState({ includeGenomeV2: true });
      if (live.foods.length === 0) {
        expect(reachableTargets(live)).toEqual([]);
      }
      if (state.foods.length === 0) {
        expect(state.food).toBeNull();
      } else {
        expect(state.food).toEqual(state.foods[0]);
      }
    }
  }, 300_000);

  it('BF-3 RULED: filling the board terminalizes as a successful extraction', () => {
    // BF-3 asked what board fill should BE. It was a death: `RunDeathCause`
    // had no board-full state, so a player who claimed all 400 cells was
    // killed by the next tick as an ordinary collision, and the single
    // hardest thing in the game settled as a crash.
    //
    // Ruled as option B. At zero free cells the run terminalizes EXTRACTED:
    // the board is full, there is no move in any direction, and nothing the
    // player could have done differently. It settles through the ordinary
    // extraction fold — no new currency, no new surface, no Results layer —
    // and the persisted `death_cause` enum is untouched, because both kinds
    // of extraction are 'extracted'. `extractionKind` refines it for
    // presentation exactly as `collisionDiagnostic` refines wall/self.
    for (const dynasty of ['PRIMAL', 'COSMIC'] as DynastyName[]) {
      const driven = drive(dynasty);
      expect(driven.freeCells).toBe(0);
      expect(driven.game.getState().isGameOver).toBe(false);

      driven.game.tick();

      const terminal = driven.game.getTerminalResult();
      expect(driven.game.getState().isGameOver).toBe(true);
      expect(driven.game.getState().extracted).toBe(true);
      expect(driven.game.getDeathCause()).toBe('extracted');
      expect(terminal).toMatchObject({
        extracted: true,
        endReason: 'extracted',
        extractionKind: 'saturation',
      });
      // Nothing was created by ending this way: the run banked what its
      // ledger already held, and score never reads anything but dynasty and
      // food count (R2).
      expect(terminal?.score).toBe(driven.game.getState().score);
      expect(terminal?.foodEaten).toBe(driven.foodEaten);
      // A saturated board is not a portal the player walked into, and the
      // run-event stream does not claim one.
      const events = driven.game.getRunEvents()?.events ?? [];
      expect(events.filter((event) => event.e === 'x')).toMatchObject([
        { c: 'extracted' },
      ]);
      expect(events.at(-2)).toMatchObject({ e: 'b' });
    }
  }, 300_000);

  it('leaves a snake cornered with free cells still on the board a death', () => {
    // The ruling is "the BOARD is full", not "the head is stuck". CYBER's
    // arena seals its snake into a pocket with a hundred cells still open
    // elsewhere — that is a death the player was cornered into, and turning
    // it into a bank would pay out an entombment. The predicate is
    // deliberately blind to reachability for exactly this reason.
    const driven = drive('CYBER');
    expect(driven.freeCells).toBeGreaterThan(0);
    driven.game.tick();
    expect(driven.game.getState().isGameOver).toBe(true);
    expect(driven.game.getState().extracted).toBe(false);
    expect(['self', 'wall']).toContain(driven.game.getDeathCause());
    expect(driven.game.getTerminalResult()?.extractionKind).toBeNull();
  }, 300_000);
});

// ---------------------------------------------------------------------------

describe('FACT 4 — a maximum-length run fits every size and validation bound', () => {
  it.each(DYNASTIES)(
    'serializes a %s checkpoint at maximum body length well under the caps',
    (dynasty) => {
      const driven = drive(dynasty);
      const size = bytes(driven.saturated);

      // The database column cap (063:80-95) and the TypeScript guard agree.
      expect(size).toBeLessThan(RUN_CHECKPOINT_MAX_BYTES);
      // Headroom, not a squeeze: the worst dynasty must fit four times over.
      expect(size * 4).toBeLessThan(RUN_CHECKPOINT_MAX_BYTES);
      // The board itself is never the expensive part; the Genome v2 reducer is.
      expect(bytes(driven.saturated.state.snake)).toBeLessThan(32_768);
    },
    300_000
  );

  it.each(DYNASTIES)(
    'accepts the %s checkpoint that closes the last free cell as its own canonical replay',
    (dynasty) => {
      const driven = drive(dynasty);
      if (driven.freeCells > 0) return; // CYBER: see FINDING BF-1.
      const simulationSeed = `board-fill-${dynasty}`;
      const manifest = manifestFor(
        `fill-${dynasty}`,
        simulationSeed,
        v2Genome(`board-fill-run-${dynasty}`, dynasty),
        dynasty
      );
      const modelledElapsed = driven.saturated.privateState.elapsedMs;

      // The window is the final eat: the server restores a 399-cell body from
      // the penultimate checkpoint and replays one tick, during which the real
      // `spawnFoods` runs against zero free cells. If saturation broke the
      // deterministic fold this is where it would surface.
      const canonical = validateRunCheckpoint(driven.saturated, {
        manifest,
        startedAt: new Date(driven.startedAtMs).toISOString(),
        now: driven.startedAtMs + modelledElapsed + 5_000,
        previous: driven.penultimate,
      });
      expect(canonical.state.snake).toHaveLength(driven.snakeLength);
      expect(canonical.state.foods).toEqual([]);
      expect(canonical.state.isGameOver).toBe(false);
    },
    300_000
  );
});

// ---------------------------------------------------------------------------

describe('FACT 5 — a maximum-length run is settleable', () => {
  it.each(DYNASTIES)(
    'stages the terminal outcome of a saturated %s run inside every payload cap',
    async (dynasty) => {
      const driven = drive(dynasty);
      if (driven.freeCells > 0) return; // CYBER: see FINDING BF-1.
      const sessionId = `fill-terminal-${dynasty}`;
      const simulationSeed = `board-fill-${dynasty}`;
      const manifest = manifestFor(
        sessionId,
        simulationSeed,
        v2Genome(`board-fill-run-${dynasty}`, dynasty),
        dynasty
      );
      const accepted = driven.saturated;
      const now = driven.startedAtMs + accepted.privateState.elapsedMs + 2_000;

      // The engine is already sealed. One more tick terminalizes it.
      if (!driven.game.getState().isGameOver) driven.game.tick();
      expect(driven.game.getState().isGameOver).toBe(true);

      const proof = buildTerminalReplayProof(
        accepted.privateState.replay,
        driven.game.getReplayTrace(),
        accepted.privateState.elapsedMs + 200
      );
      expect(proof).not.toBeNull();

      const rpc = jest.fn().mockResolvedValue({
        data: { accepted: true, inserted: true },
        error: null,
      });
      const intent = await stageRunTerminalIntent(
        clientWithRowAndRpc(
          continuityRow(sessionId, driven, accepted, manifest, now),
          rpc
        ),
        {
          playerId: 'player-board-fill',
          sessionId,
          expectedRevision: 1,
          leaseToken: LEASE,
          replay: proof,
          now,
        }
      );

      // ONE SOURCE OF TRUTH, PROVEN RATHER THAN ASSERTED.
      //
      // Nothing in `runContinuity` knows what saturation is. It restores the
      // accepted checkpoint, re-runs the ENGINE's own tick over the accepted
      // journal, and reads whatever terminal the engine reached. So the
      // server agreeing that a filled board is an extraction is not a second
      // implementation that happens to match — it is the same implementation,
      // and these are the facts it staged from a 400-cell body.
      expect(intent.facts).toMatchObject({
        extracted: true,
        died: false,
        death_cause: 'extracted',
        extraction_kind: 'saturation',
      });
      // `victory` stays the literal false it has always been: this is an
      // extraction, not a new terminal category, and no persisted enum grew.
      expect(intent.facts.victory).toBe(false);
      expect(intent.facts.food_count).toBe(driven.foodEaten);
      expect(intent.digest).toMatch(/^[0-9a-f]{64}$/);

      // Cap 1: continuity_terminal_facts (063:107-120, 262,144 bytes).
      //
      // FINDING BF-4, recorded as a tripwire rather than a failure. This is
      // the TIGHTEST of the three caps at maximum length: a filled board
      // measured 115,289 B, 44% of the allowance. The board is not what costs
      // — the snake is 8 KB — the unprojected Genome v2 journal is ~105 KB of
      // it, and the journal grows with DECISIONS, not with body length. This
      // drive declines every offer; a player who accepts genes, splices and
      // apexes writes more. The 2x assertion below is deliberately the ratchet:
      // if a future change makes the terminal facts of a maximum-length run
      // exceed ~131 KB, this fails while there is still headroom to fix it,
      // rather than after a run has stranded. Routed to CE-3.
      const factsBytes = bytes(intent.facts);
      expect(factsBytes).toBeLessThan(RUN_TERMINAL_FACTS_MAX_BYTES);
      expect(factsBytes * 2).toBeLessThan(RUN_TERMINAL_FACTS_MAX_BYTES);

      // Cap 2: the settlement envelope (066, 262,144 bytes). #72's projection
      // is what keeps a long run out of the wall that stranded two accounts.
      const projected = projectGenomeForSettlement(
        intent.facts.genome as Parameters<typeof projectGenomeForSettlement>[0]
      );
      const projectedBytes = bytes(projected);
      expect(projectedBytes).toBeLessThan(RUN_TERMINAL_FACTS_MAX_BYTES);
      expect(projectedBytes * 4).toBeLessThan(RUN_TERMINAL_FACTS_MAX_BYTES);

      // And the projection is doing real work at this length: the unprojected
      // genome is materially larger than the projected one.
      expect(bytes(intent.facts.genome)).toBeGreaterThan(projectedBytes);
    },
    300_000
  );
});
