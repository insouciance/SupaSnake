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

/**
 * THE MARK'S PURPLE - the brand family, verbatim.
 *
 * SOURCE OF TRUTH, and it is a module rather than a picture:
 * `scripts/brand/markGeometry.mjs` exports `MARK_PALETTE` (lines 95-110) and is
 * "the only place the mark is drawn" - every PNG, WebP, favicon and app icon in
 * `public/brand/` is rasterised from it, and `assets/brand/supasnake-mark.svg`
 * is its OUTPUT, not its source. These four values are that palette's violet
 * members, copied unchanged; `node scripts/build-brand-assets.mjs --check`
 * proves the shipped family still matches the generator.
 *
 * NAMED TO MATCH HOME ROUND 2, deliberately. That branch tokenised the same
 * four values for the home surface (`--brand-purple`, `-shade`, `-deep`,
 * `-ink`) by reading `assets/brand/supasnake-mark.svg` directly. The two
 * extractions were done independently, from the generator and from its output,
 * and they agree to the byte - so the keys here carry Home's token names rather
 * than the generator's internal ones, and the train reconciles by inspection
 * instead of by translation. The generator's own names are recorded beside each
 * value because that is where the ROLE is documented.
 *
 *   base   `--brand-purple`        MARK_PALETTE.burstRim: the burst's LIT
 *                                  TOP-LEFT EDGE, the model's brightest violet
 *                                  decile. Home treats it as the primary, and
 *                                  the frame band uses it for the same reason
 *                                  the Mark does - it is the value the shape
 *                                  takes where it catches light.
 *   shade  `--brand-purple-shade`  MARK_PALETTE.burst: the modal violet of the
 *                                  burst's BODY, the largest area of purple in
 *                                  the logo. Dimmer than base, which is what
 *                                  the underglow needs.
 *   deep   `--brand-purple-deep`   MARK_PALETTE.burstShade: the hard-edged
 *                                  darker region the lettering sits on.
 *   ink    `--brand-purple-ink`    MARK_PALETTE.burstEdge: the shape's outer
 *                                  contour.
 *
 * `deep` and `ink` are unused by this experiment and are carried so the family
 * is complete in one place - a later reader finds the fourth member here rather
 * than discovering it in the SVG. Lower-case to match Home's tokens character
 * for character; the SVG writes the same values upper-case.
 */
export const BRAND_PURPLE = {
  base: '#a201ae',
  shade: '#7d0275',
  deep: '#33012d',
  ink: '#170116',
} as const;

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

  /* ---- THE BRAND PURPLE EXPERIMENT - ABSENT ON ALL THREE SHIPPED THEMES ---- */
  /**
   * (a) SEAM UNDERGLOW: the violet the bottom of a groove WALL fades into.
   *
   * Optional, and absent from `CYAN_NEON`, `SOL_NEON` and `DARK_NEON`, so the
   * board a player sees is byte-identical to the one before this experiment
   * existed. Only `applyBoardPurple` ever sets it.
   */
  seamUnderglow?: string;
  /** (a) How far that wall bottom leans into it, as an sRGB mix. */
  seamUnderglowStrength?: number;
  /**
   * (a) The seam FLOOR, already banded.
   *
   * A RESOLVED colour rather than a colour-plus-weight, because the slab's top
   * face is one flat vertex tone with nothing to interpolate along - the mix
   * has to happen somewhere and the theme layer is where the purple lives.
   *
   * It exists as its own token instead of tinting `grooveShadow`, and that is
   * load-bearing: `grooveShadow` is ALSO the hue family every shadow band on
   * the board leans into (`createBoardCelRamp`, at 0.55 on the darkest band)
   * and the analytic pass's own groove colour (`ArenaFloor`'s `uGrooveShadow`).
   * Tinting it would push violet into every shadow on every surface, which is
   * precisely the "purple replaces the house colour" failure this experiment
   * has to avoid.
   */
  seamUnderglowFloor?: string;
  /**
   * (b) SLAB FRAME BAND: the slab's outer chamfer, already banded.
   *
   * ONE ring around the whole play space - `createArenaSlabGeometry` paints
   * four quads with `tones.bevel` and this replaces that tone. Deliberately NOT
   * per-tile: 400 tile bands would fight the authored five-tone cel ladders in
   * `boardTiles.ts` and would re-draw the grid the 2026-08-07 ruling removed.
   */
  slabFrameBand?: string;
}

/**
 * Mix two sRGB hexes, in sRGB space, returning a hex.
 *
 * PERCEPTUAL ON PURPOSE, and the same choice `boardTiles.ts`'s `mixSRGB` makes
 * for the same reason: an authored percentage has to be a perceived percentage
 * or the number written in this file is not the number on the screen. A linear
 * mix of these dark tones toward a mid violet would land visibly short of what
 * the constant claims.
 *
 * Kept dependency-free (no three.js) so the theme layer stays a table of
 * values that a test can read without a renderer.
 */
export function mixHexSRGB(from: string, toward: string, amount: number): string {
  const t = Math.min(Math.max(amount, 0), 1);
  const parse = (hex: string): [number, number, number] => {
    const value = Number.parseInt(hex.replace('#', ''), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  };
  const a = parse(from);
  const b = parse(toward);
  const channel = (index: number): number =>
    Math.round(a[index] * (1 - t) + b[index] * t);
  const hex = (value: number): string => value.toString(16).padStart(2, '0');
  return `#${hex(channel(0))}${hex(channel(1))}${hex(channel(2))}`;
}

/**
 * THE BOARD PURPLE EXPERIMENT - two independently judgeable variants.
 *
 * OWNER CONTEXT, 2026-08-07/08: the Mark's purple was ruled a DEFINING BRAND
 * COLOUR, overturning the earlier "purple is logo-only" position, and the owner
 * floated putting it on the gameboard and approved prototyping it. Nothing here
 * ships. There is no default, no flag, no env var: the only way to see any of
 * it is to type `?boardPurple=` into a route that `notFound()`s in production.
 *
 * THE LAW IT HAS TO SURVIVE. `BOARD_THEME_BY_DYNASTY` gives each house its own
 * neon and that house read is a design pillar. So the purple is placed where it
 * is structurally incapable of becoming the house colour:
 *
 *   NOT on the top plane      - 72% of the board's area, where the character is
 *                               read. Untouched.
 *   NOT on a shoulder         - the lit chamfer is the ONE feature carrying each
 *                               theme's colour onto a surface (see `boardTiles`
 *                               on why a hot shoulder was rendered and
 *                               rejected). Violet on 1,600 shoulders would BE
 *                               the board's colour. Untouched.
 *   NOT on `neon`             - the house's own value is not touched at all, so
 *                               the perimeter edge light stays exactly the hue
 *                               it was authored as.
 *   ONLY the groove floor and the bottom of a groove wall, which are the
 *   darkest, most occluded surfaces on the board and are geometrically UNDER
 *   the house neon: at the perimeter, where the house light actually lands, the
 *   violet is laid down first and the neon is mixed ON TOP of it. That is the
 *   brief's "purple sits under it, dimmer, constant" expressed as a layer order
 *   rather than as a hope about strengths.
 *
 * THE TENSION WITH THE LINE-FREE RULING, AND HOW IT WAS RESOLVED.
 *
 * The ruling of 2026-08-07 - "we don't need the gridlines now anymore, they are
 * rather a disturbance" - zeroed every interior seam's drawn light, and the
 * underglow puts colour back into those seams. The first prototype was shot at
 * `SEAM_UNDERGLOW_WALL = 0.34` / `FLOOR = 0.42` and the close-up was blunt
 * about the cost: at that weight the violet filled the channel edge to edge and
 * the board wore a violet LATTICE - the same figure the ruling removed, in a
 * new colour. That finding was put to the owner rather than tuned away.
 *
 * OWNER RULING, 2026-08-08, on those twelve shots plus the close-up pair:
 *
 *   "board purple - let's do it. we do both, underglow + frame, but make the
 *    underglow a little bit more transparent and 'glowy', but subtle changes."
 *
 * So the lattice is wanted, at the right subtlety, and the two variants are the
 * board's shipped look rather than an experiment - see `BOARD_PURPLE_DEFAULT`.
 * What the ruling buys is a re-tune, not a re-placement: the violet stayed
 * exactly where it was and got quieter and softer. See the two strength
 * constants for the numbers and for what "glowy" means as geometry.
 */
export type BoardPurpleMode = 'off' | 'underglow' | 'frame' | 'both';

/**
 * How far the bottom of a groove WALL leans into the burst violet.
 *
 * 0.30, DOWN FROM THE PROTOTYPE'S 0.34, and the smaller of the two cuts on
 * purpose. The wall was never the surface building the lattice - it already
 * carried a vertical ramp and it is the most occluded plane in the cut - so
 * gutting it would only have cost the effect its presence. Most of the "more
 * transparent" half of the ruling is spent on the FLOOR instead; see below.
 *
 * THE NUMBER WAS SET AGAINST PIXELS, NOT TASTE. Three close-ups were rendered
 * at the ratified pitch: 0.34/0.42 read as a saturated violet lattice, the
 * finding that went to the owner; 0.22/0.18 fell under the threshold of being
 * visible at all, which is not "subtle" but absent; 0.30/0.24 is the landing -
 * a violet plainly there in the channel with the tile's own stone still reading
 * through it, and the cyan shoulders still owning the frame.
 *
 * IT REMAINS LUMINANCE-NEUTRAL, and by construction rather than by luck:
 * `BRAND_PURPLE.shade` has a Rec.709 luminance of ~36/255 and the three wall
 * tones sit at ~29 (CYAN #0e2029), ~25 (SOL #1e1811) and ~27 (DARK #171b21).
 * The violet is within a few levels of the surface it mixes into, so the seam
 * gets more COLOUR and not more light - which is also why it cannot flatten the
 * shoulder-to-wall step the board reads its boundaries from. Lowering the
 * weight only moves it further inside that bound.
 *
 * WHERE THE "GLOWY" READ COMES FROM, and it is geometry rather than a filter.
 * This weight lands on the wall's BOTTOM corners only; its top corners, where
 * the wall meets the lit shoulder, stay the theme's own tone. Four vertices per
 * wall, linearly interpolated across the quad, are a smooth vertical ramp -
 * brightest in the deepest part of the cut, gone by the time it reaches the
 * shoulder. No emissive, no bloom, no second pass: the falloff is baked into
 * the vertex colours, which is what keeps it identical at T4 with the composer
 * off.
 */
const SEAM_UNDERGLOW_WALL = 0.3;

/**
 * How far the seam FLOOR leans into it.
 *
 * 0.24, DOWN FROM 0.42, and now DELIBERATELY DIMMER THAN THE WALL ABOVE IT -
 * which is the other half of "glowy" and by far the bigger of the two
 * corrections. The wall came down by a tenth; this came down by nearly half AND
 * changed its rank against the wall, and that reordering is the actual fix.
 *
 * The prototype had this the other way round, and that inversion is what built
 * the lattice: the floor is the one surface in a seam that faces the key light,
 * so a flat, full-strength violet there was a bright uniform strip running the
 * whole length of every cut, edge to edge, with a hard boundary against the
 * shoulder. A strip like that is a drawn line however softly its neighbours are
 * shaded.
 *
 * Dimmer than the wall, the seam gains a PROFILE instead: the violet peaks as a
 * thin rim at the base of the wall, falls off upward along the wall's ramp, and
 * falls off downward onto a darker floor. Bright core, soft both ways - which
 * is what a glow is, and what a flat fill is not. It also keeps the seam
 * reading as a cut rather than as a lit slot, the failure `SEAM_GLOW` records
 * from its own first render.
 *
 * This tone also paints the APRON - the slab's top face reaches past the tile
 * field - so at this weight the board sits on a faint violet bed rather than a
 * violet one. That is wanted: it is the brand constant under the whole object,
 * and unlike a seam it lies along nothing.
 */
const SEAM_UNDERGLOW_FLOOR = 0.24;

/**
 * How far the slab's outer chamfer leans into the burst RIM.
 *
 * HIGH, and the frame's whole point is that it is high. The band is the
 * universe's constant - the Mark's burst framing the wordmark, applied to the
 * one ring around the play space - so it must read as brand violet on all
 * three houses rather than as three violets. What the remaining 22% buys is a
 * trace of each theme's own stone in the band (cyan-violet, warm violet,
 * steel-violet), which is there to be judged: the owner may want the constant
 * absolute, and 1.0 is the edit that makes it so.
 *
 * THE RIM, NOT THE BODY, and the Mark is the reason. On the logo `burstRim` is
 * the value the shape takes where it CATCHES LIGHT, and the slab chamfer's
 * documented job is "the one bright value on the body - it exists to catch the
 * key". Same role, same value. It is still a real luminance drop on this one
 * ring (CYAN's #6f9fb2 sits at ~150 against the rim's ~48), and that drop is
 * the honest cost of the variant rather than a bug: a frame cannot be violet
 * and stay a light stone. It touches no play surface - the chamfer is outside
 * the tile field entirely - so nothing the game is read against moves.
 */
const SLAB_FRAME_BAND = 0.78;

/**
 * Derive the experiment's theme from a shipped one. PURE - never mutates.
 *
 * Passing `null` for either argument returns the input untouched, so a caller
 * can hand it a stone board (`null` theme) or an absent flag without branching.
 */
export function applyBoardPurple(
  theme: BoardTheme | null,
  mode: BoardPurpleMode | null | undefined
): BoardTheme | null {
  if (!theme || !mode || mode === 'off') return theme;
  const next: BoardTheme = { ...theme };
  if (mode === 'underglow' || mode === 'both') {
    next.seamUnderglow = BRAND_PURPLE.shade;
    next.seamUnderglowStrength = SEAM_UNDERGLOW_WALL;
    next.seamUnderglowFloor = mixHexSRGB(
      theme.grooveShadow,
      BRAND_PURPLE.shade,
      SEAM_UNDERGLOW_FLOOR
    );
  }
  if (mode === 'frame' || mode === 'both') {
    next.slabFrameBand = mixHexSRGB(
      theme.bevel,
      BRAND_PURPLE.base,
      SLAB_FRAME_BAND
    );
  }
  return next;
}

/**
 * Parse `?boardPurple=underglow|frame|both`.
 *
 * Anything else - including a missing value, an empty one and `off` - returns
 * null - meaning "the URL said nothing about purple" - and the caller falls back
 * to `BOARD_PURPLE_DEFAULT`, which is the board that ships. This is the
 * `parseArrivalMode` idiom exactly: an absent or unrecognised value leaves the
 * shipped default alone, and only a value the parser recognises overrides it.
 *
 * `off` is the DEV COMPARISON PIN and the one value that is not a variant: it
 * strips the purple entirely so the pre-ruling board can be flipped against the
 * shipped one live. Never a raw cast: this is a URL. Callers gate it on a
 * non-production build, the same contract `applyArrivalModeFromSearch` carries;
 * the only caller today is `/dev/cockpit`, which already `notFound()`s in
 * production.
 */
export function parseBoardPurpleMode(
  value: string | undefined
): BoardPurpleMode | null {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === 'off' ||
    normalized === 'underglow' ||
    normalized === 'frame' ||
    normalized === 'both'
  ) {
    return normalized;
  }
  return null;
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

/**
 * THE BOARD'S SHIPPED PURPLE. Ratified 2026-08-08 - the board wears the brand.
 *
 * `both`, on all three themes: the tuned seam underglow and the slab frame
 * band, with every house's neon untouched on top of them. This is not a flag
 * and not an experiment - it is what `BOARD_THEMES` MEANS now, and the only way
 * to see a board without it is `/dev/cockpit?boardPurple=off`, a route that
 * `notFound()`s in production.
 *
 * It lives as one constant for the same reason `BOARD_THEME_BY_DYNASTY` does:
 * re-ruling the board's purple is editing this line and nothing else.
 */
export const BOARD_PURPLE_DEFAULT: BoardPurpleMode = 'both';

/**
 * Every theme in every purple mode, derived ONCE at module load.
 *
 * REFERENTIAL STABILITY IS THE POINT, not speed. `applyBoardPurple` is pure and
 * returns a fresh object, and the tile field is a 24,000-vertex geometry that
 * `ArenaFloor` rebuilds through a `useMemo` keyed on the THEME OBJECT. Deriving
 * per call would hand that memo a new identity on every render and rebuild the
 * whole board every frame. Twelve objects built once means every caller that
 * asks for the same board gets the same reference forever, which is the
 * property the memo actually needs.
 */
const THEMES_BY_PURPLE: Record<BoardPurpleMode, Record<BoardThemeId, BoardTheme>> =
  (() => {
    const modes: BoardPurpleMode[] = ['off', 'underglow', 'frame', 'both'];
    const table = {} as Record<BoardPurpleMode, Record<BoardThemeId, BoardTheme>>;
    for (const mode of modes) {
      table[mode] = {
        cyanNeon: applyBoardPurple(CYAN_NEON, mode)!,
        solNeon: applyBoardPurple(SOL_NEON, mode)!,
        darkNeon: applyBoardPurple(DARK_NEON, mode)!,
      };
    }
    return table;
  })();

export function getBoardTheme(
  id: BoardThemeId,
  purple: BoardPurpleMode = BOARD_PURPLE_DEFAULT
): BoardTheme {
  return THEMES_BY_PURPLE[purple][id];
}

export function boardThemeForDynasty(
  dynasty: DynastyId,
  purple: BoardPurpleMode = BOARD_PURPLE_DEFAULT
): BoardTheme {
  return getBoardTheme(BOARD_THEME_BY_DYNASTY[dynasty], purple);
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

/**
 * Resolve a selection into the theme to render, or null for shipped stone.
 *
 * `purple` is the dev pin and defaults to the shipped board, so a caller that
 * says nothing about purple gets the ratified look. Null - the value
 * `parseBoardPurpleMode` returns for a URL that mentions no purple at all - is
 * the same as saying nothing.
 */
export function resolveBoardTheme(
  selection: BoardThemeSelection | undefined,
  fallbackDynasty: DynastyId,
  purple: BoardPurpleMode | null = BOARD_PURPLE_DEFAULT
): BoardTheme | null {
  if (selection === BOARD_THEME_STONE) return null;
  return boardThemeForDynasty(
    selection ?? fallbackDynasty,
    purple ?? BOARD_PURPLE_DEFAULT
  );
}
