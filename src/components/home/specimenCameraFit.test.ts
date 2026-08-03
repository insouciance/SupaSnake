import {
  HOME_SPECIMEN_PIECES,
  specimenCameraDistance,
} from './specimenCameraFit';

describe('Specimen Chamber responsive fit', () => {
  it('keeps the chamber portrait to one head and two body pieces', () => {
    expect(HOME_SPECIMEN_PIECES).toBe(3);
  });

  it('moves farther away in portrait and accounts for the complete rotated portrait', () => {
    const bounds = { halfX: 1.18, halfY: 1.08, halfZ: 1.1 };
    const fov = (38 * Math.PI) / 180;
    const portrait = specimenCameraDistance(
      bounds,
      320,
      568,
      fov,
      0.46,
      0.32,
      1.34
    );
    const landscape = specimenCameraDistance(
      bounds,
      900,
      500,
      fov,
      0.46,
      0.32,
      1.34
    );
    expect(portrait).toBeGreaterThan(landscape);
    expect(Number.isFinite(portrait)).toBe(true);
    expect(Number.isFinite(landscape)).toBe(true);
    expect(landscape).toBeGreaterThan(bounds.halfZ);
  });

  it('stays finite at the narrowest supported viewport instead of collapsing the canvas', () => {
    const distance = specimenCameraDistance(
      { halfX: 1.18, halfY: 1.08, halfZ: 1.1 },
      280,
      653,
      (38 * Math.PI) / 180,
      0.46,
      0.32,
      1.34
    );
    expect(distance).toBeGreaterThan(0);
    expect(Number.isFinite(distance)).toBe(true);
  });
});
