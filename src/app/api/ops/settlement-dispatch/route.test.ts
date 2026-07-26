/**
 * @jest-environment node
 *
 * The weekly settlement dispatch route (Constitution §7.6, §11.6).
 *
 * What is pinned here is what a review of an email cron has to be able to
 * trust without reading it: it never mails an address that did not ask, it
 * never mails the same address twice for the same week, it never mails at all
 * with the flag down or before migration 051, it publishes nothing anywhere,
 * and it calls no model.
 */

var mockFrom: jest.Mock;
var mockGetUserById: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      admin: { getUserById: (...args: unknown[]) => mockGetUserById(...args) },
    },
  }),
}));

let mockFlag = true;
jest.mock('@/lib/growth/config', () => ({
  get SETTLEMENT_DISPATCH_V1() {
    return mockFlag;
  },
}));

const mockSend = jest.fn();
const mockBuildPanel = jest.fn();
jest.mock('@/lib/growth/settlementEmail', () => {
  const actual = jest.requireActual('@/lib/growth/settlementEmail');
  return {
    ...actual,
    settlementEmailEnabled: () => true,
    sendSettlementEmail: (...args: unknown[]) => mockSend(...args),
  };
});
jest.mock('@/lib/server/serpent', () => {
  const actual = jest.requireActual('@/lib/server/serpent');
  return {
    ...actual,
    buildSerpentPanel: (...args: unknown[]) => mockBuildPanel(...args),
  };
});
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

import { GET } from './route';
import { NextRequest } from 'next/server';
import { emptySerpentPanel, type SerpentPanel } from '@/lib/server/serpent';

// A Wednesday. The week that just submerged began Monday 2026-07-13.
const NOW = new Date('2026-07-22T07:00:00Z');
const SETTLED_WEEK = '2026-07-13';

function cronRequest(headers: Record<string, string> = { authorization: 'Bearer s3cret' }) {
  return new NextRequest('http://localhost/api/ops/settlement-dispatch', { headers });
}

interface Wiring {
  optedIn?: string[];
  waitlist?: Array<Record<string, unknown>>;
  ledgerMissing?: boolean;
  /** Recipient keys already claimed for the week — the cron-replay case. */
  alreadyClaimed?: string[];
  weekRowMissing?: boolean;
}

const claimed = new Set<string>();

function wireTables(options: Wiring = {}) {
  claimed.clear();
  for (const key of options.alreadyClaimed ?? []) claimed.add(key);

  mockFrom.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    let payload: { data: unknown; error: unknown } = { data: [], error: null };

    if (table === 'serpent_weeks') {
      payload = {
        data: options.weekRowMissing ? null : { id: 'week-uuid' },
        error: null,
      };
    } else if (table === 'serpent_week_clans') {
      payload = {
        data: [
          {
            depth: 4820,
            contributing_members: 3,
            clans: { name: 'Hollow Fang', tag: 'HFG' },
          },
          { depth: 1240, contributing_members: 1, clans: { name: 'Lone Coil', tag: 'LNC' } },
        ],
        error: null,
      };
    } else if (table === 'serpent_chronicle_entries') {
      payload = {
        data: [
          { kind: 'personal_best_week', previous_depth: 860 },
          { kind: 'clan_best_week', previous_depth: 0 },
        ],
        error: null,
      };
    } else if (table === 'player_settings') {
      payload = {
        data: (options.optedIn ?? []).map((id) => ({ player_id: id })),
        error: null,
      };
    } else if (table === 'players') {
      payload = {
        data: (options.optedIn ?? []).map((id) => ({ id, user_id: `u-${id}` })),
        error: null,
      };
    } else if (table === 'dispatch_waitlist') {
      payload = { data: options.waitlist ?? [], error: null };
    } else if (table === 'settlement_dispatch_sends') {
      payload = { data: [], error: null };
    } else {
      throw new Error(`Unexpected table in test: ${table}`);
    }

    for (const method of ['select', 'eq', 'gt', 'in', 'limit', 'order', 'update']) {
      chain[method] = jest.fn(() => chain);
    }
    chain.maybeSingle = jest.fn(async () => payload);
    chain.upsert = jest.fn((row: { recipient_key: string }) => {
      if (options.ledgerMissing) {
        return {
          select: () => ({
            then: (resolve: (v: unknown) => unknown) =>
              resolve({
                data: null,
                error: { code: '42P01', message: 'relation "settlement_dispatch_sends" does not exist' },
              }),
          }),
        };
      }
      const first = !claimed.has(row.recipient_key);
      claimed.add(row.recipient_key);
      return {
        select: () => ({
          then: (resolve: (v: unknown) => unknown) =>
            resolve({ data: first ? [{ id: 'ledger-row' }] : [], error: null }),
        }),
      };
    });
    chain.then = (resolve: (v: unknown) => unknown) => resolve(payload);
    return chain;
  });
}

function panelFor(): SerpentPanel {
  const base = emptySerpentPanel();
  return {
    ...base,
    live: true,
    you: { ...base.you, depth: 1240, attempts: 4, bestWeekDepth: 1240 },
    history: [{ weekStart: SETTLED_WEEK, depth: 1240, clanDepth: null }],
  };
}

const confirmedWaitlistRow = {
  id: 'w-1',
  email: 'reader@example.com',
  status: 'confirmed',
  confirmation_sent_at: '2026-07-01T00:00:00Z',
  confirmation_expires_at: '2026-07-03T00:00:00Z',
  confirmed_at: '2026-07-01T00:10:00Z',
  unsubscribed_at: null,
};

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  jest.setSystemTime(NOW);
  mockFlag = true;
  mockFrom = jest.fn();
  mockGetUserById = jest.fn().mockResolvedValue({
    data: {
      user: {
        email: 'p1@example.com',
        email_confirmed_at: '2026-06-01T00:00:00Z',
        is_anonymous: false,
      },
    },
    error: null,
  });
  mockSend.mockReset().mockResolvedValue('sent');
  mockBuildPanel.mockReset().mockResolvedValue(panelFor());
  process.env.CRON_SECRET = 's3cret';
  process.env.RESEND_API_KEY = 'test-key';
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  delete process.env.CRON_SECRET;
  delete process.env.RESEND_API_KEY;
});

describe('auth', () => {
  it('rejects an unauthenticated call', async () => {
    wireTables();
    expect((await GET(cronRequest({}))).status).toBe(401);
  });

  it('fails closed when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    wireTables();
    expect((await GET(cronRequest())).status).toBe(401);
  });

  it('rejects a forged platform marker', async () => {
    wireTables();
    const response = await GET(cronRequest({ 'x-vercel-cron': '1' }));
    expect(response.status).toBe(401);
  });
});

describe('the operator post', () => {
  it('composes the week at world scale and returns it unpublished', async () => {
    wireTables();
    const body = await (await GET(cronRequest())).json();

    expect(body.weekStart).toBe(SETTLED_WEEK);
    expect(body.post.lines[0]).toBe(`SUPASNAKE · World Serpent · week of ${SETTLED_WEEK}`);
    expect(body.post.lines).toContain('HOLLOW FANG — Depth 4,820 · 3 members hunted');
    expect(body.post.lines).toContain('LONE COIL — Depth 1,240 · 1 member hunted');
    expect(body.post.lines).toContain('1 hunter went deeper than they ever had.');
    expect(body.post.lines).toContain('1 clan set a deepest week, 1 of them for the first time.');
    expect(body.post.share.text.split('\n').pop()).toBe(body.post.share.url);
  });

  it('publishes nothing — the response is the whole output', async () => {
    wireTables();
    const body = await (await GET(cronRequest())).json();
    // No write of any kind against a social or publishing surface exists here;
    // the only tables touched are the ones the read and the ledger name.
    const tables = new Set(mockFrom.mock.calls.map((call) => call[0]));
    expect(Array.from(tables).sort()).toEqual([
      'dispatch_waitlist',
      'player_settings',
      'serpent_chronicle_entries',
      'serpent_week_clans',
      'serpent_weeks',
    ]);
    expect(body.post).not.toBeNull();
  });

  it('carries no commercial vocabulary', async () => {
    wireTables();
    const body = await (await GET(cronRequest())).json();
    const { commercialTerms } = await import('@/lib/growth/commercialLanguage');
    expect(commercialTerms(body.post.share.text)).toEqual([]);
    expect(commercialTerms(body.post.share.title)).toEqual([]);
  });
});

describe('the email — opt-in only', () => {
  it('mails an opted-in player with a confirmed address', async () => {
    wireTables({ optedIn: ['p1'] });
    const body = await (await GET(cronRequest())).json();

    expect(mockSend).toHaveBeenCalledTimes(1);
    const call = mockSend.mock.calls[0][0];
    expect(call.recipient.email).toBe('p1@example.com');
    expect(call.model.weekKey).toBe(SETTLED_WEEK);
    expect(body.email.sent).toBe(1);
  });

  it('never mails an address that has not been confirmed', async () => {
    mockGetUserById.mockResolvedValue({
      data: {
        user: { email: 'p1@example.com', email_confirmed_at: null, is_anonymous: false },
      },
      error: null,
    });
    wireTables({ optedIn: ['p1'] });
    const body = await (await GET(cronRequest())).json();

    expect(mockSend).not.toHaveBeenCalled();
    expect(body.email.sent).toBe(0);
    expect(body.email.skipped).toBe(1);
  });

  it('never mails an anonymous session', async () => {
    mockGetUserById.mockResolvedValue({
      data: {
        user: {
          email: 'ghost@example.com',
          email_confirmed_at: '2026-06-01T00:00:00Z',
          is_anonymous: true,
        },
      },
      error: null,
    });
    wireTables({ optedIn: ['p1'] });
    await GET(cronRequest());
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('reads no panel for a recipient it will not mail', async () => {
    mockGetUserById.mockResolvedValue({
      data: { user: { email: null, email_confirmed_at: null, is_anonymous: false } },
      error: null,
    });
    wireTables({ optedIn: ['p1'] });
    await GET(cronRequest());
    // The gate runs first: no Serpent panel is even built for them.
    expect(mockBuildPanel).not.toHaveBeenCalled();
  });

  it('mails nobody when nobody opted in', async () => {
    wireTables({ optedIn: [] });
    const body = await (await GET(cronRequest())).json();
    expect(mockSend).not.toHaveBeenCalled();
    expect(body.email.sent).toBe(0);
  });
});

describe('the email — idempotency', () => {
  it('a second pass in the same week mails nobody again', async () => {
    wireTables({ optedIn: ['p1'] });
    await GET(cronRequest());
    expect(mockSend).toHaveBeenCalledTimes(1);

    const body = await (await GET(cronRequest())).json();
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(body.email.sent).toBe(0);
    expect(body.email.skipped).toBe(1);
  });

  it('fails closed before migration 051 — composes the post, sends nothing', async () => {
    wireTables({ optedIn: ['p1'], ledgerMissing: true });
    const body = await (await GET(cronRequest())).json();

    expect(mockSend).not.toHaveBeenCalled();
    expect(body.email.ledgerMissing).toBe(true);
    expect(body.email.sent).toBe(0);
    expect(body.post).not.toBeNull();
  });
});

describe('the Dispatch list', () => {
  it('counts a confirmed subscriber as reachable and defers the send', async () => {
    wireTables({ waitlist: [confirmedWaitlistRow] });
    const body = await (await GET(cronRequest())).json();
    expect(body.email.dispatchConfirmed).toBe(1);
    expect(body.email.dispatchDeferred).toBe(1);
    // Deferred means deferred: no message is composed for them.
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('does not count a confirmed row with no confirmation timestamp', async () => {
    wireTables({ waitlist: [{ ...confirmedWaitlistRow, confirmed_at: null }] });
    const body = await (await GET(cronRequest())).json();
    expect(body.email.dispatchConfirmed).toBe(0);
  });

  it('does not count an unsubscribed row', async () => {
    wireTables({
      waitlist: [
        {
          ...confirmedWaitlistRow,
          status: 'unsubscribed',
          confirmed_at: null,
          unsubscribed_at: '2026-07-05T00:00:00Z',
        },
      ],
    });
    const body = await (await GET(cronRequest())).json();
    expect(body.email.dispatchConfirmed).toBe(0);
  });
});

describe('flag off', () => {
  it('composes nothing, reads nothing and sends nothing', async () => {
    mockFlag = false;
    wireTables({ optedIn: ['p1'], waitlist: [confirmedWaitlistRow] });
    const body = await (await GET(cronRequest())).json();

    expect(body).toEqual({ ok: true, skipped: 'flag-off', sent: 0, post: null });
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('still refuses an unauthenticated call with the flag down', async () => {
    mockFlag = false;
    wireTables();
    expect((await GET(cronRequest({}))).status).toBe(401);
  });
});
