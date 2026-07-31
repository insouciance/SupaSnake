-- =============================================================================
-- Migration 061: Career Spine — durable run impact, attention and lineage memory
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

-- Rolling-deploy tombstone: the outgoing application may still issue its old
-- claim call while this migration is live. The call cannot grant a requested
-- reward or recreate claim debt; it merely asks the authoritative automatic
-- settler to secure every catalog-backed identity tier already reached.
CREATE OR REPLACE FUNCTION claim_season_tier(
  p_player_id UUID,
  p_level INTEGER
) RETURNS JSONB AS $$
DECLARE
  v_pass player_battle_pass%ROWTYPE;
  v_result JSONB;
BEGIN
  IF p_level IS NULL OR p_level < 1 THEN
    RAISE EXCEPTION 'INVALID_TIER_LEVEL';
  END IF;

  SELECT pbp.* INTO v_pass
  FROM player_battle_pass pbp
  JOIN battle_pass_seasons bps ON bps.id = pbp.season_id
  WHERE pbp.player_id = p_player_id
  ORDER BY bps.season_number DESC, pbp.updated_at DESC
  LIMIT 1
  FOR UPDATE OF pbp;

  IF NOT FOUND OR v_pass.current_level < p_level THEN
    RAISE EXCEPTION 'LEVEL_NOT_REACHED';
  END IF;

  v_result := secure_reached_season_entitlements(
    p_player_id,
    v_pass.season_id
  );
  RETURN v_result || jsonb_build_object(
    'secured', TRUE,
    'compatibility', TRUE,
    'requested_level', p_level
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
    AND gs.validated IS TRUE
    AND gs.is_free_play IS NOT TRUE
    AND COALESCE(gs.end_reason, 'completed') = 'completed';

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
      -- Energy prestige is extraction-only. A failed run still belongs in the
      -- specimen's history, but it must not advertise exposed Energy as an
      -- accomplishment when none of that commitment was banked.
      highest_energy = CASE
        WHEN v_run.extracted THEN
          GREATEST(highest_energy, COALESCE(v_run.energy_committed, 0))
        ELSE highest_energy
      END,
      clan_depth_delivered = COALESCE((
        SELECT SUM(lsr.clan_depth_delivered)
        FROM lineage_specimen_runs lsr
        WHERE lsr.specimen_id = v_run.snake_used_id
      ), 0),
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
WHERE gs.ended_at IS NOT NULL
  AND gs.validated IS TRUE
  AND gs.is_free_play IS NOT TRUE
  AND COALESCE(gs.end_reason, 'completed') = 'completed'
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

  IF EXISTS (
       SELECT 1 FROM game_sessions gs
       WHERE gs.id = p_session_id AND gs.reward_protocol = 'atomic_v1'
     ) AND NOT EXISTS (
       SELECT 1 FROM game_progression_settlements gps
       WHERE gps.session_id = p_session_id
         AND gps.player_id = p_player_id
         AND gps.core_result IS NOT NULL
         AND gps.clan_captured_at IS NOT NULL
         AND gps.signal_captured_at IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'GAME_PROGRESSION_INCOMPLETE';
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
  UPDATE game_progression_settlements
  SET completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
  WHERE session_id = p_session_id AND player_id = p_player_id;
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
GRANT EXECUTE ON FUNCTION ensure_lineage_dossier(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION record_lineage_specimen_run(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION persist_run_impact_envelope(UUID, UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION transition_player_attention(UUID, UUID, TEXT) TO service_role;

-- =============================================================================
-- FOLLOW-UP HARDENING: one atomic, session-idempotent player reward fold
-- =============================================================================
-- This deliberately lives in one bounded section so attention/artifact edits
-- above can merge independently. The route has already validated and stamped
-- the session. This RPC verifies those server-authored facts, locks the
-- session and player, and makes the player aggregate + audit receipt one
-- transaction. A session ledger is required even for zero-DNA runs, because
-- games played and PB eligibility still need exactly-once semantics.

-- Hard cutover after additive migration 060. The capability-aware application
-- is promoted on schema 060: earning starts remain closed, while validated
-- ends are stored in the service-only pending table. Production proves the
-- canonical alias and drains old invocations before applying 061. Once this guard exists,
-- every completed earning run must carry atomic_v1; protocol-NULL legacy
-- completions are rejected. This avoids trying to reconcile the outgoing
-- route's unsafe absolute aggregate writes across versions.
ALTER TABLE game_sessions
  ADD COLUMN reward_protocol TEXT
    CHECK (reward_protocol IS NULL OR reward_protocol = 'atomic_v1'),
  ADD COLUMN atomic_reward_observed_at TIMESTAMPTZ,
  ADD COLUMN progression_settlement_payload JSONB,
  ADD COLUMN progression_recovery_attempted_at TIMESTAMPTZ,
  ADD COLUMN progression_recovery_attempts INTEGER NOT NULL DEFAULT 0
    CHECK (progression_recovery_attempts >= 0);

COMMENT ON COLUMN game_sessions.reward_protocol IS
  'Settlement protocol stamped in the guarded end update. Every post-061 completed earning run must use atomic_v1.';
COMMENT ON COLUMN game_sessions.atomic_reward_observed_at IS
  'Trigger-authored proof that the atomic application stamped this completed session. Recovery requires this proof and never trusts a protocol value supplied on INSERT.';
COMMENT ON COLUMN game_sessions.progression_settlement_payload IS
  'Frozen server-validated inputs required to resume all run progression without the original browser request.';

CREATE INDEX game_sessions_atomic_player_order_idx
  ON game_sessions(player_id, atomic_reward_observed_at, id)
  WHERE reward_protocol = 'atomic_v1'
    AND atomic_reward_observed_at IS NOT NULL;
CREATE INDEX game_sessions_atomic_recovery_idx
  ON game_sessions(progression_recovery_attempted_at NULLS FIRST,
                   atomic_reward_observed_at, id)
  WHERE reward_protocol = 'atomic_v1'
    AND atomic_reward_observed_at IS NOT NULL;

CREATE OR REPLACE FUNCTION assert_atomic_progression_snapshot(
  p_session game_sessions
) RETURNS VOID AS $$
DECLARE
  v_payload JSONB := p_session.progression_settlement_payload;
BEGIN
  IF p_session.ended_at IS NULL
     OR p_session.end_reason IS DISTINCT FROM 'completed'
     OR COALESCE(p_session.is_free_play, FALSE)
     OR p_session.reward_protocol IS DISTINCT FROM 'atomic_v1'
     OR jsonb_typeof(v_payload) IS DISTINCT FROM 'object'
     OR COALESCE((v_payload ->> 'v')::INTEGER, 0) <> 1
     OR jsonb_typeof(v_payload -> 'settledAt') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_payload -> 'dynasty') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_payload -> 'extracted') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(v_payload -> 'died') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(v_payload -> 'validated') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(v_payload -> 'score') IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_payload -> 'yieldDna') IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_payload -> 'dnaCredited') IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_payload -> 'energyCommitted') IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_payload -> 'commitmentMultiplierBps') IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_payload -> 'generation') IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_payload -> 'masteryXp') IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_payload -> 'ladderRung') IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_payload -> 'rewardMetadata') IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_payload -> 'clan') IS DISTINCT FROM 'object'
     OR COALESCE(jsonb_typeof(v_payload -> 'genome'), 'missing') NOT IN ('object', 'null')
     OR COALESCE(jsonb_typeof(v_payload -> 'snakeId'), 'missing') NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'ATOMIC_PROGRESSION_SNAPSHOT_INVALID_SHAPE';
  END IF;

  IF (v_payload ->> 'settledAt')::TIMESTAMPTZ IS DISTINCT FROM p_session.ended_at
     OR v_payload ->> 'dynasty' IS DISTINCT FROM p_session.dynasty
     OR (v_payload ->> 'extracted')::BOOLEAN IS DISTINCT FROM COALESCE(p_session.extracted, FALSE)
     OR (v_payload ->> 'died')::BOOLEAN IS DISTINCT FROM COALESCE(p_session.died, FALSE)
     OR (v_payload ->> 'validated')::BOOLEAN IS DISTINCT FROM COALESCE(p_session.validated, FALSE)
     OR (v_payload ->> 'score')::BIGINT IS DISTINCT FROM COALESCE(p_session.score, 0)::BIGINT
     OR (v_payload ->> 'yieldDna')::BIGINT IS DISTINCT FROM COALESCE(p_session.yield_dna, 0)::BIGINT
     OR (v_payload ->> 'dnaCredited')::BIGINT IS DISTINCT FROM COALESCE(p_session.dna_earned, 0)::BIGINT
     OR (v_payload ->> 'energyCommitted')::INTEGER IS DISTINCT FROM COALESCE(p_session.energy_committed, 0)
     OR (v_payload ->> 'commitmentMultiplierBps')::INTEGER IS DISTINCT FROM COALESCE(p_session.energy_harvest_multiplier_bps, 0)
     OR (v_payload ->> 'generation')::INTEGER < 1
     OR (v_payload ->> 'masteryXp')::BIGINT < 0
     OR (v_payload ->> 'ladderRung')::INTEGER < 0
     OR v_payload -> 'snakeId' IS DISTINCT FROM COALESCE(to_jsonb(p_session.snake_used_id), 'null'::JSONB)
     OR v_payload -> 'genome' IS DISTINCT FROM COALESCE(p_session.genome, 'null'::JSONB) THEN
    RAISE EXCEPTION 'ATOMIC_PROGRESSION_SNAPSHOT_TRUTH_MISMATCH';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION assert_atomic_progression_snapshot(game_sessions)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION guard_atomic_reward_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_pending_received_at TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- A completed earning row must always transition from an observed open
    -- session. Direct INSERT cannot manufacture either legacy completion or
    -- atomic observation proof, even for a privileged writer.
    IF NEW.ended_at IS NOT NULL
       AND NOT COALESCE(NEW.is_free_play, FALSE) THEN
      RAISE EXCEPTION 'COMPLETED_EARNING_SESSION_INSERT_FORBIDDEN';
    END IF;
    NEW.atomic_reward_observed_at := NULL;
    RETURN NEW;
  END IF;

  IF OLD.atomic_reward_observed_at IS NOT NULL THEN
    IF NEW.ended_at IS NULL AND OLD.ended_at IS NOT NULL THEN
      RAISE EXCEPTION 'SETTLED_SESSION_CANNOT_REOPEN';
    END IF;

    -- Once observed, freeze the settlement evidence used by reconciliation.
    IF NEW.player_id IS DISTINCT FROM OLD.player_id
       OR NEW.started_at IS DISTINCT FROM OLD.started_at
       OR NEW.server_started_at IS DISTINCT FROM OLD.server_started_at
       OR NEW.is_free_play IS DISTINCT FROM OLD.is_free_play
       OR NEW.dynasty IS DISTINCT FROM OLD.dynasty
       OR NEW.snake_used_id IS DISTINCT FROM OLD.snake_used_id
       OR NEW.snake_variant_id IS DISTINCT FROM OLD.snake_variant_id
       OR NEW.run_seed IS DISTINCT FROM OLD.run_seed
       OR NEW.run_context IS DISTINCT FROM OLD.run_context
       OR NEW.anomaly_id IS DISTINCT FROM OLD.anomaly_id
       OR NEW.anomaly_week IS DISTINCT FROM OLD.anomaly_week
       OR NEW.serpent_week_id IS DISTINCT FROM OLD.serpent_week_id
       OR NEW.score IS DISTINCT FROM OLD.score
       OR NEW.dna_earned IS DISTINCT FROM OLD.dna_earned
       OR NEW.yield_dna IS DISTINCT FROM OLD.yield_dna
       OR NEW.duration_seconds IS DISTINCT FROM OLD.duration_seconds
       OR NEW.foods_collected IS DISTINCT FROM OLD.foods_collected
       OR NEW.mutations IS DISTINCT FROM OLD.mutations
       OR NEW.validated IS DISTINCT FROM OLD.validated
       OR NEW.validation_errors IS DISTINCT FROM OLD.validation_errors
       OR NEW.extracted IS DISTINCT FROM OLD.extracted
       OR NEW.died IS DISTINCT FROM OLD.died
       OR NEW.victory IS DISTINCT FROM OLD.victory
       OR NEW.energy_committed IS DISTINCT FROM OLD.energy_committed
       OR NEW.energy_harvest_multiplier_bps IS DISTINCT FROM OLD.energy_harvest_multiplier_bps
       OR NEW.signal_objective_run_id IS DISTINCT FROM OLD.signal_objective_run_id
       OR NEW.clan_energy_battle_id IS DISTINCT FROM OLD.clan_energy_battle_id
       OR NEW.clan_energy_battle_side_id IS DISTINCT FROM OLD.clan_energy_battle_side_id
       OR NEW.clan_energy_clan_id IS DISTINCT FROM OLD.clan_energy_clan_id
       OR NEW.ended_at IS DISTINCT FROM OLD.ended_at
       OR NEW.end_reason IS DISTINCT FROM OLD.end_reason
       OR NEW.reward_protocol IS DISTINCT FROM OLD.reward_protocol
       OR NEW.progression_settlement_payload IS DISTINCT FROM OLD.progression_settlement_payload
       OR NEW.genome IS DISTINCT FROM OLD.genome
       OR NEW.atomic_reward_observed_at IS DISTINCT FROM OLD.atomic_reward_observed_at THEN
      RAISE EXCEPTION 'REWARD_SETTLEMENT_EVIDENCE_IMMUTABLE';
    END IF;
    -- Identity telemetry is captured immediately after the critical stamp.
    -- It may transition from NULL once, then becomes immutable like every
    -- other settled fact.
    IF (OLD.death_cause IS NOT NULL AND NEW.death_cause IS DISTINCT FROM OLD.death_cause)
       OR (OLD.run_events IS NOT NULL AND NEW.run_events IS DISTINCT FROM OLD.run_events) THEN
      RAISE EXCEPTION 'LATE_RUN_EVIDENCE_IMMUTABLE';
    END IF;
    RETURN NEW;
  END IF;

  -- Protocol-NULL completed earning rows are immutable legacy history. They
  -- predate this cutover and must never be relabelled after the fact: doing
  -- so would turn a historical payout into a new atomic settlement candidate.
  IF OLD.ended_at IS NOT NULL
     AND NOT COALESCE(OLD.is_free_play, FALSE)
     AND (
       NEW.reward_protocol IS DISTINCT FROM OLD.reward_protocol
       OR NEW.progression_settlement_payload IS DISTINCT FROM
          OLD.progression_settlement_payload
     ) THEN
    RAISE EXCEPTION 'LEGACY_REWARD_PROTOCOL_IMMUTABLE';
  END IF;

  IF OLD.ended_at IS NULL
     AND NEW.ended_at IS NOT NULL
     AND NEW.end_reason = 'completed'
     AND NOT COALESCE(NEW.is_free_play, FALSE)
     AND NEW.reward_protocol IS NULL THEN
    RAISE EXCEPTION 'ATOMIC_REWARD_PROTOCOL_REQUIRED';
  ELSIF NEW.reward_protocol = 'atomic_v1' THEN
    IF OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL
       AND NEW.end_reason = 'completed' THEN
      PERFORM assert_atomic_progression_snapshot(NEW);

      -- Completion order is part of the canonical progression contract. Two
      -- different sessions for one player may finish concurrently, so stamp
      -- the observation time only while holding the same per-player row lock
      -- used by every downstream fold. Without this lock, a later timestamp
      -- could commit first and incorrectly overtake an invisible earlier
      -- transaction.
      PERFORM 1
      FROM players p
      WHERE p.id = NEW.player_id
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'ATOMIC_REWARD_PLAYER_NOT_FOUND';
      END IF;
      SELECT current_pending.received_at INTO v_pending_received_at
        FROM pending_game_session_ends current_pending
        WHERE current_pending.session_id = NEW.id
          AND current_pending.player_id = NEW.player_id
          AND current_pending.state = 'staged'
          AND current_pending.captured_at IS NOT DISTINCT FROM NEW.ended_at
          AND current_pending.envelope -> 'snapshot' IS NOT DISTINCT FROM
            NEW.progression_settlement_payload;
      IF v_pending_received_at IS NULL THEN
        RAISE EXCEPTION 'ATOMIC_REWARD_PENDING_END_REQUIRED';
      END IF;
      IF EXISTS (
        SELECT 1
        FROM pending_game_session_ends pending
        LEFT JOIN pending_game_session_ends current_pending
          ON current_pending.session_id = NEW.id
        WHERE pending.player_id = NEW.player_id
          AND pending.session_id <> NEW.id
          AND pending.state IN ('staged', 'quarantined')
          AND (
            current_pending.session_id IS NULL
            OR pending.received_at < current_pending.received_at
            OR (
              pending.received_at = current_pending.received_at
              AND pending.session_id::TEXT < current_pending.session_id::TEXT
            )
          )
      ) THEN
        RAISE EXCEPTION 'GAME_REWARD_EARLIER_PENDING_END';
      END IF;
      -- The durable receipt order, not app-captured wall time or adoption
      -- scheduling, is the canonical progression order.
      NEW.atomic_reward_observed_at := v_pending_received_at;
      RETURN NEW;
    END IF;
  END IF;
  IF NEW.atomic_reward_observed_at IS DISTINCT FROM OLD.atomic_reward_observed_at THEN
    RAISE EXCEPTION 'ATOMIC_REWARD_OBSERVATION_TRIGGER_AUTHORED';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION guard_atomic_reward_transition()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER game_session_reward_protocol_guard
BEFORE INSERT OR UPDATE ON game_sessions
FOR EACH ROW EXECUTE FUNCTION guard_atomic_reward_transition();

CREATE OR REPLACE FUNCTION adopt_pending_game_session_end(
  p_session_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_session game_sessions%ROWTYPE;
  v_pending pending_game_session_ends%ROWTYPE;
  v_player players%ROWTYPE;
  v_envelope JSONB;
  v_snapshot JSONB;
  v_binding JSONB;
  v_facts JSONB;
BEGIN
  -- Match the store path's lock order exactly: session, player, pending row.
  SELECT * INTO v_session FROM game_sessions gs
  WHERE gs.id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PENDING_GAME_END_SESSION_NOT_FOUND'; END IF;
  SELECT * INTO v_player FROM players p
  WHERE p.id = v_session.player_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PENDING_GAME_END_OWNER_MISMATCH'; END IF;
  SELECT * INTO v_pending FROM pending_game_session_ends pending
  WHERE pending.session_id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_pending.player_id IS DISTINCT FROM v_session.player_id
     OR v_pending.user_id IS DISTINCT FROM v_player.user_id THEN
    UPDATE pending_game_session_ends
    SET state = 'quarantined', quarantine_reason = 'owner_binding_mismatch'
    WHERE session_id = p_session_id;
    RETURN jsonb_build_object('accepted', FALSE, 'state', 'quarantined');
  END IF;
  IF v_pending.state = 'adopted' THEN
    IF v_session.reward_protocol IS DISTINCT FROM 'atomic_v1'
       OR v_session.atomic_reward_observed_at IS NULL
       OR v_session.progression_settlement_payload IS DISTINCT FROM
         v_pending.envelope -> 'snapshot' THEN
      RAISE EXCEPTION 'ADOPTED_PENDING_GAME_END_TRUTH_MISMATCH';
    END IF;
    RETURN jsonb_build_object('accepted', TRUE, 'state', 'adopted', 'sessionId', p_session_id);
  ELSIF v_pending.state = 'superseded_legacy' THEN
    RETURN jsonb_build_object(
      'accepted', TRUE, 'state', 'superseded_legacy', 'sessionId', p_session_id
    );
  ELSIF v_pending.state = 'quarantined' THEN
    RETURN jsonb_build_object(
      'accepted', FALSE, 'state', 'quarantined',
      'reason', v_pending.quarantine_reason, 'sessionId', p_session_id
    );
  END IF;

  v_envelope := v_pending.envelope;
  v_snapshot := v_envelope -> 'snapshot';
  v_binding := v_envelope -> 'binding';
  v_facts := v_envelope -> 'sessionFacts';

  IF v_session.ended_at IS NOT NULL THEN
    IF v_session.reward_protocol = 'atomic_v1'
       AND v_session.atomic_reward_observed_at IS NOT NULL
       AND v_session.progression_settlement_payload = v_snapshot THEN
      PERFORM assert_atomic_progression_snapshot(v_session);
      UPDATE pending_game_session_ends
      SET state = 'adopted', adopted_at = clock_timestamp()
      WHERE session_id = p_session_id;
      RETURN jsonb_build_object('accepted', TRUE, 'state', 'adopted', 'sessionId', p_session_id);
    ELSIF v_session.reward_protocol IS NULL AND v_session.end_reason = 'completed' THEN
      UPDATE pending_game_session_ends
      SET state = 'superseded_legacy', adopted_at = clock_timestamp()
      WHERE session_id = p_session_id;
      RETURN jsonb_build_object(
        'accepted', TRUE, 'state', 'superseded_legacy', 'sessionId', p_session_id
      );
    ELSIF v_session.end_reason IN ('expired', 'abandoned', 'disconnected')
          AND v_pending.captured_at <= v_session.ended_at THEN
      -- Validation and durable acceptance happened before a later lifecycle
      -- closer. Reopen only that exact close; accepted payout debt wins over
      -- timeout bookkeeping and remains recoverable without the browser.
      UPDATE game_sessions
      SET ended_at = NULL, end_reason = 'completed'
      WHERE id = p_session_id
        AND player_id = v_pending.player_id
        AND ended_at IS NOT DISTINCT FROM v_session.ended_at
        AND end_reason IS NOT DISTINCT FROM v_session.end_reason;
      IF NOT FOUND THEN RAISE EXCEPTION 'PENDING_GAME_END_LIFECYCLE_RACE'; END IF;
      v_session.ended_at := NULL;
      v_session.end_reason := 'completed';
    ELSE
      UPDATE pending_game_session_ends
      SET state = 'quarantined', quarantine_reason = 'unexpected_terminal_session'
      WHERE session_id = p_session_id;
      RETURN jsonb_build_object('accepted', FALSE, 'state', 'quarantined');
    END IF;
  END IF;

  -- Recheck every start binding at adoption. Migration 060 checked the same
  -- facts when it accepted the envelope; no privileged drift is tolerated in
  -- between the durable handoff and its atomic stamp.
  IF v_session.end_reason IS DISTINCT FROM 'completed'
     OR COALESCE(v_session.is_free_play, FALSE)
     OR v_envelope ->> 'kind' IS DISTINCT FROM 'career_pending_end_v1'
     OR COALESCE((v_envelope ->> 'v')::INTEGER, 0) <> 1
     OR v_envelope ->> 'userId' IS DISTINCT FROM v_pending.user_id::TEXT
     OR v_envelope ->> 'playerId' IS DISTINCT FROM v_pending.player_id::TEXT
     OR v_envelope ->> 'sessionId' IS DISTINCT FROM p_session_id::TEXT
     OR (v_binding ->> 'startedAt')::TIMESTAMPTZ IS DISTINCT FROM v_session.started_at
     OR v_binding ->> 'dynasty' IS DISTINCT FROM v_session.dynasty
     OR v_binding -> 'snakeId' IS DISTINCT FROM COALESCE(to_jsonb(v_session.snake_used_id), 'null'::JSONB)
     OR v_binding -> 'snakeVariantId' IS DISTINCT FROM COALESCE(to_jsonb(v_session.snake_variant_id), 'null'::JSONB)
     OR v_binding -> 'runSeed' IS DISTINCT FROM COALESCE(to_jsonb(v_session.run_seed), 'null'::JSONB)
     OR v_binding -> 'runContext' IS DISTINCT FROM COALESCE(v_session.run_context, 'null'::JSONB)
     OR (v_binding ->> 'energyCommitted')::INTEGER IS DISTINCT FROM COALESCE(v_session.energy_committed, 0)
     OR (v_binding ->> 'commitmentMultiplierBps')::INTEGER IS DISTINCT FROM COALESCE(v_session.energy_harvest_multiplier_bps, 0)
     OR v_binding -> 'signalRunId' IS DISTINCT FROM COALESCE(to_jsonb(v_session.signal_objective_run_id), 'null'::JSONB)
     OR v_binding -> 'clanBattleId' IS DISTINCT FROM COALESCE(to_jsonb(v_session.clan_energy_battle_id), 'null'::JSONB)
     OR v_binding -> 'clanBattleSideId' IS DISTINCT FROM COALESCE(to_jsonb(v_session.clan_energy_battle_side_id), 'null'::JSONB)
     OR v_binding -> 'clanId' IS DISTINCT FROM COALESCE(to_jsonb(v_session.clan_energy_clan_id), 'null'::JSONB) THEN
    UPDATE pending_game_session_ends
    SET state = 'quarantined', quarantine_reason = 'adoption_binding_mismatch'
    WHERE session_id = p_session_id;
    RETURN jsonb_build_object('accepted', FALSE, 'state', 'quarantined');
  END IF;

  UPDATE game_sessions
  SET score = (v_snapshot ->> 'score')::INTEGER,
      dna_earned = (v_snapshot ->> 'dnaCredited')::INTEGER,
      yield_dna = (v_snapshot ->> 'yieldDna')::INTEGER,
      duration_seconds = (v_facts ->> 'durationSeconds')::INTEGER,
      died = (v_snapshot ->> 'died')::BOOLEAN,
      victory = (v_facts ->> 'victory')::BOOLEAN,
      extracted = (v_snapshot ->> 'extracted')::BOOLEAN,
      ended_at = (v_snapshot ->> 'settledAt')::TIMESTAMPTZ,
      validated = (v_snapshot ->> 'validated')::BOOLEAN,
      validation_errors = CASE
        WHEN COALESCE(jsonb_typeof(v_facts -> 'validationErrors'), 'null') = 'null'
          THEN NULL ELSE v_facts -> 'validationErrors' END,
      foods_collected = (v_facts ->> 'foodsCollected')::INTEGER,
      mutations = CASE
        WHEN COALESCE(jsonb_typeof(v_facts -> 'mutations'), 'null') = 'null'
          THEN NULL ELSE v_facts -> 'mutations' END,
      death_cause = CASE
        WHEN COALESCE(jsonb_typeof(v_facts -> 'deathCause'), 'null') = 'null'
          THEN NULL ELSE v_facts ->> 'deathCause' END,
      run_events = CASE
        WHEN COALESCE(jsonb_typeof(v_facts -> 'runEvents'), 'null') = 'null'
          THEN NULL ELSE v_facts -> 'runEvents' END,
      end_reason = 'completed',
      genome = CASE
        WHEN jsonb_typeof(v_snapshot -> 'genome') = 'null' THEN NULL
        ELSE v_snapshot -> 'genome' END,
      reward_protocol = 'atomic_v1',
      progression_settlement_payload = v_snapshot
  WHERE id = p_session_id AND player_id = v_pending.player_id AND ended_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'PENDING_GAME_END_ADOPTION_RACE'; END IF;

  UPDATE pending_game_session_ends
  SET state = 'adopted', adopted_at = clock_timestamp()
  WHERE session_id = p_session_id;
  RETURN jsonb_build_object(
    'accepted', TRUE, 'state', 'adopted', 'sessionId', p_session_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION adopt_pending_game_session_end(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION adopt_pending_game_session_end(UUID)
  TO service_role;

-- The public ingress remains store-only after 061. Adoption is deliberately a
-- second transaction: once this RPC returns, process death, ordering deferral,
-- or a transient adopter failure cannot erase the accepted result.
CREATE OR REPLACE FUNCTION stage_pending_game_session_end(
  p_user_id UUID,
  p_player_id UUID,
  p_session_id UUID,
  p_envelope JSONB
) RETURNS JSONB AS $$
  SELECT store_pending_game_session_end(
    p_user_id, p_player_id, p_session_id, p_envelope
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION stage_pending_game_session_end(UUID, UUID, UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION stage_pending_game_session_end(UUID, UUID, UUID, JSONB)
  TO service_role;

-- Deterministic migration-time drain. A permanent runtime sweep remains below
-- for transactions that began under 060 and commit after this scan.
DO $$
DECLARE
  v_pending RECORD;
BEGIN
  FOR v_pending IN
    SELECT pending.session_id
    FROM pending_game_session_ends pending
    WHERE pending.state = 'staged'
    ORDER BY pending.player_id,
             pending.received_at,
             pending.session_id
  LOOP
    PERFORM adopt_pending_game_session_end(v_pending.session_id);
  END LOOP;
END;
$$;

CREATE TABLE game_reward_settlements (
  session_id UUID PRIMARY KEY REFERENCES game_sessions(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  dna_awarded BIGINT NOT NULL CHECK (dna_awarded >= 0),
  score BIGINT NOT NULL CHECK (score >= 0),
  validated BOOLEAN NOT NULL,
  high_score_before BIGINT NOT NULL CHECK (high_score_before >= 0),
  high_score_after BIGINT NOT NULL CHECK (high_score_after >= high_score_before),
  settlement_origin TEXT NOT NULL DEFAULT 'atomic_v1'
    CHECK (settlement_origin = 'atomic_v1'),
  settled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT game_reward_settlement_player_session UNIQUE (player_id, session_id)
);

CREATE INDEX game_reward_settlements_player_recent_idx
  ON game_reward_settlements(player_id, settled_at DESC);

ALTER TABLE game_reward_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY game_reward_settlements_select_own ON game_reward_settlements
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

COMMENT ON TABLE game_reward_settlements IS
  'Exactly-once ledger for the atomic player aggregate and game_reward audit fold. Session truth is verified before any player-owned value changes.';

-- Exact outputs of the resumable progression fold. The frozen snapshot also
-- lives on game_sessions so this row can be recreated after a crash between
-- the end stamp and the first RPC. No browser state is part of recovery.
CREATE TABLE game_progression_settlements (
  session_id UUID PRIMARY KEY REFERENCES game_sessions(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  core_result JSONB CHECK (core_result IS NULL OR jsonb_typeof(core_result) = 'object'),
  clan_result JSONB,
  clan_captured_at TIMESTAMPTZ,
  signal_result JSONB,
  signal_prepared_at TIMESTAMPTZ,
  signal_captured_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT game_progression_player_session UNIQUE (player_id, session_id)
);

ALTER TABLE game_progression_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY game_progression_settlements_select_own
  ON game_progression_settlements FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- Session/date evidence makes daily play recoverable after the UTC date has
-- changed. Recompute from the migration baseline plus ordered post-migration
-- play days, so a late recovery cannot attribute yesterday's run to today or
-- cool a chain merely because events arrived out of order.
CREATE TABLE player_streak_rollout_baselines (
  player_id UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  current_streak INTEGER NOT NULL,
  longest_streak INTEGER NOT NULL,
  last_play_date DATE,
  grace_period_used BOOLEAN NOT NULL,
  grace_period_available BOOLEAN NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO player_streak_rollout_baselines(
  player_id, current_streak, longest_streak, last_play_date,
  grace_period_used, grace_period_available
)
SELECT p.id, COALESCE(ps.current_streak, 0), COALESCE(ps.longest_streak, 0),
       ps.last_play_date, COALESCE(ps.grace_period_used, FALSE),
       COALESCE(ps.grace_period_available, TRUE)
FROM players p LEFT JOIN player_streaks ps ON ps.player_id = p.id;

CREATE TABLE player_play_days (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  play_date DATE NOT NULL,
  first_session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, play_date),
  UNIQUE (first_session_id)
);

ALTER TABLE player_streak_rollout_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_play_days ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION record_game_session_play_day(
  p_player_id UUID,
  p_session_id UUID
) RETURNS JSONB AS $$
DECLARE
  c_thresholds CONSTANT INTEGER[] := ARRAY[0, 3, 7, 14, 30];
  v_baseline player_streak_rollout_baselines%ROWTYPE;
  v_day DATE;
  v_cursor DATE;
  v_current INTEGER;
  v_longest INTEGER;
  v_last DATE;
  v_grace_used BOOLEAN;
  v_grace_available BOOLEAN;
  v_grace_consumed BOOLEAN := FALSE;
  v_session_grace_consumed BOOLEAN := FALSE;
  v_broken_tier INTEGER;
  v_first_session_id UUID;
BEGIN
  SELECT (gs.ended_at AT TIME ZONE 'UTC')::DATE INTO v_day
  FROM game_sessions gs
  WHERE gs.id = p_session_id AND gs.player_id = p_player_id
    AND gs.ended_at IS NOT NULL AND gs.end_reason = 'completed';
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAY_DAY_SESSION_NOT_SETTLED'; END IF;

  INSERT INTO player_streaks(player_id, current_streak, longest_streak, last_play_date)
  VALUES (p_player_id, 0, 0, NULL) ON CONFLICT (player_id) DO NOTHING;

  INSERT INTO player_streak_rollout_baselines(
    player_id, current_streak, longest_streak, last_play_date,
    grace_period_used, grace_period_available
  )
  SELECT ps.player_id, ps.current_streak, ps.longest_streak, ps.last_play_date,
         ps.grace_period_used, ps.grace_period_available
  FROM player_streaks ps WHERE ps.player_id = p_player_id
  ON CONFLICT (player_id) DO NOTHING;

  INSERT INTO player_play_days(player_id, play_date, first_session_id)
  VALUES (p_player_id, v_day, p_session_id)
  ON CONFLICT (player_id, play_date) DO NOTHING;
  SELECT ppd.first_session_id INTO v_first_session_id
  FROM player_play_days ppd
  WHERE ppd.player_id = p_player_id AND ppd.play_date = v_day;

  PERFORM 1 FROM player_streaks ps WHERE ps.player_id = p_player_id FOR UPDATE;
  SELECT * INTO v_baseline FROM player_streak_rollout_baselines b
  WHERE b.player_id = p_player_id FOR UPDATE;

  v_current := v_baseline.current_streak;
  v_longest := v_baseline.longest_streak;
  v_last := v_baseline.last_play_date;
  v_grace_used := v_baseline.grace_period_used;
  v_grace_available := v_baseline.grace_period_available;

  FOR v_cursor IN
    SELECT ppd.play_date FROM player_play_days ppd
    WHERE ppd.player_id = p_player_id
      AND (v_baseline.last_play_date IS NULL
           OR ppd.play_date > v_baseline.last_play_date)
    ORDER BY ppd.play_date
  LOOP
    v_grace_consumed := FALSE;
    IF v_last = v_cursor THEN
      NULL;
    ELSIF v_last = v_cursor - 1 THEN
      v_current := v_current + 1;
    ELSIF v_last = v_cursor - 2 AND v_grace_available THEN
      v_current := v_current + 1;
      v_grace_consumed := TRUE;
      v_grace_available := FALSE;
      v_grace_used := TRUE;
    ELSIF v_last IS NULL THEN
      v_current := 1;
    ELSE
      SELECT COALESCE(MAX(i - 1), 0) INTO v_broken_tier
      FROM generate_subscripts(c_thresholds, 1) AS i
      WHERE c_thresholds[i] <= GREATEST(COALESCE(v_current, 0), 0);
      v_current := GREATEST(c_thresholds[GREATEST(v_broken_tier, 1)], 1);
    END IF;
    v_last := v_cursor;
    v_longest := GREATEST(v_longest, v_current);
    IF NOT v_grace_consumed
       AND v_current >= 7 AND v_current % 7 = 0 THEN
      v_grace_available := TRUE;
    END IF;
    IF v_cursor = v_day AND v_first_session_id = p_session_id THEN
      v_session_grace_consumed := v_grace_consumed;
    END IF;
  END LOOP;

  PERFORM set_config('app.atomic_streak_recompute', '1', TRUE);
  UPDATE player_streaks SET
    current_streak = v_current,
    longest_streak = GREATEST(longest_streak, v_longest),
    last_play_date = CASE
      WHEN last_play_date IS NULL THEN v_last
      WHEN v_last IS NULL THEN last_play_date
      ELSE GREATEST(last_play_date, v_last)
    END,
    grace_period_available = v_grace_available,
    grace_period_used = grace_period_used OR v_grace_used,
    updated_at = NOW()
  WHERE player_id = p_player_id;

  RETURN jsonb_build_object(
    'current', v_current,
    'longest', v_longest,
    'graceConsumed', v_session_grace_consumed,
    'playDate', v_day
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION record_game_session_play_day(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_game_session_play_day(UUID, UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION settle_game_session_reward(
  p_player_id UUID,
  p_session_id UUID,
  p_final_dna INTEGER,
  p_score INTEGER,
  p_validated BOOLEAN,
  p_metadata JSONB DEFAULT '{}'::JSONB
) RETURNS JSONB AS $$
DECLARE
  v_session game_sessions%ROWTYPE;
  v_existing game_reward_settlements%ROWTYPE;
  v_player players%ROWTYPE;
  v_high_before INTEGER;
  v_high_after INTEGER;
  v_applied BOOLEAN := FALSE;
BEGIN
  IF p_final_dna IS NULL OR p_final_dna < 0
     OR p_score IS NULL OR p_score < 0
     OR p_validated IS NULL
     OR p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_GAME_REWARD_INPUT';
  END IF;

  -- Session first, player second: every invocation takes locks in the same
  -- order. Distinct runs for one player serialize at the player row instead
  -- of overwriting an aggregate read by the other request.
  SELECT * INTO v_session
  FROM game_sessions gs
  WHERE gs.id = p_session_id AND gs.player_id = p_player_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GAME_REWARD_SESSION_NOT_FOUND'; END IF;

  IF v_session.ended_at IS NULL
     OR v_session.end_reason IS DISTINCT FROM 'completed'
     OR v_session.is_free_play IS TRUE
     OR v_session.reward_protocol IS DISTINCT FROM 'atomic_v1'
     OR v_session.atomic_reward_observed_at IS NULL THEN
    RAISE EXCEPTION 'GAME_REWARD_SESSION_NOT_SETTLED';
  END IF;
  PERFORM assert_atomic_progression_snapshot(v_session);

  -- The parameters are values already recomputed and stamped by the server
  -- route. Refuse any drift rather than letting even a service caller create
  -- a second version of session truth.
  IF COALESCE(v_session.dna_earned, 0)::BIGINT IS DISTINCT FROM p_final_dna
     OR COALESCE(v_session.score, 0)::BIGINT IS DISTINCT FROM p_score
     OR COALESCE(v_session.validated, FALSE) IS DISTINCT FROM p_validated THEN
    RAISE EXCEPTION 'GAME_REWARD_SESSION_MISMATCH';
  END IF;

  SELECT * INTO v_player FROM players p
  WHERE p.id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GAME_REWARD_PLAYER_NOT_FOUND'; END IF;

  -- Personal value itself follows completed-run order. This stage commits
  -- independently before every auxiliary progression system, so DNA/PB can
  -- never be rolled back by Codex, Records, Signal or clan availability.
  IF EXISTS (
    SELECT 1
    FROM game_sessions prior
    LEFT JOIN game_reward_settlements prior_reward
      ON prior_reward.session_id = prior.id
    WHERE prior.player_id = p_player_id
      AND prior.reward_protocol = 'atomic_v1'
      AND prior.atomic_reward_observed_at IS NOT NULL
      AND prior.ended_at IS NOT NULL
      AND prior.end_reason = 'completed'
      AND NOT COALESCE(prior.is_free_play, FALSE)
      AND (
        prior.atomic_reward_observed_at < v_session.atomic_reward_observed_at
        OR (
          prior.atomic_reward_observed_at = v_session.atomic_reward_observed_at
          AND prior.id::TEXT < v_session.id::TEXT
        )
      )
      AND prior_reward.session_id IS NULL
  ) THEN
    RAISE EXCEPTION 'GAME_REWARD_EARLIER_SESSION_PENDING';
  END IF;

  SELECT * INTO v_existing
  FROM game_reward_settlements grs
  WHERE grs.session_id = p_session_id;

  IF FOUND THEN
    IF v_existing.player_id IS DISTINCT FROM p_player_id
       OR v_existing.dna_awarded IS DISTINCT FROM p_final_dna
       OR v_existing.score IS DISTINCT FROM p_score
       OR v_existing.validated IS DISTINCT FROM p_validated THEN
      RAISE EXCEPTION 'GAME_REWARD_REPLAY_MISMATCH';
    END IF;
    v_high_before := v_existing.high_score_before;
    v_high_after := v_existing.high_score_after;
  ELSE
    v_high_before := GREATEST(COALESCE(v_player.high_score, 0), 0);
    v_high_after := CASE
      WHEN p_validated THEN GREATEST(v_high_before, p_score)
      ELSE v_high_before
    END;

    UPDATE players
    SET dna = COALESCE(dna, 0) + p_final_dna,
        total_games_played = COALESCE(total_games_played, 0) + 1,
        total_dna_earned = COALESCE(total_dna_earned, 0) + p_final_dna,
        high_score = v_high_after,
        updated_at = NOW()
    WHERE id = p_player_id
    RETURNING * INTO v_player;

    INSERT INTO game_reward_settlements(
      session_id, player_id, dna_awarded, score, validated,
      high_score_before, high_score_after
    ) VALUES (
      p_session_id, p_player_id, p_final_dna, p_score, p_validated,
      v_high_before, v_high_after
    );

    IF p_final_dna > 0 THEN
      INSERT INTO economy_transactions(
        player_id, resource_type, amount, balance_after,
        source_type, source_id, metadata
      ) VALUES (
        p_player_id, 'dna', p_final_dna, v_player.dna,
        'game_reward', p_session_id,
        p_metadata || jsonb_build_object(
          'score', p_score,
          'validated', p_validated,
          'server_session_id', p_session_id
        )
      );
    END IF;
    v_applied := TRUE;
  END IF;

  -- On replay return the player's current authoritative aggregates, while PB
  -- before/after remains the immutable truth for this particular run.
  SELECT * INTO v_player FROM players p WHERE p.id = p_player_id;
  RETURN jsonb_build_object(
    'applied', v_applied,
    'player', jsonb_build_object(
      'dna', COALESCE(v_player.dna, 0),
      'total_games_played', COALESCE(v_player.total_games_played, 0),
      'high_score', COALESCE(v_player.high_score, 0),
      'total_dna_earned', COALESCE(v_player.total_dna_earned, 0),
      'breeds_completed', COALESCE(v_player.breeds_completed, 0)
    ),
    'personal_best', jsonb_build_object(
      'eligible', p_validated,
      'before', v_high_before,
      'after', v_high_after,
      'improved', p_validated AND v_high_after > v_high_before
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION settle_game_session_reward(
  UUID, UUID, INTEGER, INTEGER, BOOLEAN, JSONB
) FROM PUBLIC, anon, authenticated, service_role;

-- Recovery entry point: inputs come only from the immutable server session,
-- never from a browser retry. It is a separate RPC/transaction from the
-- auxiliary progression core so earned DNA is secured first.
CREATE OR REPLACE FUNCTION settle_game_session_reward_from_snapshot(
  p_player_id UUID,
  p_session_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_session game_sessions%ROWTYPE;
  v_payload JSONB;
  v_result JSONB;
BEGIN
  SELECT * INTO v_session FROM game_sessions gs
  WHERE gs.id = p_session_id AND gs.player_id = p_player_id;
  IF NOT FOUND
     OR v_session.reward_protocol IS DISTINCT FROM 'atomic_v1'
     OR v_session.atomic_reward_observed_at IS NULL
     OR jsonb_typeof(v_session.progression_settlement_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'GAME_REWARD_SNAPSHOT_NOT_RECOVERABLE';
  END IF;
  PERFORM assert_atomic_progression_snapshot(v_session);
  v_payload := v_session.progression_settlement_payload;
  SELECT settle_game_session_reward(
    p_player_id,
    p_session_id,
    GREATEST(COALESCE(v_session.dna_earned, 0), 0),
    GREATEST(COALESCE(v_session.score, 0), 0),
    COALESCE(v_session.validated, FALSE),
    CASE WHEN jsonb_typeof(v_payload -> 'rewardMetadata') = 'object'
      THEN v_payload -> 'rewardMetadata' ELSE '{}'::JSONB END
      || jsonb_build_object('recovered_from_server_snapshot', TRUE)
  ) INTO v_result;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION settle_game_session_reward_from_snapshot(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION settle_game_session_reward_from_snapshot(UUID, UUID)
  TO service_role;

-- Records are presented per run, so a later completed session must not leak
-- into an earlier receipt merely because its core stage has not run yet.
-- General Chronicle refreshes see only atomic sessions whose core is durable;
-- the per-session fold additionally includes the current ordered cutoff.
CREATE OR REPLACE FUNCTION game_session_visible_to_record_fold(
  p_candidate_session_id UUID,
  p_cutoff_session_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_candidate game_sessions%ROWTYPE;
  v_cutoff game_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_candidate FROM game_sessions WHERE id = p_candidate_session_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_candidate.reward_protocol IS NULL THEN RETURN TRUE; END IF;

  IF p_cutoff_session_id IS NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM game_progression_settlements gps
      WHERE gps.session_id = v_candidate.id AND gps.core_result IS NOT NULL
    );
  END IF;

  SELECT * INTO v_cutoff FROM game_sessions WHERE id = p_cutoff_session_id;
  IF NOT FOUND
     OR v_cutoff.reward_protocol IS DISTINCT FROM 'atomic_v1'
     OR v_cutoff.atomic_reward_observed_at IS NULL THEN
    RAISE EXCEPTION 'RECORD_FOLD_CUTOFF_NOT_ATOMIC';
  END IF;
  RETURN v_candidate.atomic_reward_observed_at IS NOT NULL
    AND (
      v_candidate.atomic_reward_observed_at < v_cutoff.atomic_reward_observed_at
      OR (
        v_candidate.atomic_reward_observed_at = v_cutoff.atomic_reward_observed_at
        AND v_candidate.id::TEXT <= v_cutoff.id::TEXT
      )
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION game_session_visible_to_record_fold(UUID, UUID)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION refresh_player_records_at_session(
  p_player_id UUID,
  p_cutoff_session_id UUID
)
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
    AND gs.is_free_play IS NOT TRUE
    AND game_session_visible_to_record_fold(gs.id, p_cutoff_session_id);

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
     AND game_session_visible_to_record_fold(gs.id, p_cutoff_session_id)
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
    AND gs.is_free_play IS NOT TRUE
    AND game_session_visible_to_record_fold(gs.id, p_cutoff_session_id);

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
      AND game_session_visible_to_record_fold(gs.id, p_cutoff_session_id)
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION refresh_player_records_at_session(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION refresh_player_records_at_session(UUID, UUID)
  TO service_role;

-- Preserve the established one-argument API for Chronicle/background refresh.
-- Pending atomic sessions remain invisible until their ordered core commits.
CREATE OR REPLACE FUNCTION refresh_player_records(p_player_id UUID)
RETURNS JSONB AS $$
  SELECT refresh_player_records_at_session(p_player_id, NULL);
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION refresh_player_records(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION refresh_player_records(UUID)
  TO service_role;

-- Codex's 15-extraction visibility threshold follows the same observed-session
-- cutoff. The existing recorder remains responsible for atomic discoveries,
-- world firsts and DNA; this gate prevents a later B from unlocking A early.
CREATE OR REPLACE FUNCTION record_session_codex_discoveries(
  p_player_id UUID,
  p_session_id UUID,
  p_genome JSONB
) RETURNS JSONB AS $$
DECLARE
  v_session game_sessions%ROWTYPE;
  v_count BIGINT;
BEGIN
  SELECT * INTO v_session FROM game_sessions gs
  WHERE gs.id = p_session_id AND gs.player_id = p_player_id;
  IF NOT FOUND
     OR v_session.reward_protocol IS DISTINCT FROM 'atomic_v1'
     OR v_session.atomic_reward_observed_at IS NULL THEN
    RAISE EXCEPTION 'CODEX_SESSION_CUTOFF_NOT_ATOMIC';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM game_sessions gs
  WHERE gs.player_id = p_player_id
    AND gs.ended_at IS NOT NULL
    AND gs.validated IS TRUE
    AND gs.is_free_play IS NOT TRUE
    AND gs.extracted
    AND (
      gs.reward_protocol IS NULL
      OR (
        gs.atomic_reward_observed_at IS NOT NULL
        AND (
          gs.atomic_reward_observed_at < v_session.atomic_reward_observed_at
          OR (
            gs.atomic_reward_observed_at = v_session.atomic_reward_observed_at
            AND gs.id::TEXT <= v_session.id::TEXT
          )
        )
      )
    );

  IF v_count < 15 THEN
    RETURN jsonb_build_object(
      'discoveries', '[]'::JSONB,
      'rewardDna', 0,
      'genomeWeaverUnlocked', FALSE
    );
  END IF;
  RETURN record_codex_discoveries(p_player_id, p_session_id, p_genome);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION record_session_codex_discoveries(UUID, UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_session_codex_discoveries(UUID, UUID, JSONB)
  TO service_role;



-- One resumable transaction for every run-owned progression write whose
-- inputs are already frozen on game_sessions. The per-session core_result is
-- both the idempotency key (notably for additive Mastery XP) and the exact
-- presentation record for Codex firsts/world-firsts, ladder before/after,
-- streak, Records and clan contribution.
CREATE OR REPLACE FUNCTION settle_game_session_progression_core(
  p_player_id UUID,
  p_session_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_session game_sessions%ROWTYPE;
  v_progress game_progression_settlements%ROWTYPE;
  v_reward_row game_reward_settlements%ROWTYPE;
  v_payload JSONB;
  v_reward JSONB;
  v_codex JSONB := NULL;
  v_mastery JSONB := NULL;
  v_ladder JSONB := NULL;
  v_streak JSONB;
  v_records_before JSONB := '{}'::JSONB;
  v_records_after JSONB;
  v_player players%ROWTYPE;
  v_xp_gain BIGINT := 0;
  v_xp_before BIGINT := 0;
  v_xp_after BIGINT := 0;
  v_level_before INTEGER := 0;
  v_level_after INTEGER := 0;
  v_ladder_rung INTEGER := 0;
  v_ladder_before INTEGER := 0;
  v_ladder_after INTEGER := 0;
BEGIN
  SELECT * INTO v_session FROM game_sessions gs
  WHERE gs.id = p_session_id AND gs.player_id = p_player_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_session.ended_at IS NULL
     OR v_session.end_reason IS DISTINCT FROM 'completed'
     OR v_session.reward_protocol IS DISTINCT FROM 'atomic_v1'
     OR v_session.atomic_reward_observed_at IS NULL
     OR v_session.is_free_play IS TRUE
     OR jsonb_typeof(v_session.progression_settlement_payload) IS DISTINCT FROM 'object'
     OR COALESCE((v_session.progression_settlement_payload ->> 'v')::INTEGER, 0) <> 1 THEN
    RAISE EXCEPTION 'GAME_PROGRESSION_SESSION_NOT_RECOVERABLE';
  END IF;
  v_payload := v_session.progression_settlement_payload;
  IF v_payload ->> 'dynasty' IS DISTINCT FROM v_session.dynasty
     OR jsonb_typeof(v_payload -> 'validated') IS DISTINCT FROM 'boolean'
     OR (v_payload ->> 'validated')::BOOLEAN IS DISTINCT FROM COALESCE(v_session.validated, FALSE)
     OR jsonb_typeof(v_payload -> 'extracted') IS DISTINCT FROM 'boolean'
     OR (v_payload ->> 'extracted')::BOOLEAN IS DISTINCT FROM COALESCE(v_session.extracted, FALSE)
     OR jsonb_typeof(v_payload -> 'died') IS DISTINCT FROM 'boolean'
     OR (v_payload ->> 'died')::BOOLEAN IS DISTINCT FROM COALESCE(v_session.died, TRUE)
     OR jsonb_typeof(v_payload -> 'score') IS DISTINCT FROM 'number'
     OR (v_payload ->> 'score')::BIGINT IS DISTINCT FROM COALESCE(v_session.score, 0)::BIGINT
     OR jsonb_typeof(v_payload -> 'yieldDna') IS DISTINCT FROM 'number'
     OR (v_payload ->> 'yieldDna')::BIGINT IS DISTINCT FROM COALESCE(v_session.yield_dna, 0)::BIGINT
     OR jsonb_typeof(v_payload -> 'dnaCredited') IS DISTINCT FROM 'number'
     OR (v_payload ->> 'dnaCredited')::BIGINT IS DISTINCT FROM COALESCE(v_session.dna_earned, 0)::BIGINT
     OR jsonb_typeof(v_payload -> 'energyCommitted') IS DISTINCT FROM 'number'
     OR (v_payload ->> 'energyCommitted')::BIGINT IS DISTINCT FROM COALESCE(v_session.energy_committed, 0)::BIGINT
     OR jsonb_typeof(v_payload -> 'commitmentMultiplierBps') IS DISTINCT FROM 'number'
     OR (v_payload ->> 'commitmentMultiplierBps')::BIGINT IS DISTINCT FROM
       COALESCE(v_session.energy_harvest_multiplier_bps, 0)::BIGINT
     OR v_payload -> 'genome' IS DISTINCT FROM COALESCE(v_session.genome, 'null'::JSONB)
     OR (v_payload ->> 'settledAt')::TIMESTAMPTZ IS DISTINCT FROM v_session.ended_at THEN
    RAISE EXCEPTION 'GAME_PROGRESSION_SNAPSHOT_TRUTH_MISMATCH';
  END IF;

  -- Per-run milestone attribution is order-sensitive (Codex firsts, Mastery
  -- crossings, record tiers, streak output). Serialize the player's personal
  -- fold and refuse B until every earlier atomic session A has completed its
  -- personal core. Clan/Signal/receipt availability is deliberately excluded:
  -- a social or presentation outage must never delay later personal value.
  SELECT * INTO v_player FROM players p
  WHERE p.id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GAME_PROGRESSION_PLAYER_NOT_FOUND'; END IF;
  IF EXISTS (
    SELECT 1
    FROM game_sessions prior
    LEFT JOIN game_progression_settlements prior_progress
      ON prior_progress.session_id = prior.id
    WHERE prior.player_id = p_player_id
      AND prior.reward_protocol = 'atomic_v1'
      AND prior.atomic_reward_observed_at IS NOT NULL
      AND prior.ended_at IS NOT NULL
      AND prior.end_reason = 'completed'
      AND NOT COALESCE(prior.is_free_play, FALSE)
      AND (
        prior.atomic_reward_observed_at < v_session.atomic_reward_observed_at
        OR (
          prior.atomic_reward_observed_at = v_session.atomic_reward_observed_at
          AND prior.id::TEXT < v_session.id::TEXT
        )
      )
      AND prior_progress.core_result IS NULL
  ) THEN
    RAISE EXCEPTION 'GAME_PROGRESSION_EARLIER_SESSION_PENDING';
  END IF;

  INSERT INTO game_progression_settlements(session_id, player_id, snapshot)
  VALUES (p_session_id, p_player_id, v_payload)
  ON CONFLICT (session_id) DO NOTHING;

  SELECT * INTO v_progress FROM game_progression_settlements gps
  WHERE gps.session_id = p_session_id AND gps.player_id = p_player_id
  FOR UPDATE;
  IF NOT FOUND OR v_progress.snapshot IS DISTINCT FROM v_payload THEN
    RAISE EXCEPTION 'GAME_PROGRESSION_SNAPSHOT_MISMATCH';
  END IF;
  IF v_progress.core_result IS NOT NULL THEN RETURN v_progress.core_result; END IF;

  SELECT * INTO v_reward_row FROM game_reward_settlements grs
  WHERE grs.session_id = p_session_id AND grs.player_id = p_player_id;
  IF NOT FOUND OR v_reward_row.settlement_origin IS DISTINCT FROM 'atomic_v1' THEN
    RAISE EXCEPTION 'GAME_PROGRESSION_BASE_REWARD_PENDING';
  END IF;
  v_reward := jsonb_build_object(
    'applied', FALSE,
    'personal_best', jsonb_build_object(
      'eligible', v_reward_row.validated,
      'before', v_reward_row.high_score_before,
      'after', v_reward_row.high_score_after,
      'improved', v_reward_row.validated
        AND v_reward_row.high_score_after > v_reward_row.high_score_before
    )
  );

  IF COALESCE(v_session.validated, FALSE)
     AND jsonb_typeof(v_payload -> 'genome') = 'object' THEN
    SELECT record_session_codex_discoveries(
      p_player_id, p_session_id, v_payload -> 'genome'
    ) INTO v_codex;
  END IF;

  IF COALESCE(v_session.extracted, FALSE)
     AND jsonb_typeof(v_payload -> 'masteryXp') = 'number' THEN
    v_xp_gain := GREATEST(COALESCE((v_payload ->> 'masteryXp')::BIGINT, 0), 0);
    IF v_xp_gain > 0 THEN
      SELECT COALESCE(pm.xp, 0) INTO v_xp_before
      FROM player_mastery pm
      WHERE pm.player_id = p_player_id AND pm.dynasty = v_session.dynasty
      FOR UPDATE;
      v_xp_before := COALESCE(v_xp_before, 0);
      SELECT g.xp_after, g.level_after
      INTO v_xp_after, v_level_after
      FROM grant_mastery_xp(
        p_player_id, v_session.dynasty, v_xp_gain
      ) g;
      v_level_before := level_for_xp(v_xp_before);
      v_mastery := jsonb_build_object(
        'dynasty', v_session.dynasty,
        'xpGained', v_xp_gain,
        'xpBefore', v_xp_before,
        'xp', v_xp_after,
        'levelBefore', v_level_before,
        'level', v_level_after,
        'levelsGained', GREATEST(v_level_after - v_level_before, 0),
        'leveledUp', v_level_after > v_level_before
      );
    END IF;
  END IF;

  IF COALESCE(v_session.extracted, FALSE)
     AND jsonb_typeof(v_payload -> 'ladderRung') = 'number' THEN
    v_ladder_rung := GREATEST(COALESCE((v_payload ->> 'ladderRung')::INTEGER, 0), 0);
    IF v_ladder_rung > 0 THEN
      SELECT COALESCE(pl.best_rung, 0) INTO v_ladder_before
      FROM player_ladders pl
      WHERE pl.player_id = p_player_id AND pl.dynasty = v_session.dynasty
      FOR UPDATE;
      v_ladder_before := COALESCE(v_ladder_before, 0);
      SELECT record_ladder_rung(
        p_player_id, v_session.dynasty, v_ladder_rung
      ) INTO v_ladder_after;
      v_ladder := jsonb_build_object(
        'rung', v_ladder_rung,
        'before', v_ladder_before,
        'best', v_ladder_after
      );
    END IF;
  END IF;

  SELECT record_game_session_play_day(p_player_id, p_session_id) INTO v_streak;

  SELECT COALESCE(jsonb_object_agg(
    pr.record_id, jsonb_build_object('value', pr.value, 'tier', pr.tier)
  ), '{}'::JSONB) INTO v_records_before
  FROM player_records pr WHERE pr.player_id = p_player_id;
  SELECT refresh_player_records_at_session(
    p_player_id, p_session_id
  ) INTO v_records_after;

  SELECT * INTO v_player FROM players p WHERE p.id = p_player_id;
  v_progress.core_result := jsonb_build_object(
    'reward', v_reward,
    'player', jsonb_build_object(
      'dna', COALESCE(v_player.dna, 0),
      'total_games_played', COALESCE(v_player.total_games_played, 0),
      'high_score', COALESCE(v_player.high_score, 0),
      'total_dna_earned', COALESCE(v_player.total_dna_earned, 0),
      'breeds_completed', COALESCE(v_player.breeds_completed, 0)
    ),
    'codex', v_codex,
    'mastery', v_mastery,
    'ladder', v_ladder,
    'streak', v_streak,
    'records', jsonb_build_object(
      'previousRecords', v_records_before,
      'records', COALESCE(v_records_after -> 'records', '{}'::JSONB),
      'legacyScore', COALESCE((v_records_after ->> 'legacy_score')::INTEGER, 0)
    ),
    'snapshot', v_payload
  );

  UPDATE game_progression_settlements
  SET core_result = v_progress.core_result, updated_at = NOW()
  WHERE session_id = p_session_id;
  RETURN v_progress.core_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION settle_game_session_progression_core(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION settle_game_session_progression_core(UUID, UUID)
  TO service_role;

-- Clan contribution is a separately durable stage. A clan-table failure may
-- delay the social receipt, but can never roll back or delay personal DNA,
-- Codex, Mastery, ladder, streak or Records secured by the core transaction.
CREATE OR REPLACE FUNCTION capture_game_session_clan_result(
  p_player_id UUID,
  p_session_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_session game_sessions%ROWTYPE;
  v_reward game_reward_settlements%ROWTYPE;
  v_progress game_progression_settlements%ROWTYPE;
  v_payload JSONB;
  v_result JSONB;
  v_best_count INTEGER := 5;
  v_grace_seconds INTEGER := 10800;
  v_max_duration INTEGER := 10800;
BEGIN
  SELECT * INTO v_session FROM game_sessions gs
  WHERE gs.id = p_session_id AND gs.player_id = p_player_id;
  IF NOT FOUND
     OR v_session.reward_protocol IS DISTINCT FROM 'atomic_v1'
     OR v_session.atomic_reward_observed_at IS NULL
     OR jsonb_typeof(v_session.progression_settlement_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'GAME_PROGRESSION_SESSION_NOT_RECOVERABLE';
  END IF;
  SELECT * INTO v_reward FROM game_reward_settlements grs
  WHERE grs.session_id = p_session_id AND grs.player_id = p_player_id;
  IF NOT FOUND OR v_reward.settlement_origin IS DISTINCT FROM 'atomic_v1' THEN
    RAISE EXCEPTION 'GAME_PROGRESSION_BASE_REWARD_PENDING';
  END IF;
  INSERT INTO game_progression_settlements(session_id, player_id, snapshot)
  VALUES (p_session_id, p_player_id, v_session.progression_settlement_payload)
  ON CONFLICT (session_id) DO NOTHING;
  SELECT * INTO v_progress FROM game_progression_settlements gps
  WHERE gps.session_id = p_session_id AND gps.player_id = p_player_id
  FOR UPDATE;
  IF NOT FOUND OR v_progress.snapshot IS DISTINCT FROM v_session.progression_settlement_payload THEN
    RAISE EXCEPTION 'GAME_PROGRESSION_SNAPSHOT_MISMATCH';
  END IF;
  IF v_progress.clan_captured_at IS NOT NULL THEN
    RETURN jsonb_build_object('clan', v_progress.clan_result);
  END IF;

  -- Clan before/after and replacement recognition follows completed-run
  -- order independently of the personal core. A clan outage blocks only this
  -- social stage and its receipt, never DNA or personal progression.
  IF EXISTS (
    SELECT 1
    FROM game_sessions prior
    LEFT JOIN game_progression_settlements prior_progress
      ON prior_progress.session_id = prior.id
    JOIN game_sessions current_session ON current_session.id = p_session_id
    WHERE prior.player_id = p_player_id
      AND prior.reward_protocol = 'atomic_v1'
      AND prior.atomic_reward_observed_at IS NOT NULL
      AND prior.ended_at IS NOT NULL
      AND prior.end_reason = 'completed'
      AND NOT COALESCE(prior.is_free_play, FALSE)
      AND (
        prior.atomic_reward_observed_at < current_session.atomic_reward_observed_at
        OR (
          prior.atomic_reward_observed_at = current_session.atomic_reward_observed_at
          AND prior.id::TEXT < current_session.id::TEXT
        )
      )
      AND prior_progress.clan_captured_at IS NULL
  ) THEN
    RAISE EXCEPTION 'GAME_PROGRESSION_EARLIER_CLAN_PENDING';
  END IF;

  v_payload := v_progress.snapshot;
  IF jsonb_typeof(v_payload -> 'clan') = 'object' THEN
    v_best_count := LEAST(GREATEST(
      COALESCE((v_payload #>> '{clan,bestCount}')::INTEGER, 5), 1
    ), 20);
    v_grace_seconds := LEAST(GREATEST(
      COALESCE((v_payload #>> '{clan,completionGraceSeconds}')::INTEGER, 10800), 0
    ), 86400);
    v_max_duration := LEAST(GREATEST(
      COALESCE((v_payload #>> '{clan,maxRunDurationSeconds}')::INTEGER, 10800), 60
    ), 86400);
  END IF;
  SELECT record_clan_energy_contribution(
    p_session_id, v_best_count, v_grace_seconds, v_max_duration
  ) INTO v_result;

  UPDATE game_progression_settlements
  SET clan_result = v_result,
      clan_captured_at = NOW(),
      updated_at = NOW()
  WHERE session_id = p_session_id;
  RETURN jsonb_build_object('clan', v_result);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION capture_game_session_clan_result(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION capture_game_session_clan_result(UUID, UUID)
  TO service_role;

-- Ordered preflight that runs before the TypeScript Signal recompute can pay
-- a bonus or create milestones. It requires only base reward truth and its
-- own earlier Signal stages, never core or clan availability.
CREATE OR REPLACE FUNCTION prepare_game_session_signal_stage(
  p_player_id UUID,
  p_session_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_session game_sessions%ROWTYPE;
  v_reward game_reward_settlements%ROWTYPE;
  v_progress game_progression_settlements%ROWTYPE;
BEGIN
  SELECT * INTO v_session FROM game_sessions gs
  WHERE gs.id = p_session_id AND gs.player_id = p_player_id;
  IF NOT FOUND
     OR v_session.reward_protocol IS DISTINCT FROM 'atomic_v1'
     OR v_session.atomic_reward_observed_at IS NULL
     OR jsonb_typeof(v_session.progression_settlement_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'GAME_PROGRESSION_SESSION_NOT_RECOVERABLE';
  END IF;
  SELECT * INTO v_reward FROM game_reward_settlements grs
  WHERE grs.session_id = p_session_id AND grs.player_id = p_player_id;
  IF NOT FOUND OR v_reward.settlement_origin IS DISTINCT FROM 'atomic_v1' THEN
    RAISE EXCEPTION 'GAME_PROGRESSION_BASE_REWARD_PENDING';
  END IF;
  INSERT INTO game_progression_settlements(session_id, player_id, snapshot)
  VALUES (p_session_id, p_player_id, v_session.progression_settlement_payload)
  ON CONFLICT (session_id) DO NOTHING;
  SELECT * INTO v_progress FROM game_progression_settlements gps
  WHERE gps.session_id = p_session_id AND gps.player_id = p_player_id
  FOR UPDATE;
  IF NOT FOUND OR v_progress.snapshot IS DISTINCT FROM v_session.progression_settlement_payload THEN
    RAISE EXCEPTION 'GAME_PROGRESSION_SNAPSHOT_MISMATCH';
  END IF;
  IF v_progress.signal_captured_at IS NOT NULL THEN
    RETURN jsonb_build_object('captured', TRUE);
  END IF;
  IF EXISTS (
    SELECT 1
    FROM game_sessions prior
    LEFT JOIN game_progression_settlements prior_progress
      ON prior_progress.session_id = prior.id
    WHERE prior.player_id = p_player_id
      AND prior.reward_protocol = 'atomic_v1'
      AND prior.atomic_reward_observed_at IS NOT NULL
      AND prior.end_reason = 'completed'
      AND NOT COALESCE(prior.is_free_play, FALSE)
      AND (
        prior.atomic_reward_observed_at < v_session.atomic_reward_observed_at
        OR (
          prior.atomic_reward_observed_at = v_session.atomic_reward_observed_at
          AND prior.id::TEXT < v_session.id::TEXT
        )
      )
      AND prior_progress.signal_captured_at IS NULL
  ) THEN
    RAISE EXCEPTION 'GAME_PROGRESSION_EARLIER_SIGNAL_PENDING';
  END IF;
  UPDATE game_progression_settlements
  SET signal_prepared_at = COALESCE(signal_prepared_at, NOW()),
      updated_at = NOW()
  WHERE session_id = p_session_id;
  RETURN jsonb_build_object('captured', FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION prepare_game_session_signal_stage(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION prepare_game_session_signal_stage(UUID, UUID)
  TO service_role;

-- Signal value is already session/attempt-idempotent. Capture its canonical
-- DB state after the TypeScript server recompute so a crash after the bonus or
-- milestone write cannot erase exact post-run recognition.
CREATE OR REPLACE FUNCTION capture_game_session_signal_result(
  p_player_id UUID,
  p_session_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_progress game_progression_settlements%ROWTYPE;
  v_attempt signal_objective_runs%ROWTYPE;
  v_result JSONB := NULL;
  v_completed INTEGER := 0;
  v_milestones INTEGER := 0;
  v_player players%ROWTYPE;
  v_count_cutoff TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_progress FROM game_progression_settlements gps
  WHERE gps.session_id = p_session_id AND gps.player_id = p_player_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GAME_PROGRESSION_SIGNAL_NOT_PREPARED';
  END IF;
  IF v_progress.signal_prepared_at IS NULL THEN
    RAISE EXCEPTION 'GAME_PROGRESSION_SIGNAL_NOT_PREPARED';
  END IF;
  IF v_progress.signal_captured_at IS NOT NULL THEN
    SELECT * INTO v_player FROM players p WHERE p.id = p_player_id;
    RETURN jsonb_build_object(
      'signal', v_progress.signal_result,
      'player', jsonb_build_object(
        'dna', COALESCE(v_player.dna, 0),
        'total_games_played', COALESCE(v_player.total_games_played, 0),
        'high_score', COALESCE(v_player.high_score, 0),
        'total_dna_earned', COALESCE(v_player.total_dna_earned, 0),
        'breeds_completed', COALESCE(v_player.breeds_completed, 0)
      )
    );
  END IF;

  -- Preserve per-run cumulative Signal recognition without coupling it to
  -- personal settlement. An earlier delayed Signal stage is retried first by
  -- the ordered sweep; only this presentation stage waits.
  IF EXISTS (
    SELECT 1
    FROM game_sessions prior
    LEFT JOIN game_progression_settlements prior_progress
      ON prior_progress.session_id = prior.id
    JOIN game_sessions current_session ON current_session.id = p_session_id
    WHERE prior.player_id = p_player_id
      AND prior.reward_protocol = 'atomic_v1'
      AND prior.atomic_reward_observed_at IS NOT NULL
      AND prior.ended_at IS NOT NULL
      AND prior.end_reason = 'completed'
      AND NOT COALESCE(prior.is_free_play, FALSE)
      AND (
        prior.atomic_reward_observed_at < current_session.atomic_reward_observed_at
        OR (
          prior.atomic_reward_observed_at = current_session.atomic_reward_observed_at
          AND prior.id::TEXT < current_session.id::TEXT
        )
      )
      AND prior_progress.signal_captured_at IS NULL
  ) THEN
    RAISE EXCEPTION 'GAME_PROGRESSION_EARLIER_SIGNAL_PENDING';
  END IF;

  SELECT * INTO v_attempt FROM signal_objective_runs sor
  WHERE sor.session_id = p_session_id AND sor.player_id = p_player_id;
  IF FOUND THEN
    IF v_attempt.settled_at IS NULL THEN
      RAISE EXCEPTION 'GAME_PROGRESSION_SIGNAL_PENDING';
    END IF;
    v_count_cutoff := COALESCE(v_attempt.completed_at, v_attempt.settled_at);
    SELECT COUNT(*)::INTEGER INTO v_completed
    FROM signal_objective_runs sor
    WHERE sor.player_id = p_player_id AND sor.completed_at IS NOT NULL
      AND (
        sor.completed_at < v_count_cutoff
        OR (
          sor.completed_at = v_count_cutoff
          AND (v_attempt.completed_at IS NULL OR sor.id <= v_attempt.id)
        )
      );
    SELECT COUNT(*)::INTEGER INTO v_milestones
    FROM signal_milestones sm
    WHERE sm.player_id = p_player_id AND sm.day_id = v_attempt.day_id;
    v_result := jsonb_build_object(
      'runId', v_attempt.id,
      'completed', v_attempt.completed_at IS NOT NULL,
      'progress', GREATEST(COALESCE(v_attempt.progress, 0), 0),
      'target', GREATEST(COALESCE(v_attempt.target, 0), 0),
      'bonusDna', GREATEST(COALESCE(v_attempt.bonus_dna, 0), 0),
      'signalsCompleted', v_completed,
      'newMilestones', v_milestones,
      'skipped', FALSE
    );
  END IF;

  UPDATE game_progression_settlements
  SET signal_result = v_result,
      signal_captured_at = NOW(),
      updated_at = NOW()
  WHERE session_id = p_session_id;

  SELECT * INTO v_player FROM players p WHERE p.id = p_player_id;
  RETURN jsonb_build_object(
    'signal', v_result,
    'player', jsonb_build_object(
      'dna', COALESCE(v_player.dna, 0),
      'total_games_played', COALESCE(v_player.total_games_played, 0),
      'high_score', COALESCE(v_player.high_score, 0),
      'total_dna_earned', COALESCE(v_player.total_dna_earned, 0),
      'breeds_completed', COALESCE(v_player.breeds_completed, 0)
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION capture_game_session_signal_result(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION capture_game_session_signal_result(UUID, UUID)
  TO service_role;

-- Migration 049's independent Signal sweep remains the compatibility path
-- for historical attempts. For atomic_v1 sessions, however, settlement must
-- first pass the ordered durable preflight above. This table-boundary guard
-- prevents any current or future service caller from bypassing that ordering
-- and paying a later run's bonus before an earlier run is visible.
CREATE OR REPLACE FUNCTION guard_atomic_signal_settlement()
RETURNS TRIGGER AS $$
DECLARE
  v_session game_sessions%ROWTYPE;
BEGIN
  IF NEW.progress IS NOT DISTINCT FROM OLD.progress
     AND NEW.completed_at IS NOT DISTINCT FROM OLD.completed_at
     AND NEW.settled_at IS NOT DISTINCT FROM OLD.settled_at
     AND NEW.bonus_dna IS NOT DISTINCT FROM OLD.bonus_dna
     AND NEW.bonus_paid_at IS NOT DISTINCT FROM OLD.bonus_paid_at THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_session FROM game_sessions gs WHERE gs.id = NEW.session_id;
  IF FOUND AND v_session.reward_protocol = 'atomic_v1' THEN
    IF NOT EXISTS (
      SELECT 1 FROM game_progression_settlements gps
      WHERE gps.session_id = v_session.id
        AND gps.player_id = v_session.player_id
        AND gps.signal_prepared_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'ATOMIC_SIGNAL_PREFLIGHT_REQUIRED';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION guard_atomic_signal_settlement()
  FROM PUBLIC, anon, authenticated;
CREATE TRIGGER atomic_signal_settlement_guard
BEFORE UPDATE OF progress, completed_at, settled_at, bonus_dna, bonus_paid_at
ON signal_objective_runs
FOR EACH ROW EXECUTE FUNCTION guard_atomic_signal_settlement();

-- The receipt is presentation, but its validation/PB block is not authored by
-- presentation code. Enforce equality with the immutable reward ledger at the
-- table boundary so no API or future service caller can invent PB progress.
CREATE OR REPLACE FUNCTION validate_run_impact_server_truth()
RETURNS TRIGGER AS $$
DECLARE
  v_session game_sessions%ROWTYPE;
  v_reward game_reward_settlements%ROWTYPE;
  v_pb JSONB;
BEGIN
  SELECT * INTO v_session FROM game_sessions WHERE id = NEW.session_id;
  SELECT * INTO v_reward FROM game_reward_settlements WHERE session_id = NEW.session_id;
  IF v_session.id IS NULL OR v_reward.session_id IS NULL THEN
    RAISE EXCEPTION 'RUN_IMPACT_REWARD_TRUTH_MISSING';
  END IF;
  v_pb := NEW.envelope #> '{receipt,personalBest}';
  IF v_session.player_id IS DISTINCT FROM NEW.player_id
     OR v_reward.player_id IS DISTINCT FROM NEW.player_id
     OR jsonb_typeof(NEW.envelope #> '{receipt,validated}') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(v_pb) IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_pb -> 'eligible') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(v_pb -> 'before') IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_pb -> 'after') IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_pb -> 'improved') IS DISTINCT FROM 'boolean'
     OR COALESCE((NEW.envelope #>> '{receipt,validated}')::BOOLEAN, FALSE)
       IS DISTINCT FROM COALESCE(v_session.validated, FALSE)
     OR (NEW.envelope #>> '{receipt,score}')::BIGINT
       IS DISTINCT FROM COALESCE(v_session.score, 0)::BIGINT
     OR (NEW.envelope #>> '{receipt,yieldDna}')::BIGINT
       IS DISTINCT FROM COALESCE(v_session.yield_dna, 0)::BIGINT
     OR (NEW.envelope #>> '{receipt,dnaCredited}')::BIGINT
       IS DISTINCT FROM v_reward.dna_awarded
     OR COALESCE((v_pb ->> 'eligible')::BOOLEAN, FALSE)
       IS DISTINCT FROM v_reward.validated
     OR (v_pb ->> 'before')::BIGINT IS DISTINCT FROM v_reward.high_score_before
     OR (v_pb ->> 'after')::BIGINT IS DISTINCT FROM v_reward.high_score_after
     OR COALESCE((v_pb ->> 'improved')::BOOLEAN, FALSE)
       IS DISTINCT FROM (v_reward.validated AND v_reward.high_score_after > v_reward.high_score_before) THEN
    RAISE EXCEPTION 'RUN_IMPACT_REWARD_TRUTH_MISMATCH';
  END IF;
  IF NOT v_reward.validated AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(NEW.envelope -> 'impacts') = 'array'
        THEN NEW.envelope -> 'impacts' ELSE '[]'::JSONB END
    ) impact
    WHERE impact ->> 'kind' = 'lineage_run'
       OR impact ->> 'pillar' = 'lineage'
  ) THEN
    RAISE EXCEPTION 'INVALID_RUN_CANNOT_CLAIM_LINEAGE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION validate_run_impact_server_truth()
  FROM PUBLIC, anon, authenticated;
CREATE TRIGGER run_impact_receipt_server_truth
BEFORE INSERT OR UPDATE OF envelope ON run_impact_receipts
FOR EACH ROW EXECUTE FUNCTION validate_run_impact_server_truth();

-- A permanent moment must point to a real, stable artifact. Empty references
-- produce dead Chronicle rows and badges that cannot lead anywhere.
ALTER TABLE progression_moments
  ALTER COLUMN artifact_ref SET NOT NULL;
ALTER TABLE progression_moments
  ADD CONSTRAINT progression_moments_artifact_ref_nonblank
  CHECK (char_length(BTRIM(artifact_ref)) BETWEEN 1 AND 300);

-- Clan Depth on a specimen means its score in the player's CURRENT counted
-- best set, not every run that happened to enter that set once. Replacements
-- can cross specimens, so contribution rank changes update the immutable run
-- ledger and recompute both affected specimen totals from that ledger.
CREATE OR REPLACE FUNCTION recompute_lineage_specimen_clan_depth(
  p_specimen_id UUID
) RETURNS VOID AS $$
BEGIN
  UPDATE lineage_specimens ls
  SET clan_depth_delivered = COALESCE((
        SELECT SUM(lsr.clan_depth_delivered)
        FROM lineage_specimen_runs lsr
        WHERE lsr.specimen_id = p_specimen_id
      ), 0),
      updated_at = NOW()
  WHERE ls.specimen_id = p_specimen_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION sync_lineage_session_clan_depth(
  p_session_id UUID
) RETURNS VOID AS $$
DECLARE
  v_specimen_id UUID;
  v_depth BIGINT;
BEGIN
  SELECT lsr.specimen_id INTO v_specimen_id
  FROM lineage_specimen_runs lsr
  WHERE lsr.session_id = p_session_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE((
    SELECT c.score
    FROM clan_energy_contributions c
    WHERE c.session_id = p_session_id AND c.counted IS TRUE
  ), 0) INTO v_depth;

  UPDATE lineage_specimen_runs
  SET clan_depth_delivered = GREATEST(v_depth, 0)
  WHERE session_id = p_session_id
    AND clan_depth_delivered IS DISTINCT FROM GREATEST(v_depth, 0);

  PERFORM recompute_lineage_specimen_clan_depth(v_specimen_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION sync_lineage_depth_from_contribution()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM sync_lineage_session_clan_depth(NEW.session_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER clan_contribution_sync_lineage_depth
AFTER INSERT OR UPDATE OF counted, score ON clan_energy_contributions
FOR EACH ROW EXECUTE FUNCTION sync_lineage_depth_from_contribution();

-- Reconcile the migration-time backfill to the final counted set before the
-- schema becomes visible. This is a recompute, so replay is convergent.
UPDATE lineage_specimen_runs lsr
SET clan_depth_delivered = COALESCE((
  SELECT c.score FROM clan_energy_contributions c
  WHERE c.session_id = lsr.session_id AND c.counted IS TRUE
), 0)
WHERE lsr.clan_depth_delivered IS DISTINCT FROM COALESCE((
  SELECT c.score FROM clan_energy_contributions c
  WHERE c.session_id = lsr.session_id AND c.counted IS TRUE
), 0);

UPDATE lineage_specimens ls
SET clan_depth_delivered = COALESCE((
      SELECT SUM(lsr.clan_depth_delivered)
      FROM lineage_specimen_runs lsr
      WHERE lsr.specimen_id = ls.specimen_id
    ), 0),
    updated_at = NOW();

-- Protocol-NULL history predates canonical receipts and remains read-only.
-- The application-first cutover and trigger above make new legacy
-- completions impossible; recovery operates only on atomic_v1 snapshots.

CREATE OR REPLACE FUNCTION list_pending_game_progression_sessions(
  p_limit INTEGER DEFAULT 100
) RETURNS TABLE(player_id UUID, session_id UUID, reward_protocol TEXT) AS $$
BEGIN
  RETURN QUERY
  WITH earliest_per_player AS (
    SELECT DISTINCT ON (gs.player_id)
      gs.id, gs.player_id, gs.reward_protocol,
      gs.atomic_reward_observed_at,
      gs.progression_recovery_attempted_at
    FROM game_sessions gs
    LEFT JOIN run_impact_receipts rir ON rir.session_id = gs.id
    WHERE gs.ended_at IS NOT NULL
      AND gs.end_reason = 'completed'
      AND NOT COALESCE(gs.is_free_play, FALSE)
      AND rir.session_id IS NULL
      AND gs.reward_protocol = 'atomic_v1'
      AND gs.atomic_reward_observed_at IS NOT NULL
    ORDER BY gs.player_id, gs.atomic_reward_observed_at, gs.id
  ), candidates AS (
    SELECT gs.id
    FROM game_sessions gs
    JOIN earliest_per_player earliest ON earliest.id = gs.id
    ORDER BY gs.progression_recovery_attempted_at NULLS FIRST,
             gs.atomic_reward_observed_at, gs.id
    FOR UPDATE OF gs SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)
  ), claimed AS (
    UPDATE game_sessions gs
    SET progression_recovery_attempted_at = clock_timestamp(),
        progression_recovery_attempts = gs.progression_recovery_attempts + 1
    FROM candidates c
    WHERE gs.id = c.id
    RETURNING gs.player_id, gs.id, gs.reward_protocol,
              gs.progression_recovery_attempted_at,
              gs.atomic_reward_observed_at
  )
  SELECT claimed.player_id, claimed.id, claimed.reward_protocol
  FROM claimed
  ORDER BY claimed.progression_recovery_attempted_at,
           claimed.atomic_reward_observed_at, claimed.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION list_pending_game_progression_sessions(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION list_pending_game_progression_sessions(INTEGER)
  TO service_role;

REVOKE ALL ON FUNCTION recompute_lineage_specimen_clan_depth(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sync_lineage_session_clan_depth(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sync_lineage_depth_from_contribution()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION get_career_settlement_capability()
RETURNS JSONB AS $$
  SELECT jsonb_build_object(
    'status', 'ready',
    'bridgeVersion', 1,
    'careerVersion', 1
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION get_career_settlement_capability()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_career_settlement_capability()
  TO service_role;

-- Release capability probe. This is deliberately the final function defined
-- by the migration: version 1 is visible only after exact artifact attention,
-- atomic session settlement, immutable PB truth and final-best-set lineage
-- reconciliation all exist in the same committed transaction.
CREATE OR REPLACE FUNCTION get_career_spine_capability()
RETURNS JSONB AS $$
  SELECT jsonb_build_object(
    'version', 1,
    'exactArtifactAttention', TRUE,
    'atomicSettlement', TRUE,
    'lineageHistory', TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION get_career_spine_capability()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_career_spine_capability() TO service_role;

COMMIT;
