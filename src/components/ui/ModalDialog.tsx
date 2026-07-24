'use client';

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocusTrap } from '@/hooks/useDialogFocusTrap';

interface ModalDialogProps {
  children: ReactNode;
  onClose: () => void;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  id?: string;
  testId?: string;
  panelClassName?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
}

/**
 * Viewport-level modal layer for app dialogs.
 *
 * Rendering into document.body keeps fixed positioning and z-order independent
 * from animated or overflow-clipped feature parents. The layout wrapper uses
 * auto block margins so tall dialogs remain scrollable instead of being
 * centered beyond the top of a short viewport.
 */
export function ModalDialog({
  children,
  onClose,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  id,
  testId,
  panelClassName = '',
  closeOnBackdrop = true,
  closeOnEscape = true,
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalHost(document.body);
  }, []);

  useDialogFocusTrap(dialogRef, portalHost !== null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!closeOnEscape || event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [closeOnEscape, onClose]);

  useEffect(() => {
    if (!portalHost) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [portalHost]);

  if (!portalHost) return null;

  const handleBackdropPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      closeOnBackdrop &&
      event.target instanceof Node &&
      !dialogRef.current?.contains(event.target)
    ) {
      onClose();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain bg-void-deep/85 backdrop-blur-sm"
      data-modal-layer="true"
      onPointerDown={handleBackdropPointerDown}
      style={{
        paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
        paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
        paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
      }}
    >
      <div className="flex min-h-full items-start justify-center">
        <div
          ref={dialogRef}
          id={id}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          tabIndex={-1}
          data-testid={testId}
          data-modal-dialog="true"
          className={`relative my-auto w-full focus:outline-none ${panelClassName}`}
        >
          {children}
        </div>
      </div>
    </div>,
    portalHost
  );
}

export default ModalDialog;
