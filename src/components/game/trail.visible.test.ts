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
const AIM = 'src/components/game/AimRenderer.tsx';
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
    // every run, while the model streams. The combined inventory also includes
    // reducer-authored Genome seals/scars, which are just as solid.
    const page = read(PAGE);
    // ET-3 moved the claimed-cell list off the per-tick board projection and
    // onto `genomeV2OccupiedCells`, which reads the same permanent terrain
    // without needing the simulation tick. Both halves are asserted so the
    // inventory cannot silently become empty: the source of the cells, and
    // their arrival in the combined list.
    expect(page).toContain('genomeV2OccupiedCells(genomeState)');
    expect(page).toContain('for (const cell of genomeOccupiedCells)');
    expect(page).toMatch(/<InstancedSnake[\s\S]{0,400}terrain=\{snakeTerrain\}/);
    expect(page).toMatch(
      /<InstancedSnakeFallback[\s\S]{0,400}terrain=\{snakeTerrain\}/
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
    // ET-3 binds the same predicate one line earlier, as a store selector, so
    // that the board subscribes to the BOOLEAN rather than to a countdown that
    // moves every tick. The chain is asserted end to end — engine mirror,
    // selector, both render paths — which is stricter than pinning the
    // expression inline was.
    expect(page).toContain('setRevivePhaseTicks(state.revivePhaseTicksRemaining)');
    expect(page).toMatch(
      /revivePhaseActive = useGameStore\(\s*\(state\) => state\.revivePhaseTicksRemaining > 0\s*\)/
    );
    expect(page).toMatch(
      /<InstancedSnake[\s\S]{0,500}revivePhaseActive=\{revivePhaseActive\}/
    );
    expect(page).toMatch(
      /<InstancedSnakeFallback[\s\S]{0,500}revivePhaseActive=\{revivePhaseActive\}/
    );
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

  /**
   * ET-1/ET-1b. The unit tests prove the profile; this proves it is WIRED -
   * the same class of gap this file exists for. An arrival module that nothing
   * imports would pass every test it owns and change nothing on screen.
   */
  it('the head and the trail are both drawn on the active arrival clock', () => {
    const renderer = stripComments(read(RENDERER));
    expect(renderer).toContain("from '@/lib/game/arrivalEasing'");
    // The head's position blend is the re-timed one, not raw elapsed alpha.
    expect(renderer).toMatch(/const motion = arrivalMotion\(alpha, mode\)/);
    // ...and the mode picks the SAMPLER as well as the timing. Glide's motion
    // above 1 is travel toward the next cell; handed to getInterpolatedX it
    // would extrapolate along the INCOMING direction and be wrong at exactly
    // the corners the profile exists to keep continuous.
    expect(renderer).toMatch(
      /mode === 'glide'\s*\?\s*getGlideX\(buffer, 0, motion\)\s*:\s*getInterpolatedX\(buffer, 0, motion\)/
    );
    expect(renderer).toMatch(
      /mode === 'glide'\s*\?\s*getGlideZ\(buffer, 0, motion\)\s*:\s*getInterpolatedZ\(buffer, 0, motion\)/
    );
    // ...and the body runs on that same clock. Both `eased` bindings (trail
    // and coil seal) come from the arrival transition; a surviving literal
    // smoothstep here would be a body accordioning under the head.
    expect(renderer).not.toMatch(/alpha \* alpha \* \(3 - 2 \* alpha\)/);
    expect(
      renderer.match(/const eased = arrivalTransition\(alpha, (mode|getArrivalMode\(\))\)/g)
    ).toHaveLength(2);
  });

  /**
   * GLIDE-2 defect 2, wired. The geometry is proven in InstancedSnake.trail;
   * this proves the neck is IDENTIFIED and fed, because a rear-anchored
   * extrusion nothing ever passes a travel axis to is just the old centre
   * scale with three more parameters.
   */
  it('extrudes the neck out of the tile the head just left', () => {
    const renderer = stripComments(read(RENDERER));
    // The neck is the previous head cell, and only under a glide that moved.
    expect(renderer).toContain(
      "const necking = mode === 'glide' && buffer.headMoved"
    );
    expect(renderer).toMatch(
      /trailCellIndex\(cells, buffer\.prev\[0\], buffer\.prev\[1\]\)/
    );
    // Travel axis is the head's own step, so a torus crossing extrudes toward
    // the seam rather than backwards across the board.
    expect(renderer).toContain('getHeadStepX(buffer)');
    expect(renderer).toContain('getHeadStepZ(buffer)');
    // Rear pinned, front chasing: the centre shift is half the missing length.
    expect(renderer).toContain('const shift = (front - half) / 2');
  });

  it('THE LEAD samples the head on the same clock the head is drawn with', () => {
    // A telegraph bound to the head must not read a different curve than the
    // head, or the guide detaches from the creature it belongs to for most of
    // every interval - which is the ET-1 defect, reintroduced one layer up.
    //
    // ONE composition, three consumers (the lead, the rails, the drone). Three
    // copies is how one of them drifts onto a different curve; that the count
    // is pinned here is the point.
    const aim = stripComments(read(AIM));
    expect(aim).toContain("from '@/lib/game/arrivalEasing'");
    expect(aim.match(/arrivalMotion\(/g)).toHaveLength(1);
    expect(aim.match(/sampleDrawnHead\(buffer, /g)).toHaveLength(3);
    expect(aim).toContain('getGlideX(buffer, 0, motion)');
    expect(aim).toContain('getGlideZ(buffer, 0, motion)');
    expect(aim).not.toMatch(/const alpha = getAlpha\(buffer, (now|performance)/);
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
