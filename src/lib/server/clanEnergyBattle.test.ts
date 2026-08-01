const captureException = jest.fn();

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

import {
  reconcileClanEnergyContributions,
  recordClanEnergyContribution,
  settleClanEnergyBattles,
} from './clanEnergyBattle';
import { GAME_CONFIG } from '@/shared/config/game';
import { CLAN_ECONOMY_CONFIG } from '@/lib/clan/config';

function client(result: { data?: unknown; error?: unknown }) {
  return {
    rpc: jest.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null }),
  } as never;
}

describe('Clan Energy Battle server overlay', () => {
  beforeEach(() => captureException.mockClear());

  it('records with centralized best-five and grace values', async () => {
    const supabase = client({ data: { eligible: true, scoreDelta: 500 } });
    await expect(recordClanEnergyContribution(supabase, 'session-1')).resolves.toEqual({
      eligible: true,
      scoreDelta: 500,
    });
    expect((supabase as { rpc: jest.Mock }).rpc).toHaveBeenCalledWith(
      'record_clan_energy_contribution',
      {
        p_session_id: 'session-1',
        p_best_count: GAME_CONFIG.economy.clanBattle.contributingRunsPerMember,
        p_completion_grace_seconds: GAME_CONFIG.economy.clanBattle.completionGraceSeconds,
        p_max_run_duration_seconds:
          GAME_CONFIG.economy.clanBattle.maxEligibleRunDurationSeconds,
      }
    );
  });

  it('degrades only for a genuinely missing rollout function', async () => {
    const supabase = client({
      error: { code: 'PGRST202', message: 'function is absent from schema cache' },
    });
    await expect(recordClanEnergyContribution(supabase, 'session-1')).resolves.toBeNull();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('reports a real contribution failure without undoing personal payout', async () => {
    const supabase = client({ error: { code: '40001', message: 'serialization failure' } });
    await expect(recordClanEnergyContribution(supabase, 'session-1')).resolves.toBeNull();
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('settles with the centralized bounded battle reward dials', async () => {
    const supabase = client({ data: 2 });
    await expect(settleClanEnergyBattles(supabase)).resolves.toBe(2);
    expect((supabase as { rpc: jest.Mock }).rpc).toHaveBeenCalledWith(
      'settle_clan_energy_battles',
      {
        p_completion_grace_seconds:
          GAME_CONFIG.economy.clanBattle.completionGraceSeconds,
        p_participation_reward_dna:
          CLAN_ECONOMY_CONFIG.battleRewards.participationDna,
        p_victor_bonus_dna:
          CLAN_ECONOMY_CONFIG.battleRewards.victorBonusDna,
        p_stalemate_bonus_dna:
          CLAN_ECONOMY_CONFIG.battleRewards.stalemateBonusDna,
      }
    );
  });

  it('keeps reconcile and settlement failures operator-visible', async () => {
    const reconcile = client({ error: { code: '40001', message: 'reconcile failed' } });
    await expect(reconcileClanEnergyContributions(reconcile)).rejects.toThrow('reconcile failed');

    const settle = client({ error: { code: '40001', message: 'settlement failed' } });
    await expect(settleClanEnergyBattles(settle)).rejects.toThrow('settlement failed');
  });
});
