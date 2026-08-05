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
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

const mockReadEligibility = jest.fn();
const mockRunFacts = jest.fn();
const mockSelectTrial = jest.fn();
jest.mock('@/lib/server/geneEligibility', () => ({
  readGeneEligibility: (...args: unknown[]) => mockReadEligibility(...args),
}));
jest.mock('@/lib/server/genome', () => ({
  getGenomeRunFacts: (...args: unknown[]) => mockRunFacts(...args),
}));
jest.mock('@/lib/server/geneTrialSelection', () => ({
  selectGeneTrial: (...args: unknown[]) => mockSelectTrial(...args),
}));

import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { GENOME_V2_STARTER_POOLS } from '@/shared/game/genes';

const STARTERS = [...GENOME_V2_STARTER_POOLS.CYBER];

function request(method: 'GET' | 'POST', body?: unknown, auth = true) {
  const url =
    method === 'GET'
      ? 'http://localhost/api/genome/curriculum?dynasty=CYBER'
      : 'http://localhost/api/genome/curriculum';
  return new NextRequest(url, {
    method,
    headers: auth
      ? { authorization: 'Bearer token', 'content-type': 'application/json' }
      : { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_PLAYER_EVOLUTION_V1 = 'true';
  mockAuth = jest
    .fn()
    .mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mockRpc = jest.fn();
  mockFrom = jest.fn(() => {
    const chain: Record<string, jest.Mock> = {};
    chain.select = jest.fn(() => chain);
    chain.eq = jest.fn(() => chain);
    chain.maybeSingle = jest.fn(async () => ({
      data: { id: 'player-1' },
      error: null,
    }));
    return chain;
  });
  mockReadEligibility.mockResolvedValue({
    available: true,
    eligibleGeneIds: STARTERS,
    trialGeneId: null,
  });
  mockRunFacts.mockResolvedValue({
    ok: true,
    bankedRuns: 3,
    prevRunDied: false,
    ownedVariants: 1,
  });
  mockSelectTrial.mockResolvedValue({ status: 'selected' });
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_PLAYER_EVOLUTION_V1;
});

describe('GET /api/genome/curriculum', () => {
  it('annotates every roster Gene with a truthful next step', async () => {
    const body = await (await GET(request('GET'))).json();
    expect(body.live).toBe(true);
    expect(body.trialsOpen).toBe(true);
    expect(body.genes.length).toBeGreaterThanOrEqual(12);
    for (const entry of body.genes) {
      expect(entry.nextStep.length).toBeGreaterThan(0);
    }
    expect(body.candidates.length).toBeGreaterThan(0);
    expect(body.candidates.length).toBeLessThanOrEqual(2);
  });

  it('requires a Dynasty and an identity', async () => {
    expect(
      (
        await GET(
          new NextRequest('http://localhost/api/genome/curriculum', {
            headers: { authorization: 'Bearer token' },
          })
        )
      ).status
    ).toBe(400);
    expect((await GET(request('GET', undefined, false))).status).toBe(401);
  });

  it('is dormant with the flag off — annotate nothing, gate nothing', async () => {
    process.env.NEXT_PUBLIC_PLAYER_EVOLUTION_V1 = 'false';
    const body = await (await GET(request('GET'))).json();
    expect(body).toEqual({
      live: false,
      dynasty: 'CYBER',
      bankedRuns: 0,
      trialsOpen: false,
      trialGeneId: null,
      candidates: [],
      genes: [],
    });
    expect(mockReadEligibility).not.toHaveBeenCalled();
  });

  it('is dormant when the satellite table is not applied here yet', async () => {
    mockReadEligibility.mockResolvedValue({
      available: false,
      eligibleGeneIds: [],
      trialGeneId: null,
    });
    const body = await (await GET(request('GET'))).json();
    expect(body.live).toBe(false);
  });

  it('is dormant rather than wrong when the banked-run count cannot be read', async () => {
    mockRunFacts.mockResolvedValue({
      ok: false,
      reason: 'banked-run count',
      error: { code: '08006' },
    });
    const body = await (await GET(request('GET'))).json();
    expect(body.live).toBe(false);
  });

  it('never caches a progression read', async () => {
    const response = await GET(request('GET'));
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('POST /api/genome/curriculum', () => {
  it('sets one of the server’s own candidates', async () => {
    const first = (await (await GET(request('GET'))).json()).candidates[0];
    const response = await POST(request('POST', { dynasty: 'CYBER', geneId: first }));
    expect(response.status).toBe(200);
    expect(mockSelectTrial).toHaveBeenCalledWith(
      expect.anything(),
      'player-1',
      first
    );
  });

  it('refuses a Gene the account already holds, or one outside its candidates', async () => {
    for (const geneId of [STARTERS[0], 'not_a_gene', null]) {
      const response = await POST(request('POST', { dynasty: 'CYBER', geneId }));
      expect(response.status).toBe(400);
    }
    expect(mockSelectTrial).not.toHaveBeenCalled();
  });

  it('refuses a Gene that is not legal for the named Dynasty', async () => {
    mockReadEligibility.mockResolvedValue({
      available: true,
      eligibleGeneIds: [...GENOME_V2_STARTER_POOLS.PRIMAL],
      trialGeneId: null,
    });
    const response = await POST(
      request('POST', { dynasty: 'PRIMAL', geneId: 'zenith_protocol' })
    );
    expect(response.status).toBe(400);
  });

  it('refuses every write with the flag off', async () => {
    process.env.NEXT_PUBLIC_PLAYER_EVOLUTION_V1 = 'false';
    const response = await POST(
      request('POST', { dynasty: 'CYBER', geneId: 'coilkeeper' })
    );
    expect(response.status).toBe(404);
    expect(mockSelectTrial).not.toHaveBeenCalled();
  });

  it('reports a failed write instead of pretending the trial was set', async () => {
    const first = (await (await GET(request('GET'))).json()).candidates[0];
    mockSelectTrial.mockResolvedValue({ status: 'unavailable' });
    const response = await POST(request('POST', { dynasty: 'CYBER', geneId: first }));
    expect(response.status).toBe(503);
  });
});
