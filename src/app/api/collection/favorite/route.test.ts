/**
 * @jest-environment node
 */

var mockAuth: jest.Mock;
var mockFrom: jest.Mock;
var mockRpc: jest.Mock;
var mockCaptureException: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockAuth(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  captureMessage: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';

const SNAKE_ID = '550e8400-e29b-41d4-a716-446655440000';
const REPLACED_ID = '550e8400-e29b-41d4-a716-446655440001';

function request(
  body: unknown = { snakeId: SNAKE_ID, favorited: true },
  withAuth = true
) {
  return new NextRequest('http://localhost/api/collection/favorite', {
    method: 'POST',
    headers: withAuth
      ? { authorization: 'Bearer token', 'content-type': 'application/json' }
      : { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function invalidJsonRequest() {
  return new NextRequest('http://localhost/api/collection/favorite', {
    method: 'POST',
    headers: {
      authorization: 'Bearer token',
      'content-type': 'application/json',
    },
    body: '{broken',
  });
}

function playerQuery(data: unknown, error: unknown = null) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data, error }),
  };
}

function favoriteReceipt(
  favorited = true,
  replacedSnakeIds: string[] = [REPLACED_ID]
) {
  return {
    snake_id: SNAKE_ID,
    favorited,
    favorite_snake_id: favorited ? SNAKE_ID : null,
    replaced_snake_ids: favorited ? replacedSnakeIds : [],
  };
}

describe('POST /api/collection/favorite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = jest.fn().mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mockFrom = jest.fn();
    mockRpc = jest.fn();
    mockCaptureException = jest.fn();
  });

  it('requires authentication and never caches identity state', async () => {
    const response = await POST(request({}, false));
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects invalid sessions', async () => {
    mockAuth.mockResolvedValue({
      data: { user: null },
      error: { message: 'bad' },
    });
    expect((await POST(request())).status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns 404 when the player profile is missing', async () => {
    mockFrom.mockReturnValueOnce(
      playerQuery(null, { code: 'PGRST116', message: 'no rows' })
    );
    expect((await POST(request())).status).toBe(404);
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('reports a real player lookup failure instead of calling it not-found', async () => {
    mockFrom.mockReturnValueOnce(
      playerQuery(null, { code: '08006', message: 'connection failure' })
    );
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe('Failed to read player');
    expect(mockCaptureException).toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('validates JSON and the full payload before mutation', async () => {
    mockFrom
      .mockReturnValueOnce(playerQuery({ id: 'player-1' }))
      .mockReturnValueOnce(playerQuery({ id: 'player-1' }));

    expect((await POST(invalidJsonRequest())).status).toBe(400);
    const response = await POST(
      request({ snakeId: 'not-a-uuid', favorited: 'yes' })
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Validation failed');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('favorites through one atomic RPC and returns every replaced snake id', async () => {
    mockFrom.mockReturnValueOnce(playerQuery({ id: 'player-1' }));
    mockRpc.mockResolvedValueOnce({
      data: favoriteReceipt(true, [REPLACED_ID]),
      error: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('set_dynasty_favorite', {
      p_player_id: 'player-1',
      p_snake_id: SNAKE_ID,
      p_favorited: true,
    });
    expect(await response.json()).toEqual({
      success: true,
      snakeId: SNAKE_ID,
      favorited: true,
      favoriteSnakeId: SNAKE_ID,
      replacedSnakeIds: [REPLACED_ID],
    });
    // The only table read is the authenticated player lookup. There is no
    // collected_snakes UPDATE fallback outside the transactional RPC.
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith('players');
  });

  it('unfavorites only the named snake and returns an empty replacement set', async () => {
    mockFrom.mockReturnValueOnce(playerQuery({ id: 'player-1' }));
    mockRpc.mockResolvedValueOnce({ data: favoriteReceipt(false), error: null });

    const response = await POST(
      request({ snakeId: SNAKE_ID, favorited: false })
    );

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('set_dynasty_favorite', {
      p_player_id: 'player-1',
      p_snake_id: SNAKE_ID,
      p_favorited: false,
    });
    expect(await response.json()).toMatchObject({
      snakeId: SNAKE_ID,
      favorited: false,
      favoriteSnakeId: null,
      replacedSnakeIds: [],
    });
  });

  it('answers 404 when the RPC proves the snake is not owned', async () => {
    mockFrom.mockReturnValueOnce(playerQuery({ id: 'player-1' }));
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'P0001', message: 'Snake not owned by player' },
    });

    const response = await POST(request());

    expect(response.status).toBe(404);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it.each(['PGRST202', '42883'])(
    'fails clearly with no non-atomic fallback when the RPC is missing (%s)',
    async (code) => {
      mockFrom.mockReturnValueOnce(playerQuery({ id: 'player-1' }));
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { code, message: 'function missing' },
      });

      const response = await POST(request());

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: 'Favorites are temporarily unavailable',
        retryable: true,
      });
      expect(mockFrom).toHaveBeenCalledTimes(1);
      expect(mockCaptureException).not.toHaveBeenCalled();
    }
  );

  it('reports an unexpected database failure as a 500 incident', async () => {
    mockFrom.mockReturnValueOnce(playerQuery({ id: 'player-1' }));
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { code: '08006', message: 'connection failure' },
    });

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe('Failed to update favorite');
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it('rejects a malformed success receipt rather than guessing client state', async () => {
    mockFrom.mockReturnValueOnce(playerQuery({ id: 'player-1' }));
    mockRpc.mockResolvedValueOnce({
      data: { snake_id: SNAKE_ID, favorited: true },
      error: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe(
      'Favorite update returned incomplete data'
    );
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it('rejects a well-shaped receipt that does not match the requested mutation', async () => {
    mockFrom.mockReturnValueOnce(playerQuery({ id: 'player-1' }));
    mockRpc.mockResolvedValueOnce({
      data: {
        ...favoriteReceipt(true, []),
        favorited: false,
        favorite_snake_id: null,
      },
      error: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe(
      'Favorite update returned incomplete data'
    );
    expect(mockCaptureException).toHaveBeenCalled();
  });
});
