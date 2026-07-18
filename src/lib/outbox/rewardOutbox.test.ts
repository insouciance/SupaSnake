/**
 * Reward Outbox tests - enqueue/dedupe/cap/expiry/replay
 */

import {
  enqueueReward,
  readOutbox,
  pruneOutbox,
  clearOutbox,
  replayRewardOutbox,
  REWARD_OUTBOX_KEY,
  REWARD_OUTBOX_MAX_ENTRIES,
  REWARD_OUTBOX_MAX_AGE_MS,
  type RewardOutboxEntry,
} from './rewardOutbox';

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

function mockResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
  } as unknown as Response;
}

describe('rewardOutbox', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.restoreAllMocks();
  });

  describe('enqueueReward', () => {
    it('stores an entry readable via readOutbox', () => {
      const entry = makeEntry();
      enqueueReward(entry);

      expect(readOutbox()).toEqual([entry]);
    });

    it('dedupes by sessionId, keeping the latest payload', () => {
      enqueueReward(makeEntry({ score: 5 }));
      enqueueReward(makeEntry({ score: 9 }));

      const queue = readOutbox();
      expect(queue).toHaveLength(1);
      expect(queue[0].score).toBe(9);
    });

    it('caps the queue, dropping the oldest entries first', () => {
      for (let i = 0; i < REWARD_OUTBOX_MAX_ENTRIES + 5; i++) {
        enqueueReward(makeEntry({ sessionId: `session-${i}` }));
      }

      const queue = readOutbox();
      expect(queue).toHaveLength(REWARD_OUTBOX_MAX_ENTRIES);
      expect(queue[0].sessionId).toBe('session-5');
      expect(queue[queue.length - 1].sessionId).toBe(
        `session-${REWARD_OUTBOX_MAX_ENTRIES + 4}`
      );
    });

    it('ignores malformed entries', () => {
      enqueueReward({ sessionId: '', score: 1 } as unknown as RewardOutboxEntry);
      expect(readOutbox()).toEqual([]);
    });
  });

  describe('readOutbox', () => {
    it('returns [] for corrupted storage payloads', () => {
      window.localStorage.setItem(REWARD_OUTBOX_KEY, 'not-json{');
      expect(readOutbox()).toEqual([]);
    });

    it('filters out invalid entries inside a valid array', () => {
      const good = makeEntry();
      window.localStorage.setItem(
        REWARD_OUTBOX_KEY,
        JSON.stringify([good, { junk: true }, null])
      );
      expect(readOutbox()).toEqual([good]);
    });
  });

  describe('pruneOutbox', () => {
    it('drops entries older than 7 days and keeps fresh ones', () => {
      const now = Date.now();
      const stale = makeEntry({
        sessionId: 'stale',
        timestamp: now - REWARD_OUTBOX_MAX_AGE_MS - 1000,
      });
      const fresh = makeEntry({ sessionId: 'fresh', timestamp: now - 1000 });
      window.localStorage.setItem(REWARD_OUTBOX_KEY, JSON.stringify([stale, fresh]));

      const remaining = pruneOutbox(undefined, now);

      expect(remaining).toEqual([fresh]);
      expect(readOutbox()).toEqual([fresh]);
    });
  });

  describe('clearOutbox', () => {
    it('empties the queue', () => {
      enqueueReward(makeEntry());
      clearOutbox();
      expect(readOutbox()).toEqual([]);
      expect(window.localStorage.getItem(REWARD_OUTBOX_KEY)).toBeNull();
    });
  });

  describe('replayRewardOutbox', () => {
    it('does nothing when the queue is empty', async () => {
      const fetchFn = jest.fn();
      const result = await replayRewardOutbox('token', undefined, fetchFn);

      expect(fetchFn).not.toHaveBeenCalled();
      expect(result).toEqual({ replayed: 0, dropped: 0, remaining: 0 });
    });

    it('POSTs each entry as an end action with the given token', async () => {
      const entry = makeEntry();
      enqueueReward(entry);
      const fetchFn = jest.fn().mockResolvedValue(mockResponse(200));

      const result = await replayRewardOutbox('token-abc', undefined, fetchFn);

      expect(fetchFn).toHaveBeenCalledWith(
        '/api/game/session',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer token-abc' }),
        })
      );
      const body = JSON.parse(fetchFn.mock.calls[0][1].body);
      expect(body).toEqual({
        action: 'end',
        sessionId: entry.sessionId,
        score: entry.score,
        dna_earned: entry.dna_earned,
        duration_seconds: entry.duration_seconds,
        died: true,
        victory: false,
      });
      expect(result).toEqual({ replayed: 1, dropped: 0, remaining: 0 });
      expect(readOutbox()).toEqual([]);
    });

    it('includes Design v2 fields (food_count, extracted) when present', async () => {
      const entry = makeEntry({
        sessionId: 'v2-run',
        food_count: 18,
        extracted: true,
      });
      enqueueReward(entry);
      const fetchFn = jest.fn().mockResolvedValue(mockResponse(200));

      await replayRewardOutbox('token', undefined, fetchFn);

      const body = JSON.parse(fetchFn.mock.calls[0][1].body);
      expect(body).toEqual({
        action: 'end',
        sessionId: 'v2-run',
        score: entry.score,
        dna_earned: entry.dna_earned,
        duration_seconds: entry.duration_seconds,
        food_count: 18,
        extracted: true,
        died: false, // extracted runs are not deaths
        victory: false,
      });
    });

    it('marks non-extracted v2 entries as died', async () => {
      enqueueReward(makeEntry({ sessionId: 'v2-death', food_count: 7, extracted: false }));
      const fetchFn = jest.fn().mockResolvedValue(mockResponse(200));

      await replayRewardOutbox('token', undefined, fetchFn);

      const body = JSON.parse(fetchFn.mock.calls[0][1].body);
      expect(body.died).toBe(true);
      expect(body.extracted).toBe(false);
      expect(body.food_count).toBe(7);
    });

    it('removes entries the server reports as already ended (409)', async () => {
      enqueueReward(makeEntry());
      const fetchFn = jest.fn().mockResolvedValue(mockResponse(409));

      const result = await replayRewardOutbox('token', undefined, fetchFn);

      expect(result).toEqual({ replayed: 0, dropped: 1, remaining: 0 });
      expect(readOutbox()).toEqual([]);
    });

    it('drops permanently rejected entries (404)', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      enqueueReward(makeEntry());
      const fetchFn = jest.fn().mockResolvedValue(mockResponse(404));

      const result = await replayRewardOutbox('token', undefined, fetchFn);

      expect(result).toEqual({ replayed: 0, dropped: 1, remaining: 0 });
      expect(readOutbox()).toEqual([]);
    });

    it('keeps entries on 401 for a retry with a fresh token', async () => {
      const entry = makeEntry();
      enqueueReward(entry);
      const fetchFn = jest.fn().mockResolvedValue(mockResponse(401));

      const result = await replayRewardOutbox('expired-token', undefined, fetchFn);

      expect(result).toEqual({ replayed: 0, dropped: 0, remaining: 1 });
      expect(readOutbox()).toEqual([entry]);
    });

    it('keeps entries on server errors (500)', async () => {
      const entry = makeEntry();
      enqueueReward(entry);
      const fetchFn = jest.fn().mockResolvedValue(mockResponse(500));

      const result = await replayRewardOutbox('token', undefined, fetchFn);

      expect(result).toEqual({ replayed: 0, dropped: 0, remaining: 1 });
      expect(readOutbox()).toEqual([entry]);
    });

    it('keeps entries on network failure', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const entry = makeEntry();
      enqueueReward(entry);
      const fetchFn = jest.fn().mockRejectedValue(new Error('offline'));

      const result = await replayRewardOutbox('token', undefined, fetchFn);

      expect(result).toEqual({ replayed: 0, dropped: 0, remaining: 1 });
      expect(readOutbox()).toEqual([entry]);
    });

    it('prunes expired entries before replaying', async () => {
      const now = Date.now();
      window.localStorage.setItem(
        REWARD_OUTBOX_KEY,
        JSON.stringify([
          makeEntry({
            sessionId: 'stale',
            timestamp: now - REWARD_OUTBOX_MAX_AGE_MS - 1000,
          }),
        ])
      );
      const fetchFn = jest.fn();

      const result = await replayRewardOutbox('token', undefined, fetchFn);

      expect(fetchFn).not.toHaveBeenCalled();
      expect(result).toEqual({ replayed: 0, dropped: 0, remaining: 0 });
    });

    it('processes a mixed queue independently per entry', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      enqueueReward(makeEntry({ sessionId: 'ok' }));
      enqueueReward(makeEntry({ sessionId: 'dupe' }));
      enqueueReward(makeEntry({ sessionId: 'flaky' }));
      const fetchFn = jest
        .fn()
        .mockResolvedValueOnce(mockResponse(200))
        .mockResolvedValueOnce(mockResponse(409))
        .mockResolvedValueOnce(mockResponse(503));

      const result = await replayRewardOutbox('token', undefined, fetchFn);

      expect(result).toEqual({ replayed: 1, dropped: 1, remaining: 1 });
      expect(readOutbox().map((e) => e.sessionId)).toEqual(['flaky']);
    });
  });
});
