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
 * `terrain.test.ts` asserts `blocksDueAt`, `formingTicksFor`, `ringOf` and
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
import { getRuleset, type DynastyName } from './rulesets';

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
      // Two routes now, and the second is why this reads `||` rather than
      // just `arena`. CYBER SCHEDULES terrain (`arena`); COSMIC produces it
      // from play — every star its constellation window closes on calcifies
      // — with no schedule anywhere. A gate that only knew about `arena`
      // would have let COSMIC ship the WP-3.03 defect a second time.
      if (!ruleset.arena && !ruleset.constellation) return;
      expect(() =>
        read('src/components/game/TerrainBlocks.tsx')
      ).not.toThrow();
      expect(read('src/app/game/page.tsx')).toContain('TerrainBlocks');
    }
  );

  it('COSMIC calcifies into the same primitive the renderer draws', () => {
    // The connection, asserted rather than assumed: the engine pushes
    // TerrainBlock-shaped objects for missed stars, so the mounted renderer
    // picks them up with no second code path and no second chance to forget.
    const engine = read('src/lib/game/SnakeGameLogic.ts');
    expect(engine).toContain('calcifyConstellation');
    expect(engine).toMatch(
      /calcifyConstellation\(\)[\s\S]{0,2000}this\.state\.terrain\.push\(/
    );
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
    expect(renderer).toContain('formingGeometry');
    expect(renderer).toContain('solidGeometry');
    expect(renderer).not.toMatch(/const solidGeometry = formingGeometry/);
  });
});
