import { GAME_SCREEN_COLORS } from './gameScreenTokens';
import {
  applyBoardPurple,
  BOARD_PURPLE_DEFAULT,
  BOARD_THEME_BY_DYNASTY,
  BOARD_THEMES,
  boardThemeForDynasty,
  BRAND_PURPLE,
  getBoardTheme,
  mixHexSRGB,
  parseBoardPurpleMode,
  parseBoardThemeSelection,
  resolveBoardTheme,
  SUPA_ORANGE,
  type BoardTheme,
} from './boardThemes';

/** Rec.709 luminance of an sRGB hex, in 0-255 encoded levels. */
function luminance(hex: string): number {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Relative chroma of an sRGB hex: 0 is a grey, 1 is a fully saturated hue. */
function chroma(hex: string): number {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  const channels = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
  const max = Math.max(...channels);
  const min = Math.min(...channels);
  return max === 0 ? 0 : (max - min) / max;
}

/** Hue of an sRGB hex, in degrees. Undefined for a pure grey, so: 0. */
function hue(hex: string): number {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  const r = ((value >> 16) & 0xff) / 255;
  const g = ((value >> 8) & 0xff) / 255;
  const b = (value & 0xff) / 255;
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

/** Shortest angular distance between two hues, in degrees. */
function hueDistance(a: string, b: string): number {
  const gap = Math.abs(hue(a) - hue(b)) % 360;
  return gap > 180 ? 360 - gap : gap;
}

/** Every colour a theme paints, so a sweep cannot miss one by name. */
function colorsOf(theme: BoardTheme): string[] {
  return Object.entries(theme)
    .filter(([, value]) => typeof value === 'string' && value.startsWith('#'))
    .map(([, value]) => value as string);
}

const THEMES = Object.values(BOARD_THEMES);

describe('neon dynasty board themes', () => {
  /**
   * THE NAMING RULE, PINNED MECHANICALLY.
   *
   * EMBER/CRYSTAL/VOID is deprecated dynasty vocabulary (CLAUDE.md) and the
   * concept sheet these themes came from used "DYNASTY VOID" for the dark one.
   * A comment saying "we renamed it" is not a guarantee; this is.
   */
  it('never speaks the deprecated dynasty vocabulary', () => {
    const spoken = THEMES.flatMap((theme) => [theme.id, theme.label]).join(' ');
    expect(spoken.toUpperCase()).not.toContain('VOID');
    expect(spoken.toUpperCase()).not.toContain('EMBER');
    expect(spoken.toUpperCase()).not.toContain('CRYSTAL');
  });

  it('maps each live dynasty onto exactly one theme, through one constant', () => {
    expect(BOARD_THEME_BY_DYNASTY).toEqual({
      CYBER: 'cyanNeon',
      PRIMAL: 'solNeon',
      COSMIC: 'darkNeon',
    });
    // Onto, not merely into: no theme is unreachable and none is shared.
    const mapped = Object.values(BOARD_THEME_BY_DYNASTY);
    expect(new Set(mapped).size).toBe(THEMES.length);
    expect(boardThemeForDynasty('CYBER').id).toBe('cyanNeon');
    expect(boardThemeForDynasty('PRIMAL').id).toBe('solNeon');
    expect(boardThemeForDynasty('COSMIC').id).toBe('darkNeon');
    THEMES.forEach((theme) => {
      // The accessor returns the SHIPPED board, which since 2026-08-08 carries
      // the brand purple - so identity with the authored table is asserted
      // through the `off` pin, and the default is checked to be the same theme
      // wearing it rather than a different one.
      expect(getBoardTheme(theme.id, 'off')).toBe(theme);
      expect(getBoardTheme(theme.id).id).toBe(theme.id);
      // A theme's declared dynasty and the mapping agree, so the readout on
      // the fixture can never disagree with what is rendering.
      expect(BOARD_THEME_BY_DYNASTY[theme.dynasty]).toBe(theme.id);
    });
  });

  /**
   * READABILITY IS A PROPERTY OF THE BOARD, NOT OF THE DYNASTY.
   *
   * The snake, the terrain, THE LEAD and the food are read against the top
   * face. If one dynasty's face were materially darker the game would be
   * measurably harder to read on that dynasty, which is a rules-adjacent
   * advantage a colour theme is not allowed to hand out.
   */
  it('holds all three top faces at one luminance, above the shipped stone', () => {
    const faces = THEMES.map((theme) => luminance(theme.face));
    const spread = Math.max(...faces) - Math.min(...faces);
    expect(spread).toBeLessThan(2);

    const stone = luminance(GAME_SCREEN_COLORS.arenaFloor);
    faces.forEach((face) => {
      // Lighter than today's near-black surface...
      expect(face).toBeGreaterThan(stone + 6);
      // ...but nowhere near lifted enough to spend the hazard's contrast: a
      // face this light still leaves solid terrain reading as an object on it.
      expect(face).toBeLessThan(stone * 1.6);
    });
  });

  it('paints no pure black and no pure white anywhere on the board', () => {
    THEMES.forEach((theme) => {
      colorsOf(theme).forEach((color) => {
        expect(color).toMatch(/^#[0-9a-f]{6}$/);
        expect(luminance(color)).toBeGreaterThan(2);
        expect(color).not.toBe('#000000');
        expect(color).not.toBe('#ffffff');
      });
    });
  });

  /**
   * THE NEON LADDER - now the COMPARE PATH's contract, and the perimeter's.
   *
   * Owner ruling, 2026-08-07: "we don't need the gridlines now anymore, they
   * are rather a disturbance. the tiles already provide for proper orientation
   * on the board." `neonMinor` and `neonMajor` therefore reach nothing on the
   * board that renders - `ArenaFloor` and `boardTiles` zero both on a tiled
   * board - and what they still describe is `?gridlines=1`, the A side of the
   * owner's own A/B. The ordering is pinned because that side has to stay the
   * board he reviewed; the numbers are not free to drift just because the
   * default no longer reads them.
   *
   * `neonEdge` is different and is a LIVE contract: the perimeter is not a
   * seam between two tiles but where the board ends, and it is the one line on
   * this surface a player judges a distance to.
   */
  it('keeps the reviewed seam ladder intact for the compare toggle', () => {
    THEMES.forEach((theme) => {
      expect(theme.neonMinor).toBeLessThan(0.05);
      expect(theme.neonMajor).toBeGreaterThan(theme.neonMinor * 5);
      expect(theme.neonEdge).toBeGreaterThan(theme.neonMajor);
      expect(theme.neonEdge).toBeLessThanOrEqual(1);
      // The board's edge light is worth having: a perimeter this quiet would
      // leave the player judging a distance to nothing.
      expect(theme.neonEdge).toBeGreaterThan(0.4);
      // The checker is a finish difference, not a chessboard. (Stone board
      // only - a tiled board zeroes it, because the blocks are the structure.)
      expect(theme.checkerAlpha).toBeLessThan(0.08);
      // The carve and the shader bevel are likewise the flat board's and the
      // toggle's. Pinned for the same reason: they describe the A side.
      expect(theme.minorDepth).toBeGreaterThan(0.5);
      expect(theme.majorDepth).toBeGreaterThan(theme.minorDepth);
      expect(theme.tileBevelStrength).toBeLessThan(0.4);
      expect(luminance(theme.grooveLight)).toBeGreaterThan(
        luminance(theme.grooveShadow) * 4
      );
      expect(luminance(theme.tileBevelLight)).toBeGreaterThan(
        luminance(theme.tileBevelShade) * 4
      );
    });
  });

  /**
   * A THEME'S IDENTITY MAY NOT LIVE IN A SEAM.
   *
   * The ruling deleted every drawn light inside the playfield, and the first
   * line-free render showed exactly which themes had been leaning on it: CYAN
   * and SOL were unchanged in character because their hue was already on their
   * shoulders, and DARK came back a neutral grey board because its heat lived
   * only in the cuts.
   *
   * So the contract is that a theme's `neon` hue must ALSO be the hue of some
   * surface the board paints. Two surfaces qualify and they are deliberately
   * different kinds of answer:
   *
   *   tileEdgeKey  the lit shoulders - the theme is in the STONE. CYAN and SOL
   *                take this one.
   *   halo         the scattered light under the slab - the theme is in the
   *                AIR around the board. DARK takes this one, because it may
   *                not take the other (see below).
   *
   * `rimTint` and `edgeWash` are excluded on purpose: both are literally the
   * neon hex on all three themes, so allowing them would make this assertion
   * true by construction and prove nothing.
   */
  it('carries every theme on a painted surface, not on a line', () => {
    THEMES.forEach((theme) => {
      const inTheStone = hueDistance(theme.neon, theme.tileEdgeKey);
      const inTheAir = hueDistance(theme.neon, theme.halo);
      expect(Math.min(inTheStone, inTheAir)).toBeLessThan(15);
    });
  });

  /**
   * THE SHOULDER RULE, and it exists because a rebalance was rendered and
   * REJECTED rather than because it sounded right.
   *
   * Moving DARK's hot orange onto its lit shoulders satisfied every contract
   * in this file - parity, chroma, the tone ladder - and came back a glowing
   * orange LATTICE. A lit shoulder runs the full length of a cell and every
   * tile has two, so at high hue contrast against the plane behind them they
   * fuse across the board into exactly the drawn grid the owner had just
   * removed, arriving from shading instead of from ink.
   *
   * So: a lit shoulder must be the same hue family as the plane it rolls off.
   * Then it reads as this stone catching light. Saturation was never the
   * problem - CYAN's shoulder is the most saturated of the three and reads as
   * material - hue contrast is.
   */
  it('keeps every lit shoulder in the family of the plane it rolls off', () => {
    THEMES.forEach((theme) => {
      expect(hueDistance(theme.tileEdgeKey, theme.face)).toBeLessThan(25);
      // ...and it is still a HIGHLIGHT, not a pastel and not a neutral: the
      // plane's own hue at highlight brightness.
      expect(chroma(theme.tileEdgeKey)).toBeGreaterThan(0.4);
    });
  });

  it('spends the brand orange on the SOL board and nowhere else', () => {
    expect(SUPA_ORANGE).toBe('#f2a03f');
    const sol = getBoardTheme('solNeon');
    expect(sol.neon).toBe(SUPA_ORANGE);
    expect(sol.rimTint).toBe(SUPA_ORANGE);
    expect(sol.edgeWash).toBe(SUPA_ORANGE);
    // Not an orange board: the tiles under that light are a warm dark
    // graphite, so the brand colour reads as light rather than as surface.
    expect(luminance(sol.face)).toBeLessThan(luminance(SUPA_ORANGE) / 3);
    // The dark board's orange is deliberately a different, hotter hue, or the
    // two themes would be one theme at a glance.
    expect(getBoardTheme('darkNeon').neon).not.toBe(SUPA_ORANGE);
  });
});

describe('board theme selection', () => {
  it('accepts a dynasty, a theme id or the shipped stone, in any case', () => {
    expect(parseBoardThemeSelection('cyber')).toBe('CYBER');
    expect(parseBoardThemeSelection('CYBER')).toBe('CYBER');
    expect(parseBoardThemeSelection(' cyanNeon ')).toBe('CYBER');
    expect(parseBoardThemeSelection('primal')).toBe('PRIMAL');
    expect(parseBoardThemeSelection('solNeon')).toBe('PRIMAL');
    expect(parseBoardThemeSelection('cosmic')).toBe('COSMIC');
    expect(parseBoardThemeSelection('darkNeon')).toBe('COSMIC');
    expect(parseBoardThemeSelection('stone')).toBe('stone');
    expect(parseBoardThemeSelection('off')).toBe('stone');
  });

  it('falls back rather than trusting a URL', () => {
    expect(parseBoardThemeSelection(undefined)).toBeUndefined();
    expect(parseBoardThemeSelection('')).toBeUndefined();
    expect(parseBoardThemeSelection('VOID')).toBeUndefined();
    expect(parseBoardThemeSelection('<script>')).toBeUndefined();
    expect(parseBoardThemeSelection('__proto__')).toBeUndefined();
  });

  it('resolves stone to the shipped board and anything else to a theme', () => {
    expect(resolveBoardTheme('stone', 'CYBER')).toBeNull();
    expect(resolveBoardTheme(undefined, 'COSMIC')?.id).toBe('darkNeon');
    // A selection overrides the scene's dynasty - that is what lets the owner
    // flip all three themes against one fixed scene.
    expect(resolveBoardTheme('PRIMAL', 'CYBER')?.id).toBe('solNeon');
  });
});

describe('the brand purple experiment', () => {
  /**
   * THE MARK'S OWN VALUES, pinned.
   *
   * These four hexes are read off `scripts/brand/markGeometry.mjs`'s
   * `MARK_PALETTE` - the module every brand raster in `public/brand/` is
   * generated from - and they are independently what
   * `assets/brand/supasnake-mark.svg` contains, which is where Home Round 2
   * tokenised the same family from. Two extractions, two sources, one set of
   * values. Pinned literally rather than imported from the generator so that a
   * drift there fails HERE, loudly, instead of silently repainting the board.
   */
  it('carries the Mark palette verbatim, under Home Round 2 token names', () => {
    expect(BRAND_PURPLE).toEqual({
      base: '#a201ae',
      shade: '#7d0275',
      deep: '#33012d',
      ink: '#170116',
    });
  });

  /**
   * THE SHIPPED DEFAULT IS NOW PURPLE, and this is the test that says so.
   *
   * OWNER RULING, 2026-08-08, on the twelve review shots and the close-up pair:
   * "board purple - let's do it. we do both, underglow + frame". So the board a
   * player sees carries BOTH variants on all three themes, and that is asserted
   * through the accessors the game actually calls - `boardThemeForDynasty` is
   * what `src/app/game/page.tsx` resolves its board with.
   *
   * `BOARD_THEMES` stays the AUTHORED table, bare, because it is what the tone
   * ladders are written and tested against; the purple is a derivation over it.
   * Both facts are asserted here so neither can drift into the other.
   */
  it('ships both variants on every dynasty, by default, through the accessors', () => {
    expect(BOARD_PURPLE_DEFAULT).toBe('both');
    for (const dynasty of ['CYBER', 'PRIMAL', 'COSMIC'] as const) {
      const shipped = boardThemeForDynasty(dynasty);
      expect(shipped.seamUnderglow).toBe(BRAND_PURPLE.shade);
      expect(shipped.seamUnderglowStrength).toBeGreaterThan(0);
      expect(shipped.seamUnderglowFloor).toBeDefined();
      expect(shipped.slabFrameBand).toBeDefined();
    }
  });

  it('keeps the authored table bare, so the tone ladders stay readable', () => {
    for (const theme of THEMES) {
      expect(theme.seamUnderglow).toBeUndefined();
      expect(theme.seamUnderglowStrength).toBeUndefined();
      expect(theme.seamUnderglowFloor).toBeUndefined();
      expect(theme.slabFrameBand).toBeUndefined();
    }
  });

  /**
   * THE MEMO'S REQUIREMENT. `ArenaFloor` rebuilds a 24,000-vertex geometry
   * through a `useMemo` keyed on the theme OBJECT, so an accessor that derived
   * a fresh theme per call would rebuild the whole board every render. The
   * table is built once at module load; these have to be the same reference.
   */
  it('returns one stable reference per theme and mode', () => {
    expect(boardThemeForDynasty('CYBER')).toBe(boardThemeForDynasty('CYBER'));
    expect(getBoardTheme('solNeon', 'off')).toBe(getBoardTheme('solNeon', 'off'));
    expect(resolveBoardTheme('COSMIC', 'CYBER')).toBe(
      resolveBoardTheme('COSMIC', 'CYBER')
    );
  });

  /** The dev comparison pin, and the only way back to the pre-ruling board. */
  it('strips the purple entirely for the off pin', () => {
    for (const dynasty of ['CYBER', 'PRIMAL', 'COSMIC'] as const) {
      const bare = boardThemeForDynasty(dynasty, 'off');
      expect(bare.seamUnderglow).toBeUndefined();
      expect(bare.slabFrameBand).toBeUndefined();
      expect(bare).toBe(BOARD_THEMES[BOARD_THEME_BY_DYNASTY[dynasty]]);
    }
  });

  it('places each variant only where that variant belongs', () => {
    for (const theme of THEMES) {
      const underglow = applyBoardPurple(theme, 'underglow')!;
      expect(underglow.seamUnderglow).toBe(BRAND_PURPLE.shade);
      expect(underglow.seamUnderglowFloor).toBeDefined();
      // The frame is a SEPARATE variant and must not ride along with it.
      expect(underglow.slabFrameBand).toBeUndefined();

      const frame = applyBoardPurple(theme, 'frame')!;
      expect(frame.slabFrameBand).toBeDefined();
      expect(frame.seamUnderglow).toBeUndefined();
      expect(frame.seamUnderglowFloor).toBeUndefined();

      const both = applyBoardPurple(theme, 'both')!;
      expect(both.seamUnderglow).toBe(BRAND_PURPLE.shade);
      expect(both.seamUnderglowFloor).toBe(underglow.seamUnderglowFloor);
      expect(both.slabFrameBand).toBe(frame.slabFrameBand);
    }
  });

  it('is pure - a shipped theme is never mutated by deriving from it', () => {
    const theme = BOARD_THEMES.cyanNeon;
    const before = JSON.stringify(theme);
    applyBoardPurple(theme, 'both');
    expect(JSON.stringify(theme)).toBe(before);
    expect(BOARD_THEMES.cyanNeon.seamUnderglow).toBeUndefined();
  });

  it('passes a null theme or an absent mode straight through', () => {
    expect(applyBoardPurple(null, 'both')).toBeNull();
    expect(applyBoardPurple(BOARD_THEMES.solNeon, null)).toBe(BOARD_THEMES.solNeon);
    expect(applyBoardPurple(BOARD_THEMES.solNeon, undefined)).toBe(
      BOARD_THEMES.solNeon
    );
  });

  /**
   * THE HOUSE NEON IS NOT TOUCHED. The dynasty identity law lives in these
   * fields; the experiment may add surfaces but may never edit the house's own
   * light or the plane the character is read against.
   */
  it('never edits the house neon, the play surface or the lit shoulder', () => {
    for (const theme of THEMES) {
      for (const mode of ['underglow', 'frame', 'both'] as const) {
        const derived = applyBoardPurple(theme, mode)!;
        expect(derived.neon).toBe(theme.neon);
        expect(derived.face).toBe(theme.face);
        expect(derived.tileEdgeKey).toBe(theme.tileEdgeKey);
        expect(derived.tileEdgeMid).toBe(theme.tileEdgeMid);
        expect(derived.tileWall).toBe(theme.tileWall);
        // The cel ramp's shadow hue and the analytic pass's groove colour both
        // read `grooveShadow`. Tinting it would put violet in every shadow.
        expect(derived.grooveShadow).toBe(theme.grooveShadow);
      }
    }
  });

  /**
   * LUMINANCE-NEUTRAL BY CONSTRUCTION.
   *
   * The burst shade sits at ~36/255 and the three wall tones at ~25-29, so a
   * third of it is a CHROMA event: the seam gets more colour, not more light.
   * Six levels is a generous ceiling on a step that measures under three, and
   * it is what keeps the underglow from flattening the shoulder-to-wall step
   * the line-free board reads its boundaries from.
   */
  it('moves the seam hue without moving its luminance', () => {
    for (const theme of THEMES) {
      const derived = applyBoardPurple(theme, 'underglow')!;
      const wall = mixHexSRGB(
        theme.tileWall,
        derived.seamUnderglow!,
        derived.seamUnderglowStrength!
      );
      expect(Math.abs(luminance(wall) - luminance(theme.tileWall))).toBeLessThan(6);
      /**
       * HUE, NOT CHROMA, is the axis that carries the claim. CYAN's wall is a
       * dark teal that is already more saturated than the violet it mixes
       * toward, so its chroma FALLS while its hue swings decisively - measuring
       * saturation here would assert the opposite of the design on one of the
       * three boards. What "the seam gets more colour, not more light" means
       * mechanically is that it moves toward the brand hue at constant value.
       */
      expect(hueDistance(wall, BRAND_PURPLE.shade)).toBeLessThan(
        hueDistance(theme.tileWall, BRAND_PURPLE.shade)
      );

      // And the floor stays under the wall above it, so a seam still reads as
      // a cut rather than as the lit slot `SEAM_GLOW` records from its own
      // first render.
      expect(luminance(derived.seamUnderglowFloor!)).toBeLessThan(luminance(wall));
    }
  });

  /**
   * THE FRAME IS THE UNIVERSE'S CONSTANT, and that is a measurable claim: the
   * band has to read as ONE violet on all three houses rather than as three
   * house-tinted violets. A tight hue spread across the themes is what says so.
   */
  it('bands all three slabs with one recognisable violet', () => {
    const bands = THEMES.map(
      (theme) => applyBoardPurple(theme, 'frame')!.slabFrameBand!
    );
    for (const band of bands) {
      expect(hueDistance(band, BRAND_PURPLE.base)).toBeLessThan(20);
      expect(chroma(band)).toBeGreaterThan(0.4);
    }
    for (const other of bands.slice(1)) {
      expect(hueDistance(bands[0], other)).toBeLessThan(20);
    }
  });

  it('mixes in sRGB, so an authored percentage is a perceived one', () => {
    expect(mixHexSRGB('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixHexSRGB('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mixHexSRGB('#000000', '#ffffff', 0.5)).toBe('#808080');
    // Clamped, never wrapped - a bad weight may not produce a bad colour.
    expect(mixHexSRGB('#000000', '#ffffff', -1)).toBe('#000000');
    expect(mixHexSRGB('#000000', '#ffffff', 2)).toBe('#ffffff');
  });

  /**
   * THE ARRIVAL-MODE IDIOM: null means "the URL said nothing", and the caller
   * keeps the shipped default. Only `off` turns the purple off, which is why it
   * has to be a recognised value rather than the absence of one.
   */
  it('reads the URL strictly, and says nothing rather than off', () => {
    expect(parseBoardPurpleMode('off')).toBe('off');
    expect(parseBoardPurpleMode('underglow')).toBe('underglow');
    expect(parseBoardPurpleMode('frame')).toBe('frame');
    expect(parseBoardPurpleMode(' BOTH ')).toBe('both');
    expect(parseBoardPurpleMode(undefined)).toBeNull();
    expect(parseBoardPurpleMode('')).toBeNull();
    expect(parseBoardPurpleMode('1')).toBeNull();
    expect(parseBoardPurpleMode('on')).toBeNull();
    expect(parseBoardPurpleMode('purple')).toBeNull();
    expect(parseBoardPurpleMode('__proto__')).toBeNull();
  });

  /** An absent pin resolves to the ratified board, never to a bare one. */
  it('falls back to the shipped purple when the URL is silent', () => {
    expect(resolveBoardTheme('CYBER', 'CYBER', null)).toBe(
      boardThemeForDynasty('CYBER')
    );
    expect(resolveBoardTheme('CYBER', 'CYBER', parseBoardPurpleMode('nonsense'))).toBe(
      boardThemeForDynasty('CYBER')
    );
  });

  /**
   * THE GLOW PROFILE, as a number.
   *
   * "make the underglow a little bit more transparent and 'glowy'". What makes
   * it a glow rather than a fill is that the seam has a PROFILE: the violet
   * peaks as a thin rim at the base of the wall and falls off both upward,
   * along the wall's vertex ramp, and downward onto a DIMMER floor. The
   * prototype had this inverted - a bright flat floor strip - and that is
   * precisely what read as a drawn lattice. So the floor must stay the quieter
   * of the two, and this is the test that keeps it there.
   */
  it('keeps the seam floor quieter than the wall above it, so the seam has a profile', () => {
    for (const theme of THEMES) {
      const lit = applyBoardPurple(theme, 'underglow')!;
      const wall = mixHexSRGB(
        theme.tileWall,
        lit.seamUnderglow!,
        lit.seamUnderglowStrength!
      );
      expect(luminance(lit.seamUnderglowFloor!)).toBeLessThan(luminance(wall));
    }
  });
});
