/**
 * Tactical Genome v2 rollout switch.
 *
 * Both server-issued run authority and player-facing Research read this same
 * build-time value. Exact `true` opts in; omission preserves Genome v1 for new
 * starts while this deployment can still resume and settle already-stamped v2
 * runs. This is a rollout/rollback boundary, never payout authority.
 */
export const GENOME_V2_ENABLED =
  process.env.NEXT_PUBLIC_GENOME_V2 === 'true';
