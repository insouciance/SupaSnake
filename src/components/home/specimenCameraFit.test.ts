import { readFileSync } from 'fs';
import { join } from 'path';

import {
  HOME_SPECIMEN_PIECES,
  specimenCameraDistance,
  specimenOpticalShift,
} from './specimenCameraFit';

const chamberSource = readFileSync(
  join(process.cwd(), 'src/components/home/SpecimenChamber.tsx'),
  'utf8'
);

/** Read a shipped scalar out of the chamber so this test cannot hold a stale
 *  copy of the value it is reasoning about — the same pin
 *  `ChamberPlaceholder.test.tsx` uses for the room's colours. */
function chamberNumber(name: string): number {
  const match = chamberSource.match(
    new RegExp(`const ${name} = (-?[0-9.]+)`)
  );
  if (!match) throw new Error(`SpecimenChamber has no ${name} constant`);
  return Number(match[1]);
}

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

/**
 * THE WASH-OUT (task #46), as a contract rather than as a screenshot.
 *
 * Reported as "the chamber specimen washes out on narrow viewports". It was
 * fog. The fit derives distance from the HORIZONTAL fov, horizontal fov
 * collapses with aspect, and the fog band used to be two absolute world
 * distances authored against the landscape number — so the same creature sat
 * in front of the band on a desktop and inside it on a phone.
 *
 * The band is now expressed as offsets from the framed distance, and that
 * turns a tuning problem into an invariant: wherever the camera ends up, the
 * subject sits at the same place in the ramp. These two tests are the defect
 * and the invariant, in that order, so a future edit that re-absolutises the
 * band fails on the second one and can read the first to find out why.
 */
describe('Specimen Chamber aerial perspective', () => {
  // The shipped pose's own extents. Literal rather than recomputed: the pose
  // build lives behind three.js and this module is deliberately WebGL-free.
  const BOUNDS = { halfX: 1.902, halfY: 0.89, halfZ: 2.944 };
  const FOV = (46 * Math.PI) / 180;
  const VIEWPORTS: [number, number][] = [
    [320, 568],
    [390, 844],
    [768, 1024],
    [1440, 900],
  ];

  const framed = (w: number, h: number) =>
    Math.max(
      chamberNumber('MIN_CAMERA_DISTANCE'),
      specimenCameraDistance(
        BOUNDS,
        w,
        h,
        FOV,
        chamberNumber('CAMERA_ELEVATION'),
        chamberNumber('CAMERA_AZIMUTH'),
        chamberNumber('FIT_MARGIN')
      )
    );

  /** three's linear fog: smoothstep(near, far, viewDepth). */
  const fogAt = (depth: number, near: number, far: number) => {
    const t = Math.min(1, Math.max(0, (depth - near) / (far - near)));
    return t * t * (3 - 2 * t);
  };

  it('was aspect-dependent under an absolute band — this is the defect', () => {
    // The band that shipped before the fix.
    const factors = VIEWPORTS.map(([w, h]) => fogAt(framed(w, h), 8, 20));
    const spread = Math.max(...factors) - Math.min(...factors);
    // The creature's own centre went from untouched on a desktop to most of
    // the way to the backdrop colour on a phone. That is the wash-out.
    expect(Math.min(...factors)).toBeLessThan(0.05);
    expect(Math.max(...factors)).toBeGreaterThan(0.8);
    expect(spread).toBeGreaterThan(0.75);
  });

  it('holds the authored look at every aspect once the band is anchored', () => {
    const near = chamberNumber('FOG_NEAR_OFFSET');
    const span = chamberNumber('FOG_SPAN');
    const factors = VIEWPORTS.map(([w, h]) => {
      const d = framed(w, h);
      return fogAt(d, d + near, d + near + span);
    });
    // Identical at every viewport, by construction rather than by tuning.
    for (const f of factors) expect(f).toBeCloseTo(factors[0], 10);
    // And the subject's centre is in front of the band, which is what "fog
    // starts past the subject" has always meant.
    expect(factors[0]).toBe(0);
  });

  it('recovers the shipped landscape framing rather than inventing a new one', () => {
    // The two offsets are read OFF the desktop render they replace: the fit
    // returns ~7.63 at every landscape aspect, and the retired band was
    // [8, 20]. So near = 8 - 7.63 and span = 20 - 8, and the 1440 view is
    // unchanged to within a hundredth of a world unit.
    const landscape = framed(1440, 900);
    expect(landscape + chamberNumber('FOG_NEAR_OFFSET')).toBeCloseTo(8, 1);
    expect(chamberNumber('FOG_SPAN')).toBe(12);
  });
});

/**
 * THE OPTICAL AXIS (Home Round 2, item 3).
 *
 * Owner: "the logo, the snake below and the buttons dont appear properly
 * aligned — logo centre, snake offset a bit to the right, buttons centre
 * again." These pin the behaviour that answers it, so a future pose or camera
 * edit cannot quietly put the creature back off-axis.
 */
describe('Specimen Chamber optical axis', () => {
  /** The shipped pose, projected onto the camera's right axis at the framing
   *  distance the chamber actually solves. Numbers verified against the
   *  rendered frame, not against the model that produced them. */
  const SHIPPED = [
    { lateral: -0.399, depth: 7.26, width: 1.276 },
    { lateral: 0.518, depth: 8.256, width: 0.817 },
    { lateral: 1.368, depth: 8.973, width: 0.74 },
    { lateral: 2.239, depth: 9.546, width: 0.664 },
  ];

  it('centres the drawn silhouette rather than a weighted framing point', () => {
    const shift = specimenOpticalShift(SHIPPED);
    // With the aim moved by this much, the leftmost and rightmost angular
    // reaches of the creature are equal and opposite — which is what "on the
    // axis" means for a shape rather than for a point.
    const edge = (piece: (typeof SHIPPED)[number], sign: number) =>
      (piece.lateral - shift + (sign * piece.width) / 2) / piece.depth;
    const low = Math.min(...SHIPPED.map((p) => edge(p, -1)));
    const high = Math.max(...SHIPPED.map((p) => edge(p, 1)));
    expect(low + high).toBeCloseTo(0, 6);
  });

  it('moves the aim toward the trailing body, never toward the head', () => {
    // The head is the NEAREST and largest piece and sits left of the old aim;
    // the body tapers away to screen right. So the correction is positive. A
    // negative result would mean the solve had been pointed at the wrong end
    // of the creature.
    const shift = specimenOpticalShift(SHIPPED);
    expect(shift).toBeGreaterThan(0.3);
    expect(shift).toBeLessThan(0.8);
  });

  it('weights the near head against the far tail by depth, not in world space', () => {
    // The same pose with perspective removed — every piece at one depth — is
    // the orthographic answer, and it over-corrects. Keeping these apart is
    // the whole reason the solve divides by depth; if they ever agree, the
    // division has been dropped.
    const flat = SHIPPED.map((p) => ({ ...p, depth: 8.5 }));
    expect(specimenOpticalShift(flat)).toBeGreaterThan(
      specimenOpticalShift(SHIPPED) + 0.15
    );
  });

  it('is stable and side-effect free', () => {
    const before = JSON.stringify(SHIPPED);
    expect(specimenOpticalShift(SHIPPED)).toBeCloseTo(
      specimenOpticalShift(SHIPPED),
      12
    );
    expect(JSON.stringify(SHIPPED)).toBe(before);
    expect(specimenOpticalShift([])).toBe(0);
  });
});
