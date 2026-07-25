/**
 * Energy — the daily harvest envelope (Constitution §8.6).
 *
 * Deterministic, dependency-free rules shared by the server (authority) and
 * the client (display only). Nothing here reads or writes a database.
 *
 * The model in one sentence: the day grants a fixed number of CHARGES, the
 * allotment resets to full at 00:00 UTC, and a run that consumes a charge
 * harvests full DNA while a run that finds the allotment empty still plays,
 * still Scores, still ranks — and harvests the lean factor.
 *
 * Three properties this module exists to guarantee:
 *
 *  1. **No grant path.** Charges are derived from `(charges_day,
 *     charges_used)`; there is no balance to add to. No purchase, perk,
 *     stipend, streak, achievement or reward can mint one, because minting
 *     is not an operation the model has (§10.4, Rule 3).
 *  2. **One clock.** The only refill authority is the UTC date rolling over
 *     (GT §9.2 fixed: the 20-minute drip and the offline restore both had
 *     their own clock, and the two disagreed indefinitely).
 *  3. **Absence is never destructive** (Rule 5). Charges never accumulate as
 *     credit and never accumulate as debt. A player returning after 30 days
 *     opens the day with exactly the same allotment as a player who has
 *     played every day: `chargesPerDay`. Nothing owned is touched.
 */

import { GAME_CONFIG } from '@/shared/config/game';

/**
 * How a run settles against the envelope. Stamped on the session row at
 * start (server-derived, never client-asserted) and read back at settlement.
 *
 * - `charged` — a charge was consumed; full harvest.
 * - `lean`    — the day's allotment was empty; the run played identically
 *               and harvests `leanHarvestFactor`.
 * - `exempt`  — the run consumes no charge and harvests full-strength: the
 *               day's Signal objective run, every Serpent attempt (§8.6
 *               "the rituals are always full-fat"), and rewardless practice
 *               runs, which take nothing from the envelope because they pay
 *               nothing into it.
 */
export type ChargeState = 'charged' | 'lean' | 'exempt';

const CHARGE_STATES: readonly ChargeState[] = ['charged', 'lean', 'exempt'];

export function isChargeState(value: unknown): value is ChargeState {
  return typeof value === 'string' && (CHARGE_STATES as readonly string[]).includes(value);
}

/** The stored, day-scoped ledger. This is the entire persistent model. */
export interface ChargeLedger {
  /** UTC day the counter belongs to, `YYYY-MM-DD`; null before first use. */
  chargesDay: string | null;
  /** Charges consumed on `chargesDay`. Never negative. */
  chargesUsed: number;
}

/** What a caller (route response, HUD) needs to render or decide. */
export interface ChargeStatus {
  /** Charges left today, `0..chargesPerDay`. */
  remaining: number;
  /** The day's full allotment. */
  perDay: number;
  /** Charges consumed today (0 once the day has rolled over). */
  usedToday: number;
  /** The UTC day this status describes, `YYYY-MM-DD`. */
  day: string;
  /** ISO timestamp of the next 00:00 UTC reset — the only refill event. */
  refillsAt: string;
}

/**
 * The UTC calendar day of an instant, as `YYYY-MM-DD`.
 *
 * `toISOString()` is always UTC, so this is timezone-independent by
 * construction — every player on earth rolls over at the same moment, which
 * is what makes "one clock" checkable.
 */
export function utcDayKey(at: Date | number = Date.now()): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** The next 00:00 UTC strictly after `at` — when the allotment resets. */
export function nextUtcMidnight(at: Date | number = Date.now()): Date {
  const d = new Date(at);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0)
  );
}

/**
 * Resolve a stored ledger into today's status. Pure and lazy: reading never
 * mutates anything, and a stale `chargesDay` simply reads as a full day.
 *
 * A ledger from any previous day yields `remaining === perDay`. That is the
 * refill — there is no separate refill operation to run, no cron, no timer,
 * and therefore nothing that can fail to run and leave a player short.
 */
export function resolveChargeStatus(
  ledger: ChargeLedger,
  now: Date | number = Date.now(),
  perDay: number = GAME_CONFIG.economy.energy.chargesPerDay
): ChargeStatus {
  const day = utcDayKey(now);
  const isToday = ledger.chargesDay === day;
  // A negative or absurd stored counter can only ever cost the player, so
  // clamp it into the honest range rather than trusting it.
  const usedToday = isToday
    ? Math.min(Math.max(0, Math.floor(ledger.chargesUsed) || 0), perDay)
    : 0;

  return {
    remaining: Math.max(0, perDay - usedToday),
    perDay,
    usedToday,
    day,
    refillsAt: nextUtcMidnight(now).toISOString(),
  };
}

/**
 * Server-derived facts that can exempt a run from consuming a charge.
 *
 * Every field is resolved by the server from its own tables — the client's
 * `mode` string is a request, never a grant. A run is exempt only when the
 * server can point at the row that makes it exempt, so today, with neither
 * system built, no client can obtain an exemption by asking for one.
 */
export interface ChargeExemptionFacts {
  /**
   * The player's Signal objective run for the current UTC day, when the
   * server has confirmed this run is it (Constitution §7.2; built by
   * WP-1.03). Null when the Signal is not live or this run is not it.
   */
  signalObjectiveRunId: string | null;
  /**
   * The active Serpent week this run is an attempt in, when the server has
   * confirmed it (§7.3; built by WP-1.01). Null when the Serpent is not live
   * or this run is not an attempt.
   */
  serpentWeekId: string | null;
  /**
   * Rewardless practice (Free Play / Training). Such a run pays nothing, so
   * it takes nothing: charging it would be a pure penalty for practising.
   */
  rewardless: boolean;
}

/** No exemption — the default every run starts from. */
export const NO_EXEMPTION: ChargeExemptionFacts = {
  signalObjectiveRunId: null,
  serpentWeekId: null,
  rewardless: false,
};

/**
 * Whether the server's own facts exempt this run. Closed by default: an
 * exemption requires a server-resolved identifier, never a client claim.
 */
export function isChargeExempt(facts: ChargeExemptionFacts): boolean {
  return (
    facts.rewardless ||
    facts.signalObjectiveRunId !== null ||
    facts.serpentWeekId !== null
  );
}

/**
 * The harvest factor a settled run's DNA is multiplied by.
 *
 * Exempt and charged runs are indistinguishable at settlement — both harvest
 * full strength. Only an empty allotment is lean.
 */
export function harvestFactor(
  state: ChargeState,
  leanFactor: number = GAME_CONFIG.economy.energy.leanHarvestFactor
): number {
  return state === 'lean' ? leanFactor : 1;
}

/**
 * Apply the harvest factor to a full-strength Yield.
 *
 * `yieldDna` is the run's full-strength economic total — the number Depth,
 * Mastery and every record read (§6.2: "Yield is charge-independent"). The
 * return value is only what the DNA balance is credited.
 *
 * Floors, so the harvest is never fractional; a lean run with any Yield at
 * all still pays at least 1 DNA — §8.6's "lean, never zero" is enforced
 * here rather than left to rounding.
 */
export function applyHarvestFactor(
  yieldDna: number,
  state: ChargeState,
  leanFactor: number = GAME_CONFIG.economy.energy.leanHarvestFactor
): number {
  if (!Number.isFinite(yieldDna) || yieldDna <= 0) return 0;
  const factor = harvestFactor(state, leanFactor);
  if (factor >= 1) return Math.floor(yieldDna);
  return Math.max(1, Math.floor(yieldDna * factor));
}

/**
 * Whether the charge meter should be shown at all (§8.6): the ramp keeps it
 * hidden until the player has banked enough runs to have met the game.
 */
export function isChargeMeterVisible(
  bankedRuns: number,
  threshold: number = GAME_CONFIG.economy.energy.meterVisibleAtBankedRuns
): boolean {
  return bankedRuns >= threshold;
}
