import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GENOME_V2_GENES } from '@/shared/game/genes';
import { GENOME_V2_SPLICE_IDS, GENOME_V2_SPLICES } from '@/shared/game/genomeV2';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/065_genome_v2.sql'),
  'utf8'
);
const code = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

const V2_GENES = [
  'gold_trail',
  'compound_interest',
  'loan_shark',
  'live_wire',
  'circuit_run',
  'time_dilation',
  'overgrowth',
  'coilkeeper',
  'wall_rush',
  'phase_gate',
  'mirror_wager',
  'phoenix',
  'loom_anchor',
  'heartwood',
  'zenith_protocol',
  'constellation_crown',
] as const;

const V2_SPLICES = [
  'splice_dragon_hoard',
  'splice_gilded_fork',
  'splice_styx_contract',
  'splice_perfect_circuit',
  'splice_worldcoil',
  'splice_riftline',
  'splice_loom_bond',
  'splice_ashen_stake',
] as const;

describe('migration 065 — Genome v1/v2 compatibility bridge', () => {
  it('snapshots v1 before adding dark v2 parent rows', () => {
    const v1Snapshot = code.indexOf(
      'SELECT id, 1, name, kind, strains, effect, cost, economics, active'
    );
    const v2Parents = code.indexOf("('live_wire', 'Live Wire'");
    expect(v1Snapshot).toBeGreaterThan(-1);
    expect(v2Parents).toBeGreaterThan(v1Snapshot);
    expect(code).toMatch(/CREATE TABLE IF NOT EXISTS genome_gene_versions/);
    expect(code).toMatch(/PRIMARY KEY \(gene_id, rules_version\)/);
    expect(code).toMatch(/CREATE TABLE IF NOT EXISTS genome_splice_versions/);
    expect(code).toMatch(/PRIMARY KEY \(splice_id, rules_version\)/);
    expect(code).not.toMatch(/UPDATE gene_definitions[\s\S]*active\s*=\s*FALSE/i);
  });

  it('publishes the exact shared roster plus all three dynasty signatures for v2', () => {
    expect(Object.keys(GENOME_V2_GENES).sort()).toEqual([...V2_GENES].sort());
    for (const id of V2_GENES) {
      expect(code).toContain(`('${id}', 2,`);
      expect(code).toContain(`'${GENOME_V2_GENES[id].name}'`);
    }
    expect(code.match(/, 2, /g)?.length).toBeGreaterThanOrEqual(V2_GENES.length);
    expect(code).toContain("('time_dilation', 2, 'Time Dilation'");
    expect(code).toContain('unavailable in CYBER');
  });

  it('keeps v1 Splices intact and adds eight versioned fusion rules', () => {
    expect([...GENOME_V2_SPLICE_IDS].sort()).toEqual([...V2_SPLICES].sort());
    for (const id of V2_SPLICES) {
      expect(code).toContain(`('${id}', 2,`);
      const [a, b] = GENOME_V2_SPLICES[id].parents;
      expect(code).toMatch(
        new RegExp(`'${id}', 2,[\\s\\S]*'${a}', '${b}'`)
      );
    }
    expect(code).toMatch(
      /'splice_gilded_fork',[\s\S]*'gold_trail', 'overgrowth'/
    );
    expect(code).toMatch(
      /'splice_styx_contract',[\s\S]*'mirror_wager', 'phoenix'/
    );
    expect(code).not.toMatch(/UPDATE splice_definitions/);
  });

  it('adds an integer frozen v2 Ascendance curve without replacing v1 SQL', () => {
    expect(code).toMatch(
      /CREATE OR REPLACE FUNCTION ascendance_yield_multiplier_bps_v2\([\s\S]*10000::NUMERIC \* power\([\s\S]*1\.02::NUMERIC[\s\S]*- 3/
    );
    expect(code).toMatch(
      /CREATE OR REPLACE FUNCTION ascendance_yield_multiplier_v2\([\s\S]*ascendance_yield_multiplier_bps_v2\(p_generation\)/
    );
    expect(code).toMatch(
      /CREATE OR REPLACE FUNCTION ascendance_yield_bonus_v2\([\s\S]*ascendance_yield_multiplier_v2\(p_generation\) - 1/
    );
    expect(code).not.toMatch(
      /CREATE OR REPLACE FUNCTION ascendance_yield_bonus\s*\(/
    );
    expect(code).not.toMatch(
      /CREATE OR REPLACE FUNCTION ascendance_yield_multiplier\s*\(/
    );
  });

  it('keeps the deterministic v1 draft internally and exposes a v2 Ascendance preview', () => {
    expect(code).toMatch(
      /ALTER FUNCTION public\.breeding_draft\([\s\S]*\) RENAME TO breeding_draft_v1/
    );
    const wrapper = code.match(
      /CREATE OR REPLACE FUNCTION public\.breeding_draft\([\s\S]+?LANGUAGE sql STABLE SECURITY DEFINER/
    )?.[0] ?? '';
    expect(wrapper).toMatch(/public\.breeding_draft_v1\(/);
    expect(wrapper).toMatch(/'curve_version', 2/);
    expect(wrapper).toMatch(/'multiplier_bps', public\.ascendance_yield_multiplier_bps_v2\(n\)/);
    expect(wrapper).toMatch(/'yield_bonus', public\.ascendance_yield_bonus_v2\(n\)/);
    expect(wrapper).toMatch(/'yield_multiplier', public\.ascendance_yield_multiplier_v2\(n\)/);
    expect(code).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.breeding_draft_v1\([\s\S]*FROM PUBLIC, anon, authenticated, service_role/
    );
    expect(code).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.breeding_draft\([\s\S]*TO service_role/
    );
  });

  it('projects stable slots, instances, retired state and journals from JSONB', () => {
    expect(code).toMatch(/CREATE OR REPLACE FUNCTION genome_record_version/);
    expect(code).toMatch(/p_genome -> 'instances'/);
    expect(code).toMatch(/p_genome -> 'slots'/);
    expect(code).toMatch(/p_genome -> 'eventJournal'/);
    expect(code).toMatch(/status IN \('active', 'held', 'spliced'\)/);
    expect(code).toMatch(/'gene_recoded'/);
    expect(code).toMatch(/'portal_infuse'/);
    expect(code).not.toMatch(/ADD COLUMN .*genome_(?:slots|instances|events)/i);
  });

  it('records Codex discoveries for accepted v1 and v2 envelopes', () => {
    const body = code.match(
      /CREATE OR REPLACE FUNCTION record_codex_discoveries[\s\S]+?REVOKE ALL ON FUNCTION record_codex_discoveries/
    )?.[0] ?? '';
    expect(body).toMatch(/v_rules_version NOT IN \(1, 2\)/);
    expect(body).toMatch(/v_rules_version = 1[\s\S]*\) < 15 THEN/);
    expect(body).toMatch(/genome_record_gene_ids\(p_genome, 'discovered'\)/);
    expect(body).toMatch(/genome_record_splice_ids\(p_genome\)/);
    expect(body).toMatch(/versioned\.rules_version = v_rules_version/);
    expect(body).toMatch(
      /ON CONFLICT \(player_id, discovery_type, entry_id\) DO NOTHING/
    );
  });

  it('keeps retired contracts retired and opens only the v2 Codex wrapper at bank zero', () => {
    expect(code).not.toMatch(/CREATE OR REPLACE FUNCTION refresh_contract_progress/);
    const wrapper = code.match(
      /CREATE OR REPLACE FUNCTION record_session_codex_discoveries[\s\S]+?REVOKE ALL ON FUNCTION record_session_codex_discoveries/
    )?.[0] ?? '';
    expect(wrapper).toMatch(/v_rules_version := genome_record_version\(p_genome\)/);
    expect(wrapper).toMatch(
      /IF v_rules_version = 2 THEN[\s\S]*RETURN record_codex_discoveries/
    );
    expect(wrapper).toMatch(/IF v_count < 15 THEN/);
    expect(wrapper).toMatch(/CODEX_SESSION_CUTOFF_NOT_ATOMIC/);
  });

  it('exposes the exact service-only release capability contract', () => {
    const capability = code.match(
      /CREATE OR REPLACE FUNCTION get_genome_v2_capability\(\)[\s\S]+?GRANT EXECUTE ON FUNCTION get_genome_v2_capability\(\)[\s\S]+?TO service_role;/
    )?.[0] ?? '';
    expect(capability).toMatch(/'status', CASE[\s\S]*THEN 'ready'[\s\S]*ELSE 'incomplete'/);
    expect(capability).toMatch(/genome_gene_versions[\s\S]*rules_version = 2 AND active[\s\S]*\) = 16/);
    expect(capability).toMatch(/genome_splice_versions[\s\S]*rules_version = 2 AND active[\s\S]*\) = 8/);
    expect(capability).toMatch(/ascendance_yield_multiplier_bps_v2\(integer\)/);
    expect(capability).toMatch(/ascendance_yield_multiplier_v2\(integer\)/);
    expect(capability).toMatch(/ascendance_yield_bonus_v2\(integer\)/);
    expect(capability).toMatch(/'schemaVersion', 2/);
    expect(capability).toMatch(/'catalogVersion', 2/);
    expect(capability).toMatch(/'ascendanceVersion', 2/);
    expect(capability).toMatch(/'spliceCount', 8/);
    expect(capability).toMatch(
      /REVOKE ALL ON FUNCTION get_genome_v2_capability\(\)[\s\S]*FROM PUBLIC, anon, authenticated/
    );
    expect(capability).toMatch(
      /GRANT EXECUTE ON FUNCTION get_genome_v2_capability\(\)[\s\S]*TO service_role/
    );
  });
});
