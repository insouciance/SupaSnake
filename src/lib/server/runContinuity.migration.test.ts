import fs from 'fs';
import path from 'path';

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/063_run_continuity.sql'),
  'utf8'
);
const code = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

describe('migration 063 — server-owned run continuity', () => {
  it('binds one immutable request id and manifest to a player session', () => {
    expect(code).toMatch(/ADD COLUMN start_request_id UUID/);
    expect(code).toMatch(/ADD COLUMN start_request_fingerprint TEXT/);
    expect(code).toMatch(/ADD COLUMN continuity_start_intent JSONB/);
    expect(code).toMatch(/ADD COLUMN start_manifest JSONB/);
    expect(code).toMatch(/ADD COLUMN simulation_seed UUID/);
    expect(code).toMatch(/ADD COLUMN simulation_version SMALLINT/);
    expect(code).toMatch(/ADD COLUMN simulation_rules_version TEXT/);
    expect(code).toMatch(/ADD COLUMN continuity_checkpoint JSONB/);
    expect(code).toMatch(/ADD COLUMN continuity_checkpoint_revision INTEGER NOT NULL DEFAULT 0/);
    expect(code).toMatch(/ADD COLUMN continuity_lease_hash TEXT/);
    expect(code).toMatch(/ADD COLUMN continuity_lease_epoch INTEGER NOT NULL DEFAULT 0/);
    expect(code).toMatch(/game_sessions_player_start_request_unique/);
    expect(code).toMatch(/NEW\.start_request_id IS DISTINCT FROM OLD\.start_request_id/);
    expect(code).toMatch(/NEW\.continuity_start_intent IS DISTINCT FROM OLD\.continuity_start_intent/);
    expect(code).toMatch(/NEW\.start_manifest IS DISTINCT FROM OLD\.start_manifest/);
    expect(code).toMatch(/NEW\.simulation_seed IS DISTINCT FROM OLD\.simulation_seed/);
    expect(code).toMatch(
      /NEW\.simulation_rules_version IS DISTINCT FROM OLD\.simulation_rules_version/
    );
    expect(code).toMatch(
      /OLD\.continuity_phase = 'prepared'[\s\S]*NEW\.continuity_phase IS DISTINCT FROM 'prepared'[\s\S]*NEW\.continuity_phase IS DISTINCT FROM 'active'/
    );
  });

  it('serializes new starts without silently terminalizing historical open runs', () => {
    const guard = code.match(
      /CREATE OR REPLACE FUNCTION guard_one_open_game_session[\s\S]+?CREATE TRIGGER game_sessions_one_open_insert/
    )?.[0] ?? '';
    expect(code).toMatch(
      /CREATE UNIQUE INDEX game_sessions_one_open_nonsettling_per_player[\s\S]*WHERE ended_at IS NULL[\s\S]*AND end_reason IS NULL[\s\S]*AND start_request_id IS NOT NULL/
    );
    expect(guard).toMatch(/pg_advisory_xact_lock/);
    expect(guard).toMatch(/MESSAGE = 'active_run_exists'/);
    expect(guard).toMatch(/ERRCODE = '23505'/);
    expect(guard).not.toMatch(/UPDATE game_sessions|end_reason = 'expired'/);
    expect(code).not.toMatch(/WITH duplicate_open AS/);
  });

  it('commits Energy and the exact manifest in one transaction', () => {
    const finalize = code.match(
      /CREATE OR REPLACE FUNCTION finalize_run_continuity_start[\s\S]+?REVOKE ALL ON FUNCTION finalize_run_continuity_start/
    )?.[0] ?? '';
    const commit = finalize.indexOf('FROM commit_run_energy(');
    const manifestWrite = finalize.indexOf('SET start_manifest = v_manifest');
    expect(commit).toBeGreaterThan(-1);
    expect(manifestWrite).toBeGreaterThan(commit);
    expect(finalize).toMatch(/IF v_session\.start_manifest IS NOT NULL THEN\s*RETURN v_session\.start_manifest/);
    expect(finalize).toMatch(/start_request_conflict/);
    expect(finalize).toMatch(/continuity_phase = 'prepared'/);
    expect(finalize).toMatch(/start_manifest_draft IS DISTINCT FROM p_manifest_base/);
  });

  it('keeps continuity RPCs service-role only', () => {
    for (const fn of [
      'finalize_run_continuity_start',
      'activate_run_continuity',
      'resume_run_continuity',
      'save_run_continuity_checkpoint',
      'stage_run_continuity_terminal',
      'stage_continuity_game_session_end',
      'complete_free_run_continuity',
      'abandon_run_continuity',
    ]) {
      expect(code).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION ${fn}\\([\\s\\S]+?(?:FROM authenticated|FROM PUBLIC, anon, authenticated)`
      ));
      expect(code).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${fn}\\([\\s\\S]+?TO service_role`));
      expect(code).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${fn}\\([\\s\\S]+?TO (?:anon|authenticated)`));
    }
  });

  it('atomically activates with the first valid checkpoint and lease', () => {
    const activation = code.match(
      /CREATE OR REPLACE FUNCTION activate_run_continuity[\s\S]+?REVOKE ALL ON FUNCTION activate_run_continuity/
    )?.[0] ?? '';
    expect(activation).toMatch(/FOR UPDATE/);
    expect(activation).toMatch(/continuity_phase IS DISTINCT FROM 'prepared'/);
    expect(activation).toMatch(/simulation_rules_version IS DISTINCT FROM p_rules_version/);
    expect(activation).toMatch(/continuity_phase = 'active'/);
    expect(activation).toMatch(/continuity_checkpoint = p_checkpoint/);
    expect(activation).toMatch(/continuity_checkpoint_revision = 1/);
    expect(activation).toMatch(/continuity_lease_hash = p_lease_hash/);
  });

  it('stores only monotonic, idempotent active-run checkpoints', () => {
    const checkpoint = code.match(
      /CREATE OR REPLACE FUNCTION save_run_continuity_checkpoint[\s\S]+?REVOKE ALL ON FUNCTION save_run_continuity_checkpoint/
    )?.[0] ?? '';
    expect(checkpoint).toMatch(/FOR UPDATE/);
    expect(checkpoint).toMatch(/continuity_phase IS DISTINCT FROM 'active'/);
    expect(checkpoint).toMatch(/continuity_checkpoint_revision = p_expected_revision \+ 1/);
    expect(checkpoint).toMatch(/continuity_checkpoint_digest = p_checkpoint_digest/);
    expect(checkpoint).toMatch(/checkpoint_revision_conflict/);
    expect(checkpoint).toMatch(/continuity_lease_hash IS DISTINCT FROM p_lease_hash/);
    expect(checkpoint).toMatch(/continuity_checkpoint_revision = continuity_checkpoint_revision \+ 1/);
  });

  it('locks terminal continuity transitions to the current checkpoint and lease', () => {
    const terminalIntent = code.match(
      /CREATE OR REPLACE FUNCTION stage_run_continuity_terminal[\s\S]+?REVOKE ALL ON FUNCTION stage_run_continuity_terminal/
    )?.[0] ?? '';
    const stagedEnd = code.match(
      /CREATE OR REPLACE FUNCTION stage_continuity_game_session_end[\s\S]+?REVOKE ALL ON FUNCTION stage_continuity_game_session_end/
    )?.[0] ?? '';
    const freeEnd = code.match(
      /CREATE OR REPLACE FUNCTION complete_free_run_continuity[\s\S]+?REVOKE ALL ON FUNCTION complete_free_run_continuity/
    )?.[0] ?? '';
    expect(terminalIntent).toMatch(/FOR UPDATE/);
    expect(terminalIntent).toMatch(/continuity_checkpoint_revision IS DISTINCT FROM p_expected_revision/);
    expect(terminalIntent).toMatch(/continuity_lease_hash IS DISTINCT FROM p_lease_hash/);
    expect(terminalIntent).toMatch(/continuity_phase = 'terminal'/);
    for (const terminal of [stagedEnd, freeEnd]) {
      expect(terminal).toMatch(/FOR UPDATE/);
      expect(terminal).toMatch(/continuity_phase NOT IN \('active', 'terminal'\)/);
      expect(terminal).toMatch(/continuity_checkpoint IS NULL/);
      expect(terminal).toMatch(/continuity_lease_hash IS DISTINCT FROM p_lease_hash/);
      expect(terminal).toMatch(/v_session\.continuity_phase = 'active'/);
    }
  });

  it('allows explicit preparing, prepared and incompatible-version abandonment without fabricating activation', () => {
    const abandon = code.match(
      /CREATE OR REPLACE FUNCTION abandon_run_continuity[\s\S]+?REVOKE ALL ON FUNCTION abandon_run_continuity/
    )?.[0] ?? '';
    expect(abandon).toMatch(/FOR UPDATE/);
    expect(abandon).toMatch(/continuity_phase = 'preparing'/);
    expect(abandon).toMatch(/COALESCE\(v_session\.energy_committed, 0\) <> 0/);
    expect(abandon).toMatch(/continuity_phase = 'prepared'/);
    expect(abandon).toMatch(/continuity_checkpoint_revision <> 0/);
    expect(abandon).toMatch(/simulation_rules_version IS DISTINCT FROM p_rules_version/);
    expect(abandon).toMatch(/SET ended_at = clock_timestamp\(\),\s*end_reason = 'abandoned'/);
  });

  it('makes an identical terminal retry return the one durable pending envelope', () => {
    const stagedEnd = code.match(
      /CREATE OR REPLACE FUNCTION stage_continuity_game_session_end[\s\S]+?REVOKE ALL ON FUNCTION stage_continuity_game_session_end/
    )?.[0] ?? '';
    expect(stagedEnd).toMatch(/v_session\.end_reason = 'completed'/);
    expect(stagedEnd).toMatch(/FROM pending_game_session_ends pending[\s\S]*FOR UPDATE/);
    expect(stagedEnd).toMatch(/v_pending\.envelope IS DISTINCT FROM p_envelope/);
    expect(stagedEnd).toMatch(/'inserted', FALSE/);
  });

  it('age-expires only legacy sessions, never an open continuity run', () => {
    const expiry = code.match(
      /CREATE OR REPLACE FUNCTION expire_stale_game_sessions[\s\S]+?COMMENT ON FUNCTION expire_stale_game_sessions/
    )?.[0] ?? '';
    expect(expiry).toMatch(/gs\.start_request_id IS NULL/);
    expect(expiry).toMatch(/end_reason = 'expired'/);
  });

  it('contains no browser-side progress mechanism', () => {
    expect(code).not.toMatch(/localStorage|sessionStorage|indexedDB|CacheStorage/i);
  });
});
