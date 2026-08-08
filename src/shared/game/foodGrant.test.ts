import { resolveFoodGrant, type FoodGrantInput } from './foodGrant';
import {
  MUTATION_ECONOMICS,
  foodValueModifier,
  isGoldenFood,
  type MutationPick,
} from './mutations';

/**
 * THE GRANT IS PINNED TO THE PAYOUT, NOT TO A NUMBER.
 *
 * The board now draws a golden food as a different object, which makes the
 * renderer a second reader of an economic rule. The failure that matters is
 * not "the donut never shows" - it is the donut showing on a food the run
 * does not pay triple for, because then the board is lying about value.
 *
 * So almost nothing here is asserted against a literal. The expectations are
 * derived from `foodValueModifier` and `MUTATION_ECONOMICS` - the engine's own
 * authorities - so retuning the cadence or the multiplier moves the test with
 * the game, and only a genuine DISAGREEMENT between the shape and the money
 * can fail it.
 */

const BASE: FoodGrantInput = {
  picks: [],
  foodEaten: 0,
  phoenixTriggered: false,
  foodsOnBoard: 1,
};

/** The run holds Gold Trail, picked before any food was eaten. */
const goldTrailPick: MutationPick = { id: 'gold_trail', atFood: 0 };

/**
 * What the ECONOMICS say about the n-th food, with Gold Trail the only pick:
 * the modifier is the gold multiplier on a golden food and exactly 1 on an
 * ordinary one, so this is an independent read of the same fact.
 */
function economicsCallGolden(
  picks: MutationPick[],
  n: number,
  phoenixAtFood: number | null = null
): boolean {
  return (
    foodValueModifier(picks, n, phoenixAtFood) ===
    MUTATION_ECONOMICS.goldTrailMultiplier
  );
}

/** The board's answer for a run that has eaten n-1 foods. */
function grantForFood(
  picks: MutationPick[],
  n: number,
  overrides: Partial<FoodGrantInput> = {}
) {
  return resolveFoodGrant({
    ...BASE,
    picks,
    foodEaten: n - 1,
    ...overrides,
  });
}

describe('the food grant tracks the payout', () => {
  /**
   * The whole contract in one assertion, over a range long enough to cover
   * several cadence periods: the donut appears on exactly the foods the run
   * pays the gold multiplier for. Neither list is written down.
   */
  it('grants golden on exactly the foods the economics multiply', () => {
    const picks = [goldTrailPick];
    const drawnGolden: number[] = [];
    const paidGolden: number[] = [];
    for (let n = 1; n <= 30; n += 1) {
      if (grantForFood(picks, n) === 'golden') drawnGolden.push(n);
      if (economicsCallGolden(picks, n)) paidGolden.push(n);
    }
    expect(drawnGolden).toEqual(paidGolden);
    // A range that proves something: several periods, not an empty set.
    expect(drawnGolden.length).toBeGreaterThan(3);
  });

  /** The cadence comes off the constant, so retuning it moves the test. */
  it('spaces golden foods by the economics cadence', () => {
    const picks = [goldTrailPick];
    const golden: number[] = [];
    for (let n = 1; n <= 30; n += 1) {
      if (grantForFood(picks, n) === 'golden') golden.push(n);
    }
    for (const n of golden) {
      expect((n - goldTrailPick.atFood) % MUTATION_ECONOMICS.goldTrailEveryNth).toBe(0);
    }
    expect(golden[0]).toBe(
      goldTrailPick.atFood + MUTATION_ECONOMICS.goldTrailEveryNth
    );
  });

  it('never grants golden to a run holding no genes', () => {
    for (let n = 1; n <= 30; n += 1) {
      expect(grantForFood([], n)).toBeNull();
    }
  });

  /**
   * A pick pays only for foods eaten AFTER it. A board that gilded the food
   * already sitting there would pay a gene retroactively in the one currency
   * the player reads before committing.
   */
  it('grants nothing for foods at or before the pick', () => {
    const picks: MutationPick[] = [{ id: 'gold_trail', atFood: 12 }];
    for (let n = 1; n <= 12; n += 1) {
      expect(grantForFood(picks, n)).toBeNull();
      expect(economicsCallGolden(picks, n)).toBe(false);
    }
    expect(
      grantForFood(picks, 12 + MUTATION_ECONOMICS.goldTrailEveryNth)
    ).toBe('golden');
  });

  /**
   * Phoenix voids benefit modifiers, and golden is a benefit. The board has
   * only the boolean; the economics have the index. They must still agree.
   */
  it('stops granting golden once Phoenix has fired', () => {
    const picks = [goldTrailPick];
    const firstGolden = MUTATION_ECONOMICS.goldTrailEveryNth;
    // Sanity: this food is golden while Phoenix has not fired.
    expect(grantForFood(picks, firstGolden)).toBe('golden');
    expect(economicsCallGolden(picks, firstGolden)).toBe(true);
    // Phoenix fired earlier in the run; benefits are void from here on.
    expect(
      grantForFood(picks, firstGolden, { phoenixTriggered: true })
    ).toBeNull();
    expect(economicsCallGolden(picks, firstGolden, firstGolden - 1)).toBe(false);
  });
});

describe('the honesty clause', () => {
  /**
   * On a constellation wave the engine prices foods in the order the PLAYER
   * eats them, so "the next food is golden" does not name a cell. The board
   * declines rather than guessing - and the economics still say golden, which
   * is exactly why declining has to be deliberate and tested.
   */
  it('declines to gild any cell while a wave is live', () => {
    const picks = [goldTrailPick];
    const n = MUTATION_ECONOMICS.goldTrailEveryNth;
    expect(economicsCallGolden(picks, n)).toBe(true);
    expect(grantForFood(picks, n, { foodsOnBoard: 1 })).toBe('golden');
    for (const foodsOnBoard of [2, 3, 5]) {
      expect(grantForFood(picks, n, { foodsOnBoard })).toBeNull();
    }
  });

  it('grants nothing when the board holds no food at all', () => {
    const picks = [goldTrailPick];
    expect(
      grantForFood(picks, MUTATION_ECONOMICS.goldTrailEveryNth, {
        foodsOnBoard: 0,
      })
    ).toBeNull();
  });
});

describe('one authority for goldenness', () => {
  /**
   * `isGoldenFood` and `foodValueModifier` are the shape's source and the
   * money's source, and they now share one expression. This is the test that
   * fails if somebody re-inlines the rule into either of them.
   */
  it('agrees with the value modifier across picks and indices', () => {
    const cases: MutationPick[][] = [
      [],
      [goldTrailPick],
      [{ id: 'gold_trail', atFood: 7 }],
      [{ id: 'overgrowth', atFood: 0 }],
      [
        { id: 'gold_trail', atFood: 3 },
        { id: 'overgrowth', atFood: 3 },
      ],
    ];
    for (const picks of cases) {
      for (let n = 1; n <= 25; n += 1) {
        const gilded = isGoldenFood(picks, n);
        const modifier = foodValueModifier(picks, n);
        const ordinary = foodValueModifier(
          picks.filter((pick) => pick.id !== 'gold_trail'),
          n
        );
        // Golden is exactly "the gold multiplier is in this food's price".
        expect({ n, gilded }).toEqual({
          n,
          gilded: modifier === ordinary * MUTATION_ECONOMICS.goldTrailMultiplier,
        });
      }
    }
  });
});
