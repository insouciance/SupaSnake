/**
 * The ladder's records — the server read and the server write (WP-3.12).
 *
 * What this file pins:
 *
 *   - MIGRATION 057'S ABSENCE IS SILENT AND SAFE. The runbook requires the app
 *     to be deployable before its migrations apply, so a missing table must
 *     report "no ladder" without an alert and without an exception. Everything
 *     downstream then offers no rung, stamps no rung, and plays Ground.
 *   - A REAL failure is different: it is reported to Sentry (Rule 11) and STILL
 *     degrades to no ladder rather than throwing. A settlement must never fail
 *     over a difficulty record.
 *   - UNLOCK IS GLOBAL, RECORD IS PER-DYNASTY. The attempt gate is derived from
 *     MAX(best_rung) across dynasties — the anti-re-climb ruling — while the
 *     per-dynasty numbers are returned untouched.
 *   - The write goes through the RPC and nothing else. There is no `.update()`,
 *     no `.upsert()` and no `.delete()` on `player_ladders` in this module,
 *     because `GREATEST` lives in the function and Rule 6 is only "by
 *     construction" for as long as that is the only door.
 */

const mockCaptureException = jest.fn();

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import { describe, expect, it, beforeEach } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isMissingLadderInfra,
  readLadderRecords,
  recordLadderRung,
} from './ladderRecords';

const PLAYER = 'player-1';

interface Fixture {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
}

/** A Supabase double that records the shape of every call it is handed. */
function fakeClient(select: Fixture = {}, rpc: Fixture = {}) {
  const rpcCalls: { name: string; args: unknown }[] = [];
  const mutations: string[] = [];
  const builder = {
    select: () => builder,
    eq: () => Promise.resolve({ data: select.data ?? [], error: select.error ?? null }),
    update: () => {
      mutations.push('update');
      return builder;
    },
    upsert: () => {
      mutations.push('upsert');
      return builder;
    },
    delete: () => {
      mutations.push('delete');
      return builder;
    },
  };
  const client = {
    from: () => builder,
    rpc: (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: rpc.data ?? null, error: rpc.error ?? null });
    },
  } as unknown as SupabaseClient;
  return { client, rpcCalls, mutations };
}

beforeEach(() => mockCaptureException.mockClear());

describe('isMissingLadderInfra', () => {
  it('recognises every way Postgres and PostgREST report an absent 057', () => {
    expect(isMissingLadderInfra({ code: '42P01' })).toBe(true);
    expect(isMissingLadderInfra({ code: '42703' })).toBe(true);
    expect(isMissingLadderInfra({ code: 'PGRST202' })).toBe(true);
    expect(isMissingLadderInfra({ code: 'PGRST205' })).toBe(true);
    expect(
      isMissingLadderInfra({ message: 'relation "player_ladders" does not exist' })
    ).toBe(true);
    expect(
      isMissingLadderInfra({ message: 'function record_ladder_rung does not exist' })
    ).toBe(true);
  });

  it('does not swallow an unrelated failure', () => {
    expect(isMissingLadderInfra({ code: '57014', message: 'timeout' })).toBe(false);
    expect(isMissingLadderInfra(null)).toBe(false);
  });
});

describe('readLadderRecords', () => {
  it('reports the ladder DARK when migration 057 has not applied, and stays quiet', () => {
    return readLadderRecords(
      fakeClient({ error: { code: '42P01', message: 'relation does not exist' } })
        .client,
      PLAYER
    ).then((records) => {
      expect(records.available).toBe(false);
      expect(records.attemptable).toBe(0);
      expect(records.maxBest).toBe(0);
      // Deploy order is not an incident.
      expect(mockCaptureException).not.toHaveBeenCalled();
    });
  });

  it('reports a REAL read failure and still degrades to no ladder', async () => {
    const records = await readLadderRecords(
      fakeClient({ error: { code: '57014', message: 'statement timeout' } }).client,
      PLAYER
    );
    expect(records.available).toBe(false);
    expect(records.attemptable).toBe(0);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('reads an empty table as a player standing on Ground, one rung open', async () => {
    const records = await readLadderRecords(fakeClient({ data: [] }).client, PLAYER);
    expect(records.available).toBe(true);
    expect(records.best).toEqual({ CYBER: 0, PRIMAL: 0, COSMIC: 0 });
    expect(records.attemptable).toBe(1);
  });

  it('unlocks GLOBALLY while keeping the record PER-DYNASTY', async () => {
    // THE ANTI-RE-CLIMB RULING. Four rungs beaten on PRIMAL open rung 5 on
    // CYBER, where this player has banked nothing — and CYBER's own record
    // stays 0, because the two facts are not the same fact.
    const records = await readLadderRecords(
      fakeClient({
        data: [
          { dynasty: 'PRIMAL', best_rung: 4 },
          { dynasty: 'COSMIC', best_rung: 1 },
        ],
      }).client,
      PLAYER
    );
    expect(records.maxBest).toBe(4);
    expect(records.attemptable).toBe(5);
    expect(records.best.CYBER).toBe(0);
    expect(records.best.PRIMAL).toBe(4);
  });

  it('ignores a row for a dynasty this game does not have', async () => {
    // EMBER/CRYSTAL/VOID is deprecated and must never be reintroduced. A stray
    // row must not raise the ceiling for the dynasties that do exist.
    const records = await readLadderRecords(
      fakeClient({ data: [{ dynasty: 'EMBER', best_rung: 7 }] }).client,
      PLAYER
    );
    expect(records.maxBest).toBe(0);
    expect(records.attemptable).toBe(1);
  });

  it('reads a stored rung this build does not offer as Ground', async () => {
    // An older client meeting a ladder that has since grown. It must not offer
    // a rung it cannot render, and it must not throw.
    const records = await readLadderRecords(
      fakeClient({ data: [{ dynasty: 'CYBER', best_rung: 99 }] }).client,
      PLAYER
    );
    expect(records.best.CYBER).toBe(0);
    expect(records.attemptable).toBe(1);
  });
});

describe('recordLadderRung', () => {
  it('writes through the RPC and through nothing else', async () => {
    const { client, rpcCalls, mutations } = fakeClient({}, { data: 5 });
    const best = await recordLadderRung(client, PLAYER, 'CYBER', 5);
    expect(best).toBe(5);
    expect(rpcCalls).toEqual([
      {
        name: 'record_ladder_rung',
        args: { p_player_id: PLAYER, p_dynasty: 'CYBER', p_rung: 5 },
      },
    ]);
    // Rule 6 is "by construction" only while the RPC is the sole door. A direct
    // table write from here would put the GREATEST outside the write path.
    expect(mutations).toEqual([]);
  });

  it('never sends a rung this build does not offer', async () => {
    const { client, rpcCalls } = fakeClient({}, { data: 0 });
    await recordLadderRung(client, PLAYER, 'PRIMAL', 999);
    expect((rpcCalls[0].args as { p_rung: number }).p_rung).toBe(0);
  });

  it('returns null and stays quiet when migration 057 has not applied', async () => {
    const { client } = fakeClient(
      {},
      { error: { code: '42P01', message: 'relation does not exist' } }
    );
    expect(await recordLadderRung(client, PLAYER, 'COSMIC', 3)).toBeNull();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('reports a real write failure and still returns null rather than throwing', async () => {
    const { client } = fakeClient(
      {},
      { error: { code: '57014', message: 'statement timeout' } }
    );
    // The caller treats null exactly like a success it did not need: a lost
    // difficulty record must never stop a banked run from being paid.
    expect(await recordLadderRung(client, PLAYER, 'COSMIC', 3)).toBeNull();
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});
