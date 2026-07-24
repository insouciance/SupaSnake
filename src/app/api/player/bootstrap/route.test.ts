/**
 * @jest-environment node
 */

var mockGetUser: jest.Mock;
var mockRpc: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';

const BOOTSTRAP_RESULT = {
  player: {
    id: 'player-1',
    dna: 0,
    energy: 5,
    maxEnergy: 5,
    highScore: 0,
    totalGamesPlayed: 0,
  },
  equippedSnake: {
    id: 'snake-1',
    variantId: 'variant-1',
    name: 'PRIMAL SEED',
    dynasty: 'PRIMAL',
    generation: 1,
    traits: [],
    lineage: { strains: ['FERAL'], strength: 0 },
  },
  onboarding: {
    version: 2,
    isNewPlayer: true,
    starterGranted: true,
    equipmentRepaired: true,
    hasCompletedFirstRun: false,
    needsStarterSelection: false,
  },
};

function request(withAuth = true) {
  return new NextRequest('http://localhost/api/player/bootstrap', {
    method: 'POST',
    headers: withAuth ? { authorization: 'Bearer token' } : undefined,
  });
}

describe('POST /api/player/bootstrap', () => {
  beforeEach(() => {
    mockGetUser = jest.fn();
    mockRpc = jest.fn();
  });

  it('requires a bearer token', async () => {
    const response = await POST(request(false));

    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects an invalid session', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid' },
    });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('binds bootstrap to the authenticated user and returns PRIMAL state', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mockRpc.mockResolvedValue({ data: BOOTSTRAP_RESULT, error: null });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mockRpc).toHaveBeenCalledWith('bootstrap_player', {
      p_user_id: 'user-1',
    });
    expect(body.ftueV2).toBe(true);
    expect(body.equippedSnake.name).toBe('PRIMAL SEED');
    expect(body.onboarding.needsStarterSelection).toBe(false);
  });

  it('keeps a database failure retryable without returning partial state', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'transaction aborted' },
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: 'Could not prepare your player' });
  });

  it('reports missing catalog data as a temporary service failure', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Active PRIMAL starter is missing from the catalog' },
    });

    const response = await POST(request());

    expect(response.status).toBe(503);
  });
});

