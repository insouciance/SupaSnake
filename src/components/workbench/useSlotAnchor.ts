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
  fitWholeRows,
  resolveSlotAnchor,
  type SlotAnchor,
} from './slotAnchorGeometry';

export type { SlotAnchor } from './slotAnchorGeometry';

/**
 * A SCROLL BOX ENDS WHERE A ROW ENDS.
 *
 * Every scroll box in the panel obeys it, not just the option list: the read
 * of a chosen Power scrolls too, and it was ending mid-Combo-button for
 * exactly the same reason. A box declares itself with `data-fit-scroll`, and
 * names its rows with `data-fit-row` when its own children are groups rather
 * than rows — the option list needs no tags, because there its children ARE
 * the rows.
 *
 * The height is written straight onto the element rather than through React
 * state. It is a consequence of layout, and feeding it back through a render
 * would mean measuring the box the last measurement produced — the loop the
 * anchor below already has to defend against with `appliedDx`/`appliedDy`.
 * Here the answer is idempotent instead: release the pin, read what the flex
 * layout allocates, pin the whole-row height inside it.
 */
function fitScrollBox(box: HTMLElement): void {
  box.style.maxHeight = '';
  const available = box.clientHeight;
  if (available <= 0) return;

  const marked = box.querySelectorAll<HTMLElement>('[data-fit-row]');
  const children: Element[] = marked.length > 0
    ? Array.from(marked)
    : Array.from(box.children);

  const boxTop = box.getBoundingClientRect().top;
  const scrolled = box.scrollTop;
  const rows = children.map((child) => {
    const rect = child.getBoundingClientRect();
    return { top: rect.top - boxTop + scrolled, height: rect.height };
  });
  if (rows.length === 0) return;

  box.style.maxHeight = `${fitWholeRows({ rows, available })}px`;
}

function fitPanelScrollBoxes(panel: HTMLElement | null): void {
  if (!panel) return;
  panel
    .querySelectorAll<HTMLElement>('[data-fit-scroll]')
    .forEach(fitScrollBox);
}

export function useSlotAnchor(openKey: string | null, fitKey?: string) {
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
    // idempotent, so a third would return the same numbers. The list is fitted
    // last, because how many whole rows fit depends on the panel height the
    // two passes above settled on.
    const frame = window.requestAnimationFrame(() => {
      measure();
      fitPanelScrollBoxes(panelRef.current);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [measure, openKey]);

  // Choosing a Power hands part of the panel to the read of it, so the list
  // is allocated less room and has to be re-fitted against the new remainder.
  useLayoutEffect(() => {
    if (openKey === null) return;
    const frame = window.requestAnimationFrame(() => fitPanelScrollBoxes(panelRef.current));
    return () => window.cancelAnimationFrame(frame);
  }, [fitKey, openKey]);

  useEffect(() => {
    if (openKey === null) return;
    const onLayoutChange = () => {
      measure();
      fitPanelScrollBoxes(panelRef.current);
    };
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
