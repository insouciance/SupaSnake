import {
  createGenomeV2State,
  type GenomeV2State,
  type GenomeV2TargetState,
} from '@/shared/game/genomeV2';
import {
  buildGenomeV2RuntimeSignals,
  latestGenomeV2BoardFeedback,
  projectGenomeV2Board,
} from './genomeV2BoardPresentation';

function target(
  targetId: string,
  overrides: Partial<GenomeV2TargetState> = {}
): GenomeV2TargetState {
  return {
    targetId,
    eligibleOrdinal: 1,
    contractId: `contract:${targetId}`,
    kind: 'live_wire',
    lifecycle: 'active',
    cell: { x: 2, z: 3 },
    secondaryCell: null,
    optionalRouteCells: null,
    spawnTick: 20,
    speedAtSpawnMs: 160,
    shortestSafeMoves: 3,
    sealedAreaCells: 0,
    moveBudget: 8,
    expiresAtTick: 28,
    circuitLegsRequired: 0,
    relayBonusBps: 0,
    territoryMultiplierBps: 10_000,
    forkChoice: null,
    crownRole: null,
    edible: true,
    collidable: true,
    resolvedBaseYield: 0,
    ...overrides,
  };
}

function stateWithTargets(
  targets: GenomeV2TargetState[]
): GenomeV2State {
  const state = createGenomeV2State('PRIMAL');
  state.targets = Object.fromEntries(targets.map((entry) => [entry.targetId, entry]));
  return state;
}

describe('Genome v2 board projection', () => {
  it('renders only live transformed targets and marks future Crown stars as non-edible ghosts', () => {
    const state = stateWithTargets([
      target('live'),
      target('ordinary', { kind: 'ordinary' }),
      target('completed', { lifecycle: 'completed' }),
      target('burnt', { lifecycle: 'burnt' }),
      target('expired', { lifecycle: 'expired' }),
      target('future', {
        kind: 'ordinary',
        crownRole: 'future',
        cell: { x: 8, z: 9 },
        edible: false,
        collidable: false,
        moveBudget: null,
        expiresAtTick: null,
      }),
    ]);

    const projection = projectGenomeV2Board(state, [{ x: 2, z: 3 }], 23);

    expect(projection.targets.map((entry) => entry.targetId)).toEqual(['live', 'future']);
    expect(projection.targets[0]).toMatchObject({
      kind: 'live_wire',
      remainingMoves: 5,
      budgetFraction: 5 / 8,
      budgetExpired: false,
    });
    expect(projection.targets[1]).toMatchObject({
      kind: 'crown_future',
      edible: false,
      collidable: false,
      statusLabel: 'GHOST · NOT EDIBLE',
    });
  });

  it('tracks the physical Circuit leg and exposes an expired route budget without hiding the target', () => {
    const state = stateWithTargets([
      target('circuit', {
        kind: 'circuit_run',
        cell: { x: 4, z: 5 },
        secondaryCell: { x: 10, z: 11 },
        circuitLegsRequired: 2,
        moveBudget: 6,
        expiresAtTick: 26,
      }),
    ]);

    const projection = projectGenomeV2Board(state, [{ x: 10, z: 11 }], 27);

    expect(projection.targets[0]).toMatchObject({
      cell: { x: 10, z: 11 },
      leg: 2,
      remainingMoves: 0,
      budgetExpired: true,
    });
  });

  it('projects Gilded Fork as two explicit edible branches with one shared target identity', () => {
    const state = stateWithTargets([
      target('fork', {
        kind: 'gold_trail',
        cell: { x: 4, z: 5 },
        forkCell: { x: 10, z: 11 },
        moveBudget: null,
        expiresAtTick: null,
      }),
    ]);
    state.activeSplices = ['splice_gilded_fork'];

    const projection = projectGenomeV2Board(
      state,
      [{ x: 4, z: 5 }, { x: 10, z: 11 }],
      23
    );

    expect(projection.targets).toHaveLength(2);
    expect(projection.targets).toEqual([
      expect.objectContaining({
        targetId: 'fork',
        branchChoice: 'ordinary',
        cell: { x: 4, z: 5 },
        edible: true,
        collidable: true,
        rewardLabel: 'SAFE · ×1 YIELD',
      }),
      expect.objectContaining({
        targetId: 'fork',
        branchChoice: 'gilded',
        cell: { x: 10, z: 11 },
        edible: true,
        collidable: true,
        rewardLabel: 'GREED · ×4 YIELD · +2 BODY',
      }),
    ]);
  });

  it('projects every unique lethal reducer cell exactly once and gives Scar overlap precedence', () => {
    const state = stateWithTargets([]);
    state.permanentTerrain = [
      {
        terrainId: 'seal:1',
        source: 'coilkeeper_seal',
        cells: [{ x: 1, z: 1 }, { x: 2, z: 2 }, { x: 2, z: 2 }],
        createdAtFood: 8,
        permanent: true,
      },
      {
        terrainId: 'scar:1',
        source: 'phase_gate_scar',
        cells: [{ x: 2, z: 2 }, { x: 3, z: 3 }],
        createdAtFood: 12,
        permanent: true,
      },
    ];

    const projection = projectGenomeV2Board(state, [], 0);
    const renderedKeys = projection.permanentTerrain.map((cell) => `${cell.x}:${cell.z}`);
    const occupiedKeys = projection.occupiedCells.map((cell) => `${cell.x}:${cell.z}`);
    const reducerLethalKeys = new Set(
      state.permanentTerrain.flatMap((fact) =>
        fact.cells.map((cell) => `${cell.x}:${cell.z}`)
      )
    );

    expect(renderedKeys).toHaveLength(3);
    expect(new Set(renderedKeys).size).toBe(3);
    expect(new Set(renderedKeys)).toEqual(reducerLethalKeys);
    expect(new Set(occupiedKeys)).toEqual(new Set(renderedKeys));
    expect(projection.permanentTerrain.find((cell) => cell.x === 2 && cell.z === 2))
      .toMatchObject({ source: 'phase_gate_scar', terrainId: 'scar:1' });
  });

  it('removes a used Phase Gate from the live gate inventory once its cells become solid', () => {
    const route = [{ x: 5, z: 5 }, { x: 9, z: 9 }] as const;
    const state = stateWithTargets([
      target('gate', { kind: 'phase_gate', optionalRouteCells: route }),
    ]);
    expect(projectGenomeV2Board(state, [{ x: 2, z: 3 }], 20).gates).toHaveLength(1);

    state.permanentTerrain = [{
      terrainId: 'scar:gate',
      source: 'phase_gate_scar',
      cells: route,
      createdAtFood: 10,
      permanent: true,
    }];
    expect(projectGenomeV2Board(state, [{ x: 2, z: 3 }], 20).gates).toHaveLength(0);
  });

  it('turns armed reducer facts into concise, bounded cockpit signals', () => {
    const state = stateWithTargets([target('live')]);
    state.mirrorLeg = { portalId: 'portal:1', frozenCarryBps: 10_000 };
    state.ledger.mirrorStake = 25_000;
    state.loan = {
      portalId: 'portal:2',
      foodsRemaining: 4,
      escrowYield: 35_000,
      startedAtFood: 9,
    };

    const signals = buildGenomeV2RuntimeSignals(
      state,
      projectGenomeV2Board(state, [{ x: 2, z: 3 }], 21)
    );

    expect(signals).toHaveLength(3);
    expect(signals.map((signal) => signal.id)).toEqual(['target', 'mirror', 'loan']);
    // Yield is an AMOUNT: the rail rounds to whole units and never shows a
    // fractional tail, however the scaled ledger stores it (25_000 → 3Y).
    expect(signals[1].label).toContain('STAKE 3Y');
    expect(signals[2].label).toContain('ESCROW 4Y');
    expect(signals.some((signal) => /\d\.\d/.test(signal.label))).toBe(false);
    expect(signals[2].label).toContain('4 LEFT');
  });

  it('acknowledges a canonical trigger without re-announcing the seen event', () => {
    const state = stateWithTargets([]);
    state.bonds = 1;
    state.journal.push({
      index: 1,
      tick: 20,
      eventId: 'event:bond',
      type: 'offer_declined',
      offerId: 'offer:1',
    });

    expect(latestGenomeV2BoardFeedback(state, null)).toMatchObject({
      eventId: 'event:bond',
      label: expect.stringContaining('BANK BONUS ARMED'),
      tone: 'success',
    });
    expect(latestGenomeV2BoardFeedback(state, 'event:bond')).toBeNull();
  });
});
