'use client';

/**
 * DailyRewardModal - 28-Day Login Reward Calendar
 *
 * Shows the 7x4 reward calendar with claimed/today/future day states,
 * milestone highlights (days 7/14/21/28), and a claim flow that ends in
 * a success animation with the granted amounts.
 *
 * Styled to match WelcomeBackModal (engagement modal family):
 * elevated void panel, pop-in entrance, emissive milestone glow.
 */

import { useState } from 'react';
import {
  IconGift,
  IconDna,
  IconBolt,
  IconCheck,
} from '@/components/ui/icons';

export interface DailyRewardTier {
  day: number;
  dna: number;
  energy: number;
  bonusType: 'milestone' | 'cycle_complete' | null;
}

export interface DailyClaimResult {
  dayClaimed: number;
  dnaGranted: number;
  energyGranted: number;
  nextDay: number;
  cycleCompleted: boolean;
}

export type DayState = 'claimed' | 'today' | 'future';

/**
 * Day cell state relative to the player's cycle position.
 * currentDay always points at the next unclaimed day, so anything
 * before it is claimed; the current day is claimable only until the
 * daily claim happens.
 */
export function getDayState(
  day: number,
  currentDay: number,
  canClaimToday: boolean
): DayState {
  if (day < currentDay) return 'claimed';
  if (day === currentDay && canClaimToday) return 'today';
  return 'future';
}

interface DailyRewardModalProps {
  /** Whether to show the modal */
  isVisible: boolean;
  /** Next unclaimed day in the 28-day cycle (1-28) */
  currentDay: number;
  /** Whether today's reward can still be claimed */
  canClaimToday: boolean;
  /** All 28 reward tiers, ordered by day */
  tiers: DailyRewardTier[];
  /** Current play streak (optional flavor line) */
  streak?: { current: number; multiplier: number } | null;
  /** Performs the claim (POST) and resolves with granted amounts */
  onClaim: () => Promise<DailyClaimResult | null>;
  /** Called when the user closes the modal */
  onDismiss: () => void;
}

function DayCell({
  tier,
  state,
}: {
  tier: DailyRewardTier;
  state: DayState;
}) {
  const isMilestone = tier.bonusType !== null;

  const stateClasses =
    state === 'claimed'
      ? 'bg-void-deep/60 border-scale-blue-light/40 opacity-60'
      : state === 'today'
        ? 'bg-venom-orange/15 border-venom-orange shadow-glow-sm shadow-venom-orange/50'
        : 'bg-scale-blue/30 border-scale-blue-light/30';

  const milestoneClasses =
    isMilestone && state !== 'today' ? 'border-rarity-legendary/70' : '';

  return (
    <div
      data-testid={`day-${tier.day}`}
      data-state={state}
      data-milestone={isMilestone ? 'true' : 'false'}
      className={`relative flex flex-col items-center justify-center rounded-arcade border p-1 aspect-square text-center ${stateClasses} ${milestoneClasses}`}
    >
      <span className="text-[10px] font-mono text-beige/50 leading-none">{tier.day}</span>
      <span
        className={`text-xs font-mono font-bold leading-tight ${
          isMilestone ? 'text-rarity-legendary' : 'text-rarity-uncommon'
        }`}
      >
        {tier.dna}
      </span>
      {tier.energy > 0 && (
        <span
          className="flex items-center text-[10px] font-mono text-cyber leading-none"
          role="img"
          aria-label="energy"
        >
          +{tier.energy}
          <IconBolt size={9} />
        </span>
      )}
      {state === 'claimed' && (
        <span
          className="absolute top-0.5 right-0.5 text-rarity-uncommon"
          role="img"
          aria-label="claimed"
        >
          <IconCheck size={10} />
        </span>
      )}
    </div>
  );
}

export function DailyRewardModal({
  isVisible,
  currentDay,
  canClaimToday,
  tiers,
  streak,
  onClaim,
  onDismiss,
}: DailyRewardModalProps) {
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState<DailyClaimResult | null>(null);

  if (!isVisible || tiers.length === 0) {
    return null;
  }

  const handleClaim = async () => {
    if (isClaiming || !canClaimToday) return;
    setIsClaiming(true);
    try {
      const result = await onClaim();
      if (result) {
        setClaimResult(result);
      }
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void-deep/85 backdrop-blur-sm">
      <div
        className="panel-glow animate-pop-in p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
        style={{ '--glow': '#22d3ee' } as React.CSSProperties}
      >
        {claimResult ? (
          /* Success state - granted amounts */
          <div className="text-center">
            <IconGift
              size={56}
              className="mx-auto mb-4 text-venom-orange animate-breathe drop-shadow-[0_0_18px_rgba(34,211,238,0.6)]"
              role="img"
              aria-label="gift"
              aria-hidden={undefined}
            />
            <h2 className="heading-display text-2xl text-bone-white mb-2">
              Day {claimResult.dayClaimed} Claimed!
            </h2>
            {claimResult.cycleCompleted && (
              <p className="text-rarity-legendary font-body font-semibold mb-2">
                Cycle complete! Back to Day 1.
              </p>
            )}
            <div className="space-y-3 my-6">
              <div className="flex items-center justify-between p-3 bg-void-deep/50 border border-scale-blue-light/30 rounded-arcade">
                <div className="flex items-center gap-3">
                  <IconDna size={22} className="text-rarity-uncommon" />
                  <span className="text-beige font-body">DNA</span>
                </div>
                <span className="text-xl font-mono font-bold text-rarity-uncommon">
                  +{claimResult.dnaGranted}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-void-deep/50 border border-scale-blue-light/30 rounded-arcade">
                <div className="flex items-center gap-3">
                  <IconBolt size={22} className="text-cyber" />
                  <span className="text-beige font-body">Energy</span>
                </div>
                <span className="text-xl font-mono font-bold text-cyber">
                  +{claimResult.energyGranted}
                </span>
              </div>
            </div>
            <button onClick={onDismiss} className="btn-go w-full py-3">
              Awesome!
            </button>
          </div>
        ) : (
          /* Calendar state */
          <>
            <div className="text-center mb-4">
              <IconGift size={44} className="mx-auto mb-3 text-venom-orange" />
              <h2 className="heading-display text-2xl text-bone-white mb-1">Daily Rewards</h2>
              <p className="text-beige/70 text-sm font-body">
                Day <span className="text-bone-white font-semibold">{currentDay}</span> of 28
                {streak && streak.current > 0 && (
                  <>
                    {' '}
                    &middot;{' '}
                    <span className="text-venom-orange">
                      {streak.current}-day streak (x{streak.multiplier})
                    </span>
                  </>
                )}
              </p>
            </div>

            {/* 7x4 calendar grid */}
            <div className="grid grid-cols-7 gap-1.5 mb-6">
              {tiers.map((tier) => (
                <DayCell
                  key={tier.day}
                  tier={tier}
                  state={getDayState(tier.day, currentDay, canClaimToday)}
                />
              ))}
            </div>

            <div className="space-y-3">
              <button
                onClick={handleClaim}
                disabled={isClaiming || !canClaimToday}
                className="btn-go w-full py-3"
              >
                {isClaiming
                  ? 'Claiming...'
                  : canClaimToday
                    ? `Claim Day ${currentDay} Reward`
                    : 'Come Back Tomorrow'}
              </button>
              <button
                onClick={onDismiss}
                className="w-full py-2 text-beige/60 hover:text-beige text-sm font-body transition-colors"
              >
                Maybe Later
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default DailyRewardModal;
