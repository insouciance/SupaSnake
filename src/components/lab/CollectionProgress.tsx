'use client';

/**
 * CollectionProgress - Shows dynasty collection completion progress
 * Compact glance summary for the Lab's secondary collection disclosure.
 */

import React from 'react';
import type { DynastyTheme } from '@/hooks/useDynastyTheme';

export interface CollectionProgressProps {
  /** Number of DISTINCT variants owned in this dynasty */
  owned: number;
  /** Total variants available in this dynasty */
  total: number;
  /**
   * How many active highest-generation builds the player has in this dynasty.
   * Historical generations are pedigree, not selectable inventory.
   */
  snakes?: number;
  /** Dynasty theme for styling */
  dynastyTheme: DynastyTheme;
}

/**
 * Convert hex color to rgba with opacity
 */
function hexToRgba(hex: string, opacity: number): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * CollectionProgress Component
 *
 * Displays collection completion status with text and a glowing bar.
 * Format: "Collection: X/Y (Z%)" above the bar, set-bonus hint below.
 * Handles edge case where total is 0 by showing 0%.
 */
export function CollectionProgress({
  owned,
  total,
  snakes,
  dynastyTheme,
}: CollectionProgressProps): React.ReactElement<any> {
  // A set can be complete; it cannot be more than complete. Clamped at the
  // display too, so no upstream miscount can ever paint 391% again or push
  // the fill past its track.
  const safeOwned = Math.max(0, Math.min(owned, total));

  // Calculate percentage, handling edge case of total === 0
  const percentage = total === 0 ? 0 : Math.round((safeOwned / total) * 100);

  // Calculate progress bar fill width
  const fillWidth = total === 0 ? 0 : (safeOwned / total) * 100;

  const glowColor = dynastyTheme.glow;
  const snakeCount = snakes ?? 0;
  const showSnakeCount = snakeCount > safeOwned;

  return (
    <div
      className="min-w-0"
      role="progressbar"
      aria-valuenow={safeOwned}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={
        `Collection progress: ${safeOwned} of ${total} variants owned, ${percentage}% complete` +
        (showSnakeCount ? `, ${snakeCount} snakes` : '')
      }
    >
      {/* Text label */}
      <div className="flex items-center justify-between gap-2">
        <span className="whitespace-nowrap font-display text-[11px] uppercase tracking-[0.08em] text-bone-white">
          Collection {safeOwned}/{total}
        </span>
        <span className="whitespace-nowrap font-mono text-[10px] text-beige/60">
          {showSnakeCount && <span data-testid="collection-snake-count">{snakeCount} active · </span>}
          {percentage}%
        </span>
      </div>

      {/* Progress bar track */}
      <div className="relative mt-2 h-1.5 w-full overflow-hidden rounded-full bg-scale-blue-light/35">
        {/* Filled portion - emissive dynasty glow */}
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all duration-300 ease-out"
          style={{
            width: `${fillWidth}%`,
            background: `linear-gradient(90deg, ${hexToRgba(glowColor, 0.65)} 0%, ${glowColor} 100%)`,
            boxShadow: fillWidth > 0 ? `0 0 10px ${hexToRgba(glowColor, 0.7)}` : 'none',
          }}
        />
      </div>

    </div>
  );
}

export default CollectionProgress;
