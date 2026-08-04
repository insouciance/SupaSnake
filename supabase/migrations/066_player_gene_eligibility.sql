-- ###########################################################################
-- ## MIGRATION 066 — NOT APPLIED TO ANY DATABASE BY THIS WORK PACKAGE.     ##
-- ## Written and replayed only against an isolated local Supabase stack.   ##
-- ## Release order is DEPLOY THE APP FIRST, THEN APPLY THIS: the curriculum##
-- ## reader degrades quietly when the table is absent, so a deployment     ##
-- ## running ahead of the migration composes exactly the Gene pool it      ##
-- ## composes today. The reverse order is also safe — the flag ships off.  ##
-- ###########################################################################
--
-- Migration 066: Player Evolution — curriculum Gene eligibility (WP-B)
--
-- Authority: docs/game/PLAYER_EVOLUTION_ONBOARDING.md §4 and §8,
-- docs/game/PLAYER_EVOLUTION_SERVER_CONTRACT.md §1-2 and §6,
-- Constitution v1.14 §8.3 and overturn #36 (owner-ratified 2026-08-04).
--
-- WHAT THIS TABLE DECIDES, AND WHAT IT DOES NOT
--
-- It decides which Genes the server may place in an account's NEW live
-- offers. It does not decide what exists — the complete roster stays
-- inspectable in the Workbench — it does not decide what a run pays, and it
-- never reaches Score. An in-flight run is unaffected by anything written
-- here: the run's vocabulary is stamped in game_sessions.run_context at start
-- and settled from that stamp.
--
-- WHY A SATELLITE TABLE RATHER THAN A COLUMN ON players
--
-- 001_initial_schema.sql:145 grants `players_update_own` FOR UPDATE with a
-- USING clause and no WITH CHECK and no column-level revoke. Postgres reuses
-- USING for the new row, so a row cannot be re-owned — but every other column
-- on players is directly writable by an authenticated client. A curriculum
-- column there would make the client the author of its own Gene pool. This
-- table has NO write policy at all.
--
-- VISIBLE_LOCKED IS THE ABSENCE OF A ROW
--
-- Three eligibility states in the design, two in the table. Storing the locked
-- state would mean writing 13-14 rows per account at signup and keeping them
-- correct through every roster rotation. Absence is cheaper, is self-healing
-- when a Gene is shelved and returns, and makes monotonicity trivially true:
-- rows are only ever inserted or promoted.
--
-- rules_version sits in the primary key so a future Genome v3 roster starts a
-- fresh curriculum without rewriting v2 history, exactly as
-- genome_gene_versions is a separate catalog from gene_definitions.
--
-- DOWN-NOTE (forward-only). To reverse by hand:
--   DROP FUNCTION IF EXISTS read_gene_eligibility(UUID, SMALLINT);
--   DROP FUNCTION IF EXISTS graduate_full_roster(UUID, SMALLINT, TEXT[]);
--   DROP FUNCTION IF EXISTS resolve_learning_event(UUID, SMALLINT, TEXT, UUID, SMALLINT);
--   DROP FUNCTION IF EXISTS record_trial_offer(UUID, SMALLINT, TEXT, UUID);
--   DROP FUNCTION IF EXISTS select_gene_trial(UUID, SMALLINT, TEXT);
--   DROP FUNCTION IF EXISTS grant_starter_eligibility(UUID, SMALLINT, TEXT[]);
--   DROP FUNCTION IF EXISTS genome_eligibility_active_gene_ids(SMALLINT, TEXT[]);
--   DROP TABLE IF EXISTS player_gene_eligibility;
-- Dropping the table returns every account to the complete legal Dynasty
-- roster, which is the behaviour this migration replaces.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS player_gene_eligibility (
  player_id              UUID        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  rules_version          SMALLINT    NOT NULL,
  gene_id                TEXT        NOT NULL,
  state                  TEXT        NOT NULL,
  source                 TEXT        NOT NULL,
  first_eligible_at      TIMESTAMPTZ,
  trial_selected_at      TIMESTAMPTZ,
  trial_offers_seen      SMALLINT    NOT NULL DEFAULT 0,
  learning_event_version SMALLINT    NOT NULL,
  resolved_session_id    UUID        REFERENCES game_sessions(id) ON DELETE SET NULL,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, rules_version, gene_id),
  CONSTRAINT gene_eligibility_state_check
    CHECK (state IN ('trial', 'offer_eligible')),
  CONSTRAINT gene_eligibility_source_check
    CHECK (source IN ('starter', 'trial_resolved', 'migration_credit', 'graduation')),
  CONSTRAINT gene_eligibility_trial_offers_check
    CHECK (trial_offers_seen >= 0 AND trial_offers_seen <= 3),
  CONSTRAINT gene_eligibility_eligible_shape
    CHECK (state <> 'offer_eligible' OR first_eligible_at IS NOT NULL),
  CONSTRAINT gene_eligibility_learning_event_version_check
    CHECK (learning_event_version >= 1)
);

COMMENT ON TABLE player_gene_eligibility IS
  'WP-B. Which Genes the server may place in this account''s NEW live offers, '
  'per Genome rules version. The ABSENCE of a row is VISIBLE_LOCKED: the Gene '
  'stays fully inspectable and is simply not offered. Never revoked; rows are '
  'only inserted or promoted. Read-only to the owning player, writable only '
  'through the SECURITY DEFINER functions below.';

COMMENT ON COLUMN player_gene_eligibility.state IS
  'trial -> offer_eligible, never backwards. A third state, VISIBLE_LOCKED, is '
  'represented by the absence of the row.';

COMMENT ON COLUMN player_gene_eligibility.source IS
  'How the account came to hold this: starter (Dynasty starter seven), '
  'trial_resolved (its learning event fired in authoritative play), '
  'migration_credit (authoritative history at migration 066), graduation '
  '(>=10 banked runs or Mastery >=3 — the existing Apex thresholds).';

COMMENT ON COLUMN player_gene_eligibility.trial_offers_seen IS
  'Collected offers that CONTAINED this trial, never runs. Ascetic runs, '
  'Patient''s stretched cadence, uncollected or expired relics, Free Play and '
  'relic-less runs consume nothing, because none of them produces a collected '
  'offer containing the trial. Only increases.';

COMMENT ON COLUMN player_gene_eligibility.resolved_session_id IS
  'The settled, validated session whose record carried this Gene''s learning '
  'event. Also the idempotency key: a replayed settlement promotes once.';

-- Composition reads every row for one player at one rules version, which the
-- primary key's leading columns already serve. No secondary index is added:
-- it would be paid for on every write to answer a question the PK answers.

-- ---------------------------------------------------------------------------
-- 2. RLS: read your own, write through the functions or not at all
-- ---------------------------------------------------------------------------

ALTER TABLE player_gene_eligibility ENABLE ROW LEVEL SECURITY;

-- A player may READ their own eligibility — the Workbench shows it, truthfully
-- and per Gene. There is deliberately NO insert/update/delete policy: writes go
-- through the SECURITY DEFINER functions below, which are the only things that
-- can honour monotonicity. With RLS on and no write policy, a direct client
-- write is refused by the database rather than by a convention.
--
-- `players.user_id`, not `auth_user_id`. Every RLS policy in this schema since
-- 001 spells it this way; migration 057 records that guessing otherwise aborts
-- the migration with 42703.
DROP POLICY IF EXISTS player_gene_eligibility_select_own ON player_gene_eligibility;
CREATE POLICY player_gene_eligibility_select_own ON player_gene_eligibility
  FOR SELECT
  USING (
    player_id IN (
      SELECT id FROM players WHERE user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Catalog validation
-- ---------------------------------------------------------------------------

-- gene_id is deliberately TEXT with no enum: the roster rotates within the
-- §12.2 cap, and a schema change per rotation is a worse trade than validating
-- against the versioned catalog here. Dynasty legality is NOT applied — rows
-- are account-wide, and the run-start composer intersects them with the
-- Dynasty's own roster, which is what lets a shared Gene unlock account-wide
-- while a Signature stays with its Dynasty.
CREATE OR REPLACE FUNCTION genome_eligibility_active_gene_ids(
  p_rules_version SMALLINT,
  p_gene_ids      TEXT[]
) RETURNS TEXT[] AS $$
  SELECT COALESCE(array_agg(DISTINCT versioned.gene_id ORDER BY versioned.gene_id), ARRAY[]::TEXT[])
  FROM genome_gene_versions AS versioned
  WHERE versioned.rules_version = p_rules_version
    AND versioned.active
    AND versioned.gene_id = ANY(COALESCE(p_gene_ids, ARRAY[]::TEXT[]));
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION genome_eligibility_active_gene_ids(SMALLINT, TEXT[]) IS
  'WP-B. The subset of the supplied ids that are active Genes at this rules '
  'version, sorted and deduplicated. Unknown or shelved ids are dropped rather '
  'than raising: a caller must never fail a run start over a rotated roster.';

-- ---------------------------------------------------------------------------
-- 4. Write paths
-- ---------------------------------------------------------------------------

-- Seed the Dynasty starter Genes. Additive and idempotent: an id already held
-- at any state is left exactly as it is, so a second Dynasty, a repeated start
-- and a veteran all no-op.
CREATE OR REPLACE FUNCTION grant_starter_eligibility(
  p_player_id     UUID,
  p_rules_version SMALLINT,
  p_gene_ids      TEXT[]
) RETURNS INTEGER AS $$
DECLARE
  v_gene_ids TEXT[];
  v_written  INTEGER;
BEGIN
  IF p_player_id IS NULL THEN
    RAISE EXCEPTION 'GENE_ELIGIBILITY_PLAYER_REQUIRED';
  END IF;
  v_gene_ids := genome_eligibility_active_gene_ids(p_rules_version, p_gene_ids);
  IF array_length(v_gene_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO player_gene_eligibility AS pge (
    player_id, rules_version, gene_id, state, source,
    first_eligible_at, learning_event_version, updated_at
  )
  SELECT p_player_id, p_rules_version, gene_id, 'offer_eligible', 'starter',
         NOW(), 1, NOW()
  FROM unnest(v_gene_ids) AS gene_id
  ON CONFLICT (player_id, rules_version, gene_id) DO NOTHING;
  GET DIAGNOSTICS v_written = ROW_COUNT;

  RETURN v_written;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION grant_starter_eligibility(UUID, SMALLINT, TEXT[]) IS
  'WP-B. Seed a Dynasty''s starter Genes as offer-eligible. DO NOTHING on '
  'conflict, so it can never demote an already-resolved row and can never '
  'reset a trial. Returns the number of rows actually written.';

-- Set or switch the single selected trial. Switching costs nothing and loses
-- nothing (PEO §4.4): the previous trial returns to VISIBLE_LOCKED, which is
-- the absence of its row.
CREATE OR REPLACE FUNCTION select_gene_trial(
  p_player_id     UUID,
  p_rules_version SMALLINT,
  p_gene_id       TEXT
) RETURNS JSONB AS $$
DECLARE
  v_gene_ids TEXT[];
  v_state    TEXT;
  v_row      player_gene_eligibility%ROWTYPE;
BEGIN
  IF p_player_id IS NULL THEN
    RAISE EXCEPTION 'GENE_ELIGIBILITY_PLAYER_REQUIRED';
  END IF;
  v_gene_ids := genome_eligibility_active_gene_ids(
    p_rules_version, ARRAY[p_gene_id]
  );
  IF array_length(v_gene_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'GENE_ELIGIBILITY_UNKNOWN_GENE: %', p_gene_id;
  END IF;

  SELECT state INTO v_state
  FROM player_gene_eligibility
  WHERE player_id = p_player_id
    AND rules_version = p_rules_version
    AND gene_id = p_gene_id;

  -- A Gene that already reached ordinary eligibility is not a trial candidate.
  -- Answering with the row rather than raising keeps a double-tap harmless.
  IF v_state = 'offer_eligible' THEN
    RETURN jsonb_build_object(
      'geneId', p_gene_id, 'state', 'offer_eligible', 'changed', FALSE
    );
  END IF;

  -- Retire the previous selection. Guarded to state = 'trial', so no resolved
  -- row can be reached by this statement under any input.
  -- constitution-allow: owned-row-downward  a trial is a SELECTION, not an earned thing; the AND state = 'trial' guard makes an offer_eligible row unreachable here, and PEO §4.4 requires switching to cost nothing
  DELETE FROM player_gene_eligibility
  WHERE player_id = p_player_id
    AND rules_version = p_rules_version
    AND state = 'trial'
    AND gene_id <> p_gene_id;

  INSERT INTO player_gene_eligibility AS pge (
    player_id, rules_version, gene_id, state, source,
    trial_selected_at, trial_offers_seen, learning_event_version, updated_at
  )
  VALUES (
    p_player_id, p_rules_version, p_gene_id, 'trial', 'starter',
    NOW(), 0, 1, NOW()
  )
  ON CONFLICT (player_id, rules_version, gene_id) DO UPDATE
    SET trial_selected_at = COALESCE(pge.trial_selected_at, NOW()),
        updated_at        = NOW()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'geneId', v_row.gene_id,
    'state', v_row.state,
    'trialOffersSeen', v_row.trial_offers_seen,
    'changed', TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION select_gene_trial(UUID, SMALLINT, TEXT) IS
  'WP-B. Set or switch the single selected trial for (player, rules version). '
  'A Gene already offer-eligible is returned unchanged. The previous trial '
  'returns to VISIBLE_LOCKED (no row); no resolved eligibility is reachable.';

-- Consume one of the three guaranteed appearances. Counted by COLLECTED OFFERS
-- THAT CONTAINED THE TRIAL, never by runs.
CREATE OR REPLACE FUNCTION record_trial_offer(
  p_player_id     UUID,
  p_rules_version SMALLINT,
  p_gene_id       TEXT,
  p_session_id    UUID
) RETURNS INTEGER AS $$
DECLARE
  v_seen SMALLINT;
BEGIN
  IF p_player_id IS NULL OR p_session_id IS NULL THEN
    RAISE EXCEPTION 'GENE_ELIGIBILITY_PLAYER_REQUIRED';
  END IF;

  -- The offer has to have happened in a run of this player's. The session is
  -- not required to be settled — the appearance is consumed while the run is
  -- still open — but it may not belong to anyone else.
  IF NOT EXISTS (
    SELECT 1 FROM game_sessions AS gs
    WHERE gs.id = p_session_id AND gs.player_id = p_player_id
  ) THEN
    RAISE EXCEPTION 'GENE_ELIGIBILITY_SESSION_NOT_AUTHORITATIVE: %', p_session_id;
  END IF;

  UPDATE player_gene_eligibility AS pge
  -- GREATEST, so a replayed or out-of-order write can only move the counter
  -- forward, and LEAST at the CHECK's own bound so a caller that over-counts
  -- cannot raise on a live run's settlement path.
     SET trial_offers_seen = LEAST(
           3, GREATEST(pge.trial_offers_seen, pge.trial_offers_seen + 1)
         ),
         updated_at = NOW()
   WHERE pge.player_id = p_player_id
     AND pge.rules_version = p_rules_version
     AND pge.gene_id = p_gene_id
     -- `resolved_session_id` is deliberately NOT written here: it records the
     -- settled run that carried the learning EVENT, not a run that merely
     -- showed the trial.
     AND pge.state = 'trial'
  RETURNING pge.trial_offers_seen INTO v_seen;

  RETURN GREATEST(0, 3 - COALESCE(v_seen, 3));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION record_trial_offer(UUID, SMALLINT, TEXT, UUID) IS
  'WP-B. Consume one guaranteed trial appearance, counted by collected offers '
  'containing the trial rather than by runs. Only touches a row still in the '
  'trial state. Returns the appearances still guaranteed.';

-- Promote trial -> offer_eligible from a settled, validated run.
CREATE OR REPLACE FUNCTION resolve_learning_event(
  p_player_id              UUID,
  p_rules_version          SMALLINT,
  p_gene_id                TEXT,
  p_session_id             UUID,
  p_learning_event_version SMALLINT
) RETURNS JSONB AS $$
DECLARE
  v_row player_gene_eligibility%ROWTYPE;
BEGIN
  IF p_player_id IS NULL OR p_session_id IS NULL THEN
    RAISE EXCEPTION 'GENE_ELIGIBILITY_PLAYER_REQUIRED';
  END IF;

  -- The settled run must be a validated, non-Free-Play, extraction-or-crash
  -- earning session belonging to this player. Success and failure both
  -- resolve; practice does not.
  IF NOT EXISTS (
    SELECT 1 FROM game_sessions AS gs
    WHERE gs.id = p_session_id
      AND gs.player_id = p_player_id
      AND gs.ended_at IS NOT NULL
      AND gs.validated IS TRUE
      AND gs.is_free_play IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'GENE_ELIGIBILITY_SESSION_NOT_AUTHORITATIVE: %', p_session_id;
  END IF;

  UPDATE player_gene_eligibility AS pge
     SET state = 'offer_eligible',
         source = 'trial_resolved',
         -- Written once. A later resolution never rewrites when a Gene first
         -- became eligible.
         first_eligible_at = COALESCE(pge.first_eligible_at, NOW()),
         resolved_session_id = COALESCE(pge.resolved_session_id, p_session_id),
         learning_event_version = GREATEST(
           pge.learning_event_version,
           GREATEST(1::SMALLINT, COALESCE(p_learning_event_version, 1::SMALLINT))
         ),
         updated_at = NOW()
   WHERE pge.player_id = p_player_id
     AND pge.rules_version = p_rules_version
     AND pge.gene_id = p_gene_id
     -- IDEMPOTENT BY CONSTRUCTION. A row already offer_eligible is untouched,
     -- so a replayed settlement is a no-op rather than a second promotion.
     AND pge.state = 'trial'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('geneId', p_gene_id, 'promoted', FALSE);
  END IF;

  RETURN jsonb_build_object(
    'geneId', v_row.gene_id,
    'promoted', TRUE,
    'firstEligibleAt', v_row.first_eligible_at,
    'resolvedSessionId', v_row.resolved_session_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION resolve_learning_event(UUID, SMALLINT, TEXT, UUID, SMALLINT) IS
  'WP-B. Promote a trial to ordinary offer eligibility from a settled, '
  'validated, non-Free-Play run. Only a row still in the trial state is '
  'promoted, so a replayed settlement is a no-op. Never demotes.';

-- Grant the complete legal roster to a graduated account.
CREATE OR REPLACE FUNCTION graduate_full_roster(
  p_player_id     UUID,
  p_rules_version SMALLINT,
  p_gene_ids      TEXT[]
) RETURNS INTEGER AS $$
DECLARE
  v_gene_ids TEXT[];
  v_written  INTEGER;
BEGIN
  IF p_player_id IS NULL THEN
    RAISE EXCEPTION 'GENE_ELIGIBILITY_PLAYER_REQUIRED';
  END IF;
  v_gene_ids := genome_eligibility_active_gene_ids(p_rules_version, p_gene_ids);
  IF array_length(v_gene_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO player_gene_eligibility AS pge (
    player_id, rules_version, gene_id, state, source,
    first_eligible_at, learning_event_version, updated_at
  )
  SELECT p_player_id, p_rules_version, gene_id, 'offer_eligible', 'graduation',
         NOW(), 1, NOW()
  FROM unnest(v_gene_ids) AS gene_id
  ON CONFLICT (player_id, rules_version, gene_id) DO UPDATE
    -- MONOTONE PROMOTION ONLY. A trial row becomes eligible; an eligible row
    -- keeps the source and the timestamp that first earned it.
    SET state = 'offer_eligible',
        source = CASE
                   WHEN pge.state = 'offer_eligible' THEN pge.source
                   ELSE EXCLUDED.source
                 END,
        first_eligible_at = COALESCE(pge.first_eligible_at, EXCLUDED.first_eligible_at),
        updated_at = NOW()
    WHERE pge.state <> 'offer_eligible';
  GET DIAGNOSTICS v_written = ROW_COUNT;

  RETURN v_written;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION graduate_full_roster(UUID, SMALLINT, TEXT[]) IS
  'WP-B. Grant the complete legal roster to an account at or above the '
  'graduation threshold (>=10 banked runs or Mastery >=3 — the existing Apex '
  'thresholds). Promotes upward only; a veteran is never pushed backward.';

-- ---------------------------------------------------------------------------
-- 5. The composition read
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION read_gene_eligibility(
  p_player_id     UUID,
  p_rules_version SMALLINT
) RETURNS JSONB AS $$
  SELECT jsonb_build_object(
    'eligibleGeneIds', COALESCE(
      (
        SELECT jsonb_agg(pge.gene_id ORDER BY pge.gene_id)
        FROM player_gene_eligibility AS pge
        WHERE pge.player_id = p_player_id
          AND pge.rules_version = p_rules_version
          AND pge.state = 'offer_eligible'
      ),
      '[]'::JSONB
    ),
    'trialGeneId', (
      SELECT pge.gene_id
      FROM player_gene_eligibility AS pge
      WHERE pge.player_id = p_player_id
        AND pge.rules_version = p_rules_version
        AND pge.state = 'trial'
      ORDER BY pge.updated_at DESC, pge.gene_id
      LIMIT 1
    )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION read_gene_eligibility(UUID, SMALLINT) IS
  'WP-B. Composition read at run start: the offer-eligible set plus the single '
  'selected trial. Pure. An account with no rows answers an empty set, which '
  'the composer resolves to the complete legal Dynasty roster.';

-- ---------------------------------------------------------------------------
-- 6. Privileges — service role only, exactly as 057 does
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION genome_eligibility_active_gene_ids(SMALLINT, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION grant_starter_eligibility(UUID, SMALLINT, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION select_gene_trial(UUID, SMALLINT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_trial_offer(UUID, SMALLINT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION resolve_learning_event(UUID, SMALLINT, TEXT, UUID, SMALLINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION graduate_full_roster(UUID, SMALLINT, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION read_gene_eligibility(UUID, SMALLINT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION genome_eligibility_active_gene_ids(SMALLINT, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION grant_starter_eligibility(UUID, SMALLINT, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION select_gene_trial(UUID, SMALLINT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION record_trial_offer(UUID, SMALLINT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION resolve_learning_event(UUID, SMALLINT, TEXT, UUID, SMALLINT) TO service_role;
GRANT EXECUTE ON FUNCTION graduate_full_roster(UUID, SMALLINT, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION read_gene_eligibility(UUID, SMALLINT) TO service_role;

-- Migration 036 already grants service_role every table privilege in `public`
-- and sets default privileges for later objects, so the table itself is
-- service-writable the moment it exists. The RPC boundary above is the only
-- real gate.
--
-- The own-row read policy needs a matching table grant to be reachable at all:
-- a policy without one is decorative, because the privilege check runs first.
-- `player_codex` (031) is the shape copied here — SELECT to `authenticated`,
-- nothing to `anon`, and no write verb to either. `player_ladders` (057) has
-- the policy and NOT the grant, so its own-row read is currently unreachable;
-- that is recorded in this work package's PR rather than changed here.
GRANT SELECT ON player_gene_eligibility TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON player_gene_eligibility FROM authenticated, anon;

-- ---------------------------------------------------------------------------
-- 7. Backfill (server contract §6)
-- ---------------------------------------------------------------------------
--
-- Forward-only, idempotent, and never rewriting a historical run, payout,
-- Codex fact or Splice discovery. Three passes, in this order, because each
-- one can only ADD to the one before it:
--
--   1. Graduate veterans to the complete roster.
--   2. Credit everyone else from authoritative history.
--   3. Seed the Dynasty-independent starter Genes for everyone else.
--
-- NO ACCOUNT IS RE-ONBOARDED. Every insert is DO NOTHING or a monotone
-- promotion, so an account that already holds a Gene keeps the state and the
-- timestamp it already had.
--
-- The five Genes seeded in pass 3 are the intersection of the three Dynasty
-- starter sevens, i.e. the Genes that are starters whatever a player picks.
-- The remaining two per Dynasty — the Signature and its Strain partner — are
-- written by `grant_starter_eligibility` at that Dynasty's next run start, and
-- the run-start composer unions them in regardless, so no account can be short
-- of its seven even between the two.

DO $$
DECLARE
  v_rules_version SMALLINT := 2;
  v_graduated     INTEGER := 0;
  v_credited      INTEGER := 0;
  v_seeded        INTEGER := 0;
  v_shared_starters TEXT[] := ARRAY[
    'gold_trail', 'compound_interest', 'phoenix', 'overgrowth', 'phase_gate'
  ];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM genome_gene_versions
    WHERE rules_version = v_rules_version AND active
  ) THEN
    RAISE NOTICE
      'Migration 066: no active Genome v2 catalog rows; eligibility backfill skipped.';
    RETURN;
  END IF;

  -- Pass 1. Graduated veterans receive the complete legal current roster.
  -- >=10 banked runs OR Mastery >=3 in any Dynasty — the existing Apex
  -- thresholds (GENOME_V2_CONFIG.ftue.apexAtBankedRuns / apexAtMastery),
  -- reused so the curriculum introduces no new progression number. "Banked"
  -- is the canonical five-predicate definition used everywhere else:
  -- ended, validated, not Free Play, extracted.
  CREATE TEMP TABLE eligibility_backfill_graduates ON COMMIT DROP AS
  SELECT p.id AS player_id
  FROM players AS p
  WHERE (
    SELECT COUNT(*)
    FROM game_sessions AS gs
    WHERE gs.player_id = p.id
      AND gs.ended_at IS NOT NULL
      AND gs.validated IS TRUE
      AND gs.is_free_play IS NOT TRUE
      AND gs.extracted
  ) >= 10
  OR COALESCE((
    SELECT MAX(level_for_xp(pm.xp))
    FROM player_mastery AS pm
    WHERE pm.player_id = p.id
  ), 0) >= 3;

  INSERT INTO player_gene_eligibility (
    player_id, rules_version, gene_id, state, source,
    first_eligible_at, learning_event_version, updated_at
  )
  SELECT graduate.player_id, v_rules_version, versioned.gene_id,
         'offer_eligible', 'graduation', NOW(), 1, NOW()
  FROM eligibility_backfill_graduates AS graduate
  CROSS JOIN genome_gene_versions AS versioned
  WHERE versioned.rules_version = v_rules_version
    AND versioned.active
  ON CONFLICT (player_id, rules_version, gene_id) DO NOTHING;
  GET DIAGNOSTICS v_graduated = ROW_COUNT;

  -- Pass 2. Credit authoritative history for everyone else. player_codex is
  -- the durable, already-indexed record of what a player actually used; a
  -- `splice` row credits BOTH parents through genome_splice_versions. Rows at
  -- any rules_version are read, and any id that is not an active v2 Gene is
  -- dropped by the join — a player who learned Gold Trail under v1 rules
  -- learned Gold Trail, and Rule 6 forbids regressing them for the version
  -- number the row happens to carry.
  INSERT INTO player_gene_eligibility (
    player_id, rules_version, gene_id, state, source,
    first_eligible_at, learning_event_version, updated_at
  )
  SELECT DISTINCT credited.player_id, v_rules_version, credited.gene_id,
         'offer_eligible', 'migration_credit', NOW(), 1, NOW()
  FROM (
    SELECT codex.player_id, codex.entry_id AS gene_id
    FROM player_codex AS codex
    WHERE codex.discovery_type = 'gene'
    UNION
    SELECT codex.player_id, splices.gene_a AS gene_id
    FROM player_codex AS codex
    JOIN genome_splice_versions AS splices
      ON splices.splice_id = codex.entry_id
    WHERE codex.discovery_type = 'splice'
    UNION
    SELECT codex.player_id, splices.gene_b AS gene_id
    FROM player_codex AS codex
    JOIN genome_splice_versions AS splices
      ON splices.splice_id = codex.entry_id
    WHERE codex.discovery_type = 'splice'
  ) AS credited
  JOIN genome_gene_versions AS versioned
    ON versioned.gene_id = credited.gene_id
   AND versioned.rules_version = v_rules_version
   AND versioned.active
  JOIN players AS p ON p.id = credited.player_id
  WHERE NOT EXISTS (
    SELECT 1 FROM eligibility_backfill_graduates AS graduate
    WHERE graduate.player_id = credited.player_id
  )
  ON CONFLICT (player_id, rules_version, gene_id) DO NOTHING;
  GET DIAGNOSTICS v_credited = ROW_COUNT;

  -- Pass 3. Seed the Dynasty-independent starter Genes for everyone else.
  INSERT INTO player_gene_eligibility (
    player_id, rules_version, gene_id, state, source,
    first_eligible_at, learning_event_version, updated_at
  )
  SELECT p.id, v_rules_version, starter.gene_id,
         'offer_eligible', 'starter', NOW(), 1, NOW()
  FROM players AS p
  CROSS JOIN unnest(
    genome_eligibility_active_gene_ids(v_rules_version, v_shared_starters)
  ) AS starter(gene_id)
  WHERE NOT EXISTS (
    SELECT 1 FROM eligibility_backfill_graduates AS graduate
    WHERE graduate.player_id = p.id
  )
  ON CONFLICT (player_id, rules_version, gene_id) DO NOTHING;
  GET DIAGNOSTICS v_seeded = ROW_COUNT;

  -- The counts describe exactly the rows the statements above selected:
  -- rows WRITTEN, not accounts examined and not rows that already existed.
  RAISE NOTICE
    'Migration 066: % graduation rows, % history-credit rows and % starter rows written (rows inserted, not accounts examined; a re-run writes 0).',
    v_graduated, v_credited, v_seeded;
END;
$$;

COMMIT;
