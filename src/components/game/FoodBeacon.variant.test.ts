import { foodVariantForGrant, ORDINARY_FOOD } from './FoodBeacon';
import { resolveFoodGrant } from '@/shared/game/foodGrant';
import { MUTATION_ECONOMICS, type MutationPick } from '@/shared/game/mutations';

/**
 * THE SEAM: an engine grant becomes a drawn shape.
 *
 * `foodGrant.test.ts` proves the grant tracks the payout. This proves the
 * board draws what the grant says - the other half of the same promise, and
 * the half that a renderer refactor could break without any economics test
 * noticing.
 */

describe('grant to variant', () => {
  it('draws the ordinary food when the run grants nothing', () => {
    expect(foodVariantForGrant(null)).toBe('standard');
  });

  it('draws the golden variant on a golden grant', () => {
    expect(foodVariantForGrant('golden')).toBe('golden');
  });

  /**
   * THE GENERIC PATH. `wager` has no engine source yet, and this is the test
   * that keeps the mechanism ready for one: the day the engine grants it, the
   * board draws the berry with no renderer change. A special case for golden
   * would fail here.
   */
  it('draws the wager variant on a wager grant, with no special case', () => {
    expect(foodVariantForGrant('wager')).toBe('wager');
  });

  /** `standard` is an alias, and the apple is what it resolves to. */
  it('keeps the ordinary food the apple', () => {
    expect(ORDINARY_FOOD).toBe('apple');
  });

  /**
   * End to end, the way the board runs it: engine state in, drawn variant
   * out, with nothing hardcoded between them.
   */
  it('turns a Gold Trail run into a golden pickup on the board', () => {
    const picks: MutationPick[] = [{ id: 'gold_trail', atFood: 0 }];
    const goldenIndex = MUTATION_ECONOMICS.goldTrailEveryNth;
    const drawn = (n: number) =>
      foodVariantForGrant(
        resolveFoodGrant({
          picks,
          foodEaten: n - 1,
          phoenixTriggered: false,
          foodsOnBoard: 1,
        })
      );
    expect(drawn(goldenIndex)).toBe('golden');
    expect(drawn(goldenIndex - 1)).toBe('standard');
    expect(drawn(goldenIndex + 1)).toBe('standard');
  });
});
