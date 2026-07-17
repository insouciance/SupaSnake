/**
 * Clan Duel ELO - pure TS mirror of the SQL rating math in
 * supabase/migrations/011_clan_duels.sql (settle_and_pair_duels).
 *
 * Used client-side to display projected rating changes; the server-side
 * SQL is authoritative for actual settlement.
 *
 * - Ratings start at 1000
 * - K = 32
 * - expected(winner) = 1 / (1 + 10^((Rloser - Rwinner) / 400))
 * - Winner takes ROUND(K * (1 - expected)) from the loser
 * - Ties: no rating change (split - no bonus either)
 */

export const ELO_K = 32;
export const STARTING_RATING = 1000;

/**
 * Expected score of clan A against clan B (0..1).
 * Mirrors SQL: 1.0 / (1.0 + power(10.0, (Rb - Ra) / 400.0))
 */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Rating points transferred from loser to winner.
 * Mirrors SQL: ROUND(32 * (1 - expected_winner))
 */
export function ratingDeltaForWin(winnerRating: number, loserRating: number): number {
  return Math.round(ELO_K * (1 - expectedScore(winnerRating, loserRating)));
}

export interface ProjectedRatingChange {
  /** Points gained if my clan wins */
  win: number;
  /** Points lost if my clan loses (negative number) */
  loss: number;
  /** Ties split: no rating change */
  tie: 0;
}

/**
 * Projected rating change for my clan against an opponent, for UI display.
 */
export function projectedRatingChange(
  myRating: number,
  opponentRating: number
): ProjectedRatingChange {
  return {
    win: ratingDeltaForWin(myRating, opponentRating),
    loss: -ratingDeltaForWin(opponentRating, myRating),
    tie: 0,
  };
}
