import { render } from '@testing-library/react';
import * as THREE from 'three';
import {
  ARENA_BOARD_FRAGMENT_SHADER,
  ARENA_EDGE_WASH_FRAGMENT_SHADER,
  ArenaFloor,
  centerYFromBase,
  createArenaBoardMaterial,
  createArenaEdgeWashMaterial,
  createArenaSlabGeometry,
  EDGE_WASH_ON_STONE,
  FLOOR_CLEARANCE,
  FLOOR_GRAPHICS_TOP_Y,
  SLAB_APRON,
} from './ArenaFloor';
import { BOARD_THEMES } from './screen/boardThemes';
import { SEAM_WIDTH } from './screen/boardTiles';

describe('arena floor render geometry', () => {
  it('converts a desired base into the centre of centred Three.js geometry', () => {
    expect(centerYFromBase(0.04, 0.9)).toBeCloseTo(0.49, 10);
    expect(
      centerYFromBase(FLOOR_CLEARANCE, 0.7) - 0.7 / 2
    ).toBeCloseTo(FLOOR_CLEARANCE, 10);
    expect(FLOOR_CLEARANCE).toBeGreaterThan(FLOOR_GRAPHICS_TOP_Y);
  });
});

describe('analytic arena edge wash', () => {
  it('uses a resolution-independent board-shaped fragment calculation', () => {
    const material = createArenaEdgeWashMaterial('#35e6ff', 0.5);

    expect(material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.blending).toBe(THREE.AdditiveBlending);
    expect(material.toneMapped).toBe(false);
    expect(material.uniforms.uAccent.value.getHexString()).toBe('35e6ff');
    expect(material.uniforms.uStrength.value).toBe(0.5);
    expect(ARENA_EDGE_WASH_FRAGMENT_SHADER).toContain('abs(vUv * 2.0');
    expect(ARENA_EDGE_WASH_FRAGMENT_SHADER).toContain('pow(edgeVector.x, 6.0)');
    expect(ARENA_EDGE_WASH_FRAGMENT_SHADER).toContain('smoothstep');
    expect(ARENA_EDGE_WASH_FRAGMENT_SHADER).not.toContain('sampler2D');

    material.dispose();
  });

  it('clamps invalid or excessive wash strength', () => {
    const invalid = createArenaEdgeWashMaterial('#ffffff', Number.NaN);
    const excessive = createArenaEdgeWashMaterial('#ffffff', 20);
    expect(invalid.uniforms.uStrength.value).toBe(0);
    expect(excessive.uniforms.uStrength.value).toBe(1.5);
    invalid.dispose();
    excessive.dispose();
  });

  /**
   * RE-EXPRESSED FOR THE SLAB. The arena used to own exactly one GPU resource
   * it had to release - the edge wash - so a count of one was the whole
   * contract. It now builds three per mount, and the honest test is not a
   * bigger number but a statement of WHICH resources are per-mount and which
   * are deliberately shared:
   *
   *   PER MOUNT   the edge wash, the board pass and the float halo (all
   *               parameterised or sized from this arena), the slab's toon
   *               material, and the slab GEOMETRY, which is built at world
   *               size from this arena's own span and can never be shared.
   *   SHARED      the ink hull material and the toon gradient ramp, which are
   *               parameter-free module singletons like every other pooled
   *               resource in this renderer. Disposing those on unmount would
   *               break the next mount, so they must NOT be counted.
   */
  it('disposes exactly the resources it builds, and leaves the shared pools alone', () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    // Spied on Material, not ShaderMaterial: the slab's toon material would
    // slip past a ShaderMaterial-only spy entirely.
    const disposeMaterial = jest.spyOn(THREE.Material.prototype, 'dispose');
    const disposeGeometry = jest.spyOn(THREE.BufferGeometry.prototype, 'dispose');

    const view = render(
      <ArenaFloor accentColor="#35e6ff" edgeWashStrength={0.5} />
    );
    expect(disposeMaterial).not.toHaveBeenCalled();

    const materialsBefore = disposeMaterial.mock.calls.length;
    const geometriesBefore = disposeGeometry.mock.calls.length;
    view.unmount();

    // Edge wash + board pass + slab toon + float halo. The module-scope ink
    // hull and the shared gradient ramp are not among them.
    expect(disposeMaterial.mock.calls.length - materialsBefore).toBe(4);
    // The slab body only. `planeGeometry` elements are owned by R3F.
    expect(disposeGeometry.mock.calls.length - geometriesBefore).toBe(1);

    // The shared pools survive: a second mount must still have them.
    const second = render(
      <ArenaFloor accentColor="#35e6ff" edgeWashStrength={0.5} />
    );
    expect(second.container.querySelectorAll('mesh').length).toBeGreaterThan(0);
    second.unmount();

    disposeMaterial.mockRestore();
    disposeGeometry.mockRestore();
    consoleError.mockRestore();
  });

  /**
   * THE ROLLBACK SHAPE, TESTED DELIBERATELY.
   *
   * `NEXT_PUBLIC_HUD_COCKPIT_V1=false` mounts `ArenaFloor` and `ArenaBorder`
   * directly instead of `ArenaAssembly`, and so do `/dev/perf` and the arena
   * prototype's `released` variant. Those paths pass no `edgeWashStrength` and
   * mount no undertray, so anything the cockpit assembly did to make the slab
   * coherent had to be moved INTO this component or the rollback would render
   * a stone tile washed at full strength with nothing under it.
   *
   * CI runs e2e only with the flag ON (`.github/workflows/e2e.yml`), so no
   * browser leg exercises this shape. It is pinned here on purpose rather than
   * inferred from an omitted flag.
   */
  it('gives the rollback path the same damped wash and float halo as the cockpit', () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    // Exactly what `game/page.tsx` renders with the cockpit flag off.
    const { container } = render(<ArenaFloor gridSize={20} accentColor="#35e6ff" />);

    // The wash is damped for stone by DEFAULT, not by a call-site multiplier
    // that only the cockpit applies.
    expect(EDGE_WASH_ON_STONE).toBeLessThan(1);
    const wash = createArenaEdgeWashMaterial('#35e6ff', EDGE_WASH_ON_STONE);
    expect(wash.uniforms.uStrength.value).toBe(EDGE_WASH_ON_STONE);
    wash.dispose();

    // Slab, halo, wash and board pass - the float cue is present without an
    // undertray, because it belongs to the tile rather than to the chassis.
    expect(container.querySelectorAll('mesh').length).toBeGreaterThanOrEqual(4);

    consoleError.mockRestore();
  });

  it('scales the float halo from its own preset rather than the cockpit apron', () => {
    // The released tile has a smaller apron than the cockpit's, so a halo
    // sized from `SLAB_APRON.cockpit` - which is what the undertray used to
    // hardcode - would have overhung the rollback board.
    expect(SLAB_APRON.released).toBeLessThan(SLAB_APRON.cockpit);
  });

  it('builds the slab at world size so its hull expands evenly on every face', () => {
    // A unit box scaled to 22.35 x 0.95 x 22.35 would carry a chamfer 23x
    // wider along X than along Y, and a non-unit world scale would make the
    // shared ink hull expand by different amounts per axis. Building at size
    // is what pins both.
    const span = 22.35;
    const geometry = createArenaSlabGeometry(span, 0.95, 0.16, {
      face: '#16202a',
      bevel: '#4a5d6e',
      side: '#334252',
      base: '#070c12',
    });

    const position = geometry.getAttribute('position');
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < position.count; i += 1) {
      maxX = Math.max(maxX, position.getX(i));
      minY = Math.min(minY, position.getY(i));
      maxY = Math.max(maxY, position.getY(i));
    }
    expect(maxX).toBeCloseTo(span / 2, 6);
    // The play surface is EXACTLY y = 0; the body hangs below it.
    expect(maxY).toBeCloseTo(0, 10);
    expect(minY).toBeCloseTo(-0.95, 6);

    // Ten quads: top, four chamfers, four sides, underside.
    expect(position.count).toBe(10 * 6);
    // Face tone rides a vertex colour, so the whole tile is one draw.
    expect(geometry.getAttribute('color')).not.toBeUndefined();

    geometry.dispose();
  });
});

/**
 * PASS 5/6 - the tiled board. Every assertion here is about the boundary
 * between the two boards: the shipped stone one must be untouched, and the
 * themed one must stop drawing what its real geometry replaced.
 */
describe('the tiled neon board (concept)', () => {
  const theme = BOARD_THEMES.cyanNeon;
  const build = (tiled: boolean, seamLines = false) =>
    createArenaBoardMaterial(
      20,
      theme.checker,
      theme.grooveLight,
      theme.minorDepth,
      theme.majorDepth,
      theme,
      tiled,
      seamLines
    );

  it('retires the two shader layers the real blocks now are', () => {
    const flat = build(false);
    const tiled = build(true);

    // The checker was orientation information standing in for structure, and
    // the shader roll was a bevel standing in for a bevel. Both are now real,
    // and drawing them UNDER the blocks would be drawing them twice.
    expect(flat.uniforms.uCheckAlpha.value).toBeGreaterThan(0);
    expect(tiled.uniforms.uCheckAlpha.value).toBe(0);
    expect(flat.uniforms.uBevelStrength.value).toBeGreaterThan(0);
    expect(tiled.uniforms.uBevelStrength.value).toBe(0);

    flat.dispose();
    tiled.dispose();
  });

  /**
   * THE LINE-FREE SEAM.
   *
   * Owner, 2026-08-07: "we don't need the gridlines now anymore, they are
   * rather a disturbance. the tiles already provide for proper orientation on
   * the board."
   *
   * Swept over EVERY theme, because "the board draws no gridline" is a
   * property of the board and a theme that quietly kept one would be one
   * dynasty playing on a different surface. The carve is included by name: it
   * is shading rather than a stroke, which makes it the easiest of the three
   * drawn seams to leave behind, and a shaded 2px channel painted down the
   * middle of a real 6px one is a gridline by every test but its authoring.
   */
  it('draws nothing at all at an interior cell boundary', () => {
    Object.values(BOARD_THEMES).forEach((each) => {
      const board = createArenaBoardMaterial(
        20,
        each.checker,
        each.grooveLight,
        each.minorDepth,
        each.majorDepth,
        each,
        true
      );

      // The carve - the analytic groove that predates the blocks.
      expect(board.uniforms.uMinorAlpha.value).toBe(0);
      expect(board.uniforms.uMajorAlpha.value).toBe(0);
      // The filament, in the two classes that ARE the grid.
      expect(board.uniforms.uNeonMinor.value).toBe(0);
      expect(board.uniforms.uNeonMajor.value).toBe(0);
      // The perimeter is not a cell boundary - it is where the board ends,
      // and it is the one line a player judges a distance to. It survives at
      // its authored strength, or the ruling would have deleted the board's
      // edge along with its grid.
      expect(board.uniforms.uNeonEdge.value).toBeGreaterThan(0.3);

      board.dispose();
    });
  });

  it('sizes the filament in the world once the seam is a real gap', () => {
    const flat = build(false);
    const tiled = build(true);

    // Zero is the screen-space path, which every stone board keeps. The world
    // sizing still governs the perimeter light on a line-free board, and every
    // seam again under the compare toggle.
    expect(flat.uniforms.uNeonWorld.value).toBe(0);
    expect(tiled.uniforms.uNeonWorld.value).toBeGreaterThan(0);
    // The core lies INSIDE the channel it lies in - a filament wider than its
    // groove is a line painted across the tiles.
    expect(tiled.uniforms.uNeonWorld.value * 2).toBeLessThan(SEAM_WIDTH);

    flat.dispose();
    tiled.dispose();
  });

  /**
   * THE COMPARE TOGGLE RESTORES THE BOARD THAT WAS REVIEWED.
   *
   * `?gridlines=1` is not a second concept - it is the A side of an A/B, so it
   * has to be the board the owner actually saw, down to the class ordering and
   * the gains. If it drifted, the flip would be comparing the ruling against
   * something nobody ruled on.
   *
   * THE GAINS MAY NOT REORDER A THEME. Swept over every theme, not the one
   * this file happens to build: a per-class gain is exactly the kind of change
   * that silently flips one theme's perimeter below its own emphasis grid, and
   * the first draft of these numbers did that to DARK NEON.
   */
  it('restores the reviewed seam, ordering intact, under the compare toggle', () => {
    Object.values(BOARD_THEMES).forEach((each) => {
      const flat = createArenaBoardMaterial(
        20,
        each.checker,
        each.grooveLight,
        each.minorDepth,
        each.majorDepth,
        each,
        false
      );
      const lineFree = createArenaBoardMaterial(
        20,
        each.checker,
        each.grooveLight,
        each.minorDepth,
        each.majorDepth,
        each,
        true
      );
      const restored = createArenaBoardMaterial(
        20,
        each.checker,
        each.grooveLight,
        each.minorDepth,
        each.majorDepth,
        each,
        true,
        true
      );

      // The carve comes back at the theme's own authored depth.
      expect(restored.uniforms.uMinorAlpha.value).toBe(each.minorDepth);
      expect(restored.uniforms.uMajorAlpha.value).toBe(each.majorDepth);
      // ...and the filament in its three classes, in order.
      expect(restored.uniforms.uNeonMinor.value).toBeGreaterThan(
        flat.uniforms.uNeonMinor.value
      );
      expect(restored.uniforms.uNeonMinor.value).toBeLessThan(
        restored.uniforms.uNeonMajor.value
      );
      expect(restored.uniforms.uNeonMajor.value).toBeLessThan(
        restored.uniforms.uNeonEdge.value
      );
      expect(restored.uniforms.uNeonEdge.value).toBeLessThanOrEqual(1);
      // Compression, not amplification: the loudest class must stay under the
      // clamp, or two themes would meet at 1.0 and stop being two themes.
      expect(restored.uniforms.uNeonEdge.value).toBeLessThan(0.95);
      // The toggle changes the SEAMS and nothing else - the board's edge light
      // is the same light on both sides of the flip, so what the owner is
      // comparing is exactly the grid.
      expect(restored.uniforms.uNeonEdge.value).toBe(
        lineFree.uniforms.uNeonEdge.value
      );

      flat.dispose();
      lineFree.dispose();
      restored.dispose();
    });
  });

  /**
   * A STONE BOARD HAS NO BLOCKS, SO IT HAS NOTHING TO READ A SEAM FROM.
   *
   * The ruling is "the tiles already provide for proper orientation", and the
   * stone board has no tiles - its grooves are the only boundary it owns. So
   * the flag may not reach it, which is also what keeps every shipped path
   * byte-identical through this change.
   */
  it('never takes the seam ruling to a board that has no blocks', () => {
    const stone = createArenaBoardMaterial(20, '#4a6178', '#7d94a8', 0.4, 0.58);
    const flagged = createArenaBoardMaterial(
      20,
      '#4a6178',
      '#7d94a8',
      0.4,
      0.58,
      null,
      false,
      false
    );
    expect(flagged.uniforms.uMinorAlpha.value).toBe(
      stone.uniforms.uMinorAlpha.value
    );
    expect(flagged.uniforms.uMajorAlpha.value).toBe(
      stone.uniforms.uMajorAlpha.value
    );
    expect(stone.uniforms.uMinorAlpha.value).toBeGreaterThan(0);
    stone.dispose();
    flagged.dispose();
  });

  it('leaves the stone board byte-identical without a theme', () => {
    const stone = createArenaBoardMaterial(20, '#4a6178', '#7d94a8', 0.4, 0.58);
    expect(stone.uniforms.uBevelStrength.value).toBe(0);
    expect(stone.uniforms.uNeonMinor.value).toBe(0);
    expect(stone.uniforms.uNeonMajor.value).toBe(0);
    expect(stone.uniforms.uNeonEdge.value).toBe(0);
    expect(stone.uniforms.uNeonWorld.value).toBe(0);
    expect(stone.uniforms.uCheckAlpha.value).toBeGreaterThan(0);
    stone.dispose();
  });

  it('keeps the world-width branch uniform-coherent in the fragment shader', () => {
    // One `bool` decided from a uniform, so the whole draw takes or skips the
    // branch together - not a per-fragment divergence.
    expect(ARENA_BOARD_FRAGMENT_SHADER).toContain('uniform float uNeonWorld;');
    expect(ARENA_BOARD_FRAGMENT_SHADER).toContain('bool worldNeon = uNeonWorld > 0.0;');
    expect(ARENA_BOARD_FRAGMENT_SHADER).toContain('cellWidth * uNeonWorldFloor');
  });

  it('mounts the tile field alone, and its ink only for the compare toggle', () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const stone = render(<ArenaFloor gridSize={4} />);
    const stoneMeshes = stone.container.querySelectorAll('mesh').length;
    stone.unmount();

    // ONE more object: the blocks. No line is drawn around a tile, so no
    // second draw exists to draw one with.
    const neon = render(<ArenaFloor gridSize={4} neonTheme={theme} />);
    expect(neon.container.querySelectorAll('mesh').length).toBe(stoneMeshes + 1);
    neon.unmount();

    const lined = render(
      <ArenaFloor gridSize={4} neonTheme={theme} seamLines />
    );
    expect(lined.container.querySelectorAll('mesh').length).toBe(stoneMeshes + 2);
    lined.unmount();

    consoleError.mockRestore();
  });

  it('disposes the field, its material and its ramp - and a hull only if built', () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const disposeMaterial = jest.spyOn(THREE.Material.prototype, 'dispose');
    const disposeGeometry = jest.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const disposeTexture = jest.spyOn(THREE.Texture.prototype, 'dispose');

    const view = render(<ArenaFloor gridSize={4} neonTheme={theme} />);
    const materialsBefore = disposeMaterial.mock.calls.length;
    const geometriesBefore = disposeGeometry.mock.calls.length;
    const texturesBefore = disposeTexture.mock.calls.length;
    view.unmount();

    // Wash + board pass + slab + halo + tile field. The two ink hull materials
    // are module singletons and must survive for the next mount.
    expect(disposeMaterial.mock.calls.length - materialsBefore).toBe(5);
    // Slab body + tile field. No hull is built on a line-free board, so there
    // is nothing third to release - an unmount that "disposed" three here
    // would mean the board had quietly built a hull it never drew.
    expect(disposeGeometry.mock.calls.length - geometriesBefore).toBe(2);
    // The theme's own cel ramp. The shared greyscale ramp is not disposed.
    expect(disposeTexture.mock.calls.length - texturesBefore).toBe(1);

    const lined = render(
      <ArenaFloor gridSize={4} neonTheme={theme} seamLines />
    );
    const linedGeometriesBefore = disposeGeometry.mock.calls.length;
    lined.unmount();
    // Slab body + tile field + the hull the toggle asked for.
    expect(disposeGeometry.mock.calls.length - linedGeometriesBefore).toBe(3);

    disposeMaterial.mockRestore();
    disposeGeometry.mockRestore();
    disposeTexture.mockRestore();
    consoleError.mockRestore();
  });
});
