'use client';

/**
 * Pause Menu - Overlay when game is paused
 * Void surface + dynasty glow, on the shared panel system.
 */

import type { CSSProperties } from 'react';
import type { DynastyId } from '@/shared/types/game';
import { themeManager } from '@/lib/theme/ThemeManager';
import { applyOutcome } from '@/shared/game/rulesets';
import { IconDna } from '@/components/ui/icons';

interface PauseMenuProps {
  dynasty: DynastyId;
  score: number;
  dnaCollected: number;
  onResume: () => void;
  onQuit: () => void;
}

export function PauseMenu({ dynasty, score, dnaCollected, onResume, onQuit }: PauseMenuProps) {
  const theme = themeManager.getTheme(dynasty);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-void-deep/80 backdrop-blur-sm p-4">
      <div
        className="panel-glow p-8 min-w-[300px] max-w-full animate-pop-in"
        style={{ '--glow': theme.primary } as CSSProperties}
      >
        {/* Header */}
        <h2
          className="heading-display text-3xl text-center mb-6 text-glow"
          style={{ color: theme.primary }}
        >
          Paused
        </h2>

        {/* Current Stats */}
        <div className="space-y-3 mb-8 p-4 rounded-arcade border border-scale-blue-light/40 bg-void/60">
          <div className="flex justify-between items-center">
            <span className="label-arcade">Score</span>
            <span className="font-display text-2xl text-bone-white">{score}</span>
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
              <span className="text-beige/60">Bank / crash value</span>
              <span className="text-beige/80">
                <span className="text-[#7df9ff]">{applyOutcome(dnaCollected, true)}</span>
                {' / '}
                {applyOutcome(dnaCollected, false)}
              </span>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="space-y-3">
          <button
            onClick={onResume}
            className="btn-go w-full py-4 px-6 text-lg min-h-[44px]"
          >
            Resume
          </button>

          <button
            onClick={onQuit}
            className="btn-stop w-full py-3 px-6 min-h-[44px]"
          >
            Quit to Menu
          </button>
        </div>

        {/* Controls hint */}
        <p className="text-center text-beige/60 font-body text-sm mt-6">
          Press <kbd className="px-2 py-1 bg-scale-blue border border-scale-blue-light/60 rounded-arcade text-xs text-bone-white">ESC</kbd> or{' '}
          <kbd className="px-2 py-1 bg-scale-blue border border-scale-blue-light/60 rounded-arcade text-xs text-bone-white">P</kbd> to resume
        </p>
      </div>
    </div>
  );
}
