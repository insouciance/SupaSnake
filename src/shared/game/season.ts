/**
 * Seasons - Design v2 Phase 4B (GAME_DESIGN_V2.md sections 7.2 + 8.4)
 *
 * TS mirror of the season/playoff math in migration 021 - keep in
 * lockstep. Single source of truth for:
 *
 * - the season window shape: 7-week seasons (doc range 6-8; 7 fixed for
 *   launch), Monday-aligned, "seasons add and never wipe"
 * - the seasonal mutation catalog (2-3 per season, in the offer pool all
 *   season, then joining the permanent pool - PoE league-into-core)
 * - the season playoffs (section 8.4): final 2 weeks, top 8 clans by
 *   rating, single-elimination bracket on the weekly Gauntlet protocol.
 *
 * PLAYOFF FORMAT RESOLUTION (doc ambiguity, resolved): an 8-clan single
 * elimination needs 3 rounds, but the doc gives the bracket exactly 2
 * weeks of weekly protocol. Resolution: Week 6 = quarterfinals (1v8, 2v7,
 * 3v6, 4v5), Week 7 = the CHAMPIONSHIP WEEK - both semifinals run on the
 * weekly protocol, and the champion is the semifinal WINNER with the
 * higher counted score that week (seed breaks ties). The final is decided
 * by the same week's scoreboard rather than a third week that does not
 * exist. Champion rewards are cosmetics + banner history only - never
 * economy (section 8.4).
 */

export const SEASON_WEEKS = 7;
export const PLAYOFF_WEEKS = 2;
export const PLAYOFF_CLANS = 8;

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** A season window as read surfaces see it (dates are UTC midnights). */
export interface SeasonWindow {
  seq: number;
  /** Monday 00:00 UTC the season starts (inclusive). */
  startsAt: Date;
  /** Monday 00:00 UTC the season ends (exclusive) - startsAt + 7 weeks. */
  endsAt: Date;
}

/** Build the canonical 7-week window from a Monday start. */
export function seasonWindow(seq: number, startsAt: Date): SeasonWindow {
  return {
    seq,
    startsAt,
    endsAt: new Date(startsAt.getTime() + SEASON_WEEKS * WEEK_MS),
  };
}

/** 1-based week number inside the season (1..7); null outside the window. */
export function seasonWeekIndex(season: SeasonWindow, at: Date): number | null {
  if (at.getTime() < season.startsAt.getTime()) return null;
  if (at.getTime() >= season.endsAt.getTime()) return null;
  return 1 + Math.floor((at.getTime() - season.startsAt.getTime()) / WEEK_MS);
}

/** Monday 00:00 UTC of the quarterfinal week (season week 6). */
export function quarterfinalWeekStart(season: SeasonWindow): Date {
  return new Date(season.endsAt.getTime() - PLAYOFF_WEEKS * WEEK_MS);
}

/** Monday 00:00 UTC of the championship week (season week 7: SF + final). */
export function championshipWeekStart(season: SeasonWindow): Date {
  return new Date(season.endsAt.getTime() - WEEK_MS);
}

/** True while `at` is inside the season's final-2-weeks playoff window. */
export function inPlayoffWindow(season: SeasonWindow, at: Date): boolean {
  const week = seasonWeekIndex(season, at);
  return week !== null && week > SEASON_WEEKS - PLAYOFF_WEEKS;
}

// ---------------------------------------------------------------------------
// Bracket math (section 8.4) - mirrors maintain_season_playoffs (021)
// ---------------------------------------------------------------------------

export type PlayoffRound = 'quarterfinal' | 'semifinal';

export interface PlayoffPairing {
  /** 1-based match slot within the round. */
  slot: number;
  /** Seed numbers (1 = highest rating). seedB null = bye (A advances). */
  seedA: number;
  seedB: number | null;
}

/**
 * Quarterfinal pairings for the top N seeds (N <= 8): classic bracket
 * 1v8, 2v7, 3v6, 4v5. With fewer than 8 qualified clans the TOP seeds
 * take the byes (their missing opponents simply do not exist).
 */
export function quarterfinalPairings(clanCount: number): PlayoffPairing[] {
  const n = Math.max(0, Math.min(PLAYOFF_CLANS, Math.floor(clanCount)));
  if (n < 2) return [];
  const pairings: PlayoffPairing[] = [];
  for (let slot = 1; slot <= PLAYOFF_CLANS / 2; slot++) {
    const seedA = slot;
    const seedB = PLAYOFF_CLANS + 1 - slot;
    if (seedA > n) break;
    pairings.push({ slot, seedA, seedB: seedB <= n ? seedB : null });
  }
  return pairings;
}

/**
 * Semifinal composition from quarterfinal winners, by QF slot:
 * SF1 = W(QF1: 1v8) vs W(QF4: 4v5), SF2 = W(QF2: 2v7) vs W(QF3: 3v6) -
 * the standard re-bracket that keeps seeds 1 and 2 apart until the end.
 */
export const SEMIFINAL_SOURCES: ReadonlyArray<{
  slot: number;
  fromQfSlots: [number, number];
}> = [
  { slot: 1, fromQfSlots: [1, 4] },
  { slot: 2, fromQfSlots: [2, 3] },
] as const;

/** A settled championship-week semifinal, as the champion decision sees it. */
export interface SemifinalResult {
  winnerClanId: string;
  /** The winner's counted score in its championship-week duel. */
  winnerScore: number;
  /** The winner's bracket seed (1 = highest) - the tiebreak. */
  winnerSeed: number;
}

/**
 * The champion (see PLAYOFF FORMAT RESOLUTION above): the semifinal winner
 * with the higher championship-week counted score; equal scores fall to
 * the better (lower) seed. Null until both semifinals have settled.
 */
export function championOf(
  semifinals: ReadonlyArray<SemifinalResult | null>
): SemifinalResult | null {
  if (semifinals.length < 2 || semifinals.some((sf) => sf === null)) {
    return null;
  }
  const [a, b] = semifinals as SemifinalResult[];
  if (a.winnerScore !== b.winnerScore) {
    return a.winnerScore > b.winnerScore ? a : b;
  }
  return a.winnerSeed <= b.winnerSeed ? a : b;
}

// ---------------------------------------------------------------------------
// Seasonal mutations (section 7.2: 2-3 per season, offer pool all season,
// then permanent). Definitions live in MUTATIONS (shared/game/mutations.ts);
// this catalog maps seasons to their mutation ids - mirrored by the
// season_mutations table (021).
// ---------------------------------------------------------------------------

export const SEASON_1_MUTATIONS = [
  'solstice_engine',
  'glacial_reserve',
  'midnight_oil',
] as const;

export type Season1MutationId = (typeof SEASON_1_MUTATIONS)[number];

/** Season metadata for launch. Season 2+ content ships with its own migration. */
export const SEASON_1 = {
  seq: 1,
  name: 'Season 1 — Solstice',
  theme: 'solstice',
  mutations: SEASON_1_MUTATIONS,
} as const;
