'use client';

/**
 * VariantCard - Collection grid card for snake variants
 * Panel surface with a rarity-colored border + glow that escalates by
 * rarity (common = subtle border, legendary = pulsing gold). Owned cards
 * add the dynasty's emissive glow; locked cards are dimmed with a lock
 * overlay and a DNA cost chip. Freshly unlocked cards get a brief shimmer.
 * 3:4 aspect ratio, mobile-first.
 */

import React, { useState, useCallback } from 'react';
import Image from 'next/image';
import type { DynastyTheme } from '@/hooks/useDynastyTheme';
import type { SnakeVariant, OwnedSnake } from '@/shared/types/snake-data-model';
import { SnakeArt } from '@/components/lab/SnakeArt';
import { TraitChipRow } from '@/components/traits/TraitChip';
import { IconCheck, IconDna, IconLock } from '@/components/ui/icons';
import { describe as describeEntry } from '@/shared/game/lexicon';
import { formatAscendanceYieldMultiplier } from '@/shared/game/ascendance';
import { StrainGlyph } from '@/components/game/cockpit/CockpitGlyphs';
import { STRAINS } from '@/shared/game/strains';

export interface VariantCardProps {
  variant: SnakeVariant;
  /** The roster's representative — the snake this card shows */
  owned: OwnedSnake | null;
  /**
   * How many snakes of this variant the player owns. The card is one sticker
   * per variant, so anything above 1 is announced as well as badged.
   */
  ownedCount?: number;
  dynastyTheme: DynastyTheme;
  onTap: () => void;
  isEquipped?: boolean;
  /** Celebrate a fresh unlock with a brief shimmer sweep */
  justUnlocked?: boolean;
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
 * Rarity treatment - border color and glow strength escalate with rarity.
 * Colors track the tailwind rarity-* tokens. Shared with the detail /
 * unlock modals so card and modal glow identically.
 */
export const RARITY_STYLE: Record<
  string,
  { color: string; glowSpread: number; pulse: boolean }
> = {
  common: { color: '#9ca3af', glowSpread: 0, pulse: false },
  uncommon: { color: '#4ade80', glowSpread: 8, pulse: false },
  rare: { color: '#38bdf8', glowSpread: 12, pulse: false },
  epic: { color: '#a78bfa', glowSpread: 18, pulse: false },
  legendary: { color: '#fbbf24', glowSpread: 26, pulse: true },
};

/**
 * VariantCard Component
 *
 * Displays a snake variant in the collection grid.
 * Two states: owned (full color + dynasty glow) or locked (dimmed with
 * lock overlay). Includes tap animation (scale 95% -> 100%).
 */
export function VariantCard({
  variant,
  owned,
  ownedCount,
  dynastyTheme,
  onTap,
  isEquipped = false,
  justUnlocked = false,
}: VariantCardProps): React.ReactElement<any> {
  const [isPressed, setIsPressed] = useState(false);

  const isOwned = owned !== null;
  const rosterCount = Math.max(ownedCount ?? (isOwned ? 1 : 0), isOwned ? 1 : 0);
  const hasSiblings = isOwned && rosterCount > 1;
  const primaryColor = dynastyTheme.primary;
  const secondaryColor = dynastyTheme.secondary;
  const rarity = RARITY_STYLE[variant.rarity] ?? RARITY_STYLE.common;

  // Border: full rarity color when owned, dimmed when locked
  const borderColor = isOwned ? rarity.color : hexToRgba(rarity.color, 0.35);

  // Glow: rarity glow escalates; owned cards add the dynasty's emissive glow
  const glowParts: string[] = ['0 4px 24px rgba(0,0,0,0.5)'];
  if (isOwned && rarity.glowSpread > 0) {
    glowParts.unshift(`0 0 ${rarity.glowSpread}px -2px ${hexToRgba(rarity.color, 0.8)}`);
  }
  if (isOwned) {
    glowParts.unshift(`0 0 20px -8px ${dynastyTheme.glow}`);
  }

  const pulseLegendary = isOwned && rarity.pulse;
  const yieldMultiplier = isOwned
    ? formatAscendanceYieldMultiplier(owned.generation)
    : null;

  /*
   * The chips below stay DISPLAY-ONLY: this whole card is one `<button>`,
   * so a tap-to-explain trigger inside it would be a button inside a button
   * — invalid HTML, and unreachable by keyboard. The names are folded into
   * the card's own accessible name instead, so a screen-reader user learns
   * this snake carries Scavenger without opening the sheet; the full effect
   * and cost are one tap away in the detail modal, where the chips ARE
   * interactive.
   */
  const traitNames = (owned?.traits ?? [])
    .map((traitId) => describeEntry('trait', traitId)?.name)
    .filter((name): name is string => Boolean(name));
  const lineageNames = (owned?.lineage?.strains ?? [])
    .map((strain) => describeEntry('strain', strain)?.name)
    .filter((name): name is string => Boolean(name));

  const handlePointerDown = useCallback(() => {
    setIsPressed(true);
  }, []);

  const handlePointerUp = useCallback(() => {
    setIsPressed(false);
  }, []);

  const handlePointerLeave = useCallback(() => {
    setIsPressed(false);
  }, []);

  const handleClick = useCallback(() => {
    onTap();
  }, [onTap]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onTap();
      }
    },
    [onTap]
  );

  return (
    <button
      type="button"
      className={`group relative flex w-full cursor-pointer flex-col overflow-hidden rounded-[20px] border focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-void ${
        pulseLegendary ? 'animate-glow-pulse' : ''
      }`}
      style={
        {
          aspectRatio: '4 / 5',
          minHeight: '44px',
          minWidth: '44px',
          borderColor,
          boxShadow: pulseLegendary ? undefined : glowParts.join(', '),
          transform: isPressed ? 'scale(0.95)' : 'scale(1)',
          transition: 'transform 150ms ease-out, box-shadow 180ms ease-out',
          background: `radial-gradient(circle at 75% 18%, ${hexToRgba(dynastyTheme.glow, 0.16)}, rgba(6,9,13,.96) 62%)`,
          // Focus ring + glow-pulse color track the rarity
          '--tw-ring-color': rarity.color,
          '--tw-shadow-color': hexToRgba(rarity.color, 0.75),
        } as React.CSSProperties
      }
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={
        isOwned
          ? `${variant.name}, Generation ${owned.generation}, Yield multiplier ${yieldMultiplier}` +
            // The xN badge is decoration; the count has to be in the name or
            // a screen-reader user never learns the other snakes exist.
            (hasSiblings ? `, ${rosterCount} snakes owned` : '') +
            (isEquipped ? ', Equipped' : '') +
            (lineageNames.length > 0
              ? `, ${lineageNames.join(' and ')} lineage`
              : '') +
            (traitNames.length > 0 ? `, traits ${traitNames.join(', ')}` : '')
          : `${variant.name}, Locked, ${variant.unlockCostDna} DNA to unlock`
      }
      data-testid={`variant-card-${variant.id}`}
    >
      {/* Art container - takes most of the card space */}
      <div
        className={`relative w-full flex-1 overflow-hidden ${isOwned ? '' : 'grayscale-[0.5]'}`}
        style={{
          opacity: isOwned ? 1 : 0.4,
        }}
      >
        {variant.artUrl ? (
          <Image
            src={variant.artUrl}
            alt={`${variant.name} artwork`}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-[1.025]"
            sizes="(max-width: 768px) 50vw, 25vw"
          />
        ) : (
          <SnakeArt
            seed={variant.id}
            name={variant.name}
            dynasty={variant.name.split(' ')[0]}
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            rarity={variant.rarity}
            generation={owned?.generation}
            className="absolute inset-0 w-full h-full"
          />
        )}
      </div>

      <span
        className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-void-deep via-void-deep/92 to-transparent"
        aria-hidden="true"
      />

      {/* Lock overlay for locked variants */}
      {!isOwned && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          data-testid="lock-icon"
        >
          <div
            className="flex items-center justify-center w-14 h-14 rounded-full border bg-void-deep/75 text-bone-white/80"
            style={{ borderColor: hexToRgba(rarity.color, 0.4) }}
          >
            <IconLock size={26} />
          </div>
        </div>
      )}

      {/* Roster size (top-left corner) - this card stands for N snakes */}
      {hasSiblings && (
        <div
          className="absolute left-2 top-2 flex h-7 min-w-[28px] items-center justify-center rounded-full border bg-void-deep/85 px-1.5 font-mono text-xs font-semibold backdrop-blur-sm"
          style={{ borderColor: hexToRgba(dynastyTheme.glow, 0.55), color: dynastyTheme.glow }}
          aria-hidden="true"
          data-testid="variant-card-roster-count"
        >
          &times;{rosterCount}
        </div>
      )}

      {/* Equipped indicator (top-right corner) - orange glow badge */}
      {isOwned && isEquipped && (
        <div
          className="absolute top-2 right-2 flex items-center justify-center w-7 h-7 rounded-full bg-cta-gradient border border-venom-orange-light text-void-deep shadow-glow-sm shadow-venom-orange"
          aria-label="Equipped"
        >
          <IconCheck size={16} />
        </div>
      )}

      {/* Fresh unlock celebration: brief shimmer sweep */}
      {justUnlocked && (
        <div
          className="absolute inset-0 pointer-events-none shimmer-overlay animate-shimmer"
          aria-hidden="true"
        />
      )}

      {/* Canonical Genome marks: functional lineage identity, never wallpaper. */}
      {isOwned && owned.lineage && (
        <div
          className="absolute bottom-[48px] left-2 z-10 flex items-center gap-1"
          data-testid="variant-card-lineage"
        >
          {owned.lineage.strains.map((strain) => (
            <span
              key={strain}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border bg-void-deep/80 p-1.5 backdrop-blur-sm [&_svg]:h-full [&_svg]:w-full"
              style={{
                color: STRAINS[strain].color,
                borderColor: hexToRgba(STRAINS[strain].color, 0.55),
                boxShadow: `0 0 9px -4px ${STRAINS[strain].color}`,
              }}
              title={`${STRAINS[strain].name} lineage`}
            >
              <StrainGlyph id={strain} />
            </span>
          ))}
        </div>
      )}

      {/* Trait chips (Design v2 Phase 3A) - owned snakes with traits only */}
      {isOwned && (owned.traits?.length ?? 0) > 0 && (
        <div
          className="absolute bottom-[49px] right-2 z-10 flex max-w-[52%] justify-end overflow-hidden rounded-full bg-void-deep/70 px-1.5 py-1 backdrop-blur-sm"
          data-testid="variant-card-traits"
        >
          <TraitChipRow traits={owned.traits} size="sm" />
        </div>
      )}

      {/* Info bar at bottom */}
      <div className="relative z-10 flex min-h-[46px] w-full items-center justify-between gap-1.5 px-2.5 py-1.5">
        {/* Variant name - truncate with ellipsis */}
        <span
          className="min-w-0 flex-1 truncate text-left font-body text-xs font-bold text-bone-white sm:text-sm"
          title={variant.name}
        >
          {variant.name}
        </span>

        {/* Badge: Generation for owned, DNA cost chip for locked */}
        {isOwned ? (
          <span
            className="flex shrink-0 flex-col items-end whitespace-nowrap rounded-[9px] px-1.5 py-0.5 font-mono font-semibold leading-tight"
            style={{
              backgroundColor: hexToRgba(dynastyTheme.glow, 0.15),
              color: dynastyTheme.glow,
            }}
            data-testid="variant-card-generation-yield"
          >
            <span className="text-xs">Gen {owned.generation}</span>
            <span className="text-[10px] sm:text-[11px]">Yield ×{yieldMultiplier}</span>
          </span>
        ) : (
          <span
            className="text-xs font-mono font-semibold px-1.5 py-0.5 rounded-arcade whitespace-nowrap flex items-center gap-1 border border-scale-blue-light/40 bg-void/60 text-cyber"
            aria-label={`${variant.unlockCostDna} DNA`}
          >
            <IconDna size={12} />
            {variant.unlockCostDna}
          </span>
        )}
      </div>
    </button>
  );
}

export default VariantCard;
