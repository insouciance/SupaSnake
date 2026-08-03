import {
  measureHomeSafeStage,
  specimenCameraDistance,
} from './specimenCameraFit';

describe('Specimen Chamber responsive fit', () => {
  it('reserves the measured identity and command surfaces', () => {
    expect(
      measureHomeSafeStage(
        390,
        844,
        { top: 0, right: 390, bottom: 142, left: 0 },
        { top: 688, right: 390, bottom: 844, left: 0 }
      )
    ).toEqual({ top: 150, right: 0, bottom: 164, left: 0 });
  });

  it('keeps a non-zero stage when optional Home cards grow tall', () => {
    const stage = measureHomeSafeStage(
      320,
      568,
      { top: 0, right: 320, bottom: 150, left: 0 },
      { top: 210, right: 320, bottom: 568, left: 0 }
    );
    expect(568 - stage.top - stage.bottom).toBeGreaterThanOrEqual(96);
  });

  it('moves farther away in portrait and accounts for rotated depth', () => {
    const bounds = { halfX: 3.7, halfY: 0.8, halfZ: 2.2 };
    const fov = (38 * Math.PI) / 180;
    const portrait = specimenCameraDistance(
      bounds,
      320,
      400,
      fov,
      0.46,
      0.32,
      1.22
    );
    const landscape = specimenCameraDistance(
      bounds,
      900,
      500,
      fov,
      0.46,
      0.32,
      1.22
    );
    expect(portrait).toBeGreaterThan(landscape);
    expect(portrait).toBeGreaterThan(10.5);
  });
});
