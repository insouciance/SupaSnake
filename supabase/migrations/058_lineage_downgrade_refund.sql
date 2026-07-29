-- =============================================================================
-- Migration 058: voluntary lineage downgrade with an exact DNA refund
-- =============================================================================
--
-- A downgrade is an exchange initiated by the owner, not confiscation: the
-- exact DNA recorded on the breeding receipt returns in full and the resulting
-- snake leaves the active collection. The breeding event itself remains in
-- history, including immutable snapshots of both parents and the child.
--
-- One call unwinds one breeding step. Repeating the action can walk a lineage
-- back further, but only from the leaves inward: a snake that still has an
-- active descendant cannot be removed from underneath it.

BEGIN;

-- Refund audit. `child_id` is intentionally still ON DELETE SET NULL; the
-- stable id and complete display snapshot below survive removal of the active
-- collection row.
ALTER TABLE breeding_history
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_child_id UUID,
  ADD COLUMN IF NOT EXISTS refund_snapshot JSONB;

ALTER TABLE breeding_history
  DROP CONSTRAINT IF EXISTS breeding_history_refund_complete;
ALTER TABLE breeding_history
  ADD CONSTRAINT breeding_history_refund_complete CHECK (
    (refunded_at IS NULL AND refunded_child_id IS NULL AND refund_snapshot IS NULL)
    OR
    (refunded_at IS NOT NULL AND refunded_child_id IS NOT NULL AND refund_snapshot IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_breeding_history_refunded_child
  ON breeding_history(refunded_child_id)
  WHERE refunded_child_id IS NOT NULL;

-- Historical events must outlive a later downgrade of either parent. The old
-- CASCADE would erase an already-refunded descendant's pedigree when its
-- parent was unwound next. Parent joins may become NULL; `refund_snapshot`
-- keeps the names, generations, rarity, traits and lineage that were true at
-- the time of the exchange.
ALTER TABLE breeding_history
  DROP CONSTRAINT IF EXISTS breeding_history_parent1_id_fkey,
  DROP CONSTRAINT IF EXISTS breeding_history_parent2_id_fkey;

ALTER TABLE breeding_history
  ALTER COLUMN parent1_id DROP NOT NULL,
  ALTER COLUMN parent2_id DROP NOT NULL;

ALTER TABLE breeding_history
  ADD CONSTRAINT breeding_history_parent1_id_fkey
    FOREIGN KEY (parent1_id) REFERENCES collected_snakes(id) ON DELETE SET NULL,
  ADD CONSTRAINT breeding_history_parent2_id_fkey
    FOREIGN KEY (parent2_id) REFERENCES collected_snakes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_collected_snakes_parent1
  ON collected_snakes(parent1_id) WHERE parent1_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_collected_snakes_parent2
  ON collected_snakes(parent2_id) WHERE parent2_id IS NOT NULL;

COMMENT ON COLUMN breeding_history.refunded_at IS
  'When the player voluntarily unwound this breeding and received dna_cost in full.';
COMMENT ON COLUMN breeding_history.refunded_child_id IS
  'Stable id of the removed child; child_id becomes NULL through its FK on downgrade.';
COMMENT ON COLUMN breeding_history.refund_snapshot IS
  'Immutable parent/child display facts captured before a refunded child leaves the active collection.';

CREATE OR REPLACE FUNCTION downgrade_snake_generation(
  p_player_id UUID,
  p_snake_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_snake                RECORD;
  v_history              RECORD;
  v_player_dna           INTEGER;
  v_new_balance          INTEGER;
  v_to_generation        INTEGER;
  v_was_equipped         BOOLEAN := FALSE;
  v_replacement_id       UUID;
  v_replacement_dynasty  TEXT;
  v_snapshot             JSONB;
BEGIN
  -- The same per-player lock used by equip_snake serializes the wallet and
  -- equipment writes with every other Lab action.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_player_id::TEXT, 0));

  SELECT cs.*, sv.dynasty_id AS source_dynasty_id
  INTO v_snake
  FROM collected_snakes cs
  JOIN snake_variants sv ON sv.id = cs.snake_variant_id
  WHERE cs.id = p_snake_id
    AND cs.player_id = p_player_id
  FOR UPDATE OF cs;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snake not found in your active collection';
  END IF;

  IF v_snake.acquired_method IS DISTINCT FROM 'bred' OR v_snake.generation <= 1 THEN
    RAISE EXCEPTION 'Only a bred generation can be downgraded';
  END IF;

  -- The main Lab exposes only the highest generation. Enforce that same rule
  -- server-side so a stale or crafted request cannot remove hidden ancestry.
  IF EXISTS (
    SELECT 1
    FROM collected_snakes newer
    WHERE newer.player_id = p_player_id
      AND newer.snake_variant_id = v_snake.snake_variant_id
      AND newer.generation > v_snake.generation
  ) THEN
    RAISE EXCEPTION 'Only the highest active generation can be downgraded';
  END IF;

  -- Unwind from leaves inward. `breed_snakes` locks its parents, so the lock
  -- on v_snake also prevents a child from being committed across this check.
  IF EXISTS (
    SELECT 1
    FROM collected_snakes descendant
    WHERE descendant.player_id = p_player_id
      AND (
        descendant.parent1_id = p_snake_id
        OR descendant.parent2_id = p_snake_id
      )
  ) THEN
    RAISE EXCEPTION 'Downgrade descendants first';
  END IF;

  -- A second tab must not erase the snake identity beneath an open run.
  IF EXISTS (
    SELECT 1
    FROM game_sessions active_run
    WHERE active_run.player_id = p_player_id
      AND active_run.snake_used_id = p_snake_id
      AND active_run.ended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Finish the active run before downgrading this snake';
  END IF;

  SELECT bh.*
  INTO v_history
  FROM breeding_history bh
  WHERE bh.player_id = p_player_id
    AND bh.child_id = p_snake_id
    AND bh.refunded_at IS NULL
  ORDER BY bh.bred_at DESC, bh.id DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR v_history.dna_cost IS NULL OR v_history.dna_cost <= 0 THEN
    RAISE EXCEPTION 'No refundable breeding receipt was found';
  END IF;

  SELECT dna INTO v_player_dna
  FROM players
  WHERE id = p_player_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  IF v_player_dna > 2147483647 - v_history.dna_cost THEN
    RAISE EXCEPTION 'DNA balance cannot hold the full refund';
  END IF;

  v_new_balance := v_player_dna + v_history.dna_cost;

  SELECT COALESCE(MAX(older.generation), 1)
  INTO v_to_generation
  FROM collected_snakes older
  WHERE older.player_id = p_player_id
    AND older.snake_variant_id = v_snake.snake_variant_id
    AND older.id <> p_snake_id;

  SELECT
    COALESCE(v_snake.is_equipped, FALSE)
    OR EXISTS (
      SELECT 1 FROM player_settings ps
      WHERE ps.player_id = p_player_id AND ps.active_snake_id = p_snake_id
    )
  INTO v_was_equipped;

  IF v_was_equipped THEN
    -- Same variant first, then same dynasty, then the strongest remaining
    -- owned snake. The exchange never leaves the player without equipment.
    SELECT cs.id, d.name
    INTO v_replacement_id, v_replacement_dynasty
    FROM collected_snakes cs
    JOIN snake_variants sv ON sv.id = cs.snake_variant_id
    JOIN dynasties d ON d.id = sv.dynasty_id
    WHERE cs.player_id = p_player_id
      AND cs.id <> p_snake_id
    ORDER BY
      CASE WHEN cs.snake_variant_id = v_snake.snake_variant_id THEN 0 ELSE 1 END,
      CASE WHEN sv.dynasty_id = v_snake.source_dynasty_id THEN 0 ELSE 1 END,
      cs.generation DESC,
      cs.is_favorited DESC,
      cs.acquired_at DESC,
      cs.id ASC
    LIMIT 1
    FOR UPDATE OF cs;

    IF v_replacement_id IS NULL THEN
      RAISE EXCEPTION 'Equip another snake before downgrading this one';
    END IF;
  END IF;

  -- Snapshot every identity field needed by the Breeding Lab before any FK
  -- is cleared. The original deterministic preview remains in trait_rolls;
  -- this snapshot supplies stable names and parent identities as well.
  SELECT jsonb_build_object(
    'child', jsonb_build_object(
      'id', child.id,
      'generation', child.generation,
      'variant_id', child.snake_variant_id,
      'variant_name', child_variant.name,
      'rarity', child_variant.rarity,
      'traits', COALESCE(to_jsonb(child.traits), '[]'::JSONB),
      'lineage', child.lineage
    ),
    'parent1', CASE WHEN parent1.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', parent1.id,
      'generation', parent1.generation,
      'variant_id', parent1.snake_variant_id,
      'variant_name', parent1_variant.name,
      'rarity', parent1_variant.rarity
    ) END,
    'parent2', CASE WHEN parent2.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', parent2.id,
      'generation', parent2.generation,
      'variant_id', parent2.snake_variant_id,
      'variant_name', parent2_variant.name,
      'rarity', parent2_variant.rarity
    ) END
  )
  INTO v_snapshot
  FROM collected_snakes child
  JOIN snake_variants child_variant ON child_variant.id = child.snake_variant_id
  LEFT JOIN collected_snakes parent1 ON parent1.id = v_history.parent1_id
  LEFT JOIN snake_variants parent1_variant ON parent1_variant.id = parent1.snake_variant_id
  LEFT JOIN collected_snakes parent2 ON parent2.id = v_history.parent2_id
  LEFT JOIN snake_variants parent2_variant ON parent2_variant.id = parent2.snake_variant_id
  WHERE child.id = p_snake_id;

  UPDATE breeding_history
  SET refunded_at = NOW(),
      refunded_child_id = p_snake_id,
      refund_snapshot = v_snapshot
  WHERE id = v_history.id
    AND refunded_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This breeding has already been refunded';
  END IF;

  IF v_was_equipped THEN
    -- RELEASE before CLAIM, matching migration 053's partial-index invariant.
    UPDATE collected_snakes
    SET is_equipped = FALSE
    WHERE player_id = p_player_id
      AND is_equipped = TRUE;
  END IF;

  DELETE FROM collected_snakes
  WHERE id = p_snake_id
    AND player_id = p_player_id;

  IF v_was_equipped THEN
    UPDATE collected_snakes
    SET is_equipped = TRUE
    WHERE id = v_replacement_id
      AND player_id = p_player_id;

    INSERT INTO player_settings (player_id, active_snake_id, selected_dynasty)
    VALUES (p_player_id, v_replacement_id, v_replacement_dynasty)
    ON CONFLICT (player_id) DO UPDATE
    SET active_snake_id = EXCLUDED.active_snake_id,
        selected_dynasty = EXCLUDED.selected_dynasty,
        updated_at = NOW();
  END IF;

  UPDATE players
  SET dna = v_new_balance,
      updated_at = NOW()
  WHERE id = p_player_id;

  INSERT INTO economy_transactions (
    player_id, resource_type, amount, balance_after, source_type, source_id, metadata
  ) VALUES (
    p_player_id,
    'dna',
    v_history.dna_cost,
    v_new_balance,
    'refund',
    v_history.id,
    jsonb_build_object(
      'kind', 'lineage_downgrade',
      'snake_id', p_snake_id,
      'from_generation', v_snake.generation,
      'to_generation', v_to_generation,
      'breeding_history_id', v_history.id
    )
  );

  RETURN jsonb_build_object(
    'refunded_dna', v_history.dna_cost,
    'new_dna_balance', v_new_balance,
    'removed_snake_id', p_snake_id,
    'replacement_snake_id', v_replacement_id,
    'from_generation', v_snake.generation,
    'to_generation', v_to_generation
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION downgrade_snake_generation(UUID, UUID) IS
  'Voluntarily removes one leaf breeding result, returns that receipt''s exact DNA cost, preserves a full history snapshot, and repairs equipment atomically.';

REVOKE EXECUTE ON FUNCTION downgrade_snake_generation(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION downgrade_snake_generation(UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION downgrade_snake_generation(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION downgrade_snake_generation(UUID, UUID) TO service_role;

COMMIT;
