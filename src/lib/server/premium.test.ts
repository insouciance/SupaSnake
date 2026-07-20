/**
 * Tests for the server-side premium entitlement helpers.
 * Failure posture is the whole point: a read error or missing migration
 * 028 must NEVER accidentally grant premium perks.
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasPremium, isMissingPremiumInfra } from './premium';

function clientWithRpc(result: unknown): SupabaseClient {
  return {
    rpc: jest.fn().mockReturnValue(Promise.resolve(result)),
  } as unknown as SupabaseClient;
}

describe('isMissingPremiumInfra', () => {
  it('detects missing relation / column / RPC codes', () => {
    expect(isMissingPremiumInfra({ code: '42P01' })).toBe(true);
    expect(isMissingPremiumInfra({ code: '42703' })).toBe(true);
    expect(isMissingPremiumInfra({ code: '42883' })).toBe(true);
    expect(isMissingPremiumInfra({ code: 'PGRST202' })).toBe(true);
  });

  it('detects messages naming the 028 objects', () => {
    expect(
      isMissingPremiumInfra({ message: 'function has_premium(uuid) does not exist' })
    ).toBe(true);
    expect(
      isMissingPremiumInfra({ message: 'relation "premium_subscriptions" missing' })
    ).toBe(true);
  });

  it('does not swallow unrelated errors', () => {
    expect(isMissingPremiumInfra({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(isMissingPremiumInfra(null)).toBe(false);
  });
});

describe('hasPremium', () => {
  it('returns true only for an explicit true from the RPC', async () => {
    expect(await hasPremium(clientWithRpc({ data: true, error: null }), 'p1')).toBe(true);
    expect(await hasPremium(clientWithRpc({ data: false, error: null }), 'p1')).toBe(false);
    expect(await hasPremium(clientWithRpc({ data: null, error: null }), 'p1')).toBe(false);
  });

  it('fails CLOSED on missing 028 infra', async () => {
    const client = clientWithRpc({
      data: null,
      error: { code: 'PGRST202', message: 'has_premium not found' },
    });
    expect(await hasPremium(client, 'p1')).toBe(false);
  });

  it('fails CLOSED on unexpected errors', async () => {
    const client = clientWithRpc({
      data: null,
      error: { code: '57014', message: 'timeout' },
    });
    expect(await hasPremium(client, 'p1')).toBe(false);
  });
});
