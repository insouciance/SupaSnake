import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { GAME_CONFIG } from '@/shared/config/game';
import { CLAN_ECONOMY_CONFIG } from '@/lib/clan/config';

export interface ClanContributionResult {
  eligible: boolean;
  reason?: string;
  enteredTopFive?: boolean;
  replacedSessionId?: string | null;
  scoreDelta?: number;
  clanTotal?: number;
  thresholdBefore?: number;
  fifthBest?: number;
  topFive?: Array<{
    sessionId: string;
    score: number;
    rank: number;
    energyCommitted: number;
    generation: number;
  }>;
}

function isMissingBattleInfra(error: { code?: string; message?: string }): boolean {
  return (
    ['42P01', '42703', '42883', 'PGRST202', 'PGRST205'].includes(error.code || '') ||
    /schema cache.*clan_energy_|relation .*clan_energy_.* does not exist/i.test(
      error.message || ''
    )
  );
}

/** Non-fatal settlement overlay: personal rewards must never depend on it. */
export async function recordClanEnergyContribution(
  supabase: SupabaseClient,
  sessionId: string
): Promise<ClanContributionResult | null> {
  const battle = GAME_CONFIG.economy.clanBattle;
  const { data, error } = await supabase.rpc('record_clan_energy_contribution', {
    p_session_id: sessionId,
    p_best_count: battle.contributingRunsPerMember,
    p_completion_grace_seconds: battle.completionGraceSeconds,
    p_max_run_duration_seconds: battle.maxEligibleRunDurationSeconds,
  });

  if (error) {
    if (isMissingBattleInfra(error)) return null;
    console.error('Clan Energy contribution failed:', { sessionId, error });
    Sentry.captureException(
      new Error(`record_clan_energy_contribution failed: ${error.message}`),
      { extra: { sessionId, code: error.code } }
    );
    return null;
  }
  return (data ?? null) as ClanContributionResult | null;
}

export async function settleClanEnergyBattles(
  supabase: SupabaseClient
): Promise<number | null> {
  const rewards = CLAN_ECONOMY_CONFIG.battleRewards;
  const { data, error } = await supabase.rpc('settle_clan_energy_battles', {
    p_completion_grace_seconds: GAME_CONFIG.economy.clanBattle.completionGraceSeconds,
    p_participation_reward_dna: rewards.participationDna,
    p_victor_bonus_dna: rewards.victorBonusDna,
    p_stalemate_bonus_dna: rewards.stalemateBonusDna,
  });
  if (error) {
    if (isMissingBattleInfra(error)) return null;
    throw new Error(`settle_clan_energy_battles failed: ${error.message}`);
  }
  return typeof data === 'number' ? data : Number(data ?? 0);
}

export async function reconcileClanEnergyContributions(
  supabase: SupabaseClient
): Promise<number | null> {
  const battle = GAME_CONFIG.economy.clanBattle;
  const { data, error } = await supabase.rpc('reconcile_clan_energy_contributions', {
    p_best_count: battle.contributingRunsPerMember,
    p_completion_grace_seconds: battle.completionGraceSeconds,
    p_max_run_duration_seconds: battle.maxEligibleRunDurationSeconds,
  });
  if (error) {
    if (isMissingBattleInfra(error)) return null;
    throw new Error(`reconcile_clan_energy_contributions failed: ${error.message}`);
  }
  return typeof data === 'number' ? data : Number(data ?? 0);
}
