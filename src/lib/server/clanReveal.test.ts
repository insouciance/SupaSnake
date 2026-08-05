/** @jest-environment node */

var mockCapture: jest.Mock;

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCapture(...args),
}));

import { beforeEach, describe, expect, it, jest as jestGlobal } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clanRevealDue, insertClanRevealAttention } from './clanReveal';
import {
  CLAN_REVEAL_ATTENTION_KEY,
  CLAN_REVEAL_SOURCE_ID,
  CLAN_REVEAL_SOURCE_TYPE,
} from '@/shared/game/clanReveal';
import { SERPENT_UNLOCK_BANKED_RUNS } from '@/lib/serpent/config';

beforeEach(() => {
  mockCapture = jestGlobal.fn() as unknown as jest.Mock;
});

const banked = (bankedRunsBefore: number | null) => ({
  bankedRunsBefore,
  validated: true,
  extracted: true,
  freePlay: false,
});

describe('clanRevealDue — the eight-bank beat (PEO §6 step 1)', () => {
  it('is due at the settlement that reaches eight validated banks', () => {
    expect(clanRevealDue(banked(SERPENT_UNLOCK_BANKED_RUNS - 1))).toBe(true);
  });

  it('is not due one bank early', () => {
    expect(clanRevealDue(banked(SERPENT_UNLOCK_BANKED_RUNS - 2))).toBe(false);
  });

  it('is due for a veteran already past the beat when the flag flips', () => {
    // "At or PAST eight" (§6 step 1): a player at forty banks who has never
    // seen the reveal is owed it on their next bank, not never.
    expect(clanRevealDue(banked(40))).toBe(true);
  });

  it('never counts a crash, an unvalidated run, or Free Play as a bank', () => {
    const at = SERPENT_UNLOCK_BANKED_RUNS - 1;
    expect(clanRevealDue({ ...banked(at), extracted: false })).toBe(false);
    expect(clanRevealDue({ ...banked(at), validated: false })).toBe(false);
    expect(clanRevealDue({ ...banked(at), freePlay: true })).toBe(false);
  });

  // The flag gate, in both shapes: the stamp is present (on) or absent (off).
  it('is never due for a run that carries no curriculum stamp (flag off)', () => {
    expect(clanRevealDue(banked(null))).toBe(false);
    expect(clanRevealDue({ ...banked(null), freePlay: false })).toBe(false);
  });

  it('refuses a nonsense count rather than guessing at it', () => {
    expect(clanRevealDue(banked(-1))).toBe(false);
    expect(clanRevealDue(banked(1.5))).toBe(false);
    expect(clanRevealDue(banked(Number.NaN))).toBe(false);
  });

  it('does no I/O — the predicate is pure', () => {
    // Every non-qualifying settlement must decide without a query, which is
    // only true if this function never receives a client at all.
    expect(clanRevealDue.length).toBe(1);
  });
});

interface Recorded {
  table: string;
  inserted?: Record<string, unknown>;
  filters: Record<string, unknown>;
}

function client(options: {
  existing?: unknown;
  lookupError?: { code?: string; message?: string } | null;
  insertError?: { code?: string; message?: string } | null;
}) {
  const calls: Recorded[] = [];
  const supabase = {
    from(table: string) {
      const record: Recorded = { table, filters: {} };
      calls.push(record);
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          record.filters[column] = value;
          return chain;
        },
        maybeSingle: async () => ({
          data: options.existing ?? null,
          error: options.lookupError ?? null,
        }),
        insert: async (values: Record<string, unknown>) => {
          record.inserted = values;
          return { error: options.insertError ?? null };
        },
      };
      return chain;
    },
  } as unknown as SupabaseClient;
  return { supabase, calls };
}

describe('insertClanRevealAttention — once per account, never a re-nag', () => {
  it('opens a dismissible clan action row pointing at /clan', async () => {
    const { supabase, calls } = client({});
    await expect(insertClanRevealAttention(supabase, 'player-1')).resolves.toBe(true);
    const insert = calls.find((call) => call.inserted)?.inserted;
    expect(insert).toMatchObject({
      player_id: 'player-1',
      source_type: CLAN_REVEAL_SOURCE_TYPE,
      source_id: CLAN_REVEAL_SOURCE_ID,
      attention_key: CLAN_REVEAL_ATTENTION_KEY,
      // Only an `action` row can reach `dismissed`, which is what **Not now**
      // needs; `recognition_never_action_terminal` forbids it of recognition.
      attention_kind: 'action',
      destination: 'clan',
      headline: 'Your runs can now power a Clan.',
    });
  });

  it('carries no artifact ref, so it cannot deep-link into someone’s clan', () => {
    const { supabase, calls } = client({});
    return insertClanRevealAttention(supabase, 'player-1').then(() => {
      const insert = calls.find((call) => call.inserted)?.inserted ?? {};
      expect(insert).not.toHaveProperty('artifact_ref');
    });
  });

  it('uses a constant source id, so no later settlement can insert a second', async () => {
    const { supabase, calls } = client({});
    await insertClanRevealAttention(supabase, 'player-1');
    const insert = calls.find((call) => call.inserted)?.inserted ?? {};
    expect(insert.source_id).toBe(CLAN_REVEAL_SOURCE_ID);
    expect(String(insert.source_id)).not.toMatch(/session/i);
  });

  it('writes nothing when the row already exists — including a dismissed one', async () => {
    const { supabase, calls } = client({ existing: { id: 'attention-1' } });
    await expect(insertClanRevealAttention(supabase, 'player-1')).resolves.toBe(true);
    expect(calls.every((call) => call.inserted === undefined)).toBe(true);
  });

  it('treats a lost insert race as the outcome it wanted', async () => {
    const { supabase } = client({ insertError: { code: '23505' } });
    await expect(insertClanRevealAttention(supabase, 'player-1')).resolves.toBe(true);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('does not resurrect a declined invitation when the lookup fails', async () => {
    const { supabase, calls } = client({
      lookupError: { code: '08006', message: 'connection reset' },
    });
    await expect(insertClanRevealAttention(supabase, 'player-1')).resolves.toBe(false);
    expect(calls.every((call) => call.inserted === undefined)).toBe(true);
    expect(mockCapture).toHaveBeenCalled();
  });

  it('stays quiet and non-fatal before the attention table exists', async () => {
    const { supabase, calls } = client({
      lookupError: { code: '42P01', message: 'relation "player_attention_items" does not exist' },
    });
    await expect(insertClanRevealAttention(supabase, 'player-1')).resolves.toBe(true);
    expect(calls.every((call) => call.inserted === undefined)).toBe(true);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('reports a genuine write failure without throwing at the settlement', async () => {
    const { supabase } = client({ insertError: { code: '23514', message: 'check violation' } });
    await expect(insertClanRevealAttention(supabase, 'player-1')).resolves.toBe(false);
    expect(mockCapture).toHaveBeenCalled();
  });
});
