/**
 * The eight-bank CLAN REVEAL — words and identity, never authority
 * (WP-E; `docs/game/PLAYER_EVOLUTION_ONBOARDING.md` §6, §13 rows 2, 12, 13).
 *
 * WHAT THIS OWNS
 *
 * The one sentence the reveal says, the row identity that makes it happen
 * exactly once per account, and the destination it points at. It decides
 * nothing about whether the reveal is due — the settlement does that from the
 * run's own start stamp — and it grants nothing.
 *
 * THE REVEAL GRAMMAR (§5)
 *
 *   REVEAL -> INVITATION -> CONTEXTUAL PRACTICE -> PROOF -> REFERENCE
 *
 * Owner ruling 2 collapses the first two beats into Layer 3's single
 * recommended action: the reveal IS the action, and the action is a POINTER to
 * `/clan`, where the existing founding flow already lives. No new prompt is
 * added to Results and no Results layer is added, so §12.2's three-layer cap
 * is untouched. CONTEXTUAL PRACTICE, PROOF and REFERENCE are the clan page,
 * an ordinary Energy run, and the battle panel — all of which already exist.
 *
 * WHY IT IS NOT ROUTED TO COMPETE
 *
 * The Compete nav item points at `/leaderboard`
 * (`src/components/ui/Navigation.tsx`). Sending a player's first clan reveal
 * to a leaderboard would teach that clans are a ranking to read rather than a
 * thing to join, so §6 step 2 routes it to `/clan` explicitly.
 */

/**
 * The shipped decline idiom (§13 row 13). Identical to the curriculum's, and
 * deliberately duplicated rather than imported: these are two independent
 * invitations that happen to agree, and the curriculum module is about Genes.
 * A test asserts they still agree.
 */
export const CLAN_REVEAL_DECLINE_LABEL = 'Not now';

/**
 * Row identity for the single clan-reveal attention item.
 *
 * `player_attention_items` is UNIQUE on
 * `(player_id, source_type, source_id, attention_key)`, so a CONSTANT
 * `source_id` — rather than the settling session's id — is what makes the
 * reveal a once-per-account event instead of a once-per-settlement one. A
 * replayed settlement, the recovery sweep and every later bank all collide
 * with the same row and write nothing.
 *
 * THIS IS ALSO THE "NEVER RE-NAGS" MECHANISM. **Not now** moves the row to
 * `dismissed`; the row still exists, so no later settlement can insert a
 * second one, and `notificationFromServerItem` drops terminal rows from the
 * store entirely. There is no browser copy of any of it.
 */
export const CLAN_REVEAL_SOURCE_TYPE = 'clan_reveal';
export const CLAN_REVEAL_SOURCE_ID = 'clan-reveal';
export const CLAN_REVEAL_ATTENTION_KEY = 'clan-reveal';

export interface ClanRevealInvitation {
  /** Layer 3's single recommended action, and the attention row's headline. */
  label: string;
  description: string;
  href: string;
  /** The decline control beside it. */
  declineLabel: string;
}

/**
 * The ratified reveal (§6 step 1, owner ruling 2).
 *
 * The headline is the owner's phrasing verbatim, including its full stop; the
 * description supplies §5's "action and its consequence" and names all three
 * real outcomes, including the clan of one, so the invitation never implies
 * that joining someone else's roster is the only way through. Nothing here
 * mentions a count, a ramp or a threshold: the eight banked runs are a beat,
 * not a cut line, and a player is never told they crossed one.
 */
export function clanRevealInvitation(): ClanRevealInvitation {
  return {
    label: 'Your runs can now power a Clan.',
    description:
      'Show me where they count — found one, join one, or start as a clan of one.',
    href: '/clan',
    declineLabel: CLAN_REVEAL_DECLINE_LABEL,
  };
}
