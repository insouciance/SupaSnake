/** @jest-environment node */

const mockCaptureException = jest.fn();
const mockLoadImpact = jest.fn();
const mockPersistImpact = jest.fn();
const mockBuildImpact = jest.fn((input: Record<string, unknown>) => ({
  version: 1,
  ...input,
}));
const mockSettleSignal = jest.fn();

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));
jest.mock('@/lib/server/runImpact', () => ({
  loadRunImpactEnvelope: (...args: unknown[]) => mockLoadImpact(...args),
  persistRunImpactEnvelope: (...args: unknown[]) => mockPersistImpact(...args),
  buildRunImpactEnvelope: (...args: [Record<string, unknown>]) =>
    mockBuildImpact(...args),
  isMissingRunImpactInfra: (error: { code?: string; message?: string } | null) =>
    Boolean(
      error &&
        (['42P01', 'PGRST205'].includes(error.code ?? '') ||
          /run_impact_receipts/i.test(error.message ?? ''))
    ),
}));
jest.mock('@/lib/server/signal', () => ({
  settleSignalAttemptForSession: (...args: unknown[]) => mockSettleSignal(...args),
}));

import {
  adoptPendingGameSessionEnds,
  resumeOrRecoverRunImpact,
  settleDurableRunProgression,
} from './gameProgressionSettlement';

type RpcResult = { data: unknown; error: null | { code?: string; message: string } };

const player = {
  dna: 120,
  total_games_played: 4,
  high_score: 900,
  total_dna_earned: 120,
  breeds_completed: 1,
};

function successResult(fn: string): RpcResult {
  if (fn === 'settle_game_session_reward_from_snapshot') {
    return { data: { applied: true }, error: null };
  }
  if (fn === 'settle_game_session_progression_core') {
    return {
      data: {
        reward: {
          personal_best: {
            eligible: true,
            before: 500,
            after: 900,
            improved: true,
          },
        },
        snapshot: {
          settledAt: '2026-07-30T12:00:00.000Z',
          dynasty: 'PRIMAL',
          extracted: true,
          died: false,
          validated: true,
          score: 900,
          yieldDna: 100,
          dnaCredited: 120,
          energyCommitted: 1,
          commitmentMultiplierBps: 10_000,
          generation: 3,
          snakeId: 'snake-1',
        },
        player,
        codex: null,
        mastery: null,
        ladder: null,
        streak: null,
        records: null,
      },
      error: null,
    };
  }
  if (fn === 'prepare_game_session_signal_stage') {
    return { data: { captured: true }, error: null };
  }
  if (fn === 'capture_game_session_signal_result') {
    return { data: { player, signal: null }, error: null };
  }
  if (fn === 'capture_game_session_clan_result') {
    return { data: { clan: null }, error: null };
  }
  return { data: null, error: null };
}

function client(
  overrides: Partial<Record<string, RpcResult>> = {}
) {
  const rpc = jest.fn(async (fn: string) => overrides[fn] ?? successResult(fn));
  return { rpc } as unknown as Parameters<typeof settleDurableRunProgression>[0] & {
    rpc: jest.Mock;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadImpact.mockResolvedValue({ status: 'absent' });
  mockPersistImpact.mockImplementation(async (_client, _playerId, impact) => ({
    status: 'persisted',
    impact,
  }));
  mockSettleSignal.mockResolvedValue(null);
});

describe('durable run progression orchestration', () => {
  it('settles base first, completes every durable stage, then exposes one receipt', async () => {
    const supabase = client();
    const result = await settleDurableRunProgression(
      supabase,
      'player-1',
      'session-1'
    );

    expect(result.ok).toBe(true);
    expect(supabase.rpc.mock.calls.map(([fn]) => fn)).toEqual([
      'settle_game_session_reward_from_snapshot',
      'settle_game_session_progression_core',
      'prepare_game_session_signal_stage',
      'capture_game_session_signal_result',
      'capture_game_session_clan_result',
    ]);
    expect(mockPersistImpact).toHaveBeenCalledTimes(1);
  });

  it('still attempts Signal and clan when core is temporarily unavailable', async () => {
    const supabase = client({
      settle_game_session_progression_core: {
        data: null,
        error: { message: 'serialization failure' },
      },
    });
    const result = await settleDurableRunProgression(
      supabase,
      'player-1',
      'session-1'
    );

    expect(result.ok).toBe(false);
    expect(supabase.rpc).toHaveBeenCalledWith(
      'capture_game_session_signal_result',
      expect.anything()
    );
    expect(supabase.rpc).toHaveBeenCalledWith(
      'capture_game_session_clan_result',
      expect.anything()
    );
    expect(mockPersistImpact).not.toHaveBeenCalled();
  });

  it('does not run auxiliary stages before the exactly-once base reward exists', async () => {
    const supabase = client({
      settle_game_session_reward_from_snapshot: {
        data: null,
        error: { message: 'database unavailable' },
      },
    });
    const result = await settleDurableRunProgression(
      supabase,
      'player-1',
      'session-1'
    );

    expect(result.ok).toBe(false);
    expect(supabase.rpc.mock.calls.map(([fn]) => fn)).toEqual([
      'settle_game_session_reward_from_snapshot',
    ]);
  });

  it('does not let a Signal failure suppress clan capture', async () => {
    const supabase = client({
      prepare_game_session_signal_stage: {
        data: null,
        error: { message: 'signal temporarily unavailable' },
      },
    });
    const result = await settleDurableRunProgression(
      supabase,
      'player-1',
      'session-1'
    );

    expect(result.ok).toBe(false);
    expect(supabase.rpc).toHaveBeenCalledWith(
      'capture_game_session_clan_result',
      expect.anything()
    );
  });

  it('does not let a clan failure suppress the completed Signal stage', async () => {
    const supabase = client({
      capture_game_session_clan_result: {
        data: null,
        error: { message: 'clan temporarily unavailable' },
      },
    });
    const result = await settleDurableRunProgression(
      supabase,
      'player-1',
      'session-1'
    );

    expect(result.ok).toBe(false);
    expect(supabase.rpc).toHaveBeenCalledWith(
      'capture_game_session_signal_result',
      expect.anything()
    );
  });

  it('keeps the receipt hidden when persistence fails after every stage', async () => {
    mockPersistImpact.mockResolvedValue({
      status: 'unavailable',
      error: new Error('receipt store unavailable'),
    });
    const supabase = client();
    const result = await settleDurableRunProgression(
      supabase,
      'player-1',
      'session-1'
    );

    expect(result.ok).toBe(false);
  });

  it('fails closed on a malformed settlement timestamp', async () => {
    const malformed = successResult('settle_game_session_progression_core');
    ((malformed.data as Record<string, unknown>).snapshot as Record<string, unknown>)
      .settledAt = 'not-a-date';
    const supabase = client({ settle_game_session_progression_core: malformed });

    const result = await settleDurableRunProgression(
      supabase,
      'player-1',
      'session-1'
    );
    expect(result.ok).toBe(false);
    expect(mockPersistImpact).not.toHaveBeenCalled();
  });
});

describe('store-before-adopt recovery', () => {
  it('returns an existing canonical receipt without invoking any settlement RPC', async () => {
    mockLoadImpact.mockResolvedValue({ status: 'found', impact: { sessionId: 'session-1' } });
    const supabase = client();

    const result = await resumeOrRecoverRunImpact(
      supabase,
      'player-1',
      'session-1'
    );
    expect(result.status).toBe('found');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('adopts a staged server result before recovering its receipt', async () => {
    const supabase = client({
      get_pending_game_session_end: {
        data: { state: 'staged' },
        error: null,
      },
      adopt_pending_game_session_end: {
        data: { accepted: true, state: 'adopted' },
        error: null,
      },
    });

    const result = await resumeOrRecoverRunImpact(
      supabase,
      'player-1',
      'session-1'
    );
    expect(result.status).toBe('found');
    const calls = supabase.rpc.mock.calls.map(([fn]) => fn);
    expect(calls.indexOf('adopt_pending_game_session_end')).toBeGreaterThan(-1);
    expect(calls.indexOf('settle_game_session_reward_from_snapshot')).toBeGreaterThan(
      calls.indexOf('adopt_pending_game_session_end')
    );
  });

  it('reports schema-060 staged debt as pending when the adopter is unavailable', async () => {
    mockLoadImpact.mockResolvedValue({
      status: 'unavailable',
      error: {
        code: '42P01',
        message: 'relation run_impact_receipts does not exist',
      },
    });
    const supabase = client({
      get_pending_game_session_end: {
        data: { state: 'staged' },
        error: null,
      },
      adopt_pending_game_session_end: {
        data: null,
        error: {
          code: 'PGRST202',
          message: 'Could not find adopt_pending_game_session_end',
        },
      },
    });

    const result = await resumeOrRecoverRunImpact(
      supabase,
      'player-1',
      'session-1'
    );
    expect(result.status).toBe('pending');
    expect(supabase.rpc).not.toHaveBeenCalledWith(
      'settle_game_session_reward_from_snapshot',
      expect.anything()
    );
  });

  it('runs a fair bounded adopter batch only when the Career capability is ready', async () => {
    const supabase = client({
      get_career_settlement_capability: {
        data: { status: 'ready', bridgeVersion: 1, careerVersion: 1 },
        error: null,
      },
      list_pending_game_session_ends: {
        data: [
          { player_id: 'player-a', session_id: 'session-a' },
          { player_id: 'player-b', session_id: 'session-b' },
        ],
        error: null,
      },
      adopt_pending_game_session_end: {
        data: { accepted: true, state: 'adopted' },
        error: null,
      },
    });

    const summary = await adoptPendingGameSessionEnds(supabase, 2);
    expect(summary).toMatchObject({
      phase: 'ready',
      scanned: 2,
      adopted: 2,
      failed: 0,
    });
  });

  it('does not attempt adoption while schema 060 is the active bridge phase', async () => {
    const supabase = client({
      get_career_settlement_capability: {
        data: { status: 'pending', bridgeVersion: 1, careerVersion: null },
        error: null,
      },
    });
    const summary = await adoptPendingGameSessionEnds(supabase, 2);

    expect(summary).toMatchObject({ phase: 'bridge', scanned: 0, adopted: 0 });
    expect(supabase.rpc).not.toHaveBeenCalledWith(
      'list_pending_game_session_ends',
      expect.anything()
    );
  });
});
