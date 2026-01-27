/**
 * EmptySlot - Placeholder for future snake variants
 * Displays a dashed border card with "?" icon and "Coming soon" text
 * Used in CollectionGrid when dynasty has fewer variants than grid slots
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
export function EmptySlot({ dynastyTheme }: EmptySlotProps): React.ReactElement {
  const primaryColor = dynastyTheme.primary;
  const backgroundGradient = `linear-gradient(135deg, ${hexToRgba(dynastyTheme.primary, 0.1)} 0%, ${hexToRgba(dynastyTheme.secondary, 0.1)} 100%)`;

  return (
    <div
      className="relative flex flex-col items-center justify-center rounded-lg"
      style={{
        aspectRatio: '3 / 4',
        minHeight: '44px',
        minWidth: '44px',
        border: `2px dashed ${primaryColor}`,
        background: backgroundGradient,
      }}
      aria-label="Empty slot - Coming soon"
      role="img"
    >
      {/* Question mark icon */}
      <div
        className="flex items-center justify-center rounded-full mb-2"
        style={{
          width: '48px',
          height: '48px',
          border: `2px dashed ${hexToRgba(primaryColor, 0.5)}`,
          color: hexToRgba(primaryColor, 0.6),
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M12 4C9.79 4 8 5.79 8 8H10C10 6.9 10.9 6 12 6C13.1 6 14 6.9 14 8C14 9.5 12 9.75 12 12H14C14 10.75 16 10.5 16 8C16 5.79 14.21 4 12 4ZM11 14V16H13V14H11Z"
            fill="currentColor"
          />
        </svg>
      </div>

      {/* Coming soon text */}
      <span
        className="text-xs font-medium tracking-wide uppercase"
        style={{
          color: hexToRgba(primaryColor, 0.6),
        }}
      >
        Coming soon
      </span>
    </div>
  );
}

export default EmptySlot;
