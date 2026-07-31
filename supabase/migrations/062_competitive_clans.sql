-- Migration 062: competitive clans (Product Constitution v1.7 §9)
--
-- Forward-only amendment of migration 048's deliberately non-competitive
-- clan model. Historical migrations stay immutable. This migration restores
-- earned hierarchy under the v1.7 integrity boundary: server-authored Depth,
-- auditable authority changes, bounded rewards, and no paid route to rank.

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Roles, recruitment policy, and immutable audit
-- -------------------------------------------------------------------------

ALTER TABLE clan_members DROP CONSTRAINT IF EXISTS valid_clan_role;
ALTER TABLE clan_members ADD CONSTRAINT valid_clan_role
  CHECK (role IN ('owner', 'co_leader', 'member'));

COMMENT ON COLUMN clan_members.role IS
  'Internal authority: owner | co_leader | member. Player-facing owner copy is Leader. Competitive facts remain server-authored.';

ALTER TABLE clans
  ADD COLUMN IF NOT EXISTS join_policy TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS settings_updated_at TIMESTAMPTZ;

ALTER TABLE clans DROP CONSTRAINT IF EXISTS clans_join_policy_check;
ALTER TABLE clans ADD CONSTRAINT clans_join_policy_check
  CHECK (join_policy IN ('open', 'application', 'invite_only'));

CREATE INDEX IF NOT EXISTS idx_clans_join_policy
  ON clans(join_policy) WHERE disbanded_at IS NULL;

CREATE TABLE clan_membership_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE RESTRICT,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  transition TEXT NOT NULL CHECK (transition IN (
    'founded', 'joined_open', 'joined_code', 'invited', 'invite_accepted',
    'invite_declined', 'application_created', 'application_approved',
    'application_rejected', 'left', 'removed', 'promoted', 'demoted',
    'owner_transferred', 'settings_updated', 'glory_assigned',
    'glory_reassigned'
  )),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clan_membership_transitions_clan
  ON clan_membership_transitions(clan_id, created_at DESC);
CREATE INDEX idx_clan_membership_transitions_target
  ON clan_membership_transitions(target_user_id, created_at DESC)
  WHERE target_user_id IS NOT NULL;

CREATE TABLE clan_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE RESTRICT,
  applicant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT clan_application_review_shape CHECK (
    (status = 'pending' AND reviewed_at IS NULL AND reviewed_by IS NULL)
    OR status <> 'pending'
  )
);

CREATE UNIQUE INDEX uq_clan_applications_pending
  ON clan_applications(clan_id, applicant_id) WHERE status = 'pending';
CREATE INDEX idx_clan_applications_clan
  ON clan_applications(clan_id, status, created_at);
CREATE INDEX idx_clan_applications_applicant
  ON clan_applications(applicant_id, status, created_at DESC);

-- Migration 007's three-column UNIQUE made a second historical decline or
-- acceptance impossible. Preserve history and constrain only live requests.
ALTER TABLE clan_invites
  DROP CONSTRAINT IF EXISTS clan_invites_clan_id_player_id_status_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_clan_invites_pending
  ON clan_invites(clan_id, player_id) WHERE status = 'pending';

-- Migration 007 exposed all three base tables directly to authenticated
-- clients. That made the later service-only RPC model illusory: a caller could
-- create a free clan, self-join with an authority role, overwrite clan facts,
-- delete history, or read the invite code without using an audited transition.
-- Competitive clan state is now closed at the table boundary. Public,
-- membership, invitation, and directory reads are projected by authenticated
-- server routes/RPCs and never expose authority artifacts accidentally.
DROP POLICY IF EXISTS clans_select ON clans;
DROP POLICY IF EXISTS clans_insert ON clans;
DROP POLICY IF EXISTS clans_update ON clans;
DROP POLICY IF EXISTS clans_delete ON clans;
DROP POLICY IF EXISTS clan_members_select ON clan_members;
DROP POLICY IF EXISTS clan_members_insert ON clan_members;
DROP POLICY IF EXISTS clan_members_delete ON clan_members;
DROP POLICY IF EXISTS clan_invites_select ON clan_invites;
DROP POLICY IF EXISTS clan_invites_insert ON clan_invites;
DROP POLICY IF EXISTS clan_invites_update ON clan_invites;

REVOKE ALL ON clans, clan_members, clan_invites FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON clans, clan_members, clan_invites TO service_role;

-- All new tables are service-only. The API returns the bounded public view.
ALTER TABLE clan_membership_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE clan_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON clan_membership_transitions, clan_applications FROM anon, authenticated;
GRANT SELECT, INSERT ON clan_membership_transitions TO service_role;
GRANT SELECT, INSERT, UPDATE ON clan_applications TO service_role;

CREATE OR REPLACE FUNCTION record_clan_membership_transition(
  p_clan_id UUID,
  p_target_user_id UUID,
  p_actor_user_id UUID,
  p_transition TEXT,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO clan_membership_transitions(
    clan_id, target_user_id, actor_user_id, transition, metadata
  ) VALUES (
    p_clan_id, p_target_user_id, p_actor_user_id, p_transition,
    COALESCE(p_metadata, '{}')
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION record_clan_membership_transition(UUID, UUID, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_clan_membership_transition(UUID, UUID, UUID, TEXT, JSONB) TO service_role;

-- -------------------------------------------------------------------------
-- 2. Audited clan DNA sources
-- -------------------------------------------------------------------------

ALTER TABLE economy_transactions DROP CONSTRAINT IF EXISTS economy_transactions_source_type_check;
ALTER TABLE economy_transactions ADD CONSTRAINT economy_transactions_source_type_check CHECK (source_type IN (
  'game_reward', 'breeding_cost', 'purchase', 'daily_reward', 'game_start',
  'energy_regen', 'admin_grant', 'refund', 'achievement_reward',
  'streak_bonus', 'battle_pass_reward', 'offline_claim', 'unlock_cost',
  'clan_tithe', 'premium_stipend', 'lineage_reroll', 'codex_discovery',
  'reroll_token_conversion', 'signal_bonus', 'daily_take',
  'clan_founding', 'clan_battle_reward', 'clan_glory_reward'
));

-- One receipt per eligible contributor and settled battle. The outcome
-- component is snapshotted beside the participation component so the player
-- sees one exact settlement rather than two noisy wallet events. Neither
-- component touches battle score, run Yield, Energy, or future eligibility.
-- Add nullable first: pre-cutover battles stay NULL and can never be
-- retroactively converted into a faucet. Only battles created after this
-- default is installed snapshot reward terms v1.
ALTER TABLE clan_energy_battles
  ADD COLUMN reward_terms_version SMALLINT
    CHECK (reward_terms_version IS NULL OR reward_terms_version = 1);
ALTER TABLE clan_energy_battles
  ALTER COLUMN reward_terms_version SET DEFAULT 1;

COMMENT ON COLUMN clan_energy_battles.reward_terms_version IS
  'Forward-only reward contract. NULL means the battle predates bounded contributor DNA and must never be back-paid.';

CREATE TABLE clan_energy_battle_reward_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id UUID NOT NULL REFERENCES clan_energy_battles(id) ON DELETE RESTRICT,
  side_id UUID NOT NULL REFERENCES clan_energy_battle_sides(id) ON DELETE RESTRICT,
  clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE RESTRICT,
  cycle_index BIGINT NOT NULL,
  reward_terms_version SMALLINT NOT NULL CHECK (reward_terms_version = 1),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  reward_kind TEXT NOT NULL CHECK (
    reward_kind IN ('participation', 'victor', 'stalemate')
  ),
  outcome TEXT NOT NULL CHECK (
    outcome IN ('participant', 'victor', 'stalemate', 'bye')
  ),
  participation_amount INTEGER NOT NULL CHECK (
    participation_amount BETWEEN 0 AND 1000
  ),
  bonus_amount INTEGER NOT NULL CHECK (bonus_amount BETWEEN 0 AND 1000),
  amount INTEGER NOT NULL CHECK (
    amount BETWEEN 0 AND 2000
    AND amount = participation_amount + bonus_amount
  ),
  eligible_run_count INTEGER NOT NULL CHECK (eligible_run_count >= 1),
  counted_run_count INTEGER NOT NULL CHECK (counted_run_count BETWEEN 1 AND 5),
  counted_depth BIGINT NOT NULL CHECK (counted_depth >= 0),
  energy_committed_total INTEGER NOT NULL CHECK (energy_committed_total >= 1),
  side_score BIGINT NOT NULL CHECK (side_score >= 0),
  opponent_score BIGINT CHECK (opponent_score IS NULL OR opponent_score >= 0),
  economy_transaction_id UUID UNIQUE
    REFERENCES economy_transactions(id) ON DELETE RESTRICT,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (battle_id, player_id),
  UNIQUE (battle_id, player_id, reward_kind)
);

CREATE INDEX idx_clan_energy_battle_rewards_player
  ON clan_energy_battle_reward_ledger(player_id, awarded_at DESC);

ALTER TABLE clan_energy_battle_reward_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON clan_energy_battle_reward_ledger FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON clan_energy_battle_reward_ledger TO service_role;

CREATE OR REPLACE FUNCTION award_clan_energy_battle_rewards(
  p_battle_id UUID,
  p_participation_reward_dna INTEGER,
  p_victor_bonus_dna INTEGER,
  p_stalemate_bonus_dna INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_battle clan_energy_battles%ROWTYPE;
  v_contributor RECORD;
  v_player players%ROWTYPE;
  v_reward_kind TEXT;
  v_bonus INTEGER;
  v_amount INTEGER;
  v_ledger_id UUID;
  v_transaction_id UUID;
  v_moment_id UUID;
  v_awarded_at TIMESTAMPTZ;
  v_balance INTEGER;
  v_headline TEXT;
  v_detail TEXT;
  v_settled INTEGER := 0;
  v_total_dna BIGINT := 0;
BEGIN
  IF p_battle_id IS NULL
     OR p_participation_reward_dna IS NULL
     OR p_victor_bonus_dna IS NULL
     OR p_stalemate_bonus_dna IS NULL
     OR p_participation_reward_dna NOT BETWEEN 0 AND 1000
     OR p_victor_bonus_dna NOT BETWEEN 0 AND 1000
     OR p_stalemate_bonus_dna NOT BETWEEN 0 AND 1000 THEN
    RAISE EXCEPTION 'CLAN_BATTLE_REWARD_DIAL_OUT_OF_RANGE';
  END IF;

  SELECT * INTO v_battle
  FROM clan_energy_battles b
  WHERE b.id = p_battle_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'settled', 0, 'dna_awarded', 0, 'battle_id', p_battle_id,
      'reason', 'battle_not_found'
    );
  END IF;
  IF v_battle.settled_at IS NULL THEN
    RETURN jsonb_build_object(
      'settled', 0, 'dna_awarded', 0, 'battle_id', p_battle_id,
      'reason', 'battle_not_settled'
    );
  END IF;
  IF v_battle.reward_terms_version IS DISTINCT FROM 1 THEN
    RETURN jsonb_build_object(
      'settled', 0, 'dna_awarded', 0, 'battle_id', p_battle_id,
      'reason', 'reward_terms_not_eligible'
    );
  END IF;

  FOR v_contributor IN
    SELECT
      c.player_id,
      c.clan_id,
      c.side_id,
      s.outcome,
      s.score AS side_score,
      (
        SELECT rival.score
        FROM clan_energy_battle_sides rival
        WHERE rival.battle_id = p_battle_id
          AND rival.id <> c.side_id
        ORDER BY rival.slot
        LIMIT 1
      ) AS opponent_score,
      COUNT(*)::INTEGER AS eligible_run_count,
      (COUNT(*) FILTER (WHERE c.counted IS TRUE))::INTEGER AS counted_run_count,
      COALESCE(SUM(c.score) FILTER (WHERE c.counted IS TRUE), 0)::BIGINT AS counted_depth,
      COALESCE(SUM(c.energy_committed), 0)::INTEGER AS energy_committed_total
    FROM clan_energy_contributions c
    JOIN clan_energy_battle_sides s ON s.id = c.side_id
    WHERE c.battle_id = p_battle_id
    GROUP BY c.player_id, c.clan_id, c.side_id, s.outcome, s.score
    ORDER BY c.player_id
  LOOP
    IF v_contributor.outcome NOT IN ('participant', 'victor', 'stalemate', 'bye') THEN
      RAISE EXCEPTION 'CLAN_BATTLE_REWARD_OUTCOME_NOT_FINAL';
    END IF;
    IF v_contributor.counted_run_count < 1 THEN
      RAISE EXCEPTION 'CLAN_BATTLE_REWARD_WITHOUT_COUNTED_RUN';
    END IF;

    v_reward_kind := CASE v_contributor.outcome
      WHEN 'victor' THEN 'victor'
      WHEN 'stalemate' THEN 'stalemate'
      ELSE 'participation'
    END;
    v_bonus := CASE v_contributor.outcome
      WHEN 'victor' THEN p_victor_bonus_dna
      WHEN 'stalemate' THEN p_stalemate_bonus_dna
      ELSE 0
    END;
    v_amount := p_participation_reward_dna + v_bonus;
    v_ledger_id := NULL;

    INSERT INTO clan_energy_battle_reward_ledger(
      battle_id, side_id, clan_id, cycle_index, reward_terms_version, player_id,
      reward_kind, outcome, participation_amount, bonus_amount, amount,
      eligible_run_count, counted_run_count, counted_depth,
      energy_committed_total, side_score, opponent_score
    ) VALUES (
      p_battle_id, v_contributor.side_id, v_contributor.clan_id,
      v_battle.cycle_index, v_battle.reward_terms_version, v_contributor.player_id,
      v_reward_kind, v_contributor.outcome, p_participation_reward_dna,
      v_bonus, v_amount, v_contributor.eligible_run_count,
      v_contributor.counted_run_count, v_contributor.counted_depth,
      v_contributor.energy_committed_total, v_contributor.side_score,
      v_contributor.opponent_score
    )
    ON CONFLICT (battle_id, player_id) DO NOTHING
    RETURNING id, awarded_at INTO v_ledger_id, v_awarded_at;

    IF v_ledger_id IS NULL THEN CONTINUE; END IF;

    -- A zeroed live dial still receives an immutable processed receipt, but
    -- never manufactures a zero-value wallet event or notification.
    IF v_amount > 0 THEN
      SELECT * INTO v_player FROM players p
      WHERE p.id = v_contributor.player_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'CLAN_BATTLE_REWARD_PLAYER_NOT_FOUND'; END IF;

      UPDATE players
      SET dna = COALESCE(dna, 0) + v_amount,
          total_dna_earned = COALESCE(total_dna_earned, 0) + v_amount,
          updated_at = NOW()
      WHERE id = v_contributor.player_id
      RETURNING dna INTO v_balance;

      INSERT INTO economy_transactions(
        player_id, resource_type, amount, balance_after,
        source_type, source_id, metadata
      ) VALUES (
        v_contributor.player_id, 'dna', v_amount, v_balance,
        'clan_battle_reward', v_ledger_id,
        jsonb_build_object(
          'battle_id', p_battle_id,
          'clan_id', v_contributor.clan_id,
          'cycle_index', v_battle.cycle_index,
          'reward_terms_version', v_battle.reward_terms_version,
          'reward_kind', v_reward_kind,
          'outcome', v_contributor.outcome,
          'participation_dna', p_participation_reward_dna,
          'bonus_dna', v_bonus,
          'counted_depth', v_contributor.counted_depth,
          'eligible_run_count', v_contributor.eligible_run_count,
          'counted_run_count', v_contributor.counted_run_count,
          'energy_committed_total', v_contributor.energy_committed_total,
          'side_score', v_contributor.side_score,
          'opponent_score', v_contributor.opponent_score
        )
      ) RETURNING id INTO v_transaction_id;

      UPDATE clan_energy_battle_reward_ledger
      SET economy_transaction_id = v_transaction_id
      WHERE id = v_ledger_id;

      v_headline := CASE v_reward_kind
        WHEN 'victor' THEN 'Clan victory reward: ' || v_amount || ' DNA'
        WHEN 'stalemate' THEN 'Clan stalemate reward: ' || v_amount || ' DNA'
        ELSE 'Clan battle participation: ' || v_amount || ' DNA'
      END;
      v_detail := p_participation_reward_dna || ' participation'
        || CASE WHEN v_bonus > 0 THEN ' + ' || v_bonus || ' outcome bonus' ELSE '' END
        || '. Secured from ' || v_contributor.counted_depth || ' counted Depth.';

      INSERT INTO progression_moments(
        player_id, source_type, source_id, moment_key, pillar, kind,
        significance, headline, detail, destination, artifact_ref, payload,
        secured_at
      ) VALUES (
        v_contributor.player_id, 'clan_battle_reward', v_ledger_id::TEXT,
        'settlement', 'clan', 'clan_battle_reward',
        CASE v_reward_kind WHEN 'victor' THEN 'historic'
          WHEN 'stalemate' THEN 'milestone' ELSE 'notable' END,
        v_headline, v_detail, 'clan', 'battle-reward:' || v_ledger_id,
        jsonb_build_object(
          'ledgerId', v_ledger_id,
          'battleId', p_battle_id,
          'clanId', v_contributor.clan_id,
          'cycleIndex', v_battle.cycle_index,
          'rewardTermsVersion', v_battle.reward_terms_version,
          'rewardKind', v_reward_kind,
          'outcome', v_contributor.outcome,
          'participationDna', p_participation_reward_dna,
          'bonusDna', v_bonus,
          'amount', v_amount,
          'countedDepth', v_contributor.counted_depth
        ),
        v_awarded_at
      )
      ON CONFLICT (player_id, source_type, source_id, moment_key) DO UPDATE
        SET payload = progression_moments.payload
      RETURNING id INTO v_moment_id;

      INSERT INTO player_attention_items(
        player_id, moment_id, source_type, source_id, attention_key,
        attention_kind, destination, headline, detail, artifact_ref
      ) VALUES (
        v_contributor.player_id, v_moment_id, 'clan_battle_reward',
        v_ledger_id::TEXT, 'settlement', 'recognition', 'clan',
        v_headline, v_detail, 'battle-reward:' || v_ledger_id
      )
      ON CONFLICT (player_id, source_type, source_id, attention_key) DO NOTHING;
    END IF;

    v_settled := v_settled + 1;
    v_total_dna := v_total_dna + v_amount;
  END LOOP;

  RETURN jsonb_build_object(
    'settled', v_settled,
    'dna_awarded', v_total_dna,
    'battle_id', p_battle_id,
    'cycle_index', v_battle.cycle_index
  );
END;
$$;

REVOKE ALL ON FUNCTION award_clan_energy_battle_rewards(UUID, INTEGER, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION award_clan_energy_battle_rewards(UUID, INTEGER, INTEGER, INTEGER)
  TO service_role;

-- Settlement remains the score/outcome authority. The reward receipt is
-- written in the same transaction for newly settled battles; the final pass
-- also repairs any settled battle whose payout was interrupted or predates
-- this migration. Unique ledger keys make both paths converge.
CREATE OR REPLACE FUNCTION settle_clan_energy_battles(
  p_completion_grace_seconds INTEGER,
  p_participation_reward_dna INTEGER,
  p_victor_bonus_dna INTEGER,
  p_stalemate_bonus_dna INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_battle RECORD;
  v_side_one RECORD;
  v_side_two RECORD;
  v_reward_battle RECORD;
  v_settled INTEGER := 0;
BEGIN
  IF p_participation_reward_dna IS NULL
     OR p_victor_bonus_dna IS NULL
     OR p_stalemate_bonus_dna IS NULL
     OR p_participation_reward_dna NOT BETWEEN 0 AND 1000
     OR p_victor_bonus_dna NOT BETWEEN 0 AND 1000
     OR p_stalemate_bonus_dna NOT BETWEEN 0 AND 1000 THEN
    RAISE EXCEPTION 'CLAN_BATTLE_REWARD_DIAL_OUT_OF_RANGE';
  END IF;

  FOR v_battle IN
    SELECT b.* FROM clan_energy_battles b
     WHERE b.settled_at IS NULL
       AND b.ends_at + make_interval(
         secs => GREATEST(0, p_completion_grace_seconds)
       ) <= NOW()
     ORDER BY b.ends_at
     FOR UPDATE
  LOOP
    SELECT s.* INTO v_side_one FROM clan_energy_battle_sides s
     WHERE s.battle_id = v_battle.id ORDER BY s.slot LIMIT 1;
    SELECT s.* INTO v_side_two FROM clan_energy_battle_sides s
     WHERE s.battle_id = v_battle.id ORDER BY s.slot OFFSET 1 LIMIT 1;

    IF v_side_one.id IS NULL THEN
      RAISE EXCEPTION 'CLAN_BATTLE_WITHOUT_SIDE';
    ELSIF v_side_two.id IS NULL THEN
      UPDATE clan_energy_battle_sides SET outcome = 'bye'
      WHERE id = v_side_one.id;
    ELSIF v_side_one.score = v_side_two.score THEN
      UPDATE clan_energy_battle_sides SET outcome = 'stalemate'
      WHERE battle_id = v_battle.id;
    ELSIF v_side_one.score > v_side_two.score THEN
      UPDATE clan_energy_battle_sides SET outcome = 'victor'
      WHERE id = v_side_one.id;
      UPDATE clan_energy_battle_sides SET outcome = 'participant'
      WHERE id = v_side_two.id;
    ELSE
      UPDATE clan_energy_battle_sides SET outcome = 'participant'
      WHERE id = v_side_one.id;
      UPDATE clan_energy_battle_sides SET outcome = 'victor'
      WHERE id = v_side_two.id;
    END IF;

    INSERT INTO clan_energy_honors(battle_id, clan_id, player_id, honor)
    SELECT DISTINCT c.battle_id, c.clan_id, c.player_id,
      CASE s.outcome
        WHEN 'victor' THEN 'victor'
        WHEN 'stalemate' THEN 'stalemate'
        ELSE 'participant'
      END
      FROM clan_energy_contributions c
      JOIN clan_energy_battle_sides s ON s.id = c.side_id
     WHERE c.battle_id = v_battle.id
    ON CONFLICT (battle_id, player_id) DO NOTHING;

    WITH player_depth AS (
      SELECT c.player_id, COALESCE(SUM(c.score), 0)::BIGINT AS depth
        FROM clan_energy_contributions c
       WHERE c.battle_id = v_battle.id AND c.counted IS TRUE
       GROUP BY c.player_id
    )
    UPDATE players p
       SET lifetime_depth = p.lifetime_depth + d.depth,
           best_week_depth = GREATEST(p.best_week_depth, d.depth)
      FROM player_depth d
     WHERE p.id = d.player_id;

    UPDATE clans c
       SET lifetime_depth = c.lifetime_depth + s.score,
           best_week_depth = GREATEST(c.best_week_depth, s.score)
      FROM clan_energy_battle_sides s
     WHERE s.battle_id = v_battle.id
       AND s.clan_id = c.id
       AND s.score > 0;

    UPDATE clan_energy_battles SET settled_at = NOW()
    WHERE id = v_battle.id;

    PERFORM award_clan_energy_battle_rewards(
      v_battle.id,
      p_participation_reward_dna,
      p_victor_bonus_dna,
      p_stalemate_bonus_dna
    );
    v_settled := v_settled + 1;
  END LOOP;

  -- Durable catch-up: a transient payout failure or a battle settled by the
  -- pre-062 function cannot strand an earned reward.
  FOR v_reward_battle IN
    SELECT b.id
    FROM clan_energy_battles b
    WHERE b.settled_at IS NOT NULL
      AND b.reward_terms_version = 1
      AND EXISTS (
        SELECT 1 FROM clan_energy_contributions c WHERE c.battle_id = b.id
      )
      AND EXISTS (
        SELECT 1
        FROM clan_energy_contributions c
        WHERE c.battle_id = b.id
          AND NOT EXISTS (
            SELECT 1 FROM clan_energy_battle_reward_ledger r
            WHERE r.battle_id = b.id AND r.player_id = c.player_id
          )
      )
    ORDER BY b.settled_at, b.id
    FOR UPDATE OF b
  LOOP
    PERFORM award_clan_energy_battle_rewards(
      v_reward_battle.id,
      p_participation_reward_dna,
      p_victor_bonus_dna,
      p_stalemate_bonus_dna
    );
  END LOOP;

  RETURN v_settled;
END;
$$;

REVOKE ALL ON FUNCTION settle_clan_energy_battles(INTEGER, INTEGER, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION settle_clan_energy_battles(INTEGER, INTEGER, INTEGER, INTEGER)
  TO service_role;

-- Compatibility for a briefly skewed deploy. New application code always
-- sends all four dials; an older cron receives the same public launch defaults
-- instead of silently settling an outcome without its reward receipt.
CREATE OR REPLACE FUNCTION settle_clan_energy_battles(
  p_completion_grace_seconds INTEGER DEFAULT 10800
)
RETURNS INTEGER
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT settle_clan_energy_battles(
    p_completion_grace_seconds,
    100,
    100,
    50
  );
$$;

REVOKE ALL ON FUNCTION settle_clan_energy_battles(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION settle_clan_energy_battles(INTEGER) TO service_role;

-- -------------------------------------------------------------------------
-- 3. Searchable directory and authoritative roster contribution
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_competitive_clan_directory(
  p_search TEXT DEFAULT NULL,
  p_policy TEXT DEFAULT NULL,
  p_has_space BOOLEAN DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_alive_weeks INTEGER DEFAULT 2
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  tag TEXT,
  banner_id TEXT,
  emblem_id TEXT,
  color_primary TEXT,
  member_count BIGINT,
  max_members INTEGER,
  available_spots BIGINT,
  join_policy TEXT,
  best_week_depth BIGINT,
  recent_activity_at TIMESTAMPTZ,
  recent_activity_kind TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH member_counts AS (
    SELECT cm.clan_id, COUNT(*)::BIGINT AS member_count
    FROM clan_members cm
    GROUP BY cm.clan_id
  ),
  energy_activity AS (
    SELECT c.clan_id, MAX(c.completed_at) AS active_at
    FROM clan_energy_contributions c
    GROUP BY c.clan_id
  ),
  legacy_activity AS (
    SELECT swc.clan_id, MAX(swc.settled_at) AS active_at
    FROM serpent_week_clans swc
    GROUP BY swc.clan_id
  ),
  membership_activity AS (
    SELECT t.clan_id, MAX(t.created_at) AS active_at
    FROM clan_membership_transitions t
    WHERE t.transition IN (
      'joined_open', 'joined_code', 'invite_accepted', 'application_approved'
    )
    GROUP BY t.clan_id
  ),
  facts AS (
    SELECT
      c.id, c.name, c.tag, c.banner_id, c.emblem_id, c.color_primary,
      COALESCE(mc.member_count, 0)::BIGINT AS exact_member_count,
      c.max_members,
      GREATEST(c.max_members::BIGINT - COALESCE(mc.member_count, 0), 0)::BIGINT
        AS exact_available_spots,
      c.join_policy,
      COALESCE(c.best_week_depth, 0)::BIGINT AS best_week_depth,
      GREATEST(c.created_at, ea.active_at, la.active_at, ma.active_at)
        AS recent_activity_at,
      CASE
        WHEN ea.active_at IS NOT NULL
          AND ea.active_at = GREATEST(c.created_at, ea.active_at, la.active_at, ma.active_at)
          THEN 'energy_battle'
        WHEN la.active_at IS NOT NULL
          AND la.active_at = GREATEST(c.created_at, ea.active_at, la.active_at, ma.active_at)
          THEN 'legacy_week'
        WHEN ma.active_at IS NOT NULL
          AND ma.active_at = GREATEST(c.created_at, ea.active_at, la.active_at, ma.active_at)
          THEN 'membership'
        ELSE 'founded'
      END AS recent_activity_kind
    FROM clans c
    LEFT JOIN member_counts mc ON mc.clan_id = c.id
    LEFT JOIN energy_activity ea ON ea.clan_id = c.id
    LEFT JOIN legacy_activity la ON la.clan_id = c.id
    LEFT JOIN membership_activity ma ON ma.clan_id = c.id
    WHERE c.disbanded_at IS NULL
  )
  SELECT
    f.id, f.name, f.tag, f.banner_id, f.emblem_id, f.color_primary,
    f.exact_member_count, f.max_members, f.exact_available_spots,
    f.join_policy, f.best_week_depth, f.recent_activity_at,
    f.recent_activity_kind
  FROM facts f
  WHERE (
      NULLIF(btrim(COALESCE(p_search, '')), '') IS NULL
      OR POSITION(lower(btrim(p_search)) IN lower(f.name)) > 0
      OR POSITION(lower(btrim(p_search)) IN lower(COALESCE(f.tag, ''))) > 0
    )
    AND (p_policy IS NULL OR f.join_policy = p_policy)
    AND (p_has_space IS NULL OR (f.exact_available_spots > 0) = p_has_space)
    AND f.recent_activity_at IS NOT NULL
    AND f.recent_activity_at >= NOW() - make_interval(
      weeks => LEAST(GREATEST(COALESCE(p_alive_weeks, 2), 1), 52)
    )
  ORDER BY f.recent_activity_at DESC NULLS LAST, lower(f.name), f.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  OFFSET LEAST(GREATEST(COALESCE(p_offset, 0), 0), 10000);
$$;

REVOKE ALL ON FUNCTION get_competitive_clan_directory(TEXT, TEXT, BOOLEAN, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_competitive_clan_directory(TEXT, TEXT, BOOLEAN, INTEGER, INTEGER, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION get_clan_competitive_roster(
  p_clan_id UUID,
  p_cycle_index BIGINT
)
RETURNS TABLE (
  user_id UUID,
  player_id UUID,
  best_five_depth BIGINT,
  contribution_rank BIGINT,
  eligible_results INTEGER,
  best_generation INTEGER,
  last_contributed_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH side AS (
    SELECT s.id, s.battle_id
    FROM clan_energy_battle_sides s
    WHERE s.clan_id = p_clan_id AND s.cycle_index = p_cycle_index
    LIMIT 1
  ),
  totals AS (
    SELECT
      c.player_id,
      SUM(c.score)::BIGINT AS depth,
      COUNT(*)::INTEGER AS results,
      MAX(c.snake_generation)::INTEGER AS generation,
      MAX(c.completed_at) AS last_at
    FROM clan_energy_contributions c
    JOIN side s ON s.id = c.side_id AND s.battle_id = c.battle_id
    WHERE c.counted IS TRUE AND c.energy_committed > 0
    GROUP BY c.player_id
  ),
  ranked AS (
    SELECT
      t.*,
      RANK() OVER (ORDER BY t.depth DESC, t.last_at ASC, t.player_id ASC) AS clan_rank
    FROM totals t
  )
  SELECT
    cm.player_id AS user_id,
    p.id AS player_id,
    r.depth AS best_five_depth,
    r.clan_rank AS contribution_rank,
    COALESCE(r.results, 0)::INTEGER AS eligible_results,
    r.generation AS best_generation,
    r.last_at AS last_contributed_at
  FROM clan_members cm
  LEFT JOIN players p ON p.user_id = cm.player_id
  LEFT JOIN ranked r ON r.player_id = p.id
  WHERE cm.clan_id = p_clan_id
  ORDER BY r.clan_rank ASC NULLS LAST, cm.joined_at ASC, cm.player_id ASC;
$$;

REVOKE ALL ON FUNCTION get_clan_competitive_roster(UUID, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_clan_competitive_roster(UUID, BIGINT) TO service_role;

-- -------------------------------------------------------------------------
-- 4. Founding: quoted, bounded, atomic DNA spend
-- -------------------------------------------------------------------------

DROP FUNCTION IF EXISTS found_clan(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE FUNCTION found_clan(
  p_user_id UUID,
  p_name TEXT,
  p_tag TEXT DEFAULT NULL,
  p_banner_id TEXT DEFAULT NULL,
  p_emblem_id TEXT DEFAULT NULL,
  p_color_primary TEXT DEFAULT NULL,
  p_color_secondary TEXT DEFAULT NULL,
  p_founding_cost INTEGER DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name TEXT;
  v_tag TEXT;
  v_base TEXT;
  v_code TEXT;
  v_clan clans%ROWTYPE;
  v_player players%ROWTYPE;
  v_new_balance INTEGER;
  v_suffix INTEGER := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;
  IF p_founding_cost IS NULL OR p_founding_cost < 1 OR p_founding_cost > 100000 THEN
    RETURN jsonb_build_object('error', 'invalid_founding_cost');
  END IF;

  v_name := btrim(COALESCE(p_name, ''));
  IF char_length(v_name) < 3 OR char_length(v_name) > 20
     OR v_name !~ '^[A-Za-z0-9][A-Za-z0-9 ''\-]*[A-Za-z0-9]$'
     OR v_name ~ '\s\s' THEN
    RETURN jsonb_build_object('error', 'invalid_name');
  END IF;

  -- One serialization point protects membership, tag selection, and spend.
  PERFORM pg_advisory_xact_lock(hashtextextended('competitive-clan-founding', 0));

  IF EXISTS (SELECT 1 FROM clan_members WHERE player_id = p_user_id) THEN
    RETURN jsonb_build_object('error', 'already_in_clan');
  END IF;

  SELECT * INTO v_player FROM players p WHERE p.user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'player_not_found');
  END IF;
  IF COALESCE(v_player.dna, 0) < p_founding_cost THEN
    RETURN jsonb_build_object(
      'error', 'insufficient_dna',
      'required_dna', p_founding_cost,
      'dna_balance', COALESCE(v_player.dna, 0)
    );
  END IF;

  v_base := upper(regexp_replace(
    COALESCE(NULLIF(btrim(p_tag), ''), v_name), '[^A-Za-z0-9]', '', 'g'
  ));
  IF char_length(v_base) < 2 THEN v_base := 'CLAN'; END IF;
  v_tag := substr(v_base, 1, 6);
  WHILE EXISTS (SELECT 1 FROM clans WHERE tag = v_tag) LOOP
    v_suffix := v_suffix + 1;
    IF v_suffix > 99 THEN
      RETURN jsonb_build_object('error', 'tag_unavailable');
    END IF;
    v_tag := substr(v_base, 1, 6 - char_length(v_suffix::TEXT)) || v_suffix::TEXT;
  END LOOP;

  IF p_banner_id IS NOT NULL AND p_banner_id NOT IN (
    'field_standard', 'venom_wake', 'deep_current',
    'primal_root', 'cosmic_veil', 'iron_march'
  ) THEN
    RETURN jsonb_build_object('error', 'invalid_banner');
  END IF;
  IF p_emblem_id IS NOT NULL AND p_emblem_id NOT IN (
    'fang', 'coil', 'helix', 'talon', 'sigil', 'crown'
  ) THEN
    RETURN jsonb_build_object('error', 'invalid_emblem');
  END IF;
  IF (p_color_primary IS NOT NULL AND lower(p_color_primary) NOT IN (
        '#f97316', '#22d3ee', '#4ade80', '#a855f7',
        '#facc15', '#f43f5e', '#e2e8f0', '#64748b'
      ))
     OR (p_color_secondary IS NOT NULL AND lower(p_color_secondary) NOT IN (
        '#f97316', '#22d3ee', '#4ade80', '#a855f7',
        '#facc15', '#f43f5e', '#e2e8f0', '#64748b'
      )) THEN
    RETURN jsonb_build_object('error', 'invalid_color');
  END IF;

  v_code := generate_clan_invite_code();
  INSERT INTO clans(
    name, tag, description, owner_id, member_count, max_members,
    banner_id, emblem_id, color_primary, color_secondary,
    invite_code, invite_code_rotated_at, join_policy
  ) VALUES (
    v_name, v_tag, '', p_user_id, 1, 12,
    p_banner_id, p_emblem_id, p_color_primary, p_color_secondary,
    v_code, NOW(), 'open'
  ) RETURNING * INTO v_clan;

  INSERT INTO clan_members(clan_id, player_id, role)
  VALUES (v_clan.id, p_user_id, 'owner');

  -- constitution-allow: owned-row-downward  player-confirmed, clearly quoted clan founding sink; clan and audit are created in the same transaction
  UPDATE players
  SET dna = dna - p_founding_cost, updated_at = NOW()
  WHERE id = v_player.id
  RETURNING dna INTO v_new_balance;

  INSERT INTO economy_transactions(
    player_id, resource_type, amount, balance_after, source_type, source_id, metadata
  ) VALUES (
    v_player.id, 'dna', -p_founding_cost, v_new_balance,
    'clan_founding', v_clan.id,
    jsonb_build_object('clan_id', v_clan.id, 'clan_name', v_clan.name)
  );

  PERFORM record_clan_membership_transition(
    v_clan.id, p_user_id, p_user_id, 'founded',
    jsonb_build_object('founding_dna_cost', p_founding_cost)
  );

  RETURN jsonb_build_object(
    'clan_id', v_clan.id,
    'name', v_clan.name,
    'tag', v_clan.tag,
    'invite_code', v_clan.invite_code,
    'member_count', 1,
    'max_members', v_clan.max_members,
    'join_policy', v_clan.join_policy,
    'founding_dna_cost', p_founding_cost,
    'dna_balance', v_new_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION found_clan(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION found_clan(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) TO service_role;

-- Preset-only heraldry is an integrity/moderation boundary, not merely a
-- picker constraint. Replace migration 048's format-only validation so a
-- forged API request cannot introduce arbitrary identifiers or colors.
CREATE OR REPLACE FUNCTION set_clan_heraldry(
  p_user_id UUID,
  p_banner_id TEXT DEFAULT NULL,
  p_emblem_id TEXT DEFAULT NULL,
  p_color_primary TEXT DEFAULT NULL,
  p_color_secondary TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member clan_members%ROWTYPE;
BEGIN
  SELECT * INTO v_member FROM clan_members WHERE player_id = p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_in_clan'); END IF;
  IF v_member.role <> 'owner' THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;

  IF p_banner_id IS NOT NULL AND p_banner_id NOT IN (
    'field_standard', 'venom_wake', 'deep_current',
    'primal_root', 'cosmic_veil', 'iron_march'
  ) THEN
    RETURN jsonb_build_object('error', 'invalid_banner');
  END IF;
  IF p_emblem_id IS NOT NULL AND p_emblem_id NOT IN (
    'fang', 'coil', 'helix', 'talon', 'sigil', 'crown'
  ) THEN
    RETURN jsonb_build_object('error', 'invalid_emblem');
  END IF;
  IF (p_color_primary IS NOT NULL AND lower(p_color_primary) NOT IN (
        '#f97316', '#22d3ee', '#4ade80', '#a855f7',
        '#facc15', '#f43f5e', '#e2e8f0', '#64748b'
      ))
     OR (p_color_secondary IS NOT NULL AND lower(p_color_secondary) NOT IN (
        '#f97316', '#22d3ee', '#4ade80', '#a855f7',
        '#facc15', '#f43f5e', '#e2e8f0', '#64748b'
      )) THEN
    RETURN jsonb_build_object('error', 'invalid_color');
  END IF;

  UPDATE clans
  SET banner_id = COALESCE(p_banner_id, banner_id),
      emblem_id = COALESCE(p_emblem_id, emblem_id),
      color_primary = COALESCE(lower(p_color_primary), color_primary),
      color_secondary = COALESCE(lower(p_color_secondary), color_secondary),
      updated_at = NOW()
  WHERE id = v_member.clan_id;

  RETURN jsonb_build_object('clan_id', v_member.clan_id);
END;
$$;

REVOKE ALL ON FUNCTION set_clan_heraldry(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION set_clan_heraldry(UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- -------------------------------------------------------------------------
-- 5. One audited recruitment model: open, application, and invitation
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION request_clan_membership(
  p_user_id UUID,
  p_clan_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clan clans%ROWTYPE;
  v_members INTEGER;
  v_existing UUID;
  v_application UUID;
BEGIN
  IF p_user_id IS NULL OR p_clan_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;

  IF EXISTS (SELECT 1 FROM clan_members WHERE player_id = p_user_id) THEN
    RETURN jsonb_build_object('error', 'already_in_clan');
  END IF;

  SELECT * INTO v_clan FROM clans WHERE id = p_clan_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'clan_not_found'); END IF;
  IF v_clan.disbanded_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'clan_disbanded');
  END IF;

  IF v_clan.join_policy = 'invite_only' THEN
    RETURN jsonb_build_object('error', 'invite_required');
  END IF;

  IF v_clan.join_policy = 'application' THEN
    SELECT a.id INTO v_existing
    FROM clan_applications a
    WHERE a.clan_id = p_clan_id
      AND a.applicant_id = p_user_id
      AND a.status = 'pending'
    FOR UPDATE;

    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object(
        'state', 'application_pending',
        'application_id', v_existing,
        'clan_id', p_clan_id,
        'idempotent', TRUE
      );
    END IF;

    INSERT INTO clan_applications(clan_id, applicant_id)
    VALUES (p_clan_id, p_user_id)
    RETURNING id INTO v_application;

    PERFORM record_clan_membership_transition(
      p_clan_id, p_user_id, p_user_id, 'application_created',
      jsonb_build_object('application_id', v_application)
    );
    RETURN jsonb_build_object(
      'state', 'application_pending',
      'application_id', v_application,
      'clan_id', p_clan_id,
      'idempotent', FALSE
    );
  END IF;

  SELECT COUNT(*) INTO v_members FROM clan_members WHERE clan_id = p_clan_id;
  IF v_members >= v_clan.max_members THEN
    RETURN jsonb_build_object('error', 'clan_full');
  END IF;

  INSERT INTO clan_members(clan_id, player_id, role)
  VALUES (p_clan_id, p_user_id, 'member');
  UPDATE clans
  SET member_count = v_members + 1, updated_at = NOW()
  WHERE id = p_clan_id;

  UPDATE clan_applications
  SET status = 'withdrawn', reviewed_at = NOW()
  WHERE applicant_id = p_user_id AND status = 'pending';

  PERFORM record_clan_membership_transition(
    p_clan_id, p_user_id, p_user_id, 'joined_open', '{}'
  );
  RETURN jsonb_build_object(
    'state', 'joined', 'clan_id', p_clan_id,
    'member_count', v_members + 1, 'max_members', v_clan.max_members
  );
EXCEPTION WHEN unique_violation THEN
  -- Concurrent open joins serialize through clan_members' player UNIQUE.
  RETURN jsonb_build_object('error', 'already_in_clan');
END;
$$;

REVOKE ALL ON FUNCTION request_clan_membership(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION request_clan_membership(UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION create_clan_invite_by_handle(
  p_actor_user_id UUID,
  p_handle TEXT,
  p_expires_in_seconds INTEGER DEFAULT 604800
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor clan_members%ROWTYPE;
  v_clan clans%ROWTYPE;
  v_target_user UUID;
  v_target_handle TEXT;
  v_existing clan_invites%ROWTYPE;
  v_invite clan_invites%ROWTYPE;
  v_members INTEGER;
BEGIN
  IF p_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;
  IF p_handle IS NULL OR btrim(p_handle) !~ '^[A-Za-z0-9_]{3,16}$' THEN
    RETURN jsonb_build_object('error', 'invalid_handle');
  END IF;
  IF p_expires_in_seconds IS NULL
     OR p_expires_in_seconds < 3600 OR p_expires_in_seconds > 2592000 THEN
    RETURN jsonb_build_object('error', 'invalid_invite_lifetime');
  END IF;

  SELECT * INTO v_actor FROM clan_members WHERE player_id = p_actor_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_in_clan'); END IF;
  IF v_actor.role NOT IN ('owner', 'co_leader') THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;

  SELECT p.user_id, p.handle INTO v_target_user, v_target_handle
  FROM players p
  WHERE p.handle IS NOT NULL AND lower(p.handle) = lower(btrim(p_handle))
  LIMIT 1;
  IF v_target_user IS NULL THEN
    RETURN jsonb_build_object('error', 'handle_not_found');
  END IF;
  IF v_target_user = p_actor_user_id THEN
    RETURN jsonb_build_object('error', 'cannot_invite_self');
  END IF;
  IF EXISTS (SELECT 1 FROM clan_members WHERE player_id = v_target_user) THEN
    RETURN jsonb_build_object('error', 'target_already_in_clan');
  END IF;

  SELECT * INTO v_clan FROM clans WHERE id = v_actor.clan_id FOR UPDATE;
  IF v_clan.disbanded_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'clan_disbanded');
  END IF;
  SELECT COUNT(*) INTO v_members FROM clan_members WHERE clan_id = v_clan.id;
  IF v_members >= v_clan.max_members THEN
    RETURN jsonb_build_object('error', 'clan_full');
  END IF;

  UPDATE clan_invites
  SET status = 'expired'
  WHERE clan_id = v_clan.id AND player_id = v_target_user
    AND status = 'pending' AND expires_at <= NOW();

  SELECT * INTO v_existing FROM clan_invites
  WHERE clan_id = v_clan.id AND player_id = v_target_user AND status = 'pending'
  FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'invite_id', v_existing.id,
      'clan_id', v_clan.id,
      'handle', v_target_handle,
      'expires_at', v_existing.expires_at,
      'idempotent', TRUE
    );
  END IF;

  INSERT INTO clan_invites(clan_id, player_id, invited_by, expires_at)
  VALUES (
    v_clan.id, v_target_user, p_actor_user_id,
    NOW() + make_interval(secs => p_expires_in_seconds)
  ) RETURNING * INTO v_invite;

  PERFORM record_clan_membership_transition(
    v_clan.id, v_target_user, p_actor_user_id, 'invited',
    jsonb_build_object('invite_id', v_invite.id, 'handle', v_target_handle)
  );
  RETURN jsonb_build_object(
    'invite_id', v_invite.id,
    'clan_id', v_clan.id,
    'handle', v_target_handle,
    'expires_at', v_invite.expires_at,
    'idempotent', FALSE
  );
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO v_existing FROM clan_invites
  WHERE clan_id = v_actor.clan_id AND player_id = v_target_user AND status = 'pending';
  RETURN jsonb_build_object(
    'invite_id', v_existing.id, 'clan_id', v_actor.clan_id,
    'handle', v_target_handle, 'expires_at', v_existing.expires_at,
    'idempotent', TRUE
  );
END;
$$;

REVOKE ALL ON FUNCTION create_clan_invite_by_handle(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_clan_invite_by_handle(UUID, TEXT, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION review_clan_application(
  p_actor_user_id UUID,
  p_application_id UUID,
  p_approve BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor clan_members%ROWTYPE;
  v_application clan_applications%ROWTYPE;
  v_clan clans%ROWTYPE;
  v_members INTEGER;
  v_transition TEXT;
BEGIN
  IF p_actor_user_id IS NULL OR p_application_id IS NULL OR p_approve IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;
  SELECT * INTO v_actor FROM clan_members WHERE player_id = p_actor_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_in_clan'); END IF;
  IF v_actor.role NOT IN ('owner', 'co_leader') THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;

  SELECT * INTO v_application
  FROM clan_applications
  WHERE id = p_application_id AND clan_id = v_actor.clan_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'application_not_found'); END IF;
  IF v_application.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'state', v_application.status,
      'application_id', v_application.id,
      'idempotent', TRUE
    );
  END IF;

  IF NOT p_approve THEN
    UPDATE clan_applications
    SET status = 'rejected', reviewed_at = NOW(), reviewed_by = p_actor_user_id
    WHERE id = v_application.id;
    PERFORM record_clan_membership_transition(
      v_actor.clan_id, v_application.applicant_id, p_actor_user_id,
      'application_rejected', jsonb_build_object('application_id', v_application.id)
    );
    RETURN jsonb_build_object(
      'state', 'rejected', 'application_id', v_application.id,
      'clan_id', v_actor.clan_id, 'idempotent', FALSE
    );
  END IF;

  IF EXISTS (SELECT 1 FROM clan_members WHERE player_id = v_application.applicant_id) THEN
    RETURN jsonb_build_object('error', 'applicant_already_in_clan');
  END IF;
  SELECT * INTO v_clan FROM clans WHERE id = v_actor.clan_id FOR UPDATE;
  IF v_clan.disbanded_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'clan_disbanded');
  END IF;
  SELECT COUNT(*) INTO v_members FROM clan_members WHERE clan_id = v_clan.id;
  IF v_members >= v_clan.max_members THEN
    RETURN jsonb_build_object('error', 'clan_full');
  END IF;

  INSERT INTO clan_members(clan_id, player_id, role)
  VALUES (v_clan.id, v_application.applicant_id, 'member');
  UPDATE clans SET member_count = v_members + 1, updated_at = NOW()
  WHERE id = v_clan.id;
  UPDATE clan_applications
  SET status = 'approved', reviewed_at = NOW(), reviewed_by = p_actor_user_id
  WHERE id = v_application.id;
  UPDATE clan_applications
  SET status = 'withdrawn', reviewed_at = NOW()
  WHERE applicant_id = v_application.applicant_id
    AND status = 'pending' AND id <> v_application.id;

  v_transition := 'application_approved';
  PERFORM record_clan_membership_transition(
    v_clan.id, v_application.applicant_id, p_actor_user_id, v_transition,
    jsonb_build_object('application_id', v_application.id)
  );
  RETURN jsonb_build_object(
    'state', 'approved', 'application_id', v_application.id,
    'clan_id', v_clan.id, 'member_count', v_members + 1,
    'idempotent', FALSE
  );
END;
$$;

REVOKE ALL ON FUNCTION review_clan_application(UUID, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION review_clan_application(UUID, UUID, BOOLEAN) TO service_role;

CREATE OR REPLACE FUNCTION join_clan_by_code(p_user_id UUID, p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clan clans%ROWTYPE;
  v_members INTEGER;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('error', 'not_authorized'); END IF;
  IF p_code IS NULL OR upper(btrim(p_code)) !~ '^[A-HJ-NP-Z2-9]{8}$' THEN
    RETURN jsonb_build_object('error', 'invalid_code');
  END IF;
  IF EXISTS (SELECT 1 FROM clan_members WHERE player_id = p_user_id) THEN
    RETURN jsonb_build_object('error', 'already_in_clan');
  END IF;

  SELECT * INTO v_clan FROM clans
  WHERE invite_code = upper(btrim(p_code)) FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'clan_not_found'); END IF;
  IF v_clan.disbanded_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'clan_disbanded');
  END IF;
  SELECT COUNT(*) INTO v_members FROM clan_members WHERE clan_id = v_clan.id;
  IF v_members >= v_clan.max_members THEN
    RETURN jsonb_build_object('error', 'clan_full');
  END IF;

  INSERT INTO clan_members(clan_id, player_id, role)
  VALUES (v_clan.id, p_user_id, 'member');
  UPDATE clans SET member_count = v_members + 1, updated_at = NOW()
  WHERE id = v_clan.id;
  UPDATE clan_invites SET status = 'accepted'
  WHERE player_id = p_user_id AND clan_id = v_clan.id AND status = 'pending';
  UPDATE clan_applications SET status = 'withdrawn', reviewed_at = NOW()
  WHERE applicant_id = p_user_id AND status = 'pending';

  PERFORM record_clan_membership_transition(
    v_clan.id, p_user_id, p_user_id, 'joined_code', '{}'
  );
  RETURN jsonb_build_object(
    'state', 'joined', 'clan_id', v_clan.id, 'name', v_clan.name,
    'tag', v_clan.tag, 'member_count', v_members + 1,
    'max_members', v_clan.max_members
  );
END;
$$;

REVOKE ALL ON FUNCTION join_clan_by_code(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION join_clan_by_code(UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION respond_clan_invite(
  p_user_id UUID,
  p_invite_id UUID,
  p_accept BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invite clan_invites%ROWTYPE;
  v_clan clans%ROWTYPE;
  v_members INTEGER;
  v_handle TEXT;
BEGIN
  IF p_user_id IS NULL OR p_invite_id IS NULL OR p_accept IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;
  SELECT * INTO v_invite FROM clan_invites
  WHERE id = p_invite_id AND player_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'invite_not_found'); END IF;
  IF v_invite.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'state', v_invite.status, 'invite_id', v_invite.id, 'idempotent', TRUE
    );
  END IF;
  IF v_invite.expires_at <= NOW() THEN
    UPDATE clan_invites SET status = 'expired' WHERE id = v_invite.id;
    RETURN jsonb_build_object('error', 'invite_expired');
  END IF;

  IF NOT p_accept THEN
    UPDATE clan_invites SET status = 'declined' WHERE id = v_invite.id;
    PERFORM record_clan_membership_transition(
      v_invite.clan_id, p_user_id, p_user_id, 'invite_declined',
      jsonb_build_object('invite_id', v_invite.id)
    );
    RETURN jsonb_build_object(
      'state', 'declined', 'accepted', FALSE,
      'invite_id', v_invite.id, 'idempotent', FALSE
    );
  END IF;

  IF EXISTS (SELECT 1 FROM clan_members WHERE player_id = p_user_id) THEN
    RETURN jsonb_build_object('error', 'already_in_clan');
  END IF;
  SELECT * INTO v_clan FROM clans WHERE id = v_invite.clan_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'clan_not_found'); END IF;
  IF v_clan.disbanded_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'clan_disbanded');
  END IF;
  SELECT COUNT(*) INTO v_members FROM clan_members WHERE clan_id = v_clan.id;
  IF v_members >= v_clan.max_members THEN
    RETURN jsonb_build_object('error', 'clan_full');
  END IF;

  INSERT INTO clan_members(clan_id, player_id, role)
  VALUES (v_clan.id, p_user_id, 'member');
  UPDATE clans SET member_count = v_members + 1, updated_at = NOW()
  WHERE id = v_clan.id;
  UPDATE clan_invites SET status = 'accepted' WHERE id = v_invite.id;
  UPDATE clan_invites SET status = 'expired'
  WHERE player_id = p_user_id AND status = 'pending' AND id <> v_invite.id;
  UPDATE clan_applications SET status = 'withdrawn', reviewed_at = NOW()
  WHERE applicant_id = p_user_id AND status = 'pending';

  PERFORM record_clan_membership_transition(
    v_clan.id, p_user_id, v_invite.invited_by, 'invite_accepted',
    jsonb_build_object('invite_id', v_invite.id)
  );

  -- Preserve migration 024's idempotent Discord join event.
  SELECT piv.display_handle INTO v_handle
  FROM player_identity_view piv WHERE piv.user_id = p_user_id LIMIT 1;
  INSERT INTO discord_event_outbox(event_type, clan_id, dedup_key, payload)
  SELECT
    'member_joined', v_clan.id, 'member_joined:' || v_invite.id::TEXT,
    jsonb_build_object(
      'handle', COALESCE(v_handle, 'A new handler'),
      'clan_name', v_clan.name, 'clan_tag', v_clan.tag
    )
  WHERE EXISTS (SELECT 1 FROM discord_clan_links l WHERE l.clan_id = v_clan.id)
  ON CONFLICT (dedup_key) DO NOTHING;

  RETURN jsonb_build_object(
    'state', 'accepted', 'accepted', TRUE,
    'invite_id', v_invite.id, 'clan_id', v_clan.id,
    'clan_name', v_clan.name, 'clan_tag', v_clan.tag,
    'member_count', v_members + 1, 'idempotent', FALSE
  );
END;
$$;

REVOKE ALL ON FUNCTION respond_clan_invite(UUID, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION respond_clan_invite(UUID, UUID, BOOLEAN) TO service_role;

-- -------------------------------------------------------------------------
-- 6. Permission matrix, tenure-preserving exits, and settings
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_clan_member_role(
  p_actor_user_id UUID,
  p_target_user_id UUID,
  p_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor clan_members%ROWTYPE;
  v_target clan_members%ROWTYPE;
  v_transition TEXT;
BEGIN
  IF p_role IS NULL OR p_role NOT IN ('co_leader', 'member') THEN
    RETURN jsonb_build_object('error', 'invalid_role');
  END IF;
  SELECT * INTO v_actor FROM clan_members WHERE player_id = p_actor_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_in_clan'); END IF;
  IF v_actor.role <> 'owner' THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;
  SELECT * INTO v_target FROM clan_members
  WHERE player_id = p_target_user_id AND clan_id = v_actor.clan_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'target_not_in_clan'); END IF;
  IF v_target.role = 'owner' THEN
    RETURN jsonb_build_object('error', 'cannot_change_owner');
  END IF;
  IF v_target.role = p_role THEN
    RETURN jsonb_build_object(
      'clan_id', v_actor.clan_id, 'target_user_id', p_target_user_id,
      'role', p_role, 'idempotent', TRUE
    );
  END IF;

  UPDATE clan_members SET role = p_role WHERE id = v_target.id;
  v_transition := CASE WHEN p_role = 'co_leader' THEN 'promoted' ELSE 'demoted' END;
  PERFORM record_clan_membership_transition(
    v_actor.clan_id, p_target_user_id, p_actor_user_id, v_transition,
    jsonb_build_object('from_role', v_target.role, 'to_role', p_role)
  );
  RETURN jsonb_build_object(
    'clan_id', v_actor.clan_id, 'target_user_id', p_target_user_id,
    'role', p_role, 'idempotent', FALSE
  );
END;
$$;

REVOKE ALL ON FUNCTION set_clan_member_role(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION set_clan_member_role(UUID, UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION remove_clan_member(
  p_user_id UUID,
  p_target_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor clan_members%ROWTYPE;
  v_target clan_members%ROWTYPE;
  v_remaining INTEGER;
BEGIN
  IF p_user_id IS NULL OR p_target_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;
  IF p_user_id = p_target_user_id THEN
    RETURN jsonb_build_object('error', 'use_leave');
  END IF;
  SELECT * INTO v_actor FROM clan_members WHERE player_id = p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_in_clan'); END IF;
  IF v_actor.role NOT IN ('owner', 'co_leader') THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;

  PERFORM 1 FROM clans WHERE id = v_actor.clan_id FOR UPDATE;
  SELECT * INTO v_target FROM clan_members
  WHERE player_id = p_target_user_id AND clan_id = v_actor.clan_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'target_not_in_clan'); END IF;
  IF v_target.role = 'owner'
     OR (v_actor.role = 'co_leader' AND v_target.role <> 'member') THEN
    RETURN jsonb_build_object('error', 'protected_role');
  END IF;

  INSERT INTO clan_membership_history(clan_id, player_id, joined_at, left_at, ended_by)
  VALUES (v_target.clan_id, p_target_user_id, v_target.joined_at, NOW(), 'removed')
  ON CONFLICT (clan_id, player_id, joined_at) DO NOTHING;

  -- constitution-allow: owned-row-downward  current membership ends only after permanent tenure history is written
  DELETE FROM clan_members WHERE id = v_target.id;
  SELECT COUNT(*) INTO v_remaining FROM clan_members WHERE clan_id = v_actor.clan_id;
  UPDATE clans SET member_count = v_remaining, updated_at = NOW()
  WHERE id = v_actor.clan_id;

  PERFORM record_clan_membership_transition(
    v_actor.clan_id, p_target_user_id, p_user_id, 'removed',
    jsonb_build_object('target_role', v_target.role)
  );
  RETURN jsonb_build_object(
    'clan_id', v_actor.clan_id, 'member_count', v_remaining,
    'target_user_id', p_target_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION remove_clan_member(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION remove_clan_member(UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION leave_clan(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member clan_members%ROWTYPE;
  v_remaining INTEGER;
  v_disbanded BOOLEAN := FALSE;
  v_tenure TIMESTAMPTZ;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('error', 'not_authorized'); END IF;
  SELECT * INTO v_member FROM clan_members WHERE player_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_in_clan'); END IF;
  PERFORM 1 FROM clans WHERE id = v_member.clan_id FOR UPDATE;
  SELECT COUNT(*) INTO v_remaining FROM clan_members WHERE clan_id = v_member.clan_id;
  IF v_member.role = 'owner' AND v_remaining > 1 THEN
    RETURN jsonb_build_object('error', 'owner_must_transfer');
  END IF;
  v_tenure := clan_tenure_since(v_member.clan_id, p_user_id);

  INSERT INTO clan_membership_history(clan_id, player_id, joined_at, left_at, ended_by)
  VALUES (
    v_member.clan_id, p_user_id, v_member.joined_at, NOW(),
    CASE WHEN v_remaining = 1 THEN 'disbanded' ELSE 'left' END
  ) ON CONFLICT (clan_id, player_id, joined_at) DO NOTHING;

  -- constitution-allow: owned-row-downward  current membership ends only after permanent tenure history is written
  DELETE FROM clan_members WHERE id = v_member.id;
  IF v_remaining = 1 THEN
    UPDATE clans
    SET member_count = 0, disbanded_at = COALESCE(disbanded_at, NOW()), updated_at = NOW()
    WHERE id = v_member.clan_id;
    v_disbanded := TRUE;
  ELSE
    UPDATE clans SET member_count = v_remaining - 1, updated_at = NOW()
    WHERE id = v_member.clan_id;
  END IF;

  PERFORM record_clan_membership_transition(
    v_member.clan_id, p_user_id, p_user_id, 'left',
    jsonb_build_object('role', v_member.role, 'disbanded', v_disbanded)
  );
  RETURN jsonb_build_object(
    'clan_id', v_member.clan_id, 'disbanded', v_disbanded,
    'tenure_since', v_tenure
  );
END;
$$;

REVOKE ALL ON FUNCTION leave_clan(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION leave_clan(UUID) TO service_role;

CREATE OR REPLACE FUNCTION transfer_clan_ownership(
  p_user_id UUID,
  p_target_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner clan_members%ROWTYPE;
  v_target clan_members%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_target_user_id IS NULL OR p_user_id = p_target_user_id THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;
  SELECT * INTO v_owner FROM clan_members WHERE player_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_in_clan'); END IF;
  IF v_owner.role <> 'owner' THEN RETURN jsonb_build_object('error', 'not_authorized'); END IF;
  SELECT * INTO v_target FROM clan_members
  WHERE player_id = p_target_user_id AND clan_id = v_owner.clan_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'target_not_in_clan'); END IF;

  PERFORM 1 FROM clans WHERE id = v_owner.clan_id FOR UPDATE;
  UPDATE clan_members SET role = 'co_leader' WHERE id = v_owner.id;
  UPDATE clan_members SET role = 'owner' WHERE id = v_target.id;
  UPDATE clans SET owner_id = p_target_user_id, updated_at = NOW()
  WHERE id = v_owner.clan_id;

  PERFORM record_clan_membership_transition(
    v_owner.clan_id, p_target_user_id, p_user_id, 'owner_transferred',
    jsonb_build_object('previous_owner_user_id', p_user_id, 'previous_target_role', v_target.role)
  );
  RETURN jsonb_build_object(
    'clan_id', v_owner.clan_id, 'owner_id', p_target_user_id,
    'previous_owner_role', 'co_leader'
  );
END;
$$;

REVOKE ALL ON FUNCTION transfer_clan_ownership(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION transfer_clan_ownership(UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION update_clan_settings(
  p_actor_user_id UUID,
  p_join_policy TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor clan_members%ROWTYPE;
  v_previous TEXT;
BEGIN
  IF p_join_policy IS NULL
     OR p_join_policy NOT IN ('open', 'application', 'invite_only') THEN
    RETURN jsonb_build_object('error', 'invalid_policy');
  END IF;
  SELECT * INTO v_actor FROM clan_members WHERE player_id = p_actor_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_in_clan'); END IF;
  IF v_actor.role <> 'owner' THEN RETURN jsonb_build_object('error', 'not_authorized'); END IF;

  SELECT c.join_policy INTO v_previous FROM clans c
  WHERE c.id = v_actor.clan_id FOR UPDATE;
  IF v_previous = p_join_policy THEN
    RETURN jsonb_build_object(
      'clan_id', v_actor.clan_id, 'join_policy', p_join_policy, 'idempotent', TRUE
    );
  END IF;
  UPDATE clans
  SET join_policy = p_join_policy, settings_updated_at = NOW(), updated_at = NOW()
  WHERE id = v_actor.clan_id;
  PERFORM record_clan_membership_transition(
    v_actor.clan_id, NULL, p_actor_user_id, 'settings_updated',
    jsonb_build_object('from_policy', v_previous, 'to_policy', p_join_policy)
  );
  RETURN jsonb_build_object(
    'clan_id', v_actor.clan_id, 'join_policy', p_join_policy, 'idempotent', FALSE
  );
END;
$$;

REVOKE ALL ON FUNCTION update_clan_settings(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION update_clan_settings(UUID, TEXT) TO service_role;

-- -------------------------------------------------------------------------
-- 7. Glory seats: boundary-effective recognition and bounded reward ledger
-- -------------------------------------------------------------------------

CREATE TABLE clan_glory_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE RESTRICT,
  seat SMALLINT NOT NULL CHECK (seat BETWEEN 1 AND 2),
  holder_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  assigned_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  source_battle_id UUID NOT NULL REFERENCES clan_energy_battles(id) ON DELETE RESTRICT,
  source_cycle_index BIGINT NOT NULL,
  effective_cycle_index BIGINT NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL,
  evidence_depth BIGINT NOT NULL CHECK (evidence_depth >= 1),
  evidence_rank BIGINT NOT NULL CHECK (evidence_rank >= 1),
  evidence_contribution_count INTEGER NOT NULL
    CHECK (evidence_contribution_count BETWEEN 1 AND 5),
  reward_dna INTEGER NOT NULL CHECK (reward_dna BETWEEN 0 AND 1000),
  minimum_tenure_seconds INTEGER NOT NULL
    CHECK (minimum_tenure_seconds BETWEEN 0 AND 31536000),
  minimum_contribution_depth BIGINT NOT NULL
    CHECK (minimum_contribution_depth BETWEEN 1 AND 1000000000),
  self_award_allowed BOOLEAN NOT NULL,
  reassignment_allowed BOOLEAN NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  superseded_at TIMESTAMPTZ,
  superseded_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT clan_glory_next_cycle CHECK (
    effective_cycle_index = source_cycle_index + 1
  ),
  CONSTRAINT clan_glory_superseded_shape CHECK (
    (superseded_at IS NULL AND superseded_by_user_id IS NULL)
    OR (superseded_at IS NOT NULL AND superseded_by_user_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX uq_clan_glory_active_seat
  ON clan_glory_assignments(clan_id, effective_cycle_index, seat)
  WHERE superseded_at IS NULL;
CREATE UNIQUE INDEX uq_clan_glory_active_holder
  ON clan_glory_assignments(clan_id, effective_cycle_index, holder_user_id)
  WHERE superseded_at IS NULL;
CREATE INDEX idx_clan_glory_holder
  ON clan_glory_assignments(holder_user_id, effective_cycle_index DESC);

CREATE TABLE clan_glory_reward_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL UNIQUE
    REFERENCES clan_glory_assignments(id) ON DELETE RESTRICT,
  battle_id UUID NOT NULL REFERENCES clan_energy_battles(id) ON DELETE RESTRICT,
  clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE RESTRICT,
  cycle_index BIGINT NOT NULL,
  seat SMALLINT NOT NULL CHECK (seat BETWEEN 1 AND 2),
  holder_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  eligible_depth BIGINT NOT NULL CHECK (eligible_depth >= 1),
  eligible_contribution_count INTEGER NOT NULL
    CHECK (eligible_contribution_count BETWEEN 1 AND 5),
  amount INTEGER NOT NULL CHECK (amount BETWEEN 0 AND 1000),
  economy_transaction_id UUID UNIQUE REFERENCES economy_transactions(id) ON DELETE RESTRICT,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clan_id, cycle_index, seat),
  UNIQUE (clan_id, cycle_index, holder_user_id)
);

CREATE INDEX idx_clan_glory_reward_holder
  ON clan_glory_reward_ledger(holder_user_id, cycle_index DESC);

ALTER TABLE clan_glory_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE clan_glory_reward_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON clan_glory_assignments, clan_glory_reward_ledger FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON clan_glory_assignments TO service_role;
GRANT SELECT, INSERT, UPDATE ON clan_glory_reward_ledger TO service_role;

CREATE OR REPLACE FUNCTION assign_clan_glory(
  p_actor_user_id UUID,
  p_target_user_id UUID,
  p_source_cycle_index BIGINT,
  p_seat SMALLINT,
  p_reward_dna INTEGER,
  p_minimum_tenure_seconds INTEGER,
  p_minimum_contribution_depth BIGINT,
  p_allow_self_award BOOLEAN,
  p_allow_reassignment BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor clan_members%ROWTYPE;
  v_target clan_members%ROWTYPE;
  v_target_player UUID;
  v_source_battle UUID;
  v_source_ends_at TIMESTAMPTZ;
  v_source_settled_at TIMESTAMPTZ;
  v_effective_at TIMESTAMPTZ;
  v_evidence_depth BIGINT;
  v_evidence_rank BIGINT;
  v_evidence_count INTEGER;
  v_tenure_since TIMESTAMPTZ;
  v_existing clan_glory_assignments%ROWTYPE;
  v_other_holder UUID;
  v_assignment clan_glory_assignments%ROWTYPE;
  v_transition TEXT := 'glory_assigned';
BEGIN
  IF p_actor_user_id IS NULL OR p_target_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;
  IF p_source_cycle_index IS NULL OR p_seat IS NULL
     OR p_reward_dna IS NULL OR p_minimum_tenure_seconds IS NULL
     OR p_minimum_contribution_depth IS NULL
     OR p_allow_self_award IS NULL OR p_allow_reassignment IS NULL THEN
    RETURN jsonb_build_object('error', 'invalid_glory_terms');
  END IF;
  IF p_seat NOT BETWEEN 1 AND 2 THEN
    RETURN jsonb_build_object('error', 'invalid_glory_seat');
  END IF;
  IF p_reward_dna < 0 OR p_reward_dna > 1000
     OR p_minimum_tenure_seconds < 0 OR p_minimum_tenure_seconds > 31536000
     OR p_minimum_contribution_depth < 1
     OR p_minimum_contribution_depth > 1000000000 THEN
    RETURN jsonb_build_object('error', 'invalid_glory_terms');
  END IF;

  SELECT * INTO v_actor FROM clan_members WHERE player_id = p_actor_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_in_clan'); END IF;
  IF v_actor.role <> 'owner' THEN RETURN jsonb_build_object('error', 'not_authorized'); END IF;
  SELECT * INTO v_target FROM clan_members
  WHERE player_id = p_target_user_id AND clan_id = v_actor.clan_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'target_not_in_clan'); END IF;
  IF p_actor_user_id = p_target_user_id AND NOT p_allow_self_award THEN
    RETURN jsonb_build_object('error', 'glory_self_award_disabled');
  END IF;

  SELECT p.id INTO v_target_player FROM players p WHERE p.user_id = p_target_user_id;
  IF v_target_player IS NULL THEN RETURN jsonb_build_object('error', 'player_not_found'); END IF;

  SELECT b.id, b.ends_at, b.intermission_ends_at, b.settled_at
    INTO v_source_battle, v_source_ends_at, v_effective_at, v_source_settled_at
  FROM clan_energy_battle_sides s
  JOIN clan_energy_battles b ON b.id = s.battle_id
  WHERE s.clan_id = v_actor.clan_id
    AND s.cycle_index = p_source_cycle_index
  LIMIT 1;
  IF v_source_battle IS NULL THEN
    RETURN jsonb_build_object('error', 'glory_source_battle_not_found');
  END IF;
  IF NOW() >= v_effective_at THEN
    RETURN jsonb_build_object('error', 'glory_boundary_passed');
  END IF;
  IF v_source_settled_at IS NULL THEN
    RETURN jsonb_build_object('error', 'glory_source_not_final');
  END IF;
  IF NOW() < v_source_ends_at THEN
    RETURN jsonb_build_object('error', 'glory_boundary_not_open');
  END IF;

  WITH totals AS (
    SELECT
      c.player_id,
      SUM(c.score)::BIGINT AS depth,
      COUNT(*)::INTEGER AS contribution_count,
      MAX(c.completed_at) AS last_at
    FROM clan_energy_contributions c
    WHERE c.battle_id = v_source_battle
      AND c.clan_id = v_actor.clan_id
      AND c.counted IS TRUE
      AND c.energy_committed > 0
    GROUP BY c.player_id
  ),
  ranked AS (
    SELECT
      t.*,
      RANK() OVER (ORDER BY t.depth DESC, t.last_at ASC, t.player_id ASC) AS clan_rank
    FROM totals t
  )
  SELECT r.depth, r.clan_rank, r.contribution_count
    INTO v_evidence_depth, v_evidence_rank, v_evidence_count
  FROM ranked r WHERE r.player_id = v_target_player;

  IF v_evidence_depth IS NULL
     OR v_evidence_depth < p_minimum_contribution_depth THEN
    RETURN jsonb_build_object('error', 'glory_not_eligible');
  END IF;

  v_tenure_since := clan_tenure_since(v_actor.clan_id, p_target_user_id);
  IF v_tenure_since IS NULL
     OR EXTRACT(EPOCH FROM (NOW() - v_tenure_since)) < p_minimum_tenure_seconds THEN
    RETURN jsonb_build_object('error', 'glory_tenure_required');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'clan-glory:' || v_actor.clan_id::TEXT || ':' ||
    (p_source_cycle_index + 1)::TEXT || ':' || p_seat::TEXT, 0
  ));

  SELECT * INTO v_existing FROM clan_glory_assignments a
  WHERE a.clan_id = v_actor.clan_id
    AND a.effective_cycle_index = p_source_cycle_index + 1
    AND a.seat = p_seat
    AND a.superseded_at IS NULL
  FOR UPDATE;
  IF FOUND AND v_existing.holder_user_id = p_target_user_id THEN
    RETURN jsonb_build_object(
      'assignment_id', v_existing.id, 'clan_id', v_existing.clan_id,
      'seat', v_existing.seat, 'holder_user_id', v_existing.holder_user_id,
      'source_cycle_index', v_existing.source_cycle_index,
      'effective_cycle_index', v_existing.effective_cycle_index,
      'effective_at', v_existing.effective_at,
      'evidence_depth', v_existing.evidence_depth,
      'evidence_rank', v_existing.evidence_rank,
      'reward_dna', v_existing.reward_dna,
      'idempotent', TRUE
    );
  END IF;

  SELECT a.holder_user_id INTO v_other_holder
  FROM clan_glory_assignments a
  WHERE a.clan_id = v_actor.clan_id
    AND a.effective_cycle_index = p_source_cycle_index + 1
    AND a.holder_user_id = p_target_user_id
    AND a.superseded_at IS NULL
  LIMIT 1;
  IF v_other_holder IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'glory_holder_already_assigned');
  END IF;

  IF v_existing.id IS NOT NULL THEN
    IF NOT p_allow_reassignment THEN
      RETURN jsonb_build_object('error', 'glory_seat_taken');
    END IF;
    UPDATE clan_glory_assignments
    SET superseded_at = NOW(), superseded_by_user_id = p_actor_user_id
    WHERE id = v_existing.id;
    v_transition := 'glory_reassigned';
  END IF;

  INSERT INTO clan_glory_assignments(
    clan_id, seat, holder_user_id, assigned_by_user_id,
    source_battle_id, source_cycle_index, effective_cycle_index, effective_at,
    evidence_depth, evidence_rank, evidence_contribution_count,
    reward_dna, minimum_tenure_seconds, minimum_contribution_depth,
    self_award_allowed, reassignment_allowed
  ) VALUES (
    v_actor.clan_id, p_seat, p_target_user_id, p_actor_user_id,
    v_source_battle, p_source_cycle_index, p_source_cycle_index + 1, v_effective_at,
    v_evidence_depth, v_evidence_rank, v_evidence_count,
    p_reward_dna, p_minimum_tenure_seconds, p_minimum_contribution_depth,
    p_allow_self_award, p_allow_reassignment
  ) RETURNING * INTO v_assignment;

  PERFORM record_clan_membership_transition(
    v_actor.clan_id, p_target_user_id, p_actor_user_id, v_transition,
    jsonb_build_object(
      'assignment_id', v_assignment.id,
      'seat', p_seat,
      'source_cycle_index', p_source_cycle_index,
      'effective_cycle_index', p_source_cycle_index + 1,
      'evidence_depth', v_evidence_depth,
      'evidence_rank', v_evidence_rank,
      'reward_dna', p_reward_dna,
      'superseded_assignment_id', v_existing.id
    )
  );

  RETURN jsonb_build_object(
    'assignment_id', v_assignment.id, 'clan_id', v_assignment.clan_id,
    'seat', v_assignment.seat, 'holder_user_id', v_assignment.holder_user_id,
    'source_cycle_index', v_assignment.source_cycle_index,
    'effective_cycle_index', v_assignment.effective_cycle_index,
    'effective_at', v_assignment.effective_at,
    'evidence_depth', v_assignment.evidence_depth,
    'evidence_rank', v_assignment.evidence_rank,
    'reward_dna', v_assignment.reward_dna,
    'idempotent', FALSE
  );
END;
$$;

REVOKE ALL ON FUNCTION assign_clan_glory(UUID, UUID, BIGINT, SMALLINT, INTEGER, INTEGER, BIGINT, BOOLEAN, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION assign_clan_glory(UUID, UUID, BIGINT, SMALLINT, INTEGER, INTEGER, BIGINT, BOOLEAN, BOOLEAN) TO service_role;

CREATE OR REPLACE FUNCTION settle_clan_glory_rewards(
  p_cycle_index BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_assignment RECORD;
  v_player players%ROWTYPE;
  v_depth BIGINT;
  v_count INTEGER;
  v_ledger_id UUID;
  v_transaction_id UUID;
  v_moment_id UUID;
  v_balance INTEGER;
  v_settled INTEGER := 0;
  v_total_dna BIGINT := 0;
BEGIN
  FOR v_assignment IN
    SELECT
      a.*, b.id AS effective_battle_id
    FROM clan_glory_assignments a
    JOIN clan_energy_battles b
      ON b.cycle_index = a.effective_cycle_index
     AND b.settled_at IS NOT NULL
    JOIN clan_energy_battle_sides s
      ON s.battle_id = b.id AND s.clan_id = a.clan_id
    WHERE a.superseded_at IS NULL
      AND (p_cycle_index IS NULL OR a.effective_cycle_index = p_cycle_index)
    ORDER BY a.effective_cycle_index, a.clan_id, a.seat
  LOOP
    SELECT * INTO v_player FROM players p
    WHERE p.user_id = v_assignment.holder_user_id FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;

    SELECT COALESCE(SUM(c.score), 0)::BIGINT, COUNT(*)::INTEGER
      INTO v_depth, v_count
    FROM clan_energy_contributions c
    WHERE c.battle_id = v_assignment.effective_battle_id
      AND c.clan_id = v_assignment.clan_id
      AND c.player_id = v_player.id
      AND c.counted IS TRUE
      AND c.energy_committed > 0;

    IF v_count < 1 OR v_depth < v_assignment.minimum_contribution_depth THEN
      CONTINUE;
    END IF;

    v_ledger_id := NULL;
    INSERT INTO clan_glory_reward_ledger(
      assignment_id, battle_id, clan_id, cycle_index, seat,
      holder_user_id, player_id, eligible_depth,
      eligible_contribution_count, amount
    ) VALUES (
      v_assignment.id, v_assignment.effective_battle_id,
      v_assignment.clan_id, v_assignment.effective_cycle_index,
      v_assignment.seat, v_assignment.holder_user_id, v_player.id,
      v_depth, v_count, v_assignment.reward_dna
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_ledger_id;

    IF v_ledger_id IS NULL THEN CONTINUE; END IF;

    UPDATE players
    SET dna = COALESCE(dna, 0) + v_assignment.reward_dna,
        total_dna_earned = COALESCE(total_dna_earned, 0) + v_assignment.reward_dna,
        updated_at = NOW()
    WHERE id = v_player.id
    RETURNING dna INTO v_balance;

    INSERT INTO economy_transactions(
      player_id, resource_type, amount, balance_after,
      source_type, source_id, metadata
    ) VALUES (
      v_player.id, 'dna', v_assignment.reward_dna, v_balance,
      'clan_glory_reward', v_ledger_id,
      jsonb_build_object(
        'assignment_id', v_assignment.id,
        'battle_id', v_assignment.effective_battle_id,
        'clan_id', v_assignment.clan_id,
        'cycle_index', v_assignment.effective_cycle_index,
        'seat', v_assignment.seat,
        'eligible_depth', v_depth
      )
    ) RETURNING id INTO v_transaction_id;

    UPDATE clan_glory_reward_ledger
    SET economy_transaction_id = v_transaction_id
    WHERE id = v_ledger_id;

    IF v_assignment.reward_dna > 0 THEN
      INSERT INTO progression_moments(
        player_id, source_type, source_id, moment_key, pillar, kind,
        significance, headline, detail, destination, artifact_ref, payload,
        secured_at
      ) VALUES (
        v_player.id, 'clan_glory_reward', v_ledger_id::TEXT,
        'settlement', 'clan', 'clan_glory_reward', 'milestone',
        'Glory Member reward: ' || v_assignment.reward_dna || ' DNA',
        'Seat ' || v_assignment.seat || ' · cycle '
          || v_assignment.effective_cycle_index || ' · '
          || v_depth || ' eligible Depth. Secured.',
        'clan', 'glory-reward:' || v_ledger_id,
        jsonb_build_object(
          'ledgerId', v_ledger_id,
          'assignmentId', v_assignment.id,
          'battleId', v_assignment.effective_battle_id,
          'clanId', v_assignment.clan_id,
          'cycleIndex', v_assignment.effective_cycle_index,
          'seat', v_assignment.seat,
          'amount', v_assignment.reward_dna,
          'eligibleDepth', v_depth,
          'eligibleContributionCount', v_count
        ),
        NOW()
      )
      ON CONFLICT (player_id, source_type, source_id, moment_key) DO UPDATE
        SET payload = progression_moments.payload
      RETURNING id INTO v_moment_id;

      INSERT INTO player_attention_items(
        player_id, moment_id, source_type, source_id, attention_key,
        attention_kind, destination, headline, detail, artifact_ref
      ) VALUES (
        v_player.id, v_moment_id, 'clan_glory_reward', v_ledger_id::TEXT,
        'settlement', 'recognition', 'clan',
        'Glory Member reward: ' || v_assignment.reward_dna || ' DNA',
        'Your earned clan recognition is secured and recorded here.',
        'glory-reward:' || v_ledger_id
      )
      ON CONFLICT (player_id, source_type, source_id, attention_key) DO NOTHING;
    END IF;

    v_settled := v_settled + 1;
    v_total_dna := v_total_dna + v_assignment.reward_dna;
  END LOOP;

  RETURN jsonb_build_object(
    'settled', v_settled,
    'dna_awarded', v_total_dna,
    'cycle_index', p_cycle_index
  );
END;
$$;

REVOKE ALL ON FUNCTION settle_clan_glory_rewards(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION settle_clan_glory_rewards(BIGINT) TO service_role;

COMMENT ON FUNCTION settle_clan_glory_rewards(BIGINT) IS
  'Service-only, idempotent Glory settlement. Invoke after settle_clan_energy_battles; unique assignment/seat/holder ledger keys prevent duplicate cycle payout.';

COMMIT;
