import { describe, expect, it, jest } from '@jest/globals';
import {
  activatePreparedRun,
  createRunStartRequestId,
  fetchActiveRun,
  LatestOnlyAsyncQueue,
  matchesContinuityAuthority,
  resumeCheckpointedRun,
  saveActiveRunCheckpoint,
} from './runContinuityClient';
import { SNAKE_RULES_VERSION, type SnakeCheckpointV1 } from './SnakeGameLogic';

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
});
