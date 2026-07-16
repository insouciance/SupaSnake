'use client';

/**
 * VariantDetailModal - Full-screen modal for viewing owned snake details
 * Displays art, lore, stats, and action buttons (Equip, Breed, Favorite)
 * Slides up from bottom, closes on backdrop click or back button
 */

import React, { useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useDynastyTheme } from '@/hooks/useDynastyTheme';
import type { SnakeVariant, OwnedSnake, Dynasty } from '@/shared/types/snake-data-model';
import { computeEffectiveStats } from '@/shared/types/snake-data-model';
import { SnakeArt } from '@/components/lab/SnakeArt';

export interface VariantDetailModalProps {
  variant: SnakeVariant;
  owned: OwnedSnake;
  dynasty: Dynasty;
  isOpen: boolean;
  onClose: () => void;
  onEquip: () => void;
  onBreed: () => void;
  isEquipping: boolean;
  isEquipped: boolean;
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
 * Back Arrow Icon SVG Component
 */
function BackArrowIcon({ color }: { color: string }): React.ReactElement<any> {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
        fill={color}
      />
    </svg>
  );
}

/**
 * Lightning Bolt Icon for Equip button
 */
function LightningIcon({ color }: { color: string }): React.ReactElement<any> {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M7 2v11h3v9l7-12h-4l4-8z" fill={color} />
    </svg>
  );
}

/**
 * Flask Icon for Breed button
 */
function FlaskIcon({ color }: { color: string }): React.ReactElement<any> {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M19.8 18.4L14 10.67V6.5l1.35-1.69c.26-.33.03-.81-.39-.81H9.04c-.42 0-.65.48-.39.81L10 6.5v4.17L4.2 18.4c-.49.66-.02 1.6.8 1.6h14c.82 0 1.29-.94.8-1.6z"
        fill={color}
      />
    </svg>
  );
}

/**
 * Heart Icon for Favorite button
 */
function HeartIcon({
  color,
  filled,
}: {
  color: string;
  filled: boolean;
}): React.ReactElement<any> {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {filled ? (
        <path
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
          fill={color}
        />
      ) : (
        <path
          d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"
          fill={color}
        />
      )}
    </svg>
  );
}

/**
 * Checkmark Icon for Equipped state
 */
function CheckmarkIcon({ color }: { color: string }): React.ReactElement<any> {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
        fill={color}
      />
    </svg>
  );
}

/**
 * Loading Spinner for equip button
 */
function Spinner({ color }: { color: string }): React.ReactElement<any> {
  return (
    <svg
      width="20"
      height="20"
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
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="32"
        strokeDashoffset="12"
      />
    </svg>
  );
}

/**
 * Format stat bonus for display
 */
function formatStatBonus(bonusType: string, bonusValue: number): string {
  const percentage = Math.round(bonusValue * 100);
  const statName =
    bonusType === 'speed'
      ? 'speed'
      : bonusType === 'size'
        ? 'size'
        : 'DNA generation';
  return `+${percentage}% ${statName}`;
}

/**
 * Capitalize first letter of rarity
 */
function capitalizeRarity(rarity: string): string {
  return rarity.charAt(0).toUpperCase() + rarity.slice(1);
}

/**
 * VariantDetailModal Component
 *
 * Full-screen modal that displays complete snake variant details.
 * Features:
 * - Slide-up animation from bottom
 * - Full-screen art display with gradient placeholder fallback
 * - Lore text section
 * - Stats display (rarity, dynasty, generation, bonus)
 * - Action buttons: Equip, Breed, Favorite
 * - Close on backdrop click or back button
 * - Keyboard accessibility (Escape to close)
 */
export function VariantDetailModal({
  variant,
  owned,
  dynasty,
  isOpen,
  onClose,
  onEquip,
  onBreed,
  isEquipping,
  isEquipped,
}: VariantDetailModalProps): React.ReactElement<any> | null {
  const theme = useDynastyTheme(dynasty.name);
  const modalRef = useRef<HTMLDivElement>(null);
  const [isFavorited, setIsFavorited] = React.useState(owned.isFavorited);

  // Compute effective stats with generation scaling and dynasty bonus
  const effectiveStats = computeEffectiveStats(
    variant.baseStats,
    owned.generation,
    dynasty
  );

  // Handle escape key to close
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // Focus trap: focus modal when opened
  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus();
    }
  }, [isOpen]);

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  // Handle favorite toggle
  const handleFavoriteToggle = useCallback(() => {
    setIsFavorited(!isFavorited);
  }, [isFavorited]);

  // Handle breed click with tooltip
  const [showBreedTooltip, setShowBreedTooltip] = React.useState(false);
  const handleBreedClick = useCallback(() => {
    setShowBreedTooltip(true);
    setTimeout(() => setShowBreedTooltip(false), 2000);
    onBreed();
  }, [onBreed]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
      }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      data-testid="variant-detail-modal"
    >
      {/* Modal content - slides up from bottom */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className="relative w-full max-w-lg h-full max-h-[95vh] flex flex-col overflow-hidden rounded-t-2xl focus:outline-none"
        style={{
          backgroundColor: '#1a1a2e',
          animation: 'slideUp 300ms ease-out forwards',
        }}
      >
        {/* CSS for slide-up animation */}
        <style>{`
          @keyframes slideUp {
            from {
              transform: translateY(100%);
              opacity: 0;
            }
            to {
              transform: translateY(0);
              opacity: 1;
            }
          }
        `}</style>

        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{
            borderBottom: `1px solid ${hexToRgba(theme.primary, 0.3)}`,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 p-2 -ml-2 rounded-lg hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2"
            style={{
              minWidth: '44px',
              minHeight: '44px',
            }}
            aria-label="Back to collection"
          >
            <BackArrowIcon color={theme.primary} />
            <span className="text-sm text-gray-400">Back</span>
          </button>
          <h1
            id="modal-title"
            className="text-lg font-bold text-white truncate flex-1 text-right pl-4"
            style={{ color: theme.primary }}
          >
            {variant.name}
          </h1>
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto">
          {/* Art display area */}
          <div
            className="relative w-full"
            style={{
              aspectRatio: '1 / 1',
              maxHeight: '50vh',
            }}
          >
            {variant.artUrl ? (
              <Image
                src={variant.artUrl}
                alt={`${variant.name} artwork`}
                fill
                className="object-contain"
                sizes="100vw"
                style={{
                  backgroundColor: '#16213e',
                }}
              />
            ) : (
              <SnakeArt
                seed={variant.id}
                name={variant.name}
                dynasty={dynasty.name}
                primaryColor={theme.primary}
                secondaryColor={theme.secondary}
                rarity={variant.rarity}
                className="w-full h-full"
              />
            )}
          </div>

          {/* Lore text section */}
          {variant.loreText && (
            <div
              className="px-4 py-3"
              style={{
                borderBottom: `1px solid ${hexToRgba(theme.primary, 0.2)}`,
              }}
            >
              <p
                className="text-sm italic leading-relaxed"
                style={{ color: '#8892b0' }}
              >
                &ldquo;{variant.loreText}&rdquo;
              </p>
            </div>
          )}

          {/* Stats section */}
          <div className="px-4 py-3">
            {/* Primary stats row */}
            <div
              className="grid grid-cols-2 gap-3 mb-3"
              style={{
                borderBottom: `1px solid ${hexToRgba(theme.primary, 0.2)}`,
                paddingBottom: '12px',
              }}
            >
              <div>
                <span className="text-xs text-gray-500 block">Rarity</span>
                <span
                  className="text-sm font-semibold"
                  style={{ color: theme.primary }}
                >
                  {capitalizeRarity(variant.rarity)}
                </span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">Dynasty</span>
                <span className="text-sm font-semibold text-white">
                  {dynasty.displayName}
                </span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">Generation</span>
                <span className="text-sm font-semibold text-white">
                  {owned.generation}
                </span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">Bonus</span>
                <span
                  className="text-sm font-semibold"
                  style={{ color: theme.secondary }}
                >
                  {formatStatBonus(dynasty.statBonusType, dynasty.statBonusValue)}
                </span>
              </div>
            </div>

            {/* Detailed stats row */}
            <div>
              <span className="text-xs text-gray-500 block mb-2">Stats</span>
              <div className="flex gap-4">
                <div
                  className="flex-1 rounded-lg px-3 py-2 text-center"
                  style={{
                    backgroundColor: hexToRgba(theme.primary, 0.1),
                  }}
                >
                  <span className="text-xs text-gray-400 block">SPD</span>
                  <span
                    className="text-lg font-bold"
                    style={{ color: theme.primary }}
                  >
                    {effectiveStats.speed}
                  </span>
                </div>
                <div
                  className="flex-1 rounded-lg px-3 py-2 text-center"
                  style={{
                    backgroundColor: hexToRgba(theme.primary, 0.1),
                  }}
                >
                  <span className="text-xs text-gray-400 block">SIZE</span>
                  <span
                    className="text-lg font-bold"
                    style={{ color: theme.primary }}
                  >
                    {effectiveStats.size}
                  </span>
                </div>
                <div
                  className="flex-1 rounded-lg px-3 py-2 text-center"
                  style={{
                    backgroundColor: hexToRgba(theme.primary, 0.1),
                  }}
                >
                  <span className="text-xs text-gray-400 block">HP</span>
                  <span
                    className="text-lg font-bold"
                    style={{ color: theme.primary }}
                  >
                    {effectiveStats.hp}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons - fixed at bottom */}
        <div
          className="px-4 py-4 flex gap-3"
          style={{
            borderTop: `1px solid ${hexToRgba(theme.primary, 0.3)}`,
            backgroundColor: '#1a1a2e',
          }}
        >
          {/* Equip button */}
          <button
            type="button"
            onClick={onEquip}
            disabled={isEquipping || isEquipped}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg py-3 px-4 font-semibold transition-all focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed"
            style={{
              minHeight: '44px',
              backgroundColor: isEquipped
                ? hexToRgba(theme.primary, 0.2)
                : theme.primary,
              color: isEquipped ? theme.primary : theme.textOnPrimary,
              opacity: isEquipping ? 0.7 : 1,
            }}
            aria-label={
              isEquipped
                ? 'Already equipped'
                : isEquipping
                  ? 'Equipping...'
                  : 'Equip this snake'
            }
          >
            {isEquipping ? (
              <Spinner color={theme.textOnPrimary} />
            ) : isEquipped ? (
              <CheckmarkIcon color={theme.primary} />
            ) : (
              <LightningIcon color={theme.textOnPrimary} />
            )}
            <span>{isEquipped ? 'Equipped' : isEquipping ? 'Equipping...' : 'Equip'}</span>
          </button>

          {/* Breed button */}
          <div className="relative">
            <button
              type="button"
              onClick={handleBreedClick}
              className="flex items-center justify-center gap-2 rounded-lg py-3 px-4 font-semibold transition-all focus:outline-none focus-visible:ring-2"
              style={{
                minHeight: '44px',
                minWidth: '44px',
                backgroundColor: hexToRgba(theme.secondary, 0.2),
                color: theme.secondary,
              }}
              aria-label="Breed this snake (coming soon)"
            >
              <FlaskIcon color={theme.secondary} />
              <span>Breed</span>
            </button>
            {/* Coming soon tooltip */}
            {showBreedTooltip && (
              <div
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap"
                style={{
                  backgroundColor: '#16213e',
                  color: '#8892b0',
                  border: `1px solid ${hexToRgba(theme.secondary, 0.3)}`,
                }}
                role="tooltip"
              >
                Coming soon
              </div>
            )}
          </div>

          {/* Favorite button */}
          <button
            type="button"
            onClick={handleFavoriteToggle}
            className="flex items-center justify-center rounded-lg py-3 px-3 transition-all focus:outline-none focus-visible:ring-2"
            style={{
              minHeight: '44px',
              minWidth: '44px',
              backgroundColor: isFavorited
                ? hexToRgba('#ff6b6b', 0.2)
                : hexToRgba('#ff6b6b', 0.1),
            }}
            aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={isFavorited}
          >
            <HeartIcon color="#ff6b6b" filled={isFavorited} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default VariantDetailModal;
