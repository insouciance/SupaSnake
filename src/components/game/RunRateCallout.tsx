'use client';

import { useEffect } from 'react';
import styles from './RunRateCallout.module.css';

export interface RunRateCalloutProps {
  growthRate?: number;
  speedMultiplier?: number;
  onDone: () => void;
}

/** Quantize live tempo into calm, meaningful 0.2x announcements. */
export function speedMultiplierBand(
  currentTickMs: number,
  openingTickMs: number
): number {
  if (
    !Number.isFinite(currentTickMs) ||
    !Number.isFinite(openingTickMs) ||
    currentTickMs <= 0 ||
    openingTickMs <= 0
  ) {
    return 1;
  }
  return Math.max(0.2, Math.round((openingTickMs / currentTickMs) * 5) / 5);
}

/**
 * One transparent, non-interactive board announcement. It appears after the
 * first deliberate move and only when a meaningful rate band changes.
 */
export function RunRateCallout({
  growthRate,
  speedMultiplier,
  onDone,
}: RunRateCalloutProps) {
  useEffect(() => {
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(onDone, reduced ? 1000 : 1450);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  const spoken = [
    growthRate === undefined ? null : `Growth rate plus ${growthRate}`,
    speedMultiplier === undefined
      ? null
      : `Speed times ${speedMultiplier.toFixed(1)}`,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <div
      className={styles.root}
      role="status"
      aria-live="polite"
      aria-label={spoken}
      data-testid="run-rate-callout"
      data-growth-rate={growthRate}
      data-speed-multiplier={speedMultiplier}
    >
      <div className={styles.stack} aria-hidden="true">
        {growthRate !== undefined && (
          <strong className={styles.growth}>Growth rate +{growthRate}</strong>
        )}
        {speedMultiplier !== undefined && (
          <strong className={styles.speed}>
            Speed ×{speedMultiplier.toFixed(1)}
          </strong>
        )}
      </div>
    </div>
  );
}

export default RunRateCallout;
