'use client';

/**
 * Breeding Lab - Combine two same-dynasty snakes into a new offspring.
 *
 * Two parent slots + offspring preview (cost, generation, 50/50 variant
 * hint), server-authoritative breeding via POST /api/breeding, recent
 * breedings from GET /api/breeding, and a CSS reveal animation on success.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { useAuth } from '@/lib/auth/AuthProvider';
import { useCollection } from '@/hooks/useCollection';
import { useCollectionStore } from '@/lib/stores/collectionStore';
import { useBreedingStore, type BredOffspring } from '@/lib/stores/breedingStore';
import { useDynastyTheme, dynastyThemes } from '@/hooks/useDynastyTheme';
import { useToast } from '@/components/ui/Toast';
import { validateBreedingPair, type BreedingBlockReason } from '@/lib/breeding/preview';

import { Navigation } from '@/components/ui/Navigation';
import { IconArrowRight, IconDna } from '@/components/ui/icons';
import { ParentSlot } from '@/components/breeding/ParentSlot';
import { SnakePicker, type SnakePickerEntry } from '@/components/breeding/SnakePicker';
import { BreedingReveal } from '@/components/breeding/BreedingReveal';

import type { OwnedSnake, SnakeVariant, Rarity } from '@/shared/types/snake-data-model';
import type { BreedingHistoryEntry, BreedingHistoryResponse } from '@/app/api/breeding/utils';

// =============================================================================
// HELPERS
// =============================================================================

const BLOCK_REASON_TEXT: Record<BreedingBlockReason, string> = {
  missing_parent: 'Select two parents',
  same_snake: 'Parents must be different snakes',
  different_dynasty: 'Parents must share a dynasty',
  generation_cap: 'Generation cap (50) reached',
  insufficient_dna: 'Not enough DNA',
};

interface ResolvedParent {
  snake: OwnedSnake;
  variant: SnakeVariant;
  dynastyName: string;
  dynastyId: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function BreedPage() {
  const { isAuthenticated, isLoading: authLoading, session } = useAuth();
  const { showToast } = useToast();

  // Collection data (fetched by the hook on mount)
  const { ownedSnakes, variants, dnaBalance, isLoading } = useCollection();
  const addOwnedSnake = useCollectionStore((state) => state.addOwnedSnake);
  const setDnaBalance = useCollectionStore((state) => state.setDnaBalance);

  // Breeding UI state
  const parent1Id = useBreedingStore((state) => state.parent1Id);
  const parent2Id = useBreedingStore((state) => state.parent2Id);
  const pickerSlot = useBreedingStore((state) => state.pickerSlot);
  const isBreeding = useBreedingStore((state) => state.isBreeding);
  const lastOffspring = useBreedingStore((state) => state.lastOffspring);
  const setParent = useBreedingStore((state) => state.setParent);
  const openPicker = useBreedingStore((state) => state.openPicker);
  const closePicker = useBreedingStore((state) => state.closePicker);
  const setBreeding = useBreedingStore((state) => state.setBreeding);
  const setBreedError = useBreedingStore((state) => state.setBreedError);
  const setLastOffspring = useBreedingStore((state) => state.setLastOffspring);

  // Recent breedings
  const [history, setHistory] = useState<BreedingHistoryEntry[]>([]);

  // ---------------------------------------------------------------------------
  // DERIVED DATA
  // ---------------------------------------------------------------------------

  const resolveParent = useCallback(
    (snakeId: string | null): ResolvedParent | null => {
      if (!snakeId) return null;
      const snake = ownedSnakes.find((s) => s.id === snakeId);
      if (!snake || !snake.snakeVariantId) return null;
      const variant = variants.find((v) => v.id === snake.snakeVariantId);
      if (!variant) return null;
      return {
        snake,
        variant,
        dynastyName: snake.dynastyName ?? 'CYBER',
        dynastyId: variant.dynastyId,
      };
    },
    [ownedSnakes, variants]
  );

  const parent1 = useMemo(() => resolveParent(parent1Id), [resolveParent, parent1Id]);
  const parent2 = useMemo(() => resolveParent(parent2Id), [resolveParent, parent2Id]);

  const validation = useMemo(
    () =>
      validateBreedingPair(
        parent1
          ? { id: parent1.snake.id, generation: parent1.snake.generation, dynastyId: parent1.dynastyId }
          : null,
        parent2
          ? { id: parent2.snake.id, generation: parent2.snake.generation, dynastyId: parent2.dynastyId }
          : null,
        dnaBalance
      ),
    [parent1, parent2, dnaBalance]
  );

  const theme1 = useDynastyTheme(parent1?.dynastyName ?? 'CYBER');
  const theme2 = useDynastyTheme(parent2?.dynastyName ?? parent1?.dynastyName ?? 'CYBER');

  // Picker entries: all owned snakes; when choosing the second parent,
  // restrict to the anchor parent's dynasty and exclude the anchor itself.
  const pickerEntries = useMemo((): SnakePickerEntry[] => {
    if (pickerSlot === null) return [];
    const anchor = pickerSlot === 1 ? parent2 : parent1;

    return ownedSnakes
      .map((snake): SnakePickerEntry | null => {
        if (!snake.snakeVariantId) return null;
        const variant = variants.find((v) => v.id === snake.snakeVariantId);
        if (!variant) return null;

        let disabled = false;
        let disabledReason: string | undefined;
        if (anchor) {
          if (snake.id === anchor.snake.id) {
            disabled = true;
            disabledReason = 'Selected';
          } else if (variant.dynastyId !== anchor.dynastyId) {
            disabled = true;
            disabledReason = 'Other dynasty';
          }
        }

        return {
          snake,
          variant,
          dynastyName: snake.dynastyName ?? 'CYBER',
          disabled,
          disabledReason,
        };
      })
      .filter((entry): entry is SnakePickerEntry => entry !== null);
  }, [pickerSlot, parent1, parent2, ownedSnakes, variants]);

  // ---------------------------------------------------------------------------
  // HISTORY FETCH
  // ---------------------------------------------------------------------------

  const fetchHistory = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const response = await fetch('/api/breeding', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) return;
      const data: BreedingHistoryResponse = await response.json();
      setHistory(data.history ?? []);
    } catch {
      // Non-fatal: history list simply stays empty
    }
  }, [session?.access_token]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // ---------------------------------------------------------------------------
  // BREED ACTION
  // ---------------------------------------------------------------------------

  const handleBreed = useCallback(async () => {
    if (!validation.valid || !parent1 || !parent2 || !session?.access_token) {
      return;
    }

    setBreeding(true);
    setBreedError(null);

    try {
      const response = await fetch('/api/breeding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          parent1_id: parent1.snake.id,
          parent2_id: parent2.snake.id,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error ?? 'Breeding failed');
      }

      const child = data.child;
      const variantJoin = child.variant as
        | { name?: string; rarity?: Rarity; dynasties?: { name?: string } | null }
        | null;

      // Reveal payload
      const offspring: BredOffspring = {
        id: child.id,
        snakeVariantId: child.snake_variant_id,
        variantName: variantJoin?.name ?? 'Unknown',
        dynastyName: variantJoin?.dynasties?.name ?? parent1.dynastyName,
        rarity: variantJoin?.rarity ?? null,
        generation: child.generation,
        dnaCost: data.cost ?? null,
      };
      setLastOffspring(offspring);

      // Add offspring to the collection store
      addOwnedSnake({
        id: child.id,
        playerId: parent1.snake.playerId,
        variantId: offspring.variantName,
        snakeVariantId: child.snake_variant_id,
        generation: child.generation,
        parent1Id: parent1.snake.id,
        parent2Id: parent2.snake.id,
        acquiredAt: new Date().toISOString(),
        acquiredMethod: 'bred',
        isEquipped: false,
        isFavorited: false,
        variantName: offspring.variantName,
        dynastyName: offspring.dynastyName,
      });

      // Server-authoritative DNA balance
      if (typeof data.remainingDna === 'number') {
        setDnaBalance(data.remainingDna);
      }

      fetchHistory();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Breeding failed';
      setBreedError(message);
      showToast(message, 'error');
    } finally {
      setBreeding(false);
    }
  }, [
    validation.valid,
    parent1,
    parent2,
    session?.access_token,
    setBreeding,
    setBreedError,
    setLastOffspring,
    addOwnedSnake,
    setDnaBalance,
    fetchHistory,
    showToast,
  ]);

  const handlePickerSelect = useCallback(
    (snakeId: string) => {
      if (pickerSlot !== null) {
        setParent(pickerSlot, snakeId);
      }
      closePicker();
    },
    [pickerSlot, setParent, closePicker]
  );

  // ---------------------------------------------------------------------------
  // LOADING / AUTH STATES
  // ---------------------------------------------------------------------------

  if (isLoading || authLoading) {
    return (
      <div className="app-bg min-h-screen text-bone-white">
        <Navigation />
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center animate-fade-up">
            <div className="w-16 h-16 border-4 border-venom-orange border-t-transparent rounded-full animate-spin mx-auto mb-4 shadow-glow-sm shadow-venom-orange/50" />
            <p className="text-beige/70 font-body">Loading breeding lab...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="app-bg min-h-screen text-bone-white">
        <Navigation />
        <div className="flex items-center justify-center min-h-screen px-4">
          <div className="panel-glow [--glow:#00FFFF] animate-pop-in p-8 text-center max-w-md space-y-6">
            <h1 className="heading-display text-3xl text-cyber text-glow">
              Breeding Lab
            </h1>
            <p className="text-beige/70 font-body">
              Sign in to breed your snakes and create new generations.
            </p>
            <Link href="/login" className="btn-go inline-block px-8 py-3">
              Sign In to Play
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // MAIN RENDER
  // ---------------------------------------------------------------------------

  return (
    <div className="app-bg min-h-screen flex flex-col text-bone-white pb-28 sm:pb-0 sm:pr-16">
      <Navigation />

      <div className="pt-4 flex-1">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between animate-fade-up">
            <div className="flex items-center gap-3">
              <Link
                href="/lab"
                className="btn-neutral flex items-center justify-center w-10 h-10"
                aria-label="Back to Lab"
              >
                <IconArrowRight size={18} className="rotate-180" />
              </Link>
              <h1 className="heading-display text-glow-orange text-2xl text-bone-white">
                Breeding <span className="text-venom-orange">Lab</span>
              </h1>
            </div>
            <div
              className="panel flex items-center gap-1.5 px-3 py-1.5 text-sm font-mono font-semibold text-bone-white"
              data-testid="breed-dna-balance"
            >
              <IconDna size={16} className="text-cyber" aria-label="DNA" aria-hidden={false} role="img" />
              {dnaBalance.toLocaleString('en-US')}
            </div>
          </div>

          {/* Parent slots */}
          <div className="flex items-center gap-4 animate-fade-up" style={{ animationDelay: '60ms' }}>
            <div className="flex-1">
              <ParentSlot
                label="Parent 1"
                snake={parent1?.snake ?? null}
                variant={parent1?.variant ?? null}
                dynastyName={parent1?.dynastyName ?? null}
                theme={theme1}
                onSelect={() => openPicker(1)}
                onClear={() => setParent(1, null)}
                testId="parent-slot-1"
              />
            </div>

            <div
              className="font-display text-2xl text-beige/50 shrink-0 select-none"
              aria-hidden="true"
            >
              +
            </div>

            <div className="flex-1">
              <ParentSlot
                label="Parent 2"
                snake={parent2?.snake ?? null}
                variant={parent2?.variant ?? null}
                dynastyName={parent2?.dynastyName ?? null}
                theme={theme2}
                onSelect={() => openPicker(2)}
                onClear={() => setParent(2, null)}
                testId="parent-slot-2"
              />
            </div>
          </div>

          {/* Offspring preview */}
          <div
            className="panel p-4 space-y-2 animate-fade-up"
            style={{ animationDelay: '120ms' }}
            data-testid="offspring-preview"
          >
            <h2 className="label-arcade">
              Offspring Preview
            </h2>

            <div className="flex justify-between items-center">
              <span className="text-sm font-body text-beige/70">Cost:</span>
              <span
                className="text-sm font-mono font-semibold text-bone-white inline-flex items-center gap-1"
                data-testid="breeding-cost"
              >
                {validation.cost !== null ? (
                  <>
                    {validation.cost.toLocaleString('en-US')}
                    <IconDna size={14} className="text-cyber" aria-label="DNA" aria-hidden={false} role="img" />
                  </>
                ) : (
                  '—'
                )}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm font-body text-beige/70">Generation:</span>
              <span className="text-sm font-mono font-semibold text-bone-white" data-testid="offspring-generation">
                {validation.offspringGeneration !== null ? `Gen ${validation.offspringGeneration}` : '—'}
              </span>
            </div>

            <p className="text-xs pt-1 font-body text-beige/60">
              The offspring has a 50/50 chance of taking either parent&apos;s variant.
            </p>
          </div>

          {/* Breed button */}
          <div className="space-y-2 animate-fade-up" style={{ animationDelay: '180ms' }}>
            <button
              type="button"
              onClick={handleBreed}
              disabled={!validation.valid || isBreeding}
              className="btn-go w-full py-4 text-lg min-h-[44px]"
              data-testid="breed-button"
            >
              {isBreeding ? 'Breeding...' : 'Breed'}
            </button>

            {!validation.valid && validation.reason && (
              <p className="text-xs text-center font-body text-beige/60" data-testid="breed-block-reason">
                {BLOCK_REASON_TEXT[validation.reason]}
              </p>
            )}
          </div>

          {/* Recent breedings */}
          <div className="space-y-3 animate-fade-up" style={{ animationDelay: '240ms' }}>
            <h2 className="label-arcade">
              Recent Breedings
            </h2>
            <div className="divider-glow" />

            {history.length === 0 ? (
              <p className="text-sm py-3 text-center font-body text-beige/60" data-testid="history-empty">
                No breedings yet. Combine two snakes to start a bloodline.
              </p>
            ) : (
              <ul className="space-y-2" data-testid="history-list">
                {history.map((entry) => {
                  const childDynasty =
                    entry.child?.variantName?.split(' ')[0] ?? '';
                  const theme = dynastyThemes[childDynasty] ?? dynastyThemes.CYBER;
                  return (
                    <li
                      key={entry.id}
                      className="panel px-4 py-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-body font-semibold truncate" style={{ color: theme.glow }}>
                          {entry.child
                            ? `${entry.child.variantName ?? 'Unknown'} (Gen ${entry.child.generation})`
                            : 'Offspring released'}
                        </p>
                        <p className="text-xs font-body truncate text-beige/60">
                          {entry.parent1?.variantName ?? '?'} × {entry.parent2?.variantName ?? '?'}
                        </p>
                      </div>
                      <span className="text-xs font-mono font-medium shrink-0 text-beige/60 inline-flex items-center gap-1">
                        -{entry.dnaCost}
                        <IconDna size={12} aria-label="DNA" aria-hidden={false} role="img" />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Parent picker modal */}
      <SnakePicker
        isOpen={pickerSlot !== null}
        title={`Select Parent ${pickerSlot ?? ''}`}
        entries={pickerEntries}
        onSelect={handlePickerSelect}
        onClose={closePicker}
      />

      {/* Offspring reveal */}
      {lastOffspring && (
        <BreedingReveal
          offspring={lastOffspring}
          onClose={() => setLastOffspring(null)}
        />
      )}
    </div>
  );
}
