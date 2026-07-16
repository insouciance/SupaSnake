'use client';

/**
 * ParentSlot - One of the two parent selectors on the breeding screen.
 * Empty: dashed placeholder inviting selection (EmptySlot-style).
 * Filled: compact card with SnakeArt, variant name and generation badge,
 * plus a clear button to free the slot.
 */

import React from 'react';
import { SnakeArt } from '@/components/lab/SnakeArt';
import type { DynastyTheme } from '@/hooks/useDynastyTheme';
import type { OwnedSnake, SnakeVariant } from '@/shared/types/snake-data-model';

export interface ParentSlotProps {
  /** Slot label, e.g. "Parent 1" */
  label: string;
  /** Selected snake, or null when the slot is empty */
  snake: OwnedSnake | null;
  /** Variant of the selected snake (required when snake is set) */
  variant: SnakeVariant | null;
  /** Dynasty name for art motif, e.g. "CYBER" */
  dynastyName: string | null;
  theme: DynastyTheme;
  /** Open the picker for this slot */
  onSelect: () => void;
  /** Clear the slot */
  onClear: () => void;
  testId?: string;
}

function hexToRgba(hex: string, opacity: number): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function ParentSlot({
  label,
  snake,
  variant,
  dynastyName,
  theme,
  onSelect,
  onClear,
  testId,
}: ParentSlotProps): React.ReactElement<any> {
  // Empty slot: dashed placeholder
  if (!snake || !variant) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className="relative flex flex-col items-center justify-center rounded-lg w-full transition-all hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus-visible:ring-2"
        style={{
          aspectRatio: '3 / 4',
          minHeight: '44px',
          minWidth: '44px',
          border: `2px dashed ${hexToRgba(theme.primary, 0.6)}`,
          background: `linear-gradient(135deg, ${hexToRgba(theme.primary, 0.08)} 0%, ${hexToRgba(theme.secondary, 0.08)} 100%)`,
        }}
        aria-label={`Select ${label}`}
        data-testid={testId ?? 'parent-slot-empty'}
      >
        <div
          className="flex items-center justify-center rounded-full mb-2 text-3xl font-light"
          style={{
            width: '48px',
            height: '48px',
            border: `2px dashed ${hexToRgba(theme.primary, 0.5)}`,
            color: hexToRgba(theme.primary, 0.7),
          }}
          aria-hidden="true"
        >
          +
        </div>
        <span
          className="text-xs font-medium tracking-wide uppercase"
          style={{ color: hexToRgba(theme.primary, 0.7) }}
        >
          {label}
        </span>
      </button>
    );
  }

  // Filled slot: snake card
  return (
    <div
      className="relative rounded-lg overflow-hidden w-full"
      style={{
        aspectRatio: '3 / 4',
        border: `2px solid ${hexToRgba(theme.primary, 0.6)}`,
        backgroundColor: '#16213e',
        boxShadow: theme.shadow,
      }}
      data-testid={testId ?? 'parent-slot-filled'}
    >
      {/* Change parent (whole card is clickable) */}
      <button
        type="button"
        onClick={onSelect}
        className="absolute inset-0 w-full h-full focus:outline-none focus-visible:ring-2"
        aria-label={`Change ${label}: ${variant.name}`}
      >
        <SnakeArt
          seed={variant.id}
          name={variant.name}
          dynasty={dynastyName ?? 'CYBER'}
          primaryColor={theme.primary}
          secondaryColor={theme.secondary}
          rarity={variant.rarity}
          className="w-full h-full"
        />
      </button>

      {/* Clear button */}
      <button
        type="button"
        onClick={onClear}
        className="absolute top-1.5 right-1.5 flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold transition-colors z-10"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          color: '#ffffff',
        }}
        aria-label={`Remove ${label}`}
        data-testid={testId ? `${testId}-clear` : 'parent-slot-clear'}
      >
        &#x2715;
      </button>

      {/* Name + generation footer */}
      <div
        className="absolute bottom-0 left-0 right-0 px-2 py-1.5 text-center pointer-events-none"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
      >
        <p
          className="text-xs font-semibold truncate"
          style={{ color: theme.primary }}
        >
          {variant.name}
        </p>
        <p className="text-[10px]" style={{ color: '#8892b0' }}>
          Gen {snake.generation}
        </p>
      </div>
    </div>
  );
}

export default ParentSlot;
