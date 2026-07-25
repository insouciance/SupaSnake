/**
 * Migration 045 shape tests — session lifecycle & cohorts (GT §9.6, §13;
 * Constitution Rules 2, 6 and 11).
 *
 * The central claim of this work package is a negative one: an expired run
 * settles to NOTHING. That is not enforced by a runtime check anywhere — it is
 * enforced by the sweep having no statement in it that could grant something.
 * A negative like that is only as durable as the thing that notices when it
 * stops being true, so these tests read the SQL and pin its shape:
 *
 *   - the sweep writes two columns, on one table, and names no other;
 *   - it cannot be executed by anyone but the service role;
 *   - the cohort column is additive and nothing is deleted or downgraded;
 *   - the migration aborts itself if any player-owned value moved down.
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATION = path.join(
  process.cwd(),
  'supabase/migrations/045_session_lifecycle_cohorts.sql'
);

const sql = fs.readFileSync(MIGRATION, 'utf8');

/**
 * The migration with every `--` comment stripped. Negative assertions run
 * against this: the header explains at length what the sweep must never do,
 * and naming a thing is not doing it.
 */
const code = sql.replace(/--[^\n]*/g, '');

/** The body of `expire_stale_game_sessions`, comments included. */
const sweepBody = (() => {
  const start = code.indexOf('CREATE OR REPLACE FUNCTION expire_stale_game_sessions');
  const end = code.indexOf("$$ LANGUAGE plpgsql VOLATILE;", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return code.slice(start, end);
})();

describe('the expiry sweep cannot award anything', () => {
  it('writes exactly `ended_at` and `end_reason`, and nothing else', () => {
    expect(sweepBody).toMatch(/SET ended_at\s*=\s*NOW\(\),\s*end_reason\s*=\s*'expired'/);

    // The columns a payout lives in are never assigned in the sweep.
    for (const column of [
      'dna_earned',
      'yield_dna',
      'validated',
      'score',
      'foods_collected',
      'extracted',
    ]) {
      expect(sweepBody).not.toMatch(new RegExp(`${column}\\s*=`, 'i'));
    }
  });

  it('names no table but game_sessions', () => {
    const tables = new Set(
      // `FOR UPDATE SKIP LOCKED` is a lock clause, not a table reference.
      [
        ...sweepBody.matchAll(
          /\b(?:FROM|(?<!FOR\s)UPDATE|JOIN|INTO)\s+([a-z_][a-z0-9_]*)/gi
        ),
      ].map(
        (match) => match[1].toLowerCase()
      )
    );
    tables.delete('stale'); // the CTE it reads from
    tables.delete('v_expired'); // GET DIAGNOSTICS ... INTO
    expect([...tables]).toEqual(['game_sessions']);
  });

  it('touches nothing a reward lives in', () => {
    for (const table of [
      'players',
      'economy_transactions',
      'player_records',
      'player_mastery',
      'collected_snakes',
      'player_streaks',
      'genome_codex',
    ]) {
      expect(sweepBody).not.toMatch(new RegExp(`\\b${table}\\b`, 'i'));
    }
  });

  it('only ever closes a session that is open — it cannot replace an ending', () => {
    expect(sweepBody).toMatch(/WHERE gs\.ended_at IS NULL/);
    expect(sweepBody).toMatch(/AND gs\.ended_at IS NULL/);
  });

  it('gives a settled-but-unpaid run the longer window (Rule 6)', () => {
    // A row with a reason but no ended_at settled and is waiting for an
    // outbox replay worth real DNA. It must not be closed on the short clock.
    expect(sweepBody).toMatch(
      /gs\.end_reason IS NULL[\s\S]*?p_open_max_minutes/
    );
    expect(sweepBody).toMatch(
      /gs\.end_reason IS NOT NULL[\s\S]*?p_pending_max_minutes/
    );
  });

  it('is bounded and concurrency-safe', () => {
    expect(sweepBody).toMatch(/LIMIT p_batch_limit/);
    expect(sweepBody).toMatch(/FOR UPDATE SKIP LOCKED/);
  });

  it('is reachable by the service role alone (Rule 11)', () => {
    expect(code).toMatch(
      /REVOKE ALL ON FUNCTION expire_stale_game_sessions\(INTEGER, INTEGER, INTEGER\) FROM PUBLIC;/
    );
    expect(code).toMatch(
      /REVOKE ALL ON FUNCTION expire_stale_game_sessions\(INTEGER, INTEGER, INTEGER\) FROM authenticated;/
    );
    expect(code).toMatch(
      /GRANT EXECUTE ON FUNCTION expire_stale_game_sessions\(INTEGER, INTEGER, INTEGER\) TO service_role;/
    );
    expect(code).not.toMatch(
      /GRANT EXECUTE ON FUNCTION expire_stale_game_sessions[^;]*TO (?:anon|authenticated)/
    );
  });

  it('needs no definer rights, so there is no privilege escalation to audit', () => {
    expect(sweepBody).not.toMatch(/SECURITY DEFINER/i);
  });
});

describe('end_reason', () => {
  it('permits exactly the four reasons', () => {
    expect(code).toMatch(
      /CHECK \(\s*end_reason IS NULL\s*OR end_reason IN \('completed', 'abandoned', 'disconnected', 'expired'\)\s*\)/
    );
  });

  it('backfills legacy ended rows as completed, and touches nothing else', () => {
    expect(code).toMatch(
      /UPDATE game_sessions\s*SET end_reason = 'completed'\s*WHERE ended_at IS NOT NULL\s*AND end_reason IS NULL;/
    );
  });
});

describe('the cohort label is read-side only (Rule 6)', () => {
  it('adds the column with a public default so no account changes visibility', () => {
    expect(code).toMatch(
      /ALTER TABLE players\s*ADD COLUMN IF NOT EXISTS cohort TEXT NOT NULL DEFAULT 'player';/
    );
  });

  it('permits exactly the four cohorts', () => {
    expect(code).toMatch(
      /CHECK \(cohort IN \('player', 'dev', 'qa', 'fixture'\)\)/
    );
  });

  it('flags nobody automatically — a wrong guess would hide a real player', () => {
    expect(code).not.toMatch(/UPDATE players\s*SET cohort/i);
  });

  it('deletes nothing, anywhere in the migration', () => {
    expect(code).not.toMatch(/\bDELETE FROM\b/i);
    expect(code).not.toMatch(/\bDROP TABLE\b/i);
    expect(code).not.toMatch(/DROP COLUMN/i);
    expect(code).not.toMatch(/TRUNCATE/i);
  });
});

describe('the Anomaly board obeys the same two exclusions', () => {
  const board = (() => {
    const start = code.indexOf('CREATE OR REPLACE FUNCTION get_anomaly_board');
    const end = code.indexOf('$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;', start);
    return code.slice(start, end);
  })();

  it('refuses a run that did not settle', () => {
    expect(board).toMatch(
      /AND \(gs\.end_reason IS NULL OR gs\.end_reason = 'completed'\)/
    );
  });

  it('refuses a flagged cohort', () => {
    expect(board).toMatch(/JOIN players bp ON bp\.id = gs\.player_id/);
    expect(board).toMatch(/AND bp\.cohort = 'player'/);
  });

  it('keeps WP-0.05’s conditions rather than replacing them', () => {
    expect(board).toMatch(/gs\.ended_at IS NOT NULL/);
    expect(board).toMatch(/gs\.validated IS TRUE/);
    expect(board).toMatch(/gs\.is_free_play IS NOT TRUE/);
  });

  it('re-states its grants, so re-creating it cannot silently widen access', () => {
    expect(code).toMatch(/REVOKE ALL ON FUNCTION get_anomaly_board\(UUID\) FROM PUBLIC;/);
    expect(code).toMatch(
      /GRANT EXECUTE ON FUNCTION get_anomaly_board\(UUID\) TO authenticated;/
    );
  });

  it('reads no build or account state into the ranked value (Rule 2)', () => {
    // The board ranks `gs.score` and nothing else. Cohort decides whether an
    // account is shown; it must never reach the number being ranked.
    expect(board).toMatch(/MAX\(gs\.score\) AS best_score/);
    for (const forbidden of ['genome', 'gene', 'strain', 'generation', 'dna', 'premium']) {
      expect(board.toLowerCase()).not.toContain(`${forbidden}_`);
    }
  });
});

describe('preservation assertions abort the transaction', () => {
  it('snapshots player-owned scalars before writing anything', () => {
    expect(code).toMatch(/CREATE TEMP TABLE wp_0_06_player_pre/);
    expect(code).toMatch(/CREATE TEMP TABLE wp_0_06_session_pre/);
    const snapshot = code.indexOf('wp_0_06_player_pre');
    const firstAlter = code.indexOf('ALTER TABLE game_sessions');
    expect(snapshot).toBeLessThan(firstAlter);
  });

  it('raises if any player row moved downward (Rule 6)', () => {
    expect(code).toMatch(/p\.dna\s*<\s*pre\.dna_before/);
    expect(code).toMatch(/p\.high_score\s*<\s*pre\.high_score_before/);
    expect(code).toMatch(/would be written downward \(Rule 6\)/);
  });

  it('raises if any settled run lost a value', () => {
    expect(code).toMatch(/gs\.score\s*<\s*pre\.score_before/);
    expect(code).toMatch(/gs\.dna_earned\s*<\s*pre\.dna_earned_before/);
    expect(code).toMatch(/gs\.validated\s*IS DISTINCT FROM pre\.validated_before/);
    expect(code).toMatch(/had a settled value rewritten/);
  });

  it('raises if any row disappeared', () => {
    expect(code).toMatch(/disappeared \(Rule 6\)/);
  });

  it('raises if ended_at and end_reason are out of step', () => {
    expect(code).toMatch(/out of step/);
  });
});

describe('the migration is not applied by this work package', () => {
  it('says so in its header, with the down-note', () => {
    expect(sql).toMatch(/NOT APPLIED TO ANY DATABASE BY THIS WORK PACKAGE/);
    expect(sql).toMatch(/DOWN-NOTE \(forward-only/);
  });
});
