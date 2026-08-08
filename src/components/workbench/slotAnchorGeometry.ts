/**
 * THE PICKER'S GEOMETRY, WITHOUT REACT OR A DOM.
 *
 * Split out of `useSlotAnchor` for one reason: this is the part that can be
 * wrong, and a hook that only runs inside a laid-out browser cannot be tested
 * for it. jsdom reports every box as zero, so a test written against the hook
 * would assert that nothing moves — which is exactly the failure it is
 * supposed to catch. Here the boxes are arguments, so a phone in landscape is
 * four numbers rather than a device.
 *
 * The contract, in order:
 *
 *   1 FLIP    hang under the slot, unless there is more room above it
 *   2 HEIGHT  never taller than its side's room, nor than the viewport
 *   3 CLAMP X nudge until both vertical edges are inside; a panel wider than
 *             the room pins its leading edge instead of centring the overflow
 *   4 CLAMP Y pull until the bottom edge is inside, then until the top is
 *
 * Steps 3 and 4 take the CURRENTLY APPLIED correction and subtract it, so the
 * answer is computed from the uncorrected box every time. Without that a
 * second pass would correct its own first correction and walk the panel off
 * the screen one resize at a time.
 */

export interface AnchorBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface SlotAnchor {
  /** Horizontal correction in px, applied after the centring transform. */
  dx: number;
  /** Vertical correction in px, applied after the flip. */
  dy: number;
  /** Which side of the slot the panel hangs from. */
  flip: 'down' | 'up';
  /** Room the panel may fill before its option list scrolls inside itself. */
  maxHeight: number;
}

/** The breathing room kept between the panel and every viewport edge. */
export const ANCHOR_GUTTER = 12;
/** The gap between the slot's edge and the panel. Matches the CSS offset. */
export const ANCHOR_OFFSET = 10;
/** Below this a panel cannot show one option and its action, so it scrolls. */
export const ANCHOR_MIN_HEIGHT = 176;
/** A research panel that grows past this stops being readable in one look. */
export const ANCHOR_MAX_HEIGHT = 440;

export const IDLE_SLOT_ANCHOR: SlotAnchor = {
  dx: 0,
  dy: 0,
  flip: 'down',
  maxHeight: ANCHOR_MAX_HEIGHT,
};

export function resolveSlotAnchor(input: {
  slot: AnchorBox;
  panel: AnchorBox;
  viewportWidth: number;
  viewportHeight: number;
  /** The correction the panel box already carries. */
  appliedDx: number;
  appliedDy: number;
}): SlotAnchor {
  const { slot, panel, viewportWidth, viewportHeight, appliedDx, appliedDy } = input;

  const roomBelow = viewportHeight - ANCHOR_GUTTER - (slot.bottom + ANCHOR_OFFSET);
  const roomAbove = slot.top - ANCHOR_OFFSET - ANCHOR_GUTTER;
  const flip: SlotAnchor['flip'] = roomBelow >= roomAbove ? 'down' : 'up';
  const room = flip === 'down' ? roomBelow : roomAbove;
  const maxHeight = Math.round(
    Math.min(
      ANCHOR_MAX_HEIGHT,
      Math.max(
        ANCHOR_MIN_HEIGHT,
        Math.min(room, viewportHeight - ANCHOR_GUTTER * 2)
      )
    )
  );

  const left = panel.left - appliedDx;
  const right = panel.right - appliedDx;
  let dx = 0;
  if (right - left > viewportWidth - ANCHOR_GUTTER * 2) {
    dx = ANCHOR_GUTTER - left;
  } else if (left < ANCHOR_GUTTER) {
    dx = ANCHOR_GUTTER - left;
  } else if (right > viewportWidth - ANCHOR_GUTTER) {
    dx = viewportWidth - ANCHOR_GUTTER - right;
  }

  const top = panel.top - appliedDy;
  const bottom = panel.bottom - appliedDy;
  let dy = 0;
  if (bottom > viewportHeight - ANCHOR_GUTTER) {
    dy = viewportHeight - ANCHOR_GUTTER - bottom;
  }
  if (top + dy < ANCHOR_GUTTER) {
    dy = ANCHOR_GUTTER - top;
  }

  return { dx: Math.round(dx), dy: Math.round(dy), flip, maxHeight };
}

/**
 * A row of the option list, measured from the top of the list's content box.
 * `top` is scroll-independent: it is where the row sits in the list, not where
 * it happens to be on screen.
 */
export interface OptionRow {
  top: number;
  height: number;
}

/**
 * THE WHOLE-ROW RULE.
 *
 * The option list is a scroll box whose height used to be "whatever the panel
 * had left" — 282px of remainder against rows 92 to 144px tall, so the box
 * ended in the MIDDLE of an option and the player's first sight of the
 * catalog was a sliced card. Nothing about the remainder knew what a row was.
 *
 * This is the arithmetic that makes the box end where a row ends. Given the
 * rows and the height the layout allocated, it answers with the height that
 * shows as many WHOLE rows as fit and no part of the next one.
 *
 *   fits entirely   the content height, so the panel shrinks to its list
 *   fits partly     the bottom edge of the last row that fits completely
 *   fits nothing    the first row's height — one whole option is the floor,
 *                   because a panel showing a fraction of one option is the
 *                   defect this exists to remove. `ANCHOR_MIN_HEIGHT` is set
 *                   so this branch does not arise on a real viewport.
 */
export function fitWholeRows(input: {
  rows: readonly OptionRow[];
  available: number;
}): number {
  const { rows, available } = input;
  if (rows.length === 0) return available;

  const content = rows[rows.length - 1].top + rows[rows.length - 1].height;
  if (content <= available) return content;

  let fitted = 0;
  for (const row of rows) {
    const bottom = row.top + row.height;
    if (bottom > available) break;
    fitted = bottom;
  }
  return fitted > 0 ? fitted : rows[0].height;
}
