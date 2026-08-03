import { buildAscendanceVisualPresentation } from './ascendanceVisualPresentation';

describe('Ascendance visual presentation', () => {
  it('does not add an evolution treatment before Gen5', () => {
    expect(buildAscendanceVisualPresentation(4)).toMatchObject({
      generation: 4,
      stage: 0,
      milestoneGeneration: null,
    });
  });

  it('advances pattern and aura at every fifth generation', () => {
    const gen5 = buildAscendanceVisualPresentation(5);
    const gen9 = buildAscendanceVisualPresentation(9);
    const gen10 = buildAscendanceVisualPresentation(10);

    expect(gen5).toMatchObject({ stage: 1, milestoneGeneration: 5 });
    expect(gen9).toEqual({ ...gen5, generation: 9 });
    expect(gen10).toMatchObject({ stage: 2, milestoneGeneration: 10 });
    expect(gen10.patternDasharray).not.toBe(gen5.patternDasharray);
    expect(gen10.auraBlur).toBeGreaterThan(gen5.auraBlur);
  });
});
