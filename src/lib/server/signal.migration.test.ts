/**
 * Migration 049 shape tests — the World Signal (Constitution §7.2, §8.6,
 * §12.2, Rules 3, 5, 6 and 11).
 *
 * Four of this work package's guarantees are properties of the SQL rather than
 * of any runtime check, and a property nobody watches is a property that
 * quietly stops being true:
 *
 *   SERIALIZED — concurrent resolves cannot fork a day, and concurrent
 *     settlements of a player cannot lose a completion. This is the section
 *     that a defect was actually found in; the tests below are the fix, pinned.
 *   IDEMPOTENT — no accumulated number is ever incremented. Progress lands
 *     through GREATEST, the completion is a COALESCE latch, the flat bonus is
 *     a compare-and-set, and the cumulative count is a COUNT(*).
 *   NON-DESTRUCTIVE — nothing expires, decays, resets or confiscates, and the
 *     migration aborts itself if a player-owned number moved down.
 *   UNBUYABLE — no entitlement, subscription, purchase or premium flag is an
 *     input to a completion or to what it pays.
 */

import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATION = path.join(process.cwd(), 'supabase/migrations/049_world_signal.sql');
const sql = fs.readFileSync(MIGRATION, 'utf8');

/**
 * The migration with every `--` comment stripped. Negative assertions run
 * against this: the header explains at length what settlement must never do,
 * and naming a thing is not doing it.
 */
const code = sql.replace(/--[^\n]*/g, '');

function functionBody(name: string): string {
  const start = code.indexOf(`CREATE OR REPLACE FUNCTION ${name}`);
  expect(start).toBeGreaterThan(-1);
  const end = code.indexOf('$$ LANGUAGE plpgsql VOLATILE;', start);
  expect(end).toBeGreaterThan(start);
  return code.slice(start, end);
}

const ensureDayBody = functionBody('ensure_signal_day');
const beginRunBody = functionBody('begin_signal_objective_run');
const settleBody = functionBody('settle_signal_objective_run');

// ---------------------------------------------------------------------------
// THE CONCURRENCY FIX
// ---------------------------------------------------------------------------

describe('a concurrent resolve cannot fork a day or an attempt', () => {
  it('writes the day once, first writer wins, and never rewrites it', () => {
    expect(ensureDayBody).toMatch(/ON CONFLICT \(day\)\s+DO NOTHING/);
    // A no-op self-assignment would make resolving the day — the hottest read
    // in the feature — a WRITE taking an exclusive lock on one tuple for the
    // whole world. It also contradicts the file's own promise that a stored
    // day is immutable.
    expect(ensureDayBody).not.toMatch(/ON CONFLICT[\s\S]*?DO UPDATE/);
    expect(ensureDayBody).not.toMatch(/UPDATE signal_days/);
  });

  it('the loser of the 00:00 UTC race reads the winner back', () => {
    // RETURNING gives the winner nothing to read, so a fallback SELECT on a
    // fresh READ COMMITTED snapshot is what resolves the row. Both must be
    // present, in that order, or a boundary race raises instead of resolving.
    const returningAt = ensureDayBody.indexOf('RETURNING * INTO v_row');
    const fallbackAt = ensureDayBody.indexOf('SELECT * INTO v_row FROM signal_days');
    expect(returningAt).toBeGreaterThan(-1);
    expect(fallbackAt).toBeGreaterThan(returningAt);
    expect(ensureDayBody).toMatch(/ensure_signal_day could not resolve day/);
  });

  it('claims a player attempt once per day, first writer wins', () => {
    expect(beginRunBody).toMatch(/ON CONFLICT \(day_id, player_id\)\s+DO NOTHING/);
    expect(beginRunBody).not.toMatch(/ON CONFLICT[\s\S]*?DO UPDATE/);

    const returningAt = beginRunBody.indexOf('RETURNING * INTO v_row');
    const fallbackAt = beginRunBody.indexOf('SELECT * INTO v_row FROM signal_objective_runs');
    expect(returningAt).toBeGreaterThan(-1);
    expect(fallbackAt).toBeGreaterThan(returningAt);
  });

  it('only the session that WON the claim is stamped as the day Signal run', () => {
    // A double-tapped Launch: the loser reads back the winner's row, whose
    // session_id is the first session, so it gets no stamp and no exemption.
    expect(beginRunBody).toMatch(/IF v_row\.session_id = p_session_id THEN/);
    expect(beginRunBody).toMatch(/UPDATE game_sessions gs\s+SET signal_objective_run_id = v_row\.id/);
    expect(beginRunBody).toMatch(/\(v_row\.session_id = p_session_id\)/);
  });

  it('refuses to change a day that already exists (the drift tripwire)', () => {
    for (const field of ['seed', 'modifier', 'objectives']) {
      expect(ensureDayBody).toMatch(
        new RegExp(`IF v_row\\.${field} IS DISTINCT FROM[\\s\\S]{0,120}?RAISE EXCEPTION`)
      );
    }
  });
});

describe('a concurrent settlement cannot lose a completion', () => {
  it('takes the PLAYER row lock before the attempt row lock', () => {
    // The defect this fixes: `signals_completed` and the §7.2 marks are a
    // COUNT over ALL of a player's attempts, so locking only the attempt let
    // two settlements of DIFFERENT attempts by one player each count their own
    // uncommitted completion and never the other's. GREATEST then kept the
    // lower of two equal answers, dropping a completion and, with it, a mark
    // the recount would have crossed.
    const playerLock = settleBody.search(
      /SELECT pl\.id INTO v_player_id FROM players pl WHERE pl\.id = p_player_id\s+FOR UPDATE/
    );
    const attemptLock = settleBody.search(
      /SELECT \* INTO v_run FROM signal_objective_runs r\s+WHERE r\.id = p_run_id AND r\.player_id = p_player_id\s+FOR UPDATE/
    );
    expect(playerLock).toBeGreaterThan(-1);
    expect(attemptLock).toBeGreaterThan(-1);
    expect(playerLock).toBeLessThan(attemptLock);
  });

  it('takes exactly those two locks, so the order cannot deadlock against itself', () => {
    expect(settleBody.match(/FOR UPDATE/g)).toHaveLength(2);
  });

  it('recomputes the count under the lock and never increments it', () => {
    expect(settleBody).toMatch(
      /SELECT COUNT\(\*\)::INTEGER INTO v_completed[\s\S]*?FROM signal_objective_runs r[\s\S]*?completed_at IS NOT NULL/
    );
    expect(settleBody).toMatch(
      /signals_completed = GREATEST\(COALESCE\(pl\.signals_completed, 0\), v_completed\)/
    );
    expect(settleBody).not.toMatch(/signals_completed\s*=\s*[\s\S]{0,40}signals_completed\s*\+\s*1/);
  });

  it('raises rather than settling for a player that is not there', () => {
    expect(settleBody).toMatch(/settle_signal_objective_run: unknown player/);
    expect(settleBody).toMatch(/settle_signal_objective_run: unknown attempt/);
  });

  it('scopes every write in the settlement to the player it locked', () => {
    const writes = [...settleBody.matchAll(/UPDATE signal_objective_runs r[\s\S]*?;/g)].map(
      (match) => match[0]
    );
    expect(writes.length).toBeGreaterThan(0);
    for (const write of writes) {
      expect(write).toMatch(/r\.id = p_run_id/);
      expect(write).toMatch(/r\.player_id = p_player_id/);
    }
  });
});

// ---------------------------------------------------------------------------
// IDEMPOTENCE
// ---------------------------------------------------------------------------

describe('settling twice writes the same answer', () => {
  it('progress lands through GREATEST, never through an increment', () => {
    expect(settleBody).toMatch(
      /progress\s*=\s*GREATEST\(r\.progress, GREATEST\(COALESCE\(p_progress, 0\), 0\)\)/
    );
    expect(settleBody).not.toMatch(/progress\s*=\s*r\.progress\s*\+/);
  });

  it('the completion is a latch, so a re-settle cannot move the moment', () => {
    expect(settleBody).toMatch(/completed_at = COALESCE\(\s*r\.completed_at,/);
  });

  it('the flat bonus is a compare-and-set under the row lock', () => {
    expect(settleBody).toMatch(/r\.bonus_paid_at IS NULL/);
    expect(settleBody).toMatch(/GET DIAGNOSTICS v_paid = ROW_COUNT/);
    // The DNA credit and its receipt are both inside the guard.
    expect(settleBody).toMatch(
      /IF v_paid > 0 THEN[\s\S]*?UPDATE players pl[\s\S]*?INSERT INTO economy_transactions/
    );
  });

  it('clamps the bonus to the Constitution flat 150, so a bad caller underpays at worst', () => {
    expect(settleBody).toMatch(/c_max_bonus\s+CONSTANT INTEGER := 150/);
    expect(settleBody).toMatch(/LEAST\(GREATEST\(COALESCE\(p_bonus_dna, 0\), 0\), c_max_bonus\)/);
  });

  it('marks are uniquely keyed and inserted at most once', () => {
    expect(code).toMatch(/PRIMARY KEY \(player_id, milestone\)/);
    expect(settleBody).toMatch(/ON CONFLICT \(player_id, milestone\) DO NOTHING/);
  });

  it('every `+` in the settlement is the guarded DNA credit and nothing else', () => {
    const additions = [...settleBody.matchAll(/\S+\s\+\s(\S+)/g)];
    expect(additions).toHaveLength(2);
    for (const addition of additions) expect(addition[1]).toMatch(/^v_bonus/);
    // Both live inside `IF v_paid > 0`, the compare-and-set's own branch.
    expect(settleBody).toMatch(/IF v_paid > 0 THEN[\s\S]*?pl\.dna \+ v_bonus/);
  });
});

// ---------------------------------------------------------------------------
// RULE 5 — absence is never destructive
// ---------------------------------------------------------------------------

describe('a missed day costs that day and nothing else', () => {
  it('has no streak, no consecutive column and no reset', () => {
    expect(code).not.toMatch(/consecutive/i);
    expect(code).not.toMatch(/\bstreak\b/i);
    expect(code).not.toMatch(/\bexpire|\bdecay|\bconfiscat/i);
  });

  it('destroys nothing', () => {
    expect(code).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(code).not.toMatch(/\bTRUNCATE\b/i);
    expect(code).not.toMatch(/\bDROP\s+TABLE\b/i);
  });

  it('an archive attempt row cannot exist to be paid — one attempt, one day', () => {
    expect(code).toMatch(/CONSTRAINT signal_objective_run_one_per_day UNIQUE \(day_id, player_id\)/);
    expect(code).toMatch(/day\s+DATE\s+NOT NULL UNIQUE/);
  });

  it('aborts itself if a player-owned number moved downward (Rule 6)', () => {
    expect(code).toMatch(/Migration 049 aborted: % player rows moved downward/);
    expect(code).toMatch(/Migration 049 aborted: % session rows changed/);
    expect(code).toMatch(/contract history was destroyed/);
  });
});

// ---------------------------------------------------------------------------
// RULE 3 — money cannot reach it
// ---------------------------------------------------------------------------

describe('nothing purchasable is an input to a Signal', () => {
  it('reads no entitlement, subscription, purchase or premium flag', () => {
    // Scoped to the three functions, which are the only statements that can
    // read anything. The file's one other mention of a paid concept is
    // `premium_stipend` inside the `economy_transactions` source-type list,
    // carried forward verbatim from migration 047 so the audit trail keeps
    // every name it already had — a value in a CHECK, never an input.
    for (const body of [ensureDayBody, beginRunBody, settleBody]) {
      for (const term of [/entitlement/i, /subscription/i, /\bstripe\b/i, /premium/i, /cosmetic/i]) {
        expect(body).not.toMatch(term);
      }
    }
    const carriedForward = code.match(/premium/gi) ?? [];
    expect(carriedForward).toEqual(['premium']);
    expect(code).toMatch(/'premium_stipend'/);
  });

  it('pays through one named source type and no other', () => {
    expect(code).toMatch(/'signal_bonus'/);
    const inserts = [...settleBody.matchAll(/INSERT INTO (\w+)/g)].map((match) => match[1]);
    expect(inserts.sort()).toEqual(['economy_transactions', 'signal_milestones']);
  });
});

// ---------------------------------------------------------------------------
// RULE 11 — server authority
// ---------------------------------------------------------------------------

describe('the client cannot reach any of it', () => {
  it('is one transaction, forward-only, with a down-note', () => {
    expect(code).toMatch(/^\s*BEGIN;/m);
    expect(code.trimEnd().endsWith('COMMIT;')).toBe(true);
    expect(sql).toMatch(/DOWN-NOTE \(forward-only\)/);
  });

  it('revokes every function from anon and authenticated and grants only service_role', () => {
    for (const fn of [
      'ensure_signal_day',
      'begin_signal_objective_run',
      'settle_signal_objective_run',
    ]) {
      expect(code).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${fn}\\([^)]*\\) FROM PUBLIC`));
      expect(code).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${fn}\\([^)]*\\) FROM anon`));
      expect(code).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${fn}\\([^)]*\\) FROM authenticated`));
      expect(code).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${fn}\\([^)]*\\) TO service_role`));
    }
  });

  it('puts RLS on every Signal table with no anon or authenticated policy', () => {
    for (const table of ['signal_days', 'signal_objective_runs', 'signal_milestones']) {
      expect(code).toMatch(new RegExp(`ALTER TABLE ${table}\\s+ENABLE ROW LEVEL SECURITY`));
      expect(code).toMatch(new RegExp(`REVOKE ALL ON ${table}\\s+FROM anon, authenticated`));
    }
    expect(code).not.toMatch(/CREATE POLICY[\s\S]*?TO (anon|authenticated)/);
  });

  it('refuses a partly derived day', () => {
    expect(ensureDayBody).toMatch(/ensure_signal_day requires a fully derived day/);
    expect(beginRunBody).toMatch(
      /begin_signal_objective_run requires a resolved day, objective and session/
    );
  });

  it('will not claim the day attempt for a run that is not the player own open run', () => {
    expect(beginRunBody).toMatch(
      /gs\.id = p_session_id AND gs\.player_id = p_player_id AND gs\.ended_at IS NULL/
    );
  });
});

// ---------------------------------------------------------------------------
// §12.2 — the Signal is the ONE daily surface
// ---------------------------------------------------------------------------

describe('the contracts cutover', () => {
  it('drops the four contract functions and asserts they are gone', () => {
    for (const fn of [
      'offer_daily_contracts',
      'pick_contracts',
      'claim_contract',
      'refresh_contract_progress',
    ]) {
      expect(code).toMatch(new RegExp(`DROP FUNCTION IF EXISTS ${fn}\\(`));
    }
    expect(code).toMatch(/contract function\(s\) survived the cutover/);
  });

  it('keeps every row of contract history (Rule 6)', () => {
    expect(code).not.toMatch(/DROP TABLE[\s\S]*?player_contracts/);
    expect(code).not.toMatch(/DROP TABLE[\s\S]*?contract_definitions/);
  });
});
