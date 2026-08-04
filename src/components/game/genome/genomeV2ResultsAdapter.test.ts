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
    const runtime = jest.requireActual('@/shared/game/genomeV2') as {
      genomeV2EventId?: (runSeed: string, eventIndex: number) => string;
    };
    const runSeed = (state as typeof state & { runSeed?: string }).runSeed;
    const eventId = (index: number, fallback: string) =>
      runtime.genomeV2EventId && runSeed
        ? runtime.genomeV2EventId(runSeed, index)
        : fallback;
    state = reduceGenomeV2Event(state, {
      type: 'target_spawned',
      targetId: 'ordinary-1',
      cell: { x: 2, z: 3 },
      speedAtSpawnMs: 180,
      shortestSafeMoves: 4,
      cadenceEligible: true,
      index: 1,
      tick: 1,
      eventId: eventId(1, 'spawn-1'),
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
      eventId: eventId(2, 'resolve-1'),
    });
    const accepted = genomeV2RunRecord(state, settleGenomeV2(state, 'bank'));
    const parsed = parseGenomeV2RunRecord(accepted);
    const recap = parsed ? buildGenomeV2YieldRecap(parsed) : null;

    expect(recap).not.toBeNull();
    expect(recap?.factorLabel).toBe('Genome v2');
    expect(recap?.baseYieldLabel).toBe('3 Yield');
    // Display-only rounding: the settlement still carries 3.75 scaled Yield,
    // but no player-facing readout of an AMOUNT shows a decimal place.
    expect(recap?.genomeYieldLabel).toBe('4 Yield');
    expect(recap?.genomeDeltaLabel).toBe('+1 Yield');
    expect(recap?.genomeYield).toBe(4);
    expect(recap?.rows.find((row) => row.id === 'carry')).toMatchObject({
      amountLabel: '+1 Yield',
    });
    expect(parsed?.settlement.genomeYield).toBe(37_500);
  });

  it('rejects unstamped and partial objects instead of relabeling them as v2', () => {
    expect(parseGenomeV2RunRecord({ settlement: { terminal: 'bank' } })).toBeNull();
    expect(parseGenomeV2RunRecord({ v: 2, dynasty: 'CYBER', slots: [] })).toBeNull();
  });
});
