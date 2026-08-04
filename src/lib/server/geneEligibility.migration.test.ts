/**
 * Migration 067 — curriculum Gene eligibility, asserted as text.
 *
 * The isolated SQL contract (`supabase/tests/067_player_gene_eligibility.sql`)
 * proves the RPCs BEHAVE. This file proves the migration SAYS what the server
 * contract requires — the RLS shape, the grant boundary, and the three
 * backfill passes, which run exactly once and can never be re-proved against a
 * database that has already applied them.
 *
 * Comments are stripped before matching, so a promise made in prose cannot
 * satisfy an assertion about code.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from '@jest/globals';

import { GENOME_V2_CONFIG } from '@/shared/game/genomeV2';
import { GENOME_V2_GRADUATION } from '@/shared/game/genes';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/067_player_gene_eligibility.sql'),
  'utf8'
);
const code = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');
const normalized = code.replace(/\s+/g, ' ');

describe('migration 067: the table', () => {
  it('is keyed by player, rules version and gene, and cascades with the player', () => {
    expect(normalized).toContain(
      'CREATE TABLE IF NOT EXISTS player_gene_eligibility'
    );
    expect(normalized).toContain(
      'player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE'
    );
    expect(normalized).toContain('PRIMARY KEY (player_id, rules_version, gene_id)');
  });

  it('stores only the two live states, so VISIBLE_LOCKED is the absence of a row', () => {
    expect(normalized).toContain(
      "CHECK (state IN ('trial', 'offer_eligible'))"
    );
    expect(normalized).toContain(
      "CHECK (source IN ('starter', 'trial_resolved', 'migration_credit', 'graduation'))"
    );
    expect(normalized).toContain(
      'CHECK (trial_offers_seen >= 0 AND trial_offers_seen <= 3)'
    );
    expect(normalized).toContain(
      "CHECK (state <> 'offer_eligible' OR first_eligible_at IS NOT NULL)"
    );
  });

  it('enforces RLS with an own-row read and no write policy at all', () => {
    expect(normalized).toContain(
      'ALTER TABLE player_gene_eligibility ENABLE ROW LEVEL SECURITY'
    );
    expect(normalized).toContain(
      'CREATE POLICY player_gene_eligibility_select_own ON player_gene_eligibility FOR SELECT'
    );
    expect(normalized).toContain(
      'player_id IN ( SELECT id FROM players WHERE user_id = auth.uid() )'
    );
    // The whole point of the satellite table: a direct client write is refused
    // by the database rather than by a convention.
    expect(normalized).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)/);
  });

  it('grants authenticated a read, anon nothing, and revokes before granting', () => {
    // Enumerating write verbs to revoke would leave SELECT behind wherever the
    // default ACL grants it (supabase_admin's grants the browser roles
    // `arwdDxtm`). Revoke ALL, then grant back exactly one privilege.
    expect(normalized).toContain(
      'REVOKE ALL ON player_gene_eligibility FROM PUBLIC, anon, authenticated'
    );
    expect(normalized).toContain(
      'GRANT SELECT ON player_gene_eligibility TO authenticated'
    );
    expect(normalized).not.toContain('TO anon');
    // The revoke must precede the grant, or it undoes it.
    expect(
      normalized.indexOf('REVOKE ALL ON player_gene_eligibility')
    ).toBeLessThan(
      normalized.indexOf('GRANT SELECT ON player_gene_eligibility')
    );
  });
});

describe('migration 067: the functions', () => {
  const functions = [
    'genome_eligibility_active_gene_ids(SMALLINT, TEXT[])',
    'grant_starter_eligibility(UUID, SMALLINT, TEXT[])',
    'select_gene_trial(UUID, SMALLINT, TEXT)',
    'record_trial_offer(UUID, SMALLINT, TEXT, UUID)',
    'resolve_learning_event(UUID, SMALLINT, TEXT, UUID, SMALLINT)',
    'graduate_full_roster(UUID, SMALLINT, TEXT[])',
    'read_gene_eligibility(UUID, SMALLINT)',
  ];

  it('declares all six contract RPCs plus the catalog validator', () => {
    for (const signature of functions) {
      const name = signature.slice(0, signature.indexOf('('));
      expect(normalized).toContain(`CREATE OR REPLACE FUNCTION ${name}(`);
    }
  });

  it('revokes every function from the browser roles BY NAME, not only from PUBLIC', () => {
    // A bare `FROM PUBLIC` is enough only when the migration is applied by
    // `postgres`, whose default ACL for public functions grants postgres and
    // service_role. Applied by `supabase_admin`, whose default ACL also grants
    // anon and authenticated, every one of these would be born with an
    // explicit browser-role grant that a PUBLIC revoke leaves in place — and
    // four of the seven take `p_player_id`, so an executable one is a write
    // path into another account's curriculum. Naming the roles removes the
    // dependence on the grantor. The SQL contract can only observe the
    // effective privilege in the database it runs against; this assertion is
    // what pins the source form.
    for (const signature of functions) {
      expect(normalized).toContain(
        `REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC, anon, authenticated`
      );
      expect(normalized).toContain(
        `GRANT EXECUTE ON FUNCTION ${signature} TO service_role`
      );
      expect(normalized).not.toContain(
        `GRANT EXECUTE ON FUNCTION ${signature} TO authenticated`
      );
      expect(normalized).not.toContain(
        `GRANT EXECUTE ON FUNCTION ${signature} TO anon`
      );
    }
    // No function may be left on the weaker form.
    expect(normalized).not.toMatch(/REVOKE ALL ON FUNCTION [^;]*? FROM PUBLIC;/);
  });

  it('pins SECURITY DEFINER search_path on every function', () => {
    const definers = normalized.match(/SECURITY DEFINER SET search_path = public/g);
    expect(definers).toHaveLength(functions.length);
  });

  it('validates gene ids against the versioned catalog rather than an enum', () => {
    expect(normalized).toContain('FROM genome_gene_versions AS versioned');
    expect(normalized).toContain('AND versioned.active');
  });

  it('cannot demote: promotion is guarded and timestamps are written once', () => {
    // resolve/record only touch a row still in the trial state, so a replayed
    // settlement is a no-op rather than a second promotion.
    expect(normalized).toContain("AND pge.state = 'trial'");
    expect(normalized).toContain(
      'first_eligible_at = COALESCE(pge.first_eligible_at, NOW())'
    );
    expect(normalized).toContain('GREATEST(pge.trial_offers_seen');
    expect(normalized).toContain("WHERE pge.state <> 'offer_eligible'");
  });

  it('promotes a trial only from a settled, validated, non-Free-Play run', () => {
    expect(normalized).toContain('FROM game_sessions AS gs');
    expect(normalized).toContain('AND gs.player_id = p_player_id');
    expect(normalized).toContain('AND gs.ended_at IS NOT NULL');
    expect(normalized).toContain('AND gs.validated IS TRUE');
    expect(normalized).toContain('AND gs.is_free_play IS NOT TRUE');
    expect(normalized).toContain('GENE_ELIGIBILITY_SESSION_NOT_AUTHORITATIVE');
  });

  it('has exactly one DELETE, guarded to an unresolved trial', () => {
    const deletes = normalized.match(/DELETE FROM player_gene_eligibility/g);
    expect(deletes).toHaveLength(1);
    expect(normalized).toContain(
      "DELETE FROM player_gene_eligibility WHERE player_id = p_player_id AND rules_version = p_rules_version AND state = 'trial' AND gene_id <> p_gene_id"
    );
    // R6: the reviewer-checkable marker lives on the statement, in the file.
    expect(sql).toContain('constitution-allow: owned-row-downward');
  });
});

describe('migration 067: the backfill', () => {
  it('graduates at the shipped Apex thresholds and nothing new', () => {
    expect(GENOME_V2_GRADUATION.bankedRuns).toBe(
      GENOME_V2_CONFIG.ftue.apexAtBankedRuns
    );
    expect(GENOME_V2_GRADUATION.masteryLevel).toBe(
      GENOME_V2_CONFIG.ftue.apexAtMastery
    );
    expect(normalized).toContain(
      `) >= ${GENOME_V2_GRADUATION.bankedRuns} OR COALESCE(( SELECT MAX(level_for_xp(pm.xp)) FROM player_mastery AS pm WHERE pm.player_id = p.id ), 0) >= ${GENOME_V2_GRADUATION.masteryLevel}`
    );
  });

  it('counts banked runs with the canonical five predicates', () => {
    expect(normalized).toContain(
      'SELECT COUNT(*) FROM game_sessions AS gs WHERE gs.player_id = p.id AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE AND gs.is_free_play IS NOT TRUE AND gs.extracted'
    );
  });

  it('credits history from player_codex, with a splice crediting BOTH parents', () => {
    expect(normalized).toContain("WHERE codex.discovery_type = 'gene'");
    expect(normalized).toContain('splices.gene_a AS gene_id');
    expect(normalized).toContain('splices.gene_b AS gene_id');
    expect(normalized).toContain('JOIN genome_splice_versions AS splices');
  });

  it('seeds the Genes that are starters in every Dynasty', () => {
    expect(normalized).toContain(
      "ARRAY[ 'gold_trail', 'compound_interest', 'phoenix', 'overgrowth', 'phase_gate' ]"
    );
  });

  it('never re-onboards: every backfill insert is DO NOTHING', () => {
    const inserts = normalized.match(
      /INSERT INTO player_gene_eligibility \(/g
    );
    expect(inserts).toHaveLength(3);
    const doNothing = normalized.match(
      /ON CONFLICT \(player_id, rules_version, gene_id\) DO NOTHING/g
    );
    // Three backfill passes plus `grant_starter_eligibility` itself.
    expect(doNothing).toHaveLength(4);
  });

  it('says what it actually counted', () => {
    // Migration 055's NOTICE described rows its filter did not select, and the
    // next reader learned to ignore the tripwire. This one names the rows the
    // statements above genuinely wrote.
    expect(sql).toContain(
      'rows inserted, not accounts examined; a re-run writes 0'
    );
  });

  it('is forward-only with an explicit down-note', () => {
    expect(sql).toContain('DOWN-NOTE (forward-only)');
    expect(sql).toContain('DROP TABLE IF EXISTS player_gene_eligibility;');
    expect(normalized).toContain('BEGIN;');
    expect(normalized).toContain('COMMIT;');
  });
});
