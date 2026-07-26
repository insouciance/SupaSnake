-- ############################################################################
-- ##                                                                        ##
-- ##  MIGRATION 055 — NOT APPLIED TO ANY DATABASE BY THIS WORK PACKAGE.     ##
-- ##                                                                        ##
-- ##  WP-2.05 wrote and reviewed this file and deliberately did NOT run     ##
-- ##  `supabase db push`, `db reset`, `link` or `start`. Applying it to     ##
-- ##  staging and then production is an owner decision, taken with the      ##
-- ##  release runbook (docs/ops/RELEASE_RUNBOOK.md) in hand.                ##
-- ##                                                                        ##
-- ##  RELEASE ORDER: deploy the app -> apply 054 -> apply 055 -> invoke the ##
-- ##  Serpent and Signal ops settlement routes once -> record this file's   ##
-- ##  NOTICE output in the build log.                                       ##
-- ##                                                                        ##
-- ##  SEPARATE FILE ON PURPOSE: an abort here leaves 054 applied and        ##
-- ##  harmless (one nullable column and two comments).                      ##
-- ##                                                                        ##
-- ############################################################################
--
-- Migration 055: give back what the flag wrongly withheld
--
-- Authority: docs/PRODUCT_CONSTITUTION.md Rule 6 (what a player earned is
-- permanent), owner ruling 3 of docs/ops/PLAYTEST_WAVE.md (2026-07-26):
-- "backfill = counters and boards", and the owner's ruling on the defect
-- itself: "in no way can that score be taken away".
--
-- THE DEFECT THIS REPAIRS
--
--   `game_sessions.validated` collapsed every validator finding into one
--   boolean. A run whose only sin was disagreeing with the server's own
--   arithmetic by 3 DNA was stamped exactly like a forged one, and that
--   stamp is read by the banked-run ramp (FTUE, tier cap, heirloom), the
--   leaderboard, the Codex gate and `players.high_score`. In the owner's
--   first real playtest 27 sessions carried `validated = false` and roughly
--   ten of them were legitimate extractions.
--
--   WP-2.05 reclassifies at the stamping site: FALSE is now set by exactly
--   two codes (INVALID_DURATION, SPLICE_CLAIMED_DIRECTLY - see the COMMENT
--   ON COLUMN added by 054). This migration applies the same rule to the
--   rows already written.
--
-- WHAT IS RESTORED, AND WHAT IS DELIBERATELY NOT
--
--   RESTORED
--     1. `validated = TRUE` on settled, non-practice rows whose recorded
--        codes are ALL advisory. Nothing else about the row is touched.
--     2. `players.high_score`, recomputed through GREATEST from the rows
--        that are now eligible - so it can only ever rise.
--     3. `refresh_player_records` per affected player. That RPC is GREATEST
--        throughout, so a Record can rise and never fall.
--     4. Codex discoveries, re-derived by replaying `record_codex_
--        discoveries` over the newly-eligible rows in `ended_at` order.
--        This is safe and honest because the RPC is idempotent by
--        construction (`ON CONFLICT DO NOTHING`, reward only on insert) and
--        the accepted genome is stored on the row itself. Chronological
--        order keeps world-first attribution truthful.
--
--   NOT RE-CREDITED, each with its reason
--     - DNA, `players.total_dna_earned`, `game_sessions.yield_dna`: never
--       gated on `validated`. They were paid in full at settlement, and
--       paying again would be a duplicate grant, not a repair.
--     - Mastery XP: gated on `extracted`, not on `validated`. Already
--       granted.
--     - `players.total_games_played`: never gated. Already counted.
--     - The Daily Take: never reads `game_sessions` at all.
--
-- THE CODE UNIVERSE IS KNOWABLE, SO THE ALLOWLIST IS COMPLETE
--
--   All nine historical revisions of the validator were walked. Two codes
--   existed and no longer do - INVALID_DNA and INVALID_SCORE - and both were
--   advisory by construction (a claim mismatch that never changed a payout).
--   They are in the allowlist below for exactly that reason. Every other
--   code that has ever been written to `validation_errors` is still emitted
--   by the current validator and is classified in
--   VALIDATION_CODE_SEVERITY (src/lib/server/gameValidator.ts), which a
--   source-scan test pins against this list.
--
--   The unknown-code branch is therefore a TRIPWIRE that should find zero
--   rows. It RAISEs a NOTICE and leaves those rows alone; it never aborts.
--
-- THE DELIBERATE ASYMMETRY WITH THE RUNTIME DEFAULT
--
--   At runtime an unrecognised code is treated as ADVISORY: a future author
--   who forgets the table must never cost a live player their progression.
--   HERE an unrecognised code SKIPS the row: a code whose semantics nobody
--   has read must never put a row onto a public board. Same missing
--   knowledge, opposite defaults, both chosen so the error is survivable.
--
-- PARSING
--
--   `validation_errors` is JSONB (migration 002), not text. Codes are parsed
--   with `jsonb_array_elements_text` + `split_part(value, ':', 1)` - exact,
--   and far safer than a LIKE scan that could match a code inside a message
--   body. A row whose blob is not a JSON array is treated as unclassifiable
--   and skipped, with a NOTICE.
--
-- SAFETY
--
--   One transaction. Pre-snapshots of every table this could touch, taken
--   before the first write. Assertions before COMMIT covering: no run loses
--   validation, no settled value is rewritten, every re-stamped row was
--   advisory-only, no fatal-coded row is re-stamped, completeness, and
--   Rule 6 on every player-owned scalar and every Record. Any failure rolls
--   the whole thing back. Idempotent: a second run re-stamps nothing,
--   because the rows it would select are already TRUE.
--
-- DOWN-NOTE (forward-only): there is no down migration, and there should not
--   be. Reversing would mean writing `validated = FALSE` back onto runs that
--   earned TRUE - a downward write on a player-owned fact, which Rule 6
--   forbids outright. The snapshot tables below are dropped at the end of
--   the transaction; to keep them for an audit, comment out the two DROPs.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Guard: 054 must be applied first
-- ---------------------------------------------------------------------------
-- Not because this migration reads `run_context` (it does not), but because
-- applying the backfill without the redefinition comment would leave the
-- database re-stamped and the schema still describing the old semantics.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'game_sessions' AND column_name = 'run_context'
  ) THEN
    RAISE EXCEPTION
      'Migration 055 requires 054 (game_sessions.run_context) to be applied first';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. The severity allowlist, as data
-- ---------------------------------------------------------------------------
-- A temp table rather than an inline array so the assertions below can join
-- against it and the NOTICE output can name what it did not recognise.

CREATE TEMP TABLE wp205_advisory_codes(code TEXT PRIMARY KEY) ON COMMIT DROP;

INSERT INTO wp205_advisory_codes(code) VALUES
  -- The divergence signal itself. The payout was ALWAYS the server
  -- recompute, so a mismatch is forensic information and never a fine.
  ('DNA_MISMATCH'),
  ('SCORE_MISMATCH'),
  -- Retired codes. Present in historical rows only; both were claim
  -- mismatches that never changed a payout - the same class as the two
  -- above, under their former names.
  ('INVALID_DNA'),
  ('INVALID_SCORE'),
  -- Bounded-trust clamps. The clamp already did the entire job.
  ('CLAIM_CLAMPED'),
  ('GENOME_GLOBAL_CLAMP'),
  ('COSMIC_COMBO'),
  -- Shape and legality repairs: the offending entry was dropped and the
  -- payout recomputed from what survived.
  ('INVALID_MUTATIONS'),
  ('INVALID_GENES'),
  ('MUTATION_LOCKED'),
  ('GENE_LOCKED'),
  ('MUTATION_BOUND'),
  ('GENE_BOUND'),
  ('INFUSE_BOUND'),
  ('SURGE_INVALID'),
  ('REVIVE_INVALID'),
  ('PHOENIX_INVALID'),
  -- The unwired Ascetic suppression: the server stripped picks the client
  -- had legally offered. WP-2.05 narrows the clause; these rows were the
  -- defect, not the cheat.
  ('TRAIT_CONFLICT'),
  -- Outcome and food-count repairs. INVALID_FOOD_RATE clamps foods to the
  -- duration-derived bound, and the duration bound is the FATAL one - so
  -- the run's physics are still bounded after this repair.
  ('INVALID_OUTCOME'),
  ('INVALID_FOOD_COUNT'),
  ('INVALID_FOOD_RATE'),
  -- Advisory since the day it shipped, by its own source comment, while the
  -- line beneath it set validated = false.
  ('OFFER_SEED_MISMATCH');

-- The two FATAL codes, for the assertions. Kept as data so a reader sees
-- the whole classification in one file.
CREATE TEMP TABLE wp205_fatal_codes(code TEXT PRIMARY KEY) ON COMMIT DROP;
INSERT INTO wp205_fatal_codes(code) VALUES
  ('INVALID_DURATION'),
  ('SPLICE_CLAIMED_DIRECTLY');

-- ---------------------------------------------------------------------------
-- 2. Classify every candidate row
-- ---------------------------------------------------------------------------
-- Candidates are SETTLED, NON-PRACTICE rows currently stamped false. A row
-- with no `validation_errors` but `validated = false` cannot be explained by
-- any code, so it is unclassifiable and is left alone.

CREATE TEMP TABLE wp205_candidates ON COMMIT DROP AS
WITH candidate AS (
  SELECT
    gs.id,
    gs.player_id,
    gs.ended_at,
    gs.score,
    gs.genome,
    gs.validation_errors
  FROM game_sessions gs
  WHERE gs.validated IS FALSE
    AND gs.ended_at IS NOT NULL
    AND COALESCE(gs.is_free_play, false) = false
),
parsed AS (
  SELECT
    c.id,
    c.player_id,
    c.ended_at,
    c.score,
    c.genome,
    jsonb_typeof(c.validation_errors) = 'array' AS parseable,
    COALESCE(
      (
        SELECT array_agg(DISTINCT btrim(split_part(e.value, ':', 1)))
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(c.validation_errors) = 'array'
            THEN c.validation_errors ELSE '[]'::jsonb END
        ) AS e(value)
      ),
      ARRAY[]::TEXT[]
    ) AS codes
  FROM candidate c
)
SELECT
  p.id,
  p.player_id,
  p.ended_at,
  p.score,
  p.genome,
  p.parseable,
  p.codes,
  -- Every code recognised AND none of them fatal AND at least one code
  -- present. All three conjuncts are load-bearing.
  (
    p.parseable
    AND array_length(p.codes, 1) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM unnest(p.codes) AS c(code)
      WHERE c.code NOT IN (SELECT code FROM wp205_advisory_codes)
    )
  ) AS advisory_only,
  EXISTS (
    SELECT 1 FROM unnest(p.codes) AS c(code)
    WHERE c.code IN (SELECT code FROM wp205_fatal_codes)
  ) AS has_fatal
FROM parsed p;

-- ---------------------------------------------------------------------------
-- 3. Pre-snapshots — taken BEFORE the first write
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE wp205_before_sessions ON COMMIT DROP AS
SELECT
  gs.id,
  gs.player_id,
  gs.validated,
  gs.score,
  gs.dna_earned,
  gs.yield_dna,
  gs.duration_seconds,
  gs.foods_collected,
  gs.extracted,
  gs.ended_at,
  gs.end_reason,
  gs.validation_errors
FROM game_sessions gs;

CREATE TEMP TABLE wp205_before_players ON COMMIT DROP AS
SELECT
  p.id,
  p.dna,
  p.high_score,
  p.total_dna_earned,
  p.total_games_played,
  p.legacy_score,
  p.lifetime_depth,
  p.best_week_depth,
  p.signals_completed
FROM players p;

CREATE TEMP TABLE wp205_before_records ON COMMIT DROP AS
SELECT pr.player_id, pr.record_id, pr.value, pr.tier
FROM player_records pr;

CREATE TEMP TABLE wp205_before_codex ON COMMIT DROP AS
SELECT pc.player_id, pc.discovery_type, pc.entry_id
FROM player_codex pc;

CREATE TEMP TABLE wp205_before_first_discoveries ON COMMIT DROP AS
SELECT fd.discovery_type, fd.entry_id, fd.discovered_at
FROM codex_first_discoveries fd;

-- ---------------------------------------------------------------------------
-- 4. Disclosure: what this migration is NOT going to do
-- ---------------------------------------------------------------------------
-- Reported before the writes so the operator reads it even if an assertion
-- later rolls the transaction back.

DO $$
DECLARE
  v_total INTEGER;
  v_restamp INTEGER;
  v_fatal INTEGER;
  v_unclassified INTEGER;
  v_row RECORD;
BEGIN
  SELECT COUNT(*) INTO v_total FROM wp205_candidates;
  SELECT COUNT(*) INTO v_restamp FROM wp205_candidates WHERE advisory_only;
  SELECT COUNT(*) INTO v_fatal FROM wp205_candidates WHERE has_fatal;
  SELECT COUNT(*) INTO v_unclassified
  FROM wp205_candidates
  WHERE NOT advisory_only AND NOT has_fatal;

  RAISE NOTICE 'WP-2.05 backfill: % invalid settled earning rows examined', v_total;
  RAISE NOTICE 'WP-2.05 backfill: % will be re-stamped (advisory-only)', v_restamp;
  RAISE NOTICE 'WP-2.05 backfill: % carry a FATAL code and stay false', v_fatal;
  RAISE NOTICE 'WP-2.05 backfill: % unclassified and left untouched (expected 0)',
    v_unclassified;

  -- Name them. An unclassified row is a code nobody has read the semantics
  -- of, and the release log should carry the list rather than a count.
  FOR v_row IN
    SELECT id, parseable, codes
    FROM wp205_candidates
    WHERE NOT advisory_only AND NOT has_fatal
    ORDER BY ended_at
  LOOP
    RAISE NOTICE 'WP-2.05 backfill: UNCLASSIFIED session % (parseable=%, codes=%)',
      v_row.id, v_row.parseable, v_row.codes;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Serpent / Signal disclosure — what SQL cannot repair
-- ---------------------------------------------------------------------------
-- A re-stamped run may belong to a Serpent week whose Depth was settled
-- while the run was ineligible. The recompute lives in TypeScript
-- (`settleSerpentWeek`), so this migration cannot redo it. Weeks inside the
-- 8-day resettle window recover by invoking the ops settlement route once
-- after this migration; older weeks cannot be recomputed here at all.
--
-- Both sets are NAMED, never silently skipped.

DO $$
DECLARE
  v_row RECORD;
  v_in INTEGER := 0;
  v_out INTEGER := 0;
BEGIN
  IF to_regclass('public.serpent_weeks') IS NULL THEN
    RAISE NOTICE 'WP-2.05 backfill: no serpent_weeks table; nothing to disclose';
    RETURN;
  END IF;

  FOR v_row IN
    SELECT DISTINCT
      gs.serpent_week_id AS week_id,
      sw.week_start,
      (NOW() - sw.ends_at) <= INTERVAL '8 days' AS resettleable
    FROM game_sessions gs
    JOIN wp205_candidates c ON c.id = gs.id AND c.advisory_only
    JOIN serpent_weeks sw ON sw.id = gs.serpent_week_id
    WHERE gs.serpent_week_id IS NOT NULL
    ORDER BY sw.week_start
  LOOP
    IF v_row.resettleable THEN
      v_in := v_in + 1;
      RAISE NOTICE
        'WP-2.05 backfill: Serpent week % (%) is INSIDE the 8-day window - re-run the ops settlement route',
        v_row.week_id, v_row.week_start;
    ELSE
      v_out := v_out + 1;
      RAISE NOTICE
        'WP-2.05 backfill: Serpent week % (%) is OUTSIDE the 8-day window - Depth cannot be recomputed in SQL',
        v_row.week_id, v_row.week_start;
    END IF;
  END LOOP;

  RAISE NOTICE 'WP-2.05 backfill: % Serpent week(s) resettleable, % out of window',
    v_in, v_out;
END $$;

-- ---------------------------------------------------------------------------
-- 6. THE RE-STAMP
-- ---------------------------------------------------------------------------
-- One column. `validation_errors` is deliberately left exactly as it is:
-- the findings happened, and the repair is that they no longer cost the
-- player anything - not that they are erased.

UPDATE game_sessions gs
SET validated = TRUE
FROM wp205_candidates c
WHERE gs.id = c.id
  AND c.advisory_only;

-- ---------------------------------------------------------------------------
-- 7. players.high_score — recomputed, and only upward
-- ---------------------------------------------------------------------------
-- GREATEST against the value already there, so a record set by any means
-- (including one this migration cannot explain) survives untouched.

UPDATE players p
SET high_score = GREATEST(
  COALESCE(p.high_score, 0),
  COALESCE(best.score, 0)
)
FROM (
  SELECT gs.player_id, MAX(gs.score) AS score
  FROM game_sessions gs
  WHERE gs.validated IS TRUE
    AND gs.ended_at IS NOT NULL
    AND COALESCE(gs.is_free_play, false) = false
  GROUP BY gs.player_id
) AS best
WHERE best.player_id = p.id
  AND p.id IN (SELECT DISTINCT player_id FROM wp205_candidates WHERE advisory_only);

-- ---------------------------------------------------------------------------
-- 8. Legacy Records — refreshed through the RPC that is GREATEST throughout
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_player UUID;
  v_count INTEGER := 0;
BEGIN
  FOR v_player IN
    SELECT DISTINCT player_id FROM wp205_candidates WHERE advisory_only
  LOOP
    PERFORM refresh_player_records(v_player);
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'WP-2.05 backfill: refreshed Legacy Records for % player(s)', v_count;
END $$;

-- ---------------------------------------------------------------------------
-- 9. Codex discoveries — re-derived, chronologically
-- ---------------------------------------------------------------------------
-- `record_codex_discoveries` is idempotent by construction: every insert is
-- ON CONFLICT DO NOTHING and the DNA reward is granted only on an actual
-- insert. Replaying it therefore cannot double-grant. The order is
-- `ended_at ASC` so that a world-first is attributed to the run that
-- genuinely happened first.
--
-- The RPC itself refuses a session that is not settled, owned and validated,
-- and returns nothing before the player's 15th banked run - so the FTUE gate
-- keeps applying exactly as it does at settlement.

DO $$
DECLARE
  v_row RECORD;
  v_sessions INTEGER := 0;
  v_error TEXT;
BEGIN
  FOR v_row IN
    SELECT c.id, c.player_id, c.genome
    FROM wp205_candidates c
    WHERE c.advisory_only
      AND c.genome IS NOT NULL
      AND jsonb_typeof(c.genome) = 'object'
    ORDER BY c.ended_at ASC
  LOOP
    BEGIN
      PERFORM record_codex_discoveries(v_row.player_id, v_row.id, v_row.genome);
      v_sessions := v_sessions + 1;
    EXCEPTION WHEN OTHERS THEN
      -- A single unreplayable row must not roll back a repair that has
      -- already restored eligibility to every other run. Named, not
      -- swallowed.
      GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
      RAISE NOTICE
        'WP-2.05 backfill: codex replay skipped session % (%)', v_row.id, v_error;
    END;
  END LOOP;
  RAISE NOTICE 'WP-2.05 backfill: codex replayed over % session(s)', v_sessions;
END $$;

-- ---------------------------------------------------------------------------
-- 10. ASSERTIONS — every one of them rolls the whole transaction back
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_bad INTEGER;
  v_detail TEXT;
BEGIN
  -- (a) NO RUN LOSES VALIDATION. The only permitted transition is false ->
  --     true. This is the Rule 6 assertion for the session rows.
  SELECT COUNT(*) INTO v_bad
  FROM wp205_before_sessions b
  JOIN game_sessions gs ON gs.id = b.id
  WHERE b.validated IS TRUE AND gs.validated IS NOT TRUE;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'WP-2.05 assertion (a) failed: % run(s) lost validation', v_bad;
  END IF;

  -- (b) NO SETTLED VALUE IS REWRITTEN. Every economic and lifecycle field of
  --     every session row must be byte-identical to the snapshot. This is
  --     what makes "one column" a checked claim rather than a comment.
  SELECT COUNT(*) INTO v_bad
  FROM wp205_before_sessions b
  JOIN game_sessions gs ON gs.id = b.id
  WHERE gs.score IS DISTINCT FROM b.score
     OR gs.dna_earned IS DISTINCT FROM b.dna_earned
     OR gs.yield_dna IS DISTINCT FROM b.yield_dna
     OR gs.duration_seconds IS DISTINCT FROM b.duration_seconds
     OR gs.foods_collected IS DISTINCT FROM b.foods_collected
     OR gs.extracted IS DISTINCT FROM b.extracted
     OR gs.ended_at IS DISTINCT FROM b.ended_at
     OR gs.end_reason IS DISTINCT FROM b.end_reason
     OR gs.validation_errors IS DISTINCT FROM b.validation_errors;
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'WP-2.05 assertion (b) failed: % session row(s) had a settled value rewritten', v_bad;
  END IF;

  -- (c) EVERY RE-STAMPED ROW WAS ADVISORY-ONLY.
  SELECT COUNT(*) INTO v_bad
  FROM wp205_before_sessions b
  JOIN game_sessions gs ON gs.id = b.id
  LEFT JOIN wp205_candidates c ON c.id = gs.id
  WHERE b.validated IS FALSE
    AND gs.validated IS TRUE
    AND (c.id IS NULL OR NOT c.advisory_only);
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'WP-2.05 assertion (c) failed: % row(s) re-stamped without being advisory-only', v_bad;
  END IF;

  -- (d) NO FATAL-CODED ROW WAS RE-STAMPED.
  SELECT COUNT(*) INTO v_bad
  FROM wp205_candidates c
  JOIN game_sessions gs ON gs.id = c.id
  WHERE c.has_fatal AND gs.validated IS TRUE;
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'WP-2.05 assertion (d) failed: % fatal-coded row(s) were re-stamped', v_bad;
  END IF;

  -- (e) COMPLETENESS: every advisory-only candidate actually flipped.
  SELECT COUNT(*) INTO v_bad
  FROM wp205_candidates c
  JOIN game_sessions gs ON gs.id = c.id
  WHERE c.advisory_only AND gs.validated IS NOT TRUE;
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'WP-2.05 assertion (e) failed: % advisory-only row(s) were not re-stamped', v_bad;
  END IF;

  -- (f) RULE 6 ON EVERY PLAYER-OWNED SCALAR. None of them may fall, and the
  --     three this migration has no business touching may not move at all.
  SELECT COUNT(*), string_agg(DISTINCT b.id::TEXT, ', ')
    INTO v_bad, v_detail
  FROM wp205_before_players b
  JOIN players p ON p.id = b.id
  WHERE p.high_score < b.high_score
     OR p.total_dna_earned < b.total_dna_earned
     OR p.total_games_played < b.total_games_played
     OR p.legacy_score < b.legacy_score
     OR p.lifetime_depth < b.lifetime_depth
     OR p.best_week_depth < b.best_week_depth
     OR p.signals_completed < b.signals_completed
     OR p.dna < b.dna;
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'WP-2.05 assertion (f) failed: % player(s) had an owned scalar written down (%)',
      v_bad, v_detail;
  END IF;

  -- (g) The counters this migration explicitly does NOT re-credit must be
  --     unchanged, not merely non-decreasing. `dna` is allowed to RISE,
  --     because the Codex replay legitimately grants a first-discovery
  --     reward; `total_games_played` and `total_dna_earned` are not.
  SELECT COUNT(*) INTO v_bad
  FROM wp205_before_players b
  JOIN players p ON p.id = b.id
  WHERE p.total_games_played IS DISTINCT FROM b.total_games_played
     OR p.total_dna_earned IS DISTINCT FROM b.total_dna_earned;
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'WP-2.05 assertion (g) failed: % player(s) had a never-gated counter re-credited', v_bad;
  END IF;

  -- (h) RULE 6 ON EVERY RECORD. `refresh_player_records` is GREATEST
  --     throughout; this proves it rather than trusting it, and also proves
  --     no Record row was destroyed.
  SELECT COUNT(*) INTO v_bad
  FROM wp205_before_records b
  LEFT JOIN player_records pr
    ON pr.player_id = b.player_id AND pr.record_id = b.record_id
  WHERE pr.player_id IS NULL
     OR pr.value < b.value
     OR pr.tier < b.tier;
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'WP-2.05 assertion (h) failed: % Record(s) fell or vanished', v_bad;
  END IF;

  -- (i) RULE 6 ON THE CODEX. A discovery is permanent; the replay may only
  --     add.
  SELECT COUNT(*) INTO v_bad
  FROM wp205_before_codex b
  LEFT JOIN player_codex pc
    ON pc.player_id = b.player_id
   AND pc.discovery_type = b.discovery_type
   AND pc.entry_id = b.entry_id
  WHERE pc.player_id IS NULL;
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'WP-2.05 assertion (i) failed: % codex discovery(ies) disappeared', v_bad;
  END IF;

  -- (j) WORLD-FIRST ATTRIBUTION IS NOT REWRITTEN. The replay runs in
  --     `ended_at` order so a first discovery lands on the run that really
  --     happened first, but an EXISTING first discovery must never be moved
  --     - somebody already owns it.
  SELECT COUNT(*) INTO v_bad
  FROM wp205_before_first_discoveries b
  LEFT JOIN codex_first_discoveries fd
    ON fd.discovery_type = b.discovery_type AND fd.entry_id = b.entry_id
  WHERE fd.discovery_type IS NULL
     OR fd.discovered_at IS DISTINCT FROM b.discovered_at;
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'WP-2.05 assertion (j) failed: % world-first(s) moved or vanished', v_bad;
  END IF;

  RAISE NOTICE 'WP-2.05 backfill: all assertions passed';
END $$;

-- ---------------------------------------------------------------------------
-- 11. Final report
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_restamped INTEGER;
  v_players INTEGER;
  v_raised INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_restamped
  FROM wp205_before_sessions b
  JOIN game_sessions gs ON gs.id = b.id
  WHERE b.validated IS FALSE AND gs.validated IS TRUE;

  SELECT COUNT(DISTINCT player_id) INTO v_players
  FROM wp205_candidates WHERE advisory_only;

  SELECT COUNT(*) INTO v_raised
  FROM wp205_before_players b
  JOIN players p ON p.id = b.id
  WHERE p.high_score > b.high_score;

  RAISE NOTICE 'WP-2.05 backfill COMPLETE: % run(s) re-stamped across % player(s); % high_score(s) rose',
    v_restamped, v_players, v_raised;
END $$;

COMMIT;
