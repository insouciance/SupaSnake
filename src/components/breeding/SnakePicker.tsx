'use client';

/**
 * SnakePicker - Modal listing owned snakes for parent selection.
 * The breeding page prepares the entries (including eligibility): when
 * parent 1 is chosen, parent 2 candidates are restricted to the same
 * dynasty and cannot be the same snake.
 * Panel-elevated shell that pops in (backdrop click / Escape to close).
 */

import React, { useCallback, useEffect } from 'react';
import { SnakeArt } from '@/components/lab/SnakeArt';
import { IconX } from '@/components/ui/icons';
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-void-deep/85"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="snake-picker-title"
      data-testid="snake-picker"
    >
      <div className="panel-elevated animate-pop-in relative w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden rounded-arcade">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-scale-blue-light/40">
          <h2 id="snake-picker-title" className="heading-display text-lg text-bone-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-bone-white/10 border border-scale-blue-light/50 text-bone-white/70 hover:text-bone-white transition-colors"
            aria-label="Close picker"
            data-testid="snake-picker-close"
          >
            <IconX size={14} />
          </button>
        </div>

        {/* Snake grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {entries.length === 0 ? (
            <p className="text-center py-8 text-sm font-body text-beige/60">
              No snakes available. Unlock snakes in the Lab first.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {entries.map(({ snake, variant, dynastyName, disabled, disabledReason }) => {
                const theme = dynastyThemes[dynastyName] ?? dynastyThemes.PRIMAL;
                return (
                  <button
                    key={snake.id}
                    type="button"
                    onClick={() => {
                      if (!disabled) onSelect(snake.id);
                    }}
                    disabled={disabled}
                    className="relative rounded-arcade overflow-hidden text-left border-2 bg-void-deep/60 transition-all focus:outline-none focus-visible:ring-2 enabled:hover:scale-[1.03] enabled:active:scale-[0.97] disabled:cursor-not-allowed"
                    style={{
                      aspectRatio: '3 / 4',
                      borderColor: disabled ? 'rgba(230,237,243,0.1)' : theme.glow,
                      boxShadow: disabled ? undefined : `0 0 14px -6px ${theme.glow}`,
                      opacity: disabled ? 0.4 : 1,
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
                    <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 text-center bg-void-deep/80 border-t border-scale-blue-light/30">
                      <p
                        className="text-[10px] font-body font-semibold truncate"
                        style={{ color: theme.glow }}
                      >
                        {variant.name}
                      </p>
                      <p className="text-[9px] font-mono text-beige/60">
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
