'use client';

import { useEffect } from 'react';
import { STRAINS } from '@/shared/game/strains';
import { GeneGlyph } from '@/components/game/cockpit/CockpitGlyphs';
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

  const visibleOutcome = model.moments.find(
    (moment) => !moment.label.toLowerCase().startsWith(model.title.toLowerCase())
  )?.label ?? model.rule;

  return (
    <div
      className="pointer-events-none flex h-full w-full min-w-0 items-center justify-center overflow-hidden border-y border-cosmic/45 bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.18),rgba(4,8,20,0.90)_72%)] px-2 text-center shadow-[inset_0_0_24px_rgba(168,85,247,0.12)] animate-pop-in"
      data-testid="genome-commit-callout"
      role="status"
      aria-live="polite"
    >
      <div className="flex h-full min-w-0 max-w-full items-center justify-center gap-2 sm:gap-3">
        <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-[42%_58%_48%_52%] border border-cosmic/55 bg-cosmic/10 text-cosmic shadow-[0_0_14px_rgba(168,85,247,0.22)] sm:h-9 sm:w-9" aria-hidden="true">
          <i className="h-5 w-5"><GeneGlyph id={model.geneId ?? 'genome-commit'} /></i>
        </span>
        <span className="h-px w-3 shrink-0 bg-gradient-to-r from-cosmic/80 to-cosmic/20 sm:w-7" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-left">
          <strong className="max-w-[38%] shrink truncate font-display text-sm uppercase tracking-[0.04em] text-cosmic sm:max-w-[42%] sm:text-base">
            {model.title}
          </strong>
          {held ? (
            <span
              className="min-w-0 truncate font-body text-lg font-bold text-venom-orange"
              data-testid="tactical-hold"
              title="Choose a safe direction to resume"
            >
              Move to resume
            </span>
          ) : (
            <span
              className="min-w-0 truncate font-body text-sm text-beige/80 sm:text-base"
              title={visibleOutcome}
              data-testid="genome-commit-outcome"
            >
              {visibleOutcome}
            </span>
          )}
          <span className="sr-only">
            {model.strains?.map((strain) => STRAINS[strain].name.toUpperCase()).join(', ')}.
            {model.moments.map((moment) => `${moment.label}: ${moment.detail}`).join(' ')}
          </span>
        </div>
      </div>
    </div>
  );
}
