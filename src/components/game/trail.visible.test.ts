/**
 * THE TRAIL MUST BE WIRED TO A SCREEN (WP-3.07).
 *
 * WP-3.03 shipped terrain as complete physics that nothing drew, under a fully
 * green suite, because every test asserted the MODEL and the model was never
 * wrong. `terrain.visible.test.ts` is the assertion shape that came out of it.
 * This file is the same shape for the trail.
 *
 * `trailFusion.test.ts` proves the metric is correct. Correct and unmounted is
 * exactly the failure that already happened once: the fusion loop is a pure
 * function called from inside a `useFrame` body, and the component tests in
 * this directory mock `useFrame` as a no-op (see `AimRenderer.test.tsx`), so
 * NOTHING in a rendering test ever executes it. These are deliberately
 * structural, deliberately inelegant, and they check the connections a
 * rendering test cannot reach.
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INTERPOLATION_CAPACITY } from '@/lib/game/interpolationBuffer';

const root = process.cwd();
const read = (relative: string) => readFileSync(join(root, relative), 'utf8');

/** Source with block and line comments removed, for assertions about what the
 *  code DOES rather than about what it says. */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const METRIC = 'src/lib/game/trailFusion.ts';
const RENDERER = 'src/components/game/InstancedSnake.tsx';
const SHAPE = 'src/components/game/SnakeModel.tsx';
const PAGE = 'src/app/game/page.tsx';

describe('the metric reaches the renderer', () => {
  it('the metric exists as its own pure module', () => {
    expect(() => read(METRIC)).not.toThrow();
  });

  it('the renderer imports it and folds it', () => {
    const renderer = read(RENDERER);
    expect(renderer).toContain("from '@/lib/game/trailFusion'");
    expect(renderer).toContain('updateTrailFusion(');
  });

  it('the fold is gated on the engine TICK, not on the frame', () => {
    // The measurement is defined on integer grid cells and cannot change
    // between ticks. Re-folding per frame would burn the work 6-15x over and,
    // worse, would make the hysteresis threshold mean frames instead of ticks.
    const renderer = read(RENDERER);
    expect(renderer).toMatch(/tickAt !== lastTickAtRef\.current/);
    const foldAt = renderer.indexOf('updateTrailFusion(');
    const gateAt = renderer.lastIndexOf(
      'tickAt !== lastTickAtRef.current',
      foldAt
    );
    expect(gateAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(foldAt);
  });

  it('the renderer resets the metric when the run does', () => {
    // Committed levels are keyed by cell and survive a run. Without this the
    // next snake inherits the dead one's coil on every cell it re-enters.
    expect(read(RENDERER)).toContain('resetTrailFusion(');
  });

  it('the fusion level actually drives geometry AND colour', () => {
    // The whole design is that fusion changes what the body LOOKS like. A
    // metric computed and then not read is the terrain defect in miniature.
    const renderer = read(RENDERER);
    expect(renderer).toContain('getTrailFootprint(');
    expect(renderer).toContain('getTrailTone(');
    expect(renderer).toMatch(/setMatrixAt\(/);
    expect(renderer).toMatch(/setColorAt\(/);
  });

  it('the emission loop is reachable from a test, and the frame calls it', () => {
    // `useFrame` is mocked as a no-op by every component test here and jsdom
    // has no WebGL context, so a loop body written inline in that callback is
    // unreachable by any test that could exist. Extracting it is what makes
    // `InstancedSnake.trail.test.ts` possible - and that file is the one that
    // would catch a trail drawn in the wrong place or not at all.
    const renderer = read(RENDERER);
    expect(renderer).toMatch(/export function writeTrailInstances\(/);
    expect(renderer).toMatch(/mesh\.count = writeTrailInstances\(/);
  });

  it('colours are written in the same pass as matrices', () => {
    // The old cache rewrote instance colours only when `count` or the strain
    // signature changed. Fusion changes per TICK without the length changing,
    // and the wrap-seam guard can change the instance count mid-tick, so any
    // index-keyed colour cache goes stale in precisely the cases that matter.
    const renderer = read(RENDERER);
    expect(renderer).not.toContain('lastEnergyCountRef');
    expect(renderer).not.toContain('lastStrainSignatureRef');
  });
});

describe('the game scene threads what the metric needs', () => {
  it('the props exist and are optional (three mount sites must compile)', () => {
    const renderer = read(RENDERER);
    expect(renderer).toMatch(/terrain\?:\s*readonly TerrainBlock\[\]/);
    expect(renderer).toMatch(/wrapActive\?:\s*boolean/);
  });

  it('terrain reaches BOTH snake variants', () => {
    // Terrain packs like a wall. If only the GLB variant got it, the metric
    // would silently change meaning for the first few hundred milliseconds of
    // every run, while the model streams.
    const page = read(PAGE);
    expect(page).toMatch(/<InstancedSnake[\s\S]{0,400}terrain=\{terrain\}/);
    expect(page).toMatch(
      /<InstancedSnakeFallback[\s\S]{0,400}terrain=\{terrain\}/
    );
  });

  it('the wrap state reaches BOTH snake variants', () => {
    // An OPEN arena edge is a passage, not a backstop. Counting it would pay
    // the player for hugging the one seam that is not spending any space.
    const page = read(PAGE);
    expect(page).toMatch(
      /<InstancedSnake[\s\S]{0,400}wrapActive=\{torus\}/
    );
    expect(page).toMatch(
      /<InstancedSnakeFallback[\s\S]{0,400}wrapActive=\{torus\}/
    );
  });

  it('only SOLID terrain packs', () => {
    // Forming blocks are flat decals the snake crosses. Counting them would
    // promise a fusion the player has not earned and cannot rely on.
    expect(read(METRIC)).toContain('if (!block.solid) continue;');
  });
});

describe('the failure modes the design named explicitly', () => {
  it('the wrap seam is guarded, or a joint draws a bar across the arena', () => {
    // Two "consecutive" segments straddling the COSMIC seam are a board
    // apart. An unguarded link between them is a bar across the whole board.
    const renderer = read(RENDERER);
    expect(renderer).toContain('SEAM_DISTANCE');
    expect(renderer).toMatch(/SEAM_DISTANCE\) continue;/);
  });

  it('the instance budget covers boxes AND links, so nothing is dropped', () => {
    // One box per cell plus one link per joint is 2 * (segments - 1). A
    // 400-cell snake is exactly when the trail matters most; silently
    // truncating it there would be the worst possible place to be wrong.
    const renderer = read(RENDERER);
    expect(renderer).toMatch(
      /TRAIL_INSTANCE_CAPACITY = INTERPOLATION_CAPACITY \* 2/
    );
    // Both the args= allocation and the loop bound must use it.
    expect(renderer).toMatch(/args=\{\[bodyGeometry, bodyMaterial, TRAIL_INSTANCE_CAPACITY\]\}/);
    expect(renderer).toMatch(/n < TRAIL_INSTANCE_CAPACITY/);
    expect(INTERPOLATION_CAPACITY * 2).toBeGreaterThanOrEqual(
      2 * (INTERPOLATION_CAPACITY - 1)
    );
  });

  it('the middle is never snapped to the grid', () => {
    // 5-10 Hz is the worst flicker band there is, and a snapped middle would
    // gap a full cell at the head/trail junction every tick. Every drawn
    // position must come from the interpolated buffer.
    const renderer = read(RENDERER);
    expect(renderer).toContain('getInterpolatedX(buffer');
    expect(renderer).toContain('getInterpolatedZ(buffer');
    expect(renderer).not.toMatch(/Math\.round\(getInterpolated/);
  });

  it('quiet is taken from height, never from contrast', () => {
    // The old ENERGY_MIN of 0.55 made the cells about to free up the hardest
    // ones on the board to see - backwards, because those are exactly the
    // cells a player routes through.
    const shape = read(SHAPE);
    expect(shape).toMatch(/export const ENERGY_MIN = 0\.88/);
    expect(shape).toContain('TRAIL_HEIGHT_TRUNK');
    expect(shape).toContain('TRAIL_HEIGHT_HEAD');
  });

  it('nothing flattens to zero - a cast shadow is a real occupancy cue', () => {
    const shape = read(SHAPE);
    const match = shape.match(/export const TRAIL_HEIGHT_TAIL = ([\d.]+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThan(0);
  });
});

describe('THE LINE NOT TO CROSS', () => {
  it('nothing shades the free region or finds the largest open area', () => {
    // The ruling, verbatim: "do not shade the free region, and do not show the
    // largest contiguous open area. Feedback on how well YOU packed builds
    // intuition; showing where the safe space is replaces it."
    //
    // A largest-contiguous-open-area readout needs a flood fill, so this is a
    // real tripwire rather than a slogan: the day someone adds a queue or a
    // visited set to this module, this test asks them why. Comments are
    // stripped first - the module's own doc explains the ruling using these
    // very words, and prose about the line is not crossing it.
    const code = stripComments(read(METRIC));
    expect(code).not.toMatch(/floodFill|reachable|largestRegion|visited/i);
    expect(code).not.toMatch(/\w*[Qq]ueue\b/);
  });
});
