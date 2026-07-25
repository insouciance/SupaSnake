/**
 * @jest-environment node
 */

/**
 * Contracts API route tests - RPC-shaped, Supabase mocked.
 *
 * GET drives lazy offer generation (offer_daily_contracts), POST pick
 * enforces the 1-2 id shape and surfaces RPC pick-limit conflicts, POST
 * claim is idempotent (already-claimed -> 409) and pays via claim_contract.
 */

// Mock Supabase - must be before imports due to jest.mock hoisting

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

import { GET, POST } from './route';
import { NextRequest } from 'next/server';
import type { ContractRpcRow } from './utils';

const PLAYER_ID = 'player-1';

function authedUser() {
  mockAuth.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mockFrom.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: { id: PLAYER_ID }, error: null }),
      }),
    }),
  }));
}

function rpcRow(overrides: Partial<ContractRpcRow> = {}): ContractRpcRow {
  return {
    contract_id: 'banker',
    contract_type: 'extract_n',
    name: 'Banker',
    description: 'Bank 3 extractions',
    params: { count: 3 },
    reward_dna: 400,
    reward_xp: 150,
    offered_slot: 1,
    picked: false,
    progress: { current: 0, target: 3 },
    completed_at: null,
    claimed_at: null,
    ...overrides,
  };
}

function board(): ContractRpcRow[] {
  return [
    rpcRow(),
    rpcRow({ contract_id: 'sprinter', contract_type: 'extract_fast', name: 'Sprinter', offered_slot: 2 }),
    rpcRow({ contract_id: 'nerve', contract_type: 'extract_nth_portal', name: 'Nerve', offered_slot: 3 }),
  ];
}

function getRequest(token = 'valid-token') {
  return new NextRequest('http://localhost:3000/api/contracts', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function postRequest(body: unknown, token = 'valid-token') {
  return new NextRequest('http://localhost:3000/api/contracts', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  });
}

describe('Contracts API route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = jest.fn();
    mockFrom = jest.fn();
    mockRpc = jest.fn();
  });

  describe('authentication', () => {
    it('GET returns 401 without an authorization header', async () => {
      const response = await GET(
        new NextRequest('http://localhost:3000/api/contracts')
      );
      expect(response.status).toBe(401);
    });

    it('POST returns 401 with an invalid token', async () => {
      mockAuth.mockResolvedValue({ data: { user: null }, error: { message: 'bad' } });
      const response = await POST(postRequest({ action: 'pick', contractIds: ['banker'] }));
      expect(response.status).toBe(401);
    });
  });

  describe('GET (lazy offer generation)', () => {
    it('calls offer_daily_contracts and returns the mapped board', async () => {
      authedUser();
      mockRpc.mockResolvedValue({ data: board(), error: null });

      const response = await GET(getRequest());
      expect(response.status).toBe(200);
      const data = await response.json();

      expect(mockRpc).toHaveBeenCalledWith('offer_daily_contracts', {
        p_player_id: PLAYER_ID,
      });
      expect(data.contracts).toHaveLength(3);
      expect(data.contracts[0]).toMatchObject({
        contractId: 'banker',
        rewardDna: 400,
        picked: false,
        completed: false,
        claimed: false,
      });
      expect(data.picksRemaining).toBe(2);
      expect(data.claimable).toBe(false);
    });

    it('reports claimable when a picked contract is complete and unclaimed', async () => {
      authedUser();
      const rows = board();
      rows[0] = rpcRow({
        picked: true,
        progress: { current: 3, target: 3 },
        completed_at: '2026-07-18T09:00:00Z',
      });
      mockRpc.mockResolvedValue({ data: rows, error: null });

      const response = await GET(getRequest());
      const data = await response.json();
      expect(data.claimable).toBe(true);
      expect(data.picksRemaining).toBe(1);
    });

    it('returns 500 when the offer RPC fails', async () => {
      authedUser();
      mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
      const response = await GET(getRequest());
      expect(response.status).toBe(500);
    });
  });

  describe('POST pick', () => {
    it('forwards 1-2 ids to pick_contracts and returns the updated board', async () => {
      authedUser();
      const rows = board();
      rows[0].picked = true;
      rows[1].picked = true;
      mockRpc.mockResolvedValue({ data: rows, error: null });

      const response = await POST(
        postRequest({ action: 'pick', contractIds: ['banker', 'sprinter'] })
      );
      expect(response.status).toBe(200);
      const data = await response.json();

      expect(mockRpc).toHaveBeenCalledWith('pick_contracts', {
        p_player_id: PLAYER_ID,
        p_contract_ids: ['banker', 'sprinter'],
      });
      expect(data.success).toBe(true);
      expect(data.picksRemaining).toBe(0);
    });

    it.each([
      [[]],
      // 3 ids are a VALID shape since 028 (premium picks 3 of 3; the RPC
      // enforces the real per-day limit) - 4 exceeds every entitlement
      [['a', 'b', 'c', 'd']],
      [[42]],
      ['banker'],
      [undefined],
    ])('rejects malformed contractIds %p with 400 before any RPC', async (contractIds) => {
      authedUser();
      const response = await POST(postRequest({ action: 'pick', contractIds }));
      expect(response.status).toBe(400);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('surfaces the RPC pick limit as 409', async () => {
      authedUser();
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'Pick limit reached (2 per day)' },
      });
      const response = await POST(postRequest({ action: 'pick', contractIds: ['nerve'] }));
      expect(response.status).toBe(409);
    });

    it('surfaces unknown offers as 404', async () => {
      authedUser();
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'Contract not offered today' },
      });
      const response = await POST(postRequest({ action: 'pick', contractIds: ['redline'] }));
      expect(response.status).toBe(404);
    });
  });

  describe('POST claim', () => {
    it('claims via claim_contract and returns granted amounts', async () => {
      authedUser();
      mockRpc.mockResolvedValue({
        data: [
          { contract_id: 'banker', dna_granted: 400, xp_granted: 150 },
        ],
        error: null,
      });

      const response = await POST(postRequest({ action: 'claim', contractId: 'banker' }));
      expect(response.status).toBe(200);
      const data = await response.json();

      expect(mockRpc).toHaveBeenCalledWith('claim_contract', {
        p_player_id: PLAYER_ID,
        p_contract_id: 'banker',
      });
      expect(data).toMatchObject({
        success: true,
        contractId: 'banker',
        dnaGranted: 400,
        xpGranted: 150,
      });
    });

    it('requires contractId', async () => {
      authedUser();
      const response = await POST(postRequest({ action: 'claim' }));
      expect(response.status).toBe(400);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('is idempotent: double-claim surfaces as 409', async () => {
      authedUser();
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'Contract already claimed' },
      });
      const response = await POST(postRequest({ action: 'claim', contractId: 'banker' }));
      expect(response.status).toBe(409);
    });

    it('incomplete contracts surface as 409', async () => {
      authedUser();
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'Contract not complete' },
      });
      const response = await POST(postRequest({ action: 'claim', contractId: 'nerve' }));
      expect(response.status).toBe(409);
    });
  });

  describe('POST validation', () => {
    it('rejects unknown actions', async () => {
      authedUser();
      const response = await POST(postRequest({ action: 'grab' }));
      expect(response.status).toBe(400);
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });
});
