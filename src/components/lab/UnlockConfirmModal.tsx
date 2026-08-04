'use client';

/**
 * UnlockConfirmModal - Confirmation dialog for unlocking snake variants
 * Panel-elevated card that pops in over the void: variant preview with
 * rarity glow, cost breakdown with DNA icons, unlock (GO) / cancel actions.
 */

import React, { useCallback, useEffect } from 'react';
import Image from 'next/image';
import { useDynastyTheme } from '@/hooks/useDynastyTheme';
import type { SnakeVariant, Dynasty } from '@/shared/types/snake-data-model';
import { normalizeDynastyName, rulesetExplainer } from '@/shared/game/rulesets';
import { RARITY_STYLE } from '@/components/lab/VariantCard';
import { IconCheck, IconDna, IconX } from '@/components/ui/icons';
import { LabDynastyRune } from '@/components/lab/LabDynastyRune';
import { SnakeArt } from '@/components/lab/SnakeArt';
import { formatAmount as formatNumber } from '@/shared/format/amount';

export interface UnlockConfirmModalProps {
  variant: SnakeVariant;
  dynasty: Dynasty;
  currentDna: number;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isUnlocking: boolean;
  error: string | null;
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
 * Capitalize first letter of each word
 */
function capitalizeRarity(rarity: string): string {
  return rarity.charAt(0).toUpperCase() + rarity.slice(1);
}

/**
 * Loading spinner for unlock in progress
 */
function LoadingSpinner(): React.ReactElement<any> {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="animate-spin"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="31.4 31.4"
        strokeDashoffset="10"
      />
    </svg>
  );
}

/**
 * DNA amount with the helix icon (replaces the old gem emoji)
 */
function DnaAmount({ value, className }: { value: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ''}`}>
      {formatNumber(value)}
      <IconDna size={14} aria-label="DNA" aria-hidden={false} role="img" />
    </span>
  );
}

/**
 * UnlockConfirmModal Component
 *
 * Modal for confirming variant unlock purchase.
 * Shows preview art (dimmed), variant info, cost breakdown,
 * and action buttons with loading/error states.
 */
export function UnlockConfirmModal({
  variant,
  dynasty,
  currentDna,
  isOpen,
  onClose,
  onConfirm,
  isUnlocking,
  error,
}: UnlockConfirmModalProps): React.ReactElement<any> | null {
  const theme = useDynastyTheme(dynasty.name);
  const rarity = RARITY_STYLE[variant.rarity] ?? RARITY_STYLE.common;

  const canAfford = currentDna >= variant.unlockCostDna;
  const dnaNeeded = variant.unlockCostDna - currentDna;
  const afterBalance = currentDna - variant.unlockCostDna;

  // Handle escape key to close
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isUnlocking) {
        onClose();
      }
    },
    [onClose, isUnlocking]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (event: React.MouseEvent) => {
      if (event.target === event.currentTarget && !isUnlocking) {
        onClose();
      }
    },
    [onClose, isUnlocking]
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-void-deep/85 sm:items-center sm:p-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="unlock-modal-title"
      data-testid="unlock-confirm-modal"
    >
      <div
        className="animate-pop-in relative w-full max-w-md overflow-hidden rounded-t-[26px] border bg-void shadow-2xl sm:rounded-[26px]"
        style={{
          borderColor: hexToRgba(theme.glow, 0.55),
          boxShadow: `0 22px 70px rgba(0,0,0,.7), 0 0 32px -16px ${hexToRgba(theme.glow, 0.7)}`,
        }}
      >
        {/* Title */}
        <div
          className="border-b px-4 py-3 text-center"
          style={{ borderColor: hexToRgba(theme.glow, 0.3) }}
        >
          <h2
            id="unlock-modal-title"
            className="heading-display truncate text-lg text-bone-white sm:text-xl"
          >
            Unlock {variant.name}?
          </h2>
          <p className="mt-1 font-body text-xs text-beige/60">
            It joins your active deck and becomes your next snake.
          </p>
        </div>

        {/* Preview Art Section - rarity glow frame */}
        <div className="px-4 pt-4">
          <div
            className="relative w-full overflow-hidden rounded-[20px] border"
            style={{
              aspectRatio: '16 / 9',
              borderColor: hexToRgba(rarity.color, 0.7),
              boxShadow:
                rarity.glowSpread > 0
                  ? `0 0 ${rarity.glowSpread + 6}px -2px ${hexToRgba(rarity.color, 0.65)}`
                  : undefined,
            }}
          >
            <div className="absolute inset-0">
              {variant.artUrl ? (
                <Image
                  src={variant.artUrl}
                  alt={`${variant.name} preview`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 640px"
                />
              ) : (
                <SnakeArt
                  seed={variant.id}
                  name={variant.name}
                  dynasty={dynasty.name}
                  primaryColor={theme.primary}
                  secondaryColor={theme.secondary}
                  rarity={variant.rarity}
                  className="absolute inset-0 h-full w-full"
                />
              )}
            </div>
            <span
              className="absolute left-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full border bg-void-deep/80 p-2 backdrop-blur-sm"
              style={{ color: theme.glow, borderColor: hexToRgba(theme.glow, 0.55) }}
              aria-hidden="true"
            >
              <LabDynastyRune dynastyName={dynasty.name} className="h-full w-full" />
            </span>
            {/* Variant name overlay */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-void-deep via-void-deep/85 to-transparent px-4 pb-3 pt-8 text-center">
              <span
                className="heading-display text-lg"
                style={{ color: theme.glow, textShadow: `0 0 12px ${hexToRgba(theme.glow, 0.6)}` }}
              >
                {variant.name}
              </span>
            </div>
          </div>
        </div>

        {/* Lore Text */}
        {/* One readable commitment block, with optional flavor beneath. */}
        <div className="px-4 pt-3">
          <div
            className="rounded-[18px] border bg-void-deep/60 p-3"
            style={{ borderColor: hexToRgba(theme.glow, 0.25) }}
          >
            <div className="flex items-start justify-between gap-3">
              <span>
                <span className="block font-body text-[10px] font-bold uppercase tracking-[0.1em] text-beige/55">
                  Unlock cost
                </span>
                <DnaAmount
                  value={variant.unlockCostDna}
                  className="mt-1 font-display text-xl text-bone-white"
                />
              </span>
              <span className="text-right">
                <span className="block font-body text-[10px] font-bold uppercase tracking-[0.1em] text-beige/55">
                  Balance after
                </span>
                <DnaAmount
                  value={canAfford ? afterBalance : currentDna}
                  className={`mt-1 font-mono text-sm font-semibold ${
                    canAfford ? 'text-rarity-uncommon' : 'text-strike-red'
                  }`}
                />
              </span>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-scale-blue-light/20 pt-2">
              <span className="truncate font-body text-xs font-semibold" style={{ color: rarity.color }}>
                {capitalizeRarity(variant.rarity)}
              </span>
              <span className="truncate text-right font-body text-xs font-semibold" style={{ color: theme.glow }}>
                {dynasty.name}
              </span>
            </div>
          </div>

          <details className="group mt-2 rounded-[16px] bg-scale-blue-dark/35 px-3 py-2">
            <summary className="cursor-pointer list-none font-body text-xs font-semibold text-beige/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyber [&::-webkit-details-marker]:hidden">
              How this dynasty plays
            </summary>
            <p className="mt-2 font-body text-xs leading-relaxed text-beige/60">
              {rulesetExplainer[normalizeDynastyName(dynasty.name)]}
            </p>
          </details>

          {variant.loreText && (
            <p className="mt-2 text-center font-body text-xs italic leading-relaxed text-beige/65">
              &ldquo;{variant.loreText}&rdquo;
            </p>
          )}
        </div>

        {/* Insufficient DNA Warning */}
        {!canAfford && (
          <div className="px-4 pt-3">
            <p className="text-sm text-center font-body font-medium text-strike-red">
              Need {formatNumber(dnaNeeded)} more DNA
            </p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="px-4 pt-3">
            <p
              className="text-sm text-center font-body font-medium text-strike-red"
              role="alert"
            >
              {error}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">
          {/* Unlock Button */}
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canAfford || isUnlocking}
            className="btn-go flex min-h-[46px] flex-[1.6] items-center justify-center gap-2 rounded-full px-3 py-3 text-sm"
            aria-label={`Unlock and equip ${variant.name} for ${variant.unlockCostDna} DNA`}
            data-testid="unlock-confirm-button"
          >
            {isUnlocking ? (
              <>
                <LoadingSpinner />
                <span>Unlocking &amp; equipping...</span>
              </>
            ) : (
              <>
                <IconCheck size={16} />
                <span>Unlock &amp; Equip ({formatNumber(variant.unlockCostDna)})</span>
              </>
            )}
          </button>

          {/* Cancel Button */}
          <button
            type="button"
            onClick={onClose}
            disabled={isUnlocking}
            className="btn-neutral flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-full px-3 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Cancel unlock"
            data-testid="unlock-cancel-button"
          >
            <IconX size={16} />
            <span>Cancel</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default UnlockConfirmModal;
