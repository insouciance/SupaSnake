import * as THREE from 'three';
import type { BoardTheme } from './boardThemes';

/**
 * THE TILE BLOCK - the board, built as 400 physical objects.
 *
 * OWNER RULING, 2026-08-07: "no grooves are visible, no terrain 3D like in the
 * graphics provided... also, the game board must have those 90s cartoon
 * elements. it's all a coherent composition."
 *
 * WHY THE SHADER BOARD FAILED, precisely. `ArenaFloor`'s analytic pass argued
 * (correctly, for its time) that a ~2px channel is never resolved as DEPTH at
 * this camera, only as SHADING, so a shading term was enough. The argument has
 * one unstated premise: that the groove has to stay 2px. It does not. Once the
 * seam is a real gap between real blocks it is ~6px of dark at the default
 * cockpit framing, it OCCLUDES - the near wall of a groove hides its own floor,
 * which no fragment shader over a flat plane can ever do - and every tile
 * carries a silhouette the ink hull can draw a line around. Shading could not
 * buy any of that at any strength, which is why turning the old numbers up was
 * never going to answer the note.
 *
 * SO: one baked, non-instanced `BufferGeometry` holding every tile. ONE draw
 * call for the whole field - the second, the ink hull, is retired with the
 * drawn seam (see THE LINE-FREE SEAM below) and returns only under the
 * compare toggle.
 *
 * WHY BAKED AND NOT INSTANCED. Instancing would also be one draw, but an
 * instance is a rigid transform of ONE geometry - every tile would have to be
 * identical. Baking makes each tile's four sides individually authorable, and
 * the board still needs exactly that: a tile on the perimeter carries the
 * board's edge light on its OUTWARD side and nothing on its other three, which
 * no instance of a single tile can express. (Before the line-free ruling the
 * emphasis grid needed it too; that class is now zero and the perimeter is
 * what the mechanism is for.) 400 tiles x 10 quads x 6 vertices = 24k vertices
 * and 8k triangles, which is a fifth of what the snake spends at extreme
 * density.
 *
 * -----------------------------------------------------------------------------
 * THE CHARACTER STYLE GUIDE, APPLIED TO THE STAGE
 * -----------------------------------------------------------------------------
 *
 * `docs/design/SNAKE_CHARACTER_STYLE_GUIDE.md` is the authority, and the board
 * is now governed by it so that board and snake read as drawn by one hand.
 * Clause by clause, and where each one lands:
 *
 *   Section 2, "HIGHLIGHT -> MID TONE -> SHADOW with relatively hard
 *   transitions... bright graphic highlights on top-facing edges; saturated
 *   midtones; substantially darker shadow faces"
 *       -> `toneForFace`. The three tones are assigned by ORIENTATION, not by
 *          hoping the light rig produces them:
 *            top plane          -> theme.face          (MID: the calm surface
 *                                                       the character stands on)
 *            shoulder into key  -> theme.tileEdgeKey   (HIGHLIGHT: the guide's
 *                                                       "bright graphic
 *                                                       highlight on a
 *                                                       top-facing edge")
 *            shoulder grazing   -> theme.tileEdgeMid   (saturated midtone)
 *            shoulder away/wall -> theme.tileWall      (SHADOW)
 *          The boundaries are HARD because they are vertex colours on flat
 *          quads: there is no interpolation across a band edge to soften.
 *
 *   Section 2, "no muddy gradients" / Section 11, "no pastels"
 *       -> every tone is the theme's own local colour, and after the line-free
 *          ruling the interior of the board holds no gradient at all: every
 *          quad on every tile that is not on the board's outer edge is ONE
 *          flat value. Round 3 made that value the theme's tone times the
 *          TILE'S OWN SHADE, which is still one flat value per quad and still
 *          not a gradient - see `TILE_SHADE_STEPS`, and note that a palette of
 *          five is what keeps it out of the "halftones" clause below. The only
 *          surviving gradient is the neon rising out of the PERIMETER cut,
 *          which is LIGHT, not shading - see `SEAM_GLOW`.
 *
 *   Section 3, "Thick near-black outline around the silhouette... thinner dark
 *   internal lines separate... body cubes, material boundaries"
 *       -> ONE weight, on the silhouette (`SLAB_INK_WIDTH`, in ArenaFloor).
 *          The internal line is REVOKED - see THE LINE-FREE SEAM below. The
 *          guide ALLOWS a thinner internal line; it does not require one, and
 *          on a field of 400 identical blocks 40 of them stop reading as
 *          "boundaries between body cubes" and start reading as a drawn grid.
 *          `TILE_INK_WIDTH` survives only to serve the compare toggle.
 *
 *   Section 1, "thick, CLEARLY SEPARATED from neighbours... substantial visible
 *   side faces, never flattened into tiles or slabs"
 *       -> `SEAM_WIDTH` and `SEAM_DEPTH`. The clause is written about the
 *          character's cubes and it is exactly the note the board got: the
 *          board's tiles were flattened into a slab. They are separated now.
 *
 *   Section 10, "NO graffiti / halftones / decorative-era graphics"
 *       -> the checker parity lift is DELETED on a themed board (see
 *          `ArenaFloor`). With real blocks the grid is read from the blocks;
 *          a tonal chessboard under them is decoration on the one surface the
 *          guide says must stay calm.
 *
 *   "The board gets the same visual language but SIMPLER and calmer than the
 *   snake, so the character pops instantly against it"
 *       -> the top plane, which is ~72% of the board's area, is ONE flat tone
 *          per tile, drawn from a five-shade palette whose whole spread is an
 *          order of magnitude under the step to a lit shoulder. All of the
 *          board's contrast is still spent at cell BOUNDARIES, where the snake
 *          never has to be read.
 *
 * -----------------------------------------------------------------------------
 * ROUND 3, OWNER, 2026-08-07 - "we're on the right track", three notes
 * -----------------------------------------------------------------------------
 *
 * The board was reviewed live and kept; what it got was three corrections of
 * degree, each argued at its own constant rather than summarised here:
 *
 *   FLATTER      `SEAM_DEPTH` 0.22 -> 0.16. "Carved panels, not raised
 *                buttons." The wall under the shoulder loses about half its
 *                height; the shoulder itself does not move.
 *   TIGHTER      `SEAM_WIDTH` 0.14 -> 0.11. A ~6px gap becomes a ~4.7px one,
 *                and occlusion survives because a narrower floor needs less
 *                wall to hide it.
 *   VARIED       `tileShade`. Five authored shades of stone, keyed off the
 *                tile's own grid coordinates, so every tile is a little bit
 *                different and the same tile is the same in every run.
 *
 * -----------------------------------------------------------------------------
 * THE LINE-FREE SEAM - OWNER RULING, 2026-08-07, after reviewing the blocks
 * -----------------------------------------------------------------------------
 *
 *   "we don't need the gridlines now anymore, they are rather a disturbance.
 *    the tiles already provide for proper orientation on the board."
 *
 * The ruling names a redundancy, and it is exact. Before the blocks existed a
 * line WAS the boundary: the board was a flat plane and the only way to say
 * "this cell ends here" was to draw it. The rework replaced that with a real
 * gap, a real wall and a real occlusion - and then kept drawing the line
 * anyway, twice: a thin ink hull around every tile, and a neon filament lying
 * in the bottom of every cut. Three statements of one fact, of which two are
 * ink and light spent on something the geometry already says for free. The
 * owner is reading the surplus as noise, which is what a redundant signal is.
 *
 * So an INTERIOR seam - any seam between two tiles - now carries NOTHING that
 * was drawn. No ink, no filament, no analytic groove shading (that last one
 * lives in `ArenaFloor`'s board pass and is switched off there by the same
 * flag). What remains is the three things the blocks are:
 *
 *   RECESS      the tile top stands SEAM_DEPTH proud of the groove floor.
 *   OCCLUSION   the near wall of a seam hides its own floor at every pitch
 *               this camera allows.
 *   TONE        `toneForFace` puts theme.tileWall - the SHADOW tone, dark and
 *               saturated - on all four walls, and the shoulder above it takes
 *               the bright key tone. That authored step from highlight to
 *               shadow across the shoulder IS the boundary, and it is drawn by
 *               the geometry's own orientation rather than over the top of it.
 *
 * THE PERIMETER IS NOT AN INTERIOR SEAM AND KEEPS ITS LIGHT. The outermost
 * boundary is not "between two tiles" - it is where the board ENDS, which is
 * the one line on this surface a player is actually judging a distance to. It
 * is the board's edge light, not a gridline, and the ruling is about the grid.
 *
 * THE COMPARE PATH. `seamLines` restores every drawn seam exactly as it was,
 * so the owner can flip the two live (`?gridlines=1`) rather than take this
 * file's word for the ruling. Default is the line-free board.
 */

/**
 * THE SEAM, in cells.
 *
 * At the default cockpit framing (~20.7 world units over the viewport height,
 * so ~43px per cell at a 900px-tall viewport) 0.14 was a ~6px gap - three times
 * the analytic groove it replaced, and a GAP rather than a shading term, so it
 * survives every zoom, pitch and DPR without a derivative trick.
 *
 * ROUND 3, OWNER: the seams want to be TIGHTER. 0.11 is a ~4.7px gap: a trim
 * rather than a minimisation, and deliberately so, because the seam has one job
 * this board cannot do without. The near wall of a groove has to OCCLUDE its
 * own floor, and occlusion is the property that separates a carved board from a
 * printed one. Narrowing the slot actually helps that (a narrower channel is
 * hidden by less wall), which is why this and `SEAM_DEPTH` could move in
 * opposite directions in the same pass without the depth cue going with them.
 *
 * It is bounded above by the play surface, and the bound got easier: a tile
 * 0.89 wide leaves a flat top of 0.71 after both chamfers, up from 0.70. The
 * objects that must sit ON a cell rather than across it - the food, THE LEAD, a
 * terrain block, a snake segment at 0.68-0.85 - keep their footprint centred on
 * that flat.
 */
export const SEAM_WIDTH = 0.11;

/** The tile's plan span: one cell, less the seam it shares with its neighbours. */
export const TILE_SPAN = 1 - SEAM_WIDTH;

/**
 * How far the play surface stands proud of the groove floor, in cells.
 *
 * A vertical face projects at sin(polar): at the ratified canonical gameplay
 * view of 28 degrees the groove wall reads ~0.10 of a cell tall, and at the
 * 45-degree pitch limit ~0.16. That is what makes the near wall of a seam
 * OCCLUDE its own floor - the cue that separates a carved board from a printed
 * one, and the cue the shader board could not produce at any strength.
 *
 * THE FULL HISTORY, because the two ends of it are the argument. 0.18 was the
 * first render and it was TOO POLITE against a note that said no grooves were
 * visible at all: the relief was there but it read as an embossed grid rather
 * than as a floor of blocks. 0.22 answered that note, and answered it too far -
 * the owner's round-3 word for it is RAISED BUTTONS, and he is right: at 0.22
 * the wall under each shoulder is 0.13 of a cell tall, which at the ratified
 * 28-degree pitch projects to ~2.6px of pure vertical side under every tile,
 * and a tile with that much visible side is an object sitting ON the board
 * rather than a panel cut INTO it.
 *
 * 0.16 is the carved-panel reading. The chamfer still descends its full 0.09,
 * so the shoulder - the lit band that carries the whole theme - is untouched;
 * what comes off is the vertical wall beneath it, from 0.13 to 0.07. The relief
 * that remains is the chamfer plus a wall about half its old height, which is
 * what a panel routed into a surface looks like from above. Occlusion survives
 * because the seam narrowed in the same pass (see `SEAM_WIDTH`): a 0.07 wall at
 * 28 degrees still hides more than half of an 0.11-wide floor.
 *
 * Bounded above by FLOOR_CLEARANCE (0.04) plus the snake's own clearance: a
 * seam deeper than the objects standing on it are tall turns the board into a
 * grating and the snake into something hovering over a grid of trenches. That
 * bound is now further away than it has ever been.
 */
export const SEAM_DEPTH = 0.16;

/**
 * The chamfer on the tile's top edge - the shoulder.
 *
 * This is the guide's "rounded/beveled edges" and "bright graphic highlights on
 * top-facing edges" in one feature, and it is deliberately CHUNKY: 0.09 of a
 * cell is 10.5% of the tile's span, wide enough that the shoulder facing the
 * key light is a readable BAND of highlight rather than a line, which is what
 * the concept sheet's tile close-up shows.
 *
 * ROUND 3 LEFT IT ALONE ON PURPOSE. The note was that the tiles stand too
 * proud, and a chamfer is not what makes a tile proud - a WALL is. Taking the
 * height out of the wall (`SEAM_DEPTH`) flattens the block while leaving the
 * lit shoulder at full width; taking it out of the chamfer as well would have
 * flattened the one feature carrying the theme's colour onto a surface, which
 * is the load-bearing finding of the whole board pass.
 *
 * Bounded above by the flat top, which may not fall below 0.68 - see the seam.
 * The tighter seam gave this bound 0.03 of a cell of new headroom, which is
 * spent on nothing: a wider shoulder here would eat the play surface back to
 * where it was.
 *
 * ONE chamfer segment, for the same reason the snake's cubes take one: a single
 * wide 45-degree facet takes its OWN tone, so the shoulder draws a hard edge
 * against both the top plane and the wall. Smoothing it would blur exactly the
 * boundary the guide asks to keep hard.
 */
export const TILE_CHAMFER = 0.09;

/**
 * How far the tile's underside sinks into the slab beneath it.
 *
 * Non-zero so the tile's bottom quad is never coplanar with the slab's top
 * face. Coplanar surfaces at identical depth are the z-fight this board's
 * history is largely made of; a hair of interpenetration removes the tie
 * outright rather than asking the depth buffer to break it.
 */
export const TILE_SEAT = 0.03;

/** Cells between emphasis seams. Mirrors ArenaFloor's MAJOR_EVERY. */
export const MAJOR_EVERY = 5;

/**
 * Ink weights. ONE on the board the owner reviews; the second is the toggle's.
 *
 * The slab's line is the character's "thick outline around the silhouette",
 * applied to the board: it is what separates the whole object from the void,
 * and at 0.11 cells (~4.7px at desk scale) it is emphatically not the "1px
 * technical edge" the guide forbids. It is a CHARACTER OUTLINE, not a
 * gridline, and the ruling leaves it standing.
 *
 * The tile's line is retired by the line-free ruling. It was the guide's
 * "thinner dark internal line" and the argument for it was sound while the
 * board was flat - but 40 of them across a field of real blocks is a drawn
 * grid, and a drawn grid is what the owner asked to be rid of. The constant
 * survives because `?gridlines=1` restores exactly the board that was
 * reviewed, and a compare toggle that redraws the line at a NEW weight is
 * comparing against something the owner never saw.
 */
export const SLAB_INK_WIDTH = 0.11;
export const TILE_INK_WIDTH = 0.03;

/**
 * The key light, in WORLD space, as a surface-to-light vector.
 *
 * The one shadow-casting directional sits at [24, 18, 2] aimed at board centre
 * [10, 0, 10] (ArenaPrototypeCanvas, and the live board's rig matches), so the
 * vector is (14, 18, -8). Every tone decision below is taken against THIS, and
 * that is the point: authoring the bands from the rig's own geometry means the
 * board is lit by the same lamp as the snake standing on it, while the bands
 * themselves are decided here rather than left to whatever the shading model
 * happens to produce.
 */
export const KEY_LIGHT_WORLD: readonly [number, number, number] = (() => {
  const v = new THREE.Vector3(14, 18, -8).normalize();
  return [v.x, v.y, v.z] as const;
})();

/**
 * Where the three tones meet, as dot(faceNormal, key).
 *
 * The four shoulders of a tile take, under this rig: +X 0.94, -Z 0.76,
 * +Z 0.29, -X 0.12. So 0.70 and 0.25 put a V OF LIGHT on the two adjacent
 * shoulders that face the lamp, a saturated midtone on the third and the
 * shadow tone on the fourth - which is the read the concept sheet's
 * "GROOVE & EDGE" panel shows, and it falls out of the rig rather than being
 * painted on.
 */
const TONE_HIGHLIGHT_ABOVE = 0.7;
const TONE_MID_ABOVE = 0.25;

/**
 * The neon rising out of a groove - at the PERIMETER, and under the toggle.
 *
 * Light, not shading: it lands on the OUTER edge of a shoulder and the BOTTOM
 * of a wall - the two places a filament lying in the bottom of a cut would
 * actually reach - and it is the only interpolated colour in this file. The
 * shoulder carries less than the wall because it is further from the source.
 *
 * On the line-free board this reaches exactly the 76 outward faces of the
 * perimeter ring, because every interior weight is zero. The numbers below are
 * unchanged by the ruling: the board's edge light is the same light it was.
 *
 * BOTH CAME DOWN AFTER THE FIRST RENDER. The seam is supposed to read DARK
 * with a bright core; at 0.42/0.66 the spill filled the whole channel and the
 * groove read as a lit slot with no core at all. A glow is only a glow against
 * something dark, so the number that makes the neon visible is not this one -
 * it is the one that keeps the rest of the seam black.
 */
const SEAM_GLOW = { shoulder: 0.26, wall: 0.3 } as const;

/**
 * How much light one side of one tile carries, by the class of seam it faces.
 *
 * THE LINE-FREE RULING, EXPRESSED AS A NUMBER. An interior side - every side
 * of every tile except the outward faces of the perimeter ring - returns
 * exactly ZERO, so no gradient runs along any seam between two tiles. Not
 * "quiet": zero. A whisper of light down 40 lines is still 40 lines, and the
 * ruling is that the lines are the disturbance, not their brightness.
 *
 * The perimeter is the exception and it is a different object: the board's own
 * edge, which is where the board stops rather than where one cell meets the
 * next. It keeps the full weight it always had.
 *
 * `seamLines` restores the interior classes for the compare toggle. Their
 * weights are then exactly what they were: a theme already declares how much
 * light a per-cell seam, an emphasis seam and the perimeter each carry
 * (`neonMinor` / `neonMajor` / `neonEdge`), authored as additive strengths in
 * a fragment shader where a whisper is 0.02; as a colour MIX the same 0.02 is
 * invisible, so the weights are the theme's own RATIOS against its brightest
 * class opened up by a square root - which preserves the theme's ordering and
 * its authorial intent while lifting the quietest class off zero.
 */
export function seamGlowWeight(
  theme: BoardTheme,
  seamClass: SeamClass,
  seamLines = false
): number {
  if (seamClass !== 'edge' && !seamLines) return 0;
  const peak = Math.max(theme.neonEdge, 1e-6);
  const raw =
    seamClass === 'edge'
      ? theme.neonEdge
      : seamClass === 'major'
        ? theme.neonMajor
        : theme.neonMinor;
  return Math.sqrt(THREE.MathUtils.clamp(raw / peak, 0, 1));
}

export type SeamClass = 'minor' | 'major' | 'edge';

/**
 * Which kind of seam lies on one side of one tile.
 *
 * `boundary` is the grid line the side sits on (0..gridSize). The perimeter
 * outranks the emphasis grid: on a 20-cell board 0 and 20 are both multiples of
 * 5, and the outermost line is the boundary a player is judging their distance
 * to, not a scale marker.
 */
export function seamClassAt(boundary: number, gridSize: number): SeamClass {
  if (boundary <= 0 || boundary >= gridSize) return 'edge';
  return boundary % MAJOR_EVERY === 0 ? 'major' : 'minor';
}

/**
 * The guide's three tones, keyed to a face's orientation.
 *
 * Returns the theme colour a face with this normal is MADE of. The lighting
 * model then bands it (see `createBoardCelRamp`); it does not decide it.
 */
export function toneForFace(
  theme: BoardTheme,
  normal: readonly [number, number, number]
): string {
  const facing =
    normal[0] * KEY_LIGHT_WORLD[0] +
    normal[1] * KEY_LIGHT_WORLD[1] +
    normal[2] * KEY_LIGHT_WORLD[2];
  // The top plane is the stage. It is one flat tone whatever the lamp does to
  // it, because 74% of the board's area is exactly where the character has to
  // be read and nothing may compete there.
  if (normal[1] > 0.99) return theme.face;
  /**
   * Anything VERTICAL is a shadow face, whichever compass point it happens to
   * face. This is not the lamp's opinion and it is not meant to be: a wall
   * here is the inside of a channel 0.14 wide and 0.18 deep, so it is in the
   * groove's own shadow even on the side the key nominally reaches. Letting
   * the dot product decide would put a saturated midtone on the south wall of
   * every cell and turn 400 grooves into 400 lit slots - which is the exact
   * failure the owner's note is about, arriving from the opposite direction.
   */
  if (normal[1] <= 0.05) return theme.tileWall;
  if (facing >= TONE_HIGHLIGHT_ABOVE) return theme.tileEdgeKey;
  if (facing >= TONE_MID_ABOVE) return theme.tileEdgeMid;
  return theme.tileWall;
}

// -----------------------------------------------------------------------------
// THE TILE'S OWN SHADE - round 3, owner: "a little bit different, but still all
// within the 90s cartoon frame"
// -----------------------------------------------------------------------------

/**
 * How many authored shades of stone the board is cut from.
 *
 * FIVE, and the count is the whole idea. A continuous per-tile offset is NOISE
 * on a 400-cell field, however small - it is a texture, and the guide's never
 * list has "no halftones, no decorative-era graphics, no visual noise" for
 * exactly the surfaces this one is. Five discrete steps is a PALETTE: the board
 * reads as having been painted from a small set of tile shades, which is what a
 * hand-painted 90s background actually is and is why the variation survives
 * being looked at closely.
 *
 * Odd on purpose, so the middle step is exactly the authored tone and a fifth
 * of the board is that tone unmodified.
 */
export const TILE_SHADE_STEPS = 5;

/**
 * How far one step moves a tile's tone, as a fraction, in sRGB.
 *
 * 0.02 - so the board spans +/-4% across its two extreme steps, and the two
 * shades a player is most likely to see side by side differ by 2%. On the CYAN
 * face (#1c333e) one step is about one sRGB level per channel: at the threshold
 * of noticing on a flat area and under it in motion, which is the definition of
 * the whisper the owner asked for.
 *
 * IN sRGB, NOT LINEAR, for the same reason `mixSRGB` exists: an authored
 * percentage has to be a perceived percentage or the number in this file is not
 * the number on the screen. The same 4% applied linearly would be under half a
 * level on these tones - real in the buffer, invisible on the board.
 *
 * READABILITY IS NOT NEGOTIABLE AND THIS IS WHY IT SURVIVES: the whole spread
 * is an order of magnitude below the step from the play surface to its own
 * shoulder, so no tile can ever be mistaken for a lit one, for a shadowed one,
 * or for terrain. It changes what the board is MADE of, not what it says.
 */
export const TILE_SHADE_STEP = 0.02;

/**
 * Which of the five shades a tile is cut from - a pure function of WHERE it is.
 *
 * DETERMINISTIC BY CONSTRUCTION, which is the requirement that rules out the
 * obvious implementation: no PRNG, no render-time randomness, no seed. The same
 * cell carries the same shade in every run, on every machine, for the life of
 * the board - so a player who learns the board learns a fixed thing, and two
 * screenshots of the same cell can be compared.
 *
 * An integer avalanche hash rather than a trigonometric one-liner: `sin(x*Nk)`
 * fract-hashes are the usual reach here and they band visibly on a small
 * integer lattice, which on a 20x20 grid would draw exactly the diagonal
 * corduroy the ruling just spent a pass removing. `Math.imul` keeps every step
 * in 32-bit integer arithmetic, so the result is identical on every engine
 * rather than depending on double rounding.
 */
export function tileShadeLevel(column: number, row: number): number {
  let h = Math.imul(column, 374761393) + Math.imul(row, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return (h % TILE_SHADE_STEPS) - (TILE_SHADE_STEPS - 1) / 2;
}

/** The multiplier that shade puts on every tone the tile is painted with. */
export function tileShade(column: number, row: number): number {
  return 1 + tileShadeLevel(column, row) * TILE_SHADE_STEP;
}

/** sRGB-space mix. Perceptual, so a 40% glow reads as 40%. */
function mixSRGB(base: THREE.Color, toward: THREE.Color, amount: number): THREE.Color {
  const a = base.clone().convertLinearToSRGB();
  const b = toward.clone().convertLinearToSRGB();
  return a.lerp(b, THREE.MathUtils.clamp(amount, 0, 1)).convertSRGBToLinear();
}

/** sRGB-space scale, for the same reason. Never leaves the 0..1 cube. */
function scaleSRGB(base: THREE.Color, factor: number): THREE.Color {
  const scaled = base.clone().convertLinearToSRGB();
  scaled.setRGB(
    THREE.MathUtils.clamp(scaled.r * factor, 0, 1),
    THREE.MathUtils.clamp(scaled.g * factor, 0, 1),
    THREE.MathUtils.clamp(scaled.b * factor, 0, 1)
  );
  return scaled.convertSRGBToLinear();
}

export interface BoardTileField {
  /** Lit geometry: position, normal, colour. One draw. */
  field: THREE.BufferGeometry;
  /**
   * The same tile positions carrying RADIAL normals, for the ink hull - or
   * NULL on the line-free board, which draws no line around a tile.
   *
   * Null rather than built-and-unmounted: an unused hull is 24,000 vertices of
   * normals computed, allocated and held for the life of the theme, and "we
   * don't need the gridlines" is a reason not to build one, not a reason to
   * build one and hide it.
   *
   * When the compare toggle asks for it: the lit geometry's normals are flat
   * per quad, which is what gives the shoulders their hard tone boundary - and
   * it is exactly the wrong thing to expand a hull along, because two quads
   * meeting at an edge would push apart and the outline would split open at
   * every corner of every tile. The hull copy normalises each vertex by the
   * tile's own half-extents instead, so a corner vertex moves diagonally and
   * the line stays closed.
   */
  hull: THREE.BufferGeometry | null;
  /** Triangles in the field, for the perf report. */
  triangles: number;
}

/** What the compare toggle changes about a field. Nothing else may. */
export interface BoardTileFieldOptions {
  /**
   * Restore the drawn seam - the tile's ink hull and the neon gradient rising
   * out of every interior cut. Default false: the board the ruling describes.
   */
  seamLines?: boolean;
}

type Corner = readonly [number, number, number];

/**
 * Build the whole tile field for one theme.
 *
 * Winding is counter-clockwise seen from outside and the normal is DERIVED from
 * it rather than asserted alongside it, exactly as `createArenaSlabGeometry`
 * does - a mistyped corner then shows up as a black face immediately instead of
 * as a subtly wrong band.
 */
export function createBoardTileField(
  gridSize: number,
  theme: BoardTheme,
  { seamLines = false }: BoardTileFieldOptions = {}
): BoardTileField {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const hullNormals: number[] = [];

  const neon = new THREE.Color(theme.neon);
  /**
   * One colour per (tone, shade) pair, built once.
   *
   * Five shades over the handful of tones a theme owns is at most a few dozen
   * colours for the whole 400-tile field - so the per-tile variation costs a
   * map lookup per quad and not one allocation per tile, which on a geometry
   * this size is the difference between a build step and a hitch.
   */
  const toneCache = new Map<string, THREE.Color>();
  const toneOf = (hex: string, level = 0): THREE.Color => {
    const key = level === 0 ? hex : `${hex}@${level}`;
    let color = toneCache.get(key);
    if (!color) {
      const base = new THREE.Color(hex);
      color =
        level === 0 ? base : scaleSRGB(base, 1 + level * TILE_SHADE_STEP);
      toneCache.set(key, color);
    }
    return color;
  };

  const half = TILE_SPAN / 2;
  const inner = half - TILE_CHAMFER;
  const shoulderY = -TILE_CHAMFER;
  const bottomY = -(SEAM_DEPTH + TILE_SEAT);
  const halfHeight = -bottomY / 2;
  const centreY = bottomY / 2;

  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  const hullNormal = new THREE.Vector3();

  /**
   * One quad. `tint` receives each corner's own colour, which is what lets a
   * shoulder fade from its authored tone at the top to neon at the seam.
   */
  const quad = (
    a: Corner,
    b: Corner,
    c: Corner,
    d: Corner,
    tint: (corner: Corner) => THREE.Color,
    tileCentre: readonly [number, number]
  ): void => {
    edgeA.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    edgeB.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    faceNormal.crossVectors(edgeA, edgeB).normalize();
    for (const corner of [a, b, c, a, c, d]) {
      positions.push(corner[0], corner[1], corner[2]);
      normals.push(faceNormal.x, faceNormal.y, faceNormal.z);
      const color = tint(corner);
      colors.push(color.r, color.g, color.b);
      if (!seamLines) continue;
      hullNormal
        .set(
          (corner[0] - tileCentre[0]) / half,
          (corner[1] - centreY) / halfHeight,
          (corner[2] - tileCentre[1]) / half
        )
        .normalize();
      hullNormals.push(hullNormal.x, hullNormal.y, hullNormal.z);
    }
  };

  /** A quad whose four corners all take one tone, at one tile's shade. */
  const flat = (hex: string, level: number) => {
    const color = toneOf(hex, level);
    return () => color;
  };

  const origin = -gridSize / 2;

  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < gridSize; column += 1) {
      const cx = origin + column + 0.5;
      const cz = origin + row + 0.5;
      const centre = [cx, cz] as const;

      /**
       * WHICH SHADE THIS TILE IS CUT FROM.
       *
       * Keyed off the tile's GRID coordinates rather than its world centre, so
       * the pattern is a property of the board's cells - the same thing the
       * rules are written in - and does not shift if the board is ever re-sized
       * or re-centred. It multiplies every tone the tile is painted with, top
       * plane, shoulders and walls alike: what varies is the STONE, and a tile
       * whose top is a shade darker while its shoulders are not would read as a
       * lighting event, which is a thing this board says about the perimeter
       * and must not say at random.
       */
      const shade = tileShadeLevel(column, row);

      // Emphasis is per SIDE, which is the whole reason this field is baked.
      // On the line-free board every one of these is 0 except on the outward
      // side of a perimeter tile - see `seamGlowWeight`.
      const glow = {
        west: seamGlowWeight(theme, seamClassAt(column, gridSize), seamLines),
        east: seamGlowWeight(theme, seamClassAt(column + 1, gridSize), seamLines),
        south: seamGlowWeight(theme, seamClassAt(row, gridSize), seamLines),
        north: seamGlowWeight(theme, seamClassAt(row + 1, gridSize), seamLines),
      };

      // ---- The top plane. One tone, per the guide's "calm stage" clause. ----
      quad(
        [cx - inner, 0, cz + inner],
        [cx + inner, 0, cz + inner],
        [cx + inner, 0, cz - inner],
        [cx - inner, 0, cz - inner],
        flat(theme.face, shade),
        centre
      );

      /**
       * ---- The four shoulders. ----
       *
       * ONE FLAT ORIENTATION TONE, on the line-free board. The shoulder is the
       * guide's "bright graphic highlight on a top-facing edge" and that is
       * the whole of its job now: a hard step from the top plane's midtone to
       * the key tone and then to the wall's shadow, three flat values, no
       * gradient. It is what the owner means by "the tiles already provide for
       * proper orientation" - the eye reads a chamfer catching light, not a
       * line drawn where two cells meet.
       *
       * With `seamLines` the shoulder regains its gradient: its orientation
       * tone at the INNER edge, carried toward the neon at the OUTER edge -
       * a lit rim around every cell, brightest on the emphasis grid and the
       * perimeter. Zero weight collapses that to the flat quad above rather
       * than to a lerp of length zero, so the default board pays nothing.
       */
      const shoulder = (
        a: Corner,
        b: Corner,
        c: Corner,
        d: Corner,
        normal: readonly [number, number, number],
        weight: number
      ): void => {
        const base = toneOf(toneForFace(theme, normal), shade);
        if (weight <= 0) {
          quad(a, b, c, d, () => base, centre);
          return;
        }
        const lit = mixSRGB(base, neon, SEAM_GLOW.shoulder * weight);
        quad(
          a,
          b,
          c,
          d,
          (corner) => (corner[1] < -1e-6 ? lit : base),
          centre
        );
      };

      // South shoulder faces -Z; north +Z; east +X; west -X. Each ring follows
      // `createArenaSlabGeometry`'s chamfer winding exactly, one scale down -
      // and the suite's "faces every quad outward" case is what keeps them
      // there: it dots every derived normal against the tile's own outward
      // radial, so a transposed corner fails the build rather than the review.
      const s = Math.SQRT1_2;
      shoulder(
        [cx + half, shoulderY, cz - half],
        [cx - half, shoulderY, cz - half],
        [cx - inner, 0, cz - inner],
        [cx + inner, 0, cz - inner],
        [0, s, -s],
        glow.south
      );
      shoulder(
        [cx - half, shoulderY, cz + half],
        [cx + half, shoulderY, cz + half],
        [cx + inner, 0, cz + inner],
        [cx - inner, 0, cz + inner],
        [0, s, s],
        glow.north
      );
      shoulder(
        [cx + half, shoulderY, cz + half],
        [cx + half, shoulderY, cz - half],
        [cx + inner, 0, cz - inner],
        [cx + inner, 0, cz + inner],
        [s, s, 0],
        glow.east
      );
      shoulder(
        [cx - half, shoulderY, cz - half],
        [cx - half, shoulderY, cz + half],
        [cx - inner, 0, cz + inner],
        [cx - inner, 0, cz - inner],
        [-s, s, 0],
        glow.west
      );

      /**
       * ---- The four walls. ----
       *
       * The guide's "substantially darker shadow faces", and the surface that
       * does the occluding. On the line-free board this is the ENTIRE seam:
       * one flat shadow tone on a wall the near tile hides half of, which is
       * what a cut in a solid looks like when nobody has drawn in it. With
       * `seamLines` the neon returns at the BOTTOM, where a filament would
       * lie, and dies before it reaches the shoulder above.
       *
       * `theme.tileWall` directly rather than through `toneForFace`, and the
       * two agree by construction: that function returns this tone for every
       * vertical normal, and the test suite sweeps all four to keep it true.
       */
      const wall = (
        a: Corner,
        b: Corner,
        c: Corner,
        d: Corner,
        weight: number
      ): void => {
        const base = toneOf(theme.tileWall, shade);
        if (weight <= 0) {
          quad(a, b, c, d, () => base, centre);
          return;
        }
        const lit = mixSRGB(base, neon, SEAM_GLOW.wall * weight);
        quad(
          a,
          b,
          c,
          d,
          (corner) => (corner[1] < shoulderY - 1e-6 ? lit : base),
          centre
        );
      };

      wall(
        [cx + half, bottomY, cz - half],
        [cx - half, bottomY, cz - half],
        [cx - half, shoulderY, cz - half],
        [cx + half, shoulderY, cz - half],
        glow.south
      );
      wall(
        [cx - half, bottomY, cz + half],
        [cx + half, bottomY, cz + half],
        [cx + half, shoulderY, cz + half],
        [cx - half, shoulderY, cz + half],
        glow.north
      );
      wall(
        [cx + half, bottomY, cz + half],
        [cx + half, bottomY, cz - half],
        [cx + half, shoulderY, cz - half],
        [cx + half, shoulderY, cz + half],
        glow.east
      );
      wall(
        [cx - half, bottomY, cz - half],
        [cx - half, bottomY, cz + half],
        [cx - half, shoulderY, cz + half],
        [cx - half, shoulderY, cz - half],
        glow.west
      );

      /**
       * ---- The underside. ----
       *
       * Never seen: it is backface-culled from every angle this camera allows
       * and it is buried TILE_SEAT deep in the slab. It exists so the ink hull
       * is a CLOSED shell - an open one shows its own interior through the
       * opening at grazing pitch.
       */
      quad(
        [cx - half, bottomY, cz - half],
        [cx + half, bottomY, cz - half],
        [cx + half, bottomY, cz + half],
        [cx - half, bottomY, cz + half],
        flat(theme.tileWall, shade),
        centre
      );
    }
  }

  const field = new THREE.BufferGeometry();
  field.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  field.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  field.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  field.computeBoundingSphere();

  let hull: THREE.BufferGeometry | null = null;
  if (seamLines) {
    hull = new THREE.BufferGeometry();
    hull.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    hull.setAttribute('normal', new THREE.Float32BufferAttribute(hullNormals, 3));
    hull.computeBoundingSphere();
  }

  return { field, hull, triangles: positions.length / 9 };
}

// -----------------------------------------------------------------------------
// THE CEL RAMP
// -----------------------------------------------------------------------------

/**
 * The board's three light bands, as linear multipliers.
 *
 * Stock `getToonGradientMap` is 72/150/214 over 255 - three BRIGHTNESSES. These
 * are the same three steps OPENED UP at both ends - the guide asks for "high
 * contrast" and a ramp whose extremes are 0.28 and 0.84 cannot deliver it on a
 * board this dark - and they are TINTED below, which is the difference the
 * guide asks for: a shadow is a dark,
 * more saturated member of the surface's own hue family, never a desaturated
 * grey. (The character sheet states this as "shadows: deep burnt orange"; on a
 * cyan board the same principle produces a deep saturated teal, which is why
 * the rule is stated as hue-family rather than as a hex.)
 */
const BOARD_CEL_BANDS = [0.18, 0.55, 1.0] as const;

/** How far each band leans into the theme's own hue. Shadows lean hardest. */
const BOARD_CEL_TINT = [0.55, 0.24, 0.07] as const;

/**
 * How much of the smooth, unbanded light the board keeps.
 *
 * A hemisphere light and an ambient both land in `indirectDiffuse`, which the
 * toon ramp never touches - so a three-band material lit by this rig is three
 * hard bands plus a smooth wash, and past a certain strength the wash IS the
 * look. Scaling it down is the same four-line patch the snake's cel material
 * uses and for the same reason: "relatively hard transitions" is a property of
 * the total, not of the direct term alone.
 */
const BOARD_INDIRECT_SCALE = 0.62;

/**
 * A three-texel RGB ramp for one theme.
 *
 * RGB rather than the stock single channel, which is what makes the bands
 * TONES instead of brightnesses - and it is the same four-character shader
 * change the snake's 90s material makes, deliberately, so the two objects band
 * through one mechanism.
 */
export function createBoardCelRamp(theme: BoardTheme): THREE.DataTexture {
  // The hue family the shadows lean into: the theme's own seam floor, opened
  // to full value so only its CHROMA survives the mix.
  const hue = new THREE.Color(theme.grooveShadow);
  const peak = Math.max(hue.r, hue.g, hue.b, 1e-4);
  hue.multiplyScalar(1 / peak);

  const data = new Uint8Array(BOARD_CEL_BANDS.length * 4);
  BOARD_CEL_BANDS.forEach((level, index) => {
    const tint = BOARD_CEL_TINT[index];
    const r = level * (1 - tint + tint * hue.r);
    const g = level * (1 - tint + tint * hue.g);
    const b = level * (1 - tint + tint * hue.b);
    data[index * 4 + 0] = Math.round(THREE.MathUtils.clamp(r, 0, 1) * 255);
    data[index * 4 + 1] = Math.round(THREE.MathUtils.clamp(g, 0, 1) * 255);
    data[index * 4 + 2] = Math.round(THREE.MathUtils.clamp(b, 0, 1) * 255);
    data[index * 4 + 3] = 255;
  });

  const texture = new THREE.DataTexture(
    data,
    BOARD_CEL_BANDS.length,
    1,
    THREE.RGBAFormat
  );
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** The one line of stock three.js between a brightness ramp and a tone ramp. */
const GRADIENT_LOOKUP = 'vec3( texture2D( gradientMap, coord ).r )';
const GRADIENT_LOOKUP_RGB = 'texture2D( gradientMap, coord ).rgb';

/**
 * Turn a stock `MeshToonMaterial` into the board's cel material, in place.
 *
 * Composes with any `onBeforeCompile` the material already carries, and takes
 * an explicit program cache key: three's default key is the patch function's
 * SOURCE, and every material patched here shares one source while wanting a
 * distinct program per theme is not required - but the board and the snake
 * both patch the same chunk, and an explicit key documents that they are
 * different programs on purpose.
 */
export function applyBoardCelShading(
  material: THREE.MeshToonMaterial,
  theme: BoardTheme,
  ramp: THREE.DataTexture
): void {
  material.gradientMap = ramp;
  const previous = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      GRADIENT_LOOKUP,
      GRADIENT_LOOKUP_RGB
    );
    shader.uniforms.uBoardIndirect = { value: BOARD_INDIRECT_SCALE };
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uBoardIndirect;\nvoid main() {')
      .replace(
        '#include <lights_fragment_end>',
        '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse *= uBoardIndirect;'
      );
  };
  material.customProgramCacheKey = () => `boardTiles:${theme.id}`;
  material.needsUpdate = true;
}
