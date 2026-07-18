/**
 * Clan Gauntlet shared module tests (Design v2 section 8) - the TS mirror
 * of migration 020: research tree, modifier lenses, weekly protocol
 * boundaries, pick validation, per-side resolution, and counted scoring
 * (including the Thu-Sun window and the +1 counted-run node).
 */

import { describe, expect, it } from '@jest/globals';
import {
  BASE_BEST_RUNS,
  BASE_TOP_MEMBERS,
  GAUNTLET_MODIFIERS,
  RESEARCH_NODES,
  RESEARCH_TIER_COSTS,
  RESEARCH_TREE_TOTAL,
  TITHE_WEEKLY_CAP,
  applyGauntletBan,
  buildSideRules,
  countedSideScore,
  gauntletPhase,
  gauntletWeekStart,
  isResearchNodeId,
  picksDeadline,
  researchNode,
  researchPrereq,
  runCountsForRules,
  scoredWindow,
  validateGauntletPicks,
  type CountedRunInput,
} from './gauntlet';
import { MUTATION_POOL } from './mutations';

// A Monday 00:00 UTC week anchor for protocol tests
const WEEK = new Date(Date.UTC(2026, 6, 13)); // Mon 2026-07-13

function run(overrides: Partial<CountedRunInput> = {}): CountedRunInput {
  return {
    memberId: 'm1',
    dnaEarned: 100,
    endedAt: new Date(Date.UTC(2026, 6, 17, 12)), // Fri - inside Thu-Sun
    dynasty: 'CYBER',
    extracted: true,
    ...overrides,
  };
}

describe('research tree v1 (section 8.3)', () => {
  it('has 3 branches x 4 nodes = 12 nodes', () => {
    expect(RESEARCH_NODES).toHaveLength(12);
    for (const branch of ['protocols', 'logistics', 'heraldry'] as const) {
      expect(RESEARCH_NODES.filter((n) => n.branch === branch)).toHaveLength(4);
    }
  });

  it("uses the doc's tier costs and full-tree total (252,000)", () => {
    expect(RESEARCH_TIER_COSTS).toEqual([6000, 14000, 24000, 40000]);
    for (const node of RESEARCH_NODES) {
      expect(node.cost).toBe(RESEARCH_TIER_COSTS[node.tier - 1]);
    }
    expect(RESEARCH_TREE_TOTAL).toBe(252000);
    expect(RESEARCH_NODES.reduce((sum, n) => sum + n.cost, 0)).toBe(252000);
  });

  it('tier N requires tier N-1 of the same branch', () => {
    expect(researchPrereq('protocols_1')).toBeNull();
    expect(researchPrereq('protocols_4')).toBe('protocols_3');
    expect(researchPrereq('logistics_2')).toBe('logistics_1');
    expect(researchPrereq('heraldry_3')).toBe('heraldry_2');
  });

  it('tithe cap is 500 DNA/member/week (a 50-member clan banks at most 25k)', () => {
    expect(TITHE_WEEKLY_CAP).toBe(500);
    expect(50 * TITHE_WEEKLY_CAP).toBe(25000);
  });

  it('logistics_4 is the only numeric node in the tree', () => {
    const numeric = RESEARCH_NODES.filter((n) =>
      n.description.includes('+1 counted run')
    );
    expect(numeric.map((n) => n.id)).toEqual(['logistics_4']);
    expect(researchNode('logistics_4').cost).toBe(40000);
  });

  it('validates node ids', () => {
    expect(isResearchNodeId('protocols_2')).toBe(true);
    expect(isResearchNodeId('protocols_5')).toBe(false);
    expect(isResearchNodeId('stat_power')).toBe(false);
  });
});

describe('modifier lenses (section 8.2 item 2)', () => {
  it('Vanguard: top 8 members (vs 10), runs weigh x1.10', () => {
    const m = GAUNTLET_MODIFIERS.vanguard;
    expect(m.topMembers).toBe(8);
    expect(m.bestRuns).toBe(30);
    expect(m.weight).toBe(1.10);
    expect(m.requiresNode).toBeNull();
  });

  it('Deep Bench: 12 members, best 25 runs each (vs 30)', () => {
    const m = GAUNTLET_MODIFIERS.deep_bench;
    expect(m.topMembers).toBe(12);
    expect(m.bestRuns).toBe(25);
    expect(m.weight).toBe(1.0);
  });

  it('Extraction Doctrine: only banked runs, x1.15', () => {
    const m = GAUNTLET_MODIFIERS.extraction_doctrine;
    expect(m.extractedOnly).toBe(true);
    expect(m.weight).toBe(1.15);
  });

  it('research options: Anomaly Doctrine (protocols_1, x1.20), Sudden Death (protocols_2, best 10, x1.40)', () => {
    expect(GAUNTLET_MODIFIERS.anomaly_doctrine.requiresNode).toBe('protocols_1');
    expect(GAUNTLET_MODIFIERS.anomaly_doctrine.weight).toBe(1.20);
    expect(GAUNTLET_MODIFIERS.anomaly_doctrine.requiresAnomalyBoard).toBe(true);
    expect(GAUNTLET_MODIFIERS.sudden_death.requiresNode).toBe('protocols_2');
    expect(GAUNTLET_MODIFIERS.sudden_death.bestRuns).toBe(10);
    expect(GAUNTLET_MODIFIERS.sudden_death.weight).toBe(1.40);
  });
});

describe('weekly protocol boundaries (section 8.1, UTC)', () => {
  it('week starts Monday 00:00 UTC', () => {
    expect(gauntletWeekStart(new Date(Date.UTC(2026, 6, 15, 9))).toISOString())
      .toBe('2026-07-13T00:00:00.000Z');
    expect(gauntletWeekStart(new Date(Date.UTC(2026, 6, 19, 23, 59))).toISOString())
      .toBe('2026-07-13T00:00:00.000Z'); // Sunday still same week
    expect(gauntletWeekStart(new Date(Date.UTC(2026, 6, 20, 0))).toISOString())
      .toBe('2026-07-20T00:00:00.000Z'); // next Monday
  });

  it('picks lock Wed 00:00; scored window is Thu 00:00 - Sun 24:00', () => {
    expect(picksDeadline(WEEK).toISOString()).toBe('2026-07-15T00:00:00.000Z');
    const window = scoredWindow(WEEK);
    expect(window.from.toISOString()).toBe('2026-07-16T00:00:00.000Z');
    expect(window.to.toISOString()).toBe('2026-07-20T00:00:00.000Z');
  });

  it('phases: Mon-Wed picks_open, Wed-Thu locked, Thu-Sun scoring', () => {
    expect(gauntletPhase(WEEK, new Date(Date.UTC(2026, 6, 13, 8)))).toBe('picks_open');
    expect(gauntletPhase(WEEK, new Date(Date.UTC(2026, 6, 14, 23, 59)))).toBe('picks_open');
    expect(gauntletPhase(WEEK, new Date(Date.UTC(2026, 6, 15, 0)))).toBe('locked');
    expect(gauntletPhase(WEEK, new Date(Date.UTC(2026, 6, 16, 0)))).toBe('scoring');
    expect(gauntletPhase(WEEK, new Date(Date.UTC(2026, 6, 19, 23)))).toBe('scoring');
  });
});

describe('pick validation (RPC mirror)', () => {
  it('accepts a plain base pick', () => {
    expect(validateGauntletPicks(
      { dynasty: 'CYBER', modifier: 'vanguard', ban: 'phoenix' },
      []
    )).toEqual([]);
  });

  it('the base three modifiers need no research; sudden_death needs protocols_2', () => {
    for (const modifier of ['vanguard', 'deep_bench', 'extraction_doctrine'] as const) {
      expect(validateGauntletPicks({ dynasty: 'PRIMAL', modifier }, [])).toEqual([]);
    }
    expect(validateGauntletPicks({ dynasty: 'PRIMAL', modifier: 'sudden_death' }, []))
      .toEqual(['MODIFIER_LOCKED:protocols_2']);
    expect(validateGauntletPicks(
      { dynasty: 'PRIMAL', modifier: 'sudden_death' },
      ['protocols_1', 'protocols_2']
    )).toEqual([]);
  });

  it('anomaly_doctrine is rejected until the Anomaly board ships', () => {
    expect(validateGauntletPicks(
      { dynasty: 'COSMIC', modifier: 'anomaly_doctrine' },
      ['protocols_1']
    )).toEqual(['ANOMALY_NOT_LIVE']);
  });

  it('dynasty split pick requires protocols_4 and two distinct dynasties', () => {
    expect(validateGauntletPicks({ dynasty: 'CYBER', dynasty2: 'PRIMAL' }, []))
      .toEqual(['SPLIT_PICK_LOCKED']);
    expect(validateGauntletPicks(
      { dynasty: 'CYBER', dynasty2: 'PRIMAL' },
      ['protocols_4']
    )).toEqual([]);
    expect(validateGauntletPicks(
      { dynasty: 'CYBER', dynasty2: 'CYBER' },
      ['protocols_4']
    )).toEqual(['INVALID_DYNASTY_SPLIT']);
  });

  it('rejects unknown dynasties and bans', () => {
    expect(validateGauntletPicks(
      { dynasty: 'VOID' as never },
      []
    )).toEqual(['INVALID_DYNASTY']);
    expect(validateGauntletPicks(
      { dynasty: 'CYBER', ban: 'not_a_mutation' as never },
      []
    )).toEqual(['INVALID_BAN']);
  });
});

describe('per-side resolution (section 8.2 - doc-precise)', () => {
  it("each clan's rules carry ITS OWN dynasty pick - no shared dynasty", () => {
    const sideA = buildSideRules({ dynasty: 'CYBER' }, [], 'phoenix');
    const sideB = buildSideRules({ dynasty: 'PRIMAL' }, [], null);
    expect(sideA.dynasty).toBe('CYBER');
    expect(sideB.dynasty).toBe('PRIMAL');
    // The ban on a side is what the OPPONENT banned against it
    expect(sideA.banned).toBe('phoenix');
    expect(sideB.banned).toBeNull();
  });

  it('a side that never picked gets the neutral lens (all dynasties)', () => {
    const side = buildSideRules(null, []);
    expect(side.dynasty).toBeNull();
    expect(side.top_members).toBe(BASE_TOP_MEMBERS);
    expect(side.best_runs).toBe(BASE_BEST_RUNS);
    expect(side.weight).toBe(1.0);
  });

  it('logistics_4 bakes 30 -> 31 into the base-30 lenses only', () => {
    expect(buildSideRules({ dynasty: 'CYBER' }, ['logistics_4']).best_runs).toBe(31);
    expect(buildSideRules(
      { dynasty: 'CYBER', modifier: 'vanguard' }, ['logistics_4']
    ).best_runs).toBe(31);
    // Deep Bench (25) and Sudden Death (10) do NOT gain the +1
    expect(buildSideRules(
      { dynasty: 'CYBER', modifier: 'deep_bench' }, ['logistics_4', 'protocols_2']
    ).best_runs).toBe(25);
    expect(buildSideRules(
      { dynasty: 'CYBER', modifier: 'sudden_death' }, ['logistics_4', 'protocols_2']
    ).best_runs).toBe(10);
  });
});

describe('counted scoring (sections 8.1 + 8.2 mirror of gauntlet_side_score)', () => {
  const rules = buildSideRules({ dynasty: 'CYBER' }, []);

  it('legacy (rules null): full week, any dynasty - duels v1 behavior', () => {
    const monday = run({ endedAt: new Date(Date.UTC(2026, 6, 13, 10)), dynasty: 'PRIMAL' });
    expect(runCountsForRules(monday, null, WEEK)).toBe(true);
    expect(countedSideScore([monday], null, WEEK)).toBe(100);
  });

  it('with rules: only Thu-Sun runs count (Mon-Wed runs are practice)', () => {
    const tuesday = run({ endedAt: new Date(Date.UTC(2026, 6, 14, 10)) });
    const friday = run();
    expect(runCountsForRules(tuesday, rules, WEEK)).toBe(false);
    expect(runCountsForRules(friday, rules, WEEK)).toBe(true);
    expect(countedSideScore([tuesday, friday], rules, WEEK)).toBe(100);
  });

  it("with rules: only the side's own picked dynasty counts", () => {
    expect(runCountsForRules(run({ dynasty: 'PRIMAL' }), rules, WEEK)).toBe(false);
    const split = buildSideRules({ dynasty: 'CYBER', dynasty2: 'PRIMAL' }, ['protocols_4']);
    expect(runCountsForRules(run({ dynasty: 'PRIMAL' }), split, WEEK)).toBe(true);
    expect(runCountsForRules(run({ dynasty: 'COSMIC' }), split, WEEK)).toBe(false);
  });

  it('extraction doctrine counts banked runs only and weighs x1.15 (floored)', () => {
    const lens = buildSideRules({ dynasty: 'CYBER', modifier: 'extraction_doctrine' }, []);
    const banked = run({ dnaEarned: 101 });
    const death = run({ extracted: false, dnaEarned: 500 });
    expect(runCountsForRules(death, lens, WEEK)).toBe(false);
    expect(countedSideScore([banked, death], lens, WEEK)).toBe(Math.floor(101 * 1.15));
  });

  it('vanguard: top 8 members, x1.10', () => {
    const lens = buildSideRules({ dynasty: 'CYBER', modifier: 'vanguard' }, []);
    const runs = Array.from({ length: 10 }, (_, i) =>
      run({ memberId: `m${i}`, dnaEarned: 100 - i })
    );
    // Top 8 of the 10 members: 100+99+...+93 = 772; x1.10 = 849.2 -> 849
    expect(countedSideScore(runs, lens, WEEK)).toBe(Math.floor(772 * 1.10));
  });

  it('best-N per member: the 31st-best run counts only with logistics_4', () => {
    const base = buildSideRules({ dynasty: 'CYBER' }, []);
    const plus1 = buildSideRules({ dynasty: 'CYBER' }, ['logistics_4']);
    const runs = Array.from({ length: 31 }, () => run({ dnaEarned: 10 }));
    expect(countedSideScore(runs, base, WEEK)).toBe(300);   // best 30
    expect(countedSideScore(runs, plus1, WEEK)).toBe(310);  // best 31
  });

  it('sudden death: best 10 runs only, x1.40', () => {
    const lens = buildSideRules(
      { dynasty: 'CYBER', modifier: 'sudden_death' }, ['protocols_1', 'protocols_2']
    );
    const runs = Array.from({ length: 12 }, () => run({ dnaEarned: 10 }));
    expect(countedSideScore(runs, lens, WEEK)).toBe(Math.floor(100 * 1.40));
  });

  it('zero-DNA runs never count (free play records dna_earned = 0)', () => {
    expect(runCountsForRules(run({ dnaEarned: 0 }), null, WEEK)).toBe(false);
    expect(runCountsForRules(run({ dnaEarned: 0 }), rules, WEEK)).toBe(false);
  });
});

describe('pool ban (section 8.2 item 3)', () => {
  it('removes exactly the banned mutation from the offer pool', () => {
    const pool = applyGauntletBan(MUTATION_POOL, 'phoenix');
    expect(pool).toHaveLength(MUTATION_POOL.length - 1);
    expect(pool).not.toContain('phoenix');
  });

  it('null ban (no duel / pre-020 / Free Play) is a no-op', () => {
    expect(applyGauntletBan(MUTATION_POOL, null)).toEqual([...MUTATION_POOL]);
  });
});
