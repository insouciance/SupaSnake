/**
 * The curriculum stamp on the issued client manifest (WP-B).
 *
 * The manifest is a deploy-safety boundary, not a trust boundary — the server
 * validates the end payload independently — but a manifest whose pool does not
 * follow from its own declared inputs is a build disagreeing with itself, and
 * the honest answer is the same one a malformed FTUE presentation gets: refuse
 * the whole capability and run the legacy engine path.
 */

import { describe, expect, it } from '@jest/globals';

import {
  GENOME_V2_ELIGIBILITY_CONTRACT_VERSION,
  genomeV2ActivePool,
  genomeV2PlayableVocabulary,
} from '@/shared/game/genes';
import {
  deriveGenomeV2FtuePresentation,
  GENOME_V2_INTERACTION_PHYSICAL_RELIC,
  GENOME_V2_LEARNING_EVENT_VERSION,
  GENOME_RULES_V2,
} from '@/shared/game/genomeV2';
import { sanitizeGenomeCapability } from './genomeCapability';

const INPUTS = {
  eligibleGeneIds: ['circuit_run'],
  trialGeneId: 'loom_anchor',
  bankedRuns: 3,
  masteryLevel: 0,
} as const;

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    rulesVersion: GENOME_RULES_V2,
    interactionVersion: GENOME_V2_INTERACTION_PHYSICAL_RELIC,
    runSeed: 'curriculum-manifest-seed',
    heirloom: {},
    v2GenePool: genomeV2PlayableVocabulary('COSMIC', { ...INPUTS }),
    ftuePresentation: deriveGenomeV2FtuePresentation(3, 0),
    offerTiltStrain: null,
    suppressedStrains: [],
    strainThresholdDelta: {},
    eligibilityContractVersion: GENOME_V2_ELIGIBILITY_CONTRACT_VERSION,
    learningEventVersion: GENOME_V2_LEARNING_EVENT_VERSION,
    eligibilityInputs: { ...INPUTS, eligibleGeneIds: [...INPUTS.eligibleGeneIds] },
    ...overrides,
  };
}

describe('sanitizeGenomeCapability: the curriculum stamp', () => {
  it('keeps a stamp whose pool re-derives from its inputs', () => {
    const sanitized = sanitizeGenomeCapability(manifest());
    expect(sanitized).not.toBeNull();
    if (!sanitized || sanitized.rulesVersion !== GENOME_RULES_V2) return;
    expect(sanitized.eligibilityContractVersion).toBe(
      GENOME_V2_ELIGIBILITY_CONTRACT_VERSION
    );
    expect(sanitized.learningEventVersion).toBe(GENOME_V2_LEARNING_EVENT_VERSION);
    expect(sanitized.eligibilityInputs).toEqual({
      eligibleGeneIds: ['circuit_run'],
      trialGeneId: 'loom_anchor',
      bankedRuns: 3,
      masteryLevel: 0,
    });
    // COSMIC's starter seven already carries `circuit_run`, so only the trial
    // widens the pool: seven plus one, not seven plus two.
    expect(sanitized.v2GenePool).toHaveLength(8);
    expect(sanitized.v2GenePool).toContain('loom_anchor');
  });

  it('accepts a manifest with no curriculum stamp as the complete roster', () => {
    const raw = manifest({ v2GenePool: genomeV2ActivePool('COSMIC') });
    delete (raw as Record<string, unknown>).eligibilityContractVersion;
    delete (raw as Record<string, unknown>).learningEventVersion;
    delete (raw as Record<string, unknown>).eligibilityInputs;
    const sanitized = sanitizeGenomeCapability(raw);
    expect(sanitized).not.toBeNull();
    if (!sanitized || sanitized.rulesVersion !== GENOME_RULES_V2) return;
    expect(sanitized.eligibilityInputs).toBeUndefined();
    expect(sanitized.v2GenePool).toEqual(genomeV2ActivePool('COSMIC'));
  });

  it('refuses a widened pool, a rewritten input, and a partial block', () => {
    expect(
      sanitizeGenomeCapability(
        manifest({ v2GenePool: genomeV2ActivePool('COSMIC') })
      )
    ).toBeNull();
    expect(
      sanitizeGenomeCapability(
        manifest({
          eligibilityInputs: { ...INPUTS, eligibleGeneIds: ['coilkeeper'] },
        })
      )
    ).toBeNull();
    const partial = manifest();
    delete (partial as Record<string, unknown>).eligibilityInputs;
    expect(sanitizeGenomeCapability(partial)).toBeNull();
    expect(
      sanitizeGenomeCapability(manifest({ eligibilityContractVersion: 2 }))
    ).toBeNull();
    expect(
      sanitizeGenomeCapability(
        manifest({ eligibilityInputs: { ...INPUTS, masteryLevel: -1 } })
      )
    ).toBeNull();
  });
});
