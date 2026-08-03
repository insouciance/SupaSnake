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
 * Hold an active run when its latest authoritative continuity receipt ages
 * past the rollback budget. A new heartbeat is an explicit re-arm signal,
 * even when two receipts happen to share the same millisecond timestamp.
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
