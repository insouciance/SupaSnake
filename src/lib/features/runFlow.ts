/**
 * Run Flow v1 rollout switch (WP-1.06, Constitution §5).
 *
 * Covers the two surfaces the Constitution's §5 ruling rewrites:
 *
 *   1. **Run Setup** — LAUNCH opens one consolidated, fully preset setup page
 *      whose only emphasised action is START. Home no longer prepares a
 *      handed-off run that auto-starts the board; the setup page is the one
 *      sanctioned extra tap (open → LAUNCH → START → board, ≤3 taps).
 *   2. **Results** — three layers, exactly one recommended next action, zero
 *      commercial surfaces, and the run-end toast/notification storm folded
 *      into the layers.
 *
 * Off by default. With the flag off, the shipped Run Setup / game-over screen
 * renders unchanged, which is the rollback path.
 */
export const RUN_FLOW_V1_ENABLED =
  process.env.NEXT_PUBLIC_RUN_FLOW_V1 === 'true';
