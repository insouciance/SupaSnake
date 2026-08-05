/**
 * CE-2 — the settlement sweep becomes the primary settler.
 *
 * The route tests run an executable model of migration 068's scans (backoff
 * windows, attempt-aware selection, chronological execution). A model can
 * drift from its subject, so this file pins the other half: structural
 * assertions on the LIVE SQL definitions, resolved exactly as Postgres
 * resolves them — the last `CREATE [OR REPLACE] FUNCTION` across the
 * migrations in numeric order.
 *
 * Together they close the loop. The model proves the semantics; this proves
 * the semantics are the ones the database will actually run, and fails the
 * build if a later migration quietly reinstates `DISTINCT ON (player_id)`,
 * drops the backoff window, or turns backoff into a give-up.
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, 'supabase/migrations');
const MIGRATION_068 = path.join(
  MIGRATIONS_DIR,
  '068_settlement_sweep_primary.sql'
);

const sql = fs.readFileSync(MIGRATION_068, 'utf8');

function liveFunctionBody(name: string): { body: string; migration: string } {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  let found: { body: string; migration: string } | null = null;

  for (const file of files) {
    const source = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const opener = new RegExp(
      `create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${name}\\s*\\(`,
      'gi'
    );
    let match: RegExpExecArray | null;
    while ((match = opener.exec(source)) !== null) {
      const rest = source.slice(match.index);
      const end = rest.search(/\$\$\s*LANGUAGE/i);
      found = {
        body: end === -1 ? rest : rest.slice(0, end),
        migration: file,
      };
    }
  }

  if (!found) throw new Error(`no definition found for ${name}()`);
  return found;
}

describe('Migration 068: one atomic migration', () => {
  it('wraps everything in a single transaction', () => {
    expect(sql).toMatch(/^\s*BEGIN;/m);
    expect(sql.trimEnd()).toMatch(/COMMIT;$/);
    expect(sql.match(/^\s*BEGIN;/gm)).toHaveLength(1);
    expect(sql.match(/^COMMIT;/gm)).toHaveLength(1);
  });

  it('touches no player balance, and destroys nothing', () => {
    // The sweep's scans claim work. They may never move value: that is the
    // settlement RPCs' job, and they are not redeclared here.
    expect(sql).not.toMatch(/\bdna\b\s*=/i);
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    // The one dropped object is the scan whose RETURN TYPE changes, which
    // Postgres cannot do through CREATE OR REPLACE.
    expect(sql.match(/^DROP FUNCTION/gm)).toHaveLength(1);
    expect(sql).toMatch(
      /DROP FUNCTION IF EXISTS list_pending_game_progression_sessions\(INTEGER\)/
    );
  });
});

describe('the retry spacing never becomes a give-up', () => {
  const { body, migration } = liveFunctionBody('settlement_recovery_backoff');

  it('is defined by 068 and is immutable', () => {
    expect(migration).toBe('068_settlement_sweep_primary.sql');
    expect(sql).toMatch(/\$\$ LANGUAGE sql IMMUTABLE SET search_path = public;/);
    expect(body).toMatch(/RETURNS\s+INTERVAL/i);
  });

  it('retries the first failure immediately and caps the spacing at 24 hours', () => {
    // <= 1 attempt: no wait at all. This is what lets a run absorbed by the
    // stranded stage be settled by the progression stage in the same pass.
    expect(body).toMatch(/COALESCE\(p_attempts, 0\)\s*<=\s*1\s*THEN\s*INTERVAL\s*'0 minutes'/i);
    // Exponential, then a hard cap. 1440 minutes = 24 hours = the slowest a
    // row is ever retried. There is no branch that returns NULL, no branch
    // that returns infinity, and no attempt count at which retries stop.
    expect(body).toMatch(/POWER\(2,/i);
    expect(body).toMatch(/1440/);
    // No branch returns NULL and none returns "never": there is no attempt
    // count at which a row stops being retried.
    expect(body).not.toMatch(/RETURN\s+NULL/i);
    expect(body).not.toMatch(/infinity/i);
  });

  it('is reachable only by the service role', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION settlement_recovery_backoff\(INTEGER\)\s*\n\s*FROM PUBLIC, anon, authenticated;/
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION settlement_recovery_backoff\(INTEGER\)\s*\n\s*TO service_role;/
    );
  });
});

describe('the progression scan has no per-player head-of-line blocking', () => {
  const { body, migration } = liveFunctionBody(
    'list_pending_game_progression_sessions'
  );

  it('is defined by 068', () => {
    expect(migration).toBe('068_settlement_sweep_primary.sql');
  });

  it('no longer collapses a player to a single session per pass', () => {
    // The defect, by name. `DISTINCT ON (gs.player_id)` drained a backlog at
    // one run per cron pass and let one unsettleable run starve every later
    // run on the account forever.
    expect(body).not.toMatch(/DISTINCT\s+ON/i);
    expect(body).not.toMatch(/earliest_per_player/i);
  });

  it('reports the attempt count so a long-failing row can be surfaced', () => {
    expect(body).toMatch(/recovery_attempts\s+INTEGER/i);
    expect(body).toMatch(/claimed\.progression_recovery_attempts/);
  });

  it('skips a row whose backoff window has not expired', () => {
    expect(body).toMatch(
      /progression_recovery_attempted_at IS NULL[\s\S]{0,200}settlement_recovery_backoff\(gs\.progression_recovery_attempts\)/
    );
  });

  it('selects attempt-first and executes chronologically', () => {
    const selection = body.indexOf('ORDER BY gs.progression_recovery_attempts');
    const execution = body.lastIndexOf(
      'ORDER BY claimed.atomic_reward_observed_at'
    );
    expect(selection).toBeGreaterThan(-1);
    expect(execution).toBeGreaterThan(selection);
  });

  it('claims each row exactly once, by counting up and never down', () => {
    expect(body).toMatch(
      /SET progression_recovery_attempted_at = clock_timestamp\(\),\s*\n\s*progression_recovery_attempts = gs\.progression_recovery_attempts \+ 1/
    );
    expect(body).toMatch(/FOR UPDATE OF gs SKIP LOCKED/);
    expect(body).not.toMatch(/progression_recovery_attempts\s*=\s*0/);
  });

  it('still refuses free play, unstamped rows, and already-receipted runs', () => {
    expect(body).toMatch(/NOT COALESCE\(gs\.is_free_play, FALSE\)/);
    expect(body).toMatch(/rir\.session_id IS NULL/);
    expect(body).toMatch(/gs\.reward_protocol = 'atomic_v1'/);
    expect(body).toMatch(/gs\.atomic_reward_observed_at IS NOT NULL/);
    expect(body).toMatch(/gs\.end_reason = 'completed'/);
  });

  it('is reachable only by the service role', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION list_pending_game_progression_sessions\(INTEGER\)\s*\n\s*FROM PUBLIC, anon, authenticated;/
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION list_pending_game_progression_sessions\(INTEGER\)\s*\n\s*TO service_role;/
    );
  });
});

describe('the stranded terminal scan covers the state nothing covered', () => {
  const { body, migration } = liveFunctionBody('list_stranded_terminal_runs');

  it('is defined by 068', () => {
    expect(migration).toBe('068_settlement_sweep_primary.sql');
  });

  it('matches exactly the state that had no server driver', () => {
    expect(body).toMatch(/gs\.ended_at IS NULL/);
    expect(body).toMatch(/gs\.end_reason IS NULL/);
    expect(body).toMatch(/gs\.continuity_phase = 'terminal'/);
    // Without the server-derived facts there is nothing to settle FROM, and
    // the fold would have to trust a client that is not here.
    expect(body).toMatch(/gs\.continuity_terminal_facts IS NOT NULL/);
  });

  it('returns the owner, so the sweep never has to guess an identity', () => {
    expect(body).toMatch(/user_id\s+UUID/i);
    expect(body).toMatch(/JOIN players p ON p\.id = claimed\.player_id/);
  });

  it('leaves a fresh terminal row to its own client first', () => {
    expect(body).toMatch(/p_min_age_seconds INTEGER DEFAULT 120/);
    expect(body).toMatch(/gs\.continuity_terminal_at\s*\n?\s*<=\s*clock_timestamp\(\)/);
  });

  it('shares one backoff and one attempt counter with the progression scan', () => {
    expect(body).toMatch(
      /settlement_recovery_backoff\(gs\.progression_recovery_attempts\)/
    );
    expect(body).toMatch(
      /progression_recovery_attempts = gs\.progression_recovery_attempts \+ 1/
    );
  });

  it('never writes the columns 063 declares immutable', () => {
    // `protect_run_continuity` refuses any change to the terminal facts, the
    // digest, the timestamp or the phase. The claim must not go near them.
    expect(body).not.toMatch(/SET[\s\S]{0,200}continuity_terminal_facts\s*=/);
    expect(body).not.toMatch(/SET[\s\S]{0,200}continuity_terminal_digest\s*=/);
    expect(body).not.toMatch(/SET[\s\S]{0,200}continuity_terminal_at\s*=/);
    expect(body).not.toMatch(/SET[\s\S]{0,200}continuity_phase\s*=/);
    expect(body).not.toMatch(/SET[\s\S]{0,200}ended_at\s*=/);
  });

  it('claims under a row lock so two crons cannot take the same run', () => {
    expect(body).toMatch(/FOR UPDATE OF gs SKIP LOCKED/);
  });

  it('is reachable only by the service role', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION list_stranded_terminal_runs\(INTEGER, INTEGER\)\s*\n\s*FROM PUBLIC, anon, authenticated;/
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION list_stranded_terminal_runs\(INTEGER, INTEGER\)\s*\n\s*TO service_role;/
    );
  });

  it('is indexed on exactly the shape it scans', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS game_sessions_stranded_terminal_idx[\s\S]*?WHERE ended_at IS NULL\s*\n\s*AND end_reason IS NULL\s*\n\s*AND continuity_phase = 'terminal'/
    );
  });
});
