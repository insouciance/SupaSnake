/**
 * The Monday briefing's reading logic (Constitution §7.3, Rules 5, 8, 14).
 *
 * The pure half is tested first and hardest because the two cases that decide
 * whether this whole work package is honest are cases about ABSENCE — a player
 * with one week and no clan, and a player with no row for the week at all —
 * and both are decidable without a DOM.
 */

import {
  BRIEFING_WEEK_LIMIT,
  defaultBriefingWeek,
  formatWeekStart,
  isSerpentWeekKey,
  listBriefingWeeks,
  readWeekBriefing,
  segments,
  signedSegments,
} from './briefing';
import { emptySerpentPanel, type SerpentPanel } from '@/lib/server/serpent';

// 2026-07-27 is a Monday; 2026-07-20 the Monday before it.
const THIS_MONDAY = '2026-07-27';
const LAST_MONDAY = '2026-07-20';
const NOW = Date.parse('2026-07-27T09:00:00.000Z'); // Monday morning.

function panelWith(overrides: Partial<SerpentPanel> = {}): SerpentPanel {
  return { ...emptySerpentPanel(), ...overrides };
}

describe('week keys', () => {
  it('accepts a Monday and rejects any other day', () => {
    expect(isSerpentWeekKey(THIS_MONDAY)).toBe(true);
    expect(isSerpentWeekKey('2026-07-28')).toBe(false); // Tuesday
    expect(isSerpentWeekKey('2026-07-26')).toBe(false); // Sunday
  });

  it('rejects malformed and impossible keys instead of coercing them', () => {
    expect(isSerpentWeekKey('')).toBe(false);
    expect(isSerpentWeekKey('last-week')).toBe(false);
    expect(isSerpentWeekKey('2026-13-01')).toBe(false);
    expect(isSerpentWeekKey('2026-02-30')).toBe(false);
  });

  it('formats a week key in UTC, so the label never slips a day', () => {
    expect(formatWeekStart(LAST_MONDAY)).toBe('20 July 2026');
    expect(formatWeekStart('not-a-date')).toBe('not-a-date');
  });
});

describe('defaultBriefingWeek', () => {
  it('opens on the week that just submerged, from the calendar alone', () => {
    expect(defaultBriefingWeek(NOW)).toBe(LAST_MONDAY);
  });

  it('is the same answer for a player with no history at all (Rule 5)', () => {
    // The point: it does not consult history, so a player who was away still
    // gets last week's briefing rather than nothing.
    expect(defaultBriefingWeek(Date.parse('2026-07-31T23:00:00.000Z'))).toBe(LAST_MONDAY);
  });
});

describe('readWeekBriefing at N = 1', () => {
  it('reads a solo player’s first week without a clan and without a rival', () => {
    const panel = panelWith({
      live: true,
      week: {
        id: 'w1',
        weekStart: THIS_MONDAY,
        startsAt: '2026-07-27T00:00:00.000Z',
        endsAt: '2026-08-03T00:00:00.000Z',
        seed: 'S00000001',
        modifiers: [],
        settledAt: null,
      },
      you: { ...emptySerpentPanel().you, depth: 320, attempts: 2 },
      history: [],
    });

    const briefing = readWeekBriefing(panel, THIS_MONDAY, NOW);

    expect(briefing).not.toBeNull();
    expect(briefing!.hunted).toBe(true);
    expect(briefing!.yourDepth).toBe(320);
    expect(briefing!.priorBest).toBe(0);
    expect(briefing!.deltaVsPriorBest).toBe(320);
    expect(briefing!.deepestYet).toBe(true);
    expect(briefing!.clanDepth).toBeNull();
    expect(briefing!.submerged).toBe(false);
  });

  it('reads a clan of one: the clan Depth equals the member’s and is still real', () => {
    const panel = panelWith({
      live: true,
      you: { ...emptySerpentPanel().you, depth: 320, attempts: 1 },
      clan: {
        id: 'c1',
        name: 'Lone Coil',
        tag: 'LC',
        memberCount: 1,
        depth: 320,
        bestWeekDepth: 0,
        lifetimeDepth: 320,
        members: [{ playerId: 'p1', handle: 'Sans_Souci', depth: 320, attempts: 1 }],
        hiddenMembers: 0,
      },
      history: [{ weekStart: LAST_MONDAY, depth: 320, clanDepth: 320 }],
    });

    const briefing = readWeekBriefing(panel, LAST_MONDAY, NOW);

    expect(briefing!.hunted).toBe(true);
    expect(briefing!.clanDepth).toBe(320);
    // The one prior week is this week, so it is not a prior best of its own.
    expect(briefing!.priorBest).toBe(0);
  });
});

describe('readWeekBriefing for a player who missed the week (Rule 5)', () => {
  const panel = panelWith({
    live: true,
    you: { ...emptySerpentPanel().you, bestWeekDepth: 1400, lifetimeDepth: 4200 },
    history: [
      { weekStart: '2026-07-06', depth: 1400, clanDepth: 1400 },
      { weekStart: '2026-07-13', depth: 900, clanDepth: 900 },
      // Nothing at all for 2026-07-20: they were away.
    ],
  });

  it('still returns a briefing for the week with no row in it', () => {
    const briefing = readWeekBriefing(panel, LAST_MONDAY, NOW);
    expect(briefing).not.toBeNull();
    expect(briefing!.hunted).toBe(false);
    expect(briefing!.yourDepth).toBe(0);
    expect(briefing!.submerged).toBe(true);
  });

  it('leaves the prior best standing — nothing is taken for being away', () => {
    const briefing = readWeekBriefing(panel, LAST_MONDAY, NOW);
    expect(briefing!.priorBest).toBe(1400);
    expect(briefing!.deepestYet).toBe(false);
  });

  it('does not make a missed week look like a defeat of the earlier ones', () => {
    const before = readWeekBriefing(panel, '2026-07-06', NOW)!;
    const missed = readWeekBriefing(panel, LAST_MONDAY, NOW)!;
    // The earlier week reads exactly the same whether or not a later week was
    // missed: no field in this module is ever written, only derived.
    expect(before.yourDepth).toBe(1400);
    expect(before.deepestYet).toBe(true);
    expect(missed.priorBest).toBe(before.yourDepth);
  });
});

describe('readWeekBriefing refuses to invent a week', () => {
  const panel = panelWith({ live: true });

  it('returns null for a key that is not a Monday', () => {
    expect(readWeekBriefing(panel, '2026-07-28', NOW)).toBeNull();
  });

  it('returns null for a week that has not started', () => {
    expect(readWeekBriefing(panel, '2026-08-03', NOW)).toBeNull();
  });

  it('returns null for junk rather than silently falling back', () => {
    expect(readWeekBriefing(panel, 'this-week', NOW)).toBeNull();
  });
});

describe('listBriefingWeeks', () => {
  it('always offers the week that just submerged, even with empty history', () => {
    expect(listBriefingWeeks(panelWith(), NOW)).toEqual([LAST_MONDAY]);
  });

  it('merges history, newest first, and never lists the running week', () => {
    const weeks = listBriefingWeeks(
      panelWith({
        history: [
          { weekStart: '2026-07-06', depth: 1, clanDepth: null },
          { weekStart: THIS_MONDAY, depth: 5, clanDepth: null }, // still running
          { weekStart: '2026-07-13', depth: 2, clanDepth: null },
        ],
      }),
      NOW
    );
    expect(weeks).toEqual([LAST_MONDAY, '2026-07-13', '2026-07-06']);
  });

  it('caps the list rather than growing without bound', () => {
    const history = Array.from({ length: 30 }, (_, i) => ({
      weekStart: new Date(Date.parse('2026-07-20T00:00:00.000Z') - (i + 1) * 7 * 86400_000)
        .toISOString()
        .slice(0, 10),
      depth: 10,
      clanDepth: null,
    }));
    expect(listBriefingWeeks(panelWith({ history }), NOW)).toHaveLength(
      BRIEFING_WEEK_LIMIT
    );
  });
});

describe('segment phrasing', () => {
  it('says "1 segment" — the singular is a real case at N = 1', () => {
    expect(segments(1)).toBe('1 segment');
    expect(segments(0)).toBe('0 segments');
    expect(segments(1234)).toBe('1,234 segments');
  });

  it('signs a delta without turning a negative one into a verdict', () => {
    expect(signedSegments(240)).toBe('+240 segments');
    expect(signedSegments(-90)).toBe('-90 segments');
    expect(signedSegments(0)).toBe('0 segments');
  });
});
