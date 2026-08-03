'use client';

import { useEffect } from 'react';
import { STRAINS } from '@/shared/game/strains';
import { GeneGlyph, StrainGlyph } from '@/components/game/cockpit/CockpitGlyphs';
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
      className="pointer-events-none flex h-full w-full min-w-0 items-center justify-center overflow-hidden border-y border-cosmic/45 bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.18),rgba(4,8,20,0.90)_72%)] px-2 text-center shadow-[inset_0_0_24px_rgba(168,85,247,0.12)] animate-pop-in"
      data-testid="genome-commit-callout"
      role="status"
      aria-live="polite"
    >
      <div className="flex min-w-0 items-center justify-center gap-2 sm:gap-3">
        <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-[42%_58%_48%_52%] border border-cosmic/55 bg-cosmic/10 text-cosmic shadow-[0_0_14px_rgba(168,85,247,0.22)] sm:h-11 sm:w-11" aria-hidden="true">
          <i className="h-5 w-5 sm:h-6 sm:w-6"><GeneGlyph id={model.geneId ?? 'genome-commit'} /></i>
        </span>
        <span className="h-px w-3 shrink-0 bg-gradient-to-r from-cosmic/80 to-cosmic/20 sm:w-7" aria-hidden="true" />
        <div className="min-w-0 text-left">
          <div className="flex min-w-0 items-baseline gap-2">
            <strong className="truncate font-display text-xs uppercase tracking-[0.1em] text-cosmic sm:text-sm">
              {model.title}
            </strong>
            {held ? (
              <span
                className="shrink-0 whitespace-nowrap font-mono text-[8px] uppercase tracking-[0.06em] text-venom-orange sm:text-[9px]"
                data-testid="tactical-hold"
              >
                Choose a safe direction to resume
              </span>
            ) : (
              <span className="hidden truncate font-body text-[10px] text-beige/60 sm:block">
                {model.rule}
              </span>
            )}
          </div>
          {model.strains && model.strains.length > 0 ? (
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
              {model.strains.map((strain) => (
                <span key={strain} className="inline-flex items-center gap-1 font-body text-[8px] font-bold tracking-[0.06em]" style={{ color: STRAINS[strain].color }}>
                  <i className="h-2.5 w-2.5" aria-hidden="true"><StrainGlyph id={strain} /></i>
                  {STRAINS[strain].name.toUpperCase()}
                </span>
              ))}
            </div>
          ) : null}
          {model.moments.length > 0 ? (
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 font-body text-[9px] sm:text-[10px]">
              {model.moments.map((moment) => (
                <span
                  key={moment.id}
                  className={`inline-flex items-center gap-1 ${moment.tone === 'warning' ? 'text-venom-orange' : 'text-rarity-uncommon'}`}
                  title={moment.detail}
                  style={moment.strain ? { color: STRAINS[moment.strain].color } : undefined}
                >
                  {moment.strain ? <i className="h-2.5 w-2.5" aria-hidden="true"><StrainGlyph id={moment.strain} /></i> : null}
                  {moment.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
