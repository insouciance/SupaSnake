import * as THREE from 'three';
import { createExactUnitRoundedBoxGeometry } from './gameRenderGeometry';
import {
  applyFaceKeyedShading,
  GUIDE_PALETTE,
  type FaceTone,
  type SnakeFaceToneSet,
} from './snake90s';
import { createInkHullMaterial } from './inkAmber';

/**
 * THE 90S CARTOON FOODS - the pickup family's style module.
 *
 * Sibling to `snake90s.ts`, and deliberately shaped like it: the palette, the
 * tone table, the geometry and the materials live here as pure values so the
 * look can be unit-tested, and `FoodBeacon.tsx` is left holding nothing but
 * mounting and motion.
 *
 * WHAT THIS SUPERSEDES. The INK & AMBER apple was the right IDEA - food should
 * read as food - executed against the wrong material. Three faults, all
 * visible in a T4 screenshot:
 *
 *   1. IT WAS NOT CEL. `MeshToonMaterial` with `emissiveIntensity: 1.6` and
 *      `emissive` set to the base colour adds 1.6x the surface colour as a
 *      flat unlit term on every face. That add is larger than the entire lit
 *      range the 3-texel ramp works over, so the ramp was drowned: the apple
 *      resolved to one clipped saturated fill. The bands were authored and
 *      then paid for and then never seen.
 *   2. IT WAS NOT ENV-IMMUNE. What little shading survived came from the
 *      board's key light, so the fruit's own colour moved with the theme -
 *      the one property the snake spends a whole custom shader to guarantee.
 *   3. IT WAS A BALL. `createExactUnitRoundedBoxGeometry(0.42, 2)` on a unit
 *      box is a sphere in all but name. See THE CUBE LAW below.
 *
 * The semantics are untouched. Nothing here knows what a food is worth, when
 * one spawns, or what collecting it does; this module owns shape, colour and
 * outline and nothing else.
 */

// -----------------------------------------------------------------------------
// THE CUBE LAW, applied to fruit
// -----------------------------------------------------------------------------

/**
 * WHY THE FOOD IS CUBIC AND NOT ORGANIC - and this is a shading argument
 * before it is a taste argument.
 *
 * The style's env-immunity comes from `applyFaceKeyedShading`, which branches
 * on the WORLD NORMAL into five authored bands. That branch only produces cel
 * bands if the normal is piecewise CONSTANT. On a sphere the normal sweeps
 * continuously, so the same branch draws smooth contour rings across the
 * surface - a shape that looks lit and modelled, which is the exact opposite
 * of what the branch exists to do. On a chamfered box every face resolves to
 * exactly one tone and every chamfer to the rim, which is how the snake gets
 * its look and therefore the only way the food can be drawn by the same hand.
 *
 * So: cubic construction is a PRECONDITION of the shading model, not a
 * preference. A round food cannot be cel-shaded by this renderer at all.
 *
 * Two supporting reasons:
 *
 *   SILHOUETTE. At the smallest real board scale the ink contour is most of
 *   what survives. A circle's contour carries no corners and no orientation;
 *   a chamfered box reads as a hard-cornered chunk at any size.
 *
 *   RESEMBLANCE. The snake is true cubes, the board is bevelled blocks and
 *   terrain is boxes. A ball is the only smooth object in frame and reads as
 *   imported from another game.
 *
 * WHAT KEEPS IT FROM BEING A BLOCK OF WOOD is the taper below plus the
 * authored parts: a bare cube is not food. The rule this family follows is
 * CUBIC CONSTRUCTION, ORGANIC SILHOUETTE - flat faces the shader can band
 * hard, inside an outline broken asymmetrically by a stem and a fat leaf.
 */

/**
 * A vertical taper profile: object-space y in -0.5..0.5 to an x/z multiplier.
 *
 * Applied to POSITIONS only. The normals are deliberately left as the box's
 * own analytic ones, which is what keeps a tapered face flat to the shader:
 * a re-derived normal would tilt with the slope and start splitting one face
 * across two bands, and the whole point of the taper is that it changes the
 * SILHOUETTE without touching the banding. It also keeps the ink hull's
 * outward push axis-aligned, so the outline stays an even weight.
 */
export type TaperProfile = (y: number) => number;

/**
 * THE APPLE. Widest just above the middle, tucked at both ends - a barrel with
 * a shoulder, which is the cartoon apple silhouette in as few stops as the
 * geometry has rows to put them on.
 */
export const APPLE_TAPER: TaperProfile = (y) => {
  const barrel = 1 - 0.2 * (2 * y) * (2 * y);
  const shoulder = y > 0 ? 1 - 0.1 * (2 * y) : 1;
  return barrel * shoulder;
};

/**
 * THE BERRY. Wide-shouldered and drawn to a blunt point, so it stands on a
 * corner it could plausibly fall off - the shape carries the risk before the
 * motion does.
 */
export const BERRY_TAPER: TaperProfile = (y) => {
  const t = y + 0.5;
  return 0.3 + 0.72 * t * (2 - t) * 0.72 + 0.16 * t;
};

/** No taper - for parts whose silhouette is already the drawing. */
export const NO_TAPER: TaperProfile = () => 1;

/**
 * A unit rounded box with a vertical taper baked into its positions.
 *
 * Baked at module scope, so the taper costs nothing per frame and nothing per
 * instance. Axis extrema in y stay exactly -0.5..0.5, so mesh scale remains
 * the only authority on how much of a cell the food claims.
 */
export function createTaperedFoodGeometry(
  radius: number,
  taper: TaperProfile
): THREE.BufferGeometry {
  const geometry = createExactUnitRoundedBoxGeometry(radius);
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let index = 0; index < positions.count; index += 1) {
    const y = positions.getY(index);
    const scale = taper(y);
    positions.setX(index, positions.getX(index) * scale);
    positions.setZ(index, positions.getZ(index) * scale);
  }
  positions.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// -----------------------------------------------------------------------------
// The palette
// -----------------------------------------------------------------------------

/**
 * THE FOOD'S OWN COLOURS - authored, fixed, and outside every other object on
 * the board.
 *
 * THE BOARD'S COLOUR CENSUS, which is what these were chosen against:
 *
 *      the snake      #ffc53d -> #f5811f -> #8a3d14   gold to orange, fixed on
 *                                                     every dynasty
 *      terrain        #f2a03f forming, #3f5060 solid  amber and cool slate
 *      mutation       #a855f7                         violet
 *      portal         cyan
 *      board faces    #1c333e / #332f29 / #2c2f35     all dark, all desaturated
 *
 * RED IS THE ONE SATURATED HUE NOTHING ELSE CLAIMS, and a red apple is the
 * most legible "this is food" object in the cartoon vocabulary. The green leaf
 * matters as much as the body does: red-against-green is a pairing no other
 * object on the board has, and on the warm sol board - where an orange snake
 * crosses orange terrain - the leaf is the mark that keeps the food out of the
 * warm monochrome.
 */
export const FOOD_PALETTE = {
  /**
   * The apple's BASE, which is its brightest band and not its average - every
   * tone below only ever darkens, exactly as the snake's do.
   */
  appleSkin: '#f9483c',
  /** The leaf, and the berry's calyx. Vivid enough to survive one band down. */
  leaf: '#6cc23a',
  /**
   * The glaze. The product's one amber, the same value banked yield wears -
   * a golden food is worth more and the amber law already says what that
   * looks like.
   */
  glaze: '#ffc247',
  /** Sprinkles: two of the bone, one of the pink. Pure drawn marks. */
  sprinkleBone: GUIDE_PALETTE.white,
  sprinklePink: '#ff8fb8',
  /** The berry. UMBRA - the colour the product already spends on risk. */
  berry: '#f54263',
  /** Outline and stem. The snake's warm near-black, not a cool one. */
  ink: GUIDE_PALETTE.ink,
  /** The cartoon glint. A drawn highlight, never a specular. */
  glint: GUIDE_PALETTE.white,
} as const;

// -----------------------------------------------------------------------------
// THE TONES - re-authored, and the reason they had to be
// -----------------------------------------------------------------------------

/**
 * THE FOOD CANNOT REUSE THE SNAKE'S TONE MULTIPLIERS. This is the one place
 * the family deliberately diverges, and it diverges to preserve the look
 * rather than to depart from it.
 *
 * The snake's steps are `side` [0.9, 0.42, 0.34] and `down` [0.26, 0.095,
 * 0.075]: they barely touch red and cut green and blue hard. That is correct
 * for an orange whose green channel is large - on #ffc53d the green channel is
 * where the whole value step lives. Run the same numbers on a near-pure red
 * and there is nothing left to cut. Worked in linear space, #f9483c under the
 * snake's `side` lands within a couple of levels of its own base: the three
 * bands collapse into one flat fill and the fruit stops reading as drawn.
 *
 * So the food authors multipliers that step in VALUE while staying warm, which
 * is the guide's rule stated properly - "shadows are dark ORANGE, never grey".
 * On #f9483c they land:
 *
 *      band     result     reads as
 *      top      #f9483c    the apple's lit face
 *      side     #c8322a    a deeper apple red
 *      away     #a0251e    deeper still, still red
 *      down     #741813    a warm maroon, never a grey
 *
 * and on the glaze they land on caramel and deep brown, so ONE table dresses
 * the whole family and the states stay members of one drawing.
 */
export const FOOD_TONE_RIM: readonly [number, number, number] = [1, 1, 1];
/**
 * The rim goes UP, and it cannot be a multiplier for the same reason the
 * snake's cannot: the base is already the top band and there is nothing above
 * 1.0 to multiply toward. A warm lift on the object's own hue rather than a
 * wash toward white, so a chamfer catches light without turning to plastic.
 */
export const FOOD_TONE_RIM_LIFT: readonly [number, number, number] = [
  0.15, 0.11, 0.05,
];
export const FOOD_TONE_TOP: readonly [number, number, number] = [1, 1, 1];
export const FOOD_TONE_SIDE: readonly [number, number, number] = [
  0.62, 0.34, 0.3,
];
export const FOOD_TONE_AWAY: readonly [number, number, number] = [
  0.38, 0.18, 0.16,
];
export const FOOD_TONE_DOWN: readonly [number, number, number] = [
  0.18, 0.07, 0.06,
];

/**
 * How far a face falls from its top edge to its bottom one.
 *
 * Below the snake's 0.16 because a food is a smaller object drawn over fewer
 * pixels: the same fall over less height is a steeper visible ramp. It has the
 * same hard constraint - it must stay well inside the gap to the next band
 * down, or a lit face bottoms out looking like a shaded one.
 */
const FOOD_TONE_FALL = 0.14;

export const FOOD_TONES: SnakeFaceToneSet = {
  rim: { mul: FOOD_TONE_RIM, add: FOOD_TONE_RIM_LIFT },
  top: { mul: FOOD_TONE_TOP },
  side: { mul: FOOD_TONE_SIDE },
  away: { mul: FOOD_TONE_AWAY },
  down: { mul: FOOD_TONE_DOWN },
  fall: FOOD_TONE_FALL,
};

/**
 * The same bands with the fall switched off, for parts that are not a unit
 * tall in object space.
 *
 * The fall is keyed to raw object-space `position.y` on the assumption of a
 * -0.5..0.5 body. A torus laid flat spans about a tenth of that, so the fall
 * would not draw a gradient on it at all - it would apply one near-constant
 * darkening to the whole ring and quietly move the glaze off its authored
 * colour. A band that cannot be seen is not worth a uniform tax on the hue.
 */
export const FOOD_TONES_FLAT_FALL: SnakeFaceToneSet = {
  ...FOOD_TONES,
  fall: 0,
};

// -----------------------------------------------------------------------------
// The outline
// -----------------------------------------------------------------------------

/**
 * THE FOOD WEARS THE SNAKE'S LINE. 0.095 in world cells, the shipped 90s
 * character's weight, against the incumbent food's 0.058.
 *
 * Authored here as its own constant rather than read off `SNAKE_STYLE_PROFILE`
 * on purpose: that profile is switchable by query parameter, and the food's
 * outline is not a thing that should flip because somebody is A/B-ing the
 * snake. The number is the same number, and the test pins it to the snake's so
 * the two cannot drift apart unnoticed.
 *
 * Because the hull shader divides its offset by world scale, this is a
 * CONSTANT SCREEN WEIGHT: the apple, the donut and a snake body cube all carry
 * the identical line, which is the property that makes them look drawn by one
 * hand rather than merely coloured alike.
 */
export const FOOD_INK_HULL_WIDTH = 0.095;

/**
 * The line for the small parts.
 *
 * Not a style exception - a physical one. The hull pushes every vertex out by
 * a world-space constant, so on a leaf a tenth of a cell thick the full weight
 * would meet itself in the middle and swallow the part whole. The snake solves
 * the same problem the same way, and its smallest marks (pupils, glints) carry
 * no hull at all because they ARE the ink.
 */
export const FOOD_CHIP_INK_HULL_WIDTH = 0.03;

export function createFoodInkHullMaterial(
  width: number = FOOD_INK_HULL_WIDTH
): THREE.MeshBasicMaterial {
  const material = createInkHullMaterial(width);
  material.color.set(FOOD_PALETTE.ink);
  return material;
}

// -----------------------------------------------------------------------------
// Materials
// -----------------------------------------------------------------------------

/**
 * A GENTLE emissive, and the reason it is gentle rather than absent.
 *
 * The bloom contract allows food to bloom, and at the full look a kiss of
 * glow is part of how a new objective announces itself. But the read may not
 * DEPEND on it: the floor tier runs with the composer off, and the
 * luminance-neutral law means tiers spend detail and softness, never
 * brightness. So the emissive is set where bloom can still find the top band
 * and where the authored bands survive intact underneath - about a sixth of
 * the incumbent's 1.6, which was large enough to erase them.
 */
export const FOOD_EMISSIVE_INTENSITY = 0.26;

const celMaterialCache = new Map<string, THREE.MeshToonMaterial>();

/**
 * The family's surface: a stock toon material turned into the guide's
 * face-keyed cel material.
 *
 * No gradient map is passed, and that is not an omission. `applyFaceKeyedShading`
 * zeroes both reflected-light accumulators and writes the band itself, so the
 * 3-texel ramp would never be sampled; handing one over would only imply the
 * board's lights still reach this surface. They do not - after the patch the
 * food's colour is a function of its own world normals and nothing else, which
 * is what makes it immune to the board theme standing behind it.
 */
export function getFoodCelMaterial(
  color: string,
  tones: SnakeFaceToneSet = FOOD_TONES
): THREE.MeshToonMaterial {
  const key = `${color}:${tones.fall}`;
  let material = celMaterialCache.get(key);
  if (!material) {
    material = new THREE.MeshToonMaterial({
      color,
      emissive: color,
      emissiveIntensity: FOOD_EMISSIVE_INTENSITY,
    });
    applyFaceKeyedShading(material, { tones, cacheKey: `food:${key}` });
    celMaterialCache.set(key, material);
  }
  return material;
}

/** An unlit drawn mark: the stem, the glint, the sprinkles. */
const flatMaterialCache = new Map<string, THREE.MeshBasicMaterial>();

export function getFoodFlatMaterial(color: string): THREE.MeshBasicMaterial {
  let material = flatMaterialCache.get(color);
  if (!material) {
    material = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    flatMaterialCache.set(color, material);
  }
  return material;
}

// -----------------------------------------------------------------------------
// THE STATES, and how they are told apart
// -----------------------------------------------------------------------------

/**
 * Which drawn family a state belongs to. This is the channel that survives
 * longest as the board gets smaller, because at the bottom the ink contour is
 * ALL that is left.
 */
export type FoodSilhouette = 'squat-block' | 'annulus' | 'tapered-point';

/** The colour family a state is drawn in. Never a brightness of another one. */
export type FoodHueFamily = 'scarlet' | 'amber' | 'umbra';

/** How a state moves. Legible in peripheral vision before colour is. */
export type FoodMotion = 'hover-turn' | 'axis-spin' | 'unstable-wobble';

export interface FoodStateSignature {
  readonly silhouette: FoodSilhouette;
  readonly hue: FoodHueFamily;
  readonly motion: FoodMotion;
  /** Share of a cell the state claims. Held under 1 so food never crowds a turn. */
  readonly footprint: number;
}

/**
 * THE DISTINCTNESS TABLE.
 *
 * The law it exists to enforce: NO TWO STATES MAY BE SEPARATED BY BRIGHTNESS
 * ALONE. Brightness is the one channel that is not survivable - it is the
 * first thing a cheaper tier spends, the first thing a bright board theme eats
 * into, and the thing bloom counterfeits at the full look and cannot at the
 * floor. So every pair here differs in at least two of SILHOUETTE, HUE and
 * MOTION, and the accompanying test asserts it rather than trusting it.
 *
 *      state     silhouette      hue       motion            footprint
 *      apple     squat block     scarlet   hover + slow turn 0.66
 *      donut     ANNULUS         amber     spin on up axis   0.78
 *      berry     tapered point   umbra     unstable wobble   0.62
 *
 * THE HOLE IS THE STRONGEST SIGNAL ON THE BOARD and it is inherited, not
 * invented: the incumbent's gold ring earned it by being the only annulus
 * anywhere in the scene. What changed is that a ring is not a food. A glazed
 * donut is the same hole, drawn as something a cartoon would actually eat -
 * the readability property and the brief, at no cost to either.
 */
export const FOOD_STATE_SIGNATURES: Record<
  'apple' | 'donut' | 'berry',
  FoodStateSignature
> = {
  apple: {
    silhouette: 'squat-block',
    hue: 'scarlet',
    motion: 'hover-turn',
    footprint: 0.66,
  },
  donut: {
    silhouette: 'annulus',
    hue: 'amber',
    motion: 'axis-spin',
    footprint: 0.78,
  },
  berry: {
    silhouette: 'tapered-point',
    hue: 'umbra',
    motion: 'unstable-wobble',
    footprint: 0.62,
  },
};

/**
 * How many of the survivable channels separate two states. The test asserts
 * this is at least 2 for every pair; the helper is exported so the rule is
 * stated once and checked, rather than described in a comment and hoped for.
 */
export function countDistinctChannels(
  a: FoodStateSignature,
  b: FoodStateSignature
): number {
  let count = 0;
  if (a.silhouette !== b.silhouette) count += 1;
  if (a.hue !== b.hue) count += 1;
  if (a.motion !== b.motion) count += 1;
  return count;
}

/** Relative luminance of a tone band, for the ordering test. */
export function toneLuminance(tone: FaceTone): number {
  const [r, g, b] = tone.mul;
  const [ar, ag, ab] = tone.add ?? [0, 0, 0];
  return 0.2126 * (r + ar) + 0.7152 * (g + ag) + 0.0722 * (b + ab);
}

// -----------------------------------------------------------------------------
// Geometry - module scope, never disposed
// -----------------------------------------------------------------------------

/**
 * The chamfer. Matched to the snake's own bevel rather than to the terrain's
 * heavier one: the food is a character-side object, not architecture.
 *
 * One rounding segment, like everything else in this world - a single wide 45
 * degree facet takes a different cel band from the face beside it, so the
 * chamfer draws its own hard highlight line instead of blurring one.
 */
export const FOOD_BEVEL_RADIUS = 0.13;

export const appleBodyGeometry = createTaperedFoodGeometry(
  FOOD_BEVEL_RADIUS,
  APPLE_TAPER
);

export const berryBodyGeometry = createTaperedFoodGeometry(
  FOOD_BEVEL_RADIUS,
  BERRY_TAPER
);

/** Leaf, stem, glint, sprinkles. Small flat parts, so they round less. */
export const chipGeometry = createExactUnitRoundedBoxGeometry(0.17);

/**
 * THE DONUT.
 *
 * Four radial segments, so the tube's cross-section is a SQUARE and each of
 * its four faces takes one authored band - the chunky, hard-faceted ring a
 * cartoon draws, and the reason a torus can join a family of cubes at all. The
 * tube is deliberately fat and the hole deliberately wide: the hole is the
 * shape, and a hole that closes up at phone scale is not one.
 */
export const DONUT_RING_RADIUS = 0.28;
export const DONUT_TUBE_RADIUS = 0.11;
/** Outer diameter, which IS the donut's declared footprint. */
export const DONUT_FOOTPRINT = (DONUT_RING_RADIUS + DONUT_TUBE_RADIUS) * 2;
export const donutGeometry = new THREE.TorusGeometry(
  DONUT_RING_RADIUS,
  DONUT_TUBE_RADIUS,
  4,
  14
);
donutGeometry.rotateX(Math.PI / 2);

/** Where the sprinkles sit on the ring, as [angle, tilt] pairs. */
export const DONUT_SPRINKLES: readonly (readonly [number, number])[] = [
  [0.5, 0.4],
  [2.3, -0.7],
  [4.1, 0.9],
  [5.4, -0.3],
];
