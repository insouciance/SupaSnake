#!/usr/bin/env node
/**
 * verify:constitution — the mechanical gates of docs/CONSTITUTION_CHECKLIST.md.
 *
 * A static, dependency-free scan of the committed source tree. Each gate maps to
 * a ⚙ line of the checklist and, through it, to docs/PRODUCT_CONSTITUTION.md v1.3:
 *
 *   score-independence   R2      §4.2   the score fold reads food events + ruleset only,
 *                                       and the one server-side claim is clamped to it
 *   owned-row-downward   R6      §4.6   no path writes a player-owned row downward
 *   breeding-random      §8.2           no random() in a live breeding/lineage path
 *   energy-commerce      §10.4          energy is never sold, gifted, or stipended
 *   todo-fixme           project rule   no unfinished-work markers in committed code
 *
 * Exit codes: 0 clean · 1 one or more gates failed · 2 the script itself broke.
 *
 * Usage:
 *   node scripts/verify-constitution.mjs               # all gates
 *   node scripts/verify-constitution.mjs --gate R6     # one gate, by id or rule
 *   node scripts/verify-constitution.mjs --show-baseline
 *   node scripts/verify-constitution.mjs --list
 *
 * ── Two kinds of exemption, both written down ──────────────────────────────
 *
 * 1. An inline marker, for a line that is genuinely not a violation:
 *
 *      // constitution-allow: owned-row-downward  ephemeral row, nothing owned
 *
 *    The gate id must match and the reason must run to at least 12 characters.
 *
 * 2. The BASELINE below, for violations that exist today and are retired by a
 *    named work package. Baseline findings are printed on every run and do not
 *    fail the build; anything not in the baseline does. Deleting a baseline
 *    entry is part of the WP that fixes it.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * The breeding-`random()` gate is ARMED (WP-1.05, migration 047). It shipped
 * disarmed while `breed_snakes()` and `reroll_lineage()` still rolled dice;
 * migration 047 redefines both — the draft is deterministic and the rerolls
 * are retired — so the gate reported zero findings and was armed in that PR.
 *
 * It now FAILS the build on any reintroduction. Do not set this back to
 * `false`: a finding here means a breeding or lineage path started rolling
 * again, which §8.2 forbids outright.
 * (`CONSTITUTION_ARM_BREEDING_RANDOM=1` also arms it for a single run — used
 * to prove the gate can fail. It can never disarm an armed gate.)
 */
const GATE_BREEDING_RANDOM_ARMED = true;

/**
 * Migrations 001–038 are the pre-Constitution schema (CLAUDE.md). Applied
 * history is not editable, so findings inside them are reported rather than
 * fatal; the fix for one is a superseding migration, which lands at 039+ and is
 * fully gated. The breeding gate deliberately ignores this baseline — it
 * resolves each function's *live* definition instead (see resolveLiveFunctions).
 */
const PRE_CONSTITUTION_MIGRATION_MAX = 38;

const SCAN_ROOTS = ['src', 'supabase', 'scripts', 'e2e'];

const SKIP_DIRS = new Set([
  'node_modules', '.next', '.git', 'coverage', 'build', 'dist', 'out',
  'test-results', 'playwright-report', '__snapshots__',
]);

// "Committed code". Documentation lives outside SCAN_ROOTS on purpose: the
// checklist and the PR template have to name the things the gates forbid.
const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.sql', '.py', '.sh',
]);

const SCANNER_PATH = 'scripts/verify-constitution.mjs';

const ALLOW_MARKER = /constitution-allow:\s*([A-Za-z0-9_-]+)\s+(.*)$/;
const MIN_ALLOW_REASON = 12;

/**
 * Known debt: real violations of a Rule that exist in the tree today, each
 * carrying the work package that removes it. `code` is matched against the
 * whitespace-collapsed offending line, so a *different* new violation in the
 * same file still fails.
 *
 * `max` is the number of findings the entry covered when it was written. Debt
 * may shrink; it may not grow. Exceeding the count fails the build even though
 * every individual line is baselined — otherwise "this file is known-bad" would
 * be a licence to add more.
 */
const BASELINE = [
  // ── R6 (owned-row-downward): EMPTY.
  //
  // One entry stood here on 2026-07-25: `src/app/api/clan/route.ts` hard-deleted
  // the `clan_members` row on leave, destroying `joined_at` — clan tenure, which
  // Rule 6 names as permanent (finding F-7). WP-1.02 closed it: the route no
  // longer deletes anything, and `leave_clan` / `remove_clan_member` (migration
  // 048) archive the membership span into `clan_membership_history` BEFORE
  // ending the membership, inside one transaction. Those two DELETEs carry
  // inline allow markers explaining exactly that.
  //
  // Do not re-add an entry here to land a change. Debt may shrink; it may not
  // grow.
  //
  // ── §10.4 (energy-commerce): EMPTY, and that is the point.
  //
  // Nine entries stood here on 2026-07-25. WP-0.01 (energy envelope) retired
  // five of them and WP-0.09 (commerce removal) the other four: the SKU
  // catalogue, the webhook's grant call, the premium perk config and the two
  // dead declarations (EnergyRefillSchema, the ENERGY_PURCHASED telemetry
  // window). Nothing in src/ or supabase/ 039+ trips this gate any more.
  //
  // Do not add an entry here to land a change. Debt may shrink; it may not
  // grow. A new §10.4 finding is a design decision, and it belongs in the
  // Constitution's Overturn Record before it belongs in this array.
];

// ---------------------------------------------------------------------------
// Source loading
// ---------------------------------------------------------------------------

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const abs = join(dir, entry);
    let stats;
    try {
      stats = statSync(abs);
    } catch {
      continue;
    }
    if (stats.isDirectory()) walk(abs, out);
    else if (SOURCE_EXTENSIONS.has(extname(entry))) out.push(abs);
  }
  return out;
}

/**
 * Blank out comments, preserving line numbers and offsets, so a gate scans
 * executable code rather than prose. String literals are tracked so a `//`
 * inside a URL does not swallow the rest of the line. `--` opens a comment
 * only in .sql, where `a--b` is not an expression; in JS/TS it is.
 */
function stripComments(source, ext) {
  const sqlLike = ext === '.sql';
  const hashLike = ext === '.py' || ext === '.sh';
  const out = source.split('');
  let index = 0;
  let quote = null;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (quote) {
      if (char === '\\' && !sqlLike) {
        index += 2;
        continue;
      }
      if (char === quote) quote = null;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      index += 1;
      continue;
    }
    const opensLineComment =
      (!sqlLike && !hashLike && char === '/' && next === '/') ||
      (sqlLike && char === '-' && next === '-') ||
      (hashLike && char === '#');
    if (opensLineComment) {
      while (index < source.length && source[index] !== '\n') {
        out[index] = ' ';
        index += 1;
      }
      continue;
    }
    if (!hashLike && char === '/' && next === '*') {
      while (
        index < source.length &&
        !(source[index] === '*' && source[index + 1] === '/')
      ) {
        if (source[index] !== '\n') out[index] = ' ';
        index += 1;
      }
      if (index < source.length) out[index] = ' ';
      if (index + 1 < source.length) out[index + 1] = ' ';
      index += 2;
      continue;
    }
    index += 1;
  }
  return out.join('');
}

/** Inline allow markers, keyed by the line they cover (their own, or the next). */
function collectAllowMarkers(rawLines) {
  const covered = new Map();
  const malformed = [];
  rawLines.forEach((line, offset) => {
    const match = line.match(ALLOW_MARKER);
    if (!match) return;
    const [, gate, rawReason] = match;
    const reason = rawReason.replace(/\*\/\s*$/, '').trim();
    const lineNumber = offset + 1;
    if (reason.length < MIN_ALLOW_REASON) {
      malformed.push({ line: lineNumber, gate, reason });
      return;
    }
    for (const target of [lineNumber, lineNumber + 1]) {
      if (!covered.has(target)) covered.set(target, new Map());
      covered.get(target).set(gate, reason);
    }
  });
  return { covered, malformed };
}

/** Migration serial number, or null for anything that is not a migration. */
function migrationNumber(path) {
  if (!path.startsWith('supabase/migrations/')) return null;
  const match = basename(path).match(/^(\d+)_/);
  return match ? Number(match[1]) : null;
}

function loadSources() {
  const files = [];
  for (const root of SCAN_ROOTS) {
    const abs = join(ROOT, root);
    if (existsSync(abs)) walk(abs, files);
  }
  return files.sort().map((abs) => {
    const raw = readFileSync(abs, 'utf8');
    const ext = extname(abs);
    const path = relative(ROOT, abs).split(sep).join('/');
    const { covered, malformed } = collectAllowMarkers(raw.split(/\r?\n/));
    const serial = migrationNumber(path);
    return {
      abs,
      path,
      ext,
      raw,
      rawLines: raw.split(/\r?\n/),
      code: stripComments(raw, ext),
      allow: covered,
      malformedAllow: malformed,
      migration: serial,
      preConstitution: serial !== null && serial <= PRE_CONSTITUTION_MIGRATION_MAX,
      isTest: /\.(test|spec)\./.test(path) || path.startsWith('e2e/'),
      // A scanner has to spell out the patterns it forbids, so this file is
      // exempt from the pattern gates — the same reason gateTodoFixme splits
      // its literals across a concatenation. It stays inside the marker gate,
      // which is fragment-safe.
      isScanner: path === SCANNER_PATH,
    };
  });
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

const collapse = (value) => value.replace(/\s+/g, ' ').trim();

function baselineEntryFor(gateId, file, text) {
  return BASELINE.find(
    (entry) =>
      entry.gate === gateId &&
      entry.path === file.path &&
      (entry.code === null || collapse(text ?? '').includes(entry.code))
  );
}

function makeReport(gateId, options = {}) {
  const findings = [];
  const usedBaseline = new Map();
  return {
    findings,
    usedBaseline,
    /** Record a violation at file:line. */
    flag(file, lineNumber, message, text) {
      if (file.allow.get(lineNumber)?.get(gateId)) return;
      const source = text ?? file.rawLines[lineNumber - 1] ?? '';
      let baseline = null;
      if (options.honourBaseline !== false) {
        const entry = baselineEntryFor(gateId, file, source);
        if (entry) {
          baseline = entry.reason;
          usedBaseline.set(entry, (usedBaseline.get(entry) ?? 0) + 1);
        } else if (file.preConstitution) {
          baseline = `pre-Constitution migration (≤${PRE_CONSTITUTION_MIGRATION_MAX}); ` +
            'applied history is superseded, never edited';
        }
      }
      findings.push({
        gate: gateId,
        path: file.path,
        line: lineNumber,
        message,
        baseline,
        text: collapse(source).slice(0, 150),
      });
    },
    /** Record a violation not tied to a source line. */
    flagFile(path, message) {
      findings.push({ gate: gateId, path, line: 0, message, baseline: null, text: '' });
    },
  };
}

/** Lines whose *code* (comments blanked) matches `pattern`. */
function* codeMatches(file, pattern) {
  const lines = file.code.split(/\r?\n/);
  for (let offset = 0; offset < lines.length; offset += 1) {
    const line = lines[offset];
    if (!line) continue;
    if (pattern.test(line)) yield { line: offset + 1, code: line };
  }
}

/** The 1-based line a character offset falls on. */
function lineOf(text, index) {
  let line = 1;
  for (let cursor = 0; cursor < index && cursor < text.length; cursor += 1) {
    if (text[cursor] === '\n') line += 1;
  }
  return line;
}

// ---------------------------------------------------------------------------
// Gate: score-independence (R2, Constitution §4.2)
// ---------------------------------------------------------------------------

const SCORE_AUTHORITY = 'src/shared/game/rulesets.ts';
const SCORE_ENGINE = 'src/lib/game/SnakeGameLogic.ts';

/** Any write into a score accumulator. */
const SCORE_WRITE = /\bscore\s*(?:\+=|-=|\*=|\/=|\|\|=|\?\?=|=(?!=))/;

/**
 * The only two shapes a score write may take in the scoring authority: score is
 * a fold over the food index `n` through the dynasty ruleset's own multiplier.
 * Nothing else may enter the accumulator.
 */
const SCORE_WRITE_ALLOWED = [
  /^let score = 0;$/,
  /^score \+= Math\.round\(FOOD_BASE_SCORE \* ruleset\.scoreMultiplier\(n\)\);$/,
];

/**
 * The client engine mirrors the fold, and NOTHING is layered on top.
 *
 * It used to layer the COSMIC combo — the one sanctioned extra factor,
 * server-clamped (GT §2.2). WP-3.13 deleted the combo, so this gate tightened
 * with it: the fold is now the whole expression on every dynasty, and any
 * extra factor is a violation rather than the sanctioned one.
 */
const ENGINE_SCORE_WRITE = /\bthis\.state\.score\s*(?:\+=|-=|\*=|=(?!=))/;
const ENGINE_SCORE_WRITE_ALLOWED = [/^this\.state\.score \+= scoreValue;$/];

/**
 * Wherever the engine puts FOOD_BASE_SCORE into an arithmetic expression, that
 * expression must be the fold. A bare mention (the import, a re-export) is not
 * a derivation and is skipped; an operator after the constant is.
 */
const SCORE_CONSTANT_IN_EXPRESSION = /FOOD_BASE_SCORE\s*[*+\-/]/;
const ENGINE_SCORE_EXPRESSION =
  /^FOOD_BASE_SCORE \* this\.ruleset\.scoreMultiplier\(n\)\s*[),;]/;

/** State a score multiplier may never consult. */
const BUILD_STATE_TOKENS =
  /\b(genome|gene|genes|strain|strains|splice|splices|heirloom|trait|traits|anomaly|anomalies|mutation|mutations|surge|surges|infuse|charge|charges|energy|purchase|premium|sku|entitlement|stripe|dna|wallet|balance|account|player|profile|streak|owned|equipped|cosmetic|lineage|generation|mastery)\b/i;

/** Widening this signature is how build state would reach the fold. */
const SCORE_MULTIPLIER_SIGNATURE = 'scoreMultiplier(n: number): number;';

/**
 * P-2 (raised by WP-0.05, closed by WP-0.06, CLOSED HARDER by WP-3.13).
 *
 * `sanitizeCosmicClaim` in the validator used to be the ONE server path that
 * could raise a score above the fold: COSMIC's combo was bounded trust rather
 * than a recompute, because the chain depended on tick timing the server
 * cannot reconstruct. This gate pinned the clamp's shape statically — that the
 * ceiling came from the fold times a named ratio, that an over-claim was
 * assigned the ceiling, and that the ratio at every call site was one of
 * exactly two constants (the Constellation Crown legitimately selected the
 * second at COSMIC M10).
 *
 * The COSMIC redesign deleted the combo, so there is no claim left to bound.
 * The gate did not weaken to match — it inverted, which is strictly stronger.
 * Instead of "the clamp must have this shape", the rule is now **there is no
 * clamp**: no claimed component may reach a recomputed score at all, on any
 * dynasty. Re-introducing a bounded-trust score path would have to re-argue
 * for it here rather than inherit a carve-out that was written for a mechanic
 * that no longer exists.
 *
 * DNA is untouched by this. Bounded-trust DNA claims are ordinary and
 * numerous (Midas, Ricochet, Ouroboros, the genome claim block); it is SCORE
 * that Rule 2 makes structurally unable to read anything but play.
 */
const SCORE_CLAMP_AUTHORITY = 'src/lib/server/gameValidator.ts';

/**
 * Tokens that would mean a claimed score component came back. Matched against
 * the validator's code, and every one of them must be absent.
 */
const SCORE_CLAIM_TOKENS = [
  {
    pattern: /sanitizeCosmicClaim/,
    what: 'the COSMIC combo claim sanitizer',
  },
  {
    pattern: /comboScoreBonus/,
    what: 'a combo score bonus added to the recompute',
  },
  {
    pattern: /COSMIC_TRUST_MAX_BONUS_RATIO|crownTrustMaxBonusRatio/,
    what: 'a bounded-trust ratio for a score claim',
  },
];

/** Writes into the validator's recomputed score. */
const VALIDATOR_SCORE_WRITE =
  /\bexpectedScore\s*(?:\+=|-=|\*=|\/=|\|\|=|\?\?=|=(?!=))/;

/**
 * The fold, and only the fold. There is deliberately no `+=` form here: an
 * addend is exactly how a claim used to reach the score, and `const` makes
 * the accumulator un-addable in the type system as well as in this gate.
 */
const VALIDATOR_SCORE_WRITE_ALLOWED = [
  /^const expectedScore = baseScore;$/,
  /^const expectedScore = totals\.score;$/,
];

/** The runtime proof of the same rule; deleting it is itself a violation. */
const SCORE_PROOF_TESTS = [
  {
    path: 'src/shared/game/rulesets.genome.test.ts',
    needle: 'score is never genome-shaped',
  },
  {
    path: 'src/shared/game/rulesets.traits.test.ts',
    needle: 'never touch score',
  },
];

function gateScoreIndependence(files) {
  const report = makeReport('score-independence');
  const authority = files.find((file) => file.path === SCORE_AUTHORITY);

  if (!authority) {
    report.flagFile(
      SCORE_AUTHORITY,
      'the scoring authority is missing — R2 cannot be verified; point this gate at its replacement'
    );
  } else {
    let writes = 0;
    for (const { line, code } of codeMatches(authority, SCORE_WRITE)) {
      writes += 1;
      const statement = collapse(code);
      if (!SCORE_WRITE_ALLOWED.some((allowed) => allowed.test(statement))) {
        report.flag(
          authority,
          line,
          'writes the score accumulator outside the canonical fold ' +
            '`score += Math.round(FOOD_BASE_SCORE * ruleset.scoreMultiplier(n))`'
        );
      }
    }
    if (writes === 0) {
      report.flagFile(
        SCORE_AUTHORITY,
        'no score fold found — this gate is pointed at the wrong file and proves nothing'
      );
    }

    for (const { line, code } of codeMatches(authority, /scoreMultiplier\s*:/)) {
      if (BUILD_STATE_TOKENS.test(collapse(code))) {
        report.flag(authority, line, 'a dynasty scoreMultiplier reads build or account state');
      }
    }

    const hasSignature = authority.code
      .split(/\r?\n/)
      .some((line) => collapse(line) === SCORE_MULTIPLIER_SIGNATURE);
    if (!hasSignature) {
      report.flagFile(
        SCORE_AUTHORITY,
        `DynastyRuleset.scoreMultiplier no longer declares exactly \`${SCORE_MULTIPLIER_SIGNATURE}\` — ` +
          'a widened signature is how build state reaches the score fold'
      );
    }
  }

  const engine = files.find((file) => file.path === SCORE_ENGINE);
  if (engine) {
    for (const { line, code } of codeMatches(engine, ENGINE_SCORE_WRITE)) {
      const statement = collapse(code);
      if (!ENGINE_SCORE_WRITE_ALLOWED.some((allowed) => allowed.test(statement))) {
        report.flag(
          engine,
          line,
          'the engine writes score outside `this.state.score += scoreValue` — ' +
            'R2: the client mirror folds the same number the server recomputes'
        );
      }
    }
    const engineLines = engine.code.split(/\r?\n/);
    engineLines.forEach((line, offset) => {
      const at = line.indexOf('FOOD_BASE_SCORE');
      if (at < 0) return;
      // The expression can wrap; read a short window from the constant onward.
      const expression = collapse(
        [line.slice(at), engineLines[offset + 1] ?? '', engineLines[offset + 2] ?? ''].join(' ')
      );
      if (!SCORE_CONSTANT_IN_EXPRESSION.test(expression)) return;
      if (ENGINE_SCORE_EXPRESSION.test(expression)) return;
      report.flag(
        engine,
        offset + 1,
        'a score value is derived from something other than ' +
          '`FOOD_BASE_SCORE * ruleset.scoreMultiplier(n)` (× the clamped COSMIC combo)',
        line
      );
    });
  }

  // P-2: there is no claimed score component, and no way back to one.
  const clampAuthority = files.find((file) => file.path === SCORE_CLAMP_AUTHORITY);
  if (!clampAuthority) {
    report.flagFile(
      SCORE_CLAMP_AUTHORITY,
      'the server validator is missing — R2 cannot be verified on the server ' +
        'side; point this gate at its replacement'
    );
  } else {
    for (const { pattern, what } of SCORE_CLAIM_TOKENS) {
      for (const { line, code } of codeMatches(clampAuthority, pattern)) {
        report.flag(
          clampAuthority,
          line,
          `${what} is back in the validator — since WP-3.13 no claimed ` +
            'component may reach a recomputed score on any dynasty',
          collapse(code)
        );
      }
    }

    let validatorWrites = 0;
    for (const { line, code } of codeMatches(clampAuthority, VALIDATOR_SCORE_WRITE)) {
      validatorWrites += 1;
      const statement = collapse(code);
      if (!VALIDATOR_SCORE_WRITE_ALLOWED.some((allowed) => allowed.test(statement))) {
        report.flag(
          clampAuthority,
          line,
          'the validator writes its recomputed score outside the fold — ' +
            'R2: the score it pays is the score it derives, with no addend'
        );
      }
    }
    if (validatorWrites === 0) {
      report.flagFile(
        SCORE_CLAMP_AUTHORITY,
        'no recomputed-score accumulator found — this half of the gate is pointed ' +
          'at the wrong file and proves nothing'
      );
    }
  }

  for (const proof of SCORE_PROOF_TESTS) {
    const abs = join(ROOT, proof.path);
    if (!existsSync(abs) || !readFileSync(abs, 'utf8').includes(proof.needle)) {
      report.flagFile(
        proof.path,
        `the runtime proof of R2 ("${proof.needle}") is gone — restore it, or replace it in this gate`
      );
    }
  }

  return report;
}

// ---------------------------------------------------------------------------
// Gate: owned-row-downward (R6, Constitution §4.6)
// ---------------------------------------------------------------------------

/**
 * R6's own nouns — "records, cosmetics, tracks, tenure, lineage, history" —
 * resolved to the tables that hold them. Matched against the table a statement
 * names, never against the whole line, so an unrelated identifier that happens
 * to contain "record" cannot trip the gate.
 */
const OWNED_TABLE_PATTERNS = [
  /cosmetic/i, /record/i, /achievement/i, /codex/i, /discover/i, /collection/i,
  /inventory/i, /entitlement/i, /chronicle/i, /mastery/i, /heirloom/i,
  /^collected_snakes$/i, /breeding_history/i, /lineage/i, /variant/i,
  /battle_pass/i, /streak/i, /tenure/i, /clan_member/i, /training_bests/i,
  /player_title/i, /badge/i, /handle_events/i, /champion/i,
  // WP-3.12. `player_ladders.best_rung` is the highest ladder rung a player has
  // banked — a record in R6's sense, and one none of the patterns above happens
  // to match. Added WITH the table rather than after it, so the gate covers
  // migration 057 from its first line: `record_ladder_rung` updates via
  // GREATEST, and an author who later replaces that with `EXCLUDED.best_rung`
  // (`best` is a MONOTONIC_COLUMN) fails the build instead of shipping a
  // demotion. Widening this list is always allowed; narrowing it is a Rule 6
  // decision.
  /ladder/i,
];

/** Catalogues and definitions are content, not player property. */
const NOT_OWNED = /_definitions?$|^battle_pass_(seasons|tiers)$|_tiers$|^training_presets$/i;

function tableIsOwned(name) {
  const table = name.replace(/^public\./i, '');
  if (NOT_OWNED.test(table)) return false;
  return OWNED_TABLE_PATTERNS.some((pattern) => pattern.test(table));
}

/** Supabase client: `.from('table')` … `.delete()` in one chain. */
const SUPABASE_DELETE = /\.from\(\s*['"`]([A-Za-z0-9_.]+)['"`]\s*\)[\s\S]{0,400}?\.delete\s*\(/g;

/** SQL row destruction. */
const SQL_DESTRUCTIVE =
  /\b(?:delete\s+from|truncate(?:\s+table)?|drop\s+table(?:\s+if\s+exists)?)\s+([A-Za-z0-9_."]+)/gi;

/** SQL `UPDATE <table> SET …` up to the WHERE/RETURNING/terminator. */
const SQL_UPDATE =
  /\bupdate\s+(?:only\s+)?([A-Za-z0-9_."]+)\s+set\b([\s\S]{0,700}?)(?=;|\bwhere\b|\breturning\b|\bfrom\b)/gi;

/** `col = col - x`, `col = 0`, `col = false` — a stored value written downward. */
const SQL_DECREMENT = /\b([a-z0-9_]+)\s*=\s*(?:greatest\s*\(\s*)?\1\s*-\s*/i;
const SQL_ZEROED = /\b([a-z0-9_]+)\s*=\s*(?:0|false)\b/i;

/** `ON CONFLICT … DO UPDATE SET col = EXCLUDED.col` with no monotonic guard. */
const SQL_UPSERT_OVERWRITE =
  /on\s+conflict\b[\s\S]{0,200}?do\s+update\s+set\b([\s\S]{0,500}?)(?=;|\bwhere\b|\breturning\b)/gi;
/**
 * A column whose whole point is that it only ever goes up.
 *
 * The boundaries are `^`, `$` and `_` rather than `\b`, because `\b` does not
 * fire across an underscore: `\bbest\b` does NOT match `best_rung`, and neither
 * does `\brung\b`. WP-3.12 found that the hard way — `player_ladders.best_rung`
 * was invisible to this gate, so an `ON CONFLICT DO UPDATE SET best_rung =
 * EXCLUDED.best_rung` (a straightforward demotion of an earned record) passed
 * clean. Snake_case is the house style for every column this gate exists to
 * protect, so matching a bare word was matching almost none of them.
 */
const MONOTONIC_COLUMN =
  /(?:^|_|\b)(value|tier|level|count|best|total|score|generation|strength|rank|progress|xp|rung)(?:_|\b|$)/i;

/**
 * Supabase client: `.from('table')` … `.update({ … })`. Only the write payload
 * is inspected, so `unlocked: false` in a *response* shape — the ordinary way
 * to describe a not-yet-earned thing — cannot trip the gate.
 */
const SUPABASE_UPDATE =
  /\.from\(\s*['"`]([A-Za-z0-9_.]+)['"`]\s*\)[\s\S]{0,400}?\.(?:update|upsert)\s*\(\s*\{([\s\S]{0,500}?)\}/g;

/** A payload field that takes an owned thing away. */
const DOWNWARD_FIELD =
  /\b(?:revoked|confiscated|forfeited|expired)\s*:\s*true\b|\b(?:is_owned|owned|unlocked|is_unlocked|permanent|earned|granted)\s*:\s*false\b|\b([a-z_]+)\s*:\s*[\w.]*\1\s*-\s*\d/i;

function gateOwnedRowDownward(files) {
  const report = makeReport('owned-row-downward');

  for (const file of files) {
    if (file.isTest || file.isScanner) continue;

    if (file.ext === '.ts' || file.ext === '.tsx') {
      for (const match of file.code.matchAll(SUPABASE_DELETE)) {
        if (!tableIsOwned(match[1])) continue;
        report.flag(
          file,
          lineOf(file.code, match.index),
          `deletes from the player-owned table \`${match[1]}\` — R6: earned things are permanent`,
          match[0]
        );
      }
      for (const match of file.code.matchAll(SUPABASE_UPDATE)) {
        if (!tableIsOwned(match[1])) continue;
        if (!DOWNWARD_FIELD.test(match[2])) continue;
        report.flag(
          file,
          lineOf(file.code, match.index),
          `revokes or decrements a field on the player-owned table \`${match[1]}\` — ` +
            'R6: earned things are permanent',
          collapse(match[0])
        );
      }
    }

    if (file.ext !== '.sql') continue;

    for (const match of file.code.matchAll(SQL_DESTRUCTIVE)) {
      const table = match[1].replace(/"/g, '');
      if (!tableIsOwned(table)) continue;
      report.flag(
        file,
        lineOf(file.code, match.index),
        `destroys rows in the player-owned table \`${table}\` — R6: earned things are permanent`,
        match[0]
      );
    }

    for (const match of file.code.matchAll(SQL_UPDATE)) {
      const table = match[1].replace(/"/g, '');
      if (!tableIsOwned(table)) continue;
      const assignments = match[2];
      const decrement = assignments.match(SQL_DECREMENT);
      const zeroed = assignments.match(SQL_ZEROED);
      const column = decrement?.[1] ?? (zeroed && MONOTONIC_COLUMN.test(zeroed[1]) ? zeroed[1] : null);
      if (!column) continue;
      report.flag(
        file,
        lineOf(file.code, match.index),
        `writes \`${table}.${column}\` downward — R6: no path writes a player-owned row downward`,
        `UPDATE ${table} SET ${collapse(assignments).slice(0, 90)}`
      );
    }

    for (const match of file.code.matchAll(SQL_UPSERT_OVERWRITE)) {
      const assignments = match[1];
      const overwrites = [...assignments.matchAll(/\b([a-z0-9_]+)\s*=\s*excluded\.\1\b/gi)]
        .map((entry) => entry[1])
        .filter((column) => MONOTONIC_COLUMN.test(column));
      if (overwrites.length === 0) continue;
      // A monotonic guard anywhere in the assignment block is the fix.
      if (/\bgreatest\s*\(/i.test(assignments)) continue;
      const before = file.code.slice(0, match.index);
      const target = [...before.matchAll(/\binsert\s+into\s+([A-Za-z0-9_."]+)/gi)].pop();
      const table = target ? target[1].replace(/"/g, '') : '';
      if (!table || !tableIsOwned(table)) continue;
      report.flag(
        file,
        lineOf(file.code, match.index),
        `upserts \`${table}\` overwriting ${overwrites.join(', ')} with EXCLUDED and no GREATEST() — ` +
          'a shrinking source aggregate writes an earned row downward (R6)',
        `ON CONFLICT DO UPDATE SET ${collapse(assignments).slice(0, 90)}`
      );
    }
  }

  return report;
}

// ---------------------------------------------------------------------------
// Gate: breeding-random (Constitution §8.2) — DISARMED until WP-1.05
// ---------------------------------------------------------------------------

/**
 * The breeding/lineage path, matched on identity rather than a file list so the
 * gate survives WP-1.05 moving the code.
 */
const BREEDING_PATH =
  /(breed|lineage|ancestry|pedigree|heirloom|offspring|hatch|nursery|reroll|inheritance|inherit)/i;

/** Bare RNG. `gen_random_uuid(` does not match — "random" is not followed by "(". */
const RANDOM_CALL = /(?:\bMath\.random\s*\(|\bcrypto\.getRandomValues\s*\(|(?<![\w])random\s*\()/;

/** A UUID laundered into a number or an ordering is RNG wearing a disguise. */
const LAUNDERED_UUID =
  /\b(?:gen_random_uuid|randomUUID)\s*\(\s*\)[\s\S]{0,80}?(?:hashtext|::text|floor\s*\(|mod\s*\()|order\s+by[\s\S]{0,60}?(?:gen_random_uuid|randomUUID)\s*\(/i;

/**
 * Postgres functions are redefined across migrations; only the newest
 * definition runs. Resolve each name to its live body so a fixed function stops
 * failing the gate without anyone rewriting applied history.
 */
function resolveLiveFunctions(files) {
  const live = new Map();
  const definition = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi;
  for (const file of files) {
    if (file.ext !== '.sql') continue;
    const matches = [...file.code.matchAll(definition)];
    matches.forEach((match, index) => {
      const name = match[1].toLowerCase();
      const start = match.index;
      const end = index + 1 < matches.length ? matches[index + 1].index : file.code.length;
      const previous = live.get(name);
      const serial = file.migration ?? Number.MAX_SAFE_INTEGER;
      if (previous && previous.serial > serial) return;
      live.set(name, { name, file, start, end, serial });
    });
  }
  return [...live.values()];
}

function gateBreedingRandom(files) {
  // Applied history is irrelevant here: only the live definition can roll dice.
  const report = makeReport('breeding-random', { honourBaseline: false });

  for (const block of resolveLiveFunctions(files)) {
    if (!BREEDING_PATH.test(block.name)) continue;
    const body = block.file.code.slice(block.start, block.end);
    const lines = body.split(/\r?\n/);
    const offset = lineOf(block.file.code, block.start) - 1;
    lines.forEach((line, index) => {
      if (!RANDOM_CALL.test(line) && !LAUNDERED_UUID.test(line)) return;
      report.flag(
        block.file,
        offset + index + 1,
        `random() in the live definition of \`${block.name}()\` — ` +
          '§8.2: the draft is deterministic, preview equals outcome',
        line
      );
    });
  }

  for (const file of files) {
    if (file.ext !== '.ts' && file.ext !== '.tsx') continue;
    if (file.isTest || file.isScanner) continue;
    const inBreedingFile = BREEDING_PATH.test(file.path);
    for (const { line, code } of codeMatches(file, RANDOM_CALL)) {
      if (!inBreedingFile && !BREEDING_PATH.test(code)) continue;
      report.flag(
        file,
        line,
        'random() in a breeding/lineage path — ' +
          '§8.2: the draft is deterministic, preview equals outcome',
        code
      );
    }
  }

  return report;
}

// ---------------------------------------------------------------------------
// Gate: energy-commerce (Constitution §10.4, §8.6)
// ---------------------------------------------------------------------------

/**
 * §8.6: "Energy is never sold, gifted, stipended, or touched by any SKU or
 * perk." The gate is written against that sentence, not against today's file
 * layout — WP-0.01 is rewriting the energy code and WP-0.09 is deleting the
 * SKUs, and the gate has to stay meaningful (and green) on the far side of
 * both. A violation is the co-occurrence of a commercial concept and an energy
 * grant/consume within one function-sized window. If either side's files are
 * deleted, the gate simply finds nothing.
 */
/**
 * An energy quantity being *set* — an identifier whose name carries energy or
 * charges (`energy`, `p_energy`, `energyGranted`, `stipendEnergyPerDay`,
 * `reward_energy`, `charges_remaining`), in an assignment or property
 * position, taking a non-zero value.
 *
 * Deliberately identifier-shaped: player-facing prose ("Energy Restored",
 * "free of charge", "a daily energy stipend" in the terms) mentions energy
 * constantly and grants nothing. Copy is Rule 7's business, not this gate's.
 */
const ENERGY_GRANT =
  /(?:^|[^\w$])([A-Za-z0-9_$]*(?:energy|charges?)[A-Za-z0-9_$]*)\s*(?::|\+=|=(?!=))\s*(?!(?:0|false|null|undefined|number|string|boolean)\b)['"`\d[{(A-Za-z_$]/i;

/** SQL: `SET energy = energy + …`, and the RPC parameters that feed it. */
const ENERGY_GRANT_SQL =
  /\bset\s+[A-Za-z0-9_]*(?:energy|charges?)[A-Za-z0-9_]*\s*=|\bp_[A-Za-z0-9_]*(?:energy|charges?)[A-Za-z0-9_]*\b/i;

/**
 * Deliberately boundary-free at the start: `grant_patron_pack`, `p_sku`,
 * `applyPurchaseRewards` and `premium_stipend_claims` are all commerce, and a
 * leading `\b` would miss every snake_case and camelCase one of them.
 * `product(?!ion)` keeps the build scripts' "production" out of it.
 */
const COMMERCE_SUBJECT =
  /(?:stripe|checkout|purchas|payment|\bpaid\b|price_?id|\bskus?\b|product(?!ion)|bundle|subscri|entitlement|perk|premium|keeper|patron|season_?pass|battle_?pass|webhook|invoice|receipt|order_?id|stipend)/i;

const ENERGY_WINDOW = 12;

function gateEnergyCommerce(files) {
  const report = makeReport('energy-commerce');

  for (const file of files) {
    if (file.isTest || file.isScanner) continue;
    const lines = file.code.split(/\r?\n/);

    for (let offset = 0; offset < lines.length; offset += 1) {
      const line = lines[offset];
      if (!line) continue;
      if (!ENERGY_GRANT.test(line) && !ENERGY_GRANT_SQL.test(line)) continue;

      const window = lines
        .slice(Math.max(0, offset - ENERGY_WINDOW), offset + ENERGY_WINDOW + 1)
        .join('\n');
      if (!COMMERCE_SUBJECT.test(window)) continue;

      report.flag(
        file,
        offset + 1,
        'an energy grant/consume path sits inside a purchase or perk path — §10.4: ' +
          'energy is never sold, gifted, stipended, or touched by any SKU or perk',
        line
      );
    }
  }

  return report;
}

// ---------------------------------------------------------------------------
// Gate: todo-fixme (project rule — complete implementations only)
// ---------------------------------------------------------------------------

/**
 * Assembled from fragments deliberately. This file, the checklist and the PR
 * template all have to *name* the markers while describing the gate; splitting
 * the literals keeps the gate from firing on its own source. Documentation is
 * out of SCAN_ROOTS, which covers the other two.
 */
const MARKER_WORDS = ['TO' + 'DO', 'FIX' + 'ME', 'XX' + 'X', 'HA' + 'CK'];
const MARKER_PATTERN = new RegExp(`\\b(${MARKER_WORDS.join('|')})\\b`);

function gateTodoFixme(files) {
  const report = makeReport('todo-fixme');
  for (const file of files) {
    file.rawLines.forEach((line, offset) => {
      if (!MARKER_PATTERN.test(line)) return;
      report.flag(
        file,
        offset + 1,
        `${MARKER_WORDS[0]}/${MARKER_WORDS[1]} marker in committed code — ` +
          'complete implementations only (CLAUDE.md; handoff §2.5)',
        line
      );
    });
  }
  return report;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const GATES = [
  {
    id: 'score-independence',
    rule: 'R2',
    title: 'the score fold reads only food events and the dynasty ruleset',
    run: gateScoreIndependence,
  },
  {
    id: 'owned-row-downward',
    rule: 'R6',
    title: 'no code path writes a player-owned row downward',
    run: gateOwnedRowDownward,
  },
  {
    id: 'breeding-random',
    rule: '§8.2',
    title: 'no random() in a live breeding/lineage path',
    run: gateBreedingRandom,
    armed:
      GATE_BREEDING_RANDOM_ARMED ||
      process.env.CONSTITUTION_ARM_BREEDING_RANDOM === '1',
    disarmedNote:
      'reporting only until WP-1.05 (Lineage rework) lands. Arm it by setting ' +
      'GATE_BREEDING_RANDOM_ARMED = true in scripts/verify-constitution.mjs.',
  },
  {
    id: 'energy-commerce',
    rule: '§10.4',
    title: 'no energy grant/consume path reachable from a purchase or perk',
    run: gateEnergyCommerce,
  },
  {
    id: 'todo-fixme',
    rule: 'project rule',
    title: `no ${MARKER_WORDS[0]}/${MARKER_WORDS[1]} markers in committed code`,
    run: gateTodoFixme,
  },
];

function parseArguments(argv) {
  const options = { gates: null, list: false, showBaseline: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--list') {
      options.list = true;
    } else if (argument === '--show-baseline') {
      options.showBaseline = true;
    } else if (argument === '--gate') {
      const value = argv[index + 1];
      if (!value) throw new Error('--gate needs a gate id or rule (e.g. --gate R6)');
      options.gates = (options.gates ?? []).concat(value);
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
  }
  return options;
}

function main() {
  const options = parseArguments(process.argv.slice(2));

  if (options.list) {
    for (const gate of GATES) {
      console.log(`${gate.id.padEnd(20)} ${String(gate.rule).padEnd(13)} ${gate.title}`);
    }
    return 0;
  }

  const selected = options.gates
    ? GATES.filter((gate) =>
        options.gates.some(
          (value) =>
            value.toLowerCase() === gate.id.toLowerCase() ||
            value.toLowerCase() === String(gate.rule).toLowerCase()
        )
      )
    : GATES;

  if (selected.length === 0) {
    console.error(`No gate matched ${options.gates.join(', ')}. Try --list.`);
    return 2;
  }

  const files = loadSources();
  if (files.length === 0) {
    console.error('verify:constitution scanned zero files — check SCAN_ROOTS.');
    return 2;
  }

  let violations = 0;
  let reported = 0;
  const baselineUsed = new Map();

  // An allow marker nobody can read is not an allowlist entry.
  for (const file of files) {
    for (const entry of file.malformedAllow) {
      console.error(
        `FAIL   ${file.path}:${entry.line}  constitution-allow: ${entry.gate} — reason too short ` +
          `(needs ${MIN_ALLOW_REASON}+ characters, got ${entry.reason.length})`
      );
      violations += 1;
    }
  }

  for (const gate of selected) {
    const report = gate.run(files);
    const armed = gate.armed ?? true;
    for (const [entry, count] of report.usedBaseline) {
      baselineUsed.set(entry, (baselineUsed.get(entry) ?? 0) + count);
    }

    const blocking = report.findings.filter((finding) => !finding.baseline);
    const tolerated = report.findings.filter((finding) => finding.baseline);
    const status = blocking.length > 0 && armed ? 'FAIL' : blocking.length > 0 ? 'REPORT' : 'PASS';

    console.log(`${status.padEnd(6)} ${gate.id} (${gate.rule}) — ${gate.title}`);
    if (!armed) console.log(`       DISARMED: ${gate.disarmedNote}`);

    for (const finding of blocking) {
      const location = finding.line > 0 ? `${finding.path}:${finding.line}` : finding.path;
      console.log(`  ${location}  ${finding.message}`);
      if (finding.text) console.log(`      ${finding.text}`);
    }
    for (const finding of tolerated) {
      console.log(`  baseline  ${finding.path}:${finding.line}  ${finding.baseline}`);
    }

    if (armed) violations += blocking.length;
    else reported += blocking.length;
    reported += tolerated.length;
  }

  for (const [entry, count] of baselineUsed) {
    if (typeof entry.max !== 'number' || count <= entry.max) continue;
    console.error(
      `FAIL   ${entry.path}  ${entry.gate}: baselined debt grew from ${entry.max} to ${count} ` +
        'finding(s). The baseline records existing debt; it does not license more.'
    );
    violations += 1;
  }

  const stale = BASELINE.filter(
    (entry) =>
      !baselineUsed.has(entry) &&
      selected.some((gate) => gate.id === entry.gate) &&
      !options.gates
  );
  if (stale.length > 0 || options.showBaseline) {
    console.log('');
    for (const entry of stale) {
      console.log(
        `NOTICE baseline entry is now clean and should be deleted: ` +
          `${entry.gate} · ${entry.path}`
      );
    }
    if (options.showBaseline) {
      for (const entry of BASELINE) {
        console.log(`BASELINE ${entry.gate} · ${entry.path} — ${entry.reason}`);
      }
    }
  }

  console.log('');
  if (violations > 0) {
    console.error(
      `verify:constitution FAILED — ${violations} unbaselined violation(s). Fix them, or add a ` +
        '`constitution-allow: <gate> <reason>` comment a reviewer can check.'
    );
    return 1;
  }
  console.log(
    `verify:constitution PASSED — ${selected.length} gate(s) over ${files.length} files` +
      (reported > 0 ? `; ${reported} known finding(s) reported, none blocking` : '')
  );
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 2;
}
