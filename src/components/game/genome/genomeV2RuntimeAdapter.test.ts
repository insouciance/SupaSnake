import {
  createGenomeV2State,
  deriveGenomeV2Ftue,
} from '@/shared/game/genomeV2';
import {
  buildGenomeV2OverclockPresentation,
  genomeV2RuntimeBridge,
  parseAscendanceRunPresentationStamp,
  parseGenomeV2ActivationPresentation,
  parseGenomeV2State,
  parseLegacyHeldGenes,
} from './genomeV2RuntimeAdapter';

describe('Genome v2 runtime presentation adapter', () => {
  it('formats server-authored unlock progress without rebuilding thresholds', () => {
    const ftue = deriveGenomeV2Ftue(2, 1);
    const capability = (
      id: string,
      unlocked: boolean,
      current: number,
      required: number
    ) => ({
      id,
      unlocked,
      reason: unlocked ? 'unlocked' : 'banked_runs',
      progress: {
        bankedRuns: { current, required },
        mastery: null,
      },
    });
    const parsed = parseGenomeV2ActivationPresentation({
      v: 2,
      bankedRuns: 2,
      masteryLevel: 1,
      capabilities: {
        strainTags: capability('strainTags', true, 2, 0),
        minor: capability('minor', true, 2, 0),
        continue: capability('continue', ftue.continueUnlocked, 2, 1),
        expressions: capability('expressions', ftue.expressionsUnlocked, 2, 2),
        portalGenome: capability('portalGenome', ftue.portalGenomeUnlocked, 2, 4),
        spawnPoints: capability('spawnPoints', ftue.spawnPointsUnlocked, 2, 6),
        splices: capability('splices', ftue.splicesUnlocked, 2, 6),
        apex: {
          id: 'apex',
          unlocked: ftue.apexesUnlocked,
          reason: 'banked_runs_or_mastery',
          progress: {
            bankedRuns: { current: 2, required: 10 },
            mastery: { current: 1, required: 3 },
          },
        },
      },
    });

    expect(parsed?.portalGenome).toEqual({
      unlocked: false,
      reason: 'Validated BANK progression',
      progress: '2 / 4 validated BANKS',
    });
    expect(parsed?.apex.progress).toBe('2 / 10 validated BANKS · or M1 / M3');
  });

  it('treats a missing Ascendance stamp as v1 legacy', () => {
    expect(parseAscendanceRunPresentationStamp(undefined, 10)).toEqual({
      curveVersion: 1,
      multiplierBps: 11_149,
      legacy: true,
    });
    expect(parseAscendanceRunPresentationStamp({
      curveVersion: 2,
      multiplierBps: 11_487,
    }, 10)).toEqual({
      curveVersion: 2,
      multiplierBps: 11_487,
      legacy: false,
    });
  });

  it('accepts only explicit v2 state and a complete atomic bridge', () => {
    expect(parseGenomeV2State(createGenomeV2State('CYBER'))).not.toBeNull();
    expect(parseGenomeV2State({ v: 1 })).toBeNull();
    expect(genomeV2RuntimeBridge({ getState: () => ({}) })).toBeNull();
    expect(genomeV2RuntimeBridge({
      getState: () => ({}),
      resolveGenomeV2Offer: () => true,
      inspectGenomeV2PortalCandidate: () => null,
      resolveGenomeV2Portal: () => true,
      activateGenomeV2Overclock: () => true,
    })).not.toBeNull();
  });

  it('keeps v2 pick events out of the legacy held-gene array', () => {
    expect(parseLegacyHeldGenes(undefined)).toBeNull();
    expect(parseLegacyHeldGenes([
      { id: 'gold_trail', atFood: 4 },
      { id: 'wall_rush', atFood: 9 },
    ])).toEqual([
      { id: 'gold_trail', atFood: 4 },
      { id: 'wall_rush', atFood: 9 },
    ]);
    expect(parseLegacyHeldGenes([{ id: 'not-a-gene', atFood: 4 }])).toBeNull();
  });

  it('exposes VOLT Overclock only at the 4-point Apex with its FTUE gate open', () => {
    const belowApex = createGenomeV2State('PRIMAL', {
      startingStrainPoints: { VOLT: 3 },
      ftue: deriveGenomeV2Ftue(10, 0),
    });
    expect(buildGenomeV2OverclockPresentation(belowApex)).toBeNull();

    const reachedButLocked = createGenomeV2State('PRIMAL', {
      startingStrainPoints: { VOLT: 4 },
      ftue: deriveGenomeV2Ftue(2, 0),
    });
    expect(buildGenomeV2OverclockPresentation(reachedButLocked)).toBeNull();

    const apex = createGenomeV2State('PRIMAL', {
      startingStrainPoints: { VOLT: 4 },
      ftue: deriveGenomeV2Ftue(10, 0),
    });
    expect(buildGenomeV2OverclockPresentation(apex)?.available).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'volt_apex', label: 'OVERCLOCK' }),
      ])
    );
  });
});
