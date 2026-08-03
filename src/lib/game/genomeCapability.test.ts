import { sanitizeGenomeCapability } from './genomeCapability';
import {
  deriveGenomeV2FtuePresentation,
  GENOME_V2_INTERACTION_AUTO_OFFER,
  GENOME_V2_INTERACTION_PHYSICAL_RELIC,
} from '@/shared/game/genomeV2';

describe('sanitizeGenomeCapability', () => {
  it('accepts a server block and sanitizes every nested domain', () => {
    expect(sanitizeGenomeCapability({
      runSeed: '12345678-1234-1234-1234-123456789abc',
      heirloom: { AURUM: 9, VOLT: 1.9, VOID: 2 },
      genePool: ['gold_trail', 'tithe', 'gold_trail', 'bogus'],
      lineage: {
        strains: ['AURUM', 'UMBRA', 'VOID'],
        guaranteeFirstOffer: true,
        guaranteeStrains: ['UMBRA', 'VOLT'],
      },
      anomalyStrain: 'FERAL',
      suppressedStrains: ['UMBRA', 'UMBRA', 'VOID'],
      prevRunDied: true,
      ftue: {
        bankedRuns: 15.8,
        strainTagsUnlocked: true,
        expressionsUnlocked: true,
        infuseUnlocked: true,
        spawnPointsUnlocked: true,
        splicesUnlocked: true,
        apexesUnlocked: false,
      },
    })).toEqual({
      runSeed: '12345678-1234-1234-1234-123456789abc',
      heirloom: { AURUM: 2, VOLT: 1 },
      genePool: ['gold_trail', 'tithe'],
      lineage: {
        strains: ['AURUM', 'UMBRA'],
        guaranteeFirstOffer: true,
        guaranteeStrains: ['UMBRA'],
      },
      anomalyStrain: 'FERAL',
      suppressedStrains: ['UMBRA'],
      // Present and empty, not absent: the sanitizer always emits the clause
      // threshold map (WP-2.10b) so the engine never has to distinguish "no
      // clause this week" from "an older server that did not send one".
      strainThresholdDelta: {},
      prevRunDied: true,
      ftue: {
        bankedRuns: 15,
        strainTagsUnlocked: true,
        expressionsUnlocked: true,
        infuseUnlocked: true,
        spawnPointsUnlocked: true,
        splicesUnlocked: true,
        apexesUnlocked: false,
      },
    });
  });

  it('fails closed when the seed or offer pool cannot support a run', () => {
    expect(sanitizeGenomeCapability(null)).toBeNull();
    expect(sanitizeGenomeCapability({ runSeed: 'short', genePool: ['tithe', 'shed'] })).toBeNull();
    expect(sanitizeGenomeCapability({
      runSeed: '12345678-1234-1234-1234-123456789abc',
      genePool: ['tithe', 'bogus'],
    })).toBeNull();
  });

  it('keeps explicit v1 discrimination byte-identical to the historical path', () => {
    const capability = {
      runSeed: '12345678-1234-1234-1234-123456789abc',
      genePool: ['gold_trail', 'tithe'],
      heirloom: { AURUM: 1 },
      lineage: null,
      anomalyStrain: null,
      suppressedStrains: [],
      strainThresholdDelta: {},
      prevRunDied: false,
      ftue: {},
    };
    expect(sanitizeGenomeCapability({ rulesVersion: 1, ...capability }))
      .toEqual(sanitizeGenomeCapability(capability));
    expect(sanitizeGenomeCapability({ rulesVersion: 3, ...capability }))
      .toBeNull();
  });

  it('accepts only the exact fresh v2 start contract and preserves curated order', () => {
    const ftuePresentation = deriveGenomeV2FtuePresentation(7, 3);
    const capability = sanitizeGenomeCapability({
      rulesVersion: 2,
      runSeed: 'genome-v2-server-seed',
      v2GenePool: ['phase_gate', 'live_wire', 'gold_trail'],
      heirloom: { FLUX: 2, AURUM: 0 },
      ftuePresentation,
      offerTiltStrain: 'VOLT',
      suppressedStrains: ['UMBRA'],
      strainThresholdDelta: { FERAL: -1, VOLT: 0 },
      // Never accepted from this network boundary or copied to the result.
      reducerState: { v: 2, forged: true },
    });

    expect(capability).toEqual({
      rulesVersion: 2,
      interactionVersion: GENOME_V2_INTERACTION_AUTO_OFFER,
      runSeed: 'genome-v2-server-seed',
      v2GenePool: ['phase_gate', 'live_wire', 'gold_trail'],
      heirloom: { FLUX: 2, AURUM: 0 },
      ftuePresentation,
      offerTiltStrain: 'VOLT',
      suppressedStrains: ['UMBRA'],
      strainThresholdDelta: { FERAL: -1, VOLT: 0 },
    });
    expect(capability).not.toHaveProperty('genePool');
    expect(capability).not.toHaveProperty('ftue');
    expect(capability).not.toHaveProperty('reducerState');
  });

  it('defaults historical v2 blocks to automatic offers and accepts only known interaction contracts', () => {
    const ftuePresentation = deriveGenomeV2FtuePresentation(7, 3);
    const base = {
      rulesVersion: 2,
      runSeed: 'genome-v2-server-seed',
      v2GenePool: ['phase_gate', 'live_wire'],
      heirloom: {},
      ftuePresentation,
      offerTiltStrain: null,
      suppressedStrains: [],
      strainThresholdDelta: {},
    };

    expect(sanitizeGenomeCapability(base)).toMatchObject({
      interactionVersion: GENOME_V2_INTERACTION_AUTO_OFFER,
    });
    expect(sanitizeGenomeCapability({
      ...base,
      interactionVersion: GENOME_V2_INTERACTION_PHYSICAL_RELIC,
    })).toMatchObject({
      interactionVersion: GENOME_V2_INTERACTION_PHYSICAL_RELIC,
    });
    expect(sanitizeGenomeCapability({
      ...base,
      interactionVersion: 3,
    })).toBeNull();
  });

  it('never treats the v1 genePool alias as v2 offer authority', () => {
    const ftuePresentation = deriveGenomeV2FtuePresentation(7, 3);
    const base = {
      rulesVersion: 2,
      runSeed: 'genome-v2-server-seed',
      heirloom: {},
      ftuePresentation,
      offerTiltStrain: null,
      suppressedStrains: [],
      strainThresholdDelta: {},
    };

    expect(sanitizeGenomeCapability({
      ...base,
      genePool: ['live_wire', 'phase_gate'],
    })).toBeNull();
    expect(sanitizeGenomeCapability({
      ...base,
      v2GenePool: ['live_wire', 'phase_gate'],
      genePool: ['gold_trail', 'overgrowth'],
    })).toBeNull();
    expect(sanitizeGenomeCapability({
      ...base,
      v2GenePool: ['live_wire', 'live_wire'],
    })).toBeNull();
    expect(sanitizeGenomeCapability({
      ...base,
      v2GenePool: ['magnet_pulse', 'live_wire'],
    })).toBeNull();
    expect(sanitizeGenomeCapability({
      ...base,
      rulesVersion: undefined,
      v2GenePool: ['live_wire', 'phase_gate'],
    })).toBeNull();
  });

  it('fails closed on incomplete or internally inconsistent v2 authority', () => {
    const ftuePresentation = deriveGenomeV2FtuePresentation(7, 3);
    const base = {
      rulesVersion: 2,
      runSeed: 'genome-v2-server-seed',
      v2GenePool: ['live_wire', 'phase_gate'],
      heirloom: {},
      ftuePresentation,
      offerTiltStrain: null,
      suppressedStrains: [],
      strainThresholdDelta: {},
    };
    const { ftuePresentation: _missingFtue, ...withoutFtue } = base;
    expect(sanitizeGenomeCapability(withoutFtue)).toBeNull();
    expect(sanitizeGenomeCapability({
      ...base,
      ftuePresentation: {
        ...ftuePresentation,
        bankedRuns: ftuePresentation.bankedRuns + 1,
      },
    })).toBeNull();
    expect(sanitizeGenomeCapability({
      ...base,
      suppressedStrains: ['VOLT', 'VOLT'],
    })).toBeNull();
    expect(sanitizeGenomeCapability({
      ...base,
      strainThresholdDelta: { VOLT: 99 },
    })).toBeNull();
    expect(sanitizeGenomeCapability({
      ...base,
      strainThresholdDelta: { VOLT: 2 },
    })).toBeNull();
    expect(sanitizeGenomeCapability({
      ...base,
      strainThresholdDelta: { VOLT: -2 },
    })).toBeNull();
  });
});
