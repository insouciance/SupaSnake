import * as THREE from 'three';
import {
  applyBoardPurple,
  BOARD_THEMES,
  BRAND_PURPLE,
  type BoardTheme,
} from './boardThemes';
import {
  applyBoardCelShading,
  createBoardCelRamp,
  createBoardTileField,
  KEY_LIGHT_WORLD,
  MAJOR_EVERY,
  SEAM_DEPTH,
  SEAM_WIDTH,
  seamClassAt,
  seamGlowWeight,
  SLAB_INK_WIDTH,
  TILE_CHAMFER,
  TILE_INK_WIDTH,
  TILE_SEAT,
  TILE_SHADE_STEP,
  TILE_SHADE_STEPS,
  TILE_SPAN,
  tileShade,
  tileShadeLevel,
  toneForFace,
} from './boardTiles';

const THEMES = Object.values(BOARD_THEMES);
const GRID = 20;

/** Rec.709 luminance of an sRGB hex, in 0-255 encoded levels. */
function luminance(hex: string): number {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return (
    0.2126 * ((value >> 16) & 0xff) +
    0.7152 * ((value >> 8) & 0xff) +
    0.0722 * (value & 0xff)
  );
}

/** Relative chroma of an sRGB hex: 0 is a grey, 1 is a fully saturated hue. */
function chroma(hex: string): number {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  const channels = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
  const max = Math.max(...channels);
  const min = Math.min(...channels);
  return max === 0 ? 0 : (max - min) / max;
}

describe('the tile block geometry', () => {
  const built = createBoardTileField(GRID, BOARD_THEMES.cyanNeon);
  /**
   * The compare-toggle build. The ONLY field in this suite that carries a
   * hull, which is the point: `?gridlines=1` restores the board the owner
   * reviewed, and the line-free default builds no outline at all.
   */
  const lined = createBoardTileField(GRID, BOARD_THEMES.cyanNeon, {
    seamLines: true,
  });

  it('builds one geometry for the whole field, not one per tile', () => {
    // 400 tiles x 10 quads (top, 4 shoulders, 4 walls, underside) x 6 vertices.
    const vertices = built.field.getAttribute('position').count;
    expect(vertices).toBe(GRID * GRID * 10 * 6);
    expect(built.triangles).toBe(GRID * GRID * 10 * 2);
  });

  /**
   * NO OUTLINE AROUND A TILE - owner ruling, 2026-08-07.
   *
   * "the tiles already provide for proper orientation on the board." A hull
   * built and then left unmounted would satisfy the picture and not the
   * ruling; it would also hold 24,000 vertices of normals for the life of the
   * theme to draw nothing. So the line-free board does not build one, and this
   * is the assertion that keeps the two facts the same fact.
   */
  it('builds no ink hull unless the compare toggle asks for one', () => {
    expect(built.hull).toBeNull();

    const vertices = built.field.getAttribute('position').count;
    // The toggle's hull is the same positions with different normals - that is
    // what makes it one extra DRAW rather than one extra object per tile.
    expect(lined.hull).not.toBeNull();
    expect(lined.hull?.getAttribute('position').count).toBe(vertices);
    expect(lined.hull?.getAttribute('normal')).toBeDefined();
    // Ink is a flat colour; a hull that carried vertex colours would be paying
    // for an attribute the material cannot read.
    expect(lined.hull?.getAttribute('color')).toBeUndefined();
    // The blocks themselves are identical on both sides of the flip: the
    // toggle changes what is DRAWN on a seam, never where the seam is.
    expect(lined.field.getAttribute('position').count).toBe(vertices);
  });

  /**
   * THE WINDING GUARD.
   *
   * `createBoardTileField` derives every normal from its quad's winding rather
   * than asserting it, so a mistyped corner produces an INWARD face - which
   * renders as a black hole in the board and, on the hull, as an outline that
   * turns inside out. The hull normal is by construction the outward radial
   * direction from the tile's own centre, so one dot product per vertex pins
   * all 24,000 of them without this test having to know where any tile is.
   */
  it('faces every quad outward', () => {
    // The lined build, because the outward radial IS the hull normal and only
    // the toggle's field carries one. The positions are identical either way,
    // so this pins the winding of the board that ships too.
    const normals = lined.field.getAttribute('normal');
    const radial = lined.hull!.getAttribute('normal');
    let worst = 1;
    for (let i = 0; i < normals.count; i += 1) {
      const dot =
        normals.getX(i) * radial.getX(i) +
        normals.getY(i) * radial.getY(i) +
        normals.getZ(i) * radial.getZ(i);
      worst = Math.min(worst, dot);
    }
    expect(worst).toBeGreaterThan(0.1);
  });

  it('writes unit normals that never split at a shared corner', () => {
    const positions = lined.hull!.getAttribute('position');
    const normals = lined.hull!.getAttribute('normal');
    const seen = new Map<string, [number, number, number]>();
    let shared = 0;
    for (let i = 0; i < positions.count; i += 1) {
      const n: [number, number, number] = [
        normals.getX(i),
        normals.getY(i),
        normals.getZ(i),
      ];
      expect(Math.hypot(...n)).toBeCloseTo(1, 6);
      const key = [positions.getX(i), positions.getY(i), positions.getZ(i)]
        .map((v) => v.toFixed(5))
        .join(',');
      const previous = seen.get(key);
      if (previous) {
        shared += 1;
        // A hull that expanded two copies of one corner in two directions
        // would tear the outline open at every corner of every tile.
        expect(previous[0]).toBeCloseTo(n[0], 9);
        expect(previous[1]).toBeCloseTo(n[1], 9);
        expect(previous[2]).toBeCloseTo(n[2], 9);
      } else {
        seen.set(key, n);
      }
    }
    expect(shared).toBeGreaterThan(0);
  });

  /**
   * THE PLAY PLANE IS NOT NEGOTIABLE.
   *
   * `FLOOR_TOP_Y`, `FLOOR_CLEARANCE` and every object that stands on this board
   * were authored against y = 0. The board grew a third dimension by RECESSING
   * the slab, not by raising the surface, and this is the assertion that keeps
   * it that way.
   */
  it('puts the play surface at exactly y = 0 and every other vertex below it', () => {
    const positions = built.field.getAttribute('position');
    let top = -Infinity;
    let bottom = Infinity;
    for (let i = 0; i < positions.count; i += 1) {
      top = Math.max(top, positions.getY(i));
      bottom = Math.min(bottom, positions.getY(i));
    }
    expect(top).toBeCloseTo(0, 10);
    /**
     * SIX PLACES, NOT TEN, and the difference is the buffer rather than the
     * tolerance. Positions live in a `Float32Array`, so what comes back is the
     * nearest float32 to the authored depth - exact for the 0.25 the board was
     * first built at, and 2.4e-9 off for the 0.19 round 3 flattened it to. A
     * ten-place compare here was pinning the accident that the old number
     * happened to be a dyadic rational, which is not a property of the board.
     * Float32 carries ~7 significant decimal digits; six places is inside that
     * and still an order of magnitude tighter than any real drift.
     */
    expect(bottom).toBeCloseTo(-(SEAM_DEPTH + TILE_SEAT), 6);
    // The tile seats INTO the slab so its underside is never coplanar with the
    // slab's top face, which is the z-fight this board's history is made of.
    expect(TILE_SEAT).toBeGreaterThan(0);
  });

  it('leaves a real gap between neighbouring tiles, on a one-cell pitch', () => {
    const positions = built.field.getAttribute('position');
    const xs = new Set<number>();
    for (let i = 0; i < positions.count; i += 1) {
      xs.add(Number(positions.getX(i).toFixed(6)));
    }
    const sorted = [...xs].sort((a, b) => a - b);
    // The outermost tile edges span the full board, centred on the origin.
    expect(sorted[0]).toBeCloseTo(-GRID / 2 + SEAM_WIDTH / 2, 6);
    expect(sorted[sorted.length - 1]).toBeCloseTo(GRID / 2 - SEAM_WIDTH / 2, 6);
    // The gap between one tile's outer edge and its neighbour's is the seam.
    const outerEdges = sorted.filter((x) =>
      Number.isInteger(Number((x + GRID / 2 - SEAM_WIDTH / 2).toFixed(6)))
    );
    expect(outerEdges.length).toBeGreaterThanOrEqual(GRID);
    expect(TILE_SPAN + SEAM_WIDTH).toBeCloseTo(1, 10);
  });

  /**
   * THE PRECISION BUDGET.
   *
   * A wider seam is a better-looking board and a worse-playing one: the flat
   * top of a cell is where the food, THE LEAD, a terrain block and a snake
   * segment are all read, and a segment's largest footprint is 0.91. The flat
   * must stay wide enough that those objects sit on stone rather than
   * straddling a trench, which is what bounds SEAM_WIDTH from above.
   */
  it('keeps a flat top wide enough for the objects that stand on a cell', () => {
    const flat = TILE_SPAN - TILE_CHAMFER * 2;
    // The seam and the chamfer are currently tuned to land EXACTLY on this
    // floor, so the comparison has to tolerate the binary representation of
    // 1 - 0.14 - 0.18 (which is 0.6799999999999999). The bound is a design
    // limit, not a measurement: it must fail on 0.67 and pass on 0.68.
    expect(flat).toBeGreaterThan(0.68 - 1e-9);
    // ...and the shoulder stays a chunky facet rather than a technical edge.
    expect(TILE_CHAMFER / TILE_SPAN).toBeGreaterThan(0.07);
  });

  it('builds a field for every theme without a NaN reaching the buffer', () => {
    THEMES.forEach((theme) => {
      [{ seamLines: false }, { seamLines: true }].forEach((options) => {
        const field = createBoardTileField(4, theme, options);
        for (const attribute of ['position', 'normal', 'color'] as const) {
          const values = field.field.getAttribute(attribute).array;
          for (let i = 0; i < values.length; i += 1) {
            expect(Number.isFinite(values[i])).toBe(true);
          }
        }
        field.field.dispose();
        field.hull?.dispose();
      });
    });
  });
});

describe('the seam emphasis system', () => {
  it('lets the perimeter outrank the emphasis grid', () => {
    // 0 and 20 are both multiples of MAJOR_EVERY on a 20-cell board, and the
    // outermost line is the boundary a player judges distance to, not a scale
    // marker - so it takes the loudest class.
    expect(seamClassAt(0, GRID)).toBe('edge');
    expect(seamClassAt(GRID, GRID)).toBe('edge');
    expect(seamClassAt(MAJOR_EVERY, GRID)).toBe('major');
    expect(seamClassAt(GRID - MAJOR_EVERY, GRID)).toBe('major');
    expect(seamClassAt(1, GRID)).toBe('minor');
    expect(seamClassAt(MAJOR_EVERY + 1, GRID)).toBe('minor');
  });

  /**
   * THE LINE-FREE SEAM, AS A NUMBER.
   *
   * Owner, 2026-08-07: "we don't need the gridlines now anymore, they are
   * rather a disturbance." Zero, not "quiet": a whisper of light down forty
   * lines is still forty lines, and it is the lines the ruling is about. The
   * sweep runs over every theme because a board that draws no grid is a
   * property of the BOARD - a theme that kept a whisper would be one dynasty
   * playing on a surface the others do not have.
   */
  it('puts no light in any seam between two tiles, on any theme', () => {
    THEMES.forEach((theme) => {
      expect(seamGlowWeight(theme, 'minor')).toBe(0);
      expect(seamGlowWeight(theme, 'major')).toBe(0);
      // The perimeter is not a seam between two tiles. It is where the board
      // ENDS, which is the one boundary a player is judging a distance to, so
      // it keeps the full weight it always carried.
      expect(seamGlowWeight(theme, 'edge')).toBe(1);
    });
  });

  it('restores the reviewed emphasis ladder under the compare toggle', () => {
    THEMES.forEach((theme) => {
      const minor = seamGlowWeight(theme, 'minor', true);
      const major = seamGlowWeight(theme, 'major', true);
      const edge = seamGlowWeight(theme, 'edge', true);
      expect(minor).toBeGreaterThan(0);
      expect(minor).toBeLessThan(major);
      expect(major).toBeLessThan(edge);
      // The perimeter is the same light on both sides of the flip, so what the
      // owner is comparing is exactly the grid and nothing else.
      expect(edge).toBe(seamGlowWeight(theme, 'edge'));
    });
  });
});

/**
 * THE INTERIOR OF THE BOARD IS FLAT AUTHORED TONE, AND NOTHING ELSE.
 *
 * The strongest form of the ruling that can be stated about this file: take a
 * tile that touches no perimeter and every vertex colour on it must be one of
 * the four tones `toneForFace` can return. No gradient, no mix, no filament -
 * so there is nothing on an interior seam that was DRAWN there. What separates
 * one cell from the next is the recess, the occlusion and the hard step from
 * the key tone on a shoulder to the shadow tone on the wall below it.
 */
describe('the line-free interior', () => {
  /** Vertices per tile: 10 quads x 6. Tiles are emitted row-major. */
  const PER_TILE = 60;

  function interiorColors(field: THREE.BufferGeometry, gridSize: number) {
    const colors = field.getAttribute('color');
    const found: [number, number, number][] = [];
    for (let i = 0; i < colors.count; i += 1) {
      const tile = Math.floor(i / PER_TILE);
      const row = Math.floor(tile / gridSize);
      const column = tile % gridSize;
      const onPerimeter =
        row === 0 || column === 0 || row === gridSize - 1 || column === gridSize - 1;
      if (onPerimeter) continue;
      found.push([colors.getX(i), colors.getY(i), colors.getZ(i)]);
    }
    return found;
  }

  /**
   * THE THEME'S TONES, EACH IN EVERY SHADE THE BOARD IS CUT FROM.
   *
   * Round 3 gave every tile one of five authored shades of its theme's stone
   * ("a little bit different, but still all within the 90s cartoon frame"), so
   * the closed set an interior quad may take is TONES x SHADES rather than
   * TONES. It is still a closed, enumerable, author-controlled set - which is
   * the property the line-free ruling actually needs and the property a
   * continuous per-tile offset would have destroyed. The count is asserted
   * below so a shade palette that quietly became a gradient fails here.
   */
  function authoredTones(theme: BoardTheme): Set<string> {
    const levels = Array.from(
      { length: TILE_SHADE_STEPS },
      (_, index) => index - (TILE_SHADE_STEPS - 1) / 2
    );
    const set = new Set<string>();
    for (const hex of [
      theme.face,
      theme.tileEdgeKey,
      theme.tileEdgeMid,
      theme.tileWall,
    ]) {
      for (const level of levels) {
        const color = new THREE.Color(hex);
        // The middle shade is the authored tone ITSELF, and the field takes it
        // without the sRGB round trip - which matters here because that round
        // trip is not quite lossless and the difference lands in the fifth
        // decimal. Mirrored rather than smoothed over with a looser compare:
        // "a fifth of the board is exactly what the theme says" is a property.
        if (level !== 0) {
          const factor = 1 + level * TILE_SHADE_STEP;
          color.convertLinearToSRGB();
          color
            .setRGB(
              Math.min(1, color.r * factor),
              Math.min(1, color.g * factor),
              Math.min(1, color.b * factor)
            )
            .convertSRGBToLinear();
        }
        // Through float32, because that is what the buffer holds and what
        // `getX` hands back - a double-precision expectation misses by a unit
        // in the fifth place and says the tone was not authored.
        set.add(
          [color.r, color.g, color.b]
            .map((v) => Math.fround(v).toFixed(5))
            .join(',')
        );
      }
    }
    return set;
  }

  it('paints every interior tile in flat authored tones on every theme', () => {
    THEMES.forEach((theme) => {
      const field = createBoardTileField(GRID, theme);
      const tones = authoredTones(theme);
      const found = interiorColors(field.field, GRID);
      expect(found.length).toBeGreaterThan(0);
      found.forEach((rgb) => {
        expect(tones).toContain(rgb.map((v) => v.toFixed(5)).join(','));
      });
      field.field.dispose();
    });
  });

  /**
   * THE VARIATION IS AUTHORED, DETERMINISTIC AND A WHISPER - round 3.
   *
   * Three properties, and the board loses something different if any one of
   * them goes. A PALETTE (not a continuum) is what keeps it out of the guide's
   * "no halftones, no visual noise" clause. DETERMINISM keyed off the cell is
   * what makes it the same board every run, which a precision game needs and
   * which any render-time randomness would take away. And the SPREAD has to
   * stay far below the step from the play surface to its own lit shoulder, or
   * a dark tile starts reading as a shadowed one and the board begins telling
   * the player something it does not mean.
   */
  it('cuts the board from a small fixed palette of shades, keyed to the cell', () => {
    const levels = new Set<number>();
    for (let row = 0; row < GRID; row += 1) {
      for (let column = 0; column < GRID; column += 1) {
        levels.add(tileShadeLevel(column, row));
        // Same cell, same shade - every call, every run, every machine.
        expect(tileShadeLevel(column, row)).toBe(tileShadeLevel(column, row));
      }
    }
    // A palette, and the whole of it in use on a 20x20 board.
    expect(levels.size).toBe(TILE_SHADE_STEPS);
    expect(Math.max(...levels)).toBe((TILE_SHADE_STEPS - 1) / 2);
    expect(Math.min(...levels)).toBe(-(TILE_SHADE_STEPS - 1) / 2);
    // The middle step is the authored tone itself, untouched - so a fifth of
    // the board is exactly what the theme says it is.
    expect(levels.has(0)).toBe(true);
    const unmodified = [...Array(GRID).keys()].flatMap((row) =>
      [...Array(GRID).keys()].filter(
        (column) => tileShadeLevel(column, row) === 0
      )
    );
    expect(unmodified.length).toBeGreaterThan(0);
    // The multiplier is the level, and nothing else.
    expect(tileShade(0, 0)).toBeCloseTo(
      1 + tileShadeLevel(0, 0) * TILE_SHADE_STEP,
      12
    );

    /**
     * AND IT NEVER COMPETES WITH THE BOARD'S OWN SIGNAL. Measured against the
     * real ladder rather than asserted as a fraction: the full spread between
     * the lightest and the darkest tile of one tone has to be a small part of
     * the step that tone already takes to its lit shoulder.
     */
    const spread = TILE_SHADE_STEP * (TILE_SHADE_STEPS - 1);
    THEMES.forEach((theme) => {
      const face = new THREE.Color(theme.face).convertLinearToSRGB();
      const key = new THREE.Color(theme.tileEdgeKey).convertLinearToSRGB();
      const faceLuma = 0.2126 * face.r + 0.7152 * face.g + 0.0722 * face.b;
      const keyLuma = 0.2126 * key.r + 0.7152 * key.g + 0.0722 * key.b;
      const step = Math.abs(keyLuma - faceLuma) / faceLuma;
      expect(spread).toBeLessThan(step / 5);
    });
  });

  it('is the toggle, not the geometry, that puts a gradient back', () => {
    const theme = BOARD_THEMES.cyanNeon;
    const field = createBoardTileField(GRID, theme, { seamLines: true });
    const tones = authoredTones(theme);
    const mixed = interiorColors(field.field, GRID).filter(
      (rgb) => !tones.has(rgb.map((v) => v.toFixed(5)).join(','))
    );
    // The reviewed board lit every interior seam, so the restore must too - a
    // toggle that produced the same picture would be no comparison at all.
    expect(mixed.length).toBeGreaterThan(0);
    field.field.dispose();
    field.hull?.dispose();
  });
});

describe('the guide three tones, keyed to orientation', () => {
  it('gives the play surface one flat tone on every theme', () => {
    THEMES.forEach((theme) => {
      expect(toneForFace(theme, [0, 1, 0])).toBe(theme.face);
    });
  });

  /**
   * The rig decides WHICH shoulder is lit; the guide decides WHAT lit means.
   * Under the board's one key light the +X and -Z shoulders face the lamp, so
   * they take the bright graphic highlight, and -X faces fully away.
   */
  it('puts the highlight on the shoulders that face the key and the shadow opposite', () => {
    const s = Math.SQRT1_2;
    THEMES.forEach((theme) => {
      expect(toneForFace(theme, [s, s, 0])).toBe(theme.tileEdgeKey);
      expect(toneForFace(theme, [0, s, -s])).toBe(theme.tileEdgeKey);
      expect(toneForFace(theme, [0, s, s])).toBe(theme.tileEdgeMid);
      expect(toneForFace(theme, [-s, s, 0])).toBe(theme.tileWall);
      // Every vertical wall is a shadow face, whichever COMPASS point it
      // happens to face - including the one the key nominally reaches. A wall
      // inside a channel this narrow is in the channel's own shadow, and
      // letting the dot product decide would light 400 slots.
      [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 0, 1],
        [0, 0, -1],
        [0, -1, 0],
      ].forEach((normal) => {
        expect(toneForFace(theme, normal as [number, number, number])).toBe(
          theme.tileWall
        );
      });
    });
  });

  it('reads the key light off the rig that actually lights the board', () => {
    // The one shadow-casting directional is at [24, 18, 2] aimed at [10, 0, 10].
    const expected = new THREE.Vector3(14, 18, -8).normalize();
    expect(KEY_LIGHT_WORLD[0]).toBeCloseTo(expected.x, 10);
    expect(KEY_LIGHT_WORLD[1]).toBeCloseTo(expected.y, 10);
    expect(KEY_LIGHT_WORLD[2]).toBeCloseTo(expected.z, 10);
  });

  /**
   * HIGHLIGHT -> MID TONE -> SHADOW, as a measurable ladder.
   *
   * The character guide asks for "bright graphic highlights on top-facing
   * edges; saturated midtones; substantially darker shadow faces; high
   * contrast". On a tile that is exactly this ordering, and it has to hold on
   * all three themes or one dynasty is playing on a flatter board than another.
   */
  it('holds one luminance ladder across all three themes', () => {
    THEMES.forEach((theme: BoardTheme) => {
      expect(luminance(theme.grooveShadow)).toBeLessThan(luminance(theme.tileWall));
      expect(luminance(theme.tileWall)).toBeLessThan(luminance(theme.face) * 0.85);
      expect(luminance(theme.face)).toBeLessThan(luminance(theme.tileEdgeMid));
      expect(luminance(theme.tileEdgeMid)).toBeLessThan(
        luminance(theme.tileEdgeKey) * 0.6
      );
    });
    // ...and the ladder is at PARITY across themes, rung by rung, so
    // readability is a property of the board rather than of the dynasty.
    (['tileWall', 'tileEdgeMid', 'tileEdgeKey'] as const).forEach((rung) => {
      const values = THEMES.map((theme) => luminance(theme[rung]));
      expect(Math.max(...values) - Math.min(...values)).toBeLessThan(6);
    });
  });

  /**
   * "Saturated midtones" and "never grey". The shoulder is separated from the
   * plane above it by CHROMA rather than by light, which is what lets the play
   * surface keep its authored luminance while the shoulder still reads as its
   * own plane.
   */
  it('separates the shoulder from the plane by saturation, not by brightness', () => {
    THEMES.forEach((theme) => {
      expect(chroma(theme.tileEdgeMid)).toBeGreaterThan(chroma(theme.face));
      expect(chroma(theme.tileEdgeMid)).toBeGreaterThan(0.28);
      // The bright shoulder is the one place a board could turn pastel, which
      // the guide forbids by name. It is the theme's own hue at a highlight
      // brightness, not a neutral - `bevel`, the slab's stone chamfer, is a
      // neutral and is deliberately NOT what a tile shoulder is made of.
      expect(chroma(theme.tileEdgeKey)).toBeGreaterThan(0.4);
      expect(chroma(theme.tileEdgeKey)).toBeGreaterThan(chroma(theme.bevel));
      // A shadow is a dark, more saturated member of the surface's own hue
      // family - never a desaturated grey.
      expect(chroma(theme.tileWall)).toBeGreaterThan(0.25);
      expect(chroma(theme.grooveShadow)).toBeGreaterThan(0.25);
    });
  });
});

describe('the board cel ramp', () => {
  it('is three hard, unfiltered bands of colour', () => {
    const ramp = createBoardCelRamp(BOARD_THEMES.solNeon);
    expect(ramp.image.width).toBe(3);
    expect(ramp.image.height).toBe(1);
    expect(ramp.magFilter).toBe(THREE.NearestFilter);
    expect(ramp.minFilter).toBe(THREE.NearestFilter);
    expect(ramp.generateMipmaps).toBe(false);
    ramp.dispose();
  });

  it('tints the shadow band into the theme hue and leaves the highlight clean', () => {
    THEMES.forEach((theme) => {
      const ramp = createBoardCelRamp(theme);
      const data = ramp.image.data as Uint8Array;
      const band = (index: number) => [
        data[index * 4],
        data[index * 4 + 1],
        data[index * 4 + 2],
      ];
      const spread = (rgb: number[]) => Math.max(...rgb) - Math.min(...rgb);
      const level = (rgb: number[]) => Math.max(...rgb);

      const [shadow, mid, light] = [band(0), band(1), band(2)];
      // Three ascending steps: this is a ramp, not three shades of one value.
      expect(level(shadow)).toBeLessThan(level(mid));
      expect(level(mid)).toBeLessThan(level(light));
      // The shadow carries the hue and the highlight is very nearly neutral -
      // "shadows are a dark saturated member of the surface's own family", not
      // a grey, and not a coloured light washing the whole board.
      expect(spread(shadow) / level(shadow)).toBeGreaterThan(
        spread(light) / level(light)
      );
      expect(spread(light) / level(light)).toBeLessThan(0.08);
      // Never fully dark: a black band has no form to reveal.
      expect(level(shadow)).toBeGreaterThan(24);
      ramp.dispose();
    });
  });
});

describe('the board cel shader patch', () => {
  /** The stock three.js chunks the patch expects to find, in order. */
  function fakeShader() {
    return {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: 'void main() {\n#include <begin_vertex>\n}',
      fragmentShader: [
        'void main() {',
        '  vec3 irradiance = vec3( texture2D( gradientMap, coord ).r );',
        '  #include <lights_fragment_end>',
        '}',
      ].join('\n'),
    };
  }

  it('turns the brightness lookup into a tone lookup', () => {
    const theme = BOARD_THEMES.cyanNeon;
    const ramp = createBoardCelRamp(theme);
    const material = new THREE.MeshToonMaterial();
    applyBoardCelShading(material, theme, ramp);
    expect(material.gradientMap).toBe(ramp);

    const shader = fakeShader();
    material.onBeforeCompile(
      shader as unknown as THREE.WebGLProgramParametersWithUniforms,
      null as unknown as THREE.WebGLRenderer
    );
    expect(shader.fragmentShader).toContain(
      'texture2D( gradientMap, coord ).rgb'
    );
    expect(shader.fragmentShader).not.toContain(
      'vec3( texture2D( gradientMap, coord ).r )'
    );
    // The smooth, unbanded half of the light is scaled down, or the hemisphere
    // and the ambient quietly wash the hard transitions back out.
    expect(shader.uniforms.uBoardIndirect.value).toBeGreaterThan(0);
    expect(shader.uniforms.uBoardIndirect.value).toBeLessThan(1);
    expect(shader.fragmentShader).toContain('reflectedLight.indirectDiffuse *=');
    // A distinct program key, because the snake patches the same chunk.
    expect(material.customProgramCacheKey()).toContain(theme.id);
    ramp.dispose();
    material.dispose();
  });

  it('composes with a patch the material already carries', () => {
    const theme = BOARD_THEMES.darkNeon;
    const ramp = createBoardCelRamp(theme);
    const material = new THREE.MeshToonMaterial();
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n// prior patch'
      );
    };
    applyBoardCelShading(material, theme, ramp);

    const shader = fakeShader();
    material.onBeforeCompile(
      shader as unknown as THREE.WebGLProgramParametersWithUniforms,
      null as unknown as THREE.WebGLRenderer
    );
    expect(shader.vertexShader).toContain('// prior patch');
    expect(shader.fragmentShader).toContain(
      'texture2D( gradientMap, coord ).rgb'
    );
    ramp.dispose();
    material.dispose();
  });
});

describe('the ink hierarchy', () => {
  /**
   * ONE WEIGHT ON THE BOARD THAT SHIPS. The character guide allows two - a
   * thick line around the silhouette and a thinner one on internal boundaries
   * - and the owner's ruling spends only the first. The board keeps its
   * character outline; the internal line is the gridline and is gone.
   *
   * TILE_INK_WIDTH is therefore the compare toggle's constant now, and it is
   * pinned at the weight the owner reviewed rather than retuned: an A/B whose
   * A side has been improved is not an A/B.
   */
  it('keeps the silhouette line bold, and the retired internal line as reviewed', () => {
    expect(SLAB_INK_WIDTH).toBeGreaterThan(TILE_INK_WIDTH * 2.5);
    // "never a 1px technical edge": one cell is ~43px at the default framing,
    // so the silhouette line is ~4.7px and the retired internal one ~1.3px.
    expect(SLAB_INK_WIDTH * 43).toBeGreaterThan(3);
    expect(TILE_INK_WIDTH * 43).toBeGreaterThan(1);
    // ...and the internal line never closed the seam it was drawn inside.
    expect(TILE_INK_WIDTH * 2).toBeLessThan(SEAM_WIDTH * 0.6);
  });
});

describe('the brand purple underglow, in the baked field', () => {
  /**
   * ONE TILE'S VERTICES, by the quad they belong to.
   *
   * `createBoardTileField` emits ten quads per tile in a fixed order - top
   * plane, four shoulders, four walls, underside - at six vertices each. The
   * ranges below are that order, and they are what let this suite assert that
   * the violet reached the walls and NOTHING else.
   */
  const PER_TILE = 60;
  const TOP_AND_SHOULDERS = { from: 0, to: 30 };
  const WALLS = { from: 30, to: 54 };
  const UNDERSIDE = { from: 54, to: 60 };

  function tileVertices(
    field: THREE.BufferGeometry,
    tile: number,
    range: { from: number; to: number }
  ): [number, number, number][] {
    const colors = field.getAttribute('color');
    const out: [number, number, number][] = [];
    for (let i = range.from; i < range.to; i += 1) {
      const index = tile * PER_TILE + i;
      out.push([colors.getX(index), colors.getY(index), colors.getZ(index)]);
    }
    return out;
  }

  /** A tile with no perimeter side: every seam around it is an interior one. */
  const INTERIOR_TILE = 10 * GRID + 10;
  /** A corner tile, so two of its four sides carry the board's edge light. */
  const PERIMETER_TILE = 0;

  function hueOf(rgb: [number, number, number]): number {
    const [r, g, b] = rgb;
    const max = Math.max(r, g, b);
    const delta = max - Math.min(r, g, b);
    if (delta === 0) return 0;
    const raw =
      max === r
        ? ((g - b) / delta) % 6
        : max === g
          ? (b - r) / delta + 2
          : (r - g) / delta + 4;
    return (raw * 60 + 360) % 360;
  }

  function hueGap(a: number, b: number): number {
    const gap = Math.abs(a - b) % 360;
    return gap > 180 ? 360 - gap : gap;
  }

  /** Linear-space hue of a hex, to compare against vertex colours. */
  function hueOfHex(hex: string): number {
    const color = new THREE.Color(hex);
    return hueOf([color.r, color.g, color.b]);
  }

  describe.each(THEMES.map((theme) => [theme.id, theme] as const))(
    '%s',
    (_id, theme) => {
      const off = createBoardTileField(GRID, theme);
      const lit = createBoardTileField(GRID, applyBoardPurple(theme, 'underglow')!);

      /**
       * THE PILLAR, AS A TEST. The play surface is 72% of the board's area and
       * the lit shoulder is the one feature carrying each house's colour onto
       * a surface. If the violet ever reaches either, purple has stopped being
       * an underglow and has become the board's colour - so these vertices are
       * asserted IDENTICAL, bit for bit, on both an interior and a perimeter
       * tile.
       */
      it('leaves the top plane and all four shoulders untouched', () => {
        for (const tile of [INTERIOR_TILE, PERIMETER_TILE]) {
          expect(tileVertices(lit.field, tile, TOP_AND_SHOULDERS)).toEqual(
            tileVertices(off.field, tile, TOP_AND_SHOULDERS)
          );
          expect(tileVertices(lit.field, tile, UNDERSIDE)).toEqual(
            tileVertices(off.field, tile, UNDERSIDE)
          );
        }
      });

      /**
       * A wall quad is wound [a,b,c,a,c,d] with a and b at the groove floor and
       * c and d at the shoulder, so exactly three of its six vertices sit below
       * the shoulder and take the glow. The underglow is a GRADIENT out of the
       * bottom of the cut, not a repaint of the whole wall.
       */
      it('reaches the bottom of a groove wall and stops there', () => {
        const before = tileVertices(off.field, INTERIOR_TILE, WALLS);
        const after = tileVertices(lit.field, INTERIOR_TILE, WALLS);
        const changed = after.filter(
          (rgb, index) => rgb.join() !== before[index].join()
        );
        // Four walls x three lower vertices.
        expect(changed).toHaveLength(12);

        /**
         * IT MOVES TOWARD THE BRAND HUE WITHOUT BECOMING IT.
         *
         * The seam does not land on pure violet and must not: it is the
         * theme's own wall tone carrying a third of the brand purple, so
         * CYAN's dark teal keeps pulling its seam toward blue-violet while
         * SOL's warm brown pulls its own toward red-violet. That house
         * inflection is the design - a seam that snapped to one flat violet on
         * all three boards would have replaced the theme rather than lit it.
         * So the claim under test is the DIRECTION of travel plus a ceiling,
         * not an equality with the brand hex.
         */
        const purpleHue = hueOfHex(BRAND_PURPLE.shade);
        const wallHue = hueOfHex(theme.tileWall);
        for (const rgb of changed) {
          const gap = hueGap(hueOf(rgb), purpleHue);
          expect(gap).toBeLessThan(hueGap(wallHue, purpleHue));
          expect(gap).toBeLessThan(45);
        }
      });

      /**
       * THE LAYER ORDER, MEASURED. On the perimeter - the only place the house
       * light actually lands - the violet goes down first and the house neon is
       * mixed on top of it. So the lit vertices there must still read as the
       * HOUSE's hue, not as the brand's. This is the assertion that would fail
       * if the two mixes were ever swapped.
       */
      it('lets the house neon win on the perimeter, where the two meet', () => {
        const walls = tileVertices(lit.field, PERIMETER_TILE, WALLS);
        const neonHue = hueOfHex(theme.neon);
        const purpleHue = hueOfHex(BRAND_PURPLE.shade);
        const houseLit = walls.filter(
          (rgb) => hueGap(hueOf(rgb), neonHue) < hueGap(hueOf(rgb), purpleHue)
        );
        // A corner tile carries the edge light on two of its four walls, three
        // lit vertices each.
        expect(houseLit.length).toBeGreaterThanOrEqual(6);
      });

      it('adds no geometry - the violet is colour on the field that shipped', () => {
        expect(lit.triangles).toBe(off.triangles);
        expect(lit.field.getAttribute('position').count).toBe(
          off.field.getAttribute('position').count
        );
        // No ink hull either: the underglow is not a drawn line.
        expect(lit.hull).toBeNull();
      });
    }
  );

  /**
   * THE SHIPPED BOARD IS BYTE-IDENTICAL. A theme with no purple on it must
   * produce exactly the field it produced before this experiment existed -
   * same fast path, same flat quads, same colours.
   */
  it('builds the shipped field unchanged when no purple is asked for', () => {
    for (const theme of THEMES) {
      const shipped = createBoardTileField(GRID, theme);
      const again = createBoardTileField(GRID, { ...theme });
      expect(Array.from(again.field.getAttribute('color').array)).toEqual(
        Array.from(shipped.field.getAttribute('color').array)
      );
    }
  });
});
