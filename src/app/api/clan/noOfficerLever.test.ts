/**
 * NO OFFICER LEVER EXISTS — the structural proof (Rule 8, §9.2; WP-1.02's
 * headline acceptance criterion).
 *
 * Rule 8's third reviewer question is "does any UI give an officer a
 * mechanical reason to evaluate a member?" A behavioural test can only show
 * that today's code does not do it. This file makes the STRUCTURAL claim the
 * acceptance criterion asks for: there is no endpoint, no column, and no UI
 * affordance through which it could be done, so it cannot be reintroduced by
 * a patch that happens to slip past a reviewer.
 *
 * Four claims, each read out of the tree rather than asserted:
 *
 *   1. NO RANK. `ClanRole` is exactly `owner | member`, migration 048 narrows
 *      the CHECK constraint to match, and `set_clan_member_role` is dropped.
 *   2. NO ENDPOINT. No route accepts a `set_role` action or calls the role
 *      RPC, and no clan route names a member metric in a request field.
 *   3. NO COLUMN. `weekly_contribution` and `total_contribution` are dropped
 *      from `clan_members`; `weekly_score` and `total_score` from `clans`.
 *      No source file reads any of the four.
 *   4. NO AFFORDANCE. No clan component renders a promote/demote control, an
 *      officer-only console, or a per-member contribution figure.
 *
 * The scan is deliberately over the whole `src/` tree and the migration, not
 * over the files this work package happened to touch.
 */

import { describe, expect, it } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const SRC = join(REPO_ROOT, 'src');
const MIGRATION = join(REPO_ROOT, 'supabase', 'migrations', '048_clan_rework.sql');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(abs);
  }
  return out;
}

/** Blank out comments so prose about the absence of a thing is not the thing. */
function codeOf(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

const SOURCE_FILES = walk(SRC).filter((path) => !/\.test\.tsx?$/.test(path));
const MIGRATION_SQL = readFileSync(MIGRATION, 'utf8');
const MIGRATION_CODE = MIGRATION_SQL.replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

describe('1. no rank', () => {
  it('leaves exactly two roles in the type', () => {
    const types = readFileSync(join(SRC, 'lib', 'clan', 'types.ts'), 'utf8');
    expect(types).toMatch(/export type ClanRole = 'owner' \| 'member';/);
  });

  it('narrows the CHECK constraint to owner|member and converts existing officers', () => {
    expect(MIGRATION_CODE).toMatch(
      /ADD CONSTRAINT valid_clan_role\s*\n?\s*CHECK \(role IN \('owner', 'member'\)\)/
    );
    expect(MIGRATION_CODE).toMatch(
      /UPDATE clan_members SET role = 'member' WHERE role = 'officer'/
    );
  });

  it('drops the lever itself', () => {
    expect(MIGRATION_CODE).toMatch(/DROP FUNCTION IF EXISTS set_clan_member_role\(/);
  });

  it('leaves no live SQL that grants or honours the officer role', () => {
    // Migration 048 rewrites the two RLS policies that named it. The string
    // may appear exactly once — in the WHERE clause that converts the last
    // officers into members — and nowhere that would create or privilege one.
    expect(MIGRATION_CODE).not.toMatch(/SET\s+role\s*=\s*'officer'/i);
    expect(MIGRATION_CODE).not.toMatch(/IN\s*\('owner',\s*'officer'\)/i);
    expect(MIGRATION_CODE).not.toMatch(/VALUES\s*\([^)]*'officer'/i);
    const mentions = MIGRATION_CODE.match(/'officer'/g) ?? [];
    expect(mentions).toHaveLength(1);
  });
});

describe('2. no endpoint', () => {
  it('has no route that accepts a set_role action or calls the role RPC', () => {
    const offenders = SOURCE_FILES.filter((path) => {
      const code = codeOf(path);
      return (
        /['"`]set_clan_member_role['"`]/.test(code) ||
        /case\s+['"`]set_role['"`]/.test(code) ||
        /action:\s*['"`]set_role['"`]/.test(code)
      );
    });
    expect(offenders).toEqual([]);
  });

  it('has no route that recruits by handle — invite links are the only surface', () => {
    const offenders = SOURCE_FILES.filter((path) => /case\s+['"`]invite['"`]/.test(codeOf(path)));
    expect(offenders).toEqual([]);
  });

  it('names no member metric in any clan route request field', () => {
    const clanRoutes = SOURCE_FILES.filter((path) => /api[\\/]clan[\\/].*route\.ts$/.test(path));
    expect(clanRoutes.length).toBeGreaterThan(0);
    for (const path of clanRoutes) {
      const code = codeOf(path);
      expect(code).not.toMatch(/minDepth|min_depth|minContribution|min_contribution/i);
      expect(code).not.toMatch(/weekly_contribution|total_contribution/);
    }
  });
});

describe('3. no column', () => {
  it('drops the graded-contribution pair and the clan score pair', () => {
    expect(MIGRATION_CODE).toMatch(/ALTER TABLE clan_members[\s\S]{0,200}DROP COLUMN IF EXISTS weekly_contribution/);
    expect(MIGRATION_CODE).toMatch(/DROP COLUMN IF EXISTS total_contribution/);
    expect(MIGRATION_CODE).toMatch(/ALTER TABLE clans[\s\S]{0,200}DROP COLUMN IF EXISTS weekly_score/);
    expect(MIGRATION_CODE).toMatch(/DROP COLUMN IF EXISTS total_score/);
  });

  it('drops the functions and the index that fed them', () => {
    expect(MIGRATION_CODE).toMatch(/DROP FUNCTION IF EXISTS add_clan_contribution\(/);
    expect(MIGRATION_CODE).toMatch(/DROP FUNCTION IF EXISTS reset_weekly_clan_scores\(/);
    // A per-clan leaderboard of your own clanmates, waiting for a query.
    expect(MIGRATION_CODE).toMatch(/DROP INDEX IF EXISTS idx_clan_members_contribution/);
  });

  it('leaves no source file reading any of the four', () => {
    const offenders = SOURCE_FILES.filter((path) =>
      /weekly_contribution|total_contribution|weeklyContribution|totalContribution/.test(
        codeOf(path)
      )
    );
    expect(offenders).toEqual([]);
  });
});

describe('4. no affordance', () => {
  /**
   * The LIVE clan surfaces. `GauntletPanel`, `DuelPanel` and `PlayoffBracket`
   * are excluded deliberately and checked separately below: they belong to the
   * population-gated layers (§12.1 slot 7), which ship HIDDEN rather than
   * deleted, and the clan page does not render them at all until their flags
   * are on. Their own notion of an officer therefore reaches no player, and
   * the SQL behind it can no longer match anybody — after migration 048 the
   * role does not exist to be held.
   */
  const CLAN_COMPONENTS = walk(join(SRC, 'components', 'clan'))
    .concat(walk(join(SRC, 'app', 'clan')))
    .filter((path) => !/\.test\.tsx?$/.test(path))
    .filter((path) => !/(GauntletPanel|DuelPanel|PlayoffBracket)\.tsx$/.test(path));

  it('renders no promote or demote control', () => {
    for (const path of CLAN_COMPONENTS) {
      const code = codeOf(path);
      expect(code).not.toMatch(/>\s*Promote\s*</);
      expect(code).not.toMatch(/>\s*Demote\s*</);
    }
  });

  it('renders no officer-only console and no officer chip', () => {
    for (const path of CLAN_COMPONENTS) {
      const code = codeOf(path);
      expect(code).not.toMatch(/isOfficer/);
      expect(code).not.toMatch(/role === 'officer'/);
      expect(code).not.toMatch(/officer:/);
    }
  });

  it('renders no per-member contribution figure on the roster', () => {
    const roster = codeOf(join(SRC, 'components', 'clan', 'ClanRoster.tsx'));
    expect(roster).not.toMatch(/Contribution/i);
    expect(roster).not.toMatch(/DNA/);
  });

  it('shows the invite link to every member, not only to a rank', () => {
    const roster = readFileSync(join(SRC, 'components', 'clan', 'ClanRoster.tsx'), 'utf8');
    // The block is guarded by the code existing, never by the caller's role.
    expect(roster).toMatch(/\{invite\?\.code && \(/);
  });
});

describe('5. the gated layers are hidden, not deleted (§9.3, §12.1 slot 7)', () => {
  const page = codeOf(join(SRC, 'app', 'clan', 'page.tsx'));

  it('renders the Gauntlet and duel panels only behind CLAN_GAUNTLET_ENABLED', () => {
    expect(page).toMatch(/\{CLAN_GAUNTLET_ENABLED && \(/);
    expect(page).toMatch(/<DuelPanel/);
    expect(page).toMatch(/<GauntletPanel/);
  });

  it('renders the playoff bracket only behind CLAN_PLAYOFFS_ENABLED', () => {
    expect(page).toMatch(/\{CLAN_PLAYOFFS_ENABLED && \(/);
  });

  it('defaults both flags off', () => {
    const config = readFileSync(join(SRC, 'lib', 'clan', 'config.ts'), 'utf8');
    expect(config).toMatch(
      /CLAN_GAUNTLET_ENABLED = process\.env\.NEXT_PUBLIC_CLAN_GAUNTLET === 'true'/
    );
    expect(config).toMatch(
      /CLAN_PLAYOFFS_ENABLED = process\.env\.NEXT_PUBLIC_CLAN_PLAYOFFS === 'true'/
    );
  });

  it('drops no gated-layer table, and asserts their rows survive', () => {
    for (const table of [
      'clan_duels',
      'gauntlet_picks',
      'clan_research',
      'clan_tithes',
      'clan_research_progress',
    ]) {
      expect(MIGRATION_CODE).not.toMatch(new RegExp(`DROP TABLE[^;]*${table}`, 'i'));
      expect(MIGRATION_CODE).not.toMatch(new RegExp(`DELETE FROM ${table}`, 'i'));
    }
    // And the tripwire proves it rather than promising it.
    expect(MIGRATION_CODE).toMatch(/clan_pre_migration_duels/);
    expect(MIGRATION_SQL).toMatch(/hiding a layer must not delete its state/);
  });
});

describe('and nothing in this migration pays a clan (Rule 8, §9.4)', () => {
  it('writes no currency, entitlement or commerce table', () => {
    for (const forbidden of [
      'economy_transactions',
      'players.dna',
      'total_dna_earned',
      'player_cosmetics',
      'entitlement',
      'subscription',
      'stripe',
      'premium',
    ]) {
      expect(MIGRATION_CODE.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
