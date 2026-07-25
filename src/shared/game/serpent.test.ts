/**
 * The World Serpent — the pure rules (Constitution §7.3, §6.2, §8.6).
 *
 * These are the acceptance tests the work package names: best-3 per member,
 * clan sums, monotonic lifetime Depth, and a non-settling run contributing
 * nothing. They run against the pure fold, so what they pin is the RULE, not a
 * particular database's mood.
 */

import { describe, expect, it } from '@jest/globals';
import {
  anomalyWeekStart,
  ANOMALY_ROTATION,
  type AnomalyId,
} from '@/shared/game/anomalies';
import { applyHarvestFactor } from '@/shared/game/energyEnvelope';
import {
  bestYields,
  describeSerpentWeek,
  foldPlayerDepth,
  isDepthEligibleRun,
  isNewBestWeek,
  projectStandings,
  serpentModifiersForWeek,
  serpentWeekEnd,
  serpentWeekHasEnded,
  serpentWeekKey,
  serpentWeekSeed,
  serpentWeekStart,
  settleSerpentWeek,
  SERPENT_COUNTED_RUNS,
  SERPENT_MODIFIERS_PER_WEEK,
  SERPENT_MODIFIER_POOL,
  type SerpentRunRow,
} from '@/shared/game/serpent';

const WEEK = 'week-1';

function run(overrides: Partial<SerpentRunRow> = {}): SerpentRunRow {
  return {
    sessionId: `s-${Math.random().toString(36).slice(2)}`,
    playerId: 'p1',
    serpentWeekId: WEEK,
    yieldDna: 100,
    endedAt: '2026-07-21T10:00:00.000Z',
    endReason: 'completed',
    validated: true,
    isFreePlay: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The calendar — server-derived, and only server-derived
// ---------------------------------------------------------------------------

describe('the week is a pure function of the UTC calendar', () => {
  it('every instant in a week resolves to the same Monday', () => {
    const monday = new Date(Date.UTC(2026, 6, 20, 0, 0, 0));
    const sunday = new Date(Date.UTC(2026, 6, 26, 23, 59, 59, 999));
    expect(serpentWeekKey(monday)).toBe('2026-07-20');
    expect(serpentWeekKey(sunday)).toBe('2026-07-20');
    // The next instant is the next week: the Serpent submerges at Sunday
    // midnight UTC, which is Monday 00:00.
    expect(serpentWeekKey(new Date(Date.UTC(2026, 6, 27, 0, 0, 0)))).toBe('2026-07-27');
  });

  it('the window is [Mon 00:00, next Mon 00:00) and exactly seven days long', () => {
    const start = serpentWeekStart(new Date(Date.UTC(2026, 6, 23)));
    const end = serpentWeekEnd(start);
    expect(end.getTime() - start.getTime()).toBe(7 * 86_400_000);
    expect(end.toISOString()).toBe('2026-07-27T00:00:00.000Z');
  });

  it('agrees with the shipped Anomaly week math on every day of two years', () => {
    // §7.3 has the Serpent absorb the weekly-Anomaly machinery. While both
    // exist they must not disagree about where a week starts.
    for (let day = 0; day < 730; day += 1) {
      const at = new Date(Date.UTC(2026, 0, 1) + day * 86_400_000);
      expect(serpentWeekStart(at).toISOString()).toBe(
        anomalyWeekStart(at).toISOString()
      );
    }
  });

  it('has submerged only once the exclusive end has passed', () => {
    const week = describeSerpentWeek(new Date(Date.UTC(2026, 6, 22)));
    expect(serpentWeekHasEnded(week, new Date(Date.UTC(2026, 6, 26, 23, 59)))).toBe(false);
    expect(serpentWeekHasEnded(week, new Date(Date.UTC(2026, 6, 27, 0, 0, 0)))).toBe(true);
  });
});

describe('the seed and the modifier set are derived, never drawn at random', () => {
  it('the same week always produces the same seed', () => {
    const a = describeSerpentWeek(new Date(Date.UTC(2026, 6, 20, 3)));
    const b = describeSerpentWeek(new Date(Date.UTC(2026, 6, 25, 21)));
    expect(a.seed).toBe(b.seed);
    expect(a.seed).toBe(serpentWeekSeed('2026-07-20'));
    expect(a.seed).toMatch(/^S[0-9a-f]{8}$/);
  });

  it('different weeks produce different seeds', () => {
    const seeds = new Set<string>();
    for (let week = 0; week < 104; week += 1) {
      seeds.add(serpentWeekSeed(serpentWeekKey(Date.UTC(2026, 0, 5) + week * 7 * 86_400_000)));
    }
    // 104 weeks, no collisions from a 32-bit hash at this size.
    expect(seeds.size).toBe(104);
  });

  it('draws its condition-set from the curated pool, deterministically', () => {
    const at = new Date(Date.UTC(2026, 6, 22));
    const first = serpentModifiersForWeek(at);
    expect(first).toHaveLength(SERPENT_MODIFIERS_PER_WEEK);
    expect(serpentModifiersForWeek(at)).toEqual(first);
    for (const id of first) expect(SERPENT_MODIFIER_POOL).toContain(id);
    // The pool IS the shipped Anomaly pool — zero new content authored (§7.3).
    expect([...SERPENT_MODIFIER_POOL]).toEqual([...ANOMALY_ROTATION]);
  });

  it('a larger draw never repeats a modifier', () => {
    const drawn = serpentModifiersForWeek(
      new Date(Date.UTC(2026, 6, 22)),
      SERPENT_MODIFIER_POOL.length
    );
    expect(new Set<AnomalyId>(drawn).size).toBe(SERPENT_MODIFIER_POOL.length);
  });

  it('every week of a year draws a modifier the engine actually implements', () => {
    for (let week = 0; week < 52; week += 1) {
      const drawn = serpentModifiersForWeek(
        new Date(Date.UTC(2026, 0, 5) + week * 7 * 86_400_000)
      );
      expect(drawn.length).toBe(SERPENT_MODIFIERS_PER_WEEK);
      for (const id of drawn) expect(SERPENT_MODIFIER_POOL).toContain(id);
    }
  });
});

// ---------------------------------------------------------------------------
// Eligibility — a run that did not settle contributes nothing
// ---------------------------------------------------------------------------

describe('a run that did not settle contributes NOTHING', () => {
  it.each(['expired', 'abandoned', 'disconnected'])(
    'an %s run is refused',
    (reason) => {
      expect(isDepthEligibleRun(run({ endReason: reason }), WEEK)).toBe(false);
      expect(foldPlayerDepth('p1', [run({ endReason: reason })], WEEK).depth).toBe(0);
    }
  );

  it('an open run is refused', () => {
    expect(isDepthEligibleRun(run({ endedAt: null }), WEEK)).toBe(false);
  });

  it('a flagged run is refused', () => {
    expect(isDepthEligibleRun(run({ validated: false }), WEEK)).toBe(false);
  });

  it('practice is refused — Free Play pays nothing, so it counts nothing', () => {
    expect(isDepthEligibleRun(run({ isFreePlay: true }), WEEK)).toBe(false);
  });

  it('a run stamped for another week is refused', () => {
    expect(isDepthEligibleRun(run({ serpentWeekId: 'week-2' }), WEEK)).toBe(false);
    expect(isDepthEligibleRun(run({ serpentWeekId: null }), WEEK)).toBe(false);
  });

  it('a pre-WP-0.01 row with no recorded Yield is refused, not guessed at', () => {
    expect(isDepthEligibleRun(run({ yieldDna: null }), WEEK)).toBe(false);
    expect(isDepthEligibleRun(run({ yieldDna: 0 }), WEEK)).toBe(false);
  });

  it('a NULL end reason reads as settled — pre-045 rows always did', () => {
    expect(isDepthEligibleRun(run({ endReason: null }), WEEK)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Best three — improvement, not volume
// ---------------------------------------------------------------------------

describe('weekly Depth is the sum of the best THREE runs', () => {
  it('takes the three largest, in descending order', () => {
    expect(bestYields([10, 90, 50, 70, 30])).toEqual([90, 70, 50]);
    expect(SERPENT_COUNTED_RUNS).toBe(3);
  });

  it('a fourth run raises Depth only by being better than the third', () => {
    const base = [run({ yieldDna: 300 }), run({ yieldDna: 200 }), run({ yieldDna: 100 })];
    const before = foldPlayerDepth('p1', base, WEEK);
    expect(before.depth).toBe(600);
    expect(before.countedYields).toEqual([300, 200, 100]);

    const worse = foldPlayerDepth('p1', [...base, run({ yieldDna: 50 })], WEEK);
    expect(worse.depth).toBe(600);
    expect(worse.attempts).toBe(4);

    const better = foldPlayerDepth('p1', [...base, run({ yieldDna: 250 })], WEEK);
    expect(better.depth).toBe(750);
    expect(better.countedYields).toEqual([300, 250, 200]);
  });

  it('twenty attempts cannot beat three good ones — the "second job" is excluded', () => {
    const grinder = Array.from({ length: 20 }, () => run({ yieldDna: 100 }));
    const shortWeek = [run({ yieldDna: 400 }), run({ yieldDna: 400 }), run({ yieldDna: 400 })];
    expect(foldPlayerDepth('p1', grinder, WEEK).depth).toBe(300);
    expect(foldPlayerDepth('p1', shortWeek, WEEK).depth).toBe(1200);
  });

  it('fewer than three runs is a complete week, not a penalty', () => {
    const one = foldPlayerDepth('p1', [run({ yieldDna: 500 })], WEEK);
    expect(one.depth).toBe(500);
    expect(one.countedYields).toEqual([500]);
    expect(one.bestYield).toBe(500);
  });

  it('only this player’s runs count toward this player’s Depth', () => {
    const runs = [run({ yieldDna: 100 }), run({ playerId: 'p2', yieldDna: 9999 })];
    expect(foldPlayerDepth('p1', runs, WEEK).depth).toBe(100);
  });

  it('Yields are floored to whole segments before they are summed', () => {
    const runs = [run({ yieldDna: 10.9 }), run({ yieldDna: 5.4 })];
    expect(foldPlayerDepth('p1', runs, WEEK).depth).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// §8.6 — Depth counts FULL-STRENGTH Yield even when the run settled lean
// ---------------------------------------------------------------------------

describe('Depth reads full-strength Yield, never the lean-adjusted DNA', () => {
  it('a lean run pays a quarter and still hunts at full depth', () => {
    const fullYield = 400;
    // What the run actually paid into the DNA balance (§8.6).
    const paid = applyHarvestFactor(fullYield, 'lean');
    expect(paid).toBe(100);

    // What the hunt counts. `SerpentRunRow` has no field for `paid` at all —
    // the lean number cannot reach Depth because it is not in the type.
    const depth = foldPlayerDepth('p1', [run({ yieldDna: fullYield })], WEEK).depth;
    expect(depth).toBe(400);
    expect(depth).not.toBe(paid);
  });

  it('charged, exempt and lean runs of equal Yield produce equal Depth', () => {
    const runs = [run({ yieldDna: 250 }), run({ yieldDna: 250 }), run({ yieldDna: 250 })];
    expect(foldPlayerDepth('p1', runs, WEEK).depth).toBe(750);
    // There is no charge-state parameter on the fold to vary: the three
    // required arguments are the player, the runs and the week.
    expect(foldPlayerDepth).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Clan Depth — additive, and only additive (Rule 8)
// ---------------------------------------------------------------------------

describe('clan Depth is an additive sum of participation', () => {
  const clanOf = (...pairs: Array<[string, string | null]>) => new Map(pairs);

  it('sums its members’ weekly Depths, exactly', () => {
    const runs = [
      run({ playerId: 'a', yieldDna: 300 }),
      run({ playerId: 'a', yieldDna: 200 }),
      run({ playerId: 'b', yieldDna: 150 }),
      run({ playerId: 'c', yieldDna: 50 }),
    ];
    const settlement = settleSerpentWeek(
      WEEK,
      runs,
      clanOf(['a', 'clan-1'], ['b', 'clan-1'], ['c', 'clan-1'])
    );
    expect(settlement.clans).toHaveLength(1);
    expect(settlement.clans[0].depth).toBe(500 + 150 + 50);
    expect(settlement.clans[0].contributingMembers).toBe(3);
  });

  it('a clan of one reads meaningfully — its Depth is its member’s Depth', () => {
    const settlement = settleSerpentWeek(
      WEEK,
      [run({ playerId: 'solo', yieldDna: 777 })],
      clanOf(['solo', 'clan-solo'])
    );
    expect(settlement.clans[0].depth).toBe(777);
    expect(settlement.clans[0].contributingMembers).toBe(1);
  });

  it('a member with zero Depth is a row, not an absence, and costs nobody anything', () => {
    const settlement = settleSerpentWeek(
      WEEK,
      [run({ playerId: 'a', yieldDna: 100 })],
      clanOf(['a', 'clan-1'], ['idle', 'clan-1']),
      ['a', 'idle']
    );
    const idle = settlement.players.find((p) => p.playerId === 'idle');
    expect(idle).toBeDefined();
    expect(idle?.depth).toBe(0);
    // Rule 8's reviewer question: the active member's number is untouched by
    // the idle one's, in both directions.
    expect(settlement.players.find((p) => p.playerId === 'a')?.depth).toBe(100);
    expect(settlement.clans[0].depth).toBe(100);
    expect(settlement.clans[0].contributingMembers).toBe(1);
  });

  it('adding a member can only ever raise a clan’s Depth, never lower it', () => {
    const runs = [
      run({ playerId: 'a', yieldDna: 100 }),
      run({ playerId: 'b', yieldDna: 1 }),
    ];
    const alone = settleSerpentWeek(WEEK, [runs[0]], clanOf(['a', 'c1']));
    const together = settleSerpentWeek(WEEK, runs, clanOf(['a', 'c1'], ['b', 'c1']));
    expect(together.clans[0].depth).toBeGreaterThan(alone.clans[0].depth);
  });

  it('a clanless member’s Depth is their own and joins no clan sum', () => {
    const settlement = settleSerpentWeek(
      WEEK,
      [run({ playerId: 'lone', yieldDna: 400 })],
      clanOf(['lone', null])
    );
    expect(settlement.players[0].depth).toBe(400);
    expect(settlement.clans).toHaveLength(0);
  });

  it('a run that did not settle adds nothing to the clan either', () => {
    const settlement = settleSerpentWeek(
      WEEK,
      [
        run({ playerId: 'a', yieldDna: 100 }),
        run({ playerId: 'a', yieldDna: 9999, endReason: 'expired' }),
      ],
      clanOf(['a', 'c1'])
    );
    expect(settlement.clans[0].depth).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Lifetime Depth — monotonic and idempotent (Rules 5 and 6)
// ---------------------------------------------------------------------------

describe('lifetime Depth is monotonic and idempotent', () => {
  it('is the SUM of the settled weeks, not an increment', () => {
    const after = projectStandings({ lifetimeDepth: 0, bestWeekDepth: 0 }, [100, 250, 80]);
    expect(after.lifetimeDepth).toBe(430);
    expect(after.bestWeekDepth).toBe(250);
  });

  it('projecting the same weeks twice yields the same number', () => {
    const weeks = [100, 250, 80];
    const once = projectStandings({ lifetimeDepth: 0, bestWeekDepth: 0 }, weeks);
    const twice = projectStandings(once, weeks);
    expect(twice).toEqual(once);
    const thrice = projectStandings(twice, weeks);
    expect(thrice).toEqual(once);
  });

  it('never decreases when the recompute shrinks — R6', () => {
    const stored = { lifetimeDepth: 5000, bestWeekDepth: 900 };
    // A session invalidated later, a member erased, a source that shrank.
    const after = projectStandings(stored, [10]);
    expect(after.lifetimeDepth).toBe(5000);
    expect(after.bestWeekDepth).toBe(900);
  });

  it('a missed week costs that week’s opportunity and nothing else — R5', () => {
    const played = projectStandings({ lifetimeDepth: 0, bestWeekDepth: 0 }, [300]);
    // Four absent weeks contribute zero rows. Nothing decays.
    const afterAbsence = projectStandings(played, [300]);
    expect(afterAbsence.lifetimeDepth).toBe(300);
    expect(afterAbsence.bestWeekDepth).toBe(300);
    // And returning simply adds the new week.
    const returned = projectStandings(afterAbsence, [300, 120]);
    expect(returned.lifetimeDepth).toBe(420);
    expect(returned.bestWeekDepth).toBe(300);
  });

  it('a new best week is strictly better than the old one', () => {
    expect(isNewBestWeek(500, 400)).toBe(true);
    expect(isNewBestWeek(400, 400)).toBe(false);
    expect(isNewBestWeek(300, 400)).toBe(false);
    expect(isNewBestWeek(0, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rule 10 / §12.2 — one weekly surface, two public numbers
// ---------------------------------------------------------------------------

describe('the Serpent adds no second cadence and no third number', () => {
  it('there is exactly one week per calendar week', () => {
    const keys = new Set<string>();
    for (let day = 0; day < 28; day += 1) {
      keys.add(serpentWeekKey(Date.UTC(2026, 6, 1) + day * 86_400_000));
    }
    expect(keys.size).toBe(5); // 28 days spans five partial ISO weeks
  });

  it('settlement produces Depth and nothing else that could be a currency', () => {
    const settlement = settleSerpentWeek(
      WEEK,
      [run({ playerId: 'a', yieldDna: 100 })],
      new Map([['a', 'c1']])
    );
    expect(Object.keys(settlement).sort()).toEqual(['clans', 'players', 'weekId']);
    expect(Object.keys(settlement.players[0]).sort()).toEqual([
      'attempts',
      'bestYield',
      'clanId',
      'countedYields',
      'depth',
      'playerId',
    ]);
    expect(Object.keys(settlement.clans[0]).sort()).toEqual([
      'clanId',
      'contributingMembers',
      'depth',
    ]);
  });
});
