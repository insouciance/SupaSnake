/**
 * @jest-environment node
 */

var mockAuth: jest.Mock;
var mockFrom: jest.Mock;
var mockRpc: jest.Mock;
var mockCaptureException: jest.Mock;
var mockCaptureMessage: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockAuth(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
}));

jest.mock('../utils', () => ({
  mapOwnedSnakeRow: jest.fn((row) => ({
    id: row.id,
    playerId: row.player_id,
    variantId: row.snake_variants?.name,
    snakeVariantId: row.snake_variant_id,
    generation: row.generation,
    acquiredMethod: row.acquired_method,
    isEquipped: row.is_equipped,
    isFavorited: row.is_favorited,
    dynastyName: row.snake_variants?.dynasties?.name,
    variantRarity: row.snake_variants?.rarity,
  })),
  getPlayerId: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { getPlayerId } from '../utils';
import { POST } from './route';

const mockGetPlayerId = getPlayerId as jest.Mock;
const SNAKE_ID = '550e8400-e29b-41d4-a716-446655440000';

function request(body: unknown = { snakeId: SNAKE_ID }, withAuth = true) {
  return new NextRequest('http://localhost/api/collection/equip', {
    method: 'POST',
    headers: withAuth
      ? { authorization: 'Bearer token', 'content-type': 'application/json' }
      : { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function foundSnake(isEquipped = false) {
  return {
    id: SNAKE_ID,
    player_id: 'player-1',
    snake_variant_id: 'variant-1',
    generation: 1,
    acquired_method: 'tutorial',
    is_equipped: isEquipped,
    is_favorited: false,
    snake_variants: {
      name: 'PRIMAL SEED',
      rarity: 'rare',
      dynasties: { name: 'PRIMAL' },
    },
  };
}

function singleQuery(data: unknown, error: unknown = null) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data, error }),
  };
}

describe('POST /api/collection/equip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = jest.fn().mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mockFrom = jest.fn();
    mockRpc = jest.fn();
    mockCaptureException = jest.fn();
    mockCaptureMessage = jest.fn();
    mockGetPlayerId.mockResolvedValue('player-1');
  });

  it('requires authentication', async () => {
    const response = await POST(request({}, false));
    expect(response.status).toBe(401);
  });

  it('rejects invalid sessions', async () => {
    mockAuth.mockResolvedValue({ data: { user: null }, error: { message: 'bad' } });
    const response = await POST(request());
    expect(response.status).toBe(401);
  });

  it('returns 404 when the player profile is missing', async () => {
    mockGetPlayerId.mockResolvedValue(null);
    const response = await POST(request());
    expect(response.status).toBe(404);
  });

  it('validates the snake id', async () => {
    const response = await POST(request({ snakeId: 'not-a-uuid' }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Validation failed');
  });

  it('does not allow another player’s snake, and does not page anyone', async () => {
    mockFrom.mockReturnValueOnce(
      singleQuery(null, { code: 'PGRST116', message: 'no rows' })
    );
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('reports a coded ownership-lookup fault while still answering 404', async () => {
    mockFrom.mockReturnValueOnce(
      singleQuery(null, { code: '08006', message: 'connection failure' })
    );
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it('equips through one atomic RPC and returns synchronized snake data', async () => {
    mockFrom
      .mockReturnValueOnce(singleQuery(foundSnake(false)))
      .mockReturnValueOnce(singleQuery(foundSnake(true)));
    mockRpc.mockResolvedValue({ data: true, error: null });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('equip_snake', {
      p_player_id: 'player-1',
      p_snake_id: SNAKE_ID,
    });
    expect(body.equippedSnake).toMatchObject({
      id: SNAKE_ID,
      isEquipped: true,
      dynastyName: 'PRIMAL',
    });
  });

  it('re-reads with the WIDE variant join so traitSlots and lineage survive', async () => {
    const reread = singleQuery(foundSnake(true));
    mockFrom
      .mockReturnValueOnce(singleQuery(foundSnake(false)))
      .mockReturnValueOnce(reread);
    mockRpc.mockResolvedValue({ data: true, error: null });

    await POST(request());

    // The narrow `snake_variants(name, dynasties(name))` form dropped rarity
    // and the innate affinity, degrading traitSlots and nulling lineage.
    expect(reread.select).toHaveBeenCalledWith(
      '*, snake_variants(*, dynasties(name))'
    );
  });

  it('retries ONCE on 23505 and succeeds — the race cannot repeat under the lock', async () => {
    mockFrom
      .mockReturnValueOnce(singleQuery(foundSnake(false)))
      .mockReturnValueOnce(singleQuery(foundSnake(true)));
    mockRpc
      .mockResolvedValueOnce({
        data: null,
        error: { code: '23505', message: 'duplicate key value' },
      })
      .mockResolvedValueOnce({ data: true, error: null });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it('answers 409 with a Sentry warning when 23505 survives the retry', async () => {
    mockFrom.mockReturnValueOnce(singleQuery(foundSnake(false)));
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value' },
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      expect.stringContaining('one-equipped-per-player'),
      expect.objectContaining({ level: 'warning' })
    );
  });

  it('maps the RPC ownership raise (P0001) to 404 without paging anyone', async () => {
    mockFrom.mockReturnValueOnce(singleQuery(foundSnake(false)));
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'Snake not owned by player' },
    });

    const response = await POST(request());

    expect(response.status).toBe(404);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it('reports any other RPC failure as a 500 incident', async () => {
    mockFrom.mockReturnValueOnce(singleQuery(foundSnake(false)));
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '42601', message: 'syntax error' },
    });

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe('Failed to equip snake');
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it('answers 200 when the equip COMMITTED but the re-read failed', async () => {
    // A 500 here made the client roll its optimistic update back over a
    // change the database had really made, leaving the UI permanently wrong.
    mockFrom
      .mockReturnValueOnce(singleQuery(foundSnake(false)))
      .mockReturnValueOnce(singleQuery(null, { message: 'read timeout' }));
    mockRpc.mockResolvedValue({ data: true, error: null });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.equippedSnake).toBeUndefined();
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'Equip committed but the re-read failed',
      expect.objectContaining({ level: 'warning' })
    );
  });
});
