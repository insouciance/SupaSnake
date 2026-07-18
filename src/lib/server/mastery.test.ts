/**
 * Server mastery helpers (Design v2 section 7.1) - pre-migration-019
 * safety is the contract under test: a missing player_mastery table or
 * grant_mastery_xp RPC must read as "mastery not live yet" (0 XP, no
 * grant) without ever failing or spamming errors.
 */

import { describe, expect, it, jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getMasteryXp,
  grantMasteryXp,
  isMissingMasteryInfra,
} from './mastery';

/** Minimal fake for the .from('player_mastery') read chain. */
function fakeReadClient(result: {
  data?: { xp: number } | null;
  error?: { code?: string; message?: string } | null;
}): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: result.data ?? null,
              error: result.error ?? null,
            }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

function fakeRpcClient(result: {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
}): SupabaseClient {
  return {
    rpc: async () => ({
      data: result.data ?? null,
      error: result.error ?? null,
    }),
  } as unknown as SupabaseClient;
}

describe('isMissingMasteryInfra (pre-019 detection)', () => {
  it('recognizes missing relation, missing function, and PostgREST codes', () => {
    expect(isMissingMasteryInfra({ code: '42P01' })).toBe(true);
    expect(isMissingMasteryInfra({ code: '42883' })).toBe(true);
    expect(isMissingMasteryInfra({ code: 'PGRST202' })).toBe(true);
    expect(
      isMissingMasteryInfra({
        message: 'relation "public.player_mastery" does not exist',
      })
    ).toBe(true);
    expect(
      isMissingMasteryInfra({
        message: 'Could not find the function public.grant_mastery_xp',
      })
    ).toBe(true);
  });

  it('does not swallow unrelated errors', () => {
    expect(isMissingMasteryInfra({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(isMissingMasteryInfra(null)).toBe(false);
  });
});

describe('getMasteryXp', () => {
  it('returns the stored xp', async () => {
    const xp = await getMasteryXp(
      fakeReadClient({ data: { xp: 41250 } }),
      'p1',
      'PRIMAL'
    );
    expect(xp).toBe(41250);
  });

  it('returns 0 for a missing row (fresh dynasty)', async () => {
    expect(
      await getMasteryXp(fakeReadClient({ data: null }), 'p1', 'CYBER')
    ).toBe(0);
  });

  it('returns 0 quietly during the pre-019 window (42P01)', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const xp = await getMasteryXp(
        fakeReadClient({
          error: {
            code: '42P01',
            message: 'relation "public.player_mastery" does not exist',
          },
        }),
        'p1',
        'COSMIC'
      );
      expect(xp).toBe(0);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('returns 0 (logged) on unexpected errors - mastery is never fatal', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const xp = await getMasteryXp(
        fakeReadClient({ error: { code: '500', message: 'boom' } }),
        'p1',
        'PRIMAL'
      );
      expect(xp).toBe(0);
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('grantMasteryXp', () => {
  it('returns the new total from the RPC row (array shape)', async () => {
    const granted = await grantMasteryXp(
      fakeRpcClient({ data: [{ xp_after: 8200, level_after: 3 }] }),
      'p1',
      'PRIMAL',
      1200
    );
    expect(granted).toEqual({ xpAfter: 8200 });
  });

  it('returns null quietly during the pre-019 window (PGRST202)', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const granted = await grantMasteryXp(
        fakeRpcClient({
          error: {
            code: 'PGRST202',
            message:
              'Could not find the function public.grant_mastery_xp in the schema cache',
          },
        }),
        'p1',
        'PRIMAL',
        500
      );
      expect(granted).toBeNull();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('never grants zero/negative/garbage XP', async () => {
    const client = fakeRpcClient({ data: [{ xp_after: 999 }] });
    expect(await grantMasteryXp(client, 'p1', 'PRIMAL', 0)).toBeNull();
    expect(await grantMasteryXp(client, 'p1', 'PRIMAL', -10)).toBeNull();
    expect(await grantMasteryXp(client, 'p1', 'PRIMAL', Number.NaN)).toBeNull();
  });
});
