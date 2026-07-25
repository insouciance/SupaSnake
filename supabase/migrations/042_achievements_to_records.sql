-- Migration 042: Achievements retire into the Legacy Records
--
-- WP-0.04 (Track A). GROUND_TRUTH §9.5 (non-atomic achievement claim, kill
-- #11); Constitution Rule 6 ("everything earned is permanent"), Rule 11
-- (server authority), Rule 12 (default to subtraction), §8.4 (collection is
-- identity, not economy) and §12.2 (no new claim RPC beyond the Daily Take's
-- collect). Closes build-log findings F-6, F-6a, F-11 and F-15.
--
-- WHAT CHANGES
--
--   The 2023-era achievement system was a second, parallel progression
--   surface: 18 thresholds in six categories, each paying a one-off DNA and
--   energy purse that the player had to walk to a screen and tap to collect.
--   The Records cabinet (023) already measures the same six things, banks
--   them in five permanent tiers, mints their badges and feeds
--   `players.legacy_score`. Rule 12 says the duplicate loses. This migration
--   ends the achievement mechanism and moves what players earned by it into
--   the Records, where nothing can take it away.
--
--   Three things happen, atomically, in this order:
--
--     1. EVERY OUTSTANDING CLAIM IS SETTLED. A completed-but-unclaimed
--        achievement is a debt. It is paid in DNA before the mechanism that
--        owed it is dismantled, with a matching `economy_transactions` row
--        per player (the audit the API route never wrote -- F-15). Section 6
--        asserts, before this transaction commits, that every player's DNA
--        rose by EXACTLY what they were owed: not a unit less (value lost),
--        not a unit more (value minted).
--
--     2. WHAT WAS EARNED BECOMES A RECORD. Each completed achievement proves
--        its player passed a threshold. That proof is banked as a FLOOR on
--        the Record measuring the same quantity, monotonically, together with
--        the tier badges the floor earns and the legacy score they sum to.
--        The claim mechanism dies; the fact does not (Rule 6).
--
--     3. THE CLAIM MECHANISM IS REMOVED FROM THE SCHEMA. The reward columns
--        leave `achievement_definitions` and the claim columns leave
--        `player_achievements`, so "claim an achievement reward" stops being
--        an operation this schema can express. `POST /api/achievements` and
--        every achievement surface are deleted in the same commit. NO NEW
--        CLAIM RPC IS ADDED (§12.2) -- this migration removes one and adds
--        none.
--
--   ACHIEVEMENT -> RECORD MAP (by category; the banked floor is the
--   achievement's own `requirement_value`, which the player demonstrably
--   passed):
--
--     games      (10/50/100)      -> mileage    "Total earning runs completed"
--     dna        (1k/10k/50k)     -> vault      "Lifetime DNA banked"
--     breeding   (5/20/50)        -> geneflow   "Total breeds performed"
--     collection (10/20/30)       -> menagerie  "Distinct variants collected"
--     streak     (3/7/30)         -> unbroken   "Longest login streak (days)"
--     score      (50/100/150)     -> no record; see below
--
--   The three score achievements have no Record analogue -- no record
--   measures Score, and adding a 22nd record definition to carry three
--   retired badges would be exactly the addition Rule 12 forbids. They need
--   none: "reach score N in a game" is `players.high_score >= N`, and
--   `high_score` is already a permanent high-water mark written with
--   `Math.max` at settlement (`api/game/session/route.ts`). The fact is
--   already permanent and already rendered on the profile and the
--   leaderboard. Nothing is converted because nothing is at risk.
--
--   Three of the five mapped aggregates are not byte-identical to the
--   achievement's own counter -- `mileage` excludes free play where
--   `total_games_played` counted it, `vault` counts DNA banked by extraction
--   where the achievement counted all DNA earned, `menagerie` counts distinct
--   variants where the achievement counted rows. The banked value is
--   therefore a FLOOR, not a recomputation: it can only raise a record, never
--   lower one. Rounding the ambiguity in the player's favour is the only
--   direction Rule 6 permits.
--
-- ENERGY IS NOT PAID, AND CANNOT BE (Constitution §8.6, §10.4)
--
--   Nine of the 18 achievements also carried a small `reward_energy` purse.
--   That purse is not payable and is not converted:
--
--     * Migration 039 deleted the energy STOCK. `players.energy` survives as
--       a deprecated column that nothing reads, writes or spends; a player's
--       charges are derived from `(charges_day, charges_used)` and the UTC
--       day is the only refill authority. Crediting the deprecated column
--       would move a number no player can observe or use.
--     * §10.4 and Rule 3 forbid any system from granting energy at all --
--       "add a charge" is deliberately not an operation the schema supports.
--       A migration that granted one would be the first exception.
--     * Converting it to DNA would require inventing an exchange rate between
--       a live currency and a deleted one, i.e. minting DNA.
--
--   So the energy component is dropped, and section 6 PROVES it was dropped
--   rather than silently mishandled: it asserts `players.energy` is
--   byte-identical before and after, and it RAISEs a NOTICE naming the exact
--   total forgone so the number appears in the deploy log instead of nowhere.
--   The DNA component -- the part that is still a currency -- is paid in
--   full.
--
-- FINDING F-6: `refresh_player_records` could write records DOWNWARD
--
--   `023_records_chronicle.sql:507` upserts all 21 records with
--   `ON CONFLICT DO UPDATE SET value = EXCLUDED.value, tier = EXCLUDED.tier`
--   and no `GREATEST()`. The function recomputes every record from live
--   aggregates, so any shrinking source wrote `player_records.value`,
--   `.tier` and `players.legacy_score` downward -- the strongest Rule 6
--   defect in the repo, and the reason this migration could not simply
--   delegate its backfill to that function. Section 4 re-declares it with
--   `GREATEST` on both columns and on the legacy score.
--
--   All 21 records take the guard, because all 21 are high-water quantities.
--   Fourteen are lifetime counts or sums (vault, clean_getaways, cold_blood,
--   the three *_depth mastery totals, geneflow, on_the_wall, benefactor,
--   mileage, board_presence, chronicler, dynast_of_seasons, crowned); three
--   are best-ever maxima (high_water, bloodline, unbroken); three are counts
--   of a distinct set that only ever gains members (menagerie, campaigner,
--   stormchaser); and the twenty-first, `tenure`, is
--   `NOW()::date - created_at::date` -- the ONE record that is a live gauge
--   rather than a banked total, and the only one where the guard could bind.
--   It cannot decrease unless `created_at` is edited, so the guard is a
--   semantic no-op there and a safety net against exactly that edit. The one
--   record whose source could shrink through ordinary play
--   would be `menagerie` (a census of `collected_snakes`), and it cannot:
--   `collected_snakes` is never deleted outside GDPR erasure, breeding
--   consumes no parent, and `030_genome_lineage.sql:664-665` revokes DELETE
--   from anon and authenticated. NO RECORD IN THE CABINET IS A LIVE GAUGE
--   THAT IS ALLOWED TO FALL; the live collection census the Chronicle renders
--   comes from the collection log, not from `player_records`.
--
-- FINDING F-6a: `crowned`'s bye path was wrong in BOTH directions
--
--   `crowned` counts season championships. Its normal path is already right:
--   it reads the LOCKED ROSTER SNAPSHOT (`roster_a`/`roster_b`) from the
--   championship semifinal duel, so leaving the clan afterwards cannot lower
--   the record. Its bye path (`d.id IS NULL` -- a championship decided with
--   no duel, `023:465-469`) fell back to
--   `EXISTS (SELECT 1 FROM clan_members ...)`: CURRENT membership. That was
--   wrong twice over. Leaving the clan lowered a permanent record (Rule 6),
--   and JOINING a bye-champion clan granted the record retroactively --
--   whereupon `refresh_player_records` minted the tier badges into
--   `player_cosmetics` with `ON CONFLICT DO NOTHING` and no revocation path
--   anywhere. Join, refresh, keep the permanent badges, leave, repeat: a
--   repeatable permanent-cosmetic farm.
--
--   Section 3 fixes both directions with one change -- the bye path gets a
--   roster snapshot of its own, exactly as the duel path already has:
--
--     * `season_champions.champion_roster UUID[]` stores the champion clan's
--       membership as of the moment the banner was decided.
--     * A BEFORE INSERT trigger fills it from `clan_members` at settlement.
--       A trigger rather than a patch to `maintain_season_playoffs`
--       deliberately: that function is ~200 lines, is co-owned by 021 and
--       024, and re-declaring it to add one column write would put the whole
--       playoff bracket at risk for no gain. The trigger also binds any
--       FUTURE writer of the table, which a patched function body would not.
--     * Existing banners are backfilled from members whose `joined_at`
--       precedes `decided_at` -- the best evidence the schema retains, and
--       strictly the safer direction: it cannot grant the record to anyone
--       who joined after the fact, and it cannot remove it from anyone who
--       has it today, because section 4's `GREATEST` makes every subsequent
--       recompute upward-only.
--
-- FINDINGS F-11 / F-15: the claim route's unlocked read-modify-write
--
--   `api/achievements/route.ts:173-192` marked the row claimed, then applied
--   the balance in a separate unlocked call, checked neither `error`, took no
--   row lock, and logged no `economy_transactions` row for the energy half.
--   All of it is fixed by deletion: the route file is removed in this commit
--   and the final settlement below is a single transactional statement with a
--   ledger row per player.
--
-- DEPLOY ORDER
--
--   Ship the application code FIRST, then apply this migration. The new code
--   reads no achievement table and no reward column, so code-then-migration
--   is safe in both directions; migration-then-code would 500
--   `GET /api/achievements` and the profile's Early Career panel for the
--   length of the deploy.
--
-- DOWN-NOTE (forward-only; this migration is not reversible in place)
--
--   To revert: re-add `achievement_definitions.reward_dna` and
--   `.reward_energy` (`003_engagement_features.sql:71-72`) and re-seed their
--   18 values from `003:78-102`; re-add
--   `player_achievements.reward_claimed BOOLEAN NOT NULL DEFAULT false` and
--   `.reward_claimed_at TIMESTAMPTZ` (`003:117-118`) with its partial index
--   (`003:124`); restore `refresh_player_records` from
--   `023_records_chronicle.sql:302-560`; drop
--   `season_champions.champion_roster`, its trigger and
--   `snapshot_champion_roster()`; and restore the route and components from
--   git history.
--
--   NO PLAYER-OWNED VALUE IS DESTROYED BY THIS MIGRATION AND NONE WOULD BE
--   DESTROYED BY THE REVERT. Every `player_achievements` row -- which
--   achievement, what progress, when completed -- is preserved untouched as a
--   frozen ledger and is still exported by the GDPR data export. Every DNA
--   purse owed is paid before its column is dropped, and its payment is
--   recorded permanently in `economy_transactions`. On a revert,
--   `reward_claimed` would read false for every restored row; section 7's
--   assertion that no completed achievement is left unsettled is what makes
--   re-running the settlement after such a revert a no-op rather than a
--   double payment -- but a revert MUST re-run this migration rather than the
--   old route, because the old route is the defect.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Preservation snapshots -- taken BEFORE anything is written
-- ---------------------------------------------------------------------------
--
-- The acceptance criterion for this work package is that the sum of granted
-- rewards is preserved, asserted in the migration. These three temp tables
-- are the "before" half of that proof; section 6 re-reads them and aborts the
-- whole transaction if the "after" half disagrees by a single unit.

-- (a) What each player holds, and what they are owed. `owed_dna` /
--     `owed_energy` sum the purses of achievements that are COMPLETED and
--     NOT YET CLAIMED -- the outstanding debt. `already_claimed_dna` records
--     what the old route had already paid, so section 6 can report the total
--     EVER granted by the achievement system rather than only this delta.
CREATE TEMP TABLE wp_0_04_player_pre ON COMMIT DROP AS
SELECT
  p.id                         AS player_id,
  p.dna                        AS dna_before,
  p.energy                     AS energy_before,
  p.legacy_score               AS legacy_score_before,
  COALESCE(owed.owed_dna, 0)   AS owed_dna,
  COALESCE(owed.owed_energy, 0) AS owed_energy,
  COALESCE(paid.paid_dna, 0)   AS already_claimed_dna
FROM players p
LEFT JOIN (
  SELECT
    pa.player_id,
    SUM(ad.reward_dna)::BIGINT    AS owed_dna,
    SUM(ad.reward_energy)::BIGINT AS owed_energy
  FROM player_achievements pa
  JOIN achievement_definitions ad ON ad.id = pa.achievement_id
  WHERE pa.completed IS TRUE
    AND pa.reward_claimed IS NOT TRUE
  GROUP BY pa.player_id
) owed ON owed.player_id = p.id
LEFT JOIN (
  SELECT
    pa.player_id,
    SUM(ad.reward_dna)::BIGINT AS paid_dna
  FROM player_achievements pa
  JOIN achievement_definitions ad ON ad.id = pa.achievement_id
  WHERE pa.completed IS TRUE
    AND pa.reward_claimed IS TRUE
  GROUP BY pa.player_id
) paid ON paid.player_id = p.id;

CREATE INDEX ON wp_0_04_player_pre (player_id);

-- (b) Every existing record value and tier. Rule 6 is proven, not asserted in
--     a comment: nothing this migration writes may end below where it started.
CREATE TEMP TABLE wp_0_04_records_pre ON COMMIT DROP AS
SELECT pr.player_id, pr.record_id, pr.value, pr.tier
FROM player_records pr;

CREATE INDEX ON wp_0_04_records_pre (player_id, record_id);

-- (c) The conversion itself, resolved once and reused by sections 5 and 7 so
--     the backfill and its assertion cannot drift apart. One row per
--     (player, record): the highest threshold that player has proven.
CREATE TEMP TABLE wp_0_04_converted ON COMMIT DROP AS
SELECT
  pa.player_id,
  map.record_id,
  MAX(ad.requirement_value)::BIGINT AS banked_value
FROM player_achievements pa
JOIN achievement_definitions ad ON ad.id = pa.achievement_id
JOIN (VALUES
  ('games',      'mileage'),
  ('dna',        'vault'),
  ('breeding',   'geneflow'),
  ('collection', 'menagerie'),
  ('streak',     'unbroken')
  -- 'score' is deliberately absent: players.high_score already holds it
  -- permanently. See the header.
) AS map(category, record_id) ON map.category = ad.category
WHERE pa.completed IS TRUE
GROUP BY pa.player_id, map.record_id;

CREATE INDEX ON wp_0_04_converted (player_id, record_id);

-- ---------------------------------------------------------------------------
-- 2. Settle every outstanding claim (Rule 6, Rule 11, finding F-15)
-- ---------------------------------------------------------------------------
--
-- A completed achievement whose purse was never collected is a debt the
-- product owes. It is paid HERE, before section 7 removes the mechanism that
-- owed it, in one statement rather than the route's unlocked
-- read-modify-write (F-11).

UPDATE players p
SET dna = p.dna + pre.owed_dna
FROM wp_0_04_player_pre pre
WHERE p.id = pre.player_id
  AND pre.owed_dna > 0;

-- The audit row the claim route never reliably wrote. One row per player
-- rather than per achievement: this is a single settlement event, and its
-- metadata itemises what it covered so the ledger stays reconstructable.
INSERT INTO economy_transactions
  (player_id, resource_type, amount, balance_after, source_type, metadata)
SELECT
  pre.player_id,
  'dna',
  pre.owed_dna::INTEGER,
  p.dna,
  'achievement_reward',
  jsonb_build_object(
    'migration', '042_achievements_to_records',
    'reason', 'final settlement of outstanding achievement rewards before the mechanism was removed',
    'achievements', (
      SELECT jsonb_agg(jsonb_build_object('id', pa.achievement_id, 'dna', ad.reward_dna)
                       ORDER BY pa.achievement_id)
      FROM player_achievements pa
      JOIN achievement_definitions ad ON ad.id = pa.achievement_id
      WHERE pa.player_id = pre.player_id
        AND pa.completed IS TRUE
        AND pa.reward_claimed IS NOT TRUE
    )
  )
FROM wp_0_04_player_pre pre
JOIN players p ON p.id = pre.player_id
WHERE pre.owed_dna > 0;

-- Mark the debt settled. `reward_claimed_at` is stamped so the frozen ledger
-- records when the purse actually landed, for the moments between now and
-- section 6 dropping the columns.
UPDATE player_achievements pa
SET reward_claimed = true,
    reward_claimed_at = COALESCE(pa.reward_claimed_at, NOW()),
    updated_at = NOW()
WHERE pa.completed IS TRUE
  AND pa.reward_claimed IS NOT TRUE;

-- ---------------------------------------------------------------------------
-- 3. The championship roster snapshot (finding F-6a)
-- ---------------------------------------------------------------------------

ALTER TABLE season_champions
  ADD COLUMN IF NOT EXISTS champion_roster UUID[] NOT NULL DEFAULT '{}'::UUID[];

COMMENT ON COLUMN season_champions.champion_roster IS
  'auth.users ids of the champion clan''s members at the moment the banner was decided (WP-0.04, finding F-6a). The permanent answer to "who was crowned": read by refresh_player_records for bye championships exactly as clan_duels.roster_a/roster_b is read for contested ones. Filled by the snapshot_champion_roster trigger; never recomputed from current membership, so leaving the clan cannot lower the record and joining it later cannot grant one.';

CREATE OR REPLACE FUNCTION snapshot_champion_roster()
RETURNS TRIGGER AS $$
BEGIN
  -- Only ever fills an empty roster. An explicit roster supplied by the
  -- caller (a backfill, a restore) is authoritative and is left alone.
  IF NEW.champion_roster IS NULL OR array_length(NEW.champion_roster, 1) IS NULL THEN
    SELECT COALESCE(array_agg(cm.player_id ORDER BY cm.player_id), '{}')
    INTO NEW.champion_roster
    FROM clan_members cm
    WHERE cm.clan_id = NEW.clan_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- SECURITY DEFINER audit (Rule 11). This function reads `clan_members`, which
-- is RLS-protected, from inside a trigger that must see the WHOLE roster and
-- not just the rows the inserting session may select. It writes nothing but
-- the NEW row it was handed, takes no arguments a caller could bend, grants
-- no currency and touches no economy table. It is not callable as an RPC: a
-- trigger function returns TRIGGER and Postgres rejects a direct call, and
-- the grants below remove even the attempt.
REVOKE EXECUTE ON FUNCTION snapshot_champion_roster() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION snapshot_champion_roster() FROM anon;
REVOKE EXECUTE ON FUNCTION snapshot_champion_roster() FROM authenticated;

DROP TRIGGER IF EXISTS trg_snapshot_champion_roster ON season_champions;
CREATE TRIGGER trg_snapshot_champion_roster
  BEFORE INSERT ON season_champions
  FOR EACH ROW
  EXECUTE FUNCTION snapshot_champion_roster();

-- Backfill existing banners. `joined_at <= decided_at` is the strongest
-- evidence the schema still holds: it excludes anyone who joined after the
-- championship (closing the retroactive-grant direction even for history) and
-- includes everyone who was there and stayed. Members who left before this
-- migration cannot be recovered -- `clan/route.ts:476` hard-deletes the
-- membership row (finding F-7, WP-1.02) -- but they read as 0 under the
-- CURRENT code too, so the backfill takes nothing away from anybody.
UPDATE season_champions sc
SET champion_roster = COALESCE(members.roster, '{}')
FROM (
  SELECT c.season_id,
         array_agg(cm.player_id ORDER BY cm.player_id) AS roster
  FROM season_champions c
  JOIN clan_members cm
    ON cm.clan_id = c.clan_id
   AND cm.joined_at <= c.decided_at
  GROUP BY c.season_id
) members
WHERE members.season_id = sc.season_id
  AND array_length(sc.champion_roster, 1) IS NULL;

-- ---------------------------------------------------------------------------
-- 4. refresh_player_records -- monotonic (finding F-6), bye path fixed (F-6a)
-- ---------------------------------------------------------------------------
--
-- Carried over from `023_records_chronicle.sql:302-560` with exactly three
-- changes, each marked WP-0.04 inline:
--
--   (i)   the upsert guards `value` and `tier` with GREATEST (F-6),
--   (ii)  the `crowned` bye path reads `sc.champion_roster` instead of
--         current `clan_members` (F-6a),
--   (iii) `players.legacy_score` is written with GREATEST.
--
-- Every other line -- the aggregate queries, the badge grant, the capstone
-- titles, the return shape -- is a byte-for-byte carryover. The function
-- remains idempotent and remains a recompute-from-aggregates: it just can no
-- longer publish a recomputed number that is LOWER than the one already
-- banked. `CREATE OR REPLACE` is sufficient: the signature is unchanged.

CREATE OR REPLACE FUNCTION refresh_player_records(p_player_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user UUID;
  v_created TIMESTAMPTZ;
  -- extraction + mileage
  v_vault BIGINT := 0;
  v_high_water BIGINT := 0;
  v_getaways BIGINT := 0;
  v_cold_blood BIGINT := 0;
  v_mileage BIGINT := 0;
  -- dynasty
  v_primal_xp BIGINT := 0;
  v_cyber_xp BIGINT := 0;
  v_cosmic_xp BIGINT := 0;
  -- collection
  v_menagerie BIGINT := 0;
  v_bloodline BIGINT := 0;
  v_geneflow BIGINT := 0;
  -- gauntlet
  v_on_the_wall BIGINT := 0;
  v_campaigner BIGINT := 0;
  v_benefactor BIGINT := 0;
  -- veterancy
  v_tenure BIGINT := 0;
  v_unbroken BIGINT := 0;
  -- legacy
  v_stormchaser BIGINT := 0;
  v_board_presence BIGINT := 0;
  v_chronicler BIGINT := 0;
  v_dynast BIGINT := 0;
  v_crowned BIGINT := 0;
  v_legacy_score INTEGER := 0;
BEGIN
  SELECT user_id, created_at INTO v_user, v_created
  FROM players WHERE id = p_player_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'player_not_found');
  END IF;

  -- ---- Extraction + Mileage (one pass over the player's sessions) ------
  SELECT
    COALESCE(SUM(gs.dna_earned) FILTER (WHERE gs.extracted), 0),
    COALESCE(MAX(gs.dna_earned) FILTER (WHERE gs.extracted), 0),
    COUNT(*) FILTER (WHERE gs.extracted),
    COUNT(*) FILTER (WHERE gs.extracted AND gs.foods_collected >= 63),
    COUNT(*)
  INTO v_vault, v_high_water, v_getaways, v_cold_blood, v_mileage
  FROM game_sessions gs
  WHERE gs.player_id = p_player_id
    AND gs.ended_at IS NOT NULL
    AND gs.validated IS TRUE
    AND gs.is_free_play IS NOT TRUE;

  -- ---- Dynasty Depth ---------------------------------------------------
  SELECT
    COALESCE(MAX(pm.xp) FILTER (WHERE pm.dynasty = 'PRIMAL'), 0),
    COALESCE(MAX(pm.xp) FILTER (WHERE pm.dynasty = 'CYBER'), 0),
    COALESCE(MAX(pm.xp) FILTER (WHERE pm.dynasty = 'COSMIC'), 0)
  INTO v_primal_xp, v_cyber_xp, v_cosmic_xp
  FROM player_mastery pm
  WHERE pm.player_id = p_player_id;

  -- ---- Collection ------------------------------------------------------
  SELECT COUNT(DISTINCT cs.snake_variant_id), COALESCE(MAX(cs.generation), 0)
  INTO v_menagerie, v_bloodline
  FROM collected_snakes cs
  WHERE cs.player_id = p_player_id;

  SELECT COUNT(*) INTO v_geneflow
  FROM breeding_history bh
  WHERE bh.player_id = p_player_id;

  -- ---- Gauntlet (auth-uid space; guests have no clan surface) ----------
  IF v_user IS NOT NULL THEN
    SELECT COUNT(DISTINCT d.week_start) INTO v_campaigner
    FROM clan_duels d
    WHERE v_user = ANY(d.roster_a) OR v_user = ANY(COALESCE(d.roster_b, '{}'));

    SELECT COUNT(*) INTO v_on_the_wall
    FROM clan_duels d
    JOIN game_sessions gs
      ON gs.player_id = p_player_id
     AND gs.ended_at IS NOT NULL
     AND gs.dna_earned > 0
     AND gs.is_free_play IS NOT TRUE
     AND gs.ended_at >= CASE WHEN d.effective_rules IS NOT NULL
           THEN ((d.week_start + 3)::timestamp AT TIME ZONE 'UTC')
           ELSE (d.week_start::timestamp AT TIME ZONE 'UTC') END
     AND gs.ended_at < ((d.week_start + 7)::timestamp AT TIME ZONE 'UTC')
    WHERE d.clan_b IS NOT NULL
      AND (v_user = ANY(d.roster_a) OR v_user = ANY(COALESCE(d.roster_b, '{}')));

    SELECT COALESCE(SUM(ct.amount), 0) INTO v_benefactor
    FROM clan_tithes ct
    WHERE ct.player_id = v_user;
  END IF;

  -- ---- Veterancy -------------------------------------------------------
  v_tenure := GREATEST(0, (NOW()::date - v_created::date));

  SELECT COALESCE(MAX(ps.longest_streak), 0) INTO v_unbroken
  FROM player_streaks ps
  WHERE ps.player_id = p_player_id;

  -- ---- Legacy ----------------------------------------------------------
  SELECT COUNT(DISTINCT gs.anomaly_week) INTO v_stormchaser
  FROM game_sessions gs
  WHERE gs.player_id = p_player_id
    AND gs.anomaly_id IS NOT NULL
    AND gs.anomaly_week IS NOT NULL
    AND gs.ended_at IS NOT NULL
    AND gs.validated IS TRUE
    AND gs.is_free_play IS NOT TRUE;

  -- Top-10 finishes on FINISHED weekly boards (get_anomaly_board's exact
  -- eligibility + ordering; the running week is not yet a finish).
  WITH board AS (
    SELECT gs.anomaly_week, gs.player_id, MAX(gs.score) AS best_score
    FROM game_sessions gs
    WHERE gs.anomaly_id IS NOT NULL
      AND gs.anomaly_week IS NOT NULL
      AND gs.anomaly_week < duel_week_start(NOW())
      AND gs.ended_at IS NOT NULL
      AND gs.validated IS TRUE
      AND gs.is_free_play IS NOT TRUE
    GROUP BY gs.anomaly_week, gs.player_id
  ),
  ranked AS (
    SELECT board.anomaly_week, board.player_id,
           ROW_NUMBER() OVER (
             PARTITION BY board.anomaly_week
             ORDER BY board.best_score DESC, board.player_id ASC
           ) AS rank
    FROM board
  )
  SELECT COUNT(*) INTO v_board_presence
  FROM ranked r
  WHERE r.player_id = p_player_id AND r.rank <= 10;

  SELECT COALESCE(SUM(pbp.current_level), 0),
         COUNT(*) FILTER (WHERE pbp.current_level >= bps.max_level)
  INTO v_chronicler, v_dynast
  FROM player_battle_pass pbp
  JOIN battle_pass_seasons bps ON bps.id = pbp.season_id
  WHERE pbp.player_id = p_player_id;

  -- Crowned: rostered member of the champion clan AT SETTLEMENT. Both paths
  -- now read a locked snapshot -- the championship (semifinal-round) duel's
  -- roster for a contested title, and season_champions.champion_roster for a
  -- bye. WP-0.04 (F-6a): the bye path previously read CURRENT clan_members,
  -- so leaving a clan lowered a permanent record and joining a bye-champion
  -- clan granted one retroactively together with its never-revoked badges.
  IF v_user IS NOT NULL THEN
    SELECT COUNT(*) INTO v_crowned
    FROM season_champions sc
    JOIN season_playoff_matches m
      ON m.season_id = sc.season_id
     AND m.round = 'semifinal'
     AND m.winner = sc.clan_id
    LEFT JOIN clan_duels d ON d.id = m.duel_id
    WHERE (
      (d.id IS NOT NULL AND v_user = ANY(
        CASE WHEN d.clan_a = sc.clan_id THEN d.roster_a ELSE COALESCE(d.roster_b, '{}') END
      ))
      OR
      (d.id IS NULL AND v_user = ANY(COALESCE(sc.champion_roster, '{}')))
    );
  END IF;

  -- ---- Upsert all 21 records with their reached tiers ------------------
  WITH vals(record_id, value) AS (
    VALUES
      ('vault',             v_vault),
      ('high_water',        v_high_water),
      ('clean_getaways',    v_getaways),
      ('cold_blood',        v_cold_blood),
      ('primal_depth',      v_primal_xp),
      ('cyber_depth',       v_cyber_xp),
      ('cosmic_depth',      v_cosmic_xp),
      ('menagerie',          v_menagerie),
      ('bloodline',         v_bloodline),
      ('geneflow',          v_geneflow),
      ('on_the_wall',       v_on_the_wall),
      ('campaigner',        v_campaigner),
      ('benefactor',        v_benefactor),
      ('tenure',            v_tenure),
      ('unbroken',          v_unbroken),
      ('mileage',           v_mileage),
      ('stormchaser',       v_stormchaser),
      ('board_presence',    v_board_presence),
      ('chronicler',        v_chronicler),
      ('dynast_of_seasons', v_dynast),
      ('crowned',           v_crowned)
  )
  INSERT INTO player_records (player_id, record_id, value, tier, updated_at)
  SELECT
    p_player_id,
    rd.id,
    v.value,
    (SELECT COUNT(*) FROM unnest(rd.thresholds) th WHERE v.value >= th),
    NOW()
  FROM vals v
  JOIN record_definitions rd ON rd.id = v.record_id
  -- WP-0.04 (F-6): a record is a HIGH-WATER MARK. Every one of the 21 is a
  -- lifetime count, a lifetime sum, a best-ever maximum, or account age --
  -- none is a gauge that is allowed to fall -- so a shrinking source
  -- aggregate must never publish downward. Rule 6.
  ON CONFLICT (player_id, record_id) DO UPDATE
    SET value = GREATEST(player_records.value, EXCLUDED.value),
        tier = GREATEST(player_records.tier, EXCLUDED.tier),
        updated_at = NOW();

  -- ---- Grant every reached tier's badge (cumulative, idempotent) -------
  INSERT INTO player_cosmetics (player_id, cosmetic_id, source)
  SELECT p_player_id, 'record_' || pr.record_id || '_t' || t.tier, 'records'
  FROM player_records pr
  CROSS JOIN generate_series(1, 5) AS t(tier)
  WHERE pr.player_id = p_player_id
    AND t.tier <= pr.tier
    AND EXISTS (
      SELECT 1 FROM cosmetic_definitions cd
      WHERE cd.id = 'record_' || pr.record_id || '_t' || t.tier
    )
  ON CONFLICT (player_id, cosmetic_id) DO NOTHING;

  -- ---- Capstone titles: every record in the category at Diamond+ -------
  INSERT INTO player_cosmetics (player_id, cosmetic_id, source)
  SELECT p_player_id, cap.title_id, 'records'
  FROM (VALUES
    ('extraction', 'title_extractor_prime'),
    ('dynasty',    'title_apex_handler'),
    ('collection', 'title_grand_curator'),
    ('gauntlet',   'title_warmaster'),
    ('veterancy',  'title_old_guard'),
    ('legacy',     'title_perennial')
  ) AS cap(category, title_id)
  WHERE (
    SELECT MIN(pr.tier)
    FROM record_definitions rd
    JOIN player_records pr
      ON pr.record_id = rd.id AND pr.player_id = p_player_id
    WHERE rd.category = cap.category
  ) >= 4
  ON CONFLICT (player_id, cosmetic_id) DO NOTHING;

  -- ---- Legacy Score: sum of banked tier points (cumulative) ------------
  SELECT COALESCE(SUM(banked.points), 0)::INTEGER INTO v_legacy_score
  FROM player_records pr
  JOIN record_definitions rd ON rd.id = pr.record_id
  CROSS JOIN LATERAL (
    SELECT COALESCE(SUM(p), 0) AS points
    FROM unnest(rd.tier_points[1:pr.tier]) AS p
  ) banked
  WHERE pr.player_id = p_player_id;

  -- WP-0.04 (F-6): the banked score is monotonic because the tiers above are.
  -- The guard is belt-and-braces against a future tier_points retune reading
  -- lower than the points a player has already been shown.
  UPDATE players SET legacy_score = GREATEST(legacy_score, v_legacy_score)
  WHERE id = p_player_id;

  SELECT legacy_score INTO v_legacy_score FROM players WHERE id = p_player_id;

  RETURN jsonb_build_object(
    'success', true,
    'legacy_score', v_legacy_score,
    'records', (
      SELECT jsonb_object_agg(pr.record_id, jsonb_build_object('value', pr.value, 'tier', pr.tier))
      FROM player_records pr WHERE pr.player_id = p_player_id
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- SECURITY DEFINER audit (Rule 11), carried over from 023 and re-affirmed:
-- this function recomputes state and grants inventory, so it belongs to the
-- server alone. Its only callers are the service-role client at session end
-- and the rate-limited own-Chronicle view. It grants no currency: records pay
-- prestige, never DNA.
REVOKE EXECUTE ON FUNCTION refresh_player_records(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION refresh_player_records(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION refresh_player_records(UUID) FROM authenticated;

COMMENT ON FUNCTION refresh_player_records(UUID) IS
  'Recomputes the 21 Legacy Records from live aggregates. WP-0.04: the upsert and the legacy score are guarded with GREATEST, so a shrinking source aggregate can no longer write an earned row downward (Rule 6, finding F-6), and the crowned bye path reads season_champions.champion_roster instead of current clan membership (finding F-6a). Service-role only.';

-- ---------------------------------------------------------------------------
-- 5. What players earned by achievement, banked as Records (Rule 6)
-- ---------------------------------------------------------------------------
--
-- The floor from section 1(c), upserted monotonically. This does NOT delegate
-- to refresh_player_records: the banked value is a proven threshold, not a
-- recomputation, and it must survive a recompute whose live aggregate reads
-- lower (mileage excludes the free-play runs the achievement counted).

INSERT INTO player_records (player_id, record_id, value, tier, updated_at)
SELECT
  c.player_id,
  rd.id,
  c.banked_value,
  (SELECT COUNT(*) FROM unnest(rd.thresholds) th WHERE c.banked_value >= th),
  NOW()
FROM wp_0_04_converted c
JOIN record_definitions rd ON rd.id = c.record_id
ON CONFLICT (player_id, record_id) DO UPDATE
  SET value      = GREATEST(player_records.value, EXCLUDED.value),
      tier       = GREATEST(player_records.tier, EXCLUDED.tier),
      updated_at = NOW();

-- Every tier the banked value reaches also owes its badge cosmetic.
-- Cumulative and idempotent, exactly as refresh_player_records grants them.
INSERT INTO player_cosmetics (player_id, cosmetic_id, source)
SELECT pr.player_id, 'record_' || pr.record_id || '_t' || t.tier, 'records'
FROM player_records pr
JOIN wp_0_04_converted c
  ON c.player_id = pr.player_id AND c.record_id = pr.record_id
CROSS JOIN generate_series(1, 5) AS t(tier)
WHERE t.tier <= pr.tier
  AND EXISTS (
    SELECT 1 FROM cosmetic_definitions cd
    WHERE cd.id = 'record_' || pr.record_id || '_t' || t.tier
  )
ON CONFLICT (player_id, cosmetic_id) DO NOTHING;

-- Legacy score is the sum of banked tier points. Recomputed only for the
-- players this migration touched, and only ever upward.
UPDATE players p
SET legacy_score = GREATEST(p.legacy_score, banked.total)
FROM (
  SELECT pr.player_id,
         COALESCE(SUM(banked_tiers.points), 0)::INTEGER AS total
  FROM player_records pr
  JOIN record_definitions rd ON rd.id = pr.record_id
  CROSS JOIN LATERAL (
    SELECT COALESCE(SUM(pt), 0) AS points
    FROM unnest(rd.tier_points[1:pr.tier]) AS pt
  ) banked_tiers
  WHERE pr.player_id IN (SELECT DISTINCT player_id FROM wp_0_04_converted)
  GROUP BY pr.player_id
) banked
WHERE p.id = banked.player_id;

-- ---------------------------------------------------------------------------
-- 6. Preservation assertions -- the transaction aborts if any of these fail
-- ---------------------------------------------------------------------------
--
-- Run BEFORE section 7 drops the columns they read, so nothing can be
-- dismantled while an unsettled claim or a lowered record is still in the
-- data. Every failure is a RAISE EXCEPTION: this migration ends with the old
-- world intact rather than with a half-migrated one.

DO $$
DECLARE
  v_bad          BIGINT;
  v_owed_total   BIGINT;
  v_paid_total   BIGINT;
  v_energy_lost  BIGINT;
  v_lifetime_dna BIGINT;
BEGIN
  -- (a) THE ACCEPTANCE CRITERION. Every player's DNA rose by EXACTLY what
  --     they were owed. A shortfall is value lost; a surplus is value minted.
  SELECT COUNT(*) INTO v_bad
  FROM wp_0_04_player_pre pre
  JOIN players p ON p.id = pre.player_id
  WHERE p.dna <> pre.dna_before + pre.owed_dna;
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'WP-0.04 aborted: % player(s) settled to the wrong DNA balance - the sum of granted achievement rewards was NOT preserved', v_bad;
  END IF;

  -- (b) The same statement in aggregate, so the deploy log carries the number.
  SELECT COALESCE(SUM(pre.owed_dna), 0) INTO v_owed_total FROM wp_0_04_player_pre pre;
  SELECT COALESCE(SUM(et.amount), 0) INTO v_paid_total
  FROM economy_transactions et
  WHERE et.source_type = 'achievement_reward'
    AND et.metadata ->> 'migration' = '042_achievements_to_records';
  IF v_paid_total <> v_owed_total THEN
    RAISE EXCEPTION
      'WP-0.04 aborted: settlement ledger records % DNA but % DNA was owed', v_paid_total, v_owed_total;
  END IF;

  -- (c) No completed achievement is left unsettled. Section 7 drops the claim
  --     columns immediately after this; if this count were non-zero, dropping
  --     them would destroy a debt.
  SELECT COUNT(*) INTO v_bad
  FROM player_achievements pa
  WHERE pa.completed IS TRUE AND pa.reward_claimed IS NOT TRUE;
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'WP-0.04 aborted: % completed achievement(s) still unsettled - refusing to remove the claim mechanism', v_bad;
  END IF;

  -- (d) §8.6/§10.4: no energy was granted. The deprecated stock is untouched.
  SELECT COUNT(*) INTO v_bad
  FROM wp_0_04_player_pre pre
  JOIN players p ON p.id = pre.player_id
  WHERE p.energy IS DISTINCT FROM pre.energy_before;
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'WP-0.04 aborted: % player(s) had their energy stock written - energy is never granted', v_bad;
  END IF;

  -- (e) Rule 6: no record moved downward, and none was lost.
  SELECT COUNT(*) INTO v_bad
  FROM wp_0_04_records_pre pre
  LEFT JOIN player_records pr
    ON pr.player_id = pre.player_id AND pr.record_id = pre.record_id
  WHERE pr.player_id IS NULL OR pr.value < pre.value OR pr.tier < pre.tier;
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'WP-0.04 aborted: % record(s) were lowered or lost (Rule 6)', v_bad;
  END IF;

  -- (f) Every converted achievement is banked at or above the threshold it
  --     proved. This is the "no separate surface, but nothing forgotten" half
  --     of the conversion.
  SELECT COUNT(*) INTO v_bad
  FROM wp_0_04_converted c
  LEFT JOIN player_records pr
    ON pr.player_id = c.player_id AND pr.record_id = c.record_id
  WHERE pr.player_id IS NULL OR pr.value < c.banked_value;
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'WP-0.04 aborted: % converted achievement(s) did not reach their Record floor', v_bad;
  END IF;

  -- (g) Rule 6: no legacy score moved downward.
  SELECT COUNT(*) INTO v_bad
  FROM wp_0_04_player_pre pre
  JOIN players p ON p.id = pre.player_id
  WHERE p.legacy_score < pre.legacy_score_before;
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'WP-0.04 aborted: % legacy score(s) were lowered (Rule 6)', v_bad;
  END IF;

  -- The full picture, named in the deploy log rather than nowhere: what the
  -- achievement system granted over its whole life, what this migration paid
  -- to close it out, and the energy purses that are not payable.
  SELECT COALESCE(SUM(pre.already_claimed_dna), 0) + v_owed_total
  INTO v_lifetime_dna FROM wp_0_04_player_pre pre;
  SELECT COALESCE(SUM(pre.owed_energy), 0) INTO v_energy_lost FROM wp_0_04_player_pre pre;
  RAISE NOTICE
    'WP-0.04: settled % DNA of outstanding achievement rewards across % player(s); % DNA granted by achievements over the system''s lifetime; % achievement-record floor(s) banked; % energy not paid (the stock was deleted by migration 039 - Constitution 8.6/10.4)',
    v_owed_total,
    (SELECT COUNT(*) FROM wp_0_04_player_pre pre WHERE pre.owed_dna > 0),
    v_lifetime_dna,
    (SELECT COUNT(*) FROM wp_0_04_converted),
    v_energy_lost;
END $$;

-- ---------------------------------------------------------------------------
-- 7. The claim mechanism, removed from the schema (Rule 12, §12.2)
-- ---------------------------------------------------------------------------
--
-- What survives is the LEDGER: which achievement, how far the player got,
-- whether and when they completed it. That is the earned fact, it is
-- permanent, and the GDPR export still carries it. What leaves is the PURSE
-- and the CLAIM -- the parts that made this an economy rather than a memory.
--
-- These are DROP COLUMNs, not DROP TABLEs, precisely so no player-owned row
-- is destroyed (Rule 6).

-- The purse. `achievement_definitions` is catalogue data -- no row in it
-- belongs to anyone -- and with these two columns gone there is no reward to
-- read, so a claim endpoint cannot be re-wired without first re-adding
-- schema. What the purses were is preserved in this migration's down-note and
-- in every `economy_transactions` row they ever produced.
ALTER TABLE achievement_definitions
  DROP COLUMN IF EXISTS reward_dna,
  DROP COLUMN IF EXISTS reward_energy;

COMMENT ON TABLE achievement_definitions IS
  'Catalogue of the 18 retired Early Career achievements (WP-0.04). Kept so the frozen player_achievements ledger reads meaningfully and the GDPR export can name what a row refers to. It pays nothing: the reward columns were dropped when the mechanism was removed, and what players earned by it was banked into the Legacy Records (migration 042).';

-- The claim. Every completed row was settled in section 2 and asserted
-- settled in section 6(c), so these columns now carry one value for every row
-- that matters. The index existed only to find unclaimed purses.
DROP INDEX IF EXISTS idx_player_achievements_unclaimed;

ALTER TABLE player_achievements
  DROP COLUMN IF EXISTS reward_claimed,
  DROP COLUMN IF EXISTS reward_claimed_at;

COMMENT ON TABLE player_achievements IS
  'FROZEN LEDGER (WP-0.04). Nothing writes this table any more: the achievement checker was deleted with the mechanism and what it measured is measured by the Legacy Records. Rows are retained permanently because they record something a player earned (Rule 6) and because the GDPR data export reads them. Read-only.';

-- Nothing writes the ledger any more, so nothing needs write access to it.
-- The service role is unaffected by these revocations.
REVOKE INSERT, UPDATE, DELETE ON TABLE player_achievements FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE player_achievements FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE achievement_definitions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE achievement_definitions FROM authenticated;

COMMIT;
