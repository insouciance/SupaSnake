'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { GENES, geneStrains, type GeneId, type GenePick } from '@/shared/game/genes';
import { SPLICES, spliceForPair, type SpliceId } from '@/shared/game/splices';
import {
  STRAINS,
  STRAIN_TIER_NAMES,
  type StrainPoints,
} from '@/shared/game/strains';
import { StrainChip } from '@/components/traits/StrainChip';
import { CHOICE_INPUT_LOCK_MS } from '@/components/game/MutationChoiceOverlay';

interface GeneChoiceOverlayProps {
  options: [GeneId, GeneId];
  held: GenePick[];
  strainCounts: StrainPoints;
  source?: 'gene_food' | 'infuse' | null;
  showStrains: boolean;
  splicesUnlocked: boolean;
  discoveredSplices?: readonly SpliceId[];
  onChoose: (index: 0 | 1) => void;
  onDecline: () => void;
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
  onChoose,
  onDecline,
}: GeneChoiceOverlayProps) {
  const [locked, setLocked] = useState(true);
  const lockedRef = useRef(true);
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
      className="absolute inset-0 z-30 flex items-center justify-center bg-void-deep/80 p-4 backdrop-blur-sm"
      data-testid="gene-choice-overlay"
    >
      <div
        className="panel-elevated w-full max-w-lg p-6 animate-pop-in"
        style={{ '--glow': '#a855f7' } as CSSProperties}
      >
        <h2 className="heading-display text-center text-2xl text-[#c4b5fd] text-glow">
          {source === 'infuse' ? 'Infused Gene' : 'Gene Offer'}
        </h2>
        <p className="mb-5 text-center text-sm font-body text-beige/70">
          Choose one — your Genome remembers the route
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

        <button
          type="button"
          onClick={() => !locked && onDecline()}
          data-testid="gene-decline"
          className="mx-auto mt-4 block min-h-[44px] text-sm font-body text-beige/60 underline transition-colors hover:text-bone-white"
        >
          Take neither (Esc)
        </button>
      </div>
    </div>
  );
}

export default GeneChoiceOverlay;
