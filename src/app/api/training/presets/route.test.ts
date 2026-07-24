/** @jest-environment node */

var mockAuth: jest.Mock;
var mockFrom: jest.Mock;
var mockRpc: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockAuth(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

import { NextRequest } from 'next/server';
import { DELETE, GET, POST } from './route';

const PLAYER_ID = 'training-player';
const PRESET_ID = '11111111-1111-4111-8111-111111111111';
const CONFIG = {
  dynasty: 'PRIMAL',
  tickMs: 175,
  startLength: 3,
  path: [
    { x: 10, z: 10 }, { x: 11, z: 10 }, { x: 12, z: 10 },
    { x: 12, z: 9 }, { x: 12, z: 8 },
  ],
};

function request(method: 'GET' | 'POST' | 'DELETE', body?: unknown, query = '') {
  return new NextRequest(`http://localhost:3000/api/training/presets${query}`, {
    method,
    headers: {
      authorization: 'Bearer token',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function playerBuilder() {
  return {
    select: () => ({
      eq: () => ({ single: async () => ({ data: { id: PLAYER_ID }, error: null }) }),
    }),
  };
}

beforeEach(() => {
  mockAuth = jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mockFrom = jest.fn();
  mockRpc = jest.fn();
});

describe('/api/training/presets', () => {
  it('degrades reads safely before the migration', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'players') return playerBuilder();
      return { select: () => ({ eq: () => ({ order: async () => ({
        data: null, error: { code: '42P01', message: 'training_presets does not exist' },
      }) }) }) };
    });
    const response = await GET(request('GET'));
    expect(await response.json()).toEqual({ live: false, presets: [] });
  });

  it('reads only the authenticated player presets', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'players') return playerBuilder();
      return { select: () => ({ eq: (column: string, value: string) => {
        expect([column, value]).toEqual(['player_id', PLAYER_ID]);
        return { order: async () => ({
          data: [{
            id: PRESET_ID, name: 'Line lab', dynasty: 'PRIMAL', tick_ms: 175,
            start_length: 3, path: CONFIG.path, updated_at: '2026-07-24T00:00:00.000Z',
          }], error: null,
        }) };
      } }) };
    });
    const body = await (await GET(request('GET'))).json();
    expect(body.live).toBe(true);
    expect(body.presets[0]).toMatchObject({ id: PRESET_ID, name: 'Line lab', tickMs: 175 });
  });

  it('validates a preset before insert and writes no progress or economy fields', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'players') return playerBuilder();
      throw new Error(`unexpected table ${table}`);
    });
    mockRpc.mockResolvedValue({
      data: {
        id: PRESET_ID, name: 'Line lab', dynasty: 'PRIMAL', tick_ms: 175,
        start_length: 3, path: CONFIG.path, updated_at: '2026-07-24T00:00:00.000Z',
      },
      error: null,
    });
    const response = await POST(request('POST', { name: 'Line lab', config: CONFIG }));
    const body = await response.json();
    expect(body.live).toBe(true);
    expect(body.preset.id).toBe(PRESET_ID);
    expect(mockRpc).toHaveBeenCalledWith('save_training_preset', {
      p_player_id: PLAYER_ID,
      p_name: 'Line lab',
      p_dynasty: 'PRIMAL',
      p_tick_ms: 175,
      p_start_length: 3,
      p_path: CONFIG.path,
    });
  });

  it('rejects invalid custom paths before touching the preset table', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'players') return playerBuilder();
      throw new Error('preset table should not be touched');
    });
    const response = await POST(request('POST', {
      name: 'Bad', config: { ...CONFIG, path: CONFIG.path.slice(0, 2) },
    }));
    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('degrades preset saves safely before the coordinated migration', async () => {
    mockFrom.mockImplementation((table: string) => table === 'players' ? playerBuilder() : null);
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find save_training_preset' },
    });
    const body = await (await POST(request('POST', { name: 'Line lab', config: CONFIG }))).json();
    expect(body).toEqual({ live: false, preset: null });
  });

  it('deletes by both player and preset id', async () => {
    const checks: Array<[string, string]> = [];
    mockFrom.mockImplementation((table: string) => {
      if (table === 'players') return playerBuilder();
      return {
        delete: () => ({
          eq: (column: string, value: string) => {
            checks.push([column, value]);
            return {
              eq: async (nextColumn: string, nextValue: string) => {
                checks.push([nextColumn, nextValue]);
                return { error: null };
              },
            };
          },
        }),
      };
    });
    const body = await (await DELETE(request('DELETE', undefined, `?id=${PRESET_ID}`))).json();
    expect(body).toEqual({ live: true, deleted: true });
    expect(checks).toEqual([['player_id', PLAYER_ID], ['id', PRESET_ID]]);
  });
});
