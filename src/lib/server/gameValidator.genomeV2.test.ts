import { describe, expect, it } from '@jest/globals';

import {
  createGenomeV2State,
  deriveGenomeV2Ftue,
  deriveGenomeV2FtuePresentation,
  GENOME_RULES_V2,
  genomeV2EventId,
  genomeV2RunRecord,
  genomeV2Yield,
  genomeV2YieldFloor,
  reduceGenomeV2Event,
  settleGenomeV2,
  type GenomeV2Event,
  type GenomeV2State,
} from '@/shared/game/genomeV2';
import { genomeV2ActivePool } from '@/shared/game/genes';
import { computeRunTotals } from '@/shared/game/rulesets';
import {
  validateGameResult,
  type GameResultInput,
  type GenomeV2ValidationContext,
} from './gameValidator';

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

function fixture() {
  const runSeed = 'server-replay-genome-v2';
  const genePool = genomeV2ActivePool('PRIMAL');
  const ftuePresentation = deriveGenomeV2FtuePresentation(10, 3);
  const startingStrainPoints = { FERAL: 1 } as const;
  let state = createGenomeV2State('PRIMAL', {
    runSeed,
    genePool,
    ftue: deriveGenomeV2Ftue(10, 3),
    startingStrainPoints,
    externalSecondLife: 'iron_scales',
    offerTiltStrain: null,
    suppressedStrains: [],
    strainThresholdDelta: {},
  });
  state = apply(state, {
    type: 'target_spawned',
    targetId: 'target-1',
    cell: { x: 2, z: 3 },
    speedAtSpawnMs: 175,
    shortestSafeMoves: 3,
    cadenceEligible: true,
  });
  state = apply(state, {
    type: 'target_resolved',
    targetId: 'target-1',
    resolution: 'collected',
    movesUsed: 3,
    baseYield: genomeV2Yield(10),
    pressureBps: 2_000,
  });
  const context: GenomeV2ValidationContext = {
    rulesVersion: GENOME_RULES_V2,
    runSeed,
    genePool,
    startingStrainPoints,
    ftuePresentation,
    externalSecondLife: 'iron_scales',
    offerTiltStrain: null,
    suppressedStrains: [],
    strainThresholdDelta: {},
    authoritativeTerminal: true,
    growthProfileId: 'dynasty',
  };
  const score = computeRunTotals('PRIMAL', state.foodCount).score;
  const input: GameResultInput = {
    food_count: state.foodCount,
    extracted: true,
    score,
    dna_earned: genomeV2YieldFloor(state.ledger.displayGrossRaw),
    duration_seconds: 10,
    died: false,
    victory: false,
    genome: genomeV2RunRecord(state, null),
  };
  return { state, context, input };
}

describe('Genome v2 server-authoritative settlement', () => {
  it('derives BANK Yield from the replay record and stores an itemized settlement', () => {
    const { state, context, input } = fixture();
    const expected = settleGenomeV2(state, 'bank');
    const result = validateGameResult(
      input,
      new Date(Date.now() - 30_000),
      'PRIMAL',
      ['iron_scales'],
      null,
      null,
      context,
      'dynasty'
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.adjustedDna).toBe(
      genomeV2YieldFloor(expected.harvestEligibleYield)
    );
    expect(result.rawDna).toBe(10);
    expect(result.genome?.v).toBe(GENOME_RULES_V2);
    if (result.genome?.v === GENOME_RULES_V2) {
      expect(result.genome.settlement).toEqual(expected);
    }
  });

  it('derives crash salvage from the same state without trusting a payout claim', () => {
    const { state, context, input } = fixture();
    const result = validateGameResult(
      { ...input, extracted: false, died: true, dna_earned: 999_999 },
      new Date(Date.now() - 30_000),
      'PRIMAL',
      [],
      null,
      null,
      context
    );

    expect(result.adjustedDna).toBe(
      genomeV2YieldFloor(settleGenomeV2(state, 'crash').harvestEligibleYield)
    );
    expect(result.errors.some((error) => error.startsWith('DNA_MISMATCH'))).toBe(true);
    expect(result.valid).toBe(true);
  });

  it('never treats the presentation-only gross high-water mark as earned raw Yield', () => {
    const { state, context, input } = fixture();
    const projected = genomeV2RunRecord(state, null);
    projected.ledger.displayGrossRaw = genomeV2Yield(9_999);

    const result = validateGameResult(
      { ...input, genome: projected },
      new Date(Date.now() - 30_000),
      'PRIMAL',
      [],
      null,
      null,
      context
    );

    expect(result.rawDna).toBe(
      genomeV2YieldFloor(projected.ledger.bankableYield)
    );
    expect(result.rawDna).not.toBe(
      genomeV2YieldFloor(projected.ledger.displayGrossRaw)
    );
  });

  it('refuses a browser-authored or run-start-mismatched terminal record', () => {
    const { context, input } = fixture();

    expect(() =>
      validateGameResult(
        input,
        new Date(Date.now() - 30_000),
        'PRIMAL',
        [],
        null,
        null,
        { ...context, authoritativeTerminal: false }
      )
    ).toThrow(/replay-authoritative/);

    expect(() =>
      validateGameResult(
        {
          ...input,
          genome: {
            ...(input.genome as object),
            runSeed: 'forged-seed',
          },
        },
        new Date(Date.now() - 30_000),
        'PRIMAL',
        [],
        null,
        null,
        context
      )
    ).toThrow(/run-start authority/);
  });

  it('refuses a learning event the run could not have taught (WP-B)', () => {
    const { context, input } = fixture();
    // `learningEventsResolved` is the ONLY input to an eligibility promotion,
    // so a record claiming a Gene that was never in the run's own frozen
    // vocabulary is refused before settlement reads it. CYBER's Signature is
    // not in a PRIMAL pool.
    for (const learningEventsResolved of [
      ['zenith_protocol'],
      ['gold_trail', 'gold_trail'],
      'gold_trail',
    ]) {
      expect(() =>
        validateGameResult(
          {
            ...input,
            genome: { ...(input.genome as object), learningEventsResolved },
          },
          new Date(Date.now() - 30_000),
          'PRIMAL',
          [],
          null,
          null,
          context
        )
      ).toThrow(/learning event outside its own pool/);
    }

    // A Gene the run could offer is accepted and survives to the settled record.
    const accepted = validateGameResult(
      {
        ...input,
        genome: {
          ...(input.genome as object),
          learningEventsResolved: ['gold_trail'],
        },
      },
      new Date(Date.now() - 30_000),
      'PRIMAL',
      [],
      null,
      null,
      context
    );
    expect(
      (accepted.genome as { learningEventsResolved?: string[] })
        .learningEventsResolved
    ).toEqual(['gold_trail']);
  });

  it('refuses a pre-authored settlement or forged journal identity', () => {
    const { state, context, input } = fixture();
    expect(() =>
      validateGameResult(
        {
          ...input,
          genome: genomeV2RunRecord(state, settleGenomeV2(state, 'bank')),
        },
        new Date(Date.now() - 30_000),
        'PRIMAL',
        [],
        null,
        null,
        context
      )
    ).toThrow(/run-start authority/);

    const record = genomeV2RunRecord(state, null);
    record.journal[0] = { ...record.journal[0], eventId: 'forged' };
    expect(() =>
      validateGameResult(
        { ...input, genome: record },
        new Date(Date.now() - 30_000),
        'PRIMAL',
        [],
        null,
        null,
        context
      )
    ).toThrow(/journal is not canonical/);
  });
});
