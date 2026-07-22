-- Migration 031: Buildcraft: The Genome - Codex
--
-- The Codex is account progression derived only from validator-accepted
-- Genome records. Personal discoveries are private; the world-first ledger
-- deliberately stores no player identifier and is safe for public reading.
-- Discovery DNA is atomic and idempotent with the personal Codex insert.

-- ---------------------------------------------------------------------------
-- 1. Personal discoveries + privacy-safe world-first ledger
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS player_codex (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  discovery_type TEXT NOT NULL CHECK (
    discovery_type IN ('gene', 'splice', 'expression', 'apex')
  ),
  entry_id TEXT NOT NULL,
  first_session_id UUID REFERENCES game_sessions(id) ON DELETE SET NULL,
  first_discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, discovery_type, entry_id)
);

CREATE INDEX IF NOT EXISTS player_codex_discovered_at_idx
  ON player_codex (player_id, first_discovered_at DESC);

ALTER TABLE player_codex ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS player_codex_select_own ON player_codex;
CREATE POLICY player_codex_select_own ON player_codex
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

CREATE TABLE IF NOT EXISTS codex_first_discoveries (
  discovery_type TEXT NOT NULL CHECK (
    discovery_type IN ('gene', 'splice', 'expression', 'apex')
  ),
  entry_id TEXT NOT NULL,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (discovery_type, entry_id)
);

ALTER TABLE codex_first_discoveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS codex_first_discoveries_public_read
  ON codex_first_discoveries;
CREATE POLICY codex_first_discoveries_public_read
  ON codex_first_discoveries FOR SELECT USING (TRUE);

COMMENT ON TABLE codex_first_discoveries IS
  'Privacy-safe Genome world-first ledger. It intentionally contains no player UUID.';

-- ---------------------------------------------------------------------------
-- 2. Completion cosmetic (cosmetic only; zero gameplay power)
-- ---------------------------------------------------------------------------

INSERT INTO cosmetic_definitions (id, name, slot, rarity, render) VALUES (
  'genome_weaver',
  'Genome Weaver',
  'board_accent',
  'legendary',
  '{"kind":"board_accent","palette":["#f5c542","#42e0f5","#5ff542","#a642f5","#f54263"],"animated":true}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Economy source: 030 values + codex discovery grants
-- ---------------------------------------------------------------------------

ALTER TABLE economy_transactions
  DROP CONSTRAINT IF EXISTS economy_transactions_source_type_check;
ALTER TABLE economy_transactions
  ADD CONSTRAINT economy_transactions_source_type_check CHECK (source_type IN (
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
    'clan_tithe',
    'premium_stipend',
    'lineage_reroll',
    'codex_discovery'
  ));

-- ---------------------------------------------------------------------------
-- 4. Atomic discovery recorder
--
-- Input is the validator-accepted GenomeRunRecord, never the raw request.
-- Rewards: splice 250, first Expression/strain 150, first Apex/strain 400.
-- Gene discoveries are tracked for catalog completion but award no DNA.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION record_codex_discoveries(
  p_player_id UUID,
  p_session_id UUID,
  p_genome JSONB
) RETURNS JSONB AS $$
DECLARE
  v_candidate RECORD;
  v_inserted INTEGER;
  v_world_first BOOLEAN;
  v_reward INTEGER;
  v_reward_total INTEGER := 0;
  v_balance INTEGER;
  v_discoveries JSONB := '[]'::jsonb;
  v_weaver_unlocked BOOLEAN := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM game_sessions gs
    WHERE gs.id = p_session_id
      AND gs.player_id = p_player_id
      AND gs.ended_at IS NOT NULL
      AND gs.validated IS TRUE
      AND COALESCE(gs.is_free_play, false) = false
  ) THEN
    RAISE EXCEPTION 'Completed earning session not found';
  END IF;

  -- FTUE §12: the Codex is invisible and records no discoveries before
  -- 15 validated earning extractions. This query runs after the session
  -- end write, so the player's 15th bank opens the archive immediately.
  IF (
    SELECT COUNT(*)
    FROM game_sessions gs
    WHERE gs.player_id = p_player_id
      AND gs.ended_at IS NOT NULL
      AND gs.validated IS TRUE
      AND gs.is_free_play IS NOT TRUE
      AND gs.extracted
  ) < 15 THEN
    RETURN jsonb_build_object(
      'discoveries', v_discoveries,
      'rewardDna', 0,
      'genomeWeaverUnlocked', false
    );
  END IF;

  IF p_genome IS NULL
     OR jsonb_typeof(p_genome) <> 'object'
     OR COALESCE(p_genome ->> 'v', '') <> '1' THEN
    RETURN jsonb_build_object(
      'discoveries', v_discoveries,
      'rewardDna', 0,
      'genomeWeaverUnlocked', false
    );
  END IF;

  FOR v_candidate IN
    WITH candidates(discovery_type, entry_id) AS (
      SELECT 'gene'::TEXT, pick ->> 'id'
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(p_genome -> 'picks') = 'array'
          THEN p_genome -> 'picks' ELSE '[]'::jsonb END
      ) AS pick
      UNION
      SELECT 'splice'::TEXT, splice ->> 'id'
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(p_genome -> 'splices') = 'array'
          THEN p_genome -> 'splices' ELSE '[]'::jsonb END
      ) AS splice
      UNION
      SELECT 'expression'::TEXT, expression.key
      FROM jsonb_each(
        CASE WHEN jsonb_typeof(p_genome -> 'expressions') = 'object'
          THEN p_genome -> 'expressions' ELSE '{}'::jsonb END
      ) AS expression
      UNION
      SELECT 'apex'::TEXT, apex.key
      FROM jsonb_each(
        CASE WHEN jsonb_typeof(p_genome -> 'apexes') = 'object'
          THEN p_genome -> 'apexes' ELSE '{}'::jsonb END
      ) AS apex
    )
    SELECT DISTINCT c.discovery_type, c.entry_id
    FROM candidates c
    WHERE c.entry_id IS NOT NULL
      AND (
        (c.discovery_type = 'gene' AND EXISTS (
          SELECT 1 FROM gene_definitions gd
          WHERE gd.id = c.entry_id AND gd.active
        ))
        OR (c.discovery_type = 'splice' AND EXISTS (
          SELECT 1 FROM splice_definitions sd
          WHERE sd.id = c.entry_id AND sd.active
        ))
        OR (
          c.discovery_type IN ('expression', 'apex')
          AND c.entry_id IN ('AURUM','VOLT','FERAL','FLUX','UMBRA')
        )
      )
    ORDER BY c.discovery_type, c.entry_id
  LOOP
    INSERT INTO player_codex (
      player_id, discovery_type, entry_id, first_session_id
    ) VALUES (
      p_player_id,
      v_candidate.discovery_type,
      v_candidate.entry_id,
      p_session_id
    )
    ON CONFLICT (player_id, discovery_type, entry_id) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    IF v_inserted = 1 THEN
      v_reward := CASE v_candidate.discovery_type
        WHEN 'splice' THEN 250
        WHEN 'expression' THEN 150
        WHEN 'apex' THEN 400
        ELSE 0
      END;
      v_reward_total := v_reward_total + v_reward;

      INSERT INTO codex_first_discoveries (discovery_type, entry_id)
      VALUES (v_candidate.discovery_type, v_candidate.entry_id)
      ON CONFLICT (discovery_type, entry_id) DO NOTHING;
      GET DIAGNOSTICS v_inserted = ROW_COUNT;
      v_world_first := v_inserted = 1;

      v_discoveries := v_discoveries || jsonb_build_array(
        jsonb_build_object(
          'type', v_candidate.discovery_type,
          'entryId', v_candidate.entry_id,
          'rewardDna', v_reward,
          'worldFirst', v_world_first
        )
      );
    END IF;
  END LOOP;

  IF v_reward_total > 0 THEN
    UPDATE players
    SET dna = dna + v_reward_total
    WHERE id = p_player_id
    RETURNING dna INTO v_balance;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Player not found';
    END IF;

    INSERT INTO economy_transactions (
      player_id, resource_type, amount, balance_after,
      source_type, source_id, metadata
    ) VALUES (
      p_player_id, 'dna', v_reward_total, v_balance,
      'codex_discovery', p_session_id,
      jsonb_build_object('discoveries', v_discoveries)
    );
  END IF;

  -- 100% means every active catalog gene and splice plus all five
  -- Expressions and all five Apexes. The grant is idempotent.
  IF NOT EXISTS (
       SELECT 1 FROM gene_definitions gd
       WHERE gd.active AND NOT EXISTS (
         SELECT 1 FROM player_codex pc
         WHERE pc.player_id = p_player_id
           AND pc.discovery_type = 'gene'
           AND pc.entry_id = gd.id
       )
     )
     AND NOT EXISTS (
       SELECT 1 FROM splice_definitions sd
       WHERE sd.active AND NOT EXISTS (
         SELECT 1 FROM player_codex pc
         WHERE pc.player_id = p_player_id
           AND pc.discovery_type = 'splice'
           AND pc.entry_id = sd.id
       )
     )
     AND 5 = (
       SELECT COUNT(*) FROM player_codex pc
       WHERE pc.player_id = p_player_id
         AND pc.discovery_type = 'expression'
         AND pc.entry_id IN ('AURUM','VOLT','FERAL','FLUX','UMBRA')
     )
     AND 5 = (
       SELECT COUNT(*) FROM player_codex pc
       WHERE pc.player_id = p_player_id
         AND pc.discovery_type = 'apex'
         AND pc.entry_id IN ('AURUM','VOLT','FERAL','FLUX','UMBRA')
     ) THEN
    INSERT INTO player_cosmetics (player_id, cosmetic_id, source)
    VALUES (p_player_id, 'genome_weaver', 'codex_completion')
    ON CONFLICT (player_id, cosmetic_id) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    v_weaver_unlocked := v_inserted = 1;
  END IF;

  RETURN jsonb_build_object(
    'discoveries', v_discoveries,
    'rewardDna', v_reward_total,
    'genomeWeaverUnlocked', v_weaver_unlocked
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION record_codex_discoveries(UUID, UUID, JSONB)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION record_codex_discoveries(UUID, UUID, JSONB)
  FROM anon;
REVOKE EXECUTE ON FUNCTION record_codex_discoveries(UUID, UUID, JSONB)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION record_codex_discoveries(UUID, UUID, JSONB)
  TO service_role;

GRANT SELECT ON player_codex TO authenticated;
GRANT SELECT ON codex_first_discoveries TO authenticated;
GRANT SELECT ON codex_first_discoveries TO anon;
