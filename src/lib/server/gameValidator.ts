/**
 * Game Result Validator - server-authoritative payout recompute (Design v2)
 *
 * The client claims only the raw facts of a run (food count + how it
 * ended + mutation picks); the server recomputes score and DNA exactly via
 * the shared ruleset module and PAYS THE RECOMPUTED VALUE regardless of the
 * claim. Claims that mismatch beyond a rounding epsilon can only flag the
 * session (validated: false) - they can never inflate the payout.
 *
 * Phase 2 (GAME_DESIGN_V2.md sections 3.3 + 5.3):
 * - Mutations/genes: legality (known ids, no dupes, <= 4 legacy mutations or
 *   <= 6 Genome genes), count bound
 *   (picks <= floor(foodCount / minFoodsPerPick); the k-th pick's atFood
 *   >= minFoodsPerPick*k and <= foodCount), then EXACT recompute of every
 *   [E] effect from its atFood onward for PRIMAL/CYBER (and the COSMIC
 *   base). `minFoodsPerPick` comes from the universal Genome cadence, not a
 *   growth profile, so the bound and the cadence that produces the picks stay
 *   one number without coupling build opportunity to body pressure.
 * - Phoenix: a claimed trigger is only honored when phoenix is held and
 *   the food index is plausible; honoring it strictly lowers the payout,
 *   so there is no inflation vector in either direction.
 * - WP-3.13: COSMIC's combo was the ONE payout component this file could
 *   not recompute - the chain depended on tick timing the server cannot
 *   reconstruct, so it arrived as a client claim and was clamped against a
 *   trust ratio rather than derived. The COSMIC redesign deleted the combo,
 *   and the claim, the clamp, the ratio and the Constellation Crown's
 *   permission to raise it went with it. Every dynasty's score and DNA are
 *   now recomputed in full, and NOTHING reaches Score that is not folded
 *   here.
 *
 * Phase 3A (section 6): traits. The traits parameter comes from the SNAKE
 * ROW referenced by the session (collected_snakes.traits via
 * snake_used_id) - NEVER from the client payload, which has no trait
 * field. [E] trait effects join the exact recompute; the Ascetic trait's
 * physical side (mutation food never spawns) makes any mutation claim on
 * an Ascetic snake impossible, so such claims are dropped and flagged;
 * the Patient trait doubles the mutation cadence, doubling the per-pick
 * food bound (4k to 8k on the current curve).
 */

import { GAME_CONFIG } from '@/shared/config/game';
import {
  applyGenomeOutcome,
  applyOutcomeWithMutations,
  computeGenomeRunTotals,
  computeRunTotals,
  getRuleset,
  type DynastyName,
} from '@/shared/game/rulesets';
import {
  conditionAnomaly,
  type ConditionInput,
} from '@/shared/game/worldCondition';
import {
  portalIntervalTax,
  portalTaxFactsAt,
  portalsEncountered,
  portalsPassed,
  type PortalTaxSources,
} from '@/shared/game/portals';
import { ladderCadence } from '@/shared/game/ladder';
import {
  MUTATION_SPAWN,
  isMutationId,
  type MutationId,
  type MutationPick,
} from '@/shared/game/mutations';
import { TRAIT_PHYSICS, type TraitId } from '@/shared/game/traits';
import { type AnomalyId } from '@/shared/game/anomalies';
import {
  GENE_ECONOMICS,
  GENOME_SPAWN,
  geneStrains,
  isGeneId,
  type GeneId,
  type GenePick,
  type GenomeV2ActiveGeneId,
} from '@/shared/game/genes';
import {
  GENOME_RULES_V1,
  GENOME_RULES_V2,
  assertGenomeV2PersistenceBound,
  genomeV2EventId,
  genomeV2FtueFromPresentation,
  genomeV2RunRecord,
  genomeV2YieldFloor,
  settleGenomeV2,
  type GenomeV2FtuePresentation,
  type GenomeV2RunRecord,
} from '@/shared/game/genomeV2';
import {
  STRAIN_ECONOMICS,
  STRAIN_PHYSICS,
  type StrainId,
  type StrainPoints,
} from '@/shared/game/strains';
import {
  clampGenomeClaims,
  genePoolBlockedByTraits,
  sanitizeInfuses,
  sanitizeLossEvents,
  sanitizePressureEvents,
  sanitizeRevive,
  sanitizeSurges,
  strainActivations,
  strainTierAtFood,
  type GenomeClaimClamp,
  type GenomeClaims,
  type GenomeRevive,
  type GenomeRunInput,
  type PressureGrowthEvent,
  type StrainSurge,
} from '@/shared/game/genome';
import {
  resolveGrowthProfile,
  type GrowthProfileId,
} from '@/shared/game/growth';
import { GENE_OFFER_CADENCE } from '@/shared/game/geneCadence';
import {
  fusePicks,
  fusedSlotCount,
  isSpliceId,
  type SpliceId,
} from '@/shared/game/splices';

export interface GameResultInput {
  /** Raw foods eaten - the minimal claimed fact the payout derives from. */
  food_count: number;
  /** True when the run ended through the exit portal (banked +25%). */
  extracted: boolean;
  /** Claimed display score (recomputed server-side). */
  score: number;
  /** Claimed raw DNA before outcome multiplier (recomputed server-side). */
  dna_earned: number;
  duration_seconds: number;
  died: boolean;
  victory: boolean;
  /** Claimed mutation picks: [{ id, atFood }] in pick order (sanitized here). */
  mutations?: unknown;
  /** Claimed Phoenix trigger food index (payout-reducing when honored). */
  phoenix_triggered_at_food?: unknown;
  /**
   * Genome claim block (Buildcraft: The Genome): { infuses, surges,
   * revive, claims, lossEvents, pressureEvents, offerTrace } - sanitized here. Only
   * honored when the session carries a run_seed (server capability).
   */
  genome?: unknown;
}

/**
 * Replay the portal schedule and return how many doors the run PASSED.
 *
 * `undefined` — not zero — when there is no seed to replay. The distinction is
 * the difference between "this run declined nothing" and "this run has no
 * schedule behind it", and `genomeOutcomeMultipliers` treats them differently
 * on purpose: the first is a live carry at its first door, the second keeps the
 * flat multipliers every pre-WP-3.10 blob was settled under.
 *
 * The fact-gathering is the engine's, through `portalTaxFactsAt` — the arithmetic
 * and the facts are both shared, so the only thing left to get wrong here is
 * handing it the wrong run, which the parity test covers.
 */
function derivePortalsPassed(args: {
  runSeed?: string | null;
  dynasty: DynastyName;
  foodCount: number;
  picks: GenePick[];
  heirloom: StrainPoints;
  surges: StrainSurge[];
  tierCap: 1 | 2 | 3;
  suppressedStrains: readonly StrainId[];
  splicesUnlocked: boolean;
  traits: TraitId[];
  anomaly: ConditionInput;
  infuses: { atFood: number }[];
  extracted: boolean;
  ladderRung?: number;
}): number | undefined {
  if (!args.runSeed) return undefined;
  const view = args.splicesUnlocked
    ? fusePicks(args.picks)
    : { loose: [...args.picks], splices: [] };
  const activations = strainActivations(
    args.picks,
    args.heirloom,
    args.surges,
    args.tierCap,
    args.suppressedStrains
  );
  const sources: PortalTaxSources = {
    picks: args.picks,
    splices: view.splices.map((s) => ({ id: s.spliceId, atFood: s.atFood })),
    traits: args.traits,
    anomaly: conditionAnomaly(args.anomaly),
    infuses: args.infuses,
    // The FTUE cap binds here exactly as it binds the engine's `strainTierNow`:
    // a capped run must not be taxed for a tier it was never allowed to reach.
    fluxTierAt: (food: number) =>
      Math.min(args.tierCap, strainTierAtFood(activations.FLUX, food + 0.5)),
  };
  const met = portalsEncountered(
    // WP-3.12: the ladder's "Long Walk" rung pushes every door further away.
    // The ENGINE walks its incremental recurrence through the same
    // `ladderCadence`, so the two sides cannot disagree about where the doors
    // stood - and since the carry multiplies the payout by how many the run
    // met, a disagreement here would be a payout disagreement.
    ladderCadence(getRuleset(args.dynasty).extraction, args.ladderRung),
    args.runSeed,
    args.foodCount,
    (food: number) => portalIntervalTax(portalTaxFactsAt(sources, food))
  );
  return portalsPassed(met, args.infuses.length, args.extracted);
}

/** Server context for historical Genome v1 validation. */
export interface GenomeV1ValidationContext {
  /** Missing is the durable pre-v2 spelling. */
  rulesVersion?: typeof GENOME_RULES_V1;
  /** Starting strain points (traits + lineage, from the snake row). */
  heirloom: StrainPoints;
  /** The player's unlocked GENE pool (server-composed), null = ungated. */
  genePool: GeneId[] | null;
  /** Server fact: the previous earned run ended in death (Grave Robber). */
  prevRunDied: boolean;
  /** FTUE tier ceiling (economy-binding; mirrors the engine's cap). */
  tierCap: 1 | 2 | 3;
  /** Server-derived Gauntlet strain ban; Expressions/Apexes are disabled. */
  suppressedStrains?: readonly StrainId[];
  /** Server-derived FTUE gate. Defaults true for existing callers/tests. */
  splicesUnlocked?: boolean;
  /**
   * The session's `run_seed` — the same one the engine played under.
   *
   * WP-3.10 needs it to replay the food-indexed portal schedule and DERIVE how
   * many doors the run passed, because the carry multiplies the payout by that
   * count and it is far too leveraged to accept as a claim. Absent means no
   * carry at all (see `GenomeRunInput.portalsPassed`), which is the correct
   * answer for a session that predates the seed.
   */
  runSeed?: string | null;
  /**
   * The growth profile the run STARTED under (WP-3.02), read back from
   * `run_context`. Absent means `baseline` - which is every run predating the
   * lab, and every run started with the flag off.
   *
   * The recompute must fold with the profile the engine actually played, not
   * with whatever the current default happens to be: settle a `tuned` run on
   * `baseline` and every length disagrees, which is a mass-invalidation bug
   * wearing a feature flag.
   */
  growthProfileId?: GrowthProfileId;
  /**
   * The D2 ladder rung the run STARTED at (WP-3.12), read back from
   * `run_context`.
   *
   * Settlement must fold under the rung the run was PLAYED at, not under
   * whatever the ladder currently offers: the rung decides how many segments an
   * infuse grew, where the doors stood and what a crash salvages. Absent means
   * rung 0 - every run predating the ladder, every run started with the flag
   * off, and every Ground run, all of which fold byte-identically to the
   * shipped game.
   */
  ladderRung?: number;
}

/**
 * Server context for Genome v2 validation. The terminal record is accepted
 * only after continuity replay produced it on the server; no browser-authored
 * record can enter this branch.
 */
export interface GenomeV2ValidationContext {
  rulesVersion: typeof GENOME_RULES_V2;
  runSeed: string;
  genePool: GenomeV2ActiveGeneId[];
  startingStrainPoints: StrainPoints;
  ftuePresentation: GenomeV2FtuePresentation;
  externalSecondLife: 'iron_scales' | 'other' | null;
  offerTiltStrain: StrainId | null;
  suppressedStrains: StrainId[];
  strainThresholdDelta: Partial<Record<StrainId, number>>;
  authoritativeTerminal: boolean;
  growthProfileId?: GrowthProfileId;
  ladderRung?: number;
}

/** Server-derived, run-start-stamped Genome authority. */
export type GenomeValidationContext =
  | GenomeV1ValidationContext
  | GenomeV2ValidationContext;

/** The validator-accepted genome record (game_sessions.genome JSONB). */
export interface AcceptedGenomeV1 {
  v: 1;
  picks: GenePick[];
  splices: { id: SpliceId; atFood: number }[];
  surges: StrainSurge[];
  infuses: { atFood: number }[];
  revive: GenomeRevive | null;
  /** Bounded Rule-15 physical facts; each fixed growth amount is derived. */
  pressureEvents?: PressureGrowthEvent[];
  claims: GenomeClaims;
  strainCounts: StrainPoints;
  expressions: Partial<Record<string, number>>;
  apexes: Partial<Record<string, number>>;
  /** The global raw clamp bound while individual caps passed (cheat signal). */
  globalClampHit: boolean;
}

export type AcceptedGenome = AcceptedGenomeV1 | GenomeV2RunRecord;

// =============================================================================
// VALIDATION SEVERITY (WP-2.05 — Player Truth)
// =============================================================================

/**
 * THE CLASSIFICATION PRINCIPLE.
 *
 * The server can RECOMPUTE every economic quantity of a run from the run's
 * own inputs. The only two quantities it cannot recompute — only BOUND —
 * are `duration_seconds` and `food_count`, because they are facts about
 * time and physics rather than about arithmetic.
 *
 *   FATAL  <=>  after repair, the server still cannot bound the run's
 *               physics within the session it observed.
 *
 * Everything else is repaired, PAID, COUNTED and ALERTED. A validator
 * finding is forensic information; it is not a fine. Rule 6 and the owner's
 * ruling of 2026-07-26 ("in no way can that score be taken away") make the
 * recompute authoritative — a claim that disagrees with it loses the
 * argument about the payout, not the run.
 *
 * Plus one deliberately narrow second axis — FORGERY: a claim no engine
 * could ever emit. Exactly one code qualifies (`SPLICE_CLAIMED_DIRECTLY`:
 * splices are DERIVED by `fusePicks` and are never claimable), and it is
 * fatal because a forged input means the claim block as a whole describes a
 * run the server did not observe.
 */
export type ValidationSeverity = 'fatal' | 'advisory';

/**
 * The FATAL set, and it is exactly these two.
 *
 * - `INVALID_DURATION` — the client-vs-serverElapsed bound. Load-bearing
 *   because the food-rate bound is DERIVED from duration: unbounded time
 *   means an unbounded food count means an unbounded run. It is also read
 *   straight off the row by the Signal `endure` objective, so a crafted
 *   `duration_seconds` would complete an objective no one played.
 * - `SPLICE_CLAIMED_DIRECTLY` — forgery (see above).
 *
 * Adding a third entry here takes progression away from players and needs
 * the same argument these two carry: name the physical bound that repair
 * cannot restore.
 */
export const FATAL_VALIDATION_CODES = [
  'INVALID_DURATION',
  'SPLICE_CLAIMED_DIRECTLY',
] as const;

export type FatalValidationCode = (typeof FATAL_VALIDATION_CODES)[number];

/**
 * Every code this validator (and the session route's offer-trace check) can
 * push, with its severity. Pinned by a source scan in
 * `gameValidator.severity.test.ts`, so a new `errors.push('NEW_CODE: …')`
 * that is not listed here fails the build rather than silently inheriting a
 * default.
 *
 * ONE table, deliberately: a per-push severity argument would mean touching
 * 45 push sites in a money-adjacent file and would create a second source
 * of truth that migration 055's SQL backfill could not read.
 */
export const VALIDATION_CODE_SEVERITY: Readonly<
  Record<string, ValidationSeverity>
> = Object.freeze({
  // --- FATAL: the physics bound, and forgery -------------------------------
  INVALID_DURATION: 'fatal',
  SPLICE_CLAIMED_DIRECTLY: 'fatal',

  // --- ADVISORY: repaired, paid, counted, alerted --------------------------
  // The divergence signal itself. It says the claim and the recompute
  // disagree; the recompute is what gets paid, so the disagreement is
  // forensic. Making it fatal is what cost ~10 honest extractions their
  // progression.
  DNA_MISMATCH: 'advisory',
  SCORE_MISMATCH: 'advisory',
  // Claims that were clamped to a server-computed cap. The clamp already
  // did the whole job; the code reports what it cost.
  CLAIM_CLAMPED: 'advisory',
  GENOME_GLOBAL_CLAMP: 'advisory',
  // Shape/legality repairs: the offending entry is dropped and the payout
  // is recomputed from what survived.
  INVALID_MUTATIONS: 'advisory',
  INVALID_GENES: 'advisory',
  MUTATION_LOCKED: 'advisory',
  GENE_LOCKED: 'advisory',
  MUTATION_BOUND: 'advisory',
  GENE_BOUND: 'advisory',
  INFUSE_BOUND: 'advisory',
  SURGE_INVALID: 'advisory',
  REVIVE_INVALID: 'advisory',
  PHOENIX_INVALID: 'advisory',
  TRAIT_CONFLICT: 'advisory',
  // Outcome/food-count repairs. `INVALID_FOOD_RATE` clamps the food count
  // to the duration-derived bound — and the duration bound above is the
  // fatal one, so the physics are still bounded after this repair.
  INVALID_OUTCOME: 'advisory',
  INVALID_FOOD_COUNT: 'advisory',
  INVALID_FOOD_RATE: 'advisory',
  // Pushed by the session route, not here. Its own source comment has
  // called it advisory since it shipped, while the code set valid = false.
  OFFER_SEED_MISMATCH: 'advisory',
});

/** The code of a validator error string: everything before the first ':'. */
export function validationCodeOf(error: string): string {
  const colon = error.indexOf(':');
  return (colon === -1 ? error : error.slice(0, colon)).trim();
}

/**
 * Severity of a code. FAIL-SAFE DEFAULT: an unrecognised code is ADVISORY.
 *
 * The asymmetry with migration 055 is deliberate and is the whole design.
 * At RUNTIME an author who adds a code and forgets the table must never
 * cost a live player their progression, so the default pays. In the
 * BACKFILL an unrecognised code SKIPS the row, because a code whose
 * semantics nobody has read must never put a row onto a public board. The
 * source scan makes the runtime default a safety net rather than a
 * loophole.
 */
export function severityOfValidationCode(code: string): ValidationSeverity {
  return VALIDATION_CODE_SEVERITY[code] ?? 'advisory';
}

/** True when this error string carries a fatal code. */
export function isFatalValidationError(error: string): boolean {
  return severityOfValidationCode(validationCodeOf(error)) === 'fatal';
}

/** Split a flat error list into its fatal and advisory halves. */
export function partitionValidationErrors(errors: readonly string[]): {
  fatalErrors: string[];
  advisoryErrors: string[];
} {
  const fatalErrors: string[] = [];
  const advisoryErrors: string[] = [];
  for (const error of errors) {
    if (isFatalValidationError(error)) fatalErrors.push(error);
    else advisoryErrors.push(error);
  }
  return { fatalErrors, advisoryErrors };
}

/**
 * Append an ADVISORY finding to an already-computed result, keeping
 * `errors`, `advisoryErrors` and `valid` consistent.
 *
 * This replaces the session route's hand-set `validation.valid = false`,
 * which was the one place outside this module that could decide a run had
 * failed. It THROWS on a fatal code: a caller outside the validator has no
 * business asserting that the server could not bound a run's physics, and a
 * silent no-op would hide the mistake.
 */
export function appendAdvisory(
  result: ValidationResult,
  error: string
): ValidationResult {
  if (isFatalValidationError(error)) {
    throw new Error(
      `appendAdvisory refuses the fatal code ${validationCodeOf(error)}: ` +
        'fatality is decided inside validateGameResult, from the physics bound'
    );
  }
  result.errors.push(error);
  result.advisoryErrors.push(error);
  result.valid = result.fatalErrors.length === 0;
  return result;
}

/** Build the severity view of a finished error list. */
function severityView(errors: string[]): {
  valid: boolean;
  fatalErrors: string[];
  advisoryErrors: string[];
} {
  const { fatalErrors, advisoryErrors } = partitionValidationErrors(errors);
  return { valid: fatalErrors.length === 0, fatalErrors, advisoryErrors };
}

export interface ValidationResult {
  /**
   * WP-2.05: `valid` now means NO FATAL ERROR — the server could bound the
   * run's physics — not "no finding at all". It is what the route stamps
   * into `game_sessions.validated`, whose COMMENT ON COLUMN (migration 054)
   * states the same semantics for the next author writing a
   * `validated IS TRUE` predicate.
   */
  valid: boolean;
  /** Authoritative payout: outcome(recomputed raw) [+ victory bonus]. */
  adjustedDna: number;
  /**
   * Recomputed RAW DNA, BEFORE the
   * outcome multiplier / victory bonus / account stack - the section 7.1
   * mastery XP base: extracted runs grant floor(rawDna x 1.25).
   */
  rawDna: number;
  /** Authoritative display score - the fold, and only the fold. */
  adjustedScore: number;
  /** Validated food count (claimed, clamped to the rate bound). */
  foodCount: number;
  /** Effective outcome used for payout (extracted claims that conflict with died are voided). */
  extracted: boolean;
  /** Sanitized mutation picks the payout was computed from. */
  mutations: MutationPick[];
  /** Honored Phoenix trigger food index, null when absent/implausible. */
  phoenixTriggeredAtFood: number | null;
  /**
   * Mastery XP base: the DETERMINISTIC recompute only - bounded-trust
   * claims never feed mastery (BUILDCRAFT_GENOME_DESIGN.md §9). Equals
   * rawDna on legacy runs (which have no genome claims).
   */
  masteryRawDna: number;
  /** Accepted genome record (game_sessions.genome), null on legacy runs. */
  genome: AcceptedGenome | null;
  /**
   * The duration the row should STORE: `min(claim, serverElapsedSeconds)`.
   *
   * Clamped to serverElapsed and not serverElapsed + 10 on purpose — the
   * +10 above is a clock-skew tolerance for REJECTING a claim, never a
   * licence to record time that did not pass. Signal's `endure` objective
   * reads this number straight off the row.
   */
  durationSeconds: number;
  /**
   * Every bounded-trust clamp the server applied, with the DNA each cost.
   * Empty on legacy (non-genome) runs. This is what makes a `DNA_MISMATCH`
   * explainable rather than merely reported.
   */
  claimClamps: GenomeClaimClamp[];
  /**
   * Every finding, in push order — unchanged in shape and content, so the
   * stored `validation_errors` blob and every existing consumer stay
   * wire-identical.
   */
  errors: string[];
  /** The subset of `errors` whose codes are fatal (see FATAL_VALIDATION_CODES). */
  fatalErrors: string[];
  /** The subset of `errors` whose codes are advisory. */
  advisoryErrors: string[];
}

/**
 * Absolute floor of the claim-drift ALERT threshold.
 *
 * WP-2.05: this stopped being an eligibility threshold. A drift never
 * changes the payout (the recompute is authoritative either way) and never
 * changes eligibility (DNA_MISMATCH / SCORE_MISMATCH are advisory), so the
 * only thing it decides now is whether a finding is worth an operator's
 * attention.
 */
export const CLAIM_EPSILON = 1;

/**
 * Relative half of the same threshold. A whole-run ABSOLUTE epsilon of 1
 * fires on a 400-food run that is 3 DNA apart — which is what flagged the
 * owner's honest `scavenger` runs — while missing a 1-DNA-per-food drift on
 * a short one. The alert threshold is therefore
 * `max(CLAIM_EPSILON, |recomputed| * CLAIM_EPSILON_RATIO)`.
 *
 * This tolerance is for ALERTING ONLY. The fold-parity property test
 * asserts EXACT equality between the engine and `computeGenomeRunTotals`
 * and does not consult it — a drift this hides from an operator would still
 * fail the build.
 */
export const CLAIM_EPSILON_RATIO = 0.005;

/** True when a claim is far enough from the recompute to be worth an alert. */
export function claimDriftIsAlertable(
  claimed: number,
  recomputed: number
): boolean {
  const tolerance = Math.max(
    CLAIM_EPSILON,
    Math.abs(recomputed) * CLAIM_EPSILON_RATIO
  );
  return Math.abs(claimed - recomputed) > tolerance;
}

/**
 * Minimum food gap the universal Genome cadence permits. It is intentionally
 * independent of body growth, so all dynasties and ladder profiles receive
 * the same build opportunities.
 */
const MIN_FOODS_PER_PICK = GENE_OFFER_CADENCE.minFoodsPerPick;

/**
 * The Patient multiplier is the only run-specific cadence modifier and is
 * read from the same trait constant as the engine.
 */
function minFoodsPerPickFor(
  _profileId: GrowthProfileId | undefined,
  traits: TraitId[]
): number {
  const base = GENE_OFFER_CADENCE.minFoodsPerPick;
  return traits.includes('patient')
    ? base * TRAIT_PHYSICS.patientMutationIntervalMultiplier
    : base;
}

/**
 * Sanitize the claimed mutation picks against legality + cadence bounds.
 * Illegal entries are dropped and flagged; bound violations keep the legal
 * prefix (the payout is then computed from what remains - conservative
 * because whatever the cheat intended, the server only ever pays its own
 * recompute of the accepted picks).
 */
function sanitizeMutations(
  raw: unknown,
  foodCount: number,
  errors: string[],
  minFoodsPerPick: number = MIN_FOODS_PER_PICK,
  unlockedPool: MutationId[] | null = null
): MutationPick[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    errors.push('INVALID_MUTATIONS: not an array');
    return [];
  }

  const picks: MutationPick[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const id = (entry as { id?: unknown } | null)?.id;
    const atFood = (entry as { atFood?: unknown } | null)?.atFood;
    if (!isMutationId(id)) {
      errors.push(`INVALID_MUTATIONS: unknown mutation id ${JSON.stringify(id)}`);
      continue;
    }
    // Pool gating (section 7.1): a pick outside the player's ACTUAL
    // unlocked pool (recomputed server-side from player_mastery - never
    // the client's claim) is dropped and flagged. The payout is then the
    // recompute of the accepted picks only.
    if (unlockedPool !== null && !unlockedPool.includes(id)) {
      errors.push(`MUTATION_LOCKED: ${id} is not in the player's unlocked pool`);
      continue;
    }
    if (seen.has(id)) {
      errors.push(`INVALID_MUTATIONS: duplicate mutation ${id}`);
      continue;
    }
    if (
      typeof atFood !== 'number' ||
      !Number.isInteger(atFood) ||
      atFood < 0
    ) {
      errors.push(`INVALID_MUTATIONS: ${id} atFood ${JSON.stringify(atFood)} is not a non-negative integer`);
      continue;
    }
    seen.add(id);
    picks.push({ id, atFood });
  }

  if (picks.length > MUTATION_SPAWN.maxHeld) {
    errors.push(
      `MUTATION_BOUND: ${picks.length} picks exceeds the stacking cap ${MUTATION_SPAWN.maxHeld}`
    );
    picks.length = MUTATION_SPAWN.maxHeld;
  }

  // Cadence count bound: the k-th mutation food cannot exist before food
  // minFoodsPerPick x k (4k normally, 8k under the Patient trait).
  const maxPicks = Math.floor(foodCount / minFoodsPerPick);
  if (picks.length > maxPicks) {
    errors.push(
      `MUTATION_BOUND: ${picks.length} picks exceeds floor(${foodCount}/${minFoodsPerPick}) = ${maxPicks}`
    );
    picks.length = Math.max(0, maxPicks);
  }

  // Per-pick window: atFood >= minFoodsPerPick x pick-index (1-based) and
  // <= foodCount. A violation invalidates that pick and everything after
  // it (later picks depend on the same cadence).
  for (let i = 0; i < picks.length; i++) {
    const minAt = minFoodsPerPick * (i + 1);
    if (picks[i].atFood < minAt || picks[i].atFood > foodCount) {
      errors.push(
        `MUTATION_BOUND: pick ${i + 1} (${picks[i].id}) atFood ${picks[i].atFood} outside [${minAt}, ${foodCount}]`
      );
      picks.length = i;
      break;
    }
  }

  return picks;
}

/** Coerce a claimed non-negative integer field; null when invalid. */
function nonNegativeInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function genomeV2JsonEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => genomeV2JsonEqual(entry, right[index]));
  }
  if (
    typeof left !== 'object' || left === null ||
    typeof right !== 'object' || right === null
  ) return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        genomeV2JsonEqual(leftRecord[key], rightRecord[key])
    );
}

/**
 * Assert the flat terminal record emitted by the replayed engine. This is a
 * server invariant, not a repairable client claim: throwing makes settlement
 * retry with the durable terminal intent instead of paying from corrupt data.
 */
function authoritativeGenomeV2Record(
  value: unknown,
  dynasty: DynastyName,
  foodCount: number,
  ctx: GenomeV2ValidationContext
): GenomeV2RunRecord {
  if (
    ctx.authoritativeTerminal !== true ||
    typeof value !== 'object' || value === null || Array.isArray(value)
  ) {
    throw new Error('Genome v2 settlement requires a replay-authoritative terminal record.');
  }
  const record = value as GenomeV2RunRecord;
  const expectedFtue = genomeV2FtueFromPresentation(ctx.ftuePresentation);
  if (
    record.v !== GENOME_RULES_V2 ||
    record.dynasty !== dynasty ||
    record.runSeed !== ctx.runSeed ||
    record.settlement !== null ||
    record.foodCount !== foodCount ||
    !genomeV2JsonEqual(record.genePool, ctx.genePool) ||
    !genomeV2JsonEqual(record.ftue, expectedFtue) ||
    !genomeV2JsonEqual(
      record.startingStrainPoints,
      ctx.startingStrainPoints
    ) ||
    record.splicesEnabled !== expectedFtue.splicesUnlocked ||
    record.externalSecondLife !== ctx.externalSecondLife ||
    record.offerTiltStrain !== ctx.offerTiltStrain ||
    !genomeV2JsonEqual(record.suppressedStrains, ctx.suppressedStrains) ||
    !genomeV2JsonEqual(
      record.strainThresholdDelta,
      ctx.strainThresholdDelta
    )
  ) {
    throw new Error('Genome v2 terminal record disagrees with its run-start authority.');
  }
  if (
    !Number.isSafeInteger(record.eventIndex) || record.eventIndex < 0 ||
    !Number.isSafeInteger(record.tick) || record.tick < 0 ||
    !Number.isSafeInteger(record.compactedJournalEvents) ||
    record.compactedJournalEvents < 0 ||
    !Array.isArray(record.journal) ||
    record.eventIndex !== record.compactedJournalEvents + record.journal.length
  ) {
    throw new Error('Genome v2 terminal journal envelope is malformed.');
  }
  let priorTick = 0;
  for (let offset = 0; offset < record.journal.length; offset += 1) {
    const event = record.journal[offset];
    const index = record.compactedJournalEvents + offset + 1;
    if (
      typeof event !== 'object' || event === null ||
      event.index !== index ||
      event.eventId !== genomeV2EventId(record.runSeed, index) ||
      !Number.isSafeInteger(event.tick) ||
      event.tick < priorTick || event.tick > record.tick
    ) {
      throw new Error('Genome v2 terminal journal is not canonical.');
    }
    priorTick = event.tick;
  }
  assertGenomeV2PersistenceBound(record);
  return record;
}

function validateGenomeV2Branch(
  input: GameResultInput,
  dynasty: DynastyName,
  traits: TraitId[],
  ctx: GenomeV2ValidationContext,
  extracted: boolean,
  foodCount: number,
  durationSeconds: number,
  errors: string[]
): ValidationResult {
  const record = authoritativeGenomeV2Record(
    input.genome,
    dynasty,
    foodCount,
    ctx
  );
  const settlement = settleGenomeV2(record, extracted ? 'bank' : 'crash');
  // `displayGrossRaw` is a celebratory high-water projection and may include
  // forfeitable Escrow/Stake. It is explicitly never an authority channel.
  const rawDna = genomeV2YieldFloor(record.ledger.bankableYield);
  const expectedPayout = genomeV2YieldFloor(settlement.harvestEligibleYield);
  const totals = computeRunTotals(
    dynasty,
    foodCount,
    [],
    null,
    traits,
    null
  );
  const expectedScore = totals.score;

  if (claimDriftIsAlertable(input.dna_earned, rawDna)) {
    errors.push(
      `DNA_MISMATCH: replay reported ${input.dna_earned}, Genome v2 recorded ${rawDna} (${dynasty}, ${foodCount} foods)`
    );
  }
  if (claimDriftIsAlertable(input.score, expectedScore)) {
    errors.push(
      `SCORE_MISMATCH: replay reported ${input.score}, recomputed ${expectedScore} (${dynasty}, ${foodCount} foods)`
    );
  }

  return {
    ...severityView(errors),
    adjustedDna: expectedPayout,
    rawDna,
    adjustedScore: expectedScore,
    foodCount,
    extracted,
    mutations: [],
    phoenixTriggeredAtFood:
      record.secondLife?.consumed === true ? record.secondLife.consumedAtFood : null,
    masteryRawDna: rawDna,
    genome: genomeV2RunRecord(record, settlement),
    durationSeconds,
    claimClamps: [],
    errors,
  };
}

export function validateGameResult(
  input: GameResultInput,
  serverStartedAt: Date,
  dynasty: DynastyName,
  traits: TraitId[] = [],
  /**
   * The player's unlocked mutation pool, recomputed SERVER-SIDE from
   * player_mastery (section 7.1) - null disables pool gating (legacy
   * callers / tests). Free Play passes the full pool (section 7.4).
   */
  unlockedPool: MutationId[] | null = null,
  /**
   * The session's world condition - read from the SESSION ROW (server-stamped
   * at start), never from the claim. Its [E] effects (Gold Rush food x1.5,
   * Twin Exits bank x1.15) join the exact recompute; [P] effects change
   * nothing here.
   *
   * WIDENED to ConditionInput by WP-2.10b. A bare AnomalyId still works, so
   * every existing caller and test compiles unchanged. The widening is
   * load-bearing rather than cosmetic: the engine plays under the week's
   * clauses, so if this stayed AnomalyId the server would recompute WITHOUT
   * them and disagree with the engine on every clause week - manufacturing
   * exactly the DNA_MISMATCH this wave exists to eliminate.
   */
  anomaly: ConditionInput = null,
  /**
   * Genome context (Buildcraft: The Genome) - non-null only when the
   * session carries a run_seed (server capability). Switches steps 4-8
   * into the genome pipeline: gene-pool legality, infuse bounds, fused
   * splice derivation, exact genome recompute, bounded-trust clamps.
   */
  genomeCtx: GenomeValidationContext | null = null,
  /**
   * The growth profile the server stamped into `run_context` at start, for
   * runs that have NO genome context.
   *
   * WP-3.05 originally scaled both the food-rate ceiling and offer-cadence floor
   * by profile. D1 later separated cadence from growth, so only simultaneous
   * food count remains profile-derived. Legacy stamped sessions still need this
   * argument for that physical food-rate bound.
   *
   * `genomeCtx` still WINS where present. Its copy is the one the exact
   * recompute folds with, so preferring it makes a bound/fold disagreement
   * structurally impossible rather than merely unlikely.
   */
  runGrowthProfileId: GrowthProfileId | undefined = undefined
): ValidationResult {
  const errors: string[] = [];
  const ruleset = getRuleset(dynasty);
  const growthProfileId = genomeCtx?.growthProfileId ?? runGrowthProfileId;
  const now = Date.now();
  const serverElapsed = Math.floor((now - serverStartedAt.getTime()) / 1000);

  // 1. Duration bound — THE fatal bound, and now the only one.
  //
  // WP-2.05: the flat `GAME_CONFIG.session.maxDuration` ceiling is DELETED
  // (owner ruling, 2026-07-26: "a long run is a good run"). A ten-minute
  // wall invalidated exactly the careful, tactical-hold play the game is
  // for, and it bounded nothing the serverElapsed comparison below does not
  // already bound better.
  //
  // What remains is the comparison against the session's own observed
  // elapsed time, with a 10-second clock-skew tolerance. It stays FATAL:
  // the food-rate bound is derived from duration, so an unbounded duration
  // is an unbounded run.
  const claimedDuration = Number.isFinite(input.duration_seconds)
    ? Math.max(0, input.duration_seconds)
    : 0;
  if (claimedDuration > serverElapsed + 10) {
    errors.push('INVALID_DURATION: Client duration exceeds server elapsed time');
  }
  // ...and what the row STORES is the claim clamped to the time that
  // actually passed. The +10 skew tolerance governs rejection only; storing
  // serverElapsed + 10 would hand a crafted claim ten free seconds of
  // Signal `endure` progress on every run.
  const durationSeconds = Math.min(claimedDuration, Math.max(0, serverElapsed));

  // 2. Outcome consistency: an extracted run cannot also be a death.
  //    Conflicting claims void the bank bonus (pay the salvage rate).
  let extracted = input.extracted === true;
  if (extracted && input.died === true) {
    errors.push('INVALID_OUTCOME: extracted and died are mutually exclusive');
    extracted = false;
  }

  // 3. Food count sanity: non-negative integer...
  let foodCount = Number.isFinite(input.food_count)
    ? Math.floor(input.food_count)
    : 0;
  if (foodCount < 0 || foodCount !== input.food_count) {
    errors.push(`INVALID_FOOD_COUNT: ${input.food_count} is not a non-negative integer`);
    foodCount = Math.max(0, foodCount);
  }

  // ...bounded by the per-dynasty food rate (replaces score <= duration/2).
  // The bound is derived from the CLAMPED duration: a claim of time that
  // did not pass must not buy food headroom either.
  //
  // WP-3.02: the bound is also scaled by the run's SIMULTANEOUS FOOD COUNT.
  // With three foods on the board the nearest is closer, so an honest player
  // legitimately eats faster - and a bound that does not know about a mechanic
  // which lawfully raises the rate flags honest runs. That is the same defect
  // class as `VOLT_RATE_ALLOWANCE_FACTOR` (WP-2.05) and as the extraction
  // window being denominated in ticks: DERIVED from the mechanic, never
  // guessed at.
  const foodsOnBoard = Math.max(
    1,
    resolveGrowthProfile(growthProfileId).simultaneousFoods
  );
  const maxFood = Math.ceil(
    durationSeconds * ruleset.validation.maxFoodPerSecond * foodsOnBoard
  );
  const claimedFoodCount = foodCount;
  if (genomeCtx?.rulesVersion === GENOME_RULES_V2) {
    return validateGenomeV2Branch(
      input,
      dynasty,
      traits,
      genomeCtx,
      extracted,
      claimedFoodCount,
      durationSeconds,
      errors
    );
  }
  if (foodCount > maxFood) {
    foodCount = maxFood;
  }

  // GENOME BRANCH (Buildcraft: The Genome): sessions stamped with a
  // run_seed validate steps 4-8 under the genome pipeline.
  //
  // The INVALID_FOOD_RATE push is DEFERRED into the branch that knows the
  // FINAL bound. VOLT's Arc Lightning legitimately widens the rate bound
  // (g8), and pushing the error here meant a run whose foods were restored
  // still carried the error that had rejected them - an error outliving its
  // own retraction, and, before WP-2.05, costing the run its eligibility.
  if (genomeCtx !== null) {
    return validateGenomeBranch(
      input,
      dynasty,
      traits,
      anomaly,
      genomeCtx,
      extracted,
      foodCount,
      claimedFoodCount,
      maxFood,
      durationSeconds,
      errors
    );
  }

  // Legacy path: no expression can widen the bound, so the final bound is
  // known here and the finding is pushed immediately.
  if (claimedFoodCount > foodCount) {
    errors.push(
      `INVALID_FOOD_RATE: ${claimedFoodCount} foods exceeds max ${maxFood} for ${durationSeconds}s (${dynasty})`
    );
  }

  // 4. Mutation legality + cadence bounds (section 5.3). The Patient
  //    trait halves the spawn rate, so the per-pick bound tightens to 8k.
  let mutations = sanitizeMutations(
    input.mutations,
    foodCount,
    errors,
    minFoodsPerPickFor(growthProfileId, traits),
    unlockedPool
  );

  // 4b. Ascetic trait: mutation food never spawns, so ANY mutation claim
  //     on an Ascetic snake is impossible - drop them all and flag.
  if (traits.includes('ascetic') && mutations.length > 0) {
    errors.push(
      `TRAIT_CONFLICT: ${mutations.length} mutation pick(s) claimed on an Ascetic snake (mutation food never spawns)`
    );
    mutations = [];
  }

  // 5. Phoenix trigger: only honored when phoenix is held and the index is
  //    plausible. Honoring a trigger strictly lowers the payout, so an
  //    implausible claim is ignored (never inflates), just flagged.
  let phoenixTriggeredAtFood: number | null = null;
  const rawPhoenix = input.phoenix_triggered_at_food;
  if (rawPhoenix !== undefined && rawPhoenix !== null) {
    const phoenixPick = mutations.find((m) => m.id === 'phoenix');
    const at = nonNegativeInt(rawPhoenix);
    if (!phoenixPick) {
      errors.push('PHOENIX_INVALID: trigger claimed without phoenix held');
    } else if (at === null || at < phoenixPick.atFood || at > foodCount) {
      errors.push(
        `PHOENIX_INVALID: trigger ${JSON.stringify(rawPhoenix)} outside [${phoenixPick.atFood}, ${foodCount}]`
      );
    } else {
      phoenixTriggeredAtFood = at;
    }
  }

  // 6. Exact recompute of the mutation- and trait-aware base - the payout
  //    authority (traits come from the snake row, never the claim)
  // conditionAnomaly(), not the whole condition: this is the LEGACY
  // (pre-genome) fold, which has no strain machinery for a clause to act on.
  // Narrowing to the anomaly here is the honest reduction - a clause that can
  // only express itself through strains has nothing to say about a run with
  // no strains.
  const { rawDna: baseDna, score: baseScore } = computeRunTotals(
    dynasty,
    foodCount,
    mutations,
    phoenixTriggeredAtFood,
    traits,
    conditionAnomaly(anomaly)
  );

  // 7. The recompute IS the payout. WP-3.13 removed the one exception -
  // COSMIC's claimed combo bonus - so nothing is added to either total here.
  const rawDna = baseDna;
  const expectedScore = baseScore;

  // 8. Outcome multiplier (mutation- and trait-aware) + victory bonus
  let expectedPayout = applyOutcomeWithMutations(
    rawDna,
    extracted,
    mutations,
    phoenixTriggeredAtFood !== null,
    traits,
    conditionAnomaly(anomaly)
  );
  if (input.victory) {
    expectedPayout += GAME_CONFIG.economy.dna.completionBonus;
  }

  // 9. Claim mismatches only ALERT - the payout stays the recomputed value.
  if (claimDriftIsAlertable(input.dna_earned, rawDna)) {
    errors.push(
      `DNA_MISMATCH: claimed ${input.dna_earned}, recomputed ${rawDna} (${dynasty}, ${foodCount} foods)`
    );
  }
  if (claimDriftIsAlertable(input.score, expectedScore)) {
    errors.push(
      `SCORE_MISMATCH: claimed ${input.score}, recomputed ${expectedScore} (${dynasty}, ${foodCount} foods)`
    );
  }

  return {
    ...severityView(errors),
    adjustedDna: expectedPayout,
    rawDna,
    adjustedScore: expectedScore,
    foodCount,
    extracted,
    mutations,
    phoenixTriggeredAtFood,
    masteryRawDna: rawDna,
    genome: null,
    durationSeconds,
    claimClamps: [],
    errors,
  };
}

// =============================================================================
// GENOME VALIDATION (Buildcraft: The Genome - BUILDCRAFT_GENOME_DESIGN.md)
// =============================================================================

/**
 * VOLT Arc Lightning auto-collects up to `arcMaxPerEat` EXTRA foods per
 * eat, so one honest eat can register up to `1 + arcMaxPerEat` foods. The
 * food-rate bound WIDENS (a still-hard cap) by exactly that factor, and
 * only when the accepted picks make the expression reachable.
 *
 * WP-2.05: this was a hardcoded 1.5, which is a PAYOUT BUG rather than a
 * loose flag. On PRIMAL (`maxFoodPerSecond: 1.0`) a VOLT snake at the
 * expression physically eats up to 3 foods per second of play, so 1.5
 * clamped away up to half of an honest run's foods - and every clamped food
 * is DNA the server then refused to pay. Deriving the factor from the arc
 * physics is the fix: the bound now says what the engine can actually do.
 */
export const VOLT_RATE_ALLOWANCE_FACTOR = 1 + STRAIN_PHYSICS.arcMaxPerEat;

/** Minimum food index of any gene pick (first gene food / first portal). */
/**
 * The earliest food at which a PORTAL can exist — `firstExitAtFood` in the
 * extraction config. Bounds the portal count and therefore the infuse count.
 *
 * WP-3.05: this used to be named `MIN_FIRST_GENE_FOOD` and did double duty as
 * the first-gene-pick floor. The two are unrelated quantities that happened to
 * share the value 15: the portal schedule is fixed, but the first GENE offer
 * arrives after `minFoodsPerPick` foods, which moves with the growth profile.
 * Conflated, a `tuned` run offered its first gene at food 8-12 and was then
 * told that gene was impossible. The gene floor now travels with the profile;
 * this one stays with extraction.
 */
const MIN_FIRST_PORTAL_FOOD = 15;

function occupiedGeneSlots(
  picks: GenePick[],
  splicesUnlocked: boolean
): number {
  return splicesUnlocked
    ? fusedSlotCount(fusePicks(picks))
    : picks.length;
}

/** Conservative portal count bound: first at 15, then every >= 8 foods. */
function maxPortalsSpawnable(foodCount: number): number {
  if (foodCount < MIN_FIRST_PORTAL_FOOD) return 0;
  return 1 + Math.floor((foodCount - MIN_FIRST_PORTAL_FOOD) / 8);
}

/**
 * Sanitize claimed gene picks (genome mode): pool, six occupied slots,
 * order, and bounds. Raw splice parents remain picks, so a legal history can
 * contain more than six picks while still occupying at most six slots.
 */
function sanitizeGenes(
  raw: unknown,
  foodCount: number,
  infuseCount: number,
  errors: string[],
  minFoodsPerPick: number,
  genePool: GeneId[] | null,
  splicesUnlocked: boolean
): GenePick[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    errors.push('INVALID_GENES: not an array');
    return [];
  }
  const picks: GenePick[] = [];
  const seen = new Set<string>();
  let lastAt = -1;
  for (const entry of raw) {
    const id = (entry as { id?: unknown } | null)?.id;
    const atFood = (entry as { atFood?: unknown } | null)?.atFood;
    if (isSpliceId(id)) {
      // Splices are DERIVED, never claimed - a direct claim is a red flag.
      errors.push(`SPLICE_CLAIMED_DIRECTLY: ${id}`);
      continue;
    }
    if (!isGeneId(id)) {
      errors.push(`INVALID_GENES: unknown gene id ${JSON.stringify(id)}`);
      continue;
    }
    if (genePool !== null && !genePool.includes(id)) {
      errors.push(`GENE_LOCKED: ${id} is not in the player's unlocked pool`);
      continue;
    }
    if (seen.has(id)) {
      errors.push(`INVALID_GENES: duplicate gene ${id}`);
      continue;
    }
    if (
      typeof atFood !== 'number' ||
      !Number.isInteger(atFood) ||
      atFood < minFoodsPerPick ||
      atFood > foodCount ||
      atFood < lastAt
    ) {
      errors.push(
        `GENE_BOUND: ${id} atFood ${JSON.stringify(atFood)} outside [max(${minFoodsPerPick}, ${lastAt}), ${foodCount}]`
      );
      continue;
    }
    const pick = { id, atFood };
    const candidate = [...picks, pick];
    const occupied = occupiedGeneSlots(candidate, splicesUnlocked);
    if (occupied > GENOME_SPAWN.maxHeld) {
      errors.push(
        `GENE_BOUND: ${id} would occupy ${occupied} slots, above the held cap ${GENOME_SPAWN.maxHeld}`
      );
      continue;
    }
    seen.add(id);
    lastAt = atFood;
    picks.push(pick);
  }
  // Offer-source bound: cadence offers (every >= minFoodsPerPick foods)
  // plus one offer per accepted infuse.
  const maxPicks = Math.floor(foodCount / minFoodsPerPick) + infuseCount;
  if (picks.length > maxPicks) {
    errors.push(
      `GENE_BOUND: ${picks.length} picks exceeds floor(${foodCount}/${minFoodsPerPick}) + ${infuseCount} infuses = ${maxPicks}`
    );
    picks.length = Math.max(0, maxPicks);
  }
  return picks;
}

/**
 * Validate + honor the claimed revive against what the accepted build can
 * actually fire (one revive per run): phoenix needs a LOOSE phoenix pick,
 * styx/molted need their fusion, second_sun needs the UMBRA apex. An
 * implausible claim is ignored + flagged (never honored).
 */
function sanitizeGenomeRevive(
  raw: unknown,
  foodCount: number,
  picks: GenePick[],
  heirloom: StrainPoints,
  surges: StrainSurge[],
  tierCap: 1 | 2 | 3,
  suppressedStrains: readonly StrainId[],
  splicesUnlocked: boolean,
  errors: string[]
): GenomeRevive | null {
  const revive = sanitizeRevive(raw, foodCount);
  if (!revive) {
    if (raw !== undefined && raw !== null) {
      errors.push('REVIVE_INVALID: malformed revive claim');
    }
    return null;
  }
  const view = splicesUnlocked
    ? fusePicks(picks)
    : { loose: [...picks], splices: [] };
  const spliceIds = new Set(view.splices.map((s) => s.spliceId));
  const phoenixLoose = view.loose.find((p) => p.id === 'phoenix');
  const activations = strainActivations(
    picks,
    heirloom,
    surges,
    tierCap,
    suppressedStrains
  );
  switch (revive.kind) {
    case 'phoenix':
      if (!phoenixLoose || revive.atFood < phoenixLoose.atFood) {
        errors.push('REVIVE_INVALID: phoenix revive without a loose phoenix');
        return null;
      }
      return revive;
    case 'styx':
      if (!spliceIds.has('splice_styx_contract')) {
        errors.push('REVIVE_INVALID: styx revive without the Styx Contract');
        return null;
      }
      return revive;
    case 'molted':
      if (!spliceIds.has('splice_molted_rebirth')) {
        errors.push('REVIVE_INVALID: molted revive without Molted Rebirth');
        return null;
      }
      return revive;
    case 'second_sun': {
      const apexAt = activations.UMBRA.apexAt;
      if (apexAt === null || revive.atFood < apexAt) {
        errors.push('REVIVE_INVALID: second_sun revive without the UMBRA apex');
        return null;
      }
      return revive;
    }
  }
}

/**
 * Bound the two client-reported pressure events from accepted build state.
 * Collision geometry is not replayed at settlement, so the fact itself is a
 * narrow bounded-trust input (one Thick Hide; cadence-capped Ouroboros). The
 * wire carries no segment amount: after this filter accepts the event, the
 * shared fold derives +8/+2 from its source.
 */
function sanitizeGenomePressureEvents(
  raw: unknown,
  foodCount: number,
  picks: GenePick[],
  heirloom: StrainPoints,
  surges: StrainSurge[],
  tierCap: 1 | 2 | 3,
  suppressedStrains: readonly StrainId[],
  errors: string[]
): PressureGrowthEvent[] {
  const shaped = sanitizePressureEvents(raw, foodCount);
  if (
    raw !== undefined &&
    (!Array.isArray(raw) || shaped.length !== raw.length)
  ) {
    errors.push(
      'CLAIM_CLAMPED: pressureEvents malformed, out-of-range, or over-cap entry dropped'
    );
  }
  if (shaped.length === 0) return [];

  const feral = strainActivations(
    picks,
    heirloom,
    surges,
    tierCap,
    suppressedStrains
  ).FERAL;
  const accepted: PressureGrowthEvent[] = [];
  let lastFood = -1;
  let thickHideUsed = false;
  let ouroborosBites = 0;

  for (const event of shaped) {
    if (event.atFood < lastFood) {
      errors.push(
        `CLAIM_CLAMPED: pressureEvents ${event.source} at food ${event.atFood} is out of order`
      );
      continue;
    }
    if (event.source === 'thick_hide') {
      if (
        thickHideUsed ||
        feral.minorAt === null ||
        event.atFood < feral.minorAt
      ) {
        errors.push(
          `CLAIM_CLAMPED: pressureEvents Thick Hide cannot fire at food ${event.atFood}`
        );
        continue;
      }
      thickHideUsed = true;
    } else {
      const apexAt = feral.apexAt;
      const biteCap =
        apexAt === null
          ? 0
          : Math.floor(
              Math.max(0, event.atFood - apexAt) /
                STRAIN_ECONOMICS.ouroborosFoodsPerBite
            );
      if (apexAt === null || ouroborosBites >= biteCap) {
        errors.push(
          `CLAIM_CLAMPED: pressureEvents Ouroboros cadence cannot fire at food ${event.atFood}`
        );
        continue;
      }
      ouroborosBites += 1;
    }
    accepted.push(event);
    lastFood = event.atFood;
  }
  return accepted;
}

function validateGenomeBranch(
  input: GameResultInput,
  dynasty: DynastyName,
  traits: TraitId[],
  anomaly: ConditionInput,
  ctx: GenomeV1ValidationContext,
  extracted: boolean,
  foodCount: number,
  claimedFoodCount: number,
  baseMaxFood: number,
  durationSeconds: number,
  errors: string[]
): ValidationResult {
  const claim = (input.genome ?? {}) as Record<string, unknown>;
  const minFoodsPerPick = minFoodsPerPickFor(ctx.growthProfileId, traits);

  // g4. Infuses first (they widen the pick-count bound): strictly
  // increasing, <= 3, bounded by spawnable portals; an extraction uses
  // one portal of its own.
  let infuses = sanitizeInfuses(claim.infuses, foodCount);
  const portalBudget = Math.max(
    0,
    maxPortalsSpawnable(foodCount) - (extracted ? 1 : 0)
  );
  if (infuses.length > portalBudget) {
    errors.push(
      `INFUSE_BOUND: ${infuses.length} infuses exceeds the ${portalBudget}-portal budget for ${foodCount} foods`
    );
    infuses = infuses.slice(0, portalBudget);
  }
  for (const infuse of infuses) {
    if (infuse.atFood < MIN_FIRST_PORTAL_FOOD) {
      errors.push(`INFUSE_BOUND: infuse at food ${infuse.atFood} before the first portal`);
      infuses = infuses.filter((i) => i.atFood >= MIN_FIRST_PORTAL_FOOD);
      break;
    }
  }

  // g5. Gene picks (pool + cap + cadence-with-infuse-allowance).
  let picks = sanitizeGenes(
    input.mutations,
    foodCount,
    infuses.length,
    errors,
    minFoodsPerPick,
    ctx.genePool,
    ctx.splicesUnlocked !== false
  );
  // g5b. Ascetic — NARROWED (WP-2.05).
  //
  // The trait's stated cost is "mutation foods never spawn", and the
  // spawner is correctly gated (`genePoolBlockedByTraits` is now the single
  // authority the engine consults). A PORTAL IS NOT FOOD: an Ascetic snake
  // can still reach an extraction portal and still choose INFUSE, and an
  // infuse's own gene offer owes nothing to the food spawner. Stripping
  // every pick therefore punished a legal play — it is the unwired
  // suppression that cost the owner's runs their eligibility.
  //
  // So: a pick that rides an ACCEPTED infuse's food index is honest and is
  // paid. A pick with no infuse to explain it has no legal source on this
  // snake and is dropped (advisory — the payout is simply recomputed from
  // what survived). Each infuse explains at most one pick, in food order.
  //
  // NOTE FOR THE OWNER (flagged at PR time, deliberately not decided here):
  // this makes the trait's TEXT ("no builds, pure snake") narrower than its
  // BEHAVIOUR (builds via portals only, at most `infuseMaxPerRun` genes).
  // Either the copy changes or the trait does; that is a design question
  // for a design WP, not something a settlement-hardening package settles.
  if (genePoolBlockedByTraits(traits) && picks.length > 0) {
    const infuseBudget = new Map<number, number>();
    for (const infuse of infuses) {
      infuseBudget.set(infuse.atFood, (infuseBudget.get(infuse.atFood) ?? 0) + 1);
    }
    const explained: GenePick[] = [];
    const unexplained: GenePick[] = [];
    for (const pick of picks) {
      const remaining = infuseBudget.get(pick.atFood) ?? 0;
      if (remaining > 0) {
        infuseBudget.set(pick.atFood, remaining - 1);
        explained.push(pick);
      } else {
        unexplained.push(pick);
      }
    }
    if (unexplained.length > 0) {
      errors.push(
        `TRAIT_CONFLICT: ${unexplained.length} gene pick(s) on an Ascetic snake ride no infuse (gene food never spawns) - dropped; ${explained.length} infuse-sourced pick(s) kept`
      );
    }
    picks = explained;
  }

  // g6. Surges: only granted by infusing AT the gene cap - every surge
  // must ride an accepted infuse's food index.
  const infuseFoods = new Set(infuses.map((i) => i.atFood));
  const usedSurgeInfuses = new Set<number>();
  const splicesUnlocked = ctx.splicesUnlocked !== false;
  let surges = sanitizeSurges(claim.surges).filter((s) => {
    if (!infuseFoods.has(s.atFood)) {
      errors.push(`SURGE_INVALID: surge at food ${s.atFood} without an infuse`);
      return false;
    }
    if (usedSurgeInfuses.has(s.atFood)) {
      errors.push(`SURGE_INVALID: multiple surges claimed for infuse at food ${s.atFood}`);
      return false;
    }
    const heldAtInfuse = picks.filter((pick) => pick.atFood <= s.atFood);
    if (
      occupiedGeneSlots(heldAtInfuse, splicesUnlocked) !==
      GENOME_SPAWN.maxHeld
    ) {
      errors.push(
        `SURGE_INVALID: surge at food ${s.atFood} without ${GENOME_SPAWN.maxHeld} occupied gene slots`
      );
      return false;
    }
    const heldStrains = new Set(
      heldAtInfuse.flatMap((pick) => geneStrains(pick.id))
    );
    if (!heldStrains.has(s.strain)) {
      errors.push(
        `SURGE_INVALID: ${s.strain} is not represented by a held gene at food ${s.atFood}`
      );
      return false;
    }
    usedSurgeInfuses.add(s.atFood);
    return true;
  });
  if (surges.length > infuses.length) surges = surges.slice(0, infuses.length);

  // Each infuse yields exactly one build-power source: a gene offer OR a
  // surge. Cadence offers provide the remaining raw picks. Keep accepted
  // gene picks and drop surplus surge claims when the same infuse would
  // otherwise be spent twice.
  const cadenceOfferBudget = Math.floor(foodCount / minFoodsPerPick);
  const infuseGeneOffersNeeded = Math.max(
    0,
    picks.length - cadenceOfferBudget
  );
  const surgeSourceBudget = Math.max(
    0,
    infuses.length - infuseGeneOffersNeeded
  );
  if (surges.length > surgeSourceBudget) {
    errors.push(
      `SURGE_INVALID: ${surges.length} surges plus ${infuseGeneOffersNeeded} infuse-sourced gene picks exceed ${infuses.length} infuses`
    );
    surges = surges.slice(0, surgeSourceBudget);
  }

  // g7. Revive plausibility (one per run; kind must be fireable).
  const revive = sanitizeGenomeRevive(
    claim.revive,
    foodCount,
    picks,
    ctx.heirloom,
    surges,
    ctx.tierCap,
    ctx.suppressedStrains ?? [],
    ctx.splicesUnlocked !== false,
    errors
  );

  const lossEvents = sanitizeLossEvents(claim.lossEvents);
  const pressureEvents = sanitizeGenomePressureEvents(
    claim.pressureEvents,
    foodCount,
    picks,
    ctx.heirloom,
    surges,
    ctx.tierCap,
    ctx.suppressedStrains ?? [],
    errors
  );

  // THE CARRY'S INPUT, DERIVED — never claimed (WP-3.10).
  //
  // The client sends nothing about portals. This walks the same seeded,
  // food-indexed schedule the engine walked, from the same run seed and the
  // same accepted picks, and counts the doors the run met. The identity
  // `passed = met - infuses - (extracted ? 1 : 0)` then closes it, because a
  // door is always infused at, banked at, or passed, and the first two are
  // already server facts by this point.
  const carriedPasses = derivePortalsPassed({
    runSeed: ctx.runSeed,
    dynasty,
    foodCount,
    picks,
    heirloom: ctx.heirloom,
    surges,
    tierCap: ctx.tierCap,
    suppressedStrains: ctx.suppressedStrains ?? [],
    splicesUnlocked: ctx.splicesUnlocked !== false,
    traits,
    anomaly,
    infuses,
    extracted,
    ladderRung: ctx.ladderRung,
  });

  const genomeInput: GenomeRunInput = {
    picks,
    heirloom: ctx.heirloom,
    surges,
    infuses,
    revive,
    prevRunDied: ctx.prevRunDied,
    lossEvents,
    pressureEvents,
    tierCap: ctx.tierCap,
    suppressedStrains: ctx.suppressedStrains ?? [],
    splicesEnabled: ctx.splicesUnlocked !== false,
    ...(ctx.growthProfileId ? { growthProfileId: ctx.growthProfileId } : {}),
    ...(carriedPasses !== undefined ? { portalsPassed: carriedPasses } : {}),
    // WP-3.12: omitted at rung 0 so a Ground run's recompute is byte-identical
    // to the one it got before the ladder existed.
    ...(ctx.ladderRung ? { ladderRung: ctx.ladderRung } : {}),
  };

  // g8. VOLT rate allowance: arcs raise the honest eat rate - widen the
  // (still hard) bound only when the accepted picks reach the expression.
  const totalsProbe = computeGenomeRunTotals(
    dynasty,
    foodCount,
    genomeInput,
    traits,
    anomaly
  );
  const voltReachable = totalsProbe.activations.VOLT.expressionAt !== null;
  let effectiveMaxFood = baseMaxFood;
  if (voltReachable && claimedFoodCount > foodCount) {
    effectiveMaxFood = Math.ceil(baseMaxFood * VOLT_RATE_ALLOWANCE_FACTOR);
    const restored = Math.min(claimedFoodCount, effectiveMaxFood);
    if (restored > foodCount) {
      foodCount = restored;
    }
  }

  // ...and only NOW is the final bound known, so this is where the
  // deferred rate finding is pushed. A run whose foods the arc allowance
  // restored carries no error at all: the error may not outlive its own
  // retraction.
  if (claimedFoodCount > foodCount) {
    errors.push(
      `INVALID_FOOD_RATE: ${claimedFoodCount} foods exceeds max ${effectiveMaxFood} for ${durationSeconds}s (${dynasty})`
    );
  }

  // g9. Exact deterministic recompute (the payout authority) + claim caps.
  const totals =
    foodCount === totalsProbe.capsBasis.foodCount
      ? totalsProbe
      : computeGenomeRunTotals(dynasty, foodCount, genomeInput, traits, anomaly);
  const rawClaims = (claim.claims ?? {}) as GenomeClaims;
  const { accepted, bonusDna, globalClampHit, clamps } = clampGenomeClaims(
    rawClaims,
    totals.caps
  );
  // CLAMPS EXPLAIN THEMSELVES (WP-2.05). Every individual clamp reports the
  // field, the claim and the ceiling, so the DNA a clamp removed is a named
  // number rather than an unattributed slice of a DNA_MISMATCH. The
  // aggregate backstop keeps its own distinct code, because "every
  // individual cap passed and the total still bound" is a different signal.
  for (const clamp of clamps) {
    if (clamp.field === 'total') continue;
    errors.push(
      `CLAIM_CLAMPED: ${clamp.field} claimed ${clamp.claimed}, cap ${clamp.cap} (-${clamp.delta} DNA)`
    );
  }
  if (globalClampHit) {
    const globalClamp = clamps.find((c) => c.field === 'total');
    errors.push(
      'GENOME_GLOBAL_CLAMP: claims bound by the aggregate claims cap while ' +
        `individual caps passed (claimed ${globalClamp?.claimed ?? 0}, cap ${
          globalClamp?.cap ?? totals.caps.globalClaimsCap
        }, -${globalClamp?.delta ?? 0} DNA)`
    );
  }
  const rawDna = totals.rawDna + bonusDna;
  // WP-3.13: the fold, and nothing else. COSMIC's clamped combo used to be
  // added here; the redesign deleted the combo, so the genome path has no
  // score component that is not recomputed.
  const expectedScore = totals.score;

  // g11. Genome outcome (clamped bank <= 1.75 / salvage <= 0.90) + victory.
  let expectedPayout = applyGenomeOutcome(
    rawDna,
    extracted,
    genomeInput,
    traits,
    anomaly
  );
  if (input.victory) {
    expectedPayout += GAME_CONFIG.economy.dna.completionBonus;
  }

  // g12. Claim mismatches ALERT only - the payout stays the recompute.
  // (The engine's display adds live claims, so compare against raw+claims.)
  if (claimDriftIsAlertable(input.dna_earned, rawDna)) {
    errors.push(
      `DNA_MISMATCH: claimed ${input.dna_earned}, recomputed ${rawDna} (genome, ${dynasty}, ${foodCount} foods)`
    );
  }
  if (claimDriftIsAlertable(input.score, expectedScore)) {
    errors.push(
      `SCORE_MISMATCH: claimed ${input.score}, recomputed ${expectedScore} (genome, ${dynasty}, ${foodCount} foods)`
    );
  }

  const expressions: Partial<Record<string, number>> = {};
  const apexes: Partial<Record<string, number>> = {};
  const strainCounts: StrainPoints = {};
  for (const strain of Object.keys(totals.activations) as (keyof typeof totals.activations)[]) {
    const a = totals.activations[strain];
    if (a.points > 0) strainCounts[strain] = a.points;
    if (a.expressionAt !== null) expressions[strain] = a.expressionAt;
    if (a.apexAt !== null) apexes[strain] = a.apexAt;
  }

  const acceptedGenome: AcceptedGenome = {
    v: 1,
    picks,
    splices: (ctx.splicesUnlocked === false
      ? []
      : fusePicks(picks).splices
    ).map((s) => ({
      id: s.spliceId,
      atFood: s.atFood,
    })),
    surges,
    infuses,
    revive,
    pressureEvents,
    claims: accepted,
    strainCounts,
    expressions,
    apexes,
    globalClampHit,
  };

  return {
    ...severityView(errors),
    adjustedDna: expectedPayout,
    rawDna,
    adjustedScore: expectedScore,
    foodCount,
    extracted,
    // Wire-compat: legacy consumers (mutations blob, run-event cross
    // checks) see the legacy-id subset of the picks.
    mutations: picks.filter((p): p is MutationPick => isMutationId(p.id)),
    phoenixTriggeredAtFood:
      revive && revive.kind === 'phoenix' ? revive.atFood : null,
    // Mastery XP base: deterministic only - claims never feed mastery.
    masteryRawDna: totals.rawDna,
    genome: acceptedGenome,
    durationSeconds,
    claimClamps: clamps,
    errors,
  };
}
