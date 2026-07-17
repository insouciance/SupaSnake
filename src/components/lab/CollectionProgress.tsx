'use client';

/**
 * CollectionProgress - Shows dynasty collection completion progress
 * Displays "Collection: X/Y (Z%)" with a glowing progress bar and a
 * set-bonus hint. Dynasty-themed: the fill glows in the dynasty color.
 */

import React from 'react';
import type { DynastyTheme } from '@/hooks/useDynastyTheme';

export interface CollectionProgressProps {
  /** Number of variants owned in this dynasty */
  owned: number;
  /** Total variants available in this dynasty */
  total: number;
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
  dynastyTheme,
}: CollectionProgressProps): React.ReactElement<any> {
  // Calculate percentage, handling edge case of total === 0
  const percentage = total === 0 ? 0 : Math.round((owned / total) * 100);

  // Calculate progress bar fill width
  const fillWidth = total === 0 ? 0 : (owned / total) * 100;

  const glowColor = dynastyTheme.glow;
  const isComplete = total > 0 && owned >= total;

  return (
    <div
      className="flex flex-col gap-1.5 min-w-0"
      role="progressbar"
      aria-valuenow={owned}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={`Collection progress: ${owned} of ${total} variants owned, ${percentage}% complete`}
    >
      {/* Text label */}
      <div className="flex items-baseline justify-between gap-3">
        <span className="label-arcade whitespace-nowrap">
          Collection: {owned}/{total} ({percentage}%)
        </span>
      </div>

      {/* Progress bar track */}
      <div className="relative h-2 w-full rounded-arcade overflow-hidden border border-scale-blue-light/50 bg-void-deep/80">
        {/* Filled portion - emissive dynasty glow */}
        <div
          className="absolute top-0 left-0 h-full rounded-arcade transition-all duration-300 ease-out"
          style={{
            width: `${fillWidth}%`,
            background: `linear-gradient(90deg, ${hexToRgba(glowColor, 0.65)} 0%, ${glowColor} 100%)`,
            boxShadow: fillWidth > 0 ? `0 0 10px ${hexToRgba(glowColor, 0.7)}` : 'none',
          }}
        />
      </div>

      {/* Set-bonus hint */}
      <span
        className="text-[11px] font-body leading-tight"
        style={{ color: isComplete ? glowColor : 'rgba(148, 163, 184, 0.55)' }}
      >
        {isComplete
          ? 'Set complete - dynasty bonus active'
          : 'Complete the set to earn the dynasty set bonus'}
      </span>
    </div>
  );
}

export default CollectionProgress;
