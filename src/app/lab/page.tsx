'use client';

/**
 * Snake Lab - Collection Browser + Breeding
 * The meta-game: 70% of player time spent here
 */

import { useState, useEffect, useCallback } from 'react';
import { ALL_DYNASTIES, VARIANTS_BY_ID } from '@/shared/data/dynasties';
import { GAME_CONFIG } from '@/shared/config/game';
import type { DynastyId, SnakeVariant } from '@/shared/types/game';
import { useAuth } from '@/lib/auth/AuthProvider';
import { NavBar } from '@/components/ui/NavBar';
import Link from 'next/link';

interface DBCollectedSnake {
  id: string;
  variant_id: string;
  generation: number;
  acquired_at: string;
}

const DYNASTY_THEME: Record<DynastyId, { bg: string; border: string; text: string }> = {
  EMBER: { bg: 'bg-orange-600', border: 'border-orange-400', text: 'text-orange-400' },
  CRYSTAL: { bg: 'bg-cyan-600', border: 'border-cyan-400', text: 'text-cyan-400' },
  VOID: { bg: 'bg-purple-600', border: 'border-purple-400', text: 'text-purple-400' },
};

const RARITY_COLORS: Record<string, { bg: string; border: string; glow: string }> = {
  legendary: { bg: 'bg-yellow-500', border: 'border-yellow-400', glow: 'shadow-[0_0_15px_rgba(234,179,8,0.5)]' },
  epic: { bg: 'bg-purple-600', border: 'border-purple-400', glow: 'shadow-[0_0_12px_rgba(147,51,234,0.5)]' },
  rare: { bg: 'bg-blue-600', border: 'border-blue-400', glow: 'shadow-[0_0_10px_rgba(59,130,246,0.4)]' },
  uncommon: { bg: 'bg-green-600', border: 'border-green-400', glow: '' },
  common: { bg: 'bg-gray-500', border: 'border-gray-400', glow: '' },
};

export default function LabPage() {
  const { session, isAuthenticated, isLoading: authLoading } = useAuth();
  const [selectedDynasty, setSelectedDynasty] = useState<DynastyId>('EMBER');
  const [collection, setCollection] = useState<DBCollectedSnake[]>([]);
  const [selectedForBreeding, setSelectedForBreeding] = useState<string[]>([]);
  const [playerDna, setPlayerDna] = useState(0);
  const [showBreedResult, setShowBreedResult] = useState<SnakeVariant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isBreeding, setIsBreeding] = useState(false);

  const fetchPlayerData = useCallback(async () => {
    if (!session?.access_token) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/player', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (!response.ok) {
        throw new Error('Failed to load player data');
      }

      const data = await response.json();
      setCollection(data.player.collected_snakes || []);
      setPlayerDna(data.player.dna || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load collection');
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (session?.access_token) {
      fetchPlayerData();
    } else if (!authLoading) {
      setIsLoading(false);
    }
  }, [session?.access_token, authLoading, fetchPlayerData]);

  const dynasty = ALL_DYNASTIES.find(d => d.id === selectedDynasty)!;
  const collectedVariantIds = new Set(collection.map(c => c.variant_id));
  const dynastyTheme = DYNASTY_THEME[selectedDynasty];

  const handleSelectForBreeding = (snakeId: string) => {
    if (selectedForBreeding.includes(snakeId)) {
      setSelectedForBreeding(selectedForBreeding.filter(id => id !== snakeId));
    } else if (selectedForBreeding.length < 2) {
      setSelectedForBreeding([...selectedForBreeding, snakeId]);
    }
  };

  const canBreed = selectedForBreeding.length === 2 && playerDna >= GAME_CONFIG.breeding.baseCost;

  const handleBreed = async () => {
    if (!canBreed || !session?.access_token) return;

    setIsBreeding(true);
    setError(null);

    try {
      const response = await fetch('/api/breeding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          parent1_id: selectedForBreeding[0],
          parent2_id: selectedForBreeding[1],
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Breeding failed');
      }

      if (data.success) {
        const newSnake: DBCollectedSnake = {
          id: data.child.id,
          variant_id: data.child.variant_id,
          generation: data.child.generation,
          acquired_at: new Date().toISOString(),
        };
        setCollection([...collection, newSnake]);
        setPlayerDna(data.remainingDna);
        setSelectedForBreeding([]);
        setShowBreedResult(data.child.variant);
        setTimeout(() => setShowBreedResult(null), 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Breeding failed');
    } finally {
      setIsBreeding(false);
    }
  };

  // Loading state
  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen bg-scale-blue-dark text-bone-white">
        <NavBar />
        <div className="flex items-center justify-center min-h-screen pt-16">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-venom-orange border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-beige font-body">Loading your collection...</p>
          </div>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-scale-blue-dark text-bone-white">
        <NavBar />
        <div className="flex items-center justify-center min-h-screen pt-16">
          <div className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-8 text-center max-w-md space-y-6">
            <h1 className="text-4xl font-display uppercase tracking-arcade text-venom-orange">Snake Lab</h1>
            <p className="text-beige font-body">Sign in to view your snake collection and breed new variants.</p>
            <Link
              href="/login"
              className="inline-block px-8 py-3 bg-venom-orange border-[3px] border-venom-orange-dark rounded-arcade font-display uppercase tracking-arcade text-scale-blue-dark hover:bg-venom-orange-light hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              Sign In to Play
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-scale-blue-dark text-bone-white">
      <NavBar />

      {/* Content with top padding for fixed nav */}
      <div className="max-w-6xl mx-auto px-4 pt-20 pb-12">
        {/* Error banner */}
        {error && (
          <div className="mb-6 p-4 bg-strike-red/20 border-[3px] border-strike-red rounded-arcade flex items-center justify-between">
            <p className="text-strike-red font-body">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-strike-red hover:text-bone-white transition-colors"
            >
              ✕
            </button>
          </div>
        )}

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-display uppercase tracking-arcade text-venom-orange">Snake Lab</h1>
            <p className="text-beige font-body mt-1">Breed and collect your dynasty</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-sm text-beige font-body">DNA</p>
              <p className="text-2xl font-display text-venom-orange">{playerDna}</p>
            </div>
            <Link
              href="/game"
              className="px-6 py-3 bg-venom-orange border-[3px] border-venom-orange-dark rounded-arcade font-display uppercase tracking-arcade text-scale-blue-dark hover:bg-venom-orange-light hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              Play Snake
            </Link>
          </div>
        </div>

        {/* Dynasty Tabs */}
        <div className="flex gap-2 mb-8">
          {ALL_DYNASTIES.map(d => {
            const theme = DYNASTY_THEME[d.id];
            const isSelected = selectedDynasty === d.id;
            return (
              <button
                key={d.id}
                onClick={() => setSelectedDynasty(d.id)}
                className={`px-6 py-3 rounded-arcade border-[3px] font-display uppercase tracking-arcade transition-all hover:scale-[1.02] active:scale-[0.98] ${
                  isSelected
                    ? `${theme.bg} ${theme.border} text-bone-white`
                    : 'bg-scale-blue border-scale-blue-light text-beige hover:border-venom-orange'
                }`}
              >
                {d.name}
              </button>
            );
          })}
        </div>

        {/* Collection Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          {dynasty.variants.map(variant => {
            const isCollected = collectedVariantIds.has(variant.id);
            const collectedInstances = collection.filter(c => c.variant_id === variant.id);
            const rarityStyle = RARITY_COLORS[variant.rarity] || RARITY_COLORS.common;

            return (
              <div
                key={variant.id}
                className={`p-4 rounded-arcade border-[3px] transition-all hover:scale-[1.02] ${
                  isCollected
                    ? `border-scale-blue-light bg-scale-blue ${rarityStyle.glow}`
                    : 'border-scale-blue-dark bg-scale-blue-dark opacity-40'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className={`text-xs font-display uppercase px-2 py-1 rounded-arcade ${rarityStyle.bg} text-bone-white`}>
                    {variant.rarity}
                  </span>
                  {isCollected && (
                    <span className="text-xs text-beige font-body">x{collectedInstances.length}</span>
                  )}
                </div>

                <div
                  className="w-full aspect-square rounded-arcade mb-2 flex items-center justify-center border-[2px] border-scale-blue-light"
                  style={{ backgroundColor: variant.colorPrimary + '30' }}
                >
                  {isCollected ? (
                    <div
                      className="w-12 h-12 rounded-arcade"
                      style={{ backgroundColor: variant.colorPrimary }}
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-arcade bg-scale-blue-light/30" />
                  )}
                </div>

                <p className="font-body text-sm text-bone-white truncate">{variant.displayName}</p>
                <p className="text-xs text-venom-orange font-body">
                  +{(variant.stats.dnaBonus * 100).toFixed(0)}% DNA
                </p>
              </div>
            );
          })}
        </div>

        {/* Breeding Section */}
        <div className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
          <h2 className="text-2xl font-display uppercase tracking-arcade text-bone-white mb-2">Breeding Lab</h2>
          <p className="text-beige font-body mb-6">Select 2 snakes from your collection to breed</p>

          {collection.length === 0 ? (
            <div className="text-center py-8 mb-6 bg-scale-blue-dark rounded-arcade border-[2px] border-scale-blue-light">
              <p className="text-beige font-body mb-4">Your collection is empty!</p>
              <Link
                href="/game"
                className="inline-block px-6 py-3 bg-venom-orange border-[3px] border-venom-orange-dark rounded-arcade font-display uppercase tracking-arcade text-scale-blue-dark hover:bg-venom-orange-light hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                Play Snake to Earn DNA
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 mb-6">
              {collection.map(snake => {
                const variant = VARIANTS_BY_ID[snake.variant_id];
                if (!variant) return null;
                const isSelected = selectedForBreeding.includes(snake.id);

                return (
                  <button
                    key={snake.id}
                    onClick={() => handleSelectForBreeding(snake.id)}
                    className={`p-3 rounded-arcade border-[3px] transition-all hover:scale-[1.02] active:scale-[0.98] ${
                      isSelected
                        ? 'border-venom-orange bg-venom-orange/20'
                        : 'border-scale-blue-light bg-scale-blue-dark hover:border-venom-orange'
                    }`}
                  >
                    <div
                      className="w-full aspect-square rounded-arcade mb-2"
                      style={{ backgroundColor: variant.colorPrimary }}
                    />
                    <p className="text-xs font-body text-bone-white truncate">{variant.displayName}</p>
                    <p className="text-xs text-beige font-body">Gen {snake.generation}</p>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-4">
            <button
              onClick={handleBreed}
              disabled={!canBreed || isBreeding}
              className={`px-8 py-3 rounded-arcade border-[3px] font-display uppercase tracking-arcade transition-all ${
                canBreed && !isBreeding
                  ? 'bg-venom-orange border-venom-orange-dark text-scale-blue-dark hover:bg-venom-orange-light hover:scale-[1.02] active:scale-[0.98]'
                  : 'bg-scale-blue-light border-scale-blue-light text-beige cursor-not-allowed'
              }`}
            >
              {isBreeding ? 'Breeding...' : `Breed (${GAME_CONFIG.breeding.baseCost} DNA)`}
            </button>

            {selectedForBreeding.length === 2 && playerDna < GAME_CONFIG.breeding.baseCost && (
              <p className="text-strike-red font-body">Not enough DNA!</p>
            )}
          </div>

          {showBreedResult && (
            <div className="mt-6 p-4 bg-venom-orange/20 border-[3px] border-venom-orange rounded-arcade animate-pulse">
              <p className="text-venom-orange font-display uppercase">
                New snake born: {showBreedResult.displayName}!
              </p>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="mt-8 grid grid-cols-3 gap-4">
          <div className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-4 text-center">
            <p className="text-beige text-sm font-body">Collection</p>
            <p className="text-2xl font-display text-bone-white">{collection.length} / 30</p>
          </div>
          <div className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-4 text-center">
            <p className="text-beige text-sm font-body">Unique Variants</p>
            <p className="text-2xl font-display text-bone-white">{collectedVariantIds.size} / 30</p>
          </div>
          <div className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-4 text-center">
            <p className="text-beige text-sm font-body">Highest Gen</p>
            <p className="text-2xl font-display text-bone-white">
              {collection.length > 0 ? Math.max(...collection.map(c => c.generation)) : 0}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
