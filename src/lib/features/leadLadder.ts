/**
 * The lead-ladder rollout switch (WP-2.03; Constitution §11.7).
 *
 * DEFAULTED OFF. `NEXT_PUBLIC_LEAD_LADDER_V1` must be the exact string
 * `true` to arm it; anything else — including the variable being absent — is
 * off, because an omitted flag must never be read as "on".
 *
 * WHAT "OFF" MEANS, PRECISELY
 *
 *   `<LeadLadder />` returns null. Not a collapsed panel, not a placeholder:
 *   nothing renders, nothing is measured, no prompt event fires, and the
 *   leaderboard looks exactly as it does today. Handles keep working — the
 *   claim ceremony in Settings and at game-over is shipped behaviour from
 *   Player Identity v1 and is NOT gated by this flag. This switch governs
 *   the ladder surface only.
 *
 * Separate from NEXT_PUBLIC_PLAYER_CONTRACT_V1 on purpose: the manifesto and
 * the ladder are different surfaces with different risks, and a rollback of
 * one must never take the other down with it.
 *
 * The flag-off path is tested (`LeadLadder.test.tsx`), never inferred.
 */
export const LEAD_LADDER_V1_ENABLED =
  process.env.NEXT_PUBLIC_LEAD_LADDER_V1 === 'true';
