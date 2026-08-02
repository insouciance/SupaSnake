import {
  createGenomeV2State,
  genomeV2RunRecord,
  genomeV2Yield,
  reduceGenomeV2Event,
  settleGenomeV2,
} from '@/shared/game/genomeV2';
import {
  buildGenomeV2YieldRecap,
  parseGenomeV2RunRecord,
} from './genomeV2ResultsAdapter';

describe('Genome v2 Results adapter', () => {
  it('keeps the exact fixed-point contribution visible without inventing one aggregate multiplier', () => {
    let state = createGenomeV2State('CYBER');
    state = reduceGenomeV2Event(state, {
      type: 'target_spawned',
      targetId: 'ordinary-1',
      cell: { x: 2, z: 3 },
      speedAtSpawnMs: 180,
      shortestSafeMoves: 4,
      cadenceEligible: true,
      index: 1,
      tick: 1,
      eventId: 'spawn-1',
    });
    state = reduceGenomeV2Event(state, {
      type: 'target_resolved',
      targetId: 'ordinary-1',
      resolution: 'collected',
      movesUsed: 4,
      baseYield: genomeV2Yield(3),
      pressureBps: 2_000,
      index: 2,
      tick: 2,
      eventId: 'resolve-1',
    });
    const accepted = genomeV2RunRecord(state, settleGenomeV2(state, 'bank'));
    const parsed = parseGenomeV2RunRecord(accepted);
    const recap = parsed ? buildGenomeV2YieldRecap(parsed) : null;

    expect(recap).not.toBeNull();
    expect(recap?.factorLabel).toBe('Genome v2');
    expect(recap?.baseYieldLabel).toBe('3 Yield');
    expect(recap?.genomeYieldLabel).toBe('3.75 Yield');
    expect(recap?.genomeDeltaLabel).toBe('+0.75 Yield');
    expect(recap?.rows.find((row) => row.id === 'carry')).toMatchObject({
      amountLabel: '+0.75 Yield',
    });
  });

  it('rejects unstamped and partial objects instead of relabeling them as v2', () => {
    expect(parseGenomeV2RunRecord({ settlement: { terminal: 'bank' } })).toBeNull();
    expect(parseGenomeV2RunRecord({ v: 2, dynasty: 'CYBER', slots: [] })).toBeNull();
  });
});
