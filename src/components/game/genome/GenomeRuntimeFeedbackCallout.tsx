'use client';

import { useEffect } from 'react';
import type { GenomeV2BoardFeedback } from './genomeV2BoardPresentation';

const TONE_CLASSES: Record<GenomeV2BoardFeedback['tone'], string> = {
  success: 'border-rarity-uncommon/55 text-rarity-uncommon',
  warning: 'border-venom-orange/55 text-venom-orange',
  risk: 'border-cosmic/55 text-cosmic',
};

/**
 * A short acknowledgement of a canonical Genome event. It occupies the
 * cockpit's reserved status rail and is deliberately pointer-transparent so
 * neither the box nor its text can steal a mobile steering flick.
 */
export function GenomeRuntimeFeedbackCallout({
  feedback,
  onDone,
}: {
  feedback: GenomeV2BoardFeedback;
  onDone: () => void;
}) {
  useEffect(() => {
    const reduced = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(onDone, reduced ? 1_400 : 2_200);
    return () => window.clearTimeout(timer);
  }, [feedback.eventId, onDone]);

  return (
    <div
      className={`pointer-events-none flex h-full w-full min-w-0 items-center justify-center overflow-hidden border-y bg-void-deep/88 px-3 text-center shadow-[inset_0_0_22px_rgba(168,85,247,0.1)] ${TONE_CLASSES[feedback.tone]}`}
      data-testid="genome-runtime-feedback"
      role="status"
      aria-live="polite"
    >
      <strong className="truncate font-display text-[clamp(12px,2.8vw,14px)] uppercase tracking-[0.04em]">
        {feedback.label}
      </strong>
    </div>
  );
}
