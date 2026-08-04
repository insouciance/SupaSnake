/**
 * Player Evolution curriculum rollout switch (WP-B; PEO §8, server contract §7).
 *
 * Exact `true` opts a run start into the composed per-account vocabulary.
 * Anything else — unset, `false`, a typo — composes the complete legal Dynasty
 * roster, which is the shipped behaviour this feature replaces.
 *
 * FLAG OFF IS A DUAL-VERSION FALLBACK, NOT A DATA MIGRATION. Existing
 * eligibility rows are not deleted, runs already stamped stay readable, and
 * they settle under exactly the pool they were stamped with. A run started
 * with the flag off writes the pre-curriculum context blob byte-for-byte.
 *
 * This is a rollout/rollback boundary, never payout authority. The flag is
 * added to `config/production-public-surface.json` by WP-F, which owns the
 * manifest-hash change and the four-shape e2e matrix; until then it is absent
 * from every deployed environment and therefore off everywhere.
 */
export function playerEvolutionEnabled(
  value: string | undefined = process.env.NEXT_PUBLIC_PLAYER_EVOLUTION_V1
): boolean {
  return value === 'true';
}

/** Build-time client boundary. Server routes evaluate the helper per request. */
export const PLAYER_EVOLUTION_ENABLED = playerEvolutionEnabled();
