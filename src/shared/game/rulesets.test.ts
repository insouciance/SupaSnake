/**
 * Tests for Dynasty Rulesets - the shared client/server scoring authority.
 * Determinism, exact tuning numbers, monotonicity, caps, integer outputs.
 */

import { GAME_CONFIG } from '@/shared/config/game';
import {
  BANK,
  COSMIC_CONSTELLATION,
  COSMIC_SPEED_MS,
  COSMIC_YIELD_CAP,
  COSMIC_YIELD_STEP,
  FOOD_BASE_DNA,
  FOOD_BASE_SCORE,
  RULESETS,
  applyOutcome,
  applyOutcomeWithMutations,
  computeRunTotals,
  getRuleset,
  normalizeDynastyName,
  outcomeMultipliers,
  rollExitInterval,
  rulesetExplainer,
  type DynastyName,
  CYBER_TICK_FLOOR_MS,
  PRIMAL_SPEED_MS,
  SCORE_TERMINUS_FOODS,
} from './rulesets';
import type { MutationPick } from './mutations';

const ALL_DYNASTIES: DynastyName[] = ['PRIMAL', 'CYBER', 'COSMIC'];

describe('bank constants', () => {
  it('banks +25% on extraction and salvages 60% on death', () => {
    expect(BANK.extractMultiplier).toBe(1.25);
    expect(BANK.deathMultiplier).toBe(0.6);
  });

  it('bases food DNA on the GAME_CONFIG economy value (PRIMAL base 10)', () => {
    expect(FOOD_BASE_DNA).toBe(GAME_CONFIG.economy.dna.foodValue);
    expect(FOOD_BASE_DNA).toBe(10);
    expect(FOOD_BASE_SCORE).toBe(10);
  });
});

describe('PRIMAL ruleset (Steady Growth)', () => {
  const primal = RULESETS.PRIMAL;

  it('has a fixed speed of its own, no longer the config initial speed', () => {
    // WP-3.08 (DYNASTY_PRIMAL §2.5): 200 -> 175, the midpoint of the doc's
    // 170-180 band. The constant moved OUT of GAME_CONFIG because
    // `initialSpeed` is also the numerator of CYBER's speed curve - retuning
    // PRIMAL there would have silently retuned CYBER too. That separation is
    // the assertion, not a detail: these two numbers must be able to differ.
    expect(PRIMAL_SPEED_MS).toBe(175);
    expect(PRIMAL_SPEED_MS).not.toBe(GAME_CONFIG.snake.initialSpeed);
    expect(primal.speedForFood(0)).toBe(PRIMAL_SPEED_MS);
    expect(primal.speedForFood(1)).toBe(175);
    expect(primal.speedForFood(50)).toBe(175);
    expect(primal.speedForFood(500)).toBe(175);
  });

  it('stays inside the band the config declares, and above the interpolation', () => {
    // The tempo may move within 170-180, but not out of the band the engine's
    // own smoothing assumes: a tick shorter than `interpolationDuration` means
    // the next move starts before the last one has finished drawing. 175 keeps
    // 25ms of margin - COSMIC has shipped at 160 with 10ms for months.
    expect(PRIMAL_SPEED_MS).toBeGreaterThanOrEqual(170);
    expect(PRIMAL_SPEED_MS).toBeLessThanOrEqual(180);
    expect(PRIMAL_SPEED_MS).toBeGreaterThan(GAME_CONFIG.snake.interpolationDuration);
    expect(PRIMAL_SPEED_MS).toBeLessThanOrEqual(GAME_CONFIG.snake.initialSpeed);
    expect(PRIMAL_SPEED_MS).toBeGreaterThan(GAME_CONFIG.snake.minSpeed);
  });

  it('compounds food value: round(10 * (1 + 0.02 * (n - 1)))', () => {
    expect(primal.foodDnaValue(1)).toBe(10);
    expect(primal.foodDnaValue(2)).toBe(10); // 10.2 -> 10
    expect(primal.foodDnaValue(3)).toBe(10); // 10.4 -> 10
    expect(primal.foodDnaValue(4)).toBe(11); // 10.6 -> 11
    expect(primal.foodDnaValue(11)).toBe(12); // 12.0
    expect(primal.foodDnaValue(26)).toBe(15); // 15.0
    expect(primal.foodDnaValue(51)).toBe(20); // 20.0
    expect(primal.foodDnaValue(100)).toBe(30); // 29.8 -> 30
  });

  it('food value never decreases with n', () => {
    for (let n = 2; n <= 200; n++) {
      expect(primal.foodDnaValue(n)).toBeGreaterThanOrEqual(primal.foodDnaValue(n - 1));
    }
  });

  it('back-loads score: x0.5 opening, +0.1 per two foods, capped x2.0', () => {
    // WP-3.08 / D3. The shipped `() => 1` is gone: PRIMAL earns by depth, so
    // the number the leaderboard ranks now says so too (Constitution §6.1).
    expect(primal.scoreMultiplier(1)).toBe(0.5);
    expect(primal.scoreMultiplier(2)).toBe(0.6);
    expect(primal.scoreMultiplier(3)).toBe(0.6); // the step is two foods wide
    expect(primal.scoreMultiplier(10)).toBe(1); // parity with the old flat curve
    expect(primal.scoreMultiplier(14)).toBe(1.2);
    expect(primal.scoreMultiplier(20)).toBe(1.5);
    expect(primal.scoreMultiplier(30)).toBe(2); // the cap engages here
    expect(primal.scoreMultiplier(100)).toBe(2);
    expect(primal.scoreMultiplier(500)).toBe(2);
  });

  it('never decreases with n, and pays exact integer points at base 10', () => {
    // Exactness is the reason the curve is written as a division by ten:
    // `0.5 + 0.1 * 7` is 1.2000000000000002, and a pinned x1.2 would be a lie.
    // With it, the fold's Math.round never actually rounds.
    for (let n = 2; n <= 200; n++) {
      expect(primal.scoreMultiplier(n)).toBeGreaterThanOrEqual(
        primal.scoreMultiplier(n - 1)
      );
      const points = FOOD_BASE_SCORE * primal.scoreMultiplier(n);
      expect(points).toBe(Math.round(points));
    }
  });
});

describe('CYBER ruleset (Overclock)', () => {
  const cyber = RULESETS.CYBER;

  it('ramps speed from initialSpeed by food count (log curve, clamped to minSpeed)', () => {
    expect(cyber.speedForFood(0)).toBe(GAME_CONFIG.snake.initialSpeed);
    // floor(200 / (1 + 0.03 * f))
    expect(cyber.speedForFood(1)).toBe(194);
    expect(cyber.speedForFood(10)).toBe(153);
    expect(cyber.speedForFood(30)).toBe(105);
    // WP-3.04: the floor is CYBER's own 100ms, not the global 50ms. Three
    // in-run owner calls bracket it (94ms 'approaching sensible', 97ms 'ends
    // being fun', 84ms 'way too fast'), agreeing with the reaction-time bound
    // of ~100-120ms for a grid game. Under the old floor two thirds of the
    // speed curve sat below playable; past the floor the difficulty now comes
    // from the arena instead.
    expect(cyber.speedForFood(100)).toBe(CYBER_TICK_FLOOR_MS);
    expect(cyber.speedForFood(1000)).toBe(CYBER_TICK_FLOOR_MS);
    expect(CYBER_TICK_FLOOR_MS).toBeGreaterThan(GAME_CONFIG.snake.minSpeed);
  });

  it('speed never increases with food count and never drops below minSpeed', () => {
    for (let f = 1; f <= 300; f++) {
      expect(cyber.speedForFood(f)).toBeLessThanOrEqual(cyber.speedForFood(f - 1));
      expect(cyber.speedForFood(f)).toBeGreaterThanOrEqual(GAME_CONFIG.snake.minSpeed);
    }
  });

  it('front-loads score: a four-food tent, x1 -> x3 by food 16, then decaying', () => {
    // WP-3.08 / D3. Score is no longer the DNA tier multiplier - the two ask
    // different questions (Yield §6.2 vs Score §6.1) and sharing one function
    // conflated them. The tail decays because past the tick floor speed stopped
    // being difficulty and became inefficiency: ticks per food climbed 18 ->
    // 113 in the owner's banked run, and those foods should not pay full price.
    // Rise: tiers 0-4 on floor(n/4)
    expect(cyber.scoreMultiplier(1)).toBe(1);
    expect(cyber.scoreMultiplier(3)).toBe(1);
    expect(cyber.scoreMultiplier(4)).toBe(1.5);
    expect(cyber.scoreMultiplier(8)).toBe(2);
    expect(cyber.scoreMultiplier(12)).toBe(2.5);
    // Peak: foods 16-19
    expect(cyber.scoreMultiplier(16)).toBe(3);
    expect(cyber.scoreMultiplier(19)).toBe(3);
    // Decay: the same steps back down
    expect(cyber.scoreMultiplier(20)).toBe(2.5);
    expect(cyber.scoreMultiplier(24)).toBe(2);
    expect(cyber.scoreMultiplier(28)).toBe(1.5);
    expect(cyber.scoreMultiplier(32)).toBe(1);
    // Floor: x0.5 from food 36, forever
    expect(cyber.scoreMultiplier(36)).toBe(0.5);
    expect(cyber.scoreMultiplier(500)).toBe(0.5);
  });

  it('earns two thirds of a terminus run in its first half', () => {
    // The claim "front-loaded", stated as the only thing that makes it true.
    let firstHalf = 0;
    let whole = 0;
    for (let n = 1; n <= SCORE_TERMINUS_FOODS; n++) {
      const points = Math.round(FOOD_BASE_SCORE * cyber.scoreMultiplier(n));
      if (n <= SCORE_TERMINUS_FOODS / 2) firstHalf += points;
      whole += points;
    }
    expect(firstHalf / whole).toBeGreaterThan(0.6);
  });

  it('keeps the five-food DNA tier: floor(n/5) capped at 4, mult = 1 + 0.5 * tier', () => {
    // The DNA multiplier is UNCHANGED by the score curve rework. It is asserted
    // through foodDnaValue because that is now its only caller.
    expect(cyber.foodDnaValue(1)).toBe(10); // tier 0 -> x1
    expect(cyber.foodDnaValue(4)).toBe(10);
    expect(cyber.foodDnaValue(5)).toBe(15); // tier 1 -> x1.5
    expect(cyber.foodDnaValue(9)).toBe(15);
    expect(cyber.foodDnaValue(10)).toBe(20); // tier 2 -> x2
    expect(cyber.foodDnaValue(15)).toBe(25); // tier 3 -> x2.5
    expect(cyber.foodDnaValue(20)).toBe(30); // tier 4 (capped) -> x3
    expect(cyber.foodDnaValue(100)).toBe(30);
    expect(cyber.foodDnaValue(500)).toBe(30);
  });
});

describe('COSMIC ruleset (the torus and the constellation)', () => {
  const cosmic = RULESETS.COSMIC;

  it('has a fixed 160 ms tick, still the faster of the two fixed tempos', () => {
    expect(COSMIC_SPEED_MS).toBe(160);
    expect(cosmic.speedForFood(0)).toBe(160);
    expect(cosmic.speedForFood(80)).toBe(160);
    // WP-3.08 closed PRIMAL's 40ms lead to 15ms. It must not invert: COSMIC's
    // clustered groups and combo window are authored against being the quicker
    // board, and its flux phases are tick-counted at 160.
    expect(COSMIC_SPEED_MS).toBeLessThan(PRIMAL_SPEED_MS);
  });

  it('mid-weights score: a six-food tent peaking x2.5 across foods 24-29', () => {
    // WP-3.08 / D3. COSMIC's skill is the chain, and a chain needs a run
    // already in progress to exist, so the shape pays in the middle - where the
    // dynasty's own mechanic can actually be played.
    expect(cosmic.scoreMultiplier(1)).toBe(0.5);
    expect(cosmic.scoreMultiplier(6)).toBe(1);
    expect(cosmic.scoreMultiplier(12)).toBe(1.5);
    expect(cosmic.scoreMultiplier(18)).toBe(2);
    expect(cosmic.scoreMultiplier(24)).toBe(2.5); // peak
    expect(cosmic.scoreMultiplier(29)).toBe(2.5);
    expect(cosmic.scoreMultiplier(30)).toBe(2);
    expect(cosmic.scoreMultiplier(36)).toBe(1.5);
    expect(cosmic.scoreMultiplier(42)).toBe(1);
    expect(cosmic.scoreMultiplier(48)).toBe(0.5); // floor
    expect(cosmic.scoreMultiplier(500)).toBe(0.5);
  });

  it('keeps every per-food base score a multiple of 5', () => {
    // WP-3.08 made this load-bearing: the combo stepped by 0.2, so
    // `base x combo` was an exact integer only while base was a multiple of 5,
    // and breaking it meant an honest max-combo run rounded past
    // `floor(base x COSMIC_TRUST_MAX_BONUS_RATIO)` - round(9 x 2.4) = 22 is a
    // bonus of 13 against a ceiling of 12.6 - and the server clamped a
    // legitimate score downward.
    //
    // WP-3.13 DELETED THE COMBO, so nothing multiplies these values any more
    // and the constraint no longer binds. The assertion is kept, at its
    // reduced strength, for two reasons: the curve is unchanged and still
    // satisfies it, and a per-food multiplier returning to COSMIC is exactly
    // the change that would need to know this was ever true.
    for (let n = 1; n <= 200; n++) {
      expect((FOOD_BASE_SCORE * cosmic.scoreMultiplier(n)) % 5).toBe(0);
    }
  });

  it('yields on a compounding curve to a x3 ceiling, not a flat 10', () => {
    // WP-3.13. `foodDnaValue` was flat because the COMBO was COSMIC's Yield
    // story; deleting the combo left the flat base standing alone, which is a
    // hole rather than a design.
    expect(cosmic.foodDnaValue(1)).toBe(10);
    expect(cosmic.foodDnaValue(12)).toBe(14);
    expect(cosmic.foodDnaValue(24)).toBe(19);
    expect(cosmic.foodDnaValue(48)).toBe(29);
    // The ceiling is CYBER's x3, reached at food 51 rather than food 20 -
    // same destination, a much longer journey to it.
    expect(cosmic.foodDnaValue(51)).toBe(30);
    expect(cosmic.foodDnaValue(500)).toBe(30);
    expect(COSMIC_YIELD_STEP).toBe(0.04);
    expect(COSMIC_YIELD_CAP).toBe(3);
    // Exactly double PRIMAL's slope, which is the statement the shape makes:
    // the board closes on you faster, because you are the one closing it.
    expect(COSMIC_YIELD_STEP).toBe(2 * 0.02);
  });

  it('sits BETWEEN PRIMAL and CYBER in yield at the terminus', () => {
    // The Yield analogue of the score-curve gate below, and deliberately a
    // weaker claim than it. Score integrals are comparable by construction
    // (+/-10%); YIELD integrals never were and are not now - CYBER pays 1210
    // at 48 foods against PRIMAL's 705, a 1.72x spread that predates this
    // package, because run LENGTH compensates for it (CYBER runs are short,
    // PRIMAL's are long). So there is no single integral to match, and the
    // honest assertion is that COSMIC is no longer the outlier: it falls
    // inside the range the other two already span.
    //
    // The real parity gate for DNA is `genome.balance.test.ts`, which
    // measures expected value per ARCHETYPE - food count, bank probability
    // and genes included - and holds all five within +/-15% of target.
    const yieldAt = (dynasty: DynastyName) => {
      let total = 0;
      for (let n = 1; n <= SCORE_TERMINUS_FOODS; n++) {
        total += RULESETS[dynasty].foodDnaValue(n);
      }
      return total;
    };

    const primal = yieldAt('PRIMAL');
    const cyber = yieldAt('CYBER');
    const cosmicYield = yieldAt('COSMIC');
    expect([primal, cyber, cosmicYield]).toEqual([705, 1210, 931]);

    expect(cosmicYield).toBeGreaterThan(primal);
    expect(cosmicYield).toBeLessThan(cyber);
    // Before the re-base COSMIC paid 480 - 0.68x PRIMAL and 0.40x CYBER, so
    // the three spanned 2.52x. The spread that remains is PRIMAL against
    // CYBER and is not this package's to close.
    expect(Math.max(primal, cyber, cosmicYield) / Math.min(primal, cyber, cosmicYield))
      .toBeLessThanOrEqual(1.75);
  });

  it('carries the constellation config: 5 scattered stars on an 8s window', () => {
    expect(cosmic.constellation).toBe(COSMIC_CONSTELLATION);
    expect(COSMIC_CONSTELLATION.size).toBe(5);
    expect(COSMIC_CONSTELLATION.windowSeconds).toBe(8);
    expect(COSMIC_CONSTELLATION.scatterMinCells).toBe(5);
    expect(COSMIC_CONSTELLATION.calcifySeconds).toBe(2);
    expect(COSMIC_CONSTELLATION.glyphCount).toBe(3);
  });

  it('the window is worth about one perfect route, and no more', () => {
    // §3's invariant, as arithmetic rather than a hope: abandonment has to be
    // COMMON BUT NOT TOTAL. A window far above a perfect route collects
    // everything and the mechanic is inert; far below it collects nothing and
    // it is a death spiral rather than a route.
    //
    // A Manhattan step on this board is one tick, so a route's tick cost is
    // its length. Two uniform cells on an n x n torus are n/4 apart per axis,
    // so n/2 in Manhattan terms - and the route is `size` such hops: one to
    // reach the constellation, then `size - 1` between its stars.
    const grid = GAME_CONFIG.board.gridSize;
    const perfectRouteTicks = COSMIC_CONSTELLATION.size * (grid / 2);
    const windowTicks =
      (COSMIC_CONSTELLATION.windowSeconds * 1000) / COSMIC_SPEED_MS;

    expect(windowTicks / perfectRouteTicks).toBeGreaterThanOrEqual(0.8);
    expect(windowTicks / perfectRouteTicks).toBeLessThanOrEqual(1.3);

    // And it must at least be physically possible: the stars are never
    // closer together than `scatterMinCells`, so a route cannot be cheaper
    // than that many ticks per hop however lucky the scatter is.
    expect(windowTicks).toBeGreaterThanOrEqual(
      (COSMIC_CONSTELLATION.size - 1) * COSMIC_CONSTELLATION.scatterMinCells
    );
  });

  it('the board wraps, permanently, and only COSMIC does', () => {
    expect(cosmic.torus).toBe(true);
    expect(RULESETS.PRIMAL.torus).toBeUndefined();
    expect(RULESETS.CYBER.torus).toBeUndefined();
  });

  it('PRIMAL and CYBER carry no constellation', () => {
    expect(RULESETS.PRIMAL.constellation).toBeUndefined();
    expect(RULESETS.CYBER.constellation).toBeUndefined();
  });

  it('COSMIC schedules no ARENA - its terrain is the stars it missed', () => {
    // The distinction matters: `arena` is a food-indexed schedule that
    // hardens the outer ring, and COSMIC has none. Its blocks are produced
    // by play, which is why the ratio is an outcome rather than a dial.
    expect(cosmic.arena).toBeUndefined();
  });
});

describe('integer determinism', () => {
  it('every foodDnaValue is a non-negative integer for all dynasties', () => {
    for (const dynasty of ALL_DYNASTIES) {
      const ruleset = RULESETS[dynasty];
      for (let n = 1; n <= 500; n++) {
        const value = ruleset.foodDnaValue(n);
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('computeRunTotals returns integers and is repeatable', () => {
    for (const dynasty of ALL_DYNASTIES) {
      for (const count of [0, 1, 7, 30, 60, 100, 333]) {
        const first = computeRunTotals(dynasty, count);
        const second = computeRunTotals(dynasty, count);
        expect(first).toEqual(second);
        expect(Number.isInteger(first.rawDna)).toBe(true);
        expect(Number.isInteger(first.score)).toBe(true);
      }
    }
  });

  it('speedForFood is a pure integer ms/tick for all dynasties', () => {
    for (const dynasty of ALL_DYNASTIES) {
      const ruleset = RULESETS[dynasty];
      for (let f = 0; f <= 300; f++) {
        expect(Number.isInteger(ruleset.speedForFood(f))).toBe(true);
      }
    }
  });
});

describe('computeRunTotals', () => {
  it('returns zeros for zero, negative, and non-finite food counts', () => {
    for (const dynasty of ALL_DYNASTIES) {
      expect(computeRunTotals(dynasty, 0)).toEqual({ rawDna: 0, score: 0 });
      expect(computeRunTotals(dynasty, -5)).toEqual({ rawDna: 0, score: 0 });
      expect(computeRunTotals(dynasty, NaN)).toEqual({ rawDna: 0, score: 0 });
    }
  });

  it('floors fractional food counts (defensive - counts are integers)', () => {
    expect(computeRunTotals('PRIMAL', 3.9)).toEqual(computeRunTotals('PRIMAL', 3));
  });

  it('is strictly increasing in food count', () => {
    for (const dynasty of ALL_DYNASTIES) {
      let prev = computeRunTotals(dynasty, 0);
      for (let count = 1; count <= 120; count++) {
        const next = computeRunTotals(dynasty, count);
        expect(next.rawDna).toBeGreaterThan(prev.rawDna);
        expect(next.score).toBeGreaterThan(prev.score);
        prev = next;
      }
    }
  });

  it('matches the fold of per-food values exactly', () => {
    for (const dynasty of ALL_DYNASTIES) {
      const ruleset = RULESETS[dynasty];
      let rawDna = 0;
      let score = 0;
      for (let n = 1; n <= 60; n++) {
        rawDna += ruleset.foodDnaValue(n);
        score += Math.round(FOOD_BASE_SCORE * ruleset.scoreMultiplier(n));
      }
      expect(computeRunTotals(dynasty, 60)).toEqual({ rawDna, score });
    }
  });

  it('produces the expected PRIMAL totals at economy checkpoints', () => {
    // DNA is untouched by WP-3.08 - stepped compounding, sum of
    // round(10 * (1 + 0.02 * (n-1)))
    expect(computeRunTotals('PRIMAL', 10).rawDna).toBe(109);
    expect(computeRunTotals('PRIMAL', 30).rawDna).toBe(387);
    expect(computeRunTotals('PRIMAL', 60).rawDna).toBe(954);
    expect(computeRunTotals('PRIMAL', 100).rawDna).toBe(1990);
    // Score is the back-loaded curve: 5 points on food 1, +1 every two foods,
    // 20 from food 30 on. It was a flat 10/food (300 at 30) before WP-3.08.
    expect(computeRunTotals('PRIMAL', 10).score).toBe(75);
    expect(computeRunTotals('PRIMAL', 30).score).toBe(375);
    expect(computeRunTotals('PRIMAL', 48).score).toBe(735);
    expect(computeRunTotals('PRIMAL', 100).score).toBe(1775);
  });

  it('produces the expected CYBER totals at economy checkpoints', () => {
    // DNA is untouched by WP-3.08 - the five-food tier:
    // 4x10 + 5x15 + 5x20 + 5x25 + (n-19)x30 from food 20 on
    expect(computeRunTotals('CYBER', 10).rawDna).toBe(135);
    expect(computeRunTotals('CYBER', 30).rawDna).toBe(670);
    expect(computeRunTotals('CYBER', 60).rawDna).toBe(1570);
    expect(computeRunTotals('CYBER', 100).rawDna).toBe(2770);
    // Score is the front-loaded tent, which used to be that same DNA curve
    // (670 at 30). Past the peak it decays, so the last 52 foods of a 100-food
    // run add 200 points between them - a fifth of what the first 20 paid.
    expect(computeRunTotals('CYBER', 10).score).toBe(150);
    expect(computeRunTotals('CYBER', 30).score).toBe(615);
    expect(computeRunTotals('CYBER', 48).score).toBe(735);
    expect(computeRunTotals('CYBER', 100).score).toBe(995);
  });

  it('COSMIC totals compound in DNA, mid-weight in score, and are COMPLETE', () => {
    // "Complete" is the WP-3.13 half: the combo bonus used to be layered on
    // top of both by the engine and clamped by the server, so neither of
    // these numbers was the whole payout. Both are now — which is also why
    // the DNA had to be re-based, since the combo was the whole Yield story.
    expect(computeRunTotals('COSMIC', 30)).toEqual({ rawDna: 474, score: 465 });
    expect(computeRunTotals('COSMIC', 48)).toEqual({ rawDna: 931, score: 720 });
  });

  it('holds the three score curves within ±10% at the terminus (D3)', () => {
    // THE deliverable of WP-3.08, and the reason the shapes are allowed to
    // differ at all. Constitution §6.1: "Each dynasty gets a shape - CYBER
    // front-loaded, PRIMAL back-loaded, COSMIC mid-weighted - with comparable
    // integrals at the terminus, so the dynasty is a choice of HOW you earn
    // rather than HOW MUCH." §17 item 30 sets the tolerance at ±10% and says
    // that if the integrals cannot be brought inside it, escalate rather than
    // mint a second board.
    //
    // The terminus is 48 foods: D1's candidate median run (REDESIGN_WAVE §1.3),
    // the number every other food-indexed dial in the catalog is being re-based
    // against. Summing to a longer run would measure a shape nobody plays; to a
    // shorter one, only the opening. Without this test "front-loaded" quietly
    // means "CYBER scores more", which is the exact defect §6.1 was written
    // about - Score per minute differed by roughly 10x while Rule 2 passed
    // mechanically the whole time.
    const integrals = ALL_DYNASTIES.map((dynasty) => {
      let total = 0;
      for (let n = 1; n <= SCORE_TERMINUS_FOODS; n++) {
        total += RULESETS[dynasty].scoreMultiplier(n);
      }
      return total;
    });

    expect(integrals).toEqual([73.5, 73.5, 72]); // PRIMAL, CYBER, COSMIC
    expect(Math.max(...integrals) / Math.min(...integrals) - 1).toBeLessThanOrEqual(0.1);

    // And the same statement in the number a player actually sees - the fold,
    // rounding and all, not just the multiplier.
    const scores = ALL_DYNASTIES.map(
      (dynasty) => computeRunTotals(dynasty, SCORE_TERMINUS_FOODS).score
    );
    expect(scores).toEqual([735, 735, 720]);
    expect(Math.max(...scores) / Math.min(...scores) - 1).toBeLessThanOrEqual(0.1);
  });

  it('gives each dynasty a genuinely different shape, not three flat curves', () => {
    // The other half of the deliverable: comparable integrals are only
    // interesting because the curves underneath them disagree. Measured as the
    // centre of mass of each curve - the food index the run's Score balances
    // on, as a fraction of the terminus. Equal integrals with equal centroids
    // would be three copies of one curve wearing different names.
    const centroid = (dynasty: DynastyName) => {
      const ruleset = RULESETS[dynasty];
      let weighted = 0;
      let total = 0;
      for (let n = 1; n <= SCORE_TERMINUS_FOODS; n++) {
        weighted += n * ruleset.scoreMultiplier(n);
        total += ruleset.scoreMultiplier(n);
      }
      return weighted / total / SCORE_TERMINUS_FOODS;
    };

    expect(centroid('CYBER')).toBeCloseTo(0.41, 2); // front-loaded
    expect(centroid('COSMIC')).toBeCloseTo(0.54, 2); // mid-weighted
    expect(centroid('PRIMAL')).toBeCloseTo(0.6, 2); // back-loaded
    expect(centroid('CYBER')).toBeLessThan(centroid('COSMIC'));
    expect(centroid('COSMIC')).toBeLessThan(centroid('PRIMAL'));
  });
});

describe('applyOutcome', () => {
  it('banks +25% (floored) on extraction', () => {
    expect(applyOutcome(100, true)).toBe(125);
    expect(applyOutcome(103, true)).toBe(128); // 128.75 -> 128
    expect(applyOutcome(0, true)).toBe(0);
  });

  it('salvages 60% (floored) on death', () => {
    expect(applyOutcome(100, false)).toBe(60);
    expect(applyOutcome(103, false)).toBe(61); // 61.8 -> 61
    expect(applyOutcome(1, false)).toBe(0);
  });

  it('never pays negative or non-finite values', () => {
    expect(applyOutcome(-50, true)).toBe(0);
    expect(applyOutcome(NaN, false)).toBe(0);
    expect(applyOutcome(Infinity, false)).toBe(0);
  });

  it('banked always beats salvage for the same raw total', () => {
    for (const dynasty of ALL_DYNASTIES) {
      for (const count of [1, 15, 30, 60, 100]) {
        const { rawDna } = computeRunTotals(dynasty, count);
        expect(applyOutcome(rawDna, true)).toBeGreaterThan(applyOutcome(rawDna, false));
      }
    }
  });
});

describe('extraction cadence config', () => {
  it('spawns the first portal at 15 foods, then every 12 +/- 4, despawn 90 ticks', () => {
    for (const dynasty of ALL_DYNASTIES) {
      const { extraction } = RULESETS[dynasty];
      expect(extraction.firstExitAtFood).toBe(15);
      expect(extraction.intervalBase).toBe(12);
      expect(extraction.intervalJitter).toBe(4);
      expect(extraction.despawnTicks).toBe(90);
    }
  });

  it('rollExitInterval spans [8, 16] inclusive and follows the injected rng', () => {
    const { extraction } = RULESETS.PRIMAL;
    expect(rollExitInterval(extraction, () => 0)).toBe(8);
    expect(rollExitInterval(extraction, () => 0.999999)).toBe(16);
    expect(rollExitInterval(extraction, () => 0.5)).toBe(12);

    // Every value in range is reachable, none outside it
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const value = rollExitInterval(extraction, () => i / 1000);
      expect(value).toBeGreaterThanOrEqual(8);
      expect(value).toBeLessThanOrEqual(16);
      seen.add(value);
    }
    expect(seen.size).toBe(9);
  });
});

describe('validation bounds', () => {
  it('gives CYBER a higher food-rate ceiling than the fixed-speed dynasties', () => {
    expect(RULESETS.CYBER.validation.maxFoodPerSecond).toBeGreaterThan(
      RULESETS.PRIMAL.validation.maxFoodPerSecond
    );
    expect(RULESETS.PRIMAL.validation.maxFoodPerSecond).toBe(1.0);
    expect(RULESETS.CYBER.validation.maxFoodPerSecond).toBe(2.5);
    // COSMIC: re-derived in WP-3.13 from the scatter rule - a wave of 5 at
    // a minimum 5-cell separation costs >= 21 ticks, so 5/(21 x 0.16s) = 1.49
    expect(RULESETS.COSMIC.validation.maxFoodPerSecond).toBe(1.5);
  });
});

describe('normalizeDynastyName', () => {
  it('accepts known names case-insensitively', () => {
    expect(normalizeDynastyName('PRIMAL')).toBe('PRIMAL');
    expect(normalizeDynastyName('cyber')).toBe('CYBER');
    expect(normalizeDynastyName('Cosmic')).toBe('COSMIC');
  });

  it('falls back to PRIMAL - the payout floor - for unknown values', () => {
    // It fell back to COSMIC, chosen and documented as "the conservative
    // payout floor" while COSMIC's food value was a flat 10. WP-3.13's Yield
    // re-base made that false, so the fallback follows the property it was
    // chosen for rather than the name it was chosen under.
    expect(normalizeDynastyName('VOID')).toBe('PRIMAL');
    expect(normalizeDynastyName(null)).toBe('PRIMAL');
    expect(normalizeDynastyName(undefined)).toBe('PRIMAL');
    expect(normalizeDynastyName(42)).toBe('PRIMAL');
  });
});

describe('getRuleset + explainers', () => {
  it('returns the ruleset matching the dynasty id', () => {
    for (const dynasty of ALL_DYNASTIES) {
      expect(getRuleset(dynasty).id).toBe(dynasty);
    }
  });

  it('provides a one-line explainer for every dynasty', () => {
    for (const dynasty of ALL_DYNASTIES) {
      expect(rulesetExplainer[dynasty]).toBeTruthy();
      expect(typeof rulesetExplainer[dynasty]).toBe('string');
    }
    expect(rulesetExplainer.PRIMAL).toBe(
      'Steady speed — every food worth more than the last'
    );
    expect(rulesetExplainer.CYBER).toBe(
      'Speed rises — survive the overclock for up to ×3'
    );
  });
});
