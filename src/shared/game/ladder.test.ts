/**
 * The D2 ladder (WP-3.12).
 *
 * Four things are pinned here, and they are the four ways a ladder goes wrong:
 *
 *   1. RUNG 0 IS THE SHIPPED GAME. Every dial at rung 0 must equal the value the
 *      module that owns it publishes, so a Ground run folds byte-identically to
 *      a run started before the ladder existed.
 *   2. AN UNKNOWN RUNG IS RUNG 0, never a clamp to the top. Settling a run under
 *      rules harder than the ones it was played under is the worse failure.
 *   3. THE RUNGS ARE CUMULATIVE AND MONOTONIC. A rung may only make the game
 *      harder than the rung below it; a ladder with a soft step is not a ladder.
 *   4. UNLOCK IS GLOBAL. The attempt gate is one rung above the best across ALL
 *      dynasties — the anti-re-climb ruling.
 */

import {
  DEFAULT_LADDER_RUNG,
  LADDER_MAX_RUNG,
  LADDER_RUNGS,
  highestAttemptableRung,
  isLadderRung,
  ladderCadence,
  ladderGrowthProfileId,
  ladderHoldBase,
  ladderInfuseGrowth,
  ladderParams,
  ladderRung,
  ladderSalvageFloor,
  resolveLadderRung,
} from '@/shared/game/ladder';
import { CARRY, type PortalCadence } from '@/shared/game/portals';
import { STRAIN_PHYSICS } from '@/shared/game/strains';
import { GAME_CONFIG } from '@/shared/config/game';
import { RULESETS } from '@/shared/game/rulesets';

const ALL_RUNGS = LADDER_RUNGS.map((r) => r.rung);

describe('the ladder as a shape', () => {
  it('offers 6-8 rungs, in a fixed contiguous order', () => {
    expect(LADDER_RUNGS.length).toBeGreaterThanOrEqual(6);
    expect(LADDER_RUNGS.length).toBeLessThanOrEqual(8);
    LADDER_RUNGS.forEach((rung, index) => expect(rung.rung).toBe(index));
    expect(LADDER_MAX_RUNG).toBe(LADDER_RUNGS.length - 1);
  });

  it('gives every rung a name and one stated rule', () => {
    for (const rung of LADDER_RUNGS) {
      expect(rung.name.length).toBeGreaterThan(0);
      expect(rung.rule.length).toBeGreaterThan(0);
    }
    // Distinct names: a rung the player cannot name is a rung they cannot learn.
    expect(new Set(LADDER_RUNGS.map((r) => r.name)).size).toBe(LADDER_RUNGS.length);
  });

  it('moves exactly ONE dial per rung above Ground', () => {
    expect(Object.keys(LADDER_RUNGS[0].step)).toHaveLength(0);
    for (const rung of LADDER_RUNGS.slice(1)) {
      expect(Object.keys(rung.step)).toHaveLength(1);
    }
  });
});

describe('rung 0 is the shipped game', () => {
  it('leaves every dial at the value its owning module publishes', () => {
    const params = ladderParams(0);
    expect(params.growthProfileFloor).toBe('dynasty');
    expect(params.holdBudgetDelta).toBe(0);
    expect(params.portalWindowSecondsDelta).toBe(0);
    expect(params.portalIntervalFoodsDelta).toBe(0);
    expect(params.infuseGrowthDelta).toBe(0);
    expect(params.salvageFloorDelta).toBe(0);

    expect(ladderInfuseGrowth(0)).toBe(STRAIN_PHYSICS.infuseGrowth);
    expect(ladderSalvageFloor(0)).toBe(CARRY.salvageFloor);
    expect(ladderHoldBase(GAME_CONFIG.session.holds.base, 0)).toBe(
      GAME_CONFIG.session.holds.base
    );
    // Identity, not merely equality: an unchanged cadence is the SAME object,
    // so no caller can be handed a copy that drifts.
    expect(ladderCadence(RULESETS.PRIMAL.extraction, 0)).toBe(
      RULESETS.PRIMAL.extraction
    );
  });

  it('starts from dynasty growth and preserves a harder stamped profile', () => {
    expect(ladderGrowthProfileId('tuned', 0)).toBe('tuned');
    expect(ladderGrowthProfileId(undefined, 0)).toBe('dynasty');
    expect(ladderGrowthProfileId('baseline', 0)).toBe('dynasty');
  });
});

describe('an unknown rung is rung 0, never a clamp to the top', () => {
  it.each([
    undefined,
    null,
    -1,
    1.5,
    NaN,
    Infinity,
    'the-future',
    LADDER_MAX_RUNG + 1,
    999,
    {},
  ])('resolves %p to Ground', (bad) => {
    expect(resolveLadderRung(bad)).toBe(DEFAULT_LADDER_RUNG);
    expect(ladderRung(bad).rung).toBe(DEFAULT_LADDER_RUNG);
    // ...and therefore folds every dial to the shipped value.
    expect(ladderInfuseGrowth(bad)).toBe(STRAIN_PHYSICS.infuseGrowth);
    expect(ladderSalvageFloor(bad)).toBe(CARRY.salvageFloor);
  });

  it('accepts exactly the rungs the ladder offers', () => {
    for (const rung of ALL_RUNGS) expect(isLadderRung(rung)).toBe(true);
    expect(isLadderRung(LADDER_MAX_RUNG + 1)).toBe(false);
    expect(isLadderRung(-1)).toBe(false);
    expect(isLadderRung('3')).toBe(false);
  });
});

describe('the rungs are cumulative and monotonic', () => {
  it('carries every lower rung forward', () => {
    // Rung 1 sets the growth floor to `tuned`; rung 5 must still have it, and
    // must additionally carry rungs 2-4. Writing each rung out in full is the
    // failure mode this asserts against.
    const top = ladderParams(5);
    expect(top.growthProfileFloor).toBe('tuned');
    expect(top.holdBudgetDelta).toBe(-1);
    expect(top.portalWindowSecondsDelta).toBe(-4);
    expect(top.portalIntervalFoodsDelta).toBe(3);
    expect(top.infuseGrowthDelta).toBe(4);
  });

  it('never gets easier as it climbs', () => {
    const growthOrder = ['baseline', 'dynasty', 'tuned', 'aggressive'];
    for (let rung = 1; rung <= LADDER_MAX_RUNG; rung++) {
      const below = ladderParams(rung - 1);
      const here = ladderParams(rung);
      expect(growthOrder.indexOf(here.growthProfileFloor)).toBeGreaterThanOrEqual(
        growthOrder.indexOf(below.growthProfileFloor)
      );
      expect(here.holdBudgetDelta).toBeLessThanOrEqual(below.holdBudgetDelta);
      expect(here.portalWindowSecondsDelta).toBeLessThanOrEqual(
        below.portalWindowSecondsDelta
      );
      expect(here.portalIntervalFoodsDelta).toBeGreaterThanOrEqual(
        below.portalIntervalFoodsDelta
      );
      expect(here.infuseGrowthDelta).toBeGreaterThanOrEqual(below.infuseGrowthDelta);
      expect(here.salvageFloorDelta).toBeGreaterThanOrEqual(below.salvageFloorDelta);
    }
  });

  it('changes at least one thing the player can feel at every rung', () => {
    for (let rung = 1; rung <= LADDER_MAX_RUNG; rung++) {
      expect(ladderParams(rung)).not.toEqual(ladderParams(rung - 1));
    }
  });
});

describe('the dials stay in bounds', () => {
  it('never removes the last tactical hold', () => {
    for (const rung of ALL_RUNGS) {
      expect(ladderHoldBase(GAME_CONFIG.session.holds.base, rung)).toBeGreaterThanOrEqual(1);
      // ...and never GRANTS one.
      expect(ladderHoldBase(GAME_CONFIG.session.holds.base, rung)).toBeLessThanOrEqual(
        GAME_CONFIG.session.holds.base
      );
    }
  });

  it('never repeals the carry ruling that salvage is never near-zero', () => {
    for (const rung of ALL_RUNGS) {
      expect(ladderSalvageFloor(rung)).toBeGreaterThanOrEqual(0.05);
      expect(ladderSalvageFloor(rung)).toBeLessThanOrEqual(CARRY.salvageFloor);
    }
  });

  it('never makes an infuse free, and never shrinks the body', () => {
    for (const rung of ALL_RUNGS) {
      expect(ladderInfuseGrowth(rung)).toBeGreaterThanOrEqual(
        STRAIN_PHYSICS.infuseGrowth
      );
    }
  });

  it('never puts a door before the run starts, and never shortens the walk', () => {
    for (const rung of ALL_RUNGS) {
      for (const ruleset of Object.values(RULESETS)) {
        const cadence: PortalCadence = ladderCadence(ruleset.extraction, rung);
        expect(cadence.firstExitAtFood).toBeGreaterThanOrEqual(
          ruleset.extraction.firstExitAtFood
        );
        expect(cadence.intervalBase).toBeGreaterThanOrEqual(
          ruleset.extraction.intervalBase
        );
        // The rung shifts the schedule; it does not make it noisier, and it
        // must never let the jitter reach below one food.
        expect(cadence.intervalJitter).toBe(ruleset.extraction.intervalJitter);
        expect(cadence.intervalBase - cadence.intervalJitter).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the extraction window authored in seconds, never in ticks', () => {
    // The dial's UNIT is the assertion. WP-3.04 removed a window denominated in
    // ticks because it shrank fourfold as CYBER accelerated; a rung expressed in
    // ticks would reintroduce it at a steeper angle. This pins the sign and the
    // magnitude as SECONDS against the authored `despawnSeconds`.
    const authored = RULESETS.CYBER.extraction.despawnSeconds;
    expect(authored).toBeDefined();
    for (const rung of ALL_RUNGS) {
      const delta = ladderParams(rung).portalWindowSecondsDelta;
      expect(delta).toBeLessThanOrEqual(0);
      expect(authored! + delta).toBeGreaterThan(0);
    }
  });
});

describe('the growth floor raises, never lowers', () => {
  it('keeps a faster lab choice at a slower rung floor', () => {
    // Rung 1's floor is `tuned`; a player who chose `aggressive` keeps it.
    expect(ladderGrowthProfileId('aggressive', 1)).toBe('aggressive');
  });

  it('raises a slower lab choice to the rung floor', () => {
    expect(ladderGrowthProfileId('baseline', 1)).toBe('tuned');
    expect(ladderGrowthProfileId(undefined, LADDER_MAX_RUNG)).toBe('aggressive');
  });

  it('treats an unrecognised request as dynasty before applying the floor', () => {
    expect(ladderGrowthProfileId('not-a-profile', 0)).toBe('dynasty');
    expect(ladderGrowthProfileId('not-a-profile', 1)).toBe('tuned');
  });
});

describe('unlock globally, record per-dynasty', () => {
  it('opens exactly one rung above the best across all dynasties', () => {
    expect(highestAttemptableRung(0)).toBe(1);
    expect(highestAttemptableRung(4)).toBe(5);
  });

  it('never opens past the top of the ladder', () => {
    expect(highestAttemptableRung(LADDER_MAX_RUNG)).toBe(LADDER_MAX_RUNG);
    expect(highestAttemptableRung(999)).toBe(1); // 999 is unknown => Ground => 1
  });

  it('is the anti-re-climb ruling: a PRIMAL climb opens the same rung on CYBER', () => {
    // The gate reads MAX across dynasties, so the per-dynasty records below are
    // irrelevant to what may be ATTEMPTED - which is the whole ruling.
    const perDynasty = { CYBER: 0, PRIMAL: 4, COSMIC: 1 };
    const maxBest = Math.max(...Object.values(perDynasty));
    expect(highestAttemptableRung(maxBest)).toBe(5);
    // ...and the CYBER record is untouched by it.
    expect(perDynasty.CYBER).toBe(0);
  });
});
