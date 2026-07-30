import {
  clearOutbox,
  enqueueReward,
  pruneOutbox,
  readOutbox,
  replayRewardOutbox,
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
    });
    expect(readOutbox()).toEqual([]);
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
      }
    );
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
    });
    expect(readOutbox().map((entry) => entry.sessionId)).toEqual(['transient']);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('dropping session invalid')
    );
    consoleError.mockRestore();
  });
});
