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
} from '@/shared/game/genome';
import type { GeneId, GenePick } from '@/shared/game/genes';
import type { StrainPoints } from '@/shared/game/strains';
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
}

interface RunOutcome {
  engineDna: number;
  engineScore: number;
  serverDna: number;
  serverScore: number;
  engineLengthTrace: number[];
  serverLengthTrace: number[];
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
  //      molt foods, Ouroboros bites, Heartwood goldens), which the engine
  //      accumulates at eat time and the server CLAMPS against caps;
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
    (claims.moltFoodDna ?? 0) +
    (claims.ouroborosDna ?? 0) +
    (claims.heartwoodDna ?? 0) +
    finalState.comboDnaBonus;

  void over;

  return {
    engineDna,
    engineScore,
    serverDna: totals.rawDna,
    serverScore: totals.score,
    engineLengthTrace,
    serverLengthTrace: totals.lengthTrace.lengthAtEat.slice(0, foodCount + 1),
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

  it('Heartwood rides shed events without changing the deterministic fold', () => {
    expectParity({
      name: 'heartwood-sheds',
      picks: [
        { id: 'shed', atFood: 2 },
        { id: 'heartwood', atFood: 6 },
      ],
      foods: 70,
    });
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

describe('fold parity: strains and their physics', () => {
  it('FERAL Molt: the 20-food cycle and its growth floor', () => {
    expectParity({
      name: 'molt',
      heirloom: { FERAL: 2 },
      picks: [{ id: 'serpentine', atFood: 15 }],
      foods: 80,
    });
  });

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
