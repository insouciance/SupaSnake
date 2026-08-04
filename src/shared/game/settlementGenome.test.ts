/**
 * @jest-environment node
 *
 * The settlement genome projection must be LOSSLESS for every consumer.
 *
 * The projection exists to keep the durable settlement payload under the
 * database's byte cap. It is only safe because an exhaustive enumeration showed
 * that the settlement snapshot's genome reaches exactly four SQL readers, all in
 * migration 065, and that each reads a fixed, tiny set of fields per journal
 * event. These tests re-implement those four extractions against the projected
 * genome and assert they produce identical results to the unprojected one.
 *
 * If a future migration teaches a consumer to read a new journal field, these
 * tests keep passing while production silently loses data — so the extraction
 * mirrors below are deliberately written to match the SQL verbatim, and the
 * projection's own key lists are the thing under test.
 */

import {
  jsonbTextByteLength,
  projectGenomeForSettlement,
} from './settlementGenome';

type Rec = Record<string, unknown>;

const GENE_EVENT_TYPES = new Set([
  'gene_acquired',
  'gene_infused',
  'gene_recoded',
  'infuse',
  'recode',
]);
const SPLICE_EVENT_TYPES = new Set(['splice_created', 'splice_discovered']);
const INFUSE_EVENT_TYPES = new Set(['infuse', 'portal_infuse', 'gene_infused']);

function items(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function journalOf(genome: Rec): unknown {
  const kinds = ['eventJournal', 'events'] as const;
  for (const key of kinds) {
    const candidate = genome[key];
    if (Array.isArray(candidate) || (candidate && typeof candidate === 'object')) {
      return candidate;
    }
  }
  return genome.journal;
}

/** Mirror of `genome_record_gene_ids` journal branch (065:476-487). */
function journalGeneIds(genome: Rec): string[] {
  return items(journalOf(genome))
    .map((raw) => {
      const item = (raw ?? {}) as Rec;
      const type = String(item.type ?? item.kind ?? '');
      return (
        item.geneId ??
        item.gene_id ??
        ((item.payload as Rec | undefined)?.geneId) ??
        ((item.payload as Rec | undefined)?.gene_id) ??
        (GENE_EVENT_TYPES.has(type) ? item.id : undefined)
      );
    })
    .filter((id): id is string => typeof id === 'string' && /^[a-z][a-z0-9_]*$/.test(id))
    .sort();
}

/** Mirror of `genome_record_splice_ids` journal branch (065:551-566). */
function journalSpliceIds(genome: Rec): string[] {
  return items(journalOf(genome))
    .map((raw) => {
      const item = (raw ?? {}) as Rec;
      const type = String(item.type ?? item.kind ?? '');
      return (
        item.spliceId ??
        item.splice_id ??
        ((item.payload as Rec | undefined)?.spliceId) ??
        ((item.payload as Rec | undefined)?.splice_id) ??
        (SPLICE_EVENT_TYPES.has(type) ? item.id : undefined)
      );
    })
    .filter(
      (id): id is string =>
        typeof id === 'string' && /^splice_[a-z][a-z0-9_]*$/.test(id)
    )
    .sort();
}

/** Mirror of `genome_record_strain_milestones` journal branch (065:596-616). */
function journalStrains(genome: Rec, kind: string): string[] {
  const accepted = new Set([kind, `strain_${kind}`, `${kind}_triggered`, `${kind}_reached`]);
  return items(journalOf(genome))
    .filter((raw) => accepted.has(String(((raw ?? {}) as Rec).type ?? ((raw ?? {}) as Rec).kind ?? '')))
    .map((raw) => {
      const item = (raw ?? {}) as Rec;
      return item.strain ?? (item.payload as Rec | undefined)?.strain;
    })
    .filter((strain): strain is string =>
      typeof strain === 'string' &&
      ['AURUM', 'VOLT', 'FERAL', 'FLUX', 'UMBRA'].includes(strain)
    )
    .sort();
}

/** Mirror of `genome_record_infuse_count` journal branch (065:634-648). */
function journalInfuseCount(genome: Rec): number {
  return items(journalOf(genome)).filter((raw) =>
    INFUSE_EVENT_TYPES.has(String(((raw ?? {}) as Rec).type ?? ((raw ?? {}) as Rec).kind ?? ''))
  ).length;
}

function heavyGenome(): Rec {
  const journal: Rec[] = [];
  for (let tick = 0; tick < 400; tick += 1) {
    journal.push({
      tick,
      type: 'target_spawned',
      index: tick,
      eventId: `g2:${tick}:abcdef01`,
      targetId: `target:g2:${tick}:abcdef01`,
      cell: { x: tick % 20, z: (tick * 7) % 20 },
      secondaryCell: null,
      forkCell: null,
      crownRole: null,
      optionalRouteCells: [
        { x: 1, z: 2 },
        { x: 3, z: 4 },
        { x: 5, z: 6 },
      ],
      shortestSafeMoves: 11,
      speedAtSpawnMs: 175,
      cadenceEligible: true,
      interactionVersion: 2,
    });
  }
  // The id-bearing events the consumers actually care about.
  journal.push({ tick: 10, type: 'gene_acquired', id: 'mirror_wager' });
  journal.push({ tick: 20, type: 'infuse', geneId: 'ashen_pact', cell: { x: 1, z: 1 } });
  journal.push({ tick: 30, type: 'gene_infused', payload: { gene_id: 'coil_charge' } });
  journal.push({ tick: 31, type: 'gene_infused', payload: { gene_id: 'coil_charge' } });
  journal.push({ tick: 40, type: 'splice_created', id: 'splice_umbra_volt' });
  journal.push({ tick: 45, kind: 'splice_discovered', payload: { spliceId: 'splice_feral_flux' } });
  journal.push({ tick: 50, type: 'apex', strain: 'UMBRA' });
  journal.push({ tick: 55, type: 'expression_reached', payload: { strain: 'VOLT' } });
  journal.push({ tick: 60, type: 'portal_infuse' });

  const targets: Rec[] = [];
  for (let i = 0; i < 400; i += 1) {
    targets.push({
      id: `target:g2:${i}:abcdef01`,
      cell: { x: i % 20, z: (i * 3) % 20 },
      baseYield: 100000,
      pressureBps: 100 + i,
      resolution: 'collected',
      optionalRouteCells: [{ x: 1, z: 2 }, { x: 3, z: 4 }],
    });
  }

  return {
    v: 2,
    tick: 1531,
    dynasty: 'PRIMAL',
    journal,
    targets,
    instances: [{ instanceId: 'gene:g2:1:70174891', geneId: 'mirror_wager', status: 'active' }],
    slots: [{ index: 0, occupant: { kind: 'gene', geneId: 'mirror_wager', status: 'active' } }],
    discoveredSplices: ['splice_umbra_volt'],
    activeSplices: [],
    expressions: { UMBRA: 3 },
    apexes: {},
    ledger: { baseYield: 7650000, bankableYield: 10570000 },
    ftue: { splicesUnlocked: true },
  };
}

describe('projectGenomeForSettlement', () => {
  const full = heavyGenome();
  const projected = projectGenomeForSettlement(full) as Rec;

  it('is lossless for genome_record_gene_ids', () => {
    expect(journalGeneIds(projected)).toEqual(journalGeneIds(full));
    expect(journalGeneIds(projected)).toEqual(
      expect.arrayContaining(['ashen_pact', 'coil_charge', 'mirror_wager'])
    );
  });

  it('is lossless for genome_record_splice_ids', () => {
    expect(journalSpliceIds(projected)).toEqual(journalSpliceIds(full));
    expect(journalSpliceIds(projected)).toEqual(
      expect.arrayContaining(['splice_feral_flux', 'splice_umbra_volt'])
    );
  });

  it('is lossless for genome_record_strain_milestones', () => {
    for (const kind of ['apex', 'expression']) {
      expect(journalStrains(projected, kind)).toEqual(journalStrains(full, kind));
    }
    expect(journalStrains(projected, 'apex')).toContain('UMBRA');
    expect(journalStrains(projected, 'expression')).toContain('VOLT');
  });

  it('preserves event multiplicity for genome_record_infuse_count', () => {
    // A dedupe here would silently change the infuse count: two identical
    // `gene_infused` events must stay two events.
    expect(journalInfuseCount(projected)).toBe(journalInfuseCount(full));
    expect(journalInfuseCount(projected)).toBe(4);
  });

  it('copies every bounded field through untouched', () => {
    for (const key of [
      'v',
      'tick',
      'dynasty',
      'instances',
      'slots',
      'discoveredSplices',
      'activeSplices',
      'expressions',
      'apexes',
      'ledger',
      'ftue',
    ]) {
      expect(projected[key]).toEqual(full[key]);
    }
  });

  it('drops the per-tick arrays no consumer reads', () => {
    expect(projected.targets).toBeUndefined();
    expect(Array.isArray(projected.journal)).toBe(true);
    expect((projected.journal as unknown[]).length).toBe(
      (full.journal as unknown[]).length
    );
  });

  it('shrinks a long run far below the settlement cap', () => {
    expect(jsonbTextByteLength(full)).toBeGreaterThan(65_536);
    expect(jsonbTextByteLength(projected)).toBeLessThan(20_000);
  });

  it('keeps a 60-food run inside the settlement cap that stranded production', () => {
    // Faithful to the measured production payload: the stranded 51-food run
    // carried 116 journal events averaging 270 B and 52 target records
    // averaging 561 B. These fixtures reproduce those exact record shapes and
    // scale them to 60 foods.
    const journal: Rec[] = [];
    const targets: Rec[] = [];
    for (let food = 0; food < 60; food += 1) {
      journal.push({
        cell: { x: food % 20, z: (food * 7) % 20 },
        tick: food * 25,
        type: 'target_spawned',
        index: food * 2 + 1,
        eventId: `g2:${food}:70174891`,
        forkCell: null,
        targetId: `target:g2:${food}:70174891`,
        crownRole: null,
        secondaryCell: null,
        speedAtSpawnMs: 175,
        cadenceEligible: true,
        shortestSafeMoves: 11,
        interactionVersion: 2,
        optionalRouteCells: null,
      });
      journal.push({
        tick: food * 25 + 20,
        type: 'target_resolved',
        index: food * 2 + 2,
        eventId: `g2:${food}:fe0fd956`,
        targetId: `target:g2:${food}:70174891`,
        baseYield: 100000,
        movesUsed: 21,
        resolution: 'collected',
        pressureBps: 100 * (food + 1),
        collectedUnits: 1,
      });
      targets.push({
        cell: { x: food % 20, z: (food * 3) % 20 },
        kind: 'ordinary',
        edible: true,
        forkCell: null,
        targetId: `target:g2:${food}:70174891`,
        crownRole: null,
        lifecycle: 'completed',
        spawnTick: food * 25,
        collidable: true,
        contractId: null,
        forkChoice: null,
        moveBudget: null,
        expiresAtTick: null,
        relayBonusBps: 0,
        secondaryCell: null,
        speedAtSpawnMs: 175,
        eligibleOrdinal: food + 1,
        sealedAreaCells: 0,
        resolvedBaseYield: 100000,
        shortestSafeMoves: 11,
        optionalRouteCells: null,
        circuitLegsRequired: 0,
        territoryMultiplierBps: 10000,
      });
    }
    const run = { v: 2, tick: 1500, dynasty: 'PRIMAL', journal, targets };

    // Unprojected, a 60-food run overflows the bound that stranded two real
    // accounts. This is the regression, stated as a number.
    expect(jsonbTextByteLength(run)).toBeGreaterThan(65_536);

    const projectedRun = projectGenomeForSettlement(run);
    // Projected, it is far inside even the OLD cap, so the correctness fix does
    // not depend on migration 066 landing first.
    expect(jsonbTextByteLength(projectedRun)).toBeLessThan(65_536);
    expect(jsonbTextByteLength(projectedRun)).toBeLessThan(262_144);
    expect(journalGeneIds(projectedRun as Rec)).toEqual(journalGeneIds(run));
    expect(journalInfuseCount(projectedRun as Rec)).toBe(journalInfuseCount(run));
  });

  it('projects whichever journal key the engine used', () => {
    const withEvents = projectGenomeForSettlement({
      events: [{ type: 'infuse', geneId: 'ashen_pact', cell: { x: 1, z: 2 } }],
    }) as Rec;
    expect((withEvents.events as Rec[])[0]).toEqual({
      type: 'infuse',
      geneId: 'ashen_pact',
    });
  });

  it('preserves an object-shaped journal, which genome_record_items also accepts', () => {
    const projectedObject = projectGenomeForSettlement({
      journal: { a: { type: 'infuse', geneId: 'ashen_pact', cell: { x: 0, z: 0 } } },
    }) as Rec;
    expect(projectedObject.journal).toEqual({
      a: { type: 'infuse', geneId: 'ashen_pact' },
    });
  });

  it('passes non-object genomes through unchanged', () => {
    expect(projectGenomeForSettlement(null)).toBeNull();
    expect(projectGenomeForSettlement(undefined)).toBeUndefined();
  });
});

describe('jsonbTextByteLength', () => {
  it('measures the jsonb text form, not the compact one', () => {
    const value = { a: 1, b: [1, 2], c: { d: 'e' } };
    // jsonb::text spaces after ':' and ',' — this is the discrepancy that hid
    // the production overflow from every JSON.stringify-based check.
    expect(jsonbTextByteLength(value)).toBeGreaterThan(
      Buffer.byteLength(JSON.stringify(value), 'utf8')
    );
  });

  it('agrees with Postgres on the canonical spacing', () => {
    expect(jsonbTextByteLength({ a: 1, b: 2 })).toBe('{"a": 1, "b": 2}'.length);
    expect(jsonbTextByteLength([1, 2])).toBe('[1, 2]'.length);
  });
});
