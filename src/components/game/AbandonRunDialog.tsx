'use client';

import { useEffect, useRef } from 'react';
import { useDialogFocusTrap } from '@/hooks/useDialogFocusTrap';

interface AbandonRunDialogProps {
  score: number;
  dnaCollected: number;
  costsEnergy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Destructive confirmation for leaving a live tactical hold. */
export function AbandonRunDialog({
  score,
  dnaCollected,
  costsEnergy,
  onCancel,
  onConfirm,
}: AbandonRunDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap(dialogRef);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onCancel]);

  return (
    <div
      ref={dialogRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="abandon-run-title"
      aria-describedby="abandon-run-description"
      tabIndex={-1}
      className="absolute inset-0 z-30 flex items-center justify-center bg-void-deep/80 p-4 backdrop-blur-sm"
      data-testid="abandon-run-dialog"
    >
      <div className="panel-elevated w-full max-w-md p-6 [--glow:#f43f5e] animate-pop-in">
        <h2
          id="abandon-run-title"
          className="heading-display text-center text-2xl text-strike-red text-glow"
        >
          Abandon run?
        </h2>
        <div
          id="abandon-run-description"
          className="mt-3 space-y-2 text-center font-body text-sm text-beige/75"
        >
          <p>
            This ends the run now. Score {score.toLocaleString('en-US')} and{' '}
            {dnaCollected.toLocaleString('en-US')} run DNA will not be recorded.
          </p>
          {costsEnergy && (
            <p className="text-strike-red/85">
              The Energy spent to launch this run is not returned.
            </p>
          )}
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onCancel}
            className="btn-go min-h-[44px] px-5 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7df9ff]"
          >
            Keep planning
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="btn-stop min-h-[44px] px-5 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7df9ff]"
          >
            Abandon run
          </button>
        </div>
      </div>
    </div>
  );
}

export default AbandonRunDialog;
