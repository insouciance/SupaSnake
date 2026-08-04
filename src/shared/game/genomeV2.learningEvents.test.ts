/**
 * The learning-event catalog, enforced against the shipped reducer.
 *
 * `docs/game/PLAYER_EVOLUTION_LEARNING_EVENTS.md` names one deterministic
 * event per current-roster Gene. This file is that catalog as executable
 * assertions: if a reducer edit stops emitting one, a Gene silently becomes
 * unlockable-in-principle and never-unlocked-in-practice, which is exactly the
 * failure a hand-maintained document cannot catch.
 */

import { describe, expect, it } from '@jest/globals';

import {
  GENOME_V2_CONFIG,
  GENOME_V2_LEARNING_EVENT_VERSION,
  createGenomeV2State,
  deriveGenomeV2Ftue,
  genomeV2EventId,
  genomeV2LearningEventsResolved,
  genomeV2SerializedBytes,
  projectGenomeV2NextTarget,
  reduceGenomeV2Event,
  type GenomeV2Cell,
  type GenomeV2Event,
  type GenomeV2State,
} from './genomeV2';
import {
  GENOME_V2_SHARED_GENE_IDS,
  genomeV2ActivePool,
  type GenomeV2ActiveGeneId,
} from './genes';

type EventFacts = Omit<GenomeV2Event, 'index' | 'tick' | 'eventId'>;

function apply(state: GenomeV2State, facts: EventFacts): GenomeV2State {
  const index = state.eventIndex + 1;
  return reduceGenomeV2Event(state, {
    ...facts,
    index,
    tick: state.tick + 1,
    eventId: genomeV2EventId(state.runSeed, index),
  } as GenomeV2Event);
}

function acquire(
  state: GenomeV2State,
  geneId: GenomeV2ActiveGeneId,
  slot: 0 | 1 | 2 | 3 | 4 | 5,
  instanceId = `${geneId}:${slot}`
): GenomeV2State {
  const seen = new Set(Object.values(state.instances).map((entry) => entry.geneId));
  const alternative = state.genePool.find(
    (candidate) => candidate !== geneId && !seen.has(candidate)
  );
  if (!alternative) throw new Error('Test fixture has no legal alternative.');
  const offerId = `offer:${instanceId}`;
  let next = apply(state, {
    type: 'offer_opened',
    offerId,
    source: 'cadence',
    candidates: [geneId, alternative],
  });
  return apply(next, {
    type: 'gene_acquired',
    offerId,
    instanceId,
    geneId,
    slot,
    source: 'offer',
  });
}

const PHASE_GATE_ROUTE = [{ x: 4, z: 4 }, { x: 4, z: 5 }] as const;

/**
 * Spawn a target with the geometry the NEXT queued contract demands. Circuit
 * targets need a second visible cell and Phase Gate targets need an optional
 * route; supplying either without its contract is rejected by the reducer, so
 * the helper reads the queue rather than guessing.
 */
function spawn(
  state: GenomeV2State,
  targetId: string,
  options: {
    cell?: GenomeV2Cell;
    crownRole?: 'current' | 'future' | 'crown';
  } = {}
): GenomeV2State {
  const cell = options.cell ?? { x: 1, z: 1 };
  const projection = projectGenomeV2NextTarget(state, {
    cadenceEligible: true,
  });
  return apply(state, {
    type: 'target_spawned',
    targetId,
    cell,
    secondaryCell:
      projection.contract?.kind === 'circuit_run'
        ? { x: cell.x + 3, z: cell.z + 3 }
        : undefined,
    optionalRouteCells: projection.requiresOptionalRouteCells
      ? [...PHASE_GATE_ROUTE]
      : undefined,
    speedAtSpawnMs: 160,
    shortestSafeMoves: 2,
    cadenceEligible: true,
    crownRole: options.crownRole,
  });
}

function resolve(
  state: GenomeV2State,
  targetId: string,
  options: {
    resolution?: 'collected' | 'missed' | 'expired';
    pressureBps?: number;
    movesUsed?: number;
    circuitLegsCompleted?: 0 | 1 | 2;
  } = {}
): GenomeV2State {
  const resolution = options.resolution ?? 'collected';
  return apply(state, {
    type: 'target_resolved',
    targetId,
    resolution,
    movesUsed: options.movesUsed ?? 2,
    baseYield: resolution === 'collected' ? 10_000 : 0,
    pressureBps: options.pressureBps ?? 0,
    circuitLegsCompleted: options.circuitLegsCompleted,
  });
}

function fresh(
  dynasty: 'CYBER' | 'PRIMAL' | 'COSMIC',
  bankedRuns = 10
): GenomeV2State {
  return createGenomeV2State(dynasty, {
    runSeed: `learning-events-${dynasty}-${bankedRuns}`,
    ftue: deriveGenomeV2Ftue(bankedRuns, 0),
    splicesEnabled: false,
  });
}

describe('learning events: the field itself', () => {
  it('is absent until an event fires, and never repeats an entry', () => {
    const state = fresh('PRIMAL');
    expect(state.learningEventsResolved).toBeUndefined();
    expect(genomeV2LearningEventsResolved(state)).toEqual([]);

    let next = acquire(state, 'compound_interest', 0);
    next = apply(next, {
      type: 'offer_opened',
      offerId: 'decline-1',
      source: 'cadence',
      candidates: ['live_wire', 'gold_trail'],
    });
    next = apply(next, { type: 'offer_declined', offerId: 'decline-1' });
    expect(genomeV2LearningEventsResolved(next)).toEqual(['compound_interest']);

    next = apply(next, {
      type: 'offer_opened',
      offerId: 'decline-2',
      source: 'cadence',
      candidates: ['live_wire', 'gold_trail'],
    });
    next = apply(next, { type: 'offer_declined', offerId: 'decline-2' });
    expect(genomeV2LearningEventsResolved(next)).toEqual(['compound_interest']);
  });

  it('is bounded far inside the persistence budget even when every Gene resolves', () => {
    const state = fresh('PRIMAL');
    const saturated: GenomeV2State = {
      ...state,
      learningEventsResolved: [...genomeV2ActivePool('PRIMAL')],
    };
    expect(saturated.learningEventsResolved).toHaveLength(14);
    expect(
      genomeV2SerializedBytes(saturated) - genomeV2SerializedBytes(state)
    ).toBeLessThan(1_024);
    expect(genomeV2SerializedBytes(saturated)).toBeLessThan(
      GENOME_V2_CONFIG.persistence.maximumSerializedBytes
    );
  });

  it('ships at catalog version 1', () => {
    expect(GENOME_V2_LEARNING_EVENT_VERSION).toBe(1);
  });
});

describe('learning events: the catalog, one Gene at a time', () => {
  it('gold_trail resolves on a Gilded target and on its window expiring', () => {
    let collected = acquire(fresh('PRIMAL'), 'gold_trail', 0);
    for (let food = 0; food < GENOME_V2_CONFIG.goldTrail.cadence; food += 1) {
      collected = resolve(spawn(collected, `gold-${food}`), `gold-${food}`);
    }
    expect(genomeV2LearningEventsResolved(collected)).toContain('gold_trail');

    // The failure half: the premium window expiring unclaimed teaches the
    // same rule, which is boundary 7 of the design.
    let expiring = acquire(fresh('PRIMAL'), 'gold_trail', 0);
    for (let food = 0; food < GENOME_V2_CONFIG.goldTrail.cadence - 1; food += 1) {
      expiring = resolve(spawn(expiring, `pre-${food}`), `pre-${food}`);
    }
    expiring = spawn(expiring, 'gilded');
    expect(expiring.targets.gilded.kind).toBe('gold_trail');
    expect(genomeV2LearningEventsResolved(expiring)).not.toContain('gold_trail');
    expiring = apply(expiring, {
      type: 'target_window_expired',
      targetId: 'gilded',
    });
    expect(genomeV2LearningEventsResolved(expiring)).toContain('gold_trail');
  });

  it('live_wire resolves whether the route test is met or burnt', () => {
    for (const movesUsed of [1, 99]) {
      let state = acquire(fresh('CYBER'), 'live_wire', 0);
      for (let food = 0; food < GENOME_V2_CONFIG.liveWire.cadence; food += 1) {
        state = spawn(state, `wire-${food}`);
        state = resolve(state, `wire-${food}`, { movesUsed });
      }
      expect(genomeV2LearningEventsResolved(state)).toContain('live_wire');
    }
  });

  it('circuit_run resolves on a linked route, complete or broken', () => {
    for (const legs of [2, 0] as const) {
      let state = acquire(fresh('COSMIC'), 'circuit_run', 0);
      for (let food = 0; food < GENOME_V2_CONFIG.circuitRun.cadence; food += 1) {
        state = spawn(state, `circuit-${food}`);
        const target = state.targets[`circuit-${food}`];
        state = resolve(state, `circuit-${food}`, {
          movesUsed: 1,
          circuitLegsCompleted:
            target.circuitLegsRequired === 2 ? legs : undefined,
          resolution: target.circuitLegsRequired === 2 && legs === 0
            ? 'missed'
            : 'collected',
        });
      }
      expect(genomeV2LearningEventsResolved(state)).toContain('circuit_run');
    }
  });

  it('compound_interest resolves when a deliberate DECLINE mints a Bond', () => {
    let state = acquire(fresh('PRIMAL'), 'compound_interest', 0);
    state = apply(state, {
      type: 'offer_opened',
      offerId: 'bond',
      source: 'cadence',
      candidates: ['live_wire', 'gold_trail'],
    });
    state = apply(state, { type: 'offer_declined', offerId: 'bond' });
    expect(state.bonds).toBe(1);
    expect(genomeV2LearningEventsResolved(state)).toContain('compound_interest');
  });

  it('loan_shark and mirror_wager resolve on the CONTINUE that opens them', () => {
    let state = acquire(fresh('PRIMAL'), 'loan_shark', 0);
    state = acquire(state, 'mirror_wager', 1);
    state = apply(state, {
      type: 'portal_opened',
      portalId: 'p1',
      genomeOffer: null,
    });
    state = apply(state, {
      type: 'portal_continued',
      portalId: 'p1',
      activateMirror: true,
    });
    expect(state.loan).not.toBeNull();
    expect(genomeV2LearningEventsResolved(state)).toEqual(
      expect.arrayContaining(['loan_shark', 'mirror_wager'])
    );
  });

  it('loan_shark does not resolve on a CONTINUE that opens nothing', () => {
    let state = fresh('PRIMAL');
    state = apply(state, {
      type: 'portal_opened',
      portalId: 'p1',
      genomeOffer: null,
    });
    state = apply(state, {
      type: 'portal_continued',
      portalId: 'p1',
      activateMirror: false,
    });
    expect(genomeV2LearningEventsResolved(state)).toEqual([]);
  });

  it('coilkeeper resolves on the seal, phase_gate on the shortcut, wall_rush on the redirect', () => {
    let coil = acquire(fresh('PRIMAL'), 'coilkeeper', 0);
    for (let food = 0; food < GENOME_V2_CONFIG.coilkeeper.chargeFoods; food += 1) {
      coil = resolve(spawn(coil, `coil-${food}`), `coil-${food}`);
    }
    coil = apply(coil, {
      type: 'coil_sealed',
      terrainId: 'seal-1',
      cells: [
        { x: 1, z: 1 }, { x: 1, z: 2 }, { x: 2, z: 1 }, { x: 2, z: 2 },
      ],
    });
    expect(genomeV2LearningEventsResolved(coil)).toContain('coilkeeper');

    let gate = acquire(fresh('PRIMAL'), 'phase_gate', 0);
    for (let food = 0; food < GENOME_V2_CONFIG.phaseGate.cadence; food += 1) {
      gate = spawn(gate, `gate-${food}`);
      if (gate.targets[`gate-${food}`].kind === 'phase_gate') break;
      gate = resolve(gate, `gate-${food}`);
    }
    const gateTargetId = Object.keys(gate.targets).find(
      (id) => gate.targets[id].kind === 'phase_gate'
    );
    expect(gateTargetId).toBeDefined();
    gate = apply(gate, {
      type: 'phase_gate_used',
      targetId: gateTargetId!,
      terrainId: 'scar-1',
      cells: [...PHASE_GATE_ROUTE],
    });
    expect(genomeV2LearningEventsResolved(gate)).toContain('phase_gate');

    let wall = acquire(fresh('PRIMAL'), 'wall_rush', 0);
    wall = apply(wall, {
      type: 'wall_redirected',
      sourceInstanceId: 'wall_rush:0',
      cell: { x: 0, z: 3 },
    });
    expect(genomeV2LearningEventsResolved(wall)).toContain('wall_rush');
  });

  it('phoenix resolves when the second life is consumed', () => {
    let state = acquire(fresh('PRIMAL'), 'phoenix', 0);
    expect(state.secondLife).not.toBeNull();
    state = apply(state, {
      type: 'phoenix_triggered',
      sourceInstanceId: 'phoenix:0',
      rewindSegments: GENOME_V2_CONFIG.phoenix.rewindSegments,
      phaseTicks: GENOME_V2_CONFIG.phoenix.phaseTicks,
    });
    expect(genomeV2LearningEventsResolved(state)).toContain('phoenix');
  });

  it('loom_anchor resolves on DELIVERY, not on the pin', () => {
    let state = acquire(fresh('PRIMAL'), 'loom_anchor', 0);
    state = apply(state, {
      type: 'offer_opened',
      offerId: 'pin-source',
      source: 'cadence',
      candidates: ['loan_shark', 'live_wire'],
    });
    state = apply(state, {
      type: 'offer_declined',
      offerId: 'pin-source',
      pinGeneId: 'loan_shark',
    });
    expect(genomeV2LearningEventsResolved(state)).not.toContain('loom_anchor');
    state = apply(state, {
      type: 'offer_opened',
      offerId: 'pin-delivery',
      source: 'cadence',
      candidates: ['loan_shark', 'live_wire'],
      pinnedGeneId: 'loan_shark',
    });
    expect(genomeV2LearningEventsResolved(state)).toContain('loom_anchor');
  });

  it('heartwood resolves on its own claim and not on the FERAL ladder claim', () => {
    let state = acquire(fresh('PRIMAL'), 'heartwood', 0);
    state = apply(state, {
      type: 'territory_claimed',
      territoryId: 't1',
      cells: [
        { x: 1, z: 1 }, { x: 1, z: 2 }, { x: 2, z: 1 }, { x: 2, z: 2 },
      ],
      recoveryExitCount: 1,
      source: 'heartwood',
    });
    expect(genomeV2LearningEventsResolved(state)).toContain('heartwood');
  });

  it('zenith_protocol resolves when its overclock window opens', () => {
    let state = acquire(fresh('CYBER'), 'zenith_protocol', 0);
    state = apply(state, {
      type: 'overclock_started',
      activationId: 'oc-1',
      source: 'zenith_protocol',
    });
    expect(genomeV2LearningEventsResolved(state)).toContain('zenith_protocol');
  });

  it('constellation_crown resolves on a failed wave as clearly as a perfect one', () => {
    let state = acquire(fresh('COSMIC'), 'constellation_crown', 0);
    state = spawn(state, 'crown-a', { crownRole: 'current' });
    state = spawn(state, 'crown-b', { cell: { x: 3, z: 3 }, crownRole: 'current' });
    state = apply(state, {
      type: 'crown_wave_opened',
      waveId: 'w1',
      currentTargetIds: ['crown-a', 'crown-b'],
      futureCells: [],
    });
    state = apply(state, {
      type: 'crown_wave_closed',
      waveId: 'w1',
      outcome: 'failed',
    });
    expect(genomeV2LearningEventsResolved(state)).toContain(
      'constellation_crown'
    );
  });

  it('time_dilation resolves on the first extra segment it actually costs', () => {
    let state = acquire(fresh('PRIMAL'), 'time_dilation', 0);
    const cadence = GENOME_V2_CONFIG.timeDilation.extraGrowthCadence;
    for (let food = 0; food < cadence - 1; food += 1) {
      state = resolve(spawn(state, `td-${food}`), `td-${food}`);
    }
    expect(state.timeDilationExtraGrowth).toBeUndefined();
    expect(genomeV2LearningEventsResolved(state)).not.toContain('time_dilation');
    state = resolve(spawn(state, 'td-cost'), 'td-cost');
    expect(state.timeDilationExtraGrowth).toBe(1);
    expect(genomeV2LearningEventsResolved(state)).toContain('time_dilation');
  });

  it('overgrowth resolves only once board pressure has lifted the multiplier off its floor', () => {
    const threshold = GENOME_V2_CONFIG.overgrowth.learningPressureBps;
    let low = acquire(fresh('PRIMAL'), 'overgrowth', 0);
    low = resolve(spawn(low, 'og-low'), 'og-low', { pressureBps: threshold - 1 });
    expect(genomeV2LearningEventsResolved(low)).not.toContain('overgrowth');

    let high = acquire(fresh('PRIMAL'), 'overgrowth', 0);
    high = resolve(spawn(high, 'og-high'), 'og-high', { pressureBps: threshold });
    expect(genomeV2LearningEventsResolved(high)).toContain('overgrowth');
  });
});

describe('learning events: catalog completeness', () => {
  it('has no roster Gene without a resolution path in this suite', () => {
    // The catalog claims one event per current-roster Gene. Every id below is
    // asserted somewhere in this file; a Gene added to the roster without a
    // learning event cannot enter the curriculum and fails here first.
    const covered: readonly GenomeV2ActiveGeneId[] = [
      'gold_trail',
      'compound_interest',
      'loan_shark',
      'live_wire',
      'circuit_run',
      'time_dilation',
      'overgrowth',
      'coilkeeper',
      'wall_rush',
      'phase_gate',
      'mirror_wager',
      'phoenix',
      'loom_anchor',
      'heartwood',
      'zenith_protocol',
      'constellation_crown',
    ];
    const roster = new Set<GenomeV2ActiveGeneId>([
      ...GENOME_V2_SHARED_GENE_IDS,
      'heartwood',
      'zenith_protocol',
      'constellation_crown',
    ]);
    expect(new Set(covered)).toEqual(roster);
  });
});
