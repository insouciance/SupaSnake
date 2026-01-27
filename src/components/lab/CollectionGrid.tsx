'use client';

/**
 * CollectionGrid - Scrollable grid container for snake variants
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
}

/**
 * Loading skeleton card component
 * Pulsing placeholder matching variant card aspect ratio
 */
function SkeletonCard(): React.ReactElement {
  return (
    <div
      className="animate-pulse rounded-lg bg-[#16213e]"
      style={{
        aspectRatio: '3 / 4',
        minHeight: '44px',
        minWidth: '44px',
      }}
      aria-hidden="true"
    >
      {/* Art placeholder */}
      <div className="w-full h-2/3 bg-[#1a1a2e] rounded-t-lg" />
      {/* Text placeholders */}
      <div className="p-2 space-y-2">
        <div className="h-3 bg-[#1a1a2e] rounded w-3/4" />
        <div className="h-2 bg-[#1a1a2e] rounded w-1/2" />
      </div>
    </div>
  );
}

/**
 * Empty state component for when no variants exist
 */
function EmptyState({ dynastyTheme }: { dynastyTheme: DynastyTheme }): React.ReactElement {
  return (
    <div
      className="flex flex-col items-center justify-center py-12 px-4"
      role="status"
      aria-label="No variants available"
    >
      <div
        className="flex items-center justify-center w-16 h-16 rounded-full mb-4"
        style={{
          border: `2px dashed ${dynastyTheme.primary}`,
          opacity: 0.5,
        }}
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M20 6H12L10 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V8C22 6.9 21.1 6 20 6ZM20 18H4V8H20V18Z"
            fill={dynastyTheme.primary}
            opacity="0.5"
          />
        </svg>
      </div>
      <p
        className="text-sm font-medium text-center"
        style={{ color: dynastyTheme.primary, opacity: 0.7 }}
      >
        No variants yet
      </p>
      <p className="text-xs text-[#8892b0] mt-1 text-center">
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
 * Optimized for 60fps scrolling with overflow-y-auto.
 */
export function CollectionGrid({
  variants,
  ownedSnakes,
  dynastyTheme,
  onSelectVariant,
  isLoading,
  equippedSnakeId,
  emptySlotCount = 0,
}: CollectionGridProps): React.ReactElement {
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
        className="w-full overflow-y-auto overscroll-contain"
        style={{
          WebkitOverflowScrolling: 'touch',
        }}
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
      className="w-full h-full overflow-y-auto overscroll-contain"
      style={{
        WebkitOverflowScrolling: 'touch',
      }}
      role="grid"
      aria-label="Snake variant collection"
    >
      <div className="grid grid-cols-3 gap-4 p-4">
        {/* Render variant cards */}
        {sortedVariants.map((variant) => {
          const owned = ownedByVariantId.get(variant.id) ?? null;
          const isEquipped = owned !== null && owned.id === equippedSnakeId;

          return (
            <VariantCard
              key={variant.id}
              variant={variant}
              owned={owned}
              dynastyTheme={dynastyTheme}
              onTap={() => handleVariantSelect(variant)}
              isEquipped={isEquipped}
            />
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
