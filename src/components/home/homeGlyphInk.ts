/**
 * WHAT WEIGHT A MARK ON HOME IS DRAWN AT.
 *
 * Owner ruling, 2026-08-08:
 *
 *   "the workbench cube is cool, just the symbols (for the genes) need to be
 *    bolder, those thin lines dont fit the concept."
 *
 * The concept is a character drawn with a chosen line: the creature's ink hull
 * is ~6px on a 62px cube, and `globals.css` states the ladder every other
 * outline on the product answers to —
 *
 *     --ink-w-1  1.5px   chips, tags, inline controls, small meters
 *     --ink-w-2  2.5px   buttons, cards, list rows, HUD instruments
 *     --ink-w-3  3.5px   modals, panels, trays
 *
 * The glyph sets predate that ladder and are denominated in a 24-unit viewBox,
 * which is not a weight until you know the size it renders at. Measured at the
 * sizes Home actually draws them, every mark on this screen was UNDER the
 * ladder's bottom rung:
 *
 *     rail icons      24px x 2.0/24  = 2.00px    (a button, wanted 2.5)
 *     settings gear   18px x 2.0/24  = 1.50px    (on the rung, at the floor)
 *     clan shield     15px x 2.0/24  = 1.25px    (under it)
 *     gene runes      14px x 2.2/24  = 1.28px    (under it — the ones named)
 *
 * So the numbers below are not "bolder". They are the ladder, converted: a
 * weight in viewBox units is `target_px * 24 / rendered_px`, and each constant
 * names the rung it is converting and the size it converts at. Ruling T-10 —
 * an ink weight is CHOSEN PER OBJECT — is what makes that conversion the
 * caller's job rather than the icon set's.
 */

/** The ladder, in the pixels it is authored in. Mirrors `globals.css`. */
export const INK_W_1 = 1.5;
export const INK_W_2 = 2.5;

/** `strokeWidth` on a 24-unit viewBox that renders `px` wide at `target` px. */
const inkAt = (target: number, px: number) => Math.round((target * 24) / px * 100) / 100;

/**
 * The four rail cubes. They are BUTTONS — the ladder's own word for rung 2 —
 * and their glyph is given the full face at 24px, so it takes rung 2 outright.
 */
export const RAIL_GLYPH_INK = inkAt(INK_W_2, 24); // 2.5

/**
 * The header's two small cubes: settings (44px cube, ~18.6px of face) and clan
 * (36px cube, ~15.2px of face). The ladder calls these "inline controls", rung
 * 1 — but rung 1 is a FLOOR here rather than a target, because a 1.5px line on a
 * 15px mark is the same optical hairline the ruling is about. They are drawn
 * midway to rung 2, which is as far as a gear's teeth and a shield's point will
 * go at that size before they close into a blob.
 */
export const HEADER_GLYPH_INK_18 = inkAt((INK_W_1 + INK_W_2) / 2, 18); // 2.67
export const HEADER_GLYPH_INK_15 = inkAt((INK_W_1 + INK_W_2) / 2, 15); // 3.2

/**
 * THE GENE RUNES — the marks the ruling names.
 *
 * They ring the workbench cube and repeat once in the identity line, at 16px.
 * Rung 2 at 16px would be a 3.75 stroke, which closes FLUX's ellipse and welds
 * AURUM's stem to its lower edge — the rack rung exists precisely because this
 * alphabet's job is to stay DISTINCT from itself, and the catalog test asserts
 * it. So they are drawn at 2.0px: 56% heavier than the 1.28px they had, clear
 * of the ladder's bottom rung, and still open enough that five of them are five
 * different marks at a glance.
 */
export const HOME_RUNE_PX = 16;
export const HOME_RUNE_INK = inkAt(2, HOME_RUNE_PX); // 3.0
