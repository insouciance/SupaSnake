'use client';

import { useEffect } from 'react';
import { STRAINS } from '@/shared/game/strains';
import type { GenomeV2CommitPresentation } from './genomeV2CommitPresentation';

export function GenomeCommitCallout({
  model,
  held,
  onDone,
}: {
  model: GenomeV2CommitPresentation;
  /** The callout waits through the decision re-arm, then remains readable. */
  held: boolean;
  onDone?: () => void;
}) {
  useEffect(() => {
    if (held) return;
    const reduced = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => onDone?.(), reduced ? 1800 : 3000);
    return () => window.clearTimeout(timer);
  }, [held, onDone]);

  return (
    <div
      className="pointer-events-none flex h-full w-full min-w-0 items-center justify-center border-y border-cosmic/45 bg-void-deep/82 px-2 text-center shadow-[inset_0_0_24px_rgba(168,85,247,0.12)] animate-pop-in"
      data-testid="genome-commit-callout"
      role="status"
      aria-live="polite"
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-baseline justify-center gap-2">
          <strong className="truncate font-display text-xs uppercase tracking-[0.1em] text-cosmic sm:text-sm">
            {model.title}
          </strong>
          <span className="hidden truncate font-body text-[10px] text-beige/60 sm:block">
            {model.rule}
          </span>
        </div>
        {model.moments.length > 0 ? (
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-0.5 font-body text-[9px] sm:text-[10px]">
            {model.moments.map((moment) => (
              <span
                key={moment.id}
                className={moment.tone === 'warning' ? 'text-venom-orange' : 'text-rarity-uncommon'}
                title={moment.detail}
                style={moment.strain ? { color: STRAINS[moment.strain].color } : undefined}
              >
                {moment.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
