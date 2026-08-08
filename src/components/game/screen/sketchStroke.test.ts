/**
 * THE BOIL IS A CLOCK, AND THE STROKE IS A CACHE.
 *
 * jsdom has no 2D context, so the canvases these functions draw into cannot be
 * rasterised here and the pixels are not what this file checks. What it checks
 * is everything the renderer depends on that is NOT pixels: the frame the boil
 * lands on at a given time, that the cycle actually cycles rather than sitting
 * on one frame, and that a missing canvas degrades to "no textures" instead of
 * throwing inside a `useFrame` — which on a board is not a blank rail, it is a
 * dead render loop.
 */

import {
  SKETCH_BOIL_FPS,
  SKETCH_BOIL_FRAMES,
  boilFrameAt,
  getSketchCellBoil,
  getSketchRailBoil,
} from './sketchStroke';

describe('the boil', () => {
  it('holds each frame for one tick of its own framerate', () => {
    const tick = 1 / SKETCH_BOIL_FPS;
    expect(boilFrameAt(0)).toBe(0);
    expect(boilFrameAt(tick * 0.99)).toBe(0);
    expect(boilFrameAt(tick)).toBe(1);
    expect(boilFrameAt(tick * 2)).toBe(2);
  });

  it('cycles rather than running away', () => {
    const tick = 1 / SKETCH_BOIL_FPS;
    expect(boilFrameAt(tick * SKETCH_BOIL_FRAMES)).toBe(0);
    const seen = new Set<number>();
    for (let i = 0; i < 60; i += 1) seen.add(boilFrameAt(i * tick));
    expect(seen.size).toBe(SKETCH_BOIL_FRAMES);
    for (const frame of seen) {
      expect(frame).toBeGreaterThanOrEqual(0);
      expect(frame).toBeLessThan(SKETCH_BOIL_FRAMES);
    }
  });

  it('runs slow enough to read as drawn and not as a flicker', () => {
    // Three frames at 10fps is a 3.3Hz redraw of the LINE, well under the
    // 2.5Hz ceiling the aim renderer holds for animated BRIGHTNESS: nothing
    // here pulses luminance, the stroke simply changes shape.
    expect(SKETCH_BOIL_FRAMES).toBeGreaterThanOrEqual(3);
    expect(SKETCH_BOIL_FPS).toBeLessThanOrEqual(12);
  });
});

describe('the stroke without a canvas', () => {
  it('returns frames without throwing, whatever the host can draw', () => {
    // The renderer calls these at mount. Under jsdom `getContext('2d')` is
    // null, which is exactly the degraded host this has to survive.
    expect(() => getSketchRailBoil('#a201ae')).not.toThrow();
    expect(() => getSketchCellBoil('#a201ae')).not.toThrow();
    expect(Array.isArray(getSketchRailBoil('#a201ae'))).toBe(true);
    expect(Array.isArray(getSketchCellBoil('#a201ae'))).toBe(true);
  });

  it('draws a colour once and hands back the same frames after that', () => {
    // One session, one set of canvases — the same discipline the firefly's
    // glow sprite follows. A rail that re-rasterised per mount would allocate
    // during play.
    expect(getSketchRailBoil('#a201ae')).toBe(getSketchRailBoil('#a201ae'));
    expect(getSketchCellBoil('#a201ae')).toBe(getSketchCellBoil('#a201ae'));
    expect(getSketchRailBoil('#a201ae')).not.toBe(getSketchRailBoil('#7d0275'));
  });
});
