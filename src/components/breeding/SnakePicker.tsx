'use client';

/**
 * SnakePicker - Modal listing owned snakes for parent selection.
 * The breeding page prepares the entries (including eligibility): when
 * parent 1 is chosen, parent 2 candidates are restricted to the same
 * dynasty and cannot be the same snake.
 * Modal shell follows the UnlockConfirmModal pattern (backdrop, Escape).
 */

import React, { useCallback, useEffect } from 'react';
import { SnakeArt } from '@/components/lab/SnakeArt';
import { dynastyThemes } from '@/hooks/useDynastyTheme';
import type { OwnedSnake, SnakeVariant } from '@/shared/types/snake-data-model';

export interface SnakePickerEntry {
  snake: OwnedSnake;
  variant: SnakeVariant;
  dynastyName: string;
  /** Ineligible entries are shown dimmed with the reason */
  disabled: boolean;
  disabledReason?: string;
}

export interface SnakePickerProps {
  isOpen: boolean;
  /** Modal heading, e.g. "Select Parent 2" */
  title: string;
  entries: SnakePickerEntry[];
  onSelect: (snakeId: string) => void;
  onClose: () => void;
}

export function SnakePicker({
  isOpen,
  title,
  entries,
  onSelect,
  onClose,
}: SnakePickerProps): React.ReactElement<any> | null {
  // Escape key closes
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)' }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="snake-picker-title"
      data-testid="snake-picker"
    >
      <div
        className="relative w-full max-w-lg max-h-[85vh] flex flex-col rounded-lg overflow-hidden"
        style={{
          backgroundColor: '#16213e',
          border: '2px solid rgba(0, 255, 255, 0.4)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}
        >
          <h2 id="snake-picker-title" className="text-lg font-bold text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-full text-white/70 hover:text-white transition-colors"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)' }}
            aria-label="Close picker"
            data-testid="snake-picker-close"
          >
            &#x2715;
          </button>
        </div>

        {/* Snake grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {entries.length === 0 ? (
            <p className="text-center py-8 text-sm" style={{ color: '#8892b0' }}>
              No snakes available. Unlock snakes in the Lab first.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {entries.map(({ snake, variant, dynastyName, disabled, disabledReason }) => {
                const theme = dynastyThemes[dynastyName] ?? dynastyThemes.CYBER;
                return (
                  <button
                    key={snake.id}
                    type="button"
                    onClick={() => {
                      if (!disabled) onSelect(snake.id);
                    }}
                    disabled={disabled}
                    className="relative rounded-lg overflow-hidden text-left transition-all focus:outline-none focus-visible:ring-2 enabled:hover:scale-[1.03] enabled:active:scale-[0.97]"
                    style={{
                      aspectRatio: '3 / 4',
                      border: `2px solid ${disabled ? 'rgba(255,255,255,0.1)' : theme.primary}`,
                      opacity: disabled ? 0.4 : 1,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      backgroundColor: '#1a1a2e',
                    }}
                    aria-label={
                      disabled
                        ? `${variant.name} Gen ${snake.generation} - ${disabledReason ?? 'unavailable'}`
                        : `Select ${variant.name} Gen ${snake.generation}`
                    }
                    data-testid={`picker-snake-${snake.id}`}
                  >
                    <SnakeArt
                      seed={variant.id}
                      name={variant.name}
                      dynasty={dynastyName}
                      primaryColor={theme.primary}
                      secondaryColor={theme.secondary}
                      rarity={variant.rarity}
                      className="absolute inset-0 w-full h-full"
                    />
                    <div
                      className="absolute bottom-0 left-0 right-0 px-1.5 py-1 text-center"
                      style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
                    >
                      <p
                        className="text-[10px] font-semibold truncate"
                        style={{ color: theme.primary }}
                      >
                        {variant.name}
                      </p>
                      <p className="text-[9px]" style={{ color: '#8892b0' }}>
                        Gen {snake.generation}
                        {disabled && disabledReason ? ` · ${disabledReason}` : ''}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SnakePicker;
