/**
 * Curriculum Gene eligibility — the server side of `player_gene_eligibility`
 * (WP-B; `docs/game/PLAYER_EVOLUTION_SERVER_CONTRACT.md` §1-2, §7).
 *
 * WHAT THIS OWNS
 *
 * Which Genes an account may be OFFERED. Not which Genes exist — the complete
 * roster stays inspectable in the Workbench — and not what a run pays. The
 * satellite table has no write policy at all, so every mutation here goes
 * through a `SECURITY DEFINER` RPC granted only to the service role.
 *
 * WHY IT DEGRADES QUIETLY, WHEN `genome.ts` DELIBERATELY DOES NOT
 *
 * `getGenomeRunFacts` refuses to swallow a read failure because its
 * `bankedRuns` feeds `tierCap` and `adjustedDna`: a shrug there pays the
 * player less, permanently, with no record. Curriculum eligibility has NO
 * payout consequence. Its only failure mode is composing the wrong vocabulary,
 * and the safe answer to "I could not read this" is the complete legal Dynasty
 * roster — today's shipped behaviour — never an empty or partial pool. So this
 * module copies `isMissingLadderInfra`, not `getGenomeRunFacts`.
 *
 * That also makes the app deployable BEFORE the migration applies: with no
 * table and no RPCs, `available` is false everywhere and every run composes
 * exactly the pool it composes today.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import {
  isGenomeV2ActiveGeneId,
  type GenomeV2ActiveGeneId,
} from '@/shared/game/genes';
import { GENOME_RULES_V2 } from '@/shared/game/genomeV2';

/** The catalog identity eligibility rows are keyed by. */
export const GENE_ELIGIBILITY_RULES_VERSION = GENOME_RULES_V2;

/**
 * True when a Supabase error just means migration 066 has not been applied
 * here yet: unknown table/column (42P01, 42703), unknown function (42883), or
 * PostgREST's schema-cache equivalents. Mirrors `isMissingLadderInfra`.
 *
 * The name test is deliberately narrow. `isMissingCodexInfra` refuses message
 * matching altogether because permission, timeout and connection errors also
 * carry table names; here the codes do the work and the names only catch a
 * driver that reports a missing object without one.
 */
export function isMissingGeneEligibilityInfra(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false;
  if (
    error.code === '42P01' ||
    error.code === '42703' ||
    error.code === '42883' ||
    error.code === 'PGRST202' ||
    error.code === 'PGRST204' ||
    error.code === 'PGRST205'
  ) {
    return true;
  }
  return /player_gene_eligibility|read_gene_eligibility|grant_starter_eligibility|resolve_learning_event/i.test(
    error.message || ''
  );
}

export interface GeneEligibilityState {
  /**
   * `false` means "no curriculum state here" — the table is absent, the read
   * failed, or the payload was unreadable. Composition answers it with the
   * complete legal Dynasty roster.
   */
  available: boolean;
  /** Offer-eligible Genes, sorted, deduplicated, catalog-validated. */
  eligibleGeneIds: GenomeV2ActiveGeneId[];
  /** The single selected trial, or null. */
  trialGeneId: GenomeV2ActiveGeneId | null;
}

const NO_ELIGIBILITY: GeneEligibilityState = {
  available: false,
  eligibleGeneIds: [],
  trialGeneId: null,
};

function report(
  scope: string,
  error: { code?: string; message?: string },
  extra: Record<string, unknown>
): void {
  if (isMissingGeneEligibilityInfra(error)) return;
  console.error(`Gene eligibility ${scope} failed:`, { ...extra, error });
  Sentry.captureException(new Error(`${scope} failed: ${error.message}`), {
    level: 'warning',
    extra,
    tags: { wp: 'wp-pe-b' },
  });
}

/**
 * Rows returned by `read_gene_eligibility`, defensively re-validated here.
 *
 * The RPC already checks its ids against the catalog, but a row written under
 * an older roster can outlive a rotation, and a Gene this build has never
 * heard of must not reach `createGenomeV2State` — which would reject the whole
 * pool and drop the run to the legacy engine.
 */
function sanitizeRows(value: unknown): GeneEligibilityState | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const payload = value as Record<string, unknown>;
  if (!Array.isArray(payload.eligibleGeneIds)) return null;
  const eligible = new Set<GenomeV2ActiveGeneId>();
  for (const geneId of payload.eligibleGeneIds) {
    if (isGenomeV2ActiveGeneId(geneId)) eligible.add(geneId);
  }
  const trial = payload.trialGeneId;
  return {
    available: true,
    eligibleGeneIds: Array.from(eligible).sort(),
    trialGeneId: isGenomeV2ActiveGeneId(trial) ? trial : null,
  };
}

/** Composition read at run start. Never throws, never blocks a start. */
export async function readGeneEligibility(
  supabase: SupabaseClient,
  playerId: string
): Promise<GeneEligibilityState> {
  try {
    const { data, error } = await supabase.rpc('read_gene_eligibility', {
      p_player_id: playerId,
      p_rules_version: GENE_ELIGIBILITY_RULES_VERSION,
    });
    if (error) {
      report('read_gene_eligibility', error, { playerId });
      return NO_ELIGIBILITY;
    }
    const sanitized = sanitizeRows(data);
    if (!sanitized) {
      report(
        'read_gene_eligibility',
        { message: 'payload is not an eligibility projection' },
        { playerId }
      );
      return NO_ELIGIBILITY;
    }
    return sanitized;
  } catch (error) {
    report('read_gene_eligibility', { message: String(error) }, { playerId });
    return NO_ELIGIBILITY;
  }
}

/**
 * Seed this Dynasty's starter Genes at run start.
 *
 * Idempotent by primary key and additive only, so a repeat start, a second
 * Dynasty, or a veteran already holding the roster all no-op. The composer
 * unions the same constant anyway — this write exists so the Workbench can
 * read a truthful per-Gene state, not so a run can be played.
 */
export async function grantStarterEligibility(
  supabase: SupabaseClient,
  playerId: string,
  geneIds: readonly GenomeV2ActiveGeneId[]
): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('grant_starter_eligibility', {
      p_player_id: playerId,
      p_rules_version: GENE_ELIGIBILITY_RULES_VERSION,
      p_gene_ids: [...geneIds],
    });
    if (error) {
      report('grant_starter_eligibility', error, { playerId });
      return false;
    }
    return true;
  } catch (error) {
    report(
      'grant_starter_eligibility',
      { message: String(error) },
      { playerId }
    );
    return false;
  }
}

/**
 * Promote a resolved trial to ordinary offer eligibility.
 *
 * NEVER BLOCKS SETTLEMENT. The caller treats a `false` exactly like a success
 * it did not need: the Gene stays a trial, the run has already been paid, and
 * the next settled run that resolves the same event promotes it. Idempotent on
 * `resolved_session_id`, so a replayed settlement promotes once.
 */
export async function resolveLearningEvent(
  supabase: SupabaseClient,
  playerId: string,
  geneId: GenomeV2ActiveGeneId,
  sessionId: string,
  learningEventVersion: number
): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('resolve_learning_event', {
      p_player_id: playerId,
      p_rules_version: GENE_ELIGIBILITY_RULES_VERSION,
      p_gene_id: geneId,
      p_session_id: sessionId,
      p_learning_event_version: learningEventVersion,
    });
    if (error) {
      report('resolve_learning_event', error, { playerId, geneId, sessionId });
      return false;
    }
    return true;
  } catch (error) {
    report(
      'resolve_learning_event',
      { message: String(error) },
      { playerId, geneId, sessionId }
    );
    return false;
  }
}
