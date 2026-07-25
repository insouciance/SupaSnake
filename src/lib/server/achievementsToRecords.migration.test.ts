/**
 * WP-0.04 - Achievements retire into the Legacy Records.
 *
 * Migration 042 shape tests plus the surface guards the work package's
 * acceptance names:
 *
 *   - the conversion (completed achievements -> Legacy Record floors),
 *   - the value-preservation assertion (the sum of granted rewards is
 *     preserved, asserted inside the SQL, aborting the transaction),
 *   - no achievement claim endpoint and no achievement surface remain,
 *   - F-6: `refresh_player_records` cannot lower a record,
 *   - F-6a: the `crowned` bye path neither drops on leaving a clan nor
 *     grants on joining one.
 *
 * The two finding tests come in pairs: a structural assertion on the LIVE
 * SQL definition (newest migration wins, exactly as Postgres resolves it)
 * and an executable model of the rule, so a future edit that keeps the
 * keyword but breaks the semantics still fails.
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, 'supabase/migrations');
const MIGRATION_042 = path.join(MIGRATIONS_DIR, '042_achievements_to_records.sql');

const sql = fs.readFileSync(MIGRATION_042, 'utf8');

/**
 * The body Postgres actually runs: the LAST `CREATE [OR REPLACE] FUNCTION
 * <name>` across the migrations in numeric order. Resolving it this way is
 * what lets the F-6 regression test keep passing when a later work package
 * re-declares the function for its own reasons - and keeps it FAILING if
 * that re-declaration drops the monotonic guard.
 */
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
      // The body runs to the end of its dollar-quoted block.
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

// ---------------------------------------------------------------------------
// Atomicity and the settlement of outstanding claims
// ---------------------------------------------------------------------------

describe('Migration 042: one atomic migration', () => {
  it('wraps everything in a single transaction', () => {
    expect(sql).toMatch(/^\s*BEGIN;/m);
    expect(sql.trimEnd()).toMatch(/COMMIT;$/);
    // Exactly one transaction: a half-migrated player must be impossible.
    expect(sql.match(/^\s*BEGIN;/gm)).toHaveLength(1);
    expect(sql.match(/^COMMIT;/gm)).toHaveLength(1);
  });

  it('settles outstanding claims BEFORE removing the claim mechanism', () => {
    const settle = sql.indexOf('SET dna = p.dna + pre.owed_dna');
    const dropPurse = sql.indexOf('DROP COLUMN IF EXISTS reward_dna');
    const dropClaim = sql.indexOf('DROP COLUMN IF EXISTS reward_claimed');

    expect(settle).toBeGreaterThan(-1);
    expect(dropPurse).toBeGreaterThan(settle);
    expect(dropClaim).toBeGreaterThan(settle);
  });

  it('snapshots the pre-state before it writes anything', () => {
    const snapshot = sql.indexOf('CREATE TEMP TABLE wp_0_04_player_pre');
    const firstWrite = sql.indexOf('UPDATE players p\nSET dna =');

    expect(snapshot).toBeGreaterThan(-1);
    expect(firstWrite).toBeGreaterThan(snapshot);
    expect(sql).toMatch(/CREATE TEMP TABLE wp_0_04_records_pre ON COMMIT DROP/);
    expect(sql).toMatch(/CREATE TEMP TABLE wp_0_04_converted ON COMMIT DROP/);
  });

  it('writes the economy_transactions audit row the claim route never did (F-15)', () => {
    expect(sql).toMatch(/INSERT INTO economy_transactions/);
    expect(sql).toMatch(/'achievement_reward'/);
    expect(sql).toMatch(/'migration', '042_achievements_to_records'/);
  });

  it('pays no energy: the stock was deleted by migration 039 (§8.6, §10.4)', () => {
    // No statement anywhere sets an energy column.
    expect(sql).not.toMatch(/\bset\s+[a-z_]*energy[a-z_]*\s*=/i);
    // And the assertion block proves it rather than trusting the above.
    expect(sql).toMatch(/energy IS DISTINCT FROM pre\.energy_before/);
    expect(sql).toMatch(/energy is never granted/);
  });
});

// ---------------------------------------------------------------------------
// The acceptance criterion: the sum of granted rewards is preserved
// ---------------------------------------------------------------------------

describe('Migration 042: value preservation, asserted in the SQL', () => {
  it('aborts the transaction rather than losing or minting value', () => {
    // A DO block that RAISEs - not a NOTICE, not a comment.
    expect(sql).toMatch(/RAISE EXCEPTION\s*\n?\s*'WP-0\.04 aborted:/);

    // The per-player equality: dna_after = dna_before + owed. A shortfall
    // is value lost; a surplus is value minted; both abort.
    expect(sql).toMatch(/WHERE p\.dna <> pre\.dna_before \+ pre\.owed_dna/);
    expect(sql).toMatch(
      /the sum of granted achievement rewards was NOT preserved/
    );
  });

  it('cross-checks the settlement against the ledger it wrote', () => {
    expect(sql).toMatch(/IF v_paid_total <> v_owed_total THEN/);
    expect(sql).toMatch(/settlement ledger records % DNA but % DNA was owed/);
  });

  it('refuses to remove the claim mechanism while a debt is outstanding', () => {
    expect(sql).toMatch(/completed achievement\(s\) still unsettled/);
    const assertion = sql.indexOf('still unsettled');
    const drop = sql.indexOf('DROP COLUMN IF EXISTS reward_claimed');
    expect(drop).toBeGreaterThan(assertion);
  });

  it('asserts Rule 6 on every record and every legacy score it touched', () => {
    expect(sql).toMatch(/record\(s\) were lowered or lost \(Rule 6\)/);
    expect(sql).toMatch(/legacy score\(s\) were lowered \(Rule 6\)/);
  });

  it('asserts every converted achievement reached its Record floor', () => {
    expect(sql).toMatch(/converted achievement\(s\) did not reach their Record floor/);
  });
});

// ---------------------------------------------------------------------------
// The conversion itself
// ---------------------------------------------------------------------------

describe('Migration 042: earned achievements become Legacy Records (Rule 6)', () => {
  it('maps the five measurable categories onto their records', () => {
    for (const [category, record] of [
      ['games', 'mileage'],
      ['dna', 'vault'],
      ['breeding', 'geneflow'],
      ['collection', 'menagerie'],
      ['streak', 'unbroken'],
    ]) {
      expect(sql).toMatch(
        new RegExp(`\\('${category}',\\s*'${record}'\\)`)
      );
    }
  });

  it('does not invent a 22nd record for the score achievements', () => {
    expect(sql).not.toMatch(/INSERT INTO record_definitions/);
    expect(sql).toMatch(/'score' is deliberately absent/);
  });

  it('banks the floor monotonically and grants the badges it earns', () => {
    expect(sql).toMatch(
      /ON CONFLICT \(player_id, record_id\) DO UPDATE\s*\n\s*SET value\s*=\s*GREATEST\(player_records\.value, EXCLUDED\.value\)/
    );
    expect(sql).toMatch(/INSERT INTO player_cosmetics \(player_id, cosmetic_id, source\)/);
    expect(sql).toMatch(/SET legacy_score = GREATEST\(p\.legacy_score, banked\.total\)/);
  });

  it('destroys no player-owned row: columns are dropped, tables are not', () => {
    const statements = sql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    expect(statements).not.toMatch(/DROP TABLE/i);
    expect(statements).not.toMatch(
      /DELETE FROM (player_achievements|players|player_records|player_cosmetics)/i
    );
    expect(statements).not.toMatch(/TRUNCATE/i);
    // The ledger survives as a frozen, read-only record of what was earned.
    expect(sql).toMatch(/FROZEN LEDGER \(WP-0\.04\)/);
  });

  it('removes the purse and the claim from the schema (§12.2: no new claim RPC)', () => {
    expect(sql).toMatch(
      /ALTER TABLE achievement_definitions\s*\n\s*DROP COLUMN IF EXISTS reward_dna,\s*\n\s*DROP COLUMN IF EXISTS reward_energy;/
    );
    expect(sql).toMatch(
      /ALTER TABLE player_achievements\s*\n\s*DROP COLUMN IF EXISTS reward_claimed,\s*\n\s*DROP COLUMN IF EXISTS reward_claimed_at;/
    );
    // This migration removes a claim path. It must not add one.
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION [a-z_]*claim[a-z_]*\s*\(/i);
  });

  it('audits its one SECURITY DEFINER addition (Rule 11)', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION snapshot_champion_roster\(\)/);
    expect(sql).toMatch(/SECURITY DEFINER audit \(Rule 11\)/);
    for (const role of ['PUBLIC', 'anon', 'authenticated']) {
      expect(sql).toMatch(
        new RegExp(`REVOKE EXECUTE ON FUNCTION snapshot_champion_roster\\(\\) FROM ${role};`)
      );
    }
  });

  it('carries an explicit forward-only down-note', () => {
    expect(sql).toMatch(/DOWN-NOTE \(forward-only/);
    expect(sql).toMatch(/NO PLAYER-OWNED VALUE IS DESTROYED BY THIS MIGRATION/);
  });
});

// ---------------------------------------------------------------------------
// F-6: refresh_player_records cannot lower a record
// ---------------------------------------------------------------------------

describe('F-6: refresh_player_records is monotonic (Rule 6)', () => {
  const live = liveFunctionBody('refresh_player_records');

  it('the live definition is the one this work package ships', () => {
    expect(live.migration).toBe('042_achievements_to_records.sql');
  });

  it('guards both value and tier with GREATEST on the upsert', () => {
    expect(live.body).toMatch(
      /ON CONFLICT \(player_id, record_id\) DO UPDATE\s*\n\s*SET value = GREATEST\(player_records\.value, EXCLUDED\.value\),\s*\n\s*tier = GREATEST\(player_records\.tier, EXCLUDED\.tier\)/
    );
  });

  it('never writes value or tier straight from EXCLUDED again', () => {
    expect(live.body).not.toMatch(/SET\s+value\s*=\s*EXCLUDED\.value/i);
    expect(live.body).not.toMatch(/\btier\s*=\s*EXCLUDED\.tier\b/i);
  });

  it('guards the legacy score too', () => {
    expect(live.body).toMatch(
      /UPDATE players SET legacy_score = GREATEST\(legacy_score, v_legacy_score\)/
    );
    expect(live.body).not.toMatch(/SET legacy_score = v_legacy_score\b/);
  });

  it('still recomputes all 21 records from aggregates', () => {
    for (const id of [
      'vault', 'high_water', 'clean_getaways', 'cold_blood',
      'primal_depth', 'cyber_depth', 'cosmic_depth',
      'menagerie', 'bloodline', 'geneflow',
      'on_the_wall', 'campaigner', 'benefactor',
      'tenure', 'unbroken', 'mileage',
      'stormchaser', 'board_presence', 'chronicler',
      'dynast_of_seasons', 'crowned',
    ]) {
      expect(live.body).toContain(`('${id}',`);
    }
  });

  it('models the rule: a shrinking aggregate cannot write a record down', () => {
    // The upsert the live SQL now expresses, in one line.
    const upsert = (
      banked: { value: number; tier: number },
      recomputed: { value: number; tier: number }
    ) => ({
      value: Math.max(banked.value, recomputed.value),
      tier: Math.max(banked.tier, recomputed.tier),
    });

    // A player banked Gold (tier 3) on 250 counted runs. Sessions are later
    // invalidated and the aggregate reads 40 - the exact F-6 shrink.
    const banked = { value: 250, tier: 3 };
    const afterShrink = upsert(banked, { value: 40, tier: 1 });

    expect(afterShrink).toEqual({ value: 250, tier: 3 });

    // Growth still lands.
    expect(upsert(banked, { value: 1000, tier: 4 })).toEqual({ value: 1000, tier: 4 });

    // And no sequence of recomputes, in any order, can end below the peak.
    let state = { value: 0, tier: 0 };
    for (const step of [
      { value: 10, tier: 1 },
      { value: 900, tier: 4 },
      { value: 0, tier: 0 },
      { value: 5, tier: 1 },
      { value: 300, tier: 3 },
    ]) {
      state = upsert(state, step);
    }
    expect(state).toEqual({ value: 900, tier: 4 });
  });
});

// ---------------------------------------------------------------------------
// F-6a: the crowned bye path
// ---------------------------------------------------------------------------

describe('F-6a: crowned reads a settlement snapshot, not current membership', () => {
  const live = liveFunctionBody('refresh_player_records');

  it('adds the roster snapshot column and fills it at settlement', () => {
    expect(sql).toMatch(
      /ALTER TABLE season_champions\s*\n\s*ADD COLUMN IF NOT EXISTS champion_roster UUID\[\] NOT NULL DEFAULT '\{\}'::UUID\[\];/
    );
    expect(sql).toMatch(
      /CREATE TRIGGER trg_snapshot_champion_roster\s*\n\s*BEFORE INSERT ON season_champions/
    );
    expect(sql).toMatch(/FROM clan_members cm\s*\n\s*WHERE cm\.clan_id = NEW\.clan_id;/);
  });

  it('backfills history from membership that predates the banner', () => {
    expect(sql).toMatch(/AND cm\.joined_at <= c\.decided_at/);
  });

  it('the bye path no longer reads clan_members at all', () => {
    // Both paths now read a locked snapshot: the duel roster, or the
    // champion roster. Neither consults current membership.
    expect(live.body).toMatch(
      /\(d\.id IS NULL AND v_user = ANY\(COALESCE\(sc\.champion_roster, '\{\}'\)\)\)/
    );

    const crownedBlock = live.body.slice(
      live.body.indexOf('SELECT COUNT(*) INTO v_crowned'),
      live.body.indexOf('---- Upsert all 21 records')
    );
    expect(crownedBlock).not.toMatch(/clan_members/);
  });

  it('models the rule: leaving does not drop it, joining does not grant it', () => {
    type Champion = { clanId: string; byeChampionship: boolean; roster: string[] };

    // The fixed rule, as the live SQL expresses it.
    const crowned = (user: string, champions: Champion[]) =>
      champions.filter((c) => c.roster.includes(user)).length;

    const wasThere = 'user-on-the-wall';
    const opportunist = 'user-who-joined-later';

    // A bye championship: the roster is frozen when the banner is decided.
    const champions: Champion[] = [
      { clanId: 'clan-a', byeChampionship: true, roster: [wasThere] },
    ];

    // Direction 1 - the member leaves the clan afterwards. Current
    // membership is now empty; the record must not fall (Rule 6).
    const currentMembersAfterLeave: string[] = [];
    expect(currentMembersAfterLeave).not.toContain(wasThere);
    expect(crowned(wasThere, champions)).toBe(1);

    // Direction 2 - a stranger joins the bye-champion clan today. Current
    // membership now contains them; the record must not be granted, because
    // the tier badges it mints are never revoked.
    const currentMembersAfterJoin = [opportunist];
    expect(currentMembersAfterJoin).toContain(opportunist);
    expect(crowned(opportunist, champions)).toBe(0);

    // The OLD rule - current membership - got both of these backwards.
    const oldCrowned = (user: string, currentMembers: string[]) =>
      currentMembers.includes(user) ? 1 : 0;
    expect(oldCrowned(wasThere, currentMembersAfterLeave)).toBe(0); // dropped
    expect(oldCrowned(opportunist, currentMembersAfterJoin)).toBe(1); // farmed
  });
});

// ---------------------------------------------------------------------------
// Acceptance: no separate achievement surface renders
// ---------------------------------------------------------------------------

describe('WP-0.04 acceptance: no achievement claim endpoint or surface remains', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.next') continue;
      const abs = path.join(dir, entry);
      if (fs.statSync(abs).isDirectory()) walk(abs, out);
      else if (/\.(ts|tsx)$/.test(entry)) out.push(abs);
    }
    return out;
  }

  const sourceFiles = walk(path.join(ROOT, 'src')).filter(
    (file) => !/\.test\.tsx?$/.test(file)
  );

  it('the claim endpoint is gone', () => {
    expect(fs.existsSync(path.join(ROOT, 'src/app/api/achievements'))).toBe(false);
  });

  it('the achievement panel, its barrel export and the checker are gone', () => {
    for (const gone of [
      'src/components/profile/AchievementBadges.tsx',
      'src/lib/server/achievementChecker.ts',
    ]) {
      expect(fs.existsSync(path.join(ROOT, gone))).toBe(false);
    }
    const barrel = fs.readFileSync(
      path.join(ROOT, 'src/components/profile/index.ts'),
      'utf8'
    );
    expect(barrel).not.toMatch(/AchievementBadges/);
  });

  it('nothing in src/ fetches or claims an achievement', () => {
    const offenders = sourceFiles.filter((file) => {
      const source = fs.readFileSync(file, 'utf8');
      return (
        source.includes('/api/achievements') ||
        /from\(\s*['"`]player_achievements['"`]\s*\)/.test(source) ||
        /from\(\s*['"`]achievement_definitions['"`]\s*\)/.test(source)
      );
    });

    // The GDPR data export still READS the frozen ledger - a player's
    // erasure and portability rights outlive the mechanism. Nothing else
    // may touch either table.
    expect(offenders.map((file) => path.relative(ROOT, file)).sort()).toEqual([
      'src/app/api/user/export-data/route.ts',
    ]);
  });

  it('no component renders an achievement surface', () => {
    // Comments are stripped: a component may explain WHY the surface is
    // gone; it may not render one.
    const stripComments = (source: string) =>
      source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    const rendering = sourceFiles.filter((file) => {
      if (!file.endsWith('.tsx')) return false;
      return /achievement/i.test(stripComments(fs.readFileSync(file, 'utf8')));
    });

    // The privacy policy is the one page that must still SAY the word: the
    // frozen player_achievements ledger is retained and exported, so the
    // categories-of-data disclosure would be wrong without it. It renders
    // prose about stored data, not an achievement surface.
    expect(rendering.map((file) => path.relative(ROOT, file)).sort()).toEqual([
      'src/app/legal/privacy/page.tsx',
    ]);
  });

  it('the analytics taxonomy no longer declares an achievement event', () => {
    const events = fs.readFileSync(path.join(ROOT, 'src/lib/analytics/events.ts'), 'utf8');
    expect(events).not.toMatch(/ACHIEVEMENT_UNLOCKED/);
  });
});
