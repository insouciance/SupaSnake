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

  it('the earned full-fusion seal has a bounded, separately testable pass', () => {
    const renderer = read(RENDERER);
    expect(renderer).toContain('writeCoilSealInstances(');
    expect(renderer).toContain('fusion.sealStartedAt[cell]');
    expect(renderer).toContain('COIL_SEAL_DURATION_SECONDS');
    // One instanced effect mesh, not a particle system or a mesh per cell.
    expect(renderer).toMatch(/seal\.count = writeCoilSealInstances\(/);
    expect(renderer).toContain('COIL_SEAL_INSTANCE_CAPACITY');
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
    expect(renderer).toMatch(/revivePhaseActive\?:\s*boolean/);
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

  it('the post-revive phase reaches both render paths', () => {
    // The phase is a real collision-rule change, not hidden implementation
    // mercy. Both the streamed model and its fallback must show the same head
    // shell, or the rule appears/disappears while the GLB loads.
    const page = read(PAGE);
    expect(page).toMatch(
      /<InstancedSnake[\s\S]{0,500}revivePhaseActive=\{revivePhaseTicksRemaining > 0\}/
    );
    expect(page).toMatch(
      /<InstancedSnakeFallback[\s\S]{0,500}revivePhaseActive=\{revivePhaseTicksRemaining > 0\}/
    );
    expect(page).toContain('setRevivePhaseTicks(state.revivePhaseTicksRemaining)');
  });

  it('only SOLID terrain packs', () => {
    // Forming blocks are flat decals the snake crosses. Counting them would
    // promise a fusion the player has not earned and cannot rely on.
    expect(read(METRIC)).toContain('if (!block.solid) continue;');
  });
});

describe('the failure modes the design named explicitly', () => {
  it('lifts the trail off the floor plane, and terrain with it', () => {
    // The arena platform's top face is at exactly y = 0. Anything drawn flush
    // on it z-fights across its whole footprint. Asserted structurally in both
    // renderers because terrain has the identical geometry and has never been
    // looked at by a human - it would have shipped the same banding on CYBER.
    const renderer = read(RENDERER);
    expect(renderer).toContain('FLOOR_CLEARANCE');
    expect(renderer).toContain(
      'centerYFromBase(FLOOR_CLEARANCE, height)'
    );
    expect(renderer).toContain('SNAKE_HEAD_CENTER_Y');
    const terrain = read('src/components/game/TerrainBlocks.tsx');
    expect(terrain).toContain('FLOOR_CLEARANCE');
  });

  it('draws no joint links, so the wrap seam cannot be bridged at all', () => {
    // This used to assert a SEAM_DISTANCE guard: two "consecutive" segments
    // straddling the COSMIC seam are a board apart, and an unguarded LINK
    // between them draws a bar across the whole arena.
    //
    // The joint pass is deleted (2026-07-28 - it was the flickering the owner
    // reported on first play), and with it the only thing that could ever span
    // two cells. Each cell is drawn on its own centre, so a seam-straddling
    // pair simply draws two boxes a board apart, which is the truth.
    //
    // Asserted as the ABSENCE of the pass rather than the presence of a guard,
    // because a guard for a thing that no longer exists is exactly the kind of
    // dead assertion that makes a suite look greener than it is.
    const renderer = read(RENDERER);
    expect(renderer).not.toMatch(/_linkQuaternion\.setFromAxisAngle/);
    expect(renderer).not.toContain('MIN_LINK_LENGTH');
  });

  it('the instance budget covers every body cell, so nothing is dropped', () => {
    // One box per cell is `segments - 1`. A 400-cell snake is exactly when the
    // trail matters most; silently truncating it there would be the worst
    // possible place to be wrong.
    const renderer = read(RENDERER);
    expect(renderer).toMatch(/TRAIL_INSTANCE_CAPACITY = GRID_SIZE \* GRID_SIZE;/);
    // Both the GPU allocation and the emission guard must use the board-cell
    // capacity. Logical segments may exceed 400; unique occupied cells cannot.
    expect(renderer).toMatch(/args=\{\[bodyGeometry, bodyMaterial, TRAIL_INSTANCE_CAPACITY\]\}/);
    expect(renderer).toMatch(/instance >= TRAIL_INSTANCE_CAPACITY/);
    expect(renderer).toContain('updateTrailCells(cells, buffer)');
  });

  it('interpolates the head while persistent body cells stay cell-keyed', () => {
    const renderer = read(RENDERER);
    expect(renderer).toContain('getInterpolatedX(buffer');
    expect(renderer).toContain('getInterpolatedZ(buffer');
    expect(renderer).toContain('trailCellX(cells, cell)');
    expect(renderer).toContain('trailCellZ(cells, cell)');
    expect(renderer).toContain('cells.previousRepresentative[cell]');
    expect(renderer).toContain('(count - buffer.prevCount) * eased');
  });

  it('quiet is taken from height, never from contrast', () => {
    // The old ENERGY_MIN of 0.55 made the cells about to free up the hardest
    // ones on the board to see - backwards, because those are exactly the
    // cells a player routes through.
    const shape = read(SHAPE);
    expect(shape).toMatch(/export const ENERGY_MIN = 0\.94/);
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
