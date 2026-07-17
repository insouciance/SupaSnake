'use client';

/**
 * ParentSlot - One of the two parent selectors on the breeding screen.
 * Empty: dashed void slot with an egg icon inviting selection.
 * Filled: glowing panel in the parent's dynasty color with SnakeArt,
 * variant name and generation badge, plus a clear button to free the slot.
 */

import React from 'react';
import { SnakeArt } from '@/components/lab/SnakeArt';
import { IconEgg, IconX } from '@/components/ui/icons';
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
  // Empty slot: dashed void placeholder with egg icon
  if (!snake || !variant) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className="relative flex flex-col items-center justify-center rounded-arcade w-full border-2 border-dashed bg-void-deep/50 transition-all hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus-visible:ring-2"
        style={{
          aspectRatio: '3 / 4',
          minHeight: '44px',
          minWidth: '44px',
          borderColor: hexToRgba(theme.glow, 0.45),
        }}
        aria-label={`Select ${label}`}
        data-testid={testId ?? 'parent-slot-empty'}
      >
        <IconEgg
          size={36}
          className="mb-2"
          style={{ color: hexToRgba(theme.glow, 0.6) }}
        />
        <span
          className="label-arcade"
          style={{ color: hexToRgba(theme.glow, 0.7) }}
        >
          {label}
        </span>
      </button>
    );
  }

  // Filled slot: panel glowing in the parent's dynasty color
  return (
    <div
      className="panel-glow relative overflow-hidden w-full"
      style={
        {
          aspectRatio: '3 / 4',
          '--glow': theme.glow,
        } as React.CSSProperties
      }
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
        className="absolute top-1.5 right-1.5 flex items-center justify-center w-7 h-7 rounded-full bg-void-deep/80 border border-scale-blue-light/50 text-bone-white/80 hover:text-bone-white transition-colors z-10"
        aria-label={`Remove ${label}`}
        data-testid={testId ? `${testId}-clear` : 'parent-slot-clear'}
      >
        <IconX size={14} />
      </button>

      {/* Name + generation footer */}
      <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 text-center pointer-events-none bg-void-deep/80 border-t border-scale-blue-light/30">
        <p
          className="text-xs font-body font-semibold truncate"
          style={{ color: theme.glow }}
        >
          {variant.name}
        </p>
        <p className="text-[10px] font-mono text-beige/60">
          Gen {snake.generation}
        </p>
      </div>
    </div>
  );
}

export default ParentSlot;
