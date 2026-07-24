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
import type { Direction } from '@/lib/game/SnakeGameLogic';
import { TrainingRun } from '@/lib/game/training/TrainingRun';
import {
  TRAINING_SCENARIO_VERSION,
  createTrainingScenario,
  type TrainingCell,
} from '@/shared/game/training';
import { GET, POST } from './route';

const PLAYER_ID = 'player-training';

function directionBetween(from: TrainingCell, to: TrainingCell): Direction {
  if (to.x > from.x) return 'RIGHT';
  if (to.x < from.x) return 'LEFT';
  if (to.z > from.z) return 'DOWN';
  return 'UP';
}

function validAttempt() {
  const reference = {
    version: TRAINING_SCENARIO_VERSION,
    exercise: 'trace',
    difficulty: 'foundation',
    seed: 'route-test',
  } as const;
  const scenario = createTrainingScenario(reference);
  const run = new TrainingRun(scenario);
  let direction = directionBetween(scenario.path[0], scenario.path[1]);
  run.input(direction);
  for (let index = 1; index < scenario.path.length && !run.isDone; index += 1) {
    const next = directionBetween(scenario.path[index - 1], scenario.path[index]);
    if (next !== direction) {
      run.input(next);
      direction = next;
    }
    run.advance();
  }
  const result = run.snapshot().result!;
  return {
    scenario: reference,
    inputs: result.inputs,
    endedAtTick: result.metrics.ticks,
  };
}

function request(method: 'GET' | 'POST', body?: unknown, token = 'token') {
  return new NextRequest('http://localhost:3000/api/training', {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function authenticate() {
  mockAuth.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
}

function playerBuilder() {
  return {
    select: () => ({
      eq: () => ({
        single: async () => ({ data: { id: PLAYER_ID }, error: null }),
      }),
    }),
  };
}

beforeEach(() => {
  mockAuth = jest.fn();
  mockFrom = jest.fn();
  mockRpc = jest.fn();
});

describe('/api/training', () => {
  it('requires authentication for reads and writes', async () => {
    expect((await GET(request('GET', undefined, ''))).status).toBe(401);
    expect((await POST(request('POST', validAttempt(), ''))).status).toBe(401);
  });

  it('returns a pre-migration-safe empty profile', async () => {
    authenticate();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'players') return playerBuilder();
      if (table === 'training_bests') {
        return { select: () => ({ eq: async () => ({ data: null, error: { code: '42P01', message: 'relation training_bests does not exist' } }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    });
    const response = await GET(request('GET'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ live: false, bests: [], recent: [] });
  });

  it('returns sanitized bests and recent consistency attempts', async () => {
    authenticate();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'players') return playerBuilder();
      if (table === 'training_bests') {
        return { select: () => ({ eq: async () => ({
          data: [{
            exercise_id: 'trace', difficulty: 'foundation', rating: 88, medal: 'gold',
            scenario_version: 1, completed: true,
            accuracy: 96, efficiency: 82, consistency: 80, ticks: 40,
            scenario_seed: 'best-seed', trace: [{ tick: 0, x: 10, z: 10 }],
            updated_at: '2026-07-24T00:00:00.000Z',
          }], error: null,
        }) }) };
      }
      if (table === 'training_attempts') {
        return { select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({
          data: [{
            exercise_id: 'trace', difficulty: 'foundation', rating: 80,
            completed: true, created_at: '2026-07-24T00:00:00.000Z',
          }], error: null,
        }) }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    });
    const response = await GET(request('GET'));
    const body = await response.json();
    expect(body.live).toBe(true);
    expect(body.bests[0]).toMatchObject({ exercise: 'trace', rating: 88, seed: 'best-seed' });
    expect(body.recent[0]).toMatchObject({ exercise: 'trace', rating: 80, completed: true });
  });

  it('replays a valid attempt and degrades safely before persistence exists', async () => {
    authenticate();
    mockFrom.mockImplementation((table: string) => table === 'players' ? playerBuilder() : null);
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find record_training_attempt' },
    });
    const response = await POST(request('POST', { ...validAttempt(), metrics: { rating: 999 } }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.persisted).toBe(false);
    expect(body.result.metrics.rating).toBe(100);
    expect(body.best.seed).toBe('route-test');
  });

  it('persists only server-replayed bounded facts through the training RPC', async () => {
    authenticate();
    mockFrom.mockImplementation((table: string) => table === 'players' ? playerBuilder() : null);
    mockRpc.mockResolvedValue({ data: null, error: null });
    const response = await POST(request('POST', validAttempt()));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.persisted).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('record_training_attempt', expect.objectContaining({
      p_player_id: PLAYER_ID,
      p_exercise_id: 'trace',
      p_rating: 100,
      p_scenario_seed: 'route-test',
    }));
    expect(mockRpc.mock.calls[0][1]).not.toHaveProperty('p_dna');
    expect(mockRpc.mock.calls[0][1]).not.toHaveProperty('p_xp');
  });

  it('rejects malformed traces before any persistence call', async () => {
    authenticate();
    mockFrom.mockImplementation((table: string) => table === 'players' ? playerBuilder() : null);
    const response = await POST(request('POST', {
      scenario: { version: 1, exercise: 'trace', difficulty: 'foundation', seed: '../bad' },
      inputs: [{ tick: 0, type: 'direction', direction: 'UP' }],
      endedAtTick: 0,
    }));
    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
