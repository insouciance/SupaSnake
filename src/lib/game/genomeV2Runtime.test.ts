import { describe, expect, it } from '@jest/globals';
import {
  GENOME_V2_INTERACTION_AUTO_OFFER,
  GENOME_V2_INTERACTION_PHYSICAL_RELIC,
  GENOME_V2_CONFIG,
  createGenomeV2State,
  deriveGenomeV2Ftue,
  genomeV2EventId,
  genomeV2Yield,
  reduceGenomeV2Event,
  type GenomeV2Event,
  type GenomeV2State,
} from '@/shared/game/genomeV2';
import {
  genomeV2ActivePool,
  type GenomeV2ActiveGeneId,
} from '@/shared/game/genes';
import type { DynastyName } from '@/shared/game/rulesets';
import {
  GenomeV2Runtime,
  enclosedGenomeV2Cells,
  genomeV2CircuitRoute,
  genomeV2PhaseRoute,
  shortestGenomeV2Route,
} from './genomeV2Runtime';

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

function stateWithGenes(
  dynasty: DynastyName,
  geneIds: readonly GenomeV2ActiveGeneId[]
): GenomeV2State {
  const pool = genomeV2ActivePool(dynasty);
  let state = createGenomeV2State(dynasty, {
    runSeed: `runtime-${dynasty.toLowerCase()}-seed`,
    genePool: pool,
    ftue: deriveGenomeV2Ftue(10, 3),
  });
  const alternatives = pool.filter((candidate) => !geneIds.includes(candidate));
  for (let index = 0; index < geneIds.length; index += 1) {
    const geneId = geneIds[index];
    const alternative = alternatives[index];
    if (!alternative) throw new Error('Fixture pool has no alternative gene.');
    state = apply(state, {
      type: 'offer_opened',
      offerId: `fixture-offer-${geneId}`,
      source: 'cadence',
      candidates: [geneId, alternative],
    });
    state = apply(state, {
      type: 'gene_acquired',
      offerId: `fixture-offer-${geneId}`,
      instanceId: `fixture-instance-${geneId}`,
      geneId,
      slot: index as 0 | 1 | 2 | 3 | 4 | 5,
      source: 'offer',
    });
  }
  return state;
}

function stateWithGene(
  dynasty: DynastyName,
  geneId: GenomeV2ActiveGeneId
): GenomeV2State {
  return stateWithGenes(dynasty, [geneId]);
}

function runtimeFromState(
  state: GenomeV2State,
  interactionVersion = GENOME_V2_INTERACTION_AUTO_OFFER
): GenomeV2Runtime {
  return new GenomeV2Runtime({
    runSeed: state.runSeed,
    dynasty: state.dynasty,
    reducerState: state,
    interactionVersion,
  });
}

function collectOrdinary(runtime: GenomeV2Runtime, ordinal: number): void {
  const spawned = runtime.spawnTarget(ordinal, {
    cell: { x: ordinal + 1, z: 2 },
    speedAtSpawnMs: 160,
    shortestSafeMoves: 2,
    cadenceEligible: true,
  });
  expect(spawned.projection.kind).toBe('ordinary');
  expect(
    runtime.resolveTarget(spawned.targetId, ordinal + 1, {
      resolution: 'collected',
      movesUsed: 2,
      baseYield: genomeV2Yield(1),
      pressureBps: 0,
    })
  ).not.toBeNull();
}

describe('GenomeV2Runtime geometry', () => {
  it('finds deterministic safe routes, Circuit relays, and close Phase pairs', () => {
    expect(
      shortestGenomeV2Route(
        8,
        { x: 1, z: 1 },
        { x: 5, z: 1 },
        [{ x: 3, z: 1 }],
        false
      )
    ).toEqual([
      { x: 1, z: 1 },
      { x: 2, z: 1 },
      { x: 2, z: 2 },
      { x: 3, z: 2 },
      { x: 4, z: 2 },
      { x: 5, z: 2 },
      { x: 5, z: 1 },
    ]);

    const circuit = genomeV2CircuitRoute(
      8,
      { x: 1, z: 1 },
      { x: 5, z: 1 },
      [],
      false
    );
    expect(circuit?.relay).not.toEqual({ x: 1, z: 1 });
    expect(circuit?.relay).not.toEqual({ x: 5, z: 1 });

    const phase = genomeV2PhaseRoute(
      8,
      { x: 1, z: 1 },
      { x: 2, z: 1 },
      [],
      false
    );
    expect(phase).not.toBeNull();
    expect(new Set(phase?.map((cell) => `${cell.x}:${cell.z}`)).size).toBe(2);
  });

  it('does not seal a component containing a protected objective', () => {
    const ring = [
      { x: 1, z: 1 },
      { x: 1, z: 2 },
      { x: 1, z: 3 },
      { x: 2, z: 1 },
      { x: 2, z: 3 },
      { x: 3, z: 1 },
      { x: 3, z: 2 },
      { x: 3, z: 3 },
    ];
    expect(enclosedGenomeV2Cells(5, ring, [], false)).toEqual([{ x: 2, z: 2 }]);
    expect(enclosedGenomeV2Cells(5, ring, [{ x: 2, z: 2 }], false)).toEqual([]);
  });
});

describe('GenomeV2Runtime deterministic decisions', () => {
  it('binds reducer starting points to the immutable run stamp', () => {
    const runSeed = 'runtime-starting-points';
    const reducerState = createGenomeV2State('PRIMAL', {
      runSeed,
      genePool: genomeV2ActivePool('PRIMAL'),
      ftue: deriveGenomeV2Ftue(10, 3),
      startingStrainPoints: { FERAL: 1 },
    });

    expect(
      () =>
        new GenomeV2Runtime({
          runSeed,
          dynasty: 'PRIMAL',
          reducerState,
          startingStrainPoints: { FERAL: 2 },
        })
    ).toThrow('starting points differ');
  });

  it('shares one offer stream and restores exact cursor state', () => {
    const options = {
      runSeed: 'runtime-offer-seed',
      dynasty: 'PRIMAL' as const,
      pool: genomeV2ActivePool('PRIMAL'),
      ftue: deriveGenomeV2Ftue(10, 3),
    };
    const first = new GenomeV2Runtime(options);
    const second = new GenomeV2Runtime(options);
    expect(first.openCadenceOffer(1, 3)).toBeNull();
    const offer = first.openCadenceOffer(1, 4);
    expect(offer).toEqual(second.openCadenceOffer(1, 4));
    expect(offer).not.toBeNull();
    expect(first.declineOffer(1)).toBe(true);

    const portalId = first.openPortal(2);
    const beforeInspect = first.getState();
    expect(first.inspectPortalCandidate(0)).not.toBeNull();
    expect(first.getState()).toEqual(beforeInspect);
    expect(first.continuePortal(2, false)).toBe(true);
    expect(first.getState().portal).toBeNull();

    const snapshot = first.snapshot();
    const restored = new GenomeV2Runtime({
      ...options,
      reducerState: first.getState(),
      snapshot,
    });
    expect(restored.snapshot()).toEqual(snapshot);
    expect(restored.getState()).toEqual(first.getState());
    expect(portalId).toContain('portal:');
  });

  it('runs physical relic opportunities on a deterministic 4-8 food clock', () => {
    const options = {
      runSeed: 'runtime-physical-relic-seed',
      dynasty: 'PRIMAL' as const,
      pool: genomeV2ActivePool('PRIMAL'),
      ftue: deriveGenomeV2Ftue(10, 3),
      interactionVersion: GENOME_V2_INTERACTION_PHYSICAL_RELIC,
    };
    const runtime = new GenomeV2Runtime(options);
    const firstAt = runtime.nextCadenceOpportunityAtFood();
    expect(firstAt).toBeGreaterThanOrEqual(4);
    expect(firstAt).toBeLessThanOrEqual(8);
    expect(runtime.openCadenceOffer(1, firstAt - 1)).toBeNull();

    // The relic may remain visible while ordinary food is collected. The
    // next 6 +/- 2 interval begins only when that relic is deliberately
    // collected, matching the historical physical-relic cadence.
    const collectedAt = firstAt + 3;
    const offer = runtime.openCadenceOffer(2, collectedAt);
    expect(offer).not.toBeNull();
    expect(runtime.getState().offerCount).toBe(1);
    expect(runtime.declineOffer(3)).toBe(true);
    const secondAt = runtime.nextCadenceOpportunityAtFood();
    expect(secondAt - collectedAt).toBeGreaterThanOrEqual(4);
    expect(secondAt - collectedAt).toBeLessThanOrEqual(8);
  });

  it('expires an ignored relic without rolling, revealing, or declining an offer', () => {
    const runtime = new GenomeV2Runtime({
      runSeed: 'runtime-ignored-relic-seed',
      dynasty: 'PRIMAL',
      pool: genomeV2ActivePool('PRIMAL'),
      ftue: deriveGenomeV2Ftue(10, 3),
      interactionVersion: GENOME_V2_INTERACTION_PHYSICAL_RELIC,
    });
    const firstAt = runtime.nextCadenceOpportunityAtFood();
    const before = runtime.getState();

    const expiredAt = firstAt + 2;
    expect(runtime.expireCadenceRelic(expiredAt)).toBe(true);
    expect(runtime.getState()).toEqual(before);
    expect(runtime.getState().offerCount).toBe(0);
    expect(runtime.getState().bonds).toBe(0);
    const nextAt = runtime.nextCadenceOpportunityAtFood();
    expect(nextAt - expiredAt).toBeGreaterThanOrEqual(4);
    expect(nextAt - expiredAt).toBeLessThanOrEqual(8);
  });

  it('doubles every physical relic interval for Patient', () => {
    const runtime = new GenomeV2Runtime({
      runSeed: 'runtime-patient-relic-seed',
      dynasty: 'PRIMAL',
      pool: genomeV2ActivePool('PRIMAL'),
      ftue: deriveGenomeV2Ftue(10, 3),
      interactionVersion: GENOME_V2_INTERACTION_PHYSICAL_RELIC,
      cadenceMultiplier: 2,
    });
    expect(runtime.nextCadenceOpportunityAtFood()).toBeGreaterThanOrEqual(8);
    expect(runtime.nextCadenceOpportunityAtFood()).toBeLessThanOrEqual(16);
  });

  it('expires a physical portal without consuming an offer roll', () => {
    const runtime = new GenomeV2Runtime({
      runSeed: 'runtime-expired-portal',
      dynasty: 'PRIMAL',
      pool: genomeV2ActivePool('PRIMAL'),
      ftue: deriveGenomeV2Ftue(10, 3),
    });
    runtime.openPortal(1, { includeGenomeOffer: false });
    expect(runtime.getState().offerCount).toBe(0);
    expect(runtime.expirePortal(2)).toBe(true);
    expect(runtime.getState()).toMatchObject({
      carryPasses: 1,
      offerCount: 0,
      portal: null,
    });
  });

  it('rejects a snapshot that omits cursor state for an active target', () => {
    const runtime = new GenomeV2Runtime({
      runSeed: 'runtime-missing-target-progress',
      dynasty: 'PRIMAL',
      pool: genomeV2ActivePool('PRIMAL'),
      ftue: deriveGenomeV2Ftue(10, 3),
    });
    runtime.spawnTarget(1, {
      cell: { x: 4, z: 4 },
      speedAtSpawnMs: 180,
      shortestSafeMoves: 3,
    });
    const snapshot = runtime.snapshot();

    expect(
      () =>
        new GenomeV2Runtime({
          runSeed: 'runtime-missing-target-progress',
          dynasty: 'PRIMAL',
          reducerState: runtime.getState(),
          snapshot: { ...snapshot, targetProgress: [] },
        })
    ).toThrow('does not match its active targets');
  });
});

describe('GenomeV2Runtime target and signature bridges', () => {
  it('uses canonical retained-mechanic truth after a Splice', () => {
    const runtime = runtimeFromState(
      stateWithGenes('PRIMAL', ['gold_trail', 'compound_interest'])
    );

    expect(runtime.getState().activeSplices).toContain('splice_dragon_hoard');
    expect(runtime.hasMechanic('gold_trail')).toBe(true);
    expect(runtime.hasMechanic('compound_interest')).toBe(false);
  });

  it('binds both Gilded Fork cells to one target and restores them from a checkpoint snapshot', () => {
    const reducer = stateWithGenes('PRIMAL', ['gold_trail', 'overgrowth']);
    const legacy = runtimeFromState(reducer);
    const runtime = runtimeFromState(
      reducer,
      GENOME_V2_INTERACTION_PHYSICAL_RELIC
    );
    for (let ordinal = 1; ordinal <= 4; ordinal += 1) {
      collectOrdinary(legacy, ordinal);
      collectOrdinary(runtime, ordinal);
    }
    expect(legacy.projectNextTarget(true)).toMatchObject({
      kind: 'gold_trail',
      requiresForkCell: false,
    });
    const legacySpawned = legacy.spawnTarget(9, {
      cell: { x: 5, z: 5 },
      speedAtSpawnMs: 160,
      shortestSafeMoves: 5,
    });
    expect(legacySpawned.target).toMatchObject({
      kind: 'gold_trail',
      forkCell: null,
      forkChoice: null,
    });
    expect(legacy.targetChoiceAt({ x: 5, z: 5 })).toMatchObject({
      target: { targetId: legacySpawned.targetId },
      choice: null,
    });
    expect(
      legacy.chooseGildedFork(
        legacySpawned.targetId,
        'ordinary',
        10
      )
    ).toBe(true);
    expect(
      legacy.resolveTarget(legacySpawned.targetId, 10, {
        resolution: 'collected',
        movesUsed: 5,
        baseYield: genomeV2Yield(1),
        pressureBps: 0,
      })
    ).toMatchObject({ lifecycle: 'completed' });
    expect(runtime.projectNextTarget(true)).toMatchObject({
      kind: 'gold_trail',
      requiresForkCell: true,
    });
    expect(() => runtime.spawnTarget(9, {
      cell: { x: 5, z: 5 },
      speedAtSpawnMs: 160,
      shortestSafeMoves: 5,
    })).toThrow('requires two distinct visible cells');
    const spawned = runtime.spawnTarget(9, {
      cell: { x: 5, z: 5 },
      forkCell: { x: 9, z: 9 },
      speedAtSpawnMs: 160,
      shortestSafeMoves: 5,
    });

    expect(runtime.targetChoiceAt({ x: 5, z: 5 })).toMatchObject({
      target: { targetId: spawned.targetId },
      choice: 'ordinary',
    });
    expect(runtime.targetChoiceAt({ x: 9, z: 9 })).toMatchObject({
      target: { targetId: spawned.targetId },
      choice: 'gilded',
    });

    const restored = new GenomeV2Runtime({
      runSeed: runtime.getState().runSeed,
      dynasty: 'PRIMAL',
      reducerState: runtime.getState(),
      snapshot: runtime.snapshot(),
      interactionVersion: GENOME_V2_INTERACTION_PHYSICAL_RELIC,
    });
    expect(restored.targetChoiceAt({ x: 9, z: 9 })).toMatchObject({
      target: { targetId: spawned.targetId },
      choice: 'gilded',
    });
  });

  it('spends the single Wall Rush charge before allowing another redirect', () => {
    const runtime = runtimeFromState(stateWithGene('PRIMAL', 'wall_rush'));

    expect(runtime.canWallRedirect()).toBe(true);
    expect(runtime.recordWallRedirect(1)).toBe(true);
    expect(runtime.getState().wallRushCharges).toBe(0);
    expect(runtime.canWallRedirect()).toBe(false);
    expect(runtime.recordWallRedirect(2)).toBe(false);
  });

  it('relocates Circuit leg one and resolves the pair once', () => {
    const runtime = runtimeFromState(stateWithGene('CYBER', 'circuit_run'));
    for (let ordinal = 1; ordinal <= 3; ordinal += 1) {
      collectOrdinary(runtime, ordinal);
    }
    expect(runtime.projectNextTarget(true)).toMatchObject({
      kind: 'circuit_run',
      requiresSecondaryCell: true,
    });
    const spawned = runtime.spawnTarget(8, {
      cell: { x: 5, z: 5 },
      secondaryCell: { x: 7, z: 5 },
      speedAtSpawnMs: 140,
      shortestSafeMoves: 4,
    });
    expect(runtime.advanceCircuitLegAt({ x: 5, z: 5 })).toEqual({
      targetId: spawned.targetId,
      destination: { x: 7, z: 5 },
    });
    expect(runtime.targetAt({ x: 5, z: 5 })).toBeNull();
    expect(runtime.targetAt({ x: 7, z: 5 })?.targetId).toBe(spawned.targetId);
    expect(
      runtime.resolveTarget(spawned.targetId, 10, {
        resolution: 'collected',
        movesUsed: 4,
        baseYield: genomeV2Yield(1),
        pressureBps: 0,
      })
    ).toMatchObject({ lifecycle: 'completed' });
    expect(runtime.getState().foodCount).toBe(4);
  });

  it('credits one collected unit but no Yield when Circuit expires after leg one', () => {
    const runtime = runtimeFromState(stateWithGene('CYBER', 'circuit_run'));
    for (let ordinal = 1; ordinal <= 3; ordinal += 1) {
      collectOrdinary(runtime, ordinal);
    }
    const spawned = runtime.spawnTarget(8, {
      cell: { x: 5, z: 5 },
      secondaryCell: { x: 7, z: 5 },
      speedAtSpawnMs: 140,
      shortestSafeMoves: 4,
    });
    expect(runtime.advanceCircuitLegAt({ x: 5, z: 5 })).not.toBeNull();
    expect(
      runtime.collectedUnitsForTargetResolution(spawned.targetId, 'expired')
    ).toBe(1);
    expect(
      runtime.resolveTarget(spawned.targetId, 10, {
        resolution: 'expired',
        movesUsed: 4,
        baseYield: 0,
        pressureBps: 0,
      })
    ).toMatchObject({
      lifecycle: 'expired',
      collectedUnits: 1,
    });
    expect(runtime.getState()).toMatchObject({
      foodCount: 4,
      ledger: { bankableYield: genomeV2Yield(3) },
    });
  });

  it('commits only the exact previewed Phase route and permanent Scars', () => {
    const runtime = runtimeFromState(stateWithGene('COSMIC', 'phase_gate'));
    for (let ordinal = 1; ordinal <= 4; ordinal += 1) {
      collectOrdinary(runtime, ordinal);
    }
    expect(runtime.projectNextTarget(true).kind).toBe('phase_gate');
    const spawned = runtime.spawnTarget(10, {
      cell: { x: 9, z: 9 },
      optionalRouteCells: [
        { x: 3, z: 3 },
        { x: 8, z: 9 },
      ],
      speedAtSpawnMs: 170,
      shortestSafeMoves: 8,
    });
    expect(runtime.phaseGateAtEntry({ x: 3, z: 3 })).toEqual({
      targetId: spawned.targetId,
      cells: [
        { x: 3, z: 3 },
        { x: 8, z: 9 },
      ],
    });
    expect(runtime.usePhaseGate(spawned.targetId, 11)).toBe(true);
    expect(runtime.usePhaseGate(spawned.targetId, 11)).toBe(false);
    expect(runtime.getState().permanentTerrain).toHaveLength(1);
  });

  it('uses canonical Phoenix and voluntary REDLINE effects once', () => {
    const phoenix = runtimeFromState(stateWithGene('PRIMAL', 'phoenix'));
    expect(phoenix.recordPhoenix(5)).toMatchObject({
      bodyGrowthDelta: GENOME_V2_CONFIG.phoenix.growthCost,
      effect: {
        rewindSegments: GENOME_V2_CONFIG.phoenix.rewindSegments,
        phaseTicks: GENOME_V2_CONFIG.phoenix.phaseTicks,
      },
    });
    expect(phoenix.recordPhoenix(6)).toBeNull();

    const redline = runtimeFromState(stateWithGene('CYBER', 'zenith_protocol'));
    const activationId = redline.startOverclock(7, 'zenith_protocol');
    expect(activationId).not.toBeNull();
    const overclock = redline.getState().overclock;
    expect(overclock?.speedMultiplierBps).toBeGreaterThan(10_000);
    expect(redline.endExpiredOverclock(overclock!.expiresAtTick - 1)).toBe(
      false
    );
    expect(redline.endExpiredOverclock(overclock!.expiresAtTick)).toBe(true);
  });

  it('turns a charged Coil seal and recovered Heartwood loop into target facts', () => {
    const coil = runtimeFromState(stateWithGene('PRIMAL', 'coilkeeper'));
    for (let ordinal = 1; ordinal <= 8; ordinal += 1) {
      collectOrdinary(coil, ordinal);
    }
    const cells = [
      { x: 2, z: 2 },
      { x: 2, z: 3 },
      { x: 3, z: 2 },
      { x: 3, z: 3 },
    ];
    expect(coil.recordCoilSeal(10, cells)).not.toBeNull();
    expect(coil.getState().permanentTerrain.at(-1)).toMatchObject({
      source: 'coilkeeper_seal',
      cells,
    });
    expect(coil.projectNextTarget(true).kind).toBe('coilkeeper');

    const heartwood = runtimeFromState(stateWithGene('PRIMAL', 'heartwood'));
    expect(
      heartwood.recordTerritory(1, {
        cells,
        recoveryExitCount: 2,
        source: 'heartwood',
      })
    ).not.toBeNull();
    const target = heartwood.spawnTarget(2, {
      cell: cells[0],
      speedAtSpawnMs: 160,
      shortestSafeMoves: 2,
    });
    expect(target.target.territoryMultiplierBps).toBeGreaterThan(10_000);
  });

  it('freezes a Crown preview, closes a perfect wave, and returns its cell', () => {
    const runtime = runtimeFromState(
      stateWithGene('COSMIC', 'constellation_crown')
    );
    const first = runtime.spawnTarget(1, {
      cell: { x: 2, z: 2 },
      speedAtSpawnMs: 180,
      shortestSafeMoves: 2,
      crownRole: 'current',
    });
    const second = runtime.spawnTarget(1, {
      cell: { x: 5, z: 5 },
      speedAtSpawnMs: 180,
      shortestSafeMoves: 3,
      crownRole: 'current',
    });
    const future = runtime.spawnTarget(1, {
      cell: { x: 8, z: 8 },
      speedAtSpawnMs: 180,
      shortestSafeMoves: 4,
      cadenceEligible: false,
      crownRole: 'future',
    });
    expect(
      runtime.openCrownWave(
        1,
        [first.targetId, second.targetId],
        future.targetId
      )
    ).not.toBeNull();
    for (const target of [first, second]) {
      runtime.resolveTarget(target.targetId, 2, {
        resolution: 'collected',
        movesUsed: 2,
        baseYield: genomeV2Yield(1),
        pressureBps: 0,
      });
    }
    expect(runtime.advanceCrownWave(2)).toMatchObject({
      outcome: 'perfect',
      crownTargetId: null,
      crownCell: { x: 8, z: 8 },
    });
    expect(runtime.getState().crownWave).toBeNull();
    expect(runtime.getState().targets[future.targetId]).toMatchObject({
      lifecycle: 'expired',
      edible: false,
      collidable: false,
    });
  });

  it('keeps long-run reducer persistence below the shared cap', () => {
    const runtime = new GenomeV2Runtime({
      runSeed: 'runtime-persistence-seed',
      dynasty: 'PRIMAL',
      reducerState: createGenomeV2State('PRIMAL', {
        runSeed: 'runtime-persistence-seed',
        genePool: genomeV2ActivePool('PRIMAL'),
      }),
    });
    for (let ordinal = 1; ordinal <= 360; ordinal += 1) {
      const spawned = runtime.spawnTarget(ordinal, {
        cell: { x: ordinal % 20, z: Math.floor(ordinal / 20) % 20 },
        speedAtSpawnMs: 160,
        shortestSafeMoves: 2,
      });
      runtime.resolveTarget(spawned.targetId, ordinal, {
        resolution: 'collected',
        movesUsed: 2,
        baseYield: genomeV2Yield(1),
        pressureBps: 1_000,
      });
    }
    const state = runtime.getState();
    expect(state.journal.length).toBeLessThanOrEqual(
      GENOME_V2_CONFIG.persistence.retainedJournalEvents
    );
    expect(
      new TextEncoder().encode(JSON.stringify(state)).byteLength
    ).toBeLessThanOrEqual(GENOME_V2_CONFIG.persistence.maximumSerializedBytes);
  });
});
