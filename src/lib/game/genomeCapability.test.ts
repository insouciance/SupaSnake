import { sanitizeGenomeCapability } from './genomeCapability';

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
});
