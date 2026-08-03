'use client';

import { useEffect, useRef } from 'react';

export interface RunContinuityHeartbeat {
  acceptedAt: number;
}

interface RunContinuityWatchdogOptions {
  enabled: boolean;
  heartbeat: RunContinuityHeartbeat | null;
  budgetMs: number;
  onExpired: () => void;
}

/**
 * Report when an active run's latest authoritative continuity receipt ages
 * past the rollback budget. The caller may expose nonblocking save status, but
 * must never turn this timer alone into a gameplay hold. A new heartbeat is an
 * explicit re-arm signal even when two receipts share one millisecond.
 */
export function useRunContinuityWatchdog({
  enabled,
  heartbeat,
  budgetMs,
  onExpired,
}: RunContinuityWatchdogOptions): void {
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;

  useEffect(() => {
    if (
      !enabled ||
      heartbeat === null ||
      heartbeat.acceptedAt <= 0 ||
      !Number.isFinite(budgetMs) ||
      budgetMs <= 0
    ) return;

    let timer: number | null = null;
    const watch = () => {
      const remaining = budgetMs - (Date.now() - heartbeat.acceptedAt);
      if (remaining <= 0) {
        onExpiredRef.current();
        return;
      }
      timer = window.setTimeout(watch, remaining);
    };

    watch();
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [budgetMs, enabled, heartbeat]);
}
