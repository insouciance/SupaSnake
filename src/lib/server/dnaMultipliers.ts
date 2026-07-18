/**
 * DNA Multipliers - Server-side reward multiplier stack
 *
 * Final DNA = banked/salvaged payout x streak tier x set bonus x clan duel bonus
 *
 * - Streak tier: player_streaks.streak_multiplier (maintained by the
 *   record_daily_play RPC; tiers 3:1.10, 7:1.25, 14:1.50, 30:2.00)
 * - Set bonus: +10% per completed dynasty (player owns every active
 *   variant of that dynasty)
 * - Clan duel bonus: +5% clan-wide for the week AFTER the player's clan
 *   won its weekly duel (clan_duel_bonus RPC; non-fatal fallback x1)
 *
 * Design v2: the old dynasty passive (+5% DNA for dna_generation
 * dynasties) is gone - dynasty identity lives in the ruleset module
 * (src/shared/game/rulesets.ts), which already shapes the base payout.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface DnaMultiplierBreakdown {
  /** Streak tier multiplier, e.g. 1.25 */
  streak: number;
  /** Collection set bonus multiplier, e.g. 1.2 for 2 completed dynasties */
  setBonus: number;
  /** Number of dynasties where the player owns all active variants */
  completedDynasties: number;
  /** Clan duel win bonus multiplier: 1.05 the week after a duel win, else 1 */
  clanDuel: number;
  /** Product of all multipliers */
  total: number;
}

export interface DnaMultiplierResult {
  multiplier: number;
  breakdown: DnaMultiplierBreakdown;
}

/** Set bonus granted per fully collected dynasty (+10%) */
export const SET_BONUS_PER_DYNASTY = 0.1;

/** Clan-wide DNA multiplier for the week after winning a clan duel (+5%) */
export const CLAN_DUEL_WIN_MULTIPLIER = 1.05;

/** Round to 4 decimals to avoid float noise in stored breakdowns */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Normalize a raw streak multiplier value (DECIMAL comes back as string).
 * Invalid or missing values fall back to 1.0.
 */
export function normalizeStreakMultiplier(raw: unknown): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) {
    return 1;
  }
  return value;
}

/** Set bonus multiplier: x(1 + 0.10 x completedDynasties) */
export function getSetBonusMultiplier(completedDynasties: number): number {
  const count =
    Number.isFinite(completedDynasties) && completedDynasties > 0
      ? Math.floor(completedDynasties)
      : 0;
  return 1 + SET_BONUS_PER_DYNASTY * count;
}

/**
 * Count dynasties where the player owns every active variant.
 *
 * @param activeVariants All active catalog variants (id + dynastyId)
 * @param ownedVariantIds Variant ids present in the player's collection
 */
export function countCompletedDynasties(
  activeVariants: Array<{ id: string; dynastyId: string }>,
  ownedVariantIds: Array<string | null | undefined>
): number {
  const owned = new Set<string>();
  for (const id of ownedVariantIds) {
    if (id) owned.add(id);
  }

  // dynastyId -> { total active variants, owned active variants }
  const perDynasty = new Map<string, { total: number; owned: number }>();
  for (const variant of activeVariants) {
    const entry = perDynasty.get(variant.dynastyId) ?? { total: 0, owned: 0 };
    entry.total += 1;
    if (owned.has(variant.id)) {
      entry.owned += 1;
    }
    perDynasty.set(variant.dynastyId, entry);
  }

  let completed = 0;
  const entries = Array.from(perDynasty.values());
  for (const entry of entries) {
    if (entry.total > 0 && entry.owned === entry.total) {
      completed += 1;
    }
  }
  return completed;
}

/**
 * Normalize the clan_duel_bonus RPC result (NUMERIC comes back as string).
 * Invalid, missing, or sub-1 values fall back to 1.0 (never punish).
 */
export function normalizeClanDuelBonus(raw: unknown): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) {
    return 1;
  }
  return value;
}

/** Combine the multiplier sources into a result with breakdown. */
export function combineDnaMultipliers(
  streak: number,
  completedDynasties: number,
  clanDuel: number = 1
): DnaMultiplierResult {
  const setBonus = getSetBonusMultiplier(completedDynasties);
  const safeClanDuel = normalizeClanDuelBonus(clanDuel);
  const total = round4(streak * setBonus * safeClanDuel);
  return {
    multiplier: total,
    breakdown: {
      streak: round4(streak),
      setBonus: round4(setBonus),
      completedDynasties,
      clanDuel: round4(safeClanDuel),
      total,
    },
  };
}

/** Apply a multiplier to a base DNA amount, rounding down. */
export function applyDnaMultiplier(baseDna: number, multiplier: number): number {
  if (!Number.isFinite(baseDna) || baseDna <= 0) return 0;
  const safeMultiplier =
    Number.isFinite(multiplier) && multiplier >= 1 ? multiplier : 1;
  return Math.floor(baseDna * safeMultiplier);
}

/**
 * Load streak + collection state and compute the player's DNA multiplier.
 *
 * @param supabase Service-role client
 * @param playerId players.id
 */
export async function getDnaMultiplier(
  supabase: SupabaseClient,
  playerId: string
): Promise<DnaMultiplierResult> {
  // Streak tier (maintained by record_daily_play)
  const { data: streakRow } = await supabase
    .from('player_streaks')
    .select('streak_multiplier')
    .eq('player_id', playerId)
    .maybeSingle();

  const streak = normalizeStreakMultiplier(streakRow?.streak_multiplier);

  // Set bonus: owned variants vs active catalog, grouped per dynasty
  const { data: activeRows } = await supabase
    .from('snake_variants')
    .select('id, dynasty_id')
    .eq('is_active', true);

  const { data: ownedRows } = await supabase
    .from('collected_snakes')
    .select('snake_variant_id')
    .eq('player_id', playerId);

  const activeVariants = ((activeRows as Array<{ id: string; dynasty_id: string }> | null) || []).map(
    (row) => ({ id: row.id, dynastyId: row.dynasty_id })
  );
  const ownedVariantIds = ((ownedRows as Array<{ snake_variant_id: string | null }> | null) || []).map(
    (row) => row.snake_variant_id
  );

  const completedDynasties = countCompletedDynasties(activeVariants, ownedVariantIds);

  // Clan duel win bonus (+5% the week after the player's clan won its duel).
  // Non-fatal: any RPC failure falls back to x1.
  let clanDuel = 1;
  try {
    const { data: bonusValue, error: bonusError } = await supabase.rpc(
      'clan_duel_bonus',
      { p_player_id: playerId }
    );
    if (!bonusError) {
      clanDuel = normalizeClanDuelBonus(bonusValue);
    }
  } catch {
    clanDuel = 1;
  }

  return combineDnaMultipliers(streak, completedDynasties, clanDuel);
}
