-- Migration 013: Game Design v2 Phase 1
-- 1. Extraction banking: game_sessions.extracted records how a run ended
--    (exit portal = banked +25%, death = salvaged 60%).
-- 2. Stat flattening: compute_effective_stats returns base stats unchanged.
--    Generation becomes prestige-only data (collected_snakes.generation is
--    untouched and still displayed as "Gen N"); dynasty identity now lives
--    in the shared ruleset module (src/shared/game/rulesets.ts), not in
--    stat multipliers.

-- ============================================================================
-- 1. EXTRACTION OUTCOME COLUMN
-- ============================================================================

ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS extracted BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN game_sessions.extracted IS
  'Design v2: true when the run ended through the exit portal (banked +25% DNA); false when the snake died (60% salvage).';

-- ============================================================================
-- 2. FLATTEN compute_effective_stats (same signature - callers unbroken)
-- ============================================================================
-- Replaces the migration 006 body: drops the generation multiplier
-- (1 + (gen-1)*0.05) and the dynasty speed/size bonus branch. Base stats
-- pass through unchanged (rounded to 2 decimals as before). Generation and
-- dynasty parameters are kept so existing callers keep working; they no
-- longer affect the result.

CREATE OR REPLACE FUNCTION compute_effective_stats(
  p_base_stats JSONB,
  p_generation INT,
  p_dynasty_id UUID
) RETURNS JSONB AS $$
BEGIN
  -- Design v2: skill is the multiplier, strategy is the base.
  -- Stats are flat; generation is prestige, dynasty is a ruleset.
  RETURN jsonb_build_object(
    'speed', ROUND((p_base_stats->>'speed')::NUMERIC, 2),
    'size', ROUND((p_base_stats->>'size')::NUMERIC, 2),
    'hp', ROUND((p_base_stats->>'hp')::NUMERIC, 2)
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 3. DEPRECATION MARKERS (columns kept - API shape unchanged, math unused)
-- ============================================================================

COMMENT ON COLUMN dynasties.stat_bonus_type IS
  'Deprecated (Design v2 Phase 1): no longer consumed for stat or DNA math. Dynasty identity lives in the shared ruleset module.';

COMMENT ON COLUMN dynasties.stat_bonus_value IS
  'Deprecated (Design v2 Phase 1): no longer consumed for stat or DNA math. Dynasty identity lives in the shared ruleset module.';
