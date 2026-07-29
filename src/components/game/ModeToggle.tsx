'use client';

/**
 * Run-mode toggle (Design v2 §7.4 + §7.2): EARN (rewarded) vs ANOMALY (this
 * week's modifier board - an earning run with its own leaderboard) vs FREE
 * PLAY (unlimited, rewardless practice). Rendered on the pre-game overlay
 * as a compact three-choice chip group.
 *
 * NO MODE IS EVER DISABLED BY THE ENVELOPE (Constitution §8.6). EARN and
 * ANOMALY used to be greyed out at zero energy, with Free Play offered as
 * the consolation - the "second-class run" the Constitution abolished. An
 * empty allotment now changes one thing only: the run harvests lean. It is
 * still an earning run, it still Scores, it still ranks.
 *
 * The ANOMALY chip only renders while the board is live (pre-migration-021
 * the server reports { live: false }).
 */

import Link from 'next/link';
import type { GameMode } from '@/lib/store/gameStore';
import type { ChargeStatus } from '@/shared/game/energyEnvelope';
import { IconBolt } from '@/components/ui/icons';
import { STRAINS, type StrainId } from '@/shared/game/strains';

interface ModeToggleProps {
  mode: GameMode;
  /** The day's charge status; null hides all envelope copy (ramp/pre-sync). */
  charge: ChargeStatus | null;
  onSelect: (mode: GameMode) => void;
  /** This week's anomaly name; null hides the ANOMALY chip (board not live). */
  anomalyName?: string | null;
  /** Genome strain favored by the current anomaly week. */
  anomalyStrain?: StrainId | null;
}

export function ModeToggle({
  mode,
  charge,
  onSelect,
  anomalyName = null,
  anomalyStrain = null,
}: ModeToggleProps) {
  const leanNext = charge !== null && charge.remaining <= 0;

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
          data-testid="mode-earn"
          aria-pressed={mode === 'earn'}
          className={chipClass(mode === 'earn', false)}
        >
          <span className="inline-flex items-center gap-1">
            EARN
            {charge !== null && !leanNext && <IconBolt size={14} />}
          </span>
        </button>
        {anomalyName !== null && (
          <button
            onClick={() => onSelect('anomaly')}
            data-testid="mode-anomaly"
            aria-pressed={mode === 'anomaly'}
            className={chipClass(mode === 'anomaly', false)}
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
          DNA, contracts, and streaks count
        </p>
      )}
      {leanNext && mode !== 'free' && (
        <p
          className="text-beige/70 text-xs font-body"
          data-testid="mode-lean-harvest"
        >
          Today&apos;s rich harvest is spent — this run still counts
          everywhere, at a lean harvest. Refills at 00:00 UTC.
        </p>
      )}
    </div>
  );
}
