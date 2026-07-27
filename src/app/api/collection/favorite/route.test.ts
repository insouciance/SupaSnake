/**
 * @jest-environment node
 */

var mockAuth: jest.Mock;
var mockFrom: jest.Mock;
var mockCaptureException: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockAuth(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  captureMessage: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';

const SNAKE_ID = '550e8400-e29b-41d4-a716-446655440000';

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

function playerQuery(data: unknown, error: unknown = null) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data, error }),
  };
}

function updateQuery(data: unknown, error: unknown = null) {
  return {
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data, error }),
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
    mockCaptureException = jest.fn();
  });

  it('requires authentication', async () => {
    const response = await POST(request(undefined, false));
    expect(response.status).toBe(401);
  });

  it('rejects invalid sessions', async () => {
    mockAuth.mockResolvedValue({
      data: { user: null },
      error: { message: 'bad' },
    });
    expect((await POST(request())).status).toBe(401);
  });

  it('returns 404 when the player profile is missing', async () => {
    mockFrom.mockReturnValueOnce(
      playerQuery(null, { code: 'PGRST116', message: 'no rows' })
    );
    expect((await POST(request())).status).toBe(404);
  });

  it('validates the payload', async () => {
    mockFrom.mockReturnValueOnce(playerQuery({ id: 'player-1' }));
    const response = await POST(
      request({ snakeId: 'not-a-uuid', favorited: 'yes' })
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Validation failed');
  });

  it('persists the flag scoped to the caller’s own row', async () => {
    const update = updateQuery({ id: SNAKE_ID, is_favorited: true });
    mockFrom
      .mockReturnValueOnce(playerQuery({ id: 'player-1' }))
      .mockReturnValueOnce(update);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      snakeId: SNAKE_ID,
      favorited: true,
    });
    expect(update.update).toHaveBeenCalledWith({ is_favorited: true });
    // The player_id filter IS the ownership check.
    expect(update.eq).toHaveBeenCalledWith('id', SNAKE_ID);
    expect(update.eq).toHaveBeenCalledWith('player_id', 'player-1');
  });

  it('unfavorites just as happily', async () => {
    const update = updateQuery({ id: SNAKE_ID, is_favorited: false });
    mockFrom
      .mockReturnValueOnce(playerQuery({ id: 'player-1' }))
      .mockReturnValueOnce(update);

    const body = await (
      await POST(request({ snakeId: SNAKE_ID, favorited: false }))
    ).json();

    expect(body.favorited).toBe(false);
    expect(update.update).toHaveBeenCalledWith({ is_favorited: false });
  });

  it('answers 404 for a snake the player does not own', async () => {
    mockFrom
      .mockReturnValueOnce(playerQuery({ id: 'player-1' }))
      .mockReturnValueOnce(
        updateQuery(null, { code: 'PGRST116', message: 'no rows' })
      );

    const response = await POST(request());

    expect(response.status).toBe(404);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('reports a real write failure as a 500 incident', async () => {
    mockFrom
      .mockReturnValueOnce(playerQuery({ id: 'player-1' }))
      .mockReturnValueOnce(
        updateQuery(null, { code: '08006', message: 'connection failure' })
      );

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(mockCaptureException).toHaveBeenCalled();
  });
});
