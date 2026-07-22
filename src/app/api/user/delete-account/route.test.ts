import { DELETE, PATCH, POST } from './route';
import { NextRequest } from 'next/server';

const mockGetUser = jest.fn();
const mockDeleteUser = jest.fn();
const mockRpc = jest.fn();
const mockUpdate = jest.fn();
const mockEq = jest.fn();
const mockFrom = jest.fn();

const mockQuery: Record<string, jest.Mock> = {};
mockQuery.update = mockUpdate.mockImplementation(() => mockQuery);
mockQuery.eq = mockEq.mockImplementation(() => mockQuery);
mockFrom.mockImplementation(() => mockQuery);

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
      admin: {
        deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
      },
    },
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  })),
}));

const REGISTERED_USER = {
  id: 'user-1',
  email: 'player@example.com',
  is_anonymous: false,
};

function request(
  method: string,
  body?: object,
  token: string | null = 'valid-token'
): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new NextRequest('http://localhost/api/user/delete-account', {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockDeleteUser.mockReset();
  mockRpc.mockReset();
  mockUpdate.mockReset();
  mockEq.mockReset();
  mockFrom.mockReset();
  mockGetUser.mockResolvedValue({
    data: { user: REGISTERED_USER },
    error: null,
  });
  mockDeleteUser.mockResolvedValue({ data: {}, error: null });
  mockUpdate.mockImplementation(() => mockQuery);
  mockEq.mockImplementation(() => mockQuery);
  mockFrom.mockImplementation(() => mockQuery);
});

describe('POST /api/user/delete-account', () => {
  it('requires an exact bearer token', async () => {
    expect((await POST(request('POST', undefined, null))).status).toBe(401);
    expect(
      (
        await POST(
          new NextRequest('http://localhost/api/user/delete-account', {
            method: 'POST',
            headers: { Authorization: 'Basic nope' },
          })
        )
      ).status
    ).toBe(401);
  });

  it('schedules a registered account through the service-only RPC', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'request-1', error: null });

    const response = await POST(
      request('POST', { confirmEmail: ' PLAYER@example.com ' })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(data.gracePeriodDays).toBe(30);
    expect(new Date(data.scheduledDeletion).getTime()).toBeGreaterThan(Date.now());
    expect(mockRpc).toHaveBeenCalledWith(
      'request_account_deletion',
      expect.objectContaining({ p_user_id: 'user-1' })
    );
  });

  it('rejects a mismatched email without touching deletion state', async () => {
    const response = await POST(
      request('POST', { confirmEmail: 'somebody@example.com' })
    );

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('does not schedule an unrecoverable anonymous account', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'guest-1', email: null, is_anonymous: true } },
      error: null,
    });

    const response = await POST(
      request('POST', { confirmation: 'DELETE MY ACCOUNT' })
    );

    expect(response.status).toBe(409);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('reports a pre-migration deployment window as unavailable', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST202', message: 'function not found' },
    });

    const response = await POST(
      request('POST', { confirmEmail: 'player@example.com' })
    );

    expect(response.status).toBe(503);
  });
});

describe('PATCH /api/user/delete-account', () => {
  it('cancels pending deletion for the authenticated user', async () => {
    mockRpc.mockResolvedValueOnce({ data: true, error: null });

    const response = await PATCH(request('PATCH'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.cancelled).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('cancel_account_deletion', {
      p_user_id: 'user-1',
    });
  });
});

describe('DELETE /api/user/delete-account', () => {
  it('requires the immediate flag as well as identity confirmation', async () => {
    const response = await DELETE(
      request('DELETE', {
        confirm: false,
        confirmEmail: 'player@example.com',
      })
    );

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('deletes Auth before finalizing retained accounting references', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: 'request-1', error: null })
      .mockResolvedValueOnce({ data: 'request-1', error: null })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: true, error: null });

    const response = await DELETE(
      request('DELETE', {
        confirm: true,
        confirmEmail: 'player@example.com',
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.deleted).toBe(true);
    expect(mockRpc.mock.calls.map(([name]) => name)).toEqual([
      'request_account_deletion',
      'claim_account_deletion',
      'prepare_account_deletion',
      'finalize_account_deletion',
    ]);
    expect(mockDeleteUser).toHaveBeenCalledWith('user-1');
    const finalizeCall = mockRpc.mock.calls.findIndex(
      ([name]) => name === 'finalize_account_deletion'
    );
    expect(mockDeleteUser.mock.invocationCallOrder[0]).toBeLessThan(
      mockRpc.mock.invocationCallOrder[finalizeCall]
    );
  });

  it('supports explicit immediate erasure for anonymous accounts', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'guest-1', email: null, is_anonymous: true } },
      error: null,
    });
    mockRpc
      .mockResolvedValueOnce({ data: 'request-2', error: null })
      .mockResolvedValueOnce({ data: 'request-2', error: null })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: true, error: null });

    const response = await DELETE(
      request('DELETE', {
        confirm: true,
        confirmation: 'DELETE MY ACCOUNT',
      })
    );

    expect(response.status).toBe(200);
    expect(mockDeleteUser).toHaveBeenCalledWith('guest-1');
  });

  it('keeps a failed auth deletion retryable', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: 'request-1', error: null })
      .mockResolvedValueOnce({ data: 'request-1', error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    mockDeleteUser.mockResolvedValueOnce({
      data: null,
      error: { status: 500, message: 'unavailable' },
    });

    const response = await DELETE(
      request('DELETE', {
        confirm: true,
        confirmEmail: 'player@example.com',
      })
    );

    expect(response.status).toBe(500);
    expect(mockRpc.mock.calls.map(([name]) => name)).not.toContain(
      'finalize_account_deletion'
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' })
    );
  });
});
