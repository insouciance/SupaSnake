import {
  codexEntryName,
  sanitizeCodexDiscoveryResult,
} from './codex';

describe('Genome Codex discovery contract', () => {
  it('sanitizes valid discoveries and drops forged catalog ids', () => {
    expect(
      sanitizeCodexDiscoveryResult({
        discoveries: [
          {
            type: 'splice',
            entryId: 'splice_dragon_hoard',
            rulesVersion: 1,
            rewardDna: 250,
            worldFirst: true,
          },
          { type: 'splice', entryId: 'forged', rewardDna: 99999 },
          { type: 'apex', entryId: 'UMBRA', rulesVersion: 2, rewardDna: -20 },
        ],
        rewardDna: 650,
        genomeWeaverUnlocked: true,
      })
    ).toEqual({
      discoveries: [
        {
          type: 'splice',
          entryId: 'splice_dragon_hoard',
          rulesVersion: 1,
          rewardDna: 250,
          worldFirst: true,
        },
        {
          type: 'apex',
          entryId: 'UMBRA',
          rulesVersion: 2,
          rewardDna: 0,
          worldFirst: false,
        },
      ],
      rewardDna: 650,
      genomeWeaverUnlocked: true,
    });
  });

  it('provides stable player-facing names', () => {
    expect(codexEntryName('gene', 'gold_trail')).toBe('Gold Trail');
    expect(codexEntryName('splice', 'splice_dragon_hoard')).toBe('Dragon Hoard');
    expect(codexEntryName('expression', 'AURUM')).toBe('Aurum Expression');
    expect(codexEntryName('apex', 'UMBRA')).toBe('Umbra Apex');
    expect(codexEntryName('gene', 'live_wire', 2)).toBe('Live Wire');
    expect(codexEntryName('splice', 'splice_riftline', 2)).toBe('Riftline');
  });

  it('rejects a v2-only id when the server stamps it as v1', () => {
    expect(
      sanitizeCodexDiscoveryResult({
        discoveries: [
          { type: 'gene', entryId: 'live_wire', rulesVersion: 1 },
          { type: 'gene', entryId: 'live_wire', rulesVersion: 2 },
        ],
      }).discoveries
    ).toEqual([
      {
        type: 'gene',
        entryId: 'live_wire',
        rulesVersion: 2,
        rewardDna: 0,
        worldFirst: false,
      },
    ]);
  });
});
