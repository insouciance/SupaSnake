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
    expect(code).toMatch(/ADD COLUMN start_manifest JSONB/);
    expect(code).toMatch(/ADD COLUMN simulation_seed UUID/);
    expect(code).toMatch(/ADD COLUMN simulation_version SMALLINT/);
    expect(code).toMatch(/ADD COLUMN continuity_checkpoint JSONB/);
    expect(code).toMatch(/ADD COLUMN continuity_checkpoint_revision INTEGER NOT NULL DEFAULT 0/);
    expect(code).toMatch(/ADD COLUMN continuity_lease_hash TEXT/);
    expect(code).toMatch(/ADD COLUMN continuity_lease_epoch INTEGER NOT NULL DEFAULT 0/);
    expect(code).toMatch(/game_sessions_player_start_request_unique/);
    expect(code).toMatch(/NEW\.start_request_id IS DISTINCT FROM OLD\.start_request_id/);
    expect(code).toMatch(/NEW\.start_manifest IS DISTINCT FROM OLD\.start_manifest/);
    expect(code).toMatch(/NEW\.simulation_seed IS DISTINCT FROM OLD\.simulation_seed/);
    expect(code).toMatch(
      /OLD\.continuity_phase = 'prepared'[\s\S]*NEW\.continuity_phase IS DISTINCT FROM 'prepared'[\s\S]*NEW\.continuity_phase IS DISTINCT FROM 'active'/
    );
  });

  it('serializes new starts without silently terminalizing historical open runs', () => {
    expect(code).toMatch(
      /CREATE UNIQUE INDEX game_sessions_one_open_nonsettling_per_player[\s\S]*WHERE ended_at IS NULL[\s\S]*AND end_reason IS NULL[\s\S]*AND start_request_id IS NOT NULL/
    );
    expect(code).not.toMatch(/WITH duplicate_open AS/);
    expect(code).not.toMatch(/UPDATE game_sessions[\s\S]*end_reason = 'expired'/);
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
    ]) {
      expect(code).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${fn}\\([\\s\\S]+?FROM authenticated`));
      expect(code).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${fn}\\([\\s\\S]+?TO service_role`));
      expect(code).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${fn}\\([\\s\\S]+?TO (?:anon|authenticated)`));
    }
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

  it('contains no browser-side progress mechanism', () => {
    expect(code).not.toMatch(/localStorage|sessionStorage|indexedDB|CacheStorage/i);
  });
});
