'use client';

/**
 * ANCHORING THE PICKER TO ITS SLOT.
 *
 * Slot-first means the picker belongs to the slot the player touched, so it is
 * a CHILD of that slot's cell and is centred on it by CSS alone. Everything
 * this hook adds is the correction that keeps that promise on a phone, and the
 * arithmetic for it lives in `slotAnchorGeometry` where it can be tested
 * without a laid-out browser.
 *
 * It never re-parents the panel and never falls back to a full-screen sheet.
 * A sheet would answer the geometry problem by abandoning the ruling — the
 * bench is supposed to stay one continuous place, and a panel that leaves its
 * slot to become a takeover has stopped saying which slot it is filling.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  IDLE_SLOT_ANCHOR,
  resolveSlotAnchor,
  type SlotAnchor,
} from './slotAnchorGeometry';

export type { SlotAnchor } from './slotAnchorGeometry';

export function useSlotAnchor(openKey: string | null) {
  const anchorRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dxRef = useRef(0);
  const dyRef = useRef(0);
  const [anchor, setAnchor] = useState<SlotAnchor>(IDLE_SLOT_ANCHOR);

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

    const next = resolveSlotAnchor({
      slot: slotBox,
      panel: panel.getBoundingClientRect(),
      viewportWidth,
      viewportHeight,
      appliedDx: dxRef.current,
      appliedDy: dyRef.current,
    });

    setAnchor((current) =>
      current.dx === next.dx
      && current.dy === next.dy
      && current.flip === next.flip
      && current.maxHeight === next.maxHeight
        ? current
        : next
    );
  }, []);

  // The refs mirror what the browser actually painted, after every commit, so
  // the next pass can subtract it and measure the uncorrected box.
  useLayoutEffect(() => {
    dxRef.current = anchor.dx;
    dyRef.current = anchor.dy;
  });

  useLayoutEffect(() => {
    if (openKey === null) {
      dxRef.current = 0;
      dyRef.current = 0;
      setAnchor((current) => (current === IDLE_SLOT_ANCHOR ? current : IDLE_SLOT_ANCHOR));
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
