import { isGoldenFood, type FoodPick } from './mutations';

/**
 * THE FOOD GRANT - what the engine says the pickup on the board IS.
 *
 * One read-only derivation, shared by every surface that draws food. The
 * renderer owns shape and colour; this owns the question those answer, and
 * the question is economic: the run either grants the next food a special
 * value or it does not.
 *
 * READ-ONLY, AND STRICTLY ONE-WAY. Every input is state the store already
 * mirrors out of the engine; nothing here writes, and nothing derived here
 * flows back. Drawing a golden pickup cannot change what one pays.
 *
 * WHY A GRANT AND NOT A BOOLEAN. `wager` has no engine source today. When one
 * arrives it becomes a branch in this function and the renderers do not change
 * at all - they already map a grant to a variant one-for-one. That is the
 * whole reason the return type is a union rather than `isGolden`.
 */
export type FoodGrant = 'golden' | 'wager';

export interface FoodGrantInput {
  /** Genes held this run, in raw pick order - `heldMutations` off the store. */
  readonly picks: readonly FoodPick[];
  /**
   * `foodEaten` off the store. The pickup on the board is the NEXT food, so
   * the index the economics will price it at is this plus one.
   */
  readonly foodEaten: number;
  /**
   * `phoenixTriggered` off the store.
   *
   * The economics take the food INDEX Phoenix fired at, and the store keeps
   * only the boolean. That is exactly enough here and the reason is worth
   * stating: this function only ever asks about the food the player has not
   * eaten yet, which is always after any trigger that has already happened.
   * So "Phoenix has fired" and "benefits are void for this food" are the same
   * claim, and the boolean is not an approximation of the index - it is the
   * complete answer to the only question asked.
   */
  readonly phoenixTriggered: boolean;
  /**
   * How many pickups are on the board right now.
   *
   * THE HONESTY CLAUSE, and the one rule here that is not economics.
   *
   * A COSMIC constellation wave puts several foods out at once, and the
   * engine prices them in the order the PLAYER eats them - not the order they
   * spawned. When Gold Trail makes the next food golden and three are on the
   * board, exactly one of them will be golden and which one is not knowable
   * until the player commits. Marking all three would promise three payouts
   * the run will not make; marking one would be a guess wearing the authority
   * of a readout.
   *
   * So a grant attaches to a CELL only when there is exactly one cell it can
   * mean. On a wave the pickups stay ordinary - the value is still paid, it
   * is simply not drawn on a specific fruit, because no specific fruit has it
   * yet. Food that lies about its value is worse than food that stays quiet.
   */
  readonly foodsOnBoard: number;
}

/**
 * What the engine grants the pickup currently on the board, or null for the
 * ordinary food.
 */
export function resolveFoodGrant(input: FoodGrantInput): FoodGrant | null {
  if (input.foodsOnBoard !== 1) return null;
  // Golden is a BENEFIT, and Phoenix voids benefits for every food after it
  // fired - which is every food this function is ever asked about.
  if (input.phoenixTriggered) return null;
  if (isGoldenFood(input.picks, input.foodEaten + 1)) return 'golden';
  return null;
}
