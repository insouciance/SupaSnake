'use client';

/**
 * DynastyTabs - Horizontal tab bar for dynasty navigation
 * Supports tap and swipe gestures to switch between dynasties
 * Shows completion progress (owned/total) for each dynasty
 */

import { useCallback, useRef, useState } from 'react';
import { Dynasty } from '@/shared/types/snake-data-model';
import { useDynastyTheme } from '@/hooks/useDynastyTheme';
import { LabDynastyRune } from '@/components/lab/LabDynastyRune';

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
 * Individual dynasty seal. The canonical Genome rune makes the selector read
 * as part of the game world while the name keeps it immediately understandable.
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
        group flex min-h-[52px] min-w-0 items-center justify-center gap-1.5
        rounded-[16px] border px-1.5 py-1.5
        transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out
        focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
        focus-visible:ring-offset-void
        ${isActive ? 'bg-scale-blue/70' : 'border-transparent bg-transparent text-beige/55 hover:bg-bone-white/5'}
      `}
      style={
        isActive
          ? {
              borderColor: theme.glow,
              background: `radial-gradient(circle at 30% 20%, ${theme.glow}24, rgba(14,20,28,.88) 68%)`,
              boxShadow: `0 0 16px -7px ${theme.glow}, inset 0 0 14px -10px ${theme.glow}`,
            }
          : undefined
      }
    >
      <span
        className="h-6 w-6 shrink-0 transition-transform duration-200 group-active:scale-90"
        style={{
          color: isActive ? theme.glow : 'rgba(148, 163, 184, 0.55)',
          filter: isActive ? `drop-shadow(0 0 5px ${theme.glow})` : undefined,
        }}
      >
        <LabDynastyRune dynastyName={dynasty.name} className="h-full w-full" />
      </span>
      <span className="min-w-0 text-left leading-none">
        <span
          className="block truncate font-display text-[11px] uppercase tracking-[0.08em] sm:text-xs"
          style={{
            color: isActive ? theme.glow : undefined,
            textShadow: isActive ? `0 0 10px ${theme.glow}` : undefined,
          }}
        >
          {dynasty.name}
        </span>
        <span className="mt-1 block whitespace-nowrap font-mono text-[9px] text-beige/55 sm:text-[10px]">
          {completion.owned}/{completion.total}
        </span>
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
      className="w-full px-3 pt-2 sm:px-4"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      <div className="mx-auto grid max-w-xl grid-cols-3 gap-1 rounded-[20px] border border-scale-blue-light/35 bg-void-deep/55 p-1 shadow-panel backdrop-blur-sm">
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
