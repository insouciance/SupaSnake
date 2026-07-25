/**
 * WP-0.03 — the faucet and dead-configuration purge, asserted as a rule.
 *
 * Authority: docs/PRODUCT_CONSTITUTION.md §4 (Rules 5, 6, 8, 11), §8.5 (one
 * currency), §12.2 (one daily surface, one claim); GROUND_TRUTH §9.7, §9.8
 * and the §10 dead-configuration table.
 *
 * Two things are tested here, and the distinction is the point:
 *
 *   1. UNREACHABILITY. An endpoint that is merely unlinked from the UI is
 *      still an endpoint - GROUND_TRUTH §9.8's whole complaint about
 *      /api/daily-rewards was that it had zero UI callers and answered
 *      anyone holding a token anyway. So these tests do not check that
 *      nothing links to it; they check that no route module exists to
 *      serve it and no RPC name survives for it to call.
 *
 *   2. DEAD CONFIGURATION. Every row of the GROUND_TRUTH §10 table gets an
 *      assertion, so the whole table stays purged. Dead config is not
 *      harmless: each entry reads as a fact to the next person or agent
 *      who opens the file.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const SRC = path.join(ROOT, 'src');
const API = path.join(SRC, 'app/api');
const MIGRATIONS = path.join(ROOT, 'supabase/migrations');

/** Every file under a directory, recursively. */
function walk(dir: string, filter: (f: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      out.push(...walk(full, filter));
    } else if (filter(full)) {
      out.push(full);
    }
  }
  return out;
}

const srcFiles = walk(SRC, (f) => /\.(ts|tsx)$/.test(f));
/**
 * Shipped modules only. A test file may name a dropped RPC precisely in
 * order to assert that nothing else does; what must be clean is the code
 * that can answer a request.
 */
const shippedFiles = srcFiles.filter((f) => !/\.test\.tsx?$/.test(f));
const sqlFiles = walk(MIGRATIONS, (f) => f.endsWith('.sql'));

/** Source with block/line comments stripped - prose may name what code may not. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** The executable half of a shipped module. */
function liveCode(file: string): string {
  return stripComments(fs.readFileSync(file, 'utf8'));
}

/**
 * The migration files that DEFINE the current schema, i.e. everything the
 * purge migration has not yet superseded. A dropped object legitimately
 * still appears in the historical migration that created it and in the one
 * that removed it; what must not exist is a LIVE definition.
 */
const PURGE_MIGRATION = path.join(
  MIGRATIONS,
  '044_faucet_and_dead_config_purge.sql'
);
const purgeSql = fs.readFileSync(PURGE_MIGRATION, 'utf8');

describe('WP-0.03: no unreachable faucet responds', () => {
  it('has no /api/daily-rewards route module at all', () => {
    // Not "nothing links to it" - there is nothing to link to. Next.js
    // serves a path because a route.ts exists at it; the absence of the
    // directory is the absence of the endpoint.
    expect(fs.existsSync(path.join(API, 'daily-rewards'))).toBe(false);

    const routeModules = walk(API, (f) => /[\\/]route\.tsx?$/.test(f));
    const daily = routeModules.filter((f) => /daily-rewards/.test(f));
    expect(daily).toEqual([]);
    // Sanity: the walk found real routes, so an empty result means
    // "deleted", not "looked in the wrong place".
    expect(routeModules.length).toBeGreaterThan(20);
  });

  it('calls claim_daily_reward from no shipped module', () => {
    // The RPC is the faucet; the route was only its handle. If no module
    // calls it, no request path can reach it even by accident. Comments are
    // stripped first: the code that replaced these faucets is entitled to
    // say what it replaced, and must be, or the removal is unexplained.
    for (const f of shippedFiles) {
      expect(liveCode(f)).not.toMatch(/claim_daily_reward/);
    }
  });

  it('calls claim_clan_energy_bonus from no shipped module (F-14)', () => {
    for (const f of shippedFiles) {
      expect(liveCode(f)).not.toMatch(/claim_clan_energy_bonus/);
    }
  });

  it('drops both faucet RPCs in the purge migration', () => {
    expect(purgeSql).toMatch(/DROP FUNCTION IF EXISTS claim_daily_reward\(UUID\);/);
    expect(purgeSql).toMatch(
      /DROP FUNCTION IF EXISTS claim_clan_energy_bonus\(UUID\);/
    );
  });

  it('leaves no SQL definition of either faucet after the purge', () => {
    // A later migration re-creating one of these would defeat the drop.
    // Migration order is filename order, so only files sorted AFTER 044 can
    // resurrect it.
    const later = sqlFiles
      .map((f) => path.basename(f))
      .filter((f) => f > '044_faucet_and_dead_config_purge.sql');
    for (const name of later) {
      const src = fs.readFileSync(path.join(MIGRATIONS, name), 'utf8');
      expect(src).not.toMatch(/FUNCTION\s+claim_daily_reward/);
      expect(src).not.toMatch(/FUNCTION\s+claim_clan_energy_bonus/);
    }
  });

  it('exposes no second claim endpoint anywhere (§12.2)', () => {
    // The Daily Take's collect (WP-1.04) is to be the game's only claim.
    // Until it exists, the count of claim-shaped route directories that
    // grant a currency must not grow. Contracts and the season track are
    // the two pre-Constitution claims still standing, and both are retired
    // by WP-1.03/WP-1.04; nothing new may join them.
    const routeDirs = walk(API, (f) => /[\\/]route\.tsx?$/.test(f)).map((f) =>
      path.relative(API, path.dirname(f))
    );
    const claimish = routeDirs
      .filter((d) => /reward|claim|bonus|stipend/i.test(d))
      .sort();
    // FOUND, NOT FIXED (outside this WP): /api/player/claim-offline still
    // grants passive DNA on a wall-clock timer. WP-0.01 stripped its energy
    // restore but left the DNA faucet standing, and no work package owns it
    // yet. It is pinned here rather than waved through: this list may only
    // ever shrink, so nothing new can join it while it waits for a decision.
    expect(claimish).toEqual(['player/claim-offline']);
  });
});

describe('WP-0.03: the GROUND_TRUTH §10 dead-configuration table stays purged', () => {
  // One assertion per row of the table, in the table's order. The comment
  // on each names the row so a future reader can find it.

  const gameConfig = fs.readFileSync(
    path.join(SRC, 'shared/config/game.ts'),
    'utf8'
  );
  const engagementConfig = fs.readFileSync(
    path.join(SRC, 'shared/config/engagement.ts'),
    'utf8'
  );
  const clanTypes = fs.readFileSync(path.join(SRC, 'lib/clan/types.ts'), 'utf8');

  it('row 1: economy.dna.firstWinBonus is gone from game.ts', () => {
    expect(stripComments(gameConfig)).not.toMatch(/firstWinBonus/);
  });

  it('row 2: economy.dna.scoreMultiplier is gone from game.ts', () => {
    // The identically named `scoreMultiplier` in rulesets.ts is the dynasty
    // score curve and is unrelated - it is not touched, and this assertion
    // is deliberately scoped to game.ts only.
    expect(stripComments(gameConfig)).not.toMatch(/scoreMultiplier/);
    const rulesets = fs.readFileSync(
      path.join(SRC, 'shared/game/rulesets.ts'),
      'utf8'
    );
    expect(rulesets).toMatch(/scoreMultiplier/);
  });

  it('row 3: breeding.baseCost / crossDynastyCost are gone from game.ts', () => {
    expect(stripComments(gameConfig)).not.toMatch(/baseCost/);
    expect(stripComments(gameConfig)).not.toMatch(/crossDynastyCost/);
  });

  it('row 4: contracts.comboContractsEnabled is gone from engagement.ts', () => {
    expect(stripComments(engagementConfig)).not.toMatch(/comboContractsEnabled/);
  });

  it('row 5: the entire battlePass block is gone from engagement.ts', () => {
    const live = stripComments(engagementConfig);
    expect(live).not.toMatch(/battlePass/);
    expect(live).not.toMatch(/levelsPerSeason/);
    expect(live).not.toMatch(/premiumPriceUsd/);
    expect(live).not.toMatch(/xpSources/);
  });

  it('row 5b: the dailyRewards block went with the calendar', () => {
    // Not a numbered row of the table, but the same defect: it configured
    // the 28-day cycle this work package deleted.
    expect(stripComments(engagementConfig)).not.toMatch(/dailyRewards/);
  });

  it('row 6: the daily_logins table is dropped', () => {
    expect(purgeSql).toMatch(/DROP TABLE IF EXISTS daily_logins;/);
    for (const f of shippedFiles) {
      expect(liveCode(f)).not.toMatch(/daily_logins/);
    }
  });

  it('row 7: inactive contract definitions are deleted', () => {
    expect(purgeSql).toMatch(/DELETE FROM contract_definitions cd WHERE cd\.id = ANY\(v_deletable\);/);
    // ...and only ones no player row points at, so history survives.
    expect(purgeSql).toMatch(
      /NOT EXISTS \(\s*\n\s*SELECT 1 FROM player_contracts pc WHERE pc\.contract_id = cd\.id\s*\n\s*\)/
    );
  });

  it('row 8: contract reward_energy is gone from column, RPC and API', () => {
    expect(purgeSql).toMatch(
      /ALTER TABLE contract_definitions DROP COLUMN IF EXISTS reward_energy;/
    );
    const contractsDir = path.join(API, 'contracts');
    for (const f of walk(contractsDir, (x) => /\.tsx?$/.test(x))) {
      expect(stripComments(fs.readFileSync(f, 'utf8'))).not.toMatch(
        /reward_energy|rewardEnergy|energy_granted|energyGranted/
      );
    }
  });

  it('row 9: battle_pass_tiers can no longer pay dna or energy', () => {
    expect(purgeSql).toMatch(
      /CHECK \(reward_type IN \('variant', 'cosmetic', 'title', 'reroll_token'\)\)/
    );
  });

  it('row 10: the streak-tier docstring is gone with dnaMultipliers.ts', () => {
    // WP-0.02 deleted the module the drifted docstring lived in; this
    // asserts it did not come back with the numbers still wrong.
    expect(fs.existsSync(path.join(SRC, 'lib/progression/dnaMultipliers.ts'))).toBe(
      false
    );
    for (const f of shippedFiles) {
      expect(liveCode(f)).not.toMatch(/dnaMultipliers/);
    }
  });

  it('row 11: CLAN_LIMITS.minMembers is gone', () => {
    expect(stripComments(clanTypes)).not.toMatch(/minMembers/);
    for (const f of shippedFiles) {
      expect(fs.readFileSync(f, 'utf8')).not.toMatch(/CLAN_LIMITS\.minMembers/);
    }
  });

  it('bonus row: the clan energy bonus config and its dead button are gone', () => {
    // GROUND_TRUTH §9.7: a styled <button className="btn-go">Claim</button>
    // with no onClick, next to a promise nothing could keep.
    expect(stripComments(clanTypes)).not.toMatch(/CLAN_BONUS_CONFIG/);
    expect(stripComments(clanTypes)).not.toMatch(/canClaimClanBonus/);

    const clanPage = fs.readFileSync(path.join(SRC, 'app/clan/page.tsx'), 'utf8');
    const live = stripComments(clanPage);
    expect(live).not.toMatch(/CLAN_BONUS_CONFIG/);
    expect(live).not.toMatch(/energyBonusAmount/);
    expect(live).not.toMatch(/Clan Energy Bonus/);
    // No button on this page renders a label of "Claim" any more.
    expect(live).not.toMatch(/>\s*Claim\s*</);
  });

  it('bonus row: the stale game.ts.template copy of all of it is gone', () => {
    // An unreferenced `.template` sibling of game.ts carried its own,
    // even staler, copy of firstWinBonus / scoreMultiplier / baseCost /
    // crossDynastyCost. Deleting only the live file would have left the
    // dead numbers one directory listing away.
    expect(fs.existsSync(path.join(SRC, 'shared/config/game.ts.template'))).toBe(
      false
    );
  });
});

describe('WP-0.03: the bootstrap response stops lying (F-16)', () => {
  it('no longer returns energy or maxEnergy from bootstrap_player', () => {
    // The TypeScript type stopped declaring them at WP-0.01; the RPC kept
    // sending them, so the response shape was a lie in the other direction.
    const bootstrapFn = purgeSql.slice(
      purgeSql.indexOf('CREATE OR REPLACE FUNCTION bootstrap_player'),
      purgeSql.indexOf('CREATE OR REPLACE FUNCTION handle_new_user')
    );
    expect(bootstrapFn.length).toBeGreaterThan(1000);
    expect(bootstrapFn).not.toMatch(/'energy',\s*v_player\.energy/);
    expect(bootstrapFn).not.toMatch(/'maxEnergy'/);
    expect(bootstrapFn).toMatch(/INSERT INTO players \(user_id, dna\)/);
  });

  it('declares no energy field on the FTUE bootstrap response type', () => {
    const types = fs.readFileSync(path.join(SRC, 'lib/ftue/types.ts'), 'utf8');
    expect(stripComments(types)).not.toMatch(/maxEnergy/);
  });

  it('stops seeding the retired stock at signup', () => {
    const start = purgeSql.indexOf('CREATE OR REPLACE FUNCTION handle_new_user');
    const signup = purgeSql.slice(
      start,
      purgeSql.indexOf('$$ LANGUAGE plpgsql SECURITY DEFINER;', start)
    );
    expect(signup).toMatch(/INSERT INTO public\.players \(user_id, dna\)/);
    expect(signup).not.toMatch(/energy/);
  });
});
