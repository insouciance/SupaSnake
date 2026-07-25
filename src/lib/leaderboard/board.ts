/**
 * Board fold: eligible runs -> one best run per player -> ranks -> the
 * you-centered slice (Constitution §6.1).
 *
 * Everything here is pure and deterministic. The route owns the database
 * reads; this module owns the shape of a board, so the rules that matter
 * ("a flagged run cannot rank", "one entry per player", "your rank is
 * resolvable") are unit-testable without a database.
 *
 * Rule 2 note: nothing in this module reads genes, traits, anomalies,
 * generation, collection size, purchases or account state. A ranked run is
 * (player, score, when, dynasty) and nothing else.
 */

import {
  isEligibleRun,
  type EligibilityWindow,
  type RankableSessionRow,
} from './eligibility';

/** A run that survived eligibility, reduced to what a board needs. */
export interface RankableRun {
  runId: string;
  playerId: string;
  score: number;
  dynasty: string | null;
  /** ISO timestamp the run ended. */
  achievedAt: string;
}

export interface RankedRun extends RankableRun {
  /** Competition rank: equal scores share a rank, the next rank skips. */
  rank: number;
}

/** How many leading entries the you-centered view always carries. */
export const BOARD_TOP_COUNT = 3;

/** How many entries above and below the viewer the window carries. */
export const BOARD_WINDOW_RADIUS = 5;

/**
 * Keep only runs that may rank, projected onto `RankableRun`.
 */
export function eligibleRuns(
  rows: RankableSessionRow[],
  window: EligibilityWindow
): RankableRun[] {
  const runs: RankableRun[] = [];
  for (const row of rows) {
    if (!isEligibleRun(row, window)) continue;
    runs.push({
      runId: row.id,
      playerId: row.player_id as string,
      score: row.score ?? 0,
      dynasty: row.dynasty ?? null,
      achievedAt: row.ended_at as string,
    });
  }
  return runs;
}

/**
 * Total order over runs: higher score first; on a tie the run that got there
 * first wins; `runId` breaks the remaining ties so paging is stable.
 */
function compareRuns(a: RankableRun, b: RankableRun): number {
  if (b.score !== a.score) return b.score - a.score;
  const at = new Date(a.achievedAt).getTime();
  const bt = new Date(b.achievedAt).getTime();
  if (at !== bt) return at - bt;
  return a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0;
}

/**
 * One best eligible run per player. A player who set five records still
 * occupies exactly one row - the old boards let a single player hold the
 * entire top ten (GT §9.3).
 */
export function bestRunPerPlayer(runs: RankableRun[]): RankableRun[] {
  const best = new Map<string, RankableRun>();
  for (const run of runs) {
    const current = best.get(run.playerId);
    if (!current || compareRuns(run, current) < 0) {
      best.set(run.playerId, run);
    }
  }
  return Array.from(best.values()).sort(compareRuns);
}

/**
 * Competition ranking (1, 2, 2, 4) over an already-ordered list.
 */
export function rankRuns(runs: RankableRun[]): RankedRun[] {
  const ordered = [...runs].sort(compareRuns);
  const ranked: RankedRun[] = [];
  let lastScore: number | null = null;
  let lastRank = 0;
  ordered.forEach((run, index) => {
    const rank = lastScore !== null && run.score === lastScore ? lastRank : index + 1;
    lastScore = run.score;
    lastRank = rank;
    ranked.push({ ...run, rank });
  });
  return ranked;
}

/**
 * The whole fold: raw session rows -> the ranked board.
 */
export function buildBoard(
  rows: RankableSessionRow[],
  window: EligibilityWindow
): RankedRun[] {
  return rankRuns(bestRunPerPlayer(eligibleRuns(rows, window)));
}

export interface ViewerPosition {
  playerId: string;
  ranked: boolean;
  rank: number | null;
  score: number | null;
}

/**
 * Where the requesting player sits. `ranked: false` (rank/score null) means
 * the player has no eligible run in this board's window - not an error.
 */
export function viewerPosition(
  board: RankedRun[],
  playerId: string | null
): ViewerPosition | null {
  if (!playerId) return null;
  const entry = board.find((run) => run.playerId === playerId);
  if (!entry) return { playerId, ranked: false, rank: null, score: null };
  return { playerId, ranked: true, rank: entry.rank, score: entry.score };
}

export interface YouCenteredSlice {
  /** The leading `BOARD_TOP_COUNT` entries. */
  top: RankedRun[];
  /** The viewer ±`BOARD_WINDOW_RADIUS`. Empty when the viewer is unranked. */
  window: RankedRun[];
  /** `top` then `window`, de-duplicated, in rank order - the render list. */
  entries: RankedRun[];
}

/**
 * The default board view (§6.1): the top 3 plus your position ±5. A global
 * top-100 is an insult at small population and wallpaper at large.
 *
 * When the viewer is absent or unranked the window is empty and `entries`
 * degrades to the top slice, so an anonymous visitor still sees a board.
 */
export function youCenteredSlice(
  board: RankedRun[],
  playerId: string | null,
  options: { topCount?: number; radius?: number } = {}
): YouCenteredSlice {
  const topCount = options.topCount ?? BOARD_TOP_COUNT;
  const radius = options.radius ?? BOARD_WINDOW_RADIUS;

  const top = board.slice(0, topCount);

  const index = playerId ? board.findIndex((run) => run.playerId === playerId) : -1;
  const window =
    index === -1
      ? []
      : board.slice(Math.max(0, index - radius), index + radius + 1);

  const seen = new Set<string>();
  const entries: RankedRun[] = [];
  for (const run of [...top, ...window]) {
    if (seen.has(run.runId)) continue;
    seen.add(run.runId);
    entries.push(run);
  }
  entries.sort((a, b) => a.rank - b.rank || compareRuns(a, b));

  return { top, window, entries };
}
