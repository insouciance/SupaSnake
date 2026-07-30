/** Server authority for Energy recovery and immutable run commitments. */

import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { GAME_CONFIG } from '@/shared/config/game';
import {
  energyCommitmentMultiplierBps,
  isChargeExempt,
  isValidEnergyCommitment,
  resolveChargeStatus,
  resolveEnergyStatus,
  type ChargeExemptionFacts,
  type ChargeState,
  type ChargeStatus,
  type EnergyStatus,
} from '@/shared/game/energyEnvelope';

interface SupabaseErrorLike {
  code?: string;
  message?: string;
}

export function isMissingEnvelopeInfra(error: SupabaseErrorLike | null | undefined): boolean {
  if (!error) return false;
  if (['42P01', '42703', '42883', 'PGRST202'].includes(error.code || '')) return true;
  return /stored_energy|energy_updated_at|read_player_energy|commit_run_energy|energy_committed|commitment_multiplier/i.test(
    error.message || ''
  );
}

function statusFromRpc(row: Record<string, unknown> | null): EnergyStatus {
  const serverNow =
    typeof row?.server_now === 'string' ? row.server_now : new Date().toISOString();
  return resolveEnergyStatus(
    {
      storedEnergy: Number(row?.energy_available ?? GAME_CONFIG.economy.energy.capacity),
      updatedAt:
        typeof row?.energy_updated_at === 'string' ? row.energy_updated_at : serverNow,
    },
    new Date(serverNow)
  );
}

/** Read recovery using database time. Falls back safely during migration rollout. */
export async function readEnergyStatus(
  supabase: SupabaseClient,
  playerId: string
): Promise<EnergyStatus> {
  const { data, error } = await supabase.rpc('read_player_energy', {
    p_player_id: playerId,
    p_capacity: GAME_CONFIG.economy.energy.capacity,
    p_recovery_interval_seconds: GAME_CONFIG.economy.energy.recoveryIntervalSeconds,
  });

  if (!error) {
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    return statusFromRpc(row);
  }

  if (!isMissingEnvelopeInfra(error)) {
    console.error('Energy ledger read failed:', { playerId, error });
    Sentry.captureException(new Error(`readEnergyStatus failed: ${error.message}`), {
      extra: { playerId, code: error.code },
    });
  }

  // Migration overlap: translate the old UTC-day envelope rather than block
  // setup. No client time reaches either path.
  const legacy = await supabase
    .from('players')
    .select('charges_day, charges_used')
    .eq('id', playerId)
    .single();
  if (!legacy.error) {
    return resolveChargeStatus({
      chargesDay: (legacy.data?.charges_day as string | null) ?? null,
      chargesUsed: Number(legacy.data?.charges_used ?? 0),
    });
  }

  return resolveEnergyStatus({
    storedEnergy: GAME_CONFIG.economy.energy.capacity,
    updatedAt: new Date(),
  });
}

/** Backwards-compatible export while components migrate terminology. */
export const readChargeStatus = readEnergyStatus;

export class EnergyCommitmentError extends Error {
  constructor(
    message: string,
    public readonly reason: 'invalid' | 'insufficient' | 'unavailable'
  ) {
    super(message);
    this.name = 'EnergyCommitmentError';
  }
}

export interface CommitEnergyResult {
  state: ChargeState;
  status: EnergyStatus;
  energyCommitted: number;
  commitmentMultiplierBps: number;
  energyAvailableBefore: number;
  energyRecoveredAtStart: number;
  /** Immutable clan snapshot stamped by the same transaction, when eligible. */
  clanBattle: {
    battleId: string;
    sideId: string;
    clanId: string;
    endsAt: string;
    fifthBestToBeat: number;
  } | null;
}

function parseBattle(row: Record<string, unknown> | null): CommitEnergyResult['clanBattle'] {
  if (
    typeof row?.clan_battle_id !== 'string' ||
    typeof row?.clan_battle_side_id !== 'string' ||
    typeof row?.clan_id !== 'string' ||
    typeof row?.clan_battle_ends_at !== 'string'
  ) {
    return null;
  }
  return {
    battleId: row.clan_battle_id,
    sideId: row.clan_battle_side_id,
    clanId: row.clan_id,
    endsAt: row.clan_battle_ends_at,
    fifthBestToBeat: Number(row.clan_fifth_threshold ?? 0),
  };
}

/**
 * Consume the selected stock and stamp the session under one database lock.
 * Calling this twice for the same session returns the original snapshot and
 * never spends twice.
 */
export async function commitRunEnergy(
  supabase: SupabaseClient,
  playerId: string,
  sessionId: string,
  requestedCommitment: number,
  facts: ChargeExemptionFacts
): Promise<CommitEnergyResult> {
  const exempt = isChargeExempt(facts);
  const commitment = exempt ? 0 : requestedCommitment;

  if (!exempt && commitment !== 0 && !isValidEnergyCommitment(commitment)) {
    throw new EnergyCommitmentError('Commit between 1 and 6 Energy.', 'invalid');
  }

  const energyConfig = GAME_CONFIG.economy.energy;
  const battleConfig = GAME_CONFIG.economy.clanBattle;
  const { data, error } = await supabase.rpc('commit_run_energy', {
    p_player_id: playerId,
    p_session_id: sessionId,
    p_commitment: commitment,
    p_exempt: exempt,
    p_capacity: energyConfig.capacity,
    p_recovery_interval_seconds: energyConfig.recoveryIntervalSeconds,
    p_commitment_multipliers_bps: [...energyConfig.commitmentMultipliersBps],
    p_battle_epoch: battleConfig.epochUtc,
    p_battle_active_seconds: battleConfig.activeDurationSeconds,
    p_battle_intermission_seconds: battleConfig.intermissionDurationSeconds,
    p_battle_best_count: battleConfig.contributingRunsPerMember,
  });

  if (error) {
    if (/insufficient_energy/i.test(error.message || '')) {
      throw new EnergyCommitmentError('Not enough recovered Energy.', 'insufficient');
    }

    if (isMissingEnvelopeInfra(error)) {
      // App-before-migration compatibility: a one-E start uses one old daily
      // charge. Larger commitments wait for the schema instead of silently
      // receiving the wrong multiplier.
      if (exempt || commitment === 0) {
        const status = await readEnergyStatus(supabase, playerId);
        return {
          state: exempt ? 'exempt' : 'lean',
          status,
          energyCommitted: 0,
          commitmentMultiplierBps: exempt ? 10_000 : energyCommitmentMultiplierBps(0),
          energyAvailableBefore: status.available,
          energyRecoveredAtStart: 0,
          clanBattle: null,
        };
      }
      if (commitment === 1) {
        const legacy = await supabase.rpc('consume_run_charge', {
          p_player_id: playerId,
          p_charges_per_day: energyConfig.capacity,
        });
        if (!legacy.error) {
          const legacyRow = (Array.isArray(legacy.data) ? legacy.data[0] : legacy.data) as
            | { charged?: boolean; charges_day?: string; charges_used?: number }
            | null;
          const status = resolveChargeStatus({
            chargesDay: legacyRow?.charges_day ?? null,
            chargesUsed: legacyRow?.charges_used ?? 0,
          });
          return {
            state: legacyRow?.charged === true ? 'charged' : 'lean',
            status,
            energyCommitted: legacyRow?.charged === true ? 1 : 0,
            commitmentMultiplierBps:
              legacyRow?.charged === true ? 10_000 : energyCommitmentMultiplierBps(0),
            energyAvailableBefore: status.available + (legacyRow?.charged === true ? 1 : 0),
            energyRecoveredAtStart: 0,
            clanBattle: null,
          };
        }
      }
      throw new EnergyCommitmentError('Energy Commitment is temporarily unavailable.', 'unavailable');
    }

    console.error('commit_run_energy RPC failed:', { playerId, sessionId, error });
    Sentry.captureException(new Error(`commit_run_energy failed: ${error.message}`), {
      extra: { playerId, sessionId, commitment, code: error.code },
    });
    throw new EnergyCommitmentError('Could not commit Energy. Try again.', 'unavailable');
  }

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row) {
    const failure = new Error('commit_run_energy returned no snapshot');
    console.error('commit_run_energy RPC returned no snapshot:', {
      playerId,
      sessionId,
      commitment,
    });
    Sentry.captureException(failure, { extra: { playerId, sessionId, commitment } });
    throw new EnergyCommitmentError('Could not commit Energy. Try again.', 'unavailable');
  }
  return {
    state:
      row?.run_state === 'exempt'
        ? 'exempt'
        : row?.run_state === 'lean'
          ? 'lean'
          : 'charged',
    status: statusFromRpc(row),
    energyCommitted: Number(row?.energy_committed ?? commitment),
    commitmentMultiplierBps: Number(
      row?.commitment_multiplier_bps ?? energyCommitmentMultiplierBps(commitment)
    ),
    energyAvailableBefore: Number(row?.energy_available_before ?? commitment),
    energyRecoveredAtStart: Number(row?.energy_recovered ?? 0),
    clanBattle: parseBattle(row),
  };
}

/**
 * Legacy test/helper API. Production session starts use `commitRunEnergy`.
 * It intentionally cannot express a multi-E commitment or session snapshot.
 */
export async function consumeRunCharge(
  supabase: SupabaseClient,
  playerId: string,
  facts: ChargeExemptionFacts
): Promise<{ state: ChargeState; status: ChargeStatus }> {
  if (isChargeExempt(facts)) {
    return { state: 'exempt', status: await readEnergyStatus(supabase, playerId) };
  }
  const { data, error } = await supabase.rpc('consume_run_charge', {
    p_player_id: playerId,
    p_charges_per_day: GAME_CONFIG.economy.energy.capacity,
  });
  if (error) {
    return {
      state: 'charged',
      status: await readEnergyStatus(supabase, playerId),
    };
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { charged?: boolean; charges_day?: string; charges_used?: number }
    | null;
  return {
    state: row?.charged === true ? 'charged' : 'lean',
    status: resolveChargeStatus({
      chargesDay: row?.charges_day ?? null,
      chargesUsed: row?.charges_used ?? 0,
    }),
  };
}
