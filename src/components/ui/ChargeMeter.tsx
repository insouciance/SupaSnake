'use client';

/**
 * ChargeMeter - the day's harvest envelope, rendered (Constitution §8.6).
 *
 * Replaces the old EnergyTimer, which drew a `maxEnergy`-long pill bar and a
 * one-second "Next: M:SS" countdown to the next 20-minute regeneration tick.
 * Both concepts are gone: there is no drip to count down to and no balance
 * that can sit above a cap. What remains is a fixed row of pills for the
 * day's allotment and, when it is spent, the time until 00:00 UTC.
 *
 * This is display only. The meter NEVER communicates that a run is blocked,
 * because no run is ever blocked - an empty allotment means the next run
 * harvests lean, not that there is no next run. Copy here is deliberately
 * about the harvest, never about permission.
 */

import { useState, useEffect } from 'react';
import { IconBolt } from '@/components/ui/icons';
import type { ChargeStatus } from '@/shared/game/energyEnvelope';

export interface ChargeMeterProps {
  /** The server's charge status; null while it has not synced yet. */
  charge: ChargeStatus | null;
  className?: string;
}

/**
 * Milliseconds until the allotment resets. Returns 0 when the reset time is
 * missing or already past - the caller then simply shows nothing.
 */
export function timeUntilRefill(
  refillsAt: string | null | undefined,
  now: number = Date.now()
): number {
  if (!refillsAt) return 0;
  const at = new Date(refillsAt).getTime();
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, at - now);
}

/** `Hh Mm` for a countdown that is up to a day long. */
export function formatRefillCountdown(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return 'less than a minute';
}

/** Shared countdown, recomputed once a minute (a daily reset needs no more). */
function useRefillCountdown(refillsAt: string | null | undefined): {
  mounted: boolean;
  remaining: number;
} {
  const [mounted, setMounted] = useState(false);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const update = () => setRemaining(timeUntilRefill(refillsAt));
    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, [mounted, refillsAt]);

  return { mounted, remaining };
}

export function ChargeMeter({ charge, className = '' }: ChargeMeterProps) {
  const { mounted, remaining } = useRefillCountdown(charge?.refillsAt);

  if (!charge) return null;

  const { remaining: left, perDay } = charge;
  const spent = left <= 0;

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="flex items-center gap-2">
        <IconBolt
          size={20}
          className={spent ? 'text-beige/40' : 'text-venom-orange'}
        />

        <div className="flex gap-1" aria-hidden="true">
          {Array.from({ length: perDay }).map((_, i) => (
            <div
              key={i}
              className={`w-4 h-6 rounded-[2px] transition-all duration-300 ${
                i < left
                  ? 'bg-venom-orange shadow-[0_0_8px_rgba(34,211,238,0.6)]'
                  : 'bg-scale-blue-light/40'
              }`}
            />
          ))}
        </div>

        <span
          className={`text-sm font-mono font-bold ml-1 ${
            spent ? 'text-beige/60' : 'text-venom-orange'
          }`}
          aria-label={`Charges ${left} of ${perDay}`}
        >
          {left}/{perDay}
        </span>
      </div>

      {mounted && spent && (
        <div
          className="text-xs font-body text-beige/60 mt-1"
          data-testid="charge-meter-lean"
        >
          Rich harvest spent — runs still count, at a lean harvest.
          {remaining > 0 && ` Refills in ${formatRefillCountdown(remaining)}.`}
        </div>
      )}
    </div>
  );
}

/** Compact variant for the HUD and headers. */
export function ChargeDisplay({ charge, className = '' }: ChargeMeterProps) {
  if (!charge) return null;

  const { remaining: left, perDay } = charge;

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span className="font-body text-beige/60">Charges:</span>
      <span
        className={`font-mono font-bold ${
          left <= 0 ? 'text-beige/60' : 'text-venom-orange'
        }`}
        aria-label={`Charges ${left} of ${perDay}`}
      >
        {left}/{perDay}
      </span>
    </div>
  );
}

export default ChargeMeter;
