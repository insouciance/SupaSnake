/**
 * The curriculum stamp on `game_sessions.run_context` (WP-B).
 *
 * Two properties matter more than the rest, and both are asserted below:
 *
 *   1. FORGERY-PROOF. The stamped pool must be re-derivable from the stamped
 *      inputs. A blob whose pool does not follow from its own inputs, or whose
 *      curriculum block has been stripped to widen the pool, is malformed.
 *   2. BYTE-FOR-BYTE FLAG-OFF. A run started without the curriculum must
 *      serialize exactly the blob it serialized before this work package, so a
 *      rollback reads it and settlement is unchanged.
 */

import { describe, expect, it } from '@jest/globals';

import { createAscendanceRunStamp } from '@/shared/game/ascendance';
import {
  GENOME_V2_ELIGIBILITY_CONTRACT_VERSION,
  GENOME_V2_STARTER_POOLS,
  genomeV2ActivePool,
  genomeV2PlayableVocabulary,
} from '@/shared/game/genes';
import {
  deriveGenomeV2FtuePresentation,
  GENOME_V2_INTERACTION_PHYSICAL_RELIC,
  GENOME_V2_LEARNING_EVENT_VERSION,
  GENOME_RULES_V2,
} from '@/shared/game/genomeV2';
import {
  parseRunStartContext,
  RUN_CONTEXT_LEGACY_VERSION,
  RUN_CONTEXT_VERSION,
  serializeRunStartContext,
  type RunStartContext,
  type RunStartEligibilityInputs,
} from './runContext';

const INPUTS: RunStartEligibilityInputs = {
  eligibleGeneIds: ['circuit_run', 'loom_anchor'],
  trialGeneId: 'coilkeeper',
  bankedRuns: 4,
  masteryLevel: 1,
};

function context(
  eligibility: RunStartEligibilityInputs | null = INPUTS
): RunStartContext {
  const genePool = eligibility
    ? genomeV2PlayableVocabulary('CYBER', eligibility)
    : genomeV2ActivePool('CYBER');
  return {
    v: eligibility ? RUN_CONTEXT_VERSION : RUN_CONTEXT_LEGACY_VERSION,
    snake: {
      id: 'snake-curriculum',
      generation: 3,
      traits: [],
      ascendance: createAscendanceRunStamp(3),
    },
    mutationPool: ['gold_trail'],
    freePlay: false,
    genome: {
      rulesVersion: GENOME_RULES_V2,
      interactionVersion: GENOME_V2_INTERACTION_PHYSICAL_RELIC,
      genePool,
      heirloom: {},
      lineage: null,
      tierCap: 2,
      suppressedStrains: [],
      splicesUnlocked: false,
      prevRunDied: false,
      ftuePresentation: deriveGenomeV2FtuePresentation(4, 1),
      externalSecondLife: null,
      ...(eligibility
        ? {
            eligibilityContractVersion: GENOME_V2_ELIGIBILITY_CONTRACT_VERSION,
            learningEventVersion: GENOME_V2_LEARNING_EVENT_VERSION,
            eligibilityInputs: eligibility,
          }
        : {}),
    },
  };
}

function roundTrip(source: RunStartContext) {
  return parseRunStartContext(
    JSON.parse(JSON.stringify(serializeRunStartContext(source)))
  );
}

function stamped(): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(serializeRunStartContext(context()))
  ) as Record<string, unknown>;
}

describe('the curriculum stamp', () => {
  it('round-trips the composed pool and the inputs it was composed from', () => {
    const source = context();
    expect(roundTrip(source)).toEqual({ ok: true, context: source });
  });

  it('writes version 2 only when a curriculum block is present', () => {
    expect(serializeRunStartContext(context()).v).toBe(RUN_CONTEXT_VERSION);
    expect(serializeRunStartContext(context(null)).v).toBe(
      RUN_CONTEXT_LEGACY_VERSION
    );
  });

  it('serializes a flag-off run byte-for-byte as it did before the curriculum', () => {
    const raw = serializeRunStartContext(context(null));
    const genome = raw.genome as Record<string, unknown>;
    expect(raw.v).toBe(1);
    expect(Object.keys(genome).sort()).toEqual([
      'externalSecondLife',
      'ftuePresentation',
      'genePool',
      'heirloom',
      'interactionVersion',
      'lineage',
      'prevRunDied',
      'rulesVersion',
      'splicesUnlocked',
      'suppressedStrains',
      'tierCap',
    ]);
    expect(genome.genePool).toEqual(genomeV2ActivePool('CYBER'));
  });

  it('still reads a version-1 blob written by an earlier deploy', () => {
    const parsed = roundTrip(context(null));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.context.v).toBe(RUN_CONTEXT_LEGACY_VERSION);
    expect(parsed.context.genome?.rulesVersion).toBe(GENOME_RULES_V2);
  });
});

describe('the curriculum stamp: forgery', () => {
  it('rejects a pool that does not follow from its own inputs', () => {
    const raw = stamped();
    const genome = raw.genome as Record<string, unknown>;
    // A widened pool with untouched inputs is the whole attack: play a run
    // with Genes the account has not earned and settle it as if it had.
    const parsed = parseRunStartContext({
      ...raw,
      genome: { ...genome, genePool: genomeV2ActivePool('CYBER') },
    });
    expect(parsed).toEqual({
      ok: false,
      reason: 'genome block malformed',
      malformed: true,
    });
  });

  it('rejects inputs edited to justify a pool the account did not earn', () => {
    const raw = stamped();
    const genome = raw.genome as Record<string, unknown>;
    const inputs = genome.eligibilityInputs as Record<string, unknown>;
    const parsed = parseRunStartContext({
      ...raw,
      genome: {
        ...genome,
        eligibilityInputs: { ...inputs, eligibleGeneIds: ['circuit_run'] },
      },
    });
    expect(parsed.ok).toBe(false);
  });

  it('rejects a stamp whose curriculum block was stripped to widen the pool', () => {
    const raw = stamped();
    const genome = { ...(raw.genome as Record<string, unknown>) };
    delete genome.eligibilityContractVersion;
    delete genome.learningEventVersion;
    delete genome.eligibilityInputs;
    // The pool stays composed, so it no longer matches the complete roster a
    // stampless v2 context declares. Version 2 without a block is malformed.
    const parsed = parseRunStartContext({ ...raw, genome });
    expect(parsed).toEqual({
      ok: false,
      reason: `version ${RUN_CONTEXT_VERSION} disagrees with its eligibility block`,
      malformed: true,
    });
  });

  it('rejects a curriculum block smuggled onto a version-1 blob', () => {
    const raw = stamped();
    const parsed = parseRunStartContext({
      ...raw,
      v: RUN_CONTEXT_LEGACY_VERSION,
    });
    expect(parsed.ok).toBe(false);
  });

  it('rejects a partial or wrongly-versioned block', () => {
    const raw = stamped();
    const genome = raw.genome as Record<string, unknown>;
    for (const broken of [
      { ...genome, eligibilityContractVersion: 99 },
      { ...genome, learningEventVersion: 0 },
      { ...genome, eligibilityInputs: null },
      {
        ...genome,
        eligibilityInputs: {
          ...(genome.eligibilityInputs as Record<string, unknown>),
          bankedRuns: -1,
        },
      },
      {
        ...genome,
        eligibilityInputs: {
          ...(genome.eligibilityInputs as Record<string, unknown>),
          eligibleGeneIds: ['circuit_run', 'circuit_run', 'loom_anchor'],
        },
      },
    ]) {
      expect(parseRunStartContext({ ...raw, genome: broken }).ok).toBe(false);
    }
  });

  it('accepts a graduated veteran stamped with the complete roster', () => {
    const veteran: RunStartEligibilityInputs = {
      eligibleGeneIds: [],
      trialGeneId: null,
      bankedRuns: 12,
      masteryLevel: 0,
    };
    const source = context(veteran);
    expect(source.genome?.genePool).toEqual(genomeV2ActivePool('CYBER'));
    expect(roundTrip(source)).toEqual({ ok: true, context: source });
  });

  it('accepts a brand-new account stamped with exactly its seven', () => {
    const newcomer: RunStartEligibilityInputs = {
      eligibleGeneIds: [...GENOME_V2_STARTER_POOLS.CYBER],
      trialGeneId: null,
      bankedRuns: 0,
      masteryLevel: 0,
    };
    const source = context(newcomer);
    expect(source.genome?.genePool).toHaveLength(7);
    expect(roundTrip(source)).toEqual({ ok: true, context: source });
  });
});
