'use client';

/**
 * Pause Menu - Overlay when game is paused
 * Void surface + dynasty glow, on the shared panel system.
 */

import { useRef, type CSSProperties } from 'react';
import type { DynastyId } from '@/shared/types/game';
import { themeManager } from '@/lib/theme/ThemeManager';
import { applyOutcomeWithMutations } from '@/shared/game/rulesets';
import { isMutationId, type MutationPick } from '@/shared/game/mutations';
import type { GenePick } from '@/shared/game/genes';
import { IconDna } from '@/components/ui/icons';
import { useDialogFocusTrap } from '@/hooks/useDialogFocusTrap';

interface PauseMenuProps {
  dynasty: DynastyId;
  score: number;
  dnaCollected: number;
  /** Held mutations (bank/crash preview is mutation-aware). */
  heldMutations?: GenePick[];
  /** True once Phoenix absorbed a death (voids outcome benefits). */
  phoenixTriggered?: boolean;
  /** Server-capability-aware values supplied by the game page in Genome runs. */
  bankDna?: number;
  crashDna?: number;
  bankOutcomeLabel?: string;
  crashOutcomeLabel?: string;
  outcomeUnitLabel?: string;
  onResume: () => void;
  onQuit: () => void;
}

export function PauseMenu({
  dynasty,
  score,
  dnaCollected,
  heldMutations = [],
  phoenixTriggered = false,
  bankDna,
  crashDna,
  bankOutcomeLabel,
  crashOutcomeLabel,
  outcomeUnitLabel,
  onResume,
  onQuit,
}: PauseMenuProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap(dialogRef);
  const theme = themeManager.getTheme(dynasty);
  const legacyPicks = heldMutations.filter(
    (mutation): mutation is MutationPick => isMutationId(mutation.id)
  );
  const bankValue = bankDna ?? applyOutcomeWithMutations(
    dnaCollected,
    true,
    legacyPicks,
    phoenixTriggered
  );
  const crashValue = crashDna ?? applyOutcomeWithMutations(
    dnaCollected,
    false,
    legacyPicks,
    phoenixTriggered
  );

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-menu-title"
      aria-describedby="pause-menu-help"
      tabIndex={-1}
      className="absolute inset-0 z-30 flex items-center justify-center bg-void-deep/80 backdrop-blur-sm p-4"
      data-testid="pause-menu"
    >
      <div
        className="panel-glow p-8 min-w-[300px] max-w-full animate-pop-in"
        style={{ '--glow': theme.primary } as CSSProperties}
      >
        {/* Header */}
        <h2
          id="pause-menu-title"
          className="heading-display text-3xl text-center mb-6 text-glow"
          style={{ color: theme.primary }}
        >
          Paused
        </h2>

        {/* Current Stats */}
        <div className="space-y-3 mb-8 p-4 rounded-arcade border border-scale-blue-light/40 bg-void/60">
          <div className="flex justify-between items-center">
            <span className="label-arcade">Score</span>
            <span className="font-display text-2xl text-bone-white">{Math.round(score).toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="label-arcade inline-flex items-center gap-1.5">
              <IconDna size={14} />
              DNA Collected
            </span>
            <span className="font-display text-xl text-venom-orange text-glow-orange">+{dnaCollected}</span>
          </div>
          {dnaCollected > 0 && (
            <div className="flex justify-between items-center text-sm font-body">
              <span className="text-beige/60" title={outcomeUnitLabel}>Bank / crash value</span>
              <span className="text-beige/80">
                <span className="text-[#7df9ff]">
                  {bankOutcomeLabel ?? bankValue}
                </span>
                {' / '}
                {crashOutcomeLabel ?? crashValue}
              </span>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={onResume}
            className="btn-go w-full py-4 px-6 text-lg min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7df9ff]"
          >
            Plan Next Move
          </button>

          <button
            type="button"
            onClick={onQuit}
            className="btn-stop w-full py-3 px-6 min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7df9ff]"
          >
            Quit to Menu
          </button>
        </div>

        {/* Controls hint */}
        <div id="pause-menu-help" className="mt-6 space-y-2 text-center font-body text-sm text-beige/60">
          <p>Your next direction releases the board. Nothing moves before then.</p>
          <p>
            <kbd className="px-2 py-1 bg-scale-blue border border-scale-blue-light/60 rounded-arcade text-xs text-bone-white">ESC</kbd> or{' '}
            <kbd className="px-2 py-1 bg-scale-blue border border-scale-blue-light/60 rounded-arcade text-xs text-bone-white">P</kbd> arms your next move
          </p>
        </div>
      </div>
    </div>
  );
}
