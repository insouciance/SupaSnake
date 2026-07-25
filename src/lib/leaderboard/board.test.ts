/**
 * Board fold: one best run per player, ranks, and the you-centered slice
 * (Constitution §6.1, GT §9.3).
 */

import { describe, it, expect } from '@jest/globals';
import {
  BOARD_TOP_COUNT,
  BOARD_WINDOW_RADIUS,
  bestRunPerPlayer,
  buildBoard,
  eligibleRuns,
  rankRuns,
  viewerPosition,
  youCenteredSlice,
  type RankableRun,
} from './board';
import type { RankableSessionRow } from './eligibility';

const WINDOW = { windowStart: '2026-07-20T00:00:00.000Z' };

function row(overrides: Partial<RankableSessionRow>): RankableSessionRow {
  return {
    id: 'run',
    player_id: 'player',
    score: 100,
    dynasty: 'CYBER',
    started_at: '2026-07-24T10:00:00.000Z',
    ended_at: '2026-07-24T10:05:00.000Z',
    validated: true,
    is_free_play: false,
    anomaly_id: null,
    ...overrides,
  };
}

function run(
  playerId: string,
  score: number,
  achievedAt = '2026-07-24T10:00:00.000Z',
  runId = `${playerId}-${score}`
): RankableRun {
  return { runId, playerId, score, dynasty: 'CYBER', achievedAt };
}

describe('eligibleRuns', () => {
  it('drops flagged and in-progress rows before anything is ranked', () => {
    const rows = [
      row({ id: 'ok', player_id: 'a', score: 400 }),
      row({ id: 'flagged', player_id: 'b', score: 9999, validated: false }),
      row({ id: 'open', player_id: 'c', score: 9999, ended_at: null }),
      row({ id: 'practice', player_id: 'd', score: 9999, is_free_play: true }),
      row({ id: 'anomaly', player_id: 'e', score: 9999, anomaly_id: 'blackout' }),
      row({ id: 'stale', player_id: 'f', score: 9999, started_at: '2026-07-01T00:00:00.000Z' }),
    ];

    const kept = eligibleRuns(rows, WINDOW);
    expect(kept.map((r) => r.runId)).toEqual(['ok']);
  });
});

describe('bestRunPerPlayer', () => {
  it('gives every player exactly one row - their best', () => {
    // The old board let one player hold the entire top ten (GT §9.3).
    const runs = [
      run('hoarder', 900, '2026-07-24T10:00:00.000Z', 'h1'),
      run('hoarder', 850, '2026-07-24T11:00:00.000Z', 'h2'),
      run('hoarder', 800, '2026-07-24T12:00:00.000Z', 'h3'),
      run('rival', 500, '2026-07-24T09:00:00.000Z', 'r1'),
    ];

    const best = bestRunPerPlayer(runs);
    expect(best).toHaveLength(2);
    expect(best.map((r) => r.playerId)).toEqual(['hoarder', 'rival']);
    expect(best[0].score).toBe(900);
    expect(best[0].runId).toBe('h1');
  });

  it('keeps the earlier run when a player ties their own best', () => {
    const best = bestRunPerPlayer([
      run('p', 300, '2026-07-24T12:00:00.000Z', 'later'),
      run('p', 300, '2026-07-24T08:00:00.000Z', 'earlier'),
    ]);
    expect(best).toHaveLength(1);
    expect(best[0].runId).toBe('earlier');
  });

  it('is empty for an empty board', () => {
    expect(bestRunPerPlayer([])).toEqual([]);
  });
});

describe('rankRuns', () => {
  it('orders by score descending', () => {
    const ranked = rankRuns([run('c', 100), run('a', 900), run('b', 400)]);
    expect(ranked.map((r) => r.playerId)).toEqual(['a', 'b', 'c']);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('uses competition ranking: ties share a rank and the next rank skips', () => {
    const ranked = rankRuns([
      run('a', 900, '2026-07-24T01:00:00.000Z', 'a1'),
      run('b', 500, '2026-07-24T02:00:00.000Z', 'b1'),
      run('c', 500, '2026-07-24T03:00:00.000Z', 'c1'),
      run('d', 100, '2026-07-24T04:00:00.000Z', 'd1'),
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });

  it('breaks score ties by who got there first, then deterministically by run id', () => {
    const ranked = rankRuns([
      run('late', 500, '2026-07-24T12:00:00.000Z', 'z'),
      run('early', 500, '2026-07-24T06:00:00.000Z', 'a'),
    ]);
    expect(ranked.map((r) => r.playerId)).toEqual(['early', 'late']);
  });
});

describe('buildBoard', () => {
  it('folds raw rows into an eligible, deduplicated, ranked board', () => {
    const rows = [
      row({ id: 'a1', player_id: 'a', score: 700 }),
      row({ id: 'a2', player_id: 'a', score: 400 }),
      row({ id: 'b1', player_id: 'b', score: 600 }),
      row({ id: 'cheat', player_id: 'c', score: 100000, validated: false }),
      row({ id: 'open', player_id: 'd', score: 100000, ended_at: null }),
    ];

    const board = buildBoard(rows, WINDOW);
    expect(board.map((r) => [r.playerId, r.rank, r.score])).toEqual([
      ['a', 1, 700],
      ['b', 2, 600],
    ]);
  });

  it('carries no build, account or purchase state onto an entry (Rule 2)', () => {
    const board = buildBoard([row({ id: 'a1', player_id: 'a', score: 700 })], WINDOW);
    expect(Object.keys(board[0]).sort()).toEqual(
      ['achievedAt', 'dynasty', 'playerId', 'rank', 'runId', 'score'].sort()
    );
  });
});

describe('viewerPosition', () => {
  const board = rankRuns([run('a', 900), run('me', 500), run('c', 100)]);

  it('resolves the requesting player rank by players.id', () => {
    expect(viewerPosition(board, 'me')).toEqual({
      playerId: 'me',
      ranked: true,
      rank: 2,
      score: 500,
    });
  });

  it('reports an unranked player rather than pretending they are absent', () => {
    expect(viewerPosition(board, 'stranger')).toEqual({
      playerId: 'stranger',
      ranked: false,
      rank: null,
      score: null,
    });
  });

  it('is null without credentials', () => {
    expect(viewerPosition(board, null)).toBeNull();
  });

  it('never resolves an auth user id against a players.id (the GT §9.3 bug)', () => {
    // players.id and auth.users.id are different UUIDs. Passing the wrong
    // one must read as "unranked", never as a coincidental match.
    const authUserId = '00000000-0000-4000-8000-000000000001';
    expect(viewerPosition(board, authUserId)?.ranked).toBe(false);
  });
});

describe('youCenteredSlice', () => {
  // 30 players, scores 3000, 2900, ... - "me" sits at rank 15
  const board = rankRuns(
    Array.from({ length: 30 }, (_, i) =>
      run(i === 14 ? 'me' : `p${i}`, 3000 - i * 100, `2026-07-24T10:${String(i).padStart(2, '0')}:00.000Z`, `r${i}`)
    )
  );

  it('returns the top three', () => {
    const slice = youCenteredSlice(board, 'me');
    expect(slice.top).toHaveLength(BOARD_TOP_COUNT);
    expect(slice.top.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('returns the viewer +/-5 (11 rows centered on them)', () => {
    const slice = youCenteredSlice(board, 'me');
    expect(slice.window).toHaveLength(BOARD_WINDOW_RADIUS * 2 + 1);
    expect(slice.window.map((r) => r.rank)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(slice.window[BOARD_WINDOW_RADIUS].playerId).toBe('me');
  });

  it('renders top 3 then the window, de-duplicated and in rank order', () => {
    const slice = youCenteredSlice(board, 'me');
    expect(slice.entries.map((r) => r.rank)).toEqual([
      1, 2, 3, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ]);
    expect(new Set(slice.entries.map((r) => r.runId)).size).toBe(slice.entries.length);
  });

  it('does not duplicate rows when the viewer is near the top', () => {
    const leader = board[1].playerId; // rank 2
    const slice = youCenteredSlice(board, leader);
    expect(slice.window.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(slice.entries.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('clamps at the bottom of the board', () => {
    const last = board[board.length - 1].playerId; // rank 30
    const slice = youCenteredSlice(board, last);
    expect(slice.window.map((r) => r.rank)).toEqual([25, 26, 27, 28, 29, 30]);
  });

  it('degrades to the top slice for an anonymous visitor', () => {
    const slice = youCenteredSlice(board, null);
    expect(slice.window).toEqual([]);
    expect(slice.entries.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('degrades to the top slice for a signed-in player with no eligible run', () => {
    const slice = youCenteredSlice(board, 'never-played');
    expect(slice.window).toEqual([]);
    expect(slice.entries).toHaveLength(BOARD_TOP_COUNT);
  });

  it('handles a board smaller than the top slice', () => {
    const tiny = rankRuns([run('solo', 42)]);
    const slice = youCenteredSlice(tiny, 'solo');
    expect(slice.top).toHaveLength(1);
    expect(slice.entries.map((r) => r.playerId)).toEqual(['solo']);
  });
});
