/**
 * @jest-environment node
 */

/**
 * Dispatch cron tests (Identity v1 section 8.4): exact CRON_SECRET
 * auth, the batch-10 drain + stale-grant sweep, and the
 * counts-only response (no payloads, no tokens).
 */

process.env.CRON_SECRET = 'cron-secret-123';

var mockDrain: jest.Mock;
var mockSweep: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({}),
}));

jest.mock('@/lib/server/discordSync', () => ({
  drainDiscordOutbox: (...args: unknown[]) => mockDrain(...args),
  sweepStaleDiscordLinks: (...args: unknown[]) => mockSweep(...args),
}));

import { GET } from './route';
import { NextRequest } from 'next/server';

function request(headers: Record<string, string> = {}) {
  return new NextRequest('https://supasnake.com/api/discord/dispatch', { headers });
}

beforeEach(() => {
  mockDrain = jest.fn().mockResolvedValue({ live: true, scanned: 2, sent: 2, failed: 0, dead: 0 });
  mockSweep = jest.fn().mockResolvedValue(1);
});

describe('GET /api/discord/dispatch', () => {
  it('401s without cron credentials', async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request({ authorization: 'Bearer wrong' }))).status).toBe(401);
    expect(mockDrain).not.toHaveBeenCalled();
  });

  it('accepts the CRON_SECRET bearer and drains batch 10 + sweeps', async () => {
    const response = await GET(request({ authorization: 'Bearer cron-secret-123' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      live: true,
      scanned: 2,
      sent: 2,
      failed: 0,
      dead: 0,
      sweptLinks: 1,
    });
    expect(mockDrain).toHaveBeenCalledWith(expect.anything(), 10);
    expect(mockSweep).toHaveBeenCalledTimes(1);
  });

  it('rejects a forged Vercel cron marker without the bearer', async () => {
    const response = await GET(request({ 'x-vercel-cron': '1' }));
    expect(response.status).toBe(401);
    expect(mockDrain).not.toHaveBeenCalled();
  });

  it('skips the sweep pre-024 and reports live:false', async () => {
    mockDrain.mockResolvedValue({ live: false, scanned: 0, sent: 0, failed: 0, dead: 0 });
    const response = await GET(request({ authorization: 'Bearer cron-secret-123' }));
    const body = await response.json();
    expect(body.live).toBe(false);
    expect(mockSweep).not.toHaveBeenCalled();
  });
});
