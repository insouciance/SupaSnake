/**
 * The ratified starter pools and the run-start vocabulary composer.
 *
 * The three lists and the seven-Gene size are owner-ratified decisions (§13
 * rows 4 and 5, 4 August 2026) whose evidence is a simulation. This file makes
 * that evidence a build gate: a future pool edit that breaks a §4.3 constraint
 * fails here rather than shipping and starving a run.
 */

import { describe, expect, it } from '@jest/globals';

import {
  GENOME_V2_ELIGIBILITY_CONTRACT_VERSION,
  GENOME_V2_GENE_STRAINS,
  GENOME_V2_GRADUATION,
  GENOME_V2_STARTER_POOLS,
  GENOME_V2_STARTER_POOL_SIZE,
  genomeV2ActivePool,
  genomeV2DynastyForVocabulary,
  genomeV2Graduated,
  genomeV2PlayableVocabulary,
  type GenomeV2ActiveGeneId,
  type GenomeV2Dynasty,
  type GenomeV2EligibilityFacts,
} from './genes';
import { GENOME_V2_CONFIG, createGenomeV2State } from './genomeV2';
import { STRAIN_IDS } from './strains';
import {
  RECOMMENDED_STARTER_POOL_KEY,
  STARTER_POOL_CANDIDATES,
  scoreStarterPool,
} from '@/shared/simulation/starterPool';

const DYNASTIES: readonly GenomeV2Dynasty[] = ['CYBER', 'PRIMAL', 'COSMIC'];

function facts(
  overrides: Partial<GenomeV2EligibilityFacts> = {}
): GenomeV2EligibilityFacts {
  return {
    eligibleGeneIds: [],
    trialGeneId: null,
    bankedRuns: 0,
    masteryLevel: 0,
    ...overrides,
  };
}

describe('starter pools: the ratified lists', () => {
  it('are exactly the pools the simulation recommended', () => {
    for (const dynasty of DYNASTIES) {
      const key = RECOMMENDED_STARTER_POOL_KEY[dynasty];
      expect([...GENOME_V2_STARTER_POOLS[dynasty]]).toEqual([
        ...STARTER_POOL_CANDIDATES[dynasty][key],
      ]);
    }
  });

  it('pass every §4.3 constraint the harness scores', () => {
    // THE GATE. `passes` folds together: the Signature is present, at least
    // two Strains reach Minor, no Gene needs a still-locked verb, no Gene is
    // unobservable in a short early run, the Signature's own Strain reaches
    // Minor, and the pool can serve two legal candidates for all six loci.
    for (const dynasty of DYNASTIES) {
      const key = RECOMMENDED_STARTER_POOL_KEY[dynasty];
      const scorecard = scoreStarterPool(
        dynasty,
        key,
        GENOME_V2_STARTER_POOLS[dynasty]
      );
      expect(scorecard.passes).toBe(true);
      expect(scorecard.size).toBe(GENOME_V2_STARTER_POOL_SIZE);
      expect(scorecard.fillsAllLoci).toBe(true);
      expect(scorecard.splices.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('are subsets of their Dynasty roster and free of duplicates', () => {
    for (const dynasty of DYNASTIES) {
      const catalog = genomeV2ActivePool(dynasty);
      const pool = GENOME_V2_STARTER_POOLS[dynasty];
      expect(new Set(pool).size).toBe(pool.length);
      for (const geneId of pool) expect(catalog).toContain(geneId);
    }
  });

  it('keep every Strain at two or more Genes across the Dynasty roster', () => {
    // Constitution §8.3's curation criterion binds the ROSTER, not the
    // per-account eligible subset (owner ruling 3). Asserted here because a
    // roster edit that starved a Strain would make its 2/3/4 ladder rungs
    // unreachable for that Dynasty while the curriculum kept promising them.
    for (const dynasty of DYNASTIES) {
      const roster = genomeV2ActivePool(dynasty);
      for (const strain of STRAIN_IDS) {
        const members = roster.filter((geneId) =>
          GENOME_V2_GENE_STRAINS[geneId].includes(strain)
        );
        expect(members.length).toBeGreaterThanOrEqual(2);
      }
      expect(roster.length).toBeGreaterThanOrEqual(12);
      expect(roster.length).toBeLessThanOrEqual(16);
    }
  });

  it('reuse the shipped Apex thresholds as the graduation threshold', () => {
    expect(GENOME_V2_GRADUATION.bankedRuns).toBe(
      GENOME_V2_CONFIG.ftue.apexAtBankedRuns
    );
    expect(GENOME_V2_GRADUATION.masteryLevel).toBe(
      GENOME_V2_CONFIG.ftue.apexAtMastery
    );
    expect(genomeV2Graduated(9, 2)).toBe(false);
    expect(genomeV2Graduated(10, 0)).toBe(true);
    expect(genomeV2Graduated(0, 3)).toBe(true);
  });
});

describe('genomeV2PlayableVocabulary', () => {
  it('gives a brand-new account exactly its Dynasty seven', () => {
    for (const dynasty of DYNASTIES) {
      const pool = genomeV2PlayableVocabulary(dynasty, facts());
      expect(pool).toHaveLength(GENOME_V2_STARTER_POOL_SIZE);
      expect(new Set(pool)).toEqual(new Set(GENOME_V2_STARTER_POOLS[dynasty]));
    }
  });

  it('returns the catalog order, so two callers agree byte for byte', () => {
    for (const dynasty of DYNASTIES) {
      const catalog = genomeV2ActivePool(dynasty);
      const pool = genomeV2PlayableVocabulary(dynasty, facts());
      expect(pool).toEqual(catalog.filter((geneId) => pool.includes(geneId)));
      expect(pool).toEqual(genomeV2PlayableVocabulary(dynasty, facts()));
    }
  });

  it('adds resolved Genes and the current trial, and nothing else', () => {
    const pool = genomeV2PlayableVocabulary(
      'CYBER',
      facts({ eligibleGeneIds: ['circuit_run'], trialGeneId: 'loom_anchor' })
    );
    expect(pool).toContain('circuit_run');
    expect(pool).toContain('loom_anchor');
    expect(pool).not.toContain('coilkeeper');
    expect(pool).toHaveLength(GENOME_V2_STARTER_POOL_SIZE + 2);
  });

  it('never admits a Gene outside the Dynasty roster', () => {
    // heartwood is PRIMAL's Signature and time_dilation is absent from CYBER.
    // An eligibility row for either is account-wide and legitimate; neither
    // may reach a CYBER run.
    const pool = genomeV2PlayableVocabulary(
      'CYBER',
      facts({
        eligibleGeneIds: ['heartwood', 'time_dilation', 'coilkeeper'],
        trialGeneId: 'constellation_crown',
      })
    );
    expect(pool).not.toContain('heartwood');
    expect(pool).not.toContain('time_dilation');
    expect(pool).not.toContain('constellation_crown');
    expect(pool).toContain('coilkeeper');
    for (const geneId of pool) {
      expect(genomeV2ActivePool('CYBER')).toContain(geneId);
    }
  });

  it('hands a graduated veteran the complete roster whatever their rows say', () => {
    for (const dynasty of DYNASTIES) {
      const catalog = genomeV2ActivePool(dynasty);
      expect(
        genomeV2PlayableVocabulary(dynasty, facts({ bankedRuns: 10 }))
      ).toEqual(catalog);
      expect(
        genomeV2PlayableVocabulary(dynasty, facts({ masteryLevel: 3 }))
      ).toEqual(catalog);
    }
  });

  it('fails closed to the complete roster, never to a starved pool', () => {
    const catalog = genomeV2ActivePool('PRIMAL');
    // A partially backfilled account cannot be handed four Genes: four fills
    // three loci and then permanently stops the offer stream.
    const truncated = genomeV2PlayableVocabulary('PRIMAL', {
      eligibleGeneIds: ['gold_trail'],
      trialGeneId: null,
      bankedRuns: 0,
      masteryLevel: 0,
    });
    expect(truncated).toHaveLength(GENOME_V2_STARTER_POOL_SIZE);

    for (const broken of [
      facts({ bankedRuns: -1 }),
      facts({ masteryLevel: 1.5 }),
      facts({ eligibleGeneIds: ['not_a_gene' as GenomeV2ActiveGeneId] }),
      facts({ trialGeneId: 'nope' as GenomeV2ActiveGeneId }),
    ]) {
      expect(genomeV2PlayableVocabulary('PRIMAL', broken)).toEqual(catalog);
    }
  });

  it('always composes a pool the engine will accept', () => {
    for (const dynasty of DYNASTIES) {
      for (const eligible of [
        [],
        ['circuit_run'],
        ['circuit_run', 'loom_anchor', 'coilkeeper'],
        [...genomeV2ActivePool(dynasty)],
      ] as GenomeV2ActiveGeneId[][]) {
        const genePool = genomeV2PlayableVocabulary(
          dynasty,
          facts({ eligibleGeneIds: eligible })
        );
        expect(genePool.length).toBeGreaterThanOrEqual(
          GENOME_V2_STARTER_POOL_SIZE
        );
        expect(() =>
          createGenomeV2State(dynasty, {
            runSeed: `composed-${dynasty}-${eligible.length}`,
            genePool,
          })
        ).not.toThrow();
      }
    }
  });
});

describe('genomeV2DynastyForVocabulary', () => {
  it('recovers the Dynasty from any pool the composer can produce', () => {
    for (const dynasty of DYNASTIES) {
      for (const composed of [
        genomeV2PlayableVocabulary(dynasty, facts()),
        genomeV2PlayableVocabulary(dynasty, facts({ bankedRuns: 10 })),
        genomeV2PlayableVocabulary(
          dynasty,
          facts({ eligibleGeneIds: ['coilkeeper', 'wall_rush'] })
        ),
      ]) {
        expect(genomeV2DynastyForVocabulary(composed)).toBe(dynasty);
      }
    }
  });

  it('refuses a pool with no Signature or more than one', () => {
    expect(
      genomeV2DynastyForVocabulary(['gold_trail', 'compound_interest'])
    ).toBeNull();
    expect(
      genomeV2DynastyForVocabulary(['heartwood', 'zenith_protocol'])
    ).toBeNull();
  });
});

describe('the eligibility contract version', () => {
  it('ships at 1', () => {
    expect(GENOME_V2_ELIGIBILITY_CONTRACT_VERSION).toBe(1);
  });
});
