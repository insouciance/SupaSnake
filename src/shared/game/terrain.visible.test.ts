/**
 * TERRAIN MUST BE DRAWN (WP-3.05).
 *
 * WP-3.03 shipped terrain as complete physics — scheduled by
 * `placeDueTerrain`, solidified by `tickTerrain`, lethal in the engine's
 * collision chain — and NOTHING in the entire UI drew it. `arena: CYBER_ARENA`
 * therefore put six invisible instant-death blocks on the outer ring every
 * five foods, live in production.
 *
 * Every terrain test passed the whole time. That is the point of this file.
 * `terrain.test.ts` asserts `blocksDueAt`, `formingTicksForSeconds`, `ringOf` and
 * `nextTerrainCells`; `terrain.engine.test.ts` asserts the engine kills you.
 * All of them assert the MODEL, and the model was never wrong. The defect
 * lived in the gap between a correct model and a screen, which no model test
 * can see.
 *
 * So these are deliberately STRUCTURAL tests. They are not elegant. They are
 * the shape of assertion that would actually have caught it: a lethal
 * primitive must be connected to something that renders, and the connection is
 * checked rather than assumed.
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COSMIC_CONSTELLATION, getRuleset, type DynastyName } from './rulesets';
import { STRAIN_PHYSICS } from './strains';

const root = process.cwd();
const read = (relative: string) => readFileSync(join(root, relative), 'utf8');

const DYNASTIES: DynastyName[] = ['CYBER', 'PRIMAL', 'COSMIC'];

describe('a lethal primitive is connected to a renderer', () => {
  it('a terrain renderer exists at all', () => {
    // The original bug in one line: `grep -ri terrain src/components` was empty.
    expect(() => read('src/components/game/TerrainBlocks.tsx')).not.toThrow();
  });

  it('the game scene mounts it', () => {
    const page = read('src/app/game/page.tsx');
    expect(page).toContain('TerrainBlocks');
    expect(page).toMatch(/<TerrainBlocks[\s\S]{0,120}terrain=/);
  });

  it('the engine pushes terrain into the store every tick', () => {
    const page = read('src/app/game/page.tsx');
    expect(page).toContain('setTerrain(state.terrain)');
  });

  it('the store carries terrain', () => {
    const store = read('src/lib/store/gameStore.ts');
    expect(store).toContain('setTerrain');
    expect(store).toMatch(/terrain: TerrainBlock\[\]/);
  });

  it('the tick handler sets terrain OUTSIDE the genome gate', () => {
    // Terrain belongs to a ruleset's arena, not to buildcraft. Setting it
    // inside `if (gameRef.current.getGenome())` would leave every non-genome
    // run with invisible blocks again — the same bug, narrower.
    const page = read('src/app/game/page.tsx');
    const setAt = page.indexOf('setTerrain(state.terrain)');
    const gateAt = page.indexOf('if (gameRef.current.getGenome()) {', setAt - 2000);
    expect(setAt).toBeGreaterThan(-1);
    expect(gateAt).toBeGreaterThan(setAt);
  });

  it('getState clones terrain, or the renderer never updates', () => {
    // A stable array reference means zustand sees no change and React never
    // re-renders: terrain would be computed, lethal, and still invisible.
    const engine = read('src/lib/game/SnakeGameLogic.ts');
    expect(engine).toMatch(/terrain: this\.state\.terrain\.map\(/);
  });
});

describe('no dynasty may arm an arena without a renderer', () => {
  it.each(DYNASTIES)(
    '%s: if it PRODUCES terrain by any route, the renderer is present',
    (dynasty) => {
      const ruleset = getRuleset(dynasty);
      // Two RULESET routes, which is why this reads `||` rather than just
      // `arena`. CYBER SCHEDULES terrain (`arena`); COSMIC produces it from
      // play — every star its constellation window closes on calcifies — with
      // no schedule anywhere. A gate that only knew about `arena` would have
      // let COSMIC ship the WP-3.03 defect a second time.
      //
      // There is a THIRD source this loop structurally cannot see: Fortress
      // is build state, not ruleset state, so it gets its own case below.
      if (!ruleset.arena && !ruleset.constellation) return;
      expect(() =>
        read('src/components/game/TerrainBlocks.tsx')
      ).not.toThrow();
      expect(read('src/app/game/page.tsx')).toContain('TerrainBlocks');
    }
  );

  it('every non-arena source lays blocks through ONE engine path', () => {
    // WP-3.11 and WP-3.13 both arrived here independently: Fortress petrifies
    // the body cells it just shed, COSMIC calcifies the star cells whose
    // window just closed, and NEITHER uses the arena's ring selector. Each
    // had its own copy of "dedupe against existing terrain, push a block with
    // a forming phase" until they were merged.
    //
    // They compose through `placeTerrainAt` now, and that is asserted rather
    // than assumed, because the duplication is what this file exists to
    // prevent one level down: two copies of the block-laying code are two
    // places for the renderer connection to be forgotten.
    const engine = read('src/lib/game/SnakeGameLogic.ts');
    expect(engine).toContain('private placeTerrainAt(');
    expect(engine).toMatch(
      /private placeTerrainAt\([\s\S]{0,2000}this\.state\.terrain\.push\(/
    );
    // ...and it is the ONLY place that pushes a block.
    expect(engine.match(/this\.state\.terrain\.push\(/g)).toHaveLength(1);
  });

  it("PRIMAL's Fortress reaches the same renderer without an arena", () => {
    // WP-3.11. The rule this file holds is "a lethal primitive is connected to
    // something that renders", and the `it.each` above checks it via
    // `ruleset.arena` - which Fortress does not have. It would therefore have
    // shipped invisible under a green suite, which is precisely the defect
    // this file was written after.
    //
    // The connection is structural: Fortress lays the SAME `TerrainBlock`
    // shape into the SAME `state.terrain`, and the tick handler sets terrain
    // OUTSIDE the genome gate (asserted above), so a build-driven block is
    // drawn by the ruleset-driven renderer.
    const engine = read('src/lib/game/SnakeGameLogic.ts');
    expect(engine).toContain('private applyPetrify(');
    expect(engine).toMatch(/applyPetrify[\s\S]{0,3000}this\.placeTerrainAt\(/);
    expect(read('src/app/game/page.tsx')).toContain('TerrainBlocks');
  });

  it('Fortress blocks arrive with a forming phase too', () => {
    // The same fairness argument the arena's schedule is held to, held against
    // the dial rather than the schedule, because Fortress has no schedule.
    expect(STRAIN_PHYSICS.fortressFormingSeconds).toBeGreaterThan(0);
    expect(STRAIN_PHYSICS.fortressSegments).toBeGreaterThan(0);
    expect(STRAIN_PHYSICS.fortressEveryFoods).toBeGreaterThan(0);
  });

  it("COSMIC's calcification reaches it the same way", () => {
    // WP-3.13, and the same argument as Fortress's: COSMIC has no `arena`
    // either, so the `it.each` above catches it only because it reads
    // `constellation` as a second terrain route.
    const engine = read('src/lib/game/SnakeGameLogic.ts');
    expect(engine).toContain('private calcifyConstellation(');
    expect(engine).toMatch(
      /calcifyConstellation\(\)[\s\S]{0,2000}this\.placeTerrainAt\(/
    );
  });

  it('calcified stars arrive with a forming phase too', () => {
    expect(COSMIC_CONSTELLATION.calcifySeconds).toBeGreaterThan(0);
    expect(COSMIC_CONSTELLATION.size).toBeGreaterThan(0);
    expect(COSMIC_CONSTELLATION.windowSeconds).toBeGreaterThan(0);
  });

  it('the constellation window is drawn, not merely modelled', () => {
    // Same class of defect one layer up: the window decides where permanent
    // lethal blocks land, so a player who cannot see it cannot have chosen
    // them. The cockpit is the production HUD; the legacy chip is the
    // rollback path, and both are checked because both can ship.
    const cockpit = read('src/components/game/cockpit/RunCockpit.tsx');
    expect(cockpit).toContain('constellation-window');
    const page = read('src/app/game/page.tsx');
    expect(page).toContain('constellation-chip');
    expect(page).toContain('constellationTicksRemaining');
  });

  it('never turns a new constellation into an automatic planning pause', () => {
    const page = read('src/app/game/page.tsx');
    const engine = read('src/lib/game/SnakeGameLogic.ts');
    expect(page).not.toMatch(/COSMIC_PLANNING|cosmicPlanning|getConstellationWave/);
    expect(engine).not.toMatch(/stagePausedDirection|getConstellationWave/);
  });

  it('an armed arena always has a non-zero forming phase', () => {
    // A block that solidifies instantly is a random death however well it is
    // drawn. `terrain.ts`: the forming phase "is not a courtesy - it is what
    // makes terrain a positioning problem rather than a random death."
    for (const dynasty of DYNASTIES) {
      const arena = getRuleset(dynasty).arena;
      if (!arena) continue;
      expect(arena.formingSeconds).toBeGreaterThan(0);
      expect(arena.blocksPerInterval).toBeGreaterThan(0);
      expect(arena.intervalFoods).toBeGreaterThan(0);
    }
  });
});

describe('the forming phase can be drawn as progress', () => {
  it('the renderer reads formingTotal, not just the countdown', () => {
    // A bare remaining-tick count cannot be drawn as a fill; you need what it
    // started from. Without this the forming phase is invisible even with a
    // renderer present, which is most of the original bug over again.
    const renderer = read('src/components/game/TerrainBlocks.tsx');
    expect(renderer).toContain('formingTotal');
  });

  it('the engine stamps formingTotal when it places a block', () => {
    const engine = read('src/lib/game/SnakeGameLogic.ts');
    expect(engine).toMatch(/formingTotal:\s*formingTicks/);
  });

  it('forming and solid are distinguished by more than colour', () => {
    // The categorical axis: flat-and-changing versus raised-and-still. A
    // palette-only distinction would collapse the moment terrain and the
    // snake's own trail share a hue family.
    const renderer = read('src/components/game/TerrainBlocks.tsx');
    expect(renderer).toMatch(/FORMING_HEIGHT = 0\.035/);
    expect(renderer).toMatch(/SOLID_HEIGHT = 0\.72/);
    expect(renderer).toContain('FLOOR_CLEARANCE + FORMING_HEIGHT / 2');
    expect(renderer).toContain('FLOOR_CLEARANCE + SOLID_HEIGHT / 2');
  });

  it('every terrain cause survives into a related visual signature', () => {
    const model = read('src/shared/game/terrain.ts');
    const renderer = read('src/components/game/TerrainBlocks.tsx');
    expect(model).toContain("'cyber' | 'fortress' | 'cosmic' | 'ladder'");
    expect(model).toMatch(/source: TerrainSource/);
    for (const [source, strain] of [
      ['cyber', 'VOLT'],
      ['fortress', 'FERAL'],
      ['cosmic', 'FLUX'],
      ['ladder', 'AURUM'],
    ]) {
      expect(renderer).toContain(`${source}: '${strain}'`);
    }
    expect(renderer).toContain('terrainRuneStrokes(');
    expect(renderer).toContain('addRune(');
    expect(renderer).toContain('signatureMaterial');
    // Silhouette is primary; the restrained secondary hue belongs to the
    // terrain cause's learned Genome strain, never to the active snake.
    expect(renderer).toContain(
      'signatureColor.set(STRAINS[TERRAIN_RUNE_STRAIN[source]].color)'
    );
    expect(renderer).not.toMatch(/TerrainBlocksProps[\s\S]{0,120}dynasty/);
    // The same causal mark is visible during the warning and after lock.
    expect(renderer.match(/addRune\(/g)?.length).toBeGreaterThanOrEqual(2);
    expect(renderer).toMatch(/MAX_SIGNATURES = MAX_BLOCKS \* 5/);
  });

  it('covers the full board and keeps locked terrain perfectly still', () => {
    const renderer = read('src/components/game/TerrainBlocks.tsx');
    expect(renderer).toMatch(
      /MAX_BLOCKS = GAME_CONFIG\.board\.gridSize \* GAME_CONFIG\.board\.gridSize/
    );
    expect(renderer).not.toContain('useFrame');
    // One forming mesh, one solid mesh, one source-relief mesh. Source
    // distinction must not consume a mesh/material per cause.
    expect(renderer.match(/<instancedMesh/g)).toHaveLength(3);
  });
});
