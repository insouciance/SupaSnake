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
  resolveSlotAnchor,
} from './slotAnchorGeometry';

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
});
