/**
 * WP-0.03 — shape tests for migration 044 (faucet and dead-config purge).
 *
 * These read the migration as text. They cannot prove it runs; they prove
 * the properties that make it safe to run and that a later edit could
 * quietly remove: it is one transaction, it snapshots before it destroys,
 * it aborts rather than half-apply, it preserves every player-owned row it
 * is not chartered to remove, and it re-grants exactly the privileges that
 * DROP FUNCTION discards.
 *
 * Precedent: 041_multiplier_stack_removal and 042_achievements_to_records
 * are tested the same way, for the same reason.
 */

import fs from 'fs';
import path from 'path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
const FILE = path.join(MIGRATIONS, '044_faucet_and_dead_config_purge.sql');
const sql = fs.readFileSync(FILE, 'utf8');

describe('migration 044: transactional shape', () => {
  it('is a single transaction', () => {
    expect(sql).toMatch(/^BEGIN;$/m);
    expect(sql.trimEnd().endsWith('COMMIT;')).toBe(true);
    // Exactly one of each: a nested COMMIT would let half the purge stand.
    expect(sql.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(sql.match(/^COMMIT;$/gm)).toHaveLength(1);
  });

  it('carries the not-applied banner and a down-note', () => {
    expect(sql).toMatch(/NOT APPLIED TO ANY DATABASE BY THIS WORK PACKAGE/);
    expect(sql).toMatch(/DOWN-NOTE \(forward-only/);
    // The down-note must name a source for every dropped object, or the
    // revert is a guess.
    expect(sql).toMatch(/claim_daily_reward` from 009/);
    expect(sql).toMatch(/claim_clan_energy_bonus` from 007/);
    expect(sql).toMatch(/bootstrap_player` from 037/);
    expect(sql).toMatch(/handle_new_user`\s*\n--\s*from 001/);
  });

  it('audits every SECURITY DEFINER function it touches', () => {
    expect(sql).toMatch(/SECURITY DEFINER AUDIT/);
    // Each re-created definer function must appear in the audit section.
    const audit = sql.slice(
      sql.indexOf('SECURITY DEFINER AUDIT'),
      sql.indexOf('DOWN-NOTE')
    );
    for (const fn of [
      'offer_daily_contracts',
      'pick_contracts',
      'claim_contract',
      'claim_season_tier',
      'bootstrap_player',
      'handle_new_user',
    ]) {
      expect(audit).toContain(fn);
    }
  });

  it('takes a pre-write snapshot before it destroys anything', () => {
    const snapshot = sql.indexOf('CREATE TEMP TABLE wp_0_03_player_pre');
    const firstDrop = sql.indexOf('DROP FUNCTION IF EXISTS claim_daily_reward');
    expect(snapshot).toBeGreaterThan(-1);
    expect(firstDrop).toBeGreaterThan(snapshot);
    expect(sql).toMatch(/CREATE TEMP TABLE wp_0_03_counts_pre ON COMMIT DROP/);
  });

  it('aborts rather than half-apply', () => {
    // Every guard is a RAISE EXCEPTION inside the one transaction, so a
    // failure ends with the old world intact.
    const raises = sql.match(/RAISE EXCEPTION\s*\n?\s*'WP-0\.03 aborted/g) ?? [];
    expect(raises.length).toBeGreaterThanOrEqual(8);
  });
});

describe('migration 044: what it removes', () => {
  it('drops the 28-day calendar whole', () => {
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS claim_daily_reward\(UUID\);/);
    expect(sql).toMatch(/DROP TABLE IF EXISTS daily_logins;/);
    expect(sql).toMatch(/DROP TABLE IF EXISTS daily_reward_tiers;/);
  });

  it('drops the function before the tables it writes', () => {
    // The other order leaves a window in which the RPC exists and its
    // tables do not.
    expect(sql.indexOf('DROP FUNCTION IF EXISTS claim_daily_reward')).toBeLessThan(
      sql.indexOf('DROP TABLE IF EXISTS daily_logins')
    );
  });

  it('drops the orphan clan faucet (F-14)', () => {
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS claim_clan_energy_bonus\(UUID\);/);
  });

  it('removes the contract energy purse from column and RPCs', () => {
    expect(sql).toMatch(
      /ALTER TABLE contract_definitions DROP COLUMN IF EXISTS reward_energy;/
    );
    // The three RPCs whose signatures change are DROPped, not REPLACEd -
    // CREATE OR REPLACE cannot change a return type.
    for (const fn of [
      'offer_daily_contracts(UUID)',
      'pick_contracts(UUID, TEXT[])',
      'claim_contract(UUID, TEXT)',
    ]) {
      const escaped = fn.replace(/[()[\]]/g, '\\$&');
      expect(sql).toMatch(new RegExp(`DROP FUNCTION IF EXISTS ${escaped};`));
    }
    // ...and none of the re-created bodies mentions the dropped column.
    // Comments stripped: the section's prose names what it removed, which
    // is exactly what the executable statements must not name.
    const rpcSection = sql
      .slice(
        sql.indexOf('DROP FUNCTION IF EXISTS offer_daily_contracts(UUID);'),
        sql.indexOf('-- 7. Season tiers')
      )
      .replace(/^\s*--.*$/gm, '');
    expect(rpcSection).not.toMatch(/reward_energy|v_energy_grant/);
  });

  it('re-grants the privileges DROP FUNCTION discards', () => {
    // DROP+CREATE loses every GRANT. Each of the three RPCs must be
    // re-locked to service_role, or a dropped-and-recreated function
    // silently becomes PUBLIC-executable under the default grant.
    for (const fn of [
      'offer_daily_contracts\\(UUID\\)',
      'pick_contracts\\(UUID, TEXT\\[\\]\\)',
      'claim_contract\\(UUID, TEXT\\)',
    ]) {
      expect(sql).toMatch(
        new RegExp(`REVOKE EXECUTE ON FUNCTION ${fn} FROM PUBLIC, anon, authenticated;`)
      );
      expect(sql).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION ${fn} TO service_role;`)
      );
    }
  });

  it('narrows the season tier reward types to identity and continuity', () => {
    expect(sql).toMatch(
      /CHECK \(reward_type IN \('variant', 'cosmetic', 'title', 'reroll_token'\)\)/
    );
    // The two dead grant branches leave claim_season_tier with them.
    const seasonFn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION claim_season_tier'),
      sql.indexOf('-- 8. The bootstrap response')
    );
    expect(seasonFn.length).toBeGreaterThan(1000);
    expect(seasonFn).not.toMatch(/v_tier\.reward_type = 'dna'/);
    expect(seasonFn).not.toMatch(/v_tier\.reward_type = 'energy'/);
    expect(seasonFn).not.toMatch(/UPDATE players SET energy/);
    // What survives: the token grant, the cosmetic/title inventory grant,
    // and the idempotency record.
    expect(seasonFn).toMatch(/v_tier\.reward_type = 'reroll_token'/);
    expect(seasonFn).toMatch(/INSERT INTO player_cosmetics/);
    expect(seasonFn).toMatch(/INSERT INTO player_battle_pass_claims/);
  });

  it('creates no new claim RPC (§12.2)', () => {
    // The Daily Take's collect (WP-1.04) is to be the game's only claim.
    const created = sql.match(/CREATE (?:OR REPLACE )?FUNCTION (\w+)/g) ?? [];
    const names = created.map((m) => m.replace(/.*FUNCTION /, ''));
    expect(names.sort()).toEqual([
      'bootstrap_player',
      'claim_contract',
      'claim_season_tier',
      'handle_new_user',
      'offer_daily_contracts',
      'pick_contracts',
    ]);
    // Every one of those already existed; nothing here is new.
  });
});

describe('migration 044: what it preserves (Rules 5 and 6)', () => {
  it('keeps the retired energy columns rather than dropping them', () => {
    expect(sql).not.toMatch(/DROP COLUMN IF EXISTS energy\b/);
    expect(sql).not.toMatch(/DROP COLUMN IF EXISTS max_energy/);
    expect(sql).not.toMatch(/DROP COLUMN IF EXISTS energy_regen_at/);
    // And says so, as FROZEN rather than DEPRECATED - the difference is a
    // decision versus an invitation.
    expect(sql).toMatch(/COMMENT ON COLUMN players\.energy IS\s*\n\s*'FROZEN as of migration 044/);
    expect(sql).toMatch(/COMMENT ON COLUMN players\.max_energy IS/);
    expect(sql).toMatch(/COMMENT ON COLUMN players\.energy_regen_at IS/);
  });

  it('keeps every player-owned table it is not chartered to remove', () => {
    const dropped = (sql.match(/DROP TABLE IF EXISTS (\w+)/g) ?? []).map((m) =>
      m.replace('DROP TABLE IF EXISTS ', '')
    );
    expect(dropped.sort()).toEqual(['daily_logins', 'daily_reward_tiers']);
    // player_daily_state and clan_members.last_clan_bonus_at survive with a
    // comment that says why.
    expect(sql).toMatch(/COMMENT ON TABLE player_daily_state IS\s*\n\s*'FROZEN/);
    expect(sql).toMatch(
      /COMMENT ON COLUMN clan_members\.last_clan_bonus_at IS\s*\n\s*'FROZEN/
    );
  });

  it('backfills a receipt before dropping the only other record of a grant', () => {
    // daily_logins is the one player-scoped table dropped. It may only go
    // because economy_transactions holds the same event - so the migration
    // proves that first, and writes the missing receipt if it does not.
    const backfill = sql.indexOf('INSERT INTO economy_transactions');
    const drop = sql.indexOf('DROP TABLE IF EXISTS daily_logins');
    expect(backfill).toBeGreaterThan(-1);
    expect(drop).toBeGreaterThan(backfill);
    expect(sql).toMatch(
      /still have no economy_transactions receipt — refusing to drop daily_logins/
    );
    // A reconstructed balance is labelled as one rather than passed off.
    expect(sql).toMatch(/'reconstructed', true/);
  });

  it('asserts no player DNA moved', () => {
    expect(sql).toMatch(/had DNA written by a purge \(Rule 6\)/);
    expect(sql).toMatch(/p\.dna <> pre\.dna_before/);
    expect(sql).toMatch(/p\.total_dna_earned <> pre\.total_dna_earned_before/);
  });

  it('asserts the frozen energy stock was not written', () => {
    expect(sql).toMatch(/had the retired energy stock written/);
    expect(sql).toMatch(/p\.energy IS DISTINCT FROM pre\.energy_before/);
  });

  it('asserts contract and season claim history survived intact', () => {
    expect(sql).toMatch(/contract history was destroyed \(Rule 6\)/);
    expect(sql).toMatch(/player_battle_pass_claims went from % to % rows/);
    expect(sql).toMatch(/no longer resolve to a definition/);
  });

  it('asserts the audit only grew, and only by the backfill', () => {
    expect(sql).toMatch(/the audit was modified/);
    expect(sql).toMatch(/v_pre\.economy_rows \+ v_backfilled/);
  });

  it('refuses to delete an inactive contract a player row still points at', () => {
    expect(sql).toMatch(/Retained % inactive definition\(s\) referenced by player history/);
  });

  it('refuses to treat a live purse as dead config', () => {
    // If any contract or season tier ACTUALLY pays energy or DNA, this is
    // not a dead-config purge and the migration stops for a human.
    expect(sql).toMatch(/carry a non-zero reward_energy — a live purse, not dead config/);
    expect(sql).toMatch(/actually pay dna\/energy — that is a live faucet, not dead config/);
  });
});
