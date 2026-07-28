'use client';

import { useEffect, useState } from 'react';
import type { GrowthProfileId } from '@/shared/game/growth';
import styles from '@/components/game/cockpit/CockpitPrototype.module.css';

/**
 * THE GROWTH READOUT AND ITS STEP NOTICE (WP-3.09).
 *
 * WP-3.02 shipped a growth readout that lived only on the setup panel, so it
 * unmounted the instant the run started - the player could read the rate right
 * up until the moment it began to matter, and never again. WP-3.04 then had to
 * repair it because it read the ENGINE's profile pre-run, which is `baseline`
 * until the server answers, so it said "Classic" whatever you picked.
 *
 * The owner's ruling (REDESIGN_WAVE_STATUS §3.3): the current growth rate must
 * be visible DURING play, plus a transient notice when the step changes.
 *
 * Rule 1 boundary, which shapes every decision in this file: a passive readout
 * does not intrude, but the notice must be non-blocking, auto-dismissing, take
 * no input, and never swallow a steering input or pause the tick. So nothing
 * here is interactive, nothing here is focusable, and every element carries
 * `pointer-events-none` - a HUD element that can eat a flick is a HUD element
 * that can kill a run.
 *
 * These components are PRESENTATION ONLY. They are handed a number; they never
 * compute one. `baseGrowthForFood` is the one function that knows the curve
 * (growth.ts, "one function, both sides") and the game page calls it - a second
 * copy of the step arithmetic living in a component is exactly the drift that
 * function exists to prevent.
 */

export type GrowthReadoutPresentation = 'panel' | 'ticker' | 'cockpit';

interface GrowthReadoutProps {
  /** Which profile the number came from - the diagnostic half of the readout. */
  profileId: GrowthProfileId;
  /** Its human label ("Classic", "Tuned", "Aggressive"). */
  label: string;
  /** `baseGrowthForFood(profile, n)` for the food about to be eaten. */
  perFood: number;
  /** Simultaneous foods, shown pre-run where there is room for it. */
  foodsOnBoard: number;
  presentation: GrowthReadoutPresentation;
}

/**
 * The passive line. One testid across all three presentations, because the
 * question a test needs to ask is always the same - "is the live rate on
 * screen?" - and only ever one of them is mounted at a time.
 */
export function GrowthReadout({
  profileId,
  label,
  perFood,
  foodsOnBoard,
  presentation,
}: GrowthReadoutProps) {
  /* Machine-readable on every presentation. The WP-3.03 terrain post-mortem
     and the WP-3.04 readout repair were both "the model was right and the
     screen was wrong" defects; attributes let a spec assert the screen. */
  const probe = {
    'data-testid': 'growth-readout',
    'data-growth-profile': profileId,
    'data-growth-per-food': String(perFood),
  } as const;
  const spoken = `Growth ${label}, plus ${perFood} per food`;

  if (presentation === 'panel') {
    return (
      <p className="font-body text-sm text-beige/70" {...probe}>
        Growth: <span className="text-bone-white">{label}</span>
        {' · '}
        <span className="text-venom-orange">+{perFood} per food</span>
        {foodsOnBoard > 1 ? ` · ${foodsOnBoard} foods on the board` : ''}
      </p>
    );
  }

  if (presentation === 'cockpit') {
    return (
      <span
        className={styles.growthReadout}
        aria-label={spoken}
        title={spoken}
        {...probe}
      >
        <span>Growth</span>
        <strong>+{perFood}</strong>
      </span>
    );
  }

  return (
    <div
      aria-label={spoken}
      className="pointer-events-none flex h-7 shrink-0 items-center gap-1 rounded-arcade border border-scale-blue-light/50 bg-void/80 px-2 text-beige/70 backdrop-blur-md"
      {...probe}
    >
      <span className="uppercase tracking-wider">Growth</span>
      <span className="font-mono font-bold tabular-nums text-venom-orange">
        +{perFood}
      </span>
    </div>
  );
}

interface GrowthStepNoticeProps {
  /** Segments per food before the step. */
  from: number;
  /** Segments per food from this food on. */
  to: number;
  presentation: Exclude<GrowthReadoutPresentation, 'panel'>;
  /** Fired when the notice has dismissed ITSELF. Nothing else dismisses it. */
  onDone: () => void;
}

/**
 * The transient notice, modelled on `ExpressionFlourish` - the one component in
 * this codebase already trusted to appear mid-run without intruding.
 *
 * Same contract, deliberately: a single timeout that fires `onDone`, cleared on
 * unmount, `role="status"` + `aria-live="polite"` (POLITE, never assertive - a
 * growth step is information, not an alarm), and no interactive element of any
 * kind. This is also why `ToastProvider` is not used: it renders outside the
 * HUD, announces with `role="alert"`, and ships a dismiss button, i.e. it takes
 * input - which the Rule 1 boundary rules out for this notice.
 */
export function GrowthStepNotice({
  from,
  to,
  presentation,
  onDone,
}: GrowthStepNoticeProps) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReducedMotion(prefersReducedMotion);
    const timer = window.setTimeout(
      () => onDone(),
      prefersReducedMotion ? 1200 : 1800
    );
    return () => window.clearTimeout(timer);
  }, [onDone]);

  const rising = to > from;
  const spoken = `Growth ${rising ? 'up' : 'down'}: ${from} to ${to} segments per food`;
  const probe = {
    'data-testid': 'growth-step-notice',
    'data-growth-step': rising ? 'up' : 'down',
    'data-growth-per-food': String(to),
  } as const;

  if (presentation === 'cockpit') {
    return (
      <span
        className={`${styles.growthNotice} ${reducedMotion ? '' : 'animate-pop-in'}`}
        role="status"
        aria-live="polite"
        aria-label={spoken}
        {...probe}
      >
        <strong>
          +{from} → +{to}
        </strong>
      </span>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={spoken}
      className={`pointer-events-none flex h-7 shrink-0 items-center gap-1 rounded-arcade border bg-void/85 px-2 font-mono font-bold tabular-nums backdrop-blur-md ${
        rising
          ? 'border-venom-orange/70 text-venom-orange'
          : 'border-[#7df9ff]/70 text-[#7df9ff]'
      } ${reducedMotion ? '' : 'animate-pop-in'}`}
      {...probe}
    >
      +{from} → +{to}
    </div>
  );
}

export default GrowthReadout;
