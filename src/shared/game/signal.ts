/**
 * The World Signal — the daily ritual.
 *
 * Authority: Constitution §7.2 (the Signal), §7.1 (the cadence stack — the day
 * boundary is 00:00 UTC, globally), §8.6 (the harvest envelope — "the day's
 * Signal objective run consumes no Energy and always harvests full"), Rule 1
 * (nothing interrupts a live run), Rule 5 (absence is never destructive),
 * Rule 10 / §12.2 (the Signal is the ONE daily surface) and Rule 11 (server
 * authority).
 *
 * Everything in this file is pure. No clock is read that is not passed in, no
 * database is touched, no environment is consulted. That is the same choice
 * `serpent.ts` made one cadence up, and for the same reason: the day, its
 * seed, its condition and its three objectives are a function of the UTC
 * calendar and nothing else, so the server can derive them without asking
 * anybody — least of all the client (Rule 11) — and a test can pin any day in
 * history or in the future by naming a date.
 *
 * WHY TWO PLAYERS IN DIFFERENT TIMEZONES SEE THE SAME SIGNAL
 *
 * The acceptance criterion of this work package is "same conditions worldwide
 * per UTC day". It is met structurally, not by convention:
 *
 *   1. `signalDayKey` reads ONLY `getUTC*`. A `Date` is an instant, not a
 *      local calendar, so a player in Auckland and a player in Los Angeles
 *      pass different wall-clock readings of the SAME instant and get the
 *      same `YYYY-MM-DD`.
 *   2. The seed is FNV-1a over that key — deterministic, dependency-free and
 *      identical in every JavaScript runtime (`Math.imul` keeps the multiply
 *      in 32 bits).
 *   3. The condition and the three objectives are a seeded draw over CURATED,
 *      ORDERED pools. Same seed, same order, same result — no `Math.random()`,
 *      no `Date.now()` read inside the draw, no locale, no `Intl`.
 *   4. Nothing in the derivation takes a player, an account, an entitlement or
 *      a request as a parameter. There is no signature here through which one
 *      could be introduced.
 *
 * `signal.test.ts` asserts all four, including a sweep over a year of days
 * against a set of timezone-shifted "now" values.
 *
 * WHY THE DAY IS THE ONE DAILY SURFACE (§12.2)
 *
 * A Signal day carries a condition and three objectives, of which a player
 * picks ONE. There is no second daily currency, no second claim and no second
 * streak in this module. The Daily Take (WP-1.04) is the game's single
 * sanctioned collect and lives inside the Signal; Ascension (§7.1) is the
 * Signal's monthly aggregation VIEW over these same days, not a new surface.
 *
 * MONEY CANNOT REACH ANY OF IT (Rule 3)
 *
 * The inputs to a completion are the run's own settled facts. Nothing here
 * reads an entitlement, a subscription, a purchase, a cosmetic or an account
 * flag, and the first-completion bonus is a flat constant that no account
 * state multiplies.
 */

import {
  ANOMALIES,
  ANOMALY_ROTATION,
  ANOMALY_STRAINS,
  anomalySummary,
  isAnomalyId,
  type AnomalyId,
} from '@/shared/game/anomalies';
import {
  CONDITION_CLAUSES_PER_DAY,
  CONDITION_CLAUSE_DOMAINS,
  conditionClausesForKey,
  conditionFromAnomaly,
  conditionOfferTilt,
  type ConditionClauseId,
} from '@/shared/game/worldCondition';
import { endReasonSettles } from '@/lib/session/lifecycle';

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// The calendar
// ---------------------------------------------------------------------------

/**
 * Day epoch: 2024-01-01 00:00 UTC — the same instant `SERPENT_EPOCH_UTC` and
 * the Anomaly rotation use. Sharing it is not decorative: §7.1 puts the daily
 * and the weekly beat on ONE clock ("one clock for the whole world"), and a
 * Monday must be day 0 of its week on both.
 */
export const SIGNAL_EPOCH_UTC = Date.UTC(2024, 0, 1);

/** 00:00 UTC of the day containing `at`. The day is [00:00, next 00:00). */
export function signalDayStart(at: Date | number = Date.now()): Date {
  const d = new Date(at);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** The exclusive end of the day that starts at `dayStart`. */
export function signalDayEnd(dayStart: Date | number): Date {
  return new Date(new Date(dayStart).getTime() + DAY_MS);
}

/** The day's stable key: its UTC date as `YYYY-MM-DD`. */
export function signalDayKey(at: Date | number = Date.now()): string {
  return signalDayStart(at).toISOString().slice(0, 10);
}

/** Whole days since the epoch. Negative before it; still stable. */
export function signalDayIndex(at: Date | number = Date.now()): number {
  return Math.round((signalDayStart(at).getTime() - SIGNAL_EPOCH_UTC) / DAY_MS);
}

/** `YYYY-MM-DD` -> the Date it names at 00:00 UTC, or null if malformed. */
export function signalDayKeyToDate(dayKey: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return null;
  const parsed = new Date(`${dayKey}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Round-trip: rejects 2026-02-30, which `Date` would silently roll forward.
  if (parsed.toISOString().slice(0, 10) !== dayKey) return null;
  return parsed;
}

// ---------------------------------------------------------------------------
// The seed
// ---------------------------------------------------------------------------

/**
 * Domain separation.
 *
 * The Serpent hashes a bare `YYYY-MM-DD` week key. On a Monday the Signal's
 * day key and the Serpent's week key are the SAME STRING, so hashing it the
 * same way would make every Monday's Signal condition equal to that week's
 * Serpent condition — a visible, unintended correlation between the two
 * rhythms. Prefixing the domain costs nothing and removes it.
 */
export const SIGNAL_SEED_DOMAIN = 'signal:';

/** FNV-1a over the domain-separated day key. */
export function signalSeedNumber(dayKey: string): number {
  const input = `${SIGNAL_SEED_DOMAIN}${dayKey}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** The day's seed as it is stored and displayed: `D` + 8 hex digits. */
export function signalDaySeed(dayKey: string): string {
  return `D${signalSeedNumber(dayKey).toString(16).padStart(8, '0')}`;
}

/** xorshift32 — a seeded stream for the draws. Never `Math.random()`. */
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

// ---------------------------------------------------------------------------
// The condition-set
// ---------------------------------------------------------------------------

/**
 * The curated condition pool (§7.2: "a seeded condition-set built from
 * existing mechanics ... content from §12.1 slot 1, so the daily costs the
 * developer nothing per day").
 *
 * It is the shipped modifier pool, reused rather than re-authored. Every entry
 * is an effect the engine already implements exactly and the validator already
 * recomputes, so a Signal day costs zero authoring and adds no balance
 * surface — which is what makes "one per day, forever" affordable for one
 * developer (Rule 13).
 */
export const SIGNAL_CONDITION_POOL: readonly AnomalyId[] = ANOMALY_ROTATION;

/** A condition as a panel renders it. Pure projection of the shipped pool. */
export interface SignalCondition {
  id: AnomalyId;
  name: string;
  effect: string;
  kind: 'E' | 'P' | 'EP';
  /**
   * The gene-pool tilt (§7.2's third component). DERIVED from the modifier
   * rather than drawn separately: the shipped strain table already pairs each
   * modifier with the strain it favours, so the day's tilt costs no new
   * content and can never contradict the day's condition.
   */
  strainTilt: (typeof ANOMALY_STRAINS)[AnomalyId];
}

export function describeSignalCondition(id: AnomalyId): SignalCondition {
  const def = ANOMALIES[id];
  return {
    id: def.id,
    name: def.name,
    effect: anomalySummary(def.id),
    kind: def.kind,
    strainTilt: ANOMALY_STRAINS[def.id],
  };
}

/** The day's condition: one modifier drawn from the curated pool. */
export function signalConditionForDay(at: Date | number = Date.now()): AnomalyId {
  const pool = SIGNAL_CONDITION_POOL;
  const state = xorshift32(signalSeedNumber(signalDayKey(at)));
  return pool[state % pool.length];
}

/**
 * The day's CLAUSES (WP-2.10b) — the second half of its condition.
 *
 * Drawn under the DAY domain, never the bare day key. `SIGNAL_SEED_DOMAIN`
 * above records why the Signal domain-separates its own seed; the clause draw
 * has the identical hazard and a sharper edge, because a clause changes the
 * payout while the seed only changes the board. On a Monday this key and the
 * Serpent's week key are the same string, so without the domain every Monday's
 * daily clause would be that week's weekly clause.
 */
export function signalClausesForDay(
  at: Date | number = Date.now(),
  count: number = CONDITION_CLAUSES_PER_DAY
): ConditionClauseId[] {
  return conditionClausesForKey(
    CONDITION_CLAUSE_DOMAINS.day,
    signalDayKey(at),
    count
  );
}

// ---------------------------------------------------------------------------
// The three objectives
// ---------------------------------------------------------------------------

/**
 * §7.2: "Opening the Signal offers one choice from up to three objectives —
 * survival, extraction, or build execution — equal reward value, so every
 * playstyle has a door in [H, §17.5]."
 *
 * Three kinds, always all three offered, one chosen. EQUAL REWARD VALUE is
 * structural, not audited: the bonus is a single flat constant
 * (`SIGNAL_FIRST_COMPLETION_BONUS_DNA`) shared by every objective, and there
 * is no per-kind reward field in this module for a future edit to diverge.
 */
export const SIGNAL_OBJECTIVE_KINDS = ['endure', 'extract', 'engineer'] as const;
export type SignalObjectiveKind = (typeof SIGNAL_OBJECTIVE_KINDS)[number];

export function isSignalObjectiveKind(value: unknown): value is SignalObjectiveKind {
  return (
    typeof value === 'string' &&
    (SIGNAL_OBJECTIVE_KINDS as readonly string[]).includes(value)
  );
}

/**
 * The target bands, one per kind. All [H] tuning dials (§17): raising a band
 * is a config change, never a migration, because the day's objectives are
 * derived and the stored row is only ever a copy the drift tripwire checks.
 *
 * Each band is drawn from by its OWN seeded step, so changing the size of one
 * band cannot shift the draws of the other two.
 */
export const SIGNAL_OBJECTIVE_BANDS: Record<SignalObjectiveKind, readonly number[]> = {
  /** Seconds survived in one run. */
  endure: [90, 120, 150, 180],
  /** Full-strength Yield banked on an extracted run (§6.2). */
  extract: [200, 300, 450, 600],
  /** Genes accepted during the run. */
  engineer: [3, 4, 5, 6],
};

/**
 * The flat first-completion bonus (§7.2: "a modest flat first-completion
 * bonus (150 DNA [H])").
 *
 * FLAT, and one constant for all three objectives. It is paid at most once per
 * player per Signal day, and it is never multiplied by a streak, a tier, a
 * generation, an entitlement or anything else — the only multiplier this game
 * has is the Daily Take's, and §7.2 confines it to the Take.
 */
export const SIGNAL_FIRST_COMPLETION_BONUS_DNA = 150;

/**
 * The cumulative milestones (§7.2: "cumulative, NON-CONSECUTIVE cosmetic
 * milestones (30 Signals, 100, 365)").
 *
 * Non-consecutive is the whole point and is enforced by shape: the input to
 * `signalMilestonesReached` is a COUNT, and a count has no memory of gaps. No
 * function in this module can ask when the previous Signal was, so a streak
 * requirement cannot be added here without changing a signature (Rule 5).
 */
export const SIGNAL_MILESTONES: readonly number[] = [30, 100, 365];

/** Which milestones a lifetime completion count has reached. Ascending. */
export function signalMilestonesReached(completedSignals: number): number[] {
  const count = Math.max(0, Math.floor(completedSignals));
  return SIGNAL_MILESTONES.filter((milestone) => count >= milestone);
}

/** One of the day's three objectives, fully derived. */
export interface SignalObjective {
  kind: SignalObjectiveKind;
  /** Stable id: `signal_<kind>`. The client names this when it chooses. */
  id: string;
  /** What the run has to reach. Units are per-kind — see the bands above. */
  target: number;
  label: string;
  description: string;
  /** Equal for all three, by §7.2. Present so a panel never has to guess. */
  bonusDna: number;
}

export function signalObjectiveId(kind: SignalObjectiveKind): string {
  return `signal_${kind}`;
}

function describeObjective(kind: SignalObjectiveKind, target: number): SignalObjective {
  const copy: Record<SignalObjectiveKind, { label: string; description: string }> = {
    endure: {
      label: 'ENDURE',
      description: `Survive ${target} seconds in a single run`,
    },
    extract: {
      label: 'EXTRACT',
      description: `Bank a run worth ${target} Yield`,
    },
    engineer: {
      label: 'ENGINEER',
      description: `Accept ${target} genes in a single run`,
    },
  };
  return {
    kind,
    id: signalObjectiveId(kind),
    target,
    label: copy[kind].label,
    description: copy[kind].description,
    bonusDna: SIGNAL_FIRST_COMPLETION_BONUS_DNA,
  };
}

/**
 * The day's three objectives, in a fixed kind order with seeded targets.
 *
 * The ORDER is fixed (endure, extract, engineer) so the surface never
 * reshuffles under a player mid-day; only the targets move, and they move
 * identically for everyone.
 */
export function signalObjectivesForDay(
  at: Date | number = Date.now()
): SignalObjective[] {
  let state = signalSeedNumber(signalDayKey(at));
  // One step is already spent by the condition draw; step again first so the
  // targets are not a function of the same value the modifier used.
  state = xorshift32(state);
  return SIGNAL_OBJECTIVE_KINDS.map((kind) => {
    state = xorshift32(state);
    const band = SIGNAL_OBJECTIVE_BANDS[kind];
    return describeObjective(kind, band[state % band.length]);
  });
}

// ---------------------------------------------------------------------------
// The day
// ---------------------------------------------------------------------------

/** The day, fully derived from the calendar. No id — the database owns that. */
export interface SignalDayDefinition {
  /** The UTC date, `YYYY-MM-DD`. The natural key. */
  day: string;
  /** 00:00 UTC, ISO. */
  startsAt: string;
  /** The following 00:00 UTC, ISO — exclusive. */
  endsAt: string;
  seed: string;
  condition: SignalCondition;
  /**
   * The day's clauses — the interactive half of its condition (WP-2.10b).
   * Stored in `signal_days.clauses TEXT[]` (migration 056) so the drift
   * tripwire has something to compare the derivation against, and re-derived
   * here on every read so the stored row can never become the authority.
   */
  clauses: ConditionClauseId[];
  objectives: SignalObjective[];
}

/**
 * Derive a day. This is the ONLY place a Signal day is defined; the route, the
 * panel, the settlement and the migration's drift check all read it, so there
 * is no second definition to disagree with.
 */
export function describeSignalDay(
  at: Date | number = Date.now()
): SignalDayDefinition {
  const start = signalDayStart(at);
  const anomaly = signalConditionForDay(start);
  const clauses = signalClausesForDay(start);

  // The displayed tilt is the COMPOSED tilt, not the anomaly's alone.
  //
  // `SignalSurface` promises the player "Gene pool tilts X today", and the
  // engine draws offers under `conditionOfferTilt`, which collapses the
  // anomaly's bias together with any clause weights. Before clauses existed
  // those were always the same strain. A clause that outweighs the anomaly
  // makes them differ - and a surface that advertises one strain while the
  // draw favours another is exactly the defect WP-2.10a was written to
  // remove. Composing here means the sentence and the stream cannot disagree.
  const composed = conditionFromAnomaly(anomaly, clauses);
  const condition = describeSignalCondition(anomaly);
  const tilt = conditionOfferTilt(composed);

  return {
    day: start.toISOString().slice(0, 10),
    startsAt: start.toISOString(),
    endsAt: signalDayEnd(start).toISOString(),
    seed: signalDaySeed(start.toISOString().slice(0, 10)),
    condition: tilt === null ? condition : { ...condition, strainTilt: tilt },
    clauses,
    objectives: signalObjectivesForDay(start),
  };
}

/** Has this day closed? True once the exclusive end has passed. */
export function signalDayHasEnded(
  day: Pick<SignalDayDefinition, 'endsAt'>,
  now: Date | number = Date.now()
): boolean {
  return new Date(now).getTime() >= new Date(day.endsAt).getTime();
}

/**
 * Is `dayKey` an ARCHIVE day relative to `now`?
 *
 * §7.2 / Rule 5: "a missed day costs that day's opportunity and nothing else;
 * the day archives as practice". An archive day is still playable — its
 * conditions are derived exactly as they were — and it pays nothing at all.
 * A future day is not playable: it has not happened, and treating it as
 * archive would let a client mine tomorrow's conditions early.
 */
export function signalDayStatus(
  dayKey: string,
  now: Date | number = Date.now()
): 'today' | 'archive' | 'future' | 'invalid' {
  const date = signalDayKeyToDate(dayKey);
  if (!date) return 'invalid';
  const today = signalDayStart(now).getTime();
  if (date.getTime() === today) return 'today';
  return date.getTime() < today ? 'archive' : 'future';
}

/**
 * The objective a player named, resolved against the day's DERIVED three.
 *
 * The client chooses; it never defines. An id that is not one of this day's
 * three resolves to null, and a null choice is not a Signal objective run —
 * so a crafted request buys an ordinary run, never an exemption (§8.6, and
 * WP-0.01's closed-by-default exemption hook).
 */
export function resolveSignalObjective(
  day: Pick<SignalDayDefinition, 'objectives'>,
  objectiveId: unknown
): SignalObjective | null {
  if (typeof objectiveId !== 'string') return null;
  return day.objectives.find((objective) => objective.id === objectiveId) ?? null;
}

// ---------------------------------------------------------------------------
// Settlement — "rewards settle automatically, no claim cascades" (§7.2)
// ---------------------------------------------------------------------------

/**
 * A run, reduced to everything an objective depends on.
 *
 * Deliberately does NOT carry `dnaEarned`, `chargeState`, `score` or any
 * account field. §8.6 makes the Signal run exempt and full-fat, so the
 * lean-adjusted number is irrelevant here; Score is untouched because a Signal
 * objective must never become a reason to read the skill number (Rule 2).
 */
export interface SignalRunFacts {
  /** Server-bounded seconds. Never the raw client claim — see the server module. */
  durationSeconds: number;
  extracted: boolean;
  /** Full-strength Yield (§6.2). */
  yieldDna: number;
  /** Genes accepted during the run, from the validator's recompute. */
  genesAccepted: number;
  /** `game_sessions.end_reason`. `null` reads as settled (WP-0.06). */
  endReason: string | null;
  validated: boolean | null;
  /** Free Play, Training, or an archive day. Practice pays nothing. */
  isPractice: boolean;
}

/** What the run measured against one objective. */
export interface SignalObjectiveOutcome {
  /** The measured value, floored and clamped at zero. */
  progress: number;
  target: number;
  complete: boolean;
}

/**
 * The raw measurement for a kind. Pure projection of the run's facts, with no
 * eligibility opinion in it — eligibility is the next function's job, so the
 * two can be read and tested separately.
 */
export function measureSignalObjective(
  kind: SignalObjectiveKind,
  facts: SignalRunFacts
): number {
  switch (kind) {
    case 'endure':
      return Math.max(0, Math.floor(facts.durationSeconds));
    case 'extract':
      // An unbanked run extracted nothing, however far it got. The portal
      // decision IS the mechanic (§5), so the objective reads the decision.
      return facts.extracted ? Math.max(0, Math.floor(facts.yieldDna)) : 0;
    case 'engineer':
      return Math.max(0, Math.floor(facts.genesAccepted));
  }
}

/**
 * Did this run complete the objective?
 *
 * Four gates, and every one of them is a "no" that costs the player nothing
 * they own (Rule 5):
 *
 *   1. SETTLED — `endReasonSettles` is the single authority (WP-0.06). An
 *      expired, abandoned or disconnected run completes NOTHING, here as
 *      everywhere. A run that did not settle did not happen.
 *   2. VALIDATED — a flagged run never completes a public ritual.
 *   3. NOT PRACTICE — Free Play and archive days pay nothing (§7.2, Rule 5),
 *      so they complete nothing.
 *   4. AT TARGET — the measurement meets the day's derived number.
 */
export function evaluateSignalObjective(
  objective: Pick<SignalObjective, 'kind' | 'target'>,
  facts: SignalRunFacts
): SignalObjectiveOutcome {
  const progress = measureSignalObjective(objective.kind, facts);
  const eligible =
    endReasonSettles(facts.endReason) &&
    facts.validated !== false &&
    !facts.isPractice;
  return {
    progress,
    target: objective.target,
    complete: eligible && progress >= objective.target,
  };
}

/**
 * What settlement should write for one attempt.
 *
 * IDEMPOTENT BY CONSTRUCTION, which is this work package's second acceptance
 * criterion. Nothing here increments:
 *
 *   - `progress` is `GREATEST(stored, measured)` — a re-settle of the same run
 *     recomputes the same number and writes it again;
 *   - `completed` is a latch: once true it stays true (Rule 6 — a completed
 *     Signal is an earned thing), and a re-settle cannot un-complete it;
 *   - `payBonus` is true only on the transition into completion when the bonus
 *     has not already been paid. The SERVER-side guard is the row's
 *     `bonus_paid_at`, set under a lock in the same statement that pays; this
 *     flag only tells it to try.
 *
 * Run this twice with the same inputs and the second answer is byte-identical
 * to the first, with `payBonus` false because the stored state now says paid.
 */
export interface SignalAttemptState {
  progress: number;
  completed: boolean;
  bonusPaid: boolean;
}

export interface SignalAttemptSettlement {
  progress: number;
  completed: boolean;
  /** Newly completed by THIS settlement (false on a re-settle). */
  newlyCompleted: boolean;
  payBonus: boolean;
  bonusDna: number;
}

export function settleSignalAttempt(
  objective: Pick<SignalObjective, 'kind' | 'target'>,
  facts: SignalRunFacts,
  stored: SignalAttemptState
): SignalAttemptSettlement {
  const outcome = evaluateSignalObjective(objective, facts);
  const progress = Math.max(stored.progress, outcome.progress);
  const completed = stored.completed || outcome.complete;
  const newlyCompleted = completed && !stored.completed;
  const payBonus = completed && !stored.bonusPaid;
  return {
    progress,
    completed,
    newlyCompleted,
    payBonus,
    bonusDna: payBonus ? SIGNAL_FIRST_COMPLETION_BONUS_DNA : 0,
  };
}

/** Re-export for callers that only import this module. */
export { isAnomalyId };
export type { AnomalyId };
