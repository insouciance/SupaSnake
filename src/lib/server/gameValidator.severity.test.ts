/**
 * THE SEVERITY MODEL (WP-2.05 — Player Truth).
 *
 * Three things are pinned here, and they are pinned in three different ways
 * on purpose:
 *
 *   1. THE TABLE ITSELF — FATAL is exactly two codes, unknown is advisory,
 *      and the partition is total.
 *   2. A SOURCE SCAN — every code the validator and the session route can
 *      actually push has an entry. A default that nobody can reach by
 *      accident is a safety net; a default that a forgotten table entry
 *      silently falls into is a loophole. The scan is what keeps it the
 *      former.
 *   3. A CROSS-CHECK AGAINST THE SQL — migration 055 cannot import
 *      TypeScript, so it carries its own copy of the advisory list. Two
 *      copies of one classification is exactly how they drift, so this file
 *      reads the migration and asserts the two agree.
 *
 * And the decisive property, which is what the whole package is for:
 * THE PAYOUT NEVER DEPENDS ON SEVERITY. A run that fires every advisory
 * code pays the same `adjustedDna` as a clean one, and a run with a fatal
 * code pays the same as the same run without it. Severity decides what the
 * server SAYS about a run, never what it PAYS for it.
 */

import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

import {
  FATAL_VALIDATION_CODES,
  VALIDATION_CODE_SEVERITY,
  appendAdvisory,
  claimDriftIsAlertable,
  isFatalValidationError,
  partitionValidationErrors,
  severityOfValidationCode,
  validateGameResult,
  validationCodeOf,
  type ValidationResult,
} from './gameValidator';

const ROOT = process.cwd();

function readSource(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

/**
 * Blank out comments, preserving length so offsets stay meaningful.
 *
 * Every scan below has to read EXECUTABLE code rather than prose, and this
 * file is the worst possible place to get that wrong: its own subject matter
 * means the comments it scans past are full of the exact literals it is
 * looking for (a `errors.push('NEW_CODE: …')` in a doc block, a sentence
 * about "the hand-set `validation.valid = false`", a `;` inside an English
 * clause that would truncate a SQL VALUES list).
 */
function stripComments(source: string, kind: 'ts' | 'sql'): string {
  const blanked = source.split('');
  const lineOpener = kind === 'sql' ? '--' : '//';
  let i = 0;
  let quote: string | null = null;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (quote) {
      if (kind === 'ts' && source[i] === '\\') {
        i += 2;
        continue;
      }
      if (source[i] === quote) quote = null;
      i += 1;
      continue;
    }
    if (source[i] === '"' || source[i] === "'" || source[i] === '`') {
      quote = source[i];
      i += 1;
      continue;
    }
    if (two === lineOpener) {
      while (i < source.length && source[i] !== '\n') {
        blanked[i] = ' ';
        i += 1;
      }
      continue;
    }
    if (kind === 'ts' && two === '/*') {
      while (i < source.length && source.slice(i, i + 2) !== '*/') {
        if (source[i] !== '\n') blanked[i] = ' ';
        i += 1;
      }
      blanked[i] = ' ';
      blanked[i + 1] = ' ';
      i += 2;
      continue;
    }
    i += 1;
  }
  return blanked.join('');
}

/**
 * Every literal pushed as a validator finding, from the source.
 *
 * Matches `errors.push('CODE: …')` / `` errors.push(`CODE: …`) `` and
 * `appendAdvisory(x, 'CODE: …')`, in both quote styles, including the
 * template-literal form the message interpolations use.
 */
function pushedCodes(source: string): Set<string> {
  const codes = new Set<string>();
  const patterns = [
    /errors\.push\(\s*[`'"]([A-Z][A-Z0-9_]*)\s*:/g,
    /appendAdvisory\(\s*\w+\s*,\s*[`'"]([A-Z][A-Z0-9_]*)\s*:/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      codes.add(match[1]);
    }
  }
  return codes;
}

describe('the severity table', () => {
  it('FATAL is exactly the two named codes, and nothing else', () => {
    expect([...FATAL_VALIDATION_CODES].sort()).toEqual([
      'INVALID_DURATION',
      'SPLICE_CLAIMED_DIRECTLY',
    ]);
    const fatalInTable = Object.entries(VALIDATION_CODE_SEVERITY)
      .filter(([, severity]) => severity === 'fatal')
      .map(([code]) => code)
      .sort();
    expect(fatalInTable).toEqual([...FATAL_VALIDATION_CODES].sort());
  });

  it('every code has exactly one severity', () => {
    for (const [code, severity] of Object.entries(VALIDATION_CODE_SEVERITY)) {
      expect(['fatal', 'advisory']).toContain(severity);
      expect(severityOfValidationCode(code)).toBe(severity);
    }
  });

  it('an UNKNOWN code is advisory — the fail-safe direction at runtime', () => {
    // A future author who adds a code and forgets the table must never cost
    // a live player their progression. Migration 055 defaults the other way
    // (skip the row) because a public board is a different kind of mistake.
    expect(severityOfValidationCode('SOME_CODE_NOBODY_WROTE_DOWN')).toBe(
      'advisory'
    );
    expect(isFatalValidationError('SOME_CODE_NOBODY_WROTE_DOWN: whatever')).toBe(
      false
    );
  });

  it('parses the code out of a message, however it is punctuated', () => {
    expect(validationCodeOf('DNA_MISMATCH: claimed 1, recomputed 2')).toBe(
      'DNA_MISMATCH'
    );
    expect(validationCodeOf('INVALID_DURATION')).toBe('INVALID_DURATION');
    expect(validationCodeOf('  GENE_BOUND : x')).toBe('GENE_BOUND');
  });

  it('partitions an error list totally: fatal + advisory = all of it', () => {
    const errors = [
      'DNA_MISMATCH: a',
      'INVALID_DURATION: b',
      'GENE_BOUND: c',
      'SPLICE_CLAIMED_DIRECTLY: d',
    ];
    const { fatalErrors, advisoryErrors } = partitionValidationErrors(errors);
    expect(fatalErrors).toEqual([
      'INVALID_DURATION: b',
      'SPLICE_CLAIMED_DIRECTLY: d',
    ]);
    expect(advisoryErrors).toEqual(['DNA_MISMATCH: a', 'GENE_BOUND: c']);
    expect(fatalErrors.length + advisoryErrors.length).toBe(errors.length);
  });
});

describe('the source scan — no code may escape the table', () => {
  it('every code the validator pushes has a table entry', () => {
    const codes = pushedCodes(
      stripComments(readSource('src/lib/server/gameValidator.ts'), 'ts')
    );
    // Sanity: the scan must actually be finding things, or it proves nothing.
    expect(codes.size).toBeGreaterThan(15);
    const missing = [...codes].filter(
      (code) => !(code in VALIDATION_CODE_SEVERITY)
    );
    expect(missing).toEqual([]);
  });

  it('every code the session route pushes has a table entry', () => {
    const codes = pushedCodes(
      stripComments(readSource('src/app/api/game/session/route.ts'), 'ts')
    );
    const missing = [...codes].filter(
      (code) => !(code in VALIDATION_CODE_SEVERITY)
    );
    expect(missing).toEqual([]);
  });

  it('the route no longer hand-sets validation.valid', () => {
    // `appendAdvisory` is the only door, and it throws on a fatal code, so
    // no caller outside the validator can assert that the server failed to
    // bound a run's physics.
    const route = stripComments(
      readSource('src/app/api/game/session/route.ts'),
      'ts'
    );
    expect(route).not.toMatch(/validation\.valid\s*=\s*(?!==)/);
    expect(route).toMatch(/appendAdvisory\(/);
  });
});

describe('the cross-check against migration 055', () => {
  const raw = readSource(
    'supabase/migrations/055_validation_severity_backfill.sql'
  );
  // Comment-stripped for the STRUCTURAL scans below: this migration's own
  // prose contains semicolons inside English clauses, which would truncate
  // a VALUES list read with `indexOf(';')`.
  const sql = stripComments(raw, 'sql');

  function sqlCodes(table: string): Set<string> {
    const start = sql.indexOf(`INSERT INTO ${table}(code) VALUES`);
    expect(start).toBeGreaterThan(-1);
    const end = sql.indexOf(';', start);
    const body = sql.slice(start, end);
    const codes = new Set<string>();
    for (const match of body.matchAll(/\('([A-Z][A-Z0-9_]*)'\)/g)) {
      codes.add(match[1]);
    }
    return codes;
  }

  it("the migration's FATAL list is the TypeScript FATAL list", () => {
    expect([...sqlCodes('wp205_fatal_codes')].sort()).toEqual(
      [...FATAL_VALIDATION_CODES].sort()
    );
  });

  it('the migration allowlists every advisory code the table knows', () => {
    const advisory = Object.entries(VALIDATION_CODE_SEVERITY)
      .filter(([, severity]) => severity === 'advisory')
      .map(([code]) => code);
    const allowed = sqlCodes('wp205_advisory_codes');
    const missing = advisory.filter((code) => !allowed.has(code));
    expect(missing).toEqual([]);
  });

  it('the migration allowlists the two RETIRED codes, and only those extra', () => {
    // The complete historical code universe: all nine validator revisions
    // were walked, and exactly two codes existed that no longer do. Both
    // were claim mismatches that never changed a payout, so both are
    // advisory. Anything else appearing here would be a code the runtime
    // table cannot classify.
    const allowed = sqlCodes('wp205_advisory_codes');
    const extra = [...allowed].filter(
      (code) => VALIDATION_CODE_SEVERITY[code] !== 'advisory'
    );
    expect(extra.sort()).toEqual(['INVALID_DNA', 'INVALID_SCORE']);
  });

  it('never re-credits DNA, mastery XP or total_games_played', () => {
    // Each was paid or counted at settlement and was never gated on
    // `validated`. Re-crediting them would be a duplicate grant.
    expect(sql).not.toMatch(/UPDATE\s+players[\s\S]{0,400}?SET[\s\S]{0,200}?\btotal_dna_earned\s*=/i);
    expect(sql).not.toMatch(/UPDATE\s+players[\s\S]{0,400}?SET[\s\S]{0,200}?\btotal_games_played\s*=/i);
    expect(sql).not.toMatch(/grant_mastery_xp/);
    expect(sql).not.toMatch(/UPDATE\s+player_mastery/i);
  });

  it('recomputes high_score through GREATEST, so it can only rise', () => {
    expect(sql).toMatch(/SET high_score = GREATEST\(/);
  });

  it('parses the JSONB blob exactly, not with a text scan', () => {
    expect(sql).toMatch(/jsonb_array_elements_text/);
    expect(sql).toMatch(/split_part\(e\.value, ':', 1\)/);
    expect(sql).not.toMatch(/validation_errors::TEXT\s+LIKE/i);
  });

  it('reports unclassified codes and out-of-window weeks, never aborting on them', () => {
    expect(sql).toMatch(/UNCLASSIFIED session %/);
    expect(sql).toMatch(/OUTSIDE the 8-day window/);
    // The only EXCEPTIONs are the 054 guard and the assertions.
    const raises = [...sql.matchAll(/RAISE EXCEPTION\s*\n?\s*'([^']+)'/g)].map(
      (m) => m[1]
    );
    for (const message of raises) {
      expect(message).toMatch(/requires 054|assertion \([a-j]\) failed/);
    }
  });

  it('is one transaction that asserts Rule 6 before it commits', () => {
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql.trimEnd().endsWith('COMMIT;')).toBe(true);
    const assertionsIndex = sql.indexOf('assertion (a) failed');
    const commitIndex = sql.lastIndexOf('COMMIT;');
    expect(assertionsIndex).toBeGreaterThan(-1);
    expect(assertionsIndex).toBeLessThan(commitIndex);
    // Every player-owned scalar named in the Rule 6 assertion.
    for (const column of [
      'high_score',
      'total_dna_earned',
      'total_games_played',
      'legacy_score',
      'lifetime_depth',
      'best_week_depth',
      'signals_completed',
      'dna',
    ]) {
      expect(sql).toMatch(new RegExp(`p\\.${column} < b\\.${column}`));
    }
  });
});

describe('appendAdvisory', () => {
  function baseResult(): ValidationResult {
    return validateGameResult(
      {
        food_count: 10,
        extracted: true,
        score: 100,
        dna_earned: 100,
        duration_seconds: 30,
        died: false,
        victory: false,
      },
      new Date(Date.now() - 60_000),
      'PRIMAL'
    );
  }

  it('keeps errors, advisoryErrors and valid consistent', () => {
    const result = baseResult();
    const before = result.errors.length;
    appendAdvisory(result, 'OFFER_SEED_MISMATCH: replay drifted');
    expect(result.errors).toHaveLength(before + 1);
    expect(result.advisoryErrors).toContain(
      'OFFER_SEED_MISMATCH: replay drifted'
    );
    expect(result.fatalErrors).toEqual([]);
    // An advisory finding does NOT invalidate the run. This one line is the
    // whole owner ruling.
    expect(result.valid).toBe(true);
  });

  it('THROWS on a fatal code rather than quietly accepting it', () => {
    const result = baseResult();
    expect(() =>
      appendAdvisory(result, 'INVALID_DURATION: forged from outside')
    ).toThrow(/refuses the fatal code INVALID_DURATION/);
    expect(() =>
      appendAdvisory(result, 'SPLICE_CLAIMED_DIRECTLY: splice_styx_contract')
    ).toThrow(/refuses the fatal code SPLICE_CLAIMED_DIRECTLY/);
  });
});

describe('THE PAYOUT NEVER DEPENDS ON SEVERITY', () => {
  const startedAt = () => new Date(Date.now() - 600_000);

  it('a run firing an advisory code pays what the clean run pays', () => {
    const clean = validateGameResult(
      {
        food_count: 40,
        extracted: true,
        score: 400,
        dna_earned: 0,
        duration_seconds: 120,
        died: false,
        victory: false,
      },
      startedAt(),
      'PRIMAL'
    );
    // `dna_earned: 0` against a 40-food recompute is a large drift, so this
    // run fires DNA_MISMATCH and SCORE_MISMATCH is avoided by the claim.
    expect(clean.advisoryErrors.some((e) => e.startsWith('DNA_MISMATCH'))).toBe(
      true
    );
    expect(clean.valid).toBe(true);

    const quiet = validateGameResult(
      {
        food_count: 40,
        extracted: true,
        score: 400,
        dna_earned: clean.rawDna,
        duration_seconds: 120,
        died: false,
        victory: false,
      },
      startedAt(),
      'PRIMAL'
    );
    expect(quiet.errors).toEqual([]);
    expect(quiet.adjustedDna).toBe(clean.adjustedDna);
    expect(quiet.adjustedScore).toBe(clean.adjustedScore);
  });

  it('a run with a FATAL code pays exactly what it pays without one', () => {
    // Identical runs; one claims a duration the server cannot bound. The
    // fatal code costs eligibility, and not one DNA of the payout - the
    // recompute is the payout either way.
    const bounded = validateGameResult(
      {
        food_count: 30,
        extracted: true,
        score: 300,
        dna_earned: 0,
        duration_seconds: 100,
        died: false,
        victory: false,
      },
      startedAt(),
      'PRIMAL'
    );
    const forged = validateGameResult(
      {
        food_count: 30,
        extracted: true,
        score: 300,
        dna_earned: 0,
        duration_seconds: 999_999,
        died: false,
        victory: false,
      },
      startedAt(),
      'PRIMAL'
    );
    expect(bounded.valid).toBe(true);
    expect(forged.valid).toBe(false);
    expect(forged.fatalErrors[0]).toContain('INVALID_DURATION');
    expect(forged.adjustedDna).toBe(bounded.adjustedDna);
    expect(forged.adjustedScore).toBe(bounded.adjustedScore);
    expect(forged.foodCount).toBe(bounded.foodCount);
  });
});

describe('the claim-drift alert threshold', () => {
  it('is relative as well as absolute, so long runs are not false-flagged', () => {
    // A 3-DNA drift on a 777-DNA run was flagging honest `scavenger` runs
    // against a whole-run absolute epsilon of 1.
    expect(claimDriftIsAlertable(777, 774)).toBe(false);
    // The same 3 DNA on a small run is worth an operator's attention.
    expect(claimDriftIsAlertable(23, 20)).toBe(true);
    // Exactly the recompute is never alertable, at any size.
    expect(claimDriftIsAlertable(100_000, 100_000)).toBe(false);
  });

  it('decides ALERTING only — never the payout, never eligibility', () => {
    const drifted = validateGameResult(
      {
        food_count: 25,
        extracted: true,
        score: 0,
        dna_earned: 0,
        duration_seconds: 90,
        died: false,
        victory: false,
      },
      new Date(Date.now() - 600_000),
      'PRIMAL'
    );
    expect(drifted.errors.length).toBeGreaterThan(0);
    expect(drifted.fatalErrors).toEqual([]);
    expect(drifted.valid).toBe(true);
    expect(drifted.adjustedDna).toBeGreaterThan(0);
  });
});

describe('the stored duration', () => {
  it('is the claim clamped to the time that actually passed', () => {
    const result = validateGameResult(
      {
        food_count: 5,
        extracted: true,
        score: 50,
        dna_earned: 0,
        duration_seconds: 999_999,
        died: false,
        victory: false,
      },
      new Date(Date.now() - 120_000),
      'PRIMAL'
    );
    // Clamped to serverElapsed, NOT serverElapsed + 10: the skew tolerance
    // governs rejection, never the record. Signal's `endure` objective reads
    // this number straight off the row.
    expect(result.durationSeconds).toBeGreaterThanOrEqual(119);
    expect(result.durationSeconds).toBeLessThanOrEqual(121);
  });

  it('records an honest claim unchanged', () => {
    const result = validateGameResult(
      {
        food_count: 5,
        extracted: true,
        score: 50,
        dna_earned: 0,
        duration_seconds: 45,
        died: false,
        victory: false,
      },
      new Date(Date.now() - 120_000),
      'PRIMAL'
    );
    expect(result.durationSeconds).toBe(45);
  });

  it('has no flat ceiling any more — a long careful run stays valid', () => {
    const result = validateGameResult(
      {
        food_count: 100,
        extracted: true,
        score: 1000,
        dna_earned: 0,
        duration_seconds: 3_000,
        died: false,
        victory: false,
      },
      new Date(Date.now() - 3_600_000),
      'PRIMAL'
    );
    expect(result.fatalErrors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.durationSeconds).toBe(3_000);
  });
});
