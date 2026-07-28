/**
 * PORTAL PARITY — the engine's live door count against the server's replay.
 *
 * This is the assertion the carry stands on. The carry multiplies a run's
 * payout by how many portals the player declined, which at the shipped cadence
 * is the difference between a x1.25 bank and a x3.05 one. A number with that
 * much leverage cannot be a client claim, so the settlement DERIVES it by
 * replaying a seeded, food-indexed schedule.
 *
 * Which means there are two implementations of one recurrence — the engine's
 * incremental walk (`advancePortalSchedule`, which learns the food count one
 * food at a time) and the server's closed walk (`portalsEncountered`). They
 * share the arithmetic and the fact-gathering, but they cannot share the
 * control flow, and that is exactly the seam where a client and a settlement
 * stop agreeing. `foldParity.test.ts` exists for the same reason and does not
 * cover this: it never spawns a portal.
 *
 * The lesson this wave keeps re-learning is that asserting the model is not
 * enough — assert the CONNECTION. Here the connection is "two walks, one
 * number", so that is what every case below checks.
 */

import { describe, it, expect } from '@jest/globals';
import { SnakeGameLogic } from './SnakeGameLogic';
import { RULESETS, getRuleset, type DynastyName } from '@/shared/game/rulesets';
import {
  portalIntervalTax,
  portalTaxFactsAt,
  portalsEncountered,
  portalsPassed,
  carryBankMultiplier,
  carrySalvageMultiplier,
  type PortalTaxSources,
} from '@/shared/game/portals';
import {
  strainActivations,
  strainTierAtFood,
  fusePicks,
} from '@/shared/game/genome';
import type { GeneId, GenePick } from '@/shared/game/genes';
import type { StrainPoints } from '@/shared/game/strains';
import type { TraitId } from '@/shared/game/traits';
import type { AnomalyId } from '@/shared/game/anomalies';
import {
  LADDER_MAX_RUNG,
  ladderCadence,
  ladderInfuseGrowth,
  ladderParams,
} from '@/shared/game/ladder';
import { computeLengthTrace } from '@/shared/game/genome';
import { GAME_CONFIG } from '@/shared/config/game';

/** Wide enough that a straight walk never hits a wall or itself. */
const GRID = 400;

interface Script {
  name: string;
  dynasty?: DynastyName;
  foods: number;
  picks?: { id: GeneId; atFood: number }[];
  traits?: TraitId[];
  anomaly?: AnomalyId | null;
  heirloom?: StrainPoints;
  /** Foods at which to walk onto the portal and INFUSE instead of eating. */
  infuses?: number[];
  /** Walk onto the portal and BANK at this food, ending the run. */
  bankAt?: number;
  /** The D2 ladder rung the server stamped on this run (WP-3.12). */
  ladderRung?: number;
}

interface RunResult {
  engineMet: number;
  foodCount: number;
  finalLength: number;
  picks: GenePick[];
  infuses: { atFood: number }[];
  extracted: boolean;
}

/**
 * Drive a real engine and report what it saw.
 *
 * `rng: () => 0.5` is deliberate: it pins every stochastic decision that is NOT
 * the portal schedule, so a divergence can only come from the seeded stream.
 */
function runScript(script: Script): RunResult {
  const dynasty = script.dynasty ?? 'PRIMAL';
  const game = new SnakeGameLogic({
    gridSize: GRID,
    ruleset: RULESETS[dynasty],
    rng: () => 0.5,
    traits: script.traits ?? [],
    anomaly: script.anomaly ?? null,
    ladderRung: script.ladderRung,
    genome: {
      runSeed: `portal-${script.name}`,
      heirloom: script.heirloom ?? {},
      ftue: {
        strainTagsUnlocked: true,
        expressionsUnlocked: true,
        infuseUnlocked: true,
        spawnPointsUnlocked: true,
        splicesUnlocked: true,
        apexesUnlocked: true,
      },
    },
  });
  game.start();

  const picks = [...(script.picks ?? [])].sort((a, b) => a.atFood - b.atFood);
  let nextPick = 0;
  while (nextPick < picks.length && picks[nextPick].atFood === 0) {
    game.grantMutation(picks[nextPick].id, 0);
    nextPick += 1;
  }
  const infuseAt = new Set(script.infuses ?? []);
  let extracted = false;

  for (let eaten = 0; eaten < script.foods; eaten++) {
    const state = game.getState();
    if (state.isGameOver || state.isDeathSequence) break;
    game.placeFood({ x: state.snake[0].x + 1, y: 0, z: state.snake[0].z });
    game.tick();
    if (game.getState().pendingChoice) game.declineMutation();
    const n = game.getState().foodEaten;
    while (nextPick < picks.length && picks[nextPick].atFood <= n) {
      game.grantMutation(picks[nextPick].id, picks[nextPick].atFood);
      nextPick += 1;
    }
    if (infuseAt.has(n) || script.bankAt === n) {
      // Park the food out of reach and walk onto the portal instead, so the
      // tick resolves as a portal arrival rather than an eat.
      const head = game.getState().snake[0];
      game.placeFood({ x: 0, y: 0, z: 0 });
      game.placeExit({ x: head.x + 1, y: 0, z: head.z });
      game.tick();
      if (script.bankAt === n) {
        game.resolvePortalChoice('bank');
        extracted = true;
        break;
      }
      game.resolvePortalChoice('infuse');
      if (game.getState().pendingChoice) game.declineMutation();
    }
  }

  const final = game.getState();
  return {
    engineMet: game.getPortalsMet(),
    foodCount: final.foodEaten,
    finalLength: final.snake.length,
    picks: final.heldMutations.map((m) => ({ id: m.id, atFood: m.atFood })),
    infuses: final.infuses.map((i) => ({ atFood: i.atFood })),
    extracted,
  };
}

/** The settlement's replay, assembled exactly as `gameValidator` assembles it. */
function serverMet(script: Script, run: RunResult): number {
  const dynasty = script.dynasty ?? 'PRIMAL';
  const view = fusePicks(run.picks);
  const activations = strainActivations(
    run.picks,
    script.heirloom ?? {},
    [],
    3,
    []
  );
  const sources: PortalTaxSources = {
    picks: run.picks,
    splices: view.splices.map((s) => ({ id: s.spliceId, atFood: s.atFood })),
    traits: script.traits ?? [],
    anomaly: script.anomaly ?? null,
    infuses: run.infuses,
    fluxTierAt: (food: number) =>
      Math.min(3, strainTierAtFood(activations.FLUX, food + 0.5)),
  };
  return portalsEncountered(
    // The settlement's cadence, assembled exactly as `derivePortalsPassed`
    // assembles it — ladder-shifted from the stamped rung.
    ladderCadence(getRuleset(dynasty).extraction, script.ladderRung),
    `portal-${script.name}`,
    run.foodCount,
    (food: number) => portalIntervalTax(portalTaxFactsAt(sources, food))
  );
}

function expectParity(script: Script): RunResult {
  const run = runScript(script);
  expect(serverMet(script, run)).toBe(run.engineMet);
  return run;
}

describe('portal parity: the schedule replays exactly', () => {
  it('a plain run meets the doors the server says it met', () => {
    const run = expectParity({ name: 'plain', foods: 60 });
    // A 60-food run must actually reach several doors, or this asserts
    // nothing at all — 0 === 0 is not parity.
    expect(run.engineMet).toBeGreaterThan(2);
  });

  it('holds on every dynasty', () => {
    for (const dynasty of ['PRIMAL', 'CYBER', 'COSMIC'] as DynastyName[]) {
      const run = expectParity({ name: `dyn-${dynasty}`, dynasty, foods: 60 });
      expect(run.engineMet).toBeGreaterThan(2);
    }
  });

  it('holds across a seeded sweep of run lengths', () => {
    for (let foods = 15; foods <= 90; foods += 3) {
      expectParity({ name: `len-${foods}`, foods });
    }
  });

  it('holds when a gene taxes the interval mid-run', () => {
    // Magnet Pulse is +4 foods per door, and it is picked at food 20 — so the
    // schedule the server replays has to change shape at the same food the
    // engine's did. A tax applied at the wrong food is the exact bug this
    // catches, and it is invisible to any test that picks at food 0.
    const run = expectParity({
      name: 'magnet',
      foods: 80,
      picks: [{ id: 'magnet_pulse', atFood: 20 }],
    });
    expect(run.engineMet).toBeGreaterThan(2);
    // ...and it must actually differ from the untaxed run, or the tax is
    // silently doing nothing and parity is vacuous.
    const untaxed = runScript({ name: 'magnet', foods: 80 });
    expect(run.engineMet).toBeLessThan(untaxed.engineMet);
  });

  it('holds under a trait tax that applies from food zero', () => {
    expectParity({ name: 'magnetism', foods: 80, traits: ['magnetism'] });
  });

  it('holds under an anomaly tax', () => {
    expectParity({ name: 'goldrush', foods: 80, anomaly: 'gold_rush' });
  });

  it('holds when infuses push the doors deeper', () => {
    // Each infuse is +2 foods of exposure AND consumes a door, so this moves
    // both halves of the identity at once.
    const run = expectParity({ name: 'infused', foods: 90, infuses: [16, 40] });
    expect(run.infuses.length).toBeGreaterThan(0);
  });
});

/**
 * THE LADDER ACROSS THE SAME SEAM (WP-3.12).
 *
 * The ladder moves two things this file already watches: rung 4 pushes every
 * door three foods further away, and rung 5 adds four segments to an infuse. The
 * first is walked twice — the engine's incremental recurrence and the
 * settlement's closed one — and a rung applied to only one of them would make
 * the two disagree about how many doors a run met, which the carry then
 * multiplies straight into the payout. So the rung is asserted at exactly the
 * seam the carry stands on, not merely in the module that defines it.
 */
describe('portal parity: the ladder does not split the two walks', () => {
  it('holds at every rung the ladder offers', () => {
    for (let rung = 0; rung <= LADDER_MAX_RUNG; rung++) {
      const run = expectParity({ name: `rung-${rung}`, foods: 80, ladderRung: rung });
      expect(run.engineMet).toBeGreaterThan(2);
    }
  });

  it('holds at every rung, on every dynasty', () => {
    for (const dynasty of ['PRIMAL', 'CYBER', 'COSMIC'] as DynastyName[]) {
      for (let rung = 0; rung <= LADDER_MAX_RUNG; rung++) {
        expectParity({
          name: `rung-${rung}-${dynasty}`,
          dynasty,
          foods: 80,
          ladderRung: rung,
        });
      }
    }
  });

  it('holds at a rung WITH a mid-run gene tax and infuses stacked on it', () => {
    // Three interval sources at once: the rung's constant shift, Magnet Pulse
    // picked at food 20, and +2 foods per infuse. If the rung were folded in at
    // the wrong point in that stack the two walks would part company here.
    const run = expectParity({
      name: 'rung-taxed',
      foods: 90,
      ladderRung: LADDER_MAX_RUNG,
      picks: [{ id: 'magnet_pulse', atFood: 20 }],
      infuses: [24, 50],
    });
    expect(run.infuses.length).toBeGreaterThan(0);
  });

  it('actually MOVES the doors — a rung that changed nothing would prove nothing', () => {
    // Parity that holds because the rung is inert is parity that asserts
    // nothing. "The Long Walk" must measurably cost the run doors.
    const ground = runScript({ name: 'walk-cmp', foods: 90 });
    const walked = runScript({ name: 'walk-cmp', foods: 90, ladderRung: 4 });
    expect(ladderParams(4).portalIntervalFoodsDelta).toBeGreaterThan(0);
    expect(walked.engineMet).toBeLessThan(ground.engineMet);
  });
});

describe('portal parity: the ladder infuse growth folds the same on both sides', () => {
  it('the engine grows exactly what computeLengthTrace replays, at every rung', () => {
    // The other half of the ladder that has two implementations. The engine
    // appends segments when the portal resolves; `computeLengthTrace` adds them
    // at the same point in the food's resolution. Both read `ladderInfuseGrowth`
    // — this asserts they land on the same body.
    for (let rung = 0; rung <= LADDER_MAX_RUNG; rung++) {
      const run = runScript({
        name: `infuse-rung-${rung}`,
        foods: 60,
        ladderRung: rung,
        infuses: [16, 34],
      });
      expect(run.infuses.length).toBe(2);
      const trace = computeLengthTrace(
        { loose: [], splices: [] },
        run.foodCount,
        strainActivations([], {}, [], 3, []),
        { infuses: run.infuses, ladderRung: rung },
        null
      );
      // A rung-0 baseline body is 3 + one segment per food; each infuse adds
      // the rung's growth on top. Reconstructed from the SAME function the two
      // implementations read, so a retune of the dial cannot make this stale.
      const expected =
        3 + run.foodCount + run.infuses.length * ladderInfuseGrowth(rung);
      expect(trace.lengthAtEat[run.foodCount] + 1).toBe(expected);
    }
  });

  it('a higher rung produces a longer body for the same run', () => {
    const shorter = runScript({ name: 'weight', foods: 60, infuses: [16, 34] });
    const longer = runScript({
      name: 'weight',
      foods: 60,
      ladderRung: 5,
      infuses: [16, 34],
    });
    expect(ladderInfuseGrowth(5)).toBeGreaterThan(ladderInfuseGrowth(0));
    expect(longer.finalLength).toBeGreaterThan(shorter.finalLength);
  });
});

describe('the ladder dials the engine alone owns', () => {
  it('takes a tactical hold at the rung that says so, and only there', () => {
    // `refreshHoldBudget` is monotonic - it can only ever RAISE the budget - so
    // a rung applied through it would silently do nothing. This is the
    // regression test for exactly that: the budget is read off a live engine,
    // not off the ladder module that defines the delta.
    const base = GAME_CONFIG.session.holds.base;
    for (let rung = 0; rung <= LADDER_MAX_RUNG; rung++) {
      const game = new SnakeGameLogic({ gridSize: GRID, ladderRung: rung });
      expect(game.getState().holdBudget).toBe(
        base + ladderParams(rung).holdBudgetDelta
      );
    }
  });

  it('applies the rung when the SERVER stamps it after construction', () => {
    // The real sequence: the page builds the engine on mount, the start
    // response arrives, `setLadderRung` adopts what the server chose. A rung
    // that only worked through the constructor would be a rung that never
    // worked in the product.
    const game = new SnakeGameLogic({ gridSize: GRID });
    expect(game.getState().holdBudget).toBe(GAME_CONFIG.session.holds.base);
    game.setLadderRung(LADDER_MAX_RUNG);
    expect(game.getLadderRung()).toBe(LADDER_MAX_RUNG);
    expect(game.getState().holdBudget).toBe(
      GAME_CONFIG.session.holds.base + ladderParams(LADDER_MAX_RUNG).holdBudgetDelta
    );
    expect(game.getState().nextExitAtFood).toBe(
      ladderCadence(RULESETS.COSMIC.extraction, LADDER_MAX_RUNG).firstExitAtFood
    );
  });

  it('resolves a rung the server could not have sent to Ground', () => {
    const game = new SnakeGameLogic({ gridSize: GRID });
    game.setLadderRung('rung-from-the-future');
    expect(game.getLadderRung()).toBe(0);
    expect(game.getState().holdBudget).toBe(GAME_CONFIG.session.holds.base);
  });
});

describe('portal parity: the identity that removes the claim', () => {
  it('passed = met - infuses - (extracted ? 1 : 0)', () => {
    const run = expectParity({ name: 'identity', foods: 90, infuses: [16] });
    expect(portalsPassed(run.engineMet, run.infuses.length, run.extracted)).toBe(
      run.engineMet - run.infuses.length
    );
  });

  it('banking spends the door it banked at', () => {
    const run = runScript({ name: 'banked', foods: 90, bankAt: 20 });
    expect(run.extracted).toBe(true);
    expect(portalsPassed(run.engineMet, run.infuses.length, true)).toBe(
      run.engineMet - 1
    );
  });

  it('never reports a negative count', () => {
    // A run that banks at its first door has met one and passed none.
    expect(portalsPassed(1, 0, true)).toBe(0);
    expect(portalsPassed(0, 0, true)).toBe(0);
    expect(portalsPassed(0, 3, false)).toBe(0);
  });
});

describe('the carry curve', () => {
  it('matches the sketch the owner signed off on', () => {
    // portal 1 = 1.25 bank / 1.00 salvage; portal 5 = 3.05 / ~0.44
    expect(carryBankMultiplier(0)).toBeCloseTo(1.25, 4);
    expect(carrySalvageMultiplier(0)).toBeCloseTo(1.0, 4);
    expect(carryBankMultiplier(4)).toBeCloseTo(3.0518, 3);
    expect(carrySalvageMultiplier(4)).toBeCloseTo(0.4342, 3);
  });

  it('banking always beats crashing, at every depth', () => {
    for (let passed = 0; passed <= 20; passed++) {
      expect(carryBankMultiplier(passed)).toBeGreaterThan(
        carrySalvageMultiplier(passed)
      );
    }
  });

  it('salvage never exceeds 1 — dying cannot pay more than you earned', () => {
    for (let passed = 0; passed <= 20; passed++) {
      expect(carrySalvageMultiplier(passed)).toBeLessThanOrEqual(1);
    }
  });

  it('salvage never falls to the floor and never below it', () => {
    // "never near-zero" is the ruling. The floor is 0.35, so a crash after any
    // number of passed doors still returns better than a third of the run.
    for (let passed = 0; passed <= 50; passed++) {
      expect(carrySalvageMultiplier(passed)).toBeGreaterThanOrEqual(0.35);
    }
  });

  it('is monotonic in both directions', () => {
    let bank = 0;
    let salvage = Infinity;
    for (let passed = 0; passed <= 20; passed++) {
      const b = carryBankMultiplier(passed);
      const s = carrySalvageMultiplier(passed);
      expect(b).toBeGreaterThanOrEqual(bank);
      expect(s).toBeLessThanOrEqual(salvage);
      bank = b;
      salvage = s;
    }
  });

  it('stops climbing at the cap, so a long run cannot compound forever', () => {
    expect(carryBankMultiplier(6)).toBeCloseTo(carryBankMultiplier(99), 6);
    expect(carrySalvageMultiplier(6)).toBeCloseTo(carrySalvageMultiplier(99), 6);
  });
});
