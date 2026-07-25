/**
 * Migration 047 shape tests — WP-1.05, Lineage rework (Constitution §8.2).
 *
 * These assert the SQL text, which is what ships: no database is touched.
 * The three things they exist to guard are the WP's acceptance criteria —
 * the breeding path is free of random(), the draft is written verbatim from
 * the preview, and the token conversion preserves value or aborts.
 */

import * as fs from 'fs';
import * as path from 'path';
import { REROLL_TOKEN_DNA_VALUE } from '@/shared/game/lineage';
import {
  ASCENDANCE_COST_STEEPENING,
  ASCENDANCE_YIELD_CEILING,
} from '@/shared/game/ascendance';

const MIGRATIONS = path.join(process.cwd(), 'supabase/migrations');

const sql = fs.readFileSync(
  path.join(MIGRATIONS, '047_deterministic_lineage_draft.sql'),
  'utf8'
);

/**
 * The live definition of a Postgres function: the body under its LAST
 * `CREATE ... FUNCTION <name>(` across the whole migration history, since
 * only the newest definition runs. Mirrors the resolution the
 * `breeding-random` gate in scripts/verify-constitution.mjs performs.
 */
function liveDefinition(name: string): string {
  const files = fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  let found: string | null = null;
  for (const file of files) {
    const body = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');
    const definition = new RegExp(
      `create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?[a-z0-9_]+\\s*\\(`,
      'gi'
    );
    const matches = [...body.matchAll(definition)];
    matches.forEach((match, index) => {
      const header = body.slice(match.index, match.index + 200);
      if (!new RegExp(`function\\s+(?:public\\.)?${name}\\s*\\(`, 'i').test(header)) {
        return;
      }
      const end =
        index + 1 < matches.length ? matches[index + 1].index : body.length;
      found = body.slice(match.index, end);
    });
  }
  if (found === null) throw new Error(`no definition found for ${name}()`);
  return found;
}

describe('Migration 047: the breeding path is grep-clean of random()', () => {
  const RANDOM = /(?<![\w])random\s*\(|\bMath\.random\s*\(/;

  for (const fn of [
    'breed_snakes',
    'breeding_draft',
    'lineage_draft_options',
    'reroll_lineage',
    'reroll_trait',
    'ascendance_yield_bonus',
    'breeding_cost',
  ]) {
    it(`the live definition of ${fn}() contains no random()`, () => {
      expect(liveDefinition(fn)).not.toMatch(RANDOM);
    });
  }

  it('drops the RNG helper the old breeding path shared', () => {
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS pick_random_trait\(TEXT\[\]\)/);
  });

  it('drops the legacy signatures rather than leaving a coin-flip door open', () => {
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS breed_snakes\(UUID, UUID, UUID\)/);
    expect(sql).toMatch(
      /DROP FUNCTION IF EXISTS breed_snakes\(UUID, UUID, UUID, BOOLEAN\)/
    );
  });
});

describe('Migration 047: preview equals outcome', () => {
  it('breed_snakes computes the child by calling breeding_draft', () => {
    const body = liveDefinition('breed_snakes');
    expect(body).toMatch(/v_draft\s*:=\s*breeding_draft\(/);
    expect(body).toMatch(/v_preview\s*:=\s*v_draft\s*->\s*'preview'/);
  });

  it('every written field is read from that one preview object', () => {
    const body = liveDefinition('breed_snakes');
    expect(body).toMatch(/\(v_preview ->> 'variant_id'\)::UUID/);
    expect(body).toMatch(/\(v_preview ->> 'generation'\)::INTEGER/);
    expect(body).toMatch(/jsonb_array_elements_text\(v_preview -> 'traits'\)/);
    expect(body).toMatch(/v_preview -> 'lineage'/);
    expect(body).toMatch(/v_cost := \(v_preview ->> 'dna_cost'\)::INTEGER/);
    // The audit row keeps the whole preview for later reconciliation.
    expect(body).toMatch(/'preview', v_preview/);
  });

  it('breeding_draft is STABLE and writes nothing, so previewing is free', () => {
    const body = liveDefinition('breeding_draft');
    expect(body).toMatch(/LANGUAGE plpgsql STABLE SECURITY DEFINER/);
    expect(body).not.toMatch(/\b(INSERT INTO|UPDATE|DELETE FROM)\b/);
  });

  it('refuses any choice outside the enumerated options', () => {
    const body = liveDefinition('breeding_draft');
    expect(body).toMatch(/is not one of the parents/);
    expect(body).toMatch(/is not in the parents.{0,4} draft pool/);
    expect(body).toMatch(/drafted twice/);
    expect(body).toMatch(/Drafted % traits into % slot\(s\)/);
    expect(body).toMatch(/is not available for this pairing/);
  });
});

describe('Migration 047: Ascendance', () => {
  it('states the same curve as the TS lockstep', () => {
    const body = liveDefinition('ascendance_yield_bonus');
    expect(body).toContain(`${ASCENDANCE_YIELD_CEILING.toFixed(2)}::NUMERIC`);
    expect(body).toMatch(/14::NUMERIC \/ 15::NUMERIC/);
    expect(body).toMatch(/COALESCE\(p_generation, 1\) < 4/);
    // Bounded by the ceiling on the SQL side too.
    expect(body).toMatch(/LEAST\(\s*0\.30::NUMERIC,/);
  });

  it('never returns a multiplier below 1', () => {
    expect(liveDefinition('ascendance_yield_multiplier')).toMatch(
      /1::NUMERIC \+ ascendance_yield_bonus/
    );
  });

  it('steepens the cost past Gen3 and leaves Gen1-3 alone', () => {
    const body = liveDefinition('breeding_cost');
    expect(body).toContain(`power(${ASCENDANCE_COST_STEEPENING}::NUMERIC`);
    expect(body).toMatch(/GREATEST\(\(GREATEST\(v_g1, v_g2\) \+ 1\) - 3, 0\)/);
    expect(body).toMatch(/200 \+ \(\(v_g1 \+ v_g2\) \/ 2\) \* 100/);
  });

  it('deletes the generation cap', () => {
    expect(liveDefinition('breeding_draft')).not.toMatch(/Maximum generation/);
    expect(liveDefinition('breed_snakes')).not.toMatch(/Maximum generation/);
  });
});

describe('Migration 047: reroll tokens convert, they are not confiscated', () => {
  it(`pays ${REROLL_TOKEN_DNA_VALUE} DNA per held token`, () => {
    expect(sql).toContain(
      `COALESCE(player_reroll_tokens, 0) * ${REROLL_TOKEN_DNA_VALUE} AS owed_dna`
    );
    expect(sql).toContain(`'rate_dna_per_token', ${REROLL_TOKEN_DNA_VALUE}`);
  });

  it('snapshots every balance BEFORE it writes anything', () => {
    const snapshot = sql.indexOf('CREATE TEMP TABLE wp_1_05_tokens_pre');
    const write = sql.indexOf('SET dna = p.dna + pre.owed_dna');
    expect(snapshot).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(snapshot);
  });

  it('aborts on a wrong balance, a loss, a ledger mismatch, or a survivor', () => {
    expect(sql).toMatch(
      /WHERE p\.dna <> pre\.dna_before \+ pre\.owed_dna[\s\S]{0,200}RAISE EXCEPTION/
    );
    expect(sql).toMatch(
      /WHERE p\.dna < pre\.dna_before[\s\S]{0,200}RAISE EXCEPTION/
    );
    expect(sql).toMatch(
      /v_paid_total <> v_owed_total[\s\S]{0,200}RAISE EXCEPTION/
    );
    expect(sql).toMatch(
      /COALESCE\(player_reroll_tokens, 0\) <> 0[\s\S]{0,200}RAISE EXCEPTION/
    );
  });

  it('writes an auditable ledger row per converted player', () => {
    expect(sql).toMatch(/INSERT INTO economy_transactions[\s\S]{0,400}'reroll_token_conversion'/);
    expect(sql).toContain("'migration', '047_deterministic_lineage_draft'");
    expect(sql).toMatch(/'reroll_token_conversion'\n\)\);/);
  });

  it('stops the season track minting a retired reward', () => {
    expect(sql).toMatch(/DELETE FROM battle_pass_tiers[\s\S]{0,200}reward_type = 'reroll_token'/);
    // Claimed tiers are history and are left alone (Rule 6).
    expect(sql).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM player_battle_pass_claims/);
    expect(liveDefinition('claim_season_tier')).not.toMatch(
      /SET player_reroll_tokens/
    );
  });
});

describe('Migration 047: authority boundary (R11)', () => {
  for (const signature of [
    'breed_snakes(UUID, UUID, UUID, BOOLEAN, UUID, TEXT[], TEXT)',
    'breeding_draft(UUID, UUID, UUID, BOOLEAN, UUID, TEXT[], TEXT)',
  ]) {
    it(`makes ${signature.split('(')[0]} service-role-only`, () => {
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION ${signature} FROM PUBLIC`);
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION ${signature} FROM anon`);
      expect(sql).toContain(
        `REVOKE EXECUTE ON FUNCTION ${signature} FROM authenticated`
      );
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`);
    });
  }

  it('leaves the retired rerolls executable by nobody at all', () => {
    for (const signature of [
      'reroll_lineage(UUID, UUID)',
      'reroll_trait(UUID, UUID, INTEGER)',
    ]) {
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION ${signature} FROM PUBLIC`);
      expect(sql).toContain(
        `REVOKE EXECUTE ON FUNCTION ${signature} FROM service_role`
      );
      expect(sql).not.toContain(
        `GRANT EXECUTE ON FUNCTION ${signature} TO service_role`
      );
    }
    expect(liveDefinition('reroll_lineage')).toMatch(/LINEAGE_REROLL_RETIRED/);
    expect(liveDefinition('reroll_trait')).toMatch(/TRAIT_REROLL_RETIRED/);
  });

  it('carries an explicit down-note (forward-only migrations)', () => {
    expect(sql).toMatch(/DOWN NOTE/);
  });
});
