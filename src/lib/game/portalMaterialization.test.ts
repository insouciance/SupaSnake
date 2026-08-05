/**
 * PORTAL FAIRNESS — a door you never saw is a door you never met.
 *
 * `spawnExit` declines when a late board offers no reachable, escape-capable
 * cell, and that refusal is right: a portal the player cannot survive reaching
 * is worse than no portal. What was wrong is what the schedule did next. It
 * counted the door anyway. `portalsMet` is the carry's input — every passed
 * door multiplies the bank and decays salvage toward its floor — so a board too
 * crowded to hold a portal silently raised the stake on a decision the player
 * was never shown.
 *
 * Owner ruling, 2026-08-05: only count portals that actually materialized.
 *
 * THE PART THAT IS NOT OPTIONAL, and why the fix is a retry rather than a
 * smaller counter. The settlement does not read `portalsMet`. It DERIVES the
 * count from `(runSeed, foodCount, the taxes in force)` by walking the same
 * food-indexed recurrence — it has to, because a client-supplied pass count at
 * this leverage would turn a x1.25 bank into x3.05. The server cannot see the
 * board, so it cannot know a door failed to draw. Shrinking the engine's
 * counter alone would therefore fork the HUD from the payout.
 *
 * So the schedule CURSOR is untouched — `portalIndex` and `nextExitAtFood`
 * still advance exactly as `portalSchedule` walks them — and an undrawable door
 * becomes a DEBT that is retried on every resolved tick until the board can
 * hold it. The two sets then coincide: every scheduled door is shown, so
 * counting shown doors and counting scheduled doors give the same number, and
 * `portalsMet` is honest without the settlement having to change.
 */

import { describe, it, expect } from '@jest/globals';
import { SnakeGameLogic, type Direction, type GameState } from './SnakeGameLogic';
import { RULESETS, type DynastyName } from '@/shared/game/rulesets';
import { portalSchedule, portalsEncountered } from '@/shared/game/portals';
import { sanitizeGenomeCapability } from './genomeCapability';
import { genomeV2ActivePool } from '@/shared/game/genes';
import {
  GENOME_RULES_V2,
  GENOME_V2_INTERACTION_PHYSICAL_RELIC,
  deriveGenomeV2FtuePresentation,
} from '@/shared/game/genomeV2';

const STEPS: ReadonlyArray<{ direction: Direction; dx: number; dz: number }> = [
  { direction: 'UP', dx: 0, dz: -1 },
  { direction: 'RIGHT', dx: 1, dz: 0 },
  { direction: 'DOWN', dx: 0, dz: 1 },
  { direction: 'LEFT', dx: -1, dz: 0 },
];

function key(cell: { x: number; z: number }): string {
  return `${cell.x}:${cell.z}`;
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
    interactionVersion: GENOME_V2_INTERACTION_PHYSICAL_RELIC,
  });
  if (!genome) throw new Error('Genome v2 fixture did not sanitize.');
  return genome;
}

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
  if (state.genomeV2?.offer) {
    return game.resolveGenomeV2Offer({
      action: 'decline',
      offerId: state.genomeV2.offer.offerId,
    });
  }
  if (state.genomeV2?.portal) {
    return game.resolveGenomeV2Portal({
      action: 'continue',
      portalId: state.genomeV2.portal.portalId,
      activateMirror: false,
    });
  }
  return false;
}

interface PortalReport {
  game: SnakeGameLogic;
  runSeed: string;
  foodEaten: number;
  /** Distinct `exitSpawned` emissions across the drive. */
  spawns: number;
  /**
   * Ticks on which `portalsMet` increased while NO door stood on the board.
   * This is the defect the ruling names, counted directly.
   */
  countedWithoutDoor: number;
  /** The engine's own count of doors met. */
  portalsMet: number;
  /** Doors the food-indexed schedule reached, derived exactly as the server does. */
  scheduled: number;
  ticks: number;
}

/**
 * Crowd a board hard enough that the late portals have to fight for a cell,
 * passing every door rather than banking so the run keeps going.
 */
function drivePortals(
  dynasty: DynastyName,
  gridSize: number,
  seed: string
): PortalReport {
  const runSeed = `${seed}-run`;
  const game = new SnakeGameLogic({
    gridSize,
    ruleset: RULESETS[dynasty],
    simulationSeed: `${seed}-sim`,
    growthProfileId: 'dynasty',
  });
  game.setGenome(v2Genome(runSeed, dynasty));
  let spawns = 0;
  game.on('exitSpawned', () => {
    spawns += 1;
  });
  game.start();

  const cells = gridSize * gridSize;
  let ticks = 0;
  let countedWithoutDoor = 0;
  const blockedNow = (state: GameState): Set<string> => {
    const blocked = new Set(state.snake.map(key));
    for (const block of state.terrain) if (block.solid) blocked.add(key(block));
    for (const fact of state.genomeV2?.permanentTerrain ?? []) {
      for (const cell of fact.cells) blocked.add(key(cell));
    }
    return blocked;
  };

  for (let step = 0; step < 4 * cells; step += 1) {
    while (resolvePending(game)) {
      /* drain */
    }
    const state = game.getState({ includeGenomeV2: true });
    if (state.isGameOver || state.isDeathSequence) break;
    const head = state.snake[0];
    const blocked = blockedNow(state);
    // Never step onto the exit: passing every door is what keeps the run alive
    // and the schedule walking.
    if (state.exitTile) blocked.add(key(state.exitTile));
    if (state.exitTile2) blocked.add(key(state.exitTile2));
    const open = STEPS.map((entry) => ({
      direction: entry.direction,
      x: head.x + entry.dx,
      z: head.z + entry.dz,
    })).filter(
      (cell) =>
        cell.x >= 0 &&
        cell.z >= 0 &&
        cell.x < gridSize &&
        cell.z < gridSize &&
        !blocked.has(key(cell))
    );
    if (open.length === 0) break;
    const scored = open.map((cell) => {
      const after = new Set(blocked);
      after.add(key(cell));
      const seen = new Set([key(cell)]);
      const queue = [{ x: cell.x, z: cell.z }];
      let reach = 0;
      while (queue.length > 0) {
        const current = queue.pop()!;
        for (const entry of STEPS) {
          const next = { x: current.x + entry.dx, z: current.z + entry.dz };
          const nextKey = key(next);
          if (
            next.x < 0 ||
            next.z < 0 ||
            next.x >= gridSize ||
            next.z >= gridSize ||
            after.has(nextKey) ||
            seen.has(nextKey)
          ) {
            continue;
          }
          seen.add(nextKey);
          reach += 1;
          queue.push(next);
        }
      }
      return { cell, reach };
    });
    scored.sort((a, b) => b.reach - a.reach || key(a.cell).localeCompare(key(b.cell)));
    const target = scored[0].cell;
    if (state.foods.length > 0) {
      game.placeFood({ x: target.x, y: 0, z: target.z });
    }
    if (target.direction !== state.direction) {
      if (game.setDirection(target.direction) !== 'accepted') break;
    }
    const metBefore = game.getPortalsMet();
    game.tick();
    ticks += 1;
    // A door may be counted only while one is standing on the board. A merge
    // into an already-open door counts too, and correctly: the player is
    // looking at a door either way.
    if (game.getPortalsMet() > metBefore && game.getState().exitTile === null) {
      countedWithoutDoor += 1;
    }
  }

  const final = game.getState();
  return {
    game,
    runSeed,
    foodEaten: final.foodEaten,
    spawns,
    countedWithoutDoor,
    portalsMet: game.getPortalsMet(),
    // No genes were taken and no infuse was made, so every interval tax is
    // zero and the server's derivation is the bare recurrence.
    scheduled: portalsEncountered(
      RULESETS[dynasty].extraction,
      runSeed,
      final.foodEaten
    ),
    ticks,
  };
}

describe('the portal schedule counts only doors that materialized', () => {
  // The shipped board. Crowded on purpose - the drive eats on every tick, so
  // its tail never vacates and the late board is far harder to place a portal
  // on than real play ever gets.
  const BOARD = 20;

  it.each(['PRIMAL', 'CYBER', 'COSMIC'] as DynastyName[])(
    '%s: never counts a door while no door stands on the board',
    (dynasty) => {
      const report = drivePortals(dynasty, BOARD, `portal-${dynasty}`);
      expect(report.foodEaten).toBeGreaterThan(15);
      expect(report.portalsMet).toBeGreaterThan(0);
      // THE RULING, counted directly across every tick of the drive.
      expect(report.countedWithoutDoor).toBe(0);
    },
    120_000
  );

  it.each(['PRIMAL', 'CYBER', 'COSMIC'] as DynastyName[])(
    '%s: never counts more doors than the schedule reached',
    (dynasty) => {
      // The settlement derives its own count from `(runSeed, foodCount, taxes)`
      // and never sees the board, so the engine's number may lag but must never
      // lead. A lead would be the engine inflating the carry.
      const report = drivePortals(dynasty, BOARD, `bound-${dynasty}`);
      expect(report.portalsMet).toBeLessThanOrEqual(report.scheduled);
    },
    120_000
  );

  it.each(['PRIMAL', 'CYBER', 'COSMIC'] as DynastyName[])(
    '%s: materialization is complete, so the two counts agree',
    (dynasty) => {
      // This is what keeps the ruling from becoming a payout disagreement. The
      // retry - and, once a door is already owed, a retry that drops the
      // escape-pocket preference - draws every scheduled door, so "doors shown"
      // and "doors scheduled" are the same set.
      //
      // The one residual is a door that came due on the run's last tick and had
      // no tick left to be drawn in. It is a lag of at most one and it is
      // recorded rather than asserted away.
      const report = drivePortals(dynasty, BOARD, `agree-${dynasty}`);
      expect(report.scheduled - report.portalsMet).toBeLessThanOrEqual(1);
    },
    120_000
  );

  it('leaves the food-indexed cursor exactly where the shared recurrence puts it', () => {
    // The debt must never defer the schedule. `nextExitAtFood` is a pure
    // function of the seed and the food count, and the engine's cursor has to
    // land on the same food the shared `portalSchedule` does - otherwise the
    // fairness fix would become a payout disagreement.
    const dynasty: DynastyName = 'PRIMAL';
    const report = drivePortals(dynasty, BOARD, 'cursor');
    const state = report.game.getState();
    const cadence = RULESETS[dynasty].extraction;
    const walked = portalSchedule(cadence, report.runSeed, 4096);
    const passed = portalsEncountered(cadence, report.runSeed, report.foodEaten);
    expect(passed).toBeGreaterThan(0);
    expect(state.nextExitAtFood).toBe(walked[passed]);
  }, 120_000);

  it('carries an owed door across a checkpoint', () => {
    // The debt is run state: a resumed run still owes the player the door it
    // never showed them, so it round-trips with the checkpoint.
    const report = drivePortals('PRIMAL', 12, 'checkpoint');
    const state = report.game.getState();
    if (state.isGameOver || state.isDeathSequence || !state.isPlaying) return;
    const checkpoint = report.game.exportCheckpoint(Date.now());
    expect(
      (checkpoint.privateState as { portalDrawDebt?: number }).portalDrawDebt
    ).toBeGreaterThanOrEqual(0);

    const resumed = new SnakeGameLogic({
      gridSize: 12,
      ruleset: RULESETS.PRIMAL,
      simulationSeed: 'checkpoint-sim',
      growthProfileId: 'dynasty',
    });
    resumed.setGenome(v2Genome('checkpoint-run', 'PRIMAL'));
    resumed.restoreCheckpoint(checkpoint, Date.now());
    expect(resumed.getPortalsMet()).toBe(report.portalsMet);
  }, 120_000);

  it('replays a portal drive to the identical count', () => {
    const a = drivePortals('PRIMAL', 12, 'replay');
    const b = drivePortals('PRIMAL', 12, 'replay');
    expect(a.portalsMet).toBe(b.portalsMet);
    expect(a.spawns).toBe(b.spawns);
    expect(a.foodEaten).toBe(b.foodEaten);
    expect(a.game.getState().exitTile).toEqual(b.game.getState().exitTile);
  }, 120_000);
});
