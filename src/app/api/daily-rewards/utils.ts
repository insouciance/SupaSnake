/**
 * Daily Rewards API utilities - pure mapping/decision logic
 */

export interface DailyRewardTier {
  day: number;
  dna: number;
  energy: number;
  bonusType: 'milestone' | 'cycle_complete' | null;
}

export interface ClaimResult {
  dayClaimed: number;
  dnaGranted: number;
  energyGranted: number;
  nextDay: number;
  cycleCompleted: boolean;
}

/** Map a daily_reward_tiers row to the API shape */
export function mapTierRow(row: {
  day_number: number;
  dna_amount: number;
  energy_amount: number;
  bonus_type: string | null;
}): DailyRewardTier {
  return {
    day: row.day_number,
    dna: row.dna_amount,
    energy: row.energy_amount,
    bonusType: (row.bonus_type as DailyRewardTier['bonusType']) ?? null,
  };
}

/**
 * A reward is claimable when the player has not claimed today.
 * @param lastClaimDate player_daily_state.last_claim_date (YYYY-MM-DD or null)
 * @param today Today's date as YYYY-MM-DD
 */
export function computeCanClaimToday(
  lastClaimDate: string | null | undefined,
  today: string
): boolean {
  return !lastClaimDate || lastClaimDate !== today;
}

/** Map a claim_daily_reward RPC row (snake_case) to the API shape */
export function mapClaimRow(row: {
  day_claimed: number;
  dna_granted: number;
  energy_granted: number;
  next_day: number;
  cycle_completed: boolean;
}): ClaimResult {
  return {
    dayClaimed: row.day_claimed,
    dnaGranted: row.dna_granted,
    energyGranted: row.energy_granted,
    nextDay: row.next_day,
    cycleCompleted: row.cycle_completed,
  };
}

/**
 * Map claim_daily_reward RPC errors to HTTP status codes.
 * The RPC raises exceptions with descriptive messages.
 */
export function mapClaimErrorStatus(message: string | null | undefined): number {
  const msg = (message || '').toLowerCase();
  if (msg.includes('already claimed')) return 409;
  if (msg.includes('player not found')) return 404;
  return 400;
}
