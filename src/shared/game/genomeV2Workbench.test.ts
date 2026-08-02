import {
  GENOME_V2_CONFIG,
  projectGenomeV2,
  settleGenomeV2,
} from './genomeV2';
import {
  readGenomeV2Experiment,
  replayGenomeV2Experiment,
  type GenomeV2ExperimentPlan,
} from './genomeV2Workbench';

function plan(
  dynasty: GenomeV2ExperimentPlan['dynasty'],
  actions: GenomeV2ExperimentPlan['actions']
): GenomeV2ExperimentPlan {
  return { v: 2, dynasty, actions };
}

function deepKeys(value: unknown, seen = new Set<unknown>()): string[] {
  if (value === null || typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);
  if (Array.isArray(value)) return value.flatMap((entry) => deepKeys(entry, seen));
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => [
    key,
    ...deepKeys(child, seen),
  ]);
}

describe('Genome v2 Research model', () => {
  it('replays THREAD through the canonical reducer and exposes the resulting Splice', () => {
    const reading = readGenomeV2Experiment(
      plan('PRIMAL', [
        { kind: 'thread', geneId: 'gold_trail' },
        { kind: 'thread', geneId: 'overgrowth' },
      ])
    );

    expect(reading.activeSplices).toEqual(['splice_gilded_fork']);
    expect(reading.loci[0]).toMatchObject({
      kind: 'splice',
      label: 'Gilded Fork',
      geneIds: ['gold_trail', 'overgrowth'],
    });
    expect(reading.loci[1].kind).toBe('empty');
    expect(reading.projection).toEqual(projectGenomeV2(reading.state));
    expect(reading.bank).toEqual(settleGenomeV2(reading.state, 'bank'));
    expect(reading.crash).toEqual(settleGenomeV2(reading.state, 'crash'));
  });

  it('models exact INFUSE and Recode body costs without inventing a second curve', () => {
    const reading = readGenomeV2Experiment(
      plan('PRIMAL', [
        { kind: 'thread', geneId: 'live_wire' },
        { kind: 'thread', geneId: 'compound_interest' },
        { kind: 'thread', geneId: 'loan_shark' },
        { kind: 'thread', geneId: 'time_dilation' },
        { kind: 'thread', geneId: 'overgrowth' },
        { kind: 'infuse', geneId: 'wall_rush' },
        { kind: 'recode', geneId: 'phase_gate', slot: 0 },
      ])
    );

    expect(reading.state.infuseCount).toBe(1);
    expect(reading.state.recodeCount).toBe(1);
    expect(reading.growthCommitted).toBe(
      GENOME_V2_CONFIG.portalGenome.infuseGrowth[0]
        + GENOME_V2_CONFIG.portalGenome.recodeGrowth[0]
    );
    expect(reading.loci[0]).toMatchObject({ kind: 'empty', label: 'Open locus' });
    expect(reading.loci[5]).toMatchObject({ kind: 'splice', label: 'Riftline' });
    expect(reading.seenGenes).toContain('live_wire');
    expect(reading.availableGenes).not.toContain('live_wire');
  });

  it('lets DECLINE and CONTINUE expose the real persistent consequences', () => {
    const reading = readGenomeV2Experiment(
      plan('COSMIC', [
        { kind: 'thread', geneId: 'compound_interest' },
        { kind: 'thread', geneId: 'loan_shark' },
        { kind: 'decline' },
        { kind: 'continue' },
      ])
    );

    expect(reading.state.bonds).toBe(1);
    expect(reading.state.carryPasses).toBe(1);
    expect(reading.state.loan?.foodsRemaining).toBe(
      GENOME_V2_CONFIG.loanShark.foodsPerContract
    );
    expect(reading.lenses.risk.map((fact) => fact.id)).toEqual(
      expect.arrayContaining(['bonds', 'loan-escrow'])
    );
  });

  it('shows Phoenix turning its occupied locus into permanent Ash', () => {
    const reading = readGenomeV2Experiment(
      plan('COSMIC', [
        { kind: 'thread', geneId: 'phoenix' },
        { kind: 'phoenix' },
      ])
    );
    expect(reading.loci[0]).toMatchObject({ kind: 'ash', label: 'Ash' });
    expect(reading.growthCommitted).toBe(GENOME_V2_CONFIG.phoenix.growthCost);
    expect(reading.state.secondLife?.consumed).toBe(true);
  });

  it('preserves Dynasty non-neutrality instead of ranking it away', () => {
    expect(() =>
      replayGenomeV2Experiment(
        plan('CYBER', [{ kind: 'thread', geneId: 'time_dilation' }])
      )
    ).toThrow(/not in CYBER's active pool/i);
    expect(
      readGenomeV2Experiment(plan('PRIMAL', [])).availableGenes
    ).toContain('time_dilation');
  });

  it('contains no Score-shaped output and no recommendation field', () => {
    const reading = readGenomeV2Experiment(
      plan('CYBER', [{ kind: 'thread', geneId: 'live_wire' }])
    );
    const keys = deepKeys(reading);
    expect(keys.filter((key) => /score|recommend|rank|best/i.test(key))).toEqual([]);
  });
});
