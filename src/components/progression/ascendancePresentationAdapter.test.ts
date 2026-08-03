import { buildAscendanceProgressionModel } from './ascendancePresentationAdapter';

describe('Ascendance presentation adapter', () => {
  it('uses exact v2 BPS and the authoritative every-five evolution cadence', () => {
    expect(buildAscendanceProgressionModel({ generation: 10, curveVersion: 2 })).toEqual({
      generation: 10,
      curveVersion: 2,
      currentMultiplier: '1.1487',
      nextGeneration: 11,
      nextMultiplier: '1.1717',
      relativeStepPercent: '2.00',
      nextMilestoneGeneration: 15,
      milestoneMultiplier: '1.2682',
      generationsUntilMilestone: 5,
    });
  });

  it('preserves an immutable in-flight multiplier while labeling its v1 curve', () => {
    const model = buildAscendanceProgressionModel({
      generation: 20,
      curveVersion: 1,
      frozenMultiplierBps: 12_069,
    });
    expect(model.currentMultiplier).toBe('1.2069');
    expect(model.curveVersion).toBe(1);
    expect(model.relativeStepPercent).toBe('legacy');
  });
});
