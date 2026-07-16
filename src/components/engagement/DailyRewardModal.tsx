'use client';

/**
 * DailyRewardModal - 28-Day Login Reward Calendar
 *
 * Shows the 7x4 reward calendar with claimed/today/future day states,
 * milestone highlights (days 7/14/21/28), and a claim flow that ends in
 * a success animation with the granted amounts.
 *
 * Styled to match WelcomeBackModal (engagement modal family).
 */

import { useState } from 'react';

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
      ? 'bg-gray-700/60 border-gray-600 opacity-60'
      : state === 'today'
        ? 'bg-emerald-900/60 border-emerald-400 ring-2 ring-emerald-400/60'
        : 'bg-gray-700/30 border-gray-600';

  const milestoneClasses = isMilestone && state !== 'today' ? 'border-amber-400/70' : '';

  return (
    <div
      data-testid={`day-${tier.day}`}
      data-state={state}
      data-milestone={isMilestone ? 'true' : 'false'}
      className={`relative flex flex-col items-center justify-center rounded-lg border p-1 aspect-square text-center ${stateClasses} ${milestoneClasses}`}
    >
      <span className="text-[10px] text-gray-400 leading-none">{tier.day}</span>
      <span
        className={`text-xs font-bold leading-tight ${
          isMilestone ? 'text-amber-300' : 'text-green-400'
        }`}
      >
        {tier.dna}
      </span>
      {tier.energy > 0 && (
        <span className="text-[10px] text-sky-300 leading-none">
          +{tier.energy}
          <span role="img" aria-label="energy">
            &#x26A1;
          </span>
        </span>
      )}
      {state === 'claimed' && (
        <span
          className="absolute top-0.5 right-0.5 text-[10px] text-emerald-400"
          role="img"
          aria-label="claimed"
        >
          &#x2713;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-800 rounded-xl p-6 shadow-2xl max-w-md w-full mx-4 border border-gray-700 max-h-[90vh] overflow-y-auto">
        {claimResult ? (
          /* Success state - granted amounts */
          <div className="text-center">
            <div className="text-6xl mb-4 animate-bounce">
              <span role="img" aria-label="gift">
                &#x1F381;
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Day {claimResult.dayClaimed} Claimed!
            </h2>
            {claimResult.cycleCompleted && (
              <p className="text-amber-300 font-medium mb-2">Cycle complete! Back to Day 1.</p>
            )}
            <div className="space-y-3 my-6">
              <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-2xl" role="img" aria-label="dna">
                    &#x1F9EC;
                  </span>
                  <span className="text-gray-300">DNA</span>
                </div>
                <span className="text-xl font-bold text-green-400">
                  +{claimResult.dnaGranted}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-2xl" role="img" aria-label="energy">
                    &#x26A1;
                  </span>
                  <span className="text-gray-300">Energy</span>
                </div>
                <span className="text-xl font-bold text-sky-300">
                  +{claimResult.energyGranted}
                </span>
              </div>
            </div>
            <button
              onClick={onDismiss}
              className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-lg font-bold text-white transition-all"
            >
              Awesome!
            </button>
          </div>
        ) : (
          /* Calendar state */
          <>
            <div className="text-center mb-4">
              <div className="text-5xl mb-3">
                <span role="img" aria-label="calendar">
                  &#x1F4C5;
                </span>
              </div>
              <h2 className="text-2xl font-bold text-white mb-1">Daily Rewards</h2>
              <p className="text-gray-400 text-sm">
                Day <span className="text-white font-medium">{currentDay}</span> of 28
                {streak && streak.current > 0 && (
                  <>
                    {' '}
                    &middot;{' '}
                    <span className="text-orange-400">
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
                className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-lg font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isClaiming
                  ? 'Claiming...'
                  : canClaimToday
                    ? `Claim Day ${currentDay} Reward`
                    : 'Come Back Tomorrow'}
              </button>
              <button
                onClick={onDismiss}
                className="w-full py-2 text-gray-400 hover:text-gray-300 text-sm transition-colors"
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
