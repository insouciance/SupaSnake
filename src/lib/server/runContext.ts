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
import {
  isGeneId,
  isGenomeV2ActiveGeneId,
  type GeneId,
  type GenomeV2ActiveGeneId,
} from '@/shared/game/genes';
import {
  GENOME_RULES_V1,
  GENOME_RULES_V2,
  genomeV2FtueFromPresentation,
  type GenomeRulesVersion,
  type GenomeV2FtuePresentation,
} from '@/shared/game/genomeV2';
import {
  ASCENDANCE_MULTIPLIER_BPS,
  ascendanceYieldMultiplierBps,
  type AscendanceRunStamp,
} from '@/shared/game/ascendance';
import { sanitizeTraits, type TraitId } from '@/shared/game/traits';
import { STRAIN_IDS, type StrainId, type StrainPoints } from '@/shared/game/strains';
import type { LineageBias } from '@/shared/game/offerGravity';
import { isGrowthProfileId, type GrowthProfileId } from '@/shared/game/growth';
import { DEFAULT_LADDER_RUNG, isLadderRung } from '@/shared/game/ladder';

/** The current context version. A future shape change bumps this. */
export const RUN_CONTEXT_VERSION = 1;

interface RunStartGenomeContextCommon {
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
  /**
   * Server fact at start: the previous earned run ended in death.
   *
   * `crownAllowed` used to sit beside this - COSMIC M10's permission to raise
   * the combo trust ratio - and WP-3.13 deleted the combo, the ratio and the
   * permission together. Contexts written before then still carry the key;
   * `parseGenomeContext` no longer requires it, so those rows keep parsing.
   *
   * The condition-derived offer tilt (`anomalyStrain`) is deliberately NOT
   * here either. `resolveSessionWorldCondition` re-derives the run's
   * condition from the session row's own stamps at settlement, and
   * `ANOMALY_STRAINS` maps it to the same strain the engine drew under -
   * one source, no drift.
   */
  prevRunDied: boolean;
}

export interface RunStartGenomeV1Context extends RunStartGenomeContextCommon {
  /** Missing is the durable pre-v2 spelling. */
  rulesVersion?: typeof GENOME_RULES_V1;
  genePool: GeneId[] | null;
}

export interface RunStartGenomeV2Context extends RunStartGenomeContextCommon {
  rulesVersion: typeof GENOME_RULES_V2;
  /** Exact run-start-frozen authority consumed by the offer stream. */
  genePool: GenomeV2ActiveGeneId[];
  /** Full locked-but-visible capability contract handed to the client. */
  ftuePresentation: GenomeV2FtuePresentation;
  /** Phoenix is mutually exclusive with a run-start-frozen outside revive. */
  externalSecondLife: 'iron_scales' | 'other' | null;
}

/** The genome half — present only on a run the server issued a seed for. */
export type RunStartGenomeContext =
  | RunStartGenomeV1Context
  | RunStartGenomeV2Context;

export interface RunStartContext {
  v: typeof RUN_CONTEXT_VERSION;
  /** The equipped snake, as it was at the moment the run started. */
  snake: {
    id: string;
    generation: number;
    traits: TraitId[];
    /** Missing means the historical v1 curve; new runs always stamp v2. */
    ascendance?: AscendanceRunStamp;
  };
  /** The mutation offer pool the engine was handed (post-ban, post-seasonal). */
  mutationPool: MutationId[];
  /** True when the run was started as rewardless practice. */
  freePlay: boolean;
  /**
   * The growth profile the run was started under (WP-3.02).
   *
   * Stamped here rather than gated behind a `NEXT_PUBLIC_*` flag because
   * those are inlined at build time: a client built with one curve and a
   * server recomputing with another disagree on every length, and a length
   * disagreement silently invalidates an honest run. Settlement replays from
   * this stamp, so the run settles under the rules it STARTED under - the
   * same principle as `tierCap` and the clause thresholds above.
   *
   * Absent on every run started before the lab shipped; those resolve to
   * `baseline`, which is byte-identical to the shipped curve.
   */
  growthProfileId?: GrowthProfileId;
  /**
   * The D2 ladder rung the run was started at (WP-3.12).
   *
   * Stamped for exactly the reasons `growthProfileId` is, and by the same
   * mechanism: the rung decides how many segments an INFUSE grows, where the
   * doors stand and what a crash salvages, and all three are recomputed at
   * settlement. A rung chosen behind a build-time flag would let a client play
   * one set of rules while the server settles another.
   *
   * Absent on every run started before the ladder shipped, on every run started
   * with the flag off, and on every rung-0 run — `serializeRunStartContext`
   * omits the key rather than writing a zero, so a Ground run stores exactly
   * the blob it stored before the ladder existed. All three resolve to rung 0.
   */
  ladderRung?: number;
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

function parseStrainThresholdDelta(
  raw: unknown
): Partial<Record<StrainId, number>> | null | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!isPlainObject(raw)) return null;
  const result: Partial<Record<StrainId, number>> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (
      !(STRAIN_IDS as readonly string[]).includes(key) ||
      !Number.isSafeInteger(value)
    ) return null;
    result[key as StrainId] = value as number;
  }
  return result;
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

  const rulesVersion: GenomeRulesVersion | null = raw.rulesVersion === GENOME_RULES_V2
    ? GENOME_RULES_V2
    : raw.rulesVersion === undefined || raw.rulesVersion === GENOME_RULES_V1
      ? GENOME_RULES_V1
      : null;
  if (rulesVersion === null) return 'invalid';

  let genePool: (GeneId | GenomeV2ActiveGeneId)[] | null = null;
  if (raw.genePool !== null && raw.genePool !== undefined) {
    if (!Array.isArray(raw.genePool)) return 'invalid';
    const pool: (GeneId | GenomeV2ActiveGeneId)[] = [];
    for (const entry of raw.genePool) {
      if (
        rulesVersion === GENOME_RULES_V2
          ? !isGenomeV2ActiveGeneId(entry)
          : !isGeneId(entry)
      ) return 'invalid';
      pool.push(entry);
    }
    genePool = pool;
  }
  if (
    rulesVersion === GENOME_RULES_V2 &&
    (!genePool || genePool.length < 2 || new Set(genePool).size !== genePool.length)
  ) {
    return 'invalid';
  }

  const heirloom = parseStrainPoints(raw.heirloom);
  if (heirloom === null) return 'invalid';

  const lineage = parseLineageBias(raw.lineage);
  if (lineage === 'invalid') return 'invalid';

  if (raw.tierCap !== 1 && raw.tierCap !== 2 && raw.tierCap !== 3) return 'invalid';

  const suppressedStrains = parseStrainList(raw.suppressedStrains);
  if (suppressedStrains === null) return 'invalid';
  if (
    rulesVersion === GENOME_RULES_V2 &&
    new Set(suppressedStrains).size !== suppressedStrains.length
  ) return 'invalid';
  const strainThresholdDelta = parseStrainThresholdDelta(
    raw.strainThresholdDelta
  );
  if (strainThresholdDelta === null) return 'invalid';

  if (typeof raw.splicesUnlocked !== 'boolean') return 'invalid';
  if (typeof raw.prevRunDied !== 'boolean') return 'invalid';

  const common: RunStartGenomeContextCommon = {
    heirloom,
    lineage,
    tierCap: raw.tierCap,
    suppressedStrains,
    ...(strainThresholdDelta ? { strainThresholdDelta } : {}),
    splicesUnlocked: raw.splicesUnlocked,
    prevRunDied: raw.prevRunDied,
  };
  if (rulesVersion === GENOME_RULES_V1) {
    return {
      ...common,
      ...(raw.rulesVersion === GENOME_RULES_V1
        ? { rulesVersion: GENOME_RULES_V1 }
        : {}),
      genePool: genePool as GeneId[] | null,
    };
  }
  let ftuePresentation: GenomeV2FtuePresentation;
  try {
    const ftue = genomeV2FtueFromPresentation(raw.ftuePresentation);
    if (ftue.splicesUnlocked !== raw.splicesUnlocked) return 'invalid';
    ftuePresentation = raw.ftuePresentation as GenomeV2FtuePresentation;
  } catch {
    return 'invalid';
  }
  if (
    raw.externalSecondLife !== null &&
    raw.externalSecondLife !== 'iron_scales' &&
    raw.externalSecondLife !== 'other'
  ) return 'invalid';
  return {
    ...common,
    rulesVersion: GENOME_RULES_V2,
    genePool: genePool as GenomeV2ActiveGeneId[],
    ftuePresentation,
    externalSecondLife: raw.externalSecondLife,
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
  const ascendanceRaw = (raw.snake as Record<string, unknown>).ascendance;
  let ascendance: AscendanceRunStamp | undefined;
  if (ascendanceRaw !== undefined && ascendanceRaw !== null) {
    if (!isPlainObject(ascendanceRaw)) {
      return { ok: false, reason: 'snake ascendance malformed', malformed: true };
    }
    const curveVersion = ascendanceRaw.curveVersion;
    const multiplierBps = ascendanceRaw.multiplierBps;
    if (
      (curveVersion !== 1 && curveVersion !== 2) ||
      typeof multiplierBps !== 'number' ||
      !Number.isSafeInteger(multiplierBps) ||
      multiplierBps < ASCENDANCE_MULTIPLIER_BPS ||
      multiplierBps !== ascendanceYieldMultiplierBps(generation, curveVersion)
    ) {
      return { ok: false, reason: 'snake ascendance malformed', malformed: true };
    }
    ascendance = { curveVersion, multiplierBps };
  }

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

  // Deliberately NOT strict: an absent or unrecognised profile resolves to
  // `baseline` instead of failing the parse. A stamp written by a newer build
  // must never make an older one treat the whole context as malformed and
  // fall back to re-deriving - that would be a worse outcome than settling a
  // lab run on the shipped curve.
  const growthProfileId = isGrowthProfileId(raw.growthProfileId)
    ? raw.growthProfileId
    : undefined;

  // LENIENT FOR THE SAME REASON, and it matters more here. The ladder is
  // expected to GROW, so a run stamped at a rung this build has not heard of is
  // the ordinary consequence of a staged deploy - not a malformed blob. It
  // resolves to rung 0, the shipped game, exactly as `resolveLadderRung` does
  // everywhere else. Condemning the whole context over it would send an
  // otherwise perfect settlement down the re-derive path.
  const ladderRung = isLadderRung(raw.ladderRung) ? raw.ladderRung : undefined;

  return {
    ok: true,
    context: {
      v: RUN_CONTEXT_VERSION,
      snake: {
        id,
        generation,
        traits,
        ...(ascendance ? { ascendance } : {}),
      },
      mutationPool,
      freePlay: raw.freePlay,
      ...(growthProfileId ? { growthProfileId } : {}),
      ...(ladderRung !== undefined && ladderRung !== DEFAULT_LADDER_RUNG
        ? { ladderRung }
        : {}),
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
      ...(context.snake.ascendance
        ? { ascendance: context.snake.ascendance }
        : {}),
    },
    mutationPool: context.mutationPool,
    freePlay: context.freePlay,
    // Omitted entirely when baseline/absent, so a shipped-curve run stores
    // exactly the blob it stored before the lab existed.
    ...(context.growthProfileId ? { growthProfileId: context.growthProfileId } : {}),
    // Omitted entirely at rung 0, so a Ground run stores exactly the blob it
    // stored before the ladder existed. An absent key and a stored 0 mean the
    // same thing everywhere they are read, and only one of them is a byte.
    ...(context.ladderRung !== undefined && context.ladderRung !== DEFAULT_LADDER_RUNG
      ? { ladderRung: context.ladderRung }
      : {}),
    genome: context.genome
      ? {
          ...(context.genome.rulesVersion === GENOME_RULES_V2
            ? {
                rulesVersion: GENOME_RULES_V2,
                ftuePresentation: context.genome.ftuePresentation,
                externalSecondLife: context.genome.externalSecondLife,
              }
            : context.genome.rulesVersion === GENOME_RULES_V1
              ? { rulesVersion: GENOME_RULES_V1 }
              : {}),
          genePool: context.genome.genePool,
          heirloom: context.genome.heirloom,
          lineage: context.genome.lineage,
          tierCap: context.genome.tierCap,
          suppressedStrains: context.genome.suppressedStrains,
          ...(context.genome.strainThresholdDelta
            ? { strainThresholdDelta: context.genome.strainThresholdDelta }
            : {}),
          splicesUnlocked: context.genome.splicesUnlocked,
          prevRunDied: context.genome.prevRunDied,
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
