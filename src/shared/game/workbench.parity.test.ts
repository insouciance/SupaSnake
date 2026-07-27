/**
 * WORKBENCH PARITY — the Workbench and the engine are one calculation.
 *
 * A build calculator is only worth having if its answer is the game's answer.
 * These tests never assert a hand-written expected number: for every case they
 * rebuild the run input from the reading and call `strainActivations`,
 * `computeGenomeRunTotals`, `applyGenomeOutcome` and `geneWeight` DIRECTLY,
 * then assert the reading agrees. A number the suite invents is a number that
 * can be wrong in the same direction as the code it is checking.
 *
 * Four of the cases are the ones where a hand-rolled tier calculator diverges
 * from `strainActivations` — the exact reason the Workbench is forbidden from
 * having one. Each is asserted twice: once for parity, and once for the
 * behaviour that a naive `points >= threshold` comparison would have got wrong.
 */

import { strainActivations, type GenomeRunInput } from '@/shared/game/genome';
import { geneWeight } from '@/shared/game/offerGravity';
import {
  applyGenomeOutcome,
  computeGenomeRunTotals,
} from '@/shared/game/rulesets';
import { STRAIN_THRESHOLDS, capSpawnPoints } from '@/shared/game/strains';
import type { GeneId } from '@/shared/game/genes';
import {
  conditionFromAnomaly,
  type ConditionInput,
} from '@/shared/game/worldCondition';
import {
  rankInventory,
  readWorkbench,
  type WorkbenchAccount,
  type WorkbenchPlan,
  type WorkbenchReading,
  type WorkbenchSnake,
} from '@/shared/game/workbench';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A veteran account: every FTUE gate open, so nothing is capped by ramp. */
const VETERAN: WorkbenchAccount = {
  bankedRuns: 40,
  ownedVariants: 6,
  seasonalGeneIds: [],
  gauntletBan: null,
  runFoods: [40, 90, 120, 60, 150],
};

function snake(over: Partial<WorkbenchSnake> = {}): WorkbenchSnake {
  return {
    id: 'snake-1',
    name: 'Vyper',
    dynasty: 'CYBER',
    generation: 4,
    traits: [],
    lineage: null,
    masteryLevel: 10,
    ...over,
  };
}

const AURUM_FOUR: GeneId[] = ['gold_trail', 'compound_interest', 'loan_shark', 'tithe'];

function plan(genes: GeneId[], infuses = 0): WorkbenchPlan {
  return { genes, infuses };
}

/**
 * Rebuild the exact `GenomeRunInput` a projection was computed from, using
 * only fields the reading publishes. This is the whole trick: if the reading
 * cannot be turned back into the engine's input, it was not computed from one.
 */
function inputAt(reading: WorkbenchReading, foods: number): GenomeRunInput {
  return {
    picks: reading.picks.filter((p) => p.atFood <= foods),
    heirloom: reading.heirloom,
    surges: [],
    infuses: reading.infuseFoods
      .filter((atFood) => atFood <= foods)
      .map((atFood) => ({ atFood })),
    revive: null,
    tierCap: reading.tierCap,
    suppressedStrains: reading.condition.suppressed,
    splicesEnabled: reading.ftue.splicesUnlocked,
  };
}

function assertProjectionParity(
  reading: WorkbenchReading,
  condition: ConditionInput
): void {
  expect(reading.projections.length).toBeGreaterThan(0);
  for (const projection of reading.projections) {
    const genome = inputAt(reading, projection.foods);
    const totals = computeGenomeRunTotals(
      reading.snake.dynasty,
      projection.foods,
      genome,
      reading.snake.traits,
      condition
    );
    expect(projection.rawDna).toBe(totals.rawDna);
    expect(projection.banked).toBe(
      applyGenomeOutcome(totals.rawDna, true, genome, reading.snake.traits, condition)
    );
    expect(projection.salvaged).toBe(
      applyGenomeOutcome(totals.rawDna, false, genome, reading.snake.traits, condition)
    );
    // Yield is not rawDna, and the reading must not quietly conflate them.
    expect(projection.banked).toBe(
      Math.floor(projection.rawDna * projection.bankMultiplier)
    );
    expect(projection.salvaged).toBe(
      Math.floor(projection.rawDna * projection.salvageMultiplier)
    );
  }
}

function assertStrainParity(
  reading: WorkbenchReading,
  condition: ConditionInput
): void {
  const expected = strainActivations(
    reading.picks,
    reading.heirloom,
    [],
    reading.tierCap,
    reading.condition.suppressed,
    reading.condition.thresholdDelta
  );
  for (const strain of reading.strains) {
    const activation = expected[strain.strain];
    expect(strain.points).toBe(activation.points);
    expect(strain.genes).toBe(activation.genes);
    expect(strain.minorAt).toBe(activation.minorAt);
    expect(strain.expressionAt).toBe(activation.expressionAt);
    expect(strain.apexAt).toBe(activation.apexAt);
  }
  expect(condition).toBeDefined();
}

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

describe('the Workbench computes with the engine, never beside it', () => {
  const cases: {
    name: string;
    snake: WorkbenchSnake;
    account: WorkbenchAccount;
    plan: WorkbenchPlan;
    condition: ConditionInput;
  }[] = [
    {
      name: 'an empty plan under no condition',
      snake: snake(),
      account: VETERAN,
      plan: plan([]),
      condition: null,
    },
    {
      name: 'a six-gene CYBER plan under no condition',
      snake: snake(),
      account: VETERAN,
      plan: plan([
        'gold_trail',
        'compound_interest',
        'time_dilation',
        'splitter',
        'shed',
        'overgrowth',
      ]),
      condition: null,
    },
    {
      name: 'a plan that fuses, with infuses, under a bare anomaly',
      snake: snake({ dynasty: 'PRIMAL', traits: ['hoarder'] }),
      account: VETERAN,
      plan: plan(['gold_trail', 'compound_interest', 'overgrowth', 'shed'], 2),
      condition: 'overgrown',
    },
    {
      name: 'a COSMIC plan under an anomaly and a clause',
      snake: snake({
        dynasty: 'COSMIC',
        lineage: { strains: ['FLUX'], strength: 2 },
      }),
      account: VETERAN,
      plan: plan(['magnet_pulse', 'wall_rush', 'pocket_rift', 'gravity_well']),
      condition: conditionFromAnomaly('overgrown', ['clause:shallow_expression']),
    },
    {
      name: 'a plan on an account with no history at all',
      snake: snake(),
      account: { ...VETERAN, runFoods: [] },
      plan: plan(['gold_trail', 'compound_interest']),
      condition: null,
    },
  ];

  for (const testCase of cases) {
    it(`${testCase.name} — projections match the fold`, () => {
      const reading = readWorkbench(
        testCase.snake,
        testCase.plan,
        testCase.account,
        testCase.condition
      );
      assertProjectionParity(reading, testCase.condition);
    });

    it(`${testCase.name} — strains match strainActivations`, () => {
      const reading = readWorkbench(
        testCase.snake,
        testCase.plan,
        testCase.account,
        testCase.condition
      );
      assertStrainParity(reading, testCase.condition);
    });

    it(`${testCase.name} — offer shares match geneWeight`, () => {
      const reading = readWorkbench(
        testCase.snake,
        testCase.plan,
        testCase.account,
        testCase.condition
      );
      const ctx = {
        runSeed: '',
        offerIndex: 0,
        picks: [],
        pool: reading.pool,
        points: capSpawnPoints(reading.heirloom),
        lineage: reading.lineageBias,
        anomalyStrain: reading.condition.tilt,
      };
      const total = reading.offers.firstOffer.reduce(
        (sum, entry) => sum + entry.breakdown.total,
        0
      );
      for (const entry of reading.offers.firstOffer) {
        // The breakdown IS the weight — the scalar is defined as its total.
        expect(entry.breakdown.total).toBe(geneWeight(entry.gene, ctx));
        expect(entry.share).toBeCloseTo(entry.breakdown.total / total, 12);
      }
      const sum = reading.offers.firstOffer.reduce((a, b) => a + b.share, 0);
      if (reading.offers.firstOffer.length > 0) expect(sum).toBeCloseTo(1, 10);
    });
  }
});

// ---------------------------------------------------------------------------
// The four cases a hand-rolled tier calculator gets wrong
// ---------------------------------------------------------------------------

describe('the four divergences that forbid a hand-rolled tier calculator', () => {
  it('4 points with only 2 in-run genes is an Expression, not an Apex', () => {
    // Lineage AURUM strength 1 (+1) and an AURUM Heirloom trait (+1) spawn 2
    // points; two AURUM picks bring it to 4. Points say Apex; the gene gate
    // says no, and the gate wins.
    const target = snake({
      lineage: { strains: ['AURUM'], strength: 1 },
      traits: ['scavenger'],
    });
    const reading = readWorkbench(
      target,
      plan(AURUM_FOUR.slice(0, 2)),
      VETERAN,
      null
    );
    const aurum = reading.strains.find((s) => s.strain === 'AURUM');
    expect(aurum).toBeDefined();
    expect(aurum?.points).toBe(STRAIN_THRESHOLDS.apex);
    expect(aurum?.genes).toBe(2);
    expect(aurum?.tier).toBe(2);
    expect(aurum?.apexAt).toBeNull();
    // And the reading says WHY, in the terms a player can act on.
    expect(aurum?.blockedBy).toBe('genes');
    expect(aurum?.genesNeeded).toBe(
      STRAIN_THRESHOLDS.apexMinGenes - STRAIN_THRESHOLDS.expressionMinGenes
    );
    assertStrainParity(reading, null);
  });

  it('tierCap 1 holds a 4-point 3-gene strain at its minor passive', () => {
    // A brand-new account: `ftueTierCap` is 1 because Expressions are not
    // unlocked. The cap binds the ECONOMY, so a calculator that ignored it
    // would promise an Expression the run would never be paid for.
    const newcomer: WorkbenchAccount = {
      ...VETERAN,
      bankedRuns: 0,
      runFoods: [30, 45],
    };
    const target = snake({ masteryLevel: 0 });
    const reading = readWorkbench(target, plan(AURUM_FOUR), newcomer, null);
    expect(reading.tierCap).toBe(1);
    const aurum = reading.strains.find((s) => s.strain === 'AURUM');
    expect(aurum?.points).toBeGreaterThanOrEqual(STRAIN_THRESHOLDS.apex);
    expect(aurum?.genes).toBeGreaterThanOrEqual(STRAIN_THRESHOLDS.apexMinGenes);
    expect(aurum?.tier).toBe(1);
    expect(aurum?.expressionAt).toBeNull();
    expect(aurum?.blockedBy).toBe('tierCap');
    assertStrainParity(reading, null);
    assertProjectionParity(reading, null);
  });

  it('a suppressed strain stops at its minor passive however many points it holds', () => {
    const condition = conditionFromAnomaly(null, ['clause:aurum_dampened']);
    const reading = readWorkbench(snake(), plan(AURUM_FOUR), VETERAN, condition);
    expect(reading.condition.suppressed).toContain('AURUM');
    const aurum = reading.strains.find((s) => s.strain === 'AURUM');
    expect(aurum?.points).toBeGreaterThanOrEqual(STRAIN_THRESHOLDS.apex);
    expect(aurum?.tier).toBe(1);
    expect(aurum?.suppressed).toBe(true);
    expect(aurum?.blockedBy).toBe('suppressed');
    assertStrainParity(reading, condition);
    assertProjectionParity(reading, condition);
  });

  it('a 3-point heirloom is capped to 2 before anything else happens', () => {
    // Lineage UMBRA strength 1 (+1) plus two UMBRA Heirloom traits (+2) is
    // three raw spawn points. `capSpawnPoints` clamps it to 2 — you can never
    // spawn closer than one pick from an Expression — and every downstream
    // number must be computed from the CAPPED value.
    const target = snake({
      lineage: { strains: ['UMBRA'], strength: 1 },
      traits: ['gambler', 'iron_scales'],
    });
    const reading = readWorkbench(target, plan(['mirror_wager']), VETERAN, null);
    expect(reading.heirloom.UMBRA).toBe(STRAIN_THRESHOLDS.maxSpawnPoints);
    const umbra = reading.strains.find((s) => s.strain === 'UMBRA');
    // 2 capped spawn points + 1 pick = 3 points, not the uncapped 4.
    expect(umbra?.points).toBe(STRAIN_THRESHOLDS.expression);
    expect(umbra?.genes).toBe(1);
    // Three points reach the Expression threshold, but one pick does not reach
    // the gene gate, so the strain sits on its minor passive.
    expect(umbra?.tier).toBe(1);
    expect(umbra?.blockedBy).toBe('genes');
    assertStrainParity(reading, null);
    assertProjectionParity(reading, null);
  });
});

// ---------------------------------------------------------------------------
// Honesty constraints, asserted rather than promised
// ---------------------------------------------------------------------------

describe('the honesty constraints hold', () => {
  const reading = readWorkbench(
    snake({ lineage: { strains: ['AURUM'], strength: 2 }, traits: ['scavenger'] }),
    plan(AURUM_FOUR, 1),
    VETERAN,
    conditionFromAnomaly('overgrown', ['clause:aurum_ascendant'])
  );

  it('projects at three labelled bases, each carrying its sample size', () => {
    expect(reading.projections.map((p) => p.basis)).toEqual([
      'floor',
      'median',
      'best',
    ]);
    const [floor, median, best] = reading.projections;
    expect(floor.sampleSize).toBe(0);
    expect(median.sampleSize).toBe(VETERAN.runFoods.length);
    expect(best.sampleSize).toBe(VETERAN.runFoods.length);
    expect(best.foods).toBe(Math.max(...VETERAN.runFoods));
    // The floor is the plan's own assembly point, not a number from history.
    expect(floor.foods).toBe(reading.picks[reading.picks.length - 1].atFood);
    expect(floor.genesLanded).toBe(reading.picks.length);
  });

  it('offers only median and best the player has evidence for', () => {
    const noHistory = readWorkbench(
      snake(),
      plan(AURUM_FOUR),
      { ...VETERAN, runFoods: [] },
      null
    );
    expect(noHistory.projections.map((p) => p.basis)).toEqual(['floor']);
  });

  it('reports the excluded claim ceiling instead of folding it in', () => {
    const aurumWake = reading.excluded.find((e) => e.id === 'aurumWakeDna');
    expect(aurumWake).toBeDefined();
    expect(aurumWake?.ceiling).toBeGreaterThan(0);
    // Excluded means excluded: the ceiling is reported, never added.
    for (const projection of reading.projections) {
      const genome = inputAt(reading, projection.foods);
      const totals = computeGenomeRunTotals(
        reading.snake.dynasty,
        projection.foods,
        genome,
        reading.snake.traits,
        conditionFromAnomaly('overgrown', ['clause:aurum_ascendant'])
      );
      expect(projection.rawDna).toBe(totals.rawDna);
    }
  });

  it('quotes no slot-2 figure and says so where the number would be', () => {
    expect(reading.offers.slot2).toBeNull();
    expect(reading.offers.slot2Refusal).toMatch(/not quoted/i);
    expect(reading.offers.slot2Refusal).toMatch(/25%/);
  });

  it('names the pity override conditionally, never as an assertion', () => {
    const pity = reading.offers.overrides.find((line) => /pity/i.test(line));
    expect(pity).toBeDefined();
    expect(pity).toMatch(/\bif\b/i);
  });

  it('names the unlock for every gene the snake cannot be offered', () => {
    for (const lock of reading.reachability.genes) {
      expect(lock.unlock.length).toBeGreaterThan(0);
    }
    const locked = reading.reachability.genes.map((g) => g.gene);
    // A CYBER M10 snake still cannot hold the other dynasties' signatures.
    expect(locked).toContain('heartwood');
    expect(locked).toContain('constellation_crown');
    expect(
      reading.reachability.genes.find((g) => g.gene === 'heartwood')?.unlock
    ).toMatch(/PRIMAL/);
  });

  it('names the unlock for the three splices a base pool cannot form', () => {
    const base = readWorkbench(
      snake({ masteryLevel: 0 }),
      plan([]),
      { ...VETERAN, seasonalGeneIds: [] },
      null
    );
    const unformable = base.reachability.splices.filter((s) => !s.formable);
    const ids = unformable.map((s) => s.splice);
    expect(ids).toContain('splice_comet_tail');
    expect(ids).toContain('splice_black_magnet');
    expect(ids).toContain('splice_old_growth');
    const cometTail = unformable.find((s) => s.splice === 'splice_comet_tail');
    expect(cometTail?.missing.map((m) => m.gene)).toEqual(['afterburner']);
    expect(cometTail?.missing[0].unlock).toMatch(/CYBER M6/);
    const blackMagnet = unformable.find((s) => s.splice === 'splice_black_magnet');
    expect(blackMagnet?.missing[0].unlock).toMatch(/COSMIC.*M6/);
    const oldGrowth = unformable.find((s) => s.splice === 'splice_old_growth');
    expect(oldGrowth?.missing.map((m) => m.gene).sort()).toEqual([
      'deep_roots',
      'glacial_reserve',
    ]);
    expect(
      oldGrowth?.missing.find((m) => m.gene === 'glacial_reserve')?.unlock
    ).toMatch(/[Ss]eason/);
  });

  it('an Ascetic snake gets an empty pool and says why', () => {
    const ascetic = readWorkbench(
      snake({ traits: ['ascetic'] }),
      plan(AURUM_FOUR),
      VETERAN,
      null
    );
    expect(ascetic.poolBlocked).toBe(true);
    expect(ascetic.pool).toEqual([]);
    expect(ascetic.unreachableGenes).toHaveLength(AURUM_FOUR.length);
  });

  it('order is the plan: the same genes reversed read differently', () => {
    const forward = readWorkbench(
      snake({ lineage: { strains: ['AURUM'], strength: 1 }, traits: ['scavenger'] }),
      plan(['gold_trail', 'compound_interest', 'time_dilation']),
      VETERAN,
      null
    );
    const reversed = readWorkbench(
      snake({ lineage: { strains: ['AURUM'], strength: 1 }, traits: ['scavenger'] }),
      plan(['time_dilation', 'gold_trail', 'compound_interest']),
      VETERAN,
      null
    );
    const a = forward.strains.find((s) => s.strain === 'AURUM');
    const b = reversed.strains.find((s) => s.strain === 'AURUM');
    expect(a?.points).toBe(b?.points);
    // Same points, different food — which is exactly why a set is not a plan.
    expect(a?.expressionAt).not.toBe(b?.expressionAt);
  });
});

// ---------------------------------------------------------------------------
// The inventory ranking
// ---------------------------------------------------------------------------

describe('the inventory ranking answers "which of my snakes fits this week"', () => {
  it('ranks by banked Yield and marks the snakes that ride the tilt', () => {
    const condition = conditionFromAnomaly(null, ['clause:aurum_ascendant']);
    const ranked = rankInventory(
      [
        snake({ id: 'aurum', lineage: { strains: ['AURUM'], strength: 2 } }),
        snake({ id: 'flux', lineage: { strains: ['FLUX'], strength: 1 } }),
        snake({ id: 'plain', lineage: null }),
      ],
      plan(AURUM_FOUR),
      VETERAN,
      condition
    );
    expect(ranked.length).toBe(3);
    for (let i = 1; i < ranked.length; i += 1) {
      expect(ranked[i - 1].banked).toBeGreaterThanOrEqual(ranked[i].banked);
    }
    const aurum = ranked.find((entry) => entry.snake.id === 'aurum');
    expect(aurum?.ridesTheTilt).toBe(true);
    const flux = ranked.find((entry) => entry.snake.id === 'flux');
    expect(flux?.ridesTheTilt).toBe(false);
  });
});
