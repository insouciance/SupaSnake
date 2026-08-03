import { describe, expect, it } from '@jest/globals';
import {
  GENOME_V2_INTERACTION_PHYSICAL_RELIC,
  GENOME_RULES_V2,
  createGenomeV2State,
  deriveGenomeV2Ftue,
  deriveGenomeV2FtuePresentation,
  genomeV2EventId,
  reduceGenomeV2Event,
  type GenomeV2Event,
  type GenomeV2State,
} from '@/shared/game/genomeV2';
import {
  genomeV2ActivePool,
  type GenomeV2ActiveGeneId,
} from '@/shared/game/genes';
import { RULESETS, type DynastyName } from '@/shared/game/rulesets';
import {
  SnakeGameLogic,
  type GameOverData,
  type GenomeEngineConfig,
} from './SnakeGameLogic';

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
  const alternative = pool.find((candidate) => candidate !== geneId);
  if (!alternative) throw new Error('Fixture pool has no alternative gene.');
  let state = createGenomeV2State(dynasty, {
    runSeed: `engine-${dynasty.toLowerCase()}-${geneId}`,
    genePool: pool,
    ftue: deriveGenomeV2Ftue(10, 3),
  });
  state = apply(state, {
    type: 'offer_opened',
    offerId: `engine-offer-${geneId}`,
    source: 'cadence',
    candidates: [geneId, alternative],
  });
  state = apply(state, {
    type: 'gene_acquired',
    offerId: `engine-offer-${geneId}`,
    instanceId: `engine-instance-${geneId}`,
    geneId,
    slot: 0,
    source: 'offer',
  });
  for (let ordinal = 1; ordinal <= primeEligibleTargets; ordinal += 1) {
    const targetId = `primed-target-${ordinal}`;
    state = apply(state, {
      type: 'target_spawned',
      targetId,
      cell: { x: ordinal, z: 1 },
      speedAtSpawnMs: 160,
      shortestSafeMoves: 2,
      cadenceEligible: true,
    });
    state = apply(state, {
      type: 'target_resolved',
      targetId,
      resolution: 'expired',
      movesUsed: 2,
      baseYield: 0,
      pressureBps: 0,
      collectedUnits: 0,
    });
  }
  return state;
}

function configForState(state: GenomeV2State): GenomeEngineConfig {
  return {
    rulesVersion: GENOME_RULES_V2,
    runSeed: state.runSeed,
    reducerState: state,
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

describe('SnakeGameLogic Genome v2 authority boundary', () => {
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
    expect(dueAt).toBeGreaterThanOrEqual(4);
    expect(dueAt).toBeLessThanOrEqual(8);
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
    expect(patient.getState().nextMutationAtFood).toBeGreaterThanOrEqual(8);
    expect(patient.getState().nextMutationAtFood).toBeLessThanOrEqual(16);

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
    game.tick();
    expect(game.getState().foodEaten).toBe(1);
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
