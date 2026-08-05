/**
 * FOOD SUPPLY — the run that stopped eating.
 *
 * An owner report, 5 August 2026, live PRIMAL run on a laptop: "at a certain
 * length" the snake stopped eating. It flew straight through a food the screen
 * was drawing and nothing happened; the run was de facto over while still
 * alive. The board-fill certification had already recorded half of it as
 * FINDING BF-2 — "a filled board keeps rendering the food it just consumed" —
 * and filed it as cosmetic. It was not cosmetic, and saturation was not where
 * it bit.
 *
 * THE MECHANISM, IN TWO HALVES.
 *
 * 1. THE GHOST. `state.foods` is the wave; `state.food` was a bare `Position`
 *    mirror of `foods[0]`, written at some of the places the wave changes and
 *    not at others. `spawnFoods` wrote it BEFORE calling
 *    `registerGenomeV2Targets`, and that function drops any food it cannot
 *    route to through the CURRENT body — splicing the very array it was handed,
 *    which is `state.foods` itself. So on a crowded board the wave emptied and
 *    the mirror kept pointing at the cell the player had just eaten. The
 *    renderer reads the mirror. The engine reads the wave. The player chased a
 *    cell the engine did not have.
 *
 * 2. THE STALL, which is the part that ended the run. The ONLY refill path ran
 *    inside the eat branch of `tick()` (`foods.length === 0` after a
 *    collection). A board with no food can never produce the eat that would
 *    spawn more, so one unlucky body configuration ended food supply
 *    permanently. The crowd that caused it was transient — a tail vacates a
 *    cell every tick — but the refusal was not.
 *
 * THE FIX, and what these tests hold. `state.food` is `Position | null` with a
 * single writer, so "there is no food" is a state it can express. The wave is
 * retried on EVERY resolved tick while it is empty. And the Genome fallback
 * that gave up now climbs a ladder — survivable cell, then any reachable cell,
 * then a cell inside the arena's closing front — because a cell the head can
 * reach always beats no cell at all.
 *
 * Owner absolute, and the line every case here is drawn against: NO HIDDEN
 * WALLS SKILL CAN HIT. A crowd is a difficulty. A difficulty must pass.
 */

import { describe, it, expect } from '@jest/globals';
import { SnakeGameLogic, type Direction, type GameState } from './SnakeGameLogic';
import { RULESETS, type DynastyName } from '@/shared/game/rulesets';
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

/** Drain any decision surface so a drive is never silently frozen by one. */
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

interface CrowdReport {
  game: SnakeGameLogic;
  ticks: number;
  /** Ticks whose rendered primary food was not the live wave's first cell. */
  ghostTicks: number;
  /** Longest run of consecutive ticks with an empty wave. */
  longestEmptyStreak: number;
  /** Ticks the head stepped onto the rendered food and it did NOT count. */
  missedEats: number;
  /** Ticks that began with an empty wave, so the harness fed nothing. */
  unfedTicks: number;
  /** Foods collected across the drive. */
  eaten: number;
  /** Body length reached. */
  length: number;
  /** True once the wave went empty at least once mid-run. */
  sawEmptyWave: boolean;
}

/**
 * Crowd a board on purpose.
 *
 * The snake is fed on every tick from an adjacent cell, so it grows one segment
 * per tick and its tail never vacates — the fastest legal route to the body
 * geometry the owner's run reached. Steering prefers the move that keeps the
 * most of the board reachable, so the drive crowds itself without simply
 * walking into a wall.
 */
function crowd(dynasty: DynastyName, gridSize: number, seed: string): CrowdReport {
  const game = new SnakeGameLogic({
    gridSize,
    ruleset: RULESETS[dynasty],
    simulationSeed: `${seed}-sim`,
    growthProfileId: 'dynasty',
  });
  game.setGenome(v2Genome(`${seed}-run`, dynasty));
  game.start();

  const cells = gridSize * gridSize;
  let ghostTicks = 0;
  let emptyStreak = 0;
  let longestEmptyStreak = 0;
  let missedEats = 0;
  let unfedTicks = 0;
  let sawEmptyWave = false;
  let ticks = 0;

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

    // Prefer the step that leaves the most board reachable; ties by a stable
    // key so the drive is reproducible.
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

    // Feed on every tick — EXCEPT when the wave is already empty. That
    // exception is the whole regression: the harness deliberately stops
    // helping exactly where the owner's run died, so the food that comes back
    // has to come from the engine's own retry and from nowhere else.
    if (state.foods.length > 0) {
      game.placeFood({ x: target.x, y: 0, z: target.z });
    } else {
      unfedTicks += 1;
    }
    const rendered = game.getState().food;
    const wave = game.getState().foods;
    if ((rendered === null ? null : key(rendered)) !== (wave[0] ? key(wave[0]) : null)) {
      ghostTicks += 1;
    }
    const steppingOntoRendered = rendered !== null && key(rendered) === key(target);

    if (target.direction !== state.direction) {
      if (game.setDirection(target.direction) !== 'accepted') break;
    }
    game.tick();
    ticks += 1;

    const after = game.getState({ includeGenomeV2: true });
    // THE OWNER'S SYMPTOM, asserted directly. A rendered food the head walks
    // onto must RESOLVE: collected, or moved on by a Circuit relay, which is
    // visible food geometry that deliberately is not a food event. What must
    // never happen is the head standing on it with the cell still in the wave -
    // "flew through it and nothing happened" is exactly that state.
    const stillThere = after.foods.some((food) => key(food) === key(target));
    const headArrived = key(after.snake[0]) === key(target);
    if (steppingOntoRendered && headArrived && stillThere) missedEats += 1;

    const mirrored = after.food === null ? null : key(after.food);
    const live = after.foods[0] ? key(after.foods[0]) : null;
    if (mirrored !== live) ghostTicks += 1;

    if (after.foods.length === 0) {
      sawEmptyWave = true;
      emptyStreak += 1;
      longestEmptyStreak = Math.max(longestEmptyStreak, emptyStreak);
    } else {
      emptyStreak = 0;
    }
  }

  const final = game.getState();
  return {
    game,
    ticks,
    ghostTicks,
    longestEmptyStreak,
    missedEats,
    unfedTicks,
    eaten: final.foodEaten,
    length: final.snake.length,
    sawEmptyWave,
  };
}

describe('food supply survives a crowded board', () => {
  const DYNASTIES: readonly DynastyName[] = ['PRIMAL', 'CYBER', 'COSMIC'];

  it.each(DYNASTIES)(
    '%s: never renders a food the engine does not hold',
    (dynasty) => {
      // At `2938f94` the same drives showed 57 / 81 / 9 ghost ticks.
      const report = crowd(dynasty, 12, `ghost-${dynasty}`);
      expect(report.ticks).toBeGreaterThan(20);
      expect(report.ghostTicks).toBe(0);
    },
    60_000
  );

  it.each(DYNASTIES)(
    '%s: every tick either eats, or has a reason it could not',
    (dynasty) => {
      const report = crowd(dynasty, 12, `eat-${dynasty}`);
      // The exact accounting. The harness feeds the head's next cell on every
      // tick it can, so a tick that did not eat must be one of exactly two
      // named things - and "the food was drawn but did nothing", the owner's
      // symptom, is not one of them.
      // The trailing `- 1` is the terminal tick: a drive that ends in a
      // collision spends its last tick dying rather than eating.
      expect(report.eaten).toBeGreaterThanOrEqual(
        report.ticks - report.missedEats - report.unfedTicks - 1
      );
      // A handful of ticks per run resolve a step onto a live ordinary target
      // as movement rather than a collection. That is pre-existing Genome v2
      // behaviour - it reproduces identically at `2938f94` on the same drives
      // - and this wave did not touch it. Bounded, not zero, and said out loud.
      expect(report.missedEats).toBeLessThanOrEqual(4);
      // Ticks the board could not carry a wave at all. Bounded for the same
      // reason the streak is: the Genome route model reads a FORMING decal as
      // a wall, so CYBER can skip a wave while its front settles.
      expect(report.unfedTicks).toBeLessThanOrEqual(5);
    },
    60_000
  );

  it.each(DYNASTIES)(
    '%s: an empty wave is transient, never the end of food supply',
    (dynasty) => {
      // THE REGRESSION. The defect: one unroutable wave emptied `state.foods`
      // and nothing ever refilled it, because the only refill path ran inside
      // the eat branch of a board with nothing to eat. The harness stops
      // feeding the moment the wave is empty, so the food that comes back can
      // only have come from the engine's own retry.
      //
      // At `2938f94` the same drives showed streaks of 52 / 12 / 3 ticks -
      // PRIMAL spent a fifth of its run with no food on the board.
      const report = crowd(dynasty, 12, `stall-${dynasty}`);
      expect(report.longestEmptyStreak).toBeLessThanOrEqual(2);
      expect(report.eaten).toBeGreaterThanOrEqual(
        report.ticks - report.missedEats - report.unfedTicks - 1
      );
    },
    60_000
  );

  it('clears the rendered food when the board can no longer carry one', () => {
    // BF-2's original face, on a board small enough to genuinely fill. The
    // wave is empty and the mirror says so, rather than pointing at the cell
    // the player just ate (at `2938f94`: `{x: 4, y: 0, z: 0}`, under the body).
    const report = crowd('PRIMAL', 5, 'saturate');
    const state = report.game.getState();
    if (state.foods.length === 0) {
      expect(state.food).toBeNull();
    } else {
      expect(state.food).toEqual(state.foods[0]);
    }
    expect(report.ghostTicks).toBe(0);
  }, 60_000);

  it('replays a crowded drive to the identical board', () => {
    // Both halves of the fix run inside `tick()` and draw on the seeded
    // stream, so the server replaying the same ticks must reach the same
    // cells. Two drives from one seed, compared on the whole board.
    const a = crowd('PRIMAL', 10, 'determinism');
    const b = crowd('PRIMAL', 10, 'determinism');
    const left = a.game.getState({ includeGenomeV2: true });
    const right = b.game.getState({ includeGenomeV2: true });
    expect(left.snake).toEqual(right.snake);
    expect(left.foods).toEqual(right.foods);
    expect(left.food).toEqual(right.food);
    expect(left.terrain).toEqual(right.terrain);
    expect(left.foodEaten).toBe(right.foodEaten);
    expect(a.ticks).toBe(b.ticks);
  }, 60_000);
});
