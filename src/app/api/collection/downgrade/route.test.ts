/**
 * @jest-environment node
 */

var mockAuth: jest.Mock;
var mockRpc: jest.Mock;
var mockCaptureException: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockAuth(...args) },
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

jest.mock('../utils', () => ({
  getPlayerId: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { getPlayerId } from '../utils';
import { POST } from './route';

const mockGetPlayerId = getPlayerId as jest.Mock;
const SNAKE_ID = '550e8400-e29b-41d4-a716-446655440000';
const REPLACEMENT_ID = '550e8400-e29b-41d4-a716-446655440001';

function request(body: unknown = { snakeId: SNAKE_ID }, withAuth = true) {
  return new NextRequest('http://localhost/api/collection/downgrade', {
    method: 'POST',
    headers: withAuth
      ? { authorization: 'Bearer token', 'content-type': 'application/json' }
      : { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/collection/downgrade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = jest.fn().mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mockRpc = jest.fn();
    mockCaptureException = jest.fn();
    mockGetPlayerId.mockResolvedValue('player-1');
  });

  it('requires authentication', async () => {
    expect((await POST(request({}, false))).status).toBe(401);
  });

  it('rejects invalid sessions and missing player profiles', async () => {
    mockAuth.mockResolvedValueOnce({ data: { user: null }, error: { message: 'bad' } });
    expect((await POST(request())).status).toBe(401);

    mockAuth.mockResolvedValueOnce({ data: { user: { id: 'user-1' } }, error: null });
    mockGetPlayerId.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(404);
  });

  it('validates the snake id before touching the economy RPC', async () => {
    const response = await POST(request({ snakeId: 'not-a-uuid' }));
    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns the exact server receipt and replacement projection', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        refunded_dna: 1280,
        new_dna_balance: 4321,
        removed_snake_id: SNAKE_ID,
        replacement_snake_id: REPLACEMENT_ID,
        from_generation: 11,
        to_generation: 10,
      },
      error: null,
    });

    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('downgrade_snake_generation', {
      p_player_id: 'player-1',
      p_snake_id: SNAKE_ID,
    });
    expect(await response.json()).toEqual({
      success: true,
      refundedDna: 1280,
      newDnaBalance: 4321,
      removedSnakeId: SNAKE_ID,
      replacementSnakeId: REPLACEMENT_ID,
      fromGeneration: 11,
      toGeneration: 10,
    });
  });

  it('maps ordinary lineage-rule refusals without paging', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'P0001', message: 'Downgrade descendants first' },
    });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe('Downgrade descendants first');
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('maps a stale snake to 404', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'P0001', message: 'Snake not found in your active collection' },
    });
    expect((await POST(request())).status).toBe(404);
  });

  it('keeps the deploy-before-migration window retryable', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST202', message: 'function missing' },
    });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ retryable: true });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('reports unexpected database failures', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { code: '08006', message: 'connection failure' },
    });
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it('rejects malformed success data instead of guessing a refund', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { refunded_dna: 1280 },
      error: null,
    });
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(mockCaptureException).toHaveBeenCalled();
  });
});
