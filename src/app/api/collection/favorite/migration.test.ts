/**
 * Migration 064 shape tests: atomic one-favorite-per-dynasty persistence.
 *
 * These checks pin the concurrency and privilege properties that are easy to
 * lose in a later CREATE OR REPLACE. Functional behavior is also exercised by
 * supabase/tests/064_atomic_dynasty_favorites.sql against local Postgres.
 */

import fs from 'fs';
import path from 'path';

const MIGRATIONS = path.join(process.cwd(), 'supabase/migrations');
const FILE = '064_atomic_dynasty_favorites.sql';
const sql = fs.readFileSync(path.join(MIGRATIONS, FILE), 'utf8');

function liveDefinition(name: string): { file: string; body: string } {
  const files = fs
    .readdirSync(MIGRATIONS)
    .filter((entry) => entry.endsWith('.sql'))
    .sort();
  let found: { file: string; body: string } | null = null;
  const opening = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${name}\\s*\\(`,
    'gi'
  );

  for (const file of files) {
    const text = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');
    opening.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = opening.exec(text)) !== null) {
      const rest = text.slice(match.index);
      const end = rest.indexOf('$$ LANGUAGE');
      found = { file, body: end === -1 ? rest : rest.slice(0, end) };
    }
  }

  if (!found) throw new Error(`No definition found for ${name}`);
  return found;
}

describe('Migration 064: atomic dynasty favorites', () => {
  it('is one forward transactional migration and the live RPC definition', () => {
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/i);
    expect(liveDefinition('set_dynasty_favorite').file).toBe(FILE);
  });

  it('normalizes legacy duplicate favorites without deleting collection rows', () => {
    expect(sql).toMatch(
      /LOCK TABLE collected_snakes IN SHARE ROW EXCLUSIVE MODE/i
    );
    expect(sql).toMatch(
      /ROW_NUMBER\(\) OVER \([\s\S]*PARTITION BY cs\.player_id, sv\.dynasty_id/i
    );
    expect(sql).toMatch(/SET is_favorited = FALSE[\s\S]*favorite_rank > 1/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+collected_snakes/i);
  });

  it('keeps the invariant intact for the outgoing direct-row writer', () => {
    const { body } = liveDefinition('enforce_single_dynasty_favorite');
    expect(body).toMatch(/RETURNS TRIGGER/i);
    expect(body).toMatch(
      /SELECT sv\.dynasty_id[\s\S]*WHERE sv\.id = NEW\.snake_variant_id/i
    );
    expect(body).toMatch(
      /pg_advisory_xact_lock\([\s\S]*NEW\.player_id::TEXT[\s\S]*v_dynasty_id::TEXT/i
    );
    expect(body).toMatch(
      /UPDATE collected_snakes cs[\s\S]*cs\.player_id = NEW\.player_id[\s\S]*sv\.dynasty_id = v_dynasty_id[\s\S]*cs\.id IS DISTINCT FROM NEW\.id[\s\S]*cs\.is_favorited = TRUE/i
    );
    expect(sql).toMatch(
      /CREATE TRIGGER trg_single_dynasty_favorite[\s\S]*BEFORE INSERT OR UPDATE OF is_favorited, player_id, snake_variant_id[\s\S]*WHEN \(NEW\.is_favorited = TRUE\)[\s\S]*EXECUTE FUNCTION public\.enforce_single_dynasty_favorite\(\)/i
    );
  });

  it('accepts no caller-authored dynasty and derives it through the catalog join', () => {
    const { body } = liveDefinition('set_dynasty_favorite');
    const signature = body.slice(0, body.indexOf(') RETURNS'));
    expect(signature).toContain('p_player_id UUID');
    expect(signature).toContain('p_snake_id UUID');
    expect(signature).toContain('p_favorited BOOLEAN');
    expect(signature).not.toMatch(/p_dynasty/i);
    expect(body).toMatch(
      /FROM collected_snakes cs\s+JOIN snake_variants sv ON sv\.id = cs\.snake_variant_id/i
    );
    expect(body).toMatch(/cs\.player_id = p_player_id/i);
  });

  it('serializes different target rows on one player-and-derived-dynasty key', () => {
    const { body } = liveDefinition('set_dynasty_favorite');
    expect(body).toMatch(
      /pg_advisory_xact_lock\([\s\S]*p_player_id::TEXT[\s\S]*v_dynasty_id::TEXT/i
    );
    expect(body).toMatch(/FOR UPDATE OF cs/i);
    // The target row is not locked before the shared advisory lock: doing so
    // lets A and B each hold a target while waiting on the other transaction.
    const advisory = body.indexOf('pg_advisory_xact_lock');
    const firstForUpdate = body.indexOf('FOR UPDATE OF cs');
    expect(advisory).toBeGreaterThan(-1);
    expect(firstForUpdate).toBeGreaterThan(advisory);
  });

  it('locks and clears every same-dynasty favorite, including old generations', () => {
    const { body } = liveDefinition('set_dynasty_favorite');
    expect(body).toMatch(
      /cs\.player_id = p_player_id[\s\S]*sv\.dynasty_id = v_dynasty_id[\s\S]*cs\.id <> p_snake_id[\s\S]*cs\.is_favorited = TRUE/i
    );
    expect(body).toMatch(
      /UPDATE collected_snakes\s+SET is_favorited = FALSE\s+WHERE id = ANY\(v_replaced_snake_ids\)/i
    );
    expect(body).toMatch(
      /UPDATE collected_snakes\s+SET is_favorited = TRUE\s+WHERE id = p_snake_id/i
    );
  });

  it('keeps unfavorite narrow and returns the exact reconciliation receipt', () => {
    const { body } = liveDefinition('set_dynasty_favorite');
    expect(body).toMatch(
      /ELSE[\s\S]*UPDATE collected_snakes\s+SET is_favorited = FALSE\s+WHERE id = p_snake_id[\s\S]*END IF;/i
    );
    expect(body).toMatch(/'favorite_snake_id'/i);
    expect(body).toMatch(/'replaced_snake_ids', to_jsonb\(v_replaced_snake_ids\)/i);
  });

  it('is SECURITY DEFINER with a fixed search path and service-role-only execution', () => {
    expect(sql).toMatch(
      /\$\$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;/i
    );
    for (const role of ['PUBLIC', 'anon', 'authenticated']) {
      expect(sql).toMatch(
        new RegExp(
          `REVOKE EXECUTE ON FUNCTION public\\.set_dynasty_favorite\\(UUID, UUID, BOOLEAN\\) FROM ${role}`,
          'i'
        )
      );
    }
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.set_dynasty_favorite\(UUID, UUID, BOOLEAN\) TO service_role/i
    );
  });
});
