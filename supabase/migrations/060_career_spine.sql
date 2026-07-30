-- =============================================================================
-- Migration 060: Career Spine — durable run impact, attention and lineage memory
-- =============================================================================
--
-- Progress and rewards remain server-authoritative and settle immediately.
-- This migration records what settlement already secured so presentation may
-- be replayed after a dropped response or on another device. Nothing here is a
-- claim path. The Daily Take remains the game's only literal collect action.
--
-- The lineage archive deliberately survives a voluntary exact-refund downgrade.
-- A refunded specimen is `retired_refunded`: historical, never owned, never
-- equippable, and never confused with the player's active highest generation.

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Retired Season chapter: secure reached identity tiers, remove claim debt
-- -----------------------------------------------------------------------------
--
-- Contracts were the only Season XP writer and are now service-disabled. The
-- track is therefore a read-only historical chapter. Preserve every existing
-- receipt, atomically secure every reached free tier plus every entitled
-- premium tier, and keep the old `claimed_at` spelling only as a legacy schema
-- name. This grants exactly the identity inventory the old claim RPC granted;
-- it never grants DNA, Energy, power, or a second copy of an owned cosmetic.

CREATE OR REPLACE FUNCTION secure_reached_season_entitlements(
  p_player_id UUID,
  p_season_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_pass player_battle_pass%ROWTYPE;
  v_has_premium BOOLEAN := FALSE;
  v_identity_grants INTEGER := 0;
  v_secured_receipts INTEGER := 0;
BEGIN
  SELECT * INTO v_pass
  FROM player_battle_pass pbp
  WHERE pbp.player_id = p_player_id AND pbp.season_id = p_season_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'identity_grants', 0,
      'secured_receipts', 0,
      'premium_entitled', false
    );
  END IF;

  v_has_premium := v_pass.is_premium OR has_premium(p_player_id);

  IF EXISTS (
    SELECT 1
    FROM battle_pass_tiers t
    LEFT JOIN cosmetic_definitions cd ON cd.id = t.reward_id
    WHERE t.season_id = p_season_id
      AND t.level <= v_pass.current_level
      AND (NOT t.is_premium OR v_has_premium)
      AND t.reward_type IN ('cosmetic', 'title')
      AND (t.reward_id IS NULL OR cd.id IS NULL)
  ) THEN
    RAISE EXCEPTION 'INVALID_SEASON_IDENTITY_TIER';
  END IF;

  -- Preserve the existing goodwill rule: once a current subscriber reaches
  -- this chapter, its premium identity rewards remain theirs after a lapse.
  IF v_has_premium AND NOT v_pass.is_premium THEN
    UPDATE player_battle_pass
    SET is_premium = TRUE,
        premium_purchased_at = COALESCE(premium_purchased_at, NOW()),
        updated_at = NOW()
    WHERE id = v_pass.id;
  END IF;

  INSERT INTO player_cosmetics(player_id, cosmetic_id, source)
  SELECT p_player_id, t.reward_id, 'season_track'
  FROM battle_pass_tiers t
  JOIN cosmetic_definitions cd ON cd.id = t.reward_id
  WHERE t.season_id = p_season_id
    AND t.level <= v_pass.current_level
    AND (NOT t.is_premium OR v_has_premium)
    AND t.reward_type IN ('cosmetic', 'title')
    AND t.reward_id IS NOT NULL
  ON CONFLICT (player_id, cosmetic_id) DO NOTHING;
  GET DIAGNOSTICS v_identity_grants = ROW_COUNT;

  INSERT INTO player_battle_pass_claims(player_id, season_id, tier_id)
  SELECT p_player_id, p_season_id, t.id
  FROM battle_pass_tiers t
  JOIN cosmetic_definitions cd ON cd.id = t.reward_id
  WHERE t.season_id = p_season_id
    AND t.level <= v_pass.current_level
    AND (NOT t.is_premium OR v_has_premium)
    AND t.reward_type IN ('cosmetic', 'title')
    AND t.reward_id IS NOT NULL
  ON CONFLICT (player_id, tier_id) DO NOTHING;
  GET DIAGNOSTICS v_secured_receipts = ROW_COUNT;

  RETURN jsonb_build_object(
    'identity_grants', v_identity_grants,
    'secured_receipts', v_secured_receipts,
    'premium_entitled', v_has_premium
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION secure_reached_season_entitlements(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION secure_reached_season_entitlements(UUID, UUID)
  TO service_role;

-- There are no live Season XP sources, but premium entitlement can still be
-- activated after this migration. Keep that legitimate identity unlock (and
-- any future server-side level repair) automatic instead of recreating claim
-- debt. The depth guard prevents the premium-goodwill update above from
-- recursively settling the same row twice.
CREATE OR REPLACE FUNCTION auto_secure_reached_season_entitlements()
RETURNS TRIGGER AS $$
BEGIN
  IF pg_trigger_depth() = 1 THEN
    PERFORM secure_reached_season_entitlements(NEW.player_id, NEW.season_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION auto_secure_reached_season_entitlements()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS player_battle_pass_secure_after_insert ON player_battle_pass;
CREATE TRIGGER player_battle_pass_secure_after_insert
AFTER INSERT ON player_battle_pass
FOR EACH ROW EXECUTE FUNCTION auto_secure_reached_season_entitlements();

DROP TRIGGER IF EXISTS player_battle_pass_secure_after_progress ON player_battle_pass;
CREATE TRIGGER player_battle_pass_secure_after_progress
AFTER UPDATE OF current_level, is_premium ON player_battle_pass
FOR EACH ROW EXECUTE FUNCTION auto_secure_reached_season_entitlements();

DO $$
DECLARE
  v_pass RECORD;
BEGIN
  FOR v_pass IN
    SELECT pbp.player_id, pbp.season_id
    FROM player_battle_pass pbp
    JOIN battle_pass_seasons bps ON bps.id = pbp.season_id
    WHERE bps.season_number = 1
  LOOP
    PERFORM secure_reached_season_entitlements(v_pass.player_id, v_pass.season_id);
  END LOOP;
END $$;

-- Rolling-deploy bridge for the previous application. The retired POST path
-- can still call this service-only function while migration 060 is live but
-- before the new application is promoted. It secures all supported identity
-- tiers atomically and returns one already-secured tier in the old response
-- shape; it never creates player claim debt or mints a retired reward.
CREATE OR REPLACE FUNCTION claim_season_tier(
  p_player_id UUID,
  p_level INTEGER
) RETURNS JSONB AS $$
DECLARE
  v_tier RECORD;
BEGIN
  SELECT t.id, t.season_id, t.level, t.is_premium, t.reward_type,
         t.reward_id, t.reward_amount
  INTO v_tier
  FROM player_battle_pass pbp
  JOIN battle_pass_seasons bps ON bps.id = pbp.season_id
  JOIN battle_pass_tiers t ON t.season_id = pbp.season_id
  JOIN cosmetic_definitions cd ON cd.id = t.reward_id
  WHERE pbp.player_id = p_player_id
    AND bps.is_active
    AND NOW() >= bps.starts_at
    AND NOW() < bps.ends_at
    AND pbp.current_level >= p_level
    AND t.level = p_level
    AND t.reward_type IN ('cosmetic', 'title')
    AND t.reward_id IS NOT NULL
    AND (NOT t.is_premium OR pbp.is_premium OR has_premium(p_player_id))
  ORDER BY t.is_premium ASC, t.id
  LIMIT 1;

  IF NOT FOUND THEN RAISE EXCEPTION 'NO_SUPPORTED_TIER_AT_LEVEL'; END IF;
  PERFORM secure_reached_season_entitlements(p_player_id, v_tier.season_id);

  RETURN jsonb_build_object(
    'level', v_tier.level,
    'is_premium', v_tier.is_premium,
    'reward_type', v_tier.reward_type,
    'reward_id', v_tier.reward_id,
    'reward_amount', v_tier.reward_amount,
    'reroll_tokens', 0,
    'secured', true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION claim_season_tier(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_season_tier(UUID, INTEGER) TO service_role;

COMMENT ON TABLE player_battle_pass_claims IS
  'Immutable auto-settlement receipts for reached season tiers. No player claim action remains.';
COMMENT ON COLUMN player_battle_pass_claims.claimed_at IS
  'Legacy column name: the timestamp at which this reached tier became secured automatically.';

-- Identity reads are mediated by server routes. The historical public view
-- includes auth UUIDs solely so trusted roster code can bridge id spaces;
-- exposing the raw view or batch RPC directly would leak those identifiers.
REVOKE SELECT ON player_identity_view FROM PUBLIC, anon, authenticated;
GRANT SELECT ON player_identity_view TO service_role;
REVOKE ALL ON FUNCTION get_player_identities(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_player_identities(UUID[]) TO service_role;

-- -----------------------------------------------------------------------------
-- 1. Canonical versioned receipt (one immutable answer per settled session)
-- -----------------------------------------------------------------------------

CREATE TABLE run_impact_receipts (
  session_id UUID PRIMARY KEY REFERENCES game_sessions(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  version SMALLINT NOT NULL CHECK (version > 0),
  envelope JSONB NOT NULL CHECK (jsonb_typeof(envelope) = 'object'),
  settled_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT run_impact_receipt_player_session UNIQUE (player_id, session_id),
  CONSTRAINT run_impact_receipt_session_matches CHECK (
    envelope ->> 'sessionId' = session_id::TEXT
  ),
  CONSTRAINT run_impact_receipt_version_matches CHECK (
    (envelope ->> 'version')::INTEGER = version
  )
);

CREATE INDEX run_impact_receipts_player_recent_idx
  ON run_impact_receipts(player_id, settled_at DESC);

ALTER TABLE run_impact_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY run_impact_receipts_select_own ON run_impact_receipts
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

COMMENT ON TABLE run_impact_receipts IS
  'Canonical, immutable post-settlement recognition envelope. Rewards are already secured; this row makes their presentation recoverable and cross-device.';

-- -----------------------------------------------------------------------------
-- 2. Meaningful permanent moments and explicit attention state
-- -----------------------------------------------------------------------------

CREATE TABLE progression_moments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  moment_key TEXT NOT NULL,
  pillar TEXT NOT NULL CHECK (pillar IN (
    'mastery', 'lineage', 'discovery', 'clan', 'calendar'
  )),
  kind TEXT NOT NULL,
  significance TEXT NOT NULL CHECK (significance IN (
    'notable', 'milestone', 'historic'
  )),
  headline TEXT NOT NULL CHECK (char_length(headline) BETWEEN 1 AND 160),
  detail TEXT CHECK (detail IS NULL OR char_length(detail) <= 500),
  destination TEXT CHECK (destination IS NULL OR destination IN (
    'chronicle', 'mastery', 'records', 'codex', 'signal', 'clan', 'lab', 'lineage'
  )),
  artifact_ref TEXT CHECK (
    artifact_ref IS NULL OR char_length(btrim(artifact_ref)) BETWEEN 1 AND 300
  ),
  payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(payload) = 'object'),
  secured_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, source_type, source_id, moment_key)
);

CREATE INDEX progression_moments_player_recent_idx
  ON progression_moments(player_id, secured_at DESC, id DESC);

ALTER TABLE progression_moments ENABLE ROW LEVEL SECURITY;
CREATE POLICY progression_moments_select_own ON progression_moments
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

CREATE TABLE player_attention_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  moment_id UUID REFERENCES progression_moments(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  attention_key TEXT NOT NULL,
  attention_kind TEXT NOT NULL CHECK (attention_kind IN ('action', 'recognition')),
  status TEXT NOT NULL DEFAULT 'unseen' CHECK (
    status IN ('unseen', 'seen', 'resolved', 'dismissed')
  ),
  destination TEXT NOT NULL CHECK (destination IN (
    'chronicle', 'mastery', 'records', 'codex', 'signal', 'clan', 'lab', 'lineage'
  )),
  headline TEXT NOT NULL CHECK (char_length(headline) BETWEEN 1 AND 160),
  detail TEXT CHECK (detail IS NULL OR char_length(detail) <= 500),
  artifact_ref TEXT CHECK (
    artifact_ref IS NULL OR char_length(btrim(artifact_ref)) BETWEEN 1 AND 300
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  seen_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  UNIQUE (player_id, source_type, source_id, attention_key),
  CONSTRAINT attention_terminal_shape CHECK (
    (status IN ('resolved', 'dismissed') AND resolved_at IS NOT NULL)
    OR (status IN ('unseen', 'seen') AND resolved_at IS NULL)
  ),
  CONSTRAINT recognition_never_action_terminal CHECK (
    attention_kind = 'action' OR status NOT IN ('resolved', 'dismissed')
  ),
  CONSTRAINT recognition_has_exact_artifact CHECK (
    attention_kind <> 'recognition'
    OR (
      moment_id IS NOT NULL
      AND artifact_ref IS NOT NULL
      AND char_length(btrim(artifact_ref)) > 0
    )
  )
);

CREATE INDEX player_attention_open_idx
  ON player_attention_items(player_id, attention_kind, status, created_at DESC);

ALTER TABLE player_attention_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY player_attention_items_select_own ON player_attention_items
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

COMMENT ON TABLE player_attention_items IS
  'Cross-device attention state. Recognition clears only when the exact destination content is viewed; action items remain until resolved or deliberately dismissed.';

-- Clan honors are permanent personal history, not properties of the clan a
-- player happens to belong to later. Materialize future awards at insertion so
-- switching/leaving a clan can never orphan the earned social proof.
CREATE OR REPLACE FUNCTION materialize_clan_energy_honor()
RETURNS TRIGGER AS $$
DECLARE
  v_moment_id UUID;
  v_significance TEXT;
  v_headline TEXT;
BEGIN
  v_significance := CASE NEW.honor
    WHEN 'victor' THEN 'historic'
    WHEN 'stalemate' THEN 'milestone'
    ELSE 'notable'
  END;
  v_headline := CASE NEW.honor
    WHEN 'victor' THEN 'Clan Energy Battle victory'
    WHEN 'stalemate' THEN 'Clan Energy Battle stalemate'
    ELSE 'Clan Energy Battle served'
  END;

  INSERT INTO progression_moments(
    player_id, source_type, source_id, moment_key, pillar, kind,
    significance, headline, detail, destination, artifact_ref, payload, secured_at
  ) VALUES (
    NEW.player_id, 'clan_battle', NEW.battle_id::TEXT, 'honor', 'clan',
    'clan_battle_honor', v_significance, v_headline,
    'Permanent personal proof of contribution to a completed battle.',
    'chronicle', 'clan-battle:' || NEW.battle_id,
    jsonb_build_object(
      'battleId', NEW.battle_id,
      'clanId', NEW.clan_id,
      'honor', NEW.honor
    ),
    NEW.awarded_at
  )
  ON CONFLICT (player_id, source_type, source_id, moment_key) DO UPDATE
    SET payload = progression_moments.payload
  RETURNING id INTO v_moment_id;

  IF NEW.honor IN ('victor', 'stalemate') THEN
    INSERT INTO player_attention_items(
      player_id, moment_id, source_type, source_id, attention_key,
      attention_kind, destination, headline, detail, artifact_ref
    ) VALUES (
      NEW.player_id, v_moment_id, 'clan_battle', NEW.battle_id::TEXT,
      'honor', 'recognition', 'chronicle', v_headline,
      'Your permanent clan honor is now in the Chronicle.',
      'clan-battle:' || NEW.battle_id
    ) ON CONFLICT (player_id, source_type, source_id, attention_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION materialize_clan_energy_honor()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS clan_energy_honor_materialize ON clan_energy_honors;
CREATE TRIGGER clan_energy_honor_materialize
AFTER INSERT ON clan_energy_honors
FOR EACH ROW EXECUTE FUNCTION materialize_clan_energy_honor();

-- Existing honors become Chronicle history without creating retroactive badge
-- debt. Future INSERTs use the trigger above and may create recognition.
INSERT INTO progression_moments(
  player_id, source_type, source_id, moment_key, pillar, kind,
  significance, headline, detail, destination, artifact_ref, payload, secured_at
)
SELECT h.player_id, 'clan_battle', h.battle_id::TEXT, 'honor', 'clan',
       'clan_battle_honor',
       CASE h.honor WHEN 'victor' THEN 'historic'
                    WHEN 'stalemate' THEN 'milestone' ELSE 'notable' END,
       CASE h.honor WHEN 'victor' THEN 'Clan Energy Battle victory'
                    WHEN 'stalemate' THEN 'Clan Energy Battle stalemate'
                    ELSE 'Clan Energy Battle served' END,
       'Permanent personal proof of contribution to a completed battle.',
       'chronicle', 'clan-battle:' || h.battle_id,
       jsonb_build_object('battleId', h.battle_id, 'clanId', h.clan_id, 'honor', h.honor),
       h.awarded_at
FROM clan_energy_honors h
ON CONFLICT (player_id, source_type, source_id, moment_key) DO NOTHING;

-- One optional pursuit chosen from server-derived candidates. It is an
-- organizing preference, never another progress meter or reward source.
CREATE TABLE player_pinned_pursuits (
  player_id UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL CHECK (char_length(candidate_id) BETWEEN 1 AND 160),
  pillar TEXT NOT NULL CHECK (pillar IN ('mastery', 'lineage', 'discovery')),
  kind TEXT NOT NULL CHECK (kind IN (
    'mastery_level', 'record_tier', 'ladder_record', 'lineage_generation'
  )),
  target_id TEXT NOT NULL CHECK (char_length(target_id) BETWEEN 1 AND 160),
  headline TEXT NOT NULL CHECK (char_length(headline) BETWEEN 1 AND 160),
  destination TEXT NOT NULL CHECK (destination IN (
    'chronicle', 'mastery', 'records', 'codex', 'signal', 'clan', 'lab', 'lineage'
  )),
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE player_pinned_pursuits ENABLE ROW LEVEL SECURITY;
CREATE POLICY player_pinned_pursuits_select_own ON player_pinned_pursuits
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- -----------------------------------------------------------------------------
-- 3. Stable lineage dossiers and active/retired specimen memory
-- -----------------------------------------------------------------------------

CREATE TABLE lineage_dossiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  snake_variant_id UUID NOT NULL REFERENCES snake_variants(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, snake_variant_id)
);

CREATE INDEX lineage_dossiers_player_idx
  ON lineage_dossiers(player_id, updated_at DESC);

ALTER TABLE lineage_dossiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY lineage_dossiers_select_own ON lineage_dossiers
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

CREATE TABLE lineage_specimens (
  specimen_id UUID PRIMARY KEY,
  dossier_id UUID NOT NULL REFERENCES lineage_dossiers(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  snake_variant_id UUID NOT NULL REFERENCES snake_variants(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('active', 'retired_refunded')),
  generation INTEGER NOT NULL CHECK (generation >= 1),
  parent1_specimen_id UUID,
  parent2_specimen_id UUID,
  traits TEXT[] NOT NULL DEFAULT '{}',
  lineage JSONB,
  acquired_method TEXT NOT NULL DEFAULT 'unlock',
  acquired_at TIMESTAMPTZ NOT NULL,
  retired_at TIMESTAMPTZ,
  breeding_history_id UUID REFERENCES breeding_history(id) ON DELETE SET NULL,
  identity_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (
    jsonb_typeof(identity_snapshot) = 'object'
  ),
  runs_completed INTEGER NOT NULL DEFAULT 0 CHECK (runs_completed >= 0),
  extractions INTEGER NOT NULL DEFAULT 0 CHECK (extractions >= 0),
  best_score BIGINT NOT NULL DEFAULT 0 CHECK (best_score >= 0),
  best_yield BIGINT NOT NULL DEFAULT 0 CHECK (best_yield >= 0),
  highest_energy SMALLINT NOT NULL DEFAULT 0 CHECK (highest_energy BETWEEN 0 AND 24),
  clan_depth_delivered BIGINT NOT NULL DEFAULT 0 CHECK (clan_depth_delivered >= 0),
  last_run_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lineage_specimen_status_shape CHECK (
    (status = 'active' AND retired_at IS NULL)
    OR (status = 'retired_refunded' AND retired_at IS NOT NULL)
  )
);

CREATE INDEX lineage_specimens_dossier_idx
  ON lineage_specimens(dossier_id, generation DESC, acquired_at DESC);
CREATE INDEX lineage_specimens_player_status_idx
  ON lineage_specimens(player_id, status, generation DESC);

ALTER TABLE lineage_specimens ENABLE ROW LEVEL SECURITY;
CREATE POLICY lineage_specimens_select_own ON lineage_specimens
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- A session-keyed ledger is the idempotency anchor for specimen career stats.
CREATE TABLE lineage_specimen_runs (
  session_id UUID PRIMARY KEY REFERENCES game_sessions(id) ON DELETE CASCADE,
  specimen_id UUID NOT NULL REFERENCES lineage_specimens(specimen_id) ON DELETE CASCADE,
  extracted BOOLEAN NOT NULL,
  score BIGINT NOT NULL CHECK (score >= 0),
  yield_dna BIGINT NOT NULL CHECK (yield_dna >= 0),
  energy_committed SMALLINT NOT NULL CHECK (energy_committed BETWEEN 0 AND 24),
  clan_depth_delivered BIGINT NOT NULL DEFAULT 0 CHECK (clan_depth_delivered >= 0),
  ended_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX lineage_specimen_runs_specimen_idx
  ON lineage_specimen_runs(specimen_id, ended_at DESC);

ALTER TABLE lineage_specimen_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY lineage_specimen_runs_select_own ON lineage_specimen_runs
  FOR SELECT USING (
    specimen_id IN (
      SELECT ls.specimen_id FROM lineage_specimens ls
      WHERE ls.player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION ensure_lineage_dossier(
  p_player_id UUID,
  p_variant_id UUID
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO lineage_dossiers(player_id, snake_variant_id)
  VALUES (p_player_id, p_variant_id)
  ON CONFLICT (player_id, snake_variant_id)
  DO UPDATE SET updated_at = GREATEST(lineage_dossiers.updated_at, EXCLUDED.updated_at)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION sync_active_lineage_specimen()
RETURNS TRIGGER AS $$
DECLARE
  v_dossier_id UUID;
  v_history_id UUID;
  v_moment_id UUID;
BEGIN
  v_dossier_id := ensure_lineage_dossier(NEW.player_id, NEW.snake_variant_id);
  SELECT bh.id INTO v_history_id
  FROM breeding_history bh
  WHERE bh.player_id = NEW.player_id AND bh.child_id = NEW.id
  ORDER BY bh.bred_at DESC, bh.id DESC LIMIT 1;

  INSERT INTO lineage_specimens (
    specimen_id, dossier_id, player_id, snake_variant_id, status, generation,
    parent1_specimen_id, parent2_specimen_id, traits, lineage,
    acquired_method, acquired_at, breeding_history_id, identity_snapshot
  ) VALUES (
    NEW.id, v_dossier_id, NEW.player_id, NEW.snake_variant_id, 'active', NEW.generation,
    NEW.parent1_id, NEW.parent2_id, COALESCE(NEW.traits, '{}'), NEW.lineage,
    COALESCE(NEW.acquired_method, 'unlock'), NEW.acquired_at, v_history_id,
    jsonb_build_object(
      'specimen_id', NEW.id,
      'variant_id', NEW.snake_variant_id,
      'generation', NEW.generation,
      'traits', COALESCE(to_jsonb(NEW.traits), '[]'::JSONB),
      'lineage', NEW.lineage
    )
  )
  ON CONFLICT (specimen_id) DO UPDATE SET
    dossier_id = EXCLUDED.dossier_id,
    status = 'active',
    generation = GREATEST(lineage_specimens.generation, EXCLUDED.generation),
    parent1_specimen_id = EXCLUDED.parent1_specimen_id,
    parent2_specimen_id = EXCLUDED.parent2_specimen_id,
    traits = EXCLUDED.traits,
    lineage = EXCLUDED.lineage,
    retired_at = NULL,
    breeding_history_id = COALESCE(EXCLUDED.breeding_history_id, lineage_specimens.breeding_history_id),
    identity_snapshot = EXCLUDED.identity_snapshot,
    updated_at = NOW();

  UPDATE lineage_dossiers SET updated_at = NOW() WHERE id = v_dossier_id;

  IF TG_OP = 'INSERT' THEN
  INSERT INTO progression_moments(
    player_id, source_type, source_id, moment_key, pillar, kind,
    significance, headline, detail, destination, artifact_ref, payload, secured_at
  ) VALUES (
    NEW.player_id, 'lineage', NEW.id::TEXT, 'specimen-acquired', 'lineage',
    'lineage_specimen_acquired',
    CASE WHEN NEW.generation > 1 THEN 'milestone' ELSE 'notable' END,
    CASE WHEN NEW.generation > 1
      THEN 'Gen ' || NEW.generation || ' lineage bred'
      ELSE 'New snake passport opened'
    END,
    'The specimen now has a permanent lineage chapter.',
    'lineage', NEW.id::TEXT,
    jsonb_build_object(
      'specimenId', NEW.id,
      'variantId', NEW.snake_variant_id,
      'generation', NEW.generation
    ),
    COALESCE(NEW.acquired_at, NOW())
  )
  ON CONFLICT (player_id, source_type, source_id, moment_key) DO UPDATE
    SET payload = progression_moments.payload
  RETURNING id INTO v_moment_id;

  -- A bred generation is a real ownership milestone; the initial passport is
  -- recorded quietly to avoid turning first-time collection into badge debt.
  IF NEW.generation > 1 THEN
    INSERT INTO player_attention_items(
      player_id, moment_id, source_type, source_id, attention_key,
      attention_kind, destination, headline, detail, artifact_ref
    ) VALUES (
      NEW.player_id, v_moment_id, 'lineage', NEW.id::TEXT,
      'specimen-acquired', 'recognition', 'lineage',
      'Gen ' || NEW.generation || ' lineage bred',
      'Open its permanent snake passport.', NEW.id::TEXT
    ) ON CONFLICT (player_id, source_type, source_id, attention_key) DO NOTHING;
  END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER collected_snakes_sync_lineage_specimen
AFTER INSERT OR UPDATE OF generation, parent1_id, parent2_id, traits, lineage,
  acquired_method, snake_variant_id
ON collected_snakes
FOR EACH ROW EXECUTE FUNCTION sync_active_lineage_specimen();

-- `breed_snakes` inserts the collected child before its breeding_history row.
-- Attach the receipt when that second write lands rather than leaving an
-- active bred specimen without its deterministic draft provenance.
CREATE OR REPLACE FUNCTION sync_lineage_breeding_history()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.child_id IS NOT NULL THEN
    UPDATE lineage_specimens
    SET breeding_history_id = NEW.id, updated_at = NOW()
    WHERE specimen_id = NEW.child_id AND player_id = NEW.player_id;
  END IF;
  IF NEW.refunded_child_id IS NOT NULL THEN
    UPDATE lineage_specimens
    SET breeding_history_id = NEW.id, updated_at = NOW()
    WHERE specimen_id = NEW.refunded_child_id AND player_id = NEW.player_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER breeding_history_sync_lineage_specimen
AFTER INSERT OR UPDATE OF child_id, refunded_child_id, refunded_at, refund_snapshot
ON breeding_history
FOR EACH ROW EXECUTE FUNCTION sync_lineage_breeding_history();

CREATE OR REPLACE FUNCTION retire_refunded_lineage_specimen()
RETURNS TRIGGER AS $$
DECLARE
  v_history RECORD;
BEGIN
  SELECT bh.id, bh.refunded_at, bh.refund_snapshot
  INTO v_history
  FROM breeding_history bh
  WHERE bh.player_id = OLD.player_id
    AND bh.refunded_child_id = OLD.id
    AND bh.refunded_at IS NOT NULL
  ORDER BY bh.refunded_at DESC, bh.id DESC LIMIT 1;

  -- Account deletion and administrative cleanup do not fabricate a refund
  -- retirement. The dossier rows naturally follow the player's CASCADE.
  IF NOT FOUND THEN RETURN OLD; END IF;

  UPDATE lineage_specimens
  SET status = 'retired_refunded',
      retired_at = v_history.refunded_at,
      breeding_history_id = v_history.id,
      identity_snapshot = COALESCE(v_history.refund_snapshot -> 'child', identity_snapshot),
      updated_at = NOW()
  WHERE specimen_id = OLD.id AND player_id = OLD.player_id;

  INSERT INTO progression_moments(
    player_id, source_type, source_id, moment_key, pillar, kind,
    significance, headline, detail, destination, artifact_ref, payload, secured_at
  ) VALUES (
    OLD.player_id, 'lineage', OLD.id::TEXT, 'specimen-retired-refunded',
    'lineage', 'lineage_specimen_retired', 'notable',
    'Gen ' || OLD.generation || ' lineage retired',
    'DNA was refunded; the specimen passport remains part of the Chronicle.',
    'lineage', OLD.id::TEXT,
    jsonb_build_object(
      'specimenId', OLD.id,
      'variantId', OLD.snake_variant_id,
      'generation', OLD.generation,
      'refundHistoryId', v_history.id
    ),
    v_history.refunded_at
  ) ON CONFLICT (player_id, source_type, source_id, moment_key) DO NOTHING;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER collected_snakes_retire_refunded_specimen
AFTER DELETE ON collected_snakes
FOR EACH ROW EXECUTE FUNCTION retire_refunded_lineage_specimen();

-- Backfill dossiers and active specimens.
INSERT INTO lineage_dossiers(player_id, snake_variant_id, created_at, updated_at)
SELECT cs.player_id, cs.snake_variant_id, MIN(cs.acquired_at), MAX(cs.acquired_at)
FROM collected_snakes cs
GROUP BY cs.player_id, cs.snake_variant_id
ON CONFLICT (player_id, snake_variant_id) DO NOTHING;

INSERT INTO lineage_dossiers(player_id, snake_variant_id, created_at, updated_at)
SELECT bh.player_id,
       (bh.refund_snapshot #>> '{child,variant_id}')::UUID,
       MIN(bh.bred_at), MAX(bh.refunded_at)
FROM breeding_history bh
WHERE bh.refunded_at IS NOT NULL
  AND bh.refund_snapshot #>> '{child,variant_id}' IS NOT NULL
GROUP BY bh.player_id, (bh.refund_snapshot #>> '{child,variant_id}')::UUID
ON CONFLICT (player_id, snake_variant_id) DO NOTHING;

INSERT INTO lineage_specimens (
  specimen_id, dossier_id, player_id, snake_variant_id, status, generation,
  parent1_specimen_id, parent2_specimen_id, traits, lineage, acquired_method,
  acquired_at, breeding_history_id, identity_snapshot
)
SELECT cs.id, ld.id, cs.player_id, cs.snake_variant_id, 'active', cs.generation,
       cs.parent1_id, cs.parent2_id, cs.traits, cs.lineage,
       COALESCE(cs.acquired_method, 'unlock'), cs.acquired_at, bh.id,
       jsonb_build_object(
         'specimen_id', cs.id, 'variant_id', cs.snake_variant_id,
         'generation', cs.generation, 'traits', to_jsonb(cs.traits),
         'lineage', cs.lineage
       )
FROM collected_snakes cs
JOIN lineage_dossiers ld
  ON ld.player_id = cs.player_id AND ld.snake_variant_id = cs.snake_variant_id
LEFT JOIN LATERAL (
  SELECT h.id FROM breeding_history h
  WHERE h.player_id = cs.player_id AND h.child_id = cs.id
  ORDER BY h.bred_at DESC, h.id DESC LIMIT 1
) bh ON TRUE
ON CONFLICT (specimen_id) DO NOTHING;

INSERT INTO lineage_specimens (
  specimen_id, dossier_id, player_id, snake_variant_id, status, generation,
  parent1_specimen_id, parent2_specimen_id, traits, lineage, acquired_method,
  acquired_at, retired_at, breeding_history_id, identity_snapshot
)
SELECT bh.refunded_child_id, ld.id, bh.player_id,
       (bh.refund_snapshot #>> '{child,variant_id}')::UUID,
       'retired_refunded',
       GREATEST(COALESCE((bh.refund_snapshot #>> '{child,generation}')::INTEGER, 1), 1),
       bh.parent1_id, bh.parent2_id,
       COALESCE(ARRAY(SELECT jsonb_array_elements_text(
         COALESCE(bh.refund_snapshot #> '{child,traits}', '[]'::JSONB)
       )), '{}'),
       bh.refund_snapshot #> '{child,lineage}', 'bred', bh.bred_at,
       bh.refunded_at, bh.id, bh.refund_snapshot -> 'child'
FROM breeding_history bh
JOIN lineage_dossiers ld
  ON ld.player_id = bh.player_id
 AND ld.snake_variant_id = (bh.refund_snapshot #>> '{child,variant_id}')::UUID
WHERE bh.refunded_at IS NOT NULL
  AND bh.refunded_child_id IS NOT NULL
ON CONFLICT (specimen_id) DO UPDATE SET
  status = 'retired_refunded',
  retired_at = EXCLUDED.retired_at,
  breeding_history_id = EXCLUDED.breeding_history_id,
  identity_snapshot = EXCLUDED.identity_snapshot,
  updated_at = NOW();

CREATE OR REPLACE FUNCTION record_lineage_specimen_run(p_session_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_run RECORD;
  v_inserted UUID;
BEGIN
  SELECT gs.id, gs.snake_used_id, gs.extracted, gs.score, gs.yield_dna,
         gs.energy_committed, gs.ended_at,
         COALESCE((SELECT c.score FROM clan_energy_contributions c
                   WHERE c.session_id = gs.id AND c.counted IS TRUE), 0) AS clan_depth
  INTO v_run
  FROM game_sessions gs
  WHERE gs.id = p_session_id
    AND gs.ended_at IS NOT NULL
    AND gs.validated IS TRUE;

  IF NOT FOUND OR v_run.snake_used_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM lineage_specimens ls WHERE ls.specimen_id = v_run.snake_used_id
  ) THEN
    RETURN FALSE;
  END IF;

  INSERT INTO lineage_specimen_runs (
    session_id, specimen_id, extracted, score, yield_dna,
    energy_committed, clan_depth_delivered, ended_at
  ) VALUES (
    v_run.id, v_run.snake_used_id, COALESCE(v_run.extracted, FALSE),
    GREATEST(COALESCE(v_run.score, 0), 0),
    GREATEST(COALESCE(v_run.yield_dna, 0), 0),
    LEAST(GREATEST(COALESCE(v_run.energy_committed, 0), 0), 24),
    GREATEST(COALESCE(v_run.clan_depth, 0), 0), v_run.ended_at
  )
  ON CONFLICT (session_id) DO NOTHING
  RETURNING session_id INTO v_inserted;

  IF v_inserted IS NULL THEN RETURN FALSE; END IF;

  UPDATE lineage_specimens
  SET runs_completed = runs_completed + 1,
      extractions = extractions + CASE WHEN v_run.extracted THEN 1 ELSE 0 END,
      best_score = GREATEST(best_score, COALESCE(v_run.score, 0)),
      best_yield = GREATEST(best_yield, COALESCE(v_run.yield_dna, 0)),
      highest_energy = CASE
        WHEN v_run.extracted THEN GREATEST(highest_energy, COALESCE(v_run.energy_committed, 0))
        ELSE highest_energy
      END,
      clan_depth_delivered = clan_depth_delivered + GREATEST(COALESCE(v_run.clan_depth, 0), 0),
      last_run_at = GREATEST(COALESCE(last_run_at, v_run.ended_at), v_run.ended_at),
      updated_at = NOW()
  WHERE specimen_id = v_run.snake_used_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Backfill career stats for active specimens. Refunded historic session FKs
-- were intentionally SET NULL by migration 058 and cannot be reconstructed.
INSERT INTO lineage_specimen_runs (
  session_id, specimen_id, extracted, score, yield_dna,
  energy_committed, clan_depth_delivered, ended_at
)
SELECT gs.id, gs.snake_used_id, COALESCE(gs.extracted, FALSE),
       GREATEST(COALESCE(gs.score, 0), 0), GREATEST(COALESCE(gs.yield_dna, 0), 0),
       LEAST(GREATEST(COALESCE(gs.energy_committed, 0), 0), 24),
       COALESCE((SELECT c.score FROM clan_energy_contributions c
                 WHERE c.session_id = gs.id AND c.counted IS TRUE), 0),
       gs.ended_at
FROM game_sessions gs
JOIN lineage_specimens ls ON ls.specimen_id = gs.snake_used_id
WHERE gs.ended_at IS NOT NULL AND gs.validated IS TRUE
ON CONFLICT (session_id) DO NOTHING;

UPDATE lineage_specimens ls
SET runs_completed = agg.runs_completed,
    extractions = agg.extractions,
    best_score = agg.best_score,
    best_yield = agg.best_yield,
    highest_energy = agg.highest_energy,
    clan_depth_delivered = agg.clan_depth_delivered,
    last_run_at = agg.last_run_at,
    updated_at = NOW()
FROM (
  SELECT specimen_id, COUNT(*)::INTEGER AS runs_completed,
         COUNT(*) FILTER (WHERE extracted)::INTEGER AS extractions,
         MAX(score) AS best_score, MAX(yield_dna) AS best_yield,
         COALESCE(MAX(energy_committed) FILTER (WHERE extracted), 0) AS highest_energy,
         SUM(clan_depth_delivered) AS clan_depth_delivered,
         MAX(ended_at) AS last_run_at
  FROM lineage_specimen_runs GROUP BY specimen_id
) agg
WHERE ls.specimen_id = agg.specimen_id;

-- -----------------------------------------------------------------------------
-- 4. Atomic/idempotent receipt + moment persistence and attention transitions
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION persist_run_impact_envelope(
  p_player_id UUID,
  p_session_id UUID,
  p_envelope JSONB
) RETURNS JSONB AS $$
DECLARE
  v_canonical JSONB;
  v_impact JSONB;
  v_moment_id UUID;
  v_significance TEXT;
  v_destination TEXT;
BEGIN
  IF p_envelope IS NULL OR jsonb_typeof(p_envelope) <> 'object'
     OR COALESCE((p_envelope ->> 'version')::INTEGER, 0) <> 1
     OR p_envelope ->> 'sessionId' IS DISTINCT FROM p_session_id::TEXT THEN
    RAISE EXCEPTION 'INVALID_RUN_IMPACT_ENVELOPE';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM game_sessions gs
    WHERE gs.id = p_session_id AND gs.player_id = p_player_id
      AND gs.ended_at IS NOT NULL AND gs.end_reason = 'completed'
  ) THEN
    RAISE EXCEPTION 'SETTLED_SESSION_NOT_FOUND';
  END IF;

  INSERT INTO run_impact_receipts(
    session_id, player_id, version, envelope, settled_at
  ) VALUES (
    p_session_id, p_player_id, 1, p_envelope,
    (p_envelope ->> 'settledAt')::TIMESTAMPTZ
  ) ON CONFLICT (session_id) DO NOTHING;

  SELECT rir.envelope INTO v_canonical
  FROM run_impact_receipts rir
  WHERE rir.session_id = p_session_id AND rir.player_id = p_player_id;

  IF v_canonical IS NULL THEN RAISE EXCEPTION 'RUN_IMPACT_PERSIST_FAILED'; END IF;

  FOR v_impact IN
    SELECT value FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_canonical -> 'impacts') = 'array'
        THEN v_canonical -> 'impacts' ELSE '[]'::JSONB END
    )
  LOOP
    v_significance := v_impact ->> 'significance';
    IF v_significance NOT IN ('notable', 'milestone', 'historic') THEN CONTINUE; END IF;

    v_destination := v_impact ->> 'destination';
    INSERT INTO progression_moments(
      player_id, source_type, source_id, moment_key, pillar, kind,
      significance, headline, detail, destination, artifact_ref, payload, secured_at
    ) VALUES (
      p_player_id, 'run', p_session_id::TEXT, v_impact ->> 'key',
      v_impact ->> 'pillar', v_impact ->> 'kind', v_significance,
      v_impact ->> 'headline', v_impact ->> 'detail', v_destination,
      v_impact ->> 'artifactRef', v_impact, (v_canonical ->> 'settledAt')::TIMESTAMPTZ
    )
    ON CONFLICT (player_id, source_type, source_id, moment_key) DO UPDATE
      SET payload = progression_moments.payload
    RETURNING id INTO v_moment_id;

    -- Recognition attention is reserved for actual milestones. Notable facts
    -- remain in Results and Chronicle without creating badge debt.
    IF v_significance IN ('milestone', 'historic')
       AND v_destination IS NOT NULL
       AND char_length(btrim(COALESCE(v_impact ->> 'artifactRef', ''))) > 0 THEN
      INSERT INTO player_attention_items(
        player_id, moment_id, source_type, source_id, attention_key,
        attention_kind, destination, headline, detail, artifact_ref
      ) VALUES (
        p_player_id, v_moment_id, 'run', p_session_id::TEXT,
        v_impact ->> 'key', 'recognition', v_destination,
        v_impact ->> 'headline', v_impact ->> 'detail', v_impact ->> 'artifactRef'
      ) ON CONFLICT (player_id, source_type, source_id, attention_key) DO NOTHING;
    END IF;
  END LOOP;

  PERFORM record_lineage_specimen_run(p_session_id);
  RETURN v_canonical;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION transition_player_attention(
  p_player_id UUID,
  p_item_id UUID,
  p_transition TEXT
) RETURNS JSONB AS $$
DECLARE
  v_item player_attention_items%ROWTYPE;
BEGIN
  SELECT * INTO v_item FROM player_attention_items
  WHERE id = p_item_id AND player_id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ATTENTION_NOT_FOUND'; END IF;

  IF p_transition = 'seen' THEN
    IF v_item.status = 'unseen' THEN
      UPDATE player_attention_items
      SET status = 'seen', seen_at = COALESCE(seen_at, NOW())
      WHERE id = p_item_id;
    END IF;
  ELSIF p_transition IN ('resolved', 'dismissed') THEN
    IF v_item.attention_kind <> 'action' THEN
      RAISE EXCEPTION 'INVALID_ATTENTION_TRANSITION';
    END IF;
    IF v_item.status NOT IN ('resolved', 'dismissed') THEN
      UPDATE player_attention_items
      SET status = p_transition,
          seen_at = COALESCE(seen_at, NOW()),
          resolved_at = COALESCE(resolved_at, NOW())
      WHERE id = p_item_id;
    ELSIF v_item.status IS DISTINCT FROM p_transition THEN
      RAISE EXCEPTION 'INVALID_ATTENTION_TRANSITION';
    END IF;
  ELSE
    RAISE EXCEPTION 'INVALID_ATTENTION_TRANSITION';
  END IF;

  SELECT * INTO v_item FROM player_attention_items WHERE id = p_item_id;
  RETURN jsonb_build_object(
    'id', v_item.id,
    'kind', v_item.attention_kind,
    'status', v_item.status,
    'destination', v_item.destination,
    'headline', v_item.headline,
    'detail', v_item.detail,
    'momentId', v_item.moment_id,
    'artifactRef', v_item.artifact_ref,
    'source', jsonb_build_object('type', v_item.source_type, 'id', v_item.source_id),
    'createdAt', v_item.created_at,
    'seenAt', v_item.seen_at,
    'resolvedAt', v_item.resolved_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Release capability probe. It is defined only after every Career Spine
-- object/function above exists, so version 1 means the full migration reached
-- its compatibility boundary rather than merely creating the first table.
CREATE OR REPLACE FUNCTION get_career_spine_capability()
RETURNS JSONB AS $$
  SELECT jsonb_build_object(
    'version', 1,
    'exactArtifactAttention', TRUE,
    'atomicSettlement', TRUE,
    'lineageHistory', TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- All mutation functions are service-only. Authenticated users read their own
-- rows through RLS; APIs authenticate and invoke these functions with the
-- service-role client.
REVOKE ALL ON FUNCTION ensure_lineage_dossier(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sync_active_lineage_specimen() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sync_lineage_breeding_history() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION retire_refunded_lineage_specimen() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION record_lineage_specimen_run(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION persist_run_impact_envelope(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION transition_player_attention(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION get_career_spine_capability() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ensure_lineage_dossier(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION record_lineage_specimen_run(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION persist_run_impact_envelope(UUID, UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION transition_player_attention(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_career_spine_capability() TO service_role;

COMMIT;
