/**
 * The two artifact reads whose numbers must be real (WP-1.08).
 *
 * Rule 11 is the point of most of this file: every Supabase error is checked
 * and reported, the pre-migration case is distinguished from an incident,
 * and a failed read never becomes a card of zeroes.
 */

// `jest` is deliberately NOT imported from '@jest/globals' here: the import
// would shadow the global that `jest.mock`'s hoisted factory below needs.
import { describe, it, expect, beforeEach } from '@jest/globals';
import * as Sentry from '@sentry/nextjs';
import {
  CLAN_TAG_PATTERN,
  derivedSerpentWeek,
  loadClanArtifact,
  loadSerpentWeekArtifact,
} from './artifacts';
import { serpentWeekSeed } from '@/shared/game/serpent';

jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

type Result = { data: unknown; error: unknown };

/**
 * A Supabase double keyed by table name. Each entry is the single result
 * that table's query resolves to — enough for the chained builders these
 * reads use, and it records which tables were touched.
 */
function fakeSupabase(results: Record<string, Result>) {
  const touched: string[] = [];
  const client = {
    from(table: string) {
      touched.push(table);
      const result = results[table] ?? { data: null, error: null };
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.is = chain;
      builder.ilike = chain;
      builder.maybeSingle = async () => result;
      return builder;
    },
  };
  return { client: client as any, touched };
}

beforeEach(() => {
  (Sentry.captureException as jest.Mock).mockClear();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('derivedSerpentWeek', () => {
  it('derives index, seed and modifiers from the calendar alone', () => {
    const week = derivedSerpentWeek('2026-07-20')!;
    expect(week.weekKey).toBe('2026-07-20');
    expect(week.seed).toBe(serpentWeekSeed('2026-07-20'));
    expect(week.modifierNames.length).toBeGreaterThan(0);
    expect(week.clan).toBeNull();
    expect(week.settled).toBe(false);
  });

  it('accepts only a Monday, because only a Monday names a Serpent week', () => {
    expect(derivedSerpentWeek('2026-07-21')).toBeNull(); // Tuesday
    expect(derivedSerpentWeek('2026-07-19')).toBeNull(); // Sunday
  });

  it('rejects a malformed key rather than inventing a week', () => {
    for (const bad of ['', '2026-7-20', 'yesterday', '2026-13-99', '20260720']) {
      expect(derivedSerpentWeek(bad)).toBeNull();
    }
  });
});

describe('loadSerpentWeekArtifact', () => {
  it('returns the derived week when the database has no row yet', async () => {
    const { client } = fakeSupabase({ serpent_weeks: { data: null, error: null } });
    const week = await loadSerpentWeekArtifact(client, '2026-07-20', null);
    expect(week?.seed).toBe(serpentWeekSeed('2026-07-20'));
    expect(week?.settled).toBe(false);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('prefers the stored seed and modifiers once the week exists', async () => {
    const { client } = fakeSupabase({
      serpent_weeks: {
        data: {
          id: 'week-1',
          seed: 'Sdeadbeef',
          modifiers: ['gold_rush'],
          settled_at: '2026-07-27T00:00:00Z',
        },
        error: null,
      },
    });
    const week = await loadSerpentWeekArtifact(client, '2026-07-20', null);
    expect(week?.seed).toBe('Sdeadbeef');
    expect(week?.modifierNames).toEqual(['Gold Rush']);
    expect(week?.settled).toBe(true);
  });

  it('drops modifier ids it does not recognise instead of printing them raw', async () => {
    const { client } = fakeSupabase({
      serpent_weeks: {
        data: { id: 'w', seed: 'S1', modifiers: ['gold_rush', 'not_a_modifier'], settled_at: null },
        error: null,
      },
    });
    const week = await loadSerpentWeekArtifact(client, '2026-07-20', null);
    expect(week?.modifierNames).toEqual(['Gold Rush']);
  });

  it('renders the settlement card from the settled row', async () => {
    const { client } = fakeSupabase({
      serpent_weeks: { data: { id: 'w', seed: 'S1', modifiers: [], settled_at: 'x' }, error: null },
      clans: { data: { id: 'c', name: 'Hollow Fang', tag: 'FANG', best_week_depth: 48210 }, error: null },
      serpent_week_clans: { data: { depth: 48210, contributing_members: 7 }, error: null },
    });
    const week = await loadSerpentWeekArtifact(client, '2026-07-20', 'FANG');
    expect(week?.clan).toEqual({
      name: 'Hollow Fang',
      tag: 'FANG',
      depth: 48210,
      bestWeek: true,
      contributingMembers: 7,
    });
  });

  it('claims "best week yet" only when the week IS the monotonic best', async () => {
    const { client } = fakeSupabase({
      serpent_weeks: { data: { id: 'w', seed: 'S1', modifiers: [], settled_at: 'x' }, error: null },
      clans: { data: { id: 'c', name: 'Hollow Fang', tag: 'FANG', best_week_depth: 90000 }, error: null },
      serpent_week_clans: { data: { depth: 48210, contributing_members: 7 }, error: null },
    });
    const week = await loadSerpentWeekArtifact(client, '2026-07-20', 'FANG');
    expect(week?.clan?.bestWeek).toBe(false);
    // Rules 5 and 6: an ordinary week reports what it added, and there is no
    // field here through which a decline could be rendered.
    expect(Object.keys(week!.clan!)).not.toContain('delta');
  });

  it('never treats a zero week as a best week', async () => {
    const { client } = fakeSupabase({
      serpent_weeks: { data: { id: 'w', seed: 'S1', modifiers: [], settled_at: 'x' }, error: null },
      clans: { data: { id: 'c', name: 'Quiet', tag: 'QT', best_week_depth: 0 }, error: null },
      serpent_week_clans: { data: { depth: 0, contributing_members: 0 }, error: null },
    });
    expect((await loadSerpentWeekArtifact(client, '2026-07-20', 'QT'))?.clan?.bestWeek).toBe(false);
  });

  it('ignores a clan tag that cannot be one, without querying for it', async () => {
    const { client, touched } = fakeSupabase({
      serpent_weeks: { data: { id: 'w', seed: 'S1', modifiers: [], settled_at: null }, error: null },
    });
    await loadSerpentWeekArtifact(client, '2026-07-20', 'not-a-tag');
    expect(touched).toEqual(['serpent_weeks']);
  });

  it('reports a week read failure to Sentry and falls back to the derived week', async () => {
    const { client } = fakeSupabase({
      serpent_weeks: { data: null, error: { message: 'boom', code: '08006' } },
    });
    const week = await loadSerpentWeekArtifact(client, '2026-07-20', 'FANG');
    expect(week?.seed).toBe(serpentWeekSeed('2026-07-20'));
    expect(week?.clan).toBeNull();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('reports a standing read failure without dropping the week', async () => {
    const { client } = fakeSupabase({
      serpent_weeks: { data: { id: 'w', seed: 'S1', modifiers: [], settled_at: 'x' }, error: null },
      clans: { data: { id: 'c', name: 'Hollow Fang', tag: 'FANG', best_week_depth: 1 }, error: null },
      serpent_week_clans: { data: null, error: { message: 'boom', code: '08006' } },
    });
    const week = await loadSerpentWeekArtifact(client, '2026-07-20', 'FANG');
    expect(week?.clan).toBeNull();
    expect(week?.seed).toBe('S1');
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('stays silent when the Serpent tables have not been migrated yet', async () => {
    const { client } = fakeSupabase({
      serpent_weeks: { data: null, error: { message: 'relation does not exist', code: '42P01' } },
    });
    const week = await loadSerpentWeekArtifact(client, '2026-07-20', null);
    expect(week?.seed).toBe(serpentWeekSeed('2026-07-20'));
    // A deployment state, not an incident: nothing pages a human.
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('refuses a week key that is not a Monday before touching the database', async () => {
    const { client, touched } = fakeSupabase({});
    expect(await loadSerpentWeekArtifact(client, '2026-07-22', null)).toBeNull();
    expect(touched).toEqual([]);
  });
});

describe('loadClanArtifact', () => {
  it('returns the clan card facts', async () => {
    const { client } = fakeSupabase({
      clans: {
        data: {
          name: 'Hollow Fang',
          tag: 'FANG',
          member_count: 9,
          lifetime_depth: 512000,
          best_week_depth: 48210,
        },
        error: null,
      },
    });
    expect(await loadClanArtifact(client, 'FANG')).toEqual({
      name: 'Hollow Fang',
      tag: 'FANG',
      memberCount: 9,
      lifetimeDepth: 512000,
      bestWeekDepth: 48210,
    });
  });

  it('returns null for an unknown or disbanded clan', async () => {
    const { client } = fakeSupabase({ clans: { data: null, error: null } });
    expect(await loadClanArtifact(client, 'FANG')).toBeNull();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('reports a failed read and returns null rather than a card of zeroes', async () => {
    const { client } = fakeSupabase({
      clans: { data: null, error: { message: 'boom', code: '08006' } },
    });
    expect(await loadClanArtifact(client, 'FANG')).toBeNull();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('validates the tag before querying', async () => {
    const { client, touched } = fakeSupabase({});
    expect(await loadClanArtifact(client, 'lower')).toBeNull();
    expect(await loadClanArtifact(client, 'WAYTOOLONG')).toBeNull();
    expect(await loadClanArtifact(client, 'A')).toBeNull();
    expect(touched).toEqual([]);
  });

  it('exposes the tag shape the schema enforces', () => {
    expect(CLAN_TAG_PATTERN.test('FANG')).toBe(true);
    expect(CLAN_TAG_PATTERN.test('F4NG99')).toBe(true);
    expect(CLAN_TAG_PATTERN.test('fang')).toBe(false);
  });
});
