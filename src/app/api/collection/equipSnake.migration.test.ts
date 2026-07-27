/**
 * Migration 053 shape tests — WP-2.06, the equip race.
 *
 * These assert the SQL text, which is what ships; no database is touched.
 * The thing they exist to guard is the ONE property the fix depends on:
 * `equip_snake` releases and claims in TWO ORDERED STATEMENTS, so the
 * non-deferrable partial unique index can never observe two equipped snakes
 * for one player mid-statement.
 */

import fs from 'fs';
import path from 'path';

const MIGRATIONS = path.join(process.cwd(), 'supabase/migrations');

const sql = fs.readFileSync(
  path.join(MIGRATIONS, '053_equip_snake_ordered_writes.sql'),
  'utf8'
);

/**
 * The live body of a Postgres function: everything under its LAST
 * `CREATE ... FUNCTION <name>(` across the whole migration history, since
 * only the newest definition runs.
 */
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
      found = {
        file,
        body: end === -1 ? rest : rest.slice(0, end),
      };
    }
  }

  if (!found) throw new Error(`No definition found for ${name}`);
  return found;
}

describe('Migration 053: equip_snake writes the release before the claim', () => {
  it('is one transactional migration', () => {
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/i);
  });

  it('is the LIVE definition of equip_snake', () => {
    expect(liveDefinition('equip_snake').file).toBe(
      '053_equip_snake_ordered_writes.sql'
    );
  });

  it('releases every other snake first, in its own statement', () => {
    const { body } = liveDefinition('equip_snake');
    expect(body).toMatch(
      /UPDATE collected_snakes\s+SET is_equipped = false\s+WHERE player_id = p_player_id\s+AND id <> p_snake_id\s+AND is_equipped = true;/i
    );
  });

  it('claims the target second, in its own statement', () => {
    const { body } = liveDefinition('equip_snake');
    expect(body).toMatch(
      /UPDATE collected_snakes\s+SET is_equipped = true\s+WHERE id = p_snake_id\s+AND player_id = p_player_id\s+AND is_equipped IS DISTINCT FROM true;/i
    );
  });

  it('orders them release-then-claim, which is the entire fix', () => {
    const { body } = liveDefinition('equip_snake');
    const release = body.search(/SET is_equipped = false/i);
    const claim = body.search(/SET is_equipped = true/i);
    expect(release).toBeGreaterThan(-1);
    expect(claim).toBeGreaterThan(-1);
    expect(release).toBeLessThan(claim);
  });

  it('retires the single order-dependent statement entirely', () => {
    const { body } = liveDefinition('equip_snake');
    // `SET is_equipped = (id = p_snake_id)` is the 037 form that raced.
    expect(body).not.toMatch(/SET is_equipped = \(id = p_snake_id\)/i);
  });

  it('keeps the per-player advisory lock and the ownership raise', () => {
    const { body } = liveDefinition('equip_snake');
    expect(body).toMatch(
      /pg_advisory_xact_lock\(hashtextextended\(p_player_id::TEXT, 0\)\)/i
    );
    expect(body).toMatch(/RAISE EXCEPTION 'Snake not owned by player'/i);
  });

  it('still synchronizes player_settings in the same transaction', () => {
    const { body } = liveDefinition('equip_snake');
    expect(body).toMatch(
      /INSERT INTO player_settings \(player_id, active_snake_id, selected_dynasty\)[\s\S]*ON CONFLICT \(player_id\) DO UPDATE/i
    );
  });

  it('leaves the partial unique index alone — it is correct and load-bearing', () => {
    // It may be NAMED in the header, which explains the defect. It must not
    // be touched by any statement: dropping or widening it is the wrong fix.
    const statements = sql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    expect(statements).not.toMatch(/idx_collected_one_equipped_per_player/i);
    expect(statements).not.toMatch(/\b(DROP|CREATE|ALTER)\s+(UNIQUE\s+)?INDEX\b/i);
  });

  it('keeps execution service-role only', () => {
    for (const role of ['PUBLIC', 'anon', 'authenticated']) {
      expect(sql).toMatch(
        new RegExp(
          `REVOKE EXECUTE ON FUNCTION equip_snake\\(UUID, UUID\\) FROM ${role}`,
          'i'
        )
      );
    }
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION equip_snake\(UUID, UUID\) TO service_role/i
    );
  });

  it('states WHY one statement cannot work — a partial index is not deferrable', () => {
    expect(sql).toMatch(/DEFERRABLE/);
    expect(sql).toMatch(/WHERE clause/i);
  });

  it('does not edit migration 037, which is applied history and pinned', () => {
    const ftue = fs.readFileSync(
      path.join(MIGRATIONS, '037_ftue_v2_player_flow.sql'),
      'utf8'
    );
    expect(ftue).toMatch(/SET is_equipped = \(id = p_snake_id\)/i);
  });

  it('lets unlock_and_equip_variant inherit the fix through its PERFORM', () => {
    const { body } = liveDefinition('unlock_and_equip_variant');
    expect(body).toMatch(/PERFORM equip_snake\(p_player_id, v_snake_id\)/i);
  });
});
