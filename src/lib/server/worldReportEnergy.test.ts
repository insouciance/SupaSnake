/** @jest-environment node */

const mockCaptureException = jest.fn();
jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import type { SupabaseClient } from '@supabase/supabase-js';
import { readWorldReportEnergyContext } from './worldReportEnergy';

type Result = { data: unknown; error: unknown };

function queuedClient(responses: Record<string, Result[]>) {
  const tables: string[] = [];
  const writes: string[] = [];
  const client = {
    from(table: string) {
      tables.push(table);
      const result = responses[table]?.shift() ?? { data: null, error: null };
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'not', 'gte', 'lte', 'order', 'limit', 'in', 'neq']) {
        chain[method] = () => chain;
      }
      for (const method of ['insert', 'update', 'upsert', 'delete']) {
        chain[method] = () => {
          writes.push(method);
          return chain;
        };
      }
      chain.maybeSingle = async () => result;
      chain.then = (
        resolve: (value: Result) => unknown,
        reject?: (reason: unknown) => unknown
      ) => Promise.resolve(result).then(resolve, reject);
      return chain;
    },
  } as unknown as SupabaseClient;
  return { client, tables, writes };
}

const LAST_SEEN = '2026-07-20T00:00:00.000Z';
const NOW = Date.parse('2026-07-30T00:00:00.000Z');

beforeEach(() => jest.clearAllMocks());

it('reads only aggregate current-clan battle facts and monotonic standing', async () => {
  const spy = queuedClient({
    players: [
      {
        data: { user_id: 'user-1', best_week_depth: 12000, lifetime_depth: 48000 },
        error: null,
      },
    ],
    clan_members: [{ data: { clan_id: 'clan-1' }, error: null }],
    clan_energy_battle_sides: [
      {
        data: [
          {
            battle_id: 'battle-1',
            clan_id: 'clan-1',
            score: 51000,
            outcome: 'victor',
            clans: [{ name: 'Hollow Fang', tag: 'HFG' }],
            clan_energy_battles: [
              { settled_at: '2026-07-25T03:00:00.000Z' },
            ],
          },
        ],
        error: null,
      },
      {
        data: [
          {
            battle_id: 'battle-1',
            score: 47000,
            clans: { name: 'Quiet Scale', tag: 'QTS' },
          },
        ],
        error: null,
      },
    ],
  });

  const context = await readWorldReportEnergyContext(
    spy.client,
    'player-1',
    LAST_SEEN,
    NOW
  );

  expect(context).toEqual({
    standing: { bestBattleDepth: 12000, lifetimeDepth: 48000 },
    battles: [
      {
        battleId: 'battle-1',
        settledAt: '2026-07-25T03:00:00.000Z',
        outcome: 'victor',
        clan: {
          id: 'clan-1',
          name: 'Hollow Fang',
          tag: 'HFG',
          depth: 51000,
        },
        opponent: { name: 'Quiet Scale', tag: 'QTS', depth: 47000 },
      },
    ],
  });
  expect(JSON.stringify(context)).not.toMatch(
    /member|attempt|commitment|threshold|generation|rank/i
  );
  expect(spy.writes).toEqual([]);
});

it('returns a truthful empty battle chapter for a clanless player', async () => {
  const spy = queuedClient({
    players: [
      {
        data: { user_id: 'user-1', best_week_depth: 0, lifetime_depth: 0 },
        error: null,
      },
    ],
    clan_members: [{ data: null, error: null }],
  });

  await expect(
    readWorldReportEnergyContext(spy.client, 'player-1', LAST_SEEN, NOW)
  ).resolves.toEqual({
    standing: { bestBattleDepth: 0, lifetimeDepth: 0 },
    battles: [],
  });
  expect(spy.tables).toEqual(['players', 'clan_members']);
});

it('refuses a partial report when a required aggregate read fails', async () => {
  const spy = queuedClient({
    players: [
      {
        data: { user_id: 'user-1', best_week_depth: 0, lifetime_depth: 0 },
        error: null,
      },
    ],
    clan_members: [{ data: { clan_id: 'clan-1' }, error: null }],
    clan_energy_battle_sides: [
      { data: null, error: { code: '500', message: 'battle read failed' } },
    ],
  });

  await expect(
    readWorldReportEnergyContext(spy.client, 'player-1', LAST_SEEN, NOW)
  ).resolves.toBeUndefined();
  expect(mockCaptureException).toHaveBeenCalledTimes(1);
});
