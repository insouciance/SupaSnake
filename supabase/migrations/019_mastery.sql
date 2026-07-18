-- ============================================================================
-- Migration 019: Per-dynasty Mastery (Design v2 section 7.1)
-- GAME_DESIGN_V2.md 7.1 - horizontal, permanent, per-dynasty tracks fed
-- exclusively by banked DNA: extracted runs grant floor(raw x 1.25) XP
-- (pre-account-multiplier, so streaks never inflate mastery); deaths and
-- Free Play grant nothing.
--
-- 1. player_mastery: xp only is stored; the level is DERIVED on read via
--    level_for_xp(xp) (IMMUTABLE) - no trigger, no drift, the curve lives
--    in exactly two places kept in lockstep: here and
--    src/shared/game/mastery.ts (levelForXp).
-- 2. level_for_xp(xp): the doc's curve table - XP to next level
--    M1 1,000 / M2 2,000 / M3 4,000 / M4 7,000 / M5 11,000 / M6 16,000 /
--    M7 22,000 / M8 29,000 / M9 37,000 / M10 46,000 (cumulative 175,000).
-- 3. grant_mastery_xp RPC: upsert-add, returns the new total + level.
--    Service-role only (SECURITY DEFINER, called by the session API).
-- 4. mastery_mutations catalog: which mutation each dynasty unlocks at
--    M3/M6/M9 - mirrors MASTERY_MUTATIONS in src/shared/game/mastery.ts.
--    (Mutation ids are TEXT app-side ids; definitions live in
--    src/shared/game/mutations.ts.)
--
-- The API layer is pre-019-safe: it treats a missing table/function as
-- "mastery not live yet" (level 0, base pool, no XP grant) and never fails
-- a session request over it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. LEVEL CURVE: level_for_xp (IMMUTABLE) - computed on read, never stored
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION level_for_xp(p_xp BIGINT)
RETURNS INTEGER AS $$
  SELECT CASE
    WHEN COALESCE(p_xp, 0) >= 175000 THEN 10
    WHEN p_xp >= 129000 THEN 9
    WHEN p_xp >=  92000 THEN 8
    WHEN p_xp >=  63000 THEN 7
    WHEN p_xp >=  41000 THEN 6
    WHEN p_xp >=  25000 THEN 5
    WHEN p_xp >=  14000 THEN 4
    WHEN p_xp >=   7000 THEN 3
    WHEN p_xp >=   3000 THEN 2
    WHEN p_xp >=   1000 THEN 1
    ELSE 0
  END;
$$ LANGUAGE sql IMMUTABLE;

-- ----------------------------------------------------------------------------
-- 2. PLAYER_MASTERY: xp per (player, dynasty); level derived on read
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS player_mastery (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  dynasty TEXT NOT NULL CHECK (dynasty IN ('PRIMAL', 'CYBER', 'COSMIC')),
  xp BIGINT NOT NULL DEFAULT 0 CHECK (xp >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, dynasty)
);

ALTER TABLE player_mastery ENABLE ROW LEVEL SECURITY;

-- Players read their own mastery; all writes go through the service role
-- (the session API grants XP - server authority, like DNA).
DROP POLICY IF EXISTS player_mastery_select_own ON player_mastery;
CREATE POLICY player_mastery_select_own ON player_mastery
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 3. GRANT RPC: upsert-add banked XP, return the new total + level
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION grant_mastery_xp(
  p_player_id UUID,
  p_dynasty TEXT,
  p_xp BIGINT
) RETURNS TABLE (xp_after BIGINT, level_after INTEGER) AS $$
DECLARE
  v_xp BIGINT;
BEGIN
  IF p_dynasty NOT IN ('PRIMAL', 'CYBER', 'COSMIC') THEN
    RAISE EXCEPTION 'Invalid dynasty %', p_dynasty;
  END IF;
  IF COALESCE(p_xp, 0) <= 0 THEN
    RAISE EXCEPTION 'Mastery XP grant must be positive (got %)', p_xp;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM players WHERE id = p_player_id) THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  INSERT INTO player_mastery (player_id, dynasty, xp, updated_at)
  VALUES (p_player_id, p_dynasty, p_xp, NOW())
  ON CONFLICT (player_id, dynasty)
  DO UPDATE SET xp = player_mastery.xp + EXCLUDED.xp, updated_at = NOW()
  RETURNING player_mastery.xp INTO v_xp;

  RETURN QUERY SELECT v_xp, level_for_xp(v_xp);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 4. MASTERY MUTATION CATALOG: the M3/M6/M9 pool additions per dynasty
--    (section 7.1: "+1 mutation into this dynasty's offer pool").
--    Mirrors MASTERY_MUTATIONS in src/shared/game/mastery.ts - lockstep.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS mastery_mutations (
  dynasty TEXT NOT NULL CHECK (dynasty IN ('PRIMAL', 'CYBER', 'COSMIC')),
  mastery_level INTEGER NOT NULL CHECK (mastery_level IN (3, 6, 9)),
  mutation_id TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (dynasty, mastery_level),
  UNIQUE (mutation_id)
);

ALTER TABLE mastery_mutations ENABLE ROW LEVEL SECURITY;

-- Catalog data: readable by everyone, written only by the service role
DROP POLICY IF EXISTS mastery_mutations_select_all ON mastery_mutations;
CREATE POLICY mastery_mutations_select_all ON mastery_mutations
  FOR SELECT USING (true);

INSERT INTO mastery_mutations (dynasty, mastery_level, mutation_id, name) VALUES
  ('PRIMAL', 3, 'deep_roots',        'Deep Roots'),
  ('PRIMAL', 6, 'ancient_grove',     'Ancient Grove'),
  ('PRIMAL', 9, 'tectonic_patience', 'Tectonic Patience'),
  ('CYBER',  3, 'redline_dividend',  'Redline Dividend'),
  ('CYBER',  6, 'afterburner',       'Afterburner'),
  ('CYBER',  9, 'overclock_harvest', 'Overclock Harvest'),
  ('COSMIC', 3, 'starweaver',        'Starweaver'),
  ('COSMIC', 6, 'gravity_well',      'Gravity Well'),
  ('COSMIC', 9, 'event_horizon',     'Event Horizon')
ON CONFLICT (dynasty, mastery_level) DO NOTHING;
