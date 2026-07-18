/**
 * Server-side season helpers (Design v2 Phase 4B): the pre-migration-021
 * no-op guarantees - missing infra reads as "seasons not live yet", never
 * as a failure - and the seasonal-pool sanitation.
 */

import { describe, expect, it, jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getSeasonalMutationIds,
  isMissingSeasonInfra,
} from '@/lib/server/season';

function supabaseReturning(result: { data: unknown; error: unknown }) {
  const lte = jest.fn(async () => result);
  const select = jest.fn(() => ({ lte }));
  const from = jest.fn(() => ({ select }));
  return { from } as unknown as SupabaseClient;
}

describe('isMissingSeasonInfra', () => {
  it('recognizes missing relation / column / RPC codes', () => {
    expect(isMissingSeasonInfra({ code: '42P01' })).toBe(true);
    expect(isMissingSeasonInfra({ code: '42703' })).toBe(true);
    expect(isMissingSeasonInfra({ code: '42883' })).toBe(true);
    expect(isMissingSeasonInfra({ code: 'PGRST202' })).toBe(true);
  });

  it('recognizes messages naming the 021 objects', () => {
    expect(
      isMissingSeasonInfra({ message: 'relation "season_mutations" does not exist' })
    ).toBe(true);
    expect(
      isMissingSeasonInfra({ message: 'column "anomaly_id" does not exist' })
    ).toBe(true);
    expect(
      isMissingSeasonInfra({ message: 'function get_anomaly_board(uuid) does not exist' })
    ).toBe(true);
  });

  it('does not swallow unrelated errors', () => {
    expect(isMissingSeasonInfra({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(isMissingSeasonInfra(null)).toBe(false);
  });
});

describe('getSeasonalMutationIds', () => {
  it('PRE-021: a missing table reads as an empty pool, no throw', async () => {
    const supabase = supabaseReturning({
      data: null,
      error: { code: '42P01', message: 'relation "season_mutations" does not exist' },
    });
    await expect(getSeasonalMutationIds(supabase)).resolves.toEqual([]);
  });

  it('returns only known mutation ids, deduplicated', async () => {
    const supabase = supabaseReturning({
      data: [
        { mutation_id: 'solstice_engine' },
        { mutation_id: 'glacial_reserve' },
        { mutation_id: 'solstice_engine' },
        { mutation_id: 'not_a_mutation' },
        { mutation_id: 42 },
      ],
      error: null,
    });
    await expect(getSeasonalMutationIds(supabase)).resolves.toEqual([
      'solstice_engine',
      'glacial_reserve',
    ]);
  });

  it('an empty catalog (pre-season) is an empty pool', async () => {
    const supabase = supabaseReturning({ data: [], error: null });
    await expect(getSeasonalMutationIds(supabase)).resolves.toEqual([]);
  });
});
