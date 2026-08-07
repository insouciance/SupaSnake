/**
 * NEON DYNASTY THEMES - the board's colour languages.
 *
 * CONCEPT, 2026-08-06. The slab shipped as a single cool-slate stone whose
 * top face was near enough to the page backdrop that the owner read it as
 * "too dark and visually dead". This module does NOT change the object: the
 * slab's geometry, its chamfer, its thickness, the cell pitch, the groove
 * profile and every screen-space width are shared by all three themes and are
 * authored exactly once, in `ArenaFloor`. What changes here is COLOUR
 * LANGUAGE, ATMOSPHERE and MATERIAL TUNING - nothing a player has to re-learn.
 *
 * THE ONE AUTHORITATIVE GEOMETRY. A theme may not move a vertex, widen a
 * groove or change a channel's screen-space width, because those are the
 * numbers a precision game is played on. Every theme therefore inherits
 * `SLAB_THICKNESS`, `SLAB_CHAMFER`, `MINOR_CHANNEL_WIDTH`, `MAJOR_CHANNEL_WIDTH`
 * and `TILE_BEVEL_WIDTH` from the component. A theme owns tones and weights.
 *
 * LUMINANCE PARITY IS DELIBERATE. All three top faces are authored within
 * ~2 sRGB levels of each other (Rec.709 luminance ~39-41 against the shipped
 * stone's ~31). Readability is therefore a property of the BOARD, not of the
 * dynasty a player happens to have picked - the snake, the terrain, THE LEAD
 * and the hazards are read against the same amount of light on every theme.
 *
 * WHY THE FACE IS ONLY ~30% LIGHTER, NOT TWICE AS LIGHT. Solid terrain is a
 * hazard and must never lose separation from the surface it stands on. The
 * perceived lift is bought instead by (a) CHROMA - a dark teal, a warm dark
 * graphite and a neutral charcoal all read as "material" where a neutral
 * near-black reads as "hole"; and (b) the TILE SHOULDER, whose lit chamfer
 * carries a value several times the face's luminance around every single
 * cell, so the board's average reads far lighter while the flat centre of a
 * cell - the part the snake, the food and the terrain are actually read
 * against - stays dark. Raising the flat albedo alone would have bought the
 * same look by spending the hazard's contrast, which is the one thing this
 * board cannot spend.
 *
 * A THIRD SOURCE WAS DELETED: restrained neon in the seams. Owner ruling,
 * 2026-08-07 - "we don't need the gridlines now anymore, they are rather a
 * disturbance" - so the interior of the board carries no drawn light at all
 * and the shoulder does the whole of the lifting. See `boardTiles.ts` for the
 * law and for the rule that came out of the rebalance: a lit shoulder must be
 * the same hue family as the plane it rolls off, or shading re-draws the grid.
 *
 * NAMING. The concept sheet labelled these VOID / CYAN / SOL. VOID is
 * deprecated vocabulary in this repo (CLAUDE.md: EMBER/CRYSTAL/VOID are never
 * reintroduced), so the themes carry their own ids and map onto the real
 * dynasties through ONE constant, `BOARD_THEME_BY_DYNASTY`, which is the only
 * line that has to change if the owner re-maps them at review.
 */

import type { DynastyId } from '@/shared/types/game';

export type BoardThemeId = 'cyanNeon' | 'solNeon' | 'darkNeon';

/**
 * THE SUPA SNAKE ORANGE.
 *
 * Not a new colour: this is the existing Venom Orange token, the same value
 * the logo, the Play button, `--venom-orange` and the terrain "this ground is
 * becoming yours" marker already carry. The SOL theme uses it verbatim so the
 * board is recognisably the same product as the button that started the run.
 */
export const SUPA_ORANGE = '#f2a03f';

export interface BoardTheme {
  id: BoardThemeId;
  /** Human label, for the fixture's own readout. */
  label: string;
  /** The dynasty this colour language was authored against. */
  dynasty: DynastyId;

  /* ---- THE SLAB BODY (vertex colours on one geometry, one draw) ---- */
  /** Top face: the surface the whole game is read against. */
  face: string;
  /** The chamfer. The one bright value on the body - it exists to catch the key. */
  bevel: string;
  /** Side faces. Raw body under a polished face. */
  side: string;
  /** Underside. Dark, never pure black - a black face has no form to reveal. */
  base: string;
  /** Scattered light under a tile with no floor beneath it. */
  halo: string;

  /* ---- THE BOARD PASS (one analytic fragment shader, one draw) ---- */
  /** The checker's tonal lift - a finish difference, not a colour. */
  checker: string;
  checkerAlpha: number;
  /** The floor of a carved seam. Dark and TINTED; never #000. */
  grooveShadow: string;
  /** The lit wall of a carved seam. */
  grooveLight: string;
  /** Composite strength of the minor (every cell) and major (every 5) cuts. */
  minorDepth: number;
  majorDepth: number;
  /** The lit and shaded halves of the roll that turns every cell into a pad. */
  tileBevelLight: string;
  tileBevelShade: string;
  tileBevelStrength: number;

  /* ---- THE TILE BLOCK (one baked geometry, one draw - see boardTiles.ts) ---- */
  /**
   * The saturated MIDTONE on a shoulder the key light only grazes.
   *
   * The character guide's three tones, mapped onto a tile: the shoulders facing
   * the lamp take `bevel` (the bright graphic highlight on a top-facing edge),
   * the top plane and the grazing shoulder take the midtone, and everything
   * vertical takes the shadow. This is the midtone's SHOULDER member - it sits
   * within one band of `face` in luminance so the play surface keeps its
   * authored value, and it carries markedly more chroma so the shoulder still
   * reads as its own plane. Saturation is what separates the two, not light.
   */
  tileEdgeMid: string;
  /**
   * The bright graphic HIGHLIGHT on the shoulders the key light faces.
   *
   * Not `bevel`. `bevel` is the SLAB's single chamfer, authored as a light
   * desaturated stone because one cut edge on one big object may be a neutral
   * - and rendered on 400 tile shoulders the same value is a pastel, which the
   * character guide's NEVER list forbids by name. This is its saturated
   * sibling: the same brightness band, carrying the theme's own chroma, so a
   * lit shoulder reads as this board catching light rather than as grey
   * plastic. All three sit within ~2 levels of each other, like the faces.
   */
  tileEdgeKey: string;
  /**
   * The SHADOW face: the wall a tile drops into its seam with.
   *
   * "Substantially darker shadow faces", and never grey - a shadow here is a
   * dark, more saturated member of the theme's own hue family. On SOL that is
   * literally the sheet's "deep burnt orange"; on CYAN it is a deep saturated
   * teal and on DARK a deep saturated slate, because the clause is about hue
   * FAMILY and those are the families those boards are made of.
   */
  tileWall: string;
  /** Restrained neon living in the bottom of the cut. */
  neon: string;
  /** Per-cell seams get a whisper; the emphasis grid and the perimeter carry it. */
  neonMinor: number;
  neonMajor: number;
  neonEdge: number;

  /* ---- THE RIM AND THE ATMOSPHERE ---- */
  /** The curb's own stone, before any tint. */
  rimStone: string;
  /** The colour the curb is cast and lit with. */
  rimTint: string;
  rimTintAmount: number;
  /** Resting emissive and pulse, before the component's emissive scale. */
  rimEmissive: number;
  rimPulse: number;
  /** How much of the rim's emissive scale a neon board keeps (see ArenaBorder). */
  rimEmissiveScale: number;
  /** The soft outer wash. Atmosphere, not a painted frame. */
  edgeWash: string;
  edgeWashStrength: number;
}

/**
 * CYAN NEON - clean, futuristic, controlled. Maximum readability.
 *
 * CYBER's own primary (#35e6ff) is the neon, so the board and the dynasty are
 * one statement. The risk this theme carries is CYBER's calcified rings: their
 * VOLT rune is #42e0f5, three degrees off this neon. That risk is now largely
 * retired by the line-free ruling: the neon reaches only the PERIMETER, so
 * there is no longer any glowing cyan inside the playfield for a rune to be
 * confused with. The rune sits 0.76 above the board, on a #3f5060 block,
 * inside a #0b1118 ink hull, casting a shadow the lighter face shows.
 * Frequency, elevation, hull and shadow all separate them; hue alone was never
 * doing that work.
 *
 * WHAT CARRIES THE THEME NOW is `tileEdgeKey` - a saturated cyan-teal on the
 * shoulders the key light faces - against a dark teal plane. Same hue family,
 * so the lit shoulders read as this stone catching light rather than as a
 * lattice drawn over it. That is why CYAN needed no rebalance when the seam
 * light went: its colour was already on a surface.
 */
const CYAN_NEON: BoardTheme = {
  id: 'cyanNeon',
  label: 'CYAN NEON',
  dynasty: 'CYBER',
  face: '#1c333e',
  bevel: '#6f9fb2',
  side: '#23404d',
  base: '#0a161c',
  halo: '#2c5f70',
  checker: '#5f93a8',
  checkerAlpha: 0.05,
  grooveShadow: '#061217',
  grooveLight: '#8fd2e6',
  minorDepth: 0.62,
  majorDepth: 0.74,
  tileBevelLight: '#7db6ca',
  tileBevelShade: '#0c1f27',
  tileBevelStrength: 0.3,
  tileEdgeMid: '#1b4050',
  tileEdgeKey: '#2f9ab8',
  tileWall: '#0e2029',
  neon: '#35e6ff',
  neonMinor: 0.032,
  neonMajor: 0.34,
  neonEdge: 0.58,
  rimStone: '#1f333d',
  rimTint: '#35e6ff',
  rimTintAmount: 0.12,
  rimEmissive: 0.55,
  rimPulse: 0.05,
  rimEmissiveScale: 0.18,
  edgeWash: '#35e6ff',
  edgeWashStrength: 0.12,
};

/**
 * SUPA SNAKE ORANGE - energetic, iconic, recognisably this product.
 *
 * NOT an orange board. The tiles are a warm dark graphite; the brand orange is
 * spent only where light belongs - the emphasis seams, the perimeter edge
 * light, the curb's cast and the outer wash. PRIMAL's snake is #98e15a, which
 * a warm dark surface flatters rather than fights, and PRIMAL's Fortress
 * terrain is cool #3f5060 slate, so the hazard separates from this board by
 * TEMPERATURE as well as by value.
 *
 * The known adjacency is the amber "ground becoming yours" marker, which is
 * this exact hex. It stays legible because it is a filled 0.86-of-a-cell pad
 * with four shrinking rails, animating, at cell CENTRE - and after the
 * line-free ruling there is no orange at a cell boundary at all for it to be
 * read against. The brand colour now appears inside the playfield only as that
 * marker, which is the cleanest this adjacency has ever been.
 *
 * WHAT CARRIES THE THEME is `tileEdgeKey`, a gold on the shoulders the key
 * light faces, over a warm dark graphite plane - same family, so the board
 * reads as warm stone under a warm lamp rather than as a gold grid.
 */
const SOL_NEON: BoardTheme = {
  id: 'solNeon',
  label: 'SUPA SNAKE ORANGE',
  dynasty: 'PRIMAL',
  face: '#332f29',
  bevel: '#8b7458',
  side: '#352e27',
  base: '#17110b',
  halo: '#5c4526',
  checker: '#8f7f6b',
  checkerAlpha: 0.05,
  grooveShadow: '#150e07',
  grooveLight: '#c0a288',
  minorDepth: 0.6,
  majorDepth: 0.72,
  tileBevelLight: '#9d8871',
  tileBevelShade: '#1d150e',
  tileBevelStrength: 0.3,
  tileEdgeMid: '#4a3419',
  tileEdgeKey: '#bd7c38',
  tileWall: '#1e1811',
  neon: SUPA_ORANGE,
  neonMinor: 0.02,
  neonMajor: 0.34,
  neonEdge: 0.62,
  rimStone: '#332a22',
  rimTint: SUPA_ORANGE,
  rimTintAmount: 0.11,
  rimEmissive: 0.5,
  rimPulse: 0.045,
  rimEmissiveScale: 0.16,
  edgeWash: SUPA_ORANGE,
  edgeWashStrength: 0.1,
};

/**
 * DARK NEON - sharp, high contrast, slightly aggressive.
 *
 * Neutral deep-graphite tiles. Its orange is deliberately NOT the brand hex:
 * #ff8a2b is hotter and more saturated, which is what separates this board
 * from SOL at a glance and what "slightly aggressive high-energy" sounds like
 * in colour. The brand orange stays spoken for by the SOL theme and by the
 * amber value law.
 *
 * THE THEME THE LINE-FREE RULING COST THE MOST, and what it may NOT be paid
 * back with. Rebalanced 2026-08-07, and the failed attempt is recorded here
 * because it is the more useful half of the finding.
 *
 * Measured on the first line-free render, not predicted: DARK came back a
 * neutral grey board with a thin orange edge. Every other theme survived
 * losing its seam light because its own hue was already ON A SURFACE - CYAN's
 * lit shoulders are a saturated cyan-teal, SOL's are gold - while DARK's tile
 * tones are cool steel and its heat lived exclusively in the cuts.
 *
 * THE OBVIOUS FIX IS FORBIDDEN BY THE RULING ITSELF. Moving the heat onto
 * `tileEdgeKey` - a vivid hot orange-red on the shoulders the key light faces,
 * at the same luminance as the other two themes - was rendered and REJECTED:
 * a lit shoulder runs the whole length of a cell and every tile has two of
 * them, so at high hue contrast against the plane they fuse across the board
 * into a glowing orange lattice. That is a gridline drawn out of shading
 * rather than out of ink, and it is indistinguishable at a glance from the
 * filament the owner just had removed.
 *
 * THE RULE THAT FALLS OUT, and it now governs every future theme: A LIT
 * SHOULDER MUST BE THE SAME HUE FAMILY AS THE PLANE IT ROLLS OFF. Cyan on
 * teal and gold on warm graphite read as one material catching light; orange
 * on cold grey reads as two materials, and the brighter one becomes a line.
 * Saturation was never the problem - CYAN's shoulder is the most saturated of
 * the three - hue contrast is.
 *
 * SO THE HEAT WENT WHERE LIGHT CANNOT BECOME A LINE: the float halo under the
 * slab, which is scattered light in the empty space around the board's
 * silhouette, and the curb's stone tint. Neither runs along anything. DARK is
 * therefore the COLD BOARD with a hot atmosphere - the most neutral stone of
 * the three, the hardest tone ladder, and its orange confined to the boundary
 * and the air around it. Against CYAN it separates by chroma (a neutral
 * graphite against a saturated teal); against SOL by temperature.
 *
 * The perimeter deliberately did NOT go up to compensate. COSMIC's edges wrap,
 * its rim is permanently dim by ratified rule (WP-3.13), and answering a lost
 * identity by lighting up a boundary that is supposed to be quiet would trade
 * a colour problem for a rules problem.
 *
 * COSMIC is the torus dynasty, and its rim is permanently dim and translucent
 * because its edges do not kill. That rule outranks the theme: the rim numbers
 * below are what a killing edge would get, and `ArenaBorder` overrides them
 * while `torus` is true, exactly as it does on the stone board.
 */
const DARK_NEON: BoardTheme = {
  id: 'darkNeon',
  label: 'DARK NEON',
  dynasty: 'COSMIC',
  face: '#2c2f35',
  bevel: '#89929c',
  side: '#31363d',
  base: '#101317',
  // The hot atmosphere. Scattered light in the empty space UNDER the slab, so
  // it can carry the theme's temperature without lying along anything - the
  // one place DARK's heat can live on a board with no lit seams.
  halo: '#5c4a40',
  checker: '#8892a0',
  checkerAlpha: 0.045,
  grooveShadow: '#0b0d10',
  grooveLight: '#b7c1cd',
  minorDepth: 0.66,
  majorDepth: 0.78,
  tileBevelLight: '#8e98a5',
  tileBevelShade: '#15181c',
  tileBevelStrength: 0.31,
  tileEdgeMid: '#2a3b4f',
  // Cool steel, and it stays cool ON PURPOSE - see the shoulder rule above.
  // This is the plane's own family at highlight brightness; a hot value here
  // was rendered and rejected for redrawing the grid out of shading.
  tileEdgeKey: '#5c8ba8',
  tileWall: '#171b21',
  neon: '#ff8a2b',
  neonMinor: 0.018,
  neonMajor: 0.4,
  // The quietest perimeter of the three, and deliberately so: COSMIC's edges
  // WRAP. The rim already says that by staying dim and translucent, and a
  // confident glowing boundary would argue with it. This line still tells the
  // player where the board ends - which a torus player needs, because that is
  // where they come out the other side - without claiming to be a wall.
  neonEdge: 0.46,
  rimStone: '#2b2f35',
  rimTint: '#ff8a2b',
  // The curb takes a little more of the theme's cast than the other two. It is
  // a solid object standing beside the board, not a line on it, so warmth here
  // costs nothing the ruling protects - and on the torus dynasty, whose rim is
  // permanently dim and translucent, an ALBEDO tint is the only rim channel
  // that still reaches the eye at all.
  rimTintAmount: 0.14,
  rimEmissive: 0.42,
  rimPulse: 0.035,
  rimEmissiveScale: 0.16,
  edgeWash: '#ff8a2b',
  edgeWashStrength: 0.1,
};

export const BOARD_THEMES: Record<BoardThemeId, BoardTheme> = {
  cyanNeon: CYAN_NEON,
  solNeon: SOL_NEON,
  darkNeon: DARK_NEON,
};

/**
 * THE MAPPING. One constant, one line per dynasty.
 *
 * The concept sheet's proposed pairing, in the repo's own vocabulary:
 * cyan -> CYBER, sol-orange -> PRIMAL, dark-neon -> COSMIC. Re-mapping at
 * review means editing these three lines and nothing else - no theme, no
 * shader, no component knows which dynasty it belongs to except through here.
 */
export const BOARD_THEME_BY_DYNASTY: Record<DynastyId, BoardThemeId> = {
  CYBER: 'cyanNeon',
  PRIMAL: 'solNeon',
  COSMIC: 'darkNeon',
};

export function getBoardTheme(id: BoardThemeId): BoardTheme {
  return BOARD_THEMES[id];
}

export function boardThemeForDynasty(dynasty: DynastyId): BoardTheme {
  return BOARD_THEMES[BOARD_THEME_BY_DYNASTY[dynasty]];
}

/** The shipped stone board, selectable for an A/B against the concept. */
export const BOARD_THEME_STONE = 'stone' as const;

export type BoardThemeSelection = DynastyId | typeof BOARD_THEME_STONE;

/**
 * Parse `?boardTheme=` into a selection, with a safe default.
 *
 * Accepts a dynasty name in either case (`cyber`, `CYBER`), the theme's own id
 * (`cyanNeon`), or `stone` for the shipped board. Anything else - including a
 * missing value - returns `undefined`, and the caller falls back to the
 * fixture's own `?dynasty`. Never a raw cast: this is a URL.
 */
export function parseBoardThemeSelection(
  value: string | undefined
): BoardThemeSelection | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === BOARD_THEME_STONE || normalized === 'off') {
    return BOARD_THEME_STONE;
  }
  if (normalized === 'cyber' || normalized === 'cyanneon') return 'CYBER';
  if (normalized === 'primal' || normalized === 'solneon') return 'PRIMAL';
  if (normalized === 'cosmic' || normalized === 'darkneon') return 'COSMIC';
  return undefined;
}

/** Resolve a selection into the theme to render, or null for shipped stone. */
export function resolveBoardTheme(
  selection: BoardThemeSelection | undefined,
  fallbackDynasty: DynastyId
): BoardTheme | null {
  if (selection === BOARD_THEME_STONE) return null;
  return boardThemeForDynasty(selection ?? fallbackDynasty);
}
