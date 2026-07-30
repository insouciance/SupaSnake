'use client';

/** Stored Energy and partial server-time recovery progress. Display only. */

import { useEffect, useMemo, useState } from 'react';
import { IconBolt } from '@/components/ui/icons';
import type { EnergyStatus } from '@/shared/game/energyEnvelope';

export interface ChargeMeterProps {
  charge: EnergyStatus | null;
  className?: string;
}

export function timeUntilRefill(
  nextRecoveryAt: string | null | undefined,
  now: number = Date.now()
): number {
  if (!nextRecoveryAt) return 0;
  const at = new Date(nextRecoveryAt).getTime();
  return Number.isFinite(at) ? Math.max(0, at - now) : 0;
}

export function formatRefillCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function useRecoveryClock(charge: EnergyStatus | null): {
  mounted: boolean;
  remaining: number;
  progress: number;
} {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(0);
  const serverNow = charge?.serverNow;
  useEffect(() => {
    setMounted(true);
    // Advance from the server timestamp with a monotonic browser clock. The
    // device timezone and wall-clock setting can therefore change without
    // manufacturing Energy or making the visible countdown jump.
    const parsedServerNow = serverNow ? new Date(serverNow).getTime() : NaN;
    const serverBase = Number.isFinite(parsedServerNow) ? parsedServerNow : Date.now();
    const monotonic = () =>
      typeof performance === 'undefined' ? Date.now() : performance.now();
    const monotonicBase = monotonic();
    const update = () => setNow(serverBase + Math.max(0, monotonic() - monotonicBase));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [serverNow]);

  return useMemo(() => {
    const available = charge ? charge.available ?? charge.remaining : 0;
    const capacity = charge ? charge.capacity ?? charge.perDay : 0;
    if (!mounted || !charge || available >= capacity) {
      return { mounted, remaining: 0, progress: charge ? 1 : 0 };
    }
    const remaining = timeUntilRefill(charge.nextRecoveryAt ?? charge.refillsAt, now);
    const intervalMs = (charge.recoveryIntervalSeconds || 3600) * 1000;
    return {
      mounted,
      remaining,
      progress: Math.min(1, Math.max(0, 1 - remaining / intervalMs)),
    };
  }, [charge, mounted, now]);
}

export function ChargeMeter({ charge, className = '' }: ChargeMeterProps) {
  const recovery = useRecoveryClock(charge);
  if (!charge) return null;

  const available = charge.available ?? charge.remaining;
  const capacity = charge.capacity ?? charge.perDay;
  const full = available >= capacity;
  return (
    <div className={`flex flex-col gap-1 ${className}`} data-testid="energy-meter">
      <div className="flex items-center gap-2">
        <IconBolt size={20} className="text-venom-orange" />
        <div className="flex gap-1" aria-hidden="true">
          {Array.from({ length: capacity }).map((_, index) => (
            <div
              key={index}
              className={`h-6 w-4 rounded-[2px] transition-all duration-300 ${
                index < available
                  ? 'bg-venom-orange shadow-[0_0_8px_rgba(249,115,22,0.55)]'
                  : 'bg-scale-blue-light/35'
              }`}
            />
          ))}
        </div>
        <span
          className="ml-1 font-mono text-sm font-bold text-venom-orange"
          aria-label={`Energy ${available} of ${capacity}`}
        >
          {available}/{capacity}
        </span>
      </div>

      {recovery.mounted && !full && (
        <div className="ml-7 w-[9.25rem]" data-testid="energy-recovery">
          <div className="h-1 overflow-hidden rounded-full bg-scale-blue-light/30">
            <div
              className="h-full bg-cosmic transition-[width] duration-1000"
              style={{ width: `${Math.round(recovery.progress * 100)}%` }}
            />
          </div>
          <p className="mt-1 font-body text-[11px] text-beige/60">
            +1 Energy in {formatRefillCountdown(recovery.remaining)}
          </p>
        </div>
      )}
      {recovery.mounted && full && (
        <p className="ml-7 font-body text-[11px] text-beige/60">Energy full</p>
      )}
    </div>
  );
}

export function ChargeDisplay({ charge, className = '' }: ChargeMeterProps) {
  if (!charge) return null;
  const available = charge.available ?? charge.remaining;
  const capacity = charge.capacity ?? charge.perDay;
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <IconBolt size={14} className="text-venom-orange" />
      <span className="font-body text-beige/60">Energy</span>
      <span className="font-mono font-bold text-venom-orange">
        {available}/{capacity}
      </span>
    </div>
  );
}

export default ChargeMeter;
