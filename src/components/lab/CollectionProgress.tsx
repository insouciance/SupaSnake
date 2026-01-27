'use client';

/**
 * CollectionProgress - Shows dynasty collection completion progress
 * Displays "Collection: X/Y (Z%)" with a visual progress bar
 * Dynasty-themed styling with primary color for filled portion
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
 * Displays collection completion status with text and visual progress bar.
 * Format: "Collection: X/Y (Z%)" followed by a progress bar.
 * Handles edge case where total is 0 by showing 0%.
 */
export function CollectionProgress({
  owned,
  total,
  dynastyTheme,
}: CollectionProgressProps): React.ReactElement {
  // Calculate percentage, handling edge case of total === 0
  const percentage = total === 0 ? 0 : Math.round((owned / total) * 100);

  // Calculate progress bar fill width
  const fillWidth = total === 0 ? 0 : (owned / total) * 100;

  const primaryColor = dynastyTheme.primary;

  return (
    <div
      className="flex items-center gap-3"
      role="progressbar"
      aria-valuenow={owned}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={`Collection progress: ${owned} of ${total} variants owned, ${percentage}% complete`}
    >
      {/* Text label */}
      <span
        className="text-sm font-medium whitespace-nowrap"
        style={{ color: primaryColor }}
      >
        Collection: {owned}/{total} ({percentage}%)
      </span>

      {/* Progress bar container */}
      <div
        className="relative rounded-full overflow-hidden"
        style={{
          width: '100px',
          height: '8px',
          backgroundColor: hexToRgba('#6b7280', 0.4), // Gray background for unfilled
        }}
      >
        {/* Filled portion */}
        <div
          className="absolute top-0 left-0 h-full rounded-full transition-all duration-300 ease-out"
          style={{
            width: `${fillWidth}%`,
            backgroundColor: primaryColor,
            boxShadow: fillWidth > 0 ? `0 0 8px ${hexToRgba(primaryColor, 0.5)}` : 'none',
          }}
        />
      </div>
    </div>
  );
}

export default CollectionProgress;
