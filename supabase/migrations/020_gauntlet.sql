-- ============================================================================
-- Migration 020: Clan Gauntlet (Design v2 section 8)
-- Evolves Clan Duels v1 (011) into the prepared, counter-playable weekly
-- rivalry. Duels v1 stays the scoring/settlement spine (capped best-runs
-- scoring, ELO, lazy settlement); this migration layers on:
--
-- WEEKLY PROTOCOL (section 8.1):
--   Mon 00:00  pairing (rating-adjacent + revenge priority) + scouting opens
--   Mon-Wed    officers submit blind picks
--   Wed 00:00  picks lock, then reveal to both sides
--   Thu 00:00 - Sun 24:00  scored window - counted runs only inside it
--   Mon 00:00  settlement (lazy, as v1) + next pairing
--   Roster locks at Monday pairing (anti-mercenary): joins/leaves during
--   the week do not affect scoring.
--
-- BAN & PICK (section 8.2) - per clan, per week, blind until reveal:
--   1. Dynasty ruleset pick: EACH clan picks its own dynasty; that clan's
--      counted runs must be in ITS OWN picked dynasty. There is no shared
--      or coin-flipped dynasty - both sides' picks stand independently.
--   2. One clan-tech modifier - a scoring lens for YOUR OWN clan's week:
--        vanguard             top 8 members (vs 10), runs weigh x1.10
--        deep_bench           12 members count, best 25 runs each (vs 30)
--        extraction_doctrine  only banked (extracted) runs count, x1.15
--      research-unlocked (section 8.3): anomaly_doctrine (protocols_1),
--        sudden_death (protocols_2, best 10 runs only, x1.40)
--   3. One mutation ban vs opponents: the banned mutation is REMOVED from
--      the opponents' offer pools in their counted runs (session-start
--      pool filtering via player_gauntlet_ban + validator mirror).
--   Modifiers and bans change scoring weights and option pools only -
--   ZERO effect on DNA payouts.
--
-- ACTIVATION SEMANTICS (do not break duels v1):
--   A week's rules resolve (effective_rules stamped) only when at least
--   one clan submitted picks and the Wed deadline has passed. Weeks with
--   no picks - including every pre-020 week - settle and score exactly as
--   duels v1 (full week, all dynasties, top 10 / best 30). Once resolved,
--   the Thu-Sun scored window + per-side rules apply to live scores and
--   settlement.
--
-- CLAN RESEARCH v1 (section 8.3): tithe-funded, 500 DNA/member/week hard
--   cap, 3 branches x 4 nodes, per-branch costs 6000/14000/24000/40000
--   (full tree 252,000). Unlocks are pick options, structure, cosmetics,
--   and EXACTLY ONE numeric node: logistics_4 = +1 counted run per member
--   (30 -> 31) - never stat power. Officers SELECT the node being
--   researched (clan_research_target); tithes advance the pool and the
--   selected node auto-unlocks when affordable.
--
-- RIVALRY (section 8.4): clan_rivalries VIEW derived from clan_duels
--   (persistent head-to-head), revenge priority in pairing (prefer a
--   rematch vs a clan you're tied with or trailing against within the
--   season window - 8-week proxy until seasons infra lands).
--
-- Anti-P2W: counted scoring stays best-N-per-member + top-N-members,
--   tithes hard-capped per member per week, research grants options and
--   cosmetics and the single +1-run slot, all math server-recomputed.
--
-- NOTE: anomaly_doctrine is defined in the research tree but cannot be
--   PICKED until the Weekly Anomaly board (section 7.2) ships - the
--   submit RPC rejects it with ANOMALY_NOT_LIVE. The node still unlocks
--   (and gates protocols_2..4 progression) so research is not dead-ended.
--
-- The TS mirror of the tree/modifier/scoring constants lives in
-- src/shared/game/gauntlet.ts - keep in lockstep.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ECONOMY TRANSACTIONS: extend source_type CHECK with 'clan_tithe'
-- ----------------------------------------------------------------------------

ALTER TABLE economy_transactions DROP CONSTRAINT IF EXISTS economy_transactions_source_type_check;
ALTER TABLE economy_transactions ADD CONSTRAINT economy_transactions_source_type_check
  CHECK (source_type IN (
    'game_reward',
    'breeding_cost',
    'purchase',
    'daily_reward',
    'game_start',
    'energy_regen',
    'admin_grant',
    'refund',
    'achievement_reward',
    'streak_bonus',
    'battle_pass_reward',
    'offline_claim',
    'unlock_cost',
    'clan_tithe'
  ));

-- ----------------------------------------------------------------------------
-- 2. CLAN RESEARCH TABLES (section 8.3)
-- ----------------------------------------------------------------------------

-- Unlocked nodes. The 12-node catalog (3 branches x 4 tiers):
--   protocols_1 Anomaly Doctrine modifier      logistics_1 Scouting detail
--   protocols_2 Sudden Death modifier          logistics_2 Roster substitution
--   protocols_3 2nd ban option (intel)         logistics_3 Early scouting
--   protocols_4 Dynasty split pick             logistics_4 +1 counted run (30->31)
--   heraldry_1..4 cosmetics (banner frame, fanfare, board frame, animated title)
CREATE TABLE IF NOT EXISTS clan_research (
  clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL CHECK (node_id IN (
    'protocols_1', 'protocols_2', 'protocols_3', 'protocols_4',
    'logistics_1', 'logistics_2', 'logistics_3', 'logistics_4',
    'heraldry_1', 'heraldry_2', 'heraldry_3', 'heraldry_4'
  )),
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (clan_id, node_id)
);

-- Pooled tithe DNA not yet spent on a node
CREATE TABLE IF NOT EXISTS clan_research_progress (
  clan_id UUID PRIMARY KEY REFERENCES clans(id) ON DELETE CASCADE,
  dna_contributed BIGINT NOT NULL DEFAULT 0 CHECK (dna_contributed >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The node officers selected to research next (one per clan)
CREATE TABLE IF NOT EXISTS clan_research_target (
  clan_id UUID PRIMARY KEY REFERENCES clans(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL CHECK (node_id IN (
    'protocols_1', 'protocols_2', 'protocols_3', 'protocols_4',
    'logistics_1', 'logistics_2', 'logistics_3', 'logistics_4',
    'heraldry_1', 'heraldry_2', 'heraldry_3', 'heraldry_4'
  )),
  set_by UUID,                              -- auth.users id of the officer
  set_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-member weekly tithe ledger. The row CHECK caps a member's tithe in
-- ONE clan; contribute_tithe additionally sums ACROSS clans per week so
-- clan-hopping cannot exceed 500 DNA/member/week globally.
CREATE TABLE IF NOT EXISTS clan_tithes (
  clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  player_id UUID NOT NULL,                  -- auth.users id (clan_members.player_id)
  week_start DATE NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0 AND amount <= 500),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (clan_id, player_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_clan_tithes_player_week ON clan_tithes(player_id, week_start);
CREATE INDEX IF NOT EXISTS idx_clan_tithes_clan_week ON clan_tithes(clan_id, week_start);

-- ----------------------------------------------------------------------------
-- 3. GAUNTLET PICKS (section 8.2) - blind per clan per week
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gauntlet_picks (
  duel_id UUID NOT NULL REFERENCES clan_duels(id) ON DELETE CASCADE,
  clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  dynasty_pick TEXT NOT NULL CHECK (dynasty_pick IN ('PRIMAL', 'CYBER', 'COSMIC')),
  -- Second dynasty (protocols_4 Dynasty split pick: score 2 dynasties,
  -- best-runs pooled) - RPC-gated on the research node
  dynasty_pick_2 TEXT CHECK (dynasty_pick_2 IN ('PRIMAL', 'CYBER', 'COSMIC')),
  modifier_pick TEXT CHECK (modifier_pick IN (
    'vanguard', 'deep_bench', 'extraction_doctrine',
    'anomaly_doctrine', 'sudden_death'
  )),
  mutation_ban TEXT,                        -- validated in RPC vs the catalog
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_by UUID,                        -- auth.users id of the officer
  UNIQUE (duel_id, clan_id),
  CONSTRAINT gauntlet_picks_split_distinct
    CHECK (dynasty_pick_2 IS NULL OR dynasty_pick_2 <> dynasty_pick)
);

CREATE INDEX IF NOT EXISTS idx_gauntlet_picks_clan ON gauntlet_picks(clan_id, locked_at DESC);

-- ----------------------------------------------------------------------------
-- 4. CLAN DUELS: gauntlet columns (all nullable - v1 rows untouched)
-- ----------------------------------------------------------------------------

ALTER TABLE clan_duels
  ADD COLUMN IF NOT EXISTS effective_rules JSONB,      -- {'a': side, 'b': side} after reveal
  ADD COLUMN IF NOT EXISTS rules_resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS roster_a UUID[],            -- counted roster locked at pairing
  ADD COLUMN IF NOT EXISTS roster_b UUID[],
  ADD COLUMN IF NOT EXISTS gauntlet_meta JSONB NOT NULL DEFAULT '{}';

-- ----------------------------------------------------------------------------
-- 5. RLS
-- ----------------------------------------------------------------------------

ALTER TABLE clan_research ENABLE ROW LEVEL SECURITY;
ALTER TABLE clan_research_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE clan_research_target ENABLE ROW LEVEL SECURITY;
ALTER TABLE clan_tithes ENABLE ROW LEVEL SECURITY;
ALTER TABLE gauntlet_picks ENABLE ROW LEVEL SECURITY;

-- Research state is public (scouting shows the opponent's options anyway);
-- all writes go through SECURITY DEFINER RPCs.
DROP POLICY IF EXISTS clan_research_select ON clan_research;
CREATE POLICY clan_research_select ON clan_research
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS clan_research_progress_select ON clan_research_progress;
CREATE POLICY clan_research_progress_select ON clan_research_progress
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS clan_research_target_select ON clan_research_target;
CREATE POLICY clan_research_target_select ON clan_research_target
  FOR SELECT TO authenticated USING (true);

-- Tithes: own clan only
DROP POLICY IF EXISTS clan_tithes_select_own_clan ON clan_tithes;
CREATE POLICY clan_tithes_select_own_clan ON clan_tithes
  FOR SELECT TO authenticated
  USING (
    clan_id IN (SELECT clan_id FROM clan_members WHERE player_id = auth.uid())
  );

-- BLIND PICKS: a clan's picks are readable by its OWN members at any time;
-- the opponent's picks become readable only once BOTH clans locked or the
-- Wed 00:00 deadline passed (reveal). Enforced here so even direct
-- PostgREST reads cannot leak a blind pick.
DROP POLICY IF EXISTS gauntlet_picks_select_blind ON gauntlet_picks;
CREATE POLICY gauntlet_picks_select_blind ON gauntlet_picks
  FOR SELECT TO authenticated
  USING (
    clan_id IN (SELECT clan_id FROM clan_members WHERE player_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM clan_duels d
      WHERE d.id = gauntlet_picks.duel_id
        AND (
          NOW() >= ((d.week_start + 2)::timestamp AT TIME ZONE 'UTC')
          OR (SELECT COUNT(*) FROM gauntlet_picks gp2 WHERE gp2.duel_id = d.id) = 2
        )
    )
  );

-- ----------------------------------------------------------------------------
-- 6. RIVALRY VIEW (section 8.4) - derived from clan_duels, normalized pair
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW clan_rivalries AS
WITH pair_duels AS (
  SELECT
    LEAST(clan_a, clan_b) AS clan_x,
    GREATEST(clan_a, clan_b) AS clan_y,
    winner,
    week_start
  FROM clan_duels
  WHERE status = 'settled' AND clan_b IS NOT NULL
)
SELECT
  clan_x,
  clan_y,
  COUNT(*)::INTEGER AS meetings,
  (COUNT(*) FILTER (WHERE winner = clan_x))::INTEGER AS wins_x,
  (COUNT(*) FILTER (WHERE winner = clan_y))::INTEGER AS wins_y,
  (COUNT(*) FILTER (WHERE winner IS NULL))::INTEGER AS ties,
  (ARRAY_AGG(winner ORDER BY week_start DESC))[1] AS last_winner,
  MAX(week_start) AS last_week_start
FROM pair_duels
GROUP BY clan_x, clan_y;

-- ----------------------------------------------------------------------------
-- 7. RESEARCH HELPERS
-- ----------------------------------------------------------------------------

-- Tier costs (section 8.3): 6000 / 14000 / 24000 / 40000 per branch tier
CREATE OR REPLACE FUNCTION gauntlet_node_cost(p_node_id TEXT)
RETURNS INTEGER AS $$
  SELECT CASE
    WHEN p_node_id !~ '^(protocols|logistics|heraldry)_[1-4]$' THEN NULL
    WHEN right(p_node_id, 1) = '1' THEN 6000
    WHEN right(p_node_id, 1) = '2' THEN 14000
    WHEN right(p_node_id, 1) = '3' THEN 24000
    WHEN right(p_node_id, 1) = '4' THEN 40000
  END;
$$ LANGUAGE sql IMMUTABLE;

-- Prerequisite: tier N needs tier N-1 of the same branch (tier 1: none)
CREATE OR REPLACE FUNCTION gauntlet_node_prereq(p_node_id TEXT)
RETURNS TEXT AS $$
  SELECT CASE
    WHEN p_node_id !~ '^(protocols|logistics|heraldry)_[2-4]$' THEN NULL
    ELSE left(p_node_id, length(p_node_id) - 1)
         || (right(p_node_id, 1)::int - 1)::text
  END;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION clan_has_research(p_clan_id UUID, p_node_id TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM clan_research
    WHERE clan_id = p_clan_id AND node_id = p_node_id
  );
$$ LANGUAGE sql STABLE;

-- Auto-unlock the selected target when the pool affords it. Returns the
-- node id when a node unlocked, else NULL.
CREATE OR REPLACE FUNCTION gauntlet_try_unlock(p_clan_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_target TEXT;
  v_cost INTEGER;
  v_prereq TEXT;
  v_pool BIGINT;
BEGIN
  SELECT node_id INTO v_target FROM clan_research_target WHERE clan_id = p_clan_id;
  IF v_target IS NULL THEN
    RETURN NULL;
  END IF;

  IF clan_has_research(p_clan_id, v_target) THEN
    DELETE FROM clan_research_target WHERE clan_id = p_clan_id;
    RETURN NULL;
  END IF;

  v_prereq := gauntlet_node_prereq(v_target);
  IF v_prereq IS NOT NULL AND NOT clan_has_research(p_clan_id, v_prereq) THEN
    RETURN NULL;                            -- target set ahead of prereq: wait
  END IF;

  v_cost := gauntlet_node_cost(v_target);
  SELECT dna_contributed INTO v_pool
  FROM clan_research_progress WHERE clan_id = p_clan_id FOR UPDATE;

  IF v_pool IS NULL OR v_pool < v_cost THEN
    RETURN NULL;
  END IF;

  INSERT INTO clan_research (clan_id, node_id) VALUES (p_clan_id, v_target)
  ON CONFLICT DO NOTHING;

  UPDATE clan_research_progress
  SET dna_contributed = dna_contributed - v_cost, updated_at = NOW()
  WHERE clan_id = p_clan_id;

  DELETE FROM clan_research_target WHERE clan_id = p_clan_id;

  RETURN v_target;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 8. TITHE RPC (section 8.3): cap 500 DNA/member/week, deduct DNA, advance
--    the pool, auto-unlock the selected node when affordable
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION contribute_tithe(p_user_id UUID, p_amount INTEGER)
RETURNS JSONB AS $$
DECLARE
  v_player RECORD;
  v_clan_id UUID;
  v_week DATE := duel_week_start(NOW());
  v_already INTEGER;
  v_new_dna INTEGER;
  v_pool BIGINT;
  v_unlocked TEXT;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  SELECT id, dna INTO v_player FROM players WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLAYER_NOT_FOUND';
  END IF;

  SELECT clan_id INTO v_clan_id FROM clan_members WHERE player_id = p_user_id;
  IF v_clan_id IS NULL THEN
    RAISE EXCEPTION 'NOT_IN_CLAN';
  END IF;

  -- Hard cap 500/member/week ACROSS clans (clan-hopping cannot reset it)
  SELECT COALESCE(SUM(amount), 0) INTO v_already
  FROM clan_tithes WHERE player_id = p_user_id AND week_start = v_week;

  IF v_already + p_amount > 500 THEN
    RAISE EXCEPTION 'TITHE_CAP_EXCEEDED:%', 500 - v_already;
  END IF;

  IF v_player.dna < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_DNA';
  END IF;

  UPDATE players SET dna = dna - p_amount, updated_at = NOW()
  WHERE id = v_player.id
  RETURNING dna INTO v_new_dna;

  INSERT INTO economy_transactions
    (player_id, resource_type, amount, balance_after, source_type, source_id, metadata)
  VALUES
    (v_player.id, 'dna', -p_amount, v_new_dna, 'clan_tithe', v_clan_id,
     jsonb_build_object('clan_id', v_clan_id, 'week_start', v_week));

  INSERT INTO clan_tithes (clan_id, player_id, week_start, amount)
  VALUES (v_clan_id, p_user_id, v_week, p_amount)
  ON CONFLICT (clan_id, player_id, week_start)
  DO UPDATE SET amount = clan_tithes.amount + EXCLUDED.amount, updated_at = NOW();

  INSERT INTO clan_research_progress (clan_id, dna_contributed)
  VALUES (v_clan_id, p_amount)
  ON CONFLICT (clan_id)
  DO UPDATE SET dna_contributed = clan_research_progress.dna_contributed + EXCLUDED.dna_contributed,
                updated_at = NOW();

  v_unlocked := gauntlet_try_unlock(v_clan_id);

  SELECT dna_contributed INTO v_pool
  FROM clan_research_progress WHERE clan_id = v_clan_id;

  RETURN jsonb_build_object(
    'dna', v_new_dna,
    'tithed_this_week', v_already + p_amount,
    'remaining_cap', 500 - (v_already + p_amount),
    'pool', COALESCE(v_pool, 0),
    'unlocked_node', v_unlocked
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 9. RESEARCH TARGET RPC (officer-gated): officers SELECT the node being
--    researched; tithes then flow toward it
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_research_target(p_user_id UUID, p_node_id TEXT)
RETURNS JSONB AS $$
DECLARE
  v_member RECORD;
  v_prereq TEXT;
  v_unlocked TEXT;
BEGIN
  SELECT clan_id, role INTO v_member
  FROM clan_members WHERE player_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_IN_CLAN';
  END IF;
  IF v_member.role NOT IN ('owner', 'officer') THEN
    RAISE EXCEPTION 'NOT_AN_OFFICER';
  END IF;

  IF gauntlet_node_cost(p_node_id) IS NULL THEN
    RAISE EXCEPTION 'INVALID_NODE';
  END IF;
  IF clan_has_research(v_member.clan_id, p_node_id) THEN
    RAISE EXCEPTION 'ALREADY_UNLOCKED';
  END IF;

  v_prereq := gauntlet_node_prereq(p_node_id);
  IF v_prereq IS NOT NULL AND NOT clan_has_research(v_member.clan_id, v_prereq) THEN
    RAISE EXCEPTION 'PREREQ_LOCKED:%', v_prereq;
  END IF;

  INSERT INTO clan_research_target (clan_id, node_id, set_by)
  VALUES (v_member.clan_id, p_node_id, p_user_id)
  ON CONFLICT (clan_id)
  DO UPDATE SET node_id = EXCLUDED.node_id, set_by = EXCLUDED.set_by, set_at = NOW();

  -- The pool may already afford it
  v_unlocked := gauntlet_try_unlock(v_member.clan_id);

  RETURN jsonb_build_object(
    'target', CASE WHEN v_unlocked IS NULL THEN p_node_id ELSE NULL END,
    'unlocked_node', v_unlocked
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 10. SUBMIT PICKS RPC (section 8.2) - officer-gated, blind, final on submit
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION submit_gauntlet_picks(
  p_user_id UUID,
  p_dynasty TEXT,
  p_modifier TEXT DEFAULT NULL,
  p_ban TEXT DEFAULT NULL,
  p_dynasty_2 TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_member RECORD;
  v_week DATE := duel_week_start(NOW());
  v_duel RECORD;
  v_deadline TIMESTAMPTZ;
BEGIN
  SELECT clan_id, role INTO v_member
  FROM clan_members WHERE player_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_IN_CLAN';
  END IF;
  IF v_member.role NOT IN ('owner', 'officer') THEN
    RAISE EXCEPTION 'NOT_AN_OFFICER';
  END IF;

  SELECT * INTO v_duel FROM clan_duels
  WHERE week_start = v_week
    AND (clan_a = v_member.clan_id OR clan_b = v_member.clan_id)
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_DUEL_THIS_WEEK';
  END IF;
  IF v_duel.clan_b IS NULL THEN
    RAISE EXCEPTION 'BYE_WEEK';
  END IF;

  -- Blind lock deadline: Wed 00:00 UTC (week_start + 2 days)
  v_deadline := ((v_duel.week_start + 2)::timestamp AT TIME ZONE 'UTC');
  IF NOW() >= v_deadline THEN
    RAISE EXCEPTION 'PICKS_CLOSED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM gauntlet_picks
    WHERE duel_id = v_duel.id AND clan_id = v_member.clan_id
  ) THEN
    RAISE EXCEPTION 'ALREADY_LOCKED';
  END IF;

  -- Dynasty pick (mandatory; counted runs must be in it)
  IF p_dynasty IS NULL OR p_dynasty NOT IN ('PRIMAL', 'CYBER', 'COSMIC') THEN
    RAISE EXCEPTION 'INVALID_DYNASTY';
  END IF;

  -- Dynasty split pick needs protocols_4
  IF p_dynasty_2 IS NOT NULL THEN
    IF p_dynasty_2 NOT IN ('PRIMAL', 'CYBER', 'COSMIC') OR p_dynasty_2 = p_dynasty THEN
      RAISE EXCEPTION 'INVALID_DYNASTY_SPLIT';
    END IF;
    IF NOT clan_has_research(v_member.clan_id, 'protocols_4') THEN
      RAISE EXCEPTION 'SPLIT_PICK_LOCKED';
    END IF;
  END IF;

  -- Modifier: base three always available; research options gated
  IF p_modifier IS NOT NULL THEN
    IF p_modifier NOT IN ('vanguard', 'deep_bench', 'extraction_doctrine',
                          'anomaly_doctrine', 'sudden_death') THEN
      RAISE EXCEPTION 'INVALID_MODIFIER';
    END IF;
    IF p_modifier = 'anomaly_doctrine' THEN
      -- Requires protocols_1 AND the Weekly Anomaly board (not shipped)
      RAISE EXCEPTION 'ANOMALY_NOT_LIVE';
    END IF;
    IF p_modifier = 'sudden_death'
       AND NOT clan_has_research(v_member.clan_id, 'protocols_2') THEN
      RAISE EXCEPTION 'MODIFIER_LOCKED:protocols_2';
    END IF;
  END IF;

  -- Mutation ban: any catalog mutation (the base ten + mastery mutations)
  IF p_ban IS NOT NULL THEN
    IF p_ban NOT IN ('gold_trail', 'overgrowth', 'wall_rush', 'shed',
                     'mirror_wager', 'magnet_pulse', 'time_dilation',
                     'splitter', 'phoenix', 'compound_interest')
       AND NOT EXISTS (SELECT 1 FROM mastery_mutations WHERE mutation_id = p_ban) THEN
      RAISE EXCEPTION 'INVALID_BAN';
    END IF;
  END IF;

  INSERT INTO gauntlet_picks
    (duel_id, clan_id, dynasty_pick, dynasty_pick_2, modifier_pick, mutation_ban, submitted_by)
  VALUES
    (v_duel.id, v_member.clan_id, p_dynasty, p_dynasty_2, p_modifier, p_ban, p_user_id);

  RETURN jsonb_build_object(
    'locked', true,
    'dynasty', p_dynasty,
    'dynasty_2', p_dynasty_2,
    'modifier', p_modifier,
    'ban', p_ban,
    'reveal_at', v_deadline
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 11. ROSTER SUBSTITUTION RPC (logistics_2: 1 substitution/week, injury rule)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION substitute_gauntlet_roster(
  p_user_id UUID,
  p_out UUID,
  p_in UUID
) RETURNS JSONB AS $$
DECLARE
  v_member RECORD;
  v_week DATE := duel_week_start(NOW());
  v_duel RECORD;
  v_side TEXT;
  v_roster UUID[];
  v_meta_key TEXT;
BEGIN
  SELECT clan_id, role INTO v_member
  FROM clan_members WHERE player_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_IN_CLAN';
  END IF;
  IF v_member.role NOT IN ('owner', 'officer') THEN
    RAISE EXCEPTION 'NOT_AN_OFFICER';
  END IF;
  IF NOT clan_has_research(v_member.clan_id, 'logistics_2') THEN
    RAISE EXCEPTION 'SUBSTITUTION_LOCKED';
  END IF;

  SELECT * INTO v_duel FROM clan_duels
  WHERE week_start = v_week
    AND (clan_a = v_member.clan_id OR clan_b = v_member.clan_id)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_DUEL_THIS_WEEK';
  END IF;

  v_side := CASE WHEN v_duel.clan_a = v_member.clan_id THEN 'a' ELSE 'b' END;
  v_roster := CASE WHEN v_side = 'a' THEN v_duel.roster_a ELSE v_duel.roster_b END;
  v_meta_key := 'substituted_' || v_side;

  IF v_roster IS NULL THEN
    RAISE EXCEPTION 'NO_LOCKED_ROSTER';
  END IF;
  IF COALESCE((v_duel.gauntlet_meta->>v_meta_key)::boolean, false) THEN
    RAISE EXCEPTION 'ALREADY_SUBSTITUTED';
  END IF;
  IF NOT (p_out = ANY(v_roster)) THEN
    RAISE EXCEPTION 'OUT_NOT_ON_ROSTER';
  END IF;
  IF p_in = ANY(v_roster) THEN
    RAISE EXCEPTION 'IN_ALREADY_ON_ROSTER';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM clan_members
    WHERE clan_id = v_member.clan_id AND player_id = p_in
  ) THEN
    RAISE EXCEPTION 'IN_NOT_A_MEMBER';
  END IF;

  v_roster := array_replace(v_roster, p_out, p_in);

  IF v_side = 'a' THEN
    UPDATE clan_duels
    SET roster_a = v_roster,
        gauntlet_meta = gauntlet_meta || jsonb_build_object(v_meta_key, true)
    WHERE id = v_duel.id;
  ELSE
    UPDATE clan_duels
    SET roster_b = v_roster,
        gauntlet_meta = gauntlet_meta || jsonb_build_object(v_meta_key, true)
    WHERE id = v_duel.id;
  END IF;

  RETURN jsonb_build_object('substituted', true, 'out', p_out, 'in', p_in);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 12. RULES RESOLUTION (section 8.2)
-- Per-side effective rules, baked at reveal so scoring just reads numbers:
--   { dynasty, dynasty2, modifier, top_members, best_runs, weight,
--     extracted_only, banned }         (banned = set BY THE OPPONENT vs us)
-- best_runs bakes logistics_4 (+1 counted run, 30 -> 31 - the only numeric
-- node; only the base-30 lens gains it, per the doc's "30 -> 31").
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION gauntlet_build_side(
  p_clan_id UUID,
  p_dynasty TEXT,
  p_dynasty_2 TEXT,
  p_modifier TEXT,
  p_banned_against TEXT
) RETURNS JSONB AS $$
DECLARE
  v_top INTEGER := 10;
  v_best INTEGER := 30;
  v_weight NUMERIC := 1.0;
  v_extracted BOOLEAN := false;
  v_plus_one BOOLEAN := clan_has_research(p_clan_id, 'logistics_4');
BEGIN
  IF p_modifier = 'vanguard' THEN
    v_top := 8; v_weight := 1.10;
  ELSIF p_modifier = 'deep_bench' THEN
    v_top := 12; v_best := 25;
  ELSIF p_modifier = 'extraction_doctrine' THEN
    v_extracted := true; v_weight := 1.15;
  ELSIF p_modifier = 'sudden_death' THEN
    v_best := 10; v_weight := 1.40;
  END IF;

  -- +1 counted run applies to the 30-run base only (doc: "30 -> 31")
  IF v_plus_one AND v_best = 30 THEN
    v_best := 31;
  END IF;

  RETURN jsonb_build_object(
    'dynasty', p_dynasty,
    'dynasty2', p_dynasty_2,
    'modifier', p_modifier,
    'top_members', v_top,
    'best_runs', v_best,
    'weight', v_weight,
    'extracted_only', v_extracted,
    'banned', p_banned_against
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Resolve a duel's rules after the Wed 00:00 deadline. No-op when: already
-- resolved, bye, before the deadline, or NO PICKS AT ALL (that week then
-- settles exactly as duels v1 - the pre-020 legacy path). A side without
-- picks gets neutral rules (all dynasties, top 10 / best 30(+1), x1.0).
CREATE OR REPLACE FUNCTION resolve_gauntlet(p_duel_id UUID)
RETURNS VOID AS $$
DECLARE
  v_duel RECORD;
  v_pick_a RECORD;
  v_pick_b RECORD;
  v_has_a BOOLEAN := false;
  v_has_b BOOLEAN := false;
  v_side_a JSONB;
  v_side_b JSONB;
BEGIN
  SELECT * INTO v_duel FROM clan_duels WHERE id = p_duel_id FOR UPDATE;
  IF NOT FOUND OR v_duel.effective_rules IS NOT NULL OR v_duel.clan_b IS NULL THEN
    RETURN;
  END IF;
  IF NOW() < ((v_duel.week_start + 2)::timestamp AT TIME ZONE 'UTC') THEN
    RETURN;                                 -- picks still blind
  END IF;

  SELECT * INTO v_pick_a FROM gauntlet_picks
  WHERE duel_id = p_duel_id AND clan_id = v_duel.clan_a;
  v_has_a := FOUND;

  SELECT * INTO v_pick_b FROM gauntlet_picks
  WHERE duel_id = p_duel_id AND clan_id = v_duel.clan_b;
  v_has_b := FOUND;

  IF NOT v_has_a AND NOT v_has_b THEN
    RETURN;                                 -- nobody engaged: duels v1 week
  END IF;

  v_side_a := gauntlet_build_side(
    v_duel.clan_a,
    CASE WHEN v_has_a THEN v_pick_a.dynasty_pick END,
    CASE WHEN v_has_a THEN v_pick_a.dynasty_pick_2 END,
    CASE WHEN v_has_a THEN v_pick_a.modifier_pick END,
    CASE WHEN v_has_b THEN v_pick_b.mutation_ban END
  );
  v_side_b := gauntlet_build_side(
    v_duel.clan_b,
    CASE WHEN v_has_b THEN v_pick_b.dynasty_pick END,
    CASE WHEN v_has_b THEN v_pick_b.dynasty_pick_2 END,
    CASE WHEN v_has_b THEN v_pick_b.modifier_pick END,
    CASE WHEN v_has_a THEN v_pick_a.mutation_ban END
  );

  UPDATE clan_duels
  SET effective_rules = jsonb_build_object('a', v_side_a, 'b', v_side_b),
      rules_resolved_at = NOW()
  WHERE id = p_duel_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 13. RULES-AWARE SCORING (sections 8.1 + 8.2)
-- p_side NULL => duels v1 legacy: full week, all dynasties, top 10/best 30,
-- current members. With rules: Thu 00:00 - Sun 24:00 window ONLY
-- (week_start+3 .. week_start+7), the side's own picked dynasty (or split
-- pair), locked roster, modifier lens, weight applied to the summed
-- counted DNA (floor). Weights change SCORING only - never DNA payouts.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION gauntlet_side_score(
  p_week_start DATE,
  p_clan_id UUID,
  p_side JSONB,
  p_roster UUID[]
) RETURNS BIGINT AS $$
DECLARE
  v_from TIMESTAMPTZ;
  v_to TIMESTAMPTZ := ((p_week_start + 7)::timestamp AT TIME ZONE 'UTC');
  v_dyn TEXT;
  v_dyn2 TEXT;
  v_top INTEGER := 10;
  v_best INTEGER := 30;
  v_weight NUMERIC := 1.0;
  v_extracted BOOLEAN := false;
  v_score BIGINT;
BEGIN
  IF p_side IS NULL THEN
    v_from := (p_week_start::timestamp AT TIME ZONE 'UTC');
  ELSE
    -- Scored window: Thu 00:00 - Sun 24:00 (counted runs only inside it)
    v_from := ((p_week_start + 3)::timestamp AT TIME ZONE 'UTC');
    v_dyn := p_side->>'dynasty';
    v_dyn2 := p_side->>'dynasty2';
    v_top := COALESCE((p_side->>'top_members')::integer, 10);
    v_best := COALESCE((p_side->>'best_runs')::integer, 30);
    v_weight := COALESCE((p_side->>'weight')::numeric, 1.0);
    v_extracted := COALESCE((p_side->>'extracted_only')::boolean, false);
  END IF;

  WITH member_runs AS (
    SELECT
      cm.player_id AS member_user_id,
      gs.dna_earned,
      ROW_NUMBER() OVER (
        PARTITION BY cm.player_id
        ORDER BY gs.dna_earned DESC, gs.ended_at ASC
      ) AS run_rank
    FROM clan_members cm
    JOIN players p ON p.user_id = cm.player_id
    JOIN game_sessions gs ON gs.player_id = p.id
    WHERE cm.clan_id = p_clan_id
      AND (p_roster IS NULL OR cm.player_id = ANY(p_roster))
      AND gs.ended_at IS NOT NULL
      AND gs.dna_earned > 0
      AND gs.ended_at >= v_from
      AND gs.ended_at < v_to
      AND (v_dyn IS NULL OR UPPER(gs.dynasty) = v_dyn OR UPPER(gs.dynasty) = v_dyn2)
      AND (NOT v_extracted OR gs.extracted IS TRUE)
  ),
  member_totals AS (
    SELECT member_user_id, SUM(dna_earned) AS member_dna
    FROM member_runs
    WHERE run_rank <= v_best
    GROUP BY member_user_id
  ),
  ranked_members AS (
    SELECT member_dna,
           ROW_NUMBER() OVER (ORDER BY member_dna DESC) AS member_rank
    FROM member_totals
  )
  SELECT COALESCE(FLOOR(SUM(member_dna) * v_weight), 0)::BIGINT
  INTO v_score
  FROM ranked_members
  WHERE member_rank <= v_top;

  RETURN COALESCE(v_score, 0);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Rules-aware top contributors (duel UI); p_side NULL = legacy behavior
CREATE OR REPLACE FUNCTION gauntlet_top_contributors(
  p_week_start DATE,
  p_clan_id UUID,
  p_side JSONB,
  p_roster UUID[]
) RETURNS TABLE (player_name TEXT, counted_dna BIGINT) AS $$
DECLARE
  v_from TIMESTAMPTZ;
  v_to TIMESTAMPTZ := ((p_week_start + 7)::timestamp AT TIME ZONE 'UTC');
  v_dyn TEXT;
  v_dyn2 TEXT;
  v_top INTEGER := 10;
  v_best INTEGER := 30;
  v_extracted BOOLEAN := false;
BEGIN
  IF p_side IS NULL THEN
    v_from := (p_week_start::timestamp AT TIME ZONE 'UTC');
  ELSE
    v_from := ((p_week_start + 3)::timestamp AT TIME ZONE 'UTC');
    v_dyn := p_side->>'dynasty';
    v_dyn2 := p_side->>'dynasty2';
    v_top := COALESCE((p_side->>'top_members')::integer, 10);
    v_best := COALESCE((p_side->>'best_runs')::integer, 30);
    v_extracted := COALESCE((p_side->>'extracted_only')::boolean, false);
  END IF;

  RETURN QUERY
  WITH member_runs AS (
    SELECT
      cm.player_id AS member_user_id,
      gs.dna_earned,
      ROW_NUMBER() OVER (
        PARTITION BY cm.player_id
        ORDER BY gs.dna_earned DESC, gs.ended_at ASC
      ) AS run_rank
    FROM clan_members cm
    JOIN players p ON p.user_id = cm.player_id
    JOIN game_sessions gs ON gs.player_id = p.id
    WHERE cm.clan_id = p_clan_id
      AND (p_roster IS NULL OR cm.player_id = ANY(p_roster))
      AND gs.ended_at IS NOT NULL
      AND gs.dna_earned > 0
      AND gs.ended_at >= v_from
      AND gs.ended_at < v_to
      AND (v_dyn IS NULL OR UPPER(gs.dynasty) = v_dyn OR UPPER(gs.dynasty) = v_dyn2)
      AND (NOT v_extracted OR gs.extracted IS TRUE)
  ),
  member_totals AS (
    SELECT member_user_id, SUM(dna_earned) AS member_dna
    FROM member_runs
    WHERE run_rank <= v_best
    GROUP BY member_user_id
  )
  SELECT
    COALESCE(pl.username, 'Anonymous') AS player_name,
    mt.member_dna::BIGINT AS counted_dna
  FROM member_totals mt
  LEFT JOIN players pl ON pl.user_id = mt.member_user_id
  ORDER BY mt.member_dna DESC
  LIMIT v_top;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 14. SETTLEMENT + PAIRING (replaces the 011 body; same signature)
-- - Settlement: resolves gauntlet rules first (no-op for no-pick weeks),
--   then scores each side with its effective rules (legacy path when
--   unresolved). ELO/record/tie handling unchanged from v1.
-- - Pairing: rating-adjacent as v1, with REVENGE PRIORITY (section 8.4):
--   among the next 2 rating-adjacent candidates, prefer a rematch vs a
--   clan we are tied with or trailing against within the season window
--   (last 8 weeks - proxy until seasons infra). Rosters lock at pairing.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settle_and_pair_duels()
RETURNS VOID AS $$
DECLARE
  v_week DATE := duel_week_start(NOW());
  v_duel RECORD;
  v_score_a BIGINT;
  v_score_b BIGINT;
  v_rating_a INTEGER;
  v_rating_b INTEGER;
  v_winner UUID;
  v_loser UUID;
  v_expected_winner NUMERIC;
  v_delta INTEGER;
  v_rules JSONB;
  -- pairing
  v_clans UUID[];
  v_used UUID[] := '{}';
  v_len INTEGER;
  v_a UUID;
  v_b UUID;
  v_first UUID;
  v_cand UUID;
  v_seen INTEGER;
  v_revenge BOOLEAN;
  i INTEGER;
  j INTEGER;
BEGIN
  -- Serialize settlement/pairing across concurrent API reads
  PERFORM pg_advisory_xact_lock(hashtext('clan_duels_settle'));

  -- ---- Settle finished weeks -------------------------------------------
  FOR v_duel IN
    SELECT d.*
    FROM clan_duels d
    WHERE d.status = 'active'
      AND d.week_start < v_week
    ORDER BY d.week_start ASC
  LOOP
    -- Stamp effective rules if picks exist and it never resolved on-read.
    -- Pre-020 weeks have no picks: they settle on the legacy path below.
    PERFORM resolve_gauntlet(v_duel.id);
    SELECT effective_rules INTO v_rules FROM clan_duels WHERE id = v_duel.id;

    IF v_rules IS NOT NULL THEN
      v_score_a := gauntlet_side_score(v_duel.week_start, v_duel.clan_a, v_rules->'a', v_duel.roster_a);
      v_score_b := gauntlet_side_score(v_duel.week_start, v_duel.clan_b, v_rules->'b', v_duel.roster_b);
    ELSE
      SELECT COALESCE(MAX(s.score) FILTER (WHERE s.clan_id = v_duel.clan_a), 0),
             COALESCE(MAX(s.score) FILTER (WHERE s.clan_id = v_duel.clan_b), 0)
      INTO v_score_a, v_score_b
      FROM clan_week_scores(v_duel.week_start) s
      WHERE s.clan_id IN (v_duel.clan_a, v_duel.clan_b);
    END IF;

    IF v_score_a = v_score_b THEN
      -- Tie: split - no rating change, no bonus
      v_winner := NULL;
      v_delta := 0;
    ELSE
      IF v_score_a > v_score_b THEN
        v_winner := v_duel.clan_a;
        v_loser := v_duel.clan_b;
      ELSE
        v_winner := v_duel.clan_b;
        v_loser := v_duel.clan_a;
      END IF;

      SELECT rating INTO v_rating_a FROM clans WHERE id = v_winner;
      SELECT rating INTO v_rating_b FROM clans WHERE id = v_loser;

      -- ELO: expected = 1 / (1 + 10^((Rloser - Rwinner) / 400)), K = 32
      v_expected_winner := 1.0 / (1.0 + power(10.0, (v_rating_b - v_rating_a) / 400.0));
      v_delta := ROUND(32 * (1 - v_expected_winner))::INTEGER;

      UPDATE clans
      SET rating = rating + v_delta,
          duel_wins = duel_wins + 1,
          updated_at = NOW()
      WHERE id = v_winner;

      UPDATE clans
      SET rating = rating - v_delta,
          duel_losses = duel_losses + 1,
          updated_at = NOW()
      WHERE id = v_loser;
    END IF;

    UPDATE clan_duels
    SET score_a = v_score_a,
        score_b = v_score_b,
        winner = v_winner,
        rating_delta = v_delta,
        status = 'settled',
        settled_at = NOW()
    WHERE id = v_duel.id;
  END LOOP;

  -- ---- Pair the current week (only once) --------------------------------
  IF NOT EXISTS (SELECT 1 FROM clan_duels WHERE week_start = v_week) THEN
    SELECT ARRAY_AGG(id ORDER BY rating DESC, created_at ASC, id ASC)
    INTO v_clans
    FROM clans
    WHERE member_count >= 1;

    v_len := COALESCE(array_length(v_clans, 1), 0);

    i := 1;
    WHILE i <= v_len LOOP
      IF v_clans[i] = ANY(v_used) THEN
        i := i + 1;
        CONTINUE;
      END IF;

      v_a := v_clans[i];
      v_b := NULL;
      v_first := NULL;
      v_seen := 0;

      -- Revenge priority among the next 2 rating-adjacent candidates:
      -- prefer a rematch vs a clan we are tied with or trailing against
      -- in the last 8 weeks (season proxy).
      j := i + 1;
      WHILE j <= v_len AND v_seen < 2 LOOP
        IF NOT (v_clans[j] = ANY(v_used)) THEN
          v_cand := v_clans[j];
          v_seen := v_seen + 1;
          IF v_first IS NULL THEN
            v_first := v_cand;
          END IF;

          SELECT COUNT(*) >= 1
                 AND (COUNT(*) FILTER (WHERE winner = v_a))
                     <= (COUNT(*) FILTER (WHERE winner = v_cand))
          INTO v_revenge
          FROM clan_duels
          WHERE status = 'settled'
            AND week_start >= v_week - 56
            AND ((clan_a = v_a AND clan_b = v_cand)
                 OR (clan_a = v_cand AND clan_b = v_a));

          IF v_revenge THEN
            v_b := v_cand;
            EXIT;
          END IF;
        END IF;
        j := j + 1;
      END LOOP;

      v_b := COALESCE(v_b, v_first);
      v_used := v_used || v_a;
      IF v_b IS NOT NULL THEN
        v_used := v_used || v_b;
      END IF;

      -- Roster lock (anti-mercenary): counted rosters snapshot at pairing
      INSERT INTO clan_duels (week_start, clan_a, clan_b, status, roster_a, roster_b)
      VALUES (
        v_week,
        v_a,
        v_b,
        CASE WHEN v_b IS NULL THEN 'bye' ELSE 'active' END,
        ARRAY(SELECT player_id FROM clan_members WHERE clan_id = v_a),
        CASE WHEN v_b IS NULL THEN NULL
             ELSE ARRAY(SELECT player_id FROM clan_members WHERE clan_id = v_b) END
      );

      i := i + 1;
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 15. DUEL READ MODEL (replaces the 011 body; same signature)
-- Adds lazy rules resolution + rules-aware live scores + a 'gauntlet'
-- block (phase, my/their picks with blind gating, rivalry, revenge).
-- Response stays a superset of the v1 shape - the pre-020 API mapper
-- simply ignores the new field until it learns it.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_clan_duel(p_clan_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_week DATE;
  v_prev_week DATE;
  v_clan RECORD;
  v_duel RECORD;
  v_opponent_id UUID;
  v_opponent RECORD;
  v_my_score BIGINT := 0;
  v_their_score BIGINT := 0;
  v_contributors JSONB := '[]'::jsonb;
  v_duel_json JSONB := NULL;
  v_last RECORD;
  v_last_json JSONB := NULL;
  v_my_delta INTEGER;
  v_my_side TEXT;
  v_my_rules JSONB;
  v_their_rules JSONB;
  v_my_roster UUID[];
  v_their_roster UUID[];
  v_phase TEXT;
  v_revealed BOOLEAN;
  v_my_picks JSONB;
  v_their_picks JSONB;
  v_rivalry JSONB := NULL;
  v_revenge BOOLEAN := false;
  v_gauntlet JSONB := NULL;
BEGIN
  PERFORM settle_and_pair_duels();

  v_week := duel_week_start(NOW());
  v_prev_week := v_week - 7;

  SELECT id, name, tag, rating, duel_wins, duel_losses
  INTO v_clan
  FROM clans
  WHERE id = p_clan_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Clan not found');
  END IF;

  -- Current-week duel (clan may be unpaired if created after pairing ran)
  SELECT * INTO v_duel
  FROM clan_duels
  WHERE week_start = v_week
    AND (clan_a = p_clan_id OR clan_b = p_clan_id)
  LIMIT 1;

  IF FOUND THEN
    -- Lazy rules resolution (no-op before Wed / without picks / on byes)
    PERFORM resolve_gauntlet(v_duel.id);
    SELECT * INTO v_duel FROM clan_duels WHERE id = v_duel.id;

    v_my_side := CASE WHEN v_duel.clan_a = p_clan_id THEN 'a' ELSE 'b' END;
    v_opponent_id := CASE
      WHEN v_duel.clan_a = p_clan_id THEN v_duel.clan_b
      ELSE v_duel.clan_a
    END;
    v_my_rules := v_duel.effective_rules -> v_my_side;
    v_their_rules := v_duel.effective_rules -> (CASE WHEN v_my_side = 'a' THEN 'b' ELSE 'a' END);
    v_my_roster := CASE WHEN v_my_side = 'a' THEN v_duel.roster_a ELSE v_duel.roster_b END;
    v_their_roster := CASE WHEN v_my_side = 'a' THEN v_duel.roster_b ELSE v_duel.roster_a END;

    -- Live scores computed on read - rules-aware once resolved
    IF v_duel.effective_rules IS NOT NULL THEN
      v_my_score := gauntlet_side_score(v_duel.week_start, p_clan_id, v_my_rules, v_my_roster);
      IF v_opponent_id IS NOT NULL THEN
        v_their_score := gauntlet_side_score(v_duel.week_start, v_opponent_id, v_their_rules, v_their_roster);
      END IF;

      SELECT COALESCE(
        jsonb_agg(jsonb_build_object('name', c.player_name, 'dna', c.counted_dna)),
        '[]'::jsonb
      )
      INTO v_contributors
      FROM gauntlet_top_contributors(v_duel.week_start, p_clan_id, v_my_rules, v_my_roster) c;
    ELSE
      SELECT COALESCE(MAX(s.score) FILTER (WHERE s.clan_id = p_clan_id), 0),
             COALESCE(MAX(s.score) FILTER (WHERE s.clan_id = v_opponent_id), 0)
      INTO v_my_score, v_their_score
      FROM clan_week_scores(v_week) s
      WHERE s.clan_id IN (p_clan_id, v_opponent_id);

      SELECT COALESCE(
        jsonb_agg(jsonb_build_object('name', c.player_name, 'dna', c.counted_dna)),
        '[]'::jsonb
      )
      INTO v_contributors
      FROM clan_top_contributors(p_clan_id, v_week) c;
    END IF;

    IF v_opponent_id IS NOT NULL THEN
      SELECT name, tag, rating INTO v_opponent FROM clans WHERE id = v_opponent_id;

      -- Gauntlet block: phase + picks (blind-gated) + rivalry + revenge
      v_phase := CASE
        WHEN NOW() < ((v_week + 2)::timestamp AT TIME ZONE 'UTC') THEN 'picks_open'
        WHEN NOW() < ((v_week + 3)::timestamp AT TIME ZONE 'UTC') THEN 'locked'
        ELSE 'scoring'
      END;

      v_revealed := NOW() >= ((v_week + 2)::timestamp AT TIME ZONE 'UTC')
        OR (SELECT COUNT(*) FROM gauntlet_picks WHERE duel_id = v_duel.id) = 2;

      SELECT jsonb_build_object(
        'dynasty', gp.dynasty_pick,
        'dynasty_2', gp.dynasty_pick_2,
        'modifier', gp.modifier_pick,
        'ban', gp.mutation_ban,
        'locked_at', gp.locked_at
      ) INTO v_my_picks
      FROM gauntlet_picks gp
      WHERE gp.duel_id = v_duel.id AND gp.clan_id = p_clan_id;

      IF v_revealed THEN
        SELECT jsonb_build_object(
          'dynasty', gp.dynasty_pick,
          'dynasty_2', gp.dynasty_pick_2,
          'modifier', gp.modifier_pick,
          'ban', gp.mutation_ban,
          'locked_at', gp.locked_at
        ) INTO v_their_picks
        FROM gauntlet_picks gp
        WHERE gp.duel_id = v_duel.id AND gp.clan_id = v_opponent_id;
      END IF;

      -- Rivalry record vs this opponent (persistent head-to-head)
      SELECT jsonb_build_object(
        'wins', CASE WHEN r.clan_x = p_clan_id THEN r.wins_x ELSE r.wins_y END,
        'losses', CASE WHEN r.clan_x = p_clan_id THEN r.wins_y ELSE r.wins_x END,
        'ties', r.ties,
        'meetings', r.meetings,
        'last_winner_me', r.last_winner = p_clan_id
      ) INTO v_rivalry
      FROM clan_rivalries r
      WHERE r.clan_x = LEAST(p_clan_id, v_opponent_id)
        AND r.clan_y = GREATEST(p_clan_id, v_opponent_id);

      -- Revenge pairing: we met in the season window and we're not leading
      SELECT COUNT(*) >= 1
             AND (COUNT(*) FILTER (WHERE winner = p_clan_id))
                 <= (COUNT(*) FILTER (WHERE winner = v_opponent_id))
      INTO v_revenge
      FROM clan_duels
      WHERE status = 'settled'
        AND week_start >= v_week - 56
        AND ((clan_a = p_clan_id AND clan_b = v_opponent_id)
             OR (clan_a = v_opponent_id AND clan_b = p_clan_id));

      v_gauntlet := jsonb_build_object(
        'phase', v_phase,
        'picks_deadline', ((v_week + 2)::timestamp AT TIME ZONE 'UTC'),
        'window_from', ((v_week + 3)::timestamp AT TIME ZONE 'UTC'),
        'window_to', ((v_week + 7)::timestamp AT TIME ZONE 'UTC'),
        'revealed', v_revealed,
        'my_picks', v_my_picks,
        'their_picks', v_their_picks,
        'my_rules', v_my_rules,
        'their_rules', v_their_rules,
        'rivalry', v_rivalry,
        'revenge', COALESCE(v_revenge, false)
      );
    END IF;

    v_duel_json := jsonb_build_object(
      'week_start', v_week,
      'ends_at', ((v_week + 7)::timestamp AT TIME ZONE 'UTC'),
      'status', v_duel.status,
      'is_bye', v_duel.clan_b IS NULL,
      'my_score', v_my_score,
      'their_score', v_their_score,
      'opponent', CASE
        WHEN v_opponent_id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'id', v_opponent_id,
          'name', v_opponent.name,
          'tag', v_opponent.tag,
          'rating', v_opponent.rating
        )
      END,
      'top_contributors', v_contributors,
      'gauntlet', v_gauntlet
    );
  END IF;

  -- Last week's settled result (for the banner + bonus indicator)
  SELECT d.*,
         CASE WHEN d.clan_a = p_clan_id THEN d.clan_b ELSE d.clan_a END AS opp_id
  INTO v_last
  FROM clan_duels d
  WHERE d.week_start = v_prev_week
    AND (d.clan_a = p_clan_id OR d.clan_b = p_clan_id)
    AND d.status = 'settled'
  LIMIT 1;

  IF FOUND THEN
    v_my_delta := CASE
      WHEN v_last.winner = p_clan_id THEN COALESCE(v_last.rating_delta, 0)
      WHEN v_last.winner IS NULL THEN 0
      ELSE -COALESCE(v_last.rating_delta, 0)
    END;

    v_last_json := jsonb_build_object(
      'result', CASE
        WHEN v_last.winner = p_clan_id THEN 'won'
        WHEN v_last.winner IS NULL THEN 'tie'
        ELSE 'lost'
      END,
      'rating_delta', v_my_delta,
      'opponent_name', (SELECT name FROM clans WHERE id = v_last.opp_id),
      'my_score', CASE WHEN v_last.clan_a = p_clan_id THEN v_last.score_a ELSE v_last.score_b END,
      'their_score', CASE WHEN v_last.clan_a = p_clan_id THEN v_last.score_b ELSE v_last.score_a END,
      'bonus_active', v_last.winner = p_clan_id
    );
  END IF;

  RETURN jsonb_build_object(
    'rating', v_clan.rating,
    'record', jsonb_build_object('wins', v_clan.duel_wins, 'losses', v_clan.duel_losses),
    'duel', v_duel_json,
    'last_week', v_last_json
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 16. SESSION-START POOL BAN (section 8.2 item 3)
-- The mutation banned AGAINST the player's clan, IF this run would be a
-- counted run: rules resolved, p_at inside the Thu-Sun scored window, and
-- the run's dynasty matches the clan's picked dynasty (or split pair; a
-- no-pick neutral side counts all dynasties). Returns NULL otherwise.
-- Free Play never calls this (practice pools are never banned).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION player_gauntlet_ban(
  p_player_id UUID,
  p_dynasty TEXT,
  p_at TIMESTAMPTZ DEFAULT NOW()
) RETURNS TEXT AS $$
DECLARE
  v_user_id UUID;
  v_clan_id UUID;
  v_week DATE := duel_week_start(p_at);
  v_duel RECORD;
  v_side JSONB;
  v_dyn TEXT;
  v_banned TEXT;
BEGIN
  -- Accept players.id, fall back to auth.users.id (as clan_duel_bonus does)
  SELECT user_id INTO v_user_id FROM players WHERE id = p_player_id;
  IF v_user_id IS NULL THEN
    v_user_id := p_player_id;
  END IF;

  SELECT clan_id INTO v_clan_id FROM clan_members WHERE player_id = v_user_id;
  IF v_clan_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_duel FROM clan_duels
  WHERE week_start = v_week
    AND (clan_a = v_clan_id OR clan_b = v_clan_id)
  LIMIT 1;
  IF NOT FOUND OR v_duel.clan_b IS NULL THEN
    RETURN NULL;
  END IF;

  -- Lazily resolve if the deadline passed and picks exist (cheap no-op guard)
  IF v_duel.effective_rules IS NULL THEN
    PERFORM resolve_gauntlet(v_duel.id);
    SELECT * INTO v_duel FROM clan_duels WHERE id = v_duel.id;
  END IF;
  IF v_duel.effective_rules IS NULL THEN
    RETURN NULL;
  END IF;

  -- Counted-run window: Thu 00:00 - Sun 24:00
  IF p_at < ((v_duel.week_start + 3)::timestamp AT TIME ZONE 'UTC')
     OR p_at >= ((v_duel.week_start + 7)::timestamp AT TIME ZONE 'UTC') THEN
    RETURN NULL;
  END IF;

  v_side := v_duel.effective_rules ->
    (CASE WHEN v_duel.clan_a = v_clan_id THEN 'a' ELSE 'b' END);
  v_banned := v_side->>'banned';
  IF v_banned IS NULL THEN
    RETURN NULL;
  END IF;

  -- Dynasty gate: only counted-dynasty runs carry the ban
  v_dyn := v_side->>'dynasty';
  IF v_dyn IS NOT NULL
     AND UPPER(COALESCE(p_dynasty, '')) <> v_dyn
     AND UPPER(COALESCE(p_dynasty, '')) <> COALESCE(v_side->>'dynasty2', '') THEN
    RETURN NULL;
  END IF;

  RETURN v_banned;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 17. GAUNTLET READ MODEL - research + scouting + picks for the clan page.
-- Blind picks stay blind (opponent picks only after reveal). Scouting
-- (section 8.1, opens at Mon pairing): opponent roster, dynasty mastery
-- levels, last 3 weeks' picks. logistics_1 adds mastery XP detail;
-- logistics_3 adds a Sun 12:00 next-opponent preview (rating-adjacent
-- projection).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_gauntlet(p_clan_id UUID, p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_week DATE;
  v_duel RECORD;
  v_opponent_id UUID;
  v_revealed BOOLEAN := false;
  v_my_picks JSONB;
  v_their_picks JSONB;
  v_phase TEXT;
  v_research JSONB;
  v_scouting JSONB := NULL;
  v_gauntlet JSONB := NULL;
  v_has_detail BOOLEAN;
  v_has_early BOOLEAN;
  v_preview JSONB := NULL;
  v_my_role TEXT;
BEGIN
  PERFORM settle_and_pair_duels();
  v_week := duel_week_start(NOW());

  SELECT role INTO v_my_role
  FROM clan_members WHERE player_id = p_user_id AND clan_id = p_clan_id;

  v_has_detail := clan_has_research(p_clan_id, 'logistics_1');
  v_has_early := clan_has_research(p_clan_id, 'logistics_3');

  -- ---- Research block ---------------------------------------------------
  SELECT jsonb_build_object(
    'pool', COALESCE((SELECT dna_contributed FROM clan_research_progress WHERE clan_id = p_clan_id), 0),
    'target', (SELECT node_id FROM clan_research_target WHERE clan_id = p_clan_id),
    'unlocked', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('node_id', node_id, 'unlocked_at', unlocked_at) ORDER BY unlocked_at)
       FROM clan_research WHERE clan_id = p_clan_id),
      '[]'::jsonb
    ),
    'tithe_cap', 500,
    'my_tithe_this_week', COALESCE(
      (SELECT SUM(amount) FROM clan_tithes WHERE player_id = p_user_id AND week_start = v_week), 0
    ),
    'recent_tithes', COALESCE(
      (SELECT jsonb_agg(t ORDER BY t->>'week_start' DESC)
       FROM (
         SELECT jsonb_build_object(
           'name', COALESCE(pl.username, 'Anonymous'),
           'amount', ct.amount,
           'week_start', ct.week_start
         ) AS t
         FROM clan_tithes ct
         LEFT JOIN players pl ON pl.user_id = ct.player_id
         WHERE ct.clan_id = p_clan_id
         ORDER BY ct.week_start DESC, ct.updated_at DESC
         LIMIT 10
       ) recent),
      '[]'::jsonb
    )
  ) INTO v_research;

  -- ---- Current duel + scouting ------------------------------------------
  SELECT * INTO v_duel
  FROM clan_duels
  WHERE week_start = v_week
    AND (clan_a = p_clan_id OR clan_b = p_clan_id)
  LIMIT 1;

  IF FOUND AND v_duel.clan_b IS NOT NULL THEN
    PERFORM resolve_gauntlet(v_duel.id);
    SELECT * INTO v_duel FROM clan_duels WHERE id = v_duel.id;

    v_opponent_id := CASE WHEN v_duel.clan_a = p_clan_id THEN v_duel.clan_b ELSE v_duel.clan_a END;

    v_phase := CASE
      WHEN NOW() < ((v_week + 2)::timestamp AT TIME ZONE 'UTC') THEN 'picks_open'
      WHEN NOW() < ((v_week + 3)::timestamp AT TIME ZONE 'UTC') THEN 'locked'
      ELSE 'scoring'
    END;

    v_revealed := NOW() >= ((v_week + 2)::timestamp AT TIME ZONE 'UTC')
      OR (SELECT COUNT(*) FROM gauntlet_picks WHERE duel_id = v_duel.id) = 2;

    SELECT jsonb_build_object(
      'dynasty', gp.dynasty_pick,
      'dynasty_2', gp.dynasty_pick_2,
      'modifier', gp.modifier_pick,
      'ban', gp.mutation_ban,
      'locked_at', gp.locked_at
    ) INTO v_my_picks
    FROM gauntlet_picks gp
    WHERE gp.duel_id = v_duel.id AND gp.clan_id = p_clan_id;

    IF v_revealed THEN
      SELECT jsonb_build_object(
        'dynasty', gp.dynasty_pick,
        'dynasty_2', gp.dynasty_pick_2,
        'modifier', gp.modifier_pick,
        'ban', gp.mutation_ban,
        'locked_at', gp.locked_at
      ) INTO v_their_picks
      FROM gauntlet_picks gp
      WHERE gp.duel_id = v_duel.id AND gp.clan_id = v_opponent_id;
    END IF;

    -- Scouting (open all week from Mon pairing): opponent's locked roster
    -- with per-dynasty mastery levels + their last 3 weeks' picks
    SELECT jsonb_build_object(
      'roster', COALESCE(
        (SELECT jsonb_agg(m ORDER BY (m->>'name'))
         FROM (
           SELECT jsonb_build_object(
             'name', COALESCE(pl.username, 'Anonymous'),
             'mastery', COALESCE(
               (SELECT jsonb_object_agg(pm.dynasty,
                  CASE WHEN v_has_detail
                       THEN jsonb_build_object('level', level_for_xp(pm.xp), 'xp', pm.xp)
                       ELSE jsonb_build_object('level', level_for_xp(pm.xp))
                  END)
                FROM player_mastery pm WHERE pm.player_id = pl.id),
               '{}'::jsonb
             )
           ) AS m
           FROM unnest(
             CASE WHEN v_duel.clan_a = p_clan_id THEN v_duel.roster_b ELSE v_duel.roster_a END
           ) AS roster_user(user_id)
           JOIN players pl ON pl.user_id = roster_user.user_id
         ) members),
        '[]'::jsonb
      ),
      'last_picks', COALESCE(
        (SELECT jsonb_agg(p ORDER BY (p->>'week_start') DESC)
         FROM (
           SELECT jsonb_build_object(
             'week_start', d.week_start,
             'dynasty', gp.dynasty_pick,
             'dynasty_2', gp.dynasty_pick_2,
             'modifier', gp.modifier_pick,
             'ban', gp.mutation_ban
           ) AS p
           FROM gauntlet_picks gp
           JOIN clan_duels d ON d.id = gp.duel_id
           WHERE gp.clan_id = v_opponent_id
             AND d.week_start < v_week
           ORDER BY d.week_start DESC
           LIMIT 3
         ) hist),
        '[]'::jsonb
      ),
      'detail', v_has_detail
    ) INTO v_scouting;

    v_gauntlet := jsonb_build_object(
      'duel_id', v_duel.id,
      'week_start', v_duel.week_start,
      'phase', v_phase,
      'picks_deadline', ((v_week + 2)::timestamp AT TIME ZONE 'UTC'),
      'window_from', ((v_week + 3)::timestamp AT TIME ZONE 'UTC'),
      'window_to', ((v_week + 7)::timestamp AT TIME ZONE 'UTC'),
      'opponent', (SELECT jsonb_build_object('id', c.id, 'name', c.name, 'tag', c.tag, 'rating', c.rating)
                   FROM clans c WHERE c.id = v_opponent_id),
      'revealed', v_revealed,
      'my_picks', v_my_picks,
      'their_picks', v_their_picks,
      'my_rules', v_duel.effective_rules -> (CASE WHEN v_duel.clan_a = p_clan_id THEN 'a' ELSE 'b' END),
      'their_rules', CASE WHEN v_revealed
        THEN v_duel.effective_rules -> (CASE WHEN v_duel.clan_a = p_clan_id THEN 'b' ELSE 'a' END)
        ELSE NULL END,
      'scouting', v_scouting,
      'can_substitute', clan_has_research(p_clan_id, 'logistics_2')
        AND NOT COALESCE((v_duel.gauntlet_meta ->>
          ('substituted_' || (CASE WHEN v_duel.clan_a = p_clan_id THEN 'a' ELSE 'b' END)))::boolean, false)
    );
  END IF;

  -- Early scouting (logistics_3): from Sun 12:00, preview the projected
  -- next-week opponent (rating-adjacent neighbor)
  IF v_has_early
     AND NOW() >= (((v_week + 6)::timestamp AT TIME ZONE 'UTC') + INTERVAL '12 hours') THEN
    WITH ranked AS (
      SELECT id, name, tag, rating,
             ROW_NUMBER() OVER (ORDER BY rating DESC, created_at ASC, id ASC) AS rn
      FROM clans WHERE member_count >= 1
    ),
    me AS (SELECT rn FROM ranked WHERE id = p_clan_id)
    SELECT jsonb_build_object('name', r.name, 'tag', r.tag, 'rating', r.rating)
    INTO v_preview
    FROM ranked r, me
    WHERE r.id <> p_clan_id
    ORDER BY ABS(r.rn - me.rn) ASC, r.rn ASC
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'is_officer', v_my_role IN ('owner', 'officer'),
    'research', v_research,
    'gauntlet', v_gauntlet,
    'early_preview', v_preview
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 18. GRANTS (PostgREST parity with 011; the API uses the service role)
-- ----------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION gauntlet_node_cost(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION gauntlet_node_prereq(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION clan_has_research(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION contribute_tithe(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION set_research_target(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION submit_gauntlet_picks(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION substitute_gauntlet_roster(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_gauntlet(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION gauntlet_side_score(DATE, UUID, JSONB, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION gauntlet_top_contributors(DATE, UUID, JSONB, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION player_gauntlet_ban(UUID, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_gauntlet(UUID, UUID) TO authenticated;
GRANT SELECT ON clan_rivalries TO authenticated;
