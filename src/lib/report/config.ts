/**
 * The World Report rollout switch (Constitution §7.5, Phase 2 gate).
 *
 * DEFAULTED OFF. The World Report is a player-visible surface and the
 * handoff's merge protocol keeps every one of those behind a `NEXT_PUBLIC_*`
 * flag until the phase gate passes — so `NEXT_PUBLIC_WORLD_REPORT_V1` must be
 * set to the exact string `true` to arm it. Anything else, including the
 * variable being absent, is off.
 *
 * The project rule is that a rollback path is TESTED, never inferred from an
 * omitted flag: `WorldReportCard.flagOff.test.tsx` and
 * `route.flagOff.test.ts` exercise the off path explicitly.
 *
 * WHAT "OFF" MEANS, PRECISELY
 *
 *   - `GET /api/report` answers 200 with `{ live: false, report: null }`, so a
 *     surface renders an off state rather than handling a 404.
 *   - `WorldReportCard` returns null at module scope before any fetch — no
 *     request, no card, no measurable trace.
 *   - Nothing else changes anywhere. The World Report writes no row, settles
 *     nothing and gates nothing, so there is no state for a flag flip to
 *     strand in either direction. Flipping it off mid-season removes a screen
 *     and removes nothing else.
 *
 * Client and server import the same build-time constant, so a deployment can
 * never split the report's existence between the two halves.
 */
export const WORLD_REPORT_V1_ENABLED =
  process.env.NEXT_PUBLIC_WORLD_REPORT_V1 === 'true';

/**
 * §7.5: "when a player comes back after three or more absent days [H]".
 *
 * THIS IS NOT A CUT LINE AND NO SURFACE MAY RENDER IT AS ONE (Rule 8).
 *
 * It decides only whether there is enough elapsed world to be worth reading
 * back. A player below it is shown nothing — not a counter, not "2 more days
 * until your report", not a teaser. Nothing is withheld from them, because the
 * report contains nothing to withhold: every fact in it is already readable at
 * its own URL, every day of it.
 */
export const WORLD_REPORT_MIN_ABSENT_DAYS = 3;

/**
 * How many Serpent weeks the report names one by one.
 *
 * DELIBERATELY SMALL, AND THE MAIN ANTI-BACKLOG DEVICE IN THE FEATURE. A
 * season away is thirteen submerged weeks; thirteen lines is a punch-list, and
 * a punch-list is a backlog with better typography. Beyond this limit the
 * report summarises in one sentence and stops — "nine earlier weeks settled
 * before those" — which is news, where an enumeration would be a queue.
 *
 * It also bounds the server's work: a report costs at most this many
 * roll-up reads no matter how long the absence, so a two-year return is the
 * same query cost as a two-week one (Rule 13).
 */
export const WORLD_REPORT_WEEK_LIMIT = 4;

/**
 * How many clans a single week's line can name. A sentence length, not a bar:
 * a clan below it is excluded from nothing and told nothing (Rule 8).
 */
export const WORLD_REPORT_CLAN_LIMIT = 2;

/**
 * The absence bands §7.5 is written against — "away a week, a month, a
 * season". Days are the floor; anything longer reads as one of the three.
 *
 * The bands change one clause of the headline and nothing else. No band pays
 * differently, unlocks differently or is worth reaching, because a band is not
 * an achievement — it is a description of how long the calendar ran.
 */
export const WORLD_REPORT_SPAN_DAYS = {
  week: 7,
  month: 28,
  season: 90,
} as const;
