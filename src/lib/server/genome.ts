/**
 * Server-side genome context (Buildcraft: The Genome).
 *
 * Everything the session route derives for a genome run - the gene offer
 * pool, the FTUE ramp, lineage + heirloom starting strain points, and
 * the previous-run fact for Grave Robber. All server-derived: the client
 * never asserts any of it. Every read here is pre-migration-safe (a
 * missing column/row degrades to the legacy behavior).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  lineageFromAffinity,
  sanitizeLineage,
  type Lineage,
} from '@/shared/game/lineage';

/**
 * The pure half moved to `@/shared/game/genePool` (WP-2.08) so the Workbench
 * can compose the same pool and apply the same FTUE ceiling the run will be
 * paid under, without a shared module importing `lib/server`. Re-exported here
 * so every existing call site keeps its import path and its meaning.
 */
export {
  composeGenePool,
  deriveFtue,
  deriveHeirloom,
  ftueTierCap,
} from '@/shared/game/genePool';
export type { GenomeFtue } from '@/shared/game/genePool';

/**
 * The equipped snake's lineage: the collected row's own lineage JSONB
 * (post-030, breeding-crafted) with the variant's innate affinity as the
 * fallback. Pre-030 both reads miss => null (legacy behavior).
 */
export function lineageFromRows(
  snakeRow: Record<string, unknown>,
  variantRow: Record<string, unknown> | null
): Lineage | null {
  const own = sanitizeLineage(snakeRow.lineage);
  if (own) return own;
  return lineageFromAffinity(
    variantRow?.lineage_strain,
    variantRow?.affinity_strength
  );
}

/** The three server facts a genome run's context is derived from. */
export interface GenomeRunFacts {
  bankedRuns: number;
  prevRunDied: boolean;
  ownedVariants: number;
}

/**
 * Result of reading those facts. `ok: false` is UNIGNORABLE by construction —
 * there is no `bankedRuns` on the failure shape to read past the check.
 */
export type GenomeRunFactsResult =
  | ({ ok: true } & GenomeRunFacts)
  | { ok: false; reason: string; error: unknown };

/**
 * Banked-run count (FTUE), distinct owned variants (Build Seed gate), and
 * previous earned-run outcome (Grave Robber).
 *
 * WP-2.05 — THIS FUNCTION USED TO TAKE MONEY OFF A RUN.
 *
 * Its three reads each sat in a `try { const { count } = ... } catch {}` with
 * the Supabase `error` never inspected, degrading to `bankedRuns = 0`. That
 * is not a cosmetic default: `bankedRuns` drives `deriveFtue`, which drives
 * `ftueTierCap` and `deriveHeirloom`, which the session route feeds to the
 * validator as `genomeInput.tierCap` and `genomeInput.heirloom` — and
 * `validation.adjustedDna` IS THE PAYOUT. A transient database blip
 * therefore silently paid the player at tier 1 with no heirloom points: a
 * smaller number, permanently, with no record that anything went wrong.
 *
 * So the failure is now returned rather than absorbed, and the shape makes
 * it impossible to ignore. The session route answers 503 — never 404 — so
 * the offline outbox retries (it retries 5xx and DROPS 4xx) and the run's
 * DNA survives the blip.
 */
export async function getGenomeRunFacts(
  supabase: SupabaseClient,
  playerId: string
): Promise<GenomeRunFactsResult> {
  try {
    const { count, error: bankedError } = await supabase
      .from('game_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('player_id', playerId)
      .eq('extracted', true)
      .eq('validated', true)
      .eq('is_free_play', false)
      .not('ended_at', 'is', null);
    if (bankedError) {
      return { ok: false, reason: 'banked-run count', error: bankedError };
    }

    const { data: snakeRows, error: variantsError } = await supabase
      .from('collected_snakes')
      .select('snake_variant_id')
      .eq('player_id', playerId);
    if (variantsError) {
      return { ok: false, reason: 'owned variants', error: variantsError };
    }

    const { data: lastRows, error: prevRunError } = await supabase
      .from('game_sessions')
      .select('extracted, ended_at')
      .eq('player_id', playerId)
      .eq('validated', true)
      .eq('is_free_play', false)
      .not('ended_at', 'is', null)
      .order('ended_at', { ascending: false })
      .limit(1);
    if (prevRunError) {
      return { ok: false, reason: 'previous run outcome', error: prevRunError };
    }

    const last = Array.isArray(lastRows) ? lastRows[0] : null;
    return {
      ok: true,
      bankedRuns: count ?? 0,
      ownedVariants: new Set(
        (snakeRows ?? [])
          .map((row) => row.snake_variant_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      ).size,
      prevRunDied: last ? last.extracted !== true : false,
    };
  } catch (err) {
    return { ok: false, reason: 'genome run facts', error: err };
  }
}
