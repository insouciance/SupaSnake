'use client';

/**
 * UnlockConfirmModal - Confirmation dialog for unlocking snake variants
 * Shows variant preview, cost breakdown, and unlock/cancel actions
 */

import React, { useCallback, useEffect } from 'react';
import { useDynastyTheme } from '@/hooks/useDynastyTheme';
import type { SnakeVariant, Dynasty } from '@/shared/types/snake-data-model';

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
 * Format number with commas for display
 */
function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
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
 * Get dynasty bonus description
 */
function getDynastyBonusText(dynasty: Dynasty): string {
  const percentage = Math.round(dynasty.statBonusValue * 100);
  const statName = dynasty.statBonusType.replace('_', ' ');
  return `+${percentage}% ${statName}`;
}

/**
 * Capitalize first letter of each word
 */
function capitalizeRarity(rarity: string): string {
  return rarity.charAt(0).toUpperCase() + rarity.slice(1);
}

/**
 * Checkmark Icon for unlock button
 */
function CheckIcon(): React.ReactElement<any> {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * X Icon for cancel button
 */
function XIcon(): React.ReactElement<any> {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"
        fill="currentColor"
      />
    </svg>
  );
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

  const canAfford = currentDna >= variant.unlockCostDna;
  const dnaNeeded = variant.unlockCostDna - currentDna;
  const afterBalance = currentDna - variant.unlockCostDna;

  // Gradient placeholder for art
  const gradientPlaceholder = `linear-gradient(135deg, ${hexToRgba(theme.primary, 0.6)} 0%, ${hexToRgba(theme.secondary, 0.6)} 100%)`;

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
      }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="unlock-modal-title"
      data-testid="unlock-confirm-modal"
    >
      <div
        className="relative w-full max-w-md rounded-lg overflow-hidden animate-scaleIn"
        style={{
          backgroundColor: '#16213e',
          border: `2px solid ${theme.primary}`,
          boxShadow: theme.shadow,
        }}
      >
        {/* Title */}
        <div
          className="px-6 py-4 text-center"
          style={{
            borderBottom: `1px solid ${hexToRgba(theme.primary, 0.3)}`,
          }}
        >
          <h2
            id="unlock-modal-title"
            className="text-xl font-bold text-white"
          >
            Unlock {variant.name}?
          </h2>
        </div>

        {/* Preview Art Section */}
        <div className="px-6 pt-4">
          <div
            className="relative w-full rounded-lg overflow-hidden"
            style={{
              aspectRatio: '16 / 9',
              opacity: 0.6,
            }}
          >
            {variant.artUrl ? (
              <img
                src={variant.artUrl}
                alt={`${variant.name} preview`}
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div
                className="absolute inset-0 w-full h-full"
                style={{
                  background: gradientPlaceholder,
                }}
                aria-label="Artwork placeholder"
              />
            )}
            {/* Variant name overlay */}
            <div
              className="absolute bottom-0 left-0 right-0 py-2 text-center"
              style={{
                backgroundColor: hexToRgba('#000000', 0.7),
              }}
            >
              <span
                className="text-lg font-semibold"
                style={{ color: theme.primary }}
              >
                {variant.name}
              </span>
            </div>
          </div>
        </div>

        {/* Lore Text */}
        {variant.loreText && (
          <div className="px-6 pt-4">
            <p
              className="text-sm italic text-center"
              style={{ color: '#8892b0' }}
            >
              &ldquo;{variant.loreText}&rdquo;
            </p>
          </div>
        )}

        {/* Info Section */}
        <div className="px-6 pt-4">
          <div
            className="rounded-lg p-4"
            style={{
              backgroundColor: hexToRgba('#000000', 0.3),
              border: `1px solid ${hexToRgba(theme.primary, 0.2)}`,
            }}
          >
            {/* Rarity */}
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm" style={{ color: '#8892b0' }}>
                Rarity:
              </span>
              <span className="text-sm font-medium text-white">
                {capitalizeRarity(variant.rarity)}
              </span>
            </div>

            {/* Dynasty */}
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm" style={{ color: '#8892b0' }}>
                Dynasty:
              </span>
              <span className="text-sm font-medium" style={{ color: theme.primary }}>
                {dynasty.name} ({getDynastyBonusText(dynasty)})
              </span>
            </div>

            {/* Divider */}
            <div
              className="my-3"
              style={{
                borderTop: `1px solid ${hexToRgba(theme.primary, 0.2)}`,
              }}
            />

            {/* Cost */}
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm" style={{ color: '#8892b0' }}>
                Cost:
              </span>
              <span className="text-sm font-semibold text-white">
                {formatNumber(variant.unlockCostDna)} <span role="img" aria-label="DNA">💎</span>
              </span>
            </div>

            {/* Your DNA */}
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm" style={{ color: '#8892b0' }}>
                Your DNA:
              </span>
              <span
                className="text-sm font-semibold"
                style={{ color: canAfford ? '#4ade80' : '#f87171' }}
              >
                {formatNumber(currentDna)} <span role="img" aria-label="DNA">💎</span>
              </span>
            </div>

            {/* After Balance */}
            <div className="flex justify-between items-center">
              <span className="text-sm" style={{ color: '#8892b0' }}>
                After:
              </span>
              <span
                className="text-sm font-semibold"
                style={{ color: canAfford ? '#4ade80' : '#f87171' }}
              >
                {canAfford ? formatNumber(afterBalance) : formatNumber(currentDna)} <span role="img" aria-label="DNA">💎</span>
              </span>
            </div>
          </div>
        </div>

        {/* Insufficient DNA Warning */}
        {!canAfford && (
          <div className="px-6 pt-3">
            <p
              className="text-sm text-center font-medium"
              style={{ color: '#f87171' }}
            >
              Need {formatNumber(dnaNeeded)} more DNA
            </p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="px-6 pt-3">
            <p
              className="text-sm text-center font-medium"
              style={{ color: '#f87171' }}
              role="alert"
            >
              {error}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="px-6 py-5 flex gap-3">
          {/* Unlock Button */}
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canAfford || isUnlocking}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-semibold transition-all duration-150"
            style={{
              backgroundColor: canAfford && !isUnlocking ? theme.primary : hexToRgba(theme.primary, 0.3),
              color: canAfford && !isUnlocking ? theme.textOnPrimary : hexToRgba('#ffffff', 0.5),
              cursor: canAfford && !isUnlocking ? 'pointer' : 'not-allowed',
              minHeight: '44px',
            }}
            aria-label={`Unlock ${variant.name} for ${variant.unlockCostDna} DNA`}
            data-testid="unlock-confirm-button"
          >
            {isUnlocking ? (
              <>
                <LoadingSpinner />
                <span>Unlocking...</span>
              </>
            ) : (
              <>
                <CheckIcon />
                <span>Unlock ({formatNumber(variant.unlockCostDna)})</span>
              </>
            )}
          </button>

          {/* Cancel Button */}
          <button
            type="button"
            onClick={onClose}
            disabled={isUnlocking}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-semibold transition-all duration-150"
            style={{
              backgroundColor: hexToRgba('#ffffff', 0.1),
              color: isUnlocking ? hexToRgba('#ffffff', 0.5) : '#ffffff',
              cursor: isUnlocking ? 'not-allowed' : 'pointer',
              minHeight: '44px',
              border: `1px solid ${hexToRgba('#ffffff', 0.2)}`,
            }}
            aria-label="Cancel unlock"
            data-testid="unlock-cancel-button"
          >
            <XIcon />
            <span>Cancel</span>
          </button>
        </div>
      </div>

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 200ms ease-out;
        }

        .animate-scaleIn {
          animation: scaleIn 200ms ease-out;
        }

        .animate-spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

export default UnlockConfirmModal;
