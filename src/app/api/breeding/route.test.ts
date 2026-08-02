/**
 * @jest-environment node
 */

/**
 * Tests for Breeding API - business logic + GET history + POST draft commit.
 *
 * Breeding is executed by the breed_snakes RPC (migration 047):
 *   cost = (200 + floor((gen1+gen2)/2) * 100) * 1.25^max(0, childGen - 3)
 *   parents must share a dynasty; the offspring variant, traits and lineage
 *   are DRAFTED by the player - nothing is rolled (Constitution §8.2).
 *
 * WP-1.05 rewrote three groups here: the cost mirror (steepening), the
 * "50/50 variant" and "cap generation at 50" assertions (both described
 * behaviour §8.2 deleted), and the rolling-deploy retry tests for the old
 * three-argument RPC (that signature is dropped, deliberately, so no caller
 * can fall back into the coin flip).
 */

// Mock Supabase - must be before imports due to jest.mock hoisting

var mockAuth: jest.Mock;

var mockFrom: jest.Mock;

var mockRpc: jest.Mock;

var mockCaptureException: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockAuth(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import { describe, it, expect } from '@jest/globals';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { POST as DRAFT_POST } from './draft/route';
import { mapBreedingHistoryRow, readBreedingChoices } from './utils';
import { breedingCost } from '@/shared/game/ascendance';

describe('Breeding Logic', () => {
  describe('Cost Calculation', () => {
    it('should compute base cost for two Gen 1 parents', () => {
      expect(breedingCost(1, 1)).toBe(300);
    });

    it('should scale cost with parent generations, steepened past Gen3', () => {
      // child Gen6: base 500 (floor(7/2)=3), 1.25^3
      expect(breedingCost(2, 5)).toBe(Math.ceil(500 * 1.25 ** 3));
      // child Gen5: base 600, 1.25^2
      expect(breedingCost(4, 4)).toBe(Math.ceil(600 * 1.25 ** 2));
    });

    it('should reject cross-dynasty parents', () => {
      const parent1DynastyId = 'dynasty-uuid-cyber';
      const parent2DynastyId = 'dynasty-uuid-primal';
      const sameDynasty = parent1DynastyId === (parent2DynastyId as string);

      // RPC raises 'Parents must be same dynasty'
      expect(sameDynasty).toBe(false);
    });
  });

  describe('DNA Requirements', () => {
    it('should fail if insufficient DNA', () => {
      const playerDna = 100;
      const cost = breedingCost(1, 1);

      expect(playerDna < cost).toBe(true);
    });

    it('should succeed with enough DNA', () => {
      const playerDna = 500;
      const cost = breedingCost(1, 1);

      expect(playerDna >= cost).toBe(true);
    });

    it('should deduct DNA on success', () => {
      const playerDna = 500;
      const cost = breedingCost(1, 1);
      const remaining = playerDna - cost;

      expect(remaining).toBe(200);
    });

    it('leaves a Gen1-3 child at exactly the shipped price', () => {
      expect(breedingCost(1, 1)).toBe(300);
      expect(breedingCost(2, 2)).toBe(400);
    });
  });

  describe('Parent Validation', () => {
    it('should require two different parents', () => {
      const parent1Id = 'uuid-1';
      const parent2Id = 'uuid-1';

      expect(parent1Id === parent2Id).toBe(true);
    });

    it('should accept two different parents', () => {
      const parent1Id = 'uuid-1';
      const parent2Id = 'uuid-2';

      expect(parent1Id !== parent2Id).toBe(true);
    });

    it('should require both parents to be owned by the player', () => {
      const playerId = 'player-uuid';
      const parent = { id: 'snake-uuid', player_id: 'other-player-uuid' };

      expect(parent.player_id === playerId).toBe(false);
    });
  });

  describe('Child Generation', () => {
    it('takes the variant line the player DRAFTED, not a coin flip', () => {
      // The old assertion here described `random() < 0.5`. Under §8.2 the
      // request names one of the two parent lines and the RPC writes it.
      const parent1VariantId = 'variant-uuid-a';
      const parent2VariantId = 'variant-uuid-b';
      expect(
        readBreedingChoices({ variant_id: parent2VariantId }).p_variant_choice
      ).toBe(parent2VariantId);
      expect(readBreedingChoices({}).p_variant_choice).toBeNull();
      expect([parent1VariantId, parent2VariantId]).toHaveLength(2);
    });

    it('should calculate child generation correctly', () => {
      const parent1Gen = 2;
      const parent2Gen = 5;
      const childGen = Math.max(parent1Gen, parent2Gen) + 1;

      expect(childGen).toBe(6);
    });

    it('does not cap generation - Gen4+ is Ascendance (§8.2)', () => {
      // The RPC used to raise 'Maximum generation (50) reached'. That
      // refusal is deleted; the cost curve is what paces the lane now.
      const childGen = Math.max(50, 49) + 1;
      expect(childGen).toBe(51);
      expect(breedingCost(50, 49)).toBeGreaterThan(breedingCost(49, 48));
    });
  });

  describe('Result Data', () => {
    it('should return child with variant UUID reference', () => {
      const childRow = {
        id: 'new-uuid',
        snake_variant_id: 'variant-uuid-a',
        generation: 3,
        snake_variants: {
          name: 'CYBER SPARK',
          rarity: 'common',
          dynasties: { name: 'CYBER' },
        },
      };

      expect(childRow.snake_variant_id).toBeDefined();
      expect(childRow.snake_variants.name).toBe('CYBER SPARK');
      expect(childRow.snake_variants.dynasties.name).toBe('CYBER');
    });

    it('should include generation and cost in response', () => {
      const response = {
        child: {
          id: 'new-uuid',
          snake_variant_id: 'variant-uuid-a',
          generation: 3,
        },
        cost: breedingCost(2, 2),
        remainingDna: 150,
      };

      expect(response.child.generation).toBe(3);
      expect(response.cost).toBe(400);
    });
  });
});

// =============================================================================
// mapBreedingHistoryRow TESTS
// =============================================================================

describe('mapBreedingHistoryRow', () => {
  it('maps a joined history row to camelCase', () => {
    const row = {
      id: 'history-1',
      dna_cost: 300,
      bred_at: '2026-07-01T10:00:00Z',
      parent1: {
        id: 'snake-1',
        generation: 1,
        snake_variants: { name: 'CYBER SPARK', rarity: 'common' },
      },
      parent2: {
        id: 'snake-2',
        generation: 2,
        snake_variants: { name: 'CYBER PULSE', rarity: 'uncommon' },
      },
      child: {
        id: 'snake-3',
        generation: 3,
        snake_variants: { name: 'CYBER SPARK', rarity: 'common' },
      },
    };

    const result = mapBreedingHistoryRow(row);

    expect(result).toEqual({
      id: 'history-1',
      dnaCost: 300,
      bredAt: '2026-07-01T10:00:00Z',
      parent1: { id: 'snake-1', generation: 1, variantName: 'CYBER SPARK', rarity: 'common' },
      parent2: { id: 'snake-2', generation: 2, variantName: 'CYBER PULSE', rarity: 'uncommon' },
      child: { id: 'snake-3', generation: 3, variantName: 'CYBER SPARK', rarity: 'common' },
      lineage: null,
      refundedAt: null,
    });
  });

  it('handles array-shaped joins and a deleted child', () => {
    const row = {
      id: 'history-2',
      dna_cost: 400,
      bred_at: '2026-07-02T10:00:00Z',
      parent1: [
        {
          id: 'snake-1',
          generation: 2,
          snake_variants: [{ name: 'PRIMAL SEED', rarity: 'common' }],
        },
      ],
      parent2: [
        { id: 'snake-2', generation: 2, snake_variants: null },
      ],
      child: null, // ON DELETE SET NULL
    };

    const result = mapBreedingHistoryRow(row);

    expect(result.parent1).toEqual({
      id: 'snake-1',
      generation: 2,
      variantName: 'PRIMAL SEED',
      rarity: 'common',
    });
    expect(result.parent2).toEqual({
      id: 'snake-2',
      generation: 2,
      variantName: null,
      rarity: null,
    });
    expect(result.child).toBeNull();
    expect(result.lineage).toBeNull();
    expect(result.refundedAt).toBeNull();
  });

  it('keeps a refunded pedigree readable after parent and child rows are removed', () => {
    const result = mapBreedingHistoryRow({
      id: 'history-refunded',
      dna_cost: 1280,
      bred_at: '2026-07-02T10:00:00Z',
      refunded_at: '2026-07-29T20:00:00Z',
      parent1: null,
      parent2: null,
      child: null,
      refund_snapshot: {
        parent1: {
          id: 'parent-1',
          generation: 9,
          variant_name: 'CYBER SPARK',
          rarity: 'rare',
        },
        parent2: {
          id: 'parent-2',
          generation: 10,
          variant_name: 'CYBER PULSE',
          rarity: 'epic',
        },
        child: {
          id: 'child-11',
          generation: 11,
          variant_name: 'CYBER PULSE',
          rarity: 'epic',
        },
      },
    });

    expect(result.parent1?.variantName).toBe('CYBER SPARK');
    expect(result.parent2?.generation).toBe(10);
    expect(result.child).toEqual({
      id: 'child-11',
      generation: 11,
      variantName: 'CYBER PULSE',
      rarity: 'epic',
    });
    expect(result.refundedAt).toBe('2026-07-29T20:00:00Z');
  });

  it('sanitizes the audited child lineage from trait_rolls', () => {
    const result = mapBreedingHistoryRow({
      id: 'history-lineage',
      dna_cost: 300,
      bred_at: '2026-07-02T10:00:00Z',
      trait_rolls: {
        lineage: {
          child: {
            strains: ['VOLT', 'FERAL', 'NOPE'],
            strength: 8,
            primary: 'FERAL',
          },
        },
      },
    });
    expect(result.lineage).toEqual({
      strains: ['VOLT', 'FERAL'],
      strength: 2,
      primary: 'FERAL',
    });
  });
});

// =============================================================================
// GET /api/breeding (history) TESTS
// =============================================================================

describe('GET /api/breeding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = jest.fn();
    mockFrom = jest.fn();
    mockRpc = jest.fn();
    mockCaptureException = jest.fn();
  });

  it('should return 401 without authorization header', async () => {
    const request = new NextRequest('http://localhost:3000/api/breeding');
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('should return 401 for invalid token', async () => {
    mockAuth.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Invalid token' },
    });

    const request = new NextRequest('http://localhost:3000/api/breeding', {
      headers: { authorization: 'Bearer bad-token' },
    });
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('should return 404 when player is missing', async () => {
    mockAuth.mockResolvedValueOnce({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({ data: null, error: null }),
    });

    const request = new NextRequest('http://localhost:3000/api/breeding', {
      headers: { authorization: 'Bearer valid-token' },
    });
    const response = await GET(request);

    expect(response.status).toBe(404);
  });

  it('keeps Supabase zero-row lookup semantics as a real 404', async () => {
    mockAuth.mockResolvedValueOnce({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({
        data: null,
        error: {
          code: 'PGRST116',
          details: 'The result contains 0 rows',
          message: 'JSON object requested, multiple (or no) rows returned',
        },
      }),
    });

    const request = new NextRequest('http://localhost:3000/api/breeding', {
      headers: { authorization: 'Bearer valid-token' },
    });
    const response = await GET(request);

    expect(response.status).toBe(404);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('reports a retryable player lookup outage instead of a false 404', async () => {
    mockAuth.mockResolvedValueOnce({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({
        data: null,
        error: { code: '08006', message: 'connection unavailable' },
      }),
    });

    const request = new NextRequest('http://localhost:3000/api/breeding', {
      headers: { authorization: 'Bearer valid-token' },
    });
    const response = await GET(request);

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('3');
    expect(await response.json()).toEqual({
      error: 'Player account temporarily unavailable',
    });
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('should return mapped history, newest first, limited to 10', async () => {
    mockAuth.mockResolvedValueOnce({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    // Player lookup
    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({
        data: { id: 'player-123' },
        error: null,
      }),
    });

    // History query chain: select().eq().order().limit()
    const mockOrder = jest.fn().mockReturnThis();
    const mockLimit = jest.fn().mockResolvedValueOnce({
      data: [
        {
          id: 'history-1',
          dna_cost: 300,
          bred_at: '2026-07-01T10:00:00Z',
          parent1: {
            id: 'snake-1',
            generation: 1,
            snake_variants: { name: 'CYBER SPARK', rarity: 'common' },
          },
          parent2: {
            id: 'snake-2',
            generation: 1,
            snake_variants: { name: 'CYBER PULSE', rarity: 'uncommon' },
          },
          child: {
            id: 'snake-3',
            generation: 2,
            snake_variants: { name: 'CYBER PULSE', rarity: 'uncommon' },
          },
        },
      ],
      error: null,
    });
    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: mockOrder,
      limit: mockLimit,
    });

    const request = new NextRequest('http://localhost:3000/api/breeding', {
      headers: { authorization: 'Bearer valid-token' },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.history).toHaveLength(1);
    expect(data.history[0].id).toBe('history-1');
    expect(data.history[0].dnaCost).toBe(300);
    expect(data.history[0].child.variantName).toBe('CYBER PULSE');
    expect(data.history[0].parent1.generation).toBe(1);
    expect(mockOrder).toHaveBeenCalledWith('bred_at', { ascending: false });
    expect(mockLimit).toHaveBeenCalledWith(10);
  });

  it('should return 500 when the history query fails', async () => {
    mockAuth.mockResolvedValueOnce({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({
        data: { id: 'player-123' },
        error: null,
      }),
    });

    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValueOnce({
        data: null,
        error: { message: 'boom' },
      }),
    });

    const request = new NextRequest('http://localhost:3000/api/breeding', {
      headers: { authorization: 'Bearer valid-token' },
    });
    const response = await GET(request);

    expect(response.status).toBe(500);
  });
});

// =============================================================================
// POST /api/breeding + POST /api/breeding/draft — PREVIEW EQUALS OUTCOME
// =============================================================================

/**
 * The guarantee, asserted mechanically rather than by inspection: the draft
 * endpoint and the commit endpoint hand `breeding_draft` / `breed_snakes`
 * IDENTICAL arguments for the same request body. Since `breed_snakes` calls
 * `breeding_draft` and persists its `preview` verbatim (migration 047), equal
 * arguments mean the previewed child IS the written child.
 */
describe('POST /api/breeding', () => {
  const CHOICES = {
    parent1_id: 'snake-1',
    parent2_id: 'snake-2',
    variant_id: 'variant-b',
    traits: ['sprinter', 'hoarder'],
    lineage_kind: 'parent2',
  };

  const post = (body: Record<string, unknown>) =>
    new NextRequest('http://localhost:3000/api/breeding', {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCaptureException = jest.fn();
    mockAuth = jest.fn().mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    mockFrom = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: 'player-123', dna: 1_000 },
        error: null,
      }),
    });
    mockRpc = jest.fn();
  });

  it('does not attempt a paid RPC when the player lookup is unavailable', async () => {
    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({
        data: null,
        error: { code: '08006', message: 'connection unavailable' },
      }),
    });

    const response = await POST(post(CHOICES));

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('3');
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('sends the RPC exactly the choices the request named', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'P0001', message: 'Insufficient DNA: need 300, have 100' },
    });

    const response = await POST(post(CHOICES));

    expect(response.status).toBe(400);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('breed_snakes', {
      p_player_id: 'player-123',
      p_parent1_id: 'snake-1',
      p_parent2_id: 'snake-2',
      p_allow_cross_dynasty: expect.any(Boolean),
      p_variant_choice: 'variant-b',
      p_trait_draft: ['sprinter', 'hoarder'],
      p_lineage_kind: 'parent2',
    });
  });

  it('preview and commit resolve the SAME draft arguments', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'Insufficient DNA' },
    });

    await DRAFT_POST(
      new NextRequest('http://localhost:3000/api/breeding/draft', {
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify(CHOICES),
      })
    );
    const previewCall = mockRpc.mock.calls.at(-1) as [string, Record<string, unknown>];

    await POST(post(CHOICES));
    const commitCall = mockRpc.mock.calls.at(-1) as [string, Record<string, unknown>];

    expect(previewCall[0]).toBe('breeding_draft');
    expect(commitCall[0]).toBe('breed_snakes');
    // Same player, same parents, same three choices — nothing between the
    // preview and the payment can change what is produced.
    expect(commitCall[1]).toEqual(previewCall[1]);
  });

  it('omitted choices become nulls the RPC resolves to its published defaults', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'P0001', message: 'Parents must be same dynasty' },
    });

    await POST(post({ parent1_id: 'snake-1', parent2_id: 'snake-2' }));

    expect(mockRpc).toHaveBeenCalledWith(
      'breed_snakes',
      expect.objectContaining({
        p_variant_choice: null,
        p_trait_draft: null,
        p_lineage_kind: null,
      })
    );
  });

  it('drops an unknown lineage kind and unknown trait ids before the RPC', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'P0001', message: 'nope' },
    });

    await POST(
      post({
        parent1_id: 'snake-1',
        parent2_id: 'snake-2',
        lineage_kind: 'whatever',
        traits: ['sprinter', 'not-a-trait'],
      })
    );

    expect(mockRpc).toHaveBeenCalledWith(
      'breed_snakes',
      expect.objectContaining({
        p_lineage_kind: null,
        p_trait_draft: ['sprinter'],
      })
    );
  });

  it('never retries a legacy signature — the coin-flip RPC is gone', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find breed_snakes with p_allow_cross_dynasty',
      },
    });

    const response = await POST(post(CHOICES));

    expect(response.status).toBe(400);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
