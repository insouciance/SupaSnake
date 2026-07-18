-- ============================================================================
-- Migration 025: The Analyst (Player Identity v1, Phase I4)
-- PLAYER_IDENTITY_V1.md section 9 - deterministic facts, narrated. The
-- plan-of-record is "Identity v1" (investigate-this-repo-it-rosy-charm).
--
-- 1. ai_insights (section 9.2/9.3): the generation CACHE for the five
--    artifacts - run_insight / archetype / weekly_digest / season_recall
--    / scout_narration. Owner is a player OR a clan (scout narrations
--    are clan-pair scoped) - CHECK enforces at least one. The UNIQUE
--    dedup index on (kind, scope_ref, COALESCE(player_id, clan_id)) is
--    the cost bound: a cached artifact is NEVER regenerated (upsert
--    races resolve by index collision, not app locking). model NULL =
--    the deterministic templated fallback produced the content.
--    content JSONB is the zod-validated {headline, body, tips, badge?}
--    artifact. RLS: select own-or-clan-member; ALL writes are
--    server-only (service role - no insert/update/delete policies).
-- 2. ai_usage_daily (section 9.3): the daily-token circuit breaker
--    ledger. Deny-all RLS; incremented atomically via record_ai_usage
--    (service-role only). The breaker trips to the templated fallback -
--    it NEVER errors a player-facing request.
-- 3. record_ai_usage(day, tokens): atomic increment returning the new
--    day total, so the narration layer records usage and reads the
--    budget position in one call.
-- 4. prune_run_events(days): the 90-day run_events retention promised
--    in 022 finally gets its mechanism (called by the daily
--    /api/analyst/cron). Only run_events is nulled - death_cause is
--    kept forever (section 9.5: it feeds Chronicle + archetypes).
-- 5. ARCHETYPE BADGES (sections 5.5/9.6): 9 badge definitions seeded -
--    the 8 detected archetypes plus The Hatchling. All epic,
--    season-stamped via render {"season":1}. The Hatchling def exists
--    for the Chronicle display of the <20-run fallback but is never
--    granted as inventory (section 9.6: unranked, not a badge) - the
--    season-end cron grants only the 8. Detection is deterministic
--    scoring in src/lib/analyst/facts.ts - the LLM narrates the
--    archetype, code CHOOSES it.
-- 6. rate_limits: the analyst insight surface gets its action
--    ('analyst', 30s in src/lib/server/rateLimit.ts - lockstep).
--
-- economy_transactions: this migration adds NO faucets and NO sinks
-- (section 10.1) - the Analyst reads game_sessions and never writes
-- economy tables. Run events remain structurally barred from payout
-- math (section 9.5).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. AI_INSIGHTS: the artifact cache (section 9.3)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  clan_id UUID REFERENCES clans(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('run_insight', 'archetype', 'weekly_digest', 'season_recall', 'scout_narration')),
  -- Scope of the artifact within its kind: session id (run_insight),
  -- ISO week-start date (weekly_digest, scout_narration), season seq
  -- (archetype, season_recall). Combined with the owner in the dedup
  -- index below.
  scope_ref TEXT NOT NULL,
  -- Hash of the fact sheet the artifact was generated from (audit +
  -- regeneration decisions are data, never guesswork)
  input_hash TEXT,
  -- NULL = deterministic templated fallback; else the OpenAI model id
  model TEXT,
  content JSONB NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_insights_owner_present CHECK (player_id IS NOT NULL OR clan_id IS NOT NULL)
);

-- The cost bound (section 9.3): one artifact per kind+scope+owner, ever.
-- Concurrent generations race to this index; losers read the winner.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_insights_dedup
  ON ai_insights (kind, scope_ref, COALESCE(player_id, clan_id));

CREATE INDEX IF NOT EXISTS idx_ai_insights_player
  ON ai_insights (player_id, kind, created_at DESC)
  WHERE player_id IS NOT NULL;

ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;

-- Read: your own artifacts, or your clan's (scout narrations).
-- clan_members.player_id is the AUTH uid (007) - matched to auth.uid()
-- directly, players bridge for player-owned rows.
DROP POLICY IF EXISTS ai_insights_select_own_or_clan ON ai_insights;
CREATE POLICY ai_insights_select_own_or_clan ON ai_insights
  FOR SELECT TO authenticated
  USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
    OR clan_id IN (SELECT clan_id FROM clan_members WHERE player_id = auth.uid())
  );

GRANT SELECT ON ai_insights TO authenticated;
-- No INSERT/UPDATE/DELETE policies and no write grants: generation is
-- server-authoritative (service role only).

COMMENT ON TABLE ai_insights IS
  'Analyst artifact cache (Identity v1 section 9). content = validated {headline, body, tips, badge?}; model NULL = templated fallback. Dedup index = the never-regenerate cost bound.';

-- ----------------------------------------------------------------------------
-- 2. AI_USAGE_DAILY: the circuit-breaker ledger (section 9.3)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ai_usage_daily (
  day DATE PRIMARY KEY,
  tokens BIGINT NOT NULL DEFAULT 0,
  calls INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE ai_usage_daily ENABLE ROW LEVEL SECURITY;
-- No policies: deny-all - only the service role reads or writes usage.

COMMENT ON TABLE ai_usage_daily IS
  'Daily OpenAI token ledger (Identity v1 section 9.3). ANALYST_DAILY_TOKEN_BUDGET breaker trips to the templated fallback - never errors.';

-- ----------------------------------------------------------------------------
-- 3. record_ai_usage: atomic increment + read-back. SERVICE-ROLE ONLY.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION record_ai_usage(p_day DATE, p_tokens INTEGER)
RETURNS BIGINT AS $$
  INSERT INTO ai_usage_daily (day, tokens, calls)
  VALUES (p_day, GREATEST(COALESCE(p_tokens, 0), 0), 1)
  ON CONFLICT (day) DO UPDATE
    SET tokens = ai_usage_daily.tokens + GREATEST(COALESCE(p_tokens, 0), 0),
        calls = ai_usage_daily.calls + 1
  RETURNING tokens;
$$ LANGUAGE sql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION record_ai_usage(DATE, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION record_ai_usage(DATE, INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION record_ai_usage(DATE, INTEGER) FROM authenticated;

-- ----------------------------------------------------------------------------
-- 4. prune_run_events: the 90-day retention from 022's contract
--    (section 9.5), executed daily by /api/analyst/cron. Floor of 30
--    days guards against a misconfigured caller ever stripping fresh
--    telemetry. death_cause is untouched - kept forever.
--    SERVICE-ROLE ONLY.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION prune_run_events(p_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE game_sessions
  SET run_events = NULL
  WHERE run_events IS NOT NULL
    AND ended_at IS NOT NULL
    AND ended_at < NOW() - make_interval(days => GREATEST(COALESCE(p_days, 90), 30));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION prune_run_events(INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION prune_run_events(INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION prune_run_events(INTEGER) FROM authenticated;

-- ----------------------------------------------------------------------------
-- 5. EMAIL DIGEST OPT-IN: per-player preference on player_settings (the
--    012 aim-prefs pattern - a column, not a table; rides the existing
--    select_own/update_own RLS + updated_at trigger). Default OFF:
--    the weekly digest email is strictly opt-in (registered players
--    with a linked email only - enforced in the cron path).
-- ----------------------------------------------------------------------------

ALTER TABLE player_settings
  ADD COLUMN IF NOT EXISTS email_digest_opt_in BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN player_settings.email_digest_opt_in IS
  'Weekly Analyst digest email via Resend (Identity v1 section 9.2). Strictly opt-in; guests can never receive it.';

-- ----------------------------------------------------------------------------
-- 6. ARCHETYPE BADGES (sections 5.5 / 9.6): 8 archetypes + The
--    Hatchling, epic, season-stamped in render. Granted (8 only) by the
--    season-end cron with source 'archetype'; detection lives in
--    src/lib/analyst/facts.ts (detectArchetype - keep in lockstep).
-- ----------------------------------------------------------------------------

INSERT INTO cosmetic_definitions (id, name, slot, rarity, season_seq, render) VALUES
  ('archetype_surgeon',   'The Surgeon',   'badge', 'epic', 1, '{"kind":"badge","glyph":"archetype","archetype":"surgeon","season":1,"source":"system"}'),
  ('archetype_daredevil', 'The Daredevil', 'badge', 'epic', 1, '{"kind":"badge","glyph":"archetype","archetype":"daredevil","season":1,"source":"system"}'),
  ('archetype_loyalist',  'The Loyalist',  'badge', 'epic', 1, '{"kind":"badge","glyph":"archetype","archetype":"loyalist","season":1,"source":"system"}'),
  ('archetype_polymath',  'The Polymath',  'badge', 'epic', 1, '{"kind":"badge","glyph":"archetype","archetype":"polymath","season":1,"source":"system"}'),
  ('archetype_alchemist', 'The Alchemist', 'badge', 'epic', 1, '{"kind":"badge","glyph":"archetype","archetype":"alchemist","season":1,"source":"system"}'),
  ('archetype_purist',    'The Purist',    'badge', 'epic', 1, '{"kind":"badge","glyph":"archetype","archetype":"purist","season":1,"source":"system"}'),
  ('archetype_redliner',  'The Redliner',  'badge', 'epic', 1, '{"kind":"badge","glyph":"archetype","archetype":"redliner","season":1,"source":"system"}'),
  ('archetype_metronome', 'The Metronome', 'badge', 'epic', 1, '{"kind":"badge","glyph":"archetype","archetype":"metronome","season":1,"source":"system"}'),
  ('archetype_hatchling', 'The Hatchling', 'badge', 'epic', 1, '{"kind":"badge","glyph":"archetype","archetype":"hatchling","season":1,"source":"system"}')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 7. RATE LIMITS: the on-demand insight surface gets its action
--    ('analyst', 30s in src/lib/server/rateLimit.ts - lockstep).
-- ----------------------------------------------------------------------------

ALTER TABLE rate_limits DROP CONSTRAINT IF EXISTS rate_limits_action_type_check;
ALTER TABLE rate_limits ADD CONSTRAINT rate_limits_action_type_check
  CHECK (action_type IN ('game_start', 'breeding', 'purchase', 'handle_check', 'handle_claim', 'records_refresh', 'analyst'));
