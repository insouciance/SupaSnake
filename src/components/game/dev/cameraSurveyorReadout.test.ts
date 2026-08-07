/**
 * The surveyor's parameter line is the artefact ET-5 ratifies from, so its
 * shape is pinned here rather than trusted to a screenshot.
 */

import {
  formatParameterLine,
  formatReadoutSlots,
  gradeLegibility,
  LEGIBILITY_ACCEPT,
  LEGIBILITY_FLOOR,
  normalizeSignedDegrees,
  signedFixed,
  type CameraSurveyorReadout,
} from './cameraSurveyorReadout';

const SAMPLE: CameraSurveyorReadout = {
  azimuthDeg: 12.5,
  pitchDeg: 48.2,
  distance: 37.42,
  fitMultiple: 1.15,
  targetOffsetX: 0,
  targetOffsetZ: 0.5,
  fov: 44,
  legibility: 0.74,
};

describe('formatParameterLine', () => {
  it('emits the exact quoted shape', () => {
    expect(formatParameterLine(SAMPLE)).toBe(
      'az=+12.5 pitch=48.2 fit=1.15 target=+0.0,+0.5 fov=44 far/near=0.74'
    );
  });

  it('signs a negative azimuth and a negative target offset', () => {
    expect(
      formatParameterLine({ ...SAMPLE, azimuthDeg: -12.54, targetOffsetX: -1.25 })
    ).toBe('az=-12.5 pitch=48.2 fit=1.15 target=-1.3,+0.5 fov=44 far/near=0.74');
  });

  it('never prints a negative zero', () => {
    const line = formatParameterLine({ ...SAMPLE, azimuthDeg: -0.01, targetOffsetX: -0.02 });
    expect(line).toContain('az=+0.0');
    expect(line).toContain('target=+0.0,+0.5');
  });

  it('survives a camera that has not been measured yet', () => {
    expect(
      formatParameterLine({
        azimuthDeg: Number.NaN,
        pitchDeg: Number.NaN,
        distance: Number.NaN,
        fitMultiple: Number.NaN,
        targetOffsetX: Number.NaN,
        targetOffsetZ: Number.NaN,
        fov: Number.NaN,
        legibility: Number.NaN,
      })
    ).toBe('az=+0.0 pitch=0.0 fit=0.00 target=+0.0,+0.0 fov=0 far/near=0.00');
  });
});

describe('normalizeSignedDegrees', () => {
  it.each([
    [0, 0],
    [180, 180],
    [181, -179],
    [-180, 180],
    [270, -90],
    [-450, -90],
  ])('folds %p into (-180, 180]', (input, expected) => {
    expect(normalizeSignedDegrees(input)).toBeCloseTo(expected, 10);
  });
});

describe('signedFixed', () => {
  it('keeps the requested precision', () => {
    expect(signedFixed(1.239, 2)).toBe('+1.24');
    expect(signedFixed(-1.231, 2)).toBe('-1.23');
  });
});

describe('gradeLegibility', () => {
  it('passes at the ET-5 acceptance threshold and above', () => {
    expect(gradeLegibility(LEGIBILITY_ACCEPT)).toBe('pass');
    expect(gradeLegibility(0.93)).toBe('pass');
  });

  it('is marginal between the floor and acceptance', () => {
    expect(gradeLegibility(LEGIBILITY_FLOOR)).toBe('marginal');
    expect(gradeLegibility(0.694)).toBe('marginal');
  });

  it('fails below the floor, and when nothing could be measured', () => {
    expect(gradeLegibility(0.594)).toBe('fail');
    expect(gradeLegibility(0)).toBe('fail');
    expect(gradeLegibility(Number.NaN)).toBe('fail');
  });

  it('grades what the tray prints, so colour and number never disagree', () => {
    // The shipped default measures 0.6996 and prints "0.70".
    expect(gradeLegibility(0.6996)).toBe('pass');
    expect(gradeLegibility(0.5996)).toBe('marginal');
  });
});

describe('formatReadoutSlots', () => {
  it('formats every tray cell, including the raw distance', () => {
    expect(formatReadoutSlots(SAMPLE)).toEqual({
      azimuth: '+12.5°',
      pitch: '48.2°',
      distance: '37.42 u',
      fit: '1.15×',
      target: '+0.0, +0.5',
      fov: '44°',
      legibility: 'far/near 0.74',
      line: 'az=+12.5 pitch=48.2 fit=1.15 target=+0.0,+0.5 fov=44 far/near=0.74',
    });
  });
});
