import {
  clearOutbox,
  drainLegacyRewardOutbox,
  enqueueReward,
  LEGACY_REWARD_OUTBOX_KEY,
  pruneOutbox,
  readOutbox,
  replayRewardOutbox,
  REWARD_OUTBOX_ATTEMPT_TIMEOUT_MS,
  REWARD_OUTBOX_MAX_AGE_MS,
  REWARD_OUTBOX_MAX_ENTRIES,
  type RewardOutboxEntry,
} from './rewardOutbox';
import type { RunImpactEnvelope } from '@/lib/game/runImpactClient';

function makeEntry(overrides: Partial<RewardOutboxEntry> = {}): RewardOutboxEntry {
  return {
    sessionId: 'session-1',
    score: 12,
    dna_earned: 120,
    duration_seconds: 90,
    timestamp: Date.now(),
    ...overrides,
  };
}

const impact: RunImpactEnvelope = {
  version: 1,
  sessionId: 'session-1',
  settledAt: '2026-07-30T10:00:00.000Z',
  outcome: 'extracted',
  dynasty: 'PRIMAL',
  receipt: {
    validated: true,
    score: 12,
    yieldDna: 120,
    dnaCredited: 120,
    energyCommitted: 1,
    commitmentMultiplierBps: 10_000,
    generation: 1,
    personalBest: { eligible: true, before: 0, after: 12, improved: true },
  },
  impacts: [],
  featuredImpactKeys: [],
  recommendedAction: null,
};

const freePlayResult = {
  sessionId: 'session-1',
  score: 987,
  outcome: 'crashed' as const,
  dnaCredited: 0 as const,
  yieldDna: 240,
  hypotheticalDna: 60,
  valid: true,
  ascendance: { totalYield: 240 },
  genome: { v: 2 },
  playerDna: 420,
};

const freePlayResponse = {
  success: true,
  freePlay: true,
  sessionId: 'session-1',
  player: { dna: 420 },
  validation: {
    valid: true,
    adjustedDna: 0,
    score: 987,
    extracted: false,
    yieldDna: 240,
    ascendance: { totalYield: 240 },
  },
  hypotheticalDna: 60,
  genome: { v: 2 },
};

function response(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('tab-memory settlement retry queue', () => {
  beforeEach(() => {
    clearOutbox();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('deduplicates and caps without writing browser persistence', () => {
    for (let index = 0; index < REWARD_OUTBOX_MAX_ENTRIES + 5; index += 1) {
      enqueueReward(makeEntry({ sessionId: `session-${index}` }));
    }
    enqueueReward(makeEntry({ sessionId: 'session-24', score: 99 }));

    expect(readOutbox()).toHaveLength(REWARD_OUTBOX_MAX_ENTRIES);
    expect(readOutbox()[0].sessionId).toBe('session-5');
    expect(readOutbox().at(-1)?.score).toBe(99);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('drops expired memory entries', () => {
    const now = Date.now();
    enqueueReward(makeEntry({ timestamp: now - REWARD_OUTBOX_MAX_AGE_MS - 1 }));
    expect(pruneOutbox(now)).toEqual([]);
  });

  it('replays a settlement and returns its canonical impact', async () => {
    enqueueReward(makeEntry());
    const fetchFn = jest.fn().mockResolvedValue(response(200, { impact }));
    await expect(replayRewardOutbox('token', fetchFn)).resolves.toEqual({
      replayed: 1,
      dropped: 0,
      remaining: 0,
      impacts: [impact],
      freePlayResults: [],
      securedPendingSessionIds: [],
      completedWithoutImpactSessionIds: [],
      leaseConflictSessionIds: [],
      permanentlyRejectedSessionIds: [],
    });
    expect(readOutbox()).toEqual([]);
  });

  it('never submits or drops account A claims while account B is active', async () => {
    enqueueReward(makeEntry({ ownerId: 'user-a' }));
    const fetchFn = jest.fn().mockResolvedValue(response(404));

    await expect(
      replayRewardOutbox('token-b', fetchFn, 'user-b')
    ).resolves.toMatchObject({ replayed: 0, dropped: 0, remaining: 1 });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(readOutbox()).toEqual([
      expect.objectContaining({ ownerId: 'user-a', sessionId: 'session-1' }),
    ]);

    fetchFn.mockResolvedValue(response(200, { impact }));
    await expect(
      replayRewardOutbox('token-a', fetchFn, 'user-a')
    ).resolves.toMatchObject({ replayed: 1, dropped: 0, remaining: 0 });
    expect(readOutbox()).toEqual([]);
  });

  it('preserves claims queued while an older replay is in flight', async () => {
    enqueueReward(makeEntry({ ownerId: 'user-a', sessionId: 'session-old' }));
    let resolveFirst: ((value: Response) => void) | undefined;
    const fetchFn = jest.fn().mockImplementationOnce(
      () => new Promise<Response>((resolve) => { resolveFirst = resolve; })
    );

    const replay = replayRewardOutbox('token-a', fetchFn, 'user-a');
    await Promise.resolve();
    enqueueReward(makeEntry({ ownerId: 'user-a', sessionId: 'session-new' }));
    resolveFirst?.(response(200, {
      impact: { ...impact, sessionId: 'session-old' },
    }));

    await expect(replay).resolves.toMatchObject({ replayed: 1, remaining: 1 });
    expect(readOutbox()).toEqual([
      expect.objectContaining({ ownerId: 'user-a', sessionId: 'session-new' }),
    ]);
  });

  it('serializes concurrent replay requests so a claim is submitted once', async () => {
    enqueueReward(makeEntry({ ownerId: 'user-a' }));
    let resolveFirst: ((value: Response) => void) | undefined;
    const fetchFn = jest.fn().mockImplementation(
      () => new Promise<Response>((resolve) => { resolveFirst = resolve; })
    );

    const first = replayRewardOutbox('token-a', fetchFn, 'user-a');
    const second = replayRewardOutbox('token-a', fetchFn, 'user-a');
    await Promise.resolve();
    expect(fetchFn).toHaveBeenCalledTimes(1);

    resolveFirst?.(response(200, { impact }));
    await expect(first).resolves.toMatchObject({ replayed: 1, remaining: 0 });
    await expect(second).resolves.toMatchObject({ replayed: 0, remaining: 0 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('recovers impact after an already-settled response', async () => {
    enqueueReward(makeEntry());
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(response(409))
      .mockResolvedValueOnce(response(200, { impact }));
    const result = await replayRewardOutbox('token', fetchFn);
    expect(result.impacts).toEqual([impact]);
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      '/api/progression/impact?sessionId=session-1',
      {
        cache: 'no-store',
        headers: { Authorization: 'Bearer token' },
        signal: expect.any(AbortSignal),
      }
    );
  });

  it('carries an in-memory run lease into settlement without persisting it', async () => {
    const leaseToken = 'l'.repeat(64);
    enqueueReward(makeEntry({ leaseToken }));
    const fetchFn = jest.fn().mockResolvedValue(response(200, { impact }));

    await replayRewardOutbox('token', fetchFn);

    const request = fetchFn.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ leaseToken });
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('retains and submits a bounded terminal proof without client-authored facts', async () => {
    const leaseToken = 'l'.repeat(64);
    const replay = {
      fromTick: 8,
      toTick: 10,
      actionOffset: 2,
      actions: [{ tick: 9, kind: 'turn' as const, direction: 'UP' as const }],
      activeElapsedMs: 2_500,
    };
    enqueueReward(makeEntry({
      leaseToken,
      replay,
      expectedRevision: 3,
    }));
    expect(readOutbox()).toHaveLength(1);
    const fetchFn = jest.fn().mockResolvedValue(response(200, { impact }));
    await replayRewardOutbox('token', fetchFn);
    const request = fetchFn.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      action: 'terminal',
      sessionId: 'session-1',
      replay,
      expectedRevision: 3,
      leaseToken,
    });
  });

  it('retains a pre-cutover terminal proof without an active clock', () => {
    enqueueReward(makeEntry({
      leaseToken: 'l'.repeat(64),
      replay: {
        fromTick: 8,
        toTick: 10,
        actionOffset: 2,
        actions: [],
      },
      expectedRevision: 3,
    }));

    expect(readOutbox()).toHaveLength(1);
  });

  it('keeps an unacknowledged checkpoint conflict for recovery', async () => {
    const replay = {
      fromTick: 8,
      toTick: 10,
      actionOffset: 2,
      actions: [{ tick: 9, kind: 'turn' as const, direction: 'UP' as const }],
      activeElapsedMs: 2_500,
    };
    enqueueReward(makeEntry({
      leaseToken: 'l'.repeat(64),
      replay,
      expectedRevision: 3,
    }));
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(response(409, { reason: 'checkpoint_conflict' }))
      .mockResolvedValueOnce(response(404));
    await expect(replayRewardOutbox('token', fetchFn)).resolves.toMatchObject({
      replayed: 0,
      dropped: 0,
      remaining: 1,
    });
    expect(readOutbox()).toHaveLength(1);
  });

  it.each([
    ['a start-state race', { reason: 'not_prepared' }],
    ['an unknown conflict', { reason: 'future_conflict' }],
    ['an empty conflict', {}],
    ['an abandoned run', { alreadyEnded: true, endReason: 'abandoned' }],
  ])('keeps terminal proof after %s without canonical settlement', async (_label, body) => {
    enqueueReward(makeEntry({
      leaseToken: 'l'.repeat(64),
      replay: {
        fromTick: 8,
        toTick: 10,
        actionOffset: 2,
        actions: [],
        activeElapsedMs: 2_500,
      },
      expectedRevision: 3,
    }));
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(response(409, body))
      .mockResolvedValueOnce(response(404));

    await expect(replayRewardOutbox('token', fetchFn)).resolves.toMatchObject({
      replayed: 0,
      dropped: 0,
      remaining: 1,
    });
    expect(readOutbox()).toHaveLength(1);
  });

  it.each(['abandoned', 'expired', 'disconnected'])(
    'routes a session-bound %s lifecycle closure to secured recovery',
    async (endReason) => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      enqueueReward(makeEntry());
      const fetchFn = jest.fn().mockResolvedValue(response(409, {
        alreadyEnded: true,
        endReason,
        sessionId: 'session-1',
      }));

      await expect(replayRewardOutbox('token', fetchFn)).resolves.toMatchObject({
        replayed: 0,
        dropped: 1,
        remaining: 0,
        permanentlyRejectedSessionIds: ['session-1'],
      });
      expect(readOutbox()).toEqual([]);
      consoleError.mockRestore();
    }
  );

  it('accepts an explicit completed end even while its impact is unavailable', async () => {
    enqueueReward(makeEntry());
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(response(409, {
        alreadyEnded: true,
        endReason: 'completed',
        sessionId: 'session-1',
      }))
      .mockResolvedValueOnce(response(404));

    await expect(replayRewardOutbox('token', fetchFn)).resolves.toMatchObject({
      replayed: 1,
      dropped: 0,
      remaining: 0,
      completedWithoutImpactSessionIds: ['session-1'],
    });
    expect(readOutbox()).toEqual([]);
  });

  it('returns a canonical Free Play receipt from an already-completed replay', async () => {
    enqueueReward(makeEntry({ freePlay: true }));
    const fetchFn = jest.fn().mockResolvedValue(
      response(409, {
        error: 'Session already ended',
        alreadyEnded: true,
        endReason: 'completed',
        ...freePlayResponse,
      })
    );

    await expect(replayRewardOutbox('token', fetchFn)).resolves.toMatchObject({
      replayed: 1,
      remaining: 0,
      freePlayResults: [freePlayResult],
      completedWithoutImpactSessionIds: [],
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(readOutbox()).toEqual([]);
  });

  it.each([
    ['missing canonical fields', {
      success: true,
      freePlay: true,
      sessionId: 'session-1',
    }],
    ['a different session identity', {
      ...freePlayResponse,
      sessionId: 'another-session',
    }],
    ['a Career impact in place of its practice receipt', { impact }],
  ])('retains a Free Play proof after %s', async (_label, body) => {
    enqueueReward(makeEntry({ freePlay: true }));
    const fetchFn = jest.fn().mockResolvedValueOnce(response(200, body));

    await expect(replayRewardOutbox('token', fetchFn)).resolves.toMatchObject({
      replayed: 0,
      dropped: 0,
      remaining: 1,
      freePlayResults: [],
    });
    // Rewardless practice has no Career impact endpoint: a malformed result
    // stays queued instead of being laundered through an unrelated receipt.
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(readOutbox()).toHaveLength(1);
  });

  it('does not accept a free-play response for an earning claim', async () => {
    enqueueReward(makeEntry({ freePlay: false }));
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(response(200, {
        success: true,
        freePlay: true,
        sessionId: 'session-1',
      }))
      .mockResolvedValueOnce(response(404));

    await expect(replayRewardOutbox('token', fetchFn)).resolves.toMatchObject({
      replayed: 0,
      remaining: 1,
    });
    expect(readOutbox()).toHaveLength(1);
  });

  it('retains a malformed successful response without canonical settlement authority', async () => {
    enqueueReward(makeEntry());
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(response(200, {}))
      .mockResolvedValueOnce(response(404));

    await expect(replayRewardOutbox('token', fetchFn)).resolves.toMatchObject({
      replayed: 0,
      dropped: 0,
      remaining: 1,
      completedWithoutImpactSessionIds: [],
    });
    expect(readOutbox()).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['impact', { impact: { ...impact, sessionId: 'different-session' } }],
    ['durable pending', {
      accepted: true,
      pendingSettlement: true,
      clientRetryRequired: false,
      sessionId: 'different-session',
    }],
    ['completed lifecycle', {
      alreadyEnded: true,
      endReason: 'completed',
      sessionId: 'different-session',
    }],
  ])('never lets a %s response for another session acknowledge this proof', async (_label, body) => {
    enqueueReward(makeEntry());
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(response(200, body))
      .mockResolvedValueOnce(response(404));

    await expect(replayRewardOutbox('token', fetchFn)).resolves.toMatchObject({
      replayed: 0,
      dropped: 0,
      remaining: 1,
      completedWithoutImpactSessionIds: [],
    });
    expect(readOutbox()).toHaveLength(1);
  });

  it.each([408, 425, 429])('retains HTTP %s as a transient settlement attempt', async (status) => {
    enqueueReward(makeEntry());
    const fetchFn = jest.fn().mockResolvedValue(response(status));

    await expect(replayRewardOutbox('token', fetchFn)).resolves.toMatchObject({
      replayed: 0,
      dropped: 0,
      remaining: 1,
      permanentlyRejectedSessionIds: [],
    });
    expect(readOutbox()).toHaveLength(1);
  });

  it('processes only the visible owner terminal session and leaves older claims for background replay', async () => {
    enqueueReward(makeEntry({ ownerId: 'user-a', sessionId: 'older' }));
    enqueueReward(makeEntry({ ownerId: 'user-a', sessionId: 'current' }));
    enqueueReward(makeEntry({ ownerId: 'user-a', sessionId: 'newer' }));
    enqueueReward(makeEntry({ ownerId: 'user-b', sessionId: 'current' }));
    const fetchFn = jest.fn().mockResolvedValue(response(503));

    await replayRewardOutbox('token-a', fetchFn, 'user-a', 'current');

    const submittedSessions = fetchFn.mock.calls.map(([, init]) =>
      JSON.parse(String((init as RequestInit).body)).sessionId
    );
    expect(submittedSessions).toEqual(['current']);
    expect(readOutbox()).toHaveLength(4);
  });

  it('does not make a visible terminal retry join an older hung background drain', async () => {
    jest.useFakeTimers();
    try {
      enqueueReward(makeEntry({ ownerId: 'user-a', sessionId: 'older' }));
      const backgroundFetch = jest.fn(
        () => new Promise<Response>(() => {})
      );
      const backgroundReplay = replayRewardOutbox(
        'token-a',
        backgroundFetch,
        'user-a'
      );
      await Promise.resolve();
      await Promise.resolve();
      expect(backgroundFetch).toHaveBeenCalledTimes(1);

      enqueueReward(makeEntry({ ownerId: 'user-a', sessionId: 'current' }));
      const currentImpact = { ...impact, sessionId: 'current' };
      const currentFetch = jest.fn().mockResolvedValue(
        response(200, { impact: currentImpact })
      );

      await expect(
        replayRewardOutbox('token-a', currentFetch, 'user-a', 'current')
      ).resolves.toMatchObject({
        replayed: 1,
        remaining: 1,
        impacts: [currentImpact],
      });
      expect(currentFetch).toHaveBeenCalledTimes(1);
      expect(readOutbox().map((entry) => entry.sessionId)).toEqual(['older']);

      jest.advanceTimersByTime(REWARD_OUTBOX_ATTEMPT_TIMEOUT_MS);
      await expect(backgroundReplay).resolves.toMatchObject({
        replayed: 0,
        remaining: 1,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('bounds an initial request even when the injected fetch ignores AbortSignal', async () => {
    jest.useFakeTimers();
    try {
      enqueueReward(makeEntry());
      let submittedSignal: AbortSignal | undefined;
      const fetchFn = jest.fn().mockImplementation(
        (_url: string, init?: RequestInit) => {
          submittedSignal = init?.signal ?? undefined;
          return new Promise<Response>(() => {});
        }
      );

      const replay = replayRewardOutbox('token', fetchFn);
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(REWARD_OUTBOX_ATTEMPT_TIMEOUT_MS);

      await expect(replay).resolves.toMatchObject({
        replayed: 0,
        dropped: 0,
        remaining: 1,
      });
      expect(submittedSignal?.aborted).toBe(true);
      expect(readOutbox()).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('bounds a hung impact fallback after canonical completion', async () => {
    jest.useFakeTimers();
    try {
      enqueueReward(makeEntry());
      const fetchFn = jest
        .fn()
        .mockResolvedValueOnce(response(200, {
          alreadyEnded: true,
          endReason: 'completed',
          sessionId: 'session-1',
        }))
        .mockImplementationOnce(() => new Promise<Response>(() => {}));

      const replay = replayRewardOutbox('token', fetchFn);
      for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
      expect(fetchFn).toHaveBeenCalledTimes(2);
      jest.advanceTimersByTime(REWARD_OUTBOX_ATTEMPT_TIMEOUT_MS);

      await expect(replay).resolves.toMatchObject({
        replayed: 1,
        dropped: 0,
        remaining: 0,
        completedWithoutImpactSessionIds: ['session-1'],
      });
      expect(readOutbox()).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('drops a stale terminal claim when another tab owns the run lease', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    enqueueReward(makeEntry({ leaseToken: 'l'.repeat(64) }));
    const fetchFn = jest.fn().mockResolvedValue(
      response(409, { reason: 'lease_conflict' })
    );

    await expect(replayRewardOutbox('token', fetchFn)).resolves.toMatchObject({
      replayed: 0,
      dropped: 1,
      remaining: 0,
      leaseConflictSessionIds: ['session-1'],
      permanentlyRejectedSessionIds: [],
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(readOutbox()).toEqual([]);
    consoleError.mockRestore();
  });

  it('keeps transient failures and drops permanent rejection', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    enqueueReward(makeEntry({ sessionId: 'transient' }));
    enqueueReward(makeEntry({ sessionId: 'invalid' }));
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(422));
    await expect(replayRewardOutbox('token', fetchFn)).resolves.toMatchObject({
      replayed: 0,
      dropped: 1,
      remaining: 1,
      leaseConflictSessionIds: [],
      permanentlyRejectedSessionIds: ['invalid'],
    });
    expect(readOutbox().map((entry) => entry.sessionId)).toEqual(['transient']);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('dropping session invalid')
    );
    consoleError.mockRestore();
  });

  it('drains a legacy persisted run to server truth and deletes the retired key', async () => {
    window.localStorage.setItem(
      LEGACY_REWARD_OUTBOX_KEY,
      JSON.stringify([makeEntry()])
    );
    const fetchFn = jest.fn().mockResolvedValue(response(200, { impact }));

    await expect(
      drainLegacyRewardOutbox('token', window.localStorage, fetchFn)
    ).resolves.toEqual({
      replayed: 1,
      dropped: 0,
      remaining: 0,
      impacts: [impact],
      freePlayResults: [],
      securedPendingSessionIds: [],
      completedWithoutImpactSessionIds: [],
      leaseConflictSessionIds: [],
      permanentlyRejectedSessionIds: [],
    });
    expect(window.localStorage.getItem(LEGACY_REWARD_OUTBOX_KEY)).toBeNull();
    expect(readOutbox()).toEqual([]);
  });

  it('deletes retired browser state once the server durably accepts a pending run', async () => {
    window.localStorage.setItem(
      LEGACY_REWARD_OUTBOX_KEY,
      JSON.stringify([makeEntry()])
    );
    const fetchFn = jest.fn().mockResolvedValue(response(202, {
      accepted: true,
      pendingSettlement: true,
      clientRetryRequired: false,
      sessionId: 'session-1',
    }));

    await expect(
      drainLegacyRewardOutbox('token', window.localStorage, fetchFn)
    ).resolves.toEqual({
      replayed: 1,
      dropped: 0,
      remaining: 0,
      impacts: [],
      freePlayResults: [],
      securedPendingSessionIds: ['session-1'],
      completedWithoutImpactSessionIds: [],
      leaseConflictSessionIds: [],
      permanentlyRejectedSessionIds: [],
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(LEGACY_REWARD_OUTBOX_KEY)).toBeNull();
  });

  it('reports stale ownership and permanent rejection separately while draining legacy claims', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    window.localStorage.setItem(
      LEGACY_REWARD_OUTBOX_KEY,
      JSON.stringify([
        makeEntry({ sessionId: 'stale-legacy' }),
        makeEntry({ sessionId: 'invalid-legacy' }),
      ])
    );
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(response(409, { reason: 'lease_conflict' }))
      .mockResolvedValueOnce(response(422));

    await expect(
      drainLegacyRewardOutbox('token', window.localStorage, fetchFn)
    ).resolves.toEqual({
      replayed: 0,
      dropped: 2,
      remaining: 0,
      impacts: [],
      freePlayResults: [],
      securedPendingSessionIds: [],
      completedWithoutImpactSessionIds: [],
      leaseConflictSessionIds: ['stale-legacy'],
      permanentlyRejectedSessionIds: ['invalid-legacy'],
    });
    expect(window.localStorage.getItem(LEGACY_REWARD_OUTBOX_KEY)).toBeNull();
    consoleError.mockRestore();
  });

  it('never rewrites or deletes a legacy queue while settlement is transient', async () => {
    const serialized = JSON.stringify([makeEntry()]);
    window.localStorage.setItem(LEGACY_REWARD_OUTBOX_KEY, serialized);
    const fetchFn = jest.fn().mockResolvedValue(response(503));

    await expect(
      drainLegacyRewardOutbox('token', window.localStorage, fetchFn)
    ).resolves.toMatchObject({ replayed: 0, dropped: 0, remaining: 1 });
    expect(window.localStorage.getItem(LEGACY_REWARD_OUTBOX_KEY)).toBe(serialized);
  });

  it('retains an ownerless legacy claim under the wrong signed-in account', async () => {
    const serialized = JSON.stringify([makeEntry()]);
    window.localStorage.setItem(LEGACY_REWARD_OUTBOX_KEY, serialized);
    const wrongAccount = jest.fn().mockResolvedValue(response(404));

    await expect(
      drainLegacyRewardOutbox('token-b', window.localStorage, wrongAccount)
    ).resolves.toMatchObject({ replayed: 0, dropped: 0, remaining: 1 });
    expect(window.localStorage.getItem(LEGACY_REWARD_OUTBOX_KEY)).toBe(serialized);

    const originatingAccount = jest.fn().mockResolvedValue(response(200, { impact }));
    await expect(
      drainLegacyRewardOutbox('token-a', window.localStorage, originatingAccount)
    ).resolves.toMatchObject({ replayed: 1, dropped: 0, remaining: 0 });
    expect(window.localStorage.getItem(LEGACY_REWARD_OUTBOX_KEY)).toBeNull();
  });

  it('deletes an unreadable retired queue without creating replacement storage', async () => {
    window.localStorage.setItem(LEGACY_REWARD_OUTBOX_KEY, '{not-json');
    const fetchFn = jest.fn();

    await expect(
      drainLegacyRewardOutbox('token', window.localStorage, fetchFn)
    ).resolves.toEqual({
      replayed: 0,
      dropped: 0,
      remaining: 0,
      impacts: [],
      freePlayResults: [],
      securedPendingSessionIds: [],
      completedWithoutImpactSessionIds: [],
      leaseConflictSessionIds: [],
      permanentlyRejectedSessionIds: [],
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(LEGACY_REWARD_OUTBOX_KEY)).toBeNull();
  });

  it('coalesces concurrent default-browser drains', async () => {
    window.localStorage.setItem(
      LEGACY_REWARD_OUTBOX_KEY,
      JSON.stringify([makeEntry()])
    );
    let resolveFetch: ((value: Response) => void) | undefined;
    global.fetch = jest.fn().mockImplementation(
      () => new Promise<Response>((resolve) => { resolveFetch = resolve; })
    ) as jest.Mock;

    const first = drainLegacyRewardOutbox('token');
    const second = drainLegacyRewardOutbox('token');
    expect(first).toBe(second);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    resolveFetch?.(response(200, { impact }));
    await expect(first).resolves.toMatchObject({ replayed: 1, remaining: 0 });
    expect(window.localStorage.getItem(LEGACY_REWARD_OUTBOX_KEY)).toBeNull();
  });
});
