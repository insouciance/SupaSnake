'use client';

/**
 * The adaptive-quality governor's clock and probe.
 *
 * The policy lives in `renderQuality.ts` and is pure. This is the only part
 * that touches a timer, and it does exactly one thing: measure how many of its
 * own scheduled callbacks the browser is actually firing, and hand that number
 * to the policy once per window.
 *
 * WHY A PROBE INTERVAL RATHER THAN THE ENGINE'S OWN TICK. The signal we want is
 * "is this main thread keeping its appointments", and the engine's tick is the
 * appointment that matters - but reading it would couple the renderer to the
 * engine, and the governor is not allowed anywhere near gameplay. An
 * independent interval at the same order of magnitude measures the same
 * starvation from the outside: when the browser drops ours, it is dropping the
 * engine's too, for the same reason. The probe reads nothing and mutates
 * nothing beyond its own counters.
 *
 * Cost of the probe itself: one timer callback that increments an integer.
 */

import { useEffect, useRef, useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import {
  INITIAL_GOVERNOR_STATE,
  RENDER_GOVERNOR,
  nextGovernorState,
  qualityForTier,
  type GovernorState,
  type RenderQuality,
  type RenderTier,
} from './renderQuality';
import type { RenderTierLedger } from '@/lib/game/runInstruments';

interface UseRenderQualityOptions {
  /**
   * Whether the governor should be sampling at all. It runs while the board is
   * live; there is nothing to protect on a menu.
   */
  active: boolean;
  /**
   * False while a decision surface is open - the governor may still step down
   * (invisible behind the blur) but will not pop quality back in underneath a
   * surface the player is reading.
   */
  allowStepUp: boolean;
  /**
   * Optional per-run accumulator (Wave 3). A tier-change breadcrumb answers
   * "did THIS device degrade"; it answers nothing about the population, and
   * tier distribution across devices is the trigger the program plan parks the
   * engine-in-worker decision behind. The ledger is owned by the caller so the
   * hook keeps no cross-run state of its own, and stays optional so nothing
   * that renders a board is obliged to measure one.
   */
  ledger?: RenderTierLedger | null;
}

const WINDOW_MS = RENDER_GOVERNOR.sampleIntervalMs * RENDER_GOVERNOR.windowSamples;

/**
 * Report a tier change once, where a human or Sentry can find it later.
 *
 * This is the only way we will ever learn the tier distribution across real
 * devices - a board that silently degrades teaches us nothing about who it
 * degraded for.
 */
function reportTierChange(from: number, to: number, retention: number): void {
  const message = `render quality tier ${from} -> ${to} (tick retention ${(retention * 100).toFixed(0)}%)`;
  if (process.env.NODE_ENV !== 'production') {
    console.info(`[render-quality] ${message}`);
  }
  try {
    Sentry.addBreadcrumb({
      category: 'render-quality',
      level: to > from ? 'warning' : 'info',
      message,
      data: { from, to, retention },
    });
  } catch {
    // A breadcrumb is diagnostics. It must never be able to break a run.
  }
}

export function useRenderQuality({
  active,
  allowStepUp,
  ledger = null,
}: UseRenderQualityOptions): RenderQuality {
  const [tier, setTier] = useState<RenderTier>(INITIAL_GOVERNOR_STATE.tier);

  /**
   * The governor's state lives in a ref, and only the TIER is React state.
   *
   * Two reasons, and the first one is a bug this had until it was measured.
   * Deriving the next state inside a `setState` updater made the breadcrumb a
   * side effect inside an updater, which React is explicitly allowed to invoke
   * more than once - and in development it does, so every tier change was
   * reported twice. Transitions are computed here, once, and the setter is
   * only told the result.
   *
   * The second is cost: the governor evaluates a window every second for the
   * length of a run, and all but a handful of those windows change nothing.
   * Re-rendering the board to store an unchanged counter would make the
   * throughput guard a throughput problem.
   */
  const stateRef = useRef<GovernorState>(INITIAL_GOVERNOR_STATE);

  // Read inside the interval without restarting it every time a decision opens.
  const allowStepUpRef = useRef(allowStepUp);
  allowStepUpRef.current = allowStepUp;

  // Same treatment for the ledger: swapping it must not restart the probe,
  // whose window is the unit the retention ratio is honest over.
  const ledgerRef = useRef(ledger);
  ledgerRef.current = ledger;

  useEffect(() => {
    if (!active) return;
    if (typeof window === 'undefined') return;

    let fired = 0;
    let windowStartedAt = performance.now();
    // The ledger's clock starts when the governor's does, so time-at-tier
    // covers exactly the span the governor was responsible for and a run's
    // menus and loading do not count as tier-0 play.
    ledgerRef.current?.start(windowStartedAt);

    const id = window.setInterval(() => {
      fired += 1;
      const now = performance.now();
      const elapsed = now - windowStartedAt;
      if (elapsed < WINDOW_MS) return;

      // Expected is derived from the ELAPSED time rather than from a fixed
      // count, so a window that ran long because callbacks were dropped is
      // still scored honestly: the denominator grows with the delay.
      const expected = elapsed / RENDER_GOVERNOR.sampleIntervalMs;
      const retention = expected > 0 ? fired / expected : 1;
      fired = 0;
      windowStartedAt = now;

      const current = stateRef.current;
      const next = nextGovernorState(current, retention, {
        allowStepUp: allowStepUpRef.current,
      });
      stateRef.current = next;
      if (next.tier !== current.tier) {
        reportTierChange(current.tier, next.tier, retention);
        ledgerRef.current?.recordTierChange(current.tier, next.tier, now);
        setTier(next.tier);
      }
    }, RENDER_GOVERNOR.sampleIntervalMs);

    return () => {
      window.clearInterval(id);
      // Close the open interval so the last tier the run spent time at is not
      // silently dropped from its own histogram.
      ledgerRef.current?.mark(performance.now());
    };
  }, [active]);

  return qualityForTier(tier);
}
