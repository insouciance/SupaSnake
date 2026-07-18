/**
 * @jest-environment node
 */

/**
 * Discord outbox producer/consumer tests (Identity v1 section 8.4) -
 * Supabase and global fetch mocked. Embed formatting per event type,
 * the attempts-based exponential skip, drain idempotency (sent rows
 * leave the pending scan), dead-letter at 5 attempts and the
 * no-clan-link dead path; the M5+ gate on the mastery producer.
 */

import { randomBytes } from 'crypto';

process.env.DISCORD_TOKEN_ENC_KEY = randomBytes(32).toString('base64');
process.env.DISCORD_CLIENT_ID = 'app-123';

import type { SupabaseClient } from '@supabase/supabase-js';
import { encryptSecret } from './crypto';
import {
  drainDiscordOutbox,
  enqueueMasteryLevelup,
  messageForEvent,
  outboxBackoffMs,
} from './discordSync';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('messageForEvent', () => {
  it('duel_settled carries both clans, scores and the rating delta', () => {
    const message = messageForEvent('duel_settled', {
      week_start: '2026-07-13',
      clan_a: { id: 'a', name: 'Elite', tag: 'ELIT', score: 4200 },
      clan_b: { id: 'b', name: 'Rivals', tag: 'RIVL', score: 3100 },
      winner: 'a',
      rating_delta: 16,
    });
    const description = message?.embeds?.[0]?.description ?? '';
    expect(description).toContain('**Elite** [ELIT] 4200 — 3100 [RIVL] **Rivals**');
    expect(description).toContain('**Elite** take the week (±16 rating)');
  });

  it('duel_settled renders ties without a winner', () => {
    const message = messageForEvent('duel_settled', {
      clan_a: { id: 'a', name: 'Elite', tag: 'ELIT', score: 100 },
      clan_b: { id: 'b', name: 'Rivals', tag: 'RIVL', score: 100 },
      winner: null,
      rating_delta: 0,
    });
    expect(message?.embeds?.[0]?.description).toContain('Tie — no rating change');
  });

  it('gauntlet_unlock names the researched node from the 020 catalog', () => {
    const message = messageForEvent('gauntlet_unlock', {
      node_id: 'heraldry_1',
      clan_name: 'Elite',
    });
    expect(message?.embeds?.[0]?.description).toContain('**Clan Banner Frame**');
  });

  it('mastery_levelup and member_joined carry the handle', () => {
    expect(
      messageForEvent('mastery_levelup', { handle: 'Souci', dynasty: 'CYBER', level: 7 })
        ?.embeds?.[0]?.description
    ).toBe('**Souci** reached **CYBER Mastery 7**');
    expect(
      messageForEvent('member_joined', { handle: 'Souci', clan_name: 'Elite', clan_tag: 'ELIT' })
        ?.embeds?.[0]?.description
    ).toBe('**Souci** joined **Elite** [ELIT]');
  });

  it('season_champion pings @everyone (the one hype moment)', () => {
    const message = messageForEvent('season_champion', {
      season_name: 'Solstice',
      clan_name: 'Elite',
      clan_tag: 'ELIT',
    });
    expect(message?.content).toBe('@everyone');
    expect(message?.embeds?.[0]?.description).toContain('**Solstice** champions');
  });

  it('unknown event types return null (drain dead-letters them)', () => {
    expect(messageForEvent('mystery_event', {})).toBeNull();
  });
});

describe('outboxBackoffMs (attempts-based exponential skip)', () => {
  it('doubles per attempt: 0, 5m, 10m, 20m, 40m', () => {
    expect(outboxBackoffMs(0)).toBe(0);
    expect(outboxBackoffMs(1)).toBe(5 * 60_000);
    expect(outboxBackoffMs(2)).toBe(10 * 60_000);
    expect(outboxBackoffMs(3)).toBe(20 * 60_000);
    expect(outboxBackoffMs(4)).toBe(40 * 60_000);
  });
});

// ---------------------------------------------------------------------------
// drain: a configurable supabase mock
// ---------------------------------------------------------------------------

interface OutboxFixtureRow {
  id: string;
  event_type: string;
  clan_id: string;
  payload: Record<string, unknown>;
  attempts: number;
  created_at: string;
  status?: string;
}

function drainSupabase(options: {
  outboxRows?: OutboxFixtureRow[];
  outboxError?: { code?: string; message: string };
  clanLinks?: Array<{ clan_id: string; webhook_id: string; webhook_token_enc: string }>;
  updates: Array<{ id: string; values: Record<string, unknown> }>;
}): SupabaseClient {
  return {
    from: (table: string) => {
      if (table === 'discord_event_outbox') {
        return {
          select: () => ({
            eq: () => ({
              lt: () => ({
                order: () => ({
                  limit: async () => ({
                    data: options.outboxError ? null : (options.outboxRows ?? []),
                    error: options.outboxError ?? null,
                  }),
                }),
              }),
            }),
          }),
          update: (values: Record<string, unknown>) => ({
            eq: async (_col: string, id: string) => {
              options.updates.push({ id, values });
              return { error: null };
            },
          }),
        };
      }
      if (table === 'discord_clan_links') {
        return {
          select: () => ({
            in: async () => ({ data: options.clanLinks ?? [], error: null }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;
}

const OLD = new Date(Date.now() - 60 * 60_000).toISOString();

describe('drainDiscordOutbox', () => {
  it('posts eligible rows through the clan webhook and marks them sent', async () => {
    mockFetch.mockResolvedValue(jsonResponse(204, null));
    const updates: Array<{ id: string; values: Record<string, unknown> }> = [];
    const supabase = drainSupabase({
      outboxRows: [
        {
          id: 'e1',
          event_type: 'member_joined',
          clan_id: 'c1',
          payload: { handle: 'Souci', clan_name: 'Elite', clan_tag: 'ELIT' },
          attempts: 0,
          created_at: OLD,
        },
      ],
      clanLinks: [
        { clan_id: 'c1', webhook_id: 'hook-1', webhook_token_enc: encryptSecret('hook-token') },
      ],
      updates,
    });

    const result = await drainDiscordOutbox(supabase, 10);
    expect(result).toMatchObject({ live: true, sent: 1, failed: 0, dead: 0 });
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://discord.com/api/v10/webhooks/hook-1/hook-token'
    );
    expect(updates[0].values.status).toBe('sent');
  });

  it('skips young failed rows (attempts-based created_at cutoff)', async () => {
    const updates: Array<{ id: string; values: Record<string, unknown> }> = [];
    const supabase = drainSupabase({
      outboxRows: [
        {
          id: 'young',
          event_type: 'member_joined',
          clan_id: 'c1',
          payload: {},
          attempts: 2, // needs 10 minutes of age
          created_at: new Date(Date.now() - 60_000).toISOString(),
        },
      ],
      clanLinks: [
        { clan_id: 'c1', webhook_id: 'hook-1', webhook_token_enc: encryptSecret('t') },
      ],
      updates,
    });
    const result = await drainDiscordOutbox(supabase, 10);
    expect(result.scanned).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it('increments attempts on failure and dead-letters at 5', async () => {
    mockFetch.mockResolvedValue(jsonResponse(500, { message: 'oops' }));
    const updates: Array<{ id: string; values: Record<string, unknown> }> = [];
    const supabase = drainSupabase({
      outboxRows: [
        {
          id: 'flaky',
          event_type: 'member_joined',
          clan_id: 'c1',
          payload: {},
          attempts: 1,
          created_at: OLD,
        },
        {
          id: 'dying',
          event_type: 'member_joined',
          clan_id: 'c1',
          payload: {},
          attempts: 4,
          created_at: new Date(Date.now() - 24 * 60 * 60_000).toISOString(),
        },
      ],
      clanLinks: [
        { clan_id: 'c1', webhook_id: 'hook-1', webhook_token_enc: encryptSecret('t') },
      ],
      updates,
    });
    const result = await drainDiscordOutbox(supabase, 10);
    expect(result).toMatchObject({ failed: 1, dead: 1 });
    const flaky = updates.find((u) => u.id === 'flaky')!;
    expect(flaky.values).toMatchObject({ attempts: 2, status: 'pending' });
    const dying = updates.find((u) => u.id === 'dying')!;
    expect(dying.values).toMatchObject({ attempts: 5, status: 'dead' });
  });

  it('dead-letters rows whose clan lost its link', async () => {
    const updates: Array<{ id: string; values: Record<string, unknown> }> = [];
    const supabase = drainSupabase({
      outboxRows: [
        {
          id: 'orphan',
          event_type: 'member_joined',
          clan_id: 'gone',
          payload: {},
          attempts: 0,
          created_at: OLD,
        },
      ],
      clanLinks: [],
      updates,
    });
    const result = await drainDiscordOutbox(supabase, 10);
    expect(result.dead).toBe(1);
    expect(updates[0].values).toMatchObject({ status: 'dead', last_error: 'no_clan_link' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('reports live:false pre-024 instead of erroring', async () => {
    const updates: Array<{ id: string; values: Record<string, unknown> }> = [];
    const supabase = drainSupabase({
      outboxError: { code: '42P01', message: 'relation "discord_event_outbox" does not exist' },
      updates,
    });
    const result = await drainDiscordOutbox(supabase, 10);
    expect(result.live).toBe(false);
  });
});

describe('enqueueMasteryLevelup', () => {
  it('never enqueues below M5 (M1-4 are too chatty)', async () => {
    const from = jest.fn();
    const supabase = { from } as unknown as SupabaseClient;
    await enqueueMasteryLevelup(supabase, 'p1', 'CYBER', 4);
    expect(from).not.toHaveBeenCalled();
  });

  it('enqueues M5+ with a per-(player,dynasty,level) dedup key for linked clans', async () => {
    const upserts: Array<Record<string, unknown>> = [];
    const supabase = {
      from: (table: string) => {
        if (table === 'players') {
          return {
            select: () => ({
              eq: () => ({ single: async () => ({ data: { user_id: 'u1' }, error: null }) }),
            }),
          };
        }
        if (table === 'clan_members') {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: { clan_id: 'c1' }, error: null }) }),
            }),
          };
        }
        if (table === 'discord_clan_links') {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: { clan_id: 'c1' }, error: null }) }),
            }),
          };
        }
        if (table === 'player_identity_view') {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: { display_handle: 'Souci' }, error: null }) }),
            }),
          };
        }
        if (table === 'discord_event_outbox') {
          return {
            upsert: async (values: Record<string, unknown>) => {
              upserts.push(values);
              return { error: null };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as unknown as SupabaseClient;

    await enqueueMasteryLevelup(supabase, 'p1', 'CYBER', 7);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      event_type: 'mastery_levelup',
      clan_id: 'c1',
      dedup_key: 'mastery_levelup:p1:CYBER:7',
      payload: { handle: 'Souci', dynasty: 'CYBER', level: 7 },
    });
  });

  it('no-ops when the clan has no Discord space', async () => {
    const upserts: Array<Record<string, unknown>> = [];
    const supabase = {
      from: (table: string) => {
        if (table === 'players') {
          return {
            select: () => ({
              eq: () => ({ single: async () => ({ data: { user_id: 'u1' }, error: null }) }),
            }),
          };
        }
        if (table === 'clan_members') {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: { clan_id: 'c1' }, error: null }) }),
            }),
          };
        }
        if (table === 'discord_clan_links') {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
            }),
          };
        }
        if (table === 'discord_event_outbox') {
          return {
            upsert: async (values: Record<string, unknown>) => {
              upserts.push(values);
              return { error: null };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as unknown as SupabaseClient;

    await enqueueMasteryLevelup(supabase, 'p1', 'CYBER', 9);
    expect(upserts).toHaveLength(0);
  });
});
