import { buildCodexPayload, sanitizeCodexRows, sanitizeWorldFirstRows } from './utils';
import { GENES } from '@/shared/game/genes';
import { SPLICES } from '@/shared/game/splices';

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
    expect(payload.genes.find((entry) => entry.id === 'live_wire')).toBeUndefined();
    expect(payload.splices.find((entry) => entry.id === 'splice_riftline')).toBeUndefined();
    expect(payload.progress.discovered).toBe(2);
    expect(payload.sampleSize).toBe(2);
  });

  it('derives the v2 catalog and stats only when rules v2 are requested', () => {
    const sessions = [{
      extracted: true,
      genome: {
        v: 2,
        instances: {
          wire: { geneId: 'live_wire', status: 'active' },
          gate: { geneId: 'phase_gate', status: 'spliced' },
        },
        activeSplices: ['splice_riftline'],
        retired: [{ reason: 'splice', spliceId: 'splice_riftline' }],
      },
    }];
    const payload = buildCodexPayload([], new Map(), sessions, false, 2);

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
    expect(payload.sampleSize).toBe(1);
    expect(payload.genes.some((entry) => entry.id === 'static_charge')).toBe(false);
  });

  it('keeps a formed-then-recoded v2 Splice in bounded Research stats', () => {
    const payload = buildCodexPayload([], new Map(), [{
      extracted: true,
      genome: {
        v: 2,
        instances: {},
        activeSplices: [],
        retired: [],
        discoveredSplices: [
          'splice_dragon_hoard',
          'splice_dragon_hoard',
          'not_a_splice',
        ],
      },
    }], false, 2);

    expect(payload.splices.find(
      (entry) => entry.id === 'splice_dragon_hoard'
    )).toMatchObject({ discoveries: 1, banks: 1 });
  });

  it('keeps mechanical recipes visible before durable discovery', () => {
    const payload = buildCodexPayload([], new Map(), [], false, 2);
    expect(payload.splices.find((entry) => entry.id === 'splice_worldcoil')).toMatchObject({
      discovered: false,
      parents: ['coilkeeper', 'overgrowth'],
    });
  });

  it('keeps legacy splice parents undiscovered while the v2 catalog is off', () => {
    const payload = buildCodexPayload([], new Map(), [], false);
    expect(payload.splices.every((entry) => entry.parents === null)).toBe(true);
  });

  it('keeps recorded v1-only genes and retired Splices readable in a separate v2 archive', () => {
    const discoveries = sanitizeCodexRows([
      {
        discovery_type: 'gene',
        entry_id: 'static_charge',
        rules_version: 1,
        first_discovered_at: '2026-07-01T00:00:00Z',
      },
      {
        discovery_type: 'splice',
        entry_id: 'splice_black_magnet',
        rules_version: 1,
        first_discovered_at: '2026-07-02T00:00:00Z',
      },
    ]);
    const payload = buildCodexPayload(discoveries, new Map(), [{
      extracted: true,
      genome: {
        v: 1,
        picks: [{ id: 'static_charge' }, { id: 'magnet_pulse' }, { id: 'gravity_well' }],
        splices: [{ id: 'splice_black_magnet' }],
      },
    }], false, 2);

    expect(payload.genes.find((entry) => entry.id === 'static_charge')).toBeUndefined();
    expect(payload.legacyArchive).toMatchObject({ rulesVersion: 1, sampleSize: 1 });
    expect(payload.legacyArchive?.genes).toContainEqual(expect.objectContaining({
      id: 'static_charge',
      rulesVersion: 1,
      effect: GENES.static_charge.effect,
      discovered: true,
      picks: 1,
      banks: 1,
    }));
    expect(payload.legacyArchive?.splices).toContainEqual(expect.objectContaining({
      id: 'splice_black_magnet',
      rulesVersion: 1,
      effect: SPLICES.splice_black_magnet.effect,
      parents: ['magnet_pulse', 'gravity_well'],
      discovered: true,
      discoveries: 1,
      banks: 1,
    }));
  });

  it('does not publish an undiscovered v1 recipe through the v2 history archive', () => {
    const payload = buildCodexPayload([], new Map(), [{
      extracted: false,
      genome: {
        v: 1,
        picks: [{ id: 'magnet_pulse' }, { id: 'gravity_well' }],
        splices: [{ id: 'splice_black_magnet' }],
      },
    }], false, 2);
    const splice = payload.legacyArchive?.splices.find(
      (entry) => entry.id === 'splice_black_magnet'
    );
    expect(splice).toMatchObject({ discovered: false, parents: null });
    expect(payload.legacyArchive?.splices.some(
      (entry) => entry.id === 'splice_gravity_bubble'
    )).toBe(false);
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
    const rows = sanitizeCodexRows([
      { discovery_type: 'gene', entry_id: 'live_wire', rules_version: 2 },
      { discovery_type: 'splice', entry_id: 'splice_riftline', rules_version: 2 },
      { discovery_type: 'gene', entry_id: 'live_wire', rules_version: 1 },
      { discovery_type: 'gene', entry_id: 'static_charge', rules_version: 2 },
    ]);
    expect(rows).toHaveLength(2);
    expect(buildCodexPayload(rows, new Map(), [], false).progress.discovered).toBe(0);
    expect(buildCodexPayload(rows, new Map(), [], false, 2).progress.discovered).toBe(2);
  });

  it('partitions reused IDs by rules version in both discovery and session stats', () => {
    const rows = sanitizeCodexRows([
      {
        discovery_type: 'gene',
        entry_id: 'gold_trail',
        rules_version: 1,
        first_discovered_at: '2026-07-01T00:00:00Z',
      },
      {
        discovery_type: 'gene',
        entry_id: 'gold_trail',
        rules_version: 2,
        first_discovered_at: '2026-08-02T00:00:00Z',
      },
      {
        discovery_type: 'splice',
        entry_id: 'splice_dragon_hoard',
        rules_version: 1,
        first_discovered_at: '2026-07-02T00:00:00Z',
      },
      {
        discovery_type: 'splice',
        entry_id: 'splice_dragon_hoard',
        rules_version: 2,
        first_discovered_at: '2026-08-03T00:00:00Z',
      },
    ]);
    const firsts = sanitizeWorldFirstRows([
      { discovery_type: 'gene', entry_id: 'gold_trail', rules_version: 1, discovered_at: 'v1-gene' },
      { discovery_type: 'gene', entry_id: 'gold_trail', rules_version: 2, discovered_at: 'v2-gene' },
      { discovery_type: 'splice', entry_id: 'splice_dragon_hoard', rules_version: 1, discovered_at: 'v1-splice' },
      { discovery_type: 'splice', entry_id: 'splice_dragon_hoard', rules_version: 2, discovered_at: 'v2-splice' },
    ]);
    const sessions = [
      {
        extracted: true,
        genome: {
          v: 1,
          picks: [{ id: 'gold_trail' }],
          splices: [{ id: 'splice_dragon_hoard' }],
        },
      },
      {
        extracted: false,
        genome: {
          v: 2,
          instances: { gold: { geneId: 'gold_trail', status: 'active' } },
          activeSplices: ['splice_dragon_hoard'],
          retired: [],
        },
      },
    ];

    const active = buildCodexPayload(rows, firsts, sessions, false, 2);
    expect(active.genes.find((entry) => entry.id === 'gold_trail')).toMatchObject({
      rulesVersion: 2,
      firstDiscoveredAt: '2026-08-02T00:00:00Z',
      worldFirstAt: 'v2-gene',
      picks: 1,
      banks: 0,
    });
    expect(active.splices.find((entry) => entry.id === 'splice_dragon_hoard')).toMatchObject({
      rulesVersion: 2,
      firstDiscoveredAt: '2026-08-03T00:00:00Z',
      worldFirstAt: 'v2-splice',
      discoveries: 1,
      banks: 0,
    });
    expect(active.legacyArchive?.genes.find((entry) => entry.id === 'gold_trail')).toMatchObject({
      rulesVersion: 1,
      firstDiscoveredAt: '2026-07-01T00:00:00Z',
      worldFirstAt: 'v1-gene',
      picks: 1,
      banks: 1,
    });
    expect(active.legacyArchive?.splices.find(
      (entry) => entry.id === 'splice_dragon_hoard'
    )).toMatchObject({
      rulesVersion: 1,
      firstDiscoveredAt: '2026-07-02T00:00:00Z',
      worldFirstAt: 'v1-splice',
      discoveries: 1,
      banks: 1,
    });
  });
});
