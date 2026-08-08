import * as THREE from 'three';
import {
  ninetiesCompositionEnabled,
  NINETIES_COMPOSITION_ENABLED,
} from '@/lib/features/ninetiesComposition';
import { createInkHullMaterial } from './inkAmber';

/**
 * SUPASNAKE 90s CARTOON - the character style guide, expressed as code.
 *
 * This module is the whole concept. It is ADDITIVE: nothing else in the
 * renderer changes shape, only which numbers it reads. With the concept off
 * (the default, and the only possibility in a production build) every value
 * below resolves to the shipped one, byte for byte.
 *
 * ROUND 2. The owner reviewed round 1 against the character sheet and named
 * the gap. Three of round 1's answers are SUPERSEDED here, and each supersedure
 * is written down where it happened rather than quietly re-tuned:
 *
 *   1. TRUE CUBES. Round 1 kept the shipped renderer's two independent size
 *      channels - footprint (fusion) and height (vacancy) - so a body segment
 *      was 0.82 x 0.70 x 0.82: a slab. The guide's first clause is "true cubes
 *      (width = height = depth)". `cube` below collapses the two channels onto
 *      ONE EDGE and keeps both readouts. See `SnakeCubeProfile`.
 *
 *   2. THE TONES ARE KEYED TO THE FACE, NOT TO THE LIGHT. Round 1's honest
 *      deviation was that an authored 3-tone ramp still had to survive the
 *      arena's light rig, and it did not: the rig's fill lifted the shadow band
 *      toward the midtone and the "hard transition" softened. The sheet is not
 *      lit at all - its tones are painted onto FACE ORIENTATIONS. So is this
 *      one now. The light-driven gradient ramp (`createCelRamp`, the
 *      `gradientMap` patch, `indirectScale`) is DELETED, and the snake's colour
 *      no longer depends on which board theme it is standing on - which is the
 *      guide's "local colours stay recognisable under every board theme, no
 *      environmental contamination" clause, delivered structurally.
 *
 *   3. THE COSMETICS ARE IN. Round 1 excluded them with the owner's agreement.
 *      The sheet details both, so `cosmetics` below carries the guide's shades
 *      and braids and `SnakeCosmetics.tsx` reads them.
 *
 * ROUND 3, 2026-08-07. The owner reviewed the live composition against a
 * REFERENCE BLOCK of his own - a single gold cube, drawn the way he wants the
 * creature's cubes to read - and the note was "sharper, and a bit more
 * sophisticated". Two more of this module's answers are superseded, and the
 * reference block is the authority for both:
 *
 *   4. THE CUFF IS GONE. Rounds 1-2 drew the sheet's cuff: a dark seam and a
 *      lit edge low on every segment, keyed off object-space Y. On a body cube
 *      at the gameplay camera that pair lands a few pixels above the lower
 *      chamfer and reads as a GROOVE CARVED INTO THE CUBE, which is what the
 *      owner boxed in red. The reference block carries no stripe at all, so the
 *      whole band mechanism - profile, uniforms, compares - is DELETED rather
 *      than re-seated: a mark that has to be tuned to stop looking like damage
 *      is a mark the drawing does not want. THE SHEET STILL DRAWS ONE; the
 *      owner's newest reference supersedes the sheet for the in-game read, and
 *      that is recorded here rather than left as a silent divergence.
 *
 *      The head loses it too, which is one step past the note. The head's cuff
 *      was seated below the mouth by the same mechanism and produced the same
 *      artefact class on the one cube the player looks at most; and a cuff worn
 *      by the head alone would read as a marking the body does not have, which
 *      is a NEW authored idea, not a surviving one. Head primacy never rested
 *      on it - see `HEAD_EMISSIVE_SCALE` for the four things it does rest on.
 *
 *   5. THE BEVEL IS A FACET, NOT A ROUNDING. Same reference: its chamfers are
 *      wide flat planes of light with a hard straight boundary against the face
 *      beside them. Round 2's `rim` cut put that boundary two fifths of the way
 *      OUT along the chamfer, so the flat face's tone spilled onto the inner
 *      half of every bevel and the edge read as a soft roll - marshmallow, next
 *      to his block. `SNAKE_FACE_CUTS.rim` now lands the boundary at the
 *      geometry's own edge, and `SNAKE_FACE_CUTS.rimFloor` is split out of the
 *      `down` cut so that widening the highlight cannot also light the
 *      underside. See both.
 *
 *   6. A GENTLE FALL WITHIN A FACE. The reference's large faces are not flat
 *      fills: they are top-lit, a little brighter at the top edge than at the
 *      bottom, while the step BETWEEN faces stays hard. `SnakeFaceToneSet.fall`
 *      buys that from the varying the deleted cuff was already paying for, so
 *      the change costs nothing and the swatch table above still lands exactly
 *      on the sheet's colours - at the TOP of a face, where a tone is read.
 *
 * THE GUIDE'S LAW, and where each clause lands:
 *
 *   "Body: true cubes (width = height = depth), thick, CLEARLY SEPARATED from
 *    neighbours ... never flattened into tiles or slabs"
 *       -> `cube` + `trailFootprint`, which under this style is the cube's
 *          EDGE by fusion level and is hard-capped so a gap always survives.
 *
 *   "Rounded/beveled edges, substantial visible side faces"
 *       -> `headBevelRadius` / `bodyBevelRadius` (gameRenderGeometry). ONE
 *          chamfer segment, deliberately: the rounded ring around each face
 *          carries the RIM band below, so the bevel draws its own hard
 *          highlight line - the sheet's bright yellow edge - for free.
 *
 *   "Slightly oversized head" -> `headSize`. Bounded below one grid cell.
 *
 *   "HIGHLIGHT -> MID TONE -> SHADOW with relatively hard transitions. Clear
 *    light direction; bright graphic highlights on top-facing edges"
 *       -> `tones` + `applySnakeFaceShading`. Five authored bands from three
 *          swatches, selected by the WORLD normal. See `SNAKE_FACE_CUTS`.
 *
 *   "Shadows: Dark Orange" (emphatically NOT grey or slate)
 *       -> `TONE_DOWN` is a WARM tint, not a scalar. See its note.
 *
 *   "Thick outline around silhouette / medium inner line on details"
 *       -> `inkHullWidth` + `inkColor` for the silhouette. The INTERNAL lines
 *          separating body cubes are not drawn: they are the GAPS between the
 *          cubes, which each cube's own hull paints black. One law produces
 *          both, which is why the separation is bounded from both sides.
 *
 *   "Body segments carry a cuff below a dark line" (the sheet draws every body
 *    cube and the head sitting in a shorter, darker block)
 *       -> REVOKED at round 3 by the owner's reference block. Nothing draws it.
 *          The object-space-Y varying it needed survives, carrying the gentle
 *          top-lit fall within a face instead - see `SnakeFaceToneSet.fall`.
 *
 *   "Shades - oversized pixel style" / "Braids - blocky, near-black, strong
 *    upper-edge highlights, cubic orange beads"
 *       -> `cosmetics`, consumed by `SnakeCosmetics.tsx`.
 *
 *   "NO CAP. Top silhouette = cubic head + braids."
 *       -> nothing to remove: the crown slot has only ever held braids. Pinned
 *          by a test so a cap cannot be added back without the guide's clause
 *          failing.
 *
 *   "Made to pop - readable at speed" / "Simple & clear - no visual noise"
 *       -> the head/body separation is carried by three things that cost
 *          nothing to draw: SIZE, the shipped emissive GAP held over the
 *          cut-down trunk (see `HEAD_EMISSIVE_SCALE` - this is the clause a
 *          single emissive scalar quietly breaks), and, under the guide
 *          palette, the sheet's own head-brighter-than-body value step. There
 *          were four until round 3 deleted the cuff; none of the three that
 *          remain were ever leaning on it.
 */

// -----------------------------------------------------------------------------
// The switch
// -----------------------------------------------------------------------------

/**
 * Three styles, of which the product ships two - one per leg of the flag.
 *
 *   classic       - the INK & AMBER creature, exactly as it shipped. Every
 *                   number in its profile is the shipped number and its shader
 *                   patch is a no-op, so this is not a fallback: it is the
 *                   rollback, byte for byte.
 *
 *   nineties      - the guide's TREATMENT on each dynasty's own hue. The game
 *                   system survives: CYBER is still cyan, PRIMAL still green,
 *                   COSMIC still violet. "Shadows are dark orange" generalises
 *                   to its actual principle - a shadow is a dark, MORE
 *                   saturated member of the body's own hue family, never a
 *                   desaturated grey - and the warm tints below produce
 *                   exactly that on all three (see the table in `TONE_DOWN`).
 *                   RENDERED, REVIEWED, NOT CHOSEN. It survives because it is
 *                   what the ruling was taken against, and a rejected
 *                   alternative kept beside a decision is how the decision
 *                   stays legible.
 *
 *   ninetiesGuide - the guide's treatment AND its literal orange/yellow, on
 *                   every dynasty. THE RATIFIED STYLE. Chosen by the character
 *                   law itself, section 4: the primary is Supa orange and
 *                   "local colors stay recognizable under every board theme".
 *                   A snake that changes hue with its dynasty is a snake whose
 *                   local colour is contaminated by its surroundings, which is
 *                   the one thing that panel rules out.
 */
export type SnakeStyleId = 'classic' | 'nineties' | 'ninetiesGuide';

export const SNAKE_STYLE_QUERY_KEY = 'snake90s';

/**
 * The style `NEXT_PUBLIC_NINETIES_COMPOSITION=true` ships. Named rather than
 * spelled inline so the ratified choice appears once.
 */
export const NINETIES_SHIPPED_STYLE: SnakeStyleId = 'ninetiesGuide';

/**
 * Pure so it can be tested without a browser or a build.
 *
 * THE FLAG DECIDES; THE URL ONLY EVER JUDGES. `compositionFlag` is the raw
 * `NEXT_PUBLIC_NINETIES_COMPOSITION` value, and what it resolves to is what a
 * player of this build gets. The query key exists so the two 90s variants, the
 * rollback and the shipped answer can be compared on ONE dev server without a
 * rebuild - and it is refused outright in a production bundle, so no player can
 * put themselves on a style the release did not ship. That gate is the same one
 * `/dev/cockpit` uses and it is asserted rather than described.
 *
 * `?snake90s=0` is as real an instruction as `=guide`: a compare toggle that
 * cannot be turned off compares nothing. Absent, empty, or unrecognised all
 * mean "whatever this build ships", never "off" - an unreadable URL must not
 * silently roll the composition back.
 */
export function resolveSnakeStyle(
  search: string,
  nodeEnv: string | undefined,
  compositionFlag: string | undefined
): SnakeStyleId {
  const shipped: SnakeStyleId = ninetiesCompositionEnabled(compositionFlag)
    ? NINETIES_SHIPPED_STYLE
    : 'classic';
  if (nodeEnv === 'production') return shipped;
  let value: string | null = null;
  try {
    value = new URLSearchParams(search).get(SNAKE_STYLE_QUERY_KEY);
  } catch {
    return shipped;
  }
  if (value === '1' || value === 'on' || value === 'true') return 'nineties';
  if (value === 'guide') return NINETIES_SHIPPED_STYLE;
  if (value === '0' || value === 'off' || value === 'false') return 'classic';
  return shipped;
}

/**
 * Resolved ONCE, at module evaluation. Deliberately not reactive: every derived
 * value below is a plain `const` consumed by module-level geometry pools and
 * material caches, and a style that could change mid-session would mean
 * invalidating all of them. Switching styles is a hard reload, which is also
 * the only way to compare two renders honestly.
 *
 * On the server it is the flag alone - there is no URL to read, and a server
 * render that disagreed with the client's would hydrate into the wrong
 * creature.
 */
export const SNAKE_STYLE: SnakeStyleId =
  typeof window === 'undefined'
    ? NINETIES_COMPOSITION_ENABLED
      ? NINETIES_SHIPPED_STYLE
      : 'classic'
    : resolveSnakeStyle(
        window.location.search,
        process.env.NODE_ENV,
        process.env.NEXT_PUBLIC_NINETIES_COMPOSITION
      );

export const IS_SNAKE_90S = SNAKE_STYLE !== 'classic';

// -----------------------------------------------------------------------------
// The palette
// -----------------------------------------------------------------------------

/**
 * The style guide's swatches, read off the character sheet.
 *
 * `highlight` is the material's BASE colour, not its brightest lit result -
 * every face tone below is a tint that only ever darkens, so the top band must
 * be the swatch itself for the other two to land where the sheet says they
 * land.
 */
export const GUIDE_PALETTE = {
  /** HIGHLIGHT swatch - the golden yellow of the head's top face. */
  highlight: '#ffc53d',
  /**
   * The body's base. The sheet draws the head a clear value step above the
   * body, and under face-keyed shading that step has to live in the BASE
   * colour: if the body were based on the mid tone, its top faces would be
   * orange where the sheet paints them yellow.
   */
  bodyHighlight: '#ffbe35',
  /** MID TONE swatch - the vivid orange of the body's front face. */
  midtone: '#f5811f',
  /** SHADOW swatch - dark ORANGE. Never grey, never slate. */
  shadow: '#8a3d14',
  /** ACCENT: black. Warm near-black, because a blue-black outline on an
   *  orange character reads cold and fights the palette it is drawn around. */
  ink: '#12100d',
  /** DETAILS: white. Bone rather than paper white - it has to sit next to
   *  saturated orange without becoming the brightest thing on the board. */
  white: '#f7f2e6',
  /** Braid stock: the sheet's braids are the accent black, one step off ink so
   *  the silhouette line still separates a braid block from the one behind. */
  braid: '#191712',
  /** The warm bone-gold the sheet paints along every braid block's top edge.
   *  Not white: on a near-black block a white rim reads as plastic. */
  braidRim: '#d9b072',
  /** The cubic beads at the ends of the braids - brand gold, worn as jewellery. */
  bead: '#ffa927',
} as const;

// -----------------------------------------------------------------------------
// THE FACE-KEYED TONES - the round-2 supersedure, and the reason for it
// -----------------------------------------------------------------------------

/**
 * A tone band: a tint on the surface colour, plus an optional ABSOLUTE add.
 *
 * The multiply is what keeps a tone a member of the surface's own hue family
 * (so the dynasty variant works at all). The add exists for one case the
 * multiply cannot express: a near-black braid block whose top edge the sheet
 * paints bone-gold. No multiplier reaches gold from #191712; the sheet is
 * painting light onto that edge, so the code adds light too.
 */
export interface FaceTone {
  readonly mul: readonly [number, number, number];
  readonly add?: readonly [number, number, number];
}

export interface SnakeFaceToneSet {
  /** Every chamfer facet that faces up or sideways - the sheet's bright edge. */
  readonly rim: FaceTone;
  /** Flat up-facing faces. */
  readonly top: FaceTone;
  /** Vertical faces turned toward the authored key. */
  readonly side: FaceTone;
  /** Vertical faces turned away from it. */
  readonly away: FaceTone;
  /** Down-facing faces and every under-bevel. */
  readonly down: FaceTone;
  /**
   * THE TOP-LIT FALL WITHIN ONE FACE - round 3, from the owner's reference.
   *
   * How much of its tone a surface has lost by the BOTTOM of the object, as a
   * fraction. Anchored at the top: at object-space y = +0.5 the multiplier is
   * exactly 1, so every band above still resolves to the guide's own swatch and
   * the table in `TONE_SIDE` stays literally true. From there it falls linearly
   * to `1 - fall` at y = -0.5.
   *
   * IT CANNOT SOFTEN A BAND BOUNDARY, which is the property that lets it exist
   * at all under "relatively hard transitions": it is one continuous field
   * multiplying whichever band was already chosen, so the step between two
   * bands is scaled, never crossfaded. Two faces meeting at an edge still meet
   * at their full authored distance.
   *
   * Zero on anything the sheet draws as a flat graphic value - the shades, the
   * lenses, the mouth. A gradient on those is "realistic plastic", which is the
   * one thing the palette panel rules out by name.
   */
  readonly fall: number;
}

/**
 * THE TINTS, in LINEAR space (the space the multiply happens in).
 *
 * These are the guide's own swatch ratios. Applied to `GUIDE_PALETTE.highlight`
 * they reproduce the sheet's three swatches, which is the whole reason the base
 * colour is the highlight and not the midtone:
 *
 *      band        result        guide swatch
 *      top         #ffc53d       #ffc53d   HIGHLIGHT
 *      side        #f38522       #f5811f   MID TONE
 *      down        #8b410b       #8a3d14   SHADOW
 *
 * `away` is the fourth step the sheet draws but does not put in its swatch
 * panel: the two vertical faces turned away from the key sit between the mid
 * tone and the shadow.
 *
 * THE RIM IS THE FIFTH, AND IT IS THE ONE THAT GOES UP. Measured off the sheet,
 * a body cube's top FACE is the highlight swatch and the chamfer around it is
 * brighter still - about #ffd24a. That is why the rim cannot be a multiplier
 * like the rest: the highlight is already the base, and there is nothing above
 * 1.0 to multiply toward. So the rim is the top band plus an authored warm
 * LIFT, which lands on #ffd74c and generalises to the dynasties as a warm key
 * on their own hue rather than as a wash toward white.
 */
export const TONE_RIM: readonly [number, number, number] = [1, 1, 1];
export const TONE_RIM_LIFT: readonly [number, number, number] = [
  0.16, 0.13, 0.05,
];
export const TONE_TOP: readonly [number, number, number] = [1, 1, 1];
export const TONE_SIDE: readonly [number, number, number] = [0.9, 0.42, 0.34];
export const TONE_AWAY: readonly [number, number, number] = [0.58, 0.24, 0.19];
/**
 * "Shadows: Dark Orange".
 *
 * Because the tint is WARM rather than neutral, the same three numbers
 * generalise to the dynasties - each shadow stays inside its own hue family
 * and GAINS saturation, which is the guide's rule stated properly:
 *
 *      PRIMAL  #98e15a -> #514c15   dark olive, not grey
 *      CYBER   #2de7ff -> #144e4e   deep teal,  not slate
 *      COSMIC  #b58cff -> #612c4e   deep plum,  not charcoal
 */
export const TONE_DOWN: readonly [number, number, number] = [
  0.26, 0.095, 0.075,
];

/**
 * How far a face falls from its top edge to its bottom one. Round 3.
 *
 * 0.16 is set from the reference block, not from taste: on its large faces the
 * bottom edge sits about one authored step below the top edge WITHOUT ever
 * reaching the next band down. The next band down is `away` at 0.58 of `side`,
 * so the fall has to stay well inside that gap or a lit face would bottom out
 * looking like a shaded one and the 3/4 read would come apart. It also has to
 * survive a body cube being ~24 device pixels tall, which is what rules out
 * anything much smaller.
 */
const TONE_FALL = 0.16;

export const SNAKE_FACE_TONES: SnakeFaceToneSet = {
  rim: { mul: TONE_RIM, add: TONE_RIM_LIFT },
  top: { mul: TONE_TOP },
  side: { mul: TONE_SIDE },
  away: { mul: TONE_AWAY },
  down: { mul: TONE_DOWN },
  fall: TONE_FALL,
};

/**
 * Pure graphic value - the same colour on every face.
 *
 * For the parts the sheet draws as flat ink: the mouth and the lens glass. A
 * lit black is a grey that changes with the board theme, and the one thing the
 * palette panel rules out by name is the character carrying a cool value.
 */
export const FLAT_TONES: SnakeFaceToneSet = {
  rim: { mul: [1, 1, 1] },
  top: { mul: [1, 1, 1] },
  side: { mul: [1, 1, 1] },
  away: { mul: [1, 1, 1] },
  down: { mul: [1, 1, 1] },
  /** Flat means flat. A fall here would be a gradient on a drawn value. */
  fall: 0,
};

/**
 * THE SHADES. Black stock, and the sheet keeps them nearly flat: a frame that
 * shades like a body cube stops reading as a single hard black bar, which is
 * the whole silhouette. Only the top bevel catches anything, and what it
 * catches is a dark grey, not a highlight.
 */
export const SHADE_TONES: SnakeFaceToneSet = {
  rim: { mul: [1, 1, 1], add: [0.16, 0.145, 0.115] },
  top: { mul: [1, 1, 1], add: [0.055, 0.05, 0.04] },
  side: { mul: [1, 1, 1] },
  away: { mul: [0.7, 0.7, 0.7] },
  down: { mul: [0.4, 0.4, 0.4] },
  /** "A single hard black bar" - the whole point is that it does NOT model. */
  fall: 0,
};

/**
 * THE BRAIDS. "Chunky simplified block segments, near-black, STRONG UPPER-EDGE
 * HIGHLIGHTS, cel faces, thick silhouette."
 *
 * This is the tone set the `add` channel exists for. The sheet paints a
 * bone-gold line along the top edge of every braid block, and no multiplier
 * reaches gold from #191712 - the sheet is putting light on that edge, so the
 * shader adds light. Warm gold rather than white: on a near-black block a white
 * rim reads as wet plastic, which is "realistic hair" by another route.
 */
export const BRAID_TONES: SnakeFaceToneSet = {
  rim: { mul: [1, 1, 1], add: [0.69, 0.43, 0.17] },
  top: { mul: [1, 1, 1], add: [0.055, 0.043, 0.026] },
  side: { mul: [1, 1, 1] },
  away: { mul: [0.6, 0.6, 0.6] },
  down: { mul: [0.35, 0.35, 0.35] },
  /** A braid block is stock near-black; there is no tone in it to fall. */
  fall: 0,
};

/**
 * WHERE THE HARD BOUNDARIES FALL, and why these three numbers.
 *
 * The body geometry is an exact unit rounded box built at ONE chamfer segment
 * (`gameRenderGeometry`), so every face is a 3x3 grid of quads: a flat centre
 * with an analytic-normal ring around it. That ring is the whole trick.
 *
 *   `rim` - a facet is a chamfer when no component of its normal dominates.
 *     `edgeness = 1 - max(|nx|,|ny|,|nz|)` is 0 on an axis-aligned face, 0.29
 *     on a 45-degree edge and 0.42 on a corner.
 *
 *     ROUND 3 SETS THIS FROM THE FACET, and the two earlier values are kept
 *     here because the pair of them is the finding. 0.12 was geometrically
 *     defensible and visually absent - it put the boundary four fifths of the
 *     way out along a ring quad, which on a bevel a tenth of a cube wide is
 *     under a pixel. 0.05 moved it to two fifths, which drew - and that is the
 *     value the owner reviewed and called MARSHMALLOW, because a boundary two
 *     fifths of the way across a chamfer is a boundary in the middle of a
 *     surface. The flat face's tone spilled onto the inner half of every bevel,
 *     so the eye read a soft roll where his reference block has a plane.
 *
 *     0.005 lands the boundary at the geometry's OWN edge: the flat face keeps
 *     the inner ~14% of the ring quad and the rest of the chamfer - both quads
 *     of it, all the way round - is one flat band of highlight with a straight
 *     hard edge against the face beside it. That is a facet.
 *
 *     IT IS NOT ZERO, and the margin is the whole reason. A flat centre quad
 *     carries four identical vertex normals, so its interpolated `edgeness` is
 *     exactly 0 in exact arithmetic and within ~1e-7 of it in a fragment
 *     shader. At a cut of 0 a rounding error in the interpolator flips an
 *     ENTIRE FACE to the highlight band; 0.005 is four orders of magnitude
 *     clear of that noise while still being a twentieth of the way to the first
 *     real edge value.
 *
 *   `top` - ny above 0.5 is an up-facing face. Only the flat centre reaches
 *     this without having already been claimed by the rim.
 *
 *   `down` - ny below -0.35 is the underside. This is deliberately NOT -0.5:
 *     it catches the bottom ring of every vertical face too, so each cube gets
 *     the dark under-edge the sheet draws.
 *
 *   `rimFloor` - SPLIT OUT OF `down` AT ROUND 3, and it had to be. While the
 *     rim boundary sat two fifths out, the rim branch's vertical gate could
 *     share the `down` cut harmlessly: the sliver of bottom ring that was both
 *     edge-like enough and above -0.35 was a fraction of a pixel. Widening the
 *     rim to the whole chamfer widens that sliver with it, and the result is a
 *     BRIGHT line along the bottom of every vertical face - the exact opposite
 *     of the dark under-edge the sheet draws, arrived at by fixing something
 *     else. So the rim now has its own floor at -0.05: it reaches every chamfer
 *     that faces up and the vertical corner chamfers (whose ny is exactly 0,
 *     and which the sheet does highlight), and stops dead at anything tilted
 *     downward. `down` keeps -0.35 and keeps doing its own job underneath.
 *
 * The key is an AZIMUTH, not a light. Faces whose normal has a non-negative dot
 * with it take the mid tone; the other two take `away`. At the arena camera the
 * board's +Z and -X faces are the ones a player sees, so the key is aimed to
 * make those two the mid tone and leave the far pair as the deeper step - the
 * sheet's own 3/4 read, and constant on every board theme because it is a
 * constant, not a lamp.
 */
const KEY_AZIMUTH_RADIANS = (120 * Math.PI) / 180;

export const SNAKE_FACE_CUTS = {
  top: 0.5,
  down: -0.35,
  rim: 0.005,
  rimFloor: -0.05,
  /**
   * Unit vector in the XZ plane, derived from the azimuth rather than typed as
   * a rounded pair - the "exactly two faces lit" property is a property of a
   * UNIT vector, and 0.866 is not one.
   *
   * 120 degrees from +X: front-left, which is where the sheet's 3/4 views put
   * their light and which lands the arena camera's two visible faces on the mid
   * tone.
   */
  key: [
    Math.cos(KEY_AZIMUTH_RADIANS),
    Math.sin(KEY_AZIMUTH_RADIANS),
  ] as readonly [number, number],
} as const;

/**
 * Emissive is a flat unlit add, identical on every face, so it is the one term
 * that can still flatten an authored 3-tone. Cut hard on the TRUNK, which is
 * what the graphic read needs and what the bloom threshold wants anyway.
 */
export const BODY_EMISSIVE_SCALE = 0.22;

/**
 * THE HEAD IS NOT CUT THE SAME WAY, and this number is not a taste call.
 *
 * The shipped snake separates head from body with an emissive GAP, and the eye
 * reads the gap in absolute terms, not as a ratio: 0.78 head against 0.40 body
 * on PRIMAL is a head that is visibly the live end. Scaling both by 0.22 keeps
 * the ratio perfectly and collapses the gap to 0.08, which is a head that is
 * merely a slightly larger cube - and "MADE TO POP / readable at speed" is the
 * first law on the sheet.
 *
 * So the head keeps whatever emissive it needs to hold the SHIPPED gap over
 * the cut-down trunk:
 *
 *      head = body x 0.22 + (head_shipped - body_shipped)
 *
 * Solved per dynasty that is 0.600 (PRIMAL), 0.606 (CYBER), 0.601 (COSMIC) -
 * one constant, because the three profiles were authored with the same gap in
 * mind. The head therefore still loses 40% of its glow to the cel treatment
 * (it reads drawn, not lit) while leading the trunk by exactly as much as the
 * shipped creature does.
 *
 * The bloom contract is unchanged and this is the side of it that was always
 * allowed to bloom: head, food, portal, glow strips - never the trunk.
 */
export const HEAD_EMISSIVE_SCALE = 0.6;

// -----------------------------------------------------------------------------
// The profile
// -----------------------------------------------------------------------------

/**
 * THE CUBE LAW.
 *
 * The shipped renderer says two things with two size channels: FOOTPRINT
 * carries the earned fusion metric, HEIGHT carries ticks-until-this-tile-frees.
 * Both are gameplay readouts and neither may be dropped. But two independent
 * channels is exactly what makes a segment a slab, and the guide's first clause
 * is that it is a cube.
 *
 * So under this style both channels drive ONE EDGE:
 *
 *   fusion   -> the edge itself (`trailFootprint`), so a packed coil is made of
 *               bigger cubes with a narrower gap and a free run is made of
 *               smaller cubes with a wide one. The ORDERING is what carried the
 *               information before and it is untouched; only the merge at the
 *               top of the range is gone, and the merge is what the guide
 *               forbids.
 *   vacancy  -> `vacancyMin`, a uniform shrink over the last few ticks. A cell
 *               about to free up is a visibly smaller cube. At a 69-degree
 *               camera a shrinking cube says it more clearly than a sinking one
 *               did, because from above a flattened box keeps its footprint.
 *   head zone-> `headZoneLift`, the same "the front is alive" cue as the old
 *               height ease, now bought in all three axes.
 *
 * `maxEdge` is the clause that makes "CLEARLY SEPARATED" a floor rather than an
 * average: no cell, however fused, however lifted, however breathing, may ever
 * claim more than this much of its tile. The sheet never draws a continuous
 * tube and neither can this.
 */
export interface SnakeCubeProfile {
  readonly maxEdge: number;
  readonly headZoneLift: number;
  readonly vacancyMin: number;
}

/**
 * The cube law itself, as a pure function of a profile.
 *
 * It lives here rather than in `SnakeModel` for one reason: the active style is
 * resolved once at module load from the URL, so under jest it is always
 * `classic` and the concept's own arithmetic would be unreachable by any test
 * that could exist. Passing the profile in makes the law testable against the
 * profile the guide is actually about. `SnakeModel.getTrailCubeEdge` is the
 * thin wrapper that supplies the active one, and the head-zone and vacancy
 * windows come from the renderer rather than being restated here.
 */
export function resolveCubeEdge(
  cube: SnakeCubeProfile,
  baseEdge: number,
  index: number,
  length: number,
  headZone: number,
  vacancyTicks: number
): number {
  let edge = baseEdge;

  if (length > 1 && index >= 0 && index <= headZone) {
    const t = index / headZone;
    const s = t * t * (3 - 2 * t); // smoothstep
    edge *= cube.headZoneLift - (cube.headZoneLift - 1) * s;
  }

  // Denominated in TICKS-until-free, exactly as the height channel was: what a
  // player needs is "that tile opens in two moves", which a segment count only
  // answers by accident.
  const ticksToVacancy = length - index;
  if (length > 1 && ticksToVacancy <= vacancyTicks) {
    const t =
      vacancyTicks <= 1
        ? 1
        : (vacancyTicks - ticksToVacancy) / (vacancyTicks - 1);
    const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
    edge *= 1 - (1 - cube.vacancyMin) * clamped;
  }

  return edge > cube.maxEdge ? cube.maxEdge : edge;
}

export interface SnakeCosmeticStyle {
  /** Shade frame + temples. */
  readonly frame: string;
  /** Lens glass. */
  readonly lens: string;
  /** The bone pixels on the lens. */
  readonly glint: string;
  readonly braid: string;
  readonly bead: string;
  /** Ink weights, in world cells (see `SnakeCosmetics`). */
  readonly shadeInk: number;
  readonly beadInk: number;
  /**
   * "Disproportionately large." The brow bar's height as a fraction of the
   * head, and how far past the head's sides the shades overhang.
   */
  readonly browHeight: number;
  readonly shadeOverhang: number;
  readonly lensHeight: number;
  /** Braid blocks: the sheet's crown is a FIELD of blocks, not four bars. */
  readonly braidBlock: number;
  readonly braidPitch: number;
}

export interface SnakeStyleProfile {
  readonly id: SnakeStyleId;
  /** Head edge, in grid cells. */
  readonly headSize: number;
  /** Body edge for the NON-instanced segment paths, in grid cells. */
  readonly bodySize: number;
  /**
   * Cell claim by fusion level (see SnakeModel.TRAIL_FOOTPRINT). Under a cubic
   * style this is the cube's EDGE; under classic it is the footprint only.
   */
  readonly trailFootprint: readonly [number, number, number];
  readonly headBevelRadius: number;
  readonly bodyBevelRadius: number;
  readonly inkColor: string;
  readonly inkHullWidth: number;
  /** null = the shipped two-channel slab. */
  readonly cube: SnakeCubeProfile | null;
  /** null = stock light-driven toon ramp, no shader patch. */
  readonly tones: SnakeFaceToneSet | null;
  readonly headEmissiveScale: number;
  readonly bodyEmissiveScale: number;
  /**
   * When set, every dynasty renders in the guide's own colours.
   *
   * TWO swatches, not one. The character sheet draws the head a clear value
   * step above every body segment, and that step is how the sheet's own snake
   * reads head-first.
   */
  readonly forcedHeadBaseColor: string | null;
  readonly forcedBodyBaseColor: string | null;
  readonly forcedEmissiveColor: string | null;
  /** Eye pieces: the guide's eye is a chunky WHITE pixel, not a glint. */
  readonly eyePupilScale: number;
  readonly eyeGlintScale: number;
  readonly eyeGlintOffset: readonly [number, number, number];
  /** null = the shipped INK & AMBER cosmetics. */
  readonly cosmetics: SnakeCosmeticStyle | null;
}

/**
 * THE HEAD, and why it stops at 0.98 rather than going oversized outright.
 *
 * The guide's head is roughly 1.5x a body cube, and the chamber portrait
 * already renders that ratio (1.0 / 0.64). The board cannot simply copy it:
 * a head wider than one grid cell paints over a tile it does not occupy, and
 * "which tile is free" is the only question the player is actually asking at
 * speed. So the absolute size is capped just under a cell - the guide's
 * "perfect 1 unit cube", held a hair short so it never bleeds into a
 * neighbour - and the OVERSIZED read is bought from the ratio instead.
 *
 * Round 2 makes that ratio honest. Round 1 was 1.40x against the trunk's
 * HEIGHT and only 1.20x against its footprint, because the trunk was a slab
 * and the two numbers disagreed. Against a true cube there is one number:
 *
 *      head 0.98 vs settled body edge 0.76 = 1.29x, in all three axes
 *      head 0.98 vs free-running body 0.68 = 1.44x
 */
const NINETIES_HEAD_SIZE = 0.98;

/**
 * THE SEPARATION, measured off the sheet.
 *
 * On the character sheet the gap between two adjacent body cubes is about 15%
 * of a cube. That is the tightest the creature is ever drawn, so it is what the
 * FULLY FUSED level gets; the looser levels open up from there and carry the
 * fusion readout in the width of the gap:
 *
 *      level 0  edge 0.68  gap 0.32   running free - unmistakably discrete
 *      level 1  edge 0.76  gap 0.24   fusing at the edges
 *      level 2  edge 0.85  gap 0.15   packed - the sheet's own spacing
 *
 * Every one of those gaps is wider than the ink hull can paint over from both
 * sides (2 x 0.095 = 0.19 at the widest), which is the bound that keeps the
 * outline describing a silhouette instead of merging a coil into one mass.
 * That is asserted rather than asserted-by-comment.
 */
const NINETIES_TRAIL_EDGES = [0.68, 0.76, 0.85] as readonly [
  number,
  number,
  number,
];

const NINETIES_COSMETICS: SnakeCosmeticStyle = {
  frame: GUIDE_PALETTE.ink,
  lens: GUIDE_PALETTE.ink,
  glint: GUIDE_PALETTE.white,
  braid: GUIDE_PALETTE.braid,
  bead: GUIDE_PALETTE.bead,
  /** Thicker than the shipped detail line: the sheet inks the shades as boldly
   *  as it inks the head, because they are half the character's silhouette. */
  shadeInk: 0.042,
  beadInk: 0.026,
  /** "Disproportionately large": a fifth of the head's height, and past its
   *  sides at both ends. The sheet's shades are not eyewear, they are a bar. */
  browHeight: 0.2,
  shadeOverhang: 1.16,
  lensHeight: 0.3,
  /**
   * The crown is a field of blocks and a block's PITCH must exceed the block,
   * or the chain fuses into a ridge and stops reading as braided - the same law
   * the body cubes are held to, applied to the cosmetic that frames them.
   */
  braidBlock: 0.205,
  braidPitch: 0.245,
};

const NINETIES_BASE = {
  headSize: NINETIES_HEAD_SIZE,
  bodySize: 0.78,
  trailFootprint: NINETIES_TRAIL_EDGES,
  cube: {
    maxEdge: 0.85,
    /**
     * Modest, because under the cube law a lift is a lift in WIDTH too, and
     * width is the separation. 1.08 at the head end easing to 1.0 by the end of
     * the head zone; `maxEdge` catches it if fusion has already claimed the
     * headroom.
     */
    headZoneLift: 1.08,
    /** The tail tip is a small cube, not a chip: it still has to read. */
    vacancyMin: 0.62,
  } satisfies SnakeCubeProfile,
  /**
   * A wide single chamfer. The ring it creates is where the RIM band lives, so
   * this radius is directly the weight of the sheet's bright edge line - and a
   * smoothed bevel would blur that line while costing ~3x the triangles.
   */
  headBevelRadius: 0.15,
  bodyBevelRadius: 0.155,
  inkColor: GUIDE_PALETTE.ink,
  /**
   * "Thick outline around the character silhouette - visually substantial,
   * never a 1px technical edge." +64% on the shipped weight, +27% on round 1.
   *
   * The bound is no longer a percentage of the shipped value (that was a number
   * with no meaning); it is the free-running gap. Two hulls facing each other
   * across the level-0 gap must not meet, or the outline stops describing a
   * silhouette and starts filling the space the fusion readout needs.
   */
  inkHullWidth: 0.095,
  tones: SNAKE_FACE_TONES,
  headEmissiveScale: HEAD_EMISSIVE_SCALE,
  bodyEmissiveScale: BODY_EMISSIVE_SCALE,
  /** A blunt white pixel where the shipped head has a small specular glint. */
  eyePupilScale: 0.19,
  eyeGlintScale: 0.075,
  eyeGlintOffset: [0.03, 0.035, 0.04] as readonly [number, number, number],
  cosmetics: NINETIES_COSMETICS,
} as const;

export const SNAKE_STYLE_PROFILES: Record<SnakeStyleId, SnakeStyleProfile> = {
  classic: {
    id: 'classic',
    headSize: 0.9,
    bodySize: 0.75,
    trailFootprint: [0.66, 0.8, 0.9],
    headBevelRadius: 0.12,
    bodyBevelRadius: 0.085,
    inkColor: '#0b1118',
    inkHullWidth: 0.058,
    cube: null,
    tones: null,
    headEmissiveScale: 1,
    bodyEmissiveScale: 1,
    forcedHeadBaseColor: null,
    forcedBodyBaseColor: null,
    forcedEmissiveColor: null,
    eyePupilScale: 0.16,
    eyeGlintScale: 0.055,
    eyeGlintOffset: [0.035, 0.04, 0.045],
    cosmetics: null,
  },
  nineties: {
    id: 'nineties',
    ...NINETIES_BASE,
    forcedHeadBaseColor: null,
    forcedBodyBaseColor: null,
    forcedEmissiveColor: null,
  },
  ninetiesGuide: {
    id: 'ninetiesGuide',
    ...NINETIES_BASE,
    forcedHeadBaseColor: GUIDE_PALETTE.highlight,
    forcedBodyBaseColor: GUIDE_PALETTE.bodyHighlight,
    forcedEmissiveColor: GUIDE_PALETTE.midtone,
  },
};

export const SNAKE_STYLE_PROFILE: SnakeStyleProfile =
  SNAKE_STYLE_PROFILES[SNAKE_STYLE];

// -----------------------------------------------------------------------------
// THE GUIDE'S OWN ITEMS - named here, equipped nowhere
// -----------------------------------------------------------------------------

/**
 * The catalog rows this style restyles, by the server's own component keys
 * (migration 069: `face_shades_deadpan` -> `shades_deadpan`,
 * `crown_braids_amber` -> `braids_amber`).
 *
 * A NAME, NOT A DEFAULT, and the difference is the whole note. The concept
 * branch filled an empty slot with these while it was being reviewed, because a
 * review of "the character the guide describes" needs the character the guide
 * describes. Production may not: `read_snake_loadout` is the only thing that
 * says what a snake is wearing, on the board and in the chamber alike, and a
 * renderer that equips an item the server did not is the client-owned loadout
 * migration 069's own header calls "the first cosmetic a player can grant
 * themselves". A player with nothing equipped gets a bare 90s head, which is
 * what their record says they own and wear.
 *
 * Both rows are `default_owned`, so every player CAN wear them from the
 * wardrobe. Equipping them for a player who has not chosen them would be a
 * migration, and that decision is not this package's to take.
 *
 * Typed as plain strings rather than against the cosmetics registry: this
 * module is imported by the renderer and the registry imports the renderer's
 * geometry, so naming the components as strings is what keeps that from
 * becoming a cycle.
 */
export const GUIDE_COSMETIC_COMPONENTS = {
  face: 'shades_deadpan',
  crown: 'braids_amber',
} as const;

/** Which end of the creature a value is being resolved for. */
export type SnakeSegmentRole = 'head' | 'body';

/** Dynasty colour, unless the guide palette is in force. */
export function resolveSnakeBaseColor(
  dynastyColor: string,
  role: SnakeSegmentRole = 'body'
): string {
  const profile = SNAKE_STYLE_PROFILE;
  const forced =
    role === 'head' ? profile.forcedHeadBaseColor : profile.forcedBodyBaseColor;
  return forced ?? dynastyColor;
}

export function resolveSnakeEmissiveColor(dynastyColor: string): string {
  return SNAKE_STYLE_PROFILE.forcedEmissiveColor ?? dynastyColor;
}

export function resolveSnakeEmissiveIntensity(
  intensity: number,
  role: SnakeSegmentRole
): number {
  const profile = SNAKE_STYLE_PROFILE;
  if (!profile.tones) return intensity;
  return (
    intensity *
    (role === 'head' ? profile.headEmissiveScale : profile.bodyEmissiveScale)
  );
}

/**
 * The snake's outline pass at the active style's weight and colour.
 *
 * A wrapper rather than a wider `createInkHullMaterial` signature: INK & AMBER
 * is the board's shared vocabulary and three other objects are drawn with it,
 * so the concept adds a snake-specific call site instead of editing a
 * primitive everything depends on.
 */
export function createSnakeInkHullMaterial(): THREE.MeshBasicMaterial {
  const material = createInkHullMaterial(SNAKE_STYLE_PROFILE.inkHullWidth);
  material.color.set(SNAKE_STYLE_PROFILE.inkColor);
  return material;
}

// -----------------------------------------------------------------------------
// The shader patch
// -----------------------------------------------------------------------------

/**
 * The stock three.js seams this patch depends on. Matched by text, so a three
 * upgrade that rewords them would silently drop the whole style back to lit
 * shading with no error anywhere - which is what the test that pins them is
 * for.
 */
const NORMAL_HOOK = '#include <defaultnormal_vertex>';
const LIGHTS_END_HOOK = '#include <lights_fragment_end>';
const BEGIN_VERTEX_HOOK = '#include <begin_vertex>';

const FACE_VARYING = 'varying vec3 vSnakeWorldNormal;';
/**
 * OBJECT normal, and the whole reason it exists is that `edgeness` is a
 * question about GEOMETRY while every other branch is a question about LIGHT.
 *
 * THE BUG THIS CLOSES — reported as "the cosmetics in the chamber sometimes
 * lose their surface, braids don't appear black for a moment but bright".
 *
 * `edgeness = 1 - max(|nx|,|ny|,|nz|)` reads 0 on a flat face and 0.29 on a
 * 45-degree chamfer, and the `rim` cut of 0.005 is set four orders of
 * magnitude clear of interpolator noise on the strength of that. Both claims
 * are true of a normal expressed in OBJECT space and neither survives the
 * world-space read this branch used to take: rotating a cube by θ raises every
 * one of its flat faces to `1 - cos θ`, so a face is misclassified as a
 * chamfer the moment the object turns more than 5.73 degrees off axis.
 *
 * It never showed on the board because the board is axis-aligned — a segment
 * yaws to its heading, headings are grid directions, and `max(|x|,|y|,|z|)` is
 * invariant under permuting and negating axes, so a 90-degree turn changes
 * nothing. The Specimen Chamber is the one place in the product that puts a
 * head at a FRACTIONAL yaw: HEAD_YAW is -1.64 degrees and the idle sway swings
 * it ±0.08 rad, which carries the flat faces across 0.1 rad — the exact cut —
 * for 17.6% of the cycle, beating against an independent ±0.04 pitch so it
 * reads as intermittent rather than as a pulse.
 *
 * When it crosses, every flat face of the head AND of every cosmetic parented
 * to it takes `rim` instead of `side`. On the head that is a modest lift on an
 * already-bright fill. On a braid block, whose stock is near-black and whose
 * rim is a full gold ADD of [0.69, 0.43, 0.17], the add IS the entire visible
 * colour — near-black becomes bone-tan, which is precisely "loses its surface
 * and goes bright".
 *
 * THE FIX IS PROVABLY A NO-OP WHERE THE OLD CODE WAS RIGHT. On any
 * axis-aligned object the object and world normals differ only by a permutation
 * and a sign, and the classifier is invariant under both — so the board renders
 * bit-identically and only the fractional-yaw portrait changes. It also, for
 * free, stops non-uniform scale skewing the classification through the
 * inverse-transpose, which the cornrow blocks were quietly subject to.
 *
 * `objectNormal` rather than the raw `normal` attribute: it is the post-morph,
 * post-skin normal three has already assembled at this hook, so the classifier
 * follows the geometry that is actually drawn.
 */
const OBJECT_NORMAL_VARYING = 'varying vec3 vSnakeObjectNormal;';
/**
 * Object-space height on a unit segment, -0.5 .. 0.5.
 *
 * Paid for by the deleted cuff and inherited by the top-lit fall, which is why
 * round 3's gradient costs nothing: same varying, same hook, one fewer branch
 * than the mechanism it replaces. OBJECT space rather than world on purpose -
 * a segment is never rolled, only yawed, so object Y is world height AND it
 * stays a fixed fraction of the cube at every scale the vacancy channel picks.
 */
const HEIGHT_VARYING = 'varying float vSnakeSegmentY;';

/**
 * World normal, taken back out of the view-space normal three has already
 * computed correctly.
 *
 * `transformedNormal` at this point has been through the instance matrix's
 * inverse scale AND `normalMatrix` (the inverse-transpose of the model-view),
 * so it is right for instanced meshes, non-uniform scales and skinning alike.
 * The view matrix's rotation is orthonormal, so undoing it is a transpose - and
 * a transpose is three dot products against its columns, which is written out
 * because `transpose()` does not exist in GLSL ES 1.00.
 *
 * The world normal, not the object normal, is what makes the key direction a
 * constant: the head yaws to face its heading, and an object-space key would
 * spin the character's lighting every time the player turns.
 *
 * That argument governs the four LIGHTING bands and only those. It never
 * governed `edgeness`, which asks whether a fragment sits on a chamfer — see
 * `OBJECT_NORMAL_VARYING`. Both normals are carried because the shader is
 * answering two different questions and they have two different frames.
 */
const FACE_VERTEX_BODY = [
  NORMAL_HOOK,
  'vSnakeWorldNormal = vec3(',
  '  dot( viewMatrix[ 0 ].xyz, transformedNormal ),',
  '  dot( viewMatrix[ 1 ].xyz, transformedNormal ),',
  '  dot( viewMatrix[ 2 ].xyz, transformedNormal )',
  ');',
  'vSnakeObjectNormal = objectNormal;',
].join('\n');

const FACE_FRAGMENT_UNIFORMS = [
  'uniform vec3 uSnakeToneMul[ 5 ];',
  'uniform vec3 uSnakeToneAdd[ 5 ];',
  'uniform vec4 uSnakeCuts;', // top, down, rim, rimFloor
  'uniform vec2 uSnakeKey;',
  'uniform float uSnakeFall;',
].join('\n');

/**
 * The whole cel look, as one branch on the world normal.
 *
 * Both reflected-light accumulators are ZEROED and replaced. That is the point
 * rather than a side effect: after this line the snake's colour is a function
 * of its own surface and nothing else - not the board's key light, not its
 * fill, not its shadow map, not the theme. "Local colours stay recognisable
 * under every board theme" stops being something to tune and becomes something
 * that cannot fail.
 *
 * `diffuseColor.rgb` still carries the material colour times the per-instance
 * colour, so the fusion tone and the strain band survive untouched underneath.
 */
function faceFragmentBody(hasFall: boolean): string {
  const lines = [
    LIGHTS_END_HOOK,
    '{',
    '  vec3 sn = normalize( vSnakeWorldNormal );',
    // GEOMETRY, not light: which facet of the drawn box this fragment is on.
    // Object space, because a chamfer is a chamfer however the object is
    // turned. See OBJECT_NORMAL_VARYING for the defect this closes.
    '  vec3 an = abs( normalize( vSnakeObjectNormal ) );',
    '  float edgeness = 1.0 - max( an.x, max( an.y, an.z ) );',
    '  vec3 toneMul;',
    '  vec3 toneAdd;',
    '  if ( edgeness > uSnakeCuts.z && sn.y > uSnakeCuts.w ) {',
    '    toneMul = uSnakeToneMul[ 0 ]; toneAdd = uSnakeToneAdd[ 0 ];',
    '  } else if ( sn.y > uSnakeCuts.x ) {',
    '    toneMul = uSnakeToneMul[ 1 ]; toneAdd = uSnakeToneAdd[ 1 ];',
    '  } else if ( sn.y < uSnakeCuts.y ) {',
    '    toneMul = uSnakeToneMul[ 4 ]; toneAdd = uSnakeToneAdd[ 4 ];',
    '  } else if ( dot( sn.xz, uSnakeKey ) >= 0.0 ) {',
    '    toneMul = uSnakeToneMul[ 2 ]; toneAdd = uSnakeToneAdd[ 2 ];',
    '  } else {',
    '    toneMul = uSnakeToneMul[ 3 ]; toneAdd = uSnakeToneAdd[ 3 ];',
    '  }',
  ];
  if (hasFall) {
    // One continuous multiplier on whichever band was already chosen. It
    // cannot cross-fade a boundary, only scale both sides of it - which is
    // what makes "hard transitions" and "top-lit faces" compatible at all.
    lines.push(
      '  float fall = 1.0 - uSnakeFall * ( 0.5 - vSnakeSegmentY );',
      '  toneMul *= fall;',
      '  toneAdd *= fall;'
    );
  }
  lines.push(
    '  reflectedLight.directDiffuse = vec3( 0.0 );',
    '  reflectedLight.directSpecular = vec3( 0.0 );',
    '  reflectedLight.indirectSpecular = vec3( 0.0 );',
    '  reflectedLight.indirectDiffuse = diffuseColor.rgb * toneMul + toneAdd;',
    '}'
  );
  return lines.join('\n');
}

const NO_ADD: readonly [number, number, number] = [0, 0, 0];

function toneVector(tone: FaceTone, which: 'mul' | 'add'): THREE.Vector3 {
  const value = which === 'mul' ? tone.mul : (tone.add ?? NO_ADD);
  return new THREE.Vector3(value[0], value[1], value[2]);
}

export interface FaceShadingOptions {
  readonly tones: SnakeFaceToneSet;
  /** Distinguishes the compiled program. See the note in the body. */
  readonly cacheKey: string;
}

/**
 * Turn a stock `MeshToonMaterial` into the guide's face-keyed cel material.
 *
 * Composes with whatever `onBeforeCompile` the material already carries -
 * `Material.copy()` does not clone that property, so the callers that clone a
 * shared material must re-apply BOTH patches, and this must not clobber the
 * one that was applied first.
 */
export function applyFaceKeyedShading(
  material: THREE.MeshToonMaterial,
  options: FaceShadingOptions
): void {
  const { tones } = options;
  const hasFall = tones.fall > 0;
  const previous = material.onBeforeCompile.bind(material);
  const order: FaceTone[] = [
    tones.rim,
    tones.top,
    tones.side,
    tones.away,
    tones.down,
  ];

  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);

    shader.uniforms.uSnakeToneMul = {
      value: order.map((tone) => toneVector(tone, 'mul')),
    };
    shader.uniforms.uSnakeToneAdd = {
      value: order.map((tone) => toneVector(tone, 'add')),
    };
    shader.uniforms.uSnakeCuts = {
      value: new THREE.Vector4(
        SNAKE_FACE_CUTS.top,
        SNAKE_FACE_CUTS.down,
        SNAKE_FACE_CUTS.rim,
        SNAKE_FACE_CUTS.rimFloor
      ),
    };
    shader.uniforms.uSnakeKey = {
      value: new THREE.Vector2(SNAKE_FACE_CUTS.key[0], SNAKE_FACE_CUTS.key[1]),
    };

    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        `${FACE_VARYING}\n${OBJECT_NORMAL_VARYING}\nvoid main() {`
      )
      .replace(NORMAL_HOOK, FACE_VERTEX_BODY);

    let fragmentPreamble =
      `${FACE_VARYING}\n${OBJECT_NORMAL_VARYING}\n${FACE_FRAGMENT_UNIFORMS}\n`;

    if (hasFall) {
      shader.uniforms.uSnakeFall = { value: tones.fall };
      fragmentPreamble += `${HEIGHT_VARYING}\n`;
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', `${HEIGHT_VARYING}\nvoid main() {`)
        .replace(
          BEGIN_VERTEX_HOOK,
          `${BEGIN_VERTEX_HOOK}\nvSnakeSegmentY = position.y;`
        );
    }

    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${fragmentPreamble}void main() {`)
      .replace(LIGHTS_END_HOOK, faceFragmentBody(hasFall));
  };

  // Three's default program cache key is `onBeforeCompile.toString()`, and
  // every material patched here shares one function SOURCE while producing
  // different shaders (with the fall or without it, and different tone sets).
  // Without an explicit key the flat-drawn shades would be handed the
  // creature's program and start modelling.
  material.customProgramCacheKey = () =>
    `snake90s:${SNAKE_STYLE}:${hasFall ? 'fall' : 'flat'}:${options.cacheKey}`;
  material.needsUpdate = true;
}

export interface SnakeShadingOptions {
  /**
   * Kept in the cache key, and no longer in the shading.
   *
   * Until round 3 the role picked which cuff a part wore. With the cuff gone,
   * head and body take the identical tone set - which is what the guide asks
   * for anyway ("the body speaks the same language as the head ... but
   * simpler") - and the role survives only so the two ends keep distinct
   * program cache entries. Their separation is bought by size, by emissive and
   * by base colour, not by the surface treatment.
   */
  readonly role: SnakeSegmentRole;
  readonly cacheKey: string;
}

/**
 * The creature's own shading. A no-op unless a concept style is active, so
 * every call site can be unconditional and the classic path keeps the exact
 * program it ships today.
 */
export function applySnakeFaceShading(
  material: THREE.MeshToonMaterial,
  options: SnakeShadingOptions
): void {
  const profile = SNAKE_STYLE_PROFILE;
  if (!profile.tones) return;
  applyFaceKeyedShading(material, {
    tones: profile.tones,
    cacheKey: `${options.role}:${options.cacheKey}`,
  });
}
