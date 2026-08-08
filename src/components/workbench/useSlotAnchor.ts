'use client';

/**
 * ANCHORING THE PICKER TO ITS SLOT.
 *
 * Slot-first means the picker belongs to the slot the player touched, so it is
 * a CHILD of that slot's cell and is centred on it by CSS alone. Everything
 * this hook adds is the correction that keeps that promise on a phone: the
 * panel is nudged horizontally until both its edges are inside the viewport,
 * flipped above the slot when there is more room there, and pulled vertically
 * until its own bottom edge is inside too.
 *
 * It never re-parents the panel and never falls back to a full-screen sheet.
 * A sheet would answer the geometry problem by abandoning the ruling — the
 * bench is supposed to stay one continuous place, and a panel that leaves its
 * slot to become a takeover has stopped saying which slot it is filling.
 *
 * The two mirror refs (`dxRef` / `dyRef`) hold the correction that is CURRENTLY
 * painted, so every pass measures the panel as if uncorrected and produces the
 * same answer from the same layout. Without them a second pass would subtract
 * its own first correction and walk the panel off the screen one resize at a
 * time.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

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

const GUTTER = 12;
/** The gap between the slot's edge and the panel, matching the CSS offset. */
const OFFSET = 10;
/** Below this a panel cannot show one option and its action, so it scrolls. */
const MIN_HEIGHT = 176;
/** A research panel that grows past this stops being readable in one look. */
const MAX_HEIGHT = 440;

const IDLE: SlotAnchor = { dx: 0, dy: 0, flip: 'down', maxHeight: MAX_HEIGHT };

export function useSlotAnchor(openKey: string | null) {
  const anchorRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dxRef = useRef(0);
  const dyRef = useRef(0);
  const [anchor, setAnchor] = useState<SlotAnchor>(IDLE);

  const measure = useCallback(() => {
    const panel = panelRef.current;
    const slot = anchorRef.current;
    if (!panel || !slot) return;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    // jsdom, and any frame before first layout, report a zero-sized world.
    // Correcting against it would clamp the panel into the top-left corner,
    // so the CSS default (centred, hanging below) is left to stand.
    if (viewportWidth <= 0 || viewportHeight <= 0) return;

    const slotBox = slot.getBoundingClientRect();
    if (slotBox.width === 0 && slotBox.height === 0) return;

    const roomBelow = viewportHeight - GUTTER - (slotBox.bottom + OFFSET);
    const roomAbove = slotBox.top - OFFSET - GUTTER;
    const flip: SlotAnchor['flip'] = roomBelow >= roomAbove ? 'down' : 'up';
    const room = flip === 'down' ? roomBelow : roomAbove;
    const maxHeight = Math.round(
      Math.min(
        MAX_HEIGHT,
        Math.max(MIN_HEIGHT, Math.min(room, viewportHeight - GUTTER * 2))
      )
    );

    const panelBox = panel.getBoundingClientRect();
    const left = panelBox.left - dxRef.current;
    const right = panelBox.right - dxRef.current;
    let dx = 0;
    if (right - left > viewportWidth - GUTTER * 2) {
      // Wider than the room it has: pin the leading edge rather than centring
      // the overflow, which would hide BOTH edges instead of one.
      dx = GUTTER - left;
    } else if (left < GUTTER) {
      dx = GUTTER - left;
    } else if (right > viewportWidth - GUTTER) {
      dx = viewportWidth - GUTTER - right;
    }

    const top = panelBox.top - dyRef.current;
    const bottom = panelBox.bottom - dyRef.current;
    let dy = 0;
    if (bottom > viewportHeight - GUTTER) {
      dy = viewportHeight - GUTTER - bottom;
    }
    if (top + dy < GUTTER) {
      dy = GUTTER - top;
    }

    setAnchor((current) =>
      current.dx === dx
      && current.dy === dy
      && current.flip === flip
      && current.maxHeight === maxHeight
        ? current
        : { dx, dy, flip, maxHeight }
    );
  }, []);

  // The refs mirror what the browser actually painted, after every commit.
  useLayoutEffect(() => {
    dxRef.current = anchor.dx;
    dyRef.current = anchor.dy;
  });

  useLayoutEffect(() => {
    if (openKey === null) {
      dxRef.current = 0;
      dyRef.current = 0;
      setAnchor((current) => (current === IDLE ? current : IDLE));
      return;
    }
    measure();
    // The first pass sets `maxHeight`, which can change the panel's height;
    // the second reads the height that answer produced. Both passes are
    // idempotent, so a third would return the same numbers.
    const frame = window.requestAnimationFrame(measure);
    return () => window.cancelAnimationFrame(frame);
  }, [measure, openKey]);

  useEffect(() => {
    if (openKey === null) return;
    const onLayoutChange = () => measure();
    window.addEventListener('resize', onLayoutChange);
    window.addEventListener('orientationchange', onLayoutChange);
    window.addEventListener('scroll', onLayoutChange, true);
    return () => {
      window.removeEventListener('resize', onLayoutChange);
      window.removeEventListener('orientationchange', onLayoutChange);
      window.removeEventListener('scroll', onLayoutChange, true);
    };
  }, [measure, openKey]);

  return { anchorRef, panelRef, anchor };
}
