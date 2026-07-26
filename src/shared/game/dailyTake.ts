/**
 * The Daily Take — the rules, as pure arithmetic (Constitution §7.2, Rule 5).
 *
 * §7.2, verbatim: "The first run of each UTC day pays a bonus, collected with
 * one satisfying tap on that run's Results — attached to playing, never to
 * logging in. Base 100 DNA, multiplied by the Take streak: consecutive days
 * grow it through tiers — 3 / 7 / 14 / 30 days → ×1.25 / ×1.5 / ×2 / ×3. A
 * missed day cools the streak by one tier; it never resets to zero. **The
 * streak multiplies the Take only — never run payouts, never Yield, never
 * anything else.**"
 *
 * THE LAST SENTENCE IS THIS FILE'S WHOLE JOB
 *
 * Everything here is a function of the Take's own state and returns the Take's
 * own numbers. `takeAmountForTier` closes over `TAKE_BASE_DNA` — a constant
 * declared in this file — and there is no parameter anywhere in this module
 * through which a run's fold, its Yield, its Score, its Depth or a player's
 * balance could be passed in. The multiplier therefore cannot reach any of
 * them: not because each call site was audited, but because there is no call
 * shape that would let it. WP-0.02 deleted the account multiplier stack for
 * exactly this reason; re-introducing a factor that multiplies anything but
 * the Take's own 100 DNA would rebuild what it removed.
 *
 * THE LADDER IS DERIVED FROM THE DAY COUNT, NEVER STORED INDEPENDENTLY
 *
 * `take_tier` exists as a column (migration 041) and is CHECK-constrained
 * against `take_streak_days`, but it is not an independent fact: `tier =
 * takeTierForStreak(days)` holds after every transition below, including the
 * cooling one. Storing it is what lets the database refuse an unearned tier
 * without re-deriving; it is never the source of truth for what a Take pays.
 *
 * COOLING (Rule 5 — "absence is never destructive")
 *
 * A gap of two or more UTC days drops the ladder by EXACTLY ONE RUNG, however
 * long the absence was. §7.1's table prices a missed day at "the day's Take,
 * its charges, and one streak tier — never anything owned", singular; a player
 * back after a month therefore loses one tier, not thirty. The chain then
 * restarts at the cooled tier's own threshold — never at zero, which migration
 * 041's `player_streaks_take_never_resets` CHECK makes structurally
 * impossible for anyone who has ever collected a Take.
 */

/** §7.2: the base every Take is built from, before its own streak tier. */
export const TAKE_BASE_DNA = 100;

/**
 * Consecutive-day thresholds, tier 0 → 4.
 *
 * Byte-identical to the `ARRAY[0, 3, 7, 14, 30]` inside migration 041's
 * `player_streaks_take_tier_earned` CHECK and migration 050's collect RPC.
 * `dailyTake.migration.test.ts` pins all three against each other, so a change
 * to one that is not made to the others fails the suite rather than shipping.
 */
export const TAKE_TIER_THRESHOLDS = [0, 3, 7, 14, 30] as const;

/** §7.2: ×1 / ×1.25 / ×1.5 / ×2 / ×3, indexed by tier. */
export const TAKE_TIER_MULTIPLIERS = [1, 1.25, 1.5, 2, 3] as const;

/** The top rung. Mirrors `player_streaks_take_tier_range`'s `BETWEEN 0 AND 4`. */
export const MAX_TAKE_TIER = TAKE_TIER_THRESHOLDS.length - 1;

/** A player's Take chain, exactly as `player_streaks` stores it. */
export interface TakeStreakState {
  /** Consecutive UTC days. Zero if and only if no Take was ever collected. */
  streakDays: number;
  /** 0-4. Always equals `takeTierForStreak(streakDays)`. */
  tier: number;
  /** Rule 6 high-water mark. Only ever written upward. */
  longestStreak: number;
  /** `YYYY-MM-DD` of the last collect; null means never collected. */
  lastClaimDate: string | null;
}

/** What one collect would do — the result of `advanceTakeStreak`. */
export interface TakeAdvance {
  /** True when the day's Take is already settled; then nothing is granted. */
  alreadyCollected: boolean;
  /** True when this transition walked the ladder down one rung. */
  cooled: boolean;
  /** DNA this collect pays. Zero on an already-collected day. */
  amount: number;
  /** The tier multiplier applied to the Take's own base — and to nothing else. */
  multiplier: number;
  /** The state to store. Identical to the input when `alreadyCollected`. */
  next: TakeStreakState;
}

function clampInt(value: unknown, min: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.floor(value))
    : min;
}

/** The highest tier a chain of `days` consecutive days has earned. */
export function takeTierForStreak(days: number): number {
  const safe = clampInt(days, 0);
  let tier = 0;
  for (let index = 0; index < TAKE_TIER_THRESHOLDS.length; index += 1) {
    if (safe >= TAKE_TIER_THRESHOLDS[index]) tier = index;
  }
  return tier;
}

/** The §7.2 multiplier for a tier. Out-of-range tiers read as ×1, never more. */
export function takeMultiplierForTier(tier: number): number {
  const index = clampInt(tier, 0);
  return TAKE_TIER_MULTIPLIERS[index] ?? 1;
}

/**
 * What a Take at this tier pays.
 *
 * Floored, so the payout is always a whole DNA: 100 / 125 / 150 / 200 / 300.
 * The ONLY quantity this multiplier is ever applied to is `TAKE_BASE_DNA`.
 */
export function takeAmountForTier(tier: number): number {
  return Math.floor(TAKE_BASE_DNA * takeMultiplierForTier(tier));
}

/** `YYYY-MM-DD` for an instant, in UTC. The day boundary is 00:00 UTC (§7.1). */
export function takeDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. Negative if `to` is earlier. */
export function takeDayGap(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Is the day's Take still unclaimed?
 *
 * This is the "first run of the day" test, and it is deliberately the
 * FORGIVING form of it: it stays true for every run of the day until the Take
 * is actually collected, so a player who closes the tab on their first
 * Results has not lost the day's Take (§7.2 forbids destructive absence;
 * Rule 5). It flips to false the instant the collect settles, which is what
 * makes a second collect impossible to even offer.
 */
export function isTakeAvailable(lastClaimDate: string | null, now: Date): boolean {
  return lastClaimDate !== takeDayKey(now);
}

/**
 * Normalise a stored row into a state this module can reason about, honouring
 * migration 041's CHECK constraints rather than trusting the caller.
 *
 * A row that claims zero days with a claim date, or a tier its days have not
 * earned, cannot exist in the database — but a mock, a partial read or a
 * hand-written fixture can produce one, and this module must not turn that
 * into a bigger payout than the ladder allows.
 */
export function normalizeTakeState(state: Partial<TakeStreakState>): TakeStreakState {
  const lastClaimDate =
    typeof state.lastClaimDate === 'string' && state.lastClaimDate.length === 10
      ? state.lastClaimDate
      : null;
  // The CHECK: a claim date implies at least one day; no claim date implies none.
  const streakDays = lastClaimDate === null ? 0 : Math.max(1, clampInt(state.streakDays, 0));
  return {
    streakDays,
    // Never trust a stored tier upward: re-derive it from the days.
    tier: takeTierForStreak(streakDays),
    longestStreak: Math.max(clampInt(state.longestStreak, 0), streakDays),
    lastClaimDate,
  };
}

/**
 * Apply one collect on `now`'s UTC day.
 *
 * Four transitions, and no fifth:
 *
 *   already collected today   → nothing granted, state untouched (idempotent)
 *   never collected           → day 1, tier 0, ×1
 *   collected yesterday       → day n+1, tier re-derived (the chain grows)
 *   a gap of ≥ 2 days         → cool ONE tier, restart at that tier's threshold
 *
 * A last-claim date in the future (clock skew, a hand-edited row) is treated
 * as already collected. The defensive direction is "grant nothing": a Take
 * that fails to pay is recoverable on the next call, a Take that pays twice
 * is not.
 */
export function advanceTakeStreak(
  state: Partial<TakeStreakState>,
  now: Date
): TakeAdvance {
  const current = normalizeTakeState(state);
  const today = takeDayKey(now);

  if (current.lastClaimDate !== null && takeDayGap(current.lastClaimDate, today) <= 0) {
    return {
      alreadyCollected: true,
      cooled: false,
      amount: 0,
      multiplier: takeMultiplierForTier(current.tier),
      next: current,
    };
  }

  let streakDays: number;
  let cooled = false;

  if (current.lastClaimDate === null) {
    // The first Take a player ever collects starts the chain at one day.
    // It can never start at zero: `player_streaks_take_never_resets` pairs a
    // claim date with a non-zero day count.
    streakDays = 1;
  } else if (takeDayGap(current.lastClaimDate, today) === 1) {
    streakDays = current.streakDays + 1;
  } else {
    // Rule 5, one rung. `Math.max(1, ...)` is what keeps tier 0's threshold
    // of 0 from writing a state migration 041 forbids.
    const cooledTier = Math.max(0, current.tier - 1);
    streakDays = Math.max(1, TAKE_TIER_THRESHOLDS[cooledTier]);
    cooled = true;
  }

  const tier = takeTierForStreak(streakDays);
  return {
    alreadyCollected: false,
    cooled,
    amount: takeAmountForTier(tier),
    multiplier: takeMultiplierForTier(tier),
    next: {
      streakDays,
      tier,
      // Rule 6: the high-water mark only ever moves up, so cooling can never
      // erode it.
      longestStreak: Math.max(current.longestStreak, streakDays),
      lastClaimDate: today,
    },
  };
}

/**
 * What the Take slot should show for a player who has not collected today.
 *
 * A PREVIEW ONLY. The collect RPC re-derives everything under a row lock from
 * its own clock, so this can never be the number that gets paid — it is what
 * the surface renders before the tap.
 */
export function previewDailyTake(
  state: Partial<TakeStreakState>,
  now: Date
): { amount: number; multiplier: number; streakDays: number; tier: number } {
  const advance = advanceTakeStreak(state, now);
  if (advance.alreadyCollected) {
    const current = normalizeTakeState(state);
    return {
      amount: 0,
      multiplier: takeMultiplierForTier(current.tier),
      streakDays: current.streakDays,
      tier: current.tier,
    };
  }
  return {
    amount: advance.amount,
    multiplier: advance.multiplier,
    streakDays: advance.next.streakDays,
    tier: advance.next.tier,
  };
}
