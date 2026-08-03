import { describe, expect, it, jest } from '@jest/globals';
import {
  activatePreparedRun,
  buildTerminalReplayProof,
  classifyActiveCheckpointFailure,
  classifyActiveCheckpointReceipt,
  classifyTerminalRecoveryResponse,
  createRunStartRequestId,
  fetchActiveRun,
  LatestOnlyAsyncQueue,
  matchesContinuityAuthority,
  retryPreparingRunStart,
  RunContinuityClientError,
  resumeCheckpointedRun,
  saveActiveRunCheckpoint,
} from './runContinuityClient';
import { SNAKE_RULES_VERSION, type SnakeCheckpointV1 } from './SnakeGameLogic';
import { GENOME_V2_INTERACTION_PHYSICAL_RELIC } from '@/shared/game/genomeV2';

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('run continuity client', () => {
  it('creates RFC-4122-shaped start IDs without browser persistence', () => {
    expect(createRunStartRequestId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('builds only the terminal suffix anchored to the accepted checkpoint', () => {
    const accepted = {
      ticks: 4,
      actions: [{ tick: 2, kind: 'turn' as const, direction: 'UP' as const }],
    };
    const terminal = {
      ticks: 6,
      actions: [
        ...accepted.actions,
        { tick: 5, kind: 'turn' as const, direction: 'LEFT' as const },
      ],
    };
    expect(buildTerminalReplayProof(accepted, terminal, 1_250)).toEqual({
      fromTick: 4,
      toTick: 6,
      actionOffset: 1,
      actions: [{ tick: 5, kind: 'turn', direction: 'LEFT' }],
      activeElapsedMs: 1_250,
    });
  });

  it('refuses terminal proof clocks that are negative or non-integral', () => {
    const trace = { ticks: 0, actions: [] };
    expect(buildTerminalReplayProof(trace, trace, -1)).toBeNull();
    expect(buildTerminalReplayProof(trace, trace, 1.5)).toBeNull();
  });

  it('classifies only explicit durable terminal recovery responses', () => {
    expect(classifyTerminalRecoveryResponse(202, {
      accepted: true,
      pendingSettlement: true,
      clientRetryRequired: false,
      sessionId: 'run-1',
    }, 'run-1')).toBe('settling');
    expect(classifyTerminalRecoveryResponse(409, {
      alreadyEnded: true,
      sessionId: 'run-1',
      impact: { sessionId: 'run-1' },
    }, 'run-1')).toBe('settling');
    expect(classifyTerminalRecoveryResponse(409, {
      alreadyEnded: true,
      endReason: 'completed',
      sessionId: 'run-1',
    }, 'run-1')).toBe('completed');
    expect(classifyTerminalRecoveryResponse(409, {
      alreadyEnded: true,
      endReason: 'abandoned',
      sessionId: 'run-1',
    }, 'run-1')).toBe('recover');
    expect(classifyTerminalRecoveryResponse(409, {
      alreadyEnded: true,
      sessionId: 'run-1',
    }, 'run-1')).toBe('retry');
    expect(classifyTerminalRecoveryResponse(
      200,
      { validation: {}, sessionId: 'run-1' },
      'run-1'
    )).toBe('retry');
    expect(classifyTerminalRecoveryResponse(200, {
      success: true,
      freePlay: true,
      sessionId: 'run-1',
    }, 'run-1', true)).toBe('completed');
    expect(classifyTerminalRecoveryResponse(409, {
      alreadyEnded: true,
      endReason: 'completed',
      sessionId: 'other-run',
    }, 'run-1')).toBe('retry');
    expect(classifyTerminalRecoveryResponse(409, {
      reason: 'checkpoint_conflict',
    }, 'run-1')).toBe('retry');
  });

  it('retries only checkpoint failures without an authoritative rejection', () => {
    expect(classifyActiveCheckpointFailure(new Error('offline')))
      .toBe('retryable_transport');
    expect(classifyActiveCheckpointFailure(new RunContinuityClientError(
      'Run checkpoints are temporarily unavailable.',
      'unavailable',
      503
    ))).toBe('retryable_transport');
    expect(classifyActiveCheckpointFailure(new RunContinuityClientError(
      'Upstream failed before returning a checkpoint receipt.',
      null,
      502
    ))).toBe('retryable_transport');
  });

  it('classifies a superseded checkpoint lease separately', () => {
    expect(classifyActiveCheckpointFailure(new RunContinuityClientError(
      'This run is open in a newer session.',
      'lease_conflict',
      409
    ))).toBe('stale_lease');
  });

  it.each([
    ['invalid_checkpoint', 400],
    ['checkpoint_conflict', 409],
    ['not_prepared', 409],
    ['not_found', 404],
  ])('requires server-checkpoint recovery for %s', (reason, status) => {
    expect(classifyActiveCheckpointFailure(new RunContinuityClientError(
      'The local checkpoint cannot continue authoritatively.',
      reason,
      status
    ))).toBe('deterministic_rejection');
  });

  it('fails closed to server recovery for an unknown non-retryable HTTP rejection', () => {
    expect(classifyActiveCheckpointFailure(new RunContinuityClientError(
      'Authentication must be refreshed.',
      null,
      401
    ))).toBe('deterministic_rejection');
  });

  it('parses a durable terminal phase instead of making it legacy', async () => {
    const fetcher = jest.fn(async () => response({
      activeRun: {
        sessionId: 'run-terminal',
        phase: 'terminal',
        startedAt: '2026-07-31T08:00:00Z',
        activatedAt: '2026-07-31T08:00:02Z',
        energyCommitted: 6,
        freePlay: true,
        canContinue: false,
        requiresAbandon: false,
        manifest: null,
        checkpoint: null,
        checkpointRevision: 4,
        checkpointSavedAt: '2026-07-31T08:05:00Z',
        leaseToken: null,
        leaseEpoch: 1,
      },
    })) as unknown as typeof fetch;
    await expect(fetchActiveRun('token', fetcher)).resolves.toMatchObject({
      phase: 'terminal',
      freePlay: true,
      requiresAbandon: false,
    });
  });

  it('rejects late recovery from another auth or run session', () => {
    expect(matchesContinuityAuthority('token-a', 'token-a')).toBe(true);
    expect(matchesContinuityAuthority('token-a', 'token-b')).toBe(false);
    expect(matchesContinuityAuthority('token-a', null)).toBe(false);
    expect(
      matchesContinuityAuthority('token-a', 'token-a', 'run-a', 'run-a')
    ).toBe(true);
    expect(
      matchesContinuityAuthority('token-a', 'token-a', 'run-a', 'run-b')
    ).toBe(false);
    expect(
      matchesContinuityAuthority(
        'expired-token',
        'refreshed-token',
        'run-a',
        'run-a',
        'user-a',
        'user-a'
      )
    ).toBe(true);
    expect(
      matchesContinuityAuthority(
        'token-a',
        'token-b',
        'run-a',
        'run-a',
        'user-a',
        'user-b'
      )
    ).toBe(false);
  });

  it('reads a prepared server manifest', async () => {
    const fetcher = jest.fn(async () =>
      response({
        activeRun: {
          sessionId: 'run-1',
          phase: 'prepared',
          startedAt: '2026-07-31T08:00:00Z',
          activatedAt: null,
          energyCommitted: 6,
          canContinue: true,
          requiresAbandon: false,
          manifest: { sessionId: 'run-1', simulation: { seed: 'seed', version: 1 } },
          checkpoint: null,
          checkpointRevision: 0,
          checkpointSavedAt: null,
          leaseToken: null,
          leaseEpoch: 0,
        },
      })
    ) as unknown as typeof fetch;

    const active = await fetchActiveRun('token', fetcher);
    expect(active?.phase).toBe('prepared');
    expect(active?.manifest?.sessionId).toBe('run-1');
    expect(fetcher).toHaveBeenCalledWith(
      '/api/game/session',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('retains the physical-relic capability in a recoverable preparing intent', async () => {
    const fetcher = jest.fn(async () => response({
      activeRun: {
        sessionId: 'run-preparing',
        phase: 'preparing',
        startedAt: '2026-08-03T08:00:00Z',
        activatedAt: null,
        energyCommitted: 0,
        canContinue: true,
        requiresAbandon: false,
        manifest: null,
        checkpoint: null,
        checkpointRevision: 0,
        checkpointSavedAt: null,
        leaseToken: null,
        leaseEpoch: 0,
        startIntent: {
          v: 1,
          startRequestId: '2f515f00-908b-4f7d-86fb-721db70fed83',
          mode: 'earn',
          snakeId: 'snake-primal-1',
          energyCommitment: 6,
          confirmMaxEnergy: true,
          signalObjectiveId: null,
          ladderRung: null,
          genomeInteractionVersion: GENOME_V2_INTERACTION_PHYSICAL_RELIC,
        },
      },
    })) as unknown as typeof fetch;

    await expect(fetchActiveRun('token', fetcher)).resolves.toMatchObject({
      startIntent: {
        genomeInteractionVersion: GENOME_V2_INTERACTION_PHYSICAL_RELIC,
      },
    });
  });

  it('repairs a preparing shell with its exact server-stored start intent', async () => {
    const intent = {
      v: 1 as const,
      startRequestId: '2f515f00-908b-4f7d-86fb-721db70fed83',
      mode: 'signal' as const,
      snakeId: 'snake-cosmic-1',
      energyCommitment: 6,
      confirmMaxEnergy: true,
      signalObjectiveId: 'signal-7',
      ladderRung: 3,
      genomeInteractionVersion: GENOME_V2_INTERACTION_PHYSICAL_RELIC,
    };
    const fetcher = jest.fn(async (_url, init) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        action: 'start',
        startRequestId: intent.startRequestId,
        mode: 'signal',
        snake_id: 'snake-cosmic-1',
        energyCommitment: 6,
        confirmMaxEnergy: true,
        signalObjectiveId: 'signal-7',
        ladderRung: 3,
        genomeInteractionVersion: GENOME_V2_INTERACTION_PHYSICAL_RELIC,
      });
      return response({
        sessionId: 'run-repaired',
        simulation: { seed: 'server-seed', version: 1 },
      });
    }) as unknown as typeof fetch;

    await expect(
      retryPreparingRunStart('access-token', intent, fetcher)
    ).resolves.toMatchObject({ sessionId: 'run-repaired' });
    expect(fetcher).toHaveBeenCalledWith(
      '/api/game/session',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      })
    );
  });

  it('activates immediately before first movement', async () => {
    const opening = {
      version: 1,
      engineVersion: 'snake-engine-v1',
      rulesVersion: SNAKE_RULES_VERSION,
    } as SnakeCheckpointV1;
    const fetcher = jest.fn(async (_url, init) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        action: 'activate',
        sessionId: 'run-1',
        checkpoint: opening,
      });
      return response({
        activeRun: {
          sessionId: 'run-1',
          phase: 'active',
          startedAt: '2026-07-31T08:00:00Z',
          activatedAt: '2026-07-31T08:00:02Z',
          energyCommitted: 6,
          canContinue: true,
          requiresAbandon: false,
          manifest: { sessionId: 'run-1' },
          checkpoint: opening,
          checkpointRevision: 1,
          checkpointSavedAt: '2026-07-31T08:00:02Z',
          leaseToken: 'lease-token-that-is-long-enough-for-a-run',
          leaseEpoch: 1,
        },
      });
    }) as unknown as typeof fetch;

    await expect(activatePreparedRun('token', 'run-1', opening, fetcher)).resolves.toMatchObject({
      sessionId: 'run-1',
      phase: 'active',
    });
  });

  it('surfaces server failures instead of fabricating recoverability', async () => {
    const fetcher = jest.fn(async () =>
      response({ error: 'Run continuity is being prepared.' }, 503)
    ) as unknown as typeof fetch;
    await expect(fetchActiveRun('token', fetcher)).rejects.toThrow(
      'Run continuity is being prepared.'
    );
  });

  it('persists a checkpoint with compare-and-swap revision and keepalive support', async () => {
    const checkpoint = {
      version: 1,
      engineVersion: 'snake-engine-v1',
      rulesVersion: SNAKE_RULES_VERSION,
    } as SnakeCheckpointV1;
    const fetcher = jest.fn(async (_url, init) => {
      expect(init?.keepalive).toBe(true);
      expect(JSON.parse(String(init?.body))).toEqual({
        action: 'checkpoint',
        sessionId: 'run-1',
        expectedRevision: 3,
        checkpoint,
        leaseToken: 'lease-token-that-is-long-enough-for-a-run',
      });
      return response({
        checkpoint: { revision: 4, savedAt: '2026-07-31T09:00:00Z' },
      });
    }) as unknown as typeof fetch;

    await expect(
      saveActiveRunCheckpoint(
        'token',
        'run-1',
        3,
        checkpoint,
        'lease-token-that-is-long-enough-for-a-run',
        {
          fetcher,
          keepalive: true,
        }
      )
    ).resolves.toEqual({ revision: 4, savedAt: '2026-07-31T09:00:00Z' });
  });

  it('rotates a lease before exposing a checkpoint for continuation', async () => {
    const fetcher = jest.fn(async () =>
      response({
        activeRun: {
          sessionId: 'run-1',
          phase: 'active',
          startedAt: '2026-07-31T08:00:00Z',
          activatedAt: '2026-07-31T08:00:02Z',
          energyCommitted: 6,
          canContinue: true,
          requiresAbandon: false,
          manifest: { sessionId: 'run-1' },
          checkpoint: {
            version: 1,
            engineVersion: 'snake-engine-v1',
            rulesVersion: SNAKE_RULES_VERSION,
          },
          checkpointRevision: 4,
          checkpointSavedAt: '2026-07-31T08:05:00Z',
          leaseToken: 'new-exclusive-lease-token-that-is-long-enough',
          leaseEpoch: 2,
        },
      })
    ) as unknown as typeof fetch;
    await expect(resumeCheckpointedRun('token', 'run-1', fetcher)).resolves.toMatchObject({
      checkpointRevision: 4,
      leaseEpoch: 2,
    });
  });

  it('coalesces a burst to one in-flight and one latest full snapshot', async () => {
    const releases: Array<() => void> = [];
    const writes: number[] = [];
    const queue = new LatestOnlyAsyncQueue<number>(async (value) => {
      writes.push(value);
      await new Promise<void>((resolve) => releases.push(resolve));
    });

    const first = queue.enqueue(1);
    await Promise.resolve();
    const second = queue.enqueue(2);
    const third = queue.enqueue(3);
    expect(writes).toEqual([1]);
    releases.shift()?.();
    await first;
    await Promise.resolve();
    expect(writes).toEqual([1, 3]);
    releases.shift()?.();
    await expect(Promise.all([second, third])).resolves.toEqual([undefined, undefined]);
  });

  it('uses live authority and hold state when an automatic heartbeat resolves late', async () => {
    const authority = {
      accessToken: 'token-a',
      userId: 'user-a',
      sessionId: 'run-1',
      leaseToken: 'resumed-exclusive-lease-token',
    };
    let currentAuthority = { ...authority };
    let currentHold: 'connection' | 'stale' | 'integrity' | null = null;
    let releaseResponse: (() => void) | null = null;
    let acceptedHeartbeats = 0;

    const queue = new LatestOnlyAsyncQueue<typeof authority>(async (expected) => {
      await new Promise<void>((resolve) => {
        releaseResponse = resolve;
      });
      const disposition = classifyActiveCheckpointReceipt(
        expected,
        currentAuthority,
        currentHold
      );
      if (disposition === 'ignored') return;
      acceptedHeartbeats += 1;
      if (disposition === 'connection_recovered') {
        currentHold = null;
      }
    });

    const automaticHeartbeat = queue.enqueue(authority);
    await Promise.resolve();
    // The watchdog can fire while the automatic request is awaiting its
    // response. Receipt handling must observe this live value, not the null
    // captured when the writer began.
    currentHold = 'connection';
    releaseResponse?.();
    await automaticHeartbeat;

    expect(acceptedHeartbeats).toBe(1);
    expect(currentHold).toBeNull();

    // A response from the superseded resume lease is never a heartbeat.
    currentAuthority = {
      ...currentAuthority,
      leaseToken: 'newer-exclusive-lease-token',
    };
    expect(classifyActiveCheckpointReceipt(
      authority,
      currentAuthority,
      'connection'
    )).toBe('ignored');
  });

  it('lets a later accepted snapshot clear a non-blocking integrity status', () => {
    const authority = {
      accessToken: 'token-a',
      userId: 'user-a',
      sessionId: 'run-1',
      leaseToken: 'resumed-exclusive-lease-token',
    };
    expect(classifyActiveCheckpointReceipt(
      authority,
      authority,
      'integrity'
    )).toBe('connection_recovered');
  });

  it('keeps the hold after automatic failure and lets manual retry recover through the same queue', async () => {
    const authority = {
      accessToken: 'token-a',
      userId: 'user-a',
      sessionId: 'run-1',
      leaseToken: 'resumed-exclusive-lease-token',
    };
    let currentHold: 'connection' | 'stale' | 'integrity' | null = 'connection';
    let acceptedHeartbeats = 0;
    let failNext = true;
    const queue = new LatestOnlyAsyncQueue<typeof authority>(async (expected) => {
      if (failNext) {
        failNext = false;
        throw new Error('offline');
      }
      const disposition = classifyActiveCheckpointReceipt(
        expected,
        authority,
        currentHold
      );
      if (disposition === 'ignored') return;
      acceptedHeartbeats += 1;
      if (disposition === 'connection_recovered') currentHold = null;
    });

    await expect(queue.enqueue(authority)).rejects.toThrow('offline');
    expect(acceptedHeartbeats).toBe(0);
    expect(currentHold).toBe('connection');

    await expect(queue.enqueue(authority)).resolves.toBeUndefined();
    expect(acceptedHeartbeats).toBe(1);
    expect(currentHold).toBeNull();
  });
});
