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
    // Rule 15 (v1.4): the infuse GROWS the body. At food 10 the length was
    // 3+10=13, plus 8 = 21 when eating 11.
    expect(trace.lengthAtEat[11]).toBe(13 + STRAIN_PHYSICS.infuseGrowth);
    // A legacy `lossEvents` entry - Thick Hide or Ouroboros on a run settled
    // before the inversion - is still honoured, so historical blobs recompute
    // exactly as they did. From 21 at food 11, five more foods reach 26 as
    // food 15 resolves, and the reported 5-segment loss lands after it: 21.
    expect(trace.lengthAtEat[16]).toBe(13 + STRAIN_PHYSICS.infuseGrowth + 5 - 5);
  });

  it('Fortress (FERAL expression) petrifies without shortening the snake', () => {
    const picks: GenePick[] = [
      { id: 'overgrowth', atFood: 0 },
      { id: 'deep_roots', atFood: 5 },
      { id: 'glacial_reserve', atFood: 10 }, // FERAL x3 genes -> expression
    ];
    const acts = strainActivations(picks, {});
    expect(acts.FERAL.expressionAt).toBe(10);
    const view = fusePicks(picks); // deep_roots+glacial fuse -> Old Growth
    const trace = computeLengthTrace(view, 40, acts, genome({ picks }));
    const first = trace.petrifyEvents[0];
    expect(first?.atFood).toBe(30); // every 20 after activation at 10
    expect(first.segments).toBe(STRAIN_PHYSICS.fortressSegments);
    expect(first.dna).toBe(
      STRAIN_PHYSICS.fortressSegments * STRAIN_ECONOMICS.fortressSegmentDna
    );
    // THE WHOLE POINT: the length model does not move across the event. Molt
    // reset `lengthAtEat[31]` to 60% of the body; Fortress leaves it at food
    // 30's reading plus food 31's growth, because the stone is still length.
    expect(trace.lengthAtEat[31]).toBeGreaterThan(trace.lengthAtEat[30]);
    // ...and no shed event was recorded at all - Molt's cycle is gone, not
    // renamed. A trace that still carried one would mean the shed survived.
    expect(trace.shedEvents).toEqual([]);
  });

  it('Fortress makes the run END rather than plateau - Rule 15 in the model', () => {
    // Molt existed here as the mechanic that kept a FERAL run BOUNDED: the
    // proportional shed made length converge on a fixed point, so the board
    // never filled. That is precisely what Constitution v1.4 outlawed - the
    // board is the difficulty clock, and a converging length stops it.
    // Fortress inverts the assertion: length climbs without limit and the
    // occupied board (body + stone) climbs with it.
    const picks: GenePick[] = [
      { id: 'overgrowth', atFood: 0 },
      { id: 'deep_roots', atFood: 5 },
      { id: 'glacial_reserve', atFood: 10 },
    ];
    const acts = strainActivations(picks, {});
    const trace = computeLengthTrace(fusePicks(picks), 400, acts, genome({ picks }));
    for (let n = 2; n <= 400; n++) {
      expect(trace.lengthAtEat[n]).toBeGreaterThanOrEqual(trace.lengthAtEat[n - 1]);
    }
    expect(trace.lengthAtEat[400]).toBeGreaterThan(400);
    expect(trace.petrifyEvents.length).toBe(19); // every 20 foods from food 10
  });

  it('applies a same-index infuse GROWTH after the food petrifies', () => {
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
    // Food 30 petrifies first; only then does the portal infuse add its
    // segments. Ordering is what keeps this in step with the engine, which
    // appends when the portal resolves - i.e. after the food is done.
    expect(infused.lengthAtEat[31]).toBe(
      base.lengthAtEat[31] + STRAIN_PHYSICS.infuseGrowth
    );
  });

  it('the live body floor skips an event rather than eating the snake', () => {
    // Fortress lays its stone on cells the body is standing on, so a body too
    // short to spare them must not petrify. The floor is on the LIVE length -
    // modelled length minus everything already turned to stone.
    const picks: GenePick[] = [{ id: 'serpentine', atFood: 0 }];
    const acts = strainActivations(picks, { FERAL: 2 });
    expect(acts.FERAL.expressionAt).toBeNull(); // one gene is not an Expression
    // Reached properly, the first event still has to clear the floor: the
    // modelled length at food 20 is 3 + 20 = 23, live 23, and 23 - 6 >= 12.
    const reached: GenePick[] = [
      { id: 'serpentine', atFood: 0 },
      { id: 'heartwood', atFood: 0 },
    ];
    const reachedActs = strainActivations(reached, { FERAL: 2 });
    expect(reachedActs.FERAL.expressionAt).toBe(0);
    const trace = computeLengthTrace(
      fusePicks(reached),
      20,
      reachedActs,
      genome({ picks: reached })
    );
    expect(trace.petrifyEvents.map((e) => e.atFood)).toEqual([
      STRAIN_PHYSICS.fortressEveryFoods,
    ]);
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
      ouroborosDna: 0,
      staticChargeDna: 0,
      ricochetDna: 0,
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
