'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { GENES, geneStrains, type GeneId, type GenePick } from '@/shared/game/genes';
import { SPLICES, spliceForPair, type SpliceId } from '@/shared/game/splices';
import {
  STRAINS,
  STRAIN_TIER_NAMES,
  type StrainId,
  type StrainPoints,
} from '@/shared/game/strains';
import { StrainChip } from '@/components/traits/StrainChip';
import { CHOICE_INPUT_LOCK_MS } from '@/components/game/MutationChoiceOverlay';
import { useDialogFocusTrap } from '@/hooks/useDialogFocusTrap';

interface GeneChoiceOverlayProps {
  options: [GeneId, GeneId];
  held: GenePick[];
  strainCounts: StrainPoints;
  source?: 'gene_food' | 'infuse' | null;
  showStrains: boolean;
  splicesUnlocked: boolean;
  discoveredSplices?: readonly SpliceId[];
  /**
   * The strain the pity rule will force into slot 1 of the next offer if
   * this one is passed, or null. The engine computes it from the live offer
   * stream at roll time; the overlay only renders it.
   */
  pityStrain?: StrainId | null;
  onChoose: (index: 0 | 1) => void;
  onDecline: () => void;
}

/**
 * What passing this offer actually buys, in the run's own terms.
 *
 * The pity window counts offers rather than picks, so a pass feeds it just
 * like a pick does. When that means the next slot 1 is already determined,
 * say which strain - that is a real, checkable promise. Otherwise fall back
 * to the honest generic: the slots stay yours.
 */
function declineLine(pityStrain: StrainId | null): string {
  if (pityStrain) {
    return `Pass. Your next offer's first slot is forced to ${STRAINS[pityStrain].name.toUpperCase()}.`;
  }
  return 'Pass. Keeps your six slots for the combo you want.';
}

function spliceHint(
  option: GeneId,
  held: GenePick[],
  splicesUnlocked: boolean,
  discovered: ReadonlySet<SpliceId>
): string | null {
  if (!splicesUnlocked) return null;
  for (const pick of held) {
    const splice = spliceForPair(pick.id, option);
    if (!splice) continue;
    return discovered.has(splice)
      ? `Fuses: ${SPLICES[splice].name}`
      : 'Fuses: ???';
  }
  return null;
}

function thresholdHint(option: GeneId, counts: StrainPoints): string | null {
  for (const strain of geneStrains(option)) {
    const next = (counts[strain] ?? 0) + 1;
    if (next === 4) return `${STRAINS[strain].name} → ${STRAIN_TIER_NAMES[strain].apex}`;
    if (next === 3) return `${STRAINS[strain].name} → ${STRAIN_TIER_NAMES[strain].expression}`;
    if (next === 2) return `${STRAINS[strain].name} → ${STRAIN_TIER_NAMES[strain].minor}`;
  }
  return null;
}

/** Genome-era evolution of MutationChoiceOverlay. */
export function GeneChoiceOverlay({
  options,
  held,
  strainCounts,
  source = 'gene_food',
  showStrains,
  splicesUnlocked,
  discoveredSplices = [],
  pityStrain = null,
  onChoose,
  onDecline,
}: GeneChoiceOverlayProps) {
  const declineConsequence = declineLine(pityStrain);
  const [locked, setLocked] = useState(true);
  const lockedRef = useRef(true);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap(dialogRef, !locked);
  const discovered = useMemo(
    () => new Set(discoveredSplices),
    [discoveredSplices]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      lockedRef.current = false;
      setLocked(false);
    }, CHOICE_INPUT_LOCK_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === '1' || event.key === '2') {
        event.preventDefault();
        event.stopPropagation();
        if (!lockedRef.current) onChoose(event.key === '1' ? 0 : 1);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!lockedRef.current) onDecline();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onChoose, onDecline]);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="gene-choice-title"
      tabIndex={-1}
      className="absolute inset-0 z-30 flex items-center justify-center bg-void-deep/80 p-4 backdrop-blur-sm"
      data-testid="gene-choice-overlay"
    >
      <div
        className="panel-elevated w-full max-w-lg p-6 animate-pop-in"
        style={{ '--glow': '#a855f7' } as CSSProperties}
      >
        <h2 id="gene-choice-title" className="heading-display text-center text-2xl text-[#c4b5fd] text-glow">
          {source === 'infuse' ? 'Infused Gene' : 'Gene Offer'}
        </h2>
        <p className="mb-5 text-center text-sm font-body text-beige/70">
          Take one or take neither — your Genome remembers the route
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {options.map((id, index) => {
            const def = GENES[id];
            const fusion = spliceHint(id, held, splicesUnlocked, discovered);
            const threshold = showStrains ? thresholdHint(id, strainCounts) : null;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChoose(index as 0 | 1)}
                disabled={locked}
                aria-keyshortcuts={`${index + 1}`}
                data-testid={`gene-option-${index}`}
                className={`min-h-[44px] rounded-arcade border bg-void/60 p-4 text-left transition-all ${
                  locked
                    ? 'cursor-wait border-scale-blue-light/40 opacity-70'
                    : 'border-scale-blue-light/60 hover:border-[#a855f7] hover:bg-[#a855f7]/10'
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="heading-display text-lg text-bone-white">{def.name}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="rounded-arcade border border-[#a855f7]/60 px-1.5 py-0.5 text-[10px] text-[#c4b5fd]">
                      {def.kind}
                    </span>
                    <kbd className="rounded-arcade border border-scale-blue-light/60 bg-scale-blue px-1.5 py-0.5 text-[10px] text-bone-white">
                      {index + 1}
                    </kbd>
                  </span>
                </div>
                {showStrains && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {def.strains.map((strain) => (
                      <StrainChip key={strain} strain={strain} />
                    ))}
                  </div>
                )}
                <p className="text-sm leading-snug text-rarity-uncommon font-body">{def.effect}</p>
                <p className="mt-1 text-sm leading-snug text-strike-red/90 font-body">{def.cost}</p>
                {(fusion || threshold) && (
                  <div className="mt-3 space-y-1 border-t border-scale-blue-light/30 pt-2 text-xs font-body">
                    {fusion && <p className="text-cosmic" data-testid={`gene-fusion-${index}`}>{fusion}</p>}
                    {threshold && <p style={{ color: STRAINS[def.strains[0]].color }}>{threshold}</p>}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* PASS is a third choice, not a way out of the other two, so it
            wears the same effect/cost grammar as the gene cards. The
            consequence line is computed from the live offer stream - a
            constant here would be a promise the run might not keep. */}
        <button
          type="button"
          onClick={() => !locked && onDecline()}
          disabled={locked}
          aria-keyshortcuts="Escape"
          data-testid="gene-decline"
          className={`mt-3 block w-full min-h-[44px] rounded-arcade border bg-void/60 p-4 text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7df9ff] ${
            locked
              ? 'cursor-wait border-scale-blue-light/40 opacity-70'
              : 'border-scale-blue-light/60 hover:border-[#a855f7] hover:bg-[#a855f7]/10'
          }`}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="heading-display text-lg text-bone-white">Take neither</span>
            <kbd className="rounded-arcade border border-scale-blue-light/60 bg-scale-blue px-1.5 py-0.5 text-[10px] text-bone-white">
              Esc
            </kbd>
          </div>
          <p
            className="text-sm leading-snug text-rarity-uncommon font-body"
            data-testid="gene-decline-consequence"
          >
            {declineConsequence}
          </p>
          <p className="mt-1 text-sm leading-snug text-strike-red/90 font-body">
            This offer is spent — the next one arrives on the normal cadence.
          </p>
        </button>
      </div>
    </div>
  );
}

export default GeneChoiceOverlay;
