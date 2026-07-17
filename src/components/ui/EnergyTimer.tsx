'use client';

/**
 * Energy Timer Component
 * Displays energy count and regeneration countdown
 * Server-authoritative: Timer is display-only, server calculates actual regeneration
 */

import { useState, useEffect } from 'react';
import { GAME_CONFIG } from '@/shared/config/game';
import { IconBolt } from '@/components/ui/icons';

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
        <IconBolt
          size={20}
          className={hasBonus ? 'text-cyber' : 'text-venom-orange'}
        />

        {/* Energy Pills */}
        <div className="flex gap-1">
          {Array.from({ length: maxEnergy }).map((_, i) => (
            <div
              key={i}
              className={`w-4 h-6 rounded-[2px] transition-all duration-300 ${
                i < energy
                  ? hasBonus
                    ? 'bg-cyber shadow-[0_0_8px_rgba(0,255,255,0.6)]'
                    : 'bg-venom-orange shadow-[0_0_8px_rgba(34,211,238,0.6)]'
                  : 'bg-scale-blue-light/40'
              }`}
            />
          ))}
        </div>

        {/* Bonus indicator */}
        {hasBonus && (
          <span className="text-sm font-mono font-bold text-cyber animate-pulse">
            +{bonusAmount}
          </span>
        )}

        {/* Count */}
        <span className={`text-sm font-mono font-bold ml-1 ${hasBonus ? 'text-cyber' : 'text-venom-orange'}`}>
          {energy}/{maxEnergy}
        </span>
      </div>

      {/* Timer - only when below max */}
      {mounted && !isFull && (
        <div className="flex items-center gap-1 mt-1 text-xs font-body text-beige/60">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="font-mono">Next: {formatTimeRemaining(timeRemaining)}</span>
        </div>
      )}

      {/* Bonus energy indicator */}
      {mounted && hasBonus && (
        <div className="text-xs font-body text-cyber mt-1">
          Bonus Energy
        </div>
      )}

      {/* Full indicator (only when exactly at max, not bonus) */}
      {mounted && isFull && !hasBonus && (
        <div className="text-xs font-body text-rarity-uncommon mt-1">
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
      <span className="font-body text-beige/60">Energy:</span>
      <span className={`font-mono font-bold ${hasBonus ? 'text-cyber' : 'text-venom-orange'}`}>
        {energy}/{maxEnergy}
      </span>
      {hasBonus && (
        <span className="text-xs font-mono font-bold text-cyber animate-pulse">
          +{energy - maxEnergy}
        </span>
      )}
      {mounted && showTimer && !isFull && (
        <span className="text-xs font-mono text-beige/60">
          ({formatTimeRemaining(timeRemaining)})
        </span>
      )}
    </div>
  );
}

export default EnergyTimer;
