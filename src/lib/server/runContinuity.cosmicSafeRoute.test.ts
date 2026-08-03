import {
  SNAKE_RULES_VERSION,
  SnakeGameLogic,
  type Direction,
  type Position,
} from '@/lib/game/SnakeGameLogic';
import { sanitizeGenomeCapability } from '@/lib/game/genomeCapability';
import { shortestGenomeV2Route } from '@/lib/game/genomeV2Runtime';
import { validateRunCheckpoint } from '@/lib/server/runContinuity';
import { genomeV2ActivePool } from '@/shared/game/genes';
import {
  GENOME_RULES_V2,
  GENOME_V2_INTERACTION_PHYSICAL_RELIC,
  deriveGenomeV2FtuePresentation,
} from '@/shared/game/genomeV2';
import { COSMIC_SPEED_MS, RULESETS } from '@/shared/game/rulesets';

const GRID_SIZE = 20;
const STARTED_AT = Date.UTC(2026, 7, 3, 8, 0, 0);
const SIMULATION_SEED = 'measure-long-cosmic-2';
const GENOME_SEED = 'measure-long-cosmic-genome-2';

const DIRECTIONS: ReadonlyArray<{
  direction: Direction;
  dx: number;
  dz: number;
}> = [
  { direction: 'UP', dx: 0, dz: -1 },
  { direction: 'RIGHT', dx: 1, dz: 0 },
  { direction: 'DOWN', dx: 0, dz: 1 },
  { direction: 'LEFT', dx: -1, dz: 0 },
];

const OPPOSITE: Record<Direction, Direction> = {
  UP: 'DOWN',
  DOWN: 'UP',
  LEFT: 'RIGHT',
  RIGHT: 'LEFT',
};

function cellKey(cell: Pick<Position, 'x' | 'z'>): string {
  return `${cell.x}:${cell.z}`;
}

function wrap(value: number): number {
  return ((value % GRID_SIZE) + GRID_SIZE) % GRID_SIZE;
}

function physicalBlockedCells(game: SnakeGameLogic): Array<{
  x: number;
  z: number;
}> {
  const state = game.getState();
  return [
    ...state.snake.slice(1).map(({ x, z }) => ({ x, z })),
    ...state.terrain.map(({ x, z }) => ({ x, z })),
    ...(state.genomeV2?.permanentTerrain ?? []).flatMap((fact) =>
      fact.cells.map(({ x, z }) => ({ x, z }))
    ),
  ];
}

/** Deterministic, legal COSMIC routing through the nearest live Star. */
function nextFoodDirection(game: SnakeGameLogic): Direction {
  const state = game.getState();
  const head = state.snake[0];
  const blocked = new Set(state.snake.map(cellKey));
  for (const terrain of state.terrain) {
    if (terrain.solid) blocked.add(cellKey(terrain));
  }
  for (const fact of state.genomeV2?.permanentTerrain ?? []) {
    for (const cell of fact.cells) blocked.add(cellKey(cell));
  }
  blocked.delete(cellKey(head));

  let best: { direction: Direction; distance: number } | null = null;
  for (const target of state.foods) {
    const queue: Position[] = [head];
    const seen = new Set([cellKey(head)]);
    const prior = new Map<
      string,
      { key: string; direction: Direction }
    >();
    let cursor = 0;
    while (cursor < queue.length && !seen.has(cellKey(target))) {
      const current = queue[cursor++];
      for (const step of DIRECTIONS) {
        if (
          current.x === head.x &&
          current.z === head.z &&
          step.direction === OPPOSITE[state.direction]
        ) {
          continue;
        }
        const next = {
          x: wrap(current.x + step.dx),
          y: 0,
          z: wrap(current.z + step.dz),
        };
        const key = cellKey(next);
        if (blocked.has(key) || seen.has(key)) continue;
        seen.add(key);
        prior.set(key, {
          key: cellKey(current),
          direction: step.direction,
        });
        queue.push(next);
      }
    }
    if (!seen.has(cellKey(target))) continue;

    let key = cellKey(target);
    let first: Direction | null = null;
    let distance = 0;
    while (key !== cellKey(head)) {
      const entry = prior.get(key);
      if (!entry) throw new Error('COSMIC route lost its predecessor.');
      first = entry.direction;
      key = entry.key;
      distance += 1;
    }
    if (first && (!best || distance < best.distance)) {
      best = { direction: first, distance };
    }
  }
  if (!best) throw new Error('COSMIC fixture found no reachable food.');
  return best.direction;
}

function advanceOneTick(game: SnakeGameLogic): void {
  const before = game.getSimulationTick();
  while (game.getSimulationTick() === before) {
    const state = game.getState();
    const offer = state.genomeV2?.offer;
    if (offer) {
      expect(
        game.resolveGenomeV2Offer({
          action: 'decline',
          offerId: offer.offerId,
        })
      ).toBe(true);
      continue;
    }
    const portal = state.genomeV2?.portal;
    if (portal) {
      expect(
        game.resolveGenomeV2Portal({
          action: 'continue',
          portalId: portal.portalId,
          activateMirror: false,
        })
      ).toBe(true);
      continue;
    }
    const direction = nextFoodDirection(game);
    if (direction !== state.direction) {
      expect(game.setDirection(direction, 'standard')).toBe('accepted');
    }
    expect(() => game.tick()).not.toThrow();
  }
}

function physicalCosmicGenome() {
  const genome = sanitizeGenomeCapability({
    rulesVersion: GENOME_RULES_V2,
    interactionVersion: GENOME_V2_INTERACTION_PHYSICAL_RELIC,
    runSeed: GENOME_SEED,
    v2GenePool: genomeV2ActivePool('COSMIC'),
    heirloom: {},
    ftuePresentation: deriveGenomeV2FtuePresentation(10, 3),
    offerTiltStrain: null,
    suppressedStrains: [],
    strainThresholdDelta: {},
  });
  if (!genome || genome.rulesVersion !== GENOME_RULES_V2) {
    throw new Error('COSMIC fixture Genome did not sanitize.');
  }
  return genome;
}

describe('COSMIC Genome wave reachability', () => {
  it('treats sibling Stars as traversable and keeps successor checkpoints replayable', () => {
    const genome = physicalCosmicGenome();
    const manifest = {
      sessionId: 'cosmic-sibling-route-regression',
      simulation: {
        seed: SIMULATION_SEED,
        version: 1,
        rulesVersion: SNAKE_RULES_VERSION,
      },
      runSnake: { dynasty: 'COSMIC' },
      growthProfile: 'dynasty',
      genome,
    };
    const game = new SnakeGameLogic({
      ruleset: RULESETS.COSMIC,
      genome,
      simulationSeed: SIMULATION_SEED,
      growthProfileId: 'dynasty',
    });
    game.prepare();
    const opening = validateRunCheckpoint(game.exportCheckpoint(STARTED_AT), {
      manifest,
      startedAt: new Date(STARTED_AT).toISOString(),
      now: STARTED_AT,
      opening: true,
    });
    game.activatePrepared(STARTED_AT);

    while (game.getSimulationTick() < 626) advanceOneTick(game);
    const beforeState = game.getState();
    expect(beforeState.foodEaten).toBe(78);
    expect(beforeState.snake[0]).toMatchObject({ x: 14, z: 0 });
    expect(beforeState.foods).toHaveLength(1);
    expect(beforeState.foods[0]).toMatchObject({ x: 13, z: 0 });
    const beforeWave = validateRunCheckpoint(
      game.exportCheckpoint(STARTED_AT + 626 * COSMIC_SPEED_MS),
      {
        manifest,
        startedAt: new Date(STARTED_AT).toISOString(),
        now: STARTED_AT + 626 * COSMIC_SPEED_MS,
        previous: opening,
      }
    );

    // This exact tick used to move and grow the body, then throw while
    // registering the new wave. The live engine continued from state the
    // server could never replay, producing the repeated checkpoint 400 loop.
    advanceOneTick(game);
    const wave = game.getState();
    expect(wave.foodEaten).toBe(79);
    expect(wave.foods).toHaveLength(5);
    const activeTargets = Object.values(wave.genomeV2?.targets ?? {}).filter(
      (target) =>
        target.lifecycle === 'active' || target.lifecycle === 'armed'
    );
    expect(activeTargets).toHaveLength(wave.foods.length);

    // Four Stars lie behind the fifth in the only open corridor. Every one is
    // reachable when sibling collectibles are correctly treated as cells the
    // player may traverse rather than as terrain.
    const blocked = physicalBlockedCells(game);
    for (const food of wave.foods) {
      expect(
        shortestGenomeV2Route(
          GRID_SIZE,
          wave.snake[0],
          food,
          blocked,
          true
        )
      ).not.toBeNull();
    }

    const acceptedWave = validateRunCheckpoint(
      game.exportCheckpoint(STARTED_AT + 627 * COSMIC_SPEED_MS),
      {
        manifest,
        startedAt: new Date(STARTED_AT).toISOString(),
        now: STARTED_AT + 627 * COSMIC_SPEED_MS,
        previous: beforeWave,
      }
    );
    expect(acceptedWave.state.genomeV2?.foodCount).toBe(79);

    while (game.getState().foodEaten === 79) advanceOneTick(game);
    const successorTick = game.getSimulationTick();
    const acceptedSuccessor = validateRunCheckpoint(
      game.exportCheckpoint(
        STARTED_AT + successorTick * COSMIC_SPEED_MS
      ),
      {
        manifest,
        startedAt: new Date(STARTED_AT).toISOString(),
        now: STARTED_AT + successorTick * COSMIC_SPEED_MS,
        previous: acceptedWave,
      }
    );
    expect(acceptedSuccessor.state.foodEaten).toBe(80);
    expect(acceptedSuccessor.state.genomeV2?.foodCount).toBe(80);
    expect(acceptedSuccessor.state.foods).toHaveLength(4);
  }, 30_000);
});
