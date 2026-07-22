import { NextRequest } from 'next/server';
import { GET } from './route';

const mockRpc = jest.fn();
const mockDeleteUser = jest.fn();
const mockUpdate = jest.fn();
const mockEq = jest.fn();

const mockQuery: Record<string, jest.Mock> = {};
mockQuery.update = mockUpdate.mockImplementation(() => mockQuery);
mockQuery.eq = mockEq.mockImplementation(() => mockQuery);

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: jest.fn(() => mockQuery),
    auth: {
      admin: {
        deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
      },
    },
  })),
}));

function request(secret = 'cron-secret') {
  return new NextRequest('http://localhost/api/user/delete-account/process', {
    headers: { Authorization: `Bearer ${secret}` },
  });
}

beforeEach(() => {
  mockRpc.mockReset();
  mockDeleteUser.mockReset();
  mockUpdate.mockReset();
  mockEq.mockReset();
  process.env.CRON_SECRET = 'cron-secret';
  mockUpdate.mockImplementation(() => mockQuery);
  mockEq.mockImplementation(() => mockQuery);
  mockDeleteUser.mockResolvedValue({ data: {}, error: null });
});

afterAll(() => {
  delete process.env.CRON_SECRET;
});

describe('GET /api/user/delete-account/process', () => {
  it('fails closed when CRON_SECRET is absent or incorrect', async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(request())).status).toBe(401);
    process.env.CRON_SECRET = 'cron-secret';
    expect((await GET(request('wrong'))).status).toBe(401);
  });

  it('claims due rows and completes each deletion', async () => {
    mockRpc
      .mockResolvedValueOnce({
        data: [
          { request_id: 'request-1', user_id: 'user-1', auth_deleted: false },
          { request_id: 'request-2', user_id: 'user-2', auth_deleted: false },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: true, error: null });

    const response = await GET(request());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ claimed: 2, completed: 2, failed: 0, cancelled: 0 });
    expect(mockDeleteUser).toHaveBeenNthCalledWith(1, 'user-1');
    expect(mockDeleteUser).toHaveBeenNthCalledWith(2, 'user-2');
  });

  it('recovers post-Auth finalization without attempting Auth deletion again', async () => {
    mockRpc
      .mockResolvedValueOnce({
        data: [
          { request_id: 'request-1', user_id: null, auth_deleted: true },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null });

    const response = await GET(request());
    expect(await response.json()).toEqual({
      claimed: 1,
      completed: 1,
      failed: 0,
      cancelled: 0,
    });
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenLastCalledWith('finalize_account_deletion', {
      p_request_id: 'request-1',
    });
  });

  it('returns 503 before migration 035 instead of pretending work ran', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST202', message: 'function not found' },
    });

    expect((await GET(request())).status).toBe(503);
  });
});
