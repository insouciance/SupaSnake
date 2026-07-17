/**
 * EmptySlot - Placeholder for future snake variants
 * A dashed void slot: near-black surface, dashed dynasty-tinted border,
 * dim "?" glyph and "Coming soon" label.
 * Used in CollectionGrid when dynasty has fewer variants than grid slots.
 */

import React from 'react';
import type { DynastyTheme } from '@/hooks/useDynastyTheme';

interface EmptySlotProps {
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
 * EmptySlot Component
 *
 * Placeholder card for future snake variants in the collection grid.
 * Maintains same 3:4 aspect ratio as VariantCard for visual consistency.
 * Non-interactive but maintains 44px minimum touch target for layout consistency.
 */
export function EmptySlot({ dynastyTheme }: EmptySlotProps): React.ReactElement<any> {
  const glow = dynastyTheme.glow;

  return (
    <div
      className="relative flex flex-col items-center justify-center rounded-arcade border-2 border-dashed bg-void-deep/50"
      style={{
        aspectRatio: '3 / 4',
        minHeight: '44px',
        minWidth: '44px',
        borderColor: hexToRgba(glow, 0.3),
      }}
      aria-label="Empty slot - Coming soon"
      role="img"
    >
      {/* Question mark glyph */}
      <span
        className="font-display text-3xl mb-2 select-none"
        style={{ color: hexToRgba(glow, 0.35) }}
        aria-hidden="true"
      >
        ?
      </span>

      {/* Coming soon text */}
      <span
        className="label-arcade text-[10px]"
        style={{ color: hexToRgba(glow, 0.45) }}
      >
        Coming soon
      </span>
    </div>
  );
}

export default EmptySlot;
