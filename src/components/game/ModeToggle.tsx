'use client';

/**
 * Run-mode toggle (Design v2 §7.4): EARN (energy-gated, rewarded) vs
 * FREE PLAY (unlimited, rewardless practice). Rendered on the pre-game
 * overlay using the same chip pattern as the control-mode toggle.
 *
 * EARN is disabled at zero energy and shows the server-driven regen
 * countdown instead of a dead wall - Free Play is the way to keep playing.
 */

import { useEffect, useState } from 'react';
import { GAME_CONFIG } from '@/shared/config/game';
import type { GameMode } from '@/lib/store/gameStore';
import {
  calculateTimeUntilNextEnergy,
  formatTimeRemaining,
} from '@/components/ui/EnergyTimer';
import { IconBolt } from '@/components/ui/icons';

interface ModeToggleProps {
  mode: GameMode;
  energy: number;
  maxEnergy: number;
  energyRegenAt: string | null;
  onSelect: (mode: GameMode) => void;
}

export function ModeToggle({
  mode,
  energy,
  maxEnergy,
  energyRegenAt,
  onSelect,
}: ModeToggleProps) {
  const outOfEnergy = energy < GAME_CONFIG.economy.energy.costPerGame;

  // Display-only regen countdown (server authority: the timestamp comes
  // from the server; this just renders the remaining time)
  const [regenMs, setRegenMs] = useState(0);
  useEffect(() => {
    if (!outOfEnergy) return;
    const update = () =>
      setRegenMs(calculateTimeUntilNextEnergy(energyRegenAt, energy, maxEnergy));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [outOfEnergy, energyRegenAt, energy, maxEnergy]);

  const chipClass = (selected: boolean, disabled: boolean) =>
    `px-4 py-2 min-h-[44px] rounded-arcade border font-body text-sm transition-all ${
      selected
        ? 'border-venom-orange/70 bg-venom-orange/15 text-venom-orange shadow-glow-sm shadow-venom-orange/40'
        : disabled
          ? 'border-scale-blue-light/30 bg-void/30 text-beige/40 cursor-not-allowed'
          : 'border-scale-blue-light/50 bg-void/50 text-beige hover:text-bone-white'
    }`;

  return (
    <div className="space-y-2">
      <p className="label-arcade">Mode</p>
      <div className="flex gap-2 justify-center">
        <button
          onClick={() => onSelect('earn')}
          disabled={outOfEnergy}
          data-testid="mode-earn"
          aria-pressed={mode === 'earn'}
          className={chipClass(mode === 'earn', outOfEnergy)}
        >
          <span className="inline-flex items-center gap-1">
            EARN ({GAME_CONFIG.economy.energy.costPerGame}
            <IconBolt size={14} />)
          </span>
        </button>
        <button
          onClick={() => onSelect('free')}
          data-testid="mode-free"
          aria-pressed={mode === 'free'}
          className={chipClass(mode === 'free', false)}
        >
          FREE PLAY
        </button>
      </div>
      {mode === 'free' ? (
        <p className="text-beige/60 text-xs font-body" data-testid="mode-free-hint">
          Unlimited · no rewards — pure practice
        </p>
      ) : (
        <p className="text-beige/60 text-xs font-body" data-testid="mode-earn-hint">
          Energy run — DNA, contracts, and streaks count
        </p>
      )}
      {outOfEnergy && (
        <p
          className="text-venom-orange/90 text-xs font-body"
          data-testid="mode-out-of-energy"
        >
          Out of energy — keep practicing in Free Play
          {regenMs > 0 ? ` or wait ${formatTimeRemaining(regenMs)}` : ''}
        </p>
      )}
    </div>
  );
}
