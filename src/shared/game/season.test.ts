/**
 * Seasons + playoffs (Design v2 sections 7.2 + 8.4) - window math, the
 * bracket seeding/advance rules, and the championship-week resolution the
 * SQL mirror (maintain_season_playoffs, migration 021) must agree with.
 */

import { describe, expect, it } from '@jest/globals';
import {
  PLAYOFF_CLANS,
  PLAYOFF_WEEKS,
  SEASON_1,
  SEASON_1_MUTATIONS,
  SEASON_WEEKS,
  SEMIFINAL_SOURCES,
  championOf,
  championshipWeekStart,
  inPlayoffWindow,
  quarterfinalPairings,
  quarterfinalWeekStart,
  seasonWeekIndex,
  seasonWindow,
} from '@/shared/game/season';
import { MUTATIONS, isMutationId } from '@/shared/game/mutations';
import { MASTERY_MUTATIONS } from '@/shared/game/mastery';
import { MUTATION_POOL } from '@/shared/game/mutations';

// Season 1 as migration 021 seeds it: Monday 2026-07-20 -> 2026-09-07.
const SEASON = seasonWindow(1, new Date(Date.UTC(2026, 6, 20)));

describe('season windows (section 7.2: 6-8 weeks; 7 fixed for launch)', () => {
  it('a season is exactly 7 Monday-aligned weeks', () => {
    expect(SEASON_WEEKS).toBe(7);
    expect(SEASON.startsAt.getUTCDay()).toBe(1);
    expect(SEASON.endsAt.toISOString()).toBe('2026-09-07T00:00:00.000Z');
  });

  it('week index runs 1..7 inside the window, null outside', () => {
    expect(seasonWeekIndex(SEASON, new Date(Date.UTC(2026, 6, 20)))).toBe(1);
    expect(seasonWeekIndex(SEASON, new Date(Date.UTC(2026, 6, 26, 23)))).toBe(1);
    expect(seasonWeekIndex(SEASON, new Date(Date.UTC(2026, 7, 24)))).toBe(6);
    expect(seasonWeekIndex(SEASON, new Date(Date.UTC(2026, 8, 6, 23)))).toBe(7);
    expect(seasonWeekIndex(SEASON, new Date(Date.UTC(2026, 6, 19)))).toBeNull();
    expect(seasonWeekIndex(SEASON, new Date(Date.UTC(2026, 8, 7)))).toBeNull();
  });

  it('playoffs occupy the final 2 weeks: QF week 6, championship week 7', () => {
    expect(PLAYOFF_WEEKS).toBe(2);
    expect(quarterfinalWeekStart(SEASON).toISOString())
      .toBe('2026-08-24T00:00:00.000Z');
    expect(championshipWeekStart(SEASON).toISOString())
      .toBe('2026-08-31T00:00:00.000Z');
    expect(inPlayoffWindow(SEASON, new Date(Date.UTC(2026, 7, 23)))).toBe(false);
    expect(inPlayoffWindow(SEASON, new Date(Date.UTC(2026, 7, 24)))).toBe(true);
    expect(inPlayoffWindow(SEASON, new Date(Date.UTC(2026, 8, 6)))).toBe(true);
  });
});

describe('playoff bracket (section 8.4: top 8, single elimination)', () => {
  it('quarterfinals pair 1v8, 2v7, 3v6, 4v5 for a full field', () => {
    expect(PLAYOFF_CLANS).toBe(8);
    expect(quarterfinalPairings(8)).toEqual([
      { slot: 1, seedA: 1, seedB: 8 },
      { slot: 2, seedA: 2, seedB: 7 },
      { slot: 3, seedA: 3, seedB: 6 },
      { slot: 4, seedA: 4, seedB: 5 },
    ]);
  });

  it('short fields give the TOP seeds byes; fewer than 2 clans = no bracket', () => {
    expect(quarterfinalPairings(5)).toEqual([
      { slot: 1, seedA: 1, seedB: null },
      { slot: 2, seedA: 2, seedB: null },
      { slot: 3, seedA: 3, seedB: null },
      { slot: 4, seedA: 4, seedB: 5 },
    ]);
    expect(quarterfinalPairings(1)).toEqual([]);
    expect(quarterfinalPairings(0)).toEqual([]);
  });

  it('semifinals re-bracket QF winners: SF1 = W(QF1)vW(QF4), SF2 = W(QF2)vW(QF3)', () => {
    expect(SEMIFINAL_SOURCES).toEqual([
      { slot: 1, fromQfSlots: [1, 4] },
      { slot: 2, fromQfSlots: [2, 3] },
    ]);
  });

  it('champion = higher championship-week score among SF winners; seed breaks ties', () => {
    const a = { winnerClanId: 'clan-a', winnerScore: 12_000, winnerSeed: 3 };
    const b = { winnerClanId: 'clan-b', winnerScore: 15_000, winnerSeed: 2 };
    expect(championOf([a, b])?.winnerClanId).toBe('clan-b');
    expect(
      championOf([
        { ...a, winnerScore: 15_000 },
        b,
      ])?.winnerClanId
    ).toBe('clan-b'); // tie -> better seed (2 < 3)
    expect(championOf([a, null])).toBeNull();
    expect(championOf([null, null])).toBeNull();
  });
});

describe('Season 1 seasonal mutations (section 7.2: 2-3 per season)', () => {
  it('ships 3 mutations, all defined in the shared catalog', () => {
    expect(SEASON_1_MUTATIONS.length).toBeGreaterThanOrEqual(2);
    expect(SEASON_1_MUTATIONS.length).toBeLessThanOrEqual(3);
    for (const id of SEASON_1_MUTATIONS) {
      expect(isMutationId(id)).toBe(true);
      expect(MUTATIONS[id].effect.length).toBeGreaterThan(0);
      expect(MUTATIONS[id].cost.length).toBeGreaterThan(0);
    }
    expect(SEASON_1.seq).toBe(1);
  });

  it('is distinct from the Launch Ten and the nine mastery mutations', () => {
    const reserved = new Set<string>(MUTATION_POOL);
    for (const dynasty of ['PRIMAL', 'CYBER', 'COSMIC'] as const) {
      for (const level of [3, 6, 9] as const) {
        reserved.add(MASTERY_MUTATIONS[dynasty][level]);
      }
    }
    for (const id of SEASON_1_MUTATIONS) {
      expect(reserved.has(id)).toBe(false);
    }
  });
});
