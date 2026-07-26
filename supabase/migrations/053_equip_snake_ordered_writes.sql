-- =============================================================================
-- Migration 053: equip_snake writes the release and the claim in that order
-- WP-2.06 (Lab Truth). Supersedes the equip_snake body from migration 037.
-- =============================================================================
--
-- THE DEFECT
--
-- Migration 037 defined equip_snake with ONE statement:
--
--   UPDATE collected_snakes
--   SET is_equipped = (id = p_snake_id)
--   WHERE player_id = p_player_id
--     AND is_equipped IS DISTINCT FROM (id = p_snake_id);
--
-- and, in the same migration, a NON-DEFERRABLE partial unique index:
--
--   CREATE UNIQUE INDEX idx_collected_one_equipped_per_player
--     ON collected_snakes(player_id) WHERE is_equipped = true;
--
-- A unique index is enforced per ROW as the statement writes, and the order
-- rows are visited inside one UPDATE is not guaranteed. If the row being
-- claimed is written before the row being released, the index momentarily
-- sees two equipped snakes for one player and raises 23505. That is the
-- intermittent "Could not equip this snake" the Lab reported: the same input
-- succeeded or failed depending on physical row order.
--
-- WHY ORDERING THE WRITES IS THE ONLY FIX, NOT MERELY THE TIDIER ONE
--
-- The obvious alternative is to defer the constraint to the end of the
-- transaction. It is not available: DEFERRABLE belongs to CONSTRAINTS, and a
-- Postgres unique CONSTRAINT cannot carry a WHERE clause. Only a partial
-- unique INDEX can express "at most one equipped row per player", and an
-- index is never deferrable. Dropping the partiality would forbid a player
-- from ever having two UNequipped snakes, which is nonsense. So the index
-- stays exactly as 037 wrote it, and the function stops depending on row
-- order instead: release first, then claim. Between the statements at most
-- zero rows are equipped, which the index permits; after the second exactly
-- one is.
--
-- The index, the advisory lock, the ownership check, the player_settings
-- synchronisation and the grants are all unchanged.
--
-- unlock_and_equip_variant (037) inherits this fix untouched: it PERFORMs
-- equip_snake, so redefining the callee is the whole change.
--
-- 037 itself is NOT edited. It is applied history, and its text is pinned by
-- string-regex tests in src/lib/server/ftueBootstrap.migration.test.ts.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION equip_snake(
  p_player_id UUID,
  p_snake_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_dynasty_name TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_player_id::TEXT, 0));

  SELECT d.name INTO v_dynasty_name
  FROM collected_snakes cs
  JOIN snake_variants sv ON sv.id = cs.snake_variant_id
  JOIN dynasties d ON d.id = sv.dynasty_id
  WHERE cs.id = p_snake_id
    AND cs.player_id = p_player_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snake not owned by player';
  END IF;

  -- Statement 1 of 2: RELEASE. Every other equipped snake stands down first,
  -- so the partial unique index can never see two claimants at once. The
  -- target is excluded so an already-equipped snake is not needlessly
  -- rewritten (and so a re-equip of the current snake is a no-op).
  UPDATE collected_snakes
  SET is_equipped = false
  WHERE player_id = p_player_id
    AND id <> p_snake_id
    AND is_equipped = true;

  -- Statement 2 of 2: CLAIM. At most zero rows are equipped at this point,
  -- so this can add exactly one and the index is satisfied throughout.
  UPDATE collected_snakes
  SET is_equipped = true
  WHERE id = p_snake_id
    AND player_id = p_player_id
    AND is_equipped IS DISTINCT FROM true;

  INSERT INTO player_settings (player_id, active_snake_id, selected_dynasty)
  VALUES (p_player_id, p_snake_id, v_dynasty_name)
  ON CONFLICT (player_id) DO UPDATE
  SET active_snake_id = EXCLUDED.active_snake_id,
      selected_dynasty = EXCLUDED.selected_dynasty;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- CREATE OR REPLACE preserves privileges; restated so this file alone is a
-- complete description of who may call the function.
REVOKE EXECUTE ON FUNCTION equip_snake(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION equip_snake(UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION equip_snake(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION equip_snake(UUID, UUID) TO service_role;

COMMIT;
