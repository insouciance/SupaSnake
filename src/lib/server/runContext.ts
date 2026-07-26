/**
 * The run-start context (WP-2.05 — Player Truth, migration 054).
 *
 * SETTLE UNDER THE RULES THE RUN STARTED UNDER.
 *
 * Before this module, settlement RE-DERIVED everything the engine had been
 * given at start: the snake's traits and generation, the mutation pool, the
 * gene pool, the heirloom strain points, the lineage offer bias, the FTUE
 * tier cap, the splice gate, the Gauntlet strain suppression. Six or seven
 * round trips, each of them a fresh chance to read something different from
 * what the run was actually played under — and each of them, on a swallowed
 * error, a smaller payout (`validation.adjustedDna` is computed from
 * `genomeInput.heirloom` and `.tierCap`).
 *
 * Three things fall out of persisting it instead:
 *
 *   1. A transient read failure at settlement can no longer change how a run
 *      settles, because settlement no longer performs those reads.
 *   2. `verifyOfferTrace` finally replays against the context the engine
 *      actually received, retiring a whole class of `OFFER_SEED_MISMATCH`.
 *   3. Re-equipping or breeding mid-run can no longer change the rules a run
 *      in flight settles under.
 *
 * CONTRACT
 *
 * - The blob is SERVER-DERIVED at start and never client-supplied. There is
 *   no request field through which any of it could arrive.
 * - Parsing is STRICT. A NULL column is expected (a run started before
 *   migration 054, or before this deploy) and falls back to the re-derive
 *   path silently. A MALFORMED blob is a bug, so it takes the same fallback
 *   but raises an `error`-level alert.
 * - The run's world condition is deliberately NOT stored here.
 *   `resolveSessionWorldCondition` (WP-2.10a) already re-derives it from the
 *   session row's own three stamps, which is authoritative and cannot drift.
 *   Two sources for one fact is how they disagree.
 */

import { isMutationId, type MutationId } from '@/shared/game/mutations';
import { isGeneId, type GeneId } from '@/shared/game/genes';
import { sanitizeTraits, type TraitId } from '@/shared/game/traits';
import { STRAIN_IDS, type StrainId, type StrainPoints } from '@/shared/game/strains';
import type { LineageBias } from '@/shared/game/offerGravity';

/** The current context version. A future shape change bumps this. */
export const RUN_CONTEXT_VERSION = 1;

/** The genome half — present only on a run the server issued a seed for. */
export interface RunStartGenomeContext {
  /** Server-composed gene offer pool; null means ungated. */
  genePool: GeneId[] | null;
  /** Starting strain points from lineage + traits. */
  heirloom: StrainPoints;
  /** The lineage offer bias the engine drew under. */
  lineage: LineageBias | null;
  /** Economy-binding FTUE tier ceiling. */
  tierCap: 1 | 2 | 3;
  /** Gauntlet strain ban; Expressions/Apexes disabled for these. */
  suppressedStrains: StrainId[];
  /**
   * Per-strain tier-threshold deltas contributed by the week's condition
   * clauses (WP-2.10b). Frozen at start for the same reason as tierCap: a
   * clause that made an Expression cheaper must keep doing so at settlement,
   * even if the week's draw is later re-derived differently.
   */
  strainThresholdDelta?: Partial<Record<StrainId, number>>;
  /** FTUE gate: parent genes stay loose and Splice effects are off when false. */
  splicesUnlocked: boolean;
  /** Server fact at start: the previous earned run ended in death. */
  prevRunDied: boolean;
  /**
   * COSMIC M10: the Constellation Crown may raise the combo trust ratio.
   *
   * The condition-derived offer tilt (`anomalyStrain`) is deliberately NOT
   * here. `resolveSessionWorldCondition` re-derives the run's condition from
   * the session row's own stamps at settlement, and `ANOMALY_STRAINS` maps
   * it to the same strain the engine drew under - one source, no drift.
   */
  crownAllowed: boolean;
}

export interface RunStartContext {
  v: typeof RUN_CONTEXT_VERSION;
  /** The equipped snake, as it was at the moment the run started. */
  snake: {
    id: string;
    generation: number;
    traits: TraitId[];
  };
  /** The mutation offer pool the engine was handed (post-ban, post-seasonal). */
  mutationPool: MutationId[];
  /** True when the run was started as rewardless practice. */
  freePlay: boolean;
  genome: RunStartGenomeContext | null;
}

/** Outcome of parsing a stored blob. */
export type RunStartContextParse =
  | { ok: true; context: RunStartContext }
  | { ok: false; reason: string; malformed: boolean };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStrainPoints(raw: unknown): StrainPoints | null {
  if (!isPlainObject(raw)) return null;
  const points: StrainPoints = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!(STRAIN_IDS as readonly string[]).includes(key)) return null;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      return null;
    }
    points[key as StrainId] = value;
  }
  return points;
}

function parseStrainList(raw: unknown): StrainId[] | null {
  if (!Array.isArray(raw)) return null;
  const list: StrainId[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string' || !(STRAIN_IDS as readonly string[]).includes(entry)) {
      return null;
    }
    list.push(entry as StrainId);
  }
  return list;
}

function parseLineageBias(raw: unknown): LineageBias | null | 'invalid' {
  if (raw === null || raw === undefined) return null;
  if (!isPlainObject(raw)) return 'invalid';
  const strains = parseStrainList(raw.strains);
  if (strains === null) return 'invalid';
  if (typeof raw.guaranteeFirstOffer !== 'boolean') return 'invalid';
  let guaranteeStrains: StrainId[] | undefined;
  if (raw.guaranteeStrains !== undefined && raw.guaranteeStrains !== null) {
    const parsed = parseStrainList(raw.guaranteeStrains);
    if (parsed === null) return 'invalid';
    guaranteeStrains = parsed;
  }
  return {
    strains,
    guaranteeFirstOffer: raw.guaranteeFirstOffer,
    ...(guaranteeStrains ? { guaranteeStrains } : {}),
  };
}

function parseGenome(raw: unknown): RunStartGenomeContext | null | 'invalid' {
  if (raw === null || raw === undefined) return null;
  if (!isPlainObject(raw)) return 'invalid';

  let genePool: GeneId[] | null = null;
  if (raw.genePool !== null && raw.genePool !== undefined) {
    if (!Array.isArray(raw.genePool)) return 'invalid';
    const pool: GeneId[] = [];
    for (const entry of raw.genePool) {
      if (!isGeneId(entry)) return 'invalid';
      pool.push(entry);
    }
    genePool = pool;
  }

  const heirloom = parseStrainPoints(raw.heirloom);
  if (heirloom === null) return 'invalid';

  const lineage = parseLineageBias(raw.lineage);
  if (lineage === 'invalid') return 'invalid';

  if (raw.tierCap !== 1 && raw.tierCap !== 2 && raw.tierCap !== 3) return 'invalid';

  const suppressedStrains = parseStrainList(raw.suppressedStrains);
  if (suppressedStrains === null) return 'invalid';

  if (typeof raw.splicesUnlocked !== 'boolean') return 'invalid';
  if (typeof raw.prevRunDied !== 'boolean') return 'invalid';
  if (typeof raw.crownAllowed !== 'boolean') return 'invalid';

  return {
    genePool,
    heirloom,
    lineage,
    tierCap: raw.tierCap,
    suppressedStrains,
    splicesUnlocked: raw.splicesUnlocked,
    prevRunDied: raw.prevRunDied,
    crownAllowed: raw.crownAllowed,
  };
}

/**
 * Parse a stored `game_sessions.run_context` blob.
 *
 * `malformed` distinguishes the two "no context" cases the route reports
 * differently: an ABSENT context is the ordinary pre-migration/pre-deploy
 * state and is silent, while a PRESENT-BUT-WRONG context is a bug and is
 * alerted at `error` level. Both take the re-derive path — settlement must
 * never refuse to pay a run because a convenience cache was unreadable.
 */
export function parseRunStartContext(raw: unknown): RunStartContextParse {
  if (raw === null || raw === undefined) {
    return { ok: false, reason: 'absent', malformed: false };
  }
  if (!isPlainObject(raw)) {
    return { ok: false, reason: 'not an object', malformed: true };
  }
  if (raw.v !== RUN_CONTEXT_VERSION) {
    return {
      ok: false,
      reason: `unsupported version ${JSON.stringify(raw.v)}`,
      malformed: true,
    };
  }
  if (!isPlainObject(raw.snake)) {
    return { ok: false, reason: 'snake block missing', malformed: true };
  }
  const { id, generation } = raw.snake as { id?: unknown; generation?: unknown };
  if (typeof id !== 'string' || id.length === 0) {
    return { ok: false, reason: 'snake id missing', malformed: true };
  }
  if (
    typeof generation !== 'number' ||
    !Number.isInteger(generation) ||
    generation < 1
  ) {
    return { ok: false, reason: 'snake generation invalid', malformed: true };
  }
  // Traits go through the same sanitizer the snake row does, so an unknown
  // id is dropped exactly as it would have been at start rather than
  // condemning the whole blob.
  const traits = sanitizeTraits((raw.snake as Record<string, unknown>).traits);

  if (!Array.isArray(raw.mutationPool)) {
    return { ok: false, reason: 'mutationPool missing', malformed: true };
  }
  const mutationPool: MutationId[] = [];
  for (const entry of raw.mutationPool) {
    if (!isMutationId(entry)) {
      return { ok: false, reason: `unknown mutation ${JSON.stringify(entry)}`, malformed: true };
    }
    mutationPool.push(entry);
  }

  if (typeof raw.freePlay !== 'boolean') {
    return { ok: false, reason: 'freePlay flag missing', malformed: true };
  }

  const genome = parseGenome(raw.genome);
  if (genome === 'invalid') {
    return { ok: false, reason: 'genome block malformed', malformed: true };
  }

  return {
    ok: true,
    context: {
      v: RUN_CONTEXT_VERSION,
      snake: { id, generation, traits },
      mutationPool,
      freePlay: raw.freePlay,
      genome,
    },
  };
}

/**
 * The JSON the session row stores. Explicit rather than a spread of the
 * in-memory object, so adding a field to `RunStartContext` without deciding
 * whether it belongs in the database is a type error rather than a silent
 * schema change.
 */
export function serializeRunStartContext(
  context: RunStartContext
): Record<string, unknown> {
  return {
    v: RUN_CONTEXT_VERSION,
    snake: {
      id: context.snake.id,
      generation: context.snake.generation,
      traits: context.snake.traits,
    },
    mutationPool: context.mutationPool,
    freePlay: context.freePlay,
    genome: context.genome
      ? {
          genePool: context.genome.genePool,
          heirloom: context.genome.heirloom,
          lineage: context.genome.lineage,
          tierCap: context.genome.tierCap,
          suppressedStrains: context.genome.suppressedStrains,
          splicesUnlocked: context.genome.splicesUnlocked,
          prevRunDied: context.genome.prevRunDied,
          crownAllowed: context.genome.crownAllowed,
        }
      : null,
  };
}

/**
 * True when a Supabase error just means migration 054 has not been applied
 * here yet: unknown column (42703) or PostgREST's schema-cache equivalent.
 */
export function isMissingRunContextInfra(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false;
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  return /run_context/i.test(error.message || '');
}
