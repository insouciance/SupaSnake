'use client';

/**
 * Energy Timer Component
 * Displays energy count and regeneration countdown
 * Server-authoritative: Timer is display-only, server calculates actual regeneration
 */

import { useState, useEffect } from 'react';
import { GAME_CONFIG } from '@/shared/config/game';

interface EnergyTimerProps {
  energy: number;
  maxEnergy?: number;
  energyRegenAt?: string | null; // ISO timestamp from server
  className?: string;
}

/**
 * Calculate time remaining until next energy point from server timestamp
 */
export function calculateTimeUntilNextEnergy(
  energyRegenAt: string | null | undefined,
  currentEnergy: number,
  maxEnergy: number = GAME_CONFIG.economy.energy.maxEnergy
): number {
  // At max energy, no regen needed
  if (currentEnergy >= maxEnergy) {
    return 0;
  }

  // No server timestamp, can't calculate
  if (!energyRegenAt) {
    return 0;
  }

  const regenTime = new Date(energyRegenAt).getTime();
  const now = Date.now();
  const timeUntilNext = regenTime - now;

  return Math.max(0, timeUntilNext);
}

/**
 * Format milliseconds as MM:SS
 */
export function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return '0:00';

  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function EnergyTimer({
  energy,
  maxEnergy = GAME_CONFIG.economy.energy.maxEnergy,
  energyRegenAt,
  className = '',
}: EnergyTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [mounted, setMounted] = useState(false);

  // Handle client-side mounting
  useEffect(() => {
    setMounted(true);
  }, []);

  // Timer update interval - display only, no callbacks
  useEffect(() => {
    if (!mounted) return;

    const updateTimer = () => {
      const remaining = calculateTimeUntilNextEnergy(energyRegenAt, energy, maxEnergy);
      setTimeRemaining(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [mounted, energyRegenAt, energy, maxEnergy]);

  const isFull = energy >= maxEnergy;
  const hasBonus = energy > maxEnergy;
  const bonusAmount = hasBonus ? energy - maxEnergy : 0;

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Energy Bar */}
      <div className="flex items-center gap-2">
        {/* Lightning Icon */}
        <svg
          className={`w-5 h-5 ${hasBonus ? 'text-orange-400' : 'text-yellow-400'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
            clipRule="evenodd"
          />
        </svg>

        {/* Energy Pills */}
        <div className="flex gap-1">
          {Array.from({ length: maxEnergy }).map((_, i) => (
            <div
              key={i}
              className={`w-4 h-6 rounded-sm transition-all duration-300 ${
                i < energy
                  ? hasBonus
                    ? 'bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.6)]'
                    : 'bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.5)]'
                  : 'bg-gray-700'
              }`}
            />
          ))}
        </div>

        {/* Bonus indicator */}
        {hasBonus && (
          <span className="text-sm font-bold text-orange-400 animate-pulse">
            +{bonusAmount}
          </span>
        )}

        {/* Count */}
        <span className={`text-sm font-bold ml-1 ${hasBonus ? 'text-orange-400' : 'text-yellow-400'}`}>
          {energy}/{maxEnergy}
        </span>
      </div>

      {/* Timer - only when below max */}
      {mounted && !isFull && (
        <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>Next: {formatTimeRemaining(timeRemaining)}</span>
        </div>
      )}

      {/* Bonus energy indicator */}
      {mounted && hasBonus && (
        <div className="text-xs text-orange-400 mt-1">
          Bonus Energy
        </div>
      )}

      {/* Full indicator (only when exactly at max, not bonus) */}
      {mounted && isFull && !hasBonus && (
        <div className="text-xs text-green-400 mt-1">
          Full
        </div>
      )}
    </div>
  );
}

/**
 * Compact energy display for HUD
 */
export function EnergyDisplay({
  energy,
  maxEnergy = GAME_CONFIG.economy.energy.maxEnergy,
  showTimer = true,
  energyRegenAt,
  className = '',
}: EnergyTimerProps & { showTimer?: boolean }) {
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const update = () => {
      const remaining = calculateTimeUntilNextEnergy(energyRegenAt, energy, maxEnergy);
      setTimeRemaining(remaining);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [mounted, energyRegenAt, energy, maxEnergy]);

  const isFull = energy >= maxEnergy;
  const hasBonus = energy > maxEnergy;

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span className="text-gray-500">Energy:</span>
      <span className={`font-bold ${hasBonus ? 'text-orange-400' : 'text-yellow-400'}`}>
        {energy}/{maxEnergy}
      </span>
      {hasBonus && (
        <span className="text-xs font-bold text-orange-400 animate-pulse">
          +{energy - maxEnergy}
        </span>
      )}
      {mounted && showTimer && !isFull && (
        <span className="text-xs text-gray-500">
          ({formatTimeRemaining(timeRemaining)})
        </span>
      )}
    </div>
  );
}

export default EnergyTimer;
