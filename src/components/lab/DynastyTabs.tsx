'use client';

/**
 * DynastyTabs - Horizontal tab bar for dynasty navigation
 * Supports tap and swipe gestures to switch between dynasties
 * Shows completion progress (owned/total) for each dynasty
 */

import { useCallback, useRef, useState } from 'react';
import { Dynasty } from '@/shared/types/snake-data-model';
import { useDynastyTheme, dynastyThemes } from '@/hooks/useDynastyTheme';

interface DynastyTabsProps {
  /** Array of dynasty objects to display as tabs */
  dynasties: Dynasty[];
  /** ID of the currently active dynasty */
  activeDynastyId: string;
  /** Callback when a dynasty tab is selected */
  onSelect: (dynastyId: string) => void;
  /** Completion counts by dynasty ID: { dynastyId: { owned: number, total: number } } */
  completionByDynasty: Record<string, { owned: number; total: number }>;
}

interface TabProps {
  dynasty: Dynasty;
  isActive: boolean;
  completion: { owned: number; total: number };
  onSelect: () => void;
}

/**
 * Individual dynasty tab with colored underline when active
 */
function Tab({ dynasty, isActive, completion, onSelect }: TabProps) {
  const theme = useDynastyTheme(dynasty.name);

  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={`tab-${dynasty.name}`}
      aria-selected={isActive}
      aria-label={`${dynasty.name} dynasty, ${completion.owned} of ${completion.total} owned`}
      role="tab"
      className={`
        flex-1 flex flex-col items-center justify-center
        min-h-[44px] px-2 py-3
        transition-all duration-200 ease-out
        focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
        focus-visible:ring-offset-[#1a1a2e]
        ${isActive ? 'bg-white/5' : 'bg-transparent hover:bg-white/5'}
      `}
      style={{
        borderBottom: isActive ? `3px solid ${theme.primary}` : '3px solid transparent',
      }}
    >
      {/* Dynasty name */}
      <span
        className={`
          font-display uppercase tracking-wide text-sm font-semibold
          transition-colors duration-200 ease-out
        `}
        style={{
          color: isActive ? theme.primary : '#8892b0',
        }}
      >
        {dynasty.name}
      </span>

      {/* Completion count */}
      <span
        className={`
          font-mono text-xs mt-0.5
          transition-colors duration-200 ease-out
        `}
        style={{
          color: isActive ? theme.primary : '#8892b0',
          opacity: isActive ? 0.9 : 0.7,
        }}
      >
        {completion.owned}/{completion.total}
      </span>
    </button>
  );
}

/**
 * DynastyTabs Component
 *
 * Horizontal tab bar for switching between dynasty collections.
 * Features:
 * - 3 equally-sized tabs (flex-1)
 * - Active tab has colored underline using dynasty primary color
 * - Completion count badge (owned/total)
 * - 44px minimum touch targets
 * - 200ms ease-out transition animations
 * - Swipe left/right gesture support
 */
export function DynastyTabs({
  dynasties,
  activeDynastyId,
  onSelect,
  completionByDynasty,
}: DynastyTabsProps) {
  // Swipe gesture tracking
  const touchStartX = useRef<number | null>(null);
  const [isSwiping, setIsSwiping] = useState(false);

  // Minimum swipe distance to trigger tab change (in pixels)
  const SWIPE_THRESHOLD = 50;

  /**
   * Get the index of a dynasty by ID
   */
  const getDynastyIndex = useCallback(
    (dynastyId: string): number => {
      return dynasties.findIndex((d) => d.id === dynastyId);
    },
    [dynasties]
  );

  /**
   * Handle touch start - record initial position
   */
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    setIsSwiping(true);
  }, []);

  /**
   * Handle touch end - determine swipe direction and switch tab
   */
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current === null) {
        setIsSwiping(false);
        return;
      }

      const touchEndX = e.changedTouches[0].clientX;
      const deltaX = touchEndX - touchStartX.current;
      const currentIndex = getDynastyIndex(activeDynastyId);

      // Swipe left (negative delta) -> next tab
      if (deltaX < -SWIPE_THRESHOLD && currentIndex < dynasties.length - 1) {
        onSelect(dynasties[currentIndex + 1].id);
      }
      // Swipe right (positive delta) -> previous tab
      else if (deltaX > SWIPE_THRESHOLD && currentIndex > 0) {
        onSelect(dynasties[currentIndex - 1].id);
      }

      touchStartX.current = null;
      setIsSwiping(false);
    },
    [activeDynastyId, dynasties, getDynastyIndex, onSelect]
  );

  /**
   * Handle touch cancel - reset state
   */
  const handleTouchCancel = useCallback(() => {
    touchStartX.current = null;
    setIsSwiping(false);
  }, []);

  /**
   * Get completion data for a dynasty, defaulting to 0/0 if not found
   */
  const getCompletion = (dynastyId: string): { owned: number; total: number } => {
    return completionByDynasty[dynastyId] ?? { owned: 0, total: 0 };
  };

  return (
    <nav
      role="tablist"
      aria-label="Dynasty selection"
      className="w-full bg-[#1a1a2e] border-b border-white/10"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      <div className="flex max-w-6xl mx-auto">
        {dynasties.map((dynasty) => (
          <Tab
            key={dynasty.id}
            dynasty={dynasty}
            isActive={dynasty.id === activeDynastyId}
            completion={getCompletion(dynasty.id)}
            onSelect={() => onSelect(dynasty.id)}
          />
        ))}
      </div>
    </nav>
  );
}

export default DynastyTabs;
