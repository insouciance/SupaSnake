'use client';

/**
 * CollectionGrid - grid of snake variants; the page scrolls, not the grid
 * Panini sticker book style layout with 3-column grid
 * Displays variant cards for each snake in the current dynasty
 */

import React, { useMemo } from 'react';
import { VariantCard } from './VariantCard';
import { EmptySlot } from './EmptySlot';
import type { DynastyTheme } from '@/hooks/useDynastyTheme';
import type { SnakeVariant, OwnedSnake } from '@/shared/types/snake-data-model';

export interface CollectionGridProps {
  /** List of variants to display */
  variants: SnakeVariant[];
  /** Player's owned snakes */
  ownedSnakes: OwnedSnake[];
  /** Dynasty theme for styling */
  dynastyTheme: DynastyTheme;
  /** Callback when a variant is selected */
  onSelectVariant: (variant: SnakeVariant, owned: OwnedSnake | null) => void;
  /** Loading state */
  isLoading: boolean;
  /** ID of currently equipped snake */
  equippedSnakeId?: string;
  /** Number of empty slots to render */
  emptySlotCount?: number;
  /** Variant that was just unlocked - its card gets a brief shimmer */
  justUnlockedVariantId?: string | null;
}

/**
 * Loading skeleton card component
 * Pulsing placeholder matching variant card aspect ratio
 */
function SkeletonCard(): React.ReactElement<any> {
  return (
    <div
      className="animate-pulse rounded-arcade border border-scale-blue-light/30 bg-scale-blue-dark/80"
      style={{
        aspectRatio: '3 / 4',
        minHeight: '44px',
        minWidth: '44px',
      }}
      aria-hidden="true"
    >
      {/* Art placeholder */}
      <div className="w-full h-2/3 bg-void/80 rounded-t-arcade" />
      {/* Text placeholders */}
      <div className="p-2 space-y-2">
        <div className="h-3 bg-void/80 rounded-arcade w-3/4" />
        <div className="h-2 bg-void/80 rounded-arcade w-1/2" />
      </div>
    </div>
  );
}

/**
 * Empty state component for when no variants exist
 */
function EmptyState({ dynastyTheme }: { dynastyTheme: DynastyTheme }): React.ReactElement<any> {
  return (
    <div
      className="flex flex-col items-center justify-center py-12 px-4 animate-fade-up"
      role="status"
      aria-label="No variants available"
    >
      <div
        className="flex items-center justify-center w-16 h-16 rounded-arcade border-2 border-dashed mb-4"
        style={{ borderColor: dynastyTheme.glow, opacity: 0.5 }}
      >
        <span
          className="font-display text-2xl select-none"
          style={{ color: dynastyTheme.glow }}
          aria-hidden="true"
        >
          ?
        </span>
      </div>
      <p
        className="label-arcade text-center"
        style={{ color: dynastyTheme.glow, opacity: 0.8 }}
      >
        No variants yet
      </p>
      <p className="text-xs font-body text-beige/60 mt-1 text-center">
        Check back soon for new additions
      </p>
    </div>
  );
}

/**
 * CollectionGrid Component
 *
 * Displays a Panini sticker book style grid of snake variants.
 * Supports owned/locked states, loading skeleton, and empty slots.
 * The grid does NOT scroll internally. It used to carry
 * `overflow-y-auto overscroll-contain` inside a `flex-1 overflow-hidden`
 * parent on a `min-h-screen` (not `h-screen`) page - so its height was
 * content-driven, it never actually became scrollable, and `overscroll-contain`
 * stopped the gesture chaining to the page. Swiping or scrolling over the cards
 * did nothing while the gutters beside them scrolled normally. The page scrolls;
 * the grid just flows.
 */
export function CollectionGrid({
  variants,
  ownedSnakes,
  dynastyTheme,
  onSelectVariant,
  isLoading,
  equippedSnakeId,
  emptySlotCount = 0,
  justUnlockedVariantId = null,
}: CollectionGridProps): React.ReactElement<any> {
  /**
   * Sort variants by sortOrder (if available) or name
   */
  const sortedVariants = useMemo(() => {
    return [...variants].sort((a, b) => {
      // Primary sort by sortOrder
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      // Fallback to name
      return a.name.localeCompare(b.name);
    });
  }, [variants]);

  /**
   * Create a map of owned snakes by snakeVariantId for O(1) lookup
   */
  const ownedByVariantId = useMemo(() => {
    const map = new Map<string, OwnedSnake>();
    for (const owned of ownedSnakes) {
      if (owned.snakeVariantId) {
        map.set(owned.snakeVariantId, owned);
      }
    }
    return map;
  }, [ownedSnakes]);

  /**
   * Handle variant card tap
   */
  const handleVariantSelect = (variant: SnakeVariant): void => {
    const owned = ownedByVariantId.get(variant.id) ?? null;
    onSelectVariant(variant, owned);
  };

  // Loading state - show skeleton grid
  if (isLoading) {
    return (
      <div
        className="w-full"
        aria-busy="true"
        aria-label="Loading collection"
      >
        <div className="grid grid-cols-3 gap-4 p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCard key={`skeleton-${index}`} />
          ))}
        </div>
      </div>
    );
  }

  // Empty state - no variants available
  if (variants.length === 0 && emptySlotCount === 0) {
    return <EmptyState dynastyTheme={dynastyTheme} />;
  }

  return (
    <div
      className="w-full"
      role="grid"
      aria-label="Snake variant collection"
    >
      <div className="grid grid-cols-3 gap-3 p-4">
        {/* Render variant cards - staggered fade-up entrance */}
        {sortedVariants.map((variant, index) => {
          const owned = ownedByVariantId.get(variant.id) ?? null;
          const isEquipped = owned !== null && owned.id === equippedSnakeId;

          return (
            <div
              key={variant.id}
              className="animate-fade-up"
              style={{ animationDelay: `${Math.min(index, 11) * 40}ms` }}
            >
              <VariantCard
                variant={variant}
                owned={owned}
                dynastyTheme={dynastyTheme}
                onTap={() => handleVariantSelect(variant)}
                isEquipped={isEquipped}
                justUnlocked={justUnlockedVariantId === variant.id}
              />
            </div>
          );
        })}

        {/* Render empty slots */}
        {Array.from({ length: emptySlotCount }).map((_, index) => (
          <EmptySlot
            key={`empty-${index}`}
            dynastyTheme={dynastyTheme}
          />
        ))}
      </div>
    </div>
  );
}

export default CollectionGrid;
