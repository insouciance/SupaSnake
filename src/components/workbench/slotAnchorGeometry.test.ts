/**
 * THE PICKER MAY NOT LEAVE THE SCREEN.
 *
 * Slot-first puts a panel at a cell that can be anywhere in a six-wide row, on
 * a viewport that can be 390px tall in landscape. The CSS centres it under the
 * slot and stops there; every case below is one the centred default gets wrong
 * and this arithmetic has to fix. They are written as boxes rather than as
 * devices because jsdom lays nothing out — a test driven through the hook
 * would measure zeros and assert, truthfully and uselessly, that nothing moved.
 */

import {
  ANCHOR_GUTTER,
  ANCHOR_MAX_HEIGHT,
  ANCHOR_MIN_HEIGHT,
  fitWholeRows,
  resolveSlotAnchor,
} from './slotAnchorGeometry';

/** Rows as the browser reports them: `top` from the list's content box. */
function rowsOf(heights: readonly number[], gap = 6) {
  let top = 0;
  return heights.map((height) => {
    const row = { top, height };
    top += height + gap;
    return row;
  });
}

/** A roomy desktop: the panel hangs below slot 3 and needs no help. */
const DESKTOP = {
  viewportWidth: 1280,
  viewportHeight: 900,
  slot: { top: 300, bottom: 432, left: 600, right: 720 },
  panel: { top: 442, bottom: 800, left: 487, right: 833 },
  appliedDx: 0,
  appliedDy: 0,
};

describe('the picker stays at its slot and inside the viewport', () => {
  it('leaves a centred panel with room alone', () => {
    const anchor = resolveSlotAnchor(DESKTOP);
    expect(anchor).toEqual({
      dx: 0,
      dy: 0,
      flip: 'down',
      maxHeight: ANCHOR_MAX_HEIGHT,
    });
  });

  it('pushes the panel right when the leftmost slot would hang it off the edge', () => {
    // Slot 1 of six on a 390px phone: centring a 346px panel on a 55px-wide
    // cell puts its left edge at -137.
    const anchor = resolveSlotAnchor({
      ...DESKTOP,
      viewportWidth: 390,
      viewportHeight: 844,
      slot: { top: 300, bottom: 418, left: 16, right: 71 },
      panel: { top: 428, bottom: 780, left: -129, right: 217 },
    });
    expect(anchor.dx).toBe(ANCHOR_GUTTER + 129);
    expect(-129 + anchor.dx).toBe(ANCHOR_GUTTER);
    expect(anchor.flip).toBe('down');
  });

  it('pulls the panel left when the rightmost slot would hang it off the edge', () => {
    const anchor = resolveSlotAnchor({
      ...DESKTOP,
      viewportWidth: 390,
      viewportHeight: 844,
      slot: { top: 300, bottom: 418, left: 319, right: 374 },
      panel: { top: 428, bottom: 780, left: 173, right: 519 },
    });
    expect(519 + anchor.dx).toBe(390 - ANCHOR_GUTTER);
    expect(anchor.dx).toBeLessThan(0);
  });

  it('pins the leading edge when the panel is wider than the room it has', () => {
    // A panel wider than the viewport cannot be centred without hiding BOTH
    // edges. One visible edge beats two hidden ones.
    const anchor = resolveSlotAnchor({
      ...DESKTOP,
      viewportWidth: 320,
      viewportHeight: 844,
      slot: { top: 300, bottom: 418, left: 130, right: 190 },
      panel: { top: 428, bottom: 780, left: -13, right: 333 },
    });
    expect(-13 + anchor.dx).toBe(ANCHOR_GUTTER);
  });

  it('flips above the slot when the room below has run out', () => {
    // 844x390 landscape, a slot low on the bench: 60px below, 250px above.
    const anchor = resolveSlotAnchor({
      ...DESKTOP,
      viewportWidth: 844,
      viewportHeight: 390,
      slot: { top: 250, bottom: 318, left: 400, right: 480 },
      panel: { top: 328, bottom: 680, left: 267, right: 613 },
    });
    expect(anchor.flip).toBe('up');
    expect(anchor.maxHeight).toBe(228);
  });

  it('never proposes a panel taller than the viewport itself', () => {
    const anchor = resolveSlotAnchor({
      ...DESKTOP,
      viewportWidth: 844,
      viewportHeight: 390,
      slot: { top: 12, bottom: 116, left: 400, right: 480 },
      panel: { top: 126, bottom: 478, left: 267, right: 613 },
    });
    expect(anchor.maxHeight).toBeLessThanOrEqual(390 - ANCHOR_GUTTER * 2);
    expect(anchor.maxHeight).toBeGreaterThanOrEqual(ANCHOR_MIN_HEIGHT);
  });

  it('pulls a panel whose bottom overhangs back inside', () => {
    const anchor = resolveSlotAnchor({
      ...DESKTOP,
      viewportHeight: 700,
      panel: { top: 442, bottom: 800, left: 487, right: 833 },
    });
    expect(800 + anchor.dy).toBe(700 - ANCHOR_GUTTER);
    expect(anchor.dy).toBeLessThan(0);
  });

  it('prefers the top edge when the panel cannot fit either way', () => {
    // Both clamps fire; the second wins, because a panel whose HEAD is off
    // screen has lost its title, its slot number and its dismiss.
    const anchor = resolveSlotAnchor({
      ...DESKTOP,
      viewportHeight: 300,
      slot: { top: 40, bottom: 150, left: 600, right: 720 },
      panel: { top: 160, bottom: 600, left: 487, right: 833 },
    });
    expect(160 + anchor.dy).toBe(ANCHOR_GUTTER);
  });

  it('measures from the uncorrected box, so a second pass is a no-op', () => {
    const first = resolveSlotAnchor({
      ...DESKTOP,
      viewportWidth: 390,
      viewportHeight: 844,
      slot: { top: 300, bottom: 418, left: 16, right: 71 },
      panel: { top: 428, bottom: 780, left: -129, right: 217 },
    });
    const second = resolveSlotAnchor({
      ...DESKTOP,
      viewportWidth: 390,
      viewportHeight: 844,
      slot: { top: 300, bottom: 418, left: 16, right: 71 },
      // The box the browser now reports: the first correction is painted.
      panel: {
        top: 428,
        bottom: 780,
        left: -129 + first.dx,
        right: 217 + first.dx,
      },
      appliedDx: first.dx,
      appliedDy: first.dy,
    });
    expect(second).toEqual(first);
  });

  it('never proposes a panel too short to hold one whole option', () => {
    // The landscape case that produced the defect: 72px of list for a 92px
    // row. Whatever the room, the answer clears one option plus the panel's
    // own furniture.
    const anchor = resolveSlotAnchor({
      ...DESKTOP,
      viewportWidth: 844,
      viewportHeight: 390,
      slot: { top: 108, bottom: 192, left: 300, right: 546 },
      panel: { top: 202, bottom: 378, left: 112, right: 732 },
    });
    expect(anchor.maxHeight).toBeGreaterThanOrEqual(ANCHOR_MIN_HEIGHT);
    expect(ANCHOR_MIN_HEIGHT).toBeGreaterThanOrEqual(134 + 92);
  });
});

/**
 * THE LIST ENDS WHERE A ROW ENDS.
 *
 * The defect these pin: the option list was given the panel's leftover height
 * — 282px against rows 92 to 144px tall — so it ended in the middle of a card
 * and the player's first sight of the catalog was a sliced option. The
 * remainder knew nothing about rows; this is the arithmetic that teaches it.
 */
describe('the option list shows whole rows', () => {
  it('shrinks to the content when the whole list already fits', () => {
    // Three 92px rows and two 6px gaps is 288; the panel offered 400. Taking
    // only what is needed is what makes the panel compact rather than tall.
    expect(fitWholeRows({ rows: rowsOf([92, 92, 92]), available: 400 })).toBe(288);
  });

  it('stops at the last row that fits completely', () => {
    // 144 + 6 + 92 = 242 fits; the next row would end at 340.
    const rows = rowsOf([144, 92, 92, 92]);
    expect(fitWholeRows({ rows, available: 282 })).toBe(242);
  });

  it('never ends inside a row, whatever the remainder is', () => {
    const rows = rowsOf([144, 92, 118, 92, 92]);
    const bottoms = rows.map((row) => row.top + row.height);
    for (let available = 1; available <= 600; available += 1) {
      const fitted = fitWholeRows({ rows, available });
      const insideARow = rows.some(
        (row) => fitted > row.top && fitted < row.top + row.height
      );
      expect(insideARow).toBe(false);
      expect(bottoms).toContain(fitted);
    }
  });

  it('shows one whole option rather than part of one when nothing fits', () => {
    // The floor. `ANCHOR_MIN_HEIGHT` is set so a real viewport never reaches
    // it, but a function that answered "0" here would hide the catalog.
    expect(fitWholeRows({ rows: rowsOf([144, 92]), available: 40 })).toBe(144);
  });

  it('leaves an empty list alone', () => {
    expect(fitWholeRows({ rows: [], available: 282 })).toBe(282);
  });

  it('is idempotent: fitting an already-fitted list changes nothing', () => {
    const rows = rowsOf([144, 92, 92, 92]);
    const once = fitWholeRows({ rows, available: 282 });
    expect(fitWholeRows({ rows, available: once })).toBe(once);
  });
});
