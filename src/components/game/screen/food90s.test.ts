import * as THREE from 'three';
import {
  APPLE_TAPER,
  BERRY_TAPER,
  DONUT_FOOTPRINT,
  FOOD_CHIP_INK_HULL_WIDTH,
  FOOD_EMISSIVE_INTENSITY,
  FOOD_INK_HULL_WIDTH,
  FOOD_PALETTE,
  FOOD_STATE_SIGNATURES,
  FOOD_TONES,
  FOOD_TONES_FLAT_FALL,
  appleBodyGeometry,
  berryBodyGeometry,
  countDistinctChannels,
  createTaperedFoodGeometry,
  donutGeometry,
  toneLuminance,
} from './food90s';
import { SNAKE_STYLE_PROFILES, GUIDE_PALETTE } from './snake90s';

/**
 * The food's style laws, asserted rather than described.
 *
 * Every test here stands for a sentence in the brief that a screenshot can
 * only show for one board, one tier and one moment. The screenshots decide
 * whether it looks right; these decide whether it can stop being right without
 * anyone noticing.
 */

describe('90s cartoon foods - state distinctness', () => {
  const states = Object.entries(FOOD_STATE_SIGNATURES);

  /**
   * THE LAW: no two states are separated by brightness alone.
   *
   * Brightness is the channel that does not survive - the floor tier drops the
   * composer, a light board theme eats into it, and bloom counterfeits it at
   * the full look and cannot at the floor. Two independent channels means a
   * state is still legible when either one is compromised.
   */
  it('separates every pair of states on at least two survivable channels', () => {
    for (let i = 0; i < states.length; i += 1) {
      for (let j = i + 1; j < states.length; j += 1) {
        const [nameA, a] = states[i];
        const [nameB, b] = states[j];
        expect({
          pair: `${nameA} vs ${nameB}`,
          channels: countDistinctChannels(a, b),
        }).toEqual({ pair: `${nameA} vs ${nameB}`, channels: 3 });
      }
    }
  });

  it('gives every state a silhouette, a hue family and a motion of its own', () => {
    const silhouettes = states.map(([, s]) => s.silhouette);
    const hues = states.map(([, s]) => s.hue);
    const motions = states.map(([, s]) => s.motion);
    expect(new Set(silhouettes).size).toBe(states.length);
    expect(new Set(hues).size).toBe(states.length);
    expect(new Set(motions).size).toBe(states.length);
  });

  /**
   * The hole is the strongest signal on the board, inherited from the
   * incumbent's gold ring. If the donut ever stops being an annulus, the
   * golden state loses the one cue that reads before colour does.
   */
  it('keeps the golden state the only annulus', () => {
    const annuli = states.filter(([, s]) => s.silhouette === 'annulus');
    expect(annuli.map(([name]) => name)).toEqual(['donut']);
  });

  /** Food may never crowd the turn the player is about to make into its cell. */
  it('holds every state under one cell of footprint', () => {
    for (const [name, signature] of states) {
      expect({ name, fits: signature.footprint < 1 }).toEqual({
        name,
        fits: true,
      });
    }
  });

  it('declares the donut footprint its geometry actually has', () => {
    expect(FOOD_STATE_SIGNATURES.donut.footprint).toBeCloseTo(
      DONUT_FOOTPRINT,
      10
    );
  });
});

describe('90s cartoon foods - the tone table', () => {
  /**
   * Hard bands need an ORDER. Rim above top above side above away above down,
   * strictly - a table that ties anywhere has two bands the eye cannot tell
   * apart, which is a band that was paid for and never seen.
   */
  it('steps strictly downward from rim to down', () => {
    const ordered = [
      FOOD_TONES.rim,
      FOOD_TONES.top,
      FOOD_TONES.side,
      FOOD_TONES.away,
      FOOD_TONES.down,
    ].map(toneLuminance);
    for (let i = 1; i < ordered.length; i += 1) {
      expect(ordered[i]).toBeLessThan(ordered[i - 1]);
    }
  });

  /**
   * "Shadows: dark ORANGE, never grey." A neutral multiplier would drain the
   * hue out of every shaded face and hand the board a grey food.
   */
  it('keeps every darkening band warm rather than neutral', () => {
    for (const band of [FOOD_TONES.side, FOOD_TONES.away, FOOD_TONES.down]) {
      const [r, g, b] = band.mul;
      expect(r).toBeGreaterThan(g);
      expect(g).toBeGreaterThan(b);
    }
  });

  /**
   * The rim is the only band that goes UP, and it has to: the base colour is
   * already the top band, so there is nothing above 1.0 to multiply toward.
   */
  it('lifts the rim with an additive warm key, not a multiplier', () => {
    expect(FOOD_TONES.rim.mul).toEqual([1, 1, 1]);
    expect(FOOD_TONES.rim.add).toBeDefined();
    const [r, g, b] = FOOD_TONES.rim.add ?? [0, 0, 0];
    expect(r).toBeGreaterThan(0);
    expect(r).toBeGreaterThan(b);
    expect(g).toBeGreaterThan(b);
  });

  /**
   * The fall is a gradient WITHIN one band. If it ever grew past the gap to
   * the next band down, a lit face would bottom out looking like a shaded one
   * and the whole 3/4 read would come apart.
   */
  it('keeps the top-lit fall inside the gap to the next band', () => {
    const sideToAway =
      1 - toneLuminance(FOOD_TONES.away) / toneLuminance(FOOD_TONES.side);
    expect(FOOD_TONES.fall).toBeLessThan(sideToAway);
    expect(FOOD_TONES.fall).toBeGreaterThan(0);
  });

  /** The flat variant exists for parts that are not a unit tall. */
  it('offers the same bands with the fall switched off', () => {
    expect(FOOD_TONES_FLAT_FALL.fall).toBe(0);
    expect(FOOD_TONES_FLAT_FALL.side).toEqual(FOOD_TONES.side);
  });
});

describe('90s cartoon foods - the ink line', () => {
  /**
   * THE RESEMBLANCE LAW, as a number. The food carries the shipped 90s
   * character's outline weight, so a fruit and a body cube are drawn with one
   * pen. Pinned against the profile rather than restated, so the two cannot
   * drift apart in silence.
   */
  it('wears the shipped snake outline weight', () => {
    expect(FOOD_INK_HULL_WIDTH).toBe(
      SNAKE_STYLE_PROFILES.ninetiesGuide.inkHullWidth
    );
  });

  it('wears the snake warm ink, never a cool black', () => {
    expect(FOOD_PALETTE.ink).toBe(GUIDE_PALETTE.ink);
    expect(FOOD_PALETTE.ink).toBe(
      SNAKE_STYLE_PROFILES.ninetiesGuide.inkColor
    );
  });

  /**
   * The hull pushes by a world constant, so on a part thinner than twice that
   * constant the line meets itself and eats the part.
   */
  it('gives small parts a line thin enough not to swallow them', () => {
    expect(FOOD_CHIP_INK_HULL_WIDTH).toBeLessThan(FOOD_INK_HULL_WIDTH);
  });
});

describe('90s cartoon foods - construction', () => {
  function extents(geometry: THREE.BufferGeometry) {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox as THREE.Box3;
    return {
      x: Math.max(Math.abs(box.min.x), Math.abs(box.max.x)),
      y: Math.max(Math.abs(box.min.y), Math.abs(box.max.y)),
      z: Math.max(Math.abs(box.min.z), Math.abs(box.max.z)),
    };
  }

  /**
   * The taper moves the silhouette and nothing else. Height must stay exactly
   * unit, because mesh scale is the sole authority on how much of a cell a
   * food claims - a geometry that quietly grew would break that contract for
   * every caller at once.
   */
  it('keeps tapered bodies exactly unit-tall and never wider than unit', () => {
    for (const geometry of [appleBodyGeometry, berryBodyGeometry]) {
      const size = extents(geometry);
      expect(size.y).toBeCloseTo(0.5, 6);
      expect(size.x).toBeLessThanOrEqual(0.5 + 1e-6);
      expect(size.z).toBeLessThanOrEqual(0.5 + 1e-6);
    }
  });

  /**
   * Cel banding is a branch on the world normal, so it only draws hard bands
   * where the normal is piecewise constant. The taper must therefore leave the
   * box's analytic normals alone - a re-derived normal would tilt with the
   * slope and split one face across two bands.
   */
  it('tapers positions without disturbing the box normals', () => {
    const plain = createTaperedFoodGeometry(0.13, () => 1);
    const tapered = createTaperedFoodGeometry(0.13, APPLE_TAPER);
    const a = plain.getAttribute('normal').array;
    const b = tapered.getAttribute('normal').array;
    expect(Array.from(b)).toEqual(Array.from(a));
    plain.dispose();
    tapered.dispose();
  });

  /** The apple is a barrel with a shoulder: widest above its middle. */
  it('draws the apple widest between its ends', () => {
    expect(APPLE_TAPER(0)).toBeGreaterThan(APPLE_TAPER(-0.5));
    expect(APPLE_TAPER(0)).toBeGreaterThan(APPLE_TAPER(0.5));
    expect(APPLE_TAPER(0.5)).toBeLessThan(APPLE_TAPER(-0.5));
  });

  /** The berry stands on a point it could fall off. */
  it('draws the berry wide-shouldered and drawn to a blunt point', () => {
    expect(BERRY_TAPER(0.5)).toBeGreaterThan(BERRY_TAPER(-0.5));
    expect(BERRY_TAPER(-0.5)).toBeLessThan(0.4);
  });

  /** A square tube cross-section is what lets a torus join a family of cubes. */
  it('keeps the donut tube faceted rather than round', () => {
    const parameters = donutGeometry.parameters;
    expect(parameters.radialSegments).toBe(4);
    expect(parameters.tube).toBeGreaterThan(0);
    expect(parameters.radius).toBeGreaterThan(parameters.tube);
  });
});

describe('90s cartoon foods - the luminance-neutral law', () => {
  /**
   * The incumbent ran emissive at 1.6 with the emissive colour set to the base
   * colour: a flat unlit add larger than the entire range the bands work over,
   * which erased them and left the read leaning on bloom. The floor tier runs
   * with the composer off, so the read may not depend on it.
   */
  it('keeps emissive far below the band range it would otherwise erase', () => {
    expect(FOOD_EMISSIVE_INTENSITY).toBeLessThan(0.5);
    const bandRange =
      toneLuminance(FOOD_TONES.top) - toneLuminance(FOOD_TONES.down);
    expect(FOOD_EMISSIVE_INTENSITY).toBeLessThan(bandRange);
  });
});
