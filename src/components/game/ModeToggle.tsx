'use client';

/**
 * Run-mode toggle (Design v2 §7.4 + §7.2): EARN (energy-gated, rewarded)
 * vs ANOMALY (this week's modifier board - an earning run with its own
 * leaderboard) vs FREE PLAY (unlimited, rewardless practice). Rendered on
 * the pre-game overlay using the same chip pattern as the control-mode
 * toggle.
 *
 * EARN and ANOMALY are disabled at zero energy and show the server-driven
 * regen countdown instead of a dead wall - Free Play is the way to keep
 * playing. The ANOMALY chip only renders while the board is live
 * (pre-migration-021 the server reports { live: false }).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { GAME_CONFIG } from '@/shared/config/game';
import type { GameMode } from '@/lib/store/gameStore';
import {
  calculateTimeUntilNextEnergy,
  formatTimeRemaining,
} from '@/components/ui/EnergyTimer';
import { IconBolt } from '@/components/ui/icons';
import { STRAINS, type StrainId } from '@/shared/game/strains';

interface ModeToggleProps {
  mode: GameMode;
  energy: number;
  maxEnergy: number;
  energyRegenAt: string | null;
  onSelect: (mode: GameMode) => void;
  /** This week's anomaly name; null hides the ANOMALY chip (board not live). */
  anomalyName?: string | null;
  /** Genome strain favored by the current anomaly week. */
  anomalyStrain?: StrainId | null;
}

export function ModeToggle({
  mode,
  energy,
  maxEnergy,
  energyRegenAt,
  onSelect,
  anomalyName = null,
  anomalyStrain = null,
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
        {anomalyName !== null && (
          <button
            onClick={() => onSelect('anomaly')}
            disabled={outOfEnergy}
            data-testid="mode-anomaly"
            aria-pressed={mode === 'anomaly'}
            className={chipClass(mode === 'anomaly', outOfEnergy)}
          >
            <span className="inline-flex items-center gap-1.5">
              {anomalyStrain && (
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: STRAINS[anomalyStrain].color }}
                />
              )}
              ANOMALY
            </span>
          </button>
        )}
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
        <div className="space-y-2" data-testid="mode-free-hint">
          <p className="text-beige/60 text-xs font-body">
            Unlimited · no rewards — pure practice
          </p>
          <Link
            href="/training"
            className="inline-flex min-h-[44px] items-center rounded-arcade border border-[#67e8f9]/45 bg-[#67e8f9]/10 px-4 font-body text-sm text-[#67e8f9] transition-colors hover:border-[#67e8f9]/80 hover:text-bone-white"
            data-testid="training-lab-link"
          >
            Open Training Lab
          </Link>
        </div>
      ) : mode === 'anomaly' ? (
        <p className="text-beige/60 text-xs font-body" data-testid="mode-anomaly-hint">
          {anomalyName ? `This week: ${anomalyName}` : 'Weekly modifier board'}
          {anomalyStrain ? ` · ${STRAINS[anomalyStrain].name} strain` : ''} —
          normal DNA, own leaderboard
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
