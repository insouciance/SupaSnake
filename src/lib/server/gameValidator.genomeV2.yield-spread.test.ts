import { describe, expect, it } from '@jest/globals';
import { genomeV2ActivePool, type GenomeV2ActiveGeneId } from '@/shared/game/genes';
import {
  GENOME_RULES_V2,
  createGenomeV2State,
  deriveGenomeV2Ftue,
  deriveGenomeV2FtuePresentation,
  genomeV2EventId,
  genomeV2RunRecord,
  genomeV2Yield,
  genomeV2YieldFloor,
  projectGenomeV2NextTarget,
  reduceGenomeV2Event,
  type GenomeV2Event,
  type GenomeV2State,
} from '@/shared/game/genomeV2';
import { computeRunTotals } from '@/shared/game/rulesets';
import {
  validateGameResult,
  type GameResultInput,
  type GenomeV2ValidationContext,
} from './gameValidator';

type EventFacts = GenomeV2Event extends infer Event
  ? Event extends GenomeV2Event
    ? Omit<Event, 'index' | 'tick' | 'eventId'>
    : never
  : never;

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
  alternative: GenomeV2ActiveGeneId,
  slot: 0 | 1 | 2 | 3 | 4 | 5
): GenomeV2State {
  const offerId = `offer-${slot}-${geneId}`;
  state = apply(state, {
    type: 'offer_opened',
    offerId,
    source: 'cadence',
    candidates: [geneId, alternative],
  });
  return apply(state, {
    type: 'gene_acquired',
    offerId,
    instanceId: `instance-${slot}-${geneId}`,
    geneId,
    slot,
    source: 'offer',
  });
}

function collectTargets(
  state: GenomeV2State,
  foods: number,
  pressureBps: number,
  chooseGilded: boolean
): GenomeV2State {
  for (let ordinal = 1; ordinal <= foods; ordinal += 1) {
    const targetId = `target-${ordinal}`;
    const projection = projectGenomeV2NextTarget(state, {
      cadenceEligible: true,
    });
    state = apply(state, {
      type: 'target_spawned',
      targetId,
      cell: { x: (ordinal % 12) + 2, z: (ordinal % 7) + 2 },
      ...(projection.kind === 'circuit_run'
        ? { secondaryCell: { x: (ordinal % 12) + 2, z: (ordinal % 7) + 3 } }
        : {}),
      speedAtSpawnMs: 180,
      shortestSafeMoves: 4,
      cadenceEligible: true,
    });
    const target = state.targets[targetId];
    if (chooseGilded && target?.kind === 'gold_trail') {
      state = apply(state, {
        type: 'gilded_fork_chosen',
        targetId,
        choice: 'gilded',
      });
    }
    state = apply(state, {
      type: 'target_resolved',
      targetId,
      resolution: 'collected',
      movesUsed: 4,
      baseYield: genomeV2Yield(10),
      pressureBps,
      ...(target?.kind === 'circuit_run' ? { circuitLegsCompleted: 2 } : {}),
    });
  }
  return state;
}

function scenario(
  runSeed: string,
  genes: readonly GenomeV2ActiveGeneId[],
  alternatives: readonly GenomeV2ActiveGeneId[],
  chooseGilded: boolean
): { state: GenomeV2State; context: GenomeV2ValidationContext; input: GameResultInput } {
  if (genes.length !== alternatives.length || genes.length > 6) {
    throw new Error('Yield-spread fixtures require one alternative per open locus.');
  }
  const genePool = [...genomeV2ActivePool('PRIMAL')];
  const ftuePresentation = deriveGenomeV2FtuePresentation(10, 3);
  let state = createGenomeV2State('PRIMAL', {
    runSeed,
    genePool,
    ftue: deriveGenomeV2Ftue(10, 3),
    offerTiltStrain: null,
    suppressedStrains: [],
    strainThresholdDelta: {},
  });
  genes.forEach((geneId, index) => {
    state = acquire(
      state,
      geneId,
      alternatives[index],
      index as 0 | 1 | 2 | 3 | 4 | 5
    );
  });
  state = collectTargets(state, 30, 7_500, chooseGilded);

  const context: GenomeV2ValidationContext = {
    rulesVersion: GENOME_RULES_V2,
    runSeed,
    genePool,
    startingStrainPoints: {},
    ftuePresentation,
    externalSecondLife: null,
    offerTiltStrain: null,
    suppressedStrains: [],
    strainThresholdDelta: {},
    authoritativeTerminal: true,
    growthProfileId: 'dynasty',
  };
  const score = computeRunTotals('PRIMAL', state.foodCount).score;
  return {
    state,
    context,
    input: {
      food_count: state.foodCount,
      extracted: true,
      score,
      dna_earned: genomeV2YieldFloor(state.ledger.bankableYield),
      duration_seconds: 180,
      died: false,
      victory: false,
      genome: genomeV2RunRecord(state, null),
    },
  };
}

describe('Genome v2 authoritative Yield spread', () => {
  it('lets mastered spatial risk substantially outperform a fragmented Genome without changing score', () => {
    // This is one deliberately situational comparison, not an ordering of
    // genes or a prescribed end-state build. This Overgrowth/Perfect Circuit
    // interaction is excellent only because a PRIMAL player accepts maximum
    // board pressure, clears every route budget, survives the resulting
    // growth, and BANKs. The comparison build spends the same three offers on
    // survival/control and never triggers Phoenix; in another board state that
    // survival value may be decisive.
    const coherent = scenario(
      'yield-spread-coherent-primal',
      ['overgrowth', 'live_wire', 'circuit_run'],
      ['loan_shark', 'time_dilation', 'gold_trail'],
      false
    );
    const fragmented = scenario(
      'yield-spread-fragmented-primal',
      ['time_dilation', 'phoenix', 'loom_anchor'],
      ['gold_trail', 'loan_shark', 'wall_rush'],
      false
    );
    const startedAt = new Date(Date.now() - 240_000);
    const settle = (fixture: ReturnType<typeof scenario>) =>
      validateGameResult(
        fixture.input,
        startedAt,
        'PRIMAL',
        [],
        null,
        null,
        fixture.context,
        'dynasty'
      );

    const coherentResult = settle(coherent);
    const fragmentedResult = settle(fragmented);

    expect(coherentResult.valid).toBe(true);
    expect(fragmentedResult.valid).toBe(true);
    expect(coherentResult.errors).toEqual([]);
    expect(fragmentedResult.errors).toEqual([]);
    expect(coherent.state.foodCount).toBe(30);
    expect(fragmented.state.foodCount).toBe(30);
    expect(coherentResult.adjustedScore).toBe(fragmentedResult.adjustedScore);
    expect(fragmentedResult.adjustedDna).toBeGreaterThan(0);
    expect(coherentResult.adjustedDna).toBeGreaterThanOrEqual(
      fragmentedResult.adjustedDna * 3
    );
    expect(coherentResult.genome?.v).toBe(GENOME_RULES_V2);
    if (coherentResult.genome?.v === GENOME_RULES_V2) {
      expect(coherentResult.genome.activeSplices).toContain('splice_perfect_circuit');
      expect(coherentResult.genome.bodyGrowthAdded).toBeGreaterThan(
        fragmented.state.bodyGrowthAdded
      );
      expect(coherentResult.genome.settlement?.exclusiveTargetDelta).toBeGreaterThan(0);
      expect(coherentResult.genome.settlement?.continuousDelta).toBeGreaterThan(0);
    }
  });
});
