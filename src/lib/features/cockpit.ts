/**
 * Run Cockpit & Arena v1 rollout switch.
 *
 * The released game screen remains the default and immediate rollback path.
 * Enable only for deterministic QA/canary builds until the complete protected
 * cockpit, arena, accessibility, and performance matrix is approved.
 */
export const HUD_COCKPIT_V1_ENABLED =
  process.env.NEXT_PUBLIC_HUD_COCKPIT_V1 === 'true';
