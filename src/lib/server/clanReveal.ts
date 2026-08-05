/**
 * The eight-bank clan reveal, written at settlement (WP-E; PEO §6).
 *
 * WHY IT IS AN `action` ROW AND NOT A RECOGNITION
 *
 * Identical reasoning to the curriculum invitation (WP-D decision 14):
 * `recognition_never_action_terminal` (061:310-312) forbids a recognition row
 * from ever reaching `resolved` or `dismissed`, so a recognition row would be
 * an invitation nobody could decline. **Not now** needs exactly those states.
 * `destination = 'clan'` is honest — the founding flow lives at `/clan` — and
 * it is deliberately NOT `leaderboard`-adjacent (§6 step 2).
 *
 * WHY THERE IS NO IMPACT BEAT
 *
 * The reveal is the fold-chosen single Results action and nothing else (owner
 * ruling 2: "No additional prompt is added to Results"). A `runImpact`
 * milestone would put a second voice for the same news in the Victory Lap and
 * a competing `recognition` row in the bell, which is precisely the fourth
 * competing invitation §12.2 caps away. So this package emits no impact, adds
 * no `RunImpactKind`, and leaves `buildRunImpactEnvelope` untouched.
 *
 * NEVER FATAL. A settlement is money and a reveal is presentation. Every
 * failure here is reported and swallowed; the player keeps their run.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { isMissingRunImpactInfra } from '@/lib/server/runImpact';
import {
  CLAN_REVEAL_ATTENTION_KEY,
  CLAN_REVEAL_SOURCE_ID,
  CLAN_REVEAL_SOURCE_TYPE,
  clanRevealInvitation,
} from '@/shared/game/clanReveal';
import { SERPENT_UNLOCK_BANKED_RUNS } from '@/lib/serpent/config';

export interface ClanRevealSettlementFacts {
  /**
   * Validated banked runs held BEFORE this run, or null when the run carries
   * no curriculum stamp — flag off, pre-migration, or Genome v1.
   *
   * NULL IS THE FLAG GATE, and it is the only one this module needs. A run
   * started with `NEXT_PUBLIC_PLAYER_EVOLUTION_V1` off is stamped without
   * eligibility inputs, so it settles byte-identically to how it settled
   * before WP-E existed, and a mid-run flag flip cannot retroactively invent
   * a count this settlement did not start with.
   */
  bankedRunsBefore: number | null;
  /** The run was server-validated. */
  validated: boolean;
  /** The run BANKED at a portal. A crash is not a banked run. */
  extracted: boolean;
  /** Free Play is rewardless practice and is excluded from the bank count. */
  freePlay: boolean;
}

/**
 * Is the eight-bank reveal due on this settlement?
 *
 * "**At or past** eight validated banks" (§6 step 1), evaluated on the count
 * this settlement produces: the stamp holds the runs banked *before* this one,
 * and a settlement that banks adds exactly one. `>=` rather than `===` is
 * load-bearing — a veteran already past the beat when the flag flips is owed
 * the reveal on their next bank, not never.
 *
 * The predicate is pure and does no I/O, so the overwhelming majority of
 * settlements decide "no" without touching the database at all.
 */
export function clanRevealDue(facts: ClanRevealSettlementFacts): boolean {
  if (facts.bankedRunsBefore === null) return false;
  if (!facts.validated || !facts.extracted || facts.freePlay) return false;
  if (!Number.isSafeInteger(facts.bankedRunsBefore) || facts.bankedRunsBefore < 0) {
    return false;
  }
  return facts.bankedRunsBefore + 1 >= SERPENT_UNLOCK_BANKED_RUNS;
}

async function clanRevealRowExists(
  supabase: SupabaseClient,
  playerId: string
): Promise<boolean | null> {
  const { data, error } = await supabase
    .from('player_attention_items')
    .select('id')
    .eq('player_id', playerId)
    .eq('source_type', CLAN_REVEAL_SOURCE_TYPE)
    .eq('source_id', CLAN_REVEAL_SOURCE_ID)
    .eq('attention_key', CLAN_REVEAL_ATTENTION_KEY)
    .maybeSingle();
  if (error) {
    if (isMissingRunImpactInfra(error)) return true;
    console.error('Clan reveal lookup failed:', { playerId, error });
    Sentry.captureException(
      new Error(
        `clan reveal lookup failed: ${error.message ?? error.code ?? 'unknown'}`
      ),
      { extra: { playerId }, tags: { wp: 'wp-pe-e' } }
    );
    return null;
  }
  return data !== null;
}

/**
 * Open the clan reveal, exactly once in an account's life.
 *
 * The lookup runs before the insert because a player past eight banks settles
 * many more runs than they receive reveals: one index-backed read on the
 * unique key is cheaper than a constraint violation per settlement, and it
 * keeps Postgres' log free of routine 23505s. The unique key is still the
 * authority — a lost race is caught below and reported as success.
 *
 * Returns true when the reveal is open or was already handled, false only
 * when the write genuinely failed.
 */
export async function insertClanRevealAttention(
  supabase: SupabaseClient,
  playerId: string
): Promise<boolean> {
  try {
    const exists = await clanRevealRowExists(supabase, playerId);
    // A lookup that failed is not evidence of absence. Inserting on an unknown
    // is how a dismissed invitation comes back from the dead.
    if (exists === null || exists) return exists === true;

    const invitation = clanRevealInvitation();
    const { error } = await supabase.from('player_attention_items').insert({
      player_id: playerId,
      source_type: CLAN_REVEAL_SOURCE_TYPE,
      source_id: CLAN_REVEAL_SOURCE_ID,
      attention_key: CLAN_REVEAL_ATTENTION_KEY,
      attention_kind: 'action',
      destination: 'clan',
      headline: invitation.label,
      detail: invitation.description,
    });
    if (error) {
      // 23505 is a concurrent settlement winning the same race: the reveal is
      // open, which is the outcome this function wanted.
      if (error.code === '23505') return true;
      if (!isMissingRunImpactInfra(error)) {
        console.error('Clan reveal insert failed:', { playerId, error });
        Sentry.captureException(
          new Error(
            `clan reveal insert failed: ${error.message ?? error.code ?? 'unknown'}`
          ),
          { extra: { playerId }, tags: { wp: 'wp-pe-e' } }
        );
      }
      return false;
    }
    return true;
  } catch (error) {
    console.error('Clan reveal insert threw:', { playerId, error });
    Sentry.captureException(error, {
      extra: { playerId },
      tags: { wp: 'wp-pe-e' },
    });
    return false;
  }
}
