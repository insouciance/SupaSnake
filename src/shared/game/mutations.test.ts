/**
 * Tests for the Mutation Food shared module (Design v2 section 5): the
 * Launch Ten definitions, spawn/offer rolls, and the per-food economic
 * modifier that keeps server recompute exact - including every [E]
 * mutation at its boundary food counts and the Phoenix void semantics.
 */

import {
  MUTATIONS,
  MUTATION_ECONOMICS,
  MUTATION_PHYSICS,
  MUTATION_POOL,
  MUTATION_SPAWN,
  foodValueModifier,
  isMutationId,
  rollMutationInterval,
  rollMutationOffer,
  type MutationId,
  type MutationPick,
} from './mutations';
import {
  RULESETS,
  applyOutcome,
  applyOutcomeWithMutations,
  computeRunTotals,
  outcomeMultipliers,
} from './rulesets';

describe('the Launch Ten', () => {
  it('has the launch mutations in table order, less the Rule 15 retiree', () => {
    // `shed` was removed from the POOL by Constitution v1.4 Rule 15 (kill
    // rows 23-24): it reset the tail to 8 every 25 foods, which is a rewind
    // of the difficulty clock rather than an upgrade. Its DEFINITION stays in
    // MUTATIONS so already-settled runs still recompute, which is why the
    // count below is unchanged.
    expect(MUTATION_POOL).toEqual([
      'gold_trail',
      'overgrowth',
      'wall_rush',
      'mirror_wager',
      'magnet_pulse',
      'time_dilation',
      'splitter',
      'phoenix',
      'compound_interest',
    ]);
    // 10 launch + 9 mastery (section 7.1) + 3 Season 1 seasonal (section
    // 7.2) definitions live in MUTATIONS - unchanged, because retiring a gene
    // from the pool must never delete a definition a persisted blob names.
    expect(Object.keys(MUTATIONS)).toHaveLength(22);
  });

  it('every mutation has a name, kind, one-line effect and cost', () => {
    for (const id of MUTATION_POOL) {
      const def = MUTATIONS[id];
      expect(def.id).toBe(id);
      expect(def.name.length).toBeGreaterThan(0);
      expect(['E', 'P', 'EP']).toContain(def.kind);
      expect(def.effect.length).toBeGreaterThan(0);
      expect(def.cost.length).toBeGreaterThan(0);
    }
  });

  it('isMutationId accepts pool ids and rejects everything else', () => {
    expect(isMutationId('phoenix')).toBe(true);
    expect(isMutationId('gold_trail')).toBe(true);
    expect(isMutationId('mega_snake')).toBe(false);
    expect(isMutationId(42)).toBe(false);
    expect(isMutationId(null)).toBe(false);
  });
});

describe('spawn cadence', () => {
  it('spawns once per 20 +/- 5 foods with a 40-tick despawn, cap 4 held', () => {
    expect(MUTATION_SPAWN.intervalBase).toBe(20);
    expect(MUTATION_SPAWN.intervalJitter).toBe(5);
    expect(MUTATION_SPAWN.despawnTicks).toBe(40);
    expect(MUTATION_SPAWN.maxHeld).toBe(4);
  });

  it('rollMutationInterval spans [15, 25] inclusive under the injected rng', () => {
    expect(rollMutationInterval(() => 0)).toBe(15);
    expect(rollMutationInterval(() => 0.999999)).toBe(25);
    expect(rollMutationInterval(() => 0.5)).toBe(20);

    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const value = rollMutationInterval(() => i / 1000);
      expect(value).toBeGreaterThanOrEqual(15);
      expect(value).toBeLessThanOrEqual(25);
      seen.add(value);
    }
    expect(seen.size).toBe(11);
  });
});

describe('rollMutationOffer', () => {
  it('returns two distinct mutations from the pool', () => {
    const offer = rollMutationOffer([], () => 0);
    expect(offer).toEqual(['gold_trail', 'overgrowth']);
  });

  it('never offers a mutation already held', () => {
    for (let i = 0; i < 200; i++) {
      let calls = 0;
      const rng = () => {
        calls += 1;
        return ((i * 7919 + calls * 104729) % 1000) / 1000;
      };
      const held: MutationId[] = ['gold_trail', 'phoenix', 'mirror_wager'];
      const offer = rollMutationOffer(held, rng);
      expect(offer).not.toBeNull();
      const [a, b] = offer!;
      expect(a).not.toBe(b);
      expect(held).not.toContain(a);
      expect(held).not.toContain(b);
    }
  });

  it('with the launch pool and cap 4 an offer is always possible', () => {
    const held = MUTATION_POOL.slice(0, MUTATION_SPAWN.maxHeld) as MutationId[];
    expect(rollMutationOffer(held, () => 0.5)).not.toBeNull();
  });

  it('returns null only when fewer than 2 candidates remain', () => {
    const held = MUTATION_POOL.slice(0, 9) as MutationId[];
    expect(rollMutationOffer(held, () => 0)).toBeNull();
  });
});

describe('foodValueModifier boundaries', () => {
  const pick = (id: MutationId, atFood: number): MutationPick => ({ id, atFood });

  it('a pick affects only foods strictly after its atFood', () => {
    const picks = [pick('overgrowth', 10)];
    expect(foodValueModifier(picks, 10)).toBe(1);
    expect(foodValueModifier(picks, 11)).toBeCloseTo(1.2, 10);
  });

  it('Gold Trail makes every 5th food after pickup golden (x3)', () => {
    const picks = [pick('gold_trail', 10)];
    expect(foodValueModifier(picks, 14)).toBe(1);
    expect(foodValueModifier(picks, 15)).toBe(3);
    expect(foodValueModifier(picks, 16)).toBe(1);
    expect(foodValueModifier(picks, 20)).toBe(3);
    expect(foodValueModifier(picks, 24)).toBe(1);
    expect(foodValueModifier(picks, 25)).toBe(3);
    // and never before pickup
    expect(foodValueModifier(picks, 5)).toBe(1);
    expect(foodValueModifier(picks, 10)).toBe(1);
  });

  it('costs apply per pick: wall_rush/shed x0.9, time_dilation x0.8, splitter x0.7', () => {
    expect(foodValueModifier([pick('wall_rush', 0)], 1)).toBeCloseTo(0.9, 10);
    expect(foodValueModifier([pick('shed', 0)], 1)).toBeCloseTo(0.9, 10);
    expect(foodValueModifier([pick('time_dilation', 0)], 1)).toBeCloseTo(0.8, 10);
    expect(foodValueModifier([pick('splitter', 0)], 1)).toBeCloseTo(0.7, 10);
  });

  it('pure-outcome and pure-physical mutations leave food value alone', () => {
    for (const id of ['mirror_wager', 'magnet_pulse', 'phoenix', 'compound_interest'] as MutationId[]) {
      expect(foodValueModifier([pick(id, 0)], 50)).toBe(1);
    }
  });

  it('modifiers multiply across held mutations', () => {
    const picks = [pick('splitter', 0), pick('time_dilation', 0), pick('overgrowth', 0)];
    expect(foodValueModifier(picks, 1)).toBeCloseTo(0.7 * 0.8 * 1.2, 10);
  });

  it('Phoenix trigger voids benefits from the trigger food onward, costs persist', () => {
    const picks = [pick('overgrowth', 10), pick('gold_trail', 10), pick('wall_rush', 12)];
    // Food 20 (= trigger food): still full modifiers
    expect(foodValueModifier(picks, 20, 20)).toBeCloseTo(1.2 * 3 * 0.9, 10);
    // Food 21+: benefits gone, wall_rush cost persists
    expect(foodValueModifier(picks, 21, 20)).toBeCloseTo(0.9, 10);
    expect(foodValueModifier(picks, 25, 20)).toBeCloseTo(0.9, 10); // golden food voided too
  });
});

describe('computeRunTotals with mutations (server recompute parity)', () => {
  it('matches an explicit per-food fold for PRIMAL with Gold Trail', () => {
    const picks: MutationPick[] = [{ id: 'gold_trail', atFood: 10 }];
    let expected = 0;
    for (let n = 1; n <= 20; n++) {
      expected += Math.round(
        RULESETS.PRIMAL.foodDnaValue(n) * foodValueModifier(picks, n)
      );
    }
    const { rawDna, score } = computeRunTotals('PRIMAL', 20, picks);
    expect(rawDna).toBe(expected);
    // Golden foods 15 (13 -> 39) and 20 (14 -> 42) add 26 + 28 over base 238
    expect(rawDna).toBe(238 + 26 + 28);
    // Score is mutation-free by design (leaderboard purity)
    expect(score).toBe(computeRunTotals('PRIMAL', 20).score);
  });

  it('matches an explicit fold for CYBER with Time Dilation picked mid-run', () => {
    const picks: MutationPick[] = [{ id: 'time_dilation', atFood: 15 }];
    let expected = 0;
    for (let n = 1; n <= 25; n++) {
      expected += Math.round(
        RULESETS.CYBER.foodDnaValue(n) * foodValueModifier(picks, n)
      );
    }
    expect(computeRunTotals('CYBER', 25, picks).rawDna).toBe(expected);
    // Foods 16-19 (25 -> 20) and 20-25 (30 -> 24): base 520 minus 20 minus 36
    expect(expected).toBe(computeRunTotals('CYBER', 25).rawDna - 4 * 5 - 6 * 6);
  });

  it('no mutations means byte-identical totals to the Phase 1 fold', () => {
    for (const dynasty of ['PRIMAL', 'CYBER', 'COSMIC'] as const) {
      expect(computeRunTotals(dynasty, 60, [])).toEqual(computeRunTotals(dynasty, 60));
    }
  });

  it('a Phoenix trigger only ever lowers the recomputed total', () => {
    const picks: MutationPick[] = [
      { id: 'overgrowth', atFood: 15 },
      { id: 'phoenix', atFood: 20 },
    ];
    const untriggered = computeRunTotals('PRIMAL', 40, picks, null).rawDna;
    const triggered = computeRunTotals('PRIMAL', 40, picks, 25).rawDna;
    expect(triggered).toBeLessThan(untriggered);
  });

  it('remains integer and repeatable under mutations', () => {
    const picks: MutationPick[] = [
      { id: 'splitter', atFood: 15 },
      { id: 'overgrowth', atFood: 20 },
      { id: 'gold_trail', atFood: 30 },
    ];
    const first = computeRunTotals('CYBER', 55, picks, 40);
    const second = computeRunTotals('CYBER', 55, picks, 40);
    expect(first).toEqual(second);
    expect(Number.isInteger(first.rawDna)).toBe(true);
  });
});

describe('outcomeMultipliers + applyOutcomeWithMutations', () => {
  const picksOf = (...ids: MutationId[]): MutationPick[] =>
    ids.map((id, i) => ({ id, atFood: 15 * (i + 1) }));

  it('defaults to the Phase 1 bank/salvage with no mutations', () => {
    expect(outcomeMultipliers([])).toEqual({ bank: 1.25, death: 0.6 });
    expect(applyOutcomeWithMutations(1000, true)).toBe(applyOutcome(1000, true));
    expect(applyOutcomeWithMutations(1000, false)).toBe(applyOutcome(1000, false));
  });

  it('Mirror Wager: bank x1.50, salvage x0.30', () => {
    const picks = picksOf('mirror_wager');
    expect(outcomeMultipliers(picks)).toEqual({ bank: 1.5, death: 0.3 });
    expect(applyOutcomeWithMutations(1000, true, picks)).toBe(1500);
    expect(applyOutcomeWithMutations(1000, false, picks)).toBe(300);
  });

  it('Compound Interest: +10% bank per mutation held, incl. itself', () => {
    expect(outcomeMultipliers(picksOf('compound_interest')).bank).toBeCloseTo(1.35, 10);
    const four = picksOf('compound_interest', 'wall_rush', 'shed', 'magnet_pulse');
    // 4 held -> x1.65 exactly as in the section 5.2 table
    expect(outcomeMultipliers(four).bank).toBeCloseTo(1.65, 10);
    expect(applyOutcomeWithMutations(1000, true, four)).toBe(1650);
  });

  it('Mirror Wager + Compound Interest stack additively on the bank', () => {
    const picks = picksOf('mirror_wager', 'compound_interest', 'wall_rush', 'shed');
    expect(outcomeMultipliers(picks).bank).toBeCloseTo(1.9, 10);
    expect(outcomeMultipliers(picks).death).toBeCloseTo(0.3, 10);
  });

  it('a Phoenix trigger strips outcome benefits but keeps the Wager salvage cost', () => {
    const picks = picksOf('mirror_wager', 'compound_interest', 'phoenix');
    expect(outcomeMultipliers(picks, true)).toEqual({ bank: 1.25, death: 0.3 });
    // Reporting a trigger can therefore never raise a payout
    expect(applyOutcomeWithMutations(1000, true, picks, true)).toBeLessThan(
      applyOutcomeWithMutations(1000, true, picks, false)
    );
    expect(applyOutcomeWithMutations(1000, false, picks, true)).toBe(
      applyOutcomeWithMutations(1000, false, picks, false)
    );
  });

  it('death salvage never benefits from mutations', () => {
    for (const id of MUTATION_POOL) {
      const { death } = outcomeMultipliers(picksOf(id));
      expect(death).toBeLessThanOrEqual(0.6);
    }
  });

  it('floors once at the end (single float->int boundary)', () => {
    const picks = picksOf('mirror_wager');
    expect(applyOutcomeWithMutations(333, true, picks)).toBe(Math.floor(333 * 1.5));
    expect(applyOutcomeWithMutations(333, false, picks)).toBe(Math.floor(333 * 0.3));
    expect(applyOutcomeWithMutations(-10, true, picks)).toBe(0);
    expect(applyOutcomeWithMutations(NaN, true, picks)).toBe(0);
  });
});

describe('physics constants (engine tuning single source of truth)', () => {
  it('carries the section 5.2 physical numbers', () => {
    expect(MUTATION_PHYSICS.goldTrailPortalTicks).toBe(60);
    expect(MUTATION_PHYSICS.overgrowthExtraSegments).toBe(2);
    expect(MUTATION_PHYSICS.shedEveryFoods).toBe(25);
    expect(MUTATION_PHYSICS.shedResetLength).toBe(8);
    expect(MUTATION_PHYSICS.magnetRadius).toBe(2);
    expect(MUTATION_PHYSICS.magnetPortalIntervalPenalty).toBe(4);
    expect(MUTATION_PHYSICS.timeDilationSlowMs).toBe(40);
    expect(MUTATION_PHYSICS.phoenixRewindCells).toBe(3);
    expect(MUTATION_PHYSICS.phoenixRebirthLength).toBe(8);
    expect(MUTATION_ECONOMICS.goldTrailEveryNth).toBe(5);
  });
});
