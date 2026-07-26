import {
  TAKE_COLLECT_ENDPOINT,
  collectDailyTake,
  parseDailyTake,
} from './dailyTake';

describe('parseDailyTake', () => {
  it('returns null for the settlement the server sends today (no dailyTake)', () => {
    expect(parseDailyTake({ success: true, player: {} })).toBeNull();
  });

  it('returns null for non-objects', () => {
    expect(parseDailyTake(null)).toBeNull();
    expect(parseDailyTake(undefined)).toBeNull();
    expect(parseDailyTake('take')).toBeNull();
    expect(parseDailyTake({ dailyTake: 'yes' })).toBeNull();
  });

  it('returns null when the server says it is not the day first run', () => {
    expect(parseDailyTake({ dailyTake: { firstRunOfDay: false, amount: 100 } })).toBeNull();
    expect(parseDailyTake({ dailyTake: { amount: 100 } })).toBeNull();
  });

  it('normalises a first-run-of-day Take', () => {
    expect(
      parseDailyTake({
        dailyTake: {
          firstRunOfDay: true,
          amount: 150.7,
          streakDays: 7,
          multiplier: 1.5,
          collected: false,
        },
      })
    ).toEqual({
      firstRunOfDay: true,
      amount: 150,
      streakDays: 7,
      multiplier: 1.5,
      collected: false,
    });
  });

  it('defaults missing display fields rather than failing', () => {
    expect(parseDailyTake({ dailyTake: { firstRunOfDay: true } })).toEqual({
      firstRunOfDay: true,
      amount: 0,
      streakDays: 0,
      multiplier: 1,
      collected: false,
    });
  });

  it('rejects a negative amount', () => {
    expect(parseDailyTake({ dailyTake: { firstRunOfDay: true, amount: -50 } })).toBeNull();
  });
});

describe('collectDailyTake', () => {
  function jsonResponse(status: number, body: unknown): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as unknown as Response;
  }

  it('posts to the single sanctioned collect endpoint', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(200, { amount: 100 }));
    await collectDailyTake('token', fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(TAKE_COLLECT_ENDPOINT);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token');
  });

  it('reports the settled amount', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(200, { amount: 300 }));
    await expect(
      collectDailyTake('token', fetchImpl as unknown as typeof fetch)
    ).resolves.toEqual({ status: 'collected', amount: 300 });
  });

  it('treats a missing endpoint as a clean no-op, not an error (WP-1.04 not built)', async () => {
    for (const status of [404, 405, 501]) {
      const fetchImpl = jest.fn(async () => jsonResponse(status, { error: 'nope' }));
      await expect(
        collectDailyTake('token', fetchImpl as unknown as typeof fetch)
      ).resolves.toEqual({ status: 'unavailable' });
    }
  });

  it('reports a real server failure as an error', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(500, { error: 'boom' }));
    await expect(
      collectDailyTake('token', fetchImpl as unknown as typeof fetch)
    ).resolves.toEqual({ status: 'error' });
  });

  it('reports a network failure as an error', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('offline');
    });
    await expect(
      collectDailyTake('token', fetchImpl as unknown as typeof fetch)
    ).resolves.toEqual({ status: 'error' });
  });

  it('accepts a 2xx whose body cannot be read', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('not json');
      },
    }));
    await expect(
      collectDailyTake('token', fetchImpl as unknown as typeof fetch)
    ).resolves.toEqual({ status: 'collected', amount: 0 });
  });
});
