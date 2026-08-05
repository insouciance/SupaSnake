import { describe, expect, it } from '@jest/globals';
import {
  GENOME_V2_INTERACTION_PHYSICAL_RELIC,
  GENOME_RULES_V2,
  createGenomeV2State,
  deriveGenomeV2Ftue,
  deriveGenomeV2FtuePresentation,
  genomeV2EventId,
  genomeV2MechanicEnabled,
  genomeV2PhaseGateAvailable,
  previewGenomeV2Recode,
  projectGenomeV2NextTarget,
  reduceGenomeV2Event,
  type GenomeV2Cell,
  type GenomeV2Event,
  type GenomeV2InteractionVersion,
  type GenomeV2State,
} from '@/shared/game/genomeV2';
import {
  genomeV2ActivePool,
  type GenomeV2ActiveGeneId,
} from '@/shared/game/genes';
import { RULESETS, type DynastyName } from '@/shared/game/rulesets';
import {
  SnakeGameLogic,
  SNAKE_RULES_VERSION,
  type Direction,
  type GameOverData,
  type GenomeEngineConfig,
  type SnakeCheckpointV1,
} from './SnakeGameLogic';
import { shortestGenomeV2Route } from './genomeV2Runtime';

type EventFacts = GenomeV2Event extends infer Event
  ? Event extends GenomeV2Event
    ? Omit<Event, 'index' | 'tick' | 'eventId'>
    : never
  : never;

function apply(state: GenomeV2State, facts: EventFacts): GenomeV2State {
  return reduceGenomeV2Event(state, {
    ...facts,
    index: state.eventIndex + 1,
    tick: state.tick + 1,
    eventId: genomeV2EventId(state.runSeed, state.eventIndex + 1),
  } as GenomeV2Event);
}

function reducerWithGene(
  dynasty: DynastyName,
  geneId: GenomeV2ActiveGeneId,
  primeEligibleTargets = 0
): GenomeV2State {
  const pool = genomeV2ActivePool(dynasty);
  let state = createGenomeV2State(dynasty, {
    runSeed: `engine-${dynasty.toLowerCase()}-${geneId}`,
    genePool: pool,
    ftue: deriveGenomeV2Ftue(10, 3),
  });
  state = acquireReducerGene(state, geneId, 0);
  return primeReducerTargets(state, primeEligibleTargets);
}

function acquireReducerGene(
  state: GenomeV2State,
  geneId: GenomeV2ActiveGeneId,
  slot: 0 | 1 | 2 | 3 | 4 | 5,
  reserved: readonly GenomeV2ActiveGeneId[] = []
): GenomeV2State {
  const alternative = state.genePool.find(
    (candidate) =>
      candidate !== geneId &&
      !reserved.includes(candidate) &&
      !Object.values(state.instances).some(
        (instance) => instance.geneId === candidate
      )
  );
  if (!alternative) throw new Error('Fixture pool has no unseen alternative gene.');
  const offerId = `engine-offer-${geneId}-${slot}`;
  let next = apply(state, {
    type: 'offer_opened',
    offerId,
    source: 'cadence',
    candidates: [geneId, alternative],
  });
  next = apply(next, {
    type: 'gene_acquired',
    offerId,
    instanceId: `engine-instance-${geneId}`,
    geneId,
    slot,
    source: 'offer',
  });
  return next;
}

function primeReducerTargets(
  state: GenomeV2State,
  primeEligibleTargets: number
): GenomeV2State {
  let next = state;
  const firstOrdinal = state.eligibleTargetCount + 1;
  for (let offset = 0; offset < primeEligibleTargets; offset += 1) {
    const ordinal = firstOrdinal + offset;
    const targetId = `primed-target-${ordinal}`;
    next = apply(next, {
      type: 'target_spawned',
      targetId,
      cell: { x: ordinal, z: 1 },
      speedAtSpawnMs: 160,
      shortestSafeMoves: 2,
      cadenceEligible: true,
    });
    next = apply(next, {
      type: 'target_resolved',
      targetId,
      resolution: 'expired',
      movesUsed: 2,
      baseYield: 0,
      pressureBps: 0,
      collectedUnits: 0,
    });
  }
  return next;
}

function configForState(
  state: GenomeV2State,
  interactionVersion?: GenomeV2InteractionVersion
): GenomeEngineConfig {
  return {
    rulesVersion: GENOME_RULES_V2,
    runSeed: state.runSeed,
    reducerState: state,
    ...(interactionVersion === undefined ? {} : { interactionVersion }),
  };
}

function freshConfig(dynasty: DynastyName): GenomeEngineConfig {
  return {
    rulesVersion: GENOME_RULES_V2,
    runSeed: `fresh-${dynasty.toLowerCase()}-genome-seed`,
    v2GenePool: [...genomeV2ActivePool(dynasty)],
    ftuePresentation: deriveGenomeV2FtuePresentation(10, 3),
    heirloom: {},
  };
}

function physicalRelicConfig(dynasty: DynastyName): GenomeEngineConfig {
  return {
    ...freshConfig(dynasty),
    interactionVersion: GENOME_V2_INTERACTION_PHYSICAL_RELIC,
  };
}

function eatStraightAhead(game: SnakeGameLogic): void {
  const head = game.getState().snake[0];
  game.placeFood({ x: head.x + 1, y: 0, z: head.z });
  game.tick();
}

function gameplayState(game: SnakeGameLogic) {
  const { startTime: _startTime, ...state } = game.getState();
  return state;
}

function directionBetween(
  from: { x: number; z: number },
  to: { x: number; z: number }
): Direction {
  if (to.x === from.x + 1 && to.z === from.z) return 'RIGHT';
  if (to.x === from.x - 1 && to.z === from.z) return 'LEFT';
  if (to.x === from.x && to.z === from.z + 1) return 'DOWN';
  if (to.x === from.x && to.z === from.z - 1) return 'UP';
  throw new Error('Fixture route contains a non-adjacent step.');
}

function driveTo(
  game: SnakeGameLogic,
  destination: { x: number; z: number },
  additionallyBlocked: readonly { x: number; z: number }[] = []
): void {
  const state = game.getState();
  const route = shortestGenomeV2Route(
    20,
    state.snake[0],
    destination,
    [
      ...state.snake.slice(1).map((cell) => ({ x: cell.x, z: cell.z })),
      ...additionallyBlocked,
    ],
    false
  );
  if (!route) throw new Error('Fixture target has no route.');
  for (const next of route.slice(1)) {
    const current = game.getState();
    const direction = directionBetween(current.snake[0], next);
    if (direction !== current.direction) {
      expect(game.setDirection(direction)).toBe('accepted');
    }
    game.tick();
  }
}

describe('SnakeGameLogic Genome v2 authority boundary', () => {
  it('keeps the large reducer cold across an ordinary movement tick', () => {
    const game = new SnakeGameLogic({
      gridSize: 80,
      ruleset: RULESETS.PRIMAL,
      simulationSeed: 'genome-frame-revision',
      genome: physicalRelicConfig('PRIMAL'),
    });
    game.start();

    expect(game.hasGenome()).toBe(true);
    expect(game.isGameOver()).toBe(false);
    expect(game.getState().genomeV2).not.toBeNull();
    expect(game.getState({ includeGenomeV2: false }).genomeV2).toBeNull();
    const beforeRevision = game.getGenomeV2Revision();

    game.tick();

    expect(game.getGenomeV2Revision()).toBe(beforeRevision);
    expect(game.getGenomeV2State()).not.toBeNull();
  });

  it('keeps missing rulesVersion on v1 and rejects incomplete fresh v2 stamps', () => {
    const legacy = new SnakeGameLogic({
      ruleset: RULESETS.PRIMAL,
      genome: { runSeed: 'legacy-genome-seed' },
    });
    legacy.start();
    expect(legacy.getState().genomeV2).toBeNull();

    expect(
      () =>
        new SnakeGameLogic({
          ruleset: RULESETS.PRIMAL,
          genome: {
            rulesVersion: GENOME_RULES_V2,
            runSeed: 'missing-v2-authority',
          },
        })
    ).toThrow('server-frozen gene pool');
    expect(
      () =>
        new SnakeGameLogic({
          ruleset: RULESETS.PRIMAL,
          genome: {
            rulesVersion: GENOME_RULES_V2,
            runSeed: 'missing-v2-ftue',
            v2GenePool: [...genomeV2ActivePool('PRIMAL')],
          },
        })
    ).toThrow('server-authored FTUE');
  });

  it('uses one canonical target ledger for ordinary food and terminal export', () => {
    const game = new SnakeGameLogic({
      gridSize: 20,
      ruleset: RULESETS.PRIMAL,
      simulationSeed: 'ordinary-v2-engine',
      genome: freshConfig('PRIMAL'),
    });
    game.startDriven({
      snake: [
        { x: 5, y: 0, z: 5 },
        { x: 4, y: 0, z: 5 },
        { x: 3, y: 0, z: 5 },
      ],
      direction: 'RIGHT',
      foods: [{ x: 6, y: 0, z: 5 }],
    });
    game.tick();
    const state = game.getState();
    expect(state.foodEaten).toBe(1);
    expect(state.genomeV2?.foodCount).toBe(1);
    expect(state.dnaCollected).toBe(
      Math.floor((state.genomeV2?.ledger.bankableYield ?? 0) / 10_000)
    );

    let terminal: GameOverData | null = null;
    game.on('gameOver', (value) => {
      terminal = value as GameOverData;
    });
    game.finalizeRun('died');
    expect(terminal?.genomeV2).toMatchObject({
      v: GENOME_RULES_V2,
      settlement: null,
    });
    expect(terminal?.genome).toBeNull();
  });

  it('bridges canonical 2/3/4 points into semantic Minor, Expression, and Apex cockpit tiers', () => {
    const reducer = createGenomeV2State('PRIMAL', {
      startingStrainPoints: { AURUM: 2, VOLT: 3, FERAL: 4 },
      ftue: deriveGenomeV2Ftue(10, 3),
    });
    const game = new SnakeGameLogic({
      gridSize: 20,
      ruleset: RULESETS.PRIMAL,
      simulationSeed: 'v2-cockpit-strain-bridge',
      genome: configForState(reducer),
    });
    game.startDriven({
      snake: [
        { x: 5, y: 0, z: 5 },
        { x: 4, y: 0, z: 5 },
        { x: 3, y: 0, z: 5 },
      ],
      direction: 'RIGHT',
      foods: [{ x: 10, y: 0, z: 5 }],
    });

    expect(game.getState().strainCounts).toMatchObject({
      AURUM: 2,
      VOLT: 3,
      FERAL: 4,
    });
    expect(game.getState().strainTiers).toMatchObject({
      AURUM: 1,
      VOLT: 2,
      FERAL: 3,
    });
  });

  it('spawns a visible relic and opens the Loom only after deliberate collection', () => {
    const game = new SnakeGameLogic({
      gridSize: 40,
      ruleset: RULESETS.PRIMAL,
      simulationSeed: 'physical-relic-engine',
      genome: physicalRelicConfig('PRIMAL'),
    });
    const choices: unknown[] = [];
    game.on('mutationChoice', (event) => choices.push(event));
    game.startDriven({
      snake: [
        { x: 5, y: 0, z: 5 },
        { x: 4, y: 0, z: 5 },
        { x: 3, y: 0, z: 5 },
      ],
      direction: 'RIGHT',
      foods: [{ x: 6, y: 0, z: 5 }],
    });
    const dueAt = game.getState().nextMutationAtFood;
    expect(dueAt).toBeGreaterThanOrEqual(6);
    expect(dueAt).toBeLessThanOrEqual(10);
    for (let eaten = 0; eaten < dueAt; eaten += 1) eatStraightAhead(game);

    expect(game.getState().mutationTile).not.toBeNull();
    expect(game.getState().genomeV2?.offer).toBeNull();
    expect(choices).toHaveLength(0);

    const head = game.getState().snake[0];
    game.placeMutation({ x: head.x + 1, y: 0, z: head.z });
    game.tick();
    expect(game.getState().mutationTile).toBeNull();
    expect(game.getState().genomeV2?.offer).not.toBeNull();
    expect(choices).toHaveLength(1);
    expect(choices[0]).toMatchObject({
      source: 'cadence',
      rulesVersion: GENOME_RULES_V2,
    });
  });

  it('keeps an ignored relic out of the offer and Bond ledgers', () => {
    const game = new SnakeGameLogic({
      gridSize: 120,
      ruleset: RULESETS.PRIMAL,
      simulationSeed: 'ignored-physical-relic-engine',
      genome: physicalRelicConfig('PRIMAL'),
    });
    game.startDriven({
      snake: [
        { x: 5, y: 0, z: 5 },
        { x: 4, y: 0, z: 5 },
        { x: 3, y: 0, z: 5 },
      ],
      direction: 'RIGHT',
      foods: [{ x: 6, y: 0, z: 5 }],
    });
    const dueAt = game.getState().nextMutationAtFood;
    for (let eaten = 0; eaten < dueAt; eaten += 1) eatStraightAhead(game);
    expect(game.getState().mutationTicksRemaining).toBe(40);
    for (let tick = 0; tick < 40; tick += 1) game.tick();

    expect(game.getState().mutationTile).toBeNull();
    expect(game.getState().genomeV2).toMatchObject({ offer: null, offerCount: 0, bonds: 0 });
    expect(game.getState().nextMutationAtFood).toBeGreaterThan(
      game.getState().foodEaten
    );
  });

  it('restores an uncollected physical relic and its opportunity cursor exactly', () => {
    const original = new SnakeGameLogic({
      gridSize: 120,
      ruleset: RULESETS.PRIMAL,
      simulationSeed: 'physical-relic-checkpoint-engine',
      genome: physicalRelicConfig('PRIMAL'),
    });
    original.startDriven({
      snake: [
        { x: 5, y: 0, z: 5 },
        { x: 4, y: 0, z: 5 },
        { x: 3, y: 0, z: 5 },
      ],
      direction: 'RIGHT',
      foods: [{ x: 6, y: 0, z: 5 }],
    });
    const dueAt = original.getState().nextMutationAtFood;
    for (let eaten = 0; eaten < dueAt; eaten += 1) eatStraightAhead(original);
    original.placeMutation({ x: 2, y: 0, z: 2 }, 40);

    const checkpointAt = Date.now();
    const checkpoint = original.exportCheckpoint(checkpointAt);
    expect(checkpoint.config.genome).toMatchObject({
      interactionVersion: GENOME_V2_INTERACTION_PHYSICAL_RELIC,
    });
    const restored = new SnakeGameLogic();
    restored.restoreCheckpoint(checkpoint, checkpointAt);
    expect(restored.getState().mutationTile).toEqual({ x: 2, y: 0, z: 2 });

    for (let tick = 0; tick < 40; tick += 1) {
      original.tick();
      restored.tick();
    }
    expect(gameplayState(restored)).toEqual(gameplayState(original));
    expect(restored.getState().genomeV2).toMatchObject({
      offer: null,
      offerCount: 0,
      bonds: 0,
    });
    expect(restored.getState().nextMutationAtFood).toBeGreaterThan(
      restored.getState().foodEaten
    );
  });

  it('keeps missing interaction stamps on the shipped automatic-offer behavior', () => {
    const game = new SnakeGameLogic({
      gridSize: 40,
      ruleset: RULESETS.PRIMAL,
      simulationSeed: 'auto-offer-compatibility-engine',
      genome: freshConfig('PRIMAL'),
    });
    game.startDriven({
      snake: [
        { x: 5, y: 0, z: 5 },
        { x: 4, y: 0, z: 5 },
        { x: 3, y: 0, z: 5 },
      ],
      direction: 'RIGHT',
      foods: [{ x: 6, y: 0, z: 5 }],
    });
    for (let eaten = 0; eaten < 4; eaten += 1) eatStraightAhead(game);
    expect(game.getState().mutationTile).toBeNull();
    expect(game.getState().genomeV2?.offer).not.toBeNull();
  });

  it('applies Patient and Ascetic to physical Genome-v2 relics', () => {
    const patient = new SnakeGameLogic({
      ruleset: RULESETS.PRIMAL,
      simulationSeed: 'patient-physical-relic-engine',
      traits: ['patient'],
      genome: physicalRelicConfig('PRIMAL'),
    });
    patient.start();
    expect(patient.getState().nextMutationAtFood).toBeGreaterThanOrEqual(12);
    expect(patient.getState().nextMutationAtFood).toBeLessThanOrEqual(20);

    const ascetic = new SnakeGameLogic({
      gridSize: 40,
      ruleset: RULESETS.PRIMAL,
      simulationSeed: 'ascetic-physical-relic-engine',
      traits: ['ascetic'],
      genome: physicalRelicConfig('PRIMAL'),
    });
    ascetic.startDriven({
      snake: [
        { x: 5, y: 0, z: 5 },
        { x: 4, y: 0, z: 5 },
        { x: 3, y: 0, z: 5 },
      ],
      direction: 'RIGHT',
      foods: [{ x: 6, y: 0, z: 5 }],
    });
    const dueAt = ascetic.getState().nextMutationAtFood;
    for (let eaten = 0; eaten < dueAt; eaten += 1) eatStraightAhead(ascetic);
    expect(ascetic.getState().mutationTile).toBeNull();
    expect(ascetic.getState().genomeV2?.offer).toBeNull();
  });

  it('rejects checkpoint counters that diverge from the canonical reducer', () => {
    const game = new SnakeGameLogic({
      gridSize: 20,
      ruleset: RULESETS.PRIMAL,
      simulationSeed: 'v2-checkpoint-ledger',
      genome: freshConfig('PRIMAL'),
    });
    game.startDriven({
      snake: [
        { x: 5, y: 0, z: 5 },
        { x: 4, y: 0, z: 5 },
        { x: 3, y: 0, z: 5 },
      ],
      direction: 'RIGHT',
      foods: [{ x: 6, y: 0, z: 5 }],
    });
    game.tick();
    const checkpoint = game.exportCheckpoint(Date.now());
    const foodTamper = JSON.parse(JSON.stringify(checkpoint)) as typeof checkpoint;
    foodTamper.state.foodEaten += 1;
    expect(() => new SnakeGameLogic().restoreCheckpoint(foodTamper)).toThrow(
      'food count differs'
    );

    const yieldTamper = JSON.parse(JSON.stringify(checkpoint)) as typeof checkpoint;
    yieldTamper.state.dnaCollected += 1;
    expect(() => new SnakeGameLogic().restoreCheckpoint(yieldTamper)).toThrow(
      'Yield differs'
    );
  });
});

describe('SnakeGameLogic Genome v2 board mechanics', () => {
  it('makes Gilded Fork a deterministic two-cell route choice and removes the unchosen branch', () => {
    const pool = genomeV2ActivePool('PRIMAL');
    let reducer = createGenomeV2State('PRIMAL', {
      runSeed: 'engine-primal-gilded-fork',
      genePool: pool,
      ftue: deriveGenomeV2Ftue(10, 3),
    });
    reducer = acquireReducerGene(reducer, 'gold_trail', 0, ['overgrowth']);
    reducer = acquireReducerGene(reducer, 'overgrowth', 1);
    reducer = primeReducerTargets(reducer, 4);

    const makeGame = () => {
      const game = new SnakeGameLogic({
        gridSize: 20,
        ruleset: RULESETS.PRIMAL,
        simulationSeed: 'gilded-fork-board-seed',
        genome: configForState(
          reducer,
          GENOME_V2_INTERACTION_PHYSICAL_RELIC
        ),
      });
      game.startDriven({
        snake: [
          { x: 5, y: 0, z: 5 },
          { x: 4, y: 0, z: 5 },
          { x: 3, y: 0, z: 5 },
        ],
        direction: 'RIGHT',
        foods: [
          { x: 8, y: 0, z: 5 },
          { x: 17, y: 0, z: 17 },
        ],
      });
      return game;
    };

    const gilded = makeGame();
    const initial = gilded.getState();
    const fork = Object.values(initial.genomeV2?.targets ?? {}).find(
      (target) => target.kind === 'gold_trail'
    );
    expect(fork).toMatchObject({
      lifecycle: 'active',
      forkChoice: null,
      cell: { x: 8, z: 5 },
      forkCell: expect.objectContaining({
        x: expect.any(Number),
        z: expect.any(Number),
      }),
    });
    expect(initial.foods).toEqual(
      expect.arrayContaining([
        expect.objectContaining(fork!.cell),
        expect.objectContaining(fork!.forkCell!),
      ])
    );

    const checkpointAt = Date.now();
    const checkpoint = gilded.exportCheckpoint(checkpointAt);
    driveTo(gilded, fork!.forkCell!, [fork!.cell, { x: 17, z: 17 }]);
    const gildedState = gilded.getState();
    const resolvedFork = gildedState.genomeV2?.targets[fork!.targetId];
    expect(resolvedFork).toMatchObject({
      lifecycle: 'completed',
      forkChoice: 'gilded',
    });
    expect(gildedState.foods).toEqual([
      expect.objectContaining({ x: 17, z: 17 }),
    ]);
    expect(gildedState.genomeV2?.bodyGrowthAdded).toBe(2);

    const trace = gilded.getReplayTrace();
    expect(trace.actions).not.toContainEqual(
      expect.objectContaining({ kind: 'genome_v2_target' })
    );
    const replayed = new SnakeGameLogic();
    replayed.restoreCheckpoint(checkpoint, checkpointAt);
    replayed.applyReplayTrace(
      trace,
      checkpoint.privateState.replay.actions.length
    );
    expect(gameplayState(replayed)).toEqual(gameplayState(gilded));

    const ordinary = makeGame();
    const ordinaryFork = Object.values(
      ordinary.getState().genomeV2?.targets ?? {}
    ).find((target) => target.kind === 'gold_trail')!;
    driveTo(ordinary, ordinaryFork.cell, [
      ordinaryFork.forkCell!,
      { x: 17, z: 17 },
    ]);
    const ordinaryState = ordinary.getState();
    expect(ordinaryState.genomeV2?.targets[ordinaryFork.targetId]).toMatchObject({
      lifecycle: 'completed',
      forkChoice: 'ordinary',
    });
    expect(ordinaryState.genomeV2?.bodyGrowthAdded).toBe(0);
    expect(gildedState.genomeV2!.ledger.bankableYield).toBe(
      ordinaryState.genomeV2!.ledger.bankableYield * 4
    );
  });

  /**
   * Regression: the Gold Trail Gene spawns golden food on its own cadence, but
   * only the Gilded Fork Splice draws a branch. Collecting the Gene-only golden
   * food must not try to commit a fork choice the reducer cannot legally accept.
   */
  it('collects Gold Trail Gene golden food that has no Splice branch', () => {
    const pool = genomeV2ActivePool('PRIMAL');
    let reducer = createGenomeV2State('PRIMAL', {
      runSeed: 'engine-primal-gold-trail-gene',
      genePool: pool,
      ftue: deriveGenomeV2Ftue(10, 3),
    });
    // The Gene alone: acquiring Overgrowth as well would forge the Splice.
    reducer = acquireReducerGene(reducer, 'gold_trail', 0, ['overgrowth']);
    reducer = primeReducerTargets(reducer, 4);
    expect(reducer.activeSplices).toEqual([]);

    const game = new SnakeGameLogic({
      gridSize: 20,
      ruleset: RULESETS.PRIMAL,
      simulationSeed: 'gold-trail-gene-board-seed',
      genome: configForState(reducer, GENOME_V2_INTERACTION_PHYSICAL_RELIC),
    });
    game.startDriven({
      snake: [
        { x: 5, y: 0, z: 5 },
        { x: 4, y: 0, z: 5 },
        { x: 3, y: 0, z: 5 },
      ],
      direction: 'RIGHT',
      foods: [
        { x: 8, y: 0, z: 5 },
        { x: 17, y: 0, z: 17 },
      ],
    });

    const initial = game.getState();
    const golden = Object.values(initial.genomeV2?.targets ?? {}).find(
      (target) => target.kind === 'gold_trail'
    );
    expect(golden).toMatchObject({
      lifecycle: 'active',
      forkChoice: null,
      cell: { x: 8, z: 5 },
      forkCell: null,
    });

    const checkpointAt = Date.now();
    const checkpoint = game.exportCheckpoint(checkpointAt);
    driveTo(game, golden!.cell, [{ x: 17, z: 17 }]);

    const collected = game.getState();
    // No branch was drawn, so no branch is committed; the Gene's own
    // within-window multiplier is what pays.
    expect(collected.genomeV2?.targets[golden!.targetId]).toMatchObject({
      lifecycle: 'completed',
      forkChoice: null,
    });
    expect(collected.genomeV2!.ledger.bankableYield).toBeGreaterThan(0);
    expect(collected.genomeV2?.bodyGrowthAdded).toBe(0);

    // Server replay of the identical inputs must reach the identical state.
    const trace = game.getReplayTrace();
    expect(trace.actions).not.toContainEqual(
      expect.objectContaining({ kind: 'genome_v2_target' })
    );
    const replayed = new SnakeGameLogic();
    replayed.restoreCheckpoint(checkpoint, checkpointAt);
    replayed.applyReplayTrace(
      trace,
      checkpoint.privateState.replay.actions.length
    );
    expect(gameplayState(replayed)).toEqual(gameplayState(game));
  });

  it('keeps retired v1 Arc out of the v2 VOLT ladder and leaves its transformed target live', () => {
    const pool = genomeV2ActivePool('CYBER');
    let reducer = createGenomeV2State('CYBER', {
      runSeed: 'engine-cyber-arc-target',
      genePool: pool,
      ftue: deriveGenomeV2Ftue(10, 3),
      startingStrainPoints: { VOLT: 3 },
    });
    reducer = acquireReducerGene(reducer, 'live_wire', 0);
    reducer = primeReducerTargets(reducer, 1);
    const game = new SnakeGameLogic({
      gridSize: 20,
      ruleset: RULESETS.CYBER,
      simulationSeed: 'arc-target-board-seed',
      genome: configForState(
        reducer,
        GENOME_V2_INTERACTION_PHYSICAL_RELIC
      ),
    });
    game.startDriven({
      snake: [
        { x: 5, y: 0, z: 5 },
        { x: 4, y: 0, z: 5 },
        { x: 3, y: 0, z: 5 },
      ],
      direction: 'RIGHT',
      foods: [
        { x: 6, y: 0, z: 5 },
        { x: 8, y: 0, z: 5 },
      ],
    });
    const liveWire = Object.values(game.getState().genomeV2?.targets ?? {}).find(
      (target) => target.kind === 'live_wire'
    );
    expect(liveWire).toBeDefined();

    game.tick();

    const state = game.getState();
    expect(state.foodEaten).toBe(1);
    expect(state.genomeV2?.foodCount).toBe(1);
    expect(state.genomeV2?.targets[liveWire!.targetId]).toMatchObject({
      lifecycle: 'active',
      resolvedBaseYield: 0,
    });
    expect(state.foods).toContainEqual({ x: 8, y: 0, z: 5 });
    expect(state.genomeV2!.ledger.exclusiveTargetDelta).toBe(0);
  });

  it('reports the exact permanent Genome terrain source at a fatal contact', () => {
    let reducer = reducerWithGene('COSMIC', 'phase_gate', 4);
    reducer = apply(reducer, {
      type: 'target_spawned',
      targetId: 'diagnostic-gate-target',
      cell: { x: 12, z: 12 },
      optionalRouteCells: [
        { x: 4, z: 5 },
        { x: 17, z: 5 },
      ],
      speedAtSpawnMs: 170,
      shortestSafeMoves: 8,
      cadenceEligible: true,
    });
    reducer = apply(reducer, {
      type: 'phase_gate_used',
      terrainId: 'diagnostic-phase-scar',
      targetId: 'diagnostic-gate-target',
      cells: [
        { x: 4, z: 5 },
        { x: 17, z: 5 },
      ],
    });
    reducer = apply(reducer, {
      type: 'target_resolved',
      targetId: 'diagnostic-gate-target',
      resolution: 'expired',
      movesUsed: 8,
      baseYield: 0,
      pressureBps: 0,
      usedOptionalRoute: true,
      collectedUnits: 0,
    });
    const game = new SnakeGameLogic({
      gridSize: 20,
      ruleset: RULESETS.COSMIC,
      simulationSeed: 'phase-scar-diagnostic-seed',
      genome: configForState(reducer),
    });
    let terminal: GameOverData | null = null;
    game.on('gameOver', (data) => {
      terminal = data as GameOverData;
    });
    game.startDriven({
      snake: [
        { x: 3, y: 0, z: 5 },
        { x: 2, y: 0, z: 5 },
        { x: 1, y: 0, z: 5 },
      ],
      direction: 'RIGHT',
      foods: [{ x: 15, y: 0, z: 15 }],
    });

    const scar = game.getState().genomeV2!.permanentTerrain[0];
    const solidAtTick = scar.formingFromTick! + scar.formingTotalTicks!;
    // 2.0 s at the door's own 170 ms tick. The same number COSMIC and CYBER
    // already use, deliberately, so there is one forming rule to learn.
    expect(scar.formingTotalTicks).toBe(12);

    // E': the near Scar is still forming, so the snake crosses it. A block
    // that killed on the tick it appeared would be the unreadable trap
    // `isPositionOnTerrain` already refuses to spawn food into.
    game.tick();
    expect(game.getSimulationTick()).toBeLessThan(solidAtTick);
    expect(game.getState().snake[0]).toMatchObject({ x: 4, z: 5 });
    expect(terminal).toBeNull();

    // ...and then it is permanent, and it kills, and it says what it was.
    while (!game.getState().isGameOver) game.tick();
    expect(game.getSimulationTick()).toBeGreaterThan(solidAtTick);

    expect(terminal).toMatchObject({
      deathCause: 'wall',
      collisionDiagnostic: {
        contact: 'permanent_terrain',
        cell: { x: 17, y: 0, z: 5 },
        terrainSource: 'phase_gate_scar',
      },
    });
  });

  it('keeps border and self contact diagnostics distinct', () => {
    const crash = (
      snake: Array<{ x: number; y: number; z: number }>,
      direction: Direction
    ): GameOverData => {
      const game = new SnakeGameLogic({
        gridSize: 20,
        ruleset: RULESETS.PRIMAL,
        rng: () => 0.5,
      });
      let terminal: GameOverData | null = null;
      game.on('gameOver', (data) => {
        terminal = data as GameOverData;
      });
      game.startDriven({
        snake,
        direction,
        foods: [{ x: 10, y: 0, z: 10 }],
      });
      game.tick();
      if (!terminal) throw new Error('Fixture collision did not terminate.');
      return terminal;
    };

    expect(
      crash(
        [
          { x: 19, y: 0, z: 5 },
          { x: 18, y: 0, z: 5 },
          { x: 17, y: 0, z: 5 },
        ],
        'RIGHT'
      ).collisionDiagnostic
    ).toMatchObject({ contact: 'border', terrainSource: null });
    expect(
      crash(
        [
          { x: 5, y: 0, z: 5 },
          { x: 4, y: 0, z: 5 },
          { x: 4, y: 0, z: 6 },
          { x: 5, y: 0, z: 6 },
          { x: 6, y: 0, z: 6 },
          { x: 6, y: 0, z: 5 },
          { x: 7, y: 0, z: 5 },
        ],
        'RIGHT'
      ).collisionDiagnostic
    ).toMatchObject({ contact: 'self', terrainSource: null });
  });

  it('checkpoints Circuit between relay and destination and resumes exactly', () => {
    const reducer = reducerWithGene('CYBER', 'circuit_run', 3);
    const original = new SnakeGameLogic({
      gridSize: 30,
      ruleset: RULESETS.CYBER,
      simulationSeed: 'circuit-checkpoint-seed',
      genome: configForState(reducer),
    });
    original.startDriven({
      snake: [
        { x: 5, y: 0, z: 5 },
        { x: 4, y: 0, z: 5 },
        { x: 3, y: 0, z: 5 },
      ],
      direction: 'RIGHT',
      foods: [{ x: 9, y: 0, z: 5 }],
    });
    expect(original.getState().foods[0]).toEqual({ x: 7, y: 0, z: 5 });
    original.tick();
    original.tick();
    expect(original.getState().foods[0]).toEqual({ x: 9, y: 0, z: 5 });
    expect(original.getState().snake).toHaveLength(3);

    const checkpointAt = Date.now();
    const checkpoint = original.exportCheckpoint(checkpointAt);
    expect(SNAKE_RULES_VERSION).toBe('snake-rules-2026-08-05.2');
    expect(checkpoint.rulesVersion).toBe('snake-rules-2026-08-05.2');
    expect(checkpoint.privateState.genomeV2Runtime?.targetProgress).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ circuitLegsCompleted: 1 }),
      ])
    );
    const resumed = new SnakeGameLogic();
    resumed.restoreCheckpoint(checkpoint, checkpointAt);

    original.tick();
    resumed.tick();
    original.tick();
    resumed.tick();
    expect(gameplayState(resumed)).toEqual(gameplayState(original));
    expect(original.getState().foodEaten).toBe(1);
    expect(original.getState().snake).toHaveLength(4);
    const circuit = Object.values(
      original.getState().genomeV2?.targets ?? {}
    ).find((target) => target.kind === 'circuit_run');
    expect(circuit?.lifecycle).toBe('completed');
  });

  it('settles Circuit leg one as one zero-Yield food when the route expires', () => {
    const reducer = reducerWithGene('CYBER', 'circuit_run', 3);
    const game = new SnakeGameLogic({
      gridSize: 30,
      ruleset: RULESETS.CYBER,
      simulationSeed: 'circuit-expiry-seed',
      genome: configForState(reducer),
    });
    game.startDriven({
      snake: [
        { x: 5, y: 0, z: 5 },
        { x: 4, y: 0, z: 5 },
        { x: 3, y: 0, z: 5 },
      ],
      direction: 'RIGHT',
      foods: [{ x: 9, y: 0, z: 5 }],
    });
    game.tick();
    game.tick();
    expect(game.getState()).toMatchObject({
      foodEaten: 0,
      dnaCollected: 0,
    });

    game.placeFood({ x: 15, y: 0, z: 5 });
    const state = game.getState();
    expect(state).toMatchObject({
      foodEaten: 1,
      dnaCollected: 0,
    });
    expect(state.score).toBeGreaterThan(0);
    expect(state.snake).toHaveLength(4);
    expect(state.genomeV2?.foodCount).toBe(1);
    const circuit = Object.values(state.genomeV2?.targets ?? {}).find(
      (target) => target.kind === 'circuit_run'
    );
    expect(circuit?.lifecycle).toBe('expired');
  });

  it('teleports through the exact Phase pair and makes both cells Scars', () => {
    const reducer = reducerWithGene('COSMIC', 'phase_gate', 4);
    const game = new SnakeGameLogic({
      gridSize: 20,
      ruleset: RULESETS.COSMIC,
      simulationSeed: 'phase-gate-engine',
      genome: configForState(reducer),
    });
    game.startDriven({
      snake: [
        { x: 5, y: 0, z: 5 },
        { x: 4, y: 0, z: 5 },
        { x: 3, y: 0, z: 5 },
      ],
      direction: 'RIGHT',
      foods: [{ x: 10, y: 0, z: 5 }],
    });
    const target = Object.values(game.getState().genomeV2?.targets ?? {}).find(
      (candidate) => candidate.kind === 'phase_gate'
    );
    expect(target?.optionalRouteCells).toEqual([
      { x: 6, z: 5 },
      { x: 9, z: 5 },
    ]);
    game.tick();
    expect(game.getState().snake[0]).toMatchObject({ x: 9, z: 5 });
    expect(game.getState().genomeV2?.permanentTerrain[0]).toMatchObject({
      source: 'phase_gate_scar',
      cells: target?.optionalRouteCells,
    });

    // G: the tick after arrival is the beat. The snake holds where the door
    // left it - one move, once, so the player can find their own head.
    expect(game.getState().arrivalBeatTicksRemaining).toBe(1);
    game.tick();
    expect(game.getState().snake[0]).toMatchObject({ x: 9, z: 5 });
    expect(game.getState().arrivalBeatTicksRemaining).toBe(0);
    expect(game.getState().foodEaten).toBe(0);

    // ...and then ordinary play resumes into the food the door bought.
    game.tick();
    expect(game.getState().foodEaten).toBe(1);
  });

  /**
   * THE OWNER'S DEATH, RECONSTRUCTED - and then survived.
   *
   * The exit landed two cells from the wall with the heading pointed at it.
   * PRIMAL, because COSMIC is a torus and has no wall to die against.
   *
   *   N    direction consumed; the head would enter the entry, so the engine
   *        substitutes the exit. The head is now elsewhere, heading unchanged.
   *   N+1  head -> exit + D. One cell from the wall.
   *   N+2  head -> exit + 2D. Out of bounds. Dead.
   *
   * Two ticks - 350 ms on PRIMAL - to notice the head vanished, re-fixate,
   * read unfamiliar geometry, choose, and press. And because exactly one
   * buffered input is consumed per tick, a corrective press lands BEHIND
   * whatever the player had queued for the entry: with k queued it cannot
   * execute before N+1+k, so with two queued the first tick they can
   * influence is N+3 - one tick after they are already dead.
   *
   * D2 empties the queue, so the correction is first in line. G holds one
   * movement boundary, so there is a whole tick to enter it. Both halves are
   * asserted below, on the exact geometry that killed the run.
   */
  const OWNER_ENTRY = { x: 6, z: 5 };
  const OWNER_EXIT = { x: 18, z: 5 };
  const OWNER_DEATH_AT = Date.UTC(2026, 7, 5, 9, 0, 0);

  /**
   * A real engine-spawned gate, moved to the geometry that killed the run.
   *
   * The route itself is pure BFS from the head to the food, so the engine
   * always draws entry = one step ahead and exit = adjacent to the food -
   * which puts the exit next to a target rather than next to a wall. The
   * checkpoint is therefore rewritten the way `recodePhaseGateAway` does it,
   * leaving the reducer and its runtime snapshot consistent with each other.
   *
   * The snake heads UP one cell short of the entry's column, so the FIRST
   * queued turn is the one that carries the head onto the entry - which is
   * what leaves the rest of the buffer intact at the moment of traversal,
   * exactly as it is for a player steering deliberately onto a marker.
   */
  function ownerDeathBoard(): SnakeGameLogic {
    const source = new SnakeGameLogic({
      gridSize: 20,
      ruleset: RULESETS.PRIMAL,
      simulationSeed: 'owner-death-reconstruction',
      genome: configForState(reducerWithGene('PRIMAL', 'phase_gate', 4)),
    });
    source.startDriven({
      snake: [
        { x: 5, y: 0, z: 5 },
        { x: 5, y: 0, z: 6 },
        { x: 5, y: 0, z: 7 },
      ],
      direction: 'UP',
      foods: [{ x: 10, y: 0, z: 5 }],
    });
    const checkpoint = source.exportCheckpoint(OWNER_DEATH_AT);
    const gate = Object.values(checkpoint.state.genomeV2!.targets).find(
      (target) => target.kind === 'phase_gate'
    )!;
    expect(gate.optionalRouteCells?.[0]).toEqual(OWNER_ENTRY);
    gate.optionalRouteCells = [OWNER_ENTRY, OWNER_EXIT];

    const game = new SnakeGameLogic();
    game.restoreCheckpoint(checkpoint, OWNER_DEATH_AT);
    return game;
  }

  it('survives the owner death: the exit two cells from a wall, heading at it', () => {
    const game = ownerDeathBoard();

    // The two ticks the player used to have. The wall is at x = 20.
    expect(OWNER_EXIT.x + 2).toBe(20);

    expect(game.setDirection('RIGHT')).toBe('accepted');
    game.tick();

    // N: through the door, heading preserved, pointed at the wall.
    expect(game.getState().snake[0]).toMatchObject(OWNER_EXIT);
    expect(game.getState().direction).toBe('RIGHT');
    expect(game.getState().isGameOver).toBe(false);

    // N+1 is the beat (G): the board holds still while the player finds the
    // head. This is the tick that used to be spent on `exit + D`.
    const correction = game.setDirection('UP');
    expect(correction).toBe('accepted');
    game.tick();
    expect(game.getState().snake[0]).toMatchObject(OWNER_EXIT);

    // N+2: the correction executes. Under the old rules this was the tick
    // the head went out of bounds.
    game.tick();
    expect(game.getState().snake[0]).toMatchObject({ x: 18, z: 4 });
    expect(game.getState().isGameOver).toBe(false);

    // ...and the player is back in control of a live board: they steer off
    // the wall column and keep playing.
    expect(game.setDirection('LEFT')).toBe('accepted');
    for (let index = 0; index < 6; index += 1) game.tick();
    expect(game.getState().isGameOver).toBe(false);
    expect(game.getState().snake[0]).toMatchObject({ x: 12, z: 4 });
  });

  it('drops the turns the player composed for the entry, so the fix is first in line', () => {
    const game = ownerDeathBoard();

    // A player steering deliberately onto a marker has one or two turns
    // already queued. RIGHT carries the head onto the entry; DOWN and RIGHT
    // are the pair composed for what they expected to find there.
    expect(game.setDirection('RIGHT')).toBe('accepted');
    expect(game.setDirection('DOWN')).toBe('accepted');
    expect(game.setDirection('RIGHT')).toBe('accepted');

    game.tick();
    expect(game.getState().snake[0]).toMatchObject(OWNER_EXIT);

    // D2: the stale pair is gone. Were it still queued, DOWN would execute
    // next and the corrective UP could not run until two ticks later - which
    // is the arithmetic that made this death unavoidable rather than hard.
    expect(game.setDirection('UP')).toBe('accepted');
    game.tick(); // the beat
    game.tick(); // the first movement tick after arrival

    // UP ran, not DOWN. The player's correction was at the FRONT.
    expect(game.getState().snake[0]).toMatchObject({ x: 18, z: 4 });
    expect(game.getState().direction).toBe('UP');
    expect(game.getState().isGameOver).toBe(false);
  });

  it('keeps the beat bounded: one movement boundary, once, and walls stay lethal', () => {
    const game = ownerDeathBoard();
    expect(game.setDirection('RIGHT')).toBe('accepted');
    game.tick();
    expect(game.getState().arrivalBeatTicksRemaining).toBe(1);

    // Exactly one. It is spent by the next tick and is not re-armed, so it
    // cannot be banked or stacked across a run.
    game.tick();
    expect(game.getState().arrivalBeatTicksRemaining).toBe(0);

    // NOT invincibility. The player who does nothing with the beat still
    // drives into the wall on the tick they always would have.
    game.tick();
    expect(game.getState().snake[0]).toMatchObject({ x: 19, z: 5 });
    expect(game.getState().isGameOver).toBe(false);
    game.tick();
    expect(game.getState().isGameOver).toBe(true);
    expect(game.getDeathCause()).toBe('wall');
  });

  it('replays a gate traversal, its beat and its Scars to the identical board', () => {
    const game = ownerDeathBoard();
    expect(game.setDirection('RIGHT')).toBe('accepted');
    game.tick();
    expect(game.setDirection('UP')).toBe('accepted');
    for (let index = 0; index < 10; index += 1) game.tick();

    const live = game.getState({ includeGenomeV2: true });
    const trace = game.getReplayTrace();
    expect(live.genomeV2?.permanentTerrain).toHaveLength(1);

    // The server holds no opening checkpoint here, so replay the whole run
    // from a fresh engine on the same config: the beat, the cleared buffer
    // and the Scar window are all engine-modelled, so they reproduce.
    const replayed = ownerDeathBoard();
    replayed.applyReplayTrace(trace, 0);
    const after = replayed.getState({ includeGenomeV2: true });

    expect(after.snake).toEqual(live.snake);
    expect(after.direction).toBe(live.direction);
    expect(after.arrivalBeatTicksRemaining).toBe(live.arrivalBeatTicksRemaining);
    expect(after.genomeV2?.permanentTerrain).toEqual(
      live.genomeV2?.permanentTerrain
    );
    expect(replayed.getSimulationTick()).toBe(game.getSimulationTick());
  });

  it('redirects one charged Wall Rush impact and makes the next impact lethal', () => {
    const reducer = reducerWithGene('PRIMAL', 'wall_rush');
    const game = new SnakeGameLogic({
      gridSize: 10,
      ruleset: RULESETS.PRIMAL,
      simulationSeed: 'wall-rush-engine',
      genome: configForState(reducer),
    });
    game.startDriven({
      snake: [
        { x: 9, y: 0, z: 5 },
        { x: 8, y: 0, z: 5 },
        { x: 7, y: 0, z: 5 },
      ],
      direction: 'RIGHT',
      foods: [{ x: 2, y: 0, z: 2 }],
    });

    game.tick();
    expect(game.getState()).toMatchObject({
      isDeathSequence: false,
      direction: 'DOWN',
      genomeV2: { wallRushCharges: 0 },
    });
    expect(game.getState().snake[0]).toEqual({ x: 9, y: 0, z: 6 });

    expect(game.setDirection('RIGHT')).toBe('accepted');
    game.tick();
    expect(game.getState().isDeathSequence).toBe(true);
  });

  it('uses the reducer-owned Phoenix rewind, growth, and single life', () => {
    const reducer = reducerWithGene('PRIMAL', 'phoenix');
    const game = new SnakeGameLogic({
      gridSize: 10,
      ruleset: RULESETS.PRIMAL,
      simulationSeed: 'phoenix-engine',
      genome: configForState(reducer),
    });
    game.startDriven({
      snake: [
        { x: 9, y: 0, z: 5 },
        { x: 8, y: 0, z: 5 },
        { x: 7, y: 0, z: 5 },
        { x: 6, y: 0, z: 5 },
        { x: 5, y: 0, z: 5 },
      ],
      direction: 'RIGHT',
      foods: [{ x: 2, y: 0, z: 2 }],
    });
    game.tick();
    const state = game.getState();
    expect(state.isGameOver).toBe(false);
    expect(state.revive?.kind).toBe('phoenix');
    expect(state.genomeV2?.secondLife?.consumed).toBe(true);
    expect(state.snake).toHaveLength(15);
    expect(state.revivePhaseTicksRemaining).toBe(
      state.genomeV2?.lastPhoenixEffect?.phaseTicks
    );
  });

  it('starts REDLINE only from an explicit action and records its stable id', () => {
    const reducer = reducerWithGene('CYBER', 'zenith_protocol');
    const game = new SnakeGameLogic({
      gridSize: 30,
      ruleset: RULESETS.CYBER,
      simulationSeed: 'redline-engine',
      genome: configForState(reducer),
    });
    game.startDriven({
      snake: [
        { x: 5, y: 0, z: 5 },
        { x: 4, y: 0, z: 5 },
        { x: 3, y: 0, z: 5 },
      ],
      direction: 'RIGHT',
      foods: [{ x: 20, y: 0, z: 5 }],
    });
    const baseSpeed = game.getSpeed();
    expect(game.getState().genomeV2?.overclock).toBeNull();
    expect(game.activateGenomeV2Overclock({ source: 'zenith_protocol' })).toBe(
      true
    );
    expect(game.getSpeed()).toBeLessThan(baseSpeed);
    const activationId = game.getState().genomeV2?.overclock?.activationId;
    expect(game.getReplayTrace().actions).toContainEqual({
      tick: 0,
      kind: 'genome_v2_overclock',
      source: 'zenith_protocol',
      activationId,
    });
  });
});

/**
 * A crowded board is difficulty, not corruption. Five cells, a body coiled
 * around the head, and exactly one legal step - to the food itself. No relay
 * and no gate pair exist, which used to halt the whole run mid-registration.
 */
const CROWDED_OPENING = {
  snake: [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: 0, y: 0, z: 2 },
    { x: 1, y: 0, z: 2 },
    { x: 1, y: 0, z: 1 },
  ],
  direction: 'UP' as Direction,
  foods: [{ x: 1, y: 0, z: 0 }],
};

describe('SnakeGameLogic Genome v2 contract degradation', () => {
  it('defers a Circuit contract instead of halting when no relay geometry exists', () => {
    const reducer = reducerWithGene('CYBER', 'circuit_run', 3);
    expect(
      projectGenomeV2NextTarget(reducer, { cadenceEligible: true })
        .requiresSecondaryCell
    ).toBe(true);
    const game = new SnakeGameLogic({
      gridSize: 5,
      ruleset: RULESETS.CYBER,
      simulationSeed: 'circuit-crowded-board',
      genome: configForState(reducer),
    });

    expect(() => game.startDriven(CROWDED_OPENING)).not.toThrow();

    const state = game.getState();
    // The food stays exactly where it was placed: no relay was invented.
    expect(state.foods).toEqual([{ x: 1, y: 0, z: 0 }]);
    const spawned = Object.values(state.genomeV2?.targets ?? {}).filter(
      (target) => target.lifecycle === 'active' || target.lifecycle === 'armed'
    );
    expect(spawned).toHaveLength(1);
    expect(spawned[0]).toMatchObject({
      kind: 'ordinary',
      secondaryCell: null,
      contractId: null,
    });
    // Deferred, not consumed: the cadence clock did not advance, so the very
    // next eligible target still owes the same Circuit.
    expect(state.genomeV2?.eligibleTargetCount).toBe(
      reducer.eligibleTargetCount
    );
    expect(
      projectGenomeV2NextTarget(state.genomeV2!, { cadenceEligible: true })
        .requiresSecondaryCell
    ).toBe(true);
  });

  it('defers a Phase contract instead of halting when no gate geometry exists', () => {
    const reducer = reducerWithGene('CYBER', 'phase_gate', 4);
    expect(
      projectGenomeV2NextTarget(reducer, { cadenceEligible: true })
        .requiresOptionalRouteCells
    ).toBe(true);
    const game = new SnakeGameLogic({
      gridSize: 5,
      ruleset: RULESETS.CYBER,
      simulationSeed: 'phase-crowded-board',
      genome: configForState(reducer),
    });

    expect(() => game.startDriven(CROWDED_OPENING)).not.toThrow();

    const state = game.getState();
    expect(state.foods).toEqual([{ x: 1, y: 0, z: 0 }]);
    const spawned = Object.values(state.genomeV2?.targets ?? {}).filter(
      (target) => target.lifecycle === 'active' || target.lifecycle === 'armed'
    );
    expect(spawned).toHaveLength(1);
    expect(spawned[0]).toMatchObject({
      kind: 'ordinary',
      optionalRouteCells: null,
      contractId: null,
    });
    expect(state.genomeV2?.eligibleTargetCount).toBe(
      reducer.eligibleTargetCount
    );
    expect(
      projectGenomeV2NextTarget(state.genomeV2!, { cadenceEligible: true })
        .requiresOptionalRouteCells
    ).toBe(true);
  });

  /**
   * The Phase Gate boundary the audit named: a portal Recode drops the gene
   * while a gate target is already drawn on the board.
   * `genomeV2MechanicEnabled` is satisfied by the gene OR a qualifying Splice,
   * so the recode flips it false mid-run - and the engine used to preview the
   * gate anyway, move the head to the exit, and only then meet the reducer's
   * refusal, with the board already mid-mutation.
   */
  const GATE_CELLS = [
    { x: 6, z: 5 },
    { x: 9, z: 5 },
  ];
  const GATE_CHECKPOINT_AT = Date.UTC(2026, 7, 3, 8, 0, 0);

  function phaseGateCheckpoint(): SnakeCheckpointV1 {
    const game = new SnakeGameLogic({
      gridSize: 20,
      ruleset: RULESETS.CYBER,
      simulationSeed: 'phase-gate-recode',
      genome: configForState(reducerWithGene('CYBER', 'phase_gate', 4)),
    });
    game.startDriven({
      snake: [
        { x: 5, y: 0, z: 5 },
        { x: 4, y: 0, z: 5 },
        { x: 3, y: 0, z: 5 },
      ],
      direction: 'RIGHT',
      foods: [{ x: 10, y: 0, z: 5 }],
    });
    const gate = Object.values(game.getState().genomeV2?.targets ?? {}).find(
      (target) => target.kind === 'phase_gate'
    );
    expect(gate?.optionalRouteCells).toEqual(GATE_CELLS);
    return game.exportCheckpoint(GATE_CHECKPOINT_AT);
  }

  /** Recode the gene away, leaving the gate target exactly where it is. */
  function recodePhaseGateAway(checkpoint: SnakeCheckpointV1): void {
    let state = checkpoint.state.genomeV2!;
    const seen = new Set(
      Object.values(state.instances).map((instance) => instance.geneId)
    );
    const candidates = state.genePool.filter((geneId) => !seen.has(geneId));
    const replacementGeneId = candidates[0];
    state = apply(state, {
      type: 'portal_opened',
      portalId: 'gate-portal',
      genomeOffer: {
        offerId: 'gate-offer',
        candidates: [replacementGeneId, candidates[1]],
      },
    });
    const preview = previewGenomeV2Recode(state, {
      source: 'portal',
      offerId: 'gate-offer',
      replacementGeneId,
      slot: 0,
    });
    state = apply(state, {
      type: 'offer_recoded',
      source: 'portal',
      offerId: 'gate-offer',
      instanceId: 'gate-recode',
      replacementGeneId,
      slot: 0,
      growthCharged: preview.growthCharged,
    });
    expect(genomeV2MechanicEnabled(state, 'phase_gate')).toBe(false);
    expect(
      Object.values(state.targets).find(
        (target) => target.kind === 'phase_gate'
      )?.optionalRouteCells
    ).toEqual(GATE_CELLS);
    checkpoint.state.genomeV2 = state;
  }

  it('enters a previewed Phase Gate while the mechanic is held', () => {
    const game = new SnakeGameLogic();
    game.restoreCheckpoint(phaseGateCheckpoint(), GATE_CHECKPOINT_AT);
    game.tick();
    expect(game.getState().snake[0]).toMatchObject({ x: 9, z: 5 });
    expect(game.getState().genomeV2?.permanentTerrain[0]).toMatchObject({
      source: 'phase_gate_scar',
      cells: GATE_CELLS,
    });
  });

  it('ignores a gate whose mechanic a Recode removed, instead of halting mid-move', () => {
    const checkpoint = phaseGateCheckpoint();
    recodePhaseGateAway(checkpoint);
    const game = new SnakeGameLogic();
    game.restoreCheckpoint(checkpoint, GATE_CHECKPOINT_AT);

    expect(() => game.tick()).not.toThrow();
    const state = game.getState();
    // The entry cell is an ordinary cell now: no teleport, no scar, no fault.
    expect(state.snake[0]).toMatchObject({ x: 6, z: 5 });
    expect(state.genomeV2?.permanentTerrain).toEqual([]);
    expect(state.isGameOver).toBe(false);
    expect(() => game.tick()).not.toThrow();
    expect(game.getState().snake[0]).toMatchObject({ x: 7, z: 5 });
  });

  it('answers the Phase Gate question the same way in every layer', () => {
    const checkpoint = phaseGateCheckpoint();
    const held = checkpoint.state.genomeV2!;
    const gateId = Object.values(held.targets).find(
      (target) => target.kind === 'phase_gate'
    )!.targetId;
    expect(genomeV2PhaseGateAvailable(held, gateId)).toBe(true);
    expect(genomeV2PhaseGateAvailable(held, gateId, GATE_CELLS)).toBe(true);
    expect(
      genomeV2PhaseGateAvailable(held, gateId, [
        { x: 6, z: 5 },
        { x: 8, z: 5 },
      ])
    ).toBe(false);

    recodePhaseGateAway(checkpoint);
    const recoded = checkpoint.state.genomeV2!;
    expect(genomeV2PhaseGateAvailable(recoded, gateId)).toBe(false);
    // The reducer keeps refusing a forged use - the fix is that no honest
    // caller can reach it any more, not that the guard was relaxed.
    expect(() =>
      reduceGenomeV2Event(recoded, {
        type: 'phase_gate_used',
        terrainId: 'forged-scar',
        targetId: gateId,
        cells: GATE_CELLS as [GenomeV2Cell, GenomeV2Cell],
        index: recoded.eventIndex + 1,
        tick: recoded.tick + 1,
        eventId: genomeV2EventId(recoded.runSeed, recoded.eventIndex + 1),
      })
    ).toThrow('Genome v2 Phase Gate use is invalid.');
  });

  it('keeps playing after a deferred contract instead of faulting the run', () => {
    const reducer = reducerWithGene('CYBER', 'circuit_run', 3);
    const game = new SnakeGameLogic({
      gridSize: 5,
      ruleset: RULESETS.CYBER,
      simulationSeed: 'circuit-crowded-continues',
      genome: configForState(reducer),
    });
    game.startDriven(CROWDED_OPENING);
    // The single legal step is onto the food, and it must resolve normally.
    expect(game.setDirection('RIGHT')).toBe('accepted');
    expect(() => game.tick()).not.toThrow();
    expect(game.getState()).toMatchObject({
      foodEaten: 1,
      isGameOver: false,
    });
  });
});
