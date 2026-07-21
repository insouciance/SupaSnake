'use client';

/**
 * MutationChoiceOverlay - the choice-of-2 mutation offer (Design v2
 * section 5.1).
 *
 * Renders over the frozen engine ("choice hold" - NOT the pause state, so
 * the pause menu never appears underneath). Two cards, each readable at a
 * glance: name, [E]/[P] kind, one-line effect, one-line cost. No timer
 * pressure by design. Input is locked for 300ms after opening to prevent
 * accidental picks from buffered taps; keyboard 1/2 picks, Escape (or the
 * skip link) declines - declining is allowed and takes neither.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { GENES, type GeneId } from '@/shared/game/genes';

/** Input lock after the overlay opens (doc: prevent accidental picks). */
export const CHOICE_INPUT_LOCK_MS = 300;

/** Violet pulse family - matches MutationBeacon. */
const MUTATION_COLOR = '#a855f7';

interface MutationChoiceOverlayProps {
  options: [GeneId, GeneId];
  onChoose: (index: 0 | 1) => void;
  onDecline: () => void;
}

export function MutationChoiceOverlay({
  options,
  onChoose,
  onDecline,
}: MutationChoiceOverlayProps) {
  const [locked, setLocked] = useState(true);
  const lockedRef = useRef(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      lockedRef.current = false;
      setLocked(false);
    }, CHOICE_INPUT_LOCK_MS);
    return () => clearTimeout(timer);
  }, []);

  // Keyboard: 1/2 pick, Escape declines. Listener capture-phase so the
  // page's pause handler never races the decline.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '1' || e.key === '2') {
        e.preventDefault();
        e.stopPropagation();
        if (!lockedRef.current) {
          onChoose(e.key === '1' ? 0 : 1);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (!lockedRef.current) {
          onDecline();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onChoose, onDecline]);

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-void-deep/80 backdrop-blur-sm p-4"
      data-testid="mutation-choice-overlay"
    >
      <div
        className="panel-elevated p-6 w-full max-w-md animate-pop-in"
        style={{ '--glow': MUTATION_COLOR } as CSSProperties}
      >
        <h2
          className="heading-display text-2xl text-center mb-1 text-glow"
          style={{ color: MUTATION_COLOR }}
        >
          Mutation
        </h2>
        <p className="text-center text-beige/70 font-body text-sm mb-5">
          Choose one — every offer has a cost
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {options.map((id, index) => {
            const def = GENES[id];
            return (
              <button
                key={id}
                onClick={() => onChoose(index as 0 | 1)}
                disabled={locked}
                data-testid={`mutation-option-${index}`}
                className={`text-left p-4 rounded-arcade border transition-all min-h-[44px] bg-void/60 ${
                  locked
                    ? 'border-scale-blue-light/40 opacity-70 cursor-wait'
                    : 'border-scale-blue-light/60 hover:border-[#a855f7] hover:bg-[#a855f7]/10'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="heading-display text-lg text-bone-white">
                    {def.name}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="px-1.5 py-0.5 rounded-arcade border border-[#a855f7]/60 text-[#c4b5fd] text-[10px] font-body tracking-wide"
                      title={
                        def.kind === 'E'
                          ? 'Economic - changes what you earn'
                          : def.kind === 'P'
                            ? 'Physical - changes how you survive'
                            : 'Economic + physical'
                      }
                    >
                      {def.kind}
                    </span>
                    <kbd className="px-1.5 py-0.5 bg-scale-blue border border-scale-blue-light/60 rounded-arcade text-[10px] text-bone-white">
                      {index + 1}
                    </kbd>
                  </span>
                </div>
                <p className="text-sm font-body text-rarity-uncommon leading-snug">
                  {def.effect}
                </p>
                <p className="text-sm font-body text-strike-red/90 leading-snug mt-1">
                  {def.cost}
                </p>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => {
            if (!locked) onDecline();
          }}
          data-testid="mutation-decline"
          className="block mx-auto mt-4 text-sm font-body text-beige/60 underline hover:text-bone-white transition-colors min-h-[44px]"
        >
          Take neither (Esc)
        </button>
      </div>
    </div>
  );
}

export default MutationChoiceOverlay;
