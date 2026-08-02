import { buildCodexPayload, sanitizeCodexRows, sanitizeWorldFirstRows } from './utils';

describe('Codex API mapping', () => {
  it('derives per-gene and splice bank stats from accepted v1 sessions', () => {
    const discoveries = sanitizeCodexRows([
      {
        discovery_type: 'gene',
        entry_id: 'gold_trail',
        first_discovered_at: '2026-01-01T00:00:00Z',
      },
      {
        discovery_type: 'splice',
        entry_id: 'splice_dragon_hoard',
        first_discovered_at: '2026-01-02T00:00:00Z',
      },
      { discovery_type: 'gene', entry_id: 'forged' },
    ]);
    const firsts = sanitizeWorldFirstRows([
      {
        discovery_type: 'splice',
        entry_id: 'splice_dragon_hoard',
        discovered_at: '2026-01-02T00:00:00Z',
      },
    ]);
    const sessions = [
      {
        extracted: true,
        genome: {
          v: 1,
          picks: [{ id: 'gold_trail' }, { id: 'compound_interest' }],
          splices: [{ id: 'splice_dragon_hoard' }],
        },
      },
      {
        extracted: false,
        genome: {
          v: 1,
          picks: [{ id: 'gold_trail' }],
          splices: [{ id: 'splice_dragon_hoard' }],
        },
      },
      {
        extracted: true,
        genome: {
          v: 2,
          instances: {
            wire: { geneId: 'live_wire', status: 'active' },
            gate: { geneId: 'phase_gate', status: 'spliced' },
          },
          activeSplices: ['splice_riftline'],
          retired: [
            { reason: 'splice', spliceId: 'splice_riftline' },
          ],
        },
      },
      { extracted: true, genome: { v: 99, picks: [{ id: 'gold_trail' }] } },
    ];

    const payload = buildCodexPayload(discoveries, firsts, sessions, false);
    const gene = payload.genes.find((entry) => entry.id === 'gold_trail');
    const splice = payload.splices.find(
      (entry) => entry.id === 'splice_dragon_hoard'
    );
    expect(gene).toMatchObject({ discovered: true, picks: 2, banks: 1 });
    expect(splice).toMatchObject({
      discovered: true,
      discoveries: 2,
      banks: 1,
      worldFirstAt: '2026-01-02T00:00:00Z',
    });
    expect(payload.genes.find((entry) => entry.id === 'live_wire')).toMatchObject({
      rulesVersion: 2,
      picks: 1,
      banks: 1,
    });
    expect(payload.splices.find((entry) => entry.id === 'splice_riftline')).toMatchObject({
      rulesVersion: 2,
      discoveries: 1,
      banks: 1,
    });
    expect(payload.progress.discovered).toBe(2);
    expect(payload.sampleSize).toBe(4);
  });

  it('keeps mechanical recipes visible before durable discovery', () => {
    const payload = buildCodexPayload([], new Map(), [], false);
    expect(payload.splices.find((entry) => entry.id === 'splice_worldcoil')).toMatchObject({
      discovered: false,
      parents: ['coilkeeper', 'overgrowth'],
    });
  });

  it('deduplicates discovery rows and rejects invalid milestone strains', () => {
    expect(
      sanitizeCodexRows([
        { discovery_type: 'expression', entry_id: 'FERAL' },
        { discovery_type: 'expression', entry_id: 'FERAL' },
        { discovery_type: 'apex', entry_id: 'NOT_A_STRAIN' },
      ])
    ).toHaveLength(1);
  });

  it('accepts v2-only durable discoveries without broadening v1 IDs', () => {
    expect(
      sanitizeCodexRows([
        { discovery_type: 'gene', entry_id: 'live_wire' },
        { discovery_type: 'splice', entry_id: 'splice_riftline' },
      ])
    ).toHaveLength(2);
  });
});
