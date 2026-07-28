-- ############################################################################
-- ##                                                                        ##
-- ##  MIGRATION 057 — NOT APPLIED TO ANY DATABASE BY THIS WORK PACKAGE.     ##
-- ##                                                                        ##
-- ##  WP-3.12 wrote and reviewed this file and deliberately did NOT run     ##
-- ##  `supabase db push`, `db reset`, `link` or `start`. It is committed    ##
-- ##  as the schema half of the change; applying it to staging and then     ##
-- ##  production is an owner decision, taken with the release runbook       ##
-- ##  (docs/ops/RELEASE_RUNBOOK.md) in hand.                                ##
-- ##                                                                        ##
-- ##  RELEASE ORDER: deploy the app -> apply 057. The app is deployable     ##
-- ##  before this migration and behaves correctly without it: the ladder    ##
-- ##  reader treats a missing table as "no ladder", the session route then  ##
-- ##  offers no rung and stamps none, every run is rung 0, and rung 0 is    ##
-- ##  byte-identical to the shipped game. See `isMissingLadderInfra` in     ##
-- ##  src/lib/server/ladderRecords.ts — the same tolerance `run_context`    ##
-- ##  carries for migration 054.                                            ##
-- ##                                                                        ##
-- ############################################################################
--
-- Migration 057: the D2 difficulty ladder's records
--
-- Authority: docs/PRODUCT_CONSTITUTION.md Rule 6 (what a player earned is
-- permanent), Rule 11 (server authority), §8 (difficulty is authored, not
-- negotiated). Work package: WP-3.12, the ladder.
--
-- WHAT THIS TABLE IS
--
--   One row per (player, dynasty), holding the highest ladder rung that
--   player has BANKED a run on with that dynasty. It is a RECORD in the Rule 6
--   sense — a thing the player did, which stays done.
--
-- UNLOCK GLOBALLY, RECORD PER-DYNASTY
--
--   The anti-re-climb ruling. The *attempt* gate reads MAX(best_rung) across
--   all of a player's dynasties, so someone who beat rung 4 on PRIMAL opens a
--   CYBER run at rung 5 rather than re-climbing four rungs they have already
--   proved they can climb. The *record* stays per-dynasty, so their CYBER
--   record is still their CYBER record and the two facts never have to be
--   reconciled into one lossy number.
--
--   That is why the primary key is the pair and not the player: collapsing to
--   one row would make the unlock cheap and the record meaningless, and
--   splitting the unlock per dynasty would make a player climb the same ladder
--   three times to see the same seven rules.
--
-- RULE 6 BY CONSTRUCTION, NOT BY CONVENTION
--
--   `record_ladder_rung` is the ONLY write path, it is the only grant, and its
--   sole UPDATE is `GREATEST(existing, incoming)`. There is no code path —
--   inside this migration or outside it — that can lower a stored rung, because
--   the expression that writes the column cannot produce a smaller value than
--   the one it read. A caller that passes a lower rung performs a no-op, not a
--   demotion. `npm run verify:constitution`'s owned-row-downward gate covers
--   this file: `player_ladders` was added to its owned-table patterns in the
--   same work package, so a future author who replaces the GREATEST with an
--   EXCLUDED overwrite fails the build.
--
--   `updated_at` moves only when the rung actually rises, so the column means
--   "when this record was last IMPROVED" rather than "when a run last touched
--   it". A no-op re-record leaves the row bit-identical.
--
-- WHAT IS NOT HERE
--
--   No rung DEFINITIONS. The rungs, their order and their dials live in
--   src/shared/game/ladder.ts, in one place, shared by the engine, the
--   settlement and the surfaces. Duplicating them into SQL would create a
--   second authority that could disagree with the first, and the ladder's whole
--   premise is that everyone is climbing the same thing.
--
--   No FK to a rung catalogue and no upper-bound CHECK tied to today's rung
--   count. The ladder is expected to grow (CYBER's second terrain ring is the
--   named rung 8), and a CHECK pinned at 7 would make adding a rung a migration
--   against production. The bound below is a garbage bound, not a design one.
--
--   No ATTEMPT log. What rung a run was played at is already stamped in
--   `game_sessions.run_context`, which is the run's own permanent record; a
--   second store of the same fact is how two stores come to disagree.
--
-- DOWN-NOTE (forward-only): to reverse, run
--   `DROP FUNCTION IF EXISTS record_ladder_rung(UUID, TEXT, INT);`
--   `DROP TABLE IF EXISTS player_ladders;`
--   The app tolerates the table's absence by design, so a rollback needs no
--   coordinated redeploy — the ladder simply goes dark and every run is rung 0.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The records
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS player_ladders (
  player_id  UUID        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  dynasty    TEXT        NOT NULL,
  best_rung  SMALLINT    NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, dynasty),
  -- Dynasties are CYBER/PRIMAL/COSMIC. EMBER/CRYSTAL/VOID is deprecated and
  -- must never be reintroduced, so the constraint says so in the schema rather
  -- than trusting every caller to normalise first.
  CONSTRAINT player_ladders_dynasty_check
    CHECK (dynasty IN ('CYBER', 'PRIMAL', 'COSMIC')),
  -- A garbage bound, not a design bound. 99 is far above any ladder the game
  -- will author and far below anything a bug could mean; it stops a corrupted
  -- caller from storing a rung no client can ever display, without making the
  -- addition of a real rung a schema change.
  CONSTRAINT player_ladders_best_rung_check
    CHECK (best_rung >= 0 AND best_rung <= 99)
);

COMMENT ON TABLE player_ladders IS
  'WP-3.12. The highest D2 ladder rung a player has BANKED a run on, per '
  'dynasty. Rule 6 record: written only by record_ladder_rung(), which updates '
  'via GREATEST and therefore cannot lower a stored value. Unlock is GLOBAL '
  '(the attempt gate reads MAX(best_rung) across dynasties, so a rung beaten '
  'on one dynasty is not re-climbed on another); the RECORD is per-dynasty. '
  'Rung definitions live in src/shared/game/ladder.ts and are deliberately not '
  'mirrored here.';

COMMENT ON COLUMN player_ladders.best_rung IS
  'Highest rung banked with this dynasty. 0 is Ground — the shipped game — and '
  'is also the answer for a player with no row, so an absent row and a rung-0 '
  'row mean the same thing and no backfill is needed or wanted.';

COMMENT ON COLUMN player_ladders.updated_at IS
  'When this record last IMPROVED. A re-record at or below the stored rung is a '
  'no-op and does not move this column.';

-- The attempt gate reads every row for one player (MAX across dynasties) and
-- the record read is by the full primary key, so the PK index already serves
-- both. No secondary index is added: it would be paid for on every write to
-- answer a question the PK already answers.

-- ---------------------------------------------------------------------------
-- 2. RLS: read your own, write through the function or not at all
-- ---------------------------------------------------------------------------

ALTER TABLE player_ladders ENABLE ROW LEVEL SECURITY;

-- A player may READ their own records — the profile and Run Setup surfaces
-- show them. There is deliberately NO insert/update/delete policy: writes go
-- through the SECURITY DEFINER function below, which is the only thing that
-- can honour the GREATEST discipline. With RLS on and no write policy, a
-- direct client write is refused by the database rather than by a convention.
DROP POLICY IF EXISTS player_ladders_select_own ON player_ladders;
CREATE POLICY player_ladders_select_own ON player_ladders
  FOR SELECT
  USING (
    player_id IN (
      SELECT id FROM players WHERE auth_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3. The only write path
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION record_ladder_rung(
  p_player_id UUID,
  p_dynasty   TEXT,
  p_rung      INT
) RETURNS SMALLINT AS $$
DECLARE
  v_dynasty TEXT;
  v_rung    INT;
  v_best    SMALLINT;
BEGIN
  -- Normalise before the CHECK sees it, so a lowercase dynasty from a caller
  -- is a stored record rather than a raised exception on a settlement path.
  v_dynasty := UPPER(TRIM(COALESCE(p_dynasty, '')));
  IF v_dynasty NOT IN ('CYBER', 'PRIMAL', 'COSMIC') THEN
    RAISE EXCEPTION 'Unknown dynasty: %', p_dynasty;
  END IF;

  -- A negative or NULL rung is a rung-0 record, never an error: settlement
  -- must never fail because a difficulty record was unrepresentable. Clamped
  -- at the CHECK's own bound so a corrupted caller cannot raise here either.
  v_rung := LEAST(99, GREATEST(0, COALESCE(p_rung, 0)));

  INSERT INTO player_ladders AS pl (player_id, dynasty, best_rung, updated_at)
  VALUES (p_player_id, v_dynasty, v_rung, NOW())
  ON CONFLICT (player_id, dynasty) DO UPDATE
    -- RULE 6, BY CONSTRUCTION. GREATEST cannot return less than the value it
    -- read, so this statement is incapable of lowering an earned record — no
    -- caller, no race and no replay can demote a player. Replacing it with
    -- `EXCLUDED.best_rung` would make a stale settlement a demotion, and the
    -- owned-row-downward gate fails the build on exactly that edit.
    SET best_rung  = GREATEST(pl.best_rung, EXCLUDED.best_rung),
        -- Only an actual improvement is an event. A re-record at or below the
        -- stored rung leaves the row bit-identical.
        updated_at = CASE
                       WHEN EXCLUDED.best_rung > pl.best_rung THEN NOW()
                       ELSE pl.updated_at
                     END
  RETURNING pl.best_rung INTO v_best;

  RETURN v_best;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION record_ladder_rung(UUID, TEXT, INT) IS
  'WP-3.12. Record a banked run''s ladder rung for (player, dynasty). The ONLY '
  'write path to player_ladders. Updates via GREATEST, so it cannot lower an '
  'earned record (Rule 6 by construction); a lower rung is a no-op. Returns the '
  'record in force after the call.';

REVOKE ALL ON FUNCTION record_ladder_rung(UUID, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_ladder_rung(UUID, TEXT, INT) TO service_role;

COMMIT;
