/**
 * @jest-environment node
 */

/**
 * Server-side gauntlet ban lookup (section 8.2 item 3) - pre-migration-020
 * safety: a missing RPC means "gauntlet not live yet" (null => unfiltered
 * pool), any unexpected failure degrades the same way, and a valid ban id
 * comes back typed.
 */

import { describe, expect, it, jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getGauntletBan, isMissingGauntletInfra } from './gauntlet';

function clientWithRpc(result: { data?: unknown; error?: unknown }) {
  const rpc = jest.fn(async () => result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe('isMissingGauntletInfra', () => {
  it('recognizes the pre-020 signatures', () => {
    expect(isMissingGauntletInfra({ code: '42P01' })).toBe(true);   // missing table
    expect(isMissingGauntletInfra({ code: '42883' })).toBe(true);   // missing function
    expect(isMissingGauntletInfra({ code: 'PGRST202' })).toBe(true); // PostgREST no RPC
    expect(isMissingGauntletInfra({ message: 'function player_gauntlet_ban(uuid) does not exist' })).toBe(true);
  });

  it('does not swallow unrelated errors', () => {
    expect(isMissingGauntletInfra({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(isMissingGauntletInfra(null)).toBe(false);
  });
});

describe('getGauntletBan', () => {
  it('returns the banned mutation id when the RPC provides one', async () => {
    const { client } = clientWithRpc({ data: 'phoenix', error: null });
    await expect(getGauntletBan(client, 'player-1', 'CYBER')).resolves.toBe('phoenix');
  });

  it('returns null for a null RPC result (no active ban)', async () => {
    const { client } = clientWithRpc({ data: null, error: null });
    await expect(getGauntletBan(client, 'player-1', 'CYBER')).resolves.toBeNull();
  });

  it('PRE-020: a missing RPC quietly no-ops (null, no throw)', async () => {
    const { client } = clientWithRpc({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function player_gauntlet_ban' },
    });
    await expect(getGauntletBan(client, 'player-1', 'CYBER')).resolves.toBeNull();
  });

  it('unexpected RPC errors degrade to null (ban is never fatal to a session)', async () => {
    const { client } = clientWithRpc({
      data: null,
      error: { code: '57014', message: 'statement timeout' },
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(getGauntletBan(client, 'player-1', 'CYBER')).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('a thrown client error degrades to null', async () => {
    const client = {
      rpc: jest.fn(async () => {
        throw new Error('network down');
      }),
    } as unknown as SupabaseClient;
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(getGauntletBan(client, 'player-1', 'CYBER')).resolves.toBeNull();
    errorSpy.mockRestore();
  });

  it('garbage RPC data is never trusted as a mutation id', async () => {
    const { client } = clientWithRpc({ data: 'DROP TABLE players', error: null });
    await expect(getGauntletBan(client, 'player-1', 'CYBER')).resolves.toBeNull();
  });

  it('passes the session start time through for end-path validation', async () => {
    const { client, rpc } = clientWithRpc({ data: 'shed', error: null });
    await getGauntletBan(client, 'player-1', 'PRIMAL', '2026-07-16T09:00:00Z');
    expect(rpc).toHaveBeenCalledWith('player_gauntlet_ban', {
      p_player_id: 'player-1',
      p_dynasty: 'PRIMAL',
      p_at: '2026-07-16T09:00:00Z',
    });
  });

  it('omits p_at when not provided (SQL defaults to NOW())', async () => {
    const { client, rpc } = clientWithRpc({ data: null, error: null });
    await getGauntletBan(client, 'player-1', 'PRIMAL');
    expect(rpc).toHaveBeenCalledWith('player_gauntlet_ban', {
      p_player_id: 'player-1',
      p_dynasty: 'PRIMAL',
    });
  });
});
