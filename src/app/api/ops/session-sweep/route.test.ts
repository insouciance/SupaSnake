/**
 * @jest-environment node
 *
 * GET /api/ops/session-sweep — the daily stale-session sweep (WP-0.06, GT §9.6).
 *
 * Acceptance: the open-session count decays, and expiry awards nothing. The
 * second half is proved structurally here: the whole route is one RPC call, so
 * the tests assert that no table is ever written on this path and that the
 * sweep is unreachable without the cron secret.
 */

const mockRpc = jest.fn();
const mockFrom = jest.fn();
const mockCaptureException = jest.fn();
const mockListPendingRunProgression = jest.fn();
const mockResumeOrRecoverRunImpact = jest.fn();
const mockAdoptPendingGameSessionEnds = jest.fn();

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));
jest.mock('@/lib/server/gameProgressionSettlement', () => ({
  adoptPendingGameSessionEnds: (...args: unknown[]) =>
    mockAdoptPendingGameSessionEnds(...args),
  listPendingRunProgression: (...args: unknown[]) =>
    mockListPendingRunProgression(...args),
  resumeOrRecoverRunImpact: (...args: unknown[]) =>
    mockResumeOrRecoverRunImpact(...args),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';
import {
  STALE_OPEN_MINUTES,
  STALE_PENDING_SETTLEMENT_MINUTES,
} from '@/lib/session/lifecycle';

const SECRET = 'cron-secret-for-tests';

function request(authorization?: string) {
  const headers: Record<string, string> = {};
  if (authorization) headers.authorization = authorization;
  return new NextRequest('http://localhost/api/ops/session-sweep', { headers });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  mockListPendingRunProgression.mockResolvedValue([]);
  mockAdoptPendingGameSessionEnds.mockResolvedValue({
    phase: 'ready',
    scanned: 0,
    adopted: 0,
    superseded: 0,
    failed: 0,
    failures: [],
  });
  mockResumeOrRecoverRunImpact.mockResolvedValue({ status: 'found', impact: {} });
  mockFrom.mockImplementation((table: string) => {
    throw new Error(`the sweep must not touch ${table}`);
  });
});

describe('authorization', () => {
  it('refuses an unauthenticated request', async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('refuses a wrong secret', async () => {
    const response = await GET(request('Bearer not-the-secret'));
    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('refuses when no secret is configured', async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('the sweep', () => {
  it('expires stale sessions and reports how many, so the count decays', async () => {
    mockRpc.mockResolvedValue({ data: 72, error: null });

    const response = await GET(request(`Bearer ${SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      expired: 72,
      skipped: false,
      pendingEndPhase: 'ready',
      pendingEndsScanned: 0,
      pendingEndsAdopted: 0,
      pendingEndsSuperseded: 0,
      pendingEndsFailed: 0,
      pendingEndFailures: [],
      progressionScanned: 0,
      progressionSettled: 0,
      progressionDeferred: 0,
      progressionFailed: 0,
      progressionFailures: [],
    });
    expect(mockRpc).toHaveBeenCalledWith('expire_stale_game_sessions', {
      p_open_max_minutes: STALE_OPEN_MINUTES,
      p_pending_max_minutes: STALE_PENDING_SETTLEMENT_MINUTES,
      p_batch_limit: 5000,
    });
  });

  it('keeps expiry table-free when no completed progression is pending', async () => {
    mockRpc.mockResolvedValue({ data: 5, error: null });

    await GET(request(`Bearer ${SECRET}`));

    // `mockFrom` throws for every table; reaching 200 proves none was touched.
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('is idempotent — a second pass finds nothing left to close', async () => {
    mockRpc.mockResolvedValueOnce({ data: 12, error: null });
    mockRpc.mockResolvedValueOnce({ data: 0, error: null });

    const first = await (await GET(request(`Bearer ${SECRET}`))).json();
    const second = await (await GET(request(`Bearer ${SECRET}`))).json();

    expect(first.expired).toBe(12);
    expect(second.expired).toBe(0);
  });

  it('reports a no-op before migration 045 without failing the cron', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });

    const response = await GET(request(`Bearer ${SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      expired: 0,
      skipped: true,
      pendingEndPhase: 'ready',
      pendingEndsScanned: 0,
      pendingEndsAdopted: 0,
      pendingEndsSuperseded: 0,
      pendingEndsFailed: 0,
      pendingEndFailures: [],
      progressionScanned: 0,
      progressionSettled: 0,
      progressionDeferred: 0,
      progressionFailed: 0,
      progressionFailures: [],
    });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('fails loudly on a real error, and reports it (Rule 11)', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '40001', message: 'deadlock detected' },
    });

    const response = await GET(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(500);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('resumes a bounded ordered progression batch', async () => {
    mockRpc.mockResolvedValue({ data: 0, error: null });
    mockListPendingRunProgression.mockResolvedValue([
      { playerId: 'player-1', sessionId: 'session-1', protocol: 'atomic_v1' },
      { playerId: 'player-1', sessionId: 'session-2', protocol: 'atomic_v1' },
    ]);

    const response = await GET(request(`Bearer ${SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      progressionScanned: 2,
      progressionSettled: 2,
      progressionFailed: 0,
    });
    expect(mockResumeOrRecoverRunImpact).toHaveBeenCalledTimes(2);
  });

  it('reports each unexpected recovery failure', async () => {
    mockRpc.mockResolvedValue({ data: 0, error: null });
    mockListPendingRunProgression.mockResolvedValue([
      { playerId: 'player-1', sessionId: 'session-1', protocol: 'atomic_v1' },
    ]);
    mockResumeOrRecoverRunImpact.mockResolvedValue({
      status: 'unavailable',
      error: new Error('database unavailable'),
    });

    const response = await GET(request(`Bearer ${SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.progressionFailures).toEqual([
      {
        playerId: 'player-1',
        sessionId: 'session-1',
        protocol: 'atomic_v1',
        status: 'unavailable',
      },
    ]);
  });

  it('treats ordered durable debt as deferred rather than a failed cron', async () => {
    mockRpc.mockResolvedValue({ data: 0, error: null });
    mockListPendingRunProgression.mockResolvedValue([
      { playerId: 'player-1', sessionId: 'session-1', protocol: 'atomic_v1' },
    ]);
    mockResumeOrRecoverRunImpact.mockResolvedValue({
      status: 'pending',
      error: new Error('earlier receipt is still settling'),
    });

    const response = await GET(request(`Bearer ${SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      progressionSettled: 0,
      progressionDeferred: 1,
      progressionFailed: 0,
    });
  });
});
