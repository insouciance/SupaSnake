jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

import { GAME_CONFIG } from '@/shared/config/game';
import { NO_EXEMPTION } from '@/shared/game/energyEnvelope';
import {
  commitRunEnergy,
  EnergyCommitmentError,
  isMissingEnvelopeInfra,
  readEnergyStatus,
} from './energyEnvelope';

function clientWith(
  rpcImpl: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>,
  legacy = { charges_day: new Date().toISOString().slice(0, 10), charges_used: 2 }
) {
  const rpc = jest.fn(rpcImpl);
  const single = jest.fn(async () => ({ data: legacy, error: null }));
  const eq = jest.fn(() => ({ single }));
  const select = jest.fn(() => ({ eq }));
  const from = jest.fn(() => ({ select }));
  return { client: { rpc, from } as never, rpc, from };
}

const energyRow = {
  energy_available: 4,
  energy_updated_at: '2026-07-29T11:30:00.000Z',
  energy_recovered: 1,
  server_now: '2026-07-29T12:00:00.000Z',
};

describe('readEnergyStatus', () => {
  it('uses the database-time recovery RPC and exposes partial progress', async () => {
    const { client, rpc } = clientWith(async () => ({ data: [energyRow], error: null }));
    const status = await readEnergyStatus(client, 'player-1');
    expect(rpc).toHaveBeenCalledWith('read_player_energy', {
      p_player_id: 'player-1',
      p_capacity: 6,
      p_recovery_interval_seconds: 3600,
    });
    expect(status.available).toBe(4);
    expect(status.recoveryProgress).toBeCloseTo(0.5);
    expect(status.nextRecoveryAt).toBe('2026-07-29T12:30:00.000Z');
  });

  it('translates the old envelope during app-before-migration rollout', async () => {
    const { client, from } = clientWith(async () => ({
      data: null,
      error: { code: 'PGRST202', message: 'read_player_energy missing' },
    }));
    const status = await readEnergyStatus(client, 'player-1');
    expect(from).toHaveBeenCalledWith('players');
    expect(status.available).toBe(4);
  });
});

describe('commitRunEnergy', () => {
  it('passes every centralized dial and returns the immutable snapshot', async () => {
    const { client, rpc } = clientWith(async () => ({
      data: [{
        ...energyRow,
        run_state: 'charged',
        energy_available_before: 6,
        energy_committed: 2,
        commitment_multiplier_bps: 22_000,
        clan_battle_id: 'battle-1',
        clan_battle_side_id: 'side-1',
        clan_id: 'clan-1',
        clan_battle_ends_at: '2026-07-30T00:00:00.000Z',
        clan_fifth_threshold: 900,
      }],
      error: null,
    }));

    const result = await commitRunEnergy(
      client,
      'player-1',
      'session-1',
      2,
      NO_EXEMPTION
    );
    expect(rpc).toHaveBeenCalledWith('commit_run_energy', expect.objectContaining({
      p_player_id: 'player-1',
      p_session_id: 'session-1',
      p_commitment: 2,
      p_exempt: false,
      p_capacity: GAME_CONFIG.economy.energy.capacity,
      p_recovery_interval_seconds: GAME_CONFIG.economy.energy.recoveryIntervalSeconds,
      p_commitment_multipliers_bps: [10_000, 22_000, 36_000, 52_000, 72_000, 100_000],
    }));
    expect(result.energyCommitted).toBe(2);
    expect(result.commitmentMultiplierBps).toBe(22_000);
    expect(result.clanBattle).toEqual(expect.objectContaining({
      battleId: 'battle-1',
      fifthBestToBeat: 900,
    }));
  });

  it.each([
    [0, false, 'lean', 2_500],
    [4, true, 'exempt', 10_000],
  ])('stamps zero/exempt runs through the same immutable RPC', async (
    requested,
    exempt,
    state,
    bps
  ) => {
    const { client, rpc } = clientWith(async () => ({
      data: [{
        ...energyRow,
        run_state: state,
        energy_available_before: 4,
        energy_committed: 0,
        commitment_multiplier_bps: bps,
      }],
      error: null,
    }));
    const result = await commitRunEnergy(
      client,
      'player-1',
      'session-1',
      requested,
      exempt ? { ...NO_EXEMPTION, rewardless: true } : NO_EXEMPTION
    );
    expect(rpc).toHaveBeenCalledWith('commit_run_energy', expect.objectContaining({
      p_commitment: exempt ? 0 : requested,
      p_exempt: exempt,
    }));
    expect(result.state).toBe(state);
    expect(result.energyCommitted).toBe(0);
  });

  it('rejects an invalid commitment before touching persistence', async () => {
    const { client, rpc } = clientWith(async () => ({ data: null, error: null }));
    await expect(
      commitRunEnergy(client, 'player-1', 'session-1', 7, NO_EXEMPTION)
    ).rejects.toMatchObject({ reason: 'invalid' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('surfaces insufficient stock as a typed conflict without fallback', async () => {
    const { client } = clientWith(async () => ({
      data: null,
      error: { code: 'P0001', message: 'insufficient_energy' },
    }));
    await expect(
      commitRunEnergy(client, 'player-1', 'session-1', 6, NO_EXEMPTION)
    ).rejects.toEqual(expect.objectContaining<Partial<EnergyCommitmentError>>({
      reason: 'insufficient',
    }));
  });

  it('fails closed when the authoritative RPC returns no commitment snapshot', async () => {
    const { client } = clientWith(async () => ({ data: null, error: null }));
    await expect(
      commitRunEnergy(client, 'player-1', 'session-1', 2, NO_EXEMPTION)
    ).rejects.toMatchObject({ reason: 'unavailable' });
  });

  it('allows only a one-Energy legacy fallback before migration 059', async () => {
    const { client, rpc } = clientWith(async (name) => {
      if (name === 'commit_run_energy') {
        return { data: null, error: { code: 'PGRST202', message: 'missing' } };
      }
      return {
        data: [{ charged: true, charges_day: '2026-07-29', charges_used: 1 }],
        error: null,
      };
    });
    const one = await commitRunEnergy(client, 'player-1', 'session-1', 1, NO_EXEMPTION);
    expect(one.energyCommitted).toBe(1);
    expect(rpc).toHaveBeenLastCalledWith('consume_run_charge', expect.any(Object));

    await expect(
      commitRunEnergy(client, 'player-1', 'session-2', 2, NO_EXEMPTION)
    ).rejects.toMatchObject({ reason: 'unavailable' });
  });
});

describe('migration overlap detection', () => {
  it.each(['42P01', '42703', '42883', 'PGRST202'])('recognizes %s', (code) => {
    expect(isMissingEnvelopeInfra({ code })).toBe(true);
  });
  it('recognizes the new object names but not unrelated failures', () => {
    expect(isMissingEnvelopeInfra({ message: 'stored_energy missing' })).toBe(true);
    expect(isMissingEnvelopeInfra({ message: 'permission denied' })).toBe(false);
  });
});
