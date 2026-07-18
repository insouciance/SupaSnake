'use client';

/**
 * VariantDetailModal - Full-screen modal for viewing owned snake details
 * Displays art, lore, stats, and action buttons (Equip, Breed, Favorite)
 * Panel-elevated sheet that pops in over the void; closes on backdrop
 * click or back button.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useDynastyTheme } from '@/hooks/useDynastyTheme';
import type { SnakeVariant, OwnedSnake, Dynasty } from '@/shared/types/snake-data-model';
import { normalizeDynastyName, rulesetExplainer } from '@/shared/game/rulesets';
import { getTraitSlots } from '@/shared/game/traits';
import { SnakeArt } from '@/components/lab/SnakeArt';
import { TraitChipRow } from '@/components/traits/TraitChip';
import { RARITY_STYLE } from '@/components/lab/VariantCard';
import { IconArrowRight, IconBolt, IconCheck, IconEgg } from '@/components/ui/icons';

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
 * Heart glyph for the Favorite toggle (no equivalent in the shared icon
 * set; inherits currentColor like the shared icons).
 */
function HeartIcon({ filled }: { filled: boolean }): React.ReactElement<any> {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M12 21l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.18L12 21z" />
    </svg>
  );
}

/**
 * Loading Spinner for equip button
 */
function Spinner(): React.ReactElement<any> {
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
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="32"
        strokeDashoffset="12"
      />
    </svg>
  );
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
 * - Pop-in entrance over a void backdrop
 * - Full art display with procedural SnakeArt fallback + rarity glow
 * - Lore text section
 * - Identity display (rarity, dynasty, prestige generation, ruleset)
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

  const rarity = RARITY_STYLE[variant.rarity] ?? RARITY_STYLE.common;

  // Design v2: stats are flat - the dynasty's identity is its ruleset,
  // not a percentage. Generation stays as prestige.

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

  // Handle breed click - parent navigates to the Breeding Lab
  const handleBreedClick = useCallback(() => {
    onBreed();
  }, [onBreed]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-void-deep/85"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      data-testid="variant-detail-modal"
    >
      {/* Modal content - panel sheet pops in over the void */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className="panel-elevated animate-pop-in relative w-full max-w-lg h-full max-h-[95vh] flex flex-col overflow-hidden rounded-arcade focus:outline-none"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: hexToRgba(theme.glow, 0.3) }}
        >
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 p-2 -ml-2 rounded-arcade hover:bg-bone-white/10 transition-colors focus:outline-none focus-visible:ring-2 min-w-[44px] min-h-[44px]"
            aria-label="Back to collection"
          >
            <IconArrowRight size={20} className="rotate-180" style={{ color: theme.glow }} />
            <span className="text-sm font-body text-beige/70">Back</span>
          </button>
          <h1
            id="modal-title"
            className="heading-display text-lg truncate flex-1 text-right pl-4"
            style={{ color: theme.glow, textShadow: `0 0 14px ${hexToRgba(theme.glow, 0.55)}` }}
          >
            {variant.name}
          </h1>
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto">
          {/* Art display area - rarity glow frame */}
          <div className="px-4 pt-4">
            <div
              className="relative w-full overflow-hidden rounded-arcade border-2 bg-void-deep/70"
              style={{
                aspectRatio: '1 / 1',
                maxHeight: '50vh',
                borderColor: hexToRgba(rarity.color, 0.8),
                boxShadow:
                  rarity.glowSpread > 0
                    ? `0 0 ${rarity.glowSpread + 8}px -2px ${hexToRgba(rarity.color, 0.7)}`
                    : undefined,
              }}
            >
              {variant.artUrl ? (
                <Image
                  src={variant.artUrl}
                  alt={`${variant.name} artwork`}
                  fill
                  className="object-contain"
                  sizes="100vw"
                />
              ) : (
                <SnakeArt
                  seed={variant.id}
                  name={variant.name}
                  dynasty={dynasty.name}
                  primaryColor={theme.primary}
                  secondaryColor={theme.secondary}
                  rarity={variant.rarity}
                  className="absolute inset-0 w-full h-full"
                />
              )}
            </div>
          </div>

          {/* Lore text section */}
          {variant.loreText && (
            <div className="px-4 pt-4">
              <p className="text-sm italic leading-relaxed font-body text-beige/80">
                &ldquo;{variant.loreText}&rdquo;
              </p>
              <div className="divider-glow mt-3" />
            </div>
          )}

          {/* Stats section */}
          <div className="px-4 py-4">
            {/* Primary stats row */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <span className="label-arcade block">Rarity</span>
                <span
                  className="text-sm font-body font-semibold"
                  style={{
                    color: rarity.color,
                    textShadow:
                      rarity.glowSpread > 0
                        ? `0 0 10px ${hexToRgba(rarity.color, 0.6)}`
                        : undefined,
                  }}
                >
                  {capitalizeRarity(variant.rarity)}
                </span>
              </div>
              <div>
                <span className="label-arcade block">Dynasty</span>
                <span className="text-sm font-body font-semibold" style={{ color: theme.glow }}>
                  {dynasty.displayName}
                </span>
              </div>
              <div>
                <span className="label-arcade block">Generation</span>
                <span className="text-sm font-body font-semibold text-bone-white">
                  Gen {owned.generation}
                </span>
              </div>
              <div>
                <span className="label-arcade block">Rules</span>
                <span className="text-sm font-body font-semibold" style={{ color: theme.glow }}>
                  {dynasty.name}
                </span>
              </div>
            </div>

            {/* Traits (Design v2 Phase 3A): permanent snake-bound
                sidegrades. Filled chips carry effect + tradeoff tooltips;
                dashed slots show unlocked-but-unfilled potential. */}
            <div className="mb-4" data-testid="variant-traits-section">
              <span className="label-arcade block mb-2">Traits</span>
              <TraitChipRow
                traits={owned.traits}
                slots={
                  owned.traitSlots ??
                  getTraitSlots(variant.rarity, owned.generation)
                }
                size="md"
              />
              {(owned.traits?.length ?? 0) === 0 && (
                <p className="text-xs mt-2 font-body text-beige/60">
                  Traitless — breed this snake to craft its lineage.
                </p>
              )}
            </div>

            {/* Ruleset identity - how this dynasty actually plays */}
            <div>
              <span className="label-arcade block mb-2">Playstyle</span>
              <p
                className="text-sm font-body leading-relaxed rounded-arcade px-3 py-2 border bg-void-deep/60 text-beige"
                style={{ borderColor: hexToRgba(theme.glow, 0.35) }}
                data-testid="variant-ruleset-explainer"
              >
                {rulesetExplainer[normalizeDynastyName(dynasty.name)]}
              </p>
            </div>
          </div>
        </div>

        {/* Action buttons - fixed at bottom */}
        <div
          className="px-4 py-4 flex gap-3 border-t bg-void/80"
          style={{ borderColor: hexToRgba(theme.glow, 0.3) }}
        >
          {/* Equip button */}
          <button
            type="button"
            onClick={onEquip}
            disabled={isEquipping || isEquipped}
            className={`${
              isEquipped ? 'btn-neutral' : 'btn-go'
            } flex-1 flex items-center justify-center gap-2 py-3 px-4 text-sm min-h-[44px] disabled:cursor-not-allowed ${
              isEquipping ? 'opacity-70' : ''
            }`}
            aria-label={
              isEquipped
                ? 'Already equipped'
                : isEquipping
                  ? 'Equipping...'
                  : 'Equip this snake'
            }
          >
            {isEquipping ? (
              <Spinner />
            ) : isEquipped ? (
              <IconCheck size={18} />
            ) : (
              <IconBolt size={18} />
            )}
            <span>{isEquipped ? 'Equipped' : isEquipping ? 'Equipping...' : 'Equip'}</span>
          </button>

          {/* Breed button */}
          <button
            type="button"
            onClick={handleBreedClick}
            className="btn-neutral flex items-center justify-center gap-2 py-3 px-4 text-sm min-h-[44px] min-w-[44px]"
            aria-label="Breed this snake"
          >
            <IconEgg size={18} />
            <span>Breed</span>
          </button>

          {/* Favorite button */}
          <button
            type="button"
            onClick={handleFavoriteToggle}
            className={`btn-arcade flex items-center justify-center py-3 px-3 min-h-[44px] min-w-[44px] border-strike-red/60 bg-void/60 transition-colors ${
              isFavorited ? 'text-strike-red' : 'text-strike-red/60 hover:text-strike-red'
            }`}
            style={
              isFavorited
                ? { boxShadow: '0 0 12px -4px #f43f5e' }
                : undefined
            }
            aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={isFavorited}
          >
            <HeartIcon filled={isFavorited} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default VariantDetailModal;
