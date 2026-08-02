'use client';

/**
 * VariantDetailModal - Full-screen modal for viewing owned snake details
 * Displays art, the variant's roster, lore, stats, and action buttons
 * (Equip, Breed, Favorite). Panel-elevated sheet that pops in over the void;
 * closes on backdrop click or back button.
 *
 * `owned` means THE SELECTED SNAKE. A variant with several distinct builds
 * at its highest owned generation renders a selector under the art; every
 * historical lower generation stays in pedigree/history rather than here.
 * Every stat below the selector —
 * Generation, Traits, Lineage, starting strain points - describes whichever
 * sibling is selected. That is why the fix is one prop's meaning rather than
 * a second display path.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useDynastyTheme } from '@/hooks/useDynastyTheme';
import { useDialogFocusTrap } from '@/hooks/useDialogFocusTrap';
import type { SnakeVariant, OwnedSnake, Dynasty } from '@/shared/types/snake-data-model';
import { normalizeDynastyName, rulesetExplainer } from '@/shared/game/rulesets';
import { getTraitSlots } from '@/shared/game/traits';
import { sanitizeTraits } from '@/shared/game/traits';
import { sanitizeLineage, startingStrainPoints } from '@/shared/game/lineage';
import { STRAIN_IDS, type StrainId } from '@/shared/game/strains';
import {
  CURRENT_ASCENDANCE_CURVE_VERSION,
  formatAscendanceYieldMultiplier,
} from '@/shared/game/ascendance';
import { SnakeArt } from '@/components/lab/SnakeArt';
import { TraitChipRow } from '@/components/traits/TraitChip';
import { StrainChip } from '@/components/traits/StrainChip';
import { RARITY_STYLE } from '@/components/lab/VariantCard';
import { IconArrowRight, IconBolt, IconCheck, IconDna, IconEgg, IconSnake } from '@/components/ui/icons';
import { LabDynastyRune } from '@/components/lab/LabDynastyRune';
import {
  AscendanceProgressionInstrument,
} from '@/components/progression/AscendanceProgressionInstrument';
import { buildAscendanceProgressionModel } from '@/components/progression/ascendancePresentationAdapter';

export interface VariantDetailModalProps {
  variant: SnakeVariant;
  /** The SELECTED snake of the roster below - every stat describes this one */
  owned: OwnedSnake;
  /**
   * Every active highest-generation build of this variant, in roster order.
   * Defaults to `[owned]`, so a single-build caller needs no extra wiring.
   */
  roster?: OwnedSnake[];
  /** Switch the sheet to a sibling */
  onSelectSnake?: (snake: OwnedSnake) => void;
  dynasty: Dynasty;
  isOpen: boolean;
  onClose: () => void;
  onEquip: () => void;
  onPlay?: () => void;
  onBreed: () => void;
  isEquipping: boolean;
  isLaunching?: boolean;
  isEquipped: boolean;
  /** The id of the player's equipped snake, for marking it in the roster */
  equippedSnakeId?: string | null;
  /** Equip failure for THIS sheet - never the page-wide error banner */
  equipError?: string | null;
  isUpdatingLineage?: boolean;
  onSelectLineagePrimary?: (strain: StrainId) => Promise<void>;
  /** Persist the favorite flag; the roster rule reads it */
  onToggleFavorite?: (snakeId: string, favorited: boolean) => Promise<boolean>;
  /** Exact server-authored receipt for one reversible breeding step. */
  downgradeRefundDna?: number | null;
  /** Highest generation that remains after this selected build leaves. */
  downgradeToGeneration?: number | null;
  /** A visible topology reason the action cannot currently commit. */
  downgradeBlockedReason?: string | null;
  onDowngrade?: () => void;
  isDowngrading?: boolean;
  downgradeError?: string | null;
  /** Server-backed active/retired passport; never an inventory control. */
  lineageDossierSlot?: React.ReactNode;
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
function HeartIcon({
  filled,
  size = 20,
}: {
  filled: boolean;
  size?: number;
}): React.ReactElement<any> {
  return (
    <svg
      width={size}
      height={size}
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
  roster,
  onSelectSnake,
  dynasty,
  isOpen,
  onClose,
  onEquip,
  onPlay,
  onBreed,
  isEquipping,
  isLaunching = false,
  isEquipped,
  equippedSnakeId = null,
  equipError = null,
  isUpdatingLineage = false,
  onSelectLineagePrimary,
  onToggleFavorite,
  downgradeRefundDna = null,
  downgradeToGeneration = null,
  downgradeBlockedReason = null,
  onDowngrade,
  isDowngrading = false,
  downgradeError = null,
  lineageDossierSlot,
}: VariantDetailModalProps): React.ReactElement<any> | null {
  const theme = useDynastyTheme(dynasty.name);
  const modalRef = useRef<HTMLDivElement>(null);

  const siblings = roster && roster.length > 0 ? roster : [owned];
  const isFavorited = owned.isFavorited === true;
  const [confirmingDowngrade, setConfirmingDowngrade] = useState(false);

  const rarity = RARITY_STYLE[variant.rarity] ?? RARITY_STYLE.common;
  const lineage = sanitizeLineage(owned.lineage);
  const startingPoints = startingStrainPoints(
    lineage,
    sanitizeTraits(owned.traits)
  );
  const ascendanceProgression = buildAscendanceProgressionModel({
    generation: owned.generation,
    curveVersion: CURRENT_ASCENDANCE_CURVE_VERSION,
  });

  // Base stats stay flat and Score remains build-independent. Gen4+
  // Ascendance scales Yield separately, so its multiplier is stated beside
  // generation rather than disguised as a stat tile.

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

  // Keyboard focus stays inside the sheet and returns where it started.
  // Deliberately NOT a ModalDialog migration: thirteen files hand-roll
  // role="dialog", ModalDialog anchors to the top, and this is a
  // bottom-anchored sheet - swapping it would be a visual change, not a fix.
  useDialogFocusTrap(modalRef, isOpen);

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  // Handle favorite toggle - persisted, because the roster rule reads it
  const handleFavoriteToggle = useCallback(() => {
    void onToggleFavorite?.(owned.id, !isFavorited);
  }, [onToggleFavorite, owned.id, isFavorited]);

  // Handle breed click - parent navigates to the Breeding Lab
  const handleBreedClick = useCallback(() => {
    onBreed();
  }, [onBreed]);

  useEffect(() => {
    setConfirmingDowngrade(false);
  }, [owned.id, isOpen]);

  if (!isOpen) {
    return null;
  }

  const downgradePanel =
    owned.generation > 1 && downgradeRefundDna !== null && onDowngrade ? (
      <div
        className="rounded-[16px] border border-scale-blue-light/25 bg-void-deep/70 p-3"
        data-testid="variant-downgrade"
      >
        {confirmingDowngrade ? (
          <div className="space-y-3">
            <div>
              <p className="font-body text-sm font-semibold text-bone-white">
                Refund Gen {owned.generation}?
              </p>
              <p className="mt-1 font-body text-xs leading-relaxed text-beige/70">
                This build leaves the active roster and its full breeding receipt
                returns.{' '}
                {downgradeToGeneration === owned.generation
                  ? `Another Gen ${owned.generation} build remains available.`
                  : `Gen ${downgradeToGeneration ?? Math.max(1, owned.generation - 1)} becomes this variant’s highest available generation.`}{' '}
                Pedigree history remains intact.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-neutral min-h-[44px] flex-1 px-3 py-2 text-sm"
                onClick={() => setConfirmingDowngrade(false)}
                disabled={isDowngrading}
              >
                Keep build
              </button>
              <button
                type="button"
                className="btn-go inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 px-3 py-2 text-sm"
                onClick={onDowngrade}
                disabled={isDowngrading}
                aria-label={`Confirm downgrade and refund ${downgradeRefundDna} DNA`}
              >
                {isDowngrading ? <Spinner /> : <IconDna size={16} />}
                {isDowngrading
                  ? 'Refunding…'
                  : `+${downgradeRefundDna.toLocaleString()} DNA`}
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="btn-neutral inline-flex min-h-[44px] w-full items-center justify-center gap-2 px-3 py-2 text-sm"
              onClick={() => setConfirmingDowngrade(true)}
              disabled={Boolean(downgradeBlockedReason) || isDowngrading}
              aria-label={`Downgrade generation and refund ${downgradeRefundDna} DNA`}
            >
              <IconDna size={16} />
              <span>Downgrade · +{downgradeRefundDna.toLocaleString()} DNA</span>
            </button>
            {downgradeBlockedReason && (
              <p className="mt-2 font-body text-xs text-beige/60">
                {downgradeBlockedReason}
              </p>
            )}
          </>
        )}
      </div>
    ) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-void-deep/85 sm:items-center sm:p-4"
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
        className="animate-pop-in relative flex h-full max-h-[96dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-[26px] border border-scale-blue-light/45 bg-void shadow-2xl focus:outline-none sm:h-auto sm:max-h-[92dvh] sm:rounded-[26px]"
        style={{ boxShadow: `0 22px 80px rgba(0,0,0,.72), 0 0 42px -22px ${theme.glow}` }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-3 py-2"
          style={{ borderColor: hexToRgba(theme.glow, 0.3) }}
        >
          <button
            type="button"
            onClick={onClose}
            className="-ml-1 flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-full p-2 transition-colors hover:bg-bone-white/10 focus:outline-none focus-visible:ring-2"
            aria-label="Back to collection"
          >
            <IconArrowRight size={20} className="rotate-180" style={{ color: theme.glow }} />
            <span className="text-sm font-body text-beige/70">Back</span>
          </button>
          <h1
            id="modal-title"
            className="heading-display flex-1 truncate pl-3 text-right text-base sm:text-lg"
            style={{ color: theme.glow, textShadow: `0 0 14px ${hexToRgba(theme.glow, 0.55)}` }}
          >
            {variant.name}
          </h1>
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto">
          {/* Character-first identity: art and the only run-critical facts. */}
          <div className="grid grid-cols-[minmax(112px,0.85fr)_minmax(0,1.15fr)] gap-3 px-3 pt-3 sm:grid-cols-[190px_minmax(0,1fr)] sm:px-4 sm:pt-4">
            <div
              className="relative aspect-square w-full overflow-hidden rounded-[20px] border bg-void-deep/70"
              style={{
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
                  generation={owned.generation}
                  className="absolute inset-0 w-full h-full"
                />
              )}
            </div>
            <div className="flex min-w-0 flex-col justify-center rounded-[20px] bg-scale-blue-dark/55 px-3 py-3">
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border p-2"
                  style={{ color: theme.glow, borderColor: hexToRgba(theme.glow, 0.45) }}
                >
                  <LabDynastyRune dynastyName={dynasty.name} className="h-full w-full" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-body text-[10px] font-bold uppercase tracking-[0.1em] text-beige/60">
                    {dynasty.displayName}
                  </span>
                  <span
                    className="block truncate font-body text-xs font-semibold"
                    style={{ color: rarity.color }}
                  >
                    {capitalizeRarity(variant.rarity)}
                  </span>
                </span>
              </div>
              <div className="mt-3" data-testid="variant-generation">
                <span className="block font-display text-2xl text-bone-white sm:text-3xl">
                  Gen {owned.generation}
                </span>
                <span
                  className="mt-0.5 block whitespace-nowrap font-mono text-xs font-semibold sm:text-sm"
                  style={{ color: theme.glow }}
                  data-testid="variant-yield-multiplier"
                >
                  Yield ×{formatAscendanceYieldMultiplier(owned.generation)}
                </span>
              </div>
            </div>
          </div>

          <div className="px-3 pt-3 sm:px-4" data-testid="variant-ascendance">
            <AscendanceProgressionInstrument model={ascendanceProgression} compact />
          </div>

          {/*
            Roster selector: one option per distinct top-generation build. A
            wrapping radiogroup, NOT a horizontal scroller - this sheet
            shipped a scroll bug three commits ago, and a row that scrolls
            inside a sheet that scrolls hides options behind a gesture.
            A single-snake variant renders nothing here.
          */}
          {siblings.length > 1 && (
            <div className="px-4 pt-4" data-testid="variant-roster-selector">
              <span className="label-arcade block mb-2">
                Your {variant.name} ({siblings.length})
              </span>
              <div
                role="radiogroup"
                aria-label={`Choose which ${variant.name} to view`}
                className="flex flex-wrap gap-2"
              >
                {siblings.map((snake) => {
                  const isSelected = snake.id === owned.id;
                  const snakeEquipped = snake.id === equippedSnakeId;
                  return (
                    <button
                      key={snake.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => onSelectSnake?.(snake)}
                      data-testid={`roster-option-${snake.id}`}
                      className={`flex items-center gap-1.5 rounded-arcade border px-3 py-2 min-h-[44px] font-mono text-xs transition-colors focus:outline-none focus-visible:ring-2 ${
                        isSelected
                          ? 'bg-scale-blue/70 text-bone-white'
                          : 'bg-void-deep/60 text-beige/70 hover:text-bone-white'
                      }`}
                      style={{
                        borderColor: isSelected
                          ? theme.glow
                          : hexToRgba(theme.glow, 0.25),
                        boxShadow: isSelected
                          ? `0 0 14px -6px ${theme.glow}`
                          : undefined,
                      }}
                      aria-label={
                        `Generation ${snake.generation}` +
                        (snake.isFavorited ? ', favorited' : '') +
                        (snakeEquipped ? ', equipped' : '')
                      }
                    >
                      <span>Gen {snake.generation}</span>
                      {snake.isFavorited && (
                        <span className="text-strike-red" aria-hidden="true">
                          <HeartIcon filled size={14} />
                        </span>
                      )}
                      {snakeEquipped && (
                        <span
                          className="text-venom-orange"
                          aria-hidden="true"
                        >
                          <IconCheck size={14} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Lore text section */}
          {variant.loreText && (
            <div className="px-4 pt-4">
              <p className="text-sm italic leading-relaxed font-body text-beige/80">
                &ldquo;{variant.loreText}&rdquo;
              </p>
              <div className="divider-glow mt-3" />
            </div>
          )}

          {/* Progressive detail: build first, history and reversal second. */}
          <div className="space-y-2 px-3 py-3 sm:px-4 sm:py-4">
            <details
              open
              className="group overflow-hidden rounded-[18px] border border-scale-blue-light/30 bg-void-deep/55"
            >
              <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 font-display text-xs uppercase tracking-[0.08em] text-bone-white focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyber [&::-webkit-details-marker]:hidden">
                <span>Build &amp; Genome</span>
                <IconArrowRight size={15} className="text-beige/55 transition-transform group-open:rotate-90" />
              </summary>
              <div className="border-t border-scale-blue-light/20 px-3 pb-3 pt-3">

            {/* Traits (Design v2 Phase 3A): permanent snake-bound
                sidegrades. Each filled chip is tappable — this section is
                plain layout, so a chip may safely be a button here, unlike
                the lineage row below where the chip sits inside a select. */}
            <div className="mb-4" data-testid="variant-traits-section">
              <span className="label-arcade block mb-2">Traits</span>
              <TraitChipRow
                traits={owned.traits}
                slots={
                  owned.traitSlots ??
                  getTraitSlots(variant.rarity, owned.generation)
                }
                size="md"
                interactive
              />
              {(owned.traits?.length ?? 0) === 0 && (
                <p className="text-xs mt-2 font-body text-beige/60">
                  Traitless — breed this snake to craft its lineage.
                </p>
              )}
            </div>

            {/* Genome lineage: collection-to-run bridge (§7/§8). */}
            {lineage && (
              <div className="mb-4" data-testid="variant-lineage-section">
                <span className="label-arcade block mb-2">Lineage</span>
                {/*
                  These chips stay display-only: each one is the label of a
                  select button, and a popover trigger inside it would be a
                  button inside a button — invalid, and unreachable by
                  keyboard. The strain's identity travels in the chip's
                  `aria-label` and in full in the Codex.
                */}
                <div className="flex items-center gap-2 flex-wrap">
                  {lineage.strains.map((strain) => (
                    <button
                      key={strain}
                      type="button"
                      disabled={
                        lineage.strains.length < 2 ||
                        lineage.primary === strain ||
                        !onSelectLineagePrimary ||
                        isUpdatingLineage
                      }
                      onClick={() => onSelectLineagePrimary?.(strain)}
                      className="disabled:cursor-default"
                      aria-label={
                        lineage.strains.length === 2
                          ? `${strain}${lineage.primary === strain ? ', selected primary' : ', choose as primary'}`
                          : `${strain} lineage`
                      }
                      data-testid={`lineage-primary-${strain}`}
                    >
                      <StrainChip
                        strain={strain}
                        size="md"
                        emphasis={lineage.primary === strain}
                        points={
                          lineage.strains.length === 1 || lineage.primary === strain
                            ? lineage.strength
                            : 0
                        }
                      />
                    </button>
                  ))}
                </div>
                {lineage.strains.length === 2 && lineage.strength > 0 && !lineage.primary && (
                  <p className="text-xs mt-2 font-body text-venom-orange" data-testid="lineage-primary-required">
                    Choose which strain receives the lineage point before starting a run.
                  </p>
                )}
                <div className="mt-3 rounded-arcade border border-scale-blue-light/25 bg-void-deep/60 px-3 py-2">
                  <span className="text-[10px] font-mono uppercase tracking-wide text-beige/60">
                    Starts runs with
                  </span>
                  <div className="flex gap-1.5 flex-wrap mt-1">
                    {/* Tappable: these chips stand alone, so unlike the
                        lineage-primary chips above they can be buttons. */}
                    {STRAIN_IDS.filter((strain) => (startingPoints[strain] ?? 0) > 0).map(
                      (strain) => (
                        <StrainChip
                          key={strain}
                          strain={strain}
                          points={startingPoints[strain]}
                          interactive
                        />
                      )
                    )}
                    {Object.keys(startingPoints).length === 0 && (
                      <span className="text-xs font-body text-beige/50">
                        Offer bias only
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

              </div>
            </details>

            <details className="group overflow-hidden rounded-[18px] border border-scale-blue-light/30 bg-void-deep/55">
              <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 font-display text-xs uppercase tracking-[0.08em] text-bone-white focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyber [&::-webkit-details-marker]:hidden">
                <span>Lineage, history &amp; rules</span>
                <IconArrowRight size={15} className="text-beige/55 transition-transform group-open:rotate-90" />
              </summary>
              <div className="space-y-3 border-t border-scale-blue-light/20 px-3 pb-3 pt-3">
                {lineageDossierSlot && <div>{lineageDossierSlot}</div>}

                <div>
                  <span className="label-arcade block mb-2">Playstyle</span>
                  <p
                    className="rounded-[14px] border bg-void-deep/60 px-3 py-2 font-body text-sm leading-relaxed text-beige"
                    style={{ borderColor: hexToRgba(theme.glow, 0.35) }}
                    data-testid="variant-ruleset-explainer"
                  >
                    {rulesetExplainer[normalizeDynastyName(dynasty.name)]}
                  </p>
                </div>

                {downgradeError && (
                  <p
                    className="font-body text-sm text-strike-red"
                    role="alert"
                    data-testid="variant-downgrade-error"
                  >
                    {downgradeError}
                  </p>
                )}
                {downgradePanel}
              </div>
            </details>
          </div>
        </div>

        {/* Action buttons - fixed at bottom */}
        <div
          className="px-4 py-4 flex flex-wrap gap-3 border-t bg-void/80"
          style={{ borderColor: hexToRgba(theme.glow, 0.3) }}
        >
          {/*
            Equip failures belong here, beside the control that caused them -
            not in the page banner, whose "Retry" refetches the whole
            collection and made one failure read as two.
          */}
          {equipError && (
            <p
              className="basis-full text-sm font-body text-strike-red"
              role="alert"
              data-testid="variant-equip-error"
            >
              {equipError}
            </p>
          )}

          {onPlay && (
            <button
              type="button"
              onClick={onPlay}
              disabled={isLaunching || isEquipping}
              className="btn-go flex basis-full items-center justify-center gap-2 px-4 py-3 text-sm min-h-[44px] disabled:cursor-not-allowed disabled:opacity-60"
              aria-label={`Use ${variant.name} for next run`}
            >
              {isLaunching ? <Spinner /> : <IconSnake size={18} />}
              <span>{isLaunching ? 'Equipping…' : 'Use for next run'}</span>
            </button>
          )}

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
