/**
 * The `select_gene_trial` caller (WP-D; server contract §2).
 *
 * ── OVERLAP NOTICE FOR THE INTEGRATION OWNER ───────────────────────────────
 *
 * PR #80 (WP-C) adds `selectGeneTrial` and `recordTrialOffer` to
 * `src/lib/server/geneEligibility.ts`. That PR was still open when this branch
 * was written, so WP-D imports NOTHING from it and keeps its own caller in a
 * separate file: the Workbench cannot choose a trial without one, and a second
 * edit to `geneEligibility.ts` would be a merge conflict for no gain.
 *
 * WHEN #80 MERGES, delete this file and point
 * `src/app/api/genome/curriculum/route.ts` at `geneEligibility.selectGeneTrial`.
 * The RPC, its arguments and its idempotency are identical — this is one call
 * site, not a second contract.
 *
 * The RPC itself is `SECURITY DEFINER`, service-role-only, and takes the
 * player id the route resolved from the caller's token — never a client-
 * supplied one. Switching a trial demotes nothing and loses nothing (§4.4).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import {
  GENE_ELIGIBILITY_RULES_VERSION,
  isMissingGeneEligibilityInfra,
} from '@/lib/server/geneEligibility';
import type { GenomeV2ActiveGeneId } from '@/shared/game/genes';

export type SelectGeneTrialResult =
  | { status: 'selected' }
  | { status: 'unavailable' };

/**
 * Set or switch the account's single trial.
 *
 * Returns `unavailable` — never throws — for a missing table, a missing RPC,
 * or a transient failure. The caller answers 503 so the surface can say the
 * choice did not take, which is honest; the alternative, a silent success,
 * would leave a player believing they had chosen a trial they had not.
 */
export async function selectGeneTrial(
  supabase: SupabaseClient,
  playerId: string,
  geneId: GenomeV2ActiveGeneId
): Promise<SelectGeneTrialResult> {
  try {
    const { error } = await supabase.rpc('select_gene_trial', {
      p_player_id: playerId,
      p_rules_version: GENE_ELIGIBILITY_RULES_VERSION,
      p_gene_id: geneId,
    });
    if (error) {
      if (!isMissingGeneEligibilityInfra(error)) {
        console.error('select_gene_trial failed:', { playerId, geneId, error });
        Sentry.captureException(
          new Error(`select_gene_trial failed: ${error.message}`),
          {
            level: 'warning',
            extra: { playerId, geneId },
            tags: { wp: 'wp-pe-d' },
          }
        );
      }
      return { status: 'unavailable' };
    }
    return { status: 'selected' };
  } catch (error) {
    console.error('select_gene_trial threw:', { playerId, geneId, error });
    Sentry.captureException(error, {
      level: 'warning',
      extra: { playerId, geneId },
      tags: { wp: 'wp-pe-d' },
    });
    return { status: 'unavailable' };
  }
}
