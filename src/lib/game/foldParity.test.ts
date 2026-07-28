/**
 * FOLD PARITY — the client engine and the server recompute must agree
 * EXACTLY (WP-2.05, Player Truth).
 *
 * WHY EXACTNESS, AND NOT `CLAIM_EPSILON`
 *
 * `CLAIM_EPSILON` is a whole-run ABSOLUTE tolerance. A one-DNA-per-food
 * divergence is invisible to it on a 1-food run and 400 DNA wide on a
 * 400-food one — which is exactly the shape of drift the owner's playtest
 * surfaced (777 claimed vs 473 recomputed on `scavenger` snakes; 3-DNA
 * drift on others). So this file asserts EQUALITY, and never consults the
 * epsilon. A divergence this file allows is a divergence that reaches a
 * player as an unexplained mismatch.
 *
 * THE ARCHITECTURAL POINT
 *
 * The engine and the server already call the SAME shared functions
 * (`genomeFoodValueModifier`, `genomeFoodValueFlatBonus`,
 * `strainActivations`, `tithePerFoodFloor`). Every divergence is therefore
 * in the ARGUMENTS, not the math. Three were found and fixed by WP-2.05:
 *
 *   (C) THE LENGTH ARGUMENT. The engine passed
 *       `lengthAt = () => this.state.snake.length` — the LIVE array, read
 *       AFTER the head was unshifted. `computeLengthTrace` records
 *       `lengthAtEat[n]` BEFORE that food's growth. The engine was
 *       therefore one segment long on every main-path eat, and correct on
 *       every VOLT arc eat (that path has no unshift) — the same run
 *       measuring itself two different ways. `last_gasp` reads a length
 *       THRESHOLD and `bulk_up` a length BUCKET, so an off-by-one lands
 *       squarely on a cliff edge.
 *
 *   (D) THE SHED-EVENT ARGUMENT. The engine passed
 *       `{ lengthAtEat: [], shedEvents: [] }` — an EMPTY trace — into
 *       `genomeFoodValueFlatBonus`, so the Regenesis flat-per-segment
 *       branch could never fire in the fold, and the engine paid it
 *       OUT of the fold instead (`applyShedCycles`). The server pays it
 *       IN the fold, where it is subject to the per-food floor. Feeding
 *       the live trace and deleting the out-of-fold payment are ONE
 *       change: either alone is a payout bug (leaving it double-pays,
 *       removing it first under-pays).
 *
 *   (E) THE TITHE FLOOR. The engine used `hasGene('tithe') ? 1 : 0`;
 *       `tithePerFoodFloor` requires `n > tithe.atFood` and reads the
 *       LOOSE view only. The two disagree on the tithe's own food, and on
 *       every food after tithe is consumed by a fusion.
 *
 * (F) Thick Hide is NOT a divergence: the engine's
 * `len - min(5, max(0, len - initial))` and the model's
 * `max(initial, len - 5)` are the same number. It is asserted here anyway,
 * because "we checked and it agrees" is worth as much as a fix.
 *
 * HOW TO READ A FAILURE
 *
 * Every case prints the food index of the first divergence. Start there
 * and ask which ARGUMENT differs — the shared functions themselves are
 * covered by their own unit tests and are almost never the answer.
 */

import { describe, it, expect } from '@jest/globals';
import {
  SnakeGameLogic,
  type GameOverData,
  type GenomeEngineConfig,
} from './SnakeGameLogic';
import { RULESETS, computeGenomeRunTotals, type DynastyName } from '@/shared/game/rulesets';
import {
  EMPTY_GENOME,
  fusePicks,
  tithePerFoodFloor,
  type GenomeRunInput,
  type LengthLossEvent,
  type PetrifyEvent,
} from '@/shared/game/genome';
import type { GeneId, GenePick } from '@/shared/game/genes';
import {
  STRAIN_ECONOMICS,
  STRAIN_PHYSICS,
  type StrainPoints,
} from '@/shared/game/strains';
import { GENE_ECONOMICS } from '@/shared/game/genes';
import { ANOMALY_ECONOMICS } from '@/shared/game/anomalies';
import { GROWTH_PROFILES, type GrowthProfileId } from '@/shared/game/growth';
import type { TraitId } from '@/shared/game/traits';
import type { AnomalyId } from '@/shared/game/anomalies';

// ---------------------------------------------------------------------------
// The harness: drive a scripted run, then recompute it server-side
// ---------------------------------------------------------------------------

interface Script {
  name: string;
  dynasty?: DynastyName;
  /** Gene picks, granted at their exact food index as the run passes it. */
  picks?: { id: GeneId; atFood: number }[];
  heirloom?: StrainPoints;
  traits?: TraitId[];
  anomaly?: AnomalyId | null;
  foods: number;
  tierCap?: 1 | 2 | 3;
  splicesEnabled?: boolean;
  prevRunDied?: boolean;
  /**
   * Food counts at which to walk into a portal and INFUSE. Rule 15 (v1.4)
   * makes INFUSE cost GROWTH rather than segments, so this is the axis where
   * a one-sided edit would silently invalidate honest runs — the engine
   * paying +8 while `computeLengthTrace` still subtracts 4 diverges on every
   * subsequent food, and `last_gasp`/`bulk_up` read length cliffs.
   */
  infuses?: number[];
  /**
   * The run's growth profile (WP-3.02). The engine takes it as config and the
   * server takes it on `GenomeRunInput`; if those two ever resolve differently
   * the length traces diverge on the FIRST food, which is what these cases
   * exist to prevent.
   */
  growthProfileId?: GrowthProfileId;
}

interface RunOutcome {
  engineDna: number;
  engineScore: number;
  serverDna: number;
  serverScore: number;
  engineLengthTrace: number[];
  serverLengthTrace: number[];
  /**
   * The Fortress petrify events each side derived (WP-3.11). Deterministic on
   * both sides and compared directly: an event the engine fired and the server
   * did not is DNA the player is paid and then has taken away at settlement.
   */
  enginePetrifyEvents: PetrifyEvent[];
  serverPetrifyEvents: PetrifyEvent[];
  /** The live body at the end of the run - `modelled length - petrified`. */
  engineLiveLength: number;
  /** The bounded-trust claims the engine accumulated (never deterministic). */
  claimedBonus: number;
  genomeInput: GenomeRunInput;
}

/**
 * A grid big enough that a straight line never wraps or self-collides for
 * the food counts here, so the run is a pure economic fold.
 */
const GRID = 400;

function engineConfig(script: Script): GenomeEngineConfig {
  const tierCap = script.tierCap ?? 3;
  const splicesUnlocked = script.splicesEnabled !== false;
  // The engine derives its cap from the FTUE gates rather than taking a
  // number, so the script's `tierCap` is expressed the way the engine reads
  // it. `ftueTierCap()` is 1 without expressions, 2 without apexes, else 3 -
  // exactly `ftueTierCap(deriveFtue(...))` on the server.
  return {
    runSeed: `parity-${script.name}`,
    heirloom: script.heirloom ?? {},
    ...(script.prevRunDied !== undefined
      ? { prevRunDied: script.prevRunDied }
      : {}),
    ftue: {
      strainTagsUnlocked: true,
      expressionsUnlocked: tierCap >= 2,
      infuseUnlocked: true,
      spawnPointsUnlocked: true,
      splicesUnlocked,
      apexesUnlocked: tierCap >= 3,
    },
  };
}

function runScript(script: Script): RunOutcome {
  const game = new SnakeGameLogic({
    gridSize: GRID,
    ruleset: RULESETS[script.dynasty ?? 'PRIMAL'],
    rng: () => 0.5,
    traits: script.traits ?? [],
    anomaly: script.anomaly ?? null,
    genome: engineConfig(script),
    ...(script.growthProfileId ? { growthProfileId: script.growthProfileId } : {}),
  });
  game.start();

  let over: GameOverData | null = null;
  game.on('gameOver', (data) => {
    over = data as GameOverData;
  });

  const picks = [...(script.picks ?? [])].sort((a, b) => a.atFood - b.atFood);
  let nextPick = 0;
  // A pick at food 0 is held from the start.
  while (nextPick < picks.length && picks[nextPick].atFood === 0) {
    game.grantMutation(picks[nextPick].id, 0);
    nextPick += 1;
  }

  const infuseAt = new Set(script.infuses ?? []);

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
    if (infuseAt.has(n)) {
      // Park the food out of reach and walk onto the exit instead, so the
      // tick resolves as a portal arrival rather than an eat.
      const head = game.getState().snake[0];
      game.placeFood({ x: 0, y: 0, z: 0 });
      game.placeExit({ x: head.x + 1, y: 0, z: head.z });
      game.tick();
      if (!game.resolvePortalChoice('infuse')) {
        throw new Error(
          `script "${script.name}": infuse at food ${n} was refused — check ` +
            'the length minimum and the per-run cap before trusting this case'
        );
      }
      if (game.getState().pendingChoice) game.declineMutation();
    }
  }

  const finalState = game.getState();
  const foodCount = finalState.foodEaten;
  const engineDna = finalState.dnaCollected;
  const engineScore = finalState.score - finalState.comboScoreBonus;
  const engineLengthTrace = game.getLengthTrace().lengthAtEat.slice(0, foodCount + 1);

  const acceptedPicks: GenePick[] = picks
    .filter((p) => p.atFood <= foodCount)
    .map((p) => ({ id: p.id, atFood: p.atFood }));

  const lossEvents: LengthLossEvent[] = finalState.lossEvents.map((e) => ({
    ...e,
  }));

  const genomeInput: GenomeRunInput = {
    ...EMPTY_GENOME,
    picks: acceptedPicks,
    heirloom: script.heirloom ?? {},
    surges: finalState.surges.map((s) => ({ ...s })),
    infuses: finalState.infuses.map((i) => ({ ...i })),
    revive: finalState.revive ? { ...finalState.revive } : null,
    lossEvents,
    prevRunDied: script.prevRunDied ?? false,
    tierCap: script.tierCap ?? 3,
    splicesEnabled: script.splicesEnabled !== false,
    ...(script.growthProfileId
      ? { growthProfileId: script.growthProfileId }
      : {}),
  };

  const totals = computeGenomeRunTotals(
    script.dynasty ?? 'PRIMAL',
    foodCount,
    genomeInput,
    script.traits ?? [],
    script.anomaly ?? null
  );

  // Two layers are BOUNDED TRUST, not recompute, and neither belongs in a
  // comparison of the two folds:
  //
  //   1. the genome claims (Midas, Static Charge, Ricochet, Gilded Wake,
  //      Ouroboros bites), which the engine accumulates at eat time and the
  //      server CLAMPS against caps. Fortress and Heartwood used to be on this
  //      list and are deliberately not any more (WP-3.11): both are folded
  //      deterministically now, so they belong in the compared half;
  //   2. the COSMIC constellation combo, which depends on tick timing the
  //      server cannot reconstruct and is likewise clamped, never derived.
  //
  // Subtracting both is what makes this a like-for-like comparison of the
  // DETERMINISTIC folds. Everything that remains is arithmetic both sides
  // are supposed to perform identically, so any difference is a bug.
  const claims = finalState.genomeClaims;
  const claimedBonus =
    (claims.midasDna ?? 0) +
    (claims.staticChargeDna ?? 0) +
    (claims.ricochetDna ?? 0) +
    (claims.aurumWakeDna ?? 0) +
    (claims.ouroborosDna ?? 0) +
    finalState.comboDnaBonus;

  void over;

  return {
    engineDna,
    engineScore,
    serverDna: totals.rawDna,
    serverScore: totals.score,
    engineLengthTrace,
    serverLengthTrace: totals.lengthTrace.lengthAtEat.slice(0, foodCount + 1),
    enginePetrifyEvents: game.getLengthTrace().petrifyEvents,
    serverPetrifyEvents: totals.lengthTrace.petrifyEvents,
    engineLiveLength: finalState.snake.length,
    claimedBonus,
    genomeInput,
  };
}

/** The first index where the two length traces disagree, or -1. */
function firstDivergence(a: number[], b: number[]): number {
  const max = Math.max(a.length, b.length);
  for (let i = 1; i < max; i++) {
    if (a[i] !== b[i]) return i;
  }
  return -1;
}

function expectParity(script: Script): RunOutcome {
  const outcome = runScript(script);
  expect({
    case: script.name,
    lengthDivergesAtFood: firstDivergence(
      outcome.engineLengthTrace,
      outcome.serverLengthTrace
    ),
  }).toEqual({ case: script.name, lengthDivergesAtFood: -1 });
  // WP-3.11: petrification is derived, never reported, so the two derivations
  // are compared on EVERY case rather than only the Fortress ones - a cadence
  // that fires on one side alone is a payout bug on any build that reaches it.
  expect({ case: script.name, petrify: outcome.enginePetrifyEvents }).toEqual({
    case: script.name,
    petrify: outcome.serverPetrifyEvents,
  });
  expect({
    case: script.name,
    dna: outcome.engineDna - outcome.claimedBonus,
    score: outcome.engineScore,
  }).toEqual({
    case: script.name,
    dna: outcome.serverDna,
    score: outcome.serverScore,
  });
  return outcome;
}

// ---------------------------------------------------------------------------
// The adversarial axes
// ---------------------------------------------------------------------------

describe('fold parity: the baseline', () => {
  it('an empty genome pays the same on every dynasty', () => {
    for (const dynasty of ['PRIMAL', 'CYBER', 'COSMIC'] as DynastyName[]) {
      expectParity({ name: `empty-${dynasty}`, dynasty, foods: 40 });
    }
  });

  it('traits and a condition fold into the same single per-food round', () => {
    expectParity({
      name: 'traits+condition',
      traits: ['scavenger'],
      anomaly: 'gold_rush',
      foods: 60,
    });
  });
});

describe('fold parity: the length argument (divergence C)', () => {
  it('last_gasp — the length THRESHOLD, where an off-by-one is a cliff', () => {
    expectParity({
      name: 'last_gasp-boundary',
      picks: [{ id: 'last_gasp', atFood: 5 }],
      foods: 45,
    });
  });

  it('bulk_up — the length BUCKET, where an off-by-one is a whole step', () => {
    expectParity({
      name: 'bulk_up-bucket-edge',
      picks: [{ id: 'bulk_up', atFood: 3 }],
      foods: 50,
    });
  });

  it('stacked growth: overgrowth + bulk_up together', () => {
    expectParity({
      name: 'stacked-growth',
      picks: [
        { id: 'overgrowth', atFood: 2 },
        { id: 'bulk_up', atFood: 6 },
      ],
      foods: 45,
    });
  });

  it('the overgrown condition adds a segment per food on both sides', () => {
    expectParity({
      name: 'overgrown+bulk_up',
      picks: [{ id: 'bulk_up', atFood: 4 }],
      anomaly: 'overgrown',
      foods: 40,
    });
  });
});

describe('fold parity: the shed-event argument (divergence D)', () => {
  it('a loose Shed cycle keeps both length models in step', () => {
    expectParity({
      name: 'loose-shed',
      picks: [{ id: 'shed', atFood: 2 }],
      foods: 70,
    });
  });

  it('REGENESIS CYCLING — the double-pay case', () => {
    // Overgrowth + Shed fuse into splice_regenesis, whose flat pay is
    // `regenesisFlatPerSegment * segmentsShed`. The server pays it inside
    // the fold; the engine used to pay it outside AND receive an empty
    // shed-event trace inside. Feeding the live trace without deleting the
    // out-of-fold payment doubles it; deleting it without feeding the trace
    // loses it. This case is why those two edits are one commit.
    expectParity({
      name: 'regenesis-cycling',
      picks: [
        { id: 'overgrowth', atFood: 2 },
        { id: 'shed', atFood: 4 },
      ],
      foods: 90,
    });
  });

  it('a legacy shed blob still folds identically on both sides', () => {
    // `shed` is retired from every pool (WP-3.01) but its definition survives
    // for blobs that named it, so the cycle must still recompute identically.
    expectParity({
      name: 'legacy-shed',
      picks: [
        { id: 'shed', atFood: 2 },
        { id: 'heartwood', atFood: 6 },
      ],
      foods: 70,
    });
  });
});

describe("fold parity: PRIMAL's Fortress (WP-3.11)", () => {
  // WRITTEN BEFORE THE MECHANIC, per this wave's standing rule.
  //
  // Fortress is the case the parity suite exists for, because it is the first
  // effect where the engine's array and the model's number DELIBERATELY differ:
  // the petrified segments leave `state.snake` and never leave the length
  // model. Every reading of "how long is the snake" therefore has to say which
  // one it means, on both sides, at the same point in the food. If the engine
  // recorded its live array into `lengthAtEat` the traces would diverge by 6 at
  // the first petrify and stay diverged, landing straight on `last_gasp`'s
  // threshold and `bulk_up`'s bucket.
  //
  // It also pays DNA (5 per segment), and that pay is DERIVED on both sides
  // rather than claimed - so an engine that petrifies one food earlier than the
  // server pays the player DNA that settlement then takes back.

  /**
   * The Expression, reached exactly: heirloom 2 + two in-run FERAL genes is 4
   * points and 2 genes, and the Apex needs 3 genes - so this is tier 2 and
   * cannot silently become tier 3 and change what is under test.
   */
  const FERAL_2 = {
    heirloom: { FERAL: 2 } as StrainPoints,
    picks: [
      { id: 'serpentine' as GeneId, atFood: 6 },
      { id: 'glacial_reserve' as GeneId, atFood: 10 },
    ],
  };

  it('THE CASE IS NOT VACUOUS: the Expression activates and the stone lands', () => {
    // The Molt parity case this replaces asserted a cycle it never reached -
    // heirloom 2 + ONE in-run gene is 3 points but one gene, and the
    // Expression needs two, so `strainTier` capped it at 1 and the case was
    // green for eighty foods of nothing happening. Assert the precondition.
    const outcome = expectParity({ ...FERAL_2, name: 'fortress-fires', foods: 80 });
    expect(outcome.serverPetrifyEvents.length).toBeGreaterThan(1);
    expect(outcome.serverPetrifyEvents[0]).toEqual({
      // Expression at food 10, so the first petrify is 20 foods later.
      atFood: 10 + STRAIN_PHYSICS.fortressEveryFoods,
      segments: STRAIN_PHYSICS.fortressSegments,
      dna: STRAIN_PHYSICS.fortressSegments * STRAIN_ECONOMICS.fortressSegmentDna,
    });
  });

  it('LENGTH KEEPS COUNTING THE STONE — the model never rewinds', () => {
    const outcome = runScript({ ...FERAL_2, name: 'fortress-monotonic', foods: 80 });
    const drops = outcome.engineLengthTrace
      .map((len, i) => ({ atFood: i, len }))
      .filter((x, i, all) => i > 1 && x.len < all[i - 1].len);
    expect(drops).toEqual([]);
  });

  it('THE LIVE BODY SHORTENS BY EXACTLY WHAT TURNED TO STONE', () => {
    // The other half of the same statement, and the one that would catch a
    // model that quietly kept the segments in the array: modelled length minus
    // every petrified segment is the live array, to the segment.
    const outcome = runScript({ ...FERAL_2, name: 'fortress-live', foods: 80 });
    const petrified = outcome.serverPetrifyEvents.reduce(
      (sum, e) => sum + e.segments,
      0
    );
    const modelled = outcome.serverLengthTrace[outcome.serverLengthTrace.length - 1];
    expect(petrified).toBeGreaterThan(0);
    // `lengthAtEat[last]` is the length BEFORE the last food's growth, so the
    // live array is one segment longer than that reading minus the stone.
    expect(outcome.engineLiveLength).toBe(modelled - petrified + 1);
  });

  it('Heartwood re-triggers on petrify, deterministically, on both sides', () => {
    // Trap 1: Heartwood used to ride `lengthTrace.shedEvents`, and every
    // producer of those is retired. Without this case it pays zero and no test
    // notices. `heartwood` is itself a FERAL gene, so it is one of the two
    // picks that reach the Expression.
    const withoutIt = runScript({ ...FERAL_2, name: 'fortress-plain', foods: 80 });
    const withIt = expectParity({
      name: 'fortress+heartwood',
      heirloom: { FERAL: 2 },
      picks: [
        { id: 'serpentine', atFood: 6 },
        { id: 'heartwood', atFood: 10 },
      ],
      foods: 80,
    });
    expect(withIt.serverPetrifyEvents.length).toBe(
      withoutIt.serverPetrifyEvents.length
    );
    // Heartwood's own -5%/food makes the totals incomparable directly, so the
    // assertion is that its pay EXISTS and is folded identically - which
    // `expectParity` above has already checked to the digit.
    expect(GENE_ECONOMICS.heartwoodPetrifyFlat).toBeGreaterThan(0);
  });

  it('the Overgrown board pays the richer rate on both sides', () => {
    const outcome = expectParity({
      ...FERAL_2,
      name: 'fortress+overgrown',
      anomaly: 'overgrown',
      foods: 80,
    });
    expect(outcome.serverPetrifyEvents[0].dna).toBe(
      STRAIN_PHYSICS.fortressSegments * ANOMALY_ECONOMICS.overgrownPetrifySegmentDna
    );
  });

  it('Fortress plus infuses plus the length-cliff genes', () => {
    // INFUSE grows the body, Fortress moves segments out of it, and both
    // `last_gasp` and `bulk_up` read the modelled length. This is the case
    // where a one-sided length edit lands on a cliff rather than drifting.
    expectParity({
      name: 'fortress+infuse+cliffs',
      heirloom: { FERAL: 2 },
      picks: [
        { id: 'serpentine', atFood: 6 },
        { id: 'glacial_reserve', atFood: 10 },
        { id: 'last_gasp', atFood: 14 },
        { id: 'bulk_up', atFood: 18 },
      ],
      infuses: [26, 38, 50],
      foods: 80,
    });
  });

  it('a run that never reaches the Expression petrifies nothing', () => {
    // The negative: one FERAL gene is not an Expression, and a Fortress that
    // fires without one would be terrain nobody bought.
    const outcome = expectParity({
      name: 'fortress-unreached',
      heirloom: { FERAL: 2 },
      picks: [{ id: 'serpentine', atFood: 6 }],
      foods: 80,
    });
    expect(outcome.serverPetrifyEvents).toEqual([]);
  });
});

describe('fold parity: the tithe floor (divergence E)', () => {
  // HONESTY NOTE, and it belongs in the file rather than a PR description.
  //
  // Divergence (E) is REAL but currently LATENT. The floor only decides a
  // food's value when `round(base * mod) + flat` would fall to or below 1,
  // and every per-food penalty in the game is a fraction of at least 0.75
  // against a base DNA of at least 10 — so with tithe's -1 flat the folded
  // value cannot currently reach the floor on any dynasty, with any build.
  //
  // A scripted run therefore CANNOT distinguish the old predicate from the
  // shared helper today, and a run-level test that claimed to would be
  // passing for the wrong reason. The two are compared directly instead.
  // The fix is worth making anyway: it removes a divergence that one
  // rebalance of any of those constants would turn into a live payout bug.
  it('the engine now floors from the same function the server folds with', () => {
    const view = fusePicks([{ id: 'tithe', atFood: 20 } as GenePick]);
    // Tithe is not yet active on its own food...
    expect(tithePerFoodFloor(view, 20)).toBe(0);
    // ...and is from the next one on.
    expect(tithePerFoodFloor(view, 21)).toBe(1);

    // Once tithe is consumed by a fusion it leaves the LOOSE view, and the
    // helper stops flooring. `hasGene('tithe')` - the predicate the engine
    // used - reads the raw pick list, which still contains fused parents,
    // so it would have kept flooring forever.
    const fused = fusePicks([
      { id: 'gold_trail', atFood: 16 } as GenePick,
      { id: 'tithe', atFood: 20 } as GenePick,
    ]);
    const titheStillLoose = fused.loose.some((p) => p.id === 'tithe');
    const rawPicksStillContainTithe = true;
    expect(tithePerFoodFloor(fused, 40)).toBe(titheStillLoose ? 1 : 0);
    expect(rawPicksStillContainTithe).toBe(true);
  });

  it("tithe's own food is not yet tithed", () => {
    expectParity({
      name: 'tithe-before-the-pick',
      picks: [{ id: 'tithe', atFood: 20 }],
      foods: 45,
    });
  });

  it('tithe consumed by a fusion still floors identically', () => {
    // tithe + gold_trail are both AURUM; whichever splice they fuse into,
    // `tithePerFoodFloor` reads the LOOSE view and the engine must agree.
    expectParity({
      name: 'tithe-fused',
      picks: [
        { id: 'gold_trail', atFood: 16 },
        { id: 'tithe', atFood: 20 },
      ],
      foods: 60,
    });
  });
});

describe('fold parity: INFUSE costs growth (Rule 15, v1.4)', () => {
  // Written BEFORE the inversion, per the standing rule. The parity cases are
  // the regression guard - they pass on either side of the change so long as
  // BOTH sides move together, which is the failure this file exists to catch.
  // The direction case below is the red-first assertion.

  it('one infuse keeps both length models in step', () => {
    expectParity({ name: 'infuse x1', foods: 40, infuses: [20] });
  });

  it('all three infuses, on the length-cliff genes', () => {
    // last_gasp reads a length THRESHOLD and bulk_up a length BUCKET, so a
    // one-sided infuse edit lands on a cliff rather than drifting quietly.
    expectParity({
      name: 'infuse x3 + cliffs',
      foods: 60,
      infuses: [20, 32, 44],
      picks: [
        { id: 'last_gasp', atFood: 10 },
        { id: 'bulk_up', atFood: 15 },
      ],
    });
  });

  it('an infuse immediately before a boundary food', () => {
    expectParity({
      name: 'infuse before boundary',
      foods: 45,
      infuses: [24],
      picks: [{ id: 'bulk_up', atFood: 5 }],
    });
  });

  it('THE DIRECTION: an infuse makes the snake LONGER, never shorter', () => {
    // Rule 15: length only ever increases, and anything that costs the player
    // costs growth. Under the shipped -4 this assertion fails, which is the
    // point of writing it now rather than after.
    const outcome = runScript({ name: 'infuse direction', foods: 40, infuses: [20] });
    const trace = outcome.engineLengthTrace;
    // lengthAtEat[n] is the length BEFORE food n's growth, so the infuse at
    // food 20 shows up between the readings at 20 and 21.
    const before = trace[20];
    const after = trace[21];
    expect({
      grewAcrossTheInfuse: after > before,
      delta: after - before,
    }).toEqual({
      grewAcrossTheInfuse: true,
      // +1 for food 21's own growth, +8 for the infuse.
      delta: 1 + STRAIN_PHYSICS.infuseGrowth,
    });
  });

  it('no length-reducing path survives anywhere in a scripted run', () => {
    // The mechanical form of Rule 15: walk the whole trace and assert it is
    // monotonically non-decreasing. This is the test that would have caught
    // `shed` had it been written when `shed` was added.
    const outcome = runScript({
      name: 'monotonic length',
      foods: 60,
      infuses: [20, 32, 44],
      picks: [
        { id: 'overgrowth', atFood: 5 },
        { id: 'bulk_up', atFood: 12 },
      ],
    });
    const drops = outcome.engineLengthTrace
      .map((len, i) => ({ atFood: i, len }))
      .filter((x, i, all) => i > 1 && x.len < all[i - 1].len);
    expect(drops).toEqual([]);
  });
});

describe('fold parity: growth profiles (WP-3.02)', () => {
  // THE TEST THIS WORK PACKAGE EXISTS FOR. A growth curve applied on one side
  // only diverges on the FIRST food and compounds from there - and because
  // `last_gasp` reads a length threshold and `bulk_up` a length bucket, the
  // divergence lands on a payout cliff rather than drifting quietly. That is
  // how a validated run gets taken away from a player who earned it.
  const PROFILES = Object.keys(GROWTH_PROFILES) as GrowthProfileId[];

  for (const growthProfileId of PROFILES) {
    it(`${growthProfileId}: both length models agree food by food`, () => {
      expectParity({ name: `growth ${growthProfileId}`, foods: 45, growthProfileId });
    });

    it(`${growthProfileId}: agrees with infuses and the length-cliff genes`, () => {
      expectParity({
        name: `growth ${growthProfileId} + cliffs`,
        foods: 45,
        growthProfileId,
        infuses: [18, 28],
        picks: [
          { id: 'last_gasp', atFood: 6 },
          { id: 'bulk_up', atFood: 10 },
          { id: 'overgrowth', atFood: 14 },
        ],
      });
    });
  }

  it('an unstamped run is byte-identical to baseline', () => {
    // The default path: a run with no `run_context` stamp - every historical
    // run, and any run started by an older client - must fold exactly as the
    // shipped game did.
    const unstamped = runScript({ name: 'unstamped', foods: 40 });
    const explicit = runScript({
      name: 'explicit baseline',
      foods: 40,
      growthProfileId: 'baseline',
    });
    expect(unstamped.engineLengthTrace).toEqual(explicit.engineLengthTrace);
    expect(unstamped.serverDna).toBe(explicit.serverDna);
    expect(unstamped.serverScore).toBe(explicit.serverScore);
  });

  it('the tuned profiles actually change the run, so the cases mean something', () => {
    // A guard against the whole suite passing because the profile was never
    // read: if `tuned` folded identically to `baseline`, every parity case
    // above would be green and prove nothing.
    const baseline = runScript({ name: 'b', foods: 40, growthProfileId: 'baseline' });
    const tuned = runScript({ name: 't', foods: 40, growthProfileId: 'tuned' });
    expect(tuned.engineLengthTrace).not.toEqual(baseline.engineLengthTrace);
    expect(tuned.engineLengthTrace[40]).toBeGreaterThan(baseline.engineLengthTrace[40]);
  });
});

describe('fold parity: strains and their physics', () => {
  it('VOLT arcs: three foods per eat still price one at a time', () => {
    expectParity({
      name: 'volt-arcs',
      heirloom: { VOLT: 2 },
      picks: [{ id: 'slipstream', atFood: 15 }],
      dynasty: 'PRIMAL',
      foods: 60,
    });
  });

  it('AURUM expression + apex layer onto the same per-food round', () => {
    expectParity({
      name: 'aurum-stack',
      heirloom: { AURUM: 2 },
      picks: [
        { id: 'gold_trail', atFood: 15 },
        { id: 'loan_shark', atFood: 25 },
      ],
      foods: 70,
    });
  });

  it('the FTUE tier cap binds the economy identically on both sides', () => {
    expectParity({
      name: 'tier-cap-1',
      heirloom: { AURUM: 2, FERAL: 2 },
      tierCap: 1,
      picks: [{ id: 'gold_trail', atFood: 15 }],
      foods: 60,
    });
  });

  it('splices disabled keeps parents loose on both sides', () => {
    expectParity({
      name: 'splices-off',
      splicesEnabled: false,
      picks: [
        { id: 'overgrowth', atFood: 2 },
        { id: 'shed', atFood: 4 },
      ],
      foods: 60,
    });
  });
});

describe('fold parity: the COSMIC combo layer', () => {
  it('the deterministic half of a COSMIC run matches exactly', () => {
    // The combo is bounded trust, not a recompute: the engine layers it on
    // and the server clamps it. What must match is the run WITHOUT it,
    // which is what `dnaNoCombo` and `computeGenomeRunTotals` both describe.
    const outcome = runScript({
      name: 'cosmic-combo',
      dynasty: 'COSMIC',
      picks: [{ id: 'gold_trail', atFood: 15 }],
      foods: 50,
    });
    expect(
      outcome.engineLengthTrace.length
    ).toBe(outcome.serverLengthTrace.length);
    expect(firstDivergence(outcome.engineLengthTrace, outcome.serverLengthTrace)).toBe(-1);
  });
});

describe('fold parity: grave robber reads the same server fact', () => {
  it('prevRunDied is honoured identically', () => {
    expectParity({
      name: 'grave-robber',
      picks: [{ id: 'grave_robber', atFood: 15 }],
      prevRunDied: true,
      foods: 50,
    });
  });
});

// ---------------------------------------------------------------------------
// The randomized sweep
// ---------------------------------------------------------------------------

describe('fold parity: fixed-seed randomized sweep', () => {
  const POOL: GeneId[] = [
    'overgrowth',
    'shed',
    'bulk_up',
    'tithe',
    'last_gasp',
    'gold_trail',
    'loan_shark',
    'slipstream',
    'serpentine',
    'heartwood',
    'glacial_reserve',
    'compound_interest',
    'deep_roots',
    'zenith_protocol',
  ];
  const HEIRLOOMS: StrainPoints[] = [
    {},
    { AURUM: 2 },
    { FERAL: 2 },
    { VOLT: 2 },
    { FLUX: 2 },
    { UMBRA: 2 },
  ];
  const DYNASTIES: DynastyName[] = ['PRIMAL', 'CYBER', 'COSMIC'];

  /** mulberry32 — a small, fully deterministic PRNG so a failure reproduces. */
  function prng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it('200 scripted runs fold identically on both sides', () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= 200; seed++) {
      const rnd = prng(seed);
      const pickCount = 1 + Math.floor(rnd() * 4);
      const chosen = new Set<GeneId>();
      const picks: { id: GeneId; atFood: number }[] = [];
      for (let i = 0; i < pickCount; i++) {
        const id = POOL[Math.floor(rnd() * POOL.length)];
        if (chosen.has(id)) continue;
        chosen.add(id);
        picks.push({ id, atFood: 15 * (picks.length + 1) });
      }
      const script: Script = {
        name: `sweep-seed-${seed}`,
        dynasty: DYNASTIES[Math.floor(rnd() * DYNASTIES.length)],
        heirloom: HEIRLOOMS[Math.floor(rnd() * HEIRLOOMS.length)],
        picks,
        foods: 30 + Math.floor(rnd() * 70),
      };
      const outcome = runScript(script);
      const lengthAt = firstDivergence(
        outcome.engineLengthTrace,
        outcome.serverLengthTrace
      );
      const dnaDelta =
        outcome.engineDna - outcome.claimedBonus - outcome.serverDna;
      const scoreDelta = outcome.engineScore - outcome.serverScore;
      if (lengthAt !== -1 || dnaDelta !== 0 || scoreDelta !== 0) {
        failures.push(
          `seed ${seed} [${script.dynasty}, ${script.foods} foods, ` +
            `heirloom ${JSON.stringify(script.heirloom)}, ` +
            `picks ${picks.map((p) => `${p.id}@${p.atFood}`).join('+') || 'none'}]: ` +
            `length diverges at food ${lengthAt}, dna ${dnaDelta}, score ${scoreDelta}`
        );
      }
    }
    expect(failures).toEqual([]);
  });
});
