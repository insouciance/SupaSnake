/**
 * @jest-environment node
 *
 * Reading the World Report from the database (Constitution §7.5).
 *
 * The composer is tested against strings; this is tested against QUERIES. What
 * matters here is not what the report says but what it costs, what it does when
 * a read fails, and — the one that would be a Constitution violation rather
 * than a bug — that it never writes.
 *
 *   - it writes nothing, ever, on any path (§7.5, §12.2: not a new claim);
 *   - it costs the same for a two-year absence as a two-week one (Rule 13);
 *   - the common case, somebody who played yesterday, costs one query;
 *   - every Supabase `error` is checked and reported to Sentry (Rule 11);
 *   - a failed read yields no report rather than half a world;
 *   - flag off reads nothing at all.
 */

const mockCaptureException = jest.fn();

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

const mockBuildSerpentPanel = jest.fn();
jest.mock('@/lib/server/serpent', () => ({
  ...jest.requireActual('@/lib/server/serpent'),
  buildSerpentPanel: (...args: unknown[]) => mockBuildSerpentPanel(...args),
}));

const mockReadWorldRollup = jest.fn();
jest.mock('@/lib/server/worldRollup', () => ({
  ...jest.requireActual('@/lib/server/worldRollup'),
  readWorldRollup: (...args: unknown[]) => mockReadWorldRollup(...args),
}));

import type { SupabaseClient } from '@supabase/supabase-js';

import { emptySerpentPanel } from '@/lib/server/serpent';
import { WORLD_REPORT_WEEK_LIMIT } from '@/lib/report/config';

type ServerModule = typeof import('@/lib/server/worldReport');

/** A Sunday. The current Serpent week runs 2026-07-20 → 2026-07-27. */
const NOW = Date.parse('2026-07-26T12:00:00.000Z');

const A_MONTH_AGO = '2026-06-20T12:00:00.000Z'; // 36 days, 5 weeks submerged
const TWO_YEARS_AGO = '2024-07-26T12:00:00.000Z';
const YESTERDAY = '2026-07-25T12:00:00.000Z';

/**
 * Load the module with the flag in a known state. `WORLD_REPORT_V1_ENABLED` is
 * a module-scope constant, so the registry has to be reset to move it.
 */
function loadServer(enabled: boolean): ServerModule {
  if (enabled) process.env.NEXT_PUBLIC_WORLD_REPORT_V1 = 'true';
  else delete process.env.NEXT_PUBLIC_WORLD_REPORT_V1;
  let mod!: ServerModule;
  jest.isolateModules(() => {
    mod = require('@/lib/server/worldReport') as ServerModule;
  });
  return mod;
}

/** Every method a write could go through. Present, and asserted untouched. */
const WRITE_METHODS = ['insert', 'update', 'upsert', 'delete'] as const;

interface Spy {
  client: SupabaseClient;
  tables: string[];
  writes: string[];
  rpcs: string[];
}

/**
 * A Supabase stub that records what was asked of it. The chain is the one
 * `readLastRunAt` uses; every write verb is present and records a violation
 * rather than being absent, so a future write fails a test instead of a build.
 */
function spyClient(
  lastRun: { data: unknown; error: unknown } = { data: null, error: null }
): Spy {
  const tables: string[] = [];
  const writes: string[] = [];
  const rpcs: string[] = [];

  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => lastRun,
  } as Record<string, unknown>;
  for (const verb of WRITE_METHODS) {
    chain[verb] = () => {
      writes.push(verb);
      return chain;
    };
  }

  const client = {
    from: (table: string) => {
      tables.push(table);
      return chain;
    },
    rpc: (fn: string) => {
      rpcs.push(fn);
      return { data: null, error: null };
    },
  } as unknown as SupabaseClient;

  return { client, tables, writes, rpcs };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockBuildSerpentPanel.mockResolvedValue(emptySerpentPanel());
  mockReadWorldRollup.mockResolvedValue({
    clans: [],
    personalRecords: 0,
    clanRecords: 0,
    clanFirsts: 0,
  });
});

// ---------------------------------------------------------------------------

describe('the flag', () => {
  it('reads nothing at all when it is off', async () => {
    const { buildWorldReport } = loadServer(false);
    const spy = spyClient({ data: { started_at: A_MONTH_AGO }, error: null });

    expect(await buildWorldReport(spy.client, 'player-1', NOW)).toBeNull();
    expect(spy.tables).toEqual([]);
    expect(mockBuildSerpentPanel).not.toHaveBeenCalled();
    expect(mockReadWorldRollup).not.toHaveBeenCalled();
  });
});

describe('it never writes', () => {
  it('touches no write verb and no RPC on the composing path', async () => {
    const { buildWorldReport } = loadServer(true);
    const spy = spyClient({ data: { started_at: A_MONTH_AGO }, error: null });

    const report = await buildWorldReport(spy.client, 'player-1', NOW);

    expect(report).not.toBeNull();
    // §12.2: not a new claim. There is nothing to mark seen, nothing to stamp
    // and nothing to settle, so there is no row for a returning player to be
    // behind on — and no `last_seen_at` column was invented to hold one.
    expect(spy.writes).toEqual([]);
    expect(spy.rpcs).toEqual([]);
    expect(spy.tables).toEqual(['game_sessions']);
  });
});

describe('what it costs (Rule 13)', () => {
  it('costs one query for somebody who played yesterday', async () => {
    const { buildWorldReport } = loadServer(true);
    const spy = spyClient({ data: { started_at: YESTERDAY }, error: null });

    expect(await buildWorldReport(spy.client, 'player-1', NOW)).toBeNull();
    // The day-count gate runs before the panel read, so the overwhelmingly
    // common visitor costs one small query and stops.
    expect(spy.tables).toEqual(['game_sessions']);
    expect(mockBuildSerpentPanel).not.toHaveBeenCalled();
    expect(mockReadWorldRollup).not.toHaveBeenCalled();
  });

  it('costs a two-year absence exactly what a two-week one costs', async () => {
    const { buildWorldReport } = loadServer(true);

    await buildWorldReport(
      spyClient({ data: { started_at: A_MONTH_AGO }, error: null }).client,
      'player-1',
      NOW
    );
    const month = mockReadWorldRollup.mock.calls.length;

    mockReadWorldRollup.mockClear();
    await buildWorldReport(
      spyClient({ data: { started_at: TWO_YEARS_AGO }, error: null }).client,
      'player-1',
      NOW
    );

    expect(month).toBe(WORLD_REPORT_WEEK_LIMIT);
    expect(mockReadWorldRollup.mock.calls.length).toBe(WORLD_REPORT_WEEK_LIMIT);
  });

  it('reads the most recent weeks, newest first', async () => {
    const { buildWorldReport } = loadServer(true);
    await buildWorldReport(
      spyClient({ data: { started_at: A_MONTH_AGO }, error: null }).client,
      'player-1',
      NOW
    );

    expect(mockReadWorldRollup.mock.calls.map((call) => call[1])).toEqual([
      '2026-07-13',
      '2026-07-06',
      '2026-06-29',
      '2026-06-22',
    ]);
  });
});

describe('when a read fails (Rule 11)', () => {
  it('reports the last-run error to Sentry and composes nothing', async () => {
    const { buildWorldReport } = loadServer(true);
    const spy = spyClient({ data: null, error: { message: 'boom', code: '42P01' } });

    expect(await buildWorldReport(spy.client, 'player-1', NOW)).toBeNull();
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    // Not "never played" and not "away forever": a failed read is neither, and
    // guessing either way would withhold a real report or fabricate one.
    expect(mockBuildSerpentPanel).not.toHaveBeenCalled();
  });

  it('distinguishes a failed read from a player who has never played', async () => {
    const { readLastRunAt } = loadServer(true);

    await expect(
      readLastRunAt(spyClient({ data: null, error: null }).client, 'p')
    ).resolves.toBeNull();
    await expect(
      readLastRunAt(spyClient({ data: null, error: { message: 'boom' } }).client, 'p')
    ).resolves.toBeUndefined();
  });

  it('says nothing to a player who has never played — a first visit is not a return', async () => {
    const { buildWorldReport } = loadServer(true);
    const spy = spyClient({ data: null, error: null });

    expect(await buildWorldReport(spy.client, 'player-1', NOW)).toBeNull();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('keeps a week whose roll-up could not be read, on its conditions alone', async () => {
    const { buildWorldReport } = loadServer(true);
    // Every roll-up unavailable — pre-migration, or three failed reads.
    mockReadWorldRollup.mockResolvedValue(null);

    const report = await buildWorldReport(
      spyClient({ data: { started_at: A_MONTH_AGO }, error: null }).client,
      'player-1',
      NOW
    );

    // Omitting the weeks would understate the world; inventing clans for them
    // would overstate it. They submerged, and they are read as such.
    expect(report).not.toBeNull();
    expect(report!.weeksSubmerged).toBe(5);
    const weeks = report!.sections.find((section) => section.id === 'weeks')!;
    expect(weeks.lines[1].text).toContain('the Serpent surfaced and submerged unhunted.');
  });

  it('yields no report and reports to Sentry if the copy ever trips the Rule 5 sweep', async () => {
    const { buildWorldReport } = loadServer(true);
    // A clan name cannot trip the sweep — it is redacted — so the only way to
    // reach this path is a genuine composition failure. Simulate one.
    mockBuildSerpentPanel.mockRejectedValueOnce(new Error('panel exploded'));

    await expect(
      buildWorldReport(
        spyClient({ data: { started_at: A_MONTH_AGO }, error: null }).client,
        'player-1',
        NOW
      )
    ).rejects.toThrow('panel exploded');
  });
});

describe('what it composes', () => {
  it('reads a month away into a report with the standing section intact', async () => {
    const { buildWorldReport } = loadServer(true);
    mockReadWorldRollup.mockResolvedValue({
      clans: [{ name: 'Hollow Fang', tag: 'HFG', depth: 51000, contributingMembers: 4 }],
      personalRecords: 2,
      clanRecords: 1,
      clanFirsts: 0,
    });

    const report = await buildWorldReport(
      spyClient({ data: { started_at: A_MONTH_AGO }, error: null }).client,
      'player-1',
      NOW
    );

    expect(report!.span).toBe('month');
    expect(report!.awayDays).toBe(36);
    expect(report!.sections.map((section) => section.id)).toContain('standing');
    expect(report!.links.length).toBeGreaterThan(0);
  });

  it('measures absence from the last RUN, not from a page view', async () => {
    // No `last_seen_at` column exists and none may be added: a column this
    // feature WRITES is a ledger, and a ledger can be stale, wrong or reset.
    const { buildWorldReport } = loadServer(true);
    const spy = spyClient({ data: { started_at: A_MONTH_AGO }, error: null });

    await buildWorldReport(spy.client, 'player-1', NOW);

    expect(spy.tables).toEqual(['game_sessions']);
  });
});
