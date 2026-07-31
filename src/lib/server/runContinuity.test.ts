import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import {
  activateRun,
  assertTerminalRunLease,
  finalizeRunStart,
  fingerprintStartRequest,
  isValidStartRequestId,
  RunContinuityError,
  validateRunCheckpoint,
} from './runContinuity';
import { SnakeGameLogic } from '@/lib/game/SnakeGameLogic';
import { RULESETS } from '@/shared/game/rulesets';

const START_ID = '7a604a42-9f57-4f50-9a36-a7c7e85dbb28';

function clientWithRpc(rpc: jest.Mock): SupabaseClient {
  return { rpc } as unknown as SupabaseClient;
}

describe('run continuity server contract', () => {
  it('accepts UUID start request ids and rejects identifiers a client could alias', () => {
    expect(isValidStartRequestId(START_ID)).toBe(true);
    expect(isValidStartRequestId('same-run')).toBe(false);
    expect(isValidStartRequestId('')).toBe(false);
    expect(isValidStartRequestId(null)).toBe(false);
  });

  it('fingerprints every material player-selected start field deterministically', () => {
    const start = {
      mode: 'earn' as const,
      snakeId: 'snake-1',
      energyCommitment: 6,
      confirmMaxEnergy: true,
      signalObjectiveId: null,
      ladderRung: 2,
    };
    expect(fingerprintStartRequest(start)).toBe(fingerprintStartRequest({ ...start }));
    expect(fingerprintStartRequest(start)).toMatch(/^[0-9a-f]{64}$/);
    expect(
      fingerprintStartRequest({ ...start, energyCommitment: 5 })
    ).not.toBe(fingerprintStartRequest(start));
    expect(
      fingerprintStartRequest({ ...start, snakeId: 'snake-2' })
    ).not.toBe(fingerprintStartRequest(start));
  });

  it('asks one database transaction to bind the manifest and Energy commitment', async () => {
    const manifest = { sessionId: 'session-1', traits: ['swift'] };
    const rpc = jest.fn().mockResolvedValue({ data: manifest, error: null });

    await expect(
      finalizeRunStart(clientWithRpc(rpc), {
        playerId: 'player-1',
        sessionId: 'session-1',
        startRequestId: START_ID,
        fingerprint: 'a'.repeat(64),
        requestedCommitment: 6,
        exemptionFacts: {
          rewardless: false,
          signalObjectiveRunId: null,
          serpentWeekId: null,
        },
        energyVisible: true,
        manifestBase: { traits: ['swift'] },
      })
    ).resolves.toEqual(manifest);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      'finalize_run_continuity_start',
      expect.objectContaining({
        p_player_id: 'player-1',
        p_session_id: 'session-1',
        p_start_request_id: START_ID,
        p_start_request_fingerprint: 'a'.repeat(64),
        p_commitment: 6,
        p_exempt: false,
        p_manifest_base: { traits: ['swift'] },
      })
    );
  });

  it('cannot spend Energy for an exempt run', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: { sessionId: 'session-1', freePlay: true },
      error: null,
    });
    await finalizeRunStart(clientWithRpc(rpc), {
      playerId: 'player-1',
      sessionId: 'session-1',
      startRequestId: START_ID,
      fingerprint: 'b'.repeat(64),
      requestedCommitment: 6,
      exemptionFacts: {
        rewardless: true,
        signalObjectiveRunId: null,
        serpentWeekId: null,
      },
      energyVisible: false,
      manifestBase: { freePlay: true },
    });

    expect(rpc).toHaveBeenCalledWith(
      'finalize_run_continuity_start',
      expect.objectContaining({ p_commitment: 0, p_exempt: true })
    );
  });

  it('maps a replay with different settings to a stable conflict', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'start_request_conflict' },
    });
    await expect(
      finalizeRunStart(clientWithRpc(rpc), {
        playerId: 'player-1',
        sessionId: 'session-1',
        startRequestId: START_ID,
        fingerprint: 'c'.repeat(64),
        requestedCommitment: 1,
        exemptionFacts: {
          rewardless: false,
          signalObjectiveRunId: null,
          serpentWeekId: null,
        },
        energyVisible: true,
        manifestBase: {},
      })
    ).rejects.toMatchObject<Partial<RunContinuityError>>({
      reason: 'request_conflict',
    });
  });

  it('activates only through the service RPC and returns a non-resumable active run', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        id: 'session-1',
        start_request_id: START_ID,
        start_request_fingerprint: 'd'.repeat(64),
        start_manifest: { sessionId: 'session-1' },
        continuity_phase: 'active',
        continuity_activated_at: '2026-07-31T10:00:01.000Z',
        continuity_lease_epoch: 1,
        started_at: '2026-07-31T10:00:00.000Z',
        server_started_at: '2026-07-31T10:00:00.000Z',
        energy_committed: 6,
      },
      error: null,
    });

    await expect(
      activateRun(clientWithRpc(rpc), 'player-1', 'session-1')
    ).resolves.toMatchObject({
      phase: 'active',
      energyCommitted: 6,
      canContinue: false,
      requiresAbandon: true,
      leaseEpoch: 1,
    });
    expect(rpc).toHaveBeenCalledWith(
      'activate_run_continuity',
      expect.objectContaining({
        p_player_id: 'player-1',
        p_session_id: 'session-1',
        p_lease_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      })
    );
  });

  it('binds live checkpoints to the server-issued simulation and time budget', () => {
    const now = Date.now();
    const game = new SnakeGameLogic({
      ruleset: RULESETS.CYBER,
      simulationSeed: 'server-seed',
    });
    game.start();
    const checkpoint = game.exportCheckpoint(now);
    const manifest = {
      sessionId: 'session-1',
      simulation: { seed: 'server-seed', version: 1 },
      runSnake: { dynasty: 'CYBER' },
    };

    expect(
      validateRunCheckpoint(checkpoint, {
        manifest,
        startedAt: new Date(now - 1_000).toISOString(),
        now,
      })
    ).toBe(checkpoint);

    expect(() =>
      validateRunCheckpoint(
        { ...checkpoint, rng: { ...checkpoint.rng, seed: checkpoint.rng.seed + 1 } },
        { manifest, startedAt: new Date(now - 1_000).toISOString(), now }
      )
    ).toThrow('does not match its simulation');

    expect(() =>
      validateRunCheckpoint(
        {
          ...checkpoint,
          rng: {
            ...checkpoint.rng,
            state: (checkpoint.rng.state + 1) >>> 0,
          },
        },
        { manifest, startedAt: new Date(now - 1_000).toISOString(), now }
      )
    ).toThrow('does not match its simulation');

    expect(() =>
      validateRunCheckpoint(
        {
          ...checkpoint,
          config: { ...checkpoint.config, traits: ['patient'] },
        },
        { manifest, startedAt: new Date(now - 1_000).toISOString(), now }
      )
    ).toThrow('does not match its start manifest');

    expect(() =>
      validateRunCheckpoint(
        {
          ...checkpoint,
          privateState: { ...checkpoint.privateState, elapsedMs: 60_000 },
        },
        { manifest, startedAt: new Date(now - 1_000).toISOString(), now }
      )
    ).toThrow('server time bound');
  });

  it('refuses a checkpoint that rewinds accepted progress', () => {
    const now = Date.now();
    const game = new SnakeGameLogic({
      ruleset: RULESETS.PRIMAL,
      simulationSeed: 'monotonic-seed',
    });
    game.start();
    const previous = game.exportCheckpoint(now);
    const rewind = {
      ...previous,
      privateState: { ...previous.privateState, elapsedMs: 0 },
    };
    expect(() =>
      validateRunCheckpoint(rewind, {
        manifest: {
          sessionId: 'session-1',
          simulation: { seed: 'monotonic-seed', version: 1 },
          runSnake: { dynasty: 'PRIMAL' },
        },
        startedAt: new Date(now - 1_000).toISOString(),
        now,
        previous: {
          ...previous,
          privateState: { ...previous.privateState, elapsedMs: 500 },
        },
      })
    ).toThrow('rewind accepted progress');
  });

  it('lets only the newest in-memory lease terminalize an activated run', () => {
    const lease = 'exclusive-run-lease-token-with-enough-entropy';
    const row = {
      start_request_id: START_ID,
      continuity_phase: 'active',
      continuity_lease_hash: createHash('sha256').update(lease).digest('hex'),
    };
    expect(() => assertTerminalRunLease(row, lease)).not.toThrow();
    expect(() => assertTerminalRunLease(row, `${lease}-stale`)).toThrow(
      'open in a newer session'
    );
    expect(() =>
      assertTerminalRunLease(
        { start_request_id: null, continuity_phase: null },
        null
      )
    ).not.toThrow();
  });
});
