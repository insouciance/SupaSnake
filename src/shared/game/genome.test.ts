/**
 * Genome math - strain activations (threshold gates), the deterministic
 * length model, outcome multipliers (clamps + revive semantics), and the
 * bounded-trust claim caps.
 */

import type { GenePick } from '@/shared/game/genes';
import {
  clampGenomeClaims,
  computeLengthTrace,
  fusePicks,
  genomeClaimCaps,
  genomeOutcomeMultipliers,
  reviveVoidsBenefits,
  sanitizeInfuses,
  sanitizeLossEvents,
  sanitizeRevive,
  sanitizeSurges,
  strainActivations,
  strainTierAtFood,
  type GenomeRunInput,
} from '@/shared/game/genome';
import {
  STRAIN_ECONOMICS,
  STRAIN_PHYSICS,
  capSpawnPoints,
  moltResetLengthFor,
} from '@/shared/game/strains';

const genome = (partial: Partial<GenomeRunInput>): GenomeRunInput => ({
  picks: [],
  heirloom: {},
  surges: [],
  infuses: [],
  revive: null,
  ...partial,
});

describe('strain activations + gates', () => {
  it('activates minor at 2 points, expression at 3 with >=2 genes', () => {
    const picks: GenePick[] = [
      { id: 'gold_trail', atFood: 10 }, // AURUM 1
      { id: 'compound_interest', atFood: 30 }, // AURUM 2 -> minor
      { id: 'loan_shark', atFood: 50 }, // AURUM 3 -> expression
    ];
    const acts = strainActivations(picks, {});
    expect(acts.AURUM.minorAt).toBe(30);
    expect(acts.AURUM.expressionAt).toBe(50);
    expect(acts.AURUM.apexAt).toBeNull();
    expect(strainTierAtFood(acts.AURUM, 31)).toBe(1);
    expect(strainTierAtFood(acts.AURUM, 51)).toBe(2);
  });

  it('spawn points activate a minor from food 0 but never gate-skip', () => {
    // 2 heirloom UMBRA points -> minor at spawn; expression still needs
    // TWO in-run UMBRA genes, not one.
    const acts1 = strainActivations(
      [{ id: 'mirror_wager', atFood: 20 }],
      { UMBRA: 2 }
    );
    expect(acts1.UMBRA.minorAt).toBe(0);
    expect(acts1.UMBRA.expressionAt).toBeNull(); // 3 points but 1 gene
    const acts2 = strainActivations(
      [
        { id: 'mirror_wager', atFood: 20 },
        { id: 'phoenix', atFood: 45 },
      ],
      { UMBRA: 2 }
    );
    expect(acts2.UMBRA.expressionAt).toBe(45); // 4 points, 2 genes
    expect(acts2.UMBRA.apexAt).toBeNull(); // apex needs 3 genes
  });

  it('spawn points are capped at 2 per strain', () => {
    expect(capSpawnPoints({ UMBRA: 5, AURUM: 1 })).toEqual({ UMBRA: 2, AURUM: 1 });
    const acts = strainActivations([], { UMBRA: 5 });
    expect(acts.UMBRA.points).toBe(2);
  });

  it('surges grant points but never count as in-run genes', () => {
    const picks: GenePick[] = [
      { id: 'gold_trail', atFood: 10 },
      { id: 'compound_interest', atFood: 30 },
    ];
    const acts = strainActivations(picks, {}, [{ strain: 'AURUM', atFood: 60 }]);
    expect(acts.AURUM.points).toBe(3);
    expect(acts.AURUM.genes).toBe(2);
    expect(acts.AURUM.expressionAt).toBe(60); // 3 points, 2 genes: gate met
  });

  it('dual-tag genes grant a point to each strain', () => {
    const acts = strainActivations([{ id: 'afterburner', atFood: 10 }], {});
    expect(acts.VOLT.points).toBe(1);
    expect(acts.AURUM.points).toBe(1);
  });
});

describe('deterministic length model', () => {
  it('grows +1/food and honors Overgrowth/Bulk Up extras', () => {
    const view = fusePicks([{ id: 'overgrowth', atFood: 5 }]);
    const acts = strainActivations([{ id: 'overgrowth', atFood: 5 }], {});
    const trace = computeLengthTrace(view, 10, acts, genome({}));
    // foods 1..5 grow +1 (3 -> 8 when eating food 6); foods 6+ grow +3.
    expect(trace.lengthAtEat[1]).toBe(3);
    expect(trace.lengthAtEat[6]).toBe(8);
    expect(trace.lengthAtEat[7]).toBe(11);
  });

  it('Shed resets to 8 every 25 foods and records the event', () => {
    const picks: GenePick[] = [{ id: 'shed', atFood: 0 }];
    const view = fusePicks(picks);
    const acts = strainActivations(picks, {});
    const trace = computeLengthTrace(view, 30, acts, genome({}));
    const event = trace.shedEvents.find((e) => e.source === 'shed');
    expect(event?.atFood).toBe(25);
    expect(trace.lengthAtEat[26]).toBe(8);
  });

  it('infuse and reported losses shrink the model at their food index', () => {
    const view = fusePicks([]);
    const acts = strainActivations([], {});
    const trace = computeLengthTrace(
      view,
      20,
      acts,
      genome({
        infuses: [{ atFood: 10 }],
        lossEvents: [{ atFood: 15, segments: 5 }],
      })
    );
    // At food 10: len was 3+10=13, minus 4 (infuse) = 9 when eating 11.
    expect(trace.lengthAtEat[11]).toBe(9);
    // At food 15: 9+4=13... eat 15 grows to 14, minus 5 = 9 when eating 16.
    expect(trace.lengthAtEat[16]).toBe(9);
  });

  it('Molt (FERAL expression) sheds proportionally and floors at the minimum', () => {
    const picks: GenePick[] = [
      { id: 'overgrowth', atFood: 0 },
      { id: 'deep_roots', atFood: 5 },
      { id: 'glacial_reserve', atFood: 10 }, // FERAL x3 genes -> expression
    ];
    const acts = strainActivations(picks, {});
    expect(acts.FERAL.expressionAt).toBe(10);
    const view = fusePicks(picks); // deep_roots+glacial fuse -> Old Growth
    const trace = computeLengthTrace(view, 40, acts, genome({ picks }));
    const molt = trace.shedEvents.find((e) => e.source === 'molt');
    expect(molt?.atFood).toBe(30); // every 20 after activation at 10
    // The shed is a fraction of the body it grew, not an absolute reset:
    // reconstruct the pre-shed length from the event and check the formula.
    const preShed = trace.lengthAtEat[31] + molt!.segmentsShed;
    expect(trace.lengthAtEat[31]).toBe(moltResetLengthFor(preShed));
    expect(trace.lengthAtEat[31]).toBeGreaterThanOrEqual(
      STRAIN_PHYSICS.moltMinLength
    );
  });

  it('keeps a Molt run bounded - length plateaus instead of growing forever', () => {
    // The reason the shed became proportional: with an absolute reset the
    // body oscillated between a fixed floor and floor+cycle forever, so the
    // board never filled and the run had no natural end. Proportionally,
    // length converges on a fixed point: L = fraction x (L + cycle growth).
    const picks: GenePick[] = [
      { id: 'overgrowth', atFood: 0 },
      { id: 'deep_roots', atFood: 5 },
      { id: 'glacial_reserve', atFood: 10 },
    ];
    const acts = strainActivations(picks, {});
    const trace = computeLengthTrace(fusePicks(picks), 400, acts, genome({ picks }));
    const late = trace.lengthAtEat.slice(200);
    // A cycle's worth of growth above the converged post-shed length is the
    // whole envelope; nothing accumulates run over run.
    expect(Math.max(...late)).toBeLessThan(200);
    const molts = trace.shedEvents.filter((e) => e.source === 'molt');
    expect(molts.length).toBe(19); // every 20 foods from activation at 10
  });

  it('applies a same-index infuse after the Molt food floor', () => {
    const picks: GenePick[] = [
      { id: 'overgrowth', atFood: 0 },
      { id: 'deep_roots', atFood: 5 },
      { id: 'glacial_reserve', atFood: 10 },
    ];
    const acts = strainActivations(picks, {});
    const base = computeLengthTrace(fusePicks(picks), 31, acts, genome({ picks }));
    const infused = computeLengthTrace(
      fusePicks(picks),
      31,
      acts,
      genome({ picks, infuses: [{ atFood: 30 }] })
    );
    // Food 30 resolves the Molt cycle and its growth floor first; only then
    // does the portal infuse pay four segments, so it can take the body
    // below what the floor would otherwise guarantee - just like the engine.
    expect(infused.lengthAtEat[31]).toBe(
      base.lengthAtEat[31] - STRAIN_PHYSICS.infuseSegmentCost
    );
  });
});

describe('genome outcome multipliers', () => {
  it('empty genome = base 1.25 / 0.60', () => {
    expect(genomeOutcomeMultipliers(genome({}))).toEqual({ bank: 1.25, death: 0.6 });
  });

  it('Compound Interest retune: +0.05/held, capped at +0.30', () => {
    const picks: GenePick[] = [
      { id: 'compound_interest', atFood: 10 },
      { id: 'wall_rush', atFood: 20 },
      { id: 'magnet_pulse', atFood: 30 },
    ];
    expect(genomeOutcomeMultipliers(genome({ picks })).bank).toBe(1.4); // +0.05*3
  });

  it('infuse deltas: bank +0.05, salvage -0.05 each', () => {
    const result = genomeOutcomeMultipliers(
      genome({ infuses: [{ atFood: 20 }, { atFood: 40 }] })
    );
    expect(result.bank).toBe(1.35);
    expect(result.death).toBe(0.5);
  });

  it('bank clamps at 1.75 and salvage at 0.90', () => {
    // All In with 6 genes: 1.25 + 0.15*6 = 2.15 -> clamp 1.75.
    const picks: GenePick[] = [
      { id: 'compound_interest', atFood: 5 },
      { id: 'mirror_wager', atFood: 10 }, // fuses -> All In
      { id: 'gold_trail', atFood: 15 },
      { id: 'wall_rush', atFood: 20 },
      { id: 'magnet_pulse', atFood: 25 },
      { id: 'overgrowth', atFood: 30 },
    ];
    const result = genomeOutcomeMultipliers(genome({ picks }));
    expect(result.bank).toBe(STRAIN_ECONOMICS.bankClamp);
    expect(result.death).toBe(0.2); // All In salvage SET
  });

  it('classic Phoenix revive voids bank benefits, keeps costs', () => {
    const picks: GenePick[] = [{ id: 'mirror_wager', atFood: 10 }];
    const voided = genomeOutcomeMultipliers(
      genome({ picks, revive: { kind: 'phoenix', atFood: 30 } })
    );
    expect(voided.bank).toBe(1.25); // x1.50 benefit voided
    expect(voided.death).toBe(0.3); // x0.30 cost persists
    expect(reviveVoidsBenefits({ kind: 'phoenix', atFood: 30 })).toBe(true);
  });

  it('Styx Contract revive keeps the x1.50 bank (its headline)', () => {
    const picks: GenePick[] = [
      { id: 'mirror_wager', atFood: 10 },
      { id: 'phoenix', atFood: 20 }, // fuses -> Styx Contract
    ];
    const result = genomeOutcomeMultipliers(
      genome({ picks, revive: { kind: 'styx', atFood: 40 } })
    );
    expect(result.bank).toBe(1.5);
    // Styx's parents are both UMBRA genes -> Shadow Skin minor is live:
    // salvage 0.30 (Styx set) + 0.05 (Shadow Skin) = 0.35.
    expect(result.death).toBe(0.35);
    expect(reviveVoidsBenefits({ kind: 'styx', atFood: 40 })).toBe(false);
  });

  it('UMBRA tiers: Shadow Skin +0.05 salvage; Second Sun -0.10 bank cost', () => {
    const picks: GenePick[] = [
      { id: 'mirror_wager', atFood: 5 },
      { id: 'overclock_harvest', atFood: 15 }, // UMBRA 2 -> Shadow Skin
    ];
    const result = genomeOutcomeMultipliers(genome({ picks }));
    // mirror sets 0.30, overclock -0.15 -> 0.15, shadow +0.05 -> 0.20
    expect(result.death).toBe(0.2);
  });
});

describe('claim caps + clamping', () => {
  const basis = {
    cumulativeDna: Array.from({ length: 101 }, (_, i) => i * 10),
    genelessRaw: 1000,
    foodCount: 100,
  };

  it('caps are zero without the matching activation', () => {
    const input = genome({});
    const view = fusePicks(input.picks);
    const trace = computeLengthTrace(view, 100, strainActivations([], {}), input);
    const caps = genomeClaimCaps(input, basis, trace);
    expect(caps.aurumWakeDna).toBe(0);
    expect(caps.midasDna).toBe(0);
    expect(caps.secondSunFlat).toBe(0);
    // claims backstop: 35% of the deterministic total (1000)
    expect(caps.globalClaimsCap).toBe(350);
  });

  it('AURUM expression cap = 25% of dna since activation; clamps claims', () => {
    const picks: GenePick[] = [
      { id: 'gold_trail', atFood: 10 },
      { id: 'compound_interest', atFood: 20 },
      { id: 'loan_shark', atFood: 40 }, // AURUM expression at 40
    ];
    const input = genome({ picks });
    const acts = strainActivations(picks, {});
    const view = fusePicks(picks);
    const trace = computeLengthTrace(view, 100, acts, input);
    const caps = genomeClaimCaps(input, basis, trace);
    // dna since food 40 = 1000 - 400 = 600 -> cap 150. (gold_trail +
    // compound_interest fuse at 20 - AURUM points survive fusion.)
    expect(caps.aurumWakeDna).toBe(150);
    const { accepted, bonusDna, globalClampHit } = clampGenomeClaims(
      { aurumWakeDna: 999 },
      caps
    );
    expect(accepted.aurumWakeDna).toBe(150);
    expect(bonusDna).toBe(150);
    expect(globalClampHit).toBe(false);
  });

  it('the aggregate claims cap binds and flags', () => {
    const caps = {
      aurumWakeDna: 500,
      midasDna: 0,
      moltFoodDna: 0,
      ouroborosDna: 0,
      staticChargeDna: 0,
      ricochetDna: 0,
      heartwoodDna: 0,
      secondSunFlat: 0,
      crownHeld: false,
      globalClaimsCap: 250,
    };
    const { bonusDna, globalClampHit } = clampGenomeClaims(
      { aurumWakeDna: 500 },
      caps
    );
    expect(globalClampHit).toBe(true);
    expect(bonusDna).toBe(250); // clamped to the aggregate cap
  });
});

describe('sanitizers', () => {
  it('sanitizeInfuses: strictly increasing, bounded, capped at 3', () => {
    expect(
      sanitizeInfuses(
        [{ atFood: 20 }, { atFood: 15 }, { atFood: 30 }, { atFood: 40 }, { atFood: 50 }],
        45
      )
    ).toEqual([{ atFood: 20 }, { atFood: 30 }, { atFood: 40 }]);
    expect(sanitizeInfuses('junk', 45)).toEqual([]);
  });

  it('sanitizeRevive: valid kinds and bounds only', () => {
    expect(sanitizeRevive({ kind: 'phoenix', atFood: 20 }, 50)).toEqual({
      kind: 'phoenix',
      atFood: 20,
    });
    expect(sanitizeRevive({ kind: 'phoenix', atFood: 60 }, 50)).toBeNull();
    expect(sanitizeRevive({ kind: 'lazarus', atFood: 10 }, 50)).toBeNull();
  });

  it('sanitizeSurges + sanitizeLossEvents drop malformed entries', () => {
    expect(sanitizeSurges([{ strain: 'AURUM', atFood: 12 }, { strain: 'X', atFood: 1 }]))
      .toEqual([{ strain: 'AURUM', atFood: 12 }]);
    expect(
      sanitizeLossEvents([{ atFood: 5, segments: 4 }, { atFood: 5, segments: 0 }])
    ).toEqual([{ atFood: 5, segments: 4 }]);
  });
});
