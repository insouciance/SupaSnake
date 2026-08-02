import { describe, expect, it } from '@jest/globals';
import {
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
    const foodTamper = structuredClone(checkpoint);
    foodTamper.state.foodEaten += 1;
    expect(() => new SnakeGameLogic().restoreCheckpoint(foodTamper)).toThrow(
      'food count differs'
    );

    const yieldTamper = structuredClone(checkpoint);
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
