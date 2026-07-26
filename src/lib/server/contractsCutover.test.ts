/**
 * WP-1.03 contracts cutover — Constitution §7.2 (the Signal replaces
 * Contracts), §12.2 (exactly ONE daily ritual surface), §13 (the kill list)
 * and Rule 6 (earned things are permanent).
 *
 * Two claims have to hold at once, and they pull in opposite directions:
 *
 *   UNREACHABLE — after the cutover nothing can offer, pick, progress or
 *     claim a contract. Not the client, not the API layer, not the API
 *     layer's own database role.
 *   INTACT — every row a player earned is still there. Retiring a mechanism
 *     is not erasing what someone did with it, and a claimed contract paid
 *     real DNA whose receipt still sits in `economy_transactions`.
 *
 * The second is the one that can be broken silently, so it is asserted
 * against the migration text directly rather than inferred from the first.
 *
 * These are STATIC tests over the SQL and the source tree. They prove the
 * migration says what it must; they do not prove a database ran it. Migration
 * 049 has deliberately not been applied anywhere (see its header banner), and
 * the runtime half of the proof is the migration's own section-11 tripwire,
 * which aborts the transaction if a contract row moves.
 */

import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const MIGRATION = path.join(ROOT, 'supabase/migrations/049_world_signal.sql');
const sql = fs.readFileSync(MIGRATION, 'utf8');

/** The migration with every `--` comment stripped: naming a thing is not doing it. */
const code = sql.replace(/--[^\n]*/g, '');

const RETIRED_RPCS = [
  'offer_daily_contracts',
  'pick_contracts',
  'claim_contract',
  'refresh_contract_progress',
] as const;

/** Live signatures, copied from the definitions this migration replaces. */
const SIGNATURES: Record<(typeof RETIRED_RPCS)[number], string> = {
  offer_daily_contracts: 'UUID',
  pick_contracts: 'UUID, TEXT\\[\\]',
  claim_contract: 'UUID, TEXT',
  refresh_contract_progress: 'UUID, DATE',
};

// ---------------------------------------------------------------------------
// UNREACHABLE — the RPCs
// ---------------------------------------------------------------------------

describe('the contract RPCs are tombstones, not drops', () => {
  it('redefines each of the four rather than dropping it', () => {
    for (const fn of RETIRED_RPCS) {
      expect(code).toMatch(new RegExp(`CREATE OR REPLACE FUNCTION ${fn}\\(`));
    }
  });

  it('drops no contract function at all', () => {
    // A DROP would leave migration 044's `CREATE FUNCTION offer_daily_contracts`
    // (and 043's `pick_contracts`, 032's `refresh_contract_progress`) standing
    // as the newest DEFINITION of those names in migration history — so a
    // replay, repair or squash could resurrect a working contract RPC with
    // nobody editing a line. A tombstone is the newest definition itself.
    for (const fn of RETIRED_RPCS) {
      expect(code).not.toMatch(new RegExp(`DROP FUNCTION[^;]*${fn}`));
    }
  });

  it('gives every tombstone a body that only raises a named refusal', () => {
    for (const fn of RETIRED_RPCS) {
      const start = code.indexOf(`CREATE OR REPLACE FUNCTION ${fn}(`);
      expect(start).toBeGreaterThan(-1);
      const end = code.indexOf('$$ LANGUAGE plpgsql', start);
      expect(end).toBeGreaterThan(start);
      const body = code.slice(code.indexOf('BEGIN', start), end);

      expect(body).toMatch(/RAISE EXCEPTION/);
      expect(body).toMatch(/CONTRACTS_RETIRED/);
      // Nothing survives that could read, write or pay.
      expect(body).not.toMatch(/\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bSELECT\b/);
      expect(body).not.toMatch(/\bRETURN\b/);
    }
  });

  it('revokes EXECUTE from every role, service_role included', () => {
    // service_role is the one that matters: it is the role the API layer uses,
    // and it is the role a SECURITY DEFINER retirement would otherwise leave
    // holding the keys. §12.2 is only enforced if the server cannot call these
    // either.
    for (const fn of RETIRED_RPCS) {
      const args = SIGNATURES[fn];
      for (const role of ['PUBLIC', 'anon', 'authenticated', 'service_role']) {
        expect(code).toMatch(
          new RegExp(`REVOKE EXECUTE ON FUNCTION ${fn}\\(${args}\\) FROM ${role};`)
        );
      }
    }
  });

  it('grants EXECUTE on a contract function to nobody', () => {
    for (const fn of RETIRED_RPCS) {
      expect(code).not.toMatch(new RegExp(`GRANT[^;]*\\b${fn}\\b`));
    }
  });

  it('adds no replacement claim RPC (§12.2)', () => {
    const created = [...code.matchAll(/CREATE (?:OR REPLACE )?FUNCTION (\w+)\(/g)].map(
      (match) => match[1]
    );
    const claimish = created.filter(
      (name) => /claim/i.test(name) && !RETIRED_RPCS.includes(name as (typeof RETIRED_RPCS)[number])
    );
    expect(claimish).toEqual([]);
    // The Signal's bonus is paid by settlement, never collected by a call.
    expect(created).toEqual(
      expect.arrayContaining([
        'ensure_signal_day',
        'begin_signal_objective_run',
        'settle_signal_objective_run',
      ])
    );
  });

  it('asserts its own result: four tombstones, none executable, each raising', () => {
    // The migration does not trust its own DDL to have landed. Section 11
    // re-checks pg_proc, the ACLs, and the live bodies by calling them.
    expect(code).toMatch(/expected exactly 4 contract tombstones/);
    expect(code).toMatch(/contract function\(s\) are still executable/);
    expect(code).toMatch(/proacl IS NULL/);
    expect(code).toMatch(/aclexplode\(p\.proacl\)/);
    expect(code).toMatch(/pg_get_userbyid\(a\.grantee\) IN \('anon', 'authenticated', 'service_role'\)/);
    expect(code).toMatch(/the live body is not the tombstone/);
    expect(code).toMatch(/RETURNED for a probe player/);
  });
});

// ---------------------------------------------------------------------------
// INTACT — the history (Rule 6)
// ---------------------------------------------------------------------------

describe('claimed contract history survives the cutover', () => {
  it('deletes no player_contracts row: no DELETE, TRUNCATE or DROP anywhere', () => {
    // Whole-file assertions, deliberately. A DELETE aimed at any other table
    // would trip these too, which is the point: this migration has no business
    // removing rows from anything.
    expect(code).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(code).not.toMatch(/\bTRUNCATE\b/i);
    expect(code).not.toMatch(/\bDROP\s+TABLE\b/i);
  });

  it('never writes to a contract table in any form', () => {
    for (const table of ['player_contracts', 'contract_definitions']) {
      expect(code).not.toMatch(new RegExp(`INSERT INTO ${table}`, 'i'));
      expect(code).not.toMatch(new RegExp(`UPDATE ${table}\\b`, 'i'));
      expect(code).not.toMatch(new RegExp(`ALTER TABLE ${table}\\b`, 'i'));
      // Reads are fine and expected — that is how the tripwire counts.
      expect(code).toMatch(new RegExp(`FROM ${table}`));
    }
  });

  it('leaves economy_transactions rows alone — a claim receipt is permanent', () => {
    // 049 adds a source type for the Signal's own bonus; it must not touch a
    // row that already exists, least of all a contract payout.
    expect(code).not.toMatch(/UPDATE economy_transactions/i);
    expect(code).not.toMatch(/DELETE[\s\S]{0,80}economy_transactions/i);
  });

  it('counts contract history before the cutover and aborts if it moved', () => {
    expect(code).toMatch(/CREATE TEMP TABLE signal_pre_migration_contracts/);
    expect(code).toMatch(/SELECT COUNT\(\*\) FROM player_contracts\)\s+AS player_contract_rows/);
    expect(code).toMatch(
      /SELECT COUNT\(\*\) FROM player_contracts WHERE claimed_at IS NOT NULL\)\s+AS claimed_rows/
    );
    expect(code).toMatch(/SELECT COUNT\(\*\) FROM contract_definitions\)\s+AS definition_rows/);

    // Claimed rows get their own check, separate from the total: a migration
    // that deleted a claimed row and inserted an unclaimed one would pass a
    // row count and still have erased something a player earned.
    expect(code).toMatch(/contract history was destroyed \(Rule 6\)/);
    expect(code).toMatch(/a settled claim was erased \(Rule 6\)/);
    expect(code).toMatch(/history would be orphaned \(Rule 6\)/);
  });

  it('proves the tombstone probe itself wrote nothing', () => {
    expect(code).toMatch(/the tombstone probe changed player_contracts from % to % rows/);
  });

  it('keeps the definitions the history points at', () => {
    // Orphaned ids are a subtler kind of erasure: the row survives and stops
    // meaning anything.
    expect(sql).toMatch(/contract_definitions` is what those rows point at/);
  });
});

// ---------------------------------------------------------------------------
// MIGRATION SHAPE
// ---------------------------------------------------------------------------

describe('the migration is shaped the way the protocol requires', () => {
  it('is one transaction', () => {
    expect(code).toMatch(/^\s*BEGIN;/m);
    expect(code.trimEnd().endsWith('COMMIT;')).toBe(true);
  });

  it('is forward-only and carries an explicit down-note that lifts no tombstone', () => {
    expect(sql).toMatch(/DOWN-NOTE \(forward-only\)/);
    expect(sql).toMatch(/The contract tombstones are NOT lifted by that block/);
  });

  it('records why a tombstone was chosen over a drop', () => {
    expect(sql).toMatch(/WHY A TOMBSTONE AND NOT A DROP/);
  });

  it('is numbered ahead of every applied migration and stands alone', () => {
    const files = fs
      .readdirSync(path.join(ROOT, 'supabase/migrations'))
      .filter((name) => name.endsWith('.sql'))
      .sort();
    expect(files).toContain('049_world_signal.sql');
    // The cutover lives in 049 because 049 is the migration that introduces
    // the surface replacing contracts — and it has never been applied, so
    // extending it is safe. A second file would let one land without the other.
    expect(files.filter((name) => /contract/i.test(name))).toEqual([
      '015_contracts.sql',
      '017_fix_contract_rpcs.sql',
    ]);
  });
});

// ---------------------------------------------------------------------------
// UNREACHABLE — the API surface and its callers
// ---------------------------------------------------------------------------

describe('no contract route or caller survives in the source tree', () => {
  it('has no /api/contracts route directory', () => {
    expect(fs.existsSync(path.join(ROOT, 'src/app/api/contracts'))).toBe(false);
  });

  it('has no contracts board component', () => {
    expect(
      fs.existsSync(path.join(ROOT, 'src/components/engagement/ContractsBoard.tsx'))
    ).toBe(false);
  });

  it('leaves no source file calling a retired RPC or the retired route', () => {
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === '.next') continue;
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        // This file names all of them on purpose.
        if (full.endsWith('contractsCutover.test.ts')) continue;

        const text = fs.readFileSync(full, 'utf8');
        for (const fn of RETIRED_RPCS) {
          if (text.includes(`rpc('${fn}'`) || text.includes(`rpc("${fn}"`)) {
            offenders.push(`${full}: rpc(${fn})`);
          }
        }
        if (/fetch\(\s*['"`][^'"`]*\/api\/contracts/.test(text)) {
          offenders.push(`${full}: fetch(/api/contracts)`);
        }
      }
    };

    walk(path.join(ROOT, 'src'));
    expect(offenders).toEqual([]);
  });

  it('still reads contract history where history is the point', () => {
    // The Analyst digest reports what a player did that week, contracts
    // included. That read must NOT be removed: it is the history surviving in
    // the only place a player can still see it. Rule 6 protects the record,
    // and §13 retires the mechanism — these are different things.
    const insights = fs.readFileSync(path.join(ROOT, 'src/lib/analyst/insights.ts'), 'utf8');
    expect(insights).toMatch(/\.from\('player_contracts'\)/);
    expect(insights).not.toMatch(/rpc\('(offer_daily_contracts|pick_contracts|claim_contract)'/);
  });
});
