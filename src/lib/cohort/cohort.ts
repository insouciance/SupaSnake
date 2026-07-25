/**
 * Audience cohorts (GT §13).
 *
 * The database holds 415 player rows and 15 with a completed run. The rest is
 * developer, QA and fixture activity, and until now there was no way to tell
 * the two apart — so every public number a stranger could see was mostly noise
 * about the people who built the game.
 *
 * `players.cohort` (migration 045) is the separation. It is a READ-SIDE label
 * and nothing else:
 *
 *   - Rule 6: flagging an account deletes nothing, lowers nothing, revokes
 *     nothing. The account keeps every run, every DNA, every record, every
 *     cosmetic and every private surface. It is simply not shown to strangers.
 *   - Rule 2: cohort is never read on any path that computes a score, a
 *     payout, a Yield or a record. It is consulted only where a public surface
 *     decides what to render.
 *   - Rule 11: the label lives on the server and is applied in the query. No
 *     client asserts its own cohort, and no client can see another account's.
 *
 * It composes with — never replaces — WP-0.05's run eligibility. A run must
 * still be ended, validated, non-Free-Play and non-Anomaly to rank; the cohort
 * decides whether the *account* is shown at all. Both gates must pass.
 */

/** Every value `players.cohort` may hold (migration 045 CHECK). */
export const PLAYER_COHORTS = ['player', 'dev', 'qa', 'fixture'] as const;

export type PlayerCohort = (typeof PLAYER_COHORTS)[number];

/** The only cohort a public surface renders. */
export const PUBLIC_COHORT: PlayerCohort = 'player';

export function isPlayerCohort(value: unknown): value is PlayerCohort {
  return (
    typeof value === 'string' &&
    (PLAYER_COHORTS as readonly string[]).includes(value)
  );
}

/**
 * May a stranger be shown this account?
 *
 * `null`/`undefined` means the column is not there yet (a deploy that lands
 * ahead of migration 045). That degrades to "public", which is exactly the
 * behaviour of the release before this one — the alternative, failing closed,
 * would blank every board for the length of the window.
 */
export function isPublicCohort(cohort: unknown): boolean {
  if (cohort === null || cohort === undefined) return true;
  return cohort === PUBLIC_COHORT;
}

/** The inverse, for filters that want to name what they are removing. */
export function isExcludedCohort(cohort: unknown): boolean {
  return !isPublicCohort(cohort);
}
