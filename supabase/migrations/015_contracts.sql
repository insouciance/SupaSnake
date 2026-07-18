-- Migration 015: Contracts (Design v2 section 7.3 - dailies rework)
--
-- Flat daily-login DNA is superseded: each day the player is OFFERED 3
-- contracts drawn from a 12-contract pool and PICKS 2 - objectives about
-- *how* you play, not *that* you showed up. Rewards: DNA + season-track XP
-- (~150 XP each, granted to the active battle pass season when one exists).
--
-- The 28-day calendar tables (003/009) stay in place: the login *streak*
-- multiplier is unchanged (013 retune) and milestone days convert to
-- cosmetic/reroll-token gifts at Phase 3. The calendar's flat-DNA claim
-- flow is deprecated as a faucet - the daily modal becomes the contract
-- board (see src/components/engagement/ContractsBoard.tsx).
--
-- Progress is computed SERVER-SIDE from game_sessions rows of the contract's
-- UTC day (extraction/food/dynasty/duration facts already live on sessions;
-- migration 013 added `extracted`). Combo/mutation-dependent contracts are
-- seeded inactive (active = false) until Phase 2A lands the mutations JSONB
-- on game_sessions; clan-research/Gauntlet/anomaly contracts stay inactive
-- until Phase 4. Flipping `active` is the only change needed to enable them.

-- ============================================================================
-- 1. CONTRACT DEFINITIONS - the launch pool (x12)
-- ============================================================================

CREATE TABLE IF NOT EXISTS contract_definitions (
  id TEXT PRIMARY KEY,
  contract_type TEXT NOT NULL CHECK (contract_type IN (
    'extract_n',          -- bank N extractions today
    'food_n_single_run',  -- reach N foods in one run (optional dynasty)
    'extract_tier',       -- bank a run at/above a speed tier (dynasty, min_foods)
    'combo_x',            -- hit a xN combo (Phase 2A: needs mutation/combo facts)
    'mutations_held',     -- finish a run holding N mutations (Phase 2A)
    'extract_pure',       -- bank an N-food run with zero mutations (Phase 2A)
    'food_total',         -- eat N foods total across today's runs
    'clan_contribute',    -- contribute N DNA to clan research (Phase 4)
    'gauntlet_runs',      -- post N counted Gauntlet runs (Phase 4)
    'extract_fast',       -- bank within N seconds of run start
    'extract_nth_portal', -- pass portals, bank a later one - one run
    'anomaly_run'         -- complete N anomaly runs (Phase 4)
  )),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  reward_dna INTEGER NOT NULL DEFAULT 0 CHECK (reward_dna >= 0),
  reward_energy INTEGER NOT NULL DEFAULT 0 CHECK (reward_energy >= 0),
  reward_xp INTEGER NOT NULL DEFAULT 150 CHECK (reward_xp >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Launch pool per GAME_DESIGN_V2.md section 7.3. Two contracts a day at
-- these values lands ~800-1,000 DNA - approximately today's daily login +
-- first-win faucet (economically neutral, behaviorally superior).
INSERT INTO contract_definitions
  (id, contract_type, name, description, params, reward_dna, reward_energy, reward_xp, active, sort_order)
VALUES
  ('banker', 'extract_n', 'Banker',
   'Bank 3 extractions',
   '{"count": 3}', 400, 0, 150, true, 1),

  ('deep_run', 'food_n_single_run', 'Deep Run',
   'Reach 60 foods in one PRIMAL run',
   '{"foods": 60, "dynasty": "PRIMAL"}', 500, 0, 150, true, 2),

  -- CYBER speed tier = floor(foods/5) capped at 4 (rulesets.ts), so a
  -- tier-4 bank is provable from session facts as extracted at >= 20 foods.
  ('redline', 'extract_tier', 'Redline',
   'Bank a CYBER run from tier 4',
   '{"tier": 4, "min_foods": 20, "dynasty": "CYBER"}', 500, 0, 150, true, 3),

  -- Inactive until Phase 2A (combo facts on game_sessions) + COSMIC Flux.
  ('chain_reaction', 'combo_x', 'Chain Reaction',
   'Hit a x1.8+ combo in COSMIC',
   '{"combo": 1.8, "dynasty": "COSMIC"}', 500, 0, 150, false, 4),

  -- Inactive until Phase 2A (mutations JSONB on game_sessions).
  ('mutant', 'mutations_held', 'Mutant',
   'Finish a run holding 3 mutations',
   '{"count": 3}', 450, 0, 150, false, 5),

  -- Inactive until Phase 2A: "zero mutations" is only a meaningful
  -- constraint (and only provable) once the mutations fact exists.
  ('purist', 'extract_pure', 'Purist',
   'Bank a 30-food run with zero mutations',
   '{"min_foods": 30, "mutations": 0}', 450, 0, 150, false, 6),

  ('collector', 'food_total', 'Collector',
   'Eat 120 foods total',
   '{"foods": 120}', 350, 0, 150, true, 7),

  -- Inactive until Phase 4 (clan research tree).
  ('tither', 'clan_contribute', 'Tither',
   'Contribute 200 DNA to clan research',
   '{"dna": 200}', 300, 0, 150, false, 8),

  -- Inactive until Phase 4 (Gauntlet); scored-window days only.
  ('gauntlet_duty', 'gauntlet_runs', 'Gauntlet Duty',
   'Post 2 counted Gauntlet runs',
   '{"count": 2}', 500, 0, 150, false, 9),

  ('sprinter', 'extract_fast', 'Sprinter',
   'Bank within 4 minutes of run start',
   '{"max_seconds": 240}', 400, 0, 150, true, 10),

  -- Portal spawn cadence: first at 15 foods, then every 12 +/- 4 (jittered,
  -- rulesets.ts). Per-portal passes are not a session fact yet, so the
  -- server proves "banked the 4th portal or later" conservatively: a bank
  -- at >= 15 + 3*16 = 63 foods guarantees at least 3 portals were passed
  -- under worst-case jitter. Never over-grants; tightens when a portal
  -- counter lands on sessions.
  ('nerve', 'extract_nth_portal', 'Nerve',
   'Pass 3 portals, bank the 4th - one run',
   '{"portals": 4, "min_foods_proof": 63}', 600, 0, 150, true, 11),

  -- Inactive until Phase 4 (weekly Anomaly boards).
  ('anomaly_tourist', 'anomaly_run', 'Anomaly Tourist',
   'Complete 1 anomaly run',
   '{"count": 1}', 400, 0, 150, false, 12)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. PLAYER CONTRACTS - one row per offered contract per day
-- ============================================================================

CREATE TABLE IF NOT EXISTS player_contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  contract_date DATE NOT NULL,
  contract_id TEXT NOT NULL REFERENCES contract_definitions(id),
  offered_slot INTEGER NOT NULL CHECK (offered_slot BETWEEN 1 AND 3),
  picked BOOLEAN NOT NULL DEFAULT false,
  picked_at TIMESTAMPTZ,
  progress JSONB NOT NULL DEFAULT '{"current": 0, "target": 0}'::jsonb,
  completed_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(player_id, contract_date, contract_id),
  UNIQUE(player_id, contract_date, offered_slot)
);

CREATE INDEX IF NOT EXISTS idx_player_contracts_player_date
  ON player_contracts(player_id, contract_date DESC);

-- ============================================================================
-- 3. PROGRESS EVALUATION - server recompute from game_sessions (UTC day)
-- ============================================================================
-- Only validated, ended sessions count (the exact-recompute validator flags
-- never pay - same principle as the DNA grant path). Dynasty is resolved
-- through snake_variant_id -> snake_variants.dynasty_id -> dynasties.name.

CREATE OR REPLACE FUNCTION refresh_contract_progress(p_player_id UUID, p_date DATE)
RETURNS VOID AS $$
DECLARE
  v_row RECORD;
  v_current INTEGER;
  v_target INTEGER;
  v_dynasty TEXT;
  v_day_start TIMESTAMPTZ := (p_date::timestamp AT TIME ZONE 'UTC');
  v_day_end TIMESTAMPTZ := ((p_date + 1)::timestamp AT TIME ZONE 'UTC');
BEGIN
  FOR v_row IN
    SELECT pc.id AS pc_id, cd.contract_type, cd.params
    FROM player_contracts pc
    JOIN contract_definitions cd ON cd.id = pc.contract_id
    WHERE pc.player_id = p_player_id
      AND pc.contract_date = p_date
      AND pc.picked
      AND pc.claimed_at IS NULL
  LOOP
    v_dynasty := v_row.params->>'dynasty';
    v_current := 0;
    v_target := 1;

    CASE v_row.contract_type
      WHEN 'extract_n' THEN
        -- Banker: banked extractions today
        v_target := COALESCE((v_row.params->>'count')::int, 1);
        SELECT COUNT(*)::int INTO v_current
        FROM game_sessions gs
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end
          AND gs.extracted;

      WHEN 'food_n_single_run' THEN
        -- Deep Run: best single-run food count (optionally dynasty-scoped)
        v_target := COALESCE((v_row.params->>'foods')::int, 1);
        SELECT COALESCE(MAX(gs.foods_collected), 0)::int INTO v_current
        FROM game_sessions gs
        LEFT JOIN snake_variants sv ON sv.id = gs.snake_variant_id
        LEFT JOIN dynasties d ON d.id = sv.dynasty_id
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end
          AND (v_dynasty IS NULL OR d.name = v_dynasty);

      WHEN 'extract_tier' THEN
        -- Redline: best BANKED food count in the dynasty; tier is a pure
        -- function of foods (floor(n/5) capped 4), so min_foods proves it.
        v_target := COALESCE((v_row.params->>'min_foods')::int, 1);
        SELECT COALESCE(MAX(gs.foods_collected), 0)::int INTO v_current
        FROM game_sessions gs
        LEFT JOIN snake_variants sv ON sv.id = gs.snake_variant_id
        LEFT JOIN dynasties d ON d.id = sv.dynasty_id
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end
          AND gs.extracted
          AND (v_dynasty IS NULL OR d.name = v_dynasty);

      WHEN 'food_total' THEN
        -- Collector: total foods across today's runs
        v_target := COALESCE((v_row.params->>'foods')::int, 1);
        SELECT COALESCE(SUM(gs.foods_collected), 0)::int INTO v_current
        FROM game_sessions gs
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end;

      WHEN 'extract_fast' THEN
        -- Sprinter: any bank within max_seconds of run start
        v_target := 1;
        SELECT COUNT(*)::int INTO v_current
        FROM game_sessions gs
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end
          AND gs.extracted
          AND gs.duration_seconds <= COALESCE((v_row.params->>'max_seconds')::int, 240);

      WHEN 'extract_nth_portal' THEN
        -- Nerve: conservative proof via worst-case portal cadence (see seed)
        v_target := 1;
        SELECT COUNT(*)::int INTO v_current
        FROM game_sessions gs
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end
          AND gs.extracted
          AND gs.foods_collected >= COALESCE((v_row.params->>'min_foods_proof')::int, 63);

      ELSE
        -- combo_x / mutations_held / extract_pure / clan_contribute /
        -- gauntlet_runs / anomaly_run: facts not on game_sessions yet.
        -- These definitions are seeded inactive and are never offered;
        -- progress stays 0 defensively if one is ever force-picked.
        v_current := 0;
        v_target := 1;
    END CASE;

    UPDATE player_contracts pc SET
      progress = jsonb_build_object(
        'current', LEAST(v_current, v_target),
        'target', v_target
      ),
      completed_at = CASE
        WHEN v_current >= v_target AND pc.completed_at IS NULL THEN NOW()
        ELSE pc.completed_at
      END
    WHERE pc.id = v_row.pc_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. OFFER - deterministic 3-of-pool per player per UTC day (lazy, idempotent)
-- ============================================================================
-- Seeded by md5(player_id || date || contract_id): stable for the whole day,
-- different across players and days, no state to store. Mirrored in
-- src/app/api/contracts/utils.ts (selectDailyOffers) for tests.

CREATE OR REPLACE FUNCTION offer_daily_contracts(p_player_id UUID)
RETURNS TABLE (
  contract_id TEXT,
  contract_type TEXT,
  name TEXT,
  description TEXT,
  params JSONB,
  reward_dna INTEGER,
  reward_energy INTEGER,
  reward_xp INTEGER,
  offered_slot INTEGER,
  picked BOOLEAN,
  progress JSONB,
  completed_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ
) AS $$
DECLARE
  v_date DATE := CURRENT_DATE;
BEGIN
  PERFORM 1 FROM players WHERE id = p_player_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM player_contracts pc
    WHERE pc.player_id = p_player_id AND pc.contract_date = v_date
  ) THEN
    INSERT INTO player_contracts (player_id, contract_date, contract_id, offered_slot)
    SELECT p_player_id, v_date, t.id, t.slot
    FROM (
      SELECT cd.id,
             ROW_NUMBER() OVER (
               ORDER BY md5(p_player_id::text || v_date::text || cd.id), cd.id
             )::int AS slot
      FROM contract_definitions cd
      WHERE cd.active
    ) t
    WHERE t.slot <= 3
    ON CONFLICT (player_id, contract_date, contract_id) DO NOTHING;
  END IF;

  PERFORM refresh_contract_progress(p_player_id, v_date);

  RETURN QUERY
  SELECT pc.contract_id, cd.contract_type, cd.name, cd.description, cd.params,
         cd.reward_dna, cd.reward_energy, cd.reward_xp,
         pc.offered_slot, pc.picked, pc.progress, pc.completed_at, pc.claimed_at
  FROM player_contracts pc
  JOIN contract_definitions cd ON cd.id = pc.contract_id
  WHERE pc.player_id = p_player_id AND pc.contract_date = v_date
  ORDER BY pc.offered_slot;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. PICK - up to 2 of today's 3 offers, cumulative, irreversible
-- ============================================================================

CREATE OR REPLACE FUNCTION pick_contracts(p_player_id UUID, p_contract_ids TEXT[])
RETURNS TABLE (
  contract_id TEXT,
  contract_type TEXT,
  name TEXT,
  description TEXT,
  params JSONB,
  reward_dna INTEGER,
  reward_energy INTEGER,
  reward_xp INTEGER,
  offered_slot INTEGER,
  picked BOOLEAN,
  progress JSONB,
  completed_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ
) AS $$
DECLARE
  v_date DATE := CURRENT_DATE;
  v_count INTEGER := COALESCE(array_length(p_contract_ids, 1), 0);
  v_already INTEGER;
  v_pickable INTEGER;
BEGIN
  IF v_count < 1 OR v_count > 2 THEN
    RAISE EXCEPTION 'Pick 1 or 2 contracts';
  END IF;
  IF (SELECT COUNT(DISTINCT x) FROM unnest(p_contract_ids) x) <> v_count THEN
    RAISE EXCEPTION 'Duplicate contract ids';
  END IF;

  -- Row-lock today's board so concurrent picks serialize
  PERFORM 1 FROM player_contracts pc
  WHERE pc.player_id = p_player_id AND pc.contract_date = v_date
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No contracts offered today';
  END IF;

  SELECT COUNT(*)::int INTO v_already
  FROM player_contracts pc
  WHERE pc.player_id = p_player_id AND pc.contract_date = v_date AND pc.picked;

  IF v_already + v_count > 2 THEN
    RAISE EXCEPTION 'Pick limit reached (2 per day)';
  END IF;

  SELECT COUNT(*)::int INTO v_pickable
  FROM player_contracts pc
  WHERE pc.player_id = p_player_id AND pc.contract_date = v_date
    AND pc.contract_id = ANY(p_contract_ids)
    AND NOT pc.picked;

  IF v_pickable <> v_count THEN
    RAISE EXCEPTION 'Contract not offered today';
  END IF;

  UPDATE player_contracts pc SET picked = true, picked_at = NOW()
  WHERE pc.player_id = p_player_id AND pc.contract_date = v_date
    AND pc.contract_id = ANY(p_contract_ids);

  PERFORM refresh_contract_progress(p_player_id, v_date);

  RETURN QUERY
  SELECT pc.contract_id, cd.contract_type, cd.name, cd.description, cd.params,
         cd.reward_dna, cd.reward_energy, cd.reward_xp,
         pc.offered_slot, pc.picked, pc.progress, pc.completed_at, pc.claimed_at
  FROM player_contracts pc
  JOIN contract_definitions cd ON cd.id = pc.contract_id
  WHERE pc.player_id = p_player_id AND pc.contract_date = v_date
  ORDER BY pc.offered_slot;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. CLAIM - re-evaluate, then pay (row-locked, idempotent per contract)
-- ============================================================================
-- Follows the claim_daily_reward pattern (009): FOR UPDATE lock, energy
-- capped at max_energy (purchased overfill preserved), every grant logged
-- to economy_transactions under the 'daily_reward' source. Season XP goes
-- to the active battle pass season when one exists (section 7.2: the free
-- track's XP sources gain contract completion).

CREATE OR REPLACE FUNCTION claim_contract(p_player_id UUID, p_contract_id TEXT)
RETURNS TABLE (
  contract_id TEXT,
  dna_granted INTEGER,
  energy_granted INTEGER,
  xp_granted INTEGER
) AS $$
DECLARE
  v_date DATE := CURRENT_DATE;
  v_pc player_contracts%ROWTYPE;
  v_def contract_definitions%ROWTYPE;
  v_player RECORD;
  v_season RECORD;
  v_energy_grant INTEGER;
  v_new_dna INTEGER;
  v_xp INTEGER := 0;
BEGIN
  SELECT * INTO v_pc FROM player_contracts pc
  WHERE pc.player_id = p_player_id
    AND pc.contract_date = v_date
    AND pc.contract_id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not offered today';
  END IF;
  IF NOT v_pc.picked THEN
    RAISE EXCEPTION 'Contract not picked';
  END IF;
  IF v_pc.claimed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Contract already claimed';
  END IF;

  -- Server recompute at claim time - never trust cached progress
  PERFORM refresh_contract_progress(p_player_id, v_date);
  SELECT * INTO v_pc FROM player_contracts pc WHERE pc.id = v_pc.id;

  IF v_pc.completed_at IS NULL THEN
    RAISE EXCEPTION 'Contract not complete';
  END IF;

  SELECT * INTO v_def FROM contract_definitions cd WHERE cd.id = p_contract_id;

  SELECT * INTO v_player FROM players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  v_energy_grant := LEAST(
    v_def.reward_energy,
    GREATEST(0, COALESCE(v_player.max_energy, 5) - v_player.energy)
  );

  UPDATE players
  SET dna = dna + v_def.reward_dna,
      energy = energy + v_energy_grant
  WHERE id = p_player_id
  RETURNING dna INTO v_new_dna;

  IF v_def.reward_dna > 0 THEN
    INSERT INTO economy_transactions (player_id, resource_type, amount, balance_after, source_type, metadata)
    VALUES (p_player_id, 'dna', v_def.reward_dna, v_new_dna, 'daily_reward',
            jsonb_build_object('contract', p_contract_id, 'contract_date', v_date));
  END IF;
  IF v_energy_grant > 0 THEN
    INSERT INTO economy_transactions (player_id, resource_type, amount, balance_after, source_type, metadata)
    VALUES (p_player_id, 'energy', v_energy_grant, v_player.energy + v_energy_grant, 'daily_reward',
            jsonb_build_object('contract', p_contract_id, 'contract_date', v_date));
  END IF;

  -- Season-track XP: only when a season is live; nothing accrues (and
  -- nothing is lost - contracts remain daily) outside seasons.
  SELECT * INTO v_season FROM battle_pass_seasons s
  WHERE s.is_active AND NOW() >= s.starts_at AND NOW() < s.ends_at
  ORDER BY s.season_number DESC
  LIMIT 1;

  IF FOUND THEN
    v_xp := v_def.reward_xp;
    INSERT INTO player_battle_pass (player_id, season_id, current_xp, current_level)
    VALUES (
      p_player_id, v_season.id, v_xp,
      LEAST(v_season.max_level, 1 + v_xp / v_season.xp_per_level)
    )
    ON CONFLICT (player_id, season_id) DO UPDATE SET
      current_xp = player_battle_pass.current_xp + v_xp,
      current_level = LEAST(
        v_season.max_level,
        1 + (player_battle_pass.current_xp + v_xp) / v_season.xp_per_level
      ),
      updated_at = NOW();
  END IF;

  UPDATE player_contracts pc SET claimed_at = NOW() WHERE pc.id = v_pc.id;

  RETURN QUERY SELECT p_contract_id, v_def.reward_dna, v_energy_grant, v_xp;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE contract_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contract_definitions_public_read ON contract_definitions;
CREATE POLICY contract_definitions_public_read ON contract_definitions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS player_contracts_select_own ON player_contracts;
CREATE POLICY player_contracts_select_own ON player_contracts
  FOR SELECT USING (player_id IN (SELECT id FROM players WHERE user_id = auth.uid()));

-- All writes go through the SECURITY DEFINER RPCs above (service role in
-- the API layer); no client-side insert/update policies on purpose.
