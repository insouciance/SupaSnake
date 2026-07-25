/**
 * Leaderboard eligibility (Constitution §6.1, GT §9.3).
 *
 * These tests are the acceptance criteria of WP-0.05: a flagged run and an
 * in-progress run cannot rank, and only content-compatible runs inside the
 * board's window are considered.
 */

import { describe, it, expect } from '@jest/globals';
import {
  boardWindowStart,
  ineligibleReason,
  isEligibleRun,
  LEADERBOARD_CONTENT_EPOCH,
  LEADERBOARD_CONTENT_VERSION,
  utcDayStart,
  utcWeekStart,
  type RankableSessionRow,
} from './eligibility';

const WINDOW = { windowStart: '2026-07-20T00:00:00.000Z' };

function run(overrides: Partial<RankableSessionRow> = {}): RankableSessionRow {
  return {
    id: 'run-1',
    player_id: 'player-1',
    score: 500,
    dynasty: 'CYBER',
    started_at: '2026-07-24T10:00:00.000Z',
    ended_at: '2026-07-24T10:04:00.000Z',
    validated: true,
    is_free_play: false,
    anomaly_id: null,
    ...overrides,
  };
}

describe('leaderboard eligibility', () => {
  it('ranks a completed, validated, in-window run', () => {
    expect(ineligibleReason(run(), WINDOW)).toBeNull();
    expect(isEligibleRun(run(), WINDOW)).toBe(true);
  });

  describe('an in-progress run cannot rank', () => {
    it('rejects a session with no ended_at', () => {
      const inProgress = run({ ended_at: null, score: 99999 });
      expect(ineligibleReason(inProgress, WINDOW)).toBe('in_progress');
      expect(isEligibleRun(inProgress, WINDOW)).toBe(false);
    });

    it('rejects it however high the score claims to be', () => {
      // ~30% of production session rows were open at audit time (GT §9.6).
      const open = run({ id: 'open', ended_at: null, score: Number.MAX_SAFE_INTEGER });
      expect(isEligibleRun(open, WINDOW)).toBe(false);
    });
  });

  describe('a flagged run cannot rank', () => {
    it('rejects validated = false', () => {
      const flagged = run({ validated: false, score: 100000 });
      expect(ineligibleReason(flagged, WINDOW)).toBe('not_validated');
      expect(isEligibleRun(flagged, WINDOW)).toBe(false);
    });

    it('rejects validated = null (the column default is FALSE, and NULL is not TRUE)', () => {
      const unknown = run({ validated: null });
      expect(ineligibleReason(unknown, WINDOW)).toBe('not_validated');
    });
  });

  it('rejects Free Play practice runs (Design v2 §7.4)', () => {
    expect(ineligibleReason(run({ is_free_play: true }), WINDOW)).toBe('free_play');
  });

  it('rejects Anomaly runs - they score on their own weekly board (§7.2)', () => {
    expect(ineligibleReason(run({ anomaly_id: 'gold_rush' }), WINDOW)).toBe('anomaly_board');
  });

  it('rejects a run started before the window (content version / period)', () => {
    const old = run({ started_at: '2026-07-19T23:59:59.000Z' });
    expect(ineligibleReason(old, WINDOW)).toBe('before_window');
  });

  it('accepts a run started exactly at the window boundary', () => {
    expect(isEligibleRun(run({ started_at: WINDOW.windowStart }), WINDOW)).toBe(true);
  });

  it('rejects an orphan row with no player', () => {
    expect(ineligibleReason(run({ player_id: null }), WINDOW)).toBe('no_player');
  });

  it('reports the first failing condition when several apply', () => {
    const worst = run({ ended_at: null, validated: false, is_free_play: true });
    expect(ineligibleReason(worst, WINDOW)).toBe('in_progress');
  });
});

describe('content version', () => {
  it('names a version and the epoch its scores are comparable from', () => {
    expect(LEADERBOARD_CONTENT_VERSION).toMatch(/\S/);
    expect(Number.isNaN(new Date(LEADERBOARD_CONTENT_EPOCH).getTime())).toBe(false);
  });

  it('bounds the all-time board by the content epoch', () => {
    // Migration 013 (2026-07-18) introduced the current score fold; runs
    // before it were scored differently and are not comparable.
    expect(boardWindowStart('global', new Date('2026-07-24T12:00:00.000Z'))).toBe(
      LEADERBOARD_CONTENT_EPOCH
    );
  });

  it('excludes a pre-epoch run from the all-time board', () => {
    const preV2 = run({ started_at: '2026-07-10T12:00:00.000Z' });
    const allTime = { windowStart: boardWindowStart('global', new Date('2026-07-24T12:00:00.000Z')) };
    expect(ineligibleReason(preV2, allTime)).toBe('before_window');
  });
});

describe('board windows', () => {
  const now = new Date('2026-07-24T15:30:00.000Z'); // a Friday

  it('daily starts at UTC midnight', () => {
    expect(utcDayStart(now).toISOString()).toBe('2026-07-24T00:00:00.000Z');
    expect(boardWindowStart('daily', now)).toBe('2026-07-24T00:00:00.000Z');
  });

  it('weekly starts on Monday UTC', () => {
    const monday = utcWeekStart(now);
    expect(monday.getUTCDay()).toBe(1);
    expect(monday.toISOString()).toBe('2026-07-20T00:00:00.000Z');
    expect(boardWindowStart('weekly', now)).toBe('2026-07-20T00:00:00.000Z');
  });

  it('treats Sunday as the last day of the ISO week, not the first', () => {
    const sunday = new Date('2026-07-26T09:00:00.000Z');
    expect(sunday.getUTCDay()).toBe(0);
    expect(utcWeekStart(sunday).toISOString()).toBe('2026-07-20T00:00:00.000Z');
  });

  it('never reaches back past the content epoch', () => {
    // A week that straddles the epoch clamps forward to it.
    const justAfterEpoch = new Date('2026-07-19T12:00:00.000Z'); // Sunday of epoch week
    expect(boardWindowStart('weekly', justAfterEpoch)).toBe(LEADERBOARD_CONTENT_EPOCH);
  });
});
