/**
 * Migration 050 — the Daily Take's shape, asserted from source (WP-1.04).
 *
 * Structural assertions, not a live database: the migration is NEVER applied
 * by this work package (the orchestrator renumbers and applies at merge), so
 * the only thing that can be checked here is what the SQL says. That is worth
 * checking, because three of WP-1.04's four acceptance criteria — double
 * collect impossible, cooling that honours the CHECK constraints, and the Take
 * multiplying only itself — are properties of this file's text.
 */

import fs from 'fs';
import path from 'path';

import {
  TAKE_BASE_DNA,
  TAKE_TIER_MULTIPLIERS,
  TAKE_TIER_THRESHOLDS,
} from '@/shared/game/dailyTake';

const MIGRATIONS = path.join(process.cwd(), 'supabase', 'migrations');
const FILE = '050_daily_take.sql';
const sql = fs.readFileSync(path.join(MIGRATIONS, FILE), 'utf8');

/** The body of `collect_daily_take`, from its CREATE to the LANGUAGE marker. */
const collectBody = (() => {
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION collect_daily_take');
  expect(start).toBeGreaterThan(-1);
  const end = sql.indexOf('$$ LANGUAGE plpgsql;', start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
})();

describe('migration 050: the file itself', () => {
  it('is numbered 050 and is the only new migration in this work package', () => {
    const added = fs
      .readdirSync(MIGRATIONS)
      .filter((f) => /^0(4[0-9]|5[0-9])_.*\.sql$/.test(f))
      .sort();
    expect(added).toContain(FILE);
    // 039-049 belong to earlier work packages; nothing above 050 exists yet.
    expect(added.filter((f) => f > FILE)).toEqual([]);
  });

  it('is transactional and forward-only, with an explicit down-note', () => {
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql.trimEnd().endsWith('COMMIT;')).toBe(true);
    expect(sql).toMatch(/DOWN-NOTE \(forward-only/);
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS collect_daily_take\(UUID\);/);
  });

  it('aborts rather than proceeding if WP-0.02 s CHECK constraints are missing', () => {
    for (const name of [
      'player_streaks_take_tier_range',
      'player_streaks_take_tier_earned',
      'player_streaks_take_never_resets',
      'player_streaks_take_high_water',
    ]) {
      expect(sql).toContain(name);
    }
    expect(sql).toMatch(/RAISE EXCEPTION\s*\n?\s*'WP-1\.04 aborted/);
  });

  it('touches no player-owned row at apply time', () => {
    // Everything outside a function body must be DDL. The only DML statements
    // in this file are inside `collect_daily_take` / `record_daily_play`.
    const outsideFunctions = sql
      .split(/CREATE OR REPLACE FUNCTION/)
      .slice(0, 1)
      .join('');
    expect(outsideFunctions).not.toMatch(/\bUPDATE\s+(players|player_streaks)\b/i);
    expect(outsideFunctions).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(sql).not.toMatch(/ALTER TABLE player_streaks\s+DROP/i);
  });
});

describe('the ladder is the same number in SQL and TypeScript', () => {
  it('declares §7.2 s thresholds identically to src/shared/game/dailyTake.ts', () => {
    expect(sql).toContain(`ARRAY[${TAKE_TIER_THRESHOLDS.join(', ')}]`);
    expect(TAKE_TIER_THRESHOLDS.join(',')).toBe('0,3,7,14,30');
  });

  it('declares §7.2 s multipliers identically', () => {
    expect(sql).toContain(`ARRAY[${TAKE_TIER_MULTIPLIERS.join(', ')}]`);
    expect(TAKE_TIER_MULTIPLIERS.join(',')).toBe('1,1.25,1.5,2,3');
  });

  it('declares the 100 DNA base as a CONSTANT, not a parameter', () => {
    expect(collectBody).toMatch(
      new RegExp(`c_base\\s+CONSTANT INTEGER\\s*:=\\s*${TAKE_BASE_DNA};`)
    );
  });

  it('keeps the same array literal migration 041 s CHECK constraint uses', () => {
    const c041 = fs.readFileSync(
      path.join(MIGRATIONS, '041_multiplier_stack_removal.sql'),
      'utf8'
    );
    expect(c041).toContain('ARRAY[0, 3, 7, 14, 30]');
    expect(sql).toContain('ARRAY[0, 3, 7, 14, 30]');
  });
});

describe('double collect is impossible server-side', () => {
  it('locks the player and then the chain, in that order', () => {
    const playerLock = collectBody.indexOf('FROM players pl WHERE pl.id = p_player_id FOR UPDATE');
    const chainLock = collectBody.indexOf('FROM player_streaks ps');
    expect(playerLock).toBeGreaterThan(-1);
    expect(chainLock).toBeGreaterThan(playerLock);
    expect(collectBody).toMatch(/FROM player_streaks ps[\s\S]{0,120}FOR UPDATE/);
  });

  it('claims the day with a compare-and-set, not a blind UPDATE', () => {
    expect(collectBody).toMatch(
      /UPDATE player_streaks ps SET[\s\S]{0,600}?WHERE ps\.player_id = p_player_id\s*\n\s*AND \(ps\.take_last_claim_date IS NULL OR ps\.take_last_claim_date < v_today\)/
    );
    expect(collectBody).toMatch(/GET DIAGNOSTICS v_written = ROW_COUNT;/);
  });

  it('credits DNA only after the compare-and-set claimed the day', () => {
    const rowCount = collectBody.indexOf('GET DIAGNOSTICS v_written = ROW_COUNT;');
    const zeroGuard = collectBody.indexOf('IF v_written = 0 THEN');
    const credit = collectBody.indexOf('SET dna              = pl.dna + v_amount');
    expect(rowCount).toBeGreaterThan(-1);
    expect(zeroGuard).toBeGreaterThan(rowCount);
    expect(credit).toBeGreaterThan(zeroGuard);
  });

  it('has exactly one statement that adds DNA, and one audit row for it', () => {
    expect(collectBody.match(/pl\.dna \+ v_amount/g)).toHaveLength(1);
    expect(collectBody.match(/INSERT INTO economy_transactions/g)).toHaveLength(1);
    expect(collectBody).toContain("'daily_take'");
  });

  it('refuses a claim date that is already today or in the future', () => {
    expect(collectBody).toMatch(
      /v_row\.take_last_claim_date IS NOT NULL AND v_row\.take_last_claim_date >= v_today/
    );
  });
});

describe('the day is derived, never named by a caller (Rule 11)', () => {
  it('takes a player id and nothing else', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION collect_daily_take\(p_player_id UUID\)/);
    // No date, amount, tier, multiplier or streak parameter exists to abuse.
    const signature = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION collect_daily_take'),
      sql.indexOf('RETURNS JSONB')
    );
    expect(signature).not.toMatch(/p_(today|day|date|amount|tier|multiplier|streak)/);
  });

  it('reads today from its own UTC clock', () => {
    expect(collectBody).toMatch(/v_today\s+DATE\s*:=\s*\(NOW\(\) AT TIME ZONE 'utc'\)::DATE;/);
  });
});

describe('the Take multiplies only itself', () => {
  it('never reads a session, a Yield, a Score or a Depth', () => {
    expect(collectBody).not.toMatch(/game_sessions|yield_dna|high_score|\bscore\b|serpent|depth/i);
  });

  it('never writes a charge, a cosmetic, an entitlement or a subscription', () => {
    expect(collectBody).not.toMatch(/charges_day|charges_used|energy/i);
    expect(collectBody).not.toMatch(/cosmetic|entitlement|subscription|premium/i);
  });

  it('applies the multiplier to the base constant and to nothing else', () => {
    const usages = collectBody.match(/c_multipliers\[[^\]]+\]/g) ?? [];
    expect(usages.length).toBeGreaterThan(0);
    // Exactly one multiplication exists in the function, and its left operand
    // is the 100 DNA base. Every other use is reporting the factor back.
    const multiplications = collectBody.match(/\*\s*c_multipliers/g) ?? [];
    expect(multiplications).toHaveLength(1);
    expect(collectBody).toContain('FLOOR(c_base * c_multipliers[v_tier + 1])::INTEGER');
  });

  it('changes no other function s payout path', () => {
    const declared = sql.match(/CREATE (?:OR REPLACE )?FUNCTION (\w+)/g) ?? [];
    expect(declared.sort()).toEqual([
      'CREATE OR REPLACE FUNCTION collect_daily_take',
      'CREATE OR REPLACE FUNCTION record_daily_play',
    ]);
  });
});

describe('cooling honours migration 041 s CHECK constraints', () => {
  it('walks down exactly one rung and floors the chain at one day', () => {
    expect(collectBody).toMatch(/v_cooled_tier := GREATEST\(v_prior_tier - 1, 0\);/);
    expect(collectBody).toMatch(
      /v_days\s+:= GREATEST\(c_thresholds\[v_cooled_tier \+ 1\], 1\);/
    );
  });

  it('never writes the chain, the tier or the claim date to a resetting value', () => {
    // `player_streaks_take_never_resets` makes (claim date, 0 days) impossible.
    // The only assignments to the take columns are variables and a GREATEST.
    expect(collectBody).not.toMatch(/take_streak_days\s*=\s*0/);
    expect(collectBody).not.toMatch(/take_last_claim_date\s*=\s*NULL/i);
    expect(collectBody).not.toMatch(/take_tier\s*=\s*0\b/);
    // The high-water mark has exactly one assignment, and it is a GREATEST.
    expect(collectBody.match(/take_longest_streak\s*=\s*\S+/g)).toEqual([
      'take_longest_streak  = GREATEST(COALESCE(ps.take_longest_streak,',
    ]);
  });

  it('derives the tier from the day count rather than trusting the stored column', () => {
    expect(collectBody).toMatch(
      /SELECT COALESCE\(MAX\(i - 1\), 0\) INTO v_prior_tier[\s\S]{0,200}c_thresholds\[i\] <= v_prior_days/
    );
  });
});

describe('SECURITY DEFINER audit (Rule 11)', () => {
  it('revokes collect_daily_take from PUBLIC, anon and authenticated', () => {
    for (const role of ['PUBLIC', 'anon', 'authenticated']) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION collect_daily_take(UUID) FROM ${role};`);
    }
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION collect_daily_take(UUID) TO service_role;'
    );
  });

  it('re-states migration 041 s revocations on record_daily_play', () => {
    for (const role of ['PUBLIC', 'anon', 'authenticated']) {
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION record_daily_play(UUID) FROM ${role};`);
    }
  });

  it('pins the search_path on the new SECURITY DEFINER function', () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION collect_daily_take[\s\S]{0,120}SECURITY DEFINER\s*\n\s*SET search_path = public, pg_temp/
    );
  });
});

describe('finding F-10 — a broken play streak cools instead of resetting', () => {
  const playBody = (() => {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION record_daily_play');
    const end = sql.indexOf('$$ LANGUAGE plpgsql SECURITY DEFINER;', start);
    return sql.slice(start, end);
  })();

  it('no longer resets a broken chain to 1', () => {
    expect(playBody).not.toMatch(/v_new_streak := 1;\s*--\s*streak broken/);
    expect(playBody).toMatch(
      /v_new_streak := GREATEST\(c_thresholds\[GREATEST\(v_broken_tier, 1\)\], 1\);/
    );
  });

  it('uses the Take s ladder rather than a second forgiveness curve (§14)', () => {
    expect(playBody).toContain('ARRAY[0, 3, 7, 14, 30]');
  });

  it('keeps every other branch and the Rule 6 high-water guard intact', () => {
    expect(playBody).toContain('v_new_streak := v_row.current_streak + 1;         -- consecutive day');
    expect(playBody).toContain('-- one missed day forgiven');
    expect(playBody).toContain('v_new_streak := 1;                                -- first ever play');
    expect(playBody).toContain('longest_streak = GREATEST(ps.longest_streak, v_new_streak),');
  });

  it('keeps the signature and return shape, so no caller moves', () => {
    expect(playBody).toMatch(
      /RETURNS TABLE \(\s*current_streak INTEGER,\s*longest_streak INTEGER,\s*grace_consumed BOOLEAN\s*\)/
    );
    expect(sql).not.toMatch(/DROP FUNCTION IF EXISTS record_daily_play/);
  });
});
