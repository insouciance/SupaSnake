'use client';

/**
 * StarterSelection - FTUE full-screen starter snake chooser
 *
 * Shown from the home page when the player owns no snakes
 * (needsStarterSelection). One card per dynasty; picking one unlocks
 * the free starter (cost 0), equips it, and routes into the game.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { SnakeArt } from '@/components/lab/SnakeArt';
import type { SnakeVariant, Dynasty } from '@/shared/types/snake-data-model';
import { buildStarterCards, type StarterCard } from './starterUtils';
import { trackEvent } from '@/lib/analytics/posthog';
import {
  AnalyticsEvents,
  createLifecycleEvent,
  createCollectionEvent,
} from '@/lib/analytics/events';

interface StarterSelectionProps {
  /** Called after the starter is unlocked + equipped (before routing) */
  onComplete?: () => void;
}

/** Emissive glow color per dynasty (DB primaries are too dark for the void) */
const DYNASTY_GLOW: Record<string, string> = {
  CYBER: '#00FFFF',
  PRIMAL: '#86efac',
  COSMIC: '#a855f7',
};

export function StarterSelection({ onComplete }: StarterSelectionProps) {
  const router = useRouter();
  const { session } = useAuth();
  const [cards, setCards] = useState<StarterCard[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = session?.access_token;

  useEffect(() => {
    const tutorialStarted = createLifecycleEvent(AnalyticsEvents.TUTORIAL_STARTED, {
      step: 'starter_selection',
    });
    trackEvent(tutorialStarted.name, { step: 'starter_selection', category: 'lifecycle' });
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const load = async () => {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [variantsRes, dynastiesRes] = await Promise.all([
          fetch('/api/variants', { headers }),
          fetch('/api/dynasties', { headers }),
        ]);

        if (!variantsRes.ok || !dynastiesRes.ok) {
          throw new Error('Failed to load starter catalog');
        }

        const variantsData: { variants: SnakeVariant[] } = await variantsRes.json();
        const dynastiesData: { dynasties: Dynasty[] } = await dynastiesRes.json();

        if (!cancelled) {
          setCards(buildStarterCards(variantsData.variants || [], dynastiesData.dynasties || []));
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError('Could not load starters. Please try again.');
          setIsLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleConfirm = async () => {
    if (!selectedVariantId || !token || isConfirming) return;
    setIsConfirming(true);
    setError(null);

    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };

      // Starters cost 0 DNA - unlock_variant RPC enforces the price
      const unlockRes = await fetch('/api/collection', {
        method: 'POST',
        headers,
        body: JSON.stringify({ variantId: selectedVariantId }),
      });

      if (!unlockRes.ok) {
        throw new Error('Failed to unlock starter');
      }

      const unlockData: { snake: { id: string } } = await unlockRes.json();

      const equipRes = await fetch('/api/collection/equip', {
        method: 'POST',
        headers,
        body: JSON.stringify({ snakeId: unlockData.snake.id }),
      });

      if (!equipRes.ok) {
        throw new Error('Failed to equip starter');
      }

      const card = cards.find((c) => c.variant.id === selectedVariantId);
      const variantSelected = createCollectionEvent(AnalyticsEvents.VARIANT_SELECTED, {});
      trackEvent(variantSelected.name, {
        variant_id: selectedVariantId,
        dynasty: card?.dynastyName ?? 'unknown',
        source: 'starter_selection',
        category: 'collection',
      });
      const tutorialCompleted = createLifecycleEvent(AnalyticsEvents.TUTORIAL_COMPLETED, {});
      trackEvent(tutorialCompleted.name, { step: 'starter_selection', category: 'lifecycle' });

      onComplete?.();
      router.push('/game');
    } catch {
      setError('Something went wrong. Please try again.');
      setIsConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 app-bg overflow-y-auto">
      <div className="min-h-full flex items-center justify-center">
        <div className="w-full max-w-4xl p-4 sm:p-8">
          <div className="text-center mb-8 animate-fade-up">
            <p className="label-arcade mb-3">Your Legacy Begins</p>
            <h1 className="heading-display text-glow-orange text-venom-orange text-3xl sm:text-5xl mb-3">
              Choose Your Snake
            </h1>
            <p className="text-beige/80 font-body">
              Pick a dynasty to begin your legacy. Your starter is free.
            </p>
          </div>

          {isLoading ? (
            <p className="text-center text-beige/60 font-mono animate-pulse">
              Loading starters...
            </p>
          ) : cards.length === 0 ? (
            <p className="text-center text-beige/60 font-mono">
              {error || 'No starters available.'}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                {cards.map((card, index) => {
                  const isSelected = selectedVariantId === card.variant.id;
                  const glow = DYNASTY_GLOW[card.dynastyName] ?? card.primaryColor;
                  return (
                    <div
                      key={card.variant.id}
                      className="animate-fade-up"
                      style={{ animationDelay: `${index * 120}ms` }}
                    >
                    <button
                      data-testid={`starter-${card.dynastyName}`}
                      onClick={() => setSelectedVariantId(card.variant.id)}
                      className={`
                        relative w-full panel-glow overflow-hidden text-left
                        transition-transform hover:scale-[1.02] active:scale-[0.98]
                        ${isSelected ? 'scale-[1.02] animate-glow-pulse' : 'opacity-90 hover:opacity-100'}
                      `}
                      style={
                        {
                          '--glow': glow,
                          '--tw-shadow-color': glow,
                        } as React.CSSProperties
                      }
                    >
                      <div className="aspect-[3/4] w-full bg-void-deep">
                        <SnakeArt
                          seed={card.variant.id}
                          name={card.variant.name}
                          dynasty={card.dynastyName}
                          primaryColor={card.primaryColor}
                          secondaryColor={card.secondaryColor}
                          rarity={card.variant.rarity}
                          className="w-full h-full"
                        />
                      </div>
                      <div className="p-3 space-y-1">
                        <div
                          className="heading-display text-sm"
                          style={{ color: glow, textShadow: `0 0 12px ${glow}55` }}
                        >
                          {card.dynastyName}
                        </div>
                        <div className="text-bone-white font-body text-sm">
                          {card.variant.name}
                        </div>
                        <div className="text-venom-orange font-mono text-xs">
                          {card.bonusText}
                        </div>
                      </div>
                      {isSelected && (
                        <span className="absolute top-2 right-2 px-2 py-0.5 bg-venom-orange text-void-deep text-xs font-display uppercase rounded-arcade">
                          Selected
                        </span>
                      )}
                    </button>
                    </div>
                  );
                })}
              </div>

              {error && (
                <p className="text-center text-strike-red font-body text-sm mb-4">{error}</p>
              )}

              <div className="flex justify-center animate-fade-up" style={{ animationDelay: '360ms' }}>
                <button
                  onClick={handleConfirm}
                  disabled={!selectedVariantId || isConfirming}
                  className="btn-go px-10 py-4 text-xl min-h-[56px]"
                >
                  {isConfirming ? 'Hatching...' : 'Confirm & Play'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default StarterSelection;
