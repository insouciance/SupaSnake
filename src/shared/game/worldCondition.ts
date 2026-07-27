/**
 * WORLD CONDITIONS — the clause layer (WP-2.10b, Constitution §7.2, §7.3).
 *
 * WHY THIS MODULE EXISTS
 *
 * Before it, a week's condition was a single anomaly id. Five anomalies, one
 * offer-weight tilt each, and every week was the same optimisation problem:
 * play the tilt. Setup could not matter, because there was nothing about the
 * week for a setup to answer. This module adds a second, machine-readable
 * half — a CLAUSE — so a week is a pair `(anomaly, clause)`: 5 × 14 = 70
 * distinct condition-sets built entirely from mechanics that already ship,
 * with zero per-week authoring (Rule 13).
 *
 * `WorldCondition` is the ONE object both ends read. The settlement fold takes
 * it, the validator takes it, the offer tilt is resolved from it, and the
 * Workbench reads the same `interaction` block to tell a player which of their
 * snakes this week rewards. There is no second description of a week for the
 * two to disagree about.
 *
 * THE SHAPE IS BORROWED, NOT INVENTED
 *
 * `gauntlet.ts` already ships the vocabulary pattern this file needs: a
 * namespaced id (`gene:` / `strain:`), a TOTAL parser that returns null rather
 * than throwing, a namer, and pure consumers that turn a parsed id into an
 * effect. `ConditionClauseId` is `clause:<name>` and follows it exactly. The
 * namespaces cannot collide: every `AnomalyId` is a bare lower-case word with
 * no colon in it, and every clause id begins with `clause:` — asserted in
 * `worldCondition.test.ts` over the whole of both vocabularies, so a future
 * anomaly named `clause:something` fails the suite rather than silently
 * partitioning into the wrong half of a stored `modifiers` array.
 *
 * WHAT AN INTERACTION MAY CONTAIN
 *
 * Only fields that reach a seam BOTH the engine and the server already read.
 * A clause that changed the payout on one side only would put the DNA the game
 * displays out of agreement with the DNA it pays, and would make the validator
 * flag honest players — the exact failure this package was written to avoid.
 * The four shipped fields each land on such a seam:
 *
 *   strainOfferWeight     the run's offer tilt, which the SERVER resolves once
 *                         and hands to both the engine (in the genome block)
 *                         and `verifyOfferTrace` (at settlement)
 *   suppressedStrains     `strainActivations` has taken a suppressed list since
 *                         the Gauntlet shipped; the condition's list is unioned
 *                         into the run's, and travels in the run-start context
 *   strainThresholdDelta  `strainTier`, through the same `strainActivations`
 *                         both ends call
 *   bankDelta             `genomeOutcomeMultipliers`, which already takes the
 *                         condition and is called by both ends
 *
 * DELIBERATELY DEFERRED, AND WHY
 *
 * Two further levers were designed and are NOT shipped here. Both scale
 * *composed* per-food effects, and both are one-sided in the current code:
 *
 *   General per-strain scaling of composed per-food effects. The composition
 *   authority is `genomeFoodValueModifier`, which folds gene, splice and
 *   strain-tier effects into a single multiplicative result with no per-strain
 *   attribution left in it. Scaling one strain's contribution means taking that
 *   fold apart and re-deriving each contribution separately — a refactor of the
 *   payout authority, not a ride-along on a schema change, and it would have to
 *   be mirrored line for line in the engine's copy of the same fold.
 *
 *   Scaling the flat DNA an Expression pays (the "gilded wake doubled" idea)
 *   and scaling splice effects. Both live inside that same fold, or inside the
 *   engine's live bounded-trust accrual for Molt foods and gilded cells. The
 *   server half alone is reachable today; shipping it alone would mean the
 *   engine paying one number and the server another.
 *
 * `strainThresholdDelta` delivers most of what those two were wanted for, far
 * more cheaply: it changes WHICH of a player's snakes can reach an Expression
 * or an Apex this week, which is exactly the question a setup screen exists to
 * answer.
 *
 * NULL IS ALWAYS A COMPLETE ANSWER
 *
 * `NEUTRAL_CONDITION` is a real, total condition: no anomaly, no clauses, an
 * interaction that changes nothing. Every degradation — an unparseable stored
 * id, a missing column, a feature flag off — resolves to it, so a failure here
 * can only ever return a run to ordinary rules and can never invent rules the
 * run was not played under.
 */

import {
  ANOMALIES,
  ANOMALY_STRAINS,
  anomalySummary,
  isAnomalyId,
  type AnomalyId,
} from '@/shared/game/anomalies';
import { ANOMALY_STRAIN_WEIGHT } from '@/shared/game/offerGravity';
import {
  STRAIN_IDS,
  STRAINS,
  strainTier,
  type StrainId,
  type StrainTier,
} from '@/shared/game/strains';

// ---------------------------------------------------------------------------
// The vocabulary
// ---------------------------------------------------------------------------

/** The namespace every clause id carries. No `AnomalyId` contains a colon. */
export const CONDITION_CLAUSE_PREFIX = 'clause:';

/** The bare names, without the namespace. */
export type ConditionClauseName =
  | 'aurum_ascendant'
  | 'volt_ascendant'
  | 'feral_ascendant'
  | 'flux_ascendant'
  | 'umbra_ascendant'
  | 'aurum_dampened'
  | 'volt_dampened'
  | 'feral_dampened'
  | 'flux_dampened'
  | 'umbra_dampened'
  | 'shallow_expression'
  | 'deep_apex'
  | 'generous_exit'
  | 'narrow_exit';

/** A clause as it is stored, exactly as `GauntletBan` is stored. */
export type ConditionClauseId = `${typeof CONDITION_CLAUSE_PREFIX}${ConditionClauseName}`;

/**
 * The machine-readable half of a clause — the block the fold and the Workbench
 * both read. Every field is a pure datum: no functions, nothing to call, so a
 * consumer that only wants to EXPLAIN a week never has to simulate one.
 */
export interface ConditionInteraction {
  /**
   * Additive offer weight per strain, on top of the anomaly's own tilt. The
   * generalisation of `ANOMALY_STRAIN_WEIGHT`: the anomaly contributes
   * `+ANOMALY_STRAIN_WEIGHT` on its own strain and a clause contributes its own
   * entries, so a clause weighted above the anomaly's redirects the week.
   */
  strainOfferWeight: Readonly<Partial<Record<StrainId, number>>>;
  /** Tier ceiling 1 for these strains — the minor passive still works. */
  suppressedStrains: readonly StrainId[];
  /**
   * Per-strain shift of ALL THREE tier thresholds, in points. Negative makes
   * every tier of that strain arrive sooner; positive makes each cost more.
   * The in-run gene gates (>=2 for an Expression, >=3 for an Apex) are NOT
   * shifted — spawn momentum still cannot substitute for picks.
   */
  strainThresholdDelta: Readonly<Partial<Record<StrainId, number>>>;
  /** Additive delta on the banked-outcome multiplier, before the hard clamp. */
  bankDelta: number;
}

export interface ConditionClauseDef {
  id: ConditionClauseId;
  name: string;
  /** One line, player-facing. Reads as the deal it is. */
  effect: string;
  /**
   * Which way this clause cuts for the player. Authored, not derived: a
   * suppressed strain is a cost even for a player who was never going to play
   * it, and the Workbench sorts and colours by this.
   */
  polarity: 'benefit' | 'cost';
  interaction: ConditionInteraction;
}

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

export const CONDITION_CLAUSE_TUNING = {
  /**
   * An "ascendant" clause's offer weight. Above `ANOMALY_STRAIN_WEIGHT` on
   * purpose: a clause that could not out-pull the anomaly's own tilt would be
   * invisible on four weeks in five.
   */
  ascendantOfferWeight: 160,
  /** A threshold shift, in strain points. One point is one gene pick. */
  thresholdShift: 1,
  /** An exit clause's additive bank delta. */
  bankDelta: 0.1,
} as const;

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

const NO_WEIGHT: Readonly<Partial<Record<StrainId, number>>> = Object.freeze({});
const NO_STRAINS: readonly StrainId[] = Object.freeze([]);

function neutralInteraction(): ConditionInteraction {
  return {
    strainOfferWeight: NO_WEIGHT,
    suppressedStrains: NO_STRAINS,
    strainThresholdDelta: NO_WEIGHT,
    bankDelta: 0,
  };
}

/** An interaction that changes nothing. Frozen: it is shared by every reader. */
export const NEUTRAL_INTERACTION: ConditionInteraction = Object.freeze(
  neutralInteraction()
);

function ascendant(strain: StrainId): ConditionClauseDef {
  const name = STRAINS[strain].name;
  return {
    id: `${CONDITION_CLAUSE_PREFIX}${strain.toLowerCase()}_ascendant` as ConditionClauseId,
    name: `${name} Ascendant`,
    effect: `${name} genes dominate the offer pool — whatever the board's own tilt`,
    polarity: 'benefit',
    interaction: {
      ...neutralInteraction(),
      strainOfferWeight: Object.freeze({
        [strain]: CONDITION_CLAUSE_TUNING.ascendantOfferWeight,
      }) as Readonly<Partial<Record<StrainId, number>>>,
    },
  };
}

function dampened(strain: StrainId): ConditionClauseDef {
  const name = STRAINS[strain].name;
  return {
    id: `${CONDITION_CLAUSE_PREFIX}${strain.toLowerCase()}_dampened` as ConditionClauseId,
    name: `${name} Dampened`,
    effect: `${name} stops at its minor passive — no Expression, no Apex`,
    polarity: 'cost',
    interaction: {
      ...neutralInteraction(),
      suppressedStrains: Object.freeze([strain]) as readonly StrainId[],
    },
  };
}

function everyStrain(delta: number): Readonly<Partial<Record<StrainId, number>>> {
  const map: Partial<Record<StrainId, number>> = {};
  for (const strain of STRAIN_IDS) map[strain] = delta;
  return Object.freeze(map);
}

/**
 * The curated pool. Fourteen entries, seven benefits and seven costs, each one
 * a re-aim of a mechanic that already ships. A week draws exactly one.
 */
export const CONDITION_CLAUSES: Readonly<Record<ConditionClauseId, ConditionClauseDef>> =
  Object.freeze(
    Object.fromEntries(
      [
        ...STRAIN_IDS.map(ascendant),
        ...STRAIN_IDS.map(dampened),
        {
          id: `${CONDITION_CLAUSE_PREFIX}shallow_expression` as ConditionClauseId,
          name: 'Shallow Expression',
          effect: 'Every strain tier arrives one point sooner',
          polarity: 'benefit' as const,
          interaction: {
            ...neutralInteraction(),
            strainThresholdDelta: everyStrain(-CONDITION_CLAUSE_TUNING.thresholdShift),
          },
        },
        {
          id: `${CONDITION_CLAUSE_PREFIX}deep_apex` as ConditionClauseId,
          name: 'Deep Apex',
          effect: 'Every strain tier costs one point more — an Apex is a long reach',
          polarity: 'cost' as const,
          interaction: {
            ...neutralInteraction(),
            strainThresholdDelta: everyStrain(CONDITION_CLAUSE_TUNING.thresholdShift),
          },
        },
        {
          id: `${CONDITION_CLAUSE_PREFIX}generous_exit` as ConditionClauseId,
          name: 'Generous Exit',
          effect: `Banking pays +${CONDITION_CLAUSE_TUNING.bankDelta.toFixed(2)}`,
          polarity: 'benefit' as const,
          interaction: {
            ...neutralInteraction(),
            bankDelta: CONDITION_CLAUSE_TUNING.bankDelta,
          },
        },
        {
          id: `${CONDITION_CLAUSE_PREFIX}narrow_exit` as ConditionClauseId,
          name: 'Narrow Exit',
          effect: `Banking pays -${CONDITION_CLAUSE_TUNING.bankDelta.toFixed(2)}`,
          polarity: 'cost' as const,
          interaction: {
            ...neutralInteraction(),
            bankDelta: -CONDITION_CLAUSE_TUNING.bankDelta,
          },
        },
      ].map((def) => [def.id, Object.freeze(def)])
    ) as Record<ConditionClauseId, ConditionClauseDef>
  );

/** The pool, in draw order. The draw below is the ONLY reader of the order. */
export const CONDITION_CLAUSE_POOL: readonly ConditionClauseId[] = Object.freeze(
  Object.keys(CONDITION_CLAUSES) as ConditionClauseId[]
);

// ---------------------------------------------------------------------------
// The parser (total, exactly like `parseGauntletBan`)
// ---------------------------------------------------------------------------

/** The clause a stored value names, or null. Never throws, never guesses. */
export function parseConditionClause(value: unknown): ConditionClauseDef | null {
  if (typeof value !== 'string') return null;
  if (!value.startsWith(CONDITION_CLAUSE_PREFIX)) return null;
  return CONDITION_CLAUSES[value as ConditionClauseId] ?? null;
}

export function isConditionClauseId(value: unknown): value is ConditionClauseId {
  return parseConditionClause(value) !== null;
}

/** Display name for a stored value, including one this build cannot parse. */
export function conditionClauseName(value: unknown): string {
  return parseConditionClause(value)?.name ?? 'Unknown clause';
}

// ---------------------------------------------------------------------------
// The composed condition
// ---------------------------------------------------------------------------

/**
 * A run's world condition: the board's anomaly, the week's or day's clauses,
 * and the ONE composed interaction block every consumer reads. Composed once
 * at the boundary, never re-composed per food.
 */
export interface WorldCondition {
  anomaly: AnomalyId | null;
  clauses: readonly ConditionClauseDef[];
  interaction: ConditionInteraction;
}

function mergeWeights(
  into: Partial<Record<StrainId, number>>,
  from: Readonly<Partial<Record<StrainId, number>>>
): void {
  for (const strain of STRAIN_IDS) {
    const value = from[strain];
    if (value !== undefined && value !== 0) {
      into[strain] = (into[strain] ?? 0) + value;
    }
  }
}

/**
 * Compose the interaction an anomaly and a clause set produce together.
 *
 * The anomaly contributes exactly what it always has: `ANOMALY_STRAIN_WEIGHT`
 * on the strain its board favours. Everything else is the clauses'. Weights and
 * threshold deltas ADD (so two clauses on one strain compound rather than one
 * silently winning), suppressed strains UNION, bank deltas ADD.
 */
export function composeConditionInteraction(
  anomaly: AnomalyId | null,
  clauses: readonly ConditionClauseDef[]
): ConditionInteraction {
  const offerWeight: Partial<Record<StrainId, number>> = {};
  const thresholdDelta: Partial<Record<StrainId, number>> = {};
  const suppressed: StrainId[] = [];
  let bankDelta = 0;

  if (anomaly !== null) {
    const strain = ANOMALY_STRAINS[anomaly];
    if (strain) offerWeight[strain] = ANOMALY_STRAIN_WEIGHT;
  }
  for (const clause of clauses) {
    mergeWeights(offerWeight, clause.interaction.strainOfferWeight);
    mergeWeights(thresholdDelta, clause.interaction.strainThresholdDelta);
    for (const strain of clause.interaction.suppressedStrains) {
      if (!suppressed.includes(strain)) suppressed.push(strain);
    }
    bankDelta += clause.interaction.bankDelta;
  }

  return {
    strainOfferWeight: offerWeight,
    suppressedStrains: suppressed,
    strainThresholdDelta: thresholdDelta,
    // Two ±0.10 deltas can only ever compose to a multiple of 0.05; rounding
    // here keeps the stored/compared bank multiplier free of float dust.
    bankDelta: Math.round(bankDelta * 10000) / 10000,
  };
}

/** No anomaly, no clauses, nothing changed. The practice condition. */
export const NEUTRAL_CONDITION: WorldCondition = Object.freeze({
  anomaly: null,
  clauses: Object.freeze([]) as readonly ConditionClauseDef[],
  interaction: NEUTRAL_INTERACTION,
});

/**
 * The adapter for every call site that still speaks in bare anomaly ids.
 * A null anomaly is the neutral condition, not an error.
 */
export function conditionFromAnomaly(
  anomaly: AnomalyId | null | undefined,
  clauses: readonly ConditionClauseId[] = []
): WorldCondition {
  const parsed: ConditionClauseDef[] = [];
  for (const id of clauses) {
    const clause = parseConditionClause(id);
    if (clause && !parsed.includes(clause)) parsed.push(clause);
  }
  if (!isAnomalyId(anomaly) && parsed.length === 0) return NEUTRAL_CONDITION;
  const resolved = isAnomalyId(anomaly) ? anomaly : null;
  return {
    anomaly: resolved,
    clauses: parsed,
    interaction: composeConditionInteraction(resolved, parsed),
  };
}

/**
 * The TOTAL parser over a stored condition-set: `serpent_weeks.modifiers` and
 * `signal_days.clauses` are both `TEXT[]`, and this partitions one by
 * namespace. Never throws; ignores every id it does not recognise, so a row
 * written by a newer build degrades to the part this build understands.
 *
 * PRECEDENCE mirrors `serpentWeekCondition`: the FIRST recognised anomaly wins,
 * because nothing yet defines how two economic anomalies compose in the payout
 * fold. Clauses do compose, by construction (see `composeConditionInteraction`),
 * so every recognised clause is kept, in stored order, deduplicated.
 */
export function resolveWorldCondition(stored: unknown): WorldCondition {
  const entries: unknown[] = Array.isArray(stored)
    ? stored
    : stored === null || stored === undefined
      ? []
      : [stored];

  let anomaly: AnomalyId | null = null;
  const clauses: ConditionClauseId[] = [];
  for (const entry of entries) {
    // A stored row may hold objects (`describeSerpentModifier` projections) as
    // well as bare ids; both are read through `.id` or the value itself.
    const raw =
      typeof entry === 'object' && entry !== null && 'id' in entry
        ? (entry as { id: unknown }).id
        : entry;
    if (anomaly === null && isAnomalyId(raw)) {
      anomaly = raw;
      continue;
    }
    if (isConditionClauseId(raw) && !clauses.includes(raw)) clauses.push(raw);
  }
  return conditionFromAnomaly(anomaly, clauses);
}

/**
 * The widened parameter every consumer takes. A bare `AnomalyId` is still a
 * complete condition, so no call site had to change to keep working — and
 * because it is a WIDENED UNION rather than an extra optional parameter, a
 * caller that forgets to pass the clauses cannot compile into a client and a
 * server that silently disagree about the run's rules.
 */
export type ConditionInput = AnomalyId | WorldCondition | null | undefined;

/** Normalise the widened union. The first line of every consumer. */
export function normalizeCondition(value: ConditionInput): WorldCondition {
  if (value === null || value === undefined) return NEUTRAL_CONDITION;
  if (typeof value === 'string') return conditionFromAnomaly(value);
  return value;
}

/** The anomaly half, for the many [P] call sites that only want that. */
export function conditionAnomaly(value: ConditionInput): AnomalyId | null {
  return normalizeCondition(value).anomaly;
}

/** The stored form: `[...anomalies, ...clauses]`, exactly as a row holds it. */
export function conditionToStored(value: ConditionInput): string[] {
  const condition = normalizeCondition(value);
  const stored: string[] = [];
  if (condition.anomaly !== null) stored.push(condition.anomaly);
  for (const clause of condition.clauses) stored.push(clause.id);
  return stored;
}

/** One line for a HUD or a briefing: the board's deal, then the week's. */
export function worldConditionSummary(value: ConditionInput): string {
  const condition = normalizeCondition(value);
  const parts: string[] = [];
  if (condition.anomaly !== null) parts.push(anomalySummary(condition.anomaly));
  for (const clause of condition.clauses) parts.push(clause.effect);
  return parts.join(' · ');
}

/** The board's own name, or the practice label. */
export function worldConditionName(value: ConditionInput): string {
  const condition = normalizeCondition(value);
  const parts: string[] = [];
  if (condition.anomaly !== null) parts.push(ANOMALIES[condition.anomaly].name);
  for (const clause of condition.clauses) parts.push(clause.name);
  return parts.length > 0 ? parts.join(' + ') : 'No condition';
}

// ---------------------------------------------------------------------------
// The pure consumers
// ---------------------------------------------------------------------------

/** The composed offer-weight map. What the Workbench charts. */
export function conditionOfferWeights(
  value: ConditionInput
): Readonly<Partial<Record<StrainId, number>>> {
  return normalizeCondition(value).interaction.strainOfferWeight;
}

/**
 * The run's single offer tilt — the strain `rollGeneOffer` weights up.
 *
 * The offer stream carries ONE tilted strain, so the composed map is collapsed
 * to its heaviest positive entry (ties broken by catalogue order, so the answer
 * is deterministic). The collapse happens SERVER-SIDE, once: the resolved
 * strain is what the run-start response hands the engine AND what
 * `verifyOfferTrace` replays under, so the drawn stream and the verified stream
 * are the same stream by construction rather than by agreement.
 */
export function conditionOfferTilt(value: ConditionInput): StrainId | null {
  const weights = conditionOfferWeights(value);
  let best: StrainId | null = null;
  let bestWeight = 0;
  for (const strain of STRAIN_IDS) {
    const weight = weights[strain] ?? 0;
    if (weight > bestWeight) {
      best = strain;
      bestWeight = weight;
    }
  }
  return best;
}

/**
 * The strains whose Expressions and Apexes are off this run: the condition's,
 * unioned with any the caller already had (the Gauntlet's strain ban). Union,
 * never replacement — two independent suppressions both bind.
 */
export function conditionSuppressedStrains(
  value: ConditionInput,
  existing: readonly StrainId[] = []
): StrainId[] {
  const result = [...existing];
  for (const strain of normalizeCondition(value).interaction.suppressedStrains) {
    if (!result.includes(strain)) result.push(strain);
  }
  return result;
}

/** The per-strain threshold shift, in points. Empty under no condition. */
export function conditionStrainThresholdDelta(
  value: ConditionInput
): Readonly<Partial<Record<StrainId, number>>> {
  return normalizeCondition(value).interaction.strainThresholdDelta;
}

/** The additive bank delta, applied before the §10 hard clamp. */
export function conditionBankDelta(value: ConditionInput): number {
  return normalizeCondition(value).interaction.bankDelta;
}

/**
 * `strainTier` with the condition's threshold shift applied.
 *
 * Moving every threshold by `delta` is exactly moving the points by `-delta`,
 * so this DELEGATES to the shipped `strainTier` rather than restating its
 * ladder. The in-run gene gates live inside that function and are untouched,
 * which is the point: a clause can make an Apex cheaper in points and can never
 * make it cheaper in picks.
 */
export function strainTierUnderCondition(
  points: number,
  inRunGenes: number,
  thresholdDelta: number
): StrainTier {
  return strainTier(points - thresholdDelta, inRunGenes);
}

// ---------------------------------------------------------------------------
// The draw
// ---------------------------------------------------------------------------

/**
 * DOMAIN SEPARATION IS LOAD-BEARING, NOT DECORATION.
 *
 * On a Monday the Signal's day key and the Serpent's week key are the SAME
 * STRING — both are `YYYY-MM-DD` of that Monday. Hashing the bare key would
 * therefore make every Monday's Signal clause equal to that week's Serpent
 * clause: a visible, unintended lockstep between the two rhythms, and one that
 * only shows up one day in seven. That exact class of bug shipped once already
 * (`signal.calendar.test.ts` records it), so the domain is a REQUIRED argument
 * here rather than an optional prefix a caller might forget.
 */
export const CONDITION_CLAUSE_DOMAINS = {
  week: 'clause:week:',
  day: 'clause:day:',
} as const;

export type ConditionClauseDomain =
  (typeof CONDITION_CLAUSE_DOMAINS)[keyof typeof CONDITION_CLAUSE_DOMAINS];

/** How many clauses a Serpent week draws. One, like its modifier set. */
export const CONDITION_CLAUSES_PER_WEEK = 1;

/** How many clauses a Signal day draws. One. */
export const CONDITION_CLAUSES_PER_DAY = 1;

/**
 * FNV-1a over the domain-separated key — the same derivation `serpentSeedNumber`
 * and `signalSeedNumber` use, with the domain in front. `Math.imul` keeps the
 * multiply in 32 bits, which is what makes it reproducible in every runtime.
 */
export function conditionClauseSeedNumber(
  domain: ConditionClauseDomain,
  key: string
): number {
  const input = `${domain}${key}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** xorshift32 — a seeded stream for the draw. Never `Math.random()`. */
function xorshift32(state: number): number {
  let x = state >>> 0;
  if (x === 0) x = 0x9e3779b9;
  x ^= x << 13;
  x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5;
  x >>>= 0;
  return x;
}

/**
 * The clauses a key draws: `count` DISTINCT clauses from the curated pool by a
 * seeded partial Fisher–Yates — the same draw `serpentModifiersForWeek` uses,
 * so raising the count later can never produce a doubled clause.
 *
 * Pure in (domain, key). Taking the key rather than a Date is what keeps this
 * module free of `serpent.ts` and `signal.ts`: each of those owns its own
 * calendar and passes its own key with its own domain, and neither has to
 * import the other to stay separated.
 */
export function conditionClausesForKey(
  domain: ConditionClauseDomain,
  key: string,
  count = 1
): ConditionClauseId[] {
  const pool = [...CONDITION_CLAUSE_POOL];
  const wanted = Math.max(0, Math.min(Math.floor(count), pool.length));
  let state = conditionClauseSeedNumber(domain, key);

  const drawn: ConditionClauseId[] = [];
  for (let i = 0; i < wanted; i += 1) {
    state = xorshift32(state);
    const pick = state % pool.length;
    drawn.push(pool[pick]);
    pool.splice(pick, 1);
  }
  return drawn;
}
