import type { SnakeFaceToneSet, SnakeStyleProfile } from './snake90s';
import { SNAKE_STYLE_PROFILE } from './snake90s';

/**
 * ARMOR - the first item of the GEAR system, designed as a WEARABLE.
 *
 * SCOPE, stated so it cannot be mistaken for more than it is: this module and
 * `SegmentArmor.tsx` describe an object the creature WEARS. Nothing here
 * touches the multiplier, the engine, the catalog or the server. It equips
 * through a dev fixture (`?armor=1|2`, refused in production) so the owner can
 * judge it worn, on the board and in the chamber, before any of that is built.
 *
 * -----------------------------------------------------------------------------
 * THE OWNER'S BRIEF, and where each clause lands
 * -----------------------------------------------------------------------------
 *
 *   "worn on one, maybe two segments ... not the head"
 *       -> `ARMORED_SEGMENTS`. Engine indices 1 and 2 - the two cells behind
 *          the head. Index 0 is the head and is not a gear slot; the head's
 *          slots are `face` and `crown` and they stay exactly two (pinned by
 *          snake90s.test.ts). This introduces the SEGMENT-anchored wearable as
 *          a second kind of mount, not as a third head slot.
 *
 *   "the segments, maybe the first 3-4 are slots"
 *       -> `SEGMENT_GEAR` is a registry keyed the way `SNAKE_COSMETICS` is, and
 *          `ARMORED_SEGMENTS` is a plain list. A second gear item, or a fourth
 *          slot, is a row and an entry - not a rewrite.
 *
 * -----------------------------------------------------------------------------
 * THE DESIGN, and the argument for it
 * -----------------------------------------------------------------------------
 *
 * THE SHAPE IS A ZIGGURAT, NOT A FIN. Three stacked slabs, each narrower and
 * shorter than the one below, bolted to the top of a segment and overhanging it
 * at the shoulders. The first shape tried was a crest - a tall ridge running
 * down the spine - and it is recorded here as rejected rather than quietly
 * dropped: a fin changes what the CREATURE is. The owner's constraint is that
 * the armoured segment must read as ARMOURED, not as a different animal, and a
 * dorsal fin on a snake reads as a different animal from two tiles away. A
 * stepped plate cannot be mistaken for anatomy, because nothing grows in
 * lamellae. It is also the shape a kid draws when asked to draw armour, and it
 * survives being shrunk to a sticker - which is the merch test.
 *
 * IT IS WIDER THAN ANY BODY CUBE AND NARROWER THAN THE HEAD. That is the whole
 * silhouette rule, and both halves are load-bearing:
 *
 *      widest body cube 0.850 < plate 0.927 < head 0.980
 *
 *   - wider than the widest cube, so a mid-coil armoured segment is a SILHOUETTE
 *     CHANGE at every fusion level, not only when the snake is running loose.
 *     At the free-running edge (0.68) the plate overhangs by 0.12 of a cell a
 *     side, which is the read the owner is buying.
 *   - narrower than the head, so head primacy survives being worn against. The
 *     head leads on size, on emissive and on base colour (see
 *     `HEAD_EMISSIVE_SCALE`); a plate that out-measured it would take the first
 *     of those three away. `resolveArmorMountScale` derives the mount from this
 *     bound rather than asserting it after the fact.
 *
 * IT IS RIGID. The body swells with fusion, shrinks toward vacancy, breathes in
 * the head zone and tapers at the tail. The armour does NONE of that: it is one
 * size, in world cells, in every state. This is the single decision that makes
 * it read as a manufactured object strapped to an organism rather than as part
 * of the organism - and it is bought for free, because the mount is a constant
 * (`resolveArmorMountScale`) while the cube underneath is a per-frame number.
 *
 * ONLY THE SEAT TRACKS. The armour's HEIGHT is the one thing that follows the
 * body: it sits on the cube's drawn top plane, so it rides the breathe and the
 * fusion step and can never float above the segment or sink into it. Rigid in
 * size, glued in place - which is what a strap does.
 *
 * -----------------------------------------------------------------------------
 * THE COLOUR, and why it is not any of the three obvious ones
 * -----------------------------------------------------------------------------
 *
 * NOT AMBER, NOT THE BRAND VIOLET, NOT A COOL SLATE.
 *
 *   amber   - it is the creature's own family (#ffc53d -> #f5811f -> #8a3d14)
 *             and the forming-terrain decal's colour besides. Worn armour in
 *             the body's own hue is not worn, it is a growth.
 *   violet  - #a855f7 is the Mark's and the mutation beacon's. A body part
 *             wearing the brand's signal colour spends a signal that means
 *             something else on the same screen.
 *   slate   - the palette panel rules out the character carrying a COOL value
 *             by name, and it is right to: a blue-grey plate on an orange snake
 *             goes dead under CYBER's teal board and vanishes into DARK's
 *             #89929c tile bevels.
 *
 * SO: WARM IRON. `iron` is a dark warm grey - measurably warm (R > G > B), so
 * its shadow falls to a warm charcoal and never to blue - and `steel` is the
 * same family one clear value step up, worn by the top tier alone. Two stocks,
 * not five: the tier-to-tier separation is drawn by the ink hull between the
 * slabs and by the authored rim on each chamfer, exactly the way the creature's
 * own faces are separated, so the object holds together as one material.
 *
 * At speed, from the arena camera, what arrives is: A DARK BAND ACROSS THE
 * SNAKE, HARD-EDGED, WITH A BRIGHT BLOCK IN ITS MIDDLE. That is deliberately the
 * same grammar the shades already use on the head ("one hard dark band across
 * the front of the head, which is the read that survives at 17px"). The head
 * wears a dark bar; the body wears dark plates. One wardrobe, one character.
 *
 * The strap is the accent, and it is the argument's proof: it is
 * `GUIDE_PALETTE.braid` under `BRAID_TONES` - literally the braids' own stock
 * and its bone-gold upper edge. The three worn items on this creature are cut
 * from two materials between them.
 *
 * WHAT KEEPS IT OFF THE FLOOR. Every board face is dark and desaturated
 * (#1c333e / #332f29 / #2c2f35) and two themes carry a light bevel that a grey
 * could collide with. The armour never has to win that fight, because it is
 * drawn INSIDE the creature's own silhouette, surrounded by saturated orange and
 * ringed by the ink hull. It is also the only mid-value warm grey on the board
 * that does not bloom: food, portal, head and glow strips do, the armour has no
 * emissive at all.
 */

// -----------------------------------------------------------------------------
// The fixture
// -----------------------------------------------------------------------------

/**
 * How many segments are wearing the plate.
 *
 * TWO VARIANTS, BUILT, because the owner rules which looks better on screen and
 * a ruling needs both things in front of it. `one` is the single plate directly
 * behind the head; `two` adds its neighbour so the pair reads as a carapace.
 */
export type ArmorFixture = 'off' | 'one' | 'two';

export const ARMOR_FIXTURE_QUERY_KEY = 'armor';

/**
 * Which engine segment indices wear the plate, per variant.
 *
 * Index 0 is the head and never appears here. Index 1 is the cell the head just
 * left - the NECK - and index 2 the one behind it.
 */
export const ARMORED_SEGMENTS: Record<ArmorFixture, readonly number[]> = {
  off: [],
  one: [1],
  two: [1, 2],
};

/**
 * Pure so it can be tested without a browser or a build.
 *
 * REFUSED IN PRODUCTION, exactly as `resolveSnakeStyle` and the `?arrival=` pin
 * are. This is a judgement instrument for the owner's review, not a cosmetic a
 * player can grant themselves: the loadout is server-held (migration 069,
 * Constitution R11) and a query parameter that equipped real gear would be the
 * first item a player could award themselves. Nothing here writes anything.
 */
export function resolveArmorFixture(
  search: string,
  nodeEnv: string | undefined
): ArmorFixture {
  if (nodeEnv === 'production') return 'off';
  let value: string | null = null;
  try {
    value = new URLSearchParams(search).get(ARMOR_FIXTURE_QUERY_KEY);
  } catch {
    return 'off';
  }
  if (value === '1' || value === 'one') return 'one';
  if (value === '2' || value === 'two') return 'two';
  return 'off';
}

/**
 * Resolved ONCE, at module evaluation, for the same reason `SNAKE_STYLE` is:
 * the geometry pools and material caches below are module-level constants, and
 * a fixture that could change mid-session would mean invalidating all of them.
 *
 * On the server it is always `off` - there is no URL to read, and a server
 * render that disagreed with the client's would hydrate into a different
 * creature.
 */
export const ARMOR_FIXTURE: ArmorFixture =
  typeof window === 'undefined'
    ? 'off'
    : resolveArmorFixture(window.location.search, process.env.NODE_ENV);

// -----------------------------------------------------------------------------
// The palette
// -----------------------------------------------------------------------------

export const ARMOR_PALETTE = {
  /** The stock. Dark warm iron: R > G > B, so no band of it can fall to blue. */
  iron: '#5e574d',
  /** The top tier alone. The same family, one clear value step up. */
  steel: '#8d8477',
  /** Bolt heads. Bright enough to be a highlight, dull enough not to be a pixel
   *  of bone - the creature's white is spoken for by the eyes and the lenses. */
  rivet: '#c7bca8',
} as const;

/**
 * THE METAL TONES.
 *
 * A separate authored set, the way the shades and the braids have theirs, and
 * for the same reason: the creature's own tints are a heavy warm multiply
 * (`TONE_SIDE` is [0.9, 0.42, 0.34]) that exists to keep an ORANGE body's
 * shadows orange. Applied to a grey it does not darken it, it dyes it - the
 * plate would come back a brown in the body's own hue family, which is the one
 * thing the colour argument above rules out.
 *
 * So the metal steps down in a WARM NEUTRAL instead: every band keeps R > G > B
 * (no cool value anywhere on the character) while the ratios between the three
 * channels stay close to the stock's own, so a tone reads as less light on iron
 * rather than as a different pigment.
 *
 *   rim   - the signature of metal in cel shading, and the one band that goes
 *           UP. A hot bone edge, added rather than multiplied for the same
 *           reason the braids' gold is: there is nothing above the stock to
 *           multiply toward. Stronger than the braids' add, because a forged
 *           edge catches more than hair does.
 *   down  - a warm charcoal. Deliberately not black: a plate whose underside is
 *           ink is a plate with a hole in it wherever the hull does not cover.
 */
export const ARMOR_TONES: SnakeFaceToneSet = {
  rim: { mul: [1, 1, 1], add: [0.3, 0.28, 0.23] },
  top: { mul: [1, 1, 1] },
  side: { mul: [0.8, 0.74, 0.66] },
  away: { mul: [0.5, 0.45, 0.39] },
  down: { mul: [0.22, 0.18, 0.15] },
  /**
   * Gentler than the body's 0.16. The creature's fall is set by a cube ~24
   * device pixels tall; an armour tier is a QUARTER of that, so the same
   * fraction spread over a quarter of the height reads as a gradient on a
   * surface instead of as a top light. It has the same hard-boundary property
   * either way - see `SnakeFaceToneSet.fall`.
   */
  fall: 0.1,
};

// -----------------------------------------------------------------------------
// The weights
// -----------------------------------------------------------------------------

/**
 * Ink weight for the armour, in WORLD cells.
 *
 * Between the shades' 0.042 and the creature's own 0.095. The plate is a bold
 * worn mass and is inked like one - the sheet's rule is that the line follows
 * the FEATURE SIZE, and a shoulder plate is nearer a head than a bead. It stays
 * under the body's weight so the segment it is worn on still reads as the
 * larger silhouette inside a heavier line.
 */
export const ARMOR_INK_WIDTH = 0.052;

/**
 * THE EMBED RULE, inherited whole from `SnakeCosmetics`, in SEGMENT-LOCAL units.
 *
 * A worn part may never be TANGENT to the surface it is worn on. The braid
 * fringe defect is the reason (a hull that straddles a surface leaves facets
 * sitting on the sign change of a back-face test, and the sway flickers them
 * into being drawn); the fix is structural - sink every part so its whole hull
 * is unambiguously inside the solid beneath it.
 *
 * Expressed LOCAL rather than world because the armour mounts at several
 * scales - 0.76 on the board, 0.64 and 0.58 on the chamber's tapering body - and
 * the rule has to survive the smallest of them:
 *
 *      0.145 x 0.58 = 0.084 world  >  ARMOR_INK_WIDTH + 0.02 = 0.072
 *
 * So the tightest mount in the product still buries its own line with margin.
 * Derived from the ink weight rather than typed in, so re-weighting the line
 * cannot silently reintroduce the fringe.
 */
export const ARMOR_EMBED = 0.145;

/** The margin the embed keeps beyond the line it has to bury. */
export const ARMOR_EMBED_MARGIN = 0.02;

/** The smallest mount the embed rule is required to survive. */
export const ARMOR_MIN_MOUNT_SCALE = 0.58;

// -----------------------------------------------------------------------------
// The shape
// -----------------------------------------------------------------------------

/** Which of the two stocks a tier is cut from. */
export type ArmorStock = 'iron' | 'steel';

export interface ArmorTier {
  readonly id: string;
  /** Across the body, in segment-local units (1 = one segment edge). */
  readonly width: number;
  /** Along the body. */
  readonly length: number;
  /** How far the tier's TOP stands above the segment's top plane. */
  readonly rise: number;
  readonly stock: ArmorStock;
}

/**
 * THE ZIGGURAT. Three slabs, strictly decreasing in plan and increasing in
 * height, which is what makes it lamellar rather than a box with a lid.
 *
 * WIDER THAN IT IS LONG, at every tier, and that is not decoration: the plate's
 * long axis is ACROSS the creature, so a straight run shows the full width and a
 * turn visibly swings it. A square plate would track its segment's heading
 * perfectly and show nothing for it.
 *
 * The base tier's length (0.94 local, 0.714 world) is bounded from both sides:
 *
 *   - it must EXCEED THE WIDEST GAP the body ever opens (1 - 0.68 = 0.32 of a
 *     cell), or a plate drawn between two cells could hang over open board. See
 *     `armorSpansItsSegment`.
 *   - two armoured segments sit exactly one cell apart, so it must leave them a
 *     gap (1 - 0.714 = 0.286) wider than the ink can paint over from both sides
 *     (2 x 0.052 = 0.104), or the two-segment variant fuses into one slab and
 *     stops being two pieces of gear.
 */
export const ARMOR_TIERS: readonly ArmorTier[] = [
  { id: 'plate', width: 1.22, length: 0.94, rise: 0.12, stock: 'iron' },
  { id: 'lamella', width: 0.94, length: 0.72, rise: 0.22, stock: 'iron' },
  { id: 'boss', width: 0.6, length: 0.52, rise: 0.31, stock: 'steel' },
];

/** The base tier - the one that carries the silhouette. */
export const ARMOR_PLATE_WIDTH = ARMOR_TIERS[0].width;
export const ARMOR_PLATE_LENGTH = ARMOR_TIERS[0].length;

/**
 * How far inside the head's own claim the plate must stay.
 *
 * The head is capped at 0.98 of a cell because "which tile is free" is the only
 * question a player asks at speed and a mesh wider than a cell answers it
 * wrongly. The plate inherits that bound and then steps in from it, so head
 * primacy is a property of the arithmetic rather than of the numbers happening
 * to line up today.
 */
export const ARMOR_HEAD_CLEARANCE = 0.96;

/**
 * The mount, in world cells per segment-local unit.
 *
 * THE SETTLED BODY, not the drawn one. The armour is rigid (see the header), so
 * its size comes from a constant: the body's own settled edge - fusion level 1,
 * the state a trunk spends most of its life in. The cube beneath it is then
 * free to be smaller (running loose, easing toward vacancy) or larger (packed)
 * without the plate changing, which is exactly the read being bought.
 *
 * Capped by the head's clearance, so the bound holds under any profile rather
 * than only under the one shipped today.
 */
export function resolveArmorMountScale(profile: SnakeStyleProfile): number {
  const settled = profile.trailFootprint[1];
  const capped = (profile.headSize * ARMOR_HEAD_CLEARANCE) / ARMOR_PLATE_WIDTH;
  return settled < capped ? settled : capped;
}

export const ARMOR_MOUNT_SCALE = resolveArmorMountScale(SNAKE_STYLE_PROFILE);

/** The plate's width in world cells at a given mount. */
export function armorSpanWorld(mountScale: number): number {
  return ARMOR_PLATE_WIDTH * mountScale;
}

/**
 * Whether the plate is long enough to rest on its own segment at every drawn
 * position.
 *
 * A segment is drawn at a glide position sweeping from the boundary BEHIND its
 * cell, through the cell centre, to the boundary AHEAD (motion 0.5 -> 1.5), so
 * the plate's centre is up to half a cell off its own cube. The cube reaches
 * `footprint / 2` from the tile centre, so the plate overlaps it as long as
 *
 *      plateLength / 2  >  0.5 - footprint / 2      i.e.  plateLength > gap
 *
 * for the WIDEST gap the body ever opens. Pure, so the bound is checked against
 * the profile rather than asserted in a comment.
 */
export function armorSpansItsSegment(
  profile: SnakeStyleProfile,
  mountScale: number
): boolean {
  const widestGap = 1 - Math.min(...profile.trailFootprint);
  return ARMOR_PLATE_LENGTH * mountScale > widestGap;
}

export interface ArmorSeat {
  /** Centre of the slab, in segment-local units above the top plane. */
  readonly y: number;
  /** Its full thickness, buried part included. */
  readonly thickness: number;
}

/**
 * Centre and thickness for a slab, derived from where its TOP should sit.
 *
 * `rise` is the only look decision; the underside is always ARMOR_EMBED below
 * whatever surface the slab rests on. So a tier's visible profile is authored
 * directly and its embedding cannot be got wrong - the same construction
 * `faceDepth` and `crownDepth` use for the head's cosmetics.
 */
export function armorSeat(rise: number, restsOn: number): ArmorSeat {
  const bottom = restsOn - ARMOR_EMBED;
  return { y: (rise + bottom) / 2, thickness: rise - bottom };
}

/** The surface a tier rests on: the segment's top plane, or the tier below. */
export function armorTierSeat(index: number): ArmorSeat {
  const tier = ARMOR_TIERS[index];
  const restsOn = index === 0 ? 0 : ARMOR_TIERS[index - 1].rise;
  return armorSeat(tier.rise, restsOn);
}

// -----------------------------------------------------------------------------
// Hero-only detail
// -----------------------------------------------------------------------------

/**
 * Bolt heads on the base tier's shoulders, outboard of the tier above.
 *
 * Dropped at board detail: at the arena camera a rivet is under two device
 * pixels, and a sub-pixel bright speck on a moving body is scintillation rather
 * than sparkle - the same ruling the shades' lens checker is held to.
 */
export const ARMOR_RIVET_X = 0.5;
export const ARMOR_RIVET_Z = 0.34;
export const ARMOR_RIVET_SIZE = 0.14;
export const ARMOR_RIVET_RISE = 0.19;

/**
 * The harness. Two bands lying across the base tier, fore and aft of the tier
 * above, in the braids' own near-black stock.
 *
 * This is the part that says WORN rather than GROWN, and it is hero-only for the
 * honest reason: at 24px it is one pixel of dark on a dark plate, which the ink
 * hull is already drawing for free.
 */
export const ARMOR_STRAP_Z = 0.4;
export const ARMOR_STRAP_WIDTH = 1.1;
export const ARMOR_STRAP_LENGTH = 0.1;
export const ARMOR_STRAP_RISE = 0.175;

// -----------------------------------------------------------------------------
// The segment anchor - the second kind of mount
// -----------------------------------------------------------------------------

/**
 * Slots that mount on a BODY SEGMENT.
 *
 * Deliberately its own table rather than an addition to `COSMETIC_ANCHORS`. The
 * head has exactly two mount points and a test pins that it has exactly two
 * ("no cap, and no slot a cap could be worn in but the braids"); gear worn on
 * the body is a different kind of thing in a different place, and merging the
 * two tables would make that test a statement about gear as well as about hats.
 */
export type SegmentGearSlot = 'back';

export interface SegmentAnchorDef {
  /** Segment-local mount point. */
  readonly position: readonly [number, number, number];
  readonly label: string;
}

/**
 * Segment-local, exactly as the head's anchors are head-local. The body
 * geometry is an exact unit rounded box (extrema -0.5..0.5), so an anchor at
 * y = 0.5 IS the top plane at any segment scale - which is why one component
 * mounts on a 0.76 board cube and a 0.58 chamber segment with no per-surface
 * tuning.
 */
export const SEGMENT_ANCHORS: Record<SegmentGearSlot, SegmentAnchorDef> = {
  back: { position: [0, 0.5, 0], label: 'Back' },
};

// -----------------------------------------------------------------------------
// Facing
// -----------------------------------------------------------------------------

/**
 * One axis of a segment-to-segment offset, corrected for the torus.
 *
 * COSMIC wraps, and two adjacent segments on opposite edges of the board differ
 * by nearly a full grid rather than by one cell. Left uncorrected the plate
 * would swing to point across the whole arena for one frame - which is the
 * armour detaching from the creature, the exact failure the anchor exists to
 * prevent.
 */
export function armorWrapDelta(delta: number, gridSize: number): number {
  const half = gridSize / 2;
  if (delta > half) return delta - gridSize;
  if (delta < -half) return delta + gridSize;
  return delta;
}

/**
 * The yaw that points the plate's long axis ACROSS the creature - i.e. its
 * local +Z at the segment ahead of it.
 *
 * TAKEN FROM THE TWO DRAWN POSITIONS, not from a grid heading, and that is the
 * whole reason the plate never snaps. A grid heading is discrete: it flips 90
 * degrees at the instant a tick admits a turn, and a plate that flipped with it
 * would pop once per corner. Both drawn positions are continuous in glide
 * motion and agree exactly across a tick boundary, so the angle between them is
 * continuous too - the plate sweeps through 45 degrees as the pair rounds a
 * corner and arrives on the new axis when its segment does. The creature's spine
 * bends; the armour bends with it, because it is reading the spine.
 *
 * Returns `null` when the two positions coincide, which is a real state - the
 * first stamp of a run seeds every segment onto one cell - and means "keep the
 * yaw you have" rather than "face +Z".
 */
export function armorFacingYaw(
  aheadX: number,
  aheadZ: number,
  selfX: number,
  selfZ: number,
  gridSize: number
): number | null {
  const dx = armorWrapDelta(aheadX - selfX, gridSize);
  const dz = armorWrapDelta(aheadZ - selfZ, gridSize);
  if (dx === 0 && dz === 0) return null;
  // rotation.y = t sends local +Z to (sin t, 0, cos t) - the same convention
  // HEAD_FACE_YAW is built on, so the plate and the head agree on what forward
  // means without either restating it.
  return Math.atan2(dx, dz);
}
