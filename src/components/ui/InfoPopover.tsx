'use client';

/**
 * InfoPopover — the tap-to-explain primitive (WP-2.07a).
 *
 * The defect it exists for: every explanation in this game lived in an HTML
 * `title` attribute, which a touch device never shows. A player on a phone
 * could not find out what Scavenger does. This wraps any small visual — a
 * chip, a pip, a name — in a real button that reveals the same text on tap.
 *
 * Three properties are load-bearing, not stylistic:
 *
 * 1. **Portal + `position: fixed` + `z-[110]`.** The panel is rendered into
 *    `document.body`. Two of its intended hosts (`VariantCard`,
 *    `VariantDetailModal`) are `overflow-hidden`, so an absolutely
 *    positioned panel is clipped inside both; and `ModalDialog` sits at
 *    `z-[100]`, so anything lower disappears behind an open modal.
 *
 * 2. **An always-rendered `sr-only` description on the trigger.** A screen
 *    reader announces name, effect and cost from `aria-describedby` without
 *    the popover ever opening; a touch user gets the same words on tap. One
 *    control, two correct channels — and no state a screen reader has to
 *    discover by activating something.
 *
 * 3. **The panel is text-only, with no focusable descendants,** and is
 *    `aria-hidden` because the `sr-only` description already carries its
 *    content. The portal places the panel at the end of the DOM, so an
 *    interactive element inside it would land at the end of the tab order,
 *    far from the control that opened it. Text-only also keeps the popover
 *    honestly non-modal: nothing to trap, nothing to escape but itself.
 *
 * There is deliberately **no `ModalDialog` escalation at any viewport**. The
 * portal already removed the clipping motive, the content is three lines,
 * and two behaviours split by breakpoint doubles the accessibility surface
 * and rots. `max-w-[min(20rem,calc(100vw-2rem))]` covers the narrow case.
 *
 * Dismissal follows `AccountChip`: outside `mousedown` **and** `touchstart`
 * against a root ref, `Escape` restoring focus to the trigger, and a second
 * tap on the trigger closing it. Placement and entrance animation use nested
 * elements: both need `transform`, and combining them would let the animation
 * override an above-trigger `translateY(-100%)` and cover the trigger.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

/** Gap in px between the trigger and the panel. */
const PANEL_OFFSET = 8;
/** Minimum breathing room from the viewport edge, in px. */
const VIEWPORT_MARGIN = 8;
/** Panel width ceiling in px — mirrors `max-w-[min(20rem,…)]` (20rem). */
const PANEL_MAX_WIDTH = 320;

export interface InfoPopoverProps {
  /**
   * The entry's name. Heads the panel and opens the screen-reader
   * description, so it should read as a title ("Scavenger", "BANK").
   */
  title: string;
  /** What it does. */
  effect: string;
  /** What it costs. Empty means documented costless; the line is dropped. */
  cost?: string;
  /** An extra line, e.g. a trait's run notice. */
  notice?: string;
  /** The visible trigger content — a chip, a name, an icon. */
  children: ReactNode;
  /**
   * Accessible name of the trigger. Set explicitly rather than computed
   * from the children, because the children are chips that already carry
   * their own `aria-label` — leaving the name to content would announce the
   * whole effect string twice, once as the name and once as the
   * description.
   */
  label?: string;
  /** Extra classes for the trigger button. */
  className?: string;
  /** Suffix for `data-testid`: `info-popover-<testId>`. */
  testId?: string;
}

interface PanelPosition {
  top: number;
  left: number;
  /** True when the panel had to flip above the trigger to stay on screen. */
  above: boolean;
}

function computePosition(trigger: HTMLElement): PanelPosition {
  const rect = trigger.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(PANEL_MAX_WIDTH, viewportWidth - 2 * VIEWPORT_MARGIN);

  const rawLeft = rect.left + rect.width / 2 - width / 2;
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(rawLeft, viewportWidth - width - VIEWPORT_MARGIN)
  );

  // Flip above when the lower half of the viewport cannot hold a short panel.
  const above = rect.bottom + PANEL_OFFSET > viewportHeight * 0.6;
  const top = above
    ? Math.max(VIEWPORT_MARGIN, rect.top - PANEL_OFFSET)
    : rect.bottom + PANEL_OFFSET;

  return { top, left, above };
}

export function InfoPopover({
  title,
  effect,
  cost,
  notice,
  children,
  label,
  className = '',
  testId,
}: InfoPopoverProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const descriptionId = useId();

  // `createPortal` needs a document; the first client render provides it.
  useEffect(() => setMounted(true), []);

  const reposition = useCallback(() => {
    if (triggerRef.current) setPosition(computePosition(triggerRef.current));
  }, []);

  // Position before paint so the panel never appears at the wrong place first.
  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', reposition);
    // Capture: a scroll inside any ancestor moves the trigger too.
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, reposition]);

  const description = [title, effect, cost, notice]
    .filter((part): part is string => Boolean(part && part.trim()))
    .map((part) => part.trim().replace(/\.$/, ''))
    .join('. ')
    .concat('.');

  return (
    <span className="inline-flex">
      <button
        ref={triggerRef}
        type="button"
        // The second tap closes: this is a toggle, not an opener.
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={label ?? `${title}: what it does`}
        aria-describedby={descriptionId}
        data-testid={testId ? `info-popover-${testId}` : 'info-popover'}
        className={`inline-flex items-center rounded-arcade transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-venom-orange ${className}`}
      >
        {children}
      </button>
      {/* Always rendered: the text reaches a screen reader without a tap. */}
      <span className="sr-only" id={descriptionId}>
        {description}
      </span>

      {mounted && open && position
        ? createPortal(
            <div
              ref={panelRef}
              // The sr-only description above already carries this text, so
              // announcing the panel too would say everything twice.
              aria-hidden="true"
              data-testid={testId ? `info-panel-${testId}` : 'info-panel'}
              className="fixed z-[110] max-w-[min(20rem,calc(100vw-2rem))] text-left"
              style={{
                top: position.top,
                left: position.left,
                transform: position.above ? 'translateY(-100%)' : undefined,
              }}
            >
              <div className="panel-elevated animate-pop-in p-3 shadow-lg">
                <p className="font-display text-sm text-bone-white">{title}</p>
                <p className="mt-1 font-body text-xs leading-snug text-beige/80">
                  {effect}
                </p>
                {cost ? (
                  <p className="mt-1 font-body text-xs leading-snug text-strike-red/80">
                    {cost}
                  </p>
                ) : null}
                {notice ? (
                  <p className="mt-1 font-body text-xs leading-snug text-cosmic">
                    {notice}
                  </p>
                ) : null}
              </div>
            </div>,
            document.body
          )
        : null}
    </span>
  );
}

export default InfoPopover;
