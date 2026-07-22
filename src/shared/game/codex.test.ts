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
            rewardDna: 250,
            worldFirst: true,
          },
          { type: 'splice', entryId: 'forged', rewardDna: 99999 },
          { type: 'apex', entryId: 'UMBRA', rewardDna: -20 },
        ],
        rewardDna: 650,
        genomeWeaverUnlocked: true,
      })
    ).toEqual({
      discoveries: [
        {
          type: 'splice',
          entryId: 'splice_dragon_hoard',
          rewardDna: 250,
          worldFirst: true,
        },
        {
          type: 'apex',
          entryId: 'UMBRA',
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
  });
});
