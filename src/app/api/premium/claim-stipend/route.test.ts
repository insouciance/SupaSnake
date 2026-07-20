/**
 * Tests for the Premium Daily Stipend API - RPC result mapping:
 * premium_required -> 403, already_claimed -> 409, missing 028 infra ->
 * 503, success payload passthrough (energy + monthly drop).
 */

import { NextRequest } from 'next/server';

const mockGetUser = jest.fn();
const mockPlayerSingle = jest.fn();
const mockRpc = jest.fn();

jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({ single: () => mockPlayerSingle() })),
      })),
    })),
    rpc: (...args: unknown[]) => mockRpc(...args),
  })),
}));

let POST: (request: NextRequest) => Promise<Response>;

beforeAll(async () => {
  ({ POST } = await import('./route'));
});

function createRequest(options: { auth?: string | null } = {}): NextRequest {
  const headers: Record<string, string> = {};
  if (options.auth !== null) {
    headers['authorization'] = options.auth ?? 'Bearer valid-token';
  }
  return new NextRequest('http://localhost:3000/api/premium/claim-stipend', {
    method: 'POST',
    headers,
  });
}

describe('Premium claim-stipend POST', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-uuid-1' } },
      error: null,
    });
    mockPlayerSingle.mockResolvedValue({ data: { id: 'player-uuid-1' }, error: null });
  });

  it('returns 401 without an authorization header', async () => {
    const response = await POST(createRequest({ auth: null }));
    expect(response.status).toBe(401);
  });

  it('returns 404 when the player row does not exist', async () => {
    mockPlayerSingle.mockResolvedValue({ data: null, error: null });
    const response = await POST(createRequest());
    expect(response.status).toBe(404);
  });

  it('maps premium_required to 403', async () => {
    mockRpc.mockResolvedValue({ data: { error: 'premium_required' }, error: null });
    const response = await POST(createRequest());
    const data = await response.json();
    expect(response.status).toBe(403);
    expect(data.error).toBe('premium_required');
  });

  it('maps already_claimed to 409 (idempotent per UTC day)', async () => {
    mockRpc.mockResolvedValue({ data: { error: 'already_claimed' }, error: null });
    const response = await POST(createRequest());
    const data = await response.json();
    expect(response.status).toBe(409);
    expect(data.error).toBe('already_claimed');
  });

  it('returns 503 while migration 028 is not applied', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'function claim_premium_stipend does not exist' },
    });
    const response = await POST(createRequest());
    expect(response.status).toBe(503);
  });

  it('passes the success payload through (energy + monthly drop)', async () => {
    mockRpc.mockResolvedValue({
      data: {
        success: true,
        energy: 8,
        granted_energy: 3,
        drop_granted: 'premium_trail_ion_wake',
      },
      error: null,
    });

    const response = await POST(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('claim_premium_stipend', {
      p_player_id: 'player-uuid-1',
    });
    expect(data).toEqual({
      success: true,
      energy: 8,
      grantedEnergy: 3,
      dropGranted: 'premium_trail_ion_wake',
    });
  });

  it('returns 500 on unexpected RPC failure', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'boom' },
    });
    const response = await POST(createRequest());
    expect(response.status).toBe(500);
  });
});
